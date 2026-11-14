import { C } from '../bab1/Kit';
import { EDGE_COLOR } from '../kits/ParkourKit';
import { Parkour } from '../../config/parkour';
import { Recipe, Sh, type Vec3 } from './CityMesher';
import { CHUNKS, CITY, FACE_VEC, chunkIndex, districtById, hillY, isEdgeHill, type CityBuilding, type CityLayout, type CityPiece, type GroundKind, type Solid } from './CityData';

/**
 * Turns the city data (CityData.ts) into geometry recipes and collider lists:
 *
 *   far   always drawn, casts shadows: building bodies and roofs, the landmark towers, hills, district banners. About 10 k
 *         triangles for the whole city: the skyline never pops, a child always sees the landmarks.
 *   flat  always drawn, receives shadows only: ground, district tints, roads, sidewalks, markings.
 *   chunk per 50 m chunk, streamed: climbing pieces (with their bright edges), windows, doors, trees, lamps, benches, fences,
 *         ponds. Three layers: lit (casts), deco (no shadow casting), glow (unlit).
 *
 * Nothing here decides a height a child must reach: positions and tops of everything climbable come from the data.
 */

export interface ChunkRecipes {
  index: number;
  /** Chunk square [x0, x1, z0, z1]. */
  rect: [number, number, number, number];
  lit: Recipe;
  deco: Recipe;
  glow: Recipe;
  /** Streamed colliders of this chunk. */
  solids: Solid[];
}

export interface BuiltCity {
  /** Far layer split per 100 m district cell (plus one for everything outside the city): culled per cell, camera and shadow. */
  far: Recipe[];
  flat: Recipe;
  chunks: ChunkRecipes[];
  globalSolids: Solid[];
}

const SIDEWALK = 0xeadcbf;
const ASPHALT = 0x6b7280;
const MARK = 0xfff3b0;
const STONE = 0xe8d9b5;
const WIN = 0x9fdcff;
const WIN_FRAME = 0xffffff;
const DOOR = 0x8a5a3c;
/** Visual heights of the flat layers (the collider ground is y = 0): small steps so nothing z-fights. */
const Y: Record<GroundKind | 'base' | 'walk' | 'road' | 'mark', number> = {
  base: -0.08,
  grass: -0.05,
  field: -0.03,
  flowers: -0.02,
  sand: -0.02,
  dirt: -0.02,
  plaza: -0.015,
  paving: -0.01,
  water: -0.01,
  walk: 0.0,
  road: 0.025,
  mark: 0.05,
};
const GROUND_COLOR: Record<GroundKind, number> = {
  grass: 0x8fd67a,
  field: 0x6cc35a,
  flowers: 0xf7a8c4,
  sand: 0xf0d9a4,
  dirt: 0xc9a46f,
  plaza: 0xf3dfb0,
  paving: 0xe9dcc0,
  water: 0x6fc3e8,
};

class Builder {
  /** 3 x 3 district cells + [9] = outside the city square. */
  readonly farCells: Recipe[] = Array.from({ length: 10 }, () => new Recipe());
  far: Recipe = this.farCells[4];
  readonly flat = new Recipe();
  readonly chunks: ChunkRecipes[] = [];
  readonly globalSolids: Solid[] = [];
  /** Current target chunk (set per object). */
  ch!: ChunkRecipes;

  constructor() {
    const n = CHUNKS;
    for (let i = 0; i < n * n; i++) {
      const cx = i % n;
      const cz = Math.floor(i / n);
      const x0 = -CITY.half + cx * CITY.chunk;
      const z0 = -CITY.half + cz * CITY.chunk;
      this.chunks.push({ index: i, rect: [x0, x0 + CITY.chunk, z0, z0 + CITY.chunk], lit: new Recipe(), deco: new Recipe(), glow: new Recipe(), solids: [] });
    }
  }

  at(x: number, z: number): ChunkRecipes {
    this.ch = this.chunks[chunkIndex(x, z)];
    const h = CITY.half;
    this.far = Math.abs(x) > h || Math.abs(z) > h ? this.farCells[9] : this.farCells[Math.min(2, Math.floor((z + h) / 100)) * 3 + Math.min(2, Math.floor((x + h) / 100))];
    return this.ch;
  }
}

// ---- Facade helpers --------------------------------------------------------------------------------------------------------------

/** World point on the facade of `b`: `at` m along it, `out` m in front of it, at height y. */
function fp(b: CityBuilding, at: number, out: number, y: number): Vec3 {
  const [fx, fz] = FACE_VEC[b.face];
  const half = b.face < 2 ? b.d / 2 : b.w / 2;
  return [b.x + fx * (half + out) - fz * at, y, b.z + fz * (half + out) + fx * at];
}

