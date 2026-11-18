import * as THREE from 'three';
import type { LevelContext } from '../Level';
import type { Target } from '../../gameplay/Targets';
import { clampToStreets, MARKET, RATS, type FoodKind, type RatSpec } from './Bab3Data';
import { box, cone, cyl, merge, sph } from './ColorMesh';
import { Combat, CombatRng } from '../../config/combat';
import type { HitInfo } from '../../gameplay/Targets';
import { personGeo } from './CityPeople';
import { enemyModels } from './EnemyModels';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { headContactTime, type FeetPoint } from '../../player/HeadStomp';

/** Numbers of the little rats in one place (all gentle: slow, and they never come at the child). */
export const RatConfig = {
  /** Walking speed around the loop (m/s). */
  loopSpeed: 1.3,
  /** The rat runs from a player closer than this (m) ... */
  fleeRadius: 6.5,
  /** ... at this speed (m/s) when the child is `fleeFar` away, slowing to `fleeNear` right next to it (a scared rat dithers, so a
   * landing stomp beside it still reaches it); the child runs at 5 to 6. */
  fleeSpeed: 2.4,
  fleeNear: 0.7,
  fleeSlowFrom: 2.5,
  fleeFastAt: 5.5,
  /** It goes back to its loop when the player is farther than this (m). */
  calmRadius: 12,
  returnSpeed: 2.2,
  /** Dizzy hop after a hit (s), then it runs to the drain at this speed (m/s). */
  dizzyTime: 0.9,
  drainSpeed: 6.5,
  /** Aim / hit radius for the laser (m): generous. */
  aimRadius: 0.95,
  /** A fallen food is taken inside this horizontal radius, and from `below` under to `above` over the player's feet (m). */
  takeRadius: 1.4,
  below: 2.2,
  above: 0.8,
  /** Everything of the market is hidden (not drawn) when the player is farther than this from the crossing (m). */
  showRadius: 130,
} as const;

const GROUND = 0;
const ST_LOOP = 0;
const ST_WIND = 1; // telegraph: shaking, puffs, an arrow on the ground
const ST_CHARGE = 2;
const ST_RECOVER = 3; // panting after an attack: easy to hit
const ST_BACK = 4;
const ST_STUN = 5; // hit but not tamed yet: dizzy for a moment
const ST_DIZZY = 6; // tamed: spin, stars, drop the food
const ST_RUN = 7;
const ST_GONE = 8;
const K_CHARGE = 0;
const K_CRUMB = 1;

const F_CARRIED = 0;
const F_FLY = 1;
const F_GROUND = 2;
const F_RETURN = 3;
const F_GONE = 4;

const FOOD_COLOR: Record<FoodKind, number> = { bakpao: 0xffffff, kue: 0xffa6c9, sayur: 0xff9a2e };
/** Per-kind shape of the same bun geometry (x z size, y size): a round bakpao, a flat wide kue, a long thin carrot-ish bun. */
const FOOD_SHAPE: Record<FoodKind, readonly [number, number]> = { bakpao: [1, 1], kue: [1.25, 0.65], sayur: [0.7, 1.3] };

export function ratGeo(fur = 0xa3a9bd, belly = false): THREE.BufferGeometry {
  const pink = 0xf5a3b5;
  const dark = 0x2b1a12;
  return merge([
    ...(belly ? [{ g: sph(0.3, 8, 6), c: 0xe9d6c4, p: [0, 0.27, 0.12] as const, s: [1.05, 0.95, 1.1] as const }] : []),
    { g: sph(0.26, 8, 6), c: fur, p: [0, 0.27, 0], s: [0.9, 0.8, 1.3] },
    { g: sph(0.19, 8, 6), c: fur, p: [0, 0.36, 0.3] },
    { g: sph(0.07, 6, 4), c: pink, p: [0, 0.33, 0.47] },
    { g: sph(0.13, 7, 5), c: fur, p: [-0.15, 0.55, 0.24], s: [1, 1, 0.4] },
    { g: sph(0.13, 7, 5), c: fur, p: [0.15, 0.55, 0.24], s: [1, 1, 0.4] },
    { g: sph(0.085, 6, 4), c: pink, p: [-0.15, 0.55, 0.275], s: [1, 1, 0.4] },
    { g: sph(0.085, 6, 4), c: pink, p: [0.15, 0.55, 0.275], s: [1, 1, 0.4] },
    { g: sph(0.035, 5, 4), c: dark, p: [-0.075, 0.41, 0.45] },
    { g: sph(0.035, 5, 4), c: dark, p: [0.075, 0.41, 0.45] },
    // Curut Cemberut: a cute-grumpy frown (angled brows, down-turned mouth).
    { g: box(0.09, 0.022, 0.03), c: dark, p: [-0.08, 0.465, 0.445], r: [0, 0, -0.5] },
    { g: box(0.09, 0.022, 0.03), c: dark, p: [0.08, 0.465, 0.445], r: [0, 0, 0.5] },
    { g: box(0.05, 0.016, 0.02), c: dark, p: [-0.03, 0.29, 0.462], r: [0, 0, 0.55] },
    { g: box(0.05, 0.016, 0.02), c: dark, p: [0.03, 0.29, 0.462], r: [0, 0, -0.55] },
    { g: cyl(0.025, 0.04, 0.55, 5), c: pink, p: [0, 0.2, -0.5], r: [-1.2, 0, 0] },
    { g: sph(0.06, 5, 4), c: fur, p: [-0.13, 0.06, 0.2] },
    { g: sph(0.06, 5, 4), c: fur, p: [0.13, 0.06, 0.2] },
    { g: sph(0.06, 5, 4), c: fur, p: [-0.13, 0.06, -0.15] },
    { g: sph(0.06, 5, 4), c: fur, p: [0.13, 0.06, -0.15] },
  ]);
}

/** Flat arrow on the ground (XZ plane, pointing +z, from the origin to 2.4 m): the charge telegraph. */
export function arrowGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pts = [-0.22, 0, 0, 0.22, 0, 0, 0.22, 0, 1.5, -0.22, 0, 0, 0.22, 0, 1.5, -0.22, 0, 1.5, -0.55, 0, 1.5, 0.55, 0, 1.5, 0, 0, 2.4];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]); // the material is double sided
  return g;
}

