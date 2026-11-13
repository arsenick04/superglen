import { Parkour } from '../../config/parkour';
import { box, cylinder, hipRoof, type Building, type Coin, type Foothold, type LevelReachData } from '../kits/ParkourData';
import { Z, STREET_HALF, BOUNDARY } from './Layout';
import type { C } from './Kit';

/**
 * Pure layout data of the Chapter 1 street (no three.js): `Street.ts` / `Building.ts` build exactly this, and
 * `scripts/reachability.ts` (`npm run check:reach`) checks it. Same pattern as `arena/ArenaData.ts`. Metres, world coordinates.
 *
 * THE STREET (PAKET_P1_PARKOUR.md section 3). Walking toward -Z, left (x < 0) and right (x > 0):
 *
 *   z     left (x = -10)               right (x = +10)
 *   +1.5  ruko  (L0)                   0.0 ruko  (R0)
 *   -5.5  ruko  (L1)                  -7.0 ruko  (R1)        jump barrier across the street at z = -9
 *  -12.5  ruko  (L2)                 -14.0 ruko  (R2)
 *         side street (low hedge)           side street (low planter)
 *  -28.0  house (L3)                 -29.5 house (R3)
 *  -33.6  house (L4)                  then the plaza and the old Barongsai building (landmark, z -42 ... -59.6)
 *  behind the spawn: the school wall (gate) and the school (z +5.5 ...), a ruko-class building
 *
 * CLASSES (Parkour.reachModel.classes):
 *   house    wall 3.4 - 3.8 m    levels 0-1: crates / AC unit / window ledge / shop awning up to the eave
 *   ruko     wall 6.65 - 7.9 m   levels 2-3: ONE big hop from the street (or from a 0.45 - 0.6 m kerb obstacle) onto a solid
 *                                "shop-front bay" with a balcony, then a sign board and the roof.
 *   landmark 11.9 m              level 4: lion > name plate > pillar > roof terrace (all easy), then one 6.4 m hop
 *                                onto the tower (needs level 4); the star waits on the tower roof.
 *
 * WHY THERE ARE NO EASY STEPS NEXT TO A RUKO: the route level of a roof is the lowest level over ALL ways up, so any
 * footing next to the bay lowers the hop. A bay at height `bay` needs level 2 from a footing `pad` m high when
 * bay - pad lies between full(1) = 4.9 m and full(2) = 5.5 m (level 3: 5.5 - 6.2 m); `gateBay` below picks the middle of that window.
 * Trees and lamps next to a ruko therefore have no collider (they are soft scenery the child walks through).
 */

/** Colour names of the palette in Kit.ts (the builders turn them into numbers; this module stays three.js free). */
export type ColorKey = keyof typeof C;

// ---- Reach numbers (all derived from src/config/parkour.ts) -----------------------------------------------------------------

const APEX = Parkour.levels.map((l) => l.apex);
const MANTLE_UP = 1.1 /* PlayerConfig.height */ + Parkour.mantle.maxAboveHead;
/** Highest solid top reachable from a footing by level lv with the air jump and the mantle. */
const full = (lv: number): number => APEX[lv] + Parkour.doubleJumpApex + MANTLE_UP;
/** Middle of the window "needs level lv": between full(lv - 1) and full(lv). */
export const gateRise = (lv: number): number => Math.round(((full(lv - 1) + full(lv)) / 2) * 100) / 100;

/** Height of the street kerb obstacles (hedge, planter, garden walls) and of the jump barrier (JumpTutorial.BARRIER_H). */
export const LOW = 0.6;
const BARRIER_H = 0.45;
/** Eave height above the sign board (the sign is the last step before the roof, like the arena ruko). */
const SIGN_UP = 0.75;
const EAVE_UP = 1.45;

// ---- Piece records (builder input) ---------------------------------------------------------------------------------------------

export type PieceType = 'crate' | 'ac' | 'ledge' | 'bay' | 'sign' | 'awning' | 'tank';

