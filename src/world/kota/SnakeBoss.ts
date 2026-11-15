import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { Combat } from '../../config/combat';
import type { HitInfo, Target } from '../../gameplay/Targets';
import { box, cone, merge, sph } from './ColorMesh';

/** Body segments (index 0 is the neck, the last one the tail tip). */
const N = 20;
const GREEN = 0x6cc04a;
const LIGHT = 0xa8e07a;
const PURPLE = 0x9b6bd6;
const STAR_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 L40 23 L60 24.5 L45 38 L49.5 58 L32 47.5 L14.5 58 L19 38 L4 24.5 L24 23 Z" fill="#ffd23f" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';

export type SnakePhase = 'idle' | 'wind' | 'lunge' | 'dizzy' | 'retract' | 'beaten' | 'tamed' | 'gone';
export type DizzyKind = 'miss' | 'block' | 'hit';

export interface SnakeHooks {
  /** A star was lost (laser in a dizzy window); `left` is what remains (0: the snake is beaten). */
  onStar(left: number): void;
  /** A lunge was announced / the laser hit a head that does not glow: the chapter may say a hint. */
  onEvent(kind: 'wind' | 'dizzy' | 'laserEarly' | 'blocked' | 'hurt'): void;
}

/** The silly head: big green ball, huge googly eyes, buck teeth, purple spots, a forked tongue. `friendly`: closed smiling eyes. */
function headGeo(friendly: boolean): THREE.BufferGeometry {
  const dark = 0x2b1a12;
  const white = 0xffffff;
  const parts = [
    { g: sph(0.85, 12, 9), c: GREEN, p: [0, 0, 0] as const, s: [1.08, 0.82, 1.15] as const },
    { g: sph(0.5, 8, 6), c: LIGHT, p: [0, -0.28, 0.45] as const, s: [1.2, 0.6, 1] as const },
    // Purple spots on top.
    { g: sph(0.16, 6, 4), c: PURPLE, p: [-0.35, 0.58, -0.1] as const, s: [1, 0.4, 1] as const },
    { g: sph(0.2, 6, 4), c: PURPLE, p: [0.3, 0.6, -0.3] as const, s: [1, 0.4, 1] as const },
    { g: sph(0.12, 6, 4), c: PURPLE, p: [0.05, 0.64, 0.2] as const, s: [1, 0.4, 1] as const },
    // Nostrils.
    { g: sph(0.06, 5, 4), c: dark, p: [-0.15, 0.02, 1.02] as const },
    { g: sph(0.06, 5, 4), c: dark, p: [0.15, 0.02, 1.02] as const },
    // Tongue (forked).
    { g: box(0.1, 0.04, 0.55), c: 0xe8453c, p: [0, -0.3, 1.2] as const },
    { g: box(0.08, 0.04, 0.2), c: 0xe8453c, p: [-0.1, -0.3, 1.55] as const, r: [0, 0.5, 0] as const },
    { g: box(0.08, 0.04, 0.2), c: 0xe8453c, p: [0.1, -0.3, 1.55] as const, r: [0, -0.5, 0] as const },
  ];
  if (!friendly) {
    return merge([
      ...parts,
      // Googly eyes (pupils looking two different ways), cute-grumpy brows.
      { g: sph(0.32, 8, 6), c: white, p: [-0.4, 0.4, 0.62] as const },
      { g: sph(0.32, 8, 6), c: white, p: [0.4, 0.4, 0.62] as const },
      { g: sph(0.13, 6, 4), c: dark, p: [-0.34, 0.34, 0.9] as const },
      { g: sph(0.13, 6, 4), c: dark, p: [0.46, 0.46, 0.9] as const },
      { g: box(0.34, 0.07, 0.06), c: dark, p: [-0.4, 0.82, 0.7] as const, r: [0, 0, -0.45] as const },
      { g: box(0.34, 0.07, 0.06), c: dark, p: [0.4, 0.82, 0.7] as const, r: [0, 0, 0.45] as const },
      // Buck teeth.
      { g: box(0.13, 0.2, 0.05), c: white, p: [-0.08, -0.16, 1.0] as const },
      { g: box(0.13, 0.2, 0.05), c: white, p: [0.08, -0.16, 1.0] as const },
    ]);
  }
  return merge([
    ...parts,
    // Happy closed eyes (little arcs made of two slanted bars) and a smile.
    { g: box(0.2, 0.06, 0.05), c: dark, p: [-0.5, 0.45, 0.85] as const, r: [0, 0, 0.5] as const },
    { g: box(0.2, 0.06, 0.05), c: dark, p: [-0.34, 0.45, 0.88] as const, r: [0, 0, -0.5] as const },
    { g: box(0.2, 0.06, 0.05), c: dark, p: [0.5, 0.45, 0.85] as const, r: [0, 0, -0.5] as const },
    { g: box(0.2, 0.06, 0.05), c: dark, p: [0.34, 0.45, 0.88] as const, r: [0, 0, 0.5] as const },
    { g: sph(0.08, 5, 4), c: 0xf29a8a, p: [-0.7, 0.1, 0.75] as const, s: [1.3, 0.7, 0.6] as const },
    { g: sph(0.08, 5, 4), c: 0xf29a8a, p: [0.7, 0.1, 0.75] as const, s: [1.3, 0.7, 0.6] as const },
    { g: box(0.14, 0.05, 0.05), c: dark, p: [-0.16, -0.12, 1.0] as const, r: [0, 0, 0.5] as const },
    { g: box(0.14, 0.05, 0.05), c: dark, p: [0.16, -0.12, 1.0] as const, r: [0, 0, -0.5] as const },
    { g: cone(0.04, 0.1, 4), c: dark, p: [0, -0.2, 1.0] as const },
  ]);
}

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/**
 * ULAR MELAR, the Chapter 5 mini-boss: a big cartoon snake (one head mesh + one instanced body of 20 balls + a glow + a ground stripe).
 * The body is drawn from two poses: a rearing coil and a straight line along the ground; `ext` (metres the head is out) blends them,
 * so the lunge "melar" stretches the whole body. Pattern, repeated: coil and wiggle (wind-up, a red stripe on the ground shows the
 * line) -> LUNGE along the stripe -> dizzy at the far end (blocked, missed or hit) -> pulls back. While dizzy the head glows and
 * ONLY then does a laser hit take one of the 3 stars. Nothing here hurts for real: a lunge touch is one heart (`Health.hurt`).
 */
