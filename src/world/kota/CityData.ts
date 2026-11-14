import { Parkour } from '../../config/parkour';
import { topOf, type Building, type BuildingClass, type Foothold, type LevelReachData } from '../kits/ParkourData';

/**
 * KOTA BOTANICA: the open-world city as PURE DATA (no three.js, no Rapier, no DOM). `CityBuilder.ts` turns it into meshes
 * and colliders, `scripts/reachability.ts` (`npm run check:reach`) checks every building of it (KOTA_REACH below). Same
 * pattern as `bab1/StreetData.ts`: the checked layout cannot drift from the built one, because the COLLIDERS themselves
 * (`Solid`) are what both read.
 *
 * MAP (300 x 300 m, x to the east, -z to the north). Nine 100 m cells; main avenues on the cell borders (x, z = +-50);
 * every ordinary cell has a cross of local streets that splits it into four blocks. A district owns one or two cells:
 *
 *            x: -150 ........ -50 ........ +50 ........ +150
 *   z -150   [ sekolah (NW) ][ sekolah (N)  ][ bukit (NE)   ]   bukit: hill + forest, the OLD BARONGSAI BUILDING (hidden)
 *   z  -50   [ perumahan (W)][ alun-alun (C)][ pasar (E)    ]   alun-alun: clock tower, plaza, gardens (spawn)
 *   z  +50   [ perumahan (SW)][ bank + RS (S)][ pasar (SE)  ]
 *
 * Every district has a colour (ground tint, roofs, banners) and ONE tall landmark (10-12 m, rhythm level 4 to the top) a
 * five-year-old can steer by. Chunks of `CITY.chunk` m (a 6 x 6 grid) are the streaming unit: two by two chunks per cell.
 *
 * TO ADD CONTENT (D2-D4): add a block type in `fillBlock` or push into `layout.props` / `layout.pois` from a district
 * function, then run `npm run check:reach`. Every collider must be created through a `Solid` so the checker sees it.
 * Randomness only through the seeded `rng` (fixed `CITY.seed`): the same city on every device and every run.
 */

// ---- Constants ---------------------------------------------------------------------------------------------------------------

export const CITY = {
  seed: 0x5b07a1ca,
  /** Half size of the world square (m). Ground and boundary hills go a bit beyond. */
  half: 150,
  /** Soft boundary: from here (minus `boundsMargin`) the player is turned back gently, walking or flying. */
  playHalf: 138,
  boundsMargin: 8,
  boundsPush: 4,
  /** Zone where buildings may stand (outer cells end here; between this and playHalf: forest and hedges). */
  buildHalf: 128,
  /** Streaming chunk edge (m): 6 x 6 chunks. */
  chunk: 50,
  /** Main avenue: corridor half width (asphalt + sidewalks) and asphalt half width. */
  main: { half: 8, road: 5 },
  /** Local street through the middle of a cell. */
  local: { half: 6, road: 3.5 },
  /** Facade line distance from the block edge (pieces stick out up to 1.8 m in front of it). */
  setback: 2.2,
  /** Gap between neighbouring buildings of a row (green route: < 3 m between roofs). */
  rowGap: 2.4,
  /**
   * Props (trees, lamps, benches) closer than this to a ruko or landmark get NO collider: any footing next to a gated
   * building lowers the rhythm level its route needs (see StreetData.ts "WHY THERE ARE NO EASY STEPS NEXT TO A RUKO").
   */
  gateClear: 9,
  /** Flight ceiling above the ground below (m): a bit above the landmarks. */
  flyHeight: 16,
} as const;

export const CHUNKS = Math.round((CITY.half * 2) / CITY.chunk);

/** Chunk index (0 .. CHUNKS^2 - 1) of a point; points outside the grid clamp to the border chunks. */
export function chunkIndex(x: number, z: number): number {
  const n = CHUNKS;
  const cx = Math.max(0, Math.min(n - 1, Math.floor((x + CITY.half) / CITY.chunk)));
  const cz = Math.max(0, Math.min(n - 1, Math.floor((z + CITY.half) / CITY.chunk)));
  return cz * n + cx;
}

// ---- Districts ---------------------------------------------------------------------------------------------------------------

export type DistrictId = 'perumahan' | 'sekolah' | 'alun' | 'pasar' | 'bank' | 'bukit';

export interface District {
  id: DistrictId;
  /** Visible name (Indonesian). */
  name: string;
  /** Signature colour: landmark, banners, roofs lean toward it. */
  color: number;
  /** Ground tint of the district's blocks. */
  ground: number;
  walls: readonly number[];
  roofs: readonly number[];
  /** Macro cells (-1..1, -1..1) = (x, z). */
  cells: readonly (readonly [number, number])[];
}

export const DISTRICTS: readonly District[] = [
  { id: 'perumahan', name: 'Perumahan', color: 0xff8fb1, ground: 0x9fdc86, walls: [0xffe0e8, 0xffd6c2, 0xfff1d6, 0xffc9de, 0xe9f7d8], roofs: [0xe8577e, 0xd9432f, 0xc94f7c], cells: [[-1, 0], [-1, 1]] },
  { id: 'sekolah', name: 'Sekolah', color: 0x4dabf7, ground: 0x93d987, walls: [0xd8ecff, 0xfff1d6, 0xcde8ff, 0xe8f4ff], roofs: [0x2f7fd1, 0x3b8fe0, 0x245fa8], cells: [[-1, -1], [0, -1]] },
  { id: 'alun', name: 'Alun-alun', color: 0xf2b632, ground: 0x8fd67a, walls: [0xfff1d6, 0xffe8b0, 0xfff7e0], roofs: [0xd9432f, 0xc0392b, 0xe0a020], cells: [[0, 0]] },
  { id: 'pasar', name: 'Pasar', color: 0xff9f43, ground: 0xa6d98a, walls: [0xffe2c0, 0xfff1d6, 0xffd29a, 0xfde7cf], roofs: [0xf07b1f, 0xd9632f, 0xe8902a], cells: [[1, 0], [1, 1]] },
  { id: 'bank', name: 'Bank dan Rumah Sakit', color: 0x2ec4b6, ground: 0x96d98c, walls: [0xffffff, 0xe6faf7, 0xf1fbff, 0xdff5f0], roofs: [0x1e9e92, 0x2ec4b6, 0x23887e], cells: [[0, 1]] },
  { id: 'bukit', name: 'Bukit Pinggir Kota', color: 0x5fbf5a, ground: 0x7cc566, walls: [0xf3e2c4, 0xe9d6b0], roofs: [0x8a5a3c, 0x9c6b45], cells: [[1, -1]] },
];

export function districtById(id: DistrictId): District {
  return DISTRICTS.find((d) => d.id === id) as District;
}

/** Zone (where blocks and buildings go) of a macro cell: [x0, x1, z0, z1]. */
export function cellZone(i: number, j: number): [number, number, number, number] {
  const a = (k: number): [number, number] => [k === -1 ? -CITY.buildHalf : k * 100 - 50 + CITY.main.half, k === 1 ? CITY.buildHalf : k * 100 + 50 - CITY.main.half];
  const [x0, x1] = a(i);
  const [z0, z1] = a(j);
  return [x0, x1, z0, z1];
}

