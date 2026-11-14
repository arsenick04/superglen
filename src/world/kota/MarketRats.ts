import * as THREE from 'three';
import type { LevelContext } from '../Level';
import type { Target } from '../../gameplay/Targets';
import { clampToStreets, MARKET, RATS, type FoodKind } from './Bab3Data';
import { box, cyl, merge, sph } from './ColorMesh';
import { personGeo } from './CityPeople';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
const ST_FLEE = 1;
const ST_BACK = 2;
const ST_DIZZY = 3;
const ST_RUN = 4;
const ST_GONE = 5;

const F_CARRIED = 0;
const F_FLY = 1;
const F_GROUND = 2;
const F_RETURN = 3;
const F_GONE = 4;

const FOOD_COLOR: Record<FoodKind, number> = { bakpao: 0xffffff, kue: 0xffa6c9, sayur: 0xff9a2e };
/** Per-kind shape of the same bun geometry (x z size, y size): a round bakpao, a flat wide kue, a long thin carrot-ish bun. */
const FOOD_SHAPE: Record<FoodKind, readonly [number, number]> = { bakpao: [1, 1], kue: [1.25, 0.65], sayur: [0.7, 1.3] };

function ratGeo(): THREE.BufferGeometry {
  const fur = 0xa3a9bd;
  const pink = 0xf5a3b5;
  const dark = 0x2b1a12;
  return merge([
    { g: sph(0.26, 8, 6), c: fur, p: [0, 0.27, 0], s: [0.9, 0.8, 1.3] },
    { g: sph(0.19, 8, 6), c: fur, p: [0, 0.36, 0.3] },
    { g: sph(0.07, 6, 4), c: pink, p: [0, 0.33, 0.47] },
    { g: sph(0.13, 7, 5), c: fur, p: [-0.15, 0.55, 0.24], s: [1, 1, 0.4] },
    { g: sph(0.13, 7, 5), c: fur, p: [0.15, 0.55, 0.24], s: [1, 1, 0.4] },
    { g: sph(0.085, 6, 4), c: pink, p: [-0.15, 0.55, 0.275], s: [1, 1, 0.4] },
    { g: sph(0.085, 6, 4), c: pink, p: [0.15, 0.55, 0.275], s: [1, 1, 0.4] },
    { g: sph(0.035, 5, 4), c: dark, p: [-0.075, 0.41, 0.45] },
    { g: sph(0.035, 5, 4), c: dark, p: [0.075, 0.41, 0.45] },
    { g: cyl(0.025, 0.04, 0.55, 5), c: pink, p: [0, 0.2, -0.5], r: [-1.2, 0, 0] },
    { g: sph(0.06, 5, 4), c: fur, p: [-0.13, 0.06, 0.2] },
    { g: sph(0.06, 5, 4), c: fur, p: [0.13, 0.06, 0.2] },
    { g: sph(0.06, 5, 4), c: fur, p: [-0.13, 0.06, -0.15] },
    { g: sph(0.06, 5, 4), c: fur, p: [0.13, 0.06, -0.15] },
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
 * The seven Tikus Kecil of Chapter 3 and what they carry, plus Bu Lina and the drains. Everything is cute and slow: a rat circles
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
  lasers = 0;
  /** Foods that lie on the ground now (bakpao and kue only). */
  get dropped(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.fs[i] === F_GROUND && RATS[i].food !== 'sayur') c++;
    return c;
  }

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: RatHooks,
    tamed: readonly number[],
  ) {
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mats.push(lit);
    const rg = ratGeo();
    const fg = foodGeo();
    const pg = propsGeo();
    this.geos.push(rg, fg, pg);
    this.ratMesh = new THREE.InstancedMesh(rg, lit, this.n);
    this.foodMesh = new THREE.InstancedMesh(fg, lit, this.n);
    this.props = new THREE.Mesh(pg, lit);
    for (const m of [this.ratMesh, this.foodMesh]) {
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    this.props.castShadow = false;
    this.props.receiveShadow = false;
    // A first (hidden) colour per food so instanceColor exists when the shader program is built.
    for (let i = 0; i < this.n; i++) this.foodMesh.setColorAt(i, this.col.setHex(FOOD_COLOR[RATS[i].food]));
    ctx.root.add(this.ratMesh, this.foodMesh, this.props);

    const done = new Set(tamed);
    for (let i = 0; i < this.n; i++) {
      const r = RATS[i];
      this.ang[i] = (i * 2.1) % (Math.PI * 2);
      this.aim.push(new THREE.Vector3());
      this.setLoopPos(i);
      this.targets.push(
        ctx.targets.add({
          id: `rat${i}`,
          position: () => this.aim[i],
          radius: RatConfig.aimRadius,
          onHit: () => {
            this.lasers++;
            this.tame(i);
          },
        }),
      );
      this.fs[i] = F_CARRIED;
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
          this.tame(i);
        }
      }
    });
    ctx.onDispose(() => {
      this.disposed = true;
      for (const g of this.geos) g.dispose();
      for (const m of this.mats) m.dispose();
      this.ratMesh.dispose();
      this.foodMesh.dispose();
    });
    this.writeMatrices();
  }

  /** Test helper: `{ i, state, x, z, food, fstate }`. */
  list(): { i: number; state: number; x: number; z: number; food: FoodKind; fstate: number; fx: number; fz: number }[] {
    return RATS.map((r, i) => ({ i, state: this.st[i], x: this.rx[i], z: this.rz[i], food: r.food, fstate: this.fs[i], fx: this.fx[i], fz: this.fz[i] }));
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

  /** Position of the nearest bakpao / kue that lies on the ground (null: none). */
  nearestFood(x: number, z: number): { x: number; z: number } | null {
    let best = Infinity;
    let out: { x: number; z: number } | null = null;
    for (let i = 0; i < this.n; i++) {
      if (this.fs[i] !== F_GROUND || RATS[i].food === 'sayur') continue;
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
    this.ratMesh.visible = this.foodMesh.visible = this.props.visible = on;
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
    const r = RATS[i];
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
    this.aim[i].set(this.rx[i], 0.4, this.rz[i]);
    ctx.fx.stars.show(this.aim[i], 0.75, RatConfig.dizzyTime + 0.3, 0.3);
    ctx.fx.sparkles.burst(this.rx[i], 0.5, this.rz[i], 14, 2.6, 0xffe14d, { gravity: 2, life: 0.7, up: 0.8 });
    ctx.fx.flashes.spawn(this.rx[i], 0.6, this.rz[i], 1.2, 0.5, 0xffd23f);
    // The food falls out of its arms onto the street nearby.
    const food = RATS[i].food;
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

  fixedUpdate(dt: number): void {
    this.t += dt;
    const { ctx } = this;
    const pl = ctx.player.position;
    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      if (s === ST_GONE) continue;
      const r = RATS[i];
      const dx = this.rx[i] - pl.x;
      const dz = this.rz[i] - pl.z;
      const dp = Math.hypot(dx, dz);
      switch (s) {
        case ST_LOOP: {
          this.ang[i] += (RatConfig.loopSpeed / r.r) * dt;
          this.setLoopPos(i);
          if (dp < RatConfig.fleeRadius) this.st[i] = ST_FLEE;
          break;
        }
        case ST_FLEE: {
          // Away from the child, a little sideways so it scurries around the kiosks instead of into a corner.
          const ux = dx / (dp || 1);
          const uz = dz / (dp || 1);
          const side = i % 2 ? 0.45 : -0.45;
          let vx = ux - uz * side;
          let vz = uz + ux * side;
          const vl = Math.hypot(vx, vz) || 1;
          vx /= vl;
          vz /= vl;
          const k = Math.max(0, Math.min(1, (dp - RatConfig.fleeSlowFrom) / (RatConfig.fleeFastAt - RatConfig.fleeSlowFrom)));
          const sp = RatConfig.fleeNear + (RatConfig.fleeSpeed - RatConfig.fleeNear) * k;
          clampToStreets(this.rx[i] + vx * sp * dt, this.rz[i] + vz * sp * dt, this.tmp);
          this.yaw[i] = this.turn(this.yaw[i], Math.atan2(this.tmp.x - this.rx[i], this.tmp.z - this.rz[i]), dt);
          this.rx[i] = this.tmp.x;
          this.rz[i] = this.tmp.z;
          if (dp > RatConfig.calmRadius) this.st[i] = ST_BACK;
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
          if (dp < RatConfig.fleeRadius - 1) this.st[i] = ST_FLEE;
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
      this.aim[i].set(this.rx[i], 0.4, this.rz[i]);
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
        const kind = RATS[i].food;
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
    if (this.shown) this.ratMesh.visible = this.foodMesh.visible = this.props.visible = near;
    if (!near || !this.shown) return;
    this.writeMatrices();
  }

  private writeMatrices(): void {
    const t = this.t;
    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      // ---- rat ----
      if (s === ST_GONE) {
        this.m4.makeScale(0, 0, 0);
      } else {
        let y = 0;
        let sy = 1;
        if (s === ST_LOOP || s === ST_BACK) y = Math.abs(Math.sin(t * 9 + i)) * 0.05;
        else if (s === ST_FLEE || s === ST_RUN) {
          y = Math.abs(Math.sin(t * 15 + i)) * 0.09;
          sy = 1 + Math.sin(t * 30 + i) * 0.04;
        } else if (s === ST_DIZZY) {
          const u = Math.min(1, this.timer[i] / RatConfig.dizzyTime);
          y = Math.sin(Math.PI * Math.min(1, u * 2)) * 0.5;
          sy = 1 + 0.15 * Math.sin(u * 20);
        }
        this.q.setFromAxisAngle(this.up, this.yaw[i]);
        this.m4.compose(this.p.set(this.rx[i], y, this.rz[i]), this.q, this.sc.set(1, sy, 1));
      }
      this.ratMesh.setMatrixAt(i, this.m4);
      // ---- food ----
      const kind = RATS[i].food;
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
        py = 0.62 + (s === ST_LOOP || s === ST_BACK ? Math.abs(Math.sin(t * 9 + i)) * 0.05 : s === ST_FLEE ? Math.abs(Math.sin(t * 15 + i)) * 0.09 : 0);
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
  }
}
