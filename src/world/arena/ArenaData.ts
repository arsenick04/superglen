import { Parkour } from '../../config/parkour';
import { PlayerConfig } from '../../player/PlayerConfig';
import { box, cylinder, hipRoof, type Building, type Coin, type Foothold, type Gate, type LevelReachData } from '../kits/ParkourData';

/**
 * Pure layout data of the Arena Lompat (no three.js): `ArenaLompat.ts` builds it, `scripts/reachability.ts` checks it.
 * Every position here is the position that is built; change a number here and both follow.
 *
 * Reach numbers, all derived from src/config/parkour.ts (nothing is copied):
 *   head      = capsule height (1.1 m): the mantle grabs a ledge top up to `maxAboveHead` (0.5 m) above the head,
 *               so a ledge up to head + 0.5 = 1.6 m above the FEET can be pulled onto
 *   plain(L)  = apex(L) + 1.6          a level-L jump plus the mantle
 *   full(L)   = apex(L) + 1.2 + 1.6    ... plus the double jump pressed at the top (the most a child can do at level L)
 *   cantilever slabs (ledge, balcony, sign, AC) are only grabbed while the chest probe (0.55 m above the feet) hits their
 *   front face, so a slab of thickness t is reached at feet >= top - t - 0.55 instead of top - 1.6.
 *
 *   level      0     1     2     3     4
 *   apex      1.6   2.1   2.7   3.4   4.2
 *   plain(L)  3.2   3.7   4.3   5.0   5.8
 *   full(L)   4.4   4.9   5.5   6.2   7.0
 *
 * TOWER (Menara Irama): floor N (N >= 1) is a pier whose top is `rise(N)` above floor N-1, between full(N-1) and full(N):
 *   rise = full(N-1) + 0.5 * (full(N) - full(N-1))  -> 4.65, 5.20, 5.85, 6.60 (margin 0.25 .. 0.4 m on both sides)
 *   floor 0 is the first pier: plain(0) - 0.2 = 3.0 above the ground (a level-0 jump + mantle, no double jump needed).
 * Gaps between piers (edge to edge) widen: 1.0, 1.5, 2.0, 2.5 m. A pier is 4.7 x 4.7 m: room for the three in-place
 * bounces that build the level (and a run-up).
 */

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
export const TOWER_GAPS = [0, 1.0, 1.5, 2.0, 2.5] as const;
export const PIER = 4.7;

/** World layout of the arena (x, z in metres; the arena lies north (-z) of the spawn). */
export const ARENA = {
  tower: { x: -20, z0: -40, size: PIER },
  poles: { z: -34, xs: [-7, -3.5, 0, 3.5, 7], radius: 0.7 },
  drums: { x: 18, z: [-38.5, -41.4, -44.3] as readonly number[] },
  house: { x: -6, z: -84, w: 5, d: 5, wall: 3.4 },
  ruko: { x: 8, z: -90, w: 7, d: 5.5 },
} as const;

export const round2 = (v: number): number => Math.round(v * 100) / 100;

export interface Slab {
  id: string;
  x: number;
  z: number;
  top: number;
  w: number;
  d: number;
}

/** Everything the builder needs that is computed (not just copied from ARENA). */
export interface ArenaLayout {
  poles: { id: string; x: number; z: number; top: number }[];
  drums: { id: string; x: number; z: number; top: number }[];
  drumLedge: Slab;
  floors: (Slab & { n: number })[];
  house: { crateA: Slab; crateB: Slab; awning: Slab; wall: number; roofH: number; roofW: number; roofD: number };
  ruko: { crateA: Slab; balcony: Slab; sign: Slab; signThick: number; wall: number; roofH: number; roofW: number; roofD: number };
}

const CRATE = 0.9;
const CRATE_W = 1.2;