/** District at a point (the cell it lies in; outside the grid: the nearest cell). */
export function districtAt(x: number, z: number): District {
  const i = Math.max(-1, Math.min(1, Math.floor((x + 50) / 100)));
  const j = Math.max(-1, Math.min(1, Math.floor((z + 50) / 100)));
  for (const d of DISTRICTS) for (const [ci, cj] of d.cells) if (ci === i && cj === j) return d;
  return DISTRICTS[2];
}

// ---- Reach numbers (from src/config/parkour.ts only) ------------------------------------------------------------------------------

const APEX = Parkour.levels.map((l) => l.apex);
const MANTLE_UP = 1.1 /* PlayerConfig.height */ + Parkour.mantle.maxAboveHead;
const full = (lv: number): number => APEX[lv] + Parkour.doubleJumpApex + MANTLE_UP;
/** Middle of the window "needs level lv" (same formula as StreetData.gateRise). */
export const gateRise = (lv: number): number => Math.round(((full(lv - 1) + full(lv)) / 2) * 100) / 100;
const r2 = (v: number): number => Math.round(v * 100) / 100;

// ---- Records -----------------------------------------------------------------------------------------------------------------------

/** Facade direction: 0 = +z, 1 = -z, 2 = +x, 3 = -x. */
export type Facing = 0 | 1 | 2 | 3;
export const FACE_VEC: readonly (readonly [number, number])[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

export type PieceType = 'crate' | 'ac' | 'awning' | 'bay' | 'sign' | 'podium';

/** A climbing piece in world coordinates (drawn size; the collider is `Parkour.world.friendly` wider on every side). */
export interface CityPiece {
  id: string;
  type: PieceType;
  x: number;
  z: number;
  /** World size along x and z. */
  w: number;
  d: number;
  /** Absolute height of the standable top. */
  top: number;
  /** Cantilever slab thickness (omit: solid down to the base). */
  thick?: number;
  /** Crates in a stack. */
  n?: number;
}

export type BuildingKind = 'house' | 'ruko' | 'kiosk' | 'school' | 'bank' | 'hospital' | 'gudang' | 'tower' | 'oldBarongsai';
export type TowerStyle = 'clock' | 'bell' | 'water' | 'pagoda' | 'coin';

export interface CityBuilding {
  id: string;
  district: DistrictId;
  cls: BuildingClass;
  kind: BuildingKind;
  /** Body centre and world size (x, z). */
  x: number;
  z: number;
  w: number;
  d: number;
  face: Facing;
  /** Ground height under the building (the hill top for the old building). */
  base: number;
  /** Eave / flat roof height above the base (the class check). */
  wall: number;
  /** Rhythm level the roof is designed for. */
  level: number;
  roof: 'hip' | 'flat';
  roofId: string;
  /** Hip roof: base size (with overhang) and height. */
  roofW: number;
  roofD: number;
  roofH: number;
  wallColor: number;
  roofColor: number;
  floors: number;
  pieces: CityPiece[];
  tower?: { style: TowerStyle; round: boolean; podium: number; size: number };
  glen?: boolean;
  abandoned?: boolean;
}

export interface CityTree {
  x: number;
  z: number;
  s: number;
  kind: 'round' | 'pine';
  base: number;
  solid: boolean;
  /** Drawn in the always-visible far layer (the pines that hide the old building on the hill). */
  far?: boolean;
}

export interface CityLamp {
  x: number;
  z: number;
  solid: boolean;
}

export interface CityBench {
  x: number;
  z: number;
  /** Long axis along x (true) or z. */
  alongX: boolean;
  solid: boolean;
}

export type GroundKind = 'grass' | 'paving' | 'plaza' | 'field' | 'dirt' | 'water' | 'flowers' | 'sand';
export interface GroundRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  kind: GroundKind;
  color?: number;
}