export interface Piece {
  id: string;
  type: PieceType;
  building: string;
  /** Centre of the footprint (x along the street width, z along the street). */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Height of the standable top. */
  top: number;
  /** Cantilever slab thickness (omit: solid down to the ground). */
  thick?: number;
  /** Crates in the stack. */
  n?: number;
  /** Horizontal unit vector the piece looks toward (toward the street). */
  face: readonly [number, number];
}

export interface RouteStep {
  id: string;
  /** Rhythm level at which this hop is designed to be just possible (with the air jump); the bots use it. */
  needs: number;
}

export interface StreetBuilding {
  id: string;
  cls: 'house' | 'ruko';
  side: -1 | 1;
  /** Centre z. */
  z: number;
  /** Eave height (m). */
  wall: number;
  floors: number;
  wallColor: ColorKey;
  roofColor: ColorKey;
  shop: boolean;
  /** Level the route of this building is designed for (checker: reachable at this level; the real minimum may be lower
   *  when a neighbouring roof or the school wall gives a way up). */
  level: number;
  pieces: Piece[];
  roof: { id: string; cx: number; cz: number; w: number; d: number; h: number };
  route: RouteStep[];
}

/** Body footprint (x, z) of a building: houses are shallower so the side streets stay wide (the reach checker needs the gap). */
export const BODY = { ruko: { w: 6, d: 7.2 }, house: { w: 6, d: 5.6 } } as const;
const ROOF_OVER = 0.3;
const ROOF_H = 2.0;

const faceOf = (side: number): readonly [number, number] => [-side, 0];
/** Centre x of a piece that sticks out `p` m from the wall of the given side. */
const stickX = (side: number, p: number): number => side * (STREET_HALF - p / 2);

type Spec = [id: string, cls: 'house' | 'ruko', side: -1 | 1, z: number, wallColor: ColorKey, roofColor: ColorKey, shop: boolean, floors: number, level: number, pad: number, variant: 'bay' | 'shopCrates' | 'acLedge', wall?: number];

const SPECS: Spec[] = [
  // Left: three rukos near the school, then two houses behind the side street.
  ['rukoL1.5', 'ruko', -1, 1.5, 'PEACH', 'RED', false, 3, 3, 0, 'bay'],
  ['rukoL-5.5', 'ruko', -1, -5.5, 'SKY', 'DEEP_RED', true, 3, 2, BARRIER_H, 'bay'],
  ['rukoL-12.5', 'ruko', -1, -12.5, 'YELLOW', 'TEAL', false, 3, 3, LOW, 'bay'],
  ['houseL-28', 'house', -1, -28, 'MINT', 'RED', true, 1, 1, 0, 'shopCrates', 3.6],
  ['houseL-33.6', 'house', -1, -33.6, 'LILAC', 'DEEP_RED', false, 1, 0, 0, 'acLedge', 3.4],
  // Right: three rukos, then one house.
  ['rukoR0', 'ruko', 1, 0, 'MINT', 'DEEP_RED', false, 2, 2, 0, 'bay'],
  ['rukoR-7', 'ruko', 1, -7, 'PINK', 'TEAL', true, 3, 3, BARRIER_H, 'bay'],
  ['rukoR-14', 'ruko', 1, -14, 'SKY', 'RED', false, 3, 2, LOW, 'bay'],
  ['houseR-29.5', 'house', 1, -29.5, 'YELLOW', 'DEEP_RED', true, 1, 1, 0, 'shopCrates', 3.8],
];