/** World size of a facade-aligned box: `len` along the facade, `thick` out of it, `h` high. */
function fs(b: CityBuilding, len: number, thick: number, h: number): Vec3 {
  return b.face < 2 ? [len, h, thick] : [thick, h, len];
}

function facadeLen(b: CityBuilding): number {
  return b.face < 2 ? b.w : b.d;
}

function lighten(c: number, k = 50): number {
  const r = Math.min(255, ((c >> 16) & 255) + k);
  const g = Math.min(255, ((c >> 8) & 255) + k);
  const bb = Math.min(255, (c & 255) + k);
  return (r << 16) | (g << 8) | bb;
}

function fade(c: number, k: number): number {
  // Mix toward a dusty grey-brown (abandoned look).
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const m = (v: number, t: number): number => Math.round(v + (t - v) * k);
  return (m(r, 0x9a) << 16) | (m(g, 0x8c) << 8) | m(b, 0x7a);
}

// ---- Climbing pieces (same look as kits/ParkourKit: body, lighter cap, bright edge strip) -----------------------------------------

function edge(B: Builder, x: number, z: number, w: number, d: number, top: number): void {
  const e = Parkour.world.edgeWidth;
  const y = top + 0.02;
  const g = B.ch.glow;
  g.box([w + 0.04, 0.04, e], [x, y, z - d / 2 + e / 2 - 0.02], EDGE_COLOR);
  g.box([w + 0.04, 0.04, e], [x, y, z + d / 2 - e / 2 + 0.02], EDGE_COLOR);
  g.box([e, 0.04, d - 2 * e], [x - w / 2 + e / 2 - 0.02, y, z], EDGE_COLOR);
  g.box([e, 0.04, d - 2 * e], [x + w / 2 - e / 2 + 0.02, y, z], EDGE_COLOR);
}

function block(B: Builder, p: CityPiece, base: number, color: number, cap = lighten(color)): void {
  const t = p.thick ?? p.top - base;
  const bottom = p.top - t;
  const capH = Math.min(0.16, t * 0.3);
  B.ch.lit.box([p.w, t - capH, p.d], [p.x, bottom + (t - capH) / 2, p.z], color);
  B.ch.lit.box([p.w + 0.04, capH, p.d + 0.04], [p.x, p.top - capH / 2, p.z], cap);
  edge(B, p.x, p.z, p.w, p.d, p.top);
}

function drawPiece(B: Builder, b: CityBuilding, p: CityPiece): void {
  const [fx, fz] = FACE_VEC[b.face];
  const along = b.face < 2; // piece long side along x
  const old = b.abandoned === true;
  switch (p.type) {
    case 'crate': {
      const n = p.n ?? 1;
      const sz = (p.top - b.base) / n;
      for (let i = 0; i < n; i++) {
        B.ch.deco.box([p.w + 0.06, 0.07, p.d + 0.06], [p.x, b.base + i * sz + 0.04, p.z], 0x8a5a2c);
        B.ch.deco.box([p.w + 0.06, 0.07, p.d + 0.06], [p.x, b.base + (i + 1) * sz - 0.04, p.z], 0x8a5a2c);
      }
      block(B, p, b.base, 0xd9a05b, 0xe8bb7a);
      break;
    }
    case 'ac': {
      block(B, p, b.base, 0xd8e0ea, 0xf3f6fa);
      const t = p.thick ?? 0.8;
      if (along) B.ch.deco.box([p.w * 0.8, t * 0.5, 0.04], [p.x, p.top - t / 2, p.z + fz * (p.d / 2 + 0.02)], 0x6f8296);
      else B.ch.deco.box([0.04, t * 0.5, p.d * 0.8], [p.x + fx * (p.w / 2 + 0.02), p.top - t / 2, p.z], 0x6f8296);
      break;
    }
    case 'awning': {
      const dist = districtById(b.district);
      const stripe = b.kind === 'kiosk' ? dist.color : C.RED;
      block(B, p, b.base, stripe, C.CREAM);
      const t = p.thick ?? 0.25;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const c = i % 2 ? stripe : C.CREAM;
        if (along) B.ch.deco.box([p.w / n, t * 0.8, 0.06], [p.x - p.w / 2 + (i + 0.5) * (p.w / n), p.top - t * 0.5, p.z + fz * (p.d / 2 + 0.03)], c);
        else B.ch.deco.box([0.06, t * 0.8, p.d / n], [p.x + fx * (p.w / 2 + 0.03), p.top - t * 0.5, p.z - p.d / 2 + (i + 0.5) * (p.d / n)], c);
      }
      break;
    }
    case 'bay': {
      const col = old ? 0x9c8a74 : b.wallColor === 0xffffff ? 0xbfeee8 : C.YELLOW;
      block(B, p, b.base, col, old ? 0xb59a62 : C.GOLD);
      B.ch.deco.box([p.w + 0.04, 0.5, p.d + 0.04], [p.x, p.top - 0.45, p.z], old ? 0x7a5048 : C.RED);
      for (let i = 0; i < 6; i++) {
        if (old && i % 2 === 1) continue; // missing rail posts
        if (along) B.ch.deco.cyl(0.04, 0.5, [p.x - p.w / 2 + 0.2 + i * ((p.w - 0.4) / 5), p.top + 0.27, p.z + fz * (p.d / 2 - 0.1)], old ? 0x8c7a5a : C.GOLD);
        else B.ch.deco.cyl(0.04, 0.5, [p.x + fx * (p.w / 2 - 0.1), p.top + 0.27, p.z - p.d / 2 + 0.2 + i * ((p.d - 0.4) / 5)], old ? 0x8c7a5a : C.GOLD);
      }
      // Shop door and window painted on its outer face.
      const ox = p.x + fx * (p.w / 2 + 0.04);
      const oz = p.z + fz * (p.d / 2 + 0.04);
      const sz = (h: number, l: number): Vec3 => (along ? [l, h, 0.08] : [0.08, h, l]);
      B.ch.deco.box(sz(2.1, 1.0), [ox, b.base + 1.05, oz], old ? 0x5a3a2a : DOOR);
      B.ch.deco.box(sz(1.1, 1.4), [ox, b.base + 3.2, oz], old ? 0x6b4a32 : WIN_FRAME);
      if (!old) B.ch.glow.box(sz(0.85, 1.15), [ox + fx * 0.03, b.base + 3.2, oz + fz * 0.03], WIN);
      break;
    }
    case 'sign':
      block(B, p, b.base, old ? 0xa08a5a : C.GOLD, old ? 0xc9b48a : C.CREAM);
      break;
    case 'podium':
      // Drawn by the tower (far layer); only the bright edge belongs to the chunk.
      edge(B, p.x, p.z, p.w, p.d, p.top);
      break;
  }
}