/** Point of interest: the district HUD shows its name when the player comes close. */
export interface Poi {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

/** A collider and what the reach checker sees of it. Every collider of the city is a Solid. */
export interface Solid {
  id: string;
  shape: 'box' | 'cyl' | 'hull';
  /** Centre and size of the COLLIDER (box: x, y, z extents; cyl: diameter, height, diameter). */
  c: [number, number, number];
  s: [number, number, number];
  /** Hull points (x, y, z triples) for shape 'hull'. */
  hull?: number[];
  /** Always loaded (ground, hills, boundary) instead of streamed with its chunk. */
  global?: boolean;
  /** Chunk it streams with (set by the generator from its owner's position). */
  chunk: number;
  /** The checker's view (drawn size). Undefined: covered by another foothold (a wall under its roof) or outside the play area. */
  foothold?: Foothold;
}

export interface CityHill {
  id: string;
  x: number;
  z: number;
  rBottom: number;
  rTop: number;
  h: number;
}

export interface CityLayout {
  buildings: CityBuilding[];
  trees: CityTree[];
  lamps: CityLamp[];
  benches: CityBench[];
  ground: GroundRect[];
  roads: { x0: number; z0: number; x1: number; z1: number; main: boolean }[];
  ponds: { x: number; z: number; r: number }[];
  hills: CityHill[];
  /** Low decorative things without colliders (fence posts, flower beds, goals) as simple records. */
  fences: { x0: number; z0: number; x1: number; z1: number; base0: number; base1: number; broken: boolean }[];
  goals: { x: number; z: number; alongX: boolean }[];
  banners: { x: number; z: number; color: number }[];
  pois: Poi[];
  solids: Solid[];
  /** The hidden old Barongsai building and the hook point at its door. */
  lab: { building: string; door: { x: number; y: number; z: number }; hill: string };
  spawn: { x: number; y: number; z: number; yaw: number };
  greenLinks: [string, string][];
}

// ---- Seeded random -----------------------------------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Generator ---------------------------------------------------------------------------------------------------------------------

const FRIENDLY = Parkour.world.friendly;
const W = Parkour.world;

class Gen {
  readonly L: CityLayout = {
    buildings: [],
    trees: [],
    lamps: [],
    benches: [],
    ground: [],
    roads: [],
    ponds: [],
    hills: [],
    fences: [],
    goals: [],
    banners: [],
    pois: [],
    solids: [],
    lab: { building: '', door: { x: 0, y: 0, z: 0 }, hill: '' },
    spawn: { x: 0, y: 0, z: 22, yaw: Math.PI },
    greenLinks: [],
  };
  readonly rng: () => number;
  private n = 0;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.rng() * a.length) % a.length];
  }

  uid(p: string): string {
    return `${p}${this.n++}`;
  }

  // ---- Buildings ---------------------------------------------------------------------------------------

  /** Body size in world x / z for a facade direction. */
  private dims(face: Facing, along: number, deep: number): [number, number] {
    return face < 2 ? [along, deep] : [deep, along];
  }

  /** A piece sticking `out` m out of the facade, `at` m along it (tangent = facade rotated clockwise), `len` m long. */
  private piece(b: CityBuilding, id: string, type: PieceType, at: number, out: number, len: number, top: number, extra: { thick?: number; n?: number } = {}): CityPiece {
    const [fx, fz] = FACE_VEC[b.face];
    const ux = -fz;
    const uz = fx;
    const half = b.face < 2 ? b.d / 2 : b.w / 2;
    const cx = b.x + fx * (half + out / 2) + ux * at;
    const cz = b.z + fz * (half + out / 2) + uz * at;
    const [w, d] = b.face < 2 ? [len, out] : [out, len];
    const p: CityPiece = { id: `${b.id}:${id}`, type, x: r2(cx), z: r2(cz), w, d, top: r2(top), ...extra };
    b.pieces.push(p);
    return p;
  }

  building(o: { district: DistrictId; kind: BuildingKind; cls: BuildingClass; x: number; z: number; face: Facing; along: number; deep: number; base?: number; roof: 'hip' | 'flat'; level: number; wallColor?: number; roofColor?: number }): CityBuilding {
    const dist = districtById(o.district);
    const [w, d] = this.dims(o.face, o.along, o.deep);
    const id = this.uid(`${o.district}-${o.kind}-`);
    const b: CityBuilding = {
      id,
      district: o.district,
      cls: o.cls,
      kind: o.kind,
      x: r2(o.x),
      z: r2(o.z),
      w,
      d,
      face: o.face,
      base: o.base ?? 0,
      wall: 0,
      level: o.level,
      roof: o.roof,
      roofId: `${id}:roof`,
      roofW: w + 0.2,
      roofD: d + 0.2,
      roofH: 1.6,
      wallColor: o.wallColor ?? this.pick(dist.walls),
      roofColor: o.roofColor ?? this.pick(dist.roofs),
      floors: 1,
      pieces: [],
    };
    this.L.buildings.push(b);
    return b;
  }

  /** One-storey house (class house, levels 0-1): AC unit + door canopy, or crates + shop awning. */
  house(district: DistrictId, x: number, z: number, face: Facing): CityBuilding {
    const b = this.building({ district, kind: 'house', cls: 'house', x, z, face, along: 6, deep: 5.6, roof: 'hip', level: 1 });
    b.wall = this.pick([3.4, 3.6, 3.8]);
    if (this.rng() < 0.6) {
      this.piece(b, 'ac', 'ac', -2.0, 1.4, 1.2, 1.9, { thick: 0.8 });
      this.piece(b, 'canopy', 'awning', 0.6, 1.7, 2.4, 2.6, { thick: 0.25 });
    } else {
      this.piece(b, 'crates', 'crate', -2.3, 1.2, 1.2, 1.8, { n: 2 });
      this.piece(b, 'awning', 'awning', 0.2, 1.7, 3.0, 2.62, { thick: 0.25 });
    }
    return b;
  }

  /** Market kiosk (class house): flat roof at 3 m, one crate and a striped awning. */
  kiosk(district: DistrictId, x: number, z: number, face: Facing): CityBuilding {
    const b = this.building({ district, kind: 'kiosk', cls: 'house', x, z, face, along: 3.4, deep: 3.4, roof: 'flat', level: 1 });
    b.wall = 3.0;
    this.piece(b, 'crate', 'crate', -1.25, 1.0, 0.9, 0.9, { n: 1 });
    this.piece(b, 'awning', 'awning', 0.45, 1.3, 2.3, 2.2, { thick: 0.2 });
    return b;
  }

  /**
   * Ruko route (class ruko, level 2 or 3): ONE big hop from the street onto a solid shop-front bay with a balcony, a sign board
   * beside it, the roof one step above (same numbers as the Chapter 1 street).
   */
  private rukoRoute(b: CityBuilding, at: number): void {
    const bay = r2(b.base + gateRise(b.level));
    b.wall = r2(bay + 1.45 - b.base);
    this.piece(b, 'bay', 'bay', at + 1.1, 1.8, 2.4, bay);
    this.piece(b, 'sign', 'sign', at - 0.6, 1.8, 1.0, bay + 0.75, { thick: 0.5 });
  }

  ruko(district: DistrictId, x: number, z: number, face: Facing, level?: number): CityBuilding {
    const lv = level ?? (this.rng() < 0.5 ? 2 : 3);
    const b = this.building({ district, kind: 'ruko', cls: 'ruko', x, z, face, along: 6, deep: 7.2, roof: 'hip', level: lv });
    b.floors = lv === 2 ? 2 : 3;
    this.rukoRoute(b, 0);
    return b;
  }

  /** Big flat-roofed public building (school, bank, hospital, warehouse): class ruko. */
  big(district: DistrictId, kind: BuildingKind, x: number, z: number, face: Facing, along: number, deep: number, wallColor: number, roofColor: number): CityBuilding {
    const b = this.building({ district, kind, cls: 'ruko', x, z, face, along, deep, roof: 'flat', level: 2, wallColor, roofColor });
    b.floors = 2;
    this.rukoRoute(b, -along / 2 + 3.5);
    return b;
  }

  /**
   * Landmark tower (class landmark, level 4): an easy podium (crates, then 4.4 m) and the tower on it, whose top is one hop
   * of `gateRise(4)` above the podium: only Lompat Singa (level 4) with the air jump and the mantle gets there.
   */
  tower(district: DistrictId, x: number, z: number, face: Facing, style: TowerStyle, round: boolean): CityBuilding {
    const dist = districtById(district);
    const podium = 4.4;
    const size = 6;
    const b = this.building({ district, kind: 'tower', cls: 'landmark', x, z, face, along: size, deep: size, roof: 'flat', level: 4, wallColor: dist.color, roofColor: 0xf2b632 });
    b.wall = r2(podium + gateRise(4));
    b.tower = { style, round, podium, size };
    b.floors = 4;
    // The podium (12 x 12) around the tower, solid to the ground; a two-crate stack in front of it.
    const [fx, fz] = FACE_VEC[face];
    b.pieces.push({ id: `${b.id}:podium`, type: 'podium', x: b.x, z: b.z, w: 12, d: 12, top: podium });
    b.pieces.push({ id: `${b.id}:crates`, type: 'crate', x: r2(b.x + fx * 6.7 + fz * 2.5), z: r2(b.z + fz * 6.7 - fx * 2.5), w: 1.2, d: 1.2, top: 1.8, n: 2 });
    this.L.pois.push({ id: b.id, name: towerName(style), x: b.x, z: b.z, radius: 16 });
    return b;
  }

  // ---- Props ----------------------------------------------------------------------------------------------------------

  tree(x: number, z: number, s = 0.8 + this.rng() * 0.5, kind: 'round' | 'pine' = 'round', base = 0, solid = true, far = false): void {
    this.L.trees.push({ x: r2(x), z: r2(z), s: r2(s), kind, base, solid, far });
  }

  lamp(x: number, z: number): void {
    this.L.lamps.push({ x: r2(x), z: r2(z), solid: true });
  }

  bench(x: number, z: number, alongX: boolean): void {
    this.L.benches.push({ x: r2(x), z: r2(z), alongX, solid: true });
  }

  // ---- Rows and blocks ----------------------------------------------------------------------------------------------------

  /**
   * A row of buildings along one block edge. `axis` 'x': the row runs along x and faces +z (face 0) or -z (face 1);
   * 'z': runs along z and faces +x (2) or -x (3). `edge` = block edge coordinate on the facing side.
   */
  row(kind: 'house' | 'ruko' | 'kiosk', district: DistrictId, from: number, to: number, edge: number, face: Facing, gap = CITY.rowGap): CityBuilding[] {
    const along = kind === 'kiosk' ? 3.4 : 6;
    const deep = kind === 'house' ? 5.6 : kind === 'ruko' ? 7.2 : 3.4;
    const len = to - from;
    const n = Math.max(1, Math.floor((len + gap) / (along + gap)));
    const used = n * along + (n - 1) * gap;
    const start = from + (len - used) / 2 + along / 2;
    const [fx, fz] = FACE_VEC[face];
    const out: CityBuilding[] = [];
    for (let k = 0; k < n; k++) {
      const a = start + k * (along + gap);
      // Body centre: facade at `edge - setback` (toward the inside of the block), centre half a depth further in.
      const inset = CITY.setback + deep / 2;
      const x = face < 2 ? a : edge - fx * inset;
      const z = face < 2 ? edge - fz * inset : a;
      const b = kind === 'house' ? this.house(district, x, z, face) : kind === 'ruko' ? this.ruko(district, x, z, face) : this.kiosk(district, x, z, face);
      out.push(b);
    }
    for (let k = 1; k < out.length; k++) this.L.greenLinks.push([out[k - 1].roofId, out[k].roofId]);
    return out;
  }

  /** Two back-to-back rows along the longer pair of block edges, a garden with trees between them. */
  rows(kind: 'house' | 'ruko' | 'kiosk', district: DistrictId, bx: Rect, axis: 'x' | 'z'): void {
    const [x0, x1, z0, z1] = bx;
    const m = 1.5; // corner gardens
    if (axis === 'x') {
      this.row(kind, district, x0 + m, x1 - m, z0, 1);
      this.row(kind, district, x0 + m, x1 - m, z1, 0);
    } else {
      this.row(kind, district, z0 + m, z1 - m, x0, 3);
      this.row(kind, district, z0 + m, z1 - m, x1, 2);
    }
    // Garden strip in the middle.
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const span = axis === 'x' ? x1 - x0 : z1 - z0;
    const nT = Math.floor(span / 9);
    for (let k = 0; k < nT; k++) {
      const t = -span / 2 + (k + 0.5) * (span / nT);
      if (axis === 'x') this.tree(cx + t, cz + (this.rng() - 0.5) * 2);
      else this.tree(cx + (this.rng() - 0.5) * 2, cz + t);
    }
    if (kind === 'kiosk') {
      // Market middle: crates and a small flower bed (low, soft).
      this.L.ground.push({ x0: cx - 3, z0: cz - 3, x1: cx + 3, z1: cz + 3, kind: 'flowers' });
    }
  }

  park(district: DistrictId, bx: Rect, opts: { pond?: boolean; playground?: boolean } = {}): void {
    const [x0, x1, z0, z1] = bx;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    this.L.ground.push({ x0: x0 + 1, z0: z0 + 1, x1: x1 - 1, z1: z1 - 1, kind: 'grass', color: 0x7fd36a });
    // Cross paths.
    this.L.ground.push({ x0: cx - 1.2, z0: z0 + 1, x1: cx + 1.2, z1: z1 - 1, kind: 'sand' });
    this.L.ground.push({ x0: x0 + 1, z0: cz - 1.2, x1: x1 - 1, z1: cz + 1.2, kind: 'sand' });
    if (opts.pond !== false) this.L.ponds.push({ x: r2(cx + (x1 - x0) * 0.22), z: r2(cz - (z1 - z0) * 0.22), r: 3.5 });
    for (const [qx, qz] of [[-1, -1], [1, 1], [-1, 1]] as const) {
      const px = cx + qx * (x1 - x0) * 0.25;
      const pz = cz + qz * (z1 - z0) * 0.25;
      for (let k = 0; k < 3; k++) this.tree(px + (this.rng() - 0.5) * 6, pz + (this.rng() - 0.5) * 6);
    }
    this.bench(cx + 3, cz + 2.2, true);
    this.bench(cx - 3, cz - 2.2, true);
    this.L.ground.push({ x0: cx - 2, z0: cz - 2, x1: cx + 2, z1: cz + 2, kind: 'flowers' });
    if (opts.playground) this.L.ground.push({ x0: cx + 3, z0: cz + 3, x1: x1 - 3, z1: z1 - 3, kind: 'sand', color: 0xf3dc9b });
    this.L.pois.push({ id: this.uid('park'), name: 'Taman', x: cx, z: cz, radius: 10 });
    void district;
  }

  landmarkBlock(district: DistrictId, bx: Rect, style: TowerStyle, round: boolean, face: Facing): CityBuilding {
    const [x0, x1, z0, z1] = bx;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    this.L.ground.push({ x0: cx - 9, z0: cz - 9, x1: cx + 9, z1: cz + 9, kind: 'plaza', color: districtById(district).color });
    const b = this.tower(district, cx, cz, face, style, round);
    // Trees in the corners (soft when close: the gate rule decides).
    for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) this.tree(cx + qx * ((x1 - x0) / 2 - 3), cz + qz * ((z1 - z0) / 2 - 3));
    return b;
  }

  field(bx: Rect): void {
    const [x0, x1, z0, z1] = bx;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    this.L.ground.push({ x0: x0 + 2, z0: z0 + 2, x1: x1 - 2, z1: z1 - 2, kind: 'field' });
    const alongX = x1 - x0 >= z1 - z0;
    const half = (alongX ? x1 - x0 : z1 - z0) / 2 - 4;
    this.L.goals.push({ x: alongX ? cx - half : cx, z: alongX ? cz : cz - half, alongX });
    this.L.goals.push({ x: alongX ? cx + half : cx, z: alongX ? cz : cz + half, alongX });
    this.L.pois.push({ id: this.uid('field'), name: 'Lapangan', x: cx, z: cz, radius: 12 });
  }

  /** Lamps and street trees along a road corridor (both sides). */
  streetDressing(x0: number, z0: number, x1: number, z1: number, half: number): void {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const n = Math.floor(len / 16);
    for (let k = 0; k <= n; k++) {
      const t = (alongX ? x0 : z0) + (k / Math.max(1, n)) * len;
      for (const s of [-1, 1]) {
        const off = s * (half - 0.8);
        const x = alongX ? t + s * 4 : (x0 + x1) / 2 + off;
        const z = alongX ? (z0 + z1) / 2 + off : t + s * 4;
        if (k % 2 === 0) this.lamp(x, z);
        else this.tree(x, z, 0.75 + this.rng() * 0.3);
      }
    }
  }

  // ---- Solids (colliders) and reach data -----------------------------------------------------------------------------------

  private solid(s: Omit<Solid, 'chunk'>, ownerX: number, ownerZ: number): void {
    this.L.solids.push({ ...s, chunk: chunkIndex(ownerX, ownerZ) });
  }

  /** Collider of a foothold box: `friendly` wider on every side, same top. */
  private footBox(f: Foothold, ox: number, oz: number): void {
    const [x, y, z] = f.center;
    const [w, h, d] = f.size;
    this.solid({ id: f.id, shape: 'box', c: [x, y, z], s: [w + 2 * FRIENDLY, h, d + 2 * FRIENDLY], foothold: f }, ox, oz);
  }

  solidsFor(b: CityBuilding): void {
    const base = b.base;
    const top = base + b.wall;
    // Body: a plain box (the wall carries the roof). For a hip roof the checker sees it as part of the roof foothold.
    if (b.kind === 'tower' && b.tower) {
      const t = b.tower;
      const pod = b.pieces.find((p) => p.type === 'podium') as CityPiece;
      for (const p of b.pieces) if (p.type !== 'podium') this.pieceSolid(b, p);
      this.footBox({ id: pod.id, building: b.id, kind: 'pier', center: [pod.x, base + t.podium / 2, pod.z], size: [pod.w, t.podium, pod.d] }, b.x, b.z);
      const f: Foothold = { id: b.roofId, building: b.id, kind: 'roof', isRoof: true, center: [b.x, base + b.wall / 2, b.z], size: [t.size, b.wall, t.size], round: t.round };
      if (t.round) this.solid({ id: f.id, shape: 'cyl', c: [b.x, base + b.wall / 2, b.z], s: [t.size + 2 * FRIENDLY, b.wall, t.size + 2 * FRIENDLY], foothold: f }, b.x, b.z);
      else this.footBox(f, b.x, b.z);
      return;
    }
    if (b.roof === 'flat') {
      const f: Foothold = { id: b.roofId, building: b.id, kind: 'roof', isRoof: true, center: [b.x, base + b.wall / 2, b.z], size: [b.w, b.wall, b.d] };
      this.footBox(f, b.x, b.z);
    } else {
      this.solid({ id: `${b.id}:body`, shape: 'box', c: [b.x, base + b.wall / 2, b.z], s: [b.w, b.wall, b.d] }, b.x, b.z);
      // Walkable hip roof: one convex hull, friendly at the eaves, cut flat just below the apex (kits/Roofs.addHipRoof).
      const hw = b.roofW / 2 + FRIENDLY;
      const hd = b.roofD / 2 + FRIENDLY;
      const k = W.roofPlateau;
      const peak = top + b.roofH * (1 - W.roofPlateau);
      const pts: number[] = [];
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          pts.push(b.x + sx * hw, top - 0.25, b.z + sz * hd);
          pts.push(b.x + sx * hw, top, b.z + sz * hd);
          pts.push(b.x + sx * hw * k, peak, b.z + sz * hd * k);
        }
      const f: Foothold = {
        id: b.roofId,
        building: b.id,
        kind: 'roof',
        center: [b.x, base + b.wall / 2, b.z],
        size: [b.roofW, b.wall, b.roofD],
        isRoof: true,
        slopeDeg: (Math.atan2(b.roofH, Math.min(b.roofW, b.roofD) / 2) * 180) / Math.PI,
        peak,
      };
      this.solid({ id: b.roofId, shape: 'hull', c: [b.x, top + b.roofH / 2, b.z], s: [b.roofW, b.roofH, b.roofD], hull: pts, foothold: f }, b.x, b.z);
    }
    for (const p of b.pieces) this.pieceSolid(b, p);
  }

  private pieceSolid(b: CityBuilding, p: CityPiece): void {
    const t = p.thick ?? p.top - b.base;
    const kind = p.type === 'crate' ? 'crate' : p.type === 'ac' ? 'ac' : p.type === 'sign' ? 'sign' : p.type === 'bay' ? 'balcony' : p.type === 'podium' ? 'pier' : 'awning';
    this.footBox({ id: p.id, building: b.id, kind, center: [p.x, p.top - t / 2, p.z], size: [p.w, t, p.d] }, b.x, b.z);
  }

  propSolids(): void {
    const L = this.L;
    for (let i = 0; i < L.trees.length; i++) {
      const t = L.trees[i];
      if (!t.solid) continue;
      const r = 0.2 * t.s;
      const h = 1.5 * t.s;
      this.solid({ id: `tree${i}`, shape: 'cyl', c: [t.x, t.base + h / 2, t.z], s: [r * 2, h, r * 2], foothold: { id: `tree${i}`, kind: 'tree', center: [t.x, t.base + h / 2, t.z], size: [r * 2, h, r * 2], round: true } }, t.x, t.z);
    }
    for (let i = 0; i < L.lamps.length; i++) {
      const l = L.lamps[i];
      if (!l.solid) continue;
      this.solid({ id: `lamp${i}`, shape: 'cyl', c: [l.x, 1.7, l.z], s: [0.24, 3.4, 0.24], foothold: { id: `lamp${i}`, kind: 'pole', center: [l.x, 1.7, l.z], size: [0.24, 3.4, 0.24], round: true } }, l.x, l.z);
    }
    for (let i = 0; i < L.benches.length; i++) {
      const b = L.benches[i];
      if (!b.solid) continue;
      const [w, d] = b.alongX ? [1.8, 0.6] : [0.6, 1.8];
      this.solid({ id: `bench${i}`, shape: 'box', c: [b.x, 0.25, b.z], s: [w, 0.5, d], foothold: { id: `bench${i}`, kind: 'other', center: [b.x, 0.25, b.z], size: [w, 0.5, d] } }, b.x, b.z);
    }
    for (let i = 0; i < L.ponds.length; i++) {
      const p = L.ponds[i];
      // A low rim (4 slabs) and the fountain column in the middle.
      const h = 0.45;
      const t = 0.5;
      const rims: [number, number, number, number][] = [
        [p.x, p.z - p.r, p.r * 2 + t, t],
        [p.x, p.z + p.r, p.r * 2 + t, t],
        [p.x - p.r, p.z, t, p.r * 2 - t],
        [p.x + p.r, p.z, t, p.r * 2 - t],
      ];
      rims.forEach(([x, z, w, d], k) => this.solid({ id: `pond${i}r${k}`, shape: 'box', c: [x, h / 2, z], s: [w, h, d], foothold: { id: `pond${i}r${k}`, kind: 'other', center: [x, h / 2, z], size: [w, h, d] } }, p.x, p.z));
      this.solid({ id: `pond${i}c`, shape: 'cyl', c: [p.x, 0.8, p.z], s: [1.2, 1.6, 1.2], foothold: { id: `pond${i}c`, kind: 'pole', center: [p.x, 0.8, p.z], size: [1.2, 1.6, 1.2], round: true } }, p.x, p.z);
    }
    for (const h of L.hills) {
      // Frustum hull (14 sides), slope well under the walkable limit; the checker sees a walkable ramp up to its plateau.
      const pts: number[] = [];
      hillHull(h, pts);
      // The inscribed square of the plateau is the foothold: everything on the plateau stands on it.
      const side = h.rTop * Math.SQRT2;
      this.solid({ id: h.id, shape: 'hull', c: [h.x, h.h / 2, h.z], s: [h.rBottom * 2, h.h, h.rBottom * 2], hull: pts, global: true, foothold: { id: h.id, kind: 'other', center: [h.x, h.h / 2, h.z], size: [side, h.h, side], ramp: true } }, h.x, h.z);
    }
  }

  /** Props too close to a ruko / landmark lose their collider (see CITY.gateClear). */
  softenNearGated(): void {
    const gated = this.L.buildings.filter((b) => b.cls !== 'house');
    const rects: Rect[] = [];
    for (const b of gated) {
      rects.push([b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2]);
      for (const p of b.pieces) rects.push([p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2]);
    }
    const near = (x: number, z: number): boolean => rects.some((r) => rectDist(r, x, z) < CITY.gateClear);
    for (const t of this.L.trees) if (t.solid && near(t.x, t.z)) t.solid = false;
    for (const l of this.L.lamps) if (l.solid && near(l.x, l.z)) l.solid = false;
    for (const b of this.L.benches) if (b.solid && near(b.x, b.z)) b.solid = false;
  }
}