function makeBuilding(s: Spec): StreetBuilding {
  const [id, cls, side, z, wallColor, roofColor, shop, floors, level, pad, variant, wallOpt] = s;
  const face = faceOf(side);
  const pieces: Piece[] = [];
  const route: RouteStep[] = [];
  let wall = wallOpt ?? 0;
  const P = (p: Omit<Piece, 'building' | 'face'>): Piece => {
    const piece: Piece = { ...p, building: id, face };
    pieces.push(piece);
    return piece;
  };
  if (variant === 'bay') {
    // Shop-front bay (solid from the ground) with a balcony on top; a sign board beside it; the roof one step above.
    const bay = Math.round((pad + gateRise(level)) * 100) / 100;
    wall = Math.round((bay + EAVE_UP) * 100) / 100;
    const bayZ = z + 1.1;
    P({ id: `${id}:bay`, type: 'bay', x: stickX(side, 1.8), z: bayZ, w: 1.8, d: 2.4, top: bay });
    P({ id: `${id}:sign`, type: 'sign', x: stickX(side, 1.2), z: bayZ - 1.7, w: 1.2, d: 1.0, top: Math.round((bay + SIGN_UP) * 100) / 100, thick: 0.5 });
    route.push({ id: `${id}:bay`, needs: level }, { id: `${id}:sign`, needs: 0 });
  } else if (variant === 'shopCrates') {
    // The striped shop awning (built by Street.ts, registered below) is reached from a crate stack at one end.
    P({ id: `${id}:crateB`, type: 'crate', x: stickX(side, 1.2), z: z - 2.3, w: 1.2, d: 1.2, top: 1.8, n: 2 });
    P({ id: `${id}:crateA`, type: 'crate', x: stickX(side, 1.2), z: z + 2.3, w: 1.2, d: 1.2, top: 0.9, n: 1 });
    route.push({ id: `${id}:crateB`, needs: 0 });
  } else {
    P({ id: `${id}:crateA`, type: 'crate', x: stickX(side, 1.2), z: z + 2.3, w: 1.2, d: 1.2, top: 0.9, n: 1 });
    P({ id: `${id}:ac`, type: 'ac', x: stickX(side, 0.9), z: z - 2.0, w: 0.9, d: 1.2, top: 1.9, thick: 0.8 });
    P({ id: `${id}:ledge`, type: 'ledge', x: stickX(side, 0.7), z: z + 0.6, w: 0.7, d: 2.4, top: 2.8, thick: 0.5 });
    route.push({ id: `${id}:ac`, needs: 0 }, { id: `${id}:ledge`, needs: 0 });
  }
  const roof = { id: `${cls}${side > 0 ? 'R' : 'L'}${z}`, cx: side * (STREET_HALF + 3), cz: z, w: BODY[cls].w + 2 * ROOF_OVER, d: BODY[cls].d + 2 * ROOF_OVER, h: ROOF_H };
  route.push({ id: roof.id, needs: 0 });
  return { id, cls, side, z, wall, floors, wallColor, roofColor, shop, level, pieces, roof, route };
}

export const STREET_BUILDINGS: StreetBuilding[] = SPECS.map(makeBuilding);

/** The striped shop awning over the door of a shop house (a 14 degree tilted box, built by Street.ts). */
export function shopAwning(b: StreetBuilding): { id: string; x: number; z: number; w: number; d: number; top: number } {
  const side = b.side;
  return { id: `awning${side > 0 ? 'R' : 'L'}${b.z}`, x: side * (STREET_HALF - 0.55), z: b.z, w: 1.1, d: 3.1, top: 2.62 };
}

// ---- Scenery that has a collider (and therefore is a foothold) -------------------------------------------------------------------

/** [x, z, scale, solid]: trees along the sidewalks. Next to a ruko they are soft (no collider): see the header. */
export const TREES: readonly (readonly [number, number, number, boolean])[] = [
  [-5.9, -1, 1, false],
  [5.9, -3, 1.1, false],
  [-5.9, -9.8, 0.9, false],
  [5.9, -11, 1, false],
  [-5.9, -23, 1.1, true],
  [5.9, -27.5, 1, true],
  [-5.9, -30, 1, true],
  [-10.5, -39.5, 1.2, true],
  [11, -40, 1.2, true],
  [9.2, -34.5, 1.0, true],
];
/** [x, z, solid]: street lamps. */
export const LAMPS: readonly (readonly [number, number, boolean])[] = [
  [-3.6, -4, false],
  [3.6, -6, false],
  [-3.6, -14, false],
  [3.6, -17, false],
  [-3.6, -26, true],
  [3.6, -23, false],
  [-3.6, -33, true],
  [3.6, -33, true],
];

