import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Figure, figureMaterial, type FigureKind, type FigureState } from './Figure';
import { Quality } from '../core/Quality';
import { RideLayer, type RideRig } from './RideLayer';
import { patchLookMaterial, type LookHandle } from './CostumeLook';
import { CostumeAura } from './CostumeAura';

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

/** Clips Glen does not have; he borrows them from Superglen (jump / fall / land are procedural now, see JumpLayer) (same Mixamo rig, same bone names). */
const BORROW: readonly string[] = ['hit'];

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

/** Crisp textures at grazing angles and distance: anisotropy 16 (three clamps it to the GPU max), trilinear mipmaps, right colour spaces. */
function sharpenTextures(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    const set = (t: THREE.Texture | null, srgb: boolean): void => {
      if (!t) return;
      t.anisotropy = 16;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
    };
    set(m.map, true);
    set(m.emissiveMap, true);
    set(m.normalMap, false);
    set(m.metalnessMap, false);
    set(m.roughnessMap, false);
    set(m.aoMap, false);
  });
}

class CharacterModels {
  private readonly templates = new Map<ModelKind, Template>();
  private readonly waiters = new Map<ModelKind, Array<() => void>>();
  private loading: Promise<void> | null = null;
  /** Load progress for the debug handle and the report. */
  bytes = 0;
  loadMs = 0;
  failed: string[] = [];
  /** Live avatars, for the test handle (`window.__characters`). */
  readonly avatars = new Set<Avatar>();

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
    const one = async (kind: ModelKind): Promise<void> => {
      try {
        const url = `${base}models/${kind}.glb`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        const buf = await res.arrayBuffer();
        this.bytes += buf.byteLength;
        const gltf = await loader.parseAsync(buf, `${base}models/`);
        const clips = new Map<string, THREE.AnimationClip>();
        for (const c of gltf.animations) clips.set(c.name, c);
        sharpenTextures(gltf.scene);
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
  create(kind: ModelKind, tint = 0x000000, shadows = true): CharacterRig | null {
    const t = this.templates.get(kind);
    return t ? new CharacterRig(kind, t, tint, shadows) : null;
  }
}

export const characterModels = new CharacterModels();

/** Test handle: which avatar plays which clip. */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__characters = {
    info: () => ({ bytes: characterModels.bytes, ms: Math.round(characterModels.loadMs), failed: characterModels.failed }),
    clips: () => [...characterModels.avatars].filter((a) => a.visible).map((a) => `${a.kindName}:${a.rig ? a.rig.clipName : 'figure'}`),
    /** Shop colours worn by the animated avatars (Glen / Superglen). */
    looks: () => [...characterModels.avatars].filter((a) => a.rig?.look).map((a) => ({ kind: a.kindName, visible: a.visible, ...a.rig!.look!.params })),
    jump: () => [...characterModels.avatars].filter((a) => a.visible && a.rig).map((a) => a.rig!.jumpLayer.dump()),
    /** Force a one-shot on the visible Glen/Superglen avatar. */
    emote: (c: 'cheer' | 'wave') => [...characterModels.avatars].filter((a) => a.visible).forEach((a) => a.emote(c, 3)),
  };
}


// ---------------------------------------------------------------------------------------------------------------------------------
// Procedural jump: Mixamo bones are rotated in code on top of idle / run (no allocation per frame). Angles are in degrees in rig space
// (character faces +Z, up +Y, its left is +X). Each pose is a vector of the fields below; the live vector eases toward the pose of the
// moment (about 0.1 s crossfade) and the whole layer fades in and out with `w`.
// ---------------------------------------------------------------------------------------------------------------------------------
const enum J {
  DROP, SPINE, THL, KNL, THR, KNR, AFL, AAL, AFR, AAR, TOE, FLAT, N,
}
//                                   drop   spine thL  knL  thR  knR  afL   aaL  afR   aaR  toe  flat
const POSE_CROUCH = [0.1, 24, 50, 95, 50, 95, -35, 12, -35, 12, 0, 1];
const POSE_STRETCH = [-0.01, -5, -6, 4, -10, 4, 150, 24, 150, 24, 40, 0];
const POSE_AIR = [0, 10, 12, 22, 82, 100, 30, 150, 24, 152, 22, 0];
const POSE_TUCK = [0.02, 36, 100, 125, 100, 125, 55, 12, 55, 12, 10, 0];
const POSE_FALL = [0, 4, 26, 18, -6, 26, 8, 88, 6, 90, 12, 0];
const POSE_LAND = [0.08, 28, 52, 98, 52, 98, 52, 25, 52, 25, 0, 1];
const POSE_ZERO = new Array<number>(J.N).fill(0);

/** Bones the layer touches, parents before children (the chain is walked top-down). */
const LAYER_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftArm', 'RightArm'] as const;
type LayerBone = (typeof LAYER_BONES)[number];

const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const qR = new THREE.Quaternion();
const qT = new THREE.Quaternion();
const qP = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const D2R = Math.PI / 180;

class JumpLayer {
  private readonly bones = new Map<LayerBone, THREE.Bone>();
  private readonly cur = new Float32Array(J.N);
  private readonly tgt = new Float32Array(J.N);
  w = 0;
  private air = false;
  private wasAir = false;
  private tk = 1;
  private landT = 0;
  private vyTop = 5;
  private hipsY = 0;
  private readonly root: THREE.Object3D;
  /** Strength of the next landing squash (0..1). */
  private landPow = 1;
  ready = false;