type Rect = [number, number, number, number];

function rectDist(r: Rect, x: number, z: number): number {
  const dx = Math.max(r[0] - x, 0, x - r[1]);
  const dz = Math.max(r[2] - z, 0, z - r[3]);
  return Math.hypot(dx, dz);
}

export function towerName(style: TowerStyle): string {
  switch (style) {
    case 'clock':
      return 'Menara Jam';
    case 'bell':
      return 'Menara Lonceng';
    case 'water':
      return 'Menara Air';
    case 'pagoda':
      return 'Menara Lampion';
    default:
      return 'Menara Koin';
  }
}

// ---- District plans ------------------------------------------------------------------------------------------------------------------

type BlockPlan = { t: 'houses' | 'rukos' | 'kiosks'; axis: 'x' | 'z' } | { t: 'park'; pond?: boolean; playground?: boolean } | { t: 'landmark'; style: TowerStyle; round: boolean; face: Facing } | { t: 'field' } | { t: 'big'; kind: BuildingKind; wall: number; roof: number; face: Facing };

/** Blocks in reading order: NW, NE, SW, SE of the cell. */
const PLANS: { cell: [number, number]; district: DistrictId; blocks: [BlockPlan, BlockPlan, BlockPlan, BlockPlan] }[] = [
  { cell: [-1, -1], district: 'sekolah', blocks: [{ t: 'park', playground: true }, { t: 'houses', axis: 'x' }, { t: 'houses', axis: 'z' }, { t: 'field' }] },
  { cell: [0, -1], district: 'sekolah', blocks: [{ t: 'big', kind: 'school', wall: 0xd8ecff, roof: 0x2f7fd1, face: 0 }, { t: 'landmark', style: 'bell', round: false, face: 0 }, { t: 'houses', axis: 'x' }, { t: 'rukos', axis: 'x' }] },
  { cell: [-1, 0], district: 'perumahan', blocks: [{ t: 'houses', axis: 'x' }, { t: 'houses', axis: 'z' }, { t: 'landmark', style: 'water', round: true, face: 2 }, { t: 'park' }] },
  { cell: [-1, 1], district: 'perumahan', blocks: [{ t: 'houses', axis: 'z' }, { t: 'park', playground: true }, { t: 'houses', axis: 'x' }, { t: 'houses', axis: 'x' }] },
  { cell: [1, 0], district: 'pasar', blocks: [{ t: 'landmark', style: 'pagoda', round: false, face: 3 }, { t: 'kiosks', axis: 'x' }, { t: 'kiosks', axis: 'z' }, { t: 'rukos', axis: 'x' }] },
  { cell: [1, 1], district: 'pasar', blocks: [{ t: 'kiosks', axis: 'x' }, { t: 'big', kind: 'gudang', wall: 0xffd29a, roof: 0xd9632f, face: 1 }, { t: 'park' }, { t: 'kiosks', axis: 'z' }] },
  { cell: [0, 1], district: 'bank', blocks: [{ t: 'big', kind: 'bank', wall: 0xffffff, roof: 0x1e9e92, face: 1 }, { t: 'big', kind: 'hospital', wall: 0xf1fbff, roof: 0x2ec4b6, face: 1 }, { t: 'landmark', style: 'coin', round: false, face: 1 }, { t: 'rukos', axis: 'x' }] },
];