/** The low side-street closings (hedge on the left, planter on the right) and the garden walls behind them. */
export const SIDE_STREETS = {
  hedgeL: { x: -STREET_HALF - 0.5, z: -20.2, w: 1.0, d: 8.8, top: LOW },
  pocketL: [
    { id: 'pocketLN', x: -10, z: -24.7, w: 6, d: 0.6 },
    { id: 'pocketLB', x: -13.2, z: -20.1, w: 0.6, d: 9.8 },
    { id: 'pocketLS', x: -10, z: -15.5, w: 6, d: 0.6 },
  ],
  planterR: { x: STREET_HALF + 0.5, z: -21.8, w: 1.0, d: 8.8, top: LOW },
  pocketR: [
    { id: 'pocketRN', x: 10, z: -26.2, w: 6, d: 0.6 },
    { id: 'pocketRB', x: 13.2, z: -21.6, w: 0.6, d: 9.8 },
    { id: 'pocketRS', x: 10, z: -17.0, w: 6, d: 0.6 },
  ],
} as const;

/** Plaza hedge in front of the Barongsai building (a 1.5 m hedge row). */
export const PLAZA_HEDGE = { x: -10.5, z: -36.6, w: 5.6, d: 0.9, top: 1.5 } as const;
/** Plaza benches: seat 0.5 m, backrest 1.0 m. */
export const BENCHES = [-9, 9] as const;

// ---- School ---------------------------------------------------------------------------------------------------------------------

export const SCHOOL = {
  wallZ: Z.schoolWall,
  wallTop: 4.8,
  capTop: 5.15,
  roofTop: 7.0,
  roofW: BOUNDARY * 2 + 1,
  roofD: 12.2,
  roofZ: Z.schoolWall + 6.6,
} as const;

// ---- The old Barongsai building (landmark) ---------------------------------------------------------------------------------------

export const LANDMARK = {
  id: 'barongsai',
  /** Flat terrace on the hall: top of the slab with its gold trim (the launch pad for the tower hop). */
  terraceTop: 5.49,
  terrace: { cx: 0, cz: -50.7, w: 19.5, d: 17.7 },
  /** The wing caps beside the door are at the terrace level. */
  wingTop: 5.5,
  /** Tower: a solid block from the terrace up to the roof eave; the walkable hip roof sits on it. */
  tower: { cx: 0, cz: -49.0, w: 9, d: 9, eave: 11.9, roofH: 2.0 },
  lion: { x: 4.4, z: Z.facade + 1.0, r: 0.62, top: 2.1 },
  nameplate: { x: 0, z: Z.facade + 0.2, w: 5.2, d: 0.5, top: 3.8, thick: 0.5 },
  pillar: { x: 2.45, z: Z.facade + 0.5, r: 0.55, top: 5.4 },
} as const;

// ---- Reach data ----------------------------------------------------------------------------------------------------------------------

const slabKind: Record<PieceType, Foothold['kind']> = { crate: 'crate', ac: 'ac', ledge: 'ledge', bay: 'balcony', sign: 'sign', awning: 'awning', tank: 'other' };

export function pieceFoothold(p: Piece): Foothold {
  return box(p.id, slabKind[p.type], p.x, p.z, p.w, p.d, p.top, { building: p.building, thickness: p.thick });
}

