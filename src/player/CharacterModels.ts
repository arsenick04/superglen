import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Figure, figureMaterial, type FigureKind, type FigureState } from './Figure';
import { Quality } from '../core/Quality';

/**
 * The owner's animated characters (Mixamo rig, Meshopt + WebP GLBs in public/models). One template per character is loaded once
 * (during the start screen); every actor gets its own clone (SkeletonUtils.clone), its own AnimationMixer and its own material
 * clone (textures are shared). Clips are in place (hips X/Z locked), the game supplies the root motion.
 *
 * `Avatar` is what gameplay code holds: it shows the old low-poly `Figure` until the model has arrived (or forever when loading
 * fails) and swaps to the animated model by itself.
 */
export type ModelKind = 'glen' | 'superglen' | 'nino' | 'aara';

/** Display height (m) the models are scaled to (they are about 1.0 m in the file). */
export const MODEL_SCALE: Record<ModelKind, number> = { glen: 1.2, superglen: 1.2, nino: 1.2, aara: 1.3 };

/**
 * Clip speed from ground speed. The walk and run clips are tiny chibi strides (about 0.4 and 1 m/s on the ground), far below the
 * game's 5-6 m/s, so a perfect foot lock is impossible: the cycle is sped up (cartoon legs) up to a readable cap instead.
 */
const WALK_DIV = 0.9;
const RUN_DIV = 2.5;
/** Switch from walk to run above this speed (m/s), with a little hysteresis. */
const RUN_FROM = 3.0;
const RUN_BACK = 2.5;

/** Clips Glen does not have; he borrows them from Superglen (same Mixamo rig, same bone names). */
const BORROW: readonly string[] = ['jump', 'fall', 'land', 'hit'];

interface Template {
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}

/** Hips idle position (x, y, z), used to re-base borrowed clips onto another body. */
function hipsIdle(t: Template): THREE.Vector3 | null {
  const idle = t.clips.get('idle');
  const tr = idle?.tracks.find((k) => k.name.endsWith('Hips.position'));
  return tr ? new THREE.Vector3(tr.values[0], tr.values[1], tr.values[2]) : null;
}

/** A copy of `src` for another body: rotations only, plus the hips position re-based so the feet keep the ground. */
function retarget(src: THREE.AnimationClip, from: THREE.Vector3, to: THREE.Vector3): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const tr of src.tracks) {
    if (tr.name.endsWith('.quaternion')) tracks.push(tr.clone());
    else if (tr.name.endsWith('Hips.position')) {
      const c = tr.clone();
      const v = c.values;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = to.x;
        v[i + 1] += to.y - from.y;
        v[i + 2] = to.z;
      }
      tracks.push(c);
    }
  }
  return new THREE.AnimationClip(src.name, src.duration, tracks);
}

class CharacterModels {
  private readonly templates = new Map<ModelKind, Template>();
  private readonly waiters = new Map<ModelKind, Array<() => void>>();
  private loading: Promise<void> | null = null;
  /** Load progress for the debug handle and the report. */
  bytes = 0;
  loadMs = 0;
  failed: string[] = [];

  has(kind: ModelKind): boolean {
    return this.templates.has(kind);
  }

  /** Run `cb` once the model of `kind` is ready (at once when it already is). Never runs when loading failed. */
  whenReady(kind: ModelKind, cb: () => void): void {
    if (this.templates.has(kind)) cb();
    else {
      const l = this.waiters.get(kind) ?? [];
      l.push(cb);
      this.waiters.set(kind, l);
    }
  }