function blocksOf(i: number, j: number): { rects: Rect[]; mx: number; mz: number; zone: Rect } {
  const zone = cellZone(i, j);
  const [x0, x1, z0, z1] = zone;
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const h = CITY.local.half;
  return {
    zone,
    mx,
    mz,
    rects: [
      [x0, mx - h, z0, mz - h],
      [mx + h, x1, z0, mz - h],
      [x0, mx - h, mz + h, z1],
      [mx + h, x1, mz + h, z1],
    ],
  };
}

function fillBlock(g: Gen, district: DistrictId, bx: Rect, p: BlockPlan): void {
  const dist = districtById(district);
  g.L.ground.push({ x0: bx[0], z0: bx[2], x1: bx[1], z1: bx[3], kind: 'grass', color: dist.ground });
  switch (p.t) {
    case 'houses':
      g.rows('house', district, bx, p.axis);
      break;
    case 'rukos':
      g.rows('ruko', district, bx, p.axis);
      break;
    case 'kiosks':
      g.rows('kiosk', district, bx, p.axis);
      break;
    case 'park':
      g.park(district, bx, p);
      break;
    case 'landmark':
      g.landmarkBlock(district, bx, p.style, p.round, p.face);
      break;
    case 'field':
      g.field(bx);
      break;
    case 'big': {
      const [x0, x1, z0, z1] = bx;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const [fx, fz] = FACE_VEC[p.face];
      const along = Math.min(22, (p.face < 2 ? x1 - x0 : z1 - z0) - 8);
      const deep = 11;
      const edge = p.face < 2 ? (fz > 0 ? z1 : z0) : fx > 0 ? x1 : x0;
      const inset = CITY.setback + deep / 2;
      const x = p.face < 2 ? cx : edge - fx * inset;
      const z = p.face < 2 ? edge - fz * inset : cz;
      const b = g.big(district, p.kind, x, z, p.face, along, deep, p.wall, p.roof);
      // Yard behind it: trees (gate rule may soften them).
      g.L.ground.push({ x0: cx - 8, z0: cz - 8, x1: cx + 8, z1: cz + 8, kind: p.kind === 'school' ? 'sand' : 'paving' });
      g.tree(cx - fx * 11 + fz * 9, cz - fz * 11 + fx * 9);
      g.tree(cx - fx * 11 - fz * 9, cz - fz * 11 - fx * 9);
      g.L.pois.push({ id: b.id, name: bigName(p.kind), x: b.x, z: b.z, radius: 18 });
      break;
    }
  }
}