function computeReachData(): LevelReachData {
  const plateau = Parkour.world.roofPlateau;
  const footholds: Foothold[] = [];
  const buildings: Building[] = [];
  const coins: Coin[] = [];
  const greenLinks: [string, string][] = [];
  const coin = (id: string, x: number, y: number, z: number, on: string, level?: number): void => void coins.push({ id, pos: [x, y, z], on, level });
  const lift = 0.85;

  for (const b of STREET_BUILDINGS) {
    for (const p of b.pieces) footholds.push(pieceFoothold(p));
    if (b.shop && b.cls === 'house') {
      const a = shopAwning(b);
      footholds.push(box(a.id, 'awning', a.x, a.z, a.w, a.d, a.top, { building: b.id, thickness: 0.14 }));
    }
    const r = b.roof;
    footholds.push(hipRoof(r.id, b.id, r.cx, r.cz, r.w, r.d, b.wall, r.h, plateau));
    buildings.push({ id: b.id, class: b.cls, roofIds: [r.id], wall: b.wall, level: b.level });
  }
  // Neighbouring roofs of one terrace (rule 4): they touch, and their eaves differ by less than 1.5 m.
  const byTerrace = (side: number, lo: number, hi: number): StreetBuilding[] => STREET_BUILDINGS.filter((b) => b.side === side && b.z <= hi && b.z >= lo);
  for (const [side, lo, hi] of [[-1, -14, 2], [1, -15, 1], [-1, -34, -25]] as const) {
    const list = byTerrace(side, lo, hi).sort((a, c) => c.z - a.z);
    for (let i = 0; i + 1 < list.length; i++) {
      if (Math.abs(list[i].wall - list[i + 1].wall) <= 1.5) greenLinks.push([list[i].roof.id, list[i + 1].roof.id]);
    }
  }

  // Coin trails: ground > pieces > roof, always over a foothold the building's level can reach.
  for (const b of STREET_BUILDINGS) {
    const gp = b.pieces[0];
    coin(`${b.id}:c0`, gp.x - b.side * 1.9, lift, gp.z, 'ground');
    b.pieces.forEach((p, i) => coin(`${b.id}:c${i + 1}`, p.x, p.top + lift, p.z, p.id));
    coin(`${b.id}:cRoof`, b.roof.cx, b.wall + b.roof.h * (1 - plateau) + lift, b.roof.cz, b.roof.id);
  }

  // School: the wall cap (a ruko-class gate: nothing low next to it) and the flat roof behind.
  const S = SCHOOL;
  footholds.push(box('schoolWallCap', 'other', 0, S.wallZ + 0.3, BOUNDARY * 2, 0.8, S.capTop, { building: 'school' }));
  footholds.push({ ...box('schoolRoof', 'roof', 0, S.roofZ, S.roofW, S.roofD, S.roofTop, { building: 'school' }), isRoof: true });
  buildings.push({ id: 'school', class: 'ruko', roofIds: ['schoolRoof'], wall: S.roofTop, level: 2 });
  coin('school:c0', 0, lift, S.wallZ - 2.5, 'ground');
  coin('school:c1', -3, S.capTop + lift, S.wallZ + 0.3, 'schoolWallCap');
  coin('school:c2', 3, S.capTop + lift, S.wallZ + 0.3, 'schoolWallCap');
  coin('school:star', 0, S.roofTop, S.roofZ + 1, 'schoolRoof', 2);

  // Landmark.
  const L = LANDMARK;
  for (const s of [-1, 1]) {
    footholds.push(cylinder(`lion${s > 0 ? 'R' : 'L'}`, 'pole', s * L.lion.x, L.lion.z, L.lion.r, L.lion.top, { group: 'landmark' }));
    footholds.push(cylinder(`pillar${s > 0 ? 'R' : 'L'}`, 'pole', s * L.pillar.x, L.pillar.z, L.pillar.r, L.pillar.top, { group: 'landmark' }));
  }
  const np = L.nameplate;
  footholds.push(box('nameplate', 'ledge', np.x, np.z, np.w, np.d, np.top, { building: L.id, thickness: np.thick }));
  footholds.push({ ...box('terrace', 'roof', L.terrace.cx, L.terrace.cz, L.terrace.w, L.terrace.d, L.terraceTop, { building: L.id }), isRoof: true });
  for (const s of [-1, 1]) {
    // wing walls: x from 8 to 13.5 (see Building.ts)
    const x0 = 8;
    const x1 = BOUNDARY + 0.5;
    footholds.push(box(`wingCap${s > 0 ? 'R' : 'L'}`, 'other', s * (x0 + x1) / 2, Z.facade - 0.3, x1 - x0, 0.8, L.wingTop, { building: L.id }));
  }
  const T = L.tower;
  footholds.push(hipRoof('barongsaiRoof2', L.id, T.cx, T.cz, T.w, T.d, T.eave, T.roofH, plateau));
  buildings.push({ id: L.id, class: 'landmark', roofIds: ['barongsaiRoof2'], wall: T.eave, level: 4 });
  coin('lm:c0', L.lion.x, lift, L.lion.z + 2.2, 'ground');
  coin('lm:c1', L.lion.x, L.lion.top + lift, L.lion.z, 'lionR');
  coin('lm:c2', 1.2, np.top + lift, np.z, 'nameplate');
  coin('lm:c3', L.pillar.x, L.pillar.top + lift, L.pillar.z, 'pillarR');
  coin('lm:c4', 0, L.terraceTop + lift, Z.facade - 3, 'terrace');
  coin('lm:star', T.cx, T.eave + T.roofH * (1 - plateau), T.cz, 'barongsaiRoof2', 4);

  // Everything else with a collider is a foothold too (the checker must see the shortcuts a child could find).
  for (const [i, [x, z, s, solid]] of TREES.entries()) if (solid) footholds.push(cylinder(`tree${i}`, 'pole', x, z, 0.2 * s, 1.5 * s, { group: 'scenery' }));
  for (const [i, [x, z, solid]] of LAMPS.entries()) if (solid) footholds.push(cylinder(`lamp${i}`, 'pole', x, z, 0.3, 3.63, { group: 'scenery' }));
  const SS = SIDE_STREETS;
  footholds.push(box('hedgeL', 'other', SS.hedgeL.x, SS.hedgeL.z, SS.hedgeL.w, SS.hedgeL.d, LOW, { group: 'scenery' }));
  footholds.push(box('planterR', 'other', SS.planterR.x, SS.planterR.z, SS.planterR.w, SS.planterR.d, LOW, { group: 'scenery' }));
  for (const w of [...SS.pocketL, ...SS.pocketR]) footholds.push(box(w.id, 'other', w.x, w.z, w.w, w.d, LOW, { group: 'scenery' }));
  footholds.push(box('plazaHedge', 'other', PLAZA_HEDGE.x, PLAZA_HEDGE.z, PLAZA_HEDGE.w, PLAZA_HEDGE.d, PLAZA_HEDGE.top, { group: 'scenery' }));
  for (const x of BENCHES) {
    footholds.push(box(`benchSeat${x}`, 'other', x, -37.3, 1.8, 0.5, 0.5, { group: 'scenery' }));
    footholds.push(box(`benchBack${x}`, 'other', x, -37.5, 1.8, 0.1, 1.0, { group: 'scenery' }));
  }
  footholds.push(box('barrier', 'other', 0, Z.barrier, STREET_HALF * 2 + 0.4, 0.6, BARRIER_H, { group: 'scenery' }));

  return { id: 'bab1', starts: ['ground'], footholds, buildings, coins, gates: [], greenLinks };
}

export const STREET_REACH: LevelReachData = computeReachData();

/** Routes of the buildings for the smoke test: ordered foothold ids with the level each hop is designed for. */
export function streetRoutes(): Record<string, RouteStep[]> {
  const r: Record<string, RouteStep[]> = {};
  for (const b of STREET_BUILDINGS) r[b.id] = b.route;
  r.school = [
    { id: 'schoolWallCap', needs: 2 },
    { id: 'schoolRoof', needs: 0 },
  ];
  r[LANDMARK.id] = [
    { id: 'lionR', needs: 0 },
    { id: 'nameplate', needs: 0 },
    { id: 'pillarR', needs: 0 },
    { id: 'terrace', needs: 0 },
    { id: 'barongsaiRoof2', needs: 4 },
  ];
  return r;
}