  /** Start loading all four models in parallel (safe to call many times). Resolves when every load has settled. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    const t0 = performance.now();
    const base = import.meta.env.BASE_URL;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const kinds: ModelKind[] = ['glen', 'superglen', 'nino', 'aara'];
    const lo = Quality.level === 'low';
    const one = async (kind: ModelKind): Promise<void> => {
      try {
        const file = lo && LOW_LOD.has(kind) ? `${kind}_lo` : kind;
        const url = `${base}models/${file}.glb`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        const buf = await res.arrayBuffer();
        this.bytes += buf.byteLength;
        const gltf = await loader.parseAsync(buf, `${base}models/`);
        const clips = new Map<string, THREE.AnimationClip>();
        for (const c of gltf.animations) clips.set(c.name, c);
        gltf.scene.traverse((o) => {
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
        });
        this.templates.set(kind, { scene: gltf.scene, clips });
      } catch (err) {
        this.failed.push(kind);
        console.warn(`Character model ${kind} failed to load, using the low-poly figure.`, err);
      }
    };
    this.loading = Promise.all(kinds.map(one)).then(() => {
      this.borrow();
      this.loadMs = performance.now() - t0;
      for (const kind of kinds) {
        if (!this.templates.has(kind)) continue;
        for (const cb of this.waiters.get(kind)?.splice(0) ?? []) {
          try {
            cb();
          } catch (e) {
            console.error('Character ready callback failed:', e);
          }
        }
      }
    });
    return this.loading;
  }

  private borrow(): void {
    const glen = this.templates.get('glen');
    const sup = this.templates.get('superglen');
    if (!glen || !sup) return;
    const a = hipsIdle(sup);
    const b = hipsIdle(glen);
    if (!a || !b) return;
    for (const name of BORROW) {
      const src = sup.clips.get(name);
      if (src && !glen.clips.has(name)) glen.clips.set(name, retarget(src, a, b));
    }
  }

  /** A fresh animated copy, or null while the model is not loaded. */
  create(kind: ModelKind, tint = 0x000000): CharacterRig | null {
    const t = this.templates.get(kind);
    return t ? new CharacterRig(kind, t, tint) : null;
  }
}

/** Kinds that have a `_lo` file for the phone preset (filled by the build script when needed). */
const LOW_LOD = new Set<ModelKind>();

export const characterModels = new CharacterModels();

/** One-shot clip window: play `clip` from `from` to `to` seconds (to <= 0: the whole clip) at `rate`. */
export interface Shot {
  clip: string;
  from: number;
  to: number;
  rate: number;
}

export class CharacterRig {
  readonly root = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly mesh: THREE.SkinnedMesh;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  private curName = '';
  private shotLeft = 0;
  private shotEnd = 0;
  private shotAct: THREE.AnimationAction | null = null;
  private holdAct: THREE.AnimationAction | null = null;
  private holdEnd = 0;
  private running = false;
  private t = 0;

  constructor(
    readonly kind: ModelKind,
    private readonly tpl: Template,
    tint: number,
  ) {
    const scene = cloneSkinned(tpl.scene) as THREE.Group;
    let mesh: THREE.SkinnedMesh | null = null;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh;
    });
    if (!mesh) throw new Error(`model ${kind} has no skinned mesh`);
    const m: THREE.SkinnedMesh = mesh;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = false;
    // Own material per actor (textures stay shared) so the rhythm glow only lights the player.
    this.material = (m.material as THREE.MeshStandardMaterial).clone();
    this.material.emissive.setHex(tint);
    this.material.emissiveIntensity = tint ? 1 : 0;
    m.material = this.material;
    this.mesh = m;
    this.root.add(scene);
    this.root.scale.setScalar(MODEL_SCALE[kind]);
    this.mixer = new THREE.AnimationMixer(scene);
  }

  hasClip(name: string): boolean {
    return this.tpl.clips.has(name);
  }

  clipDuration(name: string): number {
    return this.tpl.clips.get(name)?.duration ?? 0;
  }

  private action(name: string): THREE.AnimationAction | null {
    let a = this.actions.get(name);
    if (!a) {
      const c = this.tpl.clips.get(name);
      if (!c) return null;
      a = this.mixer.clipAction(c);
      this.actions.set(name, a);
    }
    return a;
  }

  /**
   * Loop `name` (crossfade `fade` s). A no-op when it is already the current clip. Returns the action (null: no such clip).
   * `phase` >= 0 starts the new clip at that fraction of its length (keeps walk and run in step).
   */
  loop(name: string, fade = 0.2, rate = 1, phase = -1): THREE.AnimationAction | null {
    if (this.shotLeft > 0) return null;
    if (name === this.curName) {
      this.cur?.setEffectiveTimeScale(rate);
      return this.cur;
    }
    const a = this.action(name);
    if (!a) return null;
    this.fadeTo(a, fade, rate, THREE.LoopRepeat, 0);
    if (phase >= 0) a.time = phase * a.getClip().duration;
    this.curName = name;
    return a;
  }

  /** Play a window of a clip once, holding the last pose until `release()` or the next call. */
  shot(s: Shot, fade = 0.12): void {
    const a = this.action(s.clip);
    if (!a) return;
    this.fadeTo(a, fade, s.rate, THREE.LoopOnce, s.from);
    a.clampWhenFinished = true;
    this.shotAct = a;
    this.shotEnd = s.to > 0 ? s.to : a.getClip().duration;
    this.shotLeft = Math.max(0.05, (this.shotEnd - s.from) / Math.max(0.01, s.rate));
    this.curName = '!' + s.clip;
  }

  /** Play the window [from, to] of `name` once and hold its last pose until the state changes (jump / fall in the air). */
  hold(name: string, from: number, to: number, fade: number, rate: number): void {
    if (this.shotLeft > 0) return;
    if (name === this.curName) return;
    const a = this.action(name);
    if (!a) return;
    this.fadeTo(a, fade, rate, THREE.LoopRepeat, from);
    this.curName = name;
    this.holdAct = a;
    this.holdEnd = to;
  }

  /** Leave the one-shot state at once (the next `loop` crossfades out of it). */
  release(): void {
    this.shotLeft = 0;
    this.shotAct = null;
    this.curName = '';
  }

  get shotActive(): boolean {
    return this.shotLeft > 0;
  }

  /** Current clip, for the debug handle. */
  get clipName(): string {
    return this.curName;
  }

  private fadeTo(a: THREE.AnimationAction, fade: number, rate: number, mode: THREE.AnimationActionLoopStyles, from: number): void {
    const prev = this.cur;
    a.reset();
    a.setLoop(mode, mode === THREE.LoopOnce ? 1 : Infinity);
    a.clampWhenFinished = false;
    a.setEffectiveTimeScale(rate);
    a.setEffectiveWeight(1);
    a.time = from;
    a.play();
    if (prev && prev !== a) {
      if (this.running && fade > 0) prev.crossFadeTo(a, fade, false);
      else prev.stop();
    }
    this.cur = a;
    this.running = true;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.shotLeft > 0) {
      this.shotLeft -= dt;
      if (this.shotLeft <= 0 && this.shotAct) {
        // Hold the last pose of the window.
        this.shotAct.time = this.shotEnd;
        this.shotAct.paused = true;
      }
    }
    if (this.holdAct && this.holdAct === this.cur && !this.holdAct.paused && this.holdAct.time >= this.holdEnd) {
      this.holdAct.time = this.holdEnd;
      this.holdAct.paused = true;
    }
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    this.material.dispose();
  }
}