  constructor(root: THREE.Object3D) {
    this.root = root;
    root.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      const n = o.name.replace(/^mixamorig:?/, '') as LayerBone;
      if ((LAYER_BONES as readonly string[]).includes(n)) this.bones.set(n, o as THREE.Bone);
    });
    this.ready = this.bones.size === LAYER_BONES.length;
    const h = this.bones.get('Hips');
    if (h) this.hipsY = h.position.y;
  }

  /** Per-frame input from the avatar. */
  set(air: boolean, vy: number, tuck: boolean): void {
    this.air = air;
    if (air && !this.wasAir) {
      // Takeoff (a jump) or a step off a ledge (no crouch, straight to the fall pose).
      this.tk = vy > 0.5 ? 0 : 1;
      this.vyTop = Math.max(2, vy);
      this.landT = 0;
    }
    this.wasAir = air;
    this.vy = vy;
    this.tuck = tuck;
  }
  private vy = 0;
  private tuck = false;
  private power = 0;

  setPower(p: number): void {
    this.power = p;
  }

  /** Debug: weight, live pose vector and target (test handle). */
  dump(): { w: number; cur: number[]; tgt: number[] } {
    return { w: this.w, cur: Array.from(this.cur, (v) => Math.round(v * 10) / 10), tgt: Array.from(this.tgt, (v) => Math.round(v * 10) / 10) };
  }

  land(): void {
    this.landT = 0.3;
  }

  update(dt: number): void {
    if (!this.ready) return;
    const T = this.tgt;
    const pw = this.power;
    if (this.landT > 0) this.landT -= dt;
    if (this.air) {
      this.tk += dt;
      const u = this.vy / this.vyTop; // 1 at takeoff, 0 at the apex, negative while falling
      const up = Math.min(1, Math.max(0, (u - 0.1) / 0.5)); // 1 = still pushing off
      // Rising: crouch (first 0.08 s) -> stretch -> airborne pose; falling: airborne pose -> fall pose.
      const fall = Math.min(1, Math.max(0, -this.vy / 3.5));
      let base: number[] = POSE_AIR;
      if (this.tuck) base = POSE_TUCK;
      for (let i = 0; i < J.N; i++) T[i] = base[i];
      // blend toward stretch while pushing off
      for (let i = 0; i < J.N; i++) T[i] += (POSE_STRETCH[i] - T[i]) * up;
      for (let i = 0; i < J.N; i++) T[i] += (POSE_FALL[i] - T[i]) * fall * (this.tuck ? 0.3 : 1);
      // higher jumps (rhythm levels): a bigger stretch
      if (pw > 0) {
        const k = pw * up;
        T[J.AFL] += 20 * k;
        T[J.AFR] += 20 * k;
        T[J.TOE] += 15 * k;
        T[J.SPINE] -= 6 * k;
      }
      if (this.tk < 0.1) {
        const c = 1 - this.tk / 0.1;
        for (let i = 0; i < J.N; i++) T[i] += (POSE_CROUCH[i] - T[i]) * c;
      }
    } else if (this.landT > 0) {
      const k = this.landT > 0.2 ? 1 : this.landT / 0.2; // squash, then recover
      for (let i = 0; i < J.N; i++) T[i] = POSE_LAND[i] * k * this.landPow;
    } else {
      for (let i = 0; i < J.N; i++) T[i] = POSE_ZERO[i];
    }
    const e = 1 - Math.exp(-dt * (this.air ? 20 : 24));
    const C = this.cur;
    for (let i = 0; i < J.N; i++) C[i] += (T[i] - C[i]) * e;
    const wt = this.air || this.landT > 0 ? 1 : 0;
    this.w += (wt - this.w) * (1 - Math.exp(-dt * (wt ? 30 : 14)));
    if (wt === 0 && this.w < 0.01) this.w = 0;
  }

  /** Rotate bone `name` by `qR` (a rig-space rotation) about its own joint: local = P^-1 * R * P * local, P = parent's rig-space rotation. */
  private rot(name: LayerBone): void {
    const b = this.bones.get(name)!;
    qP.identity();
    for (let n: THREE.Object3D | null = b.parent; n && n !== this.root; n = n.parent) qP.premultiply(n.quaternion);
    qC.copy(qP).invert();
    qT.copy(qC).multiply(qR).multiply(qP);
    b.quaternion.premultiply(qT);
  }

  private rotX(name: LayerBone, deg: number): void {
    qR.setFromAxisAngle(AX, deg * D2R);
    this.rot(name);
  }

  /** Arm: flex forward-up (deg), then raise out to the side (abduction, deg); `side` +1 = the character's left. */
  private arm(name: LayerBone, flex: number, abd: number, side: number): void {
    // Raise out to the side first, then swing the raised arm forward / back about the body's X axis.
    qT.setFromAxisAngle(AX, -flex * D2R);
    qR.setFromAxisAngle(AZ, abd * D2R * side);
    qR.premultiply(qT);
    this.rot(name);
  }

  /** Call after the mixer wrote the clip pose. */
  apply(): void {
    if (!this.ready || this.w <= 0) return;
    const c = this.cur;
    const w = this.w;
    const hips = this.bones.get('Hips')!;
    hips.position.y = this.hipsY * 1 - c[J.DROP] * w;
    const sp = c[J.SPINE] * w * 0.34;
    this.rotX('Spine', sp);
    this.rotX('Spine1', sp);
    this.rotX('Spine2', sp);
    const flat = c[J.FLAT];
    const toe = c[J.TOE];
    for (const side of [1, -1] as const) {
      const L = side === 1;
      const th = c[L ? J.THL : J.THR] * w;
      const kn = c[L ? J.KNL : J.KNR] * w;
      this.rotX(L ? 'LeftUpLeg' : 'RightUpLeg', -th);
      this.rotX(L ? 'LeftLeg' : 'RightLeg', kn);
      // Foot: undo the chain pitch where the foot is planted, point the toes in the air.
      this.rotX(L ? 'LeftFoot' : 'RightFoot', (th - kn) * flat + toe * w);
      this.arm(L ? 'LeftArm' : 'RightArm', c[L ? J.AFL : J.AFR] * w, c[L ? J.AAL : J.AAR] * w, side);
    }
  }
}

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
  /** Shop colours (Glen / Superglen only): see CostumeLook. */
  readonly look: LookHandle | null;
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
  readonly jumpLayer: JumpLayer;
  /** Riding pose (bike): hips on the saddle, feet on the pedals, hands on the grips. */
  readonly rideLayer: RideLayer;
  /** Animated 3D energy aura & lightning for special Superglen costumes (Merah Putih, Hologram). */
  private readonly aura: CostumeAura | null;

  constructor(
    readonly kind: ModelKind,
    private readonly tpl: Template,
    tint: number,
    shadows: boolean,
  ) {
    const scene = cloneSkinned(tpl.scene) as THREE.Group;
    let mesh: THREE.SkinnedMesh | null = null;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh;
    });
    if (!mesh) throw new Error(`model ${kind} has no skinned mesh`);
    const m: THREE.SkinnedMesh = mesh;
    // Frustum culling stays on (an off-screen model must cost nothing); the bounding sphere is padded so a flip or a raised arm never pops.
    m.frustumCulled = true;
    m.computeBoundingSphere();
    if (m.boundingSphere) {
      m.boundingSphere.center.y += 0.1;
      m.boundingSphere.radius = Math.max(m.boundingSphere.radius * 1.5, 0.9);
    }
    // The phone preset has no skinned shadow (the city's triangle budget counts a caster twice): the blob shadow under the player stays.
    m.castShadow = shadows && Quality.level === 'high';
    m.receiveShadow = false;
    // Own material per actor (textures stay shared) so the rhythm glow only lights the player.
    this.material = (m.material as THREE.MeshStandardMaterial).clone();
    this.material.emissive.setHex(tint);
    this.material.emissiveIntensity = tint ? 1 : 0;
    m.material = this.material;
    this.look = kind === 'glen' || kind === 'superglen' ? patchLookMaterial(this.material, kind) : null;
    this.aura = kind === 'superglen' ? new CostumeAura() : null;
    this.mesh = m;
    this.root.add(scene);
    if (this.aura) this.root.add(this.aura.group);
    this.root.scale.setScalar(MODEL_SCALE[kind]);
    this.mixer = new THREE.AnimationMixer(scene);
    scene.updateMatrixWorld(true);
    this.jumpLayer = new JumpLayer(scene);
    this.rideLayer = new RideLayer(scene);
  }

  /** Wear the shop item `id` (a colour of the costume / outfit). */
  setLook(id: string): void {
    this.look?.set(id);
    this.aura?.setLook(id);
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
    this.jumpLayer.update(dt);
    this.jumpLayer.apply();
    this.rideLayer.run(dt);
    this.aura?.update(dt);
  }

  dispose(): void {
    this.aura?.dispose();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.root.removeFromParent();
    this.mesh.skeleton.dispose();
    this.material.dispose();
  }
}