/** A small heart (two bumps and a point), for the hit points above a rat. */
export function pipGeo(): THREE.BufferGeometry {
  return merge([
    { g: sph(0.07, 5, 3), c: 0xffffff, p: [-0.055, 0.03, 0] },
    { g: sph(0.07, 5, 3), c: 0xffffff, p: [0.055, 0.03, 0] },
    { g: cone(0.1, 0.17, 4), c: 0xffffff, p: [0, -0.06, 0], r: [0, 0, Math.PI] },
  ]);
}

/** A soft steamed bun: white (the tint comes from the instance colour), a little knot on top. */
function foodGeo(): THREE.BufferGeometry {
  return merge([
    { g: sph(0.2, 8, 6), c: 0xffffff, p: [0, 0.17, 0], s: [1, 0.85, 1] },
    { g: sph(0.05, 5, 4), c: 0xf3e6d2, p: [0, 0.35, 0] },
  ]);
}

/** Bu Lina (the vendor) and the storm drains, merged in world coordinates into ONE mesh. */
function propsGeo(): THREE.BufferGeometry {
  const v = MARKET.vendor;
  const pg = personGeo(0xe95b7a, 0x3a2a22);
  pg.rotateY(v.yaw);
  pg.translate(v.x, 0, v.z);
  const list: THREE.BufferGeometry[] = [pg];
  for (const d of MARKET.drains) {
    list.push(
      merge([
        { g: cyl(0.85, 0.85, 0.05, 10), c: 0x353a45, p: [d.x, 0.03, d.z] },
        { g: box(1.5, 0.03, 0.1), c: 0x8d94a3, p: [d.x, 0.07, d.z - 0.3] },
        { g: box(1.5, 0.03, 0.1), c: 0x8d94a3, p: [d.x, 0.07, d.z] },
        { g: box(1.5, 0.03, 0.1), c: 0x8d94a3, p: [d.x, 0.07, d.z + 0.3] },
      ]),
    );
  }
  const m = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!m) throw new Error('MarketRats: merge failed');
  m.computeBoundingSphere();
  return m;
}

export interface RatHooks {
  /** A rat was tamed (index, what it carried). */
  onTamed(i: number, food: FoodKind): void;
  /** A bakpao or kue was picked up. */
  onCollect(kind: FoodKind): void;
}

/**
 * The seven Curut Cemberut (small rats) of Chapter 3 and what they carry, plus Bu Lina and the drains. Everything is cute and slow: a rat circles
 * on the market street, trots away from a close child (never toward), and is tamed by ONE laser hit or a landing stomp: it
 * spins dizzily with stars, a soft "boing", drops its food and runs down a drain (nobody gets hurt, nothing dies). Draw calls:
 * rats (1 instanced), food (1 instanced), props (1 merged); no shadows.
 */