/** State fed by gameplay every frame. */
export interface AvatarState extends FigureState {
  /** The shield dome is up (Superglen). */
  shield?: boolean;
  /** This person is speaking (dialog line on screen): plays the talk clip when standing or hovering. */
  talking?: boolean;
}

/**
 * What gameplay holds for a person: the animated model (or the old procedural figure while loading / on failure).
 * `root` has its origin at the feet and faces +Z.
 */
export class Avatar {
  readonly root = new THREE.Group();
  private fig: Figure | null = null;
  private fallbackObj: THREE.Object3D | null = null;
  rig: CharacterRig | null = null;
  private emoteLeft = 0;
  private hitLeft = 0;
  private shootLeft = 0;
  private landLeft = 0;
  private running = false;
  private disposed = false;
  private onRig: ((rig: CharacterRig) => void) | null = null;

  constructor(
    private readonly kind: ModelKind,
    fallbackMat: THREE.Material | null,
    shadows: boolean,
    private readonly tint = 0x000000,
    /** Fallback shown instead of a `Figure` (Aara has no procedural Figure). */
    fallbackObj: THREE.Object3D | null = null,
  ) {
    if (characterModels.has(kind)) this.makeRig();
    else {
      if (fallbackObj) {
        this.fallbackObj = fallbackObj;
        this.root.add(fallbackObj);
      } else if (kind !== 'aara') {
        this.fig = new Figure(kind as FigureKind, fallbackMat ?? figureMaterial(0x2a74c8, 0.08), shadows);
        this.root.add(this.fig.root);
      }
      characterModels.whenReady(kind, () => {
        if (this.disposed) return;
        this.makeRig();
      });
    }
  }

  private makeRig(): void {
    const rig = characterModels.create(this.kind, this.tint);
    if (!rig) return;
    if (this.fig) {
      this.fig.root.removeFromParent();
      this.fig = null;
    }
    this.fallbackObj?.removeFromParent();
    this.fallbackObj = null;
    this.rig = rig;
    this.onRig?.(rig);
    this.root.add(rig.root);
    rig.loop('idle', 0, 1);
  }

  /** Run `cb` with the animated model: now when it is already here, else when it arrives (never when loading fails). */
  whenRig(cb: (rig: CharacterRig) => void): void {
    this.onRig = cb;
    if (this.rig) cb(this.rig);
  }

  /** The material that carries the rhythm glow (null while the figure is shown). */
  get material(): THREE.MeshStandardMaterial | null {
    return this.rig?.material ?? null;
  }