export class SnakeBoss {
  readonly x: number;
  readonly z: number;
  stars: number = Combat.snake.stars;
  phase: SnakePhase = 'idle';
  /** False: it only looks around (before the intro, during a scene, after a reset until the child comes back). */
  enabled = false;
  /** The head glows and the laser counts (dizzy window). */
  vulnerable = false;
  /** Metres the head is out along the lunge line (0 = coiled). */
  ext = 0;
  /** Unit direction of the lunge. */
  readonly dir = new THREE.Vector2(0, 1);
  /** World aim point of the head (the laser target). */
  readonly head = new THREE.Vector3();
  /** Test counters. */
  lunges = 0;
  blocked = 0;
  hurtGlen = 0;
  missed = 0;
  laserCounted = 0;
  laserEarly = 0;
  muted = false;

  private readonly group = new THREE.Group();
  private readonly bodyMesh: THREE.InstancedMesh;
  private readonly headMesh: THREE.Mesh;
  private readonly headAngry: THREE.BufferGeometry;
  private readonly headHappy: THREE.BufferGeometry;
  private readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly stripe: THREE.Mesh;
  private readonly stripeMat: THREE.MeshBasicMaterial;
  private readonly bodyGeo: THREE.BufferGeometry;
  private readonly mats: THREE.Material[] = [];
  private readonly target: Target;
  private readonly hud: HTMLDivElement;
  private readonly hudStars: HTMLElement[] = [];
  private readonly easy: boolean;
  private timer = 0;
  private cool = 1.2;
  private t = 0;
  private locked = false;
  private hitGlen = false;
  private dizzyLeft = 0;
  private dizzyKind: DizzyKind = 'miss';
  private squash = 0;
  private scale: number = Combat.snake.scale;
  private slither = -1;
  private slitherDir = new THREE.Vector2(0, 1);
  private lookYaw = 0;
  private disposed = false;
  private puff = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v2 = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly segs: THREE.Vector3[] = [];
  private readonly rad: number[] = [];