function bigName(k: BuildingKind): string {
  return k === 'school' ? 'Sekolah Glen dan Aara' : k === 'bank' ? 'Bank' : k === 'hospital' ? 'Rumah Sakit' : k === 'gudang' ? 'Gudang Pasar' : 'Gedung';
}

/** Centre cell: the alun-alun with the clock tower, ponds, gardens and two rows of shops. */
function alunAlun(g: Gen): void {
  const [x0, x1, z0, z1] = cellZone(0, 0);
  g.L.ground.push({ x0, z0, x1, z1, kind: 'grass', color: 0x8fd67a });
  g.L.ground.push({ x0: -22, z0: -22, x1: 22, z1: 22, kind: 'plaza', color: 0xf3dfb0 });
  g.L.ground.push({ x0: -3, z0: z0, x1: 3, z1: z1, kind: 'paving' });
  g.L.ground.push({ x0: x0, z0: -3, x1: x1, z1: 3, kind: 'paving' });
  g.tower('alun', 0, 0, 0, 'clock', false);
  g.L.ground.push({ x0: -9, z0: -9, x1: 9, z1: 9, kind: 'plaza', color: 0xf2b632 });
  // Shops facing the plaza (north and south edges).
  g.row('ruko', 'alun', -27, 27, z0 + 7.2 + CITY.setback * 2 + 0.4, 0);
  g.row('ruko', 'alun', -27, 27, z1 - 7.2 - CITY.setback * 2 - 0.4, 1);
  // Ponds east and west, gardens in the four corners, benches round the plaza.
  g.L.ponds.push({ x: -26, z: 0, r: 4 }, { x: 26, z: 0, r: 4 });
  for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = qx * 32;
    const cz = qz * 14;
    g.L.ground.push({ x0: cx - 6, z0: cz - 4, x1: cx + 6, z1: cz + 4, kind: 'flowers' });
    g.tree(cx - 5, cz, 1.1);
    g.tree(cx + 5, cz, 1.0);
    g.bench(qx * 14, qz * 18, true);
  }
  g.L.pois.push({ id: 'alun', name: 'Alun-alun', x: 0, z: 0, radius: 30 });
  g.L.spawn = { x: 0, y: 0, z: 26, yaw: Math.PI };
}