  /** A short celebration clip ('cheer' or 'wave') of `secs` seconds. */
  emote(clip: 'cheer' | 'wave', secs: number): void {
    if (!this.rig?.hasClip(clip)) return;
    this.emoteLeft = secs;
    this.rig.shot({ clip, from: 0, to: Math.min(secs, this.rig.clipDuration(clip)), rate: 1 }, 0.2);
  }

  /** Laser shot: the first moments of the shoot clip. */
  shoot(): void {
    if (!this.rig?.hasClip('shoot')) return;
    this.shootLeft = 0.8;
    this.rig.shot({ clip: 'shoot', from: SHOOT_FROM, to: SHOOT_TO, rate: 1.3 }, 0.08);
  }

  /** Soft landing: a quick crouch (only when standing still; a run just goes on). */
  land(speed: number): void {
    if (!this.rig?.hasClip('land') || speed > 1.5) return;
    this.landLeft = 0.4;
    this.rig.shot({ clip: 'land', from: 0, to: 0.65, rate: 1.6 }, 0.06);
  }

  /** Got hit (hurt reaction). */
  hit(): void {
    if (!this.rig?.hasClip('hit')) return;
    this.hitLeft = 0.7;
    this.rig.shot({ clip: 'hit', from: 0, to: 0, rate: 1.3 }, 0.06);
  }

  /** Stop any emote/hit/shoot now. */
  clearOneShots(): void {
    this.emoteLeft = this.hitLeft = this.shootLeft = this.landLeft = 0;
    this.rig?.release();
  }

  /** Advance (no allocation). `s` drives the clip choice; `fallback` poses the old figure. */
  pose(dt: number, s: AvatarState): void {
    const rig = this.rig;
    if (!rig) {
      this.fig?.pose(dt, s);
      return;
    }
    this.emoteLeft -= dt;
    this.hitLeft -= dt;
    this.shootLeft -= dt;
    this.landLeft -= dt;
    // A real move or a jump cancels a celebration or a landing crouch, not a hit or a shot.
    if ((this.emoteLeft > 0 || this.landLeft > 0) && (s.speed > 1.5 || s.airborne)) {
      this.emoteLeft = this.landLeft = 0;
      rig.release();
    } else if (rig.shotActive && !(this.emoteLeft > 0 || this.hitLeft > 0 || this.shootLeft > 0 || this.landLeft > 0)) rig.release();
    if (!(this.emoteLeft > 0 || this.hitLeft > 0 || this.shootLeft > 0 || this.landLeft > 0)) {
      this.drive(rig, s);
    }
    rig.update(dt);
  }

  private drive(rig: CharacterRig, s: AvatarState): void {
    if (s.riding) {
      if (rig.hasClip('ride')) rig.loop('ride', 0.25, 1);
      else rig.loop('idle', 0.25, 1);
      return;
    }
    if (s.talking && s.speed < 0.4 && rig.hasClip('talk')) {
      rig.loop('talk', 0.25, 1);
      return;
    }
    if (s.flying) {
      rig.loop(rig.hasClip('fly') ? 'fly' : 'idle', 0.3, 1);
      return;
    }
    if (s.shield && rig.hasClip('shield')) {
      rig.loop('shield', 0.15, 1);
      return;
    }
    if (s.airborne) {
      this.running = false;
      if (s.vy > 0.5 && rig.hasClip('jump')) rig.hold('jump', JUMP_FROM, JUMP_TO, 0.08, 1);
      else if (rig.hasClip('fall')) rig.hold('fall', FALL_FROM, FALL_TO, 0.15, 1);
      return;
    }
    if (s.speed > 0.4) {
      // Walk below the run threshold; the clip speed follows the ground speed so the feet do not slide.
      if (this.running ? s.speed < RUN_BACK : s.speed > RUN_FROM) this.running = !this.running;
      const rate = this.running ? Math.min(2.0, Math.max(1.1, s.speed / RUN_DIV)) : Math.min(2.2, Math.max(0.8, s.speed / WALK_DIV));
      rig.loop(this.running ? 'run' : 'walk', 0.18, rate);
      return;
    }
    this.running = false;
    rig.loop('idle', 0.25, 1);
  }

  dispose(): void {
    this.disposed = true;
    this.rig?.dispose();
    this.root.removeFromParent();
  }
}

/** Clip windows (seconds), tuned by looking at the clips. */
const JUMP_FROM = 0.9;
const JUMP_TO = 1.5;
const FALL_FROM = 0.7;
const FALL_TO = 1.1;
const SHOOT_FROM = 6.2;
const SHOOT_TO = 7.0;