/** State fed by gameplay every frame. */
export interface AvatarState extends FigureState {
  /** The shield dome is up (Superglen). */
  shield?: boolean;
  /** This person is speaking (dialog line on screen): plays the talk clip when standing or hovering. */
  talking?: boolean;
  /** Double jump / flip in progress: tuck the legs. */
  tuck?: boolean;
  /** Jump strength 0..1 (the Lompat Irama rhythm level): a bigger stretch. */
  power?: number;
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
  private waitT = 0;
  private onRig: ((rig: CharacterRig) => void) | null = null;
  private rideRig: RideRig | null = null;
  private lookId = '';

  constructor(
    private readonly kind: ModelKind,
    fallbackMat: THREE.Material | null,
    private readonly shadows: boolean,
    private readonly tint = 0x000000,
    /** Fallback shown instead of a `Figure` (Aara has no procedural Figure). */
    fallbackObj: THREE.Object3D | null = null,
  ) {
    characterModels.avatars.add(this);
    if (characterModels.has(kind)) this.makeRig();
    else {
      if (fallbackObj) {
        this.fallbackObj = fallbackObj;
        this.root.add(fallbackObj);
      } else if (kind !== 'aara') {
        this.fig = new Figure(kind as FigureKind, fallbackMat ?? figureMaterial(0x2a74c8, 0.08), shadows);
        this.root.add(this.fig.root);
        // The blocky figure only shows when the model is really late (models load during the start screen).
        this.fig.root.visible = false;
      }
      characterModels.whenReady(kind, () => {
        if (this.disposed) return;
        this.makeRig();
      });
    }
  }