// ---- Buildings -------------------------------------------------------------------------------------------------------------------

function windows(B: Builder, b: CityBuilding, ats: number[], y: number, w = 1.1, h = 1.3): void {
  for (const at of ats) {
    B.ch.deco.box(fs(b, w, 0.1, h), fp(b, at, 0.03, y), WIN_FRAME);
    B.ch.glow.box(fs(b, w - 0.25, 0.06, h - 0.25), fp(b, at, 0.07, y), b.abandoned ? 0x4a3a30 : WIN);
  }
}

function drawBody(B: Builder, b: CityBuilding): void {
  const top = b.base + b.wall;
  B.far.box([b.w, b.wall, b.d], [b.x, b.base + b.wall / 2, b.z], b.wallColor);
  if (b.roof === 'hip') {
    B.far.pyr(b.roofW, b.roofH, b.roofD, [b.x, top + b.roofH / 2, b.z], b.roofColor);
    B.ch.deco.box([b.w + 0.3, 0.2, b.d + 0.3], [b.x, top - 0.08, b.z], b.abandoned ? 0x8a7a64 : C.CREAM); // eave trim
  } else {
    B.far.box([b.w + 0.3, 0.3, b.d + 0.3], [b.x, top - 0.15, b.z], b.roofColor);
    edge(B, b.x, b.z, b.w, b.d, top);
  }
}

function drawHouse(B: Builder, b: CityBuilding): void {
  drawBody(B, b);
  const y0 = b.base;
  const door = b.pieces.find((p) => p.type === 'awning');
  const doorAt = door ? alongOf(b, door) : 0;
  B.ch.deco.box(fs(b, 1.1, 0.1, 2.1), fp(b, doorAt, 0.03, y0 + 1.05), b.kind === 'kiosk' ? 0x6b4a32 : DOOR);
  if (b.kind === 'kiosk') {
    // Counter with fruit.
    const fruit = [0xff6b6b, 0xffd23f, 0x7bd389, 0xff9f43];
    B.ch.deco.box(fs(b, 2.4, 0.5, 0.9), fp(b, 0.45, 0.25, y0 + 0.45), 0xb07a4a);
    for (let i = 0; i < 4; i++) B.ch.deco.box([0.32, 0.28, 0.32], fp(b, -0.4 + i * 0.55, 0.25, y0 + 1.04), fruit[i]);
    return;
  }
  const L = facadeLen(b);
  windows(B, b, [-L / 2 + 1.2, L / 2 - 1.2].filter((a) => Math.abs(a - doorAt) > 1.4), y0 + 1.9);
  if (b.glen) {
    // Glen's house: an orange flag with a star and a red mailbox (also in the far layer: you can find home from afar).
    const [x, , z] = fp(b, -L / 2 - 0.6, 1.2, 0);
    B.far.cyl(0.06, 5.2, [x, 2.6, z], C.GREY);
    B.far.box([1.4, 0.8, 0.06], [x + 0.7, 4.7, z], C.ORANGE);
    B.ch.glow.sph(0.18, [x + 0.7, 4.7, z + 0.05], C.YELLOW);
    B.ch.deco.box([0.4, 0.35, 0.3], fp(b, L / 2 + 0.4, 0.8, 1.0), C.RED);
    B.ch.deco.cyl(0.04, 0.85, fp(b, L / 2 + 0.4, 0.8, 0.42), C.GREY);
  }
}