/**
 * North-east cell: the hill on the edge of town with the OLD BARONGSAI BUILDING. Hidden on purpose (owner's rule): far from
 * the centre, behind a forest, on a hill ringed by tall pines; faded and overgrown, reached by an old fenced dirt path.
 */
function bukit(g: Gen): void {
  const [x0, x1, z0, z1] = cellZone(1, -1);
  g.L.ground.push({ x0, z0, x1, z1, kind: 'grass', color: 0x86c96c });
  const hill: CityHill = { id: 'bukitLab', x: 102, z: -102, rBottom: 25, rTop: 25 * HILL_TOP, h: 6 };
  g.L.hills.push(hill);
  // The old building on the plateau, facing south (toward the path).
  const ob = g.building({ district: 'bukit', kind: 'oldBarongsai', cls: 'ruko', x: hill.x, z: hill.z - 2.5, face: 0, along: 9, deep: 7, base: hill.h, roof: 'hip', level: 3, wallColor: 0x9a6a5c, roofColor: 0x6f4a3e });
  ob.abandoned = true;
  ob.floors = 2;
  {
    const bay = r2(ob.base + gateRise(ob.level));
    ob.wall = r2(bay + 1.45 - ob.base);
    const [fx, fz] = FACE_VEC[0];
    const half = ob.d / 2;
    ob.pieces.push({ id: `${ob.id}:bay`, type: 'bay', x: r2(ob.x + 2.6), z: r2(ob.z + fz * (half + 0.9)), w: 2.4, d: 1.8, top: bay });
    ob.pieces.push({ id: `${ob.id}:sign`, type: 'sign', x: r2(ob.x + 0.9), z: r2(ob.z + fz * (half + 0.9)), w: 1.0, d: 1.8, top: r2(bay + 0.75), thick: 0.5 });
    void fx;
  }
  g.L.lab = { building: ob.id, door: { x: ob.x - 1.5, y: hill.h, z: r2(ob.z + ob.d / 2 + 0.6) }, hill: hill.id };
  // Ring of tall pines round the plateau (open to the south where the path arrives).
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.35) continue; // gap for the path (south = +z)
    const r = 13.5 + (k % 3) * 1.6;
    const hy = hillY(hill, r);
    g.tree(hill.x + Math.cos(a) * r, hill.z + Math.sin(a) * r, 2.3 + g.rng() * 0.5, 'pine', hy, false, true);
  }
  // Forest band on the town side (west and south edges of the cell), leaving the old path open.
  for (let x = x0 + 3; x < x1 - 2; x += 5.5) for (let z = z1 - 14; z < z1 - 1; z += 5.5) {
    if (Math.abs(x - 78) < 4.5) continue;
    g.tree(x + (g.rng() - 0.5) * 2.5, z + (g.rng() - 0.5) * 2.5, 1.4 + g.rng() * 0.6, 'pine', 0, true, true);
  }
  for (let z = z0 + 3; z < z1 - 14; z += 5.5) for (let x = x0 + 1; x < x0 + 14; x += 5.5) g.tree(x + (g.rng() - 0.5) * 2.5, z + (g.rng() - 0.5) * 2.5, 1.4 + g.rng() * 0.6, 'pine', 0, true, true);
  // The old path: from the avenue corner up to the door, fenced on both sides (old, some posts broken).
  const path: [number, number][] = [[78, z1 + 2], [78, -78], [90, -82], [100, -88], [ob.x - 1.5, hill.z + hill.rTop - 1]];
  for (let k = 1; k < path.length; k++) {
    const [ax, az] = path[k - 1];
    const [bx2, bz2] = path[k];
    const ya = hillY(hill, Math.hypot(ax - hill.x, az - hill.z));
    const yb = hillY(hill, Math.hypot(bx2 - hill.x, bz2 - hill.z));
    const len = Math.hypot(bx2 - ax, bz2 - az);
    const nx = -(bz2 - az) / len;
    const nz = (bx2 - ax) / len;
    for (const s of [-1, 1]) g.L.fences.push({ x0: ax + nx * s * 2, z0: az + nz * s * 2, x1: bx2 + nx * s * 2, z1: bz2 + nz * s * 2, base0: ya, base1: yb, broken: (k + (s > 0 ? 1 : 0)) % 2 === 0 });
  }
  // Farm houses near the edges (houses: easy roofs).
  g.house('bukit', 66, -118, 2);
  g.house('bukit', 122, -66, 1);
  g.L.ground.push({ x0: 60, z0: -128, x1: 74, z1: -108, kind: 'field', color: 0xb5d96a });
  g.L.pois.push({ id: 'labHint', name: 'Gedung Barongsai Tua', x: ob.x, z: ob.z, radius: 14 });
}

/** Top radius / bottom radius of every hill (the drawn frustum template uses the same ratio and 14 sides). */
export const HILL_TOP = 0.45;
export const HILL_SIDES = 14;

/** Convex hull points of a hill: exactly the drawn 14-sided frustum (three.js CylinderGeometry angles: x = sin, z = cos). */
function hillHull(h: CityHill, pts: number[]): void {
  for (let k = 0; k < HILL_SIDES; k++) {
    const a = (k / HILL_SIDES) * Math.PI * 2;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    pts.push(h.x + sx * h.rBottom, -0.5, h.z + cz * h.rBottom);
    pts.push(h.x + sx * h.rBottom, 0, h.z + cz * h.rBottom);
    pts.push(h.x + sx * h.rTop, h.h, h.z + cz * h.rTop);
  }
}

/** Height of a hill surface at distance r from its centre. */
export function hillY(h: CityHill, r: number): number {
  if (r <= h.rTop) return h.h;
  if (r >= h.rBottom) return 0;
  return (h.h * (h.rBottom - r)) / (h.rBottom - h.rTop);
}