function computeLayout(): ArenaLayout {
  const P = ARENA.poles;
  const poles = P.xs.map((x, i) => ({ id: `pole${i}`, x, z: P.z, top: L[i] - 0.2 }));

  const D = Parkour.world.drum;
  const dx = ARENA.drums.x;
  const drums = ARENA.drums.z.map((z, i) => ({ id: `drum${i + 1}`, x: dx, z, top: D.height }));
  const lastZ = ARENA.drums.z[ARENA.drums.z.length - 1];
  const ledgeTop = D.height + (reach.full(2) + 0.5 * (reach.full(3) - reach.full(2)));
  const drumLedge: Slab = { id: 'drumLedge', x: dx, z: lastZ - D.radius - 1.0 - PIER / 2, top: ledgeTop, w: PIER, d: PIER };

  const T = ARENA.tower;
  const floors: (Slab & { n: number })[] = [];
  let tz = T.z0;
  let ttop = 0;
  for (let n = 0; n < 5; n++) {
    if (n > 0) tz -= PIER + TOWER_GAPS[n];
    ttop += towerRise(n);
    floors.push({ n, id: `floor${n}`, x: T.x, z: tz, top: ttop, w: PIER, d: PIER });
  }

  const H = ARENA.house;
  const hzf = H.z + H.d / 2;
  const hCrateB: Slab = { id: 'houseCrateB', x: H.x - 0.6, z: hzf + 0.7, top: 2 * CRATE, w: CRATE_W, d: CRATE_W };
  const house = {
    crateA: { id: 'houseCrateA', x: H.x - 1.9, z: hzf + 0.7, top: 1 * CRATE, w: CRATE_W, d: CRATE_W },
    crateB: hCrateB,
    // The awning juts out 1.8 m: its outer half is well clear of the roof edge (which overhangs 0.4 m).
    awning: { id: 'houseAwning', x: H.x + 1.3, z: hzf + 1.0, top: hCrateB.top + 0.8, w: 2.2, d: 1.6 },
    wall: H.wall,
    roofH: 1.3,
    roofW: H.w + 0.6,
    roofD: H.d + 0.6,
  };

  // Mini ruko (class ruko: levels 2-3): ONE crate (0.9 m) is the only footing, and the balcony bay is a pier like a tower floor
  // whose top is gateRise(2) = 5.2 m above it: between what level 1 (4.9) and level 2 (5.5) can reach with the air jump and
  // the mantle. From the ground alone it needs level 3 (6.1 m <= 6.2 m); without the air jump it needs level 4 (plain 5.8 m).
  // (A second crate or any other footing next to the bay would lower the hop: the route level is the lowest over all ways up.)
  const R = ARENA.ruko;
  const rzf = R.z + R.d / 2;
  const crateTop = 1 * CRATE;
  const balconyTop = round2(crateTop + 0.5 * (reach.full(1) + reach.full(2)));
  const signTop = balconyTop + 0.75;
  const bw = 2.4;
  const bx = R.x - 0.4 + bw / 2 - 0.0;
  const ruko = {
    crateA: { id: 'rukoCrateA', x: R.x - 1.6, z: rzf + 0.7, top: crateTop, w: CRATE_W, d: CRATE_W },
    balcony: { id: 'rukoBalcony', x: bx, z: rzf + 0.9, top: balconyTop, w: bw, d: 1.8 },
    // The sign juts out past the roof edge (which overhangs 0.4 m) so there is room to stand on it.
    sign: { id: 'rukoSign', x: bx + bw / 2 + 0.5, z: rzf + 0.9, top: signTop, w: 1.0, d: 1.2 },
    signThick: 0.5,
    wall: balconyTop + 1.45,
    roofH: 1.5,
    roofW: R.w + 0.6,
    roofD: R.d + 0.6,
  };
  return { poles, drums, drumLedge, floors, house, ruko };
}

export const ARENA_LAYOUT: ArenaLayout = computeLayout();

