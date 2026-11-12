import * as THREE from 'three';
import { Parkour } from '../../config/parkour';
import { PlayerConfig } from '../../player/PlayerConfig';
import type { LevelContext } from '../Level';
import { Kit, C } from '../bab1/Kit';
import { makeMaterials } from '../bab1/Batch';
import { Sparkles } from '../bab1/Fx';
import { ParkourKit, EDGE_COLOR, type Foothold } from '../kits/ParkourKit';
import { RoofList, addHipRoof } from '../kits/Roofs';
import { makeStarGeometry, Reward } from './Reward';

// =====================================================================================================================
// Reach numbers, all derived from src/config/parkour.ts (nothing is copied):
//   head      = capsule height (1.1 m): the mantle grabs a ledge top up to `maxAboveHead` (0.5 m) above the head,
//               so a ledge up to head + 0.5 = 1.6 m above the FEET can be pulled onto
//   plain(L)  = apex(L) + 1.6          a level-L jump plus the mantle
//   full(L)   = apex(L) + 1.2 + 1.6    ... plus the double jump pressed at the top (the most a child can do at level L)
//   cantilever slabs (ledge, balcony, sign, AC) are only grabbed while the chest probe (0.55 m above the feet) hits their
//   front face, so a slab of thickness t is reached at feet >= top - t - 0.55 instead of top - 1.6.
//
//   level      0     1     2     3     4
//   apex      1.6   2.1   2.7   3.4   4.2
//   plain(L)  3.2   3.7   4.3   5.0   5.8
//   full(L)   4.4   4.9   5.5   6.2   7.0
//
// TOWER (Menara Irama): floor N (N >= 1) is a pier whose top is `rise(N)` above floor N-1, between full(N-1) and full(N):
//   rise = full(N-1) + 0.5 * (full(N) - full(N-1))  -> 4.65, 5.20, 5.85, 6.60 (margin 0.25 .. 0.4 m on both sides)
//   floor 0 is the first pier: plain(0) - 0.2 = 3.0 above the ground (a level-0 jump + mantle, no double jump needed).
// Gaps between piers (edge to edge) widen: 1.0, 1.5, 2.0, 2.5 m. A pier is 4.7 x 4.7 m: room for the three in-place
// bounces that build the level (and a run-up).
// =====================================================================================================================

const L = Parkour.levels.map((l) => l.apex);
const HEAD = PlayerConfig.height;
const MANTLE_UP = HEAD + Parkour.mantle.maxAboveHead;
const DJ = Parkour.doubleJumpApex;
/** Height above the feet at which the mantle probe looks for a wall (m). */
const PROBE = Parkour.mantle.probeHeight;
export const reach = {
  apex: (lv: number): number => L[lv],
  plain: (lv: number): number => L[lv] + MANTLE_UP,
  full: (lv: number): number => L[lv] + DJ + MANTLE_UP,
  /** Highest slab top (thickness t) reachable from a floor by level lv with double jump and mantle. */
  slab: (lv: number, t: number): number => L[lv] + DJ + t + PROBE,
};

/** Rise of tower floor n above the one below (floor 0: above the ground). */
export function towerRise(n: number): number {
  if (n === 0) return reach.plain(0) - 0.2;
  return reach.full(n - 1) + 0.5 * (reach.full(n) - reach.full(n - 1));
}
const TOWER_GAPS = [0, 1.0, 1.5, 2.0, 2.5] as const;
const PIER = 4.7;

/** World layout of the arena (x, z in metres; the arena lies north (-z) of the spawn). */
export const ARENA = {
  tower: { x: -20, z0: -40, size: PIER },
  poles: { z: -34, xs: [-7, -3.5, 0, 3.5, 7], radius: 0.7 },
  drums: { x: 18, z: [-38.5, -41.4, -44.3] as readonly number[] },
  house: { x: -6, z: -84, w: 5, d: 5, wall: 3.4 },
  ruko: { x: 8, z: -90, w: 7, d: 5.5 },
} as const;

