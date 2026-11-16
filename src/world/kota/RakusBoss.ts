import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { Combat, CombatRng } from '../../config/combat';
import type { HitInfo, Target } from '../../gameplay/Targets';
import { box, cone, cyl, merge, sph } from './ColorMesh';
import { enemyModels } from './EnemyModels';
import { RAKUS_GUDANG } from './Bab6Data';

const FUR = 0x8d7a93;
const FUR_LIGHT = 0xa896ae;
const CREAM = 0xe9d6c4;
const PINK = 0xf5a3b5;
const DARK = 0x2b1a12;
const GOLD = 0xffc93c;
const STAR_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 L40 23 L60 24.5 L45 38 L49.5 58 L32 47.5 L14.5 58 L19 38 L4 24.5 L24 23 Z" fill="#ffd23f" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';

export type RakusPhase = 'idle' | 'cue' | 'run' | 'eat' | 'pout' | 'approach' | 'wind' | 'hop' | 'dizzy' | 'recover' | 'beaten' | 'tamed' | 'gone';
export type RakusEvent = 'cue' | 'saved' | 'grew' | 'ring' | 'dizzy' | 'laserEarly' | 'hurt' | 'blocked' | 'shrunk';

export interface RakusHooks {
  /** A star was lost (laser while out of breath); `left` is what remains (0: beaten, tame him). */
  onStar(left: number): void;
  onEvent(kind: RakusEvent): void;
  /** A round (eat + slam + out of breath) is over: `round` counts from 1. The chapter may send helpers in. */
  onRoundEnd(round: number): void;
}

/**
 * Tikus Rakus: a fat silly grey-violet rat in a crooked home-made crown (bottle caps and a spoon), napkin bib, buck teeth, a drop of
 * drool. `friendly`: happy closed eyes and a smile, no drool. Feet at y = 0, face toward +z, height 1.7 m (with the crown).
 */
function rakusGeo(friendly: boolean): THREE.BufferGeometry {
  const white = 0xffffff;
  const parts = [
    // Belly body.
    { g: sph(0.74, 12, 9), c: FUR, p: [0, 0.72, 0] as const, s: [1.05, 0.95, 0.98] as const },
    { g: sph(0.58, 10, 8), c: CREAM, p: [0, 0.66, 0.36] as const, s: [1, 0.95, 0.8] as const },
    // Head, cheeks, snout, nose.
    { g: sph(0.46, 10, 8), c: FUR, p: [0, 1.2, 0.36] as const },
    { g: sph(0.24, 8, 6), c: FUR_LIGHT, p: [-0.3, 1.1, 0.62] as const },
    { g: sph(0.24, 8, 6), c: FUR_LIGHT, p: [0.3, 1.1, 0.62] as const },
    { g: sph(0.26, 8, 6), c: FUR_LIGHT, p: [0, 1.1, 0.7] as const, s: [1, 0.85, 1] as const },
    { g: sph(0.09, 6, 5), c: PINK, p: [0, 1.17, 0.95] as const },
    // Ears.
    { g: sph(0.25, 8, 6), c: FUR, p: [-0.4, 1.55, 0.26] as const, s: [1, 1, 0.4] as const },
    { g: sph(0.25, 8, 6), c: FUR, p: [0.4, 1.55, 0.26] as const, s: [1, 1, 0.4] as const },
    { g: sph(0.16, 7, 5), c: PINK, p: [-0.4, 1.55, 0.31] as const, s: [1, 1, 0.4] as const },
    { g: sph(0.16, 7, 5), c: PINK, p: [0.4, 1.55, 0.31] as const, s: [1, 1, 0.4] as const },
    // Hands and feet.
    { g: sph(0.15, 6, 5), c: PINK, p: [-0.7, 0.78, 0.38] as const },
    { g: sph(0.15, 6, 5), c: PINK, p: [0.7, 0.78, 0.38] as const },
    { g: sph(0.22, 7, 5), c: FUR_LIGHT, p: [-0.34, 0.12, 0.25] as const, s: [1, 0.6, 1.4] as const },
    { g: sph(0.22, 7, 5), c: FUR_LIGHT, p: [0.34, 0.12, 0.25] as const, s: [1, 0.6, 1.4] as const },
    // Tail.
    { g: cyl(0.04, 0.07, 0.9, 5), c: PINK, p: [0, 0.3, -0.82] as const, r: [-1.1, 0, 0] as const },
    // Buck teeth.
    { g: box(0.1, 0.15, 0.04), c: white, p: [-0.06, 0.98, 0.92] as const },
    { g: box(0.1, 0.15, 0.04), c: white, p: [0.06, 0.98, 0.92] as const },
    // The home-made crown: a gold band, crooked spikes, a bottle cap and a bead.
    { g: cyl(0.27, 0.3, 0.14, 8), c: GOLD, p: [0, 1.64, 0.32] as const, r: [0.12, 0, 0.08] as const },
    { g: cone(0.08, 0.26, 4), c: GOLD, p: [-0.2, 1.84, 0.3] as const, r: [0, 0, 0.25] as const },
    { g: cone(0.08, 0.34, 4), c: GOLD, p: [0, 1.88, 0.34] as const, r: [0.1, 0, -0.1] as const },
    { g: cone(0.08, 0.24, 4), c: GOLD, p: [0.21, 1.82, 0.3] as const, r: [0, 0, -0.35] as const },
    { g: cyl(0.07, 0.07, 0.03, 7), c: 0xe8453c, p: [-0.12, 1.66, 0.58] as const, r: [1.3, 0, 0] as const },
    { g: sph(0.06, 6, 5), c: 0x4dabf7, p: [0.14, 1.66, 0.58] as const },
    { g: sph(0.045, 6, 5), c: 0x7bd36b, p: [0.02, 1.95, 0.35] as const },
    // Napkin bib.
    { g: box(0.52, 0.34, 0.05), c: white, p: [0, 0.92, 0.62] as const, r: [-0.3, 0, 0.05] as const },
    { g: box(0.12, 0.08, 0.02), c: 0xff8a6a, p: [-0.1, 0.9, 0.66] as const, r: [-0.3, 0, 0.3] as const },
  ];
  if (!friendly) {
    return merge([
      ...parts,
      // Greedy round eyes, hungry brows, a drop of drool.
      { g: sph(0.12, 7, 5), c: white, p: [-0.17, 1.3, 0.72] as const },
      { g: sph(0.12, 7, 5), c: white, p: [0.17, 1.3, 0.72] as const },
      { g: sph(0.05, 5, 4), c: DARK, p: [-0.17, 1.28, 0.83] as const },
      { g: sph(0.05, 5, 4), c: DARK, p: [0.17, 1.28, 0.83] as const },
      { g: box(0.2, 0.045, 0.04), c: DARK, p: [-0.17, 1.46, 0.74] as const, r: [0, 0, -0.35] as const },
      { g: box(0.2, 0.045, 0.04), c: DARK, p: [0.17, 1.46, 0.74] as const, r: [0, 0, 0.35] as const },
      { g: sph(0.05, 5, 4), c: 0x9fd8ff, p: [0.13, 0.9, 0.9] as const, s: [1, 1.5, 1] as const },
    ]);
  }
  return merge([
    ...parts,
    // Happy closed eyes (two slanted bars each) and a smile.
    { g: box(0.11, 0.035, 0.04), c: DARK, p: [-0.22, 1.3, 0.78] as const, r: [0, 0, 0.5] as const },
    { g: box(0.11, 0.035, 0.04), c: DARK, p: [-0.12, 1.3, 0.8] as const, r: [0, 0, -0.5] as const },
    { g: box(0.11, 0.035, 0.04), c: DARK, p: [0.22, 1.3, 0.78] as const, r: [0, 0, -0.5] as const },
    { g: box(0.11, 0.035, 0.04), c: DARK, p: [0.12, 1.3, 0.8] as const, r: [0, 0, 0.5] as const },
    { g: sph(0.07, 5, 4), c: 0xf29a8a, p: [-0.38, 1.12, 0.78] as const, s: [1.3, 0.7, 0.6] as const },
    { g: sph(0.07, 5, 4), c: 0xf29a8a, p: [0.38, 1.12, 0.78] as const, s: [1.3, 0.7, 0.6] as const },
    { g: box(0.09, 0.03, 0.04), c: DARK, p: [-0.08, 1.02, 0.93] as const, r: [0, 0, 0.5] as const },
    { g: box(0.09, 0.03, 0.04), c: DARK, p: [0.08, 1.02, 0.93] as const, r: [0, 0, -0.5] as const },
  ]);
}