function roads(g: Gen): void {
  const P = CITY.playHalf;
  for (const c of [-50, 50]) {
    g.L.roads.push({ x0: c - CITY.main.half, z0: -P, x1: c + CITY.main.half, z1: P, main: true });
    g.L.roads.push({ x0: -P, z0: c - CITY.main.half, x1: P, z1: c + CITY.main.half, main: true });
    g.streetDressing(c, -P + 6, c, P - 6, CITY.main.half);
    g.streetDressing(-P + 6, c, P - 6, c, CITY.main.half);
  }
  for (const pl of PLANS) {
    const { zone, mx, mz } = blocksOf(pl.cell[0], pl.cell[1]);
    const [x0, x1, z0, z1] = zone;
    const h = CITY.local.half;
    g.L.roads.push({ x0: mx - h, z0, x1: mx + h, z1, main: false });
    g.L.roads.push({ x0, z0: mz - h, x1, z1: mz + h, main: false });
    g.streetDressing(mx, z0 + 4, mx, z1 - 4, h);
    g.streetDressing(x0 + 4, mz, x1 - 4, mz, h);
  }
}

function banners(g: Gen): void {
  for (const d of DISTRICTS)
    for (const [i, j] of d.cells) {
      const [x0, x1, z0, z1] = cellZone(i, j);
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) if (Math.abs(x) < CITY.buildHalf && Math.abs(z) < CITY.buildHalf) g.L.banners.push({ x: x - Math.sign(x) * 0.5, z: z - Math.sign(z) * 0.5, color: d.color });
    }
}

/** Forest and hedges between the last blocks and the soft boundary. */
function edges(g: Gen): void {
  const a = CITY.buildHalf + 3;
  const b = CITY.playHalf + 8;
  for (let t = -b; t <= b; t += 7) {
    for (const s of [-1, 1]) {
      for (let d = a; d < b; d += 7) {
        const j = (g.rng() - 0.5) * 3;
        g.tree(s * (d + j), t + (g.rng() - 0.5) * 3, 1.1 + g.rng() * 0.6, 'pine', 0, false);
        g.tree(t + (g.rng() - 0.5) * 3, s * (d + j), 1.1 + g.rng() * 0.6, 'pine', 0, false);
      }
    }
  }
}

/** Build the whole city (deterministic). */
export function generateCity(seed: number = CITY.seed): CityLayout {
  const g = new Gen(seed);
  alunAlun(g);
  for (const pl of PLANS) {
    const { rects } = blocksOf(pl.cell[0], pl.cell[1]);
    pl.blocks.forEach((p, k) => fillBlock(g, pl.district, rects[k], p));
  }
  bukit(g);
  roads(g);
  banners(g);
  edges(g);
  // Glen's house: the house of the residential district nearest to the centre.
  let best: CityBuilding | null = null;
  for (const b of g.L.buildings) if (b.district === 'perumahan' && b.kind === 'house' && (!best || Math.hypot(b.x, b.z) < Math.hypot(best.x, best.z))) best = b;
  if (best) {
    best.glen = true;
    best.wallColor = 0xffc36b;
    best.roofColor = 0xd9432f;
    g.L.pois.push({ id: 'rumahGlen', name: 'Rumah Glen', x: best.x, z: best.z, radius: 9 });
  }
  // Drop props that ended up inside a building, a road or a hill slope (soft trees on the slope are fine).
  const inBuilding = (x: number, z: number, m: number): boolean =>
    g.L.buildings.some((b) => rectDist([b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2], x, z) < m || b.pieces.some((p) => rectDist([p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2], x, z) < m) || (b.tower !== undefined && Math.abs(x - b.x) < 6.8 && Math.abs(z - b.z) < 6.8));
  const onRoad = (x: number, z: number): boolean => g.L.roads.some((r) => x > r.x0 + 1.2 && x < r.x1 - 1.2 && z > r.z0 + 1.2 && z < r.z1 - 1.2 && (r.x1 - r.x0 > r.z1 - r.z0 ? Math.abs(z - (r.z0 + r.z1) / 2) < (r.main ? CITY.main.road : CITY.local.road) + 0.2 : Math.abs(x - (r.x0 + r.x1) / 2) < (r.main ? CITY.main.road : CITY.local.road) + 0.2));
  const inPond = (x: number, z: number): boolean => g.L.ponds.some((p) => Math.abs(x - p.x) < p.r + 1.5 && Math.abs(z - p.z) < p.r + 1.5);
  const onHillSlope = (x: number, z: number): boolean => g.L.hills.some((h) => Math.hypot(x - h.x, z - h.z) < h.rBottom + 1);
  g.L.trees = g.L.trees.filter((t) => !inBuilding(t.x, t.z, 1.2) && !onRoad(t.x, t.z) && !inPond(t.x, t.z) && (t.base > 0 || !onHillSlope(t.x, t.z) || !t.solid));
  g.L.lamps = g.L.lamps.filter((l) => !inBuilding(l.x, l.z, 0.8) && !onRoad(l.x, l.z) && !inPond(l.x, l.z));
  g.L.benches = g.L.benches.filter((b) => !inBuilding(b.x, b.z, 1.5) && !inPond(b.x, b.z));
  // Trees that stand on a hill slope have their base there (no floating trunks).
  for (const t of g.L.trees) if (t.base === 0) for (const h of g.L.hills) { const r = Math.hypot(t.x - h.x, t.z - h.z); if (r < h.rBottom) t.base = r2(hillY(h, r)); }
  for (const t of g.L.trees) if (t.base > 0) t.solid = false;
  g.softenNearGated();
  // Colliders.
  g.L.solids.push({ id: 'ground', shape: 'box', c: [0, -0.5, 0], s: [CITY.half * 2 + 120, 1, CITY.half * 2 + 120], global: true, chunk: 0 });
  for (const b of g.L.buildings) g.solidsFor(b);
  g.propSolids();
  // Boundary hills (outside the play area, so not in the reach data): a steep ring the soft push never lets you reach.
  const ring = CITY.half + 14;
  for (let t = -ring; t <= ring; t += 26) {
    for (const [x, z] of [[t, -ring], [t, ring], [-ring, t], [ring, t]] as const) {
      const id = `edgeHill${g.L.hills.length}`;
      const hh = { id, x, z, rBottom: 20, rTop: 20 * HILL_TOP, h: 22 + ((Math.abs(t) * 7) % 9) };
      g.L.hills.push(hh);
      const pts: number[] = [];
      hillHull(hh, pts);
      g.L.solids.push({ id, shape: 'hull', c: [x, hh.h / 2, z], s: [40, hh.h, 40], hull: pts, global: true, chunk: 0 });
    }
  }
  return g.L;
}

/** Hills inside the play area (the boundary ring is generated too, after these). */
export function isEdgeHill(h: CityHill): boolean {
  return h.id.startsWith('edgeHill');
}

// ---- Reach data (`npm run check:reach`) ------------------------------------------------------------------------------------------------

export const CITY_LAYOUT: CityLayout = generateCity();

function reachData(L: CityLayout): LevelReachData {
  const footholds: Foothold[] = [];
  for (const s of L.solids) if (s.foothold) footholds.push(s.foothold);
  const buildings: Building[] = L.buildings.map((b) => ({ id: b.id, class: b.cls, roofIds: [b.roofId], wall: b.wall, level: b.level }));
  return { id: 'kota', starts: ['ground'], footholds, buildings, coins: [], gates: [], greenLinks: L.greenLinks, compact: true };
}

export const KOTA_REACH: LevelReachData = reachData(CITY_LAYOUT);

/** Number of footholds above a height (smoke test sanity). */
export function footholdsAbove(h: number): number {
  return KOTA_REACH.footholds.filter((f) => topOf(f) > h).length;
}