function alongOf(b: CityBuilding, p: CityPiece): number {
  return b.face < 2 ? (p.x - b.x) * (b.face === 0 ? 1 : -1) : (p.z - b.z) * (b.face === 2 ? -1 : 1);
}

function drawRuko(B: Builder, b: CityBuilding): void {
  drawBody(B, b);
  const fh = b.wall / b.floors;
  const L = facadeLen(b);
  for (let f = 1; f < b.floors; f++) B.ch.deco.box(fs(b, L + 0.1, 0.16, 0.18), fp(b, 0, 0.06, b.base + f * fh), b.abandoned ? 0x8a7a64 : C.CREAM);
  const ats: number[] = [];
  if (b.kind === 'ruko' || b.kind === 'oldBarongsai') ats.push(-L / 2 + 1.0, L / 2 - 0.9);
  else for (let a = -L / 2 + 2; a <= L / 2 - 2; a += 3.4) ats.push(a);
  for (let f = 1; f < b.floors; f++) windows(B, b, ats, b.base + f * fh + fh * 0.5);
  // Ground floor: big shop windows / entrance away from the bay.
  const bay = b.pieces.find((p) => p.type === 'bay');
  const bayAt = bay ? alongOf(b, bay) : 0;
  const ground = ats.filter((a) => Math.abs(a - bayAt) > 2.6);
  windows(B, b, ground, b.base + 1.5, 1.4, 1.6);
  const dist = districtById(b.district);
  if (b.kind === 'school') {
    B.far.cyl(0.08, 6, fp(b, -L / 2 - 1.2, 2, 3), C.GREY);
    B.far.box(fs(b, 1.6, 0.06, 1.0), fp(b, -L / 2 - 0.4, 2, 5.4), C.RED);
    B.ch.deco.box(fs(b, 6, 0.12, 0.9), fp(b, 4, 0.06, b.base + b.wall - 0.8), dist.color);
  } else if (b.kind === 'bank') {
    for (let a = -L / 2 + 1; a <= L / 2 - 1; a += 2.5) B.ch.deco.cyl(0.25, b.wall - 0.6, fp(b, a, 0.2, b.base + (b.wall - 0.6) / 2), 0xf4f1e8);
    B.far.cyl(1.0, 0.2, fp(b, 2, 0.15, b.base + b.wall - 1.2), C.GOLD, b.face < 2 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]);
  } else if (b.kind === 'hospital') {
    B.ch.deco.box(fs(b, L + 0.1, 0.12, 0.5), fp(b, 0, 0.06, b.base + b.wall - 0.6), dist.color);
    // A big pink heart (two circles and a turned square).
    const h = fp(b, 3, 0.12, b.base + b.wall - 1.8);
    const side: Vec3 = b.face < 2 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
    const off = (a: number): Vec3 => fp(b, 3 + a, 0.12, b.base + b.wall - 1.6);
    B.far.cyl(0.45, 0.12, off(-0.35), 0xff5c8a, side);
    B.far.cyl(0.45, 0.12, off(0.35), 0xff5c8a, side);
    B.far.box(fs(b, 0.9, 0.12, 0.9), h, 0xff5c8a, b.face < 2 ? [0, 0, Math.PI / 4] : [Math.PI / 4, 0, 0]);
  } else if (b.kind === 'gudang') {
    B.ch.deco.box(fs(b, 4, 0.12, 3.6), fp(b, -4, 0.06, b.base + 1.8), 0x9c6b45);
    B.ch.deco.box(fs(b, 4, 0.14, 0.2), fp(b, -4, 0.08, b.base + 1.8), C.CREAM);
  } else if (b.kind === 'ruko') {
    B.ch.deco.box(fs(b, 1.9, 0.1, 0.6), fp(b, -2.1, 0.04, b.base + 2.6), C.GOLD);
  }
}