export class MarketRats {
  readonly n = RATS.length;
  private readonly st = new Uint8Array(this.n);
  private readonly rx = new Float32Array(this.n);
  private readonly rz = new Float32Array(this.n);
  private readonly yaw = new Float32Array(this.n);
  private readonly ang = new Float32Array(this.n);
  private readonly timer = new Float32Array(this.n);
  private readonly drain = new Uint8Array(this.n);
  // The fight: hit points, attack kind and timers, locked charge direction, a sideways slide (dodge), hit squash.
  private readonly hp = new Uint8Array(this.n);
  private readonly cool = new Float32Array(this.n);
  private readonly kind = new Uint8Array(this.n);
  private readonly dirX = new Float32Array(this.n);
  private readonly dirZ = new Float32Array(this.n);
  private readonly slX = new Float32Array(this.n);
  private readonly slZ = new Float32Array(this.n);
  private readonly squash = new Float32Array(this.n);
  private readonly puff = new Float32Array(this.n);
  private gap = 0;
  /** Test: no rat starts an attack by itself. */
  muted = false;
  private readonly hpMax: number;
  private readonly easy: boolean;
  /** A second rat that joins the attack of the first one (index, seconds until it starts); -1 none. */
  private assistIdx = -1;
  private assistT = 0;
  private assisting = false;
  private readonly windup: number;
  private readonly cooldown: number;
  private readonly pipMesh: THREE.InstancedMesh;
  /** True when the rats are the Curut Cemberut model (code animation: lean, waddle, shake), false for the procedural bun rat. */
  private readonly ratModel: boolean;
  private readonly headY: number;
  private headCandidate = -1;
  private readonly arrowMesh: THREE.InstancedMesh;
  // Foods (index = the rat that carried it).
  private readonly fs = new Uint8Array(this.n);
  private readonly fx = new Float32Array(this.n);
  private readonly fy = new Float32Array(this.n);
  private readonly fz = new Float32Array(this.n);
  private readonly f0x = new Float32Array(this.n);
  private readonly f0z = new Float32Array(this.n);
  private readonly ft = new Float32Array(this.n);
  private readonly aim: THREE.Vector3[] = [];
  private readonly targets: Target[] = [];
  private readonly ratMesh: THREE.InstancedMesh;
  private readonly foodMesh: THREE.InstancedMesh;
  private readonly props: THREE.Mesh;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly ax = new THREE.Vector3(1, 0, 0);
  private readonly az = new THREE.Vector3(0, 0, 1);
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly tmp = { x: 0, z: 0 };
  private readonly up = new THREE.Vector3(0, 1, 0);
  private t = 0;
  private disposed = false;
  private shown = true;
  /** Bakpao and kue picked up so far (this session). */
  readonly collected: Record<FoodKind, number> = { bakpao: 0, kue: 0, sayur: 0 };
  /** Counters for tests. */
  tamedCount = 0;
  stomps = 0;
  headStomps = 0;
  lasers = 0;
  /** Fight counters for tests. */
  hitsTaken = 0; // rat hits that did not tame
  attacks = 0;
  charges = 0;
  crumbs = 0;
  dodges = 0;
  blocked = 0;
  hurtGlen = 0;
  /** Foods that lie on the ground now (bakpao and kue only). */
  get dropped(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.fs[i] === F_GROUND && this.specs[i].food !== 'sayur') c++;
    return c;
  }

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: RatHooks,
    tamed: readonly number[],
    private readonly specs: readonly RatSpec[] = RATS,
    private readonly scenery = true,
  ) {
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mats.push(lit);
    // The owner's Curut Cemberut model (light copy: up to 8 rats at once) at the old rat's height; the procedural bun rat if it is missing.
    const procRat = ratGeo();
    procRat.computeBoundingBox();
    const ratH = (procRat.boundingBox as THREE.Box3).max.y;
    this.headY = GROUND + ratH * Combat.rat.scale * Combat.rat.headStomp.heightShare;
    const modelRat = enemyModels.geometry('curut_cemberut_lo', ratH);
    const rg = modelRat ?? procRat;
    if (modelRat) procRat.dispose();
    this.ratModel = !!modelRat;
    const ratMat = modelRat ? (enemyModels.material('curut_cemberut_lo') as THREE.Material) : lit;
    const fg = foodGeo();
    const pg = propsGeo();
    this.geos.push(rg, fg, pg);
    const easy = ctx.save.data.settings.easyFight;
    this.easy = easy;
    this.hpMax = easy ? Combat.rat.hpEasy : Combat.rat.hp;
    this.windup = easy ? Combat.rat.windupEasy : Combat.rat.windup;
    this.cooldown = easy ? Combat.rat.cooldownEasy : Combat.rat.cooldown;
    const ag = arrowGeo();
    const pgp = pipGeo();
    this.geos.push(ag, pgp);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, fog: false });
    arrowMat.polygonOffset = true;
    arrowMat.polygonOffsetFactor = -2;
    this.mats.push(arrowMat);
    this.arrowMesh = new THREE.InstancedMesh(ag, arrowMat, this.n);
    this.pipMesh = new THREE.InstancedMesh(pgp, lit, this.n * this.hpMax);
    this.arrowMesh.renderOrder = 3;
    this.ratMesh = new THREE.InstancedMesh(rg, ratMat, this.n);
    this.foodMesh = new THREE.InstancedMesh(fg, lit, this.n);
    this.props = new THREE.Mesh(pg, lit);
    for (const m of [this.ratMesh, this.foodMesh, this.arrowMesh, this.pipMesh]) {
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    this.props.castShadow = false;
    this.props.receiveShadow = false;
    // A first (hidden) colour per food so instanceColor exists when the shader program is built.
    for (let i = 0; i < this.n; i++) this.foodMesh.setColorAt(i, this.col.setHex(FOOD_COLOR[this.specs[i].food]));
    for (let k = 0; k < this.n * this.hpMax; k++) this.pipMesh.setColorAt(k, this.col.setHex(0xff4d6d));
    ctx.root.add(this.ratMesh, this.foodMesh, this.props, this.arrowMesh, this.pipMesh);

    const done = new Set(tamed);
    for (let i = 0; i < this.n; i++) {
      const r = this.specs[i];
      this.ang[i] = (i * 2.1) % (Math.PI * 2);
      this.aim.push(new THREE.Vector3());
      this.setLoopPos(i);
      this.targets.push(
        ctx.targets.add({
          id: `rat${i}`,
          position: () => this.aim[i],
          radius: RatConfig.aimRadius,
          assist: { range: Combat.laser.assistRange, near: Combat.laser.nearDist, nearConeDeg: Combat.laser.nearConeDeg, farConeDeg: Combat.laser.farConeDeg },
          onHit: (h) => this.laserHit(i, h),
        }),
      );
      this.fs[i] = F_CARRIED;
      this.hp[i] = this.hpMax;
      this.cool[i] = 1 + (i % 3) * 0.7;
      if (done.has(i)) {
        // Tamed in an earlier session: the rat is gone, its bakpao / kue lie where its loop is.
        this.st[i] = ST_GONE;
        this.targets[i].enabled = false;
        this.tamedCount++;
        if (r.food === 'sayur') this.fs[i] = F_GONE;
        else {
          this.fs[i] = F_GROUND;
          this.fx[i] = r.cx + 1.2;
          this.fz[i] = r.cz + 0.8;
          this.fy[i] = GROUND;
        }
      }
    }
    // Landing stomps tame a rat inside the stomp radius (Superglen).
    ctx.player.onStomp((e) => {
      if (this.disposed) return;
      for (let i = 0; i < this.n; i++) {
        if (this.st[i] >= ST_DIZZY) continue;
        if (Math.hypot(this.rx[i] - e.x, this.rz[i] - e.z) < e.radius + 0.4 && Math.abs(e.y - GROUND) < 3) {
          this.stomps++;
          this.hit(i); // a stomp counts as one hit
        }
      }
    });
    const removeHeadStomp = ctx.player.registerHeadStomp({
      contactTime: (from, to) => this.headContact(from, to),
      stomp: () => {
        this.headStomps++;
        this.stomps++;
        this.hit(this.headCandidate);
      },
    });
    ctx.onDispose(() => {
      this.disposed = true;
      removeHeadStomp();
      for (const g of this.geos) g.dispose();
      for (const m of this.mats) m.dispose();
      this.ratMesh.dispose();
      this.foodMesh.dispose();
      this.arrowMesh.dispose();
      this.pipMesh.dispose();
    });
    this.writeMatrices();
  }

  private headContact(from: FeetPoint, to: FeetPoint): number {
    this.headCandidate = -1;
    const { ctx } = this;
    if (this.disposed || !this.shown || !ctx.game.controlsEnabled || ctx.dialog.blocking || ctx.health.resting) return Infinity;
    let first = Infinity;
    for (let i = 0; i < this.n; i++) {
      if (this.st[i] >= ST_DIZZY || this.hp[i] === 0) continue;
      const t = headContactTime(from, to, this.rx[i], this.headY, this.rz[i], Combat.rat.headStomp.radius);
      if (t < first) {
        first = t;
        this.headCandidate = i;
      }
    }
    return first;
  }

  /** Test helper: `{ i, state, x, z, food, fstate }`. */
  list(): { i: number; state: number; x: number; z: number; food: FoodKind; fstate: number; fx: number; fz: number; hp: number; kind: number }[] {
    return this.specs.map((r, i) => ({ i, state: this.st[i], x: this.rx[i], z: this.rz[i], food: r.food, fstate: this.fs[i], fx: this.fx[i], fz: this.fz[i], hp: this.hp[i], kind: this.kind[i] }));
  }

  /** Rats not yet tamed. */
  get remaining(): number {
    return this.n - this.tamedCount;
  }

  /** All seven are tamed (the chase is won). */
  get allTamed(): boolean {
    return this.tamedCount >= this.n;
  }

  /** Horizontal distance from (x, z) to the nearest rat that is still around (Infinity: none). */
  nearestRat(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < this.n; i++) {
      if (this.st[i] >= ST_DIZZY) continue;
      best = Math.min(best, Math.hypot(this.rx[i] - x, this.rz[i] - z));
    }
    return best;
  }

  /** Where the nearest rat that is still around is (body centre, `out` is filled); false when none is left. */
  nearestPos(x: number, z: number, out: { x: number; y: number; z: number }): boolean {
    let best = Infinity;
    let at = -1;
    for (let i = 0; i < this.n; i++) {
      if (this.st[i] >= ST_DIZZY) continue;
      const d = Math.hypot(this.rx[i] - x, this.rz[i] - z);
      if (d < best) {
        best = d;
        at = i;
      }
    }
    if (at < 0) return false;
    out.x = this.rx[at];
    out.y = 0.9;
    out.z = this.rz[at];
    return true;
  }

  /** Position of the nearest bakpao / kue that lies on the ground (null: none). */
  nearestFood(x: number, z: number): { x: number; z: number } | null {
    let best = Infinity;
    let out: { x: number; z: number } | null = null;
    for (let i = 0; i < this.n; i++) {
      if (this.fs[i] !== F_GROUND || this.specs[i].food === 'sayur') continue;
      const d = Math.hypot(this.fx[i] - x, this.fz[i] - z);
      if (d < best) {
        best = d;
        out = { x: this.fx[i], z: this.fz[i] };
      }
    }
    return out;
  }

  /** Hide / show the whole market set (the rats leave when Si Tikus Rakus appears). */
  setVisible(on: boolean): void {
    this.shown = on;
    this.ratMesh.visible = this.arrowMesh.visible = this.pipMesh.visible = on;
    this.foodMesh.visible = on && this.scenery;
    this.props.visible = on && this.scenery;
  }

  /** The big rat of the scene (Si Tikus Rakus): one extra mesh, only drawn while he is around. */
  makeRakus(): THREE.Mesh {
    // The owner's Tikus Rakus model at the old figure's height (the caller scales it up); the procedural fat rat when it is missing.
    const proc = ratGeo(0x8d7a93, true);
    proc.computeBoundingBox();
    const model = enemyModels.geometry('tikus_rakus', (proc.boundingBox as THREE.Box3).max.y);
    const g = model ?? proc;
    if (model) proc.dispose();
    this.geos.push(g);
    const m = new THREE.Mesh(g, model ? (enemyModels.material('tikus_rakus') as THREE.Material) : this.mats[0]);
    m.castShadow = false;
    m.visible = false;
    this.ctx.root.add(m);
    return m;
  }

  /** Every food is gone at once (resuming after the count). */
  clearFoods(): void {
    this.fs.fill(F_GONE);
  }

  /** Test helper: pick up every bakpao and kue that lies on the street (as if walked over). */
  collectAll(): void {
    for (let i = 0; i < this.n; i++) {
      if (this.fs[i] !== F_GROUND || this.specs[i].food === 'sayur') continue;
      this.fs[i] = F_GONE;
      this.collected[this.specs[i].food]++;
      this.hooks.onCollect(this.specs[i].food);
    }
  }

  /** The foods go back to the stalls: they fly to Bu Lina and vanish (the happy end of the count). */
  returnAll(): void {
    for (let i = 0; i < this.n; i++) {
      if (this.fs[i] === F_GROUND || this.fs[i] === F_FLY) {
        this.f0x[i] = this.fx[i];
        this.f0z[i] = this.fz[i];
        this.ft[i] = 0;
        this.fs[i] = F_RETURN;
      }
    }
  }

  private setLoopPos(i: number): void {
    const r = this.specs[i];
    this.rx[i] = r.cx + Math.cos(this.ang[i]) * r.r;
    this.rz[i] = r.cz + Math.sin(this.ang[i]) * r.r;
    this.yaw[i] = Math.atan2(-Math.sin(this.ang[i]), Math.cos(this.ang[i]));
  }

  /** Tame rat i (laser or stomp): dizzy stars, boing, the food falls, then it runs down the drain. */
  tame(i: number): void {
    if (this.st[i] >= ST_DIZZY) return;
    const { ctx } = this;
    this.st[i] = ST_DIZZY;
    this.timer[i] = 0;
    this.targets[i].enabled = false;
    this.tamedCount++;
    ctx.synth.boing();
    ctx.sfx.pop();
    this.aim[i].set(this.rx[i], 0.4 * Combat.rat.scale, this.rz[i]);
    ctx.fx.stars.show(this.aim[i], 0.75 * Combat.rat.scale, RatConfig.dizzyTime + 0.3, 0.3);
    ctx.fx.sparkles.burst(this.rx[i], 0.5, this.rz[i], 14, 2.6, 0xffe14d, { gravity: 2, life: 0.7, up: 0.8 });
    ctx.fx.flashes.spawn(this.rx[i], 0.6, this.rz[i], 1.2, 0.5, 0xffd23f);
    // The food falls out of its arms onto the street nearby.
    const food = this.specs[i].food;
    this.f0x[i] = this.rx[i];
    this.f0z[i] = this.rz[i];
    const a = this.ang[i] * 1.7 + i;
    clampToStreets(this.rx[i] + Math.cos(a) * 1.5, this.rz[i] + Math.sin(a) * 1.5, this.tmp);
    this.fx[i] = this.tmp.x;
    this.fz[i] = this.tmp.z;
    this.fy[i] = GROUND;
    this.ft[i] = 0;
    this.fs[i] = F_FLY;
    // Which drain: along the street the rat is on (on the crossing: the east-west one).
    const onZ = Math.abs(this.rz[i] - MARKET.hub.z) <= MARKET.half + 0.6;
    let best = 0;
    let bd = Infinity;
    MARKET.drains.forEach((d, k) => {
      const zStreet = d.z === 0;
      if (zStreet !== onZ) return;
      const dd = zStreet ? Math.abs(d.x - this.rx[i]) : Math.abs(d.z - this.rz[i]);
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    });
    this.drain[i] = best;
    this.hooks.onTamed(i, food);
  }

  /** Test helper: rat i starts an attack now (0 = charge, 1 = crumbs) whatever its cooldown. */
  forceAttack(i: number, kind: 0 | 1): void {
    if (this.st[i] >= ST_DIZZY) return;
    this.assisting = true; // a test attack never calls a second rat
    this.beginAttack(i, kind === K_CHARGE ? 1 : Combat.rat.chargeMaxDist + 2);
    this.assisting = false;
  }

  /** Test helper: fight counters. */
  combatCounts(): Record<string, number> {
    return { hitsTaken: this.hitsTaken, headStomps: this.headStomps, attacks: this.attacks, charges: this.charges, crumbs: this.crumbs, dodges: this.dodges, blocked: this.blocked, hurtGlen: this.hurtGlen };
  }

  /** A laser shot reached rat i. Far away it may hop aside (the shot misses); otherwise it is one hit. */
  private laserHit(i: number, h: HitInfo): void {
    this.lasers++;
    const s = this.st[i];
    if (s >= ST_DIZZY) return;
    if (s !== ST_STUN && h.distance > Combat.laser.dodgeMinDist && CombatRng.next() < Combat.laser.dodgeChance) {
      this.dodge(i, h.dirX, h.dirZ);
      return;
    }
    this.hit(i);
  }

  /** Hop sideways out of the line of fire ("swish"): the shot is wasted. */
  private dodge(i: number, dx: number, dz: number): void {
    this.dodges++;
    const side = (i % 2 ? 1 : -1) * Combat.laser.dodgeHop;
    const l = Math.hypot(dx, dz) || 1;
    this.slX[i] = (-dz / l) * side;
    this.slZ[i] = (dx / l) * side;
    this.ctx.sfx.pop();
    this.ctx.fx.sparkles.burst(this.rx[i], 0.4, this.rz[i], 6, 2, 0xdfe6f2, { gravity: 0.5, life: 0.4, up: 0.3 });
  }

  /** One hit (laser, stomp or a crumb sent back): the last one tames it, the others only make it dizzy for a moment. */
  hit(i: number): void {
    if (this.st[i] >= ST_DIZZY) return;
    if (this.hp[i] > 1) {
      this.hp[i]--;
      this.hitsTaken++;
      const { ctx } = this;
      this.st[i] = ST_STUN;
      this.timer[i] = 0;
      this.squash[i] = 1;
      this.cool[i] = Math.max(this.cool[i], this.cooldown * 0.5);
      ctx.synth.boing();
      ctx.sfx.pop();
      this.aim[i].set(this.rx[i], 0.4 * Combat.rat.scale, this.rz[i]);
      ctx.fx.stars.show(this.aim[i], 0.75 * Combat.rat.scale, Combat.rat.stun + 0.2, 0.3);
      ctx.fx.sparkles.burst(this.rx[i], 0.6, this.rz[i], 10, 2.4, 0xffe14d, { gravity: 2, life: 0.6, up: 0.8 });
      ctx.fx.flashes.spawn(this.rx[i], 0.7, this.rz[i], 1.0, 0.4, 0xffd23f);
      return;
    }
    this.hp[i] = 0;
    this.tame(i);
  }

  /** Start an attack: a charge when the child is near, crumbs from farther away. Every attack has a visible wind-up first. */
  private beginAttack(i: number, dp: number): void {
    const pl = this.ctx.player.position;
    this.attacks++;
    this.gap = Combat.rat.globalGap;
    this.kind[i] = dp <= Combat.rat.chargeMaxDist ? K_CHARGE : K_CRUMB;
    this.st[i] = ST_WIND;
    this.timer[i] = 0;
    this.puff[i] = 0;
    const d = Math.hypot(pl.x - this.rx[i], pl.z - this.rz[i]) || 1;
    this.dirX[i] = (pl.x - this.rx[i]) / d;
    this.dirZ[i] = (pl.z - this.rz[i]) / d;
    this.ctx.sfx.blip();
    if (!this.easy && !this.assisting) this.pickAssist(i);
  }

  /** Rats help each other: the nearest other rat that loops near the child joins in a moment (it attacks in turn, not at once). */
  private pickAssist(i: number): void {
    const pl = this.ctx.player.position;
    let best = -1;
    let bd: number = Combat.rat.aggroRadius;
    for (let j = 0; j < this.n; j++) {
      if (j === i || this.st[j] !== ST_LOOP) continue;
      const d = Math.hypot(this.rx[j] - pl.x, this.rz[j] - pl.z);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    this.assistIdx = best;
    this.assistT = Combat.rat.assistDelay;
  }

  /** The wind-up is over: the rat dashes along the locked line, or lets a slow crumb fly. */
  private launch(i: number): void {
    const { ctx } = this;
    if (this.kind[i] === K_CRUMB) {
      this.crumbs++;
      const pl = ctx.player.position;
      const t = Combat.rat;
      ctx.projectiles.spawn({
        from: { x: this.rx[i] + this.dirX[i] * 0.5, y: 0.75, z: this.rz[i] + this.dirZ[i] * 0.5 },
        to: { x: pl.x, y: pl.y, z: pl.z },
        speed: t.crumbSpeed,
        radius: t.crumbRadius,
        color: t.crumbColor,
        life: t.crumbLife,
        returnTo: this.aim[i],
        onHitPlayer: (p) => this.hurtGlenAt(p.pos.x, p.pos.z, i),
        onReturned: () => this.hit(i), // a crumb sent back by the shield: the thrower gets a bonk
      });
      this.st[i] = ST_RECOVER;
      this.timer[i] = 0;
      return;
    }
    this.charges++;
    this.st[i] = ST_CHARGE;
    this.timer[i] = 0;
  }

  /** The child is touched (charge) or hit (crumb): `Health` decides between a hit, a shield block and the safe seconds. */
  private hurtGlenAt(x: number, z: number, i: number): 'hit' | 'blocked' | 'ignored' {
    const r = this.ctx.health.hurt(x, z);
    if (r === 'hit') this.hurtGlen++;
    else if (r === 'blocked') {
      this.blocked++;
      if (this.st[i] === ST_CHARGE) {
        // The dome bonks the rat: it is dizzy for a moment.
        this.st[i] = ST_STUN;
        this.timer[i] = 0;
        this.squash[i] = 1;
        this.ctx.fx.stars.show(this.aim[i], 0.75 * Combat.rat.scale, Combat.rat.stun, 0.3);
      }
    }
    return r;
  }

  fixedUpdate(dt: number): void {
    this.t += dt;
    const { ctx } = this;
    const pl = ctx.player.position;
    const C = Combat.rat;
    this.gap = Math.max(0, this.gap - dt);
    const calm = this.muted || !ctx.game.controlsEnabled || ctx.dialog.blocking || ctx.health.resting;
    const feet = pl.y - 0.55;
    if (this.assistIdx >= 0) {
      this.assistT -= dt;
      if (this.assistT <= 0) {
        const j = this.assistIdx;
        this.assistIdx = -1;
        const dj = Math.hypot(this.rx[j] - pl.x, this.rz[j] - pl.z);
        if (!calm && this.st[j] === ST_LOOP && dj < C.aggroRadius) {
          this.assisting = true;
          this.beginAttack(j, dj);
          this.assisting = false;
        }
      }
    }
    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      if (s === ST_GONE) continue;
      const r = this.specs[i];
      const dx = this.rx[i] - pl.x;
      const dz = this.rz[i] - pl.z;
      const dp = Math.hypot(dx, dz);
      this.cool[i] = Math.max(0, this.cool[i] - dt);
      this.squash[i] = Math.max(0, this.squash[i] - dt * 3);
      // A sideways dodge slides the rat (fast, a quarter of a second).
      if (this.slX[i] !== 0 || this.slZ[i] !== 0) {
        const L = Math.hypot(this.slX[i], this.slZ[i]);
        const step = Math.min(L, 9 * dt);
        const mx = (this.slX[i] / L) * step;
        const mz = (this.slZ[i] / L) * step;
        clampToStreets(this.rx[i] + mx, this.rz[i] + mz, this.tmp);
        this.rx[i] = this.tmp.x;
        this.rz[i] = this.tmp.z;
        this.slX[i] -= mx;
        this.slZ[i] -= mz;
        if (L - step < 0.01) this.slX[i] = this.slZ[i] = 0;
      }
      switch (s) {
        case ST_LOOP: {
          this.ang[i] += (RatConfig.loopSpeed / r.r) * dt;
          this.setLoopPos(i);
          if (!calm && dp < C.aggroRadius && this.cool[i] <= 0 && this.gap <= 0) this.beginAttack(i, dp);
          break;
        }
        case ST_WIND: {
          this.timer[i] += dt;
          this.yaw[i] = this.turn(this.yaw[i], Math.atan2(this.dirX[i], this.dirZ[i]), dt * 2);
          // Until the lock the line follows the child (so a child standing still is aimed at); then it is fixed: walk aside or jump.
          const lock = this.windup * C.lockShare;
          if (this.timer[i] < lock) {
            const d = dp || 1;
            this.dirX[i] = -dx / d;
            this.dirZ[i] = -dz / d;
          }
          this.puff[i] -= dt;
          if (this.puff[i] <= 0) {
            this.puff[i] = 0.1;
            ctx.fx.sparkles.burst(this.rx[i] - this.dirX[i] * 0.5, 0.15, this.rz[i] - this.dirZ[i] * 0.5, 2, 1.1, 0xf4f1e8, { gravity: -0.2, life: 0.4, up: 0.3 });
          }
          if (this.timer[i] >= this.windup) this.launch(i);
          break;
        }
        case ST_CHARGE: {
          this.timer[i] += dt;
          clampToStreets(this.rx[i] + this.dirX[i] * C.chargeSpeed * dt, this.rz[i] + this.dirZ[i] * C.chargeSpeed * dt, this.tmp);
          this.rx[i] = this.tmp.x;
          this.rz[i] = this.tmp.z;
          this.yaw[i] = Math.atan2(this.dirX[i], this.dirZ[i]);
          if (Math.hypot(this.rx[i] - pl.x, this.rz[i] - pl.z) < C.touchRadius && feet < C.touchTop) {
            const res = this.hurtGlenAt(this.rx[i], this.rz[i], i);
            if (res === 'hit' && this.st[i] === ST_CHARGE) {
              this.st[i] = ST_RECOVER;
              this.timer[i] = 0;
              this.cool[i] = this.cooldown;
            }
          }
          if (this.st[i] === ST_CHARGE && this.timer[i] >= C.chargeTime) {
            this.st[i] = ST_RECOVER;
            this.timer[i] = 0;
          }
          break;
        }
        case ST_RECOVER: {
          this.timer[i] += dt;
          if (this.timer[i] >= C.recover) {
            this.st[i] = ST_BACK;
            this.cool[i] = this.cooldown;
          }
          break;
        }
        case ST_STUN: {
          this.timer[i] += dt;
          this.yaw[i] += dt * 7;
          if (this.timer[i] >= C.stun) this.st[i] = ST_BACK;
          break;
        }
        case ST_BACK: {
          const tx = r.cx - this.rx[i];
          const tz = r.cz - this.rz[i];
          const d = Math.hypot(tx, tz);
          if (d < r.r + 0.3) {
            this.ang[i] = Math.atan2(this.rz[i] - r.cz, this.rx[i] - r.cx);
            this.st[i] = ST_LOOP;
            break;
          }
          clampToStreets(this.rx[i] + (tx / d) * RatConfig.returnSpeed * dt, this.rz[i] + (tz / d) * RatConfig.returnSpeed * dt, this.tmp);
          this.yaw[i] = this.turn(this.yaw[i], Math.atan2(tx, tz), dt);
          this.rx[i] = this.tmp.x;
          this.rz[i] = this.tmp.z;
          break;
        }
        case ST_DIZZY: {
          this.timer[i] += dt;
          this.yaw[i] += dt * 9;
          if (this.timer[i] >= RatConfig.dizzyTime) {
            this.st[i] = ST_RUN;
            this.timer[i] = 0;
          }
          break;
        }
        case ST_RUN: {
          const d = MARKET.drains[this.drain[i]];
          const tx = d.x - this.rx[i];
          const tz = d.z - this.rz[i];
          const dist = Math.hypot(tx, tz);
          if (dist < 0.5) {
            this.st[i] = ST_GONE;
            ctx.fx.sparkles.burst(d.x, 0.3, d.z, 10, 2, 0xdfe6f2, { gravity: 1.5, life: 0.5, up: 0.6 });
            ctx.sfx.pop();
            break;
          }
          this.yaw[i] = this.turn(this.yaw[i], Math.atan2(tx, tz), dt * 2);
          this.rx[i] += (tx / dist) * RatConfig.drainSpeed * dt;
          this.rz[i] += (tz / dist) * RatConfig.drainSpeed * dt;
          break;
        }
        default:
          break;
      }
      this.aim[i].set(this.rx[i], 0.4 * C.scale, this.rz[i]);
    }
    this.foods(dt);
  }

  private turn(from: number, to: number, dt: number): number {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    return from + d * Math.min(1, dt * 10);
  }

  /** The food falling out of the tamed rats, the ones lying around, and the pickups. */
  private foods(dt: number): void {
    const { ctx } = this;
    const pl = ctx.player.position;
    const feet = pl.y - 0.55;
    for (let i = 0; i < this.n; i++) {
      const s = this.fs[i];
      if (s === F_FLY) {
        this.ft[i] += dt / 0.55;
        if (this.ft[i] >= 1) {
          this.fs[i] = F_GROUND;
          this.fy[i] = GROUND;
          this.ft[i] = 0;
          ctx.sfx.blip();
        }
      } else if (s === F_GROUND) {
        const kind = this.specs[i].food;
        if (kind === 'sayur') {
          // The vegetables go back to the stall by themselves after a moment.
          this.ft[i] += dt;
          if (this.ft[i] > 1.2) {
            this.f0x[i] = this.fx[i];
            this.f0z[i] = this.fz[i];
            this.ft[i] = 0;
            this.fs[i] = F_RETURN;
          }
          continue;
        }
        const dy = feet - this.fy[i];
        if (dy < -RatConfig.above || dy > RatConfig.below) continue;
        const dx = this.fx[i] - pl.x;
        const dz = this.fz[i] - pl.z;
        if (dx * dx + dz * dz > RatConfig.takeRadius * RatConfig.takeRadius) continue;
        this.fs[i] = F_GONE;
        this.collected[kind]++;
        ctx.fx.sparkles.burst(this.fx[i], 0.5, this.fz[i], 14, 2.8, kind === 'kue' ? 0xff8fb1 : 0xffffff, { gravity: 2, life: 0.7, up: 0.8 });
        ctx.sfx.coin();
        this.hooks.onCollect(kind);
      } else if (s === F_RETURN) {
        this.ft[i] += dt / 0.9;
        if (this.ft[i] >= 1) {
          this.fs[i] = F_GONE;
          ctx.fx.sparkles.burst(MARKET.vendor.x, 1.3, MARKET.vendor.z, 8, 2, 0xffd23f, { gravity: 1, life: 0.6, up: 0.6 });
        }
      }
    }
  }

  /** Per rendered frame: write the instance matrices. */
  update(_dt: number): void {
    const pv = this.ctx.player.visualPosition;
    const near = Math.hypot(pv.x - MARKET.hub.x, pv.z - MARKET.hub.z) < RatConfig.showRadius;
    if (this.shown) {
      this.ratMesh.visible = near;
      this.foodMesh.visible = near && this.scenery;
      this.props.visible = near && this.scenery;
    }
    if (!near) this.arrowMesh.visible = this.pipMesh.visible = false;
    if (!near || !this.shown) return;
    this.writeMatrices();
  }

  private writeMatrices(): void {
    const t = this.t;
    let anyArrow = false;
    let anyPips = false;
    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      // ---- rat ----
      const SC = Combat.rat.scale;
      let arrow = 0;
      if (s === ST_GONE) {
        this.m4.makeScale(0, 0, 0);
      } else {
        let y = 0;
        let sy = 1;
        let sxz = 1;
        let jx = 0;
        let jz = 0;
        // Code animation of the static model: forward lean (rad), sideways tilt (rad), extra turn (rad).
        let lean = 0;
        let roll = 0;
        let turn = 0;
        if (s === ST_LOOP || s === ST_BACK) {
          // Grumpy waddle: little hops, the body rocks side to side.
          y = Math.abs(Math.sin(t * 9 + i)) * 0.05;
          roll = Math.sin(t * 9 + i) * 0.1;
          lean = 0.06;
        }
        else if (s === ST_RUN) {
          y = Math.abs(Math.sin(t * 15 + i)) * 0.09;
          sy = 1 + Math.sin(t * 30 + i) * 0.04;
          lean = 0.3;
          roll = Math.sin(t * 15 + i) * 0.14;
        } else if (s === ST_WIND) {
          // Telegraph: the rat shakes harder and crouches (a crumb thrower puffs its cheeks), and a charge shows its arrow.
          const u = Math.min(1, this.timer[i] / this.windup);
          jx = Math.sin(t * 70 + i) * 0.05 * (0.4 + u);
          jz = Math.cos(t * 63 + i) * 0.05 * (0.4 + u);
          sy = 1 - 0.18 * u;
          lean = -0.28 * u; // winds up: leans back, then shakes
          roll = Math.sin(t * 55 + i) * 0.12 * u;
          sxz = 1 + (this.kind[i] === K_CRUMB ? 0.3 : 0.12) * u;
          if (this.kind[i] === K_CHARGE) arrow = 0.75 + 0.25 * Math.sin(t * 20);
        } else if (s === ST_CHARGE) {
          y = Math.abs(Math.sin(t * 24 + i)) * 0.06;
          sy = 0.92;
          lean = 0.55;
          roll = Math.sin(t * 24 + i) * 0.08;
        } else if (s === ST_RECOVER) {
          sy = 1 + Math.sin(t * 16 + i) * 0.05; // panting
          lean = 0.12 + Math.sin(t * 16 + i) * 0.04;
        } else if (s === ST_STUN) {
          const u = Math.min(1, this.timer[i] / Combat.rat.stun);
          y = Math.sin(Math.PI * u) * 0.25;
          roll = Math.sin(t * 38 + i) * 0.3 * (1 - u); // hit: shakes its head
          turn = Math.sin(t * 17 + i) * 0.25 * (1 - u);
        } else if (s === ST_DIZZY) {
          const u = Math.min(1, this.timer[i] / RatConfig.dizzyTime);
          y = Math.sin(Math.PI * Math.min(1, u * 2)) * 0.5;
          sy = 1 + 0.15 * Math.sin(u * 20);
          turn = u * 18; // dizzy spin (it pops up and twirls; the stars come from fx)
          roll = Math.sin(u * 30) * 0.18;
        }
        const sq = this.squash[i];
        sy *= 1 - 0.25 * sq;
        sxz *= 1 + 0.2 * sq;
        this.q.setFromAxisAngle(this.up, this.yaw[i] + turn);
        if (this.ratModel && (lean !== 0 || roll !== 0)) {
          this.q.multiply(this.q2.setFromAxisAngle(this.ax, lean));
          this.q.multiply(this.q2.setFromAxisAngle(this.az, roll));
        }
        this.m4.compose(this.p.set(this.rx[i] + jx, y * SC, this.rz[i] + jz), this.q, this.sc.set(SC * sxz, SC * sy, SC * sxz));
      }
      this.ratMesh.setMatrixAt(i, this.m4);
      // ---- charge arrow on the ground (in front of the rat, along the locked line) ----
      if (arrow > 0) {
        this.q.setFromAxisAngle(this.up, Math.atan2(this.dirX[i], this.dirZ[i]));
        this.m4.compose(this.p.set(this.rx[i] + this.dirX[i] * 0.7, 0.06, this.rz[i] + this.dirZ[i] * 0.7), this.q, this.sc.set(1.1, 1, arrow * 1.6));
      } else this.m4.makeScale(0, 0, 0);
      this.arrowMesh.setMatrixAt(i, this.m4);
      if (arrow > 0) anyArrow = true;
      // ---- hit points: little hearts above a rat that is in the fight (camera-aligned row) ----
      const fighting = s !== ST_GONE && s < ST_DIZZY && (s !== ST_LOOP || this.hp[i] < this.hpMax);
      const cyaw = this.ctx.cameraRig.yaw;
      if (fighting) anyPips = true;
      const rxv = Math.cos(cyaw);
      const rzv = -Math.sin(cyaw);
      for (let k = 0; k < this.hpMax; k++) {
        const idx = i * this.hpMax + k;
        if (!fighting) this.m4.makeScale(0, 0, 0);
        else {
          const off = (k - (this.hpMax - 1) / 2) * (this.hpMax > 3 ? 0.26 : 0.32);
          const full = k < this.hp[i];
          const z = full ? 1.7 : 0.9;
          this.m4.compose(this.p.set(this.rx[i] + rxv * off, 1.35 + (full ? Math.sin(t * 5 + k) * 0.03 : 0), this.rz[i] + rzv * off), this.q.identity(), this.sc.set(z, z, z));
        }
        this.pipMesh.setMatrixAt(idx, this.m4);
        this.pipMesh.setColorAt(idx, this.col.setHex(k < this.hp[i] ? 0xff4d6d : 0x9aa0b4));
      }
      // ---- food ----
      const kind = this.specs[i].food;
      const sh = FOOD_SHAPE[kind];
      const fs = this.fs[i];
      let px = 0;
      let py = 0;
      let pz = 0;
      let k = 1;
      if (fs === F_CARRIED) {
        // On the rat's back, bouncing with it.
        if (s === ST_GONE) k = 0;
        px = this.rx[i];
        py = 0.62 * Combat.rat.scale + (s === ST_LOOP || s === ST_BACK ? Math.abs(Math.sin(t * 9 + i)) * 0.05 : 0);
        pz = this.rz[i];
      } else if (fs === F_FLY) {
        const u = this.ft[i];
        px = this.f0x[i] + (this.fx[i] - this.f0x[i]) * u;
        pz = this.f0z[i] + (this.fz[i] - this.f0z[i]) * u;
        py = 0.65 + Math.sin(Math.PI * u) * 1.1 - u * 0.65;
      } else if (fs === F_GROUND) {
        px = this.fx[i];
        pz = this.fz[i];
        py = this.fy[i] + 0.04 + Math.sin(t * 3 + i) * 0.03;
      } else if (fs === F_RETURN) {
        const u = this.ft[i];
        const v = MARKET.vendor;
        px = this.f0x[i] + (v.x - this.f0x[i]) * u;
        pz = this.f0z[i] + (v.z - this.f0z[i]) * u;
        py = 0.4 + Math.sin(Math.PI * u) * 1.6 + u * 0.7;
        k = 1 - u * 0.6;
      } else k = 0;
      this.q.setFromAxisAngle(this.up, t * 1.5 + i);
      this.m4.compose(this.p.set(px, py, pz), this.q, this.sc.set(sh[0] * k * 1.1, sh[1] * k * 1.1, sh[0] * k * 1.1));
      this.foodMesh.setMatrixAt(i, this.m4);
    }
    this.ratMesh.instanceMatrix.needsUpdate = true;
    this.foodMesh.instanceMatrix.needsUpdate = true;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    this.pipMesh.instanceMatrix.needsUpdate = true;
    if (this.pipMesh.instanceColor) this.pipMesh.instanceColor.needsUpdate = true;
    // No draw call at all while nothing is in the fight.
    this.arrowMesh.visible = anyArrow;
    this.pipMesh.visible = anyPips;
  }
}