/** One food pile: a wooden crate heaped with buns, cakes, a loaf and carrots (tinted by vertex colours). */
function pileGeo(): THREE.BufferGeometry {
  return merge([
    { g: box(1.3, 0.34, 1.0), c: 0xb98050, p: [0, 0.17, 0] },
    { g: box(1.34, 0.06, 1.04), c: 0x8a5a36, p: [0, 0.35, 0] },
    { g: sph(0.3, 8, 6), c: 0xffffff, p: [-0.3, 0.6, 0.1], s: [1, 0.85, 1] },
    { g: sph(0.28, 8, 6), c: 0xfff3dd, p: [0.28, 0.58, -0.12], s: [1, 0.85, 1] },
    { g: sph(0.27, 8, 6), c: 0xffffff, p: [0.05, 0.9, 0.0], s: [1, 0.85, 1] },
    { g: sph(0.05, 5, 4), c: 0xf3e6d2, p: [0.05, 1.12, 0.0] },
    { g: cyl(0.26, 0.26, 0.16, 8), c: 0xff9ec3, p: [0.42, 0.45, 0.28] },
    { g: sph(0.12, 6, 4), c: 0xe8453c, p: [0.42, 0.57, 0.28] },
    { g: sph(0.22, 8, 6), c: 0xd9a05a, p: [-0.4, 0.5, -0.28], s: [1.6, 0.7, 0.8] },
    { g: cone(0.07, 0.5, 5), c: 0xff9a2e, p: [0.0, 0.62, 0.38], r: [1.2, 0, 0.3] },
    { g: cone(0.07, 0.5, 5), c: 0xff9a2e, p: [-0.12, 0.62, 0.4], r: [1.2, 0, -0.1] },
    { g: sph(0.1, 5, 4), c: 0x4fae4a, p: [0.18, 0.5, 0.42] },
  ]);
}

/** The food colours of a popped pile. */
const FOOD_COLORS = [0xffffff, 0xff9ec3, 0xff9a2e, 0xd9a05a, 0x4fae4a];

/**
 * TIKUS RAKUS, the Chapter 6 mini-boss. One mesh for him, one instanced mesh for the 4 food piles (+ one for their glow), a ground
 * ring (2 meshes). Pattern, repeated: a pile GLOWS (the cue) -> he runs to it and EATS ~2 s and grows one size step (unless the child
 * pops the glowing pile with the laser or a stomp first) -> BELLY SLAM: a red ring fills on the ground for ~1 s, he hops and lands,
 * a wave runs out (jump, shield or step outside the ring) -> OUT OF BREATH (dizzy): the laser only counts now, each star knocked off
 * shrinks him one step (he burps food out). At the biggest size he no longer eats: slower, bigger ring. Nothing here hurts for real:
 * a touch of the wave is one heart (`Health.hurt`).
 */
export class RakusBoss {
  x: number;
  z: number;
  readonly cx: number;
  readonly cz: number;
  stars: number;
  /** Stars at the start of a fight (3 in "Mode mudah"). */
  readonly maxStars: number;
  /** Laser hits on the current star in this out-of-breath window. */
  hitsGot = 0;
  partialHits = 0;
  doubles = 0;
  phase: RakusPhase = 'idle';
  /** False: he only looks around (before the intro, during a scene, after a reset until the child comes back). */
  enabled = false;
  /** Out of breath: the laser counts. */
  vulnerable = false;
  /** Size step (0..maxLevel). */
  level = 0;
  muted = false;
  /** Test counters. */
  eaten = 0;
  saved = 0;
  slams = 0;
  hurtGlen = 0;
  blocked = 0;
  missed = 0;
  laserCounted = 0;
  laserEarly = 0;
  rounds = 0;
  dizzyKind: 'miss' | 'block' | 'hit' = 'miss';
  dizzyLeft = 0;
  /** Aim point of the laser (his belly). */
  readonly aimPt = new THREE.Vector3();