  private makeRig(): void {
    const rig = characterModels.create(this.kind, this.tint, this.shadows);
    if (!rig) return;
    if (this.fig) {
      this.fig.root.removeFromParent();
      this.fig = null;
    }
    this.fallbackObj?.removeFromParent();
    this.fallbackObj = null;
    this.rig = rig;
    if (this.lookId) rig.setLook(this.lookId);
    rig.rideLayer.attach(this.rideRig);
    this.onRig?.(rig);
    this.root.add(rig.root);
    rig.loop('idle', 0, 1);
  }

  /** Wear the shop colour `id` (kept when the model arrives later). */
  setLook(id: string): void {
    this.lookId = id;
    this.rig?.setLook(id);
  }

  /** Put the rider on a bike (null: off). The pose is procedural, see RideLayer; without a bike model the old 'ride' clip plays. */
  setRide(r: RideRig | null): void {
    this.rideRig = r;
    this.rig?.rideLayer.attach(r);
  }

  /** Run `cb` with the animated model: now when it is already here, else when it arrives (never when loading fails). */
  whenRig(cb: (rig: CharacterRig) => void): void {
    this.onRig = cb;
    if (this.rig) cb(this.rig);
  }

  get kindName(): string {
    return this.kind;
  }

  /** True when this avatar and all its parents are visible. */
  get visible(): boolean {
    let o: THREE.Object3D | null = this.root;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  }