/** The route of a building, as data for the smoke test: ids in order and the highest level each hop is designed for. */
export interface RouteStep {
  id: string;
  /** Level at which this foothold is just reachable (designed), with double jump and mantle. */
  needs: number;
}

interface Drum {
  x: number;
  z: number;
  top: number;
  skin: THREE.Mesh;
  t: number;
}

const GOLD = 0xffc400;

/**
 * The Arena Lompat: Menara Irama (5 floors), a row of Barongsai poles, three bounce drums with a high ledge, a mini house
 * and a mini ruko, each with a complete route from the ground to a walkable roof, rewards and sparkle trails.
 * Everything static goes into merged batches (a handful of draw calls); animated parts are a few plain meshes.
 */
export class ArenaLompat {
  readonly kit: Kit;
  readonly pk: ParkourKit;
  readonly roofs = new RoofList();
  readonly routes: Record<string, RouteStep[]> = {};
  /** Footprint and wall height of the buildings (data for the tests). */
  readonly buildings: Record<string, { x: number; z: number; w: number; d: number; wall: number }> = {};
  private readonly sparkles: Sparkles;
  private readonly rewards: Reward[] = [];
  private readonly drums: Drum[] = [];
  private readonly starGeo = makeStarGeometry();
  private readonly starMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa300, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.2 });
  private readonly fanfare: { t: number; level: number }[] = [];
  private readonly feet = new THREE.Vector3();
  private readonly decals: THREE.Mesh | null = null;

  constructor(private readonly ctx: LevelContext) {
    this.kit = new Kit(ctx.physics, makeMaterials(), true);
    this.kit.roofs = this.roofs;
    this.pk = new ParkourKit(this.kit);
    this.sparkles = new Sparkles(ctx.root, 220);
    this.buildPoles();
    this.buildDrums();
    this.buildTower();
    this.buildHouse();
    this.buildRuko();
    this.kit.build(ctx.root);
    this.decals = this.buildTowerMarkers();
    ctx.onDispose(() => {
      this.starGeo.dispose();
      this.starMat.dispose();
    });
    // A bounce drum hit: squash the skin and send a ring (pooled).
    const off = ctx.player.rhythm.on('bounce', () => this.onBounce());
    ctx.onDispose(off);
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      ctx.game.debugInfo.arena = JSON.stringify({ footholds: this.pk.footholds, routes: this.routes, drumTop: ARENA_DRUM_TOP, markers: [1, 2, 3, 4, 5], buildings: this.buildings, rises: [0, 1, 2, 3, 4].map(towerRise) });
      ctx.game.debugInfo.roofs = this.roofs.json();
    }
  }

  // ---- Row of Barongsai poles -----------------------------------------------------------------------------------------

  /**
   * Five poles, tops 1.4 m wide, each 0.2 m below the apex of its level: a plain jump from the ground lands on the top
   * only at that level (heights 1.4 / 1.9 / 2.5 / 3.2 / 4.0). With the double jump and the mantle one level less is
   * enough: the poles are a skill row, not a gate.
   */
  private buildPoles(): void {
    const P = ARENA.poles;
    const colors = [C.RED, C.ORANGE, C.GOLD, C.TEAL, C.BLUE];
    P.xs.forEach((x, i) => this.pk.pole(`pole${i}`, 'poles', x, P.z, L[i] - 0.2, P.radius, colors[i]));
  }

  // ---- Three bounce drums ----------------------------------------------------------------------------------------------

  private buildDrums(): void {
    const D = Parkour.world.drum;
    const { x, z } = ARENA.drums;
    const top = D.height;
    const skinGeo = new THREE.CylinderGeometry(D.radius - 0.06, D.radius - 0.06, 0.06, 28);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.6 });
    this.ctx.onDispose(() => skinGeo.dispose());
    for (const zz of z) {
      this.kit.lit.cyl(D.radius, D.height - 0.06, [x, (D.height - 0.06) / 2, zz], C.RED);
      this.kit.lit.cyl(D.radius + 0.05, 0.14, [x, 0.07, zz], C.GOLD);
      this.kit.lit.cyl(D.radius + 0.05, 0.14, [x, D.height - 0.2, zz], C.GOLD);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        this.kit.deco.sph(0.07, [x + Math.cos(a) * (D.radius + 0.06), D.height * 0.5, zz + Math.sin(a) * (D.radius + 0.06)], C.GOLD, [1, 1, 1], 0);
      }
      this.kit.glow.cyl(D.radius + 0.01, 0.03, [x, D.height - 0.03, zz], EDGE_COLOR); // bright rim under the skin
      const skin = new THREE.Mesh(skinGeo, skinMat);
      skin.position.set(x, D.height - 0.03, zz);
      skin.receiveShadow = true;
      this.ctx.root.add(skin);
      const h = this.ctx.physics.addFixedCylinder(D.height / 2, D.radius, { x, y: D.height / 2, z: zz });
      this.ctx.player.rhythm.registerBounce(h.collider);
      this.drums.push({ x, z: zz, top, skin, t: 9 });
      this.sparkles.addEmitter(x, top + 0.2, zz, 0.5, 2.5, GOLD);
      this.pk.footholds.push({ id: `drum${this.drums.length}`, group: 'drums', kind: 'drum', x, z: zz, w: D.radius * 2, d: D.radius * 2, top });
    }
    // The high ledge after the third drum: needs the level the third bounce gives (3).
    const lastZ = z[z.length - 1];
    const ledgeTop = top + (reach.full(2) + 0.5 * (reach.full(3) - reach.full(2)));
    const ledgeZ = lastZ - D.radius - 1.0 - PIER / 2;
    this.pk.block({ id: 'drumLedge', group: 'drums', kind: 'pier', x, z: ledgeZ, w: PIER, d: PIER, top: ledgeTop, color: C.ORANGE });
    this.routes.drums = [
      { id: 'drum1', needs: 0 },
      { id: 'drum2', needs: 1 },
      { id: 'drum3', needs: 2 },
      { id: 'drumLedge', needs: 3 },
    ];
    this.addReward('drumLedge', x, ledgeTop, ledgeZ, 0.45);
    this.trail(x, ledgeTop, ledgeZ);
  }

  private onBounce(): void {
    const p = this.ctx.player;
    p.getFeetPosition(this.feet);
    let best: Drum | null = null;
    let bd = 1e9;
    for (const d of this.drums) {
      const dist = Math.hypot(d.x - this.feet.x, d.z - this.feet.z);
      if (dist < bd && Math.abs(this.feet.y - d.top) < 1.2) {
        bd = dist;
        best = d;
      }
    }
    if (!best || bd > Parkour.world.drum.radius + 0.8) return;
    best.t = 0;
    this.ctx.fx.rings.spawn(best.x, best.top, best.z, 2.4, 0.45, GOLD, 0.95);
    this.ctx.fx.sparkles.burst(best.x, best.top + 0.1, best.z, 10, 3, 0xffd23f, { gravity: 3, life: 0.7, up: 0.8 });
  }

  // ---- Tower ---------------------------------------------------------------------------------------------------------------

  private buildTower(): void {
    const T = ARENA.tower;
    const colors = [C.RED, C.ORANGE, C.GOLD, C.TEAL, C.BLUE];
    let z = T.z0;
    let top = 0;
    const route: RouteStep[] = [];
    for (let n = 0; n < 5; n++) {
      if (n > 0) z -= PIER + TOWER_GAPS[n];
      top += towerRise(n);
      this.pk.block({ id: `floor${n}`, group: 'tower', kind: 'pier', x: T.x, z, w: PIER, d: PIER, top, color: colors[n] });
      route.push({ id: `floor${n}`, needs: n });
      this.trail(T.x, top, z);
      if (n === 4) this.addReward('tower', T.x, top, z, 1.1);
    }
    this.routes.tower = route;
  }

  /** The drum-icon level markers: one row of 1..5 drums painted on top of each floor and on its front face. */
  private buildTowerMarkers(): THREE.Mesh {
    const rows = 5;
    const cw = 640;
    const ch = 120;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch * rows;
    const g = canvas.getContext('2d');
    if (g) {
      for (let n = 0; n < rows; n++) {
        const cnt = n + 1;
        const step = cw / 5;
        const x0 = (cw - step * cnt) / 2 + step / 2;
        for (let i = 0; i < cnt; i++) paintDrum(g, x0 + i * step, n * ch + ch / 2, ch * 0.44);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, row: number): void => {
      const i0 = pos.length / 3;
      for (const p of [a, b, c, d]) pos.push(p.x, p.y, p.z);
      const v0 = 1 - (row + 1) / rows;
      const v1 = 1 - row / rows;
      uv.push(0, v0, 1, v0, 1, v1, 0, v1);
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    const T = ARENA.tower;
    let z = T.z0;
    let top = 0;
    const W = 3.5;
    const H = W * (ch / cw);
    const V = (x: number, y: number, zz: number): THREE.Vector3 => new THREE.Vector3(x, y, zz);
    for (let n = 0; n < 5; n++) {
      if (n > 0) z -= PIER + TOWER_GAPS[n];
      top += towerRise(n);
      // On top (read from the south).
      quad(V(T.x - W / 2, top + 0.03, z + H / 2 + 0.6), V(T.x + W / 2, top + 0.03, z + H / 2 + 0.6), V(T.x + W / 2, top + 0.03, z - H / 2 + 0.6), V(T.x - W / 2, top + 0.03, z - H / 2 + 0.6), n);
      // On the south face, just under the edge (visible from the floor below it).
      const fz = z + PIER / 2 + 0.03;
      quad(V(T.x - W / 2, top - 0.35 - H, fz), V(T.x + W / 2, top - 0.35 - H, fz), V(T.x + W / 2, top - 0.35, fz), V(T.x - W / 2, top - 0.35, fz), n);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.ctx.root.add(mesh);
    return mesh;
  }

  // ---- Mini house (1 floor, route for level 0..1) ------------------------------------------------------------------------

  private buildHouse(): void {
    const H = ARENA.house;
    const zf = H.z + H.d / 2; // front face (+z)
    this.body(H.x, H.z, H.w, H.wall, H.d, C.PEACH);
    this.windowsAndDoor(H.x, zf, H.w, H.wall, 1);
    const crateA = this.pk.crateStack('houseCrateA', 'house', H.x - 1.9, zf + 0.7, 1);
    const crateB = this.pk.crateStack('houseCrateB', 'house', H.x - 0.6, zf + 0.7, 2);
    // The awning juts out 1.8 m: its outer half is well clear of the roof edge (which overhangs 0.4 m).
    const awn = this.pk.awning('houseAwning', 'house', H.x + 1.3, zf + 1.0, crateB.top + 0.8, 2.2, 1.6);
    this.buildings.house = { x: H.x, z: H.z, w: H.w, d: H.d, wall: H.wall };
    const rh = 1.3;
    addHipRoof(this.kit, { id: 'houseRoof', cx: H.x, cz: H.z, baseY: H.wall, w: H.w + 0.6, d: H.d + 0.6, h: rh, color: C.DEEP_RED });
    this.routes.house = [
      { id: crateA.id, needs: 0 },
      { id: crateB.id, needs: 0 },
      { id: awn.id, needs: 0 },
      { id: 'houseRoof', needs: 0 },
    ];
    for (const f of [crateA, crateB, awn]) this.trail(f.x, f.top, f.z);
    this.trail(H.x, H.wall + rh * 0.9, H.z);
    this.addReward('house', H.x, H.wall + rh * 0.92, H.z, 0.4);
  }

  // ---- Mini ruko (3 floors, 7.9 m): crates -> balcony bay (level 1 with the air jump, level 3 without) -> sign board -> roof -----------------------------------

  private buildRuko(): void {
    const R = ARENA.ruko;
    const zf = R.z + R.d / 2;
    const crateTop = 2 * 0.9;
    // The balcony bay is a pier like a tower floor: its top is 4.65 m above the crates, between what level 0 (4.4) and
    // level 1 (4.9) can reach with the air jump and the mantle; without the air jump it takes level 3 (plain 5.0, level 2 4.3).
    const balconyTop = round2(crateTop + reach.full(0) + 0.5 * (reach.full(1) - reach.full(0)));
    const signTop = balconyTop + 0.75;
    const wall = balconyTop + 1.45;
    this.body(R.x, R.z, R.w, wall, R.d, C.MINT);
    for (const fy of [Math.round(wall / 3), Math.round((2 * wall) / 3)]) this.kit.deco.box([R.w + 0.2, 0.18, 0.2], [R.x, fy, zf + 0.05], C.CREAM); // floor bands
    this.windowsAndDoor(R.x, zf, R.w, wall, 3);
    const crateA = this.pk.crateStack('rukoCrateA', 'ruko', R.x - 3.0, zf + 0.7, 1);
    const crateB = this.pk.crateStack('rukoCrateB', 'ruko', R.x - 1.6, zf + 0.7, 2);
    // The balcony starts 0.5 m right of the top crate; the sign board sits at its right end.
    const bw = 2.4;
    const bx = R.x - 0.4 + bw / 2 - 0.0;
    const bal = this.pk.balcony('rukoBalcony', 'ruko', bx, zf + 0.9, balconyTop, bw, 1.8);
    // The sign juts out past the roof edge (which overhangs 0.4 m) so there is room to stand on it.
    const sign = this.pk.signBoard('rukoSign', 'ruko', bx + bw / 2 + 0.5, zf + 0.9, signTop, 1.0, 1.2, 0.5);
    this.buildings.ruko = { x: R.x, z: R.z, w: R.w, d: R.d, wall };
    const rh = 1.5;
    addHipRoof(this.kit, { id: 'rukoRoof', cx: R.x, cz: R.z, baseY: wall, w: R.w + 0.6, d: R.d + 0.6, h: rh, color: C.DEEP_RED });
    this.routes.ruko = [
      { id: crateA.id, needs: 0 },
      { id: crateB.id, needs: 0 },
      { id: bal.id, needs: 1 },
      { id: sign.id, needs: 0 },
      { id: 'rukoRoof', needs: 0 },
    ];
    for (const f of [crateA, crateB, bal, sign]) this.trail(f.x, f.top, f.z);
    this.trail(R.x, wall + rh * 0.9, R.z);
    this.addReward('ruko', R.x, wall + rh * 0.92, R.z, 0.45);
  }

  /** A plain solid building body with a small base trim. */
  private body(x: number, z: number, w: number, h: number, d: number, color: number): void {
    this.kit.solid([w, h, d], [x, h / 2, z], color);
    this.kit.deco.box([w + 0.12, 0.3, d + 0.12], [x, 0.15, z], C.CREAM);
  }

  /** Door and windows on the front (+z) face, flat decoration only. */
  private windowsAndDoor(x: number, zf: number, w: number, h: number, floors: number): void {
    this.kit.deco.box([1.1, 2.1, 0.08], [x + w / 2 - 1.0, 1.05, zf + 0.04], C.BROWN);
    const fh = h / floors;
    for (let f = 0; f < floors; f++) {
      const xs = f === 0 ? [-w / 2 + 1.3] : [-w / 4, w / 4];
      for (const dx of xs) {
        const y = f * fh + fh * 0.58;
        this.kit.deco.box([1.0, 1.1, 0.08], [x + dx, y, zf + 0.04], C.WHITE);
        this.kit.glow.box([0.82, 0.92, 0.04], [x + dx, y, zf + 0.09], 0x9fdcff);
      }
    }
  }

  // ---- Rewards and trails -----------------------------------------------------------------------------------------------------

  private addReward(id: string, x: number, top: number, z: number, size: number): void {
    const r = new Reward(this.ctx.root, this.starGeo, this.starMat, id, x, top, z, size, (rw) => this.onReward(rw));
    this.rewards.push(r);
    this.sparkles.addEmitter(x, r.y, z, size * 1.2, 6, 0xffd23f);
  }

  private onReward(r: Reward): void {
    const big = r.size > 0.8;
    this.sparkles.burst(r.x, r.y, r.z, big ? 60 : 24, big ? 5 : 3.5, -1, { gravity: 2, life: 1.4, up: 0.6 });
    this.ctx.fx.rings.spawn(r.x, r.baseY, r.z, big ? 3.5 : 2, 0.7, GOLD, 0.9);
    // A little drum fanfare: the five pentatonic notes going up (all five for the big star, three for a small one).
    const notes = big ? [0, 1, 2, 3, 4, 4] : [0, 2, 4];
    notes.forEach((lv, i) => this.fanfare.push({ t: i * 0.11, level: lv }));
  }

  /** A gentle sparkle at a foothold top that hints the route (simple gold sparkles: no collectible system). */
  private trail(x: number, top: number, z: number): void {
    this.sparkles.addEmitter(x, top + 0.05, z, 0.45, 3, 0xffd23f);
  }

  // ---- Per step / frame -------------------------------------------------------------------------------------------------------------

  tick(dt: number): void {
    const p = this.ctx.player;
    p.getFeetPosition(this.feet);
    const W = Parkour.world;
    let total = 0;
    for (const r of this.rewards) {
      r.tick(this.feet.x, this.feet.y, this.feet.z, W.rewardRadius * Math.max(1, r.size), W.rewardWindow);
      total += r.count;
    }
    for (let i = this.fanfare.length - 1; i >= 0; i--) {
      const f = this.fanfare[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.ctx.synth.drum(f.level, true);
        this.fanfare.splice(i, 1);
      }
    }
    const info = this.ctx.game.debugInfo;
    info.arenaRewards = total;
    for (const r of this.rewards) info[`reward_${r.id}`] = r.count;
  }

  update(dt: number): void {
    this.sparkles.update(dt);
    for (const r of this.rewards) r.animate(dt);
    const D = Parkour.world.drum;
    for (const d of this.drums) {
      if (d.t > D.squashTime) continue;
      d.t += dt;
      const u = Math.min(1, d.t / D.squashTime);
      // Quick squash, springy return with one overshoot.
      const s = 1 - D.squashDepth * Math.sin(Math.min(1, u * 1.6) * Math.PI) * Math.exp(-2.2 * u) * (u < 0.3 ? 1 : 0.7);
      d.skin.scale.y = Math.max(0.1, s);
      d.skin.position.y = D.height - 0.03 - (1 - d.skin.scale.y) * 0.05;
      if (u >= 1) {
        d.skin.scale.y = 1;
        d.skin.position.y = D.height - 0.03;
      }
    }
    void this.decals;
  }

  /** Foothold list (for tests and for the future reachability tool). */
  get footholds(): readonly Foothold[] {
    return this.pk.footholds;
  }
}

const ARENA_DRUM_TOP = Parkour.world.drum.height;
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** A drum seen from above: gold ring, red band, cream skin and a gold centre. */
function paintDrum(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const disc = (rad: number, color: string): void => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill();
  };
  disc(r + 5, '#3b1d12');
  disc(r, '#ffc400');
  disc(r * 0.86, '#d9432f');
  disc(r * 0.62, '#fff1d6');
  disc(r * 0.16, '#ffc400');
  g.fillStyle = '#ffc400';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74, r * 0.06, 0, Math.PI * 2);
    g.fill();
  }
}