/** The OLD BARONGSAI BUILDING: faded, boarded up, overgrown. */
function drawOld(B: Builder, b: CityBuilding): void {
  drawRuko(B, b);
  const L = facadeLen(b);
  const top = b.base + b.wall;
  // Boards across the windows, vines down the walls, moss on the roof edge.
  for (const at of [-L / 2 + 1.0, L / 2 - 0.9]) {
    B.ch.deco.box(fs(b, 1.4, 0.06, 0.18), fp(b, at, 0.12, b.base + 1.5 + 0.2), 0x7a5a3a, b.face < 2 ? [0, 0, 0.35] : [0.35, 0, 0]);
    B.ch.deco.box(fs(b, 1.4, 0.06, 0.18), fp(b, at, 0.12, b.base + 1.5 - 0.2), 0x6b4a32, b.face < 2 ? [0, 0, -0.3] : [-0.3, 0, 0]);
  }
  for (let i = 0; i < 7; i++) {
    const at = -L / 2 + 0.4 + i * (L - 0.8) / 6;
    const h = 1.5 + ((i * 37) % 5) * 0.7;
    B.ch.deco.box(fs(b, 0.35, 0.08, h), fp(b, at, 0.05, top - h / 2), i % 2 ? 0x4f8f3a : 0x5fa34a);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    B.ch.deco.sph(0.7 + (i % 3) * 0.2, [b.x + Math.cos(a) * (b.w / 2 + 0.6), b.base + 0.4, b.z + Math.sin(a) * (b.d / 2 + 0.6)], i % 2 ? 0x4f8f3a : 0x6aa84f, [1, 0.7, 1]);
  }
  B.ch.deco.box([b.w + 0.4, 0.15, 0.6], [b.x, top + 0.05, b.z + b.d / 2], 0x5f8f3a);
  // Faded name board over the door and two weathered lion statues.
  const door = fp(b, -1.5, 0.05, b.base + 1.2);
  B.ch.deco.box(fs(b, 1.6, 0.1, 2.4), door, 0x3a2a22);
  B.ch.deco.box(fs(b, 3.4, 0.12, 0.6), fp(b, -1.5, 0.08, b.base + 2.9), 0xa08a5a);
  for (const s of [-1, 1]) {
    const [x, , z] = fp(b, -1.5 + s * 1.6, 0.9, 0);
    B.ch.lit.cyl(0.4, 0.8, [x, b.base + 0.4, z], 0xb8ad94);
    B.ch.lit.sph(0.45, [x, b.base + 1.2, z], fade(C.RED, 0.55));
    B.ch.deco.sph(0.3, [x + 0.2, b.base + 1.45, z], 0x5fa34a);
  }
}