  /** The material that carries the rhythm glow (null while the figure is shown). */
  get material(): THREE.MeshStandardMaterial | null {
    return this.rig?.material ?? null;
  }

  /** A short celebration clip ('cheer' or 'wave') of `secs` seconds. */
  emote(clip: 'cheer' | 'wave', secs: number): void {
    if (!this.rig) return;
    // Superglen has no cheer clip: he waves instead.
    const c = this.rig.hasClip(clip) ? clip : this.rig.hasClip('wave') ? 'wave' : '';
    if (!c) return;
    this.emoteLeft = secs;
    this.rig.shot({ clip: c, from: 0, to: Math.min(secs, this.rig.clipDuration(c)), rate: 1 }, 0.2);
  }

  /** Laser shot: the first moments of the shoot clip. */
  shoot(): void {
    if (!this.rig?.hasClip('shoot')) return;
    this.shootLeft = 0.8;
    this.rig.shot({ clip: 'shoot', from: SHOOT_FROM, to: SHOOT_TO, rate: 1.3 }, 0.08);
  }

  /** Soft landing: a quick crouch (only when standing still; a run just goes on). */
  land(_speed: number): void {
    this.rig?.jumpLayer.land();
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
      this.waitT += dt;
      if (this.fig && !this.fig.root.visible && this.waitT > 2) this.fig.root.visible = true;
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
    const jl = rig.jumpLayer;
    jl.set(!!s.airborne && !s.flying && !s.riding, s.vy, !!s.tuck);
    jl.setPower(s.power ?? 0);
    if (s.riding) {
      if (rig.rideLayer.active) rig.loop('idle', 0.25, 1);
      else if (rig.hasClip('ride')) rig.loop('ride', 0.25, 1);
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
      // The jump / fall pose is procedural (JumpLayer) on top of the idle clip.
      this.running = false;
      rig.loop('idle', 0.1, 1);
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
    characterModels.avatars.delete(this);
    this.rig?.dispose();
    this.root.removeFromParent();
  }
}

/** Clip windows (seconds), tuned by looking at the clips. */
const SHOOT_FROM = 6.2;
const SHOOT_TO = 7.0;