  constructor(
    private readonly ctx: LevelContext,
    x: number,
    z: number,
    private readonly hooks: SnakeHooks,
  ) {
    this.x = x;
    this.z = z;
    this.easy = ctx.save.data.settings.easyFight;
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mats.push(lit);
    this.bodyGeo = merge([{ g: sph(1, 9, 6), c: 0xffffff }]);
    this.headAngry = headGeo(false);
    this.headHappy = headGeo(true);
    this.bodyMesh = new THREE.InstancedMesh(this.bodyGeo, lit, N);
    for (let i = 0; i < N; i++) {
      this.bodyMesh.setColorAt(i, this.col.setHex(i % 3 === 1 ? PURPLE : i % 3 === 0 ? GREEN : LIGHT));
      this.segs.push(new THREE.Vector3());
      const u = i / (N - 1);
      this.rad.push(0.62 * (1 - 0.65 * u));
    }
    this.headMesh = new THREE.Mesh(this.headAngry, lit);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xfff08a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.mats.push(this.glowMat);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), this.glowMat);
    this.glow.visible = false;
    this.stripeMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.stripeMat.polygonOffset = true;
    this.stripeMat.polygonOffsetFactor = -2;
    this.mats.push(this.stripeMat);
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, 0, 0.5); // runs from the origin along +z
    this.stripe = new THREE.Mesh(sg, this.stripeMat);
    this.stripe.visible = false;
    this.stripe.renderOrder = 3;
    for (const m of [this.bodyMesh, this.headMesh, this.glow, this.stripe]) {
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    this.group.add(this.bodyMesh, this.headMesh, this.glow, this.stripe);
    ctx.root.add(this.group);

    this.target = ctx.targets.add({
      id: 'ularMelar',
      position: () => this.head,
      radius: Combat.snake.aimRadius,
      enabled: false,
      priority: 1,
      assist: { ...Combat.snake.assist },
      onHit: (h) => this.laserHit(h),
    });

    this.hud = document.createElement('div');
    this.hud.className = 'ch5-stars';
    this.hud.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < Combat.snake.stars; i++) {
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
      this.bodyMesh.dispose();
      this.bodyGeo.dispose();
      this.headAngry.dispose();
      this.headHappy.dispose();
      this.glow.geometry.dispose();
      this.stripe.geometry.dispose();
      for (const m of this.mats) m.dispose();
    });
    this.layout();
  }

  /** The star counter shows while the fight is on. */
  showHud(on: boolean): void {
    this.hud.classList.toggle('show', on);
  }

  private paintHud(): void {
    this.hudStars.forEach((s, i) => s.classList.toggle('lost', i >= this.stars));
    this.hud.dataset.stars = String(this.stars);
  }

  /** Full stars, coiled, waiting (a new fight after "kelelahan", or the first one). */
  reset(): void {
    this.stars = Combat.snake.stars;
    this.phase = 'idle';
    this.vulnerable = false;
    this.ext = 0;
    this.timer = 0;
    this.cool = 1.5;
    this.locked = false;
    this.hitGlen = false;
    this.dizzyLeft = 0;
    this.slither = -1;
    this.scale = Combat.snake.scale;
    this.headMesh.geometry = this.headAngry;
    this.group.visible = true;
    this.stripe.visible = false;
    this.glow.visible = false;
    this.paintHud();
    this.syncTarget();
    this.layout();
  }

  private syncTarget(): void {
    this.target.enabled = this.enabled && this.phase !== 'tamed' && this.phase !== 'gone' && this.phase !== 'beaten';
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.syncTarget();
  }

  private dist(): number {
    const p = this.ctx.player.position;
    return Math.hypot(p.x - this.x, p.z - this.z);
  }

  // ---- fight -------------------------------------------------------------------------------------------------

  private beginWind(): void {
    const p = this.ctx.player.position;
    const d = Math.hypot(p.x - this.x, p.z - this.z) || 1;
    this.dir.set((p.x - this.x) / d, (p.z - this.z) / d);
    this.phase = 'wind';
    this.timer = 0;
    this.locked = false;
    this.hitGlen = false;
    this.puff = 0;
    this.ctx.sfx.blip();
    this.hooks.onEvent('wind');
  }

  private beginLunge(): void {
    this.phase = 'lunge';
    this.timer = 0;
    this.lunges++;
    this.ctx.synth.boing();
  }

  private beginDizzy(kind: DizzyKind): void {
    const C = Combat.snake;
    this.phase = 'dizzy';
    this.dizzyKind = kind;
    const base = kind === 'block' ? C.dizzyBlock : kind === 'hit' ? C.dizzyHit : C.dizzyMiss;
    this.dizzyLeft = base * (this.easy ? C.dizzyEasyMul : 1);
    this.timer = 0;
    this.vulnerable = true;
    this.squash = 1;
    this.stripe.visible = false;
    if (kind === 'miss') this.missed++;
    this.ctx.fx.stars.show(this.head, 1.1 * this.scale, this.dizzyLeft, 0.7);
    this.ctx.sfx.pop();
    this.hooks.onEvent('dizzy');
  }

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
    this.takeStar();
  }

  /** One star goes (a laser hit in the dizzy window; also the test hook). */
  takeStar(): void {
    const { ctx } = this;
    this.stars = Math.max(0, this.stars - 1);
    this.vulnerable = false;
    this.squash = 1;
    this.paintHud();
    const s = this.scale;
    ctx.synth.boing();
    ctx.sfx.bling();
    ctx.fx.stars.show(this.head, 1.1 * s, 1.4, 0.7);
    ctx.fx.sparkles.burst(this.head.x, this.head.y, this.head.z, 22, 3.4, 0xffe14d, { gravity: 2, life: 0.8, up: 0.8 });
    ctx.fx.flashes.spawn(this.head.x, this.head.y, this.head.z, 2.2 * s, 0.5, 0xffd23f);
    this.dizzyLeft = Math.min(this.dizzyLeft, Combat.snake.afterHit);
    if (this.stars <= 0) {
      this.phase = 'beaten';
      this.syncTarget();
    }
    this.hooks.onEvent('dizzy');
    this.hooks.onStar(this.stars);
  }

  /** The lunge hit test: the child is near the stretched body (a line from the coil to the head) and his feet are low. */
  private lungeContact(): void {
    const C = Combat.snake;
    const p = this.ctx.player.position;
    const px = p.x - this.x;
    const pz = p.z - this.z;
    const along = Math.max(0, Math.min(this.ext, px * this.dir.x + pz * this.dir.y));
    const cx = this.dir.x * along;
    const cz = this.dir.y * along;
    if (Math.hypot(px - cx, pz - cz) > C.hitRadius * this.scale) return;
    if (p.y - 0.55 > C.touchTop * this.scale) return;
    // The touch comes from the snake's side (a bit behind the child along the line), so a shield held up toward it blocks.
    const sx = this.x + cx - this.dir.x * 0.7;
    const sz = this.z + cz - this.dir.y * 0.7;
    const r = this.ctx.health.hurt(sx, sz);
    if (r === 'hit') {
      this.hurtGlen++;
      this.hitGlen = true;
      this.hooks.onEvent('hurt');
    } else if (r === 'blocked') {
      this.blocked++;
      this.beginDizzy('block');
      this.hooks.onEvent('blocked');
    }
  }

  fixedUpdate(dt: number): void {
    if (this.disposed) return;
    this.t += dt;
    const C = Combat.snake;
    const { ctx } = this;
    const pl = ctx.player.position;
    this.squash = Math.max(0, this.squash - dt * 2.5);
    const calm = this.muted || !this.enabled || !ctx.game.controlsEnabled || ctx.dialog.active || ctx.health.resting;
    if (this.phase === 'idle' || this.phase === 'beaten' || this.phase === 'tamed') {
      // Looks at the child while coiled.
      const want = Math.atan2(pl.x - this.x, pl.z - this.z);
      this.lookYaw = turnTo(this.lookYaw, want, dt * 2);
    }
    switch (this.phase) {
      case 'idle': {
        this.cool = Math.max(0, this.cool - dt);
        if (!calm && this.cool <= 0 && this.dist() < C.engageRadius) this.beginWind();
        break;
      }
      case 'wind': {
        this.timer += dt;
        const wind = this.easy ? C.windupEasy : C.windup;
        if (this.timer < wind * C.lockShare) {
          const d = this.dist() || 1;
          this.dir.set((pl.x - this.x) / d, (pl.z - this.z) / d);
        } else if (!this.locked) {
          this.locked = true;
          ctx.sfx.blip();
          ctx.fx.flashes.spawn(this.x + this.dir.x * 2, 0.3, this.z + this.dir.y * 2, 1.4, 0.35, 0xff5a4a);
        }
        this.lookYaw = turnTo(this.lookYaw, Math.atan2(this.dir.x, this.dir.y), dt * 6);
        this.puff -= dt;
        if (this.puff <= 0) {
          this.puff = 0.09;
          ctx.fx.sparkles.burst(this.x + (Math.random() - 0.5) * 3, 0.15, this.z + (Math.random() - 0.5) * 3, 2, 1.2, 0xf4f1e8, { gravity: -0.2, life: 0.4, up: 0.3 });
        }
        if (this.timer >= wind) this.beginLunge();
        break;
      }
      case 'lunge': {
        this.timer += dt;
        this.ext = Math.min(C.reach * this.scale, (this.timer / C.lungeTime) * C.reach * this.scale);
        this.lungeContact();
        if (this.phase === 'lunge' && this.ext >= C.reach * this.scale) this.beginDizzy(this.hitGlen ? 'hit' : 'miss');
        break;
      }
      case 'dizzy': {
        this.dizzyLeft -= dt;
        if (this.dizzyLeft <= 0) {
          this.vulnerable = false;
          this.phase = 'retract';
          this.timer = 0;
        }
        break;
      }
      case 'retract': {
        this.timer += dt;
        this.ext = Math.max(0, this.ext - (C.reach * this.scale * dt) / C.retract);
        if (this.ext <= 0) {
          this.phase = 'idle';
          this.cool = this.easy ? C.cooldownEasy : C.cooldown;
        }
        break;
      }
      default:
        break;
    }
  }

  update(dt: number): void {
    if (this.disposed) return;
    if (this.phase === 'gone') return;
    this.layoutAnim(dt);
  }

  private layoutAnim(dt: number): void {
    if (this.slither >= 0) this.slither += dt * 8.5;
    this.layout();
  }

  // ---- drawing -----------------------------------------------------------------------------------------------

  private layout(): void {
    const C = Combat.snake;
    const t = this.t;
    const sc = this.scale;
    const ext = this.ext / sc;
    const wind = this.phase === 'wind' ? Math.min(1, this.timer / (this.easy ? C.windupEasy : C.windup)) : 0;
    const amp = this.phase === 'wind' ? 0.35 + 0.65 * wind : this.phase === 'dizzy' ? 0.25 : 0.12;
    const cy = Math.cos(this.lookYaw);
    const sy = Math.sin(this.lookYaw);
    const dx = this.dir.x;
    const dz = this.dir.y;
    const slither = this.slither;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const sg = this.segs[i];
      let px: number;
      let py: number;
      let pz: number;
      // Coil pose: a rearing spiral, the head over the middle, turned to `lookYaw`.
      const th = 2.2 + u * 9.2 + Math.sin(t * (this.phase === 'wind' ? 17 : 1.6) + u * 7) * 0.13 * amp * 3;
      const rho = (0.5 + 1.45 * u) * (1 + Math.sin(t * (this.phase === 'wind' ? 13 : 1.3) + u * 5) * 0.06 * amp * 2);
      const lx = Math.cos(th) * rho;
      const lz = Math.sin(th) * rho;
      const cxp = lx * cy + lz * sy;
      const czp = -lx * sy + lz * cy;
      const cyp = this.rad[i] + Math.pow(1 - u, 1.4) * 1.9 + Math.sin(t * 2 + u * 3) * 0.04;
      if (slither >= 0) {
        // Slithering away: the head leads along `slitherDir`, the rest follow its track with a wiggle (still coiled behind it).
        const q = slither - u * 1.0 * N * 0.55;
        const wig = Math.sin(q * 1.5 + t * 7) * 0.45;
        if (q >= 0) {
          px = this.slitherDir.x * q - this.slitherDir.y * wig;
          pz = this.slitherDir.y * q + this.slitherDir.x * wig;
          py = this.rad[i] * 0.9;
        } else {
          const k = Math.max(0, 1 + q / 6);
          px = cxp * k;
          pz = czp * k;
          py = this.rad[i] * 0.9 + (cyp - this.rad[i] * 0.9) * k;
        }
      } else {
        // Line pose: the body lies flat along the lunge, the tail stays at the coil.
        const wob = Math.sin(t * 9 + u * 9) * 0.1 * (this.phase === 'dizzy' ? 1 : 0.3);
        const lineD = ext * (1 - u);
        const lxp = dx * lineD - dz * wob;
        const lzp = dz * lineD + dx * wob;
        const w = smooth((ext / 3.2) * 1.6 - u * 0.6);
        px = cxp + (lxp - cxp) * w;
        pz = czp + (lzp - czp) * w;
        py = cyp + (this.rad[i] * 0.9 - cyp) * w;
      }
      sg.set(this.x + px * sc, py * sc, this.z + pz * sc);
    }
    // The head sits on the neck segment, a little forward; its yaw: the lookYaw while coiled, the lunge line when stretched.
    const w0 = slither >= 0 ? 0 : smooth((ext / 3.2) * 1.6);
    const headYaw = slither >= 0 ? Math.atan2(this.slitherDir.x, this.slitherDir.y) : this.lookYaw + (turnTo(this.lookYaw, Math.atan2(dx, dz), 1) - this.lookYaw) * w0;
    let pitch = 0.32 * (1 - w0) + 0.05 * w0;
    let hx = 0;
    let hy = 0.3 * (1 - w0) + 0.2 * w0;
    let hz = 0;
    if (this.phase === 'dizzy' || this.phase === 'beaten') {
      // Dizzy: the head rolls in a slow circle.
      hx = Math.sin(t * 4) * 0.35;
      hz = Math.cos(t * 4) * 0.35;
      pitch += Math.sin(t * 4) * 0.12;
    } else if (this.phase === 'wind') {
      hx = Math.sin(t * 15) * 0.22 * wind;
      pitch += Math.sin(t * 11) * 0.12 * wind;
    }
    const fx = Math.sin(headYaw);
    const fz = Math.cos(headYaw);
    const s0 = this.segs[0];
    const fwd = 0.55 * sc;
    this.head.set(s0.x + fx * fwd + hx * sc, s0.y + hy * sc + 0.45 * sc, s0.z + fz * fwd + hz * sc);
    const sq = 1 + this.squash * 0.18;
    this.e.set(pitch, headYaw, 0);
    this.q.setFromEuler(this.e);
    this.headMesh.position.copy(this.head);
    this.headMesh.quaternion.copy(this.q);
    this.headMesh.scale.set(sc * sq, sc / sq, sc * sq);
    // Body balls (each stretched along the line a little when the body is long).
    for (let i = 0; i < N; i++) {
      const sg = this.segs[i];
      const r = this.rad[i] * sc * (1 + this.squash * 0.06);
      const next = this.segs[Math.min(N - 1, i + 1)];
      const prev = this.segs[Math.max(0, i - 1)];
      const gap = Math.hypot(prev.x - next.x, prev.z - next.z) / 2;
      const along = Math.max(1, gap / Math.max(0.1, r * 0.9));
      const yaw = Math.atan2(prev.x - next.x, prev.z - next.z);
      this.e.set(0, yaw, 0);
      this.q.setFromEuler(this.e);
      this.m4.compose(sg, this.q, this.v2.set(r, r, r * Math.min(2.2, along)));
      this.bodyMesh.setMatrixAt(i, this.m4);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
    // Glow around the head while the laser counts.
    const lit = this.vulnerable && this.phase === 'dizzy';
    this.glow.visible = lit;
    if (lit) {
      const k = 0.5 + 0.5 * Math.sin(t * 9);
      this.glow.position.copy(this.head);
      this.glow.scale.setScalar(sc * (0.8 + 0.12 * k));
      this.glowMat.opacity = 0.2 + 0.2 * k;
    }
    // The ground stripe: from the coil along the (locked) line, as long as the lunge.
    const showStripe = this.phase === 'wind' || this.phase === 'lunge';
    this.stripe.visible = showStripe;
    if (showStripe) {
      const wd = C.stripeWidth * sc;
      this.stripe.position.set(this.x, 0.06, this.z);
      this.stripe.rotation.y = Math.atan2(dx, dz);
      this.stripe.scale.set(wd, 1, C.reach * sc);
      const pulse = 0.5 + 0.5 * Math.sin(t * (this.locked ? 22 : 9));
      this.stripeMat.opacity = this.locked ? 0.55 + 0.25 * pulse : 0.28 + 0.2 * pulse;
      this.stripeMat.color.setHex(this.locked ? 0xff3b2e : 0xff8a6a);
    }
  }

  // ---- story hooks -------------------------------------------------------------------------------------------

  /** Friendly face, shrinks a little (the tamed snake). Resolves when done. */
  async tameLook(): Promise<void> {
    this.phase = 'tamed';
    this.vulnerable = false;
    this.glow.visible = false;
    this.headMesh.geometry = this.headHappy;
    this.syncTarget();
    const { seq } = this.ctx;
    const from = this.scale;
    const startExt = this.ext;
    await seq.tween(1.0, (u) => {
      this.scale = from * (1 - 0.3 * u);
      this.ext = startExt * (1 - u);
    });
    this.ext = 0;
    this.ctx.fx.stars.show(this.head, 1.1 * this.scale, 1.6, 0.7);
    this.ctx.sfx.bling();
  }

  /** Slither off toward `(dirX, dirZ)` for `secs` seconds, then it is gone. */
  async slitherAway(dirX: number, dirZ: number, secs: number): Promise<void> {
    const d = Math.hypot(dirX, dirZ) || 1;
    this.slitherDir.set(dirX / d, dirZ / d);
    this.slither = 0;
    await this.ctx.seq.wait(secs);
    this.phase = 'gone';
    this.group.visible = false;
    this.target.enabled = false;
  }

  /** The head's world position for the camera. */
  get headAt(): THREE.Vector3 {
    return this.head;
  }

  /** Test handle. */
  debug(): Record<string, unknown> {
    return {
      phase: this.phase,
      stars: this.stars,
      vulnerable: this.vulnerable,
      ext: Math.round(this.ext * 100) / 100,
      dir: { x: this.dir.x, z: this.dir.y },
      head: { x: this.head.x, y: this.head.y, z: this.head.z },
      pos: { x: this.x, z: this.z },
      enabled: this.enabled,
      lunges: this.lunges,
      blocked: this.blocked,
      hurtGlen: this.hurtGlen,
      missed: this.missed,
      laserCounted: this.laserCounted,
      laserEarly: this.laserEarly,
      scale: this.scale,
      locked: this.locked,
      stripe: this.stripe.visible,
      glow: this.glow.visible,
      dizzyKind: this.dizzyKind,
      dizzyLeft: Math.round(this.dizzyLeft * 100) / 100,
    };
  }
}

function turnTo(cur: number, target: number, k: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}