function drawTower(B: Builder, b: CityBuilding): void {
  const t = b.tower as NonNullable<CityBuilding['tower']>;
  const dist = districtById(b.district);
  const pod = t.podium;
  const top = b.base + b.wall;
  const h = b.wall - pod;
  // Podium with a gold band and steps painted on its sides.
  B.far.box([12, pod, 12], [b.x, b.base + pod / 2, b.z], STONE);
  B.far.box([12.04, 0.25, 12.04], [b.x, b.base + pod - 0.125, b.z], C.GOLD);
  B.far.box([12.04, 0.3, 12.04], [b.x, b.base + 0.15, b.z], lighten(dist.color, 20));
  // Tower body.
  const ty = b.base + pod + h / 2;
  if (t.round) B.far.cyl(t.size / 2, h, [b.x, ty, b.z], dist.color);
  else B.far.box([t.size, h, t.size], [b.x, ty, b.z], dist.color);
  for (const k of [0.33, 0.66]) {
    const y = b.base + pod + h * k;
    if (t.round) B.far.cyl(t.size / 2 + 0.06, 0.3, [b.x, y, b.z], C.GOLD);
    else B.far.box([t.size + 0.12, 0.3, t.size + 0.12], [b.x, y, b.z], C.GOLD);
  }
  // Deck rim (flush with the top) and windows.
  if (t.round) B.far.cyl(t.size / 2 + 0.04, 0.35, [b.x, top - 0.175, b.z], C.CREAM);
  else B.far.box([t.size + 0.08, 0.35, t.size + 0.08], [b.x, top - 0.175, b.z], C.CREAM);
  edge(B, b.x, b.z, t.size - (t.round ? 1.4 : 0), t.size - (t.round ? 1.4 : 0), top);
  for (let s = 0; s < 4; s++) {
    const [fx, fz] = FACE_VEC[s];
    const r = t.size / 2 + 0.04;
    for (const y of [pod + h * 0.18, pod + h * 0.5]) {
      B.ch.deco.box(fz !== 0 ? [1.0, 1.2, 0.08] : [0.08, 1.2, 1.0], [b.x + fx * r, b.base + y, b.z + fz * r], WIN_FRAME);
      B.ch.glow.box(fz !== 0 ? [0.75, 0.95, 0.06] : [0.06, 0.95, 0.75], [b.x + fx * (r + 0.03), b.base + y, b.z + fz * (r + 0.03)], WIN);
    }
  }
  // Style on top / near the top (decoration, no collider). Kept small so the deck stays a free place to stand.
  const y8 = top - 1.6;
  const disc = (fx: number, fz: number, y: number, r: number, color: number, glow = false): void => {
    const rot: Vec3 = fz !== 0 ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
    const p: Vec3 = [b.x + fx * (t.size / 2 + 0.1), y, b.z + fz * (t.size / 2 + 0.1)];
    if (glow) B.ch.glow.cyl(r, 0.08, p, color, rot);
    else B.far.cyl(r, 0.12, p, color, rot);
  };
  switch (t.style) {
    case 'clock':
      for (let s = 0; s < 4; s++) {
        const [fx, fz] = FACE_VEC[s];
        disc(fx, fz, y8, 1.3, C.GOLD);
        disc(fx * 1.03, fz * 1.03, y8, 1.05, C.CREAM, true);
        const p: Vec3 = [b.x + fx * (t.size / 2 + 0.25), y8 + 0.35, b.z + fz * (t.size / 2 + 0.25)];
        B.ch.deco.box(fz !== 0 ? [0.12, 0.8, 0.05] : [0.05, 0.8, 0.12], p, 0x333a47);
      }
      B.far.sph(0.9, [b.x, top + 0.5, b.z], C.GOLD, [1, 0.8, 1]);
      B.far.cyl(0.05, 1.6, [b.x, top + 1.6, b.z], C.GOLD);
      break;
    case 'bell':
      B.far.cone(0.8, 1.1, [b.x, top + 0.95, b.z], C.GOLD);
      B.far.sph(0.25, [b.x, top + 1.6, b.z], C.GOLD);
      for (let s = 0; s < 4; s++) disc(FACE_VEC[s][0], FACE_VEC[s][1], y8, 0.9, C.CREAM);
      break;
    case 'water':
      B.far.cyl(t.size / 2 + 0.3, 1.0, [b.x, top - 2.4, b.z], 0xffffff);
      B.far.cone(0.9, 1.0, [b.x, top + 0.5, b.z], 0xff5c8a);
      break;
    case 'pagoda':
      for (const k of [0.45, 0.8]) B.far.pyr(t.size + 0.3, 0.6, t.size + 0.3, [b.x, b.base + pod + h * k, b.z], C.RED);
      for (let s = 0; s < 4; s++) {
        const [fx, fz] = FACE_VEC[s];
        B.ch.glow.sph(0.45, [b.x + fx * (t.size / 2 + 0.45) + fz * 1.8, y8 - 0.6, b.z + fz * (t.size / 2 + 0.45) - fx * 1.8], 0xff7a45, [1, 1.25, 1]);
      }
      B.far.cone(0.5, 1.4, [b.x, top + 0.7, b.z], C.GOLD);
      break;
    case 'coin':
      B.far.cyl(1.3, 0.3, [b.x, top + 1.5, b.z], C.GOLD, [Math.PI / 2, 0, 0]);
      B.ch.glow.cyl(0.9, 0.32, [b.x, top + 1.5, b.z], 0xffe27a, [Math.PI / 2, 0, 0]);
      B.far.box([0.4, 0.2, 0.4], [b.x, top + 0.1, b.z], C.GOLD);
      break;
  }
  B.far.cyl(0.05, 2.2, [b.x + t.size / 2 - 0.6, top + 1.1, b.z - t.size / 2 + 0.6], C.GREY);
  B.far.box([1.2, 0.7, 0.05], [b.x + t.size / 2 - 0.0, top + 1.8, b.z - t.size / 2 + 0.6], dist.color);
}

// ---- Props ---------------------------------------------------------------------------------------------------------------------

