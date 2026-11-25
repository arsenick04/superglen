import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { Combat } from '../../config/combat';
import type { HitInfo, Target } from '../../gameplay/Targets';
import { box, cone, merge, sph } from './ColorMesh';
import { enemyModels } from './EnemyModels';
import { buildGarden } from './SnakeGarden';

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

/**
 * The lunge telegraph: a glowing path on the ground. Soft warm glow, bright edges, little chevrons that run along it towards the far
 * end (where the head will land, a bright cap). Warm yellow while it is only a hint, hot pink once the line is locked.
 */
const STRIPE_VERT = `
attribute float aAlong;
attribute float aAcross;
varying float vAlong;
varying float vAcross;
void main() {
  vAlong = aAlong;
  vAcross = aAcross;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const STRIPE_FRAG = `
uniform float uTime;
uniform float uLock;
uniform float uLen;
uniform float uOpacity;
varying float vAlong;
varying float vAcross;
void main() {
  float c = abs(vAcross - 0.5) * 2.0;
  float edge = smoothstep(0.62, 0.95, c) * (1.0 - smoothstep(0.95, 1.0, c));
  float body = 0.22 + 0.3 * (1.0 - c * c);
  float ph = fract(vAlong * uLen / 1.5 + c * 0.55 - uTime * (1.2 + uLock * 1.6));
  float chev = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.3, 0.46, ph)) * (1.0 - c * 0.25);
  float cap = smoothstep(0.9, 0.985, vAlong) * (1.0 - smoothstep(0.985, 1.0, vAlong)) * 0.5;
  float head = smoothstep(0.0, 0.06, vAlong);
  float a = (body + chev * 0.85 + edge * 0.6 + cap) * head * uOpacity;
  vec3 warm = mix(vec3(1.0, 0.78, 0.3), vec3(1.0, 0.3, 0.42), uLock);
  vec3 col = mix(warm, vec3(1.0, 0.97, 0.85), chev * 0.65 + edge * 0.35);
  gl_FragColor = vec4(col, a);
}`;

/** Camo colours sampled from the model's texture (olive green, mustard yellow, cream belly). */
const CAMO_GREEN = new THREE.Color(0x66804a);
const CAMO_YELLOW = new THREE.Color(0xcaa94e);
const CAMO_BELLY = new THREE.Color(0xdccb94);

/**
 * One body segment of the model snake: a unit sphere painted like the model (green with soft mustard blotches on the back, cream belly),
 * so the chain of stretched segments reads as the same snake as the head. Vertex colours; a blotch is a smooth threshold of a few sines.
 */
export function camoBallGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 14, 10);
  const P = g.getAttribute('position');
  const col = new Float32Array(P.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i);
    const y = P.getY(i);
    const z = P.getZ(i);
    const blot = Math.sin(x * 5.3 + 1.3) * Math.sin(z * 3.1 + 0.7 + y * 2) + 0.55 * Math.sin(y * 6.5 + x * 2);
    const yellow = smooth((blot - 0.35) / 0.35);
    c.copy(CAMO_GREEN).lerp(CAMO_YELLOW, yellow);
    c.lerp(CAMO_BELLY, smooth((-y - 0.25) / 0.35));
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
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
 * ONLY then do laser hits count: `hitsPerStar` of them in one window take one star (5 stars; 3 in easy mode). After 2 stars are lost it lunges
 * twice in a row, after 4 the lunge is a sweep (the stripe and the body bend). Nothing here hurts for real: a lunge touch is one heart (`Health.hurt`).
 */
export class SnakeBoss {
  readonly x: number;
  readonly z: number;
  stars: number;
  /** Stars at the start of a fight (3 in "Mode mudah"). */
  readonly maxStars: number;
  /** Laser hits on the current star in this dizzy window. */
  hitsGot = 0;
  partialHits = 0;
  /** Test counters of the fight pattern. */
  doubles = 0;
  sweeps = 0;
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
  /** True when the head is the owner's model (code animation: roll, wobble, lunge stretch of the camo body). */
  private readonly modelHead: boolean;
  private readonly headAngry: THREE.BufferGeometry;
  private readonly headHappy: THREE.BufferGeometry;
  private readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly stripe: THREE.Mesh;
  private readonly stripeMat: THREE.ShaderMaterial;
  /** The garden around the arena (shown only during the fight). */
  private readonly garden: THREE.Group;
  private removeShadow: (() => void) | null = null;
  private readonly arcStripe: THREE.Mesh;
  private readonly arcPos: THREE.BufferAttribute;
  /** Curvature (1/m) of the lunge now, a second lunge of the double lunge is waiting, wind-up length of this lunge (s). */
  private curve = 0;
  private comboLeft = 0;
  private comboNext = false;
  private windLen = 1;
  private secondLunge = false;
  private side = 1;
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
  private readonly arcOut = { x: 0, z: 0, hx: 0, hz: 0 };
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
    this.maxStars = this.easy ? Combat.snake.starsEasy : Combat.snake.stars;
    this.stars = this.maxStars;
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mats.push(lit);
    // The owner's Ular Melar head (the cut-off head of the model, textured) on a chain of camo balls; procedural head + balls if the file is missing.
    const modelHead = enemyModels.geometry('ular_melar_head', 1.45, true);
    this.bodyGeo = modelHead ? camoBallGeo() : merge([{ g: sph(1, 9, 6), c: 0xffffff }]);
    this.headAngry = modelHead ?? headGeo(false);
    this.headHappy = modelHead ?? headGeo(true);
    this.modelHead = !!modelHead;
    this.bodyMesh = new THREE.InstancedMesh(this.bodyGeo, lit, N);
    for (let i = 0; i < N; i++) {
      this.bodyMesh.setColorAt(i, this.col.setHex(modelHead ? 0xffffff : i % 3 === 1 ? PURPLE : i % 3 === 0 ? GREEN : LIGHT));
      this.segs.push(new THREE.Vector3());
      const u = i / (N - 1);
      this.rad.push(modelHead ? 0.6 * (1 - 0.45 * u) : 0.62 * (1 - 0.65 * u));
    }
    this.headMesh = new THREE.Mesh(this.headAngry, modelHead ? (enemyModels.material('ular_melar_head') as THREE.Material) : lit);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xfff08a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.mats.push(this.glowMat);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), this.glowMat);
    this.glow.visible = false;
    this.stripeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLock: { value: 0 }, uLen: { value: 10 }, uOpacity: { value: 0.5 } },
      vertexShader: STRIPE_VERT,
      fragmentShader: STRIPE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mats.push(this.stripeMat);
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, 0, 0.5); // runs from the origin along +z
    {
      const sp = sg.getAttribute('position');
      const al = new Float32Array(sp.count);
      const ac = new Float32Array(sp.count);
      for (let i = 0; i < sp.count; i++) {
        al[i] = sp.getZ(i);
        ac[i] = sp.getX(i) + 0.5;
      }
      sg.setAttribute('aAlong', new THREE.BufferAttribute(al, 1));
      sg.setAttribute('aAcross', new THREE.BufferAttribute(ac, 1));
    }
    this.stripe = new THREE.Mesh(sg, this.stripeMat);
    this.stripe.visible = false;
    this.stripe.renderOrder = 3;
    // The bent stripe of the sweep: a strip of 16 quads whose vertices are written every frame while it shows.
    const ASEG = 16;
    const ag = new THREE.BufferGeometry();
    this.arcPos = new THREE.BufferAttribute(new Float32Array((ASEG + 1) * 2 * 3), 3);
    ag.setAttribute('position', this.arcPos);
    {
      const al = new Float32Array((ASEG + 1) * 2);
      const ac = new Float32Array((ASEG + 1) * 2);
      for (let i = 0; i <= ASEG; i++) {
        al[i * 2] = al[i * 2 + 1] = i / ASEG;
        ac[i * 2] = 0;
        ac[i * 2 + 1] = 1;
      }
      ag.setAttribute('aAlong', new THREE.BufferAttribute(al, 1));
      ag.setAttribute('aAcross', new THREE.BufferAttribute(ac, 1));
    }
    const idx: number[] = [];
    for (let i = 0; i < ASEG; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    ag.setIndex(idx);
    this.arcStripe = new THREE.Mesh(ag, this.stripeMat);
    this.arcStripe.visible = false;
    this.arcStripe.renderOrder = 3;
    for (const m of [this.bodyMesh, this.headMesh, this.glow, this.stripe, this.arcStripe]) {
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    this.group.add(this.bodyMesh, this.headMesh, this.glow, this.stripe, this.arcStripe);
    ctx.root.add(this.group);
    // A themed garden around the fight (hidden until the fight starts).
    this.garden = buildGarden(x, z, 15);
    this.garden.visible = false;
    ctx.root.add(this.garden);

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
      this.bodyMesh.dispose();
      this.bodyGeo.dispose();
      this.headAngry.dispose();
      if (this.headHappy !== this.headAngry) this.headHappy.dispose();
      this.glow.geometry.dispose();
      this.stripe.geometry.dispose();
      this.arcStripe.geometry.dispose();
      for (const m of this.mats) m.dispose();
    });
    this.layout();
  }

  /** The star counter shows while the fight is on. */
  showHud(on: boolean): void {
    this.hud.classList.toggle('show', on);
    this.garden.visible = on;
    this.removeShadow?.();
    this.removeShadow = null;
    if (on) {
      const sh = { x: 0, y: 0, z: 0, r: 1, a: 1 };
      this.removeShadow = this.ctx.battle?.bfx?.addShadow(() => {
        if (this.phase === 'gone' || this.phase === 'tamed') return null;
        sh.x = this.head.x;
        sh.z = this.head.z;
        sh.r = 1.25 * this.scale * (0.85 + 0.15 * Math.max(0, 1 - this.head.y / 4));
        return sh;
      }) ?? null;
    }
  }

  private paintHud(): void {
    this.hudStars.forEach((s, i) => {
      s.classList.toggle('lost', i >= this.stars);
      // A star with one of its hits already taken shows half faded.
      s.classList.toggle('half', i === this.stars - 1 && this.hitsGot > 0);
    });
    this.hud.dataset.stars = String(this.stars);
  }

  /** Full stars, coiled, waiting (a new fight after "kelelahan", or the first one). */
  reset(): void {
    this.stars = this.maxStars;
    this.hitsGot = 0;
    this.curve = 0;
    this.comboLeft = 0;
    this.comboNext = false;
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
    this.arcStripe.visible = false;
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

  /** Point and heading of the lunge line at distance d from the coil (a straight line, or an arc of constant curvature). */
  private arcAt(d: number): void {
    const o = this.arcOut;
    const k = this.curve;
    if (k === 0) {
      o.x = this.dir.x * d;
      o.z = this.dir.y * d;
      o.hx = this.dir.x;
      o.hz = this.dir.y;
      return;
    }
    const f0 = Math.atan2(this.dir.x, this.dir.y);
    const f1 = f0 + k * d;
    o.x = (Math.cos(f0) - Math.cos(f1)) / k;
    o.z = (Math.sin(f1) - Math.sin(f0)) / k;
    o.hx = Math.sin(f1);
    o.hz = Math.cos(f1);
  }

  private dist(): number {
    const p = this.ctx.player.position;
    return Math.hypot(p.x - this.x, p.z - this.z);
  }

  // ---- fight -------------------------------------------------------------------------------------------------

  /** Stars lost so far. */
  private get lost(): number {
    return this.maxStars - this.stars;
  }

  /** Direction of the lunge toward the child; a sweep starts turned away by half its bend so that it ends at him. */
  private aimDir(): void {
    const p = this.ctx.player.position;
    const a = Math.atan2(p.x - this.x, p.z - this.z) - (this.curve * Combat.snake.reach * this.scale) / 2;
    this.dir.set(Math.sin(a), Math.cos(a));
  }

  private beginWind(second = false): void {
    const C = Combat.snake;
    if (!second) {
      // Harder patterns of the later stars (normal mode only).
      this.comboLeft = !this.easy && this.lost >= C.doubleAfter ? 1 : 0;
      this.curve = !this.easy && this.lost >= C.sweepAfter ? C.sweepCurve * this.side : 0;
      this.side = -this.side;
      if (this.comboLeft > 0) this.doubles++;
      if (this.curve !== 0) this.sweeps++;
    }
    this.secondLunge = second;
    this.windLen = second ? C.doubleWind : this.easy ? C.windupEasy : C.windup;
    this.comboNext = false;
    this.aimDir();
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
    this.ctx.battle.shake(0.1, 0.25);
  }

  private beginDizzy(kind: DizzyKind): void {
    const C = Combat.snake;
    this.phase = 'dizzy';
    this.dizzyKind = kind;
    const base = kind === 'block' ? C.dizzyBlock : kind === 'hit' ? C.dizzyHit : C.dizzyMiss;
    this.dizzyLeft = base * (this.easy ? C.dizzyEasyMul : 1);
    this.comboLeft = 0;
    this.comboNext = false;
    this.hitsGot = 0;
    this.paintHud();
    this.timer = 0;
    this.vulnerable = true;
    this.squash = 1;
    this.stripe.visible = false;
    if (kind === 'miss') this.missed++;
    this.ctx.fx.stars.show(this.head, 1.1 * this.scale, this.dizzyLeft, 0.7);
    this.ctx.sfx.pop();
    this.ctx.battle?.bfx?.dust(this.head.x, 0, this.head.z, 1.2, 0xe9e2c0);
    this.ctx.battle?.bfx?.ring(this.head.x, 0.5, this.head.z, 2.2 * this.scale, 0.5, 0xffe9a0, 0.8);
    this.hooks.onEvent('dizzy');
  }

  private laserHit(h: HitInfo): void {
    if (!this.enabled) return;
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
    if (this.hitsGot >= (this.easy ? Combat.snake.hitsPerStarEasy : Combat.snake.hitsPerStar)) this.takeStar();
    else this.halfHit();
  }

  /** The first of two hits: a bonk and sparkles, the star shows half, the window stays open a little longer for the second. */
  private halfHit(): void {
    const { ctx } = this;
    this.partialHits++;
    this.squash = 1;
    this.dizzyLeft = Math.max(this.dizzyLeft, Combat.snake.partialKeep);
    this.paintHud();
    ctx.synth.boing();
    ctx.sfx.pop();
    ctx.fx.sparkles.burst(this.head.x, this.head.y, this.head.z, 12, 2.6, 0xffe14d, { gravity: 2, life: 0.6, up: 0.6 });
    ctx.fx.flashes.spawn(this.head.x, this.head.y, this.head.z, 1.4 * this.scale, 0.4, 0xffd23f);
  }

  /** One star goes (a laser hit in the dizzy window; also the test hook). */
  takeStar(): void {
    const { ctx } = this;
    this.stars = Math.max(0, this.stars - 1);
    this.hitsGot = 0;
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
    let cx: number;
    let cz: number;
    let hx = this.dir.x;
    let hz = this.dir.y;
    if (this.curve === 0) {
      const along = Math.max(0, Math.min(this.ext, px * this.dir.x + pz * this.dir.y));
      cx = this.dir.x * along;
      cz = this.dir.y * along;
    } else {
      // A bent body: the nearest of a few points along the arc.
      let best = Infinity;
      cx = 0;
      cz = 0;
      for (let d = 0; ; d += 0.75) {
        const dd = Math.min(d, this.ext);
        this.arcAt(dd);
        const dist = Math.hypot(px - this.arcOut.x, pz - this.arcOut.z);
        if (dist < best) {
          best = dist;
          cx = this.arcOut.x;
          cz = this.arcOut.z;
          hx = this.arcOut.hx;
          hz = this.arcOut.hz;
        }
        if (dd >= this.ext) break;
      }
    }
    if (Math.hypot(px - cx, pz - cz) > C.hitRadius * this.scale) return;
    if (p.y - 0.55 > C.touchTop * this.scale) return;
    // The touch comes from the snake's side (a bit behind the child along the line), so a shield held up toward it blocks.
    const sx = this.x + cx - hx * 0.7;
    const sz = this.z + cz - hz * 0.7;
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
    const calm = this.muted || !this.enabled || !ctx.game.controlsEnabled || ctx.dialog.blocking || ctx.health.resting;
    if (this.phase === 'idle' || this.phase === 'beaten' || this.phase === 'tamed') {
      // Looks at the child while coiled.
      const want = Math.atan2(pl.x - this.x, pl.z - this.z);
      this.lookYaw = turnTo(this.lookYaw, want, dt * 2);
    }
    if (!this.enabled) return; // pause an unfinished lunge/dizzy window while outside battle or in its entrance
    switch (this.phase) {
      case 'idle': {
        this.cool = Math.max(0, this.cool - dt);
        if (!calm && this.cool <= 0 && this.dist() < C.engageRadius) this.beginWind();
        break;
      }
      case 'wind': {
        this.timer += dt;
        const wind = this.windLen;
        if (this.timer < wind * (this.secondLunge ? C.doubleLockShare : C.lockShare)) {
          this.aimDir();
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
        if (this.phase === 'lunge' && this.ext >= C.reach * this.scale) {
          if (!this.hitGlen && this.comboLeft > 0) {
            // The double lunge: a quick pull back, then the second stripe.
            this.comboLeft--;
            this.comboNext = true;
            this.phase = 'retract';
            this.timer = 0;
          } else this.beginDizzy(this.hitGlen ? 'hit' : 'miss');
        }
        break;
      }
      case 'dizzy': {
        this.dizzyLeft -= dt;
        if (this.dizzyLeft <= 0) {
          this.vulnerable = false;
          this.hitsGot = 0;
          this.paintHud();
          this.phase = 'retract';
          this.timer = 0;
        }
        break;
      }
      case 'retract': {
        this.timer += dt;
        this.ext = Math.max(0, this.ext - (C.reach * this.scale * dt) / (this.comboNext ? C.doubleRetract : C.retract));
        if (this.ext <= 0) {
          if (this.comboNext) this.beginWind(true);
          else {
            this.phase = 'idle';
            this.cool = this.easy ? C.cooldownEasy : C.cooldown;
          }
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
    const wind = this.phase === 'wind' ? Math.min(1, this.timer / this.windLen) : 0;
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
        this.arcAt(lineD);
        const lxp = this.arcOut.x - dz * wob;
        const lzp = this.arcOut.z + dx * wob;
        const w = smooth((ext / 3.2) * 1.6 - u * 0.6);
        px = cxp + (lxp - cxp) * w;
        pz = czp + (lzp - czp) * w;
        py = cyp + (this.rad[i] * 0.9 - cyp) * w;
      }
      sg.set(this.x + px * sc, py * sc, this.z + pz * sc);
    }
    // The head sits on the neck segment, a little forward; its yaw: the lookYaw while coiled, the lunge line when stretched.
    const w0 = slither >= 0 ? 0 : smooth((ext / 3.2) * 1.6);
    const lineYaw = Math.atan2(dx, dz) + this.curve * ext;
    const headYaw = slither >= 0 ? Math.atan2(this.slitherDir.x, this.slitherDir.y) : this.lookYaw + (turnTo(this.lookYaw, lineYaw, 1) - this.lookYaw) * w0;
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
    this.e.order = 'YXZ';
    let roll = 0;
    if (this.modelHead) {
      // Static model: tilt it by code. Dizzy: the head droops and rolls; wind-up: it rocks like a rattle; lunge: it stays level.
      if (this.phase === 'dizzy' || this.phase === 'beaten') roll = Math.sin(t * 4 + 1) * 0.35;
      else if (this.phase === 'wind') roll = Math.sin(t * 24) * 0.1 * wind;
      else roll = Math.sin(t * 1.6) * 0.04;
    }
    this.e.set(pitch, headYaw, roll);
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
      const along = Math.max(1, (this.modelHead ? gap * 1.2 : gap) / Math.max(0.1, r * 0.9));
      const yaw = Math.atan2(prev.x - next.x, prev.z - next.z);
      this.e.set(0, yaw, 0);
      this.q.setFromEuler(this.e);
      this.m4.compose(sg, this.q, this.v2.set(r, r, r * Math.min(this.modelHead ? 6 : 2.2, along)));
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
    const bent = showStripe && this.curve !== 0;
    this.stripe.visible = showStripe && !bent;
    this.arcStripe.visible = bent;
    if (bent) {
      const wd = C.stripeWidth * sc * 0.5;
      const n = this.arcPos.count / 2;
      for (let i = 0; i < n; i++) {
        this.arcAt((C.reach * sc * i) / (n - 1));
        const o = this.arcOut;
        this.arcPos.setXYZ(i * 2, this.x + o.x - o.hz * wd, 0.06, this.z + o.z + o.hx * wd);
        this.arcPos.setXYZ(i * 2 + 1, this.x + o.x + o.hz * wd, 0.06, this.z + o.z - o.hx * wd);
      }
      this.arcPos.needsUpdate = true;
    }
    if (showStripe) {
      const wd = C.stripeWidth * sc;
      this.stripe.position.set(this.x, 0.06, this.z);
      this.stripe.rotation.y = Math.atan2(dx, dz);
      this.stripe.scale.set(wd, 1, C.reach * sc);
      const pulse = 0.5 + 0.5 * Math.sin(t * (this.locked ? 16 : 7));
      const u = this.stripeMat.uniforms;
      u.uTime.value = t;
      u.uLock.value += ((this.locked ? 1 : 0) - u.uLock.value) * 0.25;
      u.uLen.value = C.reach * sc;
      u.uOpacity.value = this.locked ? 0.8 + 0.2 * pulse : 0.55 + 0.15 * pulse;
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
      stripe: this.stripe.visible || this.arcStripe.visible,
      maxStars: this.maxStars,
      hitsGot: this.hitsGot,
      partialHits: this.partialHits,
      doubles: this.doubles,
      sweeps: this.sweeps,
      curve: this.curve,
      comboLeft: this.comboLeft,
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