/** Reward star positions (also the coins of the reachability test). */
export const ARENA_REWARDS = {
  drumLedge: { x: ARENA_LAYOUT.drumLedge.x, y: ARENA_LAYOUT.drumLedge.top, z: ARENA_LAYOUT.drumLedge.z, size: 0.45 },
  tower: { x: ARENA.tower.x, y: ARENA_LAYOUT.floors[4].top, z: ARENA_LAYOUT.floors[4].z, size: 1.1 },
  house: { x: ARENA.house.x, y: ARENA.house.wall + ARENA_LAYOUT.house.roofH * 0.92, z: ARENA.house.z, size: 0.4 },
  ruko: { x: ARENA.ruko.x, y: ARENA_LAYOUT.ruko.wall + ARENA_LAYOUT.ruko.roofH * 0.92, z: ARENA.ruko.z, size: 0.45 },
};

function computeReachData(): LevelReachData {
  const A = ARENA_LAYOUT;
  const plateau = Parkour.world.roofPlateau;
  const footholds: Foothold[] = [];
  for (const p of A.poles) footholds.push(cylinder(p.id, 'pole', p.x, p.z, ARENA.poles.radius, p.top, { group: 'poles' }));
  for (const d of A.drums) footholds.push(cylinder(d.id, 'drum', d.x, d.z, Parkour.world.drum.radius, d.top, { group: 'drums', bounce: true }));
  const slab = (s: Slab, kind: Foothold['kind'], o: { building?: string; group?: string; thickness?: number } = {}): void => {
    footholds.push(box(s.id, kind, s.x, s.z, s.w, s.d, s.top, o));
  };
  slab(A.drumLedge, 'pier', { group: 'drums' });
  for (const f of A.floors) slab(f, 'pier', { group: 'tower' });
  slab(A.house.crateA, 'crate', { building: 'house' });
  slab(A.house.crateB, 'crate', { building: 'house' });
  slab(A.house.awning, 'awning', { building: 'house', thickness: 0.25 });
  footholds.push(hipRoof('houseRoof', 'house', ARENA.house.x, ARENA.house.z, A.house.roofW, A.house.roofD, A.house.wall, A.house.roofH, plateau));
  slab(A.ruko.crateA, 'crate', { building: 'ruko' });
  slab(A.ruko.balcony, 'balcony', { building: 'ruko' });
  slab(A.ruko.sign, 'sign', { building: 'ruko', thickness: A.ruko.signThick });
  footholds.push(hipRoof('rukoRoof', 'ruko', ARENA.ruko.x, ARENA.ruko.z, A.ruko.roofW, A.ruko.roofD, A.ruko.wall, A.ruko.roofH, plateau));

  const buildings: Building[] = [
    { id: 'house', class: 'house', roofIds: ['houseRoof'], wall: A.house.wall, level: 1 },
    { id: 'ruko', class: 'ruko', roofIds: ['rukoRoof'], wall: A.ruko.wall, level: 3 },
  ];
  const R = ARENA_REWARDS;
  const coins: Coin[] = [
    { id: 'starHouse', pos: [R.house.x, R.house.y, R.house.z], on: 'houseRoof', level: 1 },
    { id: 'starRuko', pos: [R.ruko.x, R.ruko.y, R.ruko.z], on: 'rukoRoof', level: 3 },
    { id: 'starDrumLedge', pos: [R.drumLedge.x, R.drumLedge.y, R.drumLedge.z], on: 'drumLedge', level: 3 },
    { id: 'starTower', pos: [R.tower.x, R.tower.y, R.tower.z], on: 'floor4', level: 4 },
  ];
  const gates: Gate[] = [
    ...A.floors.map((f) => ({ foothold: f.id, level: f.n, notBelowLevel: f.n })),
    { foothold: 'drumLedge', level: 3, notBelowLevel: 3 },
  ];
  return { id: 'arena', starts: ['ground'], footholds, buildings, coins, gates };
}

export const ARENA_REACH: LevelReachData = computeReachData();