function drawProps(B: Builder, L: CityLayout): void {
  for (const t of L.trees) {
    const ch = B.at(t.x, t.z);
    const s = t.s;
    if (t.kind === 'pine') {
      const r = t.far ? B.far : ch.lit;
      r.cyl(0.18 * s, 1.4 * s, [t.x, t.base + 0.7 * s, t.z], C.BROWN);
      r.cone(1.35 * s, 2.6 * s, [t.x, t.base + 2.4 * s, t.z], 0x2f7f45);
      r.cone(0.95 * s, 2.0 * s, [t.x, t.base + 3.9 * s, t.z], 0x3f9f4f);
    } else {
      ch.lit.cyl(0.2 * s, 1.5 * s, [t.x, t.base + 0.75 * s, t.z], C.BROWN);
      // Crowns capped at the middle sphere tier (a street tree does not need 168 triangles per ball).
      ch.lit.add(Sh.Sph1, [t.x, t.base + 2.2 * s, t.z], [s, s, s], C.GREEN);
      ch.lit.add(Sh.Sph1, [t.x + 0.4 * s, t.base + 2.85 * s, t.z + 0.2 * s], [0.7 * s, 0.7 * s, 0.7 * s], C.DARK_GREEN);
    }
  }
  for (const l of L.lamps) {
    const ch = B.at(l.x, l.z);
    ch.deco.cyl(0.08, 3.3, [l.x, 1.65, l.z], C.GREY);
    ch.deco.cyl(0.26, 0.1, [l.x, 3.42, l.z], C.GOLD);
    ch.glow.sph(0.22, [l.x, 3.25, l.z], 0xffe9a0);
  }
  for (const b of L.benches) {
    const ch = B.at(b.x, b.z);
    const [w, d] = b.alongX ? [1.8, 0.6] : [0.6, 1.8];
    ch.deco.box([w, 0.1, d], [b.x, 0.45, b.z], C.BROWN);
    ch.deco.box(b.alongX ? [1.8, 0.5, 0.08] : [0.08, 0.5, 1.8], [b.x - (b.alongX ? 0 : 0.26), 0.75, b.z - (b.alongX ? 0.26 : 0)], C.BROWN);
    for (const s of [-1, 1]) ch.deco.box([0.08, 0.4, 0.08], [b.x + (b.alongX ? s * 0.8 : 0), 0.2, b.z + (b.alongX ? 0 : s * 0.8)], 0x555b66);
  }
  for (const p of L.ponds) {
    const ch = B.at(p.x, p.z);
    const t = 0.5;
    ch.lit.box([p.r * 2 + t, 0.45, t], [p.x, 0.225, p.z - p.r], 0xcfc6b5);
    ch.lit.box([p.r * 2 + t, 0.45, t], [p.x, 0.225, p.z + p.r], 0xcfc6b5);
    ch.lit.box([t, 0.45, p.r * 2 - t], [p.x - p.r, 0.225, p.z], 0xcfc6b5);
    ch.lit.box([t, 0.45, p.r * 2 - t], [p.x + p.r, 0.225, p.z], 0xcfc6b5);
    ch.deco.quad(p.r * 2 - t, p.r * 2 - t, [p.x, 0.2, p.z], 0x6fc3e8);
    ch.lit.cyl(0.6, 1.6, [p.x, 0.8, p.z], 0xe8e0d0);
    ch.lit.cyl(0.9, 0.2, [p.x, 1.55, p.z], C.GOLD);
    ch.glow.sph(0.35, [p.x, 1.9, p.z], 0xbfeaff, [1, 1.4, 1]);
    edge(B, p.x, p.z, 1.2, 1.2, 1.6);
  }
  for (const f of L.fences) {
    const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
    const n = Math.max(1, Math.floor(len / 2.2));
    const yaw = Math.atan2(f.x1 - f.x0, f.z1 - f.z0);
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = f.x0 + (f.x1 - f.x0) * u;
      const z = f.z0 + (f.z1 - f.z0) * u;
      const y = f.base0 + (f.base1 - f.base0) * u;
      const ch = B.at(x, z);
      const tilt = f.broken && k % 3 === 1 ? 0.5 : 0;
      ch.deco.box([0.12, 1.1, 0.12], [x, y + 0.5, z], 0x8a6a4a, [tilt, yaw, 0]);
      if (k < n && !(f.broken && k % 2 === 0)) {
        const x2 = f.x0 + (f.x1 - f.x0) * ((k + 0.5) / n);
        const z2 = f.z0 + (f.z1 - f.z0) * ((k + 0.5) / n);
        const y2 = f.base0 + (f.base1 - f.base0) * ((k + 0.5) / n);
        ch.deco.box([0.06, 0.1, len / n], [x2, y2 + 0.8, z2], 0x9a7a5a, [0, yaw, 0]);
      }
    }
  }
  for (const gl of L.goals) {
    const ch = B.at(gl.x, gl.z);
    const W = 3.2;
    const along = !gl.alongX; // the goal mouth spans across the field's long axis
    const off = (s: number): Vec3 => (along ? [gl.x + s * W / 2, 1.0, gl.z] : [gl.x, 1.0, gl.z + s * W / 2]);
    ch.deco.cyl(0.07, 2.0, off(-1), 0xffffff);
    ch.deco.cyl(0.07, 2.0, off(1), 0xffffff);
    ch.deco.box(along ? [W, 0.12, 0.12] : [0.12, 0.12, W], [gl.x, 2.0, gl.z], 0xffffff);
  }
  for (const bn of L.banners) {
    B.at(bn.x, bn.z);
    B.far.cyl(0.08, 6.5, [bn.x, 3.25, bn.z], C.GREY);
    B.far.box([0.06, 2.2, 1.1], [bn.x, 5.0, bn.z + 0.6], bn.color);
    B.far.sph(0.16, [bn.x, 6.6, bn.z], C.GOLD);
  }
}