  private yaw = 0;
  private y = 0;
  private lvlVis = 0;
  private squash = 0;
  private timer = 0;
  private cool = 1.4;
  private t = 0;
  private disposed = false;
  private pile = -1;
  private puff = 0;
  private ringR = 0;
  private waveT = 99;
  private waveDone = true;
  /** A second wave of the double ring is still to come, and the seconds until it starts. */
  private wave2 = false;
  private wave2Wait = 0;
  private waitedForHelpers = 0;
  private lockedAt = { x: 0, z: 0 };
  private fly = -1;
  private readonly easy: boolean;
  private readonly px: number[] = [];
  private readonly pz: number[] = [];
  private readonly alive: boolean[] = [];
  private readonly pk: number[] = [];
  private readonly respawn: number[] = [];
  private readonly flyT: number[] = [];
  private readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly geoAngry: THREE.BufferGeometry;
  private readonly geoHappy: THREE.BufferGeometry;
  private readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly pileMesh: THREE.InstancedMesh;
  private readonly pileGlow: THREE.InstancedMesh;
  private readonly pileGlowMat: THREE.MeshBasicMaterial;
  private readonly ringOut: THREE.Mesh;
  private readonly ringFill: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly fillMat: THREE.MeshBasicMaterial;
  private readonly targets: Target[] = [];
  private readonly bodyTarget: Target;
  private readonly hud: HTMLDivElement;
  private readonly hudStars: HTMLElement[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v3 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();
  /** Where the child is while a round runs (updated every step). */
  private readonly C = Combat.rakus;
  /** Who may attack: the helpers say if one of them is winding up (the slam waits a moment). */
  helpersBusy: () => boolean = () => false;

  constructor(
    private readonly ctx: LevelContext,
    cx: number,
    cz: number,
    private readonly hooks: RakusHooks,
  ) {
    this.cx = cx;
    this.cz = cz;
    this.x = cx;
    this.z = cz;
    this.easy = ctx.save.data.settings.easyFight;
    this.maxStars = this.easy ? Combat.rakus.starsEasy : Combat.rakus.stars;
    this.stars = this.maxStars;
    const C = Combat.rakus;
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mats.push(lit);
    // The owner's Tikus Rakus model (static, 1.7 m tall like the old figure; code animation below). The same model is the happy one
    // (the tame scene uses scale pulses, burp and stars); the procedural figures stay as the fallback.
    const model = enemyModels.geometry('tikus_rakus', 1.7);
    this.geoAngry = model ?? rakusGeo(false);
    this.geoHappy = model ?? rakusGeo(true);
    const pg = pileGeo();
    this.geos.push(this.geoAngry, ...(this.geoHappy === this.geoAngry ? [] : [this.geoHappy]), pg);
    this.body = new THREE.Mesh(this.geoAngry, model ? (enemyModels.material('tikus_rakus') as THREE.Material) : lit);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xfff08a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.pileGlowMat = this.glowMat.clone();
    this.pileGlowMat.opacity = 0.45;
    this.mats.push(this.glowMat, this.pileGlowMat);
    const gg = new THREE.SphereGeometry(1, 12, 8);
    this.geos.push(gg);
    this.glow = new THREE.Mesh(gg, this.glowMat);
    this.glow.visible = false;
    this.pileMesh = new THREE.InstancedMesh(pg, lit, C.pileCount);
    this.pileGlow = new THREE.InstancedMesh(gg, this.pileGlowMat, C.pileCount);
    // The ground ring: an outline and a disc that fills up.
    const rg = new THREE.RingGeometry(0.93, 1, 48);
    rg.rotateX(-Math.PI / 2);
    const fg = new THREE.CircleGeometry(1, 36);
    fg.rotateX(-Math.PI / 2);
    this.geos.push(rg, fg);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff3b2e, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const m of [this.ringMat, this.fillMat]) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      this.mats.push(m);
    }
    this.ringOut = new THREE.Mesh(rg, this.ringMat);
    this.ringFill = new THREE.Mesh(fg, this.fillMat);
    this.ringOut.visible = this.ringFill.visible = false;
    this.ringOut.renderOrder = 3;
    this.ringFill.renderOrder = 3;
    this.pileGlow.visible = false;
    for (const m of [this.body, this.glow, this.pileMesh, this.pileGlow, this.ringOut, this.ringFill]) {
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    this.group.add(this.body, this.glow, this.pileMesh, this.pileGlow, this.ringOut, this.ringFill);
    ctx.root.add(this.group);

    // Piles on a ring around the arena centre (diagonals of the road).
    for (let i = 0; i < C.pileCount; i++) {
      const a = Math.PI / 4 + (i / C.pileCount) * Math.PI * 2;
      this.px.push(cx + Math.cos(a) * C.pileRadius);
      this.pz.push(cz + Math.sin(a) * C.pileRadius);
      this.alive.push(true);
      this.pk.push(1);
      this.respawn.push(0);
      this.flyT.push(-1);
      this.pileMesh.setColorAt(i, new THREE.Color(0xffffff));
      const pos = new THREE.Vector3(this.px[i], 0.5, this.pz[i]);
      this.targets.push(
        ctx.targets.add({
          id: `rakusPile${i}`,
          position: () => pos,
          radius: C.pileAim,
          enabled: false,
          priority: 2,
          assist: { ...C.assist },
          onHit: () => this.popPile(i, 'laser'),
        }),
      );
    }
    this.bodyTarget = ctx.targets.add({
      id: 'tikusRakus',
      position: () => this.aimPt,
      radius: C.aimRadius,
      enabled: false,
      priority: 1,
      assist: { ...C.assist },
      onHit: (h) => this.laserHit(h),
    });
    // A landing stomp pops the glowing pile (one stomp, like a laser hit).
    ctx.player.onStomp((e) => {
      if (this.disposed || this.pile < 0 || !this.alive[this.pile]) return;
      if (Math.hypot(this.px[this.pile] - e.x, this.pz[this.pile] - e.z) < e.radius + 0.6 && Math.abs(e.y) < 3) this.popPile(this.pile, 'stomp');
    });

    this.hud = document.createElement('div');
    this.hud.className = 'ch5-stars ch6-stars';
    this.hud.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.maxStars; i++) {
      const s = document.createElement('span');
      s.className = 'ch5-star';
      s.innerHTML = STAR_SVG;
      this.hud.appendChild(s);
      this.hudStars.push(s);
    }
    ctx.ui.appendChild(this.hud);
    this.paintHud();
    ctx.onDispose(() => {
      this.disposed = true;
      this.hud.remove();
      this.pileMesh.dispose();
      this.pileGlow.dispose();
      for (const g of this.geos) g.dispose();
      for (const m of this.mats) m.dispose();
    });
    this.layout(0);
  }

  // ---- numbers -----------------------------------------------------------------------------------------------

  /** Size multiplier of the (animated) size step. */
  private get scaleNow(): number {
    const S = this.C.sizes;
    const lo = Math.floor(this.lvlVis);
    const hi = Math.min(S.length - 1, lo + 1);
    return S[lo] + (S[hi] - S[lo]) * (this.lvlVis - lo);
  }

  private get speedNow(): number {
    return this.C.speed[this.level];
  }

  /** Ring radius (m) of the current step. */
  get ringRadius(): number {
    return this.C.ring[this.level] * (this.easy ? this.C.ringEasyMul : 1);
  }

  private dist(): number {
    const p = this.ctx.player.position;
    return Math.hypot(p.x - this.x, p.z - this.z);
  }

  // ---- HUD ---------------------------------------------------------------------------------------------------

  showHud(on: boolean): void {
    this.hud.classList.toggle('show', on);
  }

  private paintHud(): void {
    this.hudStars.forEach((s, i) => {
      s.classList.toggle('lost', i >= this.stars);
      s.classList.toggle('half', i === this.stars - 1 && this.hitsGot > 0);
    });
    this.hud.dataset.stars = String(this.stars);
  }

  // ---- control -----------------------------------------------------------------------------------------------

  /** Full stars, small again, waiting (a new fight after "kelelahan", or the first one). */
  reset(): void {
    this.stars = this.maxStars;
    this.hitsGot = 0;
    this.wave2 = false;
    this.level = 0;
    this.lvlVis = 0;
    this.phase = 'idle';
    this.vulnerable = false;
    this.timer = 0;
    this.cool = 1.4;
    this.pile = -1;
    this.waveT = 99;
    this.waveDone = true;
    this.dizzyLeft = 0;
    this.squash = 0;
    this.y = 0;
    this.x = this.cx;
    this.z = this.cz;
    this.rounds = 0;
    this.body.geometry = this.geoAngry;
    this.group.visible = true;
    for (let i = 0; i < this.C.pileCount; i++) {
      this.alive[i] = true;
      this.pk[i] = 1;
      this.respawn[i] = 0;
      this.flyT[i] = -1;
    }
    this.ringOut.visible = this.ringFill.visible = false;
    this.glow.visible = false;
    this.paintHud();
    this.syncTargets();
    this.layout(0);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.syncTargets();
  }

  private syncTargets(): void {
    const live = this.enabled && this.phase !== 'tamed' && this.phase !== 'gone' && this.phase !== 'beaten';
    this.bodyTarget.enabled = live;
    const piling = live && (this.phase === 'cue' || this.phase === 'run' || this.phase === 'eat');
    for (let i = 0; i < this.targets.length; i++) this.targets[i].enabled = piling && i === this.pile && this.alive[i];
  }

  // ---- the round ---------------------------------------------------------------------------------------------

  private beginRound(): void {
    const free: number[] = [];
    for (let i = 0; i < this.alive.length; i++) if (this.alive[i] && this.pk[i] > 0.9) free.push(i);
    if (this.level >= this.C.maxLevel || free.length === 0) {
      this.beginApproach();
      return;
    }
    this.beginCue(free[Math.min(free.length - 1, Math.floor(CombatRng.next() * free.length))]);
  }

  /** Test and flow: a pile starts to glow (the cue), he looks at it. */
  beginCue(i: number): void {
    this.pile = i;
    this.phase = 'cue';
    this.timer = 0;
    this.syncTargets();
    this.ctx.sfx.blip();
    this.hooks.onEvent('cue');
  }

  private beginApproach(): void {
    this.phase = 'approach';
    this.timer = 0;
    this.waitedForHelpers = 0;
    this.pile = -1;
    this.syncTargets();
  }

  /** The ring shows on the ground around him, filling up; he crouches. */
  beginWind(): void {
    this.phase = 'wind';
    this.timer = 0;
    this.ringR = this.ringRadius;
    this.lockedAt.x = this.x;
    this.lockedAt.z = this.z;
    this.puff = 0;
    this.pile = -1;
    this.syncTargets();
    this.ctx.sfx.blip();
    this.hooks.onEvent('ring');
  }

  private beginHop(): void {
    this.phase = 'hop';
    this.timer = 0;
    this.ctx.synth.boing();
  }

  /** The belly lands: a wave runs out along the ground; he is out of breath at once. */
  private impact(): void {
    const { ctx } = this;
    this.slams++;
    this.y = 0;
    this.squash = 1;
    this.waveT = 0;
    this.waveDone = false;
    // From a big size on the slam is a double ring: a second wave follows the first (normal mode only).
    this.wave2 = !this.easy && this.level >= this.C.doubleFrom;
    this.wave2Wait = this.C.doubleGap;
    if (this.wave2) this.doubles++;
    ctx.sfx.land(1);
    ctx.battle.impact(this.x, this.z, Math.min(1.5, this.scaleNow / 1.7), 'slam');
    ctx.fx.flashes.spawn(this.x, 0.3, this.z, this.ringR * 1.3, 0.45, 0xffb347);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ctx.fx.sparkles.burst(this.x + Math.cos(a) * this.ringR * 0.7, 0.15, this.z + Math.sin(a) * this.ringR * 0.7, 3, 2, 0xf4f1e8, { gravity: 0.3, life: 0.5, up: 0.5 });
    }
    this.beginDizzy();
  }

  private beginDizzy(): void {
    this.phase = 'dizzy';
    this.dizzyKind = 'miss';
    this.dizzyLeft = this.C.dizzyMiss * (this.easy ? this.C.dizzyEasyMul : 1);
    this.hitsGot = 0;
    this.timer = 0;
    this.vulnerable = true;
    this.ctx.fx.stars.show(this.aimPt, 1.0 * this.scaleNow, this.dizzyLeft, 0.8);
    this.hooks.onEvent('dizzy');
  }

  /** What the wave did to the child: shield = the reward (longer), hit = shorter. */
  private resolveWave(result: 'hit' | 'blocked' | 'miss'): void {
    this.waveDone = true;
    const mul = this.easy ? this.C.dizzyEasyMul : 1;
    if (result === 'hit') {
      this.hurtGlen++;
      this.dizzyKind = 'hit';
      this.dizzyLeft = Math.min(this.dizzyLeft, this.C.dizzyHit * mul);
      this.hooks.onEvent('hurt');
    } else if (result === 'blocked') {
      this.blocked++;
      this.dizzyKind = 'block';
      this.dizzyLeft = Math.max(this.dizzyLeft, this.C.dizzyBlock * mul);
      this.ctx.fx.stars.show(this.aimPt, 1.0 * this.scaleNow, this.dizzyLeft, 0.8);
      this.hooks.onEvent('blocked');
    } else this.missed++;
  }

  private endRound(): void {
    this.rounds++;
    this.phase = 'idle';
    this.cool = this.easy ? this.C.roundGapEasy : this.C.roundGap;
    this.vulnerable = false;
    this.hooks.onRoundEnd(this.rounds);
  }

  // ---- food piles --------------------------------------------------------------------------------------------

  /** A pile pops into sparkles: the food is saved. If he was after it he pouts. */
  popPile(i: number, _how: 'laser' | 'stomp'): void {
    if (!this.alive[i]) return;
    const { ctx } = this;
    this.alive[i] = false;
    this.respawn[i] = this.C.pileRespawn;
    this.pk[i] = 0;
    for (let k = 0; k < FOOD_COLORS.length; k++) ctx.fx.sparkles.burst(this.px[i], 0.7, this.pz[i], 7, 3.2, FOOD_COLORS[k], { gravity: 2, life: 0.9, up: 1.2 });
    ctx.fx.flashes.spawn(this.px[i], 0.6, this.pz[i], 1.6, 0.4, 0xffe14d);
    ctx.sfx.bling();
    ctx.synth.boing();
    this.saved++;
    if (i === this.pile && (this.phase === 'cue' || this.phase === 'run' || this.phase === 'eat')) {
      this.phase = 'pout';
      this.timer = 0;
      this.pile = -1;
      this.syncTargets();
      this.hooks.onEvent('saved');
    } else this.syncTargets();
  }

  private eatDone(): void {
    const { ctx } = this;
    const i = this.pile;
    this.alive[i] = false;
    this.respawn[i] = this.C.pileRespawn;
    this.pk[i] = 0;
    this.eaten++;
    ctx.fx.sparkles.burst(this.x, 1.2 * this.scaleNow, this.z, 14, 2.6, 0xffe14d, { gravity: 1.5, life: 0.7, up: 0.8 });
    ctx.sfx.pop();
    ctx.synth.boing();
    this.squash = 1;
    if (this.level < this.C.maxLevel) this.level++;
    this.pile = -1;
    this.syncTargets();
    this.hooks.onEvent('grew');
    this.beginApproach();
  }

  // ---- laser -------------------------------------------------------------------------------------------------

  private laserHit(h: HitInfo): void {
    if (!this.vulnerable || this.stars <= 0) {
      this.laserEarly++;
      const { ctx } = this;
      ctx.sfx.pop();
      ctx.fx.sparkles.burst(h.x, h.y, h.z, 6, 2, 0xdfe6f2, { gravity: 0.5, life: 0.4, up: 0.3 });
      this.hooks.onEvent('laserEarly');
      return;
    }
    this.laserCounted++;
    this.hitsGot++;
    if (this.hitsGot >= (this.easy ? this.C.hitsPerStarEasy : this.C.hitsPerStar)) this.takeStar();
    else this.halfHit();
  }

  /** The first of two hits: a bonk, the star shows half, the window stays open a little longer for the second. */
  private halfHit(): void {
    const { ctx } = this;
    this.partialHits++;
    this.squash = 1;
    this.dizzyLeft = Math.max(this.dizzyLeft, this.C.partialKeep);
    this.paintHud();
    ctx.synth.boing();
    ctx.sfx.pop();
    ctx.fx.sparkles.burst(this.aimPt.x, this.aimPt.y, this.aimPt.z, 12, 2.6, 0xffe14d, { gravity: 2, life: 0.6, up: 0.6 });
    ctx.fx.flashes.spawn(this.aimPt.x, this.aimPt.y, this.aimPt.z, 1.4 * this.scaleNow, 0.4, 0xffd23f);
  }

  /** One star goes (a laser hit while he is out of breath; also the test hook): he shrinks one step and burps food out. */
  takeStar(): void {
    const { ctx } = this;
    this.stars = Math.max(0, this.stars - 1);
    this.hitsGot = 0;
    this.vulnerable = false;
    this.squash = 1;
    this.paintHud();
    const sc = this.scaleNow;
    ctx.synth.boing();
    ctx.sfx.bling();
    ctx.fx.stars.show(this.aimPt, 1.0 * sc, 1.4, 0.8);
    ctx.fx.sparkles.burst(this.aimPt.x, this.aimPt.y, this.aimPt.z, 22, 3.4, 0xffe14d, { gravity: 2, life: 0.8, up: 0.8 });
    ctx.fx.flashes.spawn(this.aimPt.x, this.aimPt.y, this.aimPt.z, 2.2 * sc, 0.5, 0xffd23f);
    for (let k = 0; k < FOOD_COLORS.length; k++) ctx.fx.sparkles.burst(this.x, 1.3 * sc, this.z, 5, 3.4, FOOD_COLORS[k], { gravity: 3, life: 0.9, up: 1.4 });
    // He stays big: one size step is lost only every `shrinkEvery` stars (every star in easy mode).
    if (this.level > 0 && (this.easy || (this.maxStars - this.stars) % this.C.shrinkEvery === 0)) {
      this.level--;
      this.hooks.onEvent('shrunk');
    }
    this.dizzyLeft = Math.min(this.dizzyLeft, this.C.afterHit);
    if (this.stars <= 0) {
      this.phase = 'beaten';
      this.syncTargets();
    }
    this.hooks.onStar(this.stars);
  }

  // ---- updates -----------------------------------------------------------------------------------------------

  private moveToward(tx: number, tz: number, speed: number, dt: number, inArena = true): number {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, speed * dt);
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
    this.yaw = turnTo(this.yaw, Math.atan2(dx, dz), dt * 7);
    // Stay inside the arena.
    if (!inArena) return d - step;
    const ox = this.x - this.cx;
    const oz = this.z - this.cz;
    const od = Math.hypot(ox, oz);
    const R = this.C.arenaRadius;
    if (od > R) {
      this.x = this.cx + (ox / od) * R;
      this.z = this.cz + (oz / od) * R;
    }
    return d - step;
  }

  fixedUpdate(dt: number): void {
    if (this.disposed) return;
    this.t += dt;
    const C = this.C;
    const { ctx } = this;
    const pl = ctx.player.position;
    this.squash = Math.max(0, this.squash - dt * 2.5);
    // The size eases to its step (growing and shrinking are visible).
    const dv = this.level - this.lvlVis;
    if (dv !== 0) this.lvlVis += Math.sign(dv) * Math.min(Math.abs(dv), dt / C.grow);
    const calm = this.muted || !this.enabled || !ctx.game.controlsEnabled || ctx.dialog.blocking || ctx.health.resting;
    // Piles come back.
    for (let i = 0; i < C.pileCount; i++) {
      if (this.alive[i]) {
        if (this.pk[i] < 1) this.pk[i] = Math.min(1, this.pk[i] + dt * 2.4);
      } else if (this.enabled && this.phase !== 'tamed' && this.phase !== 'gone') {
        this.respawn[i] -= dt;
        if (this.respawn[i] <= 0 && !(this.phase === 'eat' && this.pile === i)) {
          this.alive[i] = true;
          this.pk[i] = 0;
        }
      }
    }
    if (this.phase === 'idle' || this.phase === 'beaten' || this.phase === 'tamed') {
      this.yaw = turnTo(this.yaw, Math.atan2(pl.x - this.x, pl.z - this.z), dt * 3);
    }
    switch (this.phase) {
      case 'idle': {
        this.cool = Math.max(0, this.cool - dt);
        if (!calm && this.cool <= 0 && this.dist() < C.engageRadius) this.beginRound();
        break;
      }
      case 'cue': {
        this.timer += dt;
        this.yaw = turnTo(this.yaw, Math.atan2(this.px[this.pile] - this.x, this.pz[this.pile] - this.z), dt * 6);
        if (this.timer >= (this.easy ? C.cueEasy : C.cue)) {
          this.phase = 'run';
          this.timer = 0;
        }
        break;
      }
      case 'run': {
        const stop = 0.8 + 0.7 * this.scaleNow;
        const dx = this.px[this.pile] - this.x;
        const dz = this.pz[this.pile] - this.z;
        const d = Math.hypot(dx, dz);
        if (d > stop) this.moveToward(this.px[this.pile], this.pz[this.pile], this.speedNow, dt);
        else {
          this.phase = 'eat';
          this.timer = 0;
          this.puff = 0;
        }
        break;
      }
      case 'eat': {
        this.timer += dt;
        const eat = this.easy ? C.eatEasy : C.eat;
        const u = Math.min(1, this.timer / eat);
        this.pk[this.pile] = Math.max(0, 1 - u);
        this.yaw = turnTo(this.yaw, Math.atan2(this.px[this.pile] - this.x, this.pz[this.pile] - this.z), dt * 6);
        this.puff -= dt;
        if (this.puff <= 0) {
          this.puff = 0.22;
          ctx.sfx.pop();
          ctx.fx.sparkles.burst(this.x + Math.sin(this.yaw) * 0.9, 1.0 * this.scaleNow, this.z + Math.cos(this.yaw) * 0.9, 3, 1.6, FOOD_COLORS[Math.floor(CombatRng.next() * FOOD_COLORS.length)], { gravity: 2, life: 0.5, up: 0.4 });
        }
        if (u >= 1) this.eatDone();
        break;
      }
      case 'pout': {
        this.timer += dt;
        this.yaw = turnTo(this.yaw, Math.atan2(pl.x - this.x, pl.z - this.z), dt * 3);
        if (this.timer >= C.pout) this.beginApproach();
        break;
      }
      case 'approach': {
        this.timer += dt;
        const want = this.ringRadius * C.approachShare;
        const d = this.dist();
        if (d > want && this.timer < C.approachMax) this.moveToward(pl.x, pl.z, this.speedNow, dt);
        else {
          // A helper's wind-up is on: the slam waits a moment so nothing comes at once.
          if (this.helpersBusy() && this.waitedForHelpers < Combat.rakus.helpers.bossWait) this.waitedForHelpers += dt;
          else this.beginWind();
        }
        break;
      }
      case 'wind': {
        this.timer += dt;
        const wind = this.easy ? C.windEasy : C.wind;
        this.puff -= dt;
        if (this.puff <= 0) {
          this.puff = 0.1;
          ctx.fx.sparkles.burst(this.x + (CombatRng.next() - 0.5) * 2, 0.15, this.z + (CombatRng.next() - 0.5) * 2, 2, 1.2, 0xf4f1e8, { gravity: -0.2, life: 0.4, up: 0.3 });
        }
        if (this.timer >= wind) this.beginHop();
        break;
      }
      case 'hop': {
        this.timer += dt;
        const u = Math.min(1, this.timer / C.hop);
        this.y = Math.sin(Math.PI * u) * 1.5 * this.scaleNow;
        if (u >= 1) this.impact();
        break;
      }
      case 'dizzy': {
        this.dizzyLeft -= dt;
        if (this.dizzyLeft <= 0) {
          this.vulnerable = false;
          this.hitsGot = 0;
          this.paintHud();
          this.phase = 'recover';
          this.timer = 0;
        }
        break;
      }
      case 'recover': {
        this.timer += dt;
        if (this.timer >= C.recover) this.endRound();
        break;
      }
      default:
        break;
    }
    // The wave after a slam.
    if (this.waveT < 1) {
      this.waveT += dt / 0.3;
      if (!this.waveDone) {
        const R = this.ringR;
        const waveR = Math.min(1, this.waveT) * R;
        const d = Math.hypot(pl.x - this.x, pl.z - this.z);
        if (d <= waveR && pl.y - 0.55 < C.touchTop * this.scaleNow) {
          const r = ctx.health.hurt(this.x, this.z);
          this.resolveWave(r === 'hit' ? 'hit' : r === 'blocked' ? 'blocked' : 'miss');
        } else if (this.waveT >= 1) this.resolveWave('miss');
      }
    } else if (this.wave2 && this.waveT < 90) {
      // The first wave is over: the ring blinks, then the second wave runs out.
      this.wave2Wait -= dt;
      if (this.wave2Wait <= 0) {
        this.wave2 = false;
        this.waveT = 0;
        this.waveDone = false;
        ctx.sfx.land(1);
        ctx.fx.flashes.spawn(this.x, 0.3, this.z, this.ringR * 1.3, 0.45, 0xffb347);
      }
    }
  }

  update(dt: number): void {
    if (this.disposed || this.phase === 'gone') return;
    this.layout(dt);
  }

  // ---- drawing -----------------------------------------------------------------------------------------------

  private layout(_dt: number): void {
    const C = this.C;
    const t = this.t;
    const sc = this.scaleNow;
    let sy = 1;
    let sxz = 1;
    let roll = 0;
    let pitch = 0;
    let jx = 0;
    let jz = 0;
    switch (this.phase) {
      case 'idle':
        sy = 1 + Math.sin(t * 2.4) * 0.025;
        break;
      case 'cue': {
        // Rubs his belly, drools, wiggles.
        sy = 1 + Math.sin(t * 9) * 0.04;
        roll = Math.sin(t * 6) * 0.08;
        break;
      }
      case 'run':
        this.y = Math.abs(Math.sin(t * 11)) * 0.18 * sc;
        sy = 1 + Math.sin(t * 22) * 0.03;
        pitch = 0.12;
        break;
      case 'eat': {
        // Chomp, chomp: the cheeks and belly pulse.
        const ch = Math.sin(t * 14);
        sy = 1 + ch * 0.06;
        sxz = 1 - ch * 0.03;
        pitch = 0.22 + Math.sin(t * 7) * 0.05;
        this.y = 0;
        break;
      }
      case 'pout':
        sy = 0.93;
        sxz = 1.05;
        roll = Math.sin(t * 3) * 0.05;
        break;
      case 'approach':
        this.y = Math.abs(Math.sin(t * 9)) * 0.14 * sc;
        pitch = 0.1;
        break;
      case 'wind': {
        const u = Math.min(1, this.timer / (this.easy ? C.windEasy : C.wind));
        sy = 1 - 0.2 * u;
        sxz = 1 + 0.12 * u;
        jx = Math.sin(t * 70) * 0.05 * (0.4 + u);
        jz = Math.cos(t * 63) * 0.05 * (0.4 + u);
        this.y = 0;
        break;
      }
      case 'hop':
        sy = 1.12;
        sxz = 0.94;
        break;
      case 'dizzy':
      case 'beaten':
        roll = Math.sin(t * 4) * 0.16;
        pitch = Math.cos(t * 4) * 0.08;
        sy = 1 + Math.sin(t * 9) * 0.05;
        this.y = 0;
        break;
      case 'recover':
        sy = 0.96 + Math.sin(this.timer * 10) * 0.02;
        break;
      default:
        break;
    }
    const sq = this.squash;
    sy *= 1 - 0.2 * sq;
    sxz *= 1 + 0.15 * sq;
    this.body.position.set(this.x + jx, this.y, this.z + jz);
    this.e.set(pitch, this.yaw, roll, 'YXZ');
    this.body.quaternion.setFromEuler(this.e);
    this.body.scale.set(sc * sxz, sc * sy, sc * sxz);
    this.aimPt.set(this.x, this.y + 0.85 * sc, this.z);
    this.bodyTarget.radius = C.aimRadius * Math.max(1, sc);
    // Glow around him while the laser counts.
    const lit = this.vulnerable && this.phase === 'dizzy';
    this.glow.visible = lit;
    if (lit) {
      const k = 0.5 + 0.5 * Math.sin(t * 9);
      this.glow.position.set(this.x, this.y + 0.85 * sc, this.z);
      this.glow.scale.setScalar(sc * (1.25 + 0.12 * k));
      this.glowMat.opacity = 0.2 + 0.18 * k;
    }
    // The ring on the ground (wind-up), then it flashes away with the wave.
    const secondRing = this.wave2 && this.waveT < 90 && this.waveT >= 1;
    const showRing = this.phase === 'wind' || this.phase === 'hop' || secondRing;
    this.ringOut.visible = this.ringFill.visible = showRing;
    if (showRing) {
      const wind = this.easy ? C.windEasy : C.wind;
      const u = this.phase === 'hop' || secondRing ? 1 : Math.min(1, this.timer / wind);
      const R = this.ringR;
      this.ringOut.position.set(this.lockedAt.x, 0.07, this.lockedAt.z);
      this.ringFill.position.set(this.lockedAt.x, 0.065, this.lockedAt.z);
      this.ringOut.scale.set(R, 1, R);
      const f = Math.max(0.02, u) * R;
      this.ringFill.scale.set(f, 1, f);
      const pulse = 0.5 + 0.5 * Math.sin(t * (u > 0.5 ? 26 : 12));
      this.ringMat.opacity = 0.6 + 0.3 * pulse;
      this.fillMat.opacity = 0.18 + 0.22 * u + 0.1 * pulse;
    }
    // Piles.
    let anyGlow = false;
    for (let i = 0; i < C.pileCount; i++) {
      const k = this.flyT[i] >= 0 ? 1 : this.alive[i] ? this.pk[i] : 0;
      let px = this.px[i];
      let py = 0;
      let pz = this.pz[i];
      if (this.flyT[i] >= 0) {
        const u = Math.min(1, this.flyT[i]);
        px += (RAKUS_GUDANG.x - px) * u;
        pz += (RAKUS_GUDANG.z - pz) * u;
        py = Math.sin(Math.PI * u) * 3.2 + u * 0.6;
      }
      const s = Math.max(0.0001, k * (this.flyT[i] >= 0 ? 1 - 0.5 * Math.min(1, this.flyT[i]) : 1));
      const wob = this.phase === 'eat' && i === this.pile ? Math.sin(t * 14) * 0.04 : 0;
      this.q.setFromAxisAngle(this.v3.set(0, 1, 0), i * 1.3 + wob);
      this.m4.compose(this.v3.set(px, py, pz), this.q, this.s3.set(s, s, s));
      this.pileMesh.setMatrixAt(i, this.m4);
      // Glow: only the pile he is after.
      const g = i === this.pile && this.alive[i] && (this.phase === 'cue' || this.phase === 'run' || this.phase === 'eat');
      if (g) {
        anyGlow = true;
        const pulse = 0.5 + 0.5 * Math.sin(t * 9);
        const gs = (1.15 + 0.2 * pulse) * Math.max(0.3, this.pk[i]);
        this.m4.compose(this.v3.set(this.px[i], 0.6, this.pz[i]), this.q.identity(), this.s3.set(gs, gs, gs));
        this.pileGlowMat.opacity = 0.3 + 0.25 * pulse;
      } else this.m4.makeScale(0, 0, 0);
      this.pileGlow.setMatrixAt(i, this.m4);
    }
    this.pileMesh.instanceMatrix.needsUpdate = true;
    this.pileGlow.instanceMatrix.needsUpdate = true;
    if (this.pileMesh.instanceColor) this.pileMesh.instanceColor.needsUpdate = true;
    this.pileGlow.visible = anyGlow;
    // The pile flies at the end (the food goes home).
    for (let i = 0; i < C.pileCount; i++) if (this.flyT[i] >= 0 && this.fly >= 0) this.flyT[i] = Math.min(1.001, this.flyT[i] + _dt / 1.2);
  }

  // ---- story hooks -------------------------------------------------------------------------------------------

  /** Friendly face, back to normal size (he burps), the piles are whole again. Resolves when done. */
  async tameLook(): Promise<void> {
    this.phase = 'tamed';
    this.vulnerable = false;
    this.glow.visible = false;
    this.ringOut.visible = this.ringFill.visible = false;
    this.pile = -1;
    this.waveT = 99;
    this.wave2 = false;
    this.body.geometry = this.geoHappy;
    this.syncTargets();
    for (let i = 0; i < this.C.pileCount; i++) {
      this.alive[i] = true;
      this.pk[i] = 1;
    }
    const { seq } = this.ctx;
    this.level = 0;
    this.squash = 1;
    this.ctx.synth.boing();
    await seq.wait(this.C.grow + 0.5);
    this.ctx.fx.stars.show(this.aimPt, 1.0 * this.scaleNow, 1.6, 0.8);
    this.ctx.sfx.bling();
  }

  /** The four piles of food fly back to the warehouse door and vanish in sparkles. */
  async returnFood(): Promise<void> {
    const { seq, fx, sfx } = this.ctx;
    this.fly = 1;
    for (let i = 0; i < this.C.pileCount; i++) {
      this.flyT[i] = 0;
      await seq.wait(0.25);
    }
    await seq.wait(1.2);
    for (let i = 0; i < this.C.pileCount; i++) {
      this.flyT[i] = -1;
      this.alive[i] = false;
      this.pk[i] = 0;
      this.respawn[i] = 1e9;
      fx.sparkles.burst(RAKUS_GUDANG.x + (i - 1.5) * 1.2, 1.4, RAKUS_GUDANG.z, 12, 2.4, FOOD_COLORS[i % FOOD_COLORS.length], { gravity: 1, life: 0.8, up: 0.8 });
    }
    sfx.bling();
  }

  /** He trots to the warehouse door and goes inside (the end). */
  async trotHome(): Promise<void> {
    const { seq } = this.ctx;
    this.phase = 'tamed';
    const sc0 = this.scaleNow;
    let guard = 0;
    while (guard++ < 600) {
      const d = this.moveToward(RAKUS_GUDANG.x, RAKUS_GUDANG.z - 0.6, 3.2, 1 / 30, false);
      this.y = Math.abs(Math.sin(this.t * 10)) * 0.15;
      if (d < 0.3) break;
      await seq.wait(1 / 30);
    }
    await seq.tween(0.4, (u) => {
      const s = sc0 * (1 - u);
      this.body.scale.set(s, s, s);
    });
    this.phase = 'gone';
    this.group.visible = false;
  }

  /** Where the camera looks while he talks. */
  get headAt(): THREE.Vector3 {
    return this.aimPt;
  }

  /** Test: stop whatever he does and wait (no new round for a long time). */
  testIdle(): void {
    this.phase = 'idle';
    this.vulnerable = false;
    this.cool = 1e6;
    this.pile = -1;
    this.waveT = 99;
    this.waveDone = true;
    this.wave2 = false;
    this.ringOut.visible = this.ringFill.visible = false;
    this.syncTargets();
  }

  /** Test: the round ends now (the chapter may send helpers). */
  testEndRound(): void {
    this.endRound();
    this.cool = 1e6;
  }

  /** Test: his size step, instantly. */
  setLevelNow(n: number): void {
    this.level = Math.max(0, Math.min(this.C.maxLevel, n));
    this.lvlVis = this.level;
  }

  /** Test handle. */
  debug(): Record<string, unknown> {
    return {
      phase: this.phase,
      stars: this.stars,
      level: this.level,
      lvlVis: Math.round(this.lvlVis * 100) / 100,
      scale: Math.round(this.scaleNow * 100) / 100,
      height: Math.round(this.scaleNow * this.C.baseHeight * 100) / 100,
      speed: this.speedNow,
      vulnerable: this.vulnerable,
      enabled: this.enabled,
      pos: { x: this.x, z: this.z },
      aim: { x: this.aimPt.x, y: this.aimPt.y, z: this.aimPt.z },
      pile: this.pile,
      piles: this.alive.map((a, i) => ({ alive: a, k: Math.round(this.pk[i] * 100) / 100, x: this.px[i], z: this.pz[i], target: this.targets[i].enabled })),
      glow: this.glow.visible,
      pileGlow: this.pileGlow.visible,
      ringShown: this.ringOut.visible,
      ringR: this.ringR,
      ringNow: this.ringRadius,
      timer: Math.round(this.timer * 100) / 100,
      dizzyKind: this.dizzyKind,
      dizzyLeft: Math.round(this.dizzyLeft * 100) / 100,
      eaten: this.eaten,
      saved: this.saved,
      slams: this.slams,
      hurtGlen: this.hurtGlen,
      blocked: this.blocked,
      missed: this.missed,
      laserCounted: this.laserCounted,
      laserEarly: this.laserEarly,
      rounds: this.rounds,
      waveDone: this.waveDone,
      maxStars: this.maxStars,
      hitsGot: this.hitsGot,
      partialHits: this.partialHits,
      doubles: this.doubles,
      wave2: this.wave2,
    };
  }
}

function turnTo(cur: number, target: number, k: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}