// ---- Ground, roads, hills ----------------------------------------------------------------------------------------------------------

function drawGround(B: Builder, L: CityLayout): void {
  const F = B.flat;
  F.quad(CITY.half * 2 + 140, CITY.half * 2 + 140, [0, Y.base, 0], 0x7cc566);
  for (const g of L.ground) {
    const w = g.x1 - g.x0;
    const d = g.z1 - g.z0;
    if (w <= 0 || d <= 0) continue;
    F.quad(w, d, [(g.x0 + g.x1) / 2, Y[g.kind], (g.z0 + g.z1) / 2], g.color ?? GROUND_COLOR[g.kind]);
  }
  for (const r of L.roads) {
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    F.quad(w, d, [cx, Y.walk, cz], SIDEWALK);
    const half = r.main ? CITY.main.road : CITY.local.road;
    const alongX = w > d;
    F.quad(alongX ? w : half * 2, alongX ? half * 2 : d, [cx, Y.road, cz], ASPHALT);
  }
  // Centre-line dashes, skipped where another road crosses.
  for (const r of L.roads) {
    const alongX = r.x1 - r.x0 > r.z1 - r.z0;
    const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    for (let t = 3; t < len - 3; t += 6) {
      const x = alongX ? r.x0 + t : cx;
      const z = alongX ? cz : r.z0 + t;
      // Inside another road's corridor (perpendicular) = an intersection.
      let skip = false;
      for (const o of L.roads) {
        if (o === r) continue;
        const oAlongX = o.x1 - o.x0 > o.z1 - o.z0;
        if (oAlongX === alongX) continue;
        if (x > o.x0 - 1 && x < o.x1 + 1 && z > o.z0 - 1 && z < o.z1 + 1) skip = true;
      }
      if (skip) continue;
      F.quad(alongX ? 1.6 : 0.2, alongX ? 0.2 : 1.6, [x, Y.mark, z], MARK);
    }
  }
  for (const h of L.hills) {
    const edgeHill = isEdgeHill(h);
    B.at(h.x, h.z);
    B.far.hill(h.rBottom, h.h, [h.x, h.h / 2 - (edgeHill ? 0 : 0.0), h.z], edgeHill ? (Math.abs(h.x * 3 + h.z) % 2 > 1 ? 0x5aa34f : 0x4f9a4a) : 0x86c96c);
  }
  // The old dirt path up the hill (short tilted strips following the slope).
  const hill = L.hills.find((h) => h.id === L.lab.hill);
  if (hill) {
    const ff = L.fences;
    for (let k = 0; k + 1 < ff.length; k += 2) {
      const a = ff[k];
      const b = ff[k + 1];
      const x0 = (a.x0 + b.x0) / 2;
      const z0 = (a.z0 + b.z0) / 2;
      const x1 = (a.x1 + b.x1) / 2;
      const z1 = (a.z1 + b.z1) / 2;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.ceil(len / 1.2));
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * u;
        const z = z0 + (z1 - z0) * u;
        const y = hillY(hill, Math.hypot(x - hill.x, z - hill.z));
        const ch = B.at(x, z);
        ch.deco.box([2.6, 0.06, len / n + 0.1], [x, y + 0.03, z], 0xc9a46f, [0, yaw, 0]);
      }
    }
  }
}

/** Build every recipe and collider list of the city. */
export function buildCity(L: CityLayout): BuiltCity {
  const B = new Builder();
  drawGround(B, L);
  for (const b of L.buildings) {
    B.at(b.x, b.z);
    if (b.kind === 'tower') drawTower(B, b);
    else if (b.kind === 'oldBarongsai') drawOld(B, b);
    else if (b.cls === 'house') drawHouse(B, b);
    else drawRuko(B, b);
    for (const p of b.pieces) drawPiece(B, b, p);
  }
  drawProps(B, L);
  for (const s of L.solids) {
    if (s.global) B.globalSolids.push(s);
    else B.chunks[s.chunk].solids.push(s);
  }
  for (const c of B.chunks) for (const r of [c.lit, c.deco, c.glow]) r.trim();
  for (const r of B.farCells) r.trim();
  B.flat.trim();
  return { far: B.farCells, flat: B.flat, chunks: B.chunks, globalSolids: B.globalSolids };
}
