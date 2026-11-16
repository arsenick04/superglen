import { C } from '../bab1/Kit';
import { EDGE_COLOR } from '../kits/ParkourKit';
import { Parkour } from '../../config/parkour';
import { Recipe, Sh, type Vec3 } from './CityMesher';
import { ATLAS_TILES, T } from './CityAtlas';
import { envModels } from './EnvModels';
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
const MARK = 0xfff3b0;
const STONE = 0xe8d9b5;
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

// ---- Climbing pieces (same look as kits/ParkourKit: body, lighter cap, bright edge strip) -----------------------------------------

function edge(B: Builder, x: number, z: number, w: number, d: number, top: number): void {
  // Four flat bright strips on the top face (the bright edge of every climbing piece): 8 triangles instead of 48.
  const e = Parkour.world.edgeWidth;
  const y = top + 0.035;
  const g = B.ch.glow;
  g.quad(w + 0.04, e, [x, y, z - d / 2 + e / 2 - 0.02], EDGE_COLOR);
  g.quad(w + 0.04, e, [x, y, z + d / 2 - e / 2 + 0.02], EDGE_COLOR);
  g.quad(e, d - 2 * e, [x - w / 2 + e / 2 - 0.02, y, z], EDGE_COLOR);
  g.quad(e, d - 2 * e, [x + w / 2 - e / 2 + 0.02, y, z], EDGE_COLOR);
}

/** Deterministic 0..1 from a position (variety per building without touching the city data's random stream). */
function hsh(a: number, b: number, k = 0): number {
  let h = Math.imul(Math.round(a * 8) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(b * 8) + k * 7919, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return ((h ^ (h >>> 12)) >>> 0) / 4294967295;
}

/** Facade yaw: a +z decal turned to face out of the building. */
function facadeYaw(b: CityBuilding): number {
  const [fx, fz] = FACE_VEC[b.face];
  return Math.atan2(fx, fz);
}

/** A decal of `tile` standing on the facade, `h` m high (width from the tile's aspect), centre at (`at`, `y`). */
function facadeDecal(r: Recipe, b: CityBuilding, tile: number, at: number, out: number, y: number, h: number, width?: number): void {
  const w = width ?? h * ATLAS_TILES[tile].aspect;
  r.decal(tile, w, h, fp(b, at, out, y), facadeYaw(b));
}

/** Awning stripe tile by district. */
function stripeTile(district: string): number {
  switch (district) {
    case 'perumahan': return T.stripePink;
    case 'sekolah': return T.stripeBlue;
    case 'alun': return T.stripeYellow;
    case 'pasar': return T.stripeOrange;
    case 'bank':
    case 'bukit': return T.stripeGreen;
    default: return T.stripeRed;
  }
}

function roofTile(b: CityBuilding): number {
  return b.district === 'sekolah' || b.district === 'bank' ? T.roofZinc : T.roofTerra;
}

/** Wall paint with a little per-building variety (brightness and warmth). */
function paint(c: number, a: number, b: number): number {
  const k = 0.94 + 0.1 * hsh(a, b, 3);
  const w = (hsh(a, b, 5) - 0.5) * 10;
  const r = Math.max(0, Math.min(255, ((c >> 16) & 255) * k + w));
  const g = Math.max(0, Math.min(255, ((c >> 8) & 255) * k));
  const bl = Math.max(0, Math.min(255, (c & 255) * k - w));
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function block(B: Builder, p: CityPiece, base: number, color: number, cap = lighten(color), tile = 0, capTile = 0): void {
  const t = p.thick ?? p.top - base;
  const bottom = p.top - t;
  const capH = Math.min(0.16, t * 0.3);
  B.ch.lit.box([p.w, t - capH, p.d], [p.x, bottom + (t - capH) / 2, p.z], color, undefined, tile);
  B.ch.lit.box([p.w + 0.04, capH, p.d + 0.04], [p.x, p.top - capH / 2, p.z], capTile ? 0xffffff : cap, undefined, capTile);
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
        B.ch.deco.boxNB([p.w + 0.06, 0.07, p.d + 0.06], [p.x, b.base + i * sz + 0.04, p.z], 0x8a5a2c);
        B.ch.deco.box([p.w + 0.06, 0.07, p.d + 0.06], [p.x, b.base + (i + 1) * sz - 0.04, p.z], 0x8a5a2c);
      }
      block(B, p, b.base, 0xe6b27a, 0xf0c690, T.wood, T.wood);
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
      // Stripes come from the texture (no more 6 boxes per awning).
      const st = old ? 0 : stripeTile(b.district);
      block(B, p, b.base, old ? 0x9c8a74 : 0xffffff, old ? 0xb5a58c : 0xffffff, st, st);
      break;
    }
    case 'bay': {
      const col = old ? 0x9c8a74 : b.wallColor === 0xffffff ? 0xbfeee8 : C.YELLOW;
      block(B, p, b.base, col, old ? 0xb59a62 : C.GOLD, T.plaster);
      B.ch.deco.box([p.w + 0.04, 0.5, p.d + 0.04], [p.x, p.top - 0.45, p.z], old ? 0x7a5048 : C.RED);
      // Railing: two rails and thin posts (boxes: a round post is 24 triangles).
      const rc = old ? 0x8c7a5a : C.GOLD;
      if (along) {
        B.ch.deco.boxNB([p.w, 0.07, 0.07], [p.x, p.top + 0.5, p.z + fz * (p.d / 2 - 0.1)], rc);
        B.ch.deco.boxNB([p.w, 0.05, 0.05], [p.x, p.top + 0.2, p.z + fz * (p.d / 2 - 0.1)], rc);
      } else {
        B.ch.deco.boxNB([0.07, 0.07, p.d], [p.x + fx * (p.w / 2 - 0.1), p.top + 0.5, p.z], rc);
        B.ch.deco.boxNB([0.05, 0.05, p.d], [p.x + fx * (p.w / 2 - 0.1), p.top + 0.2, p.z], rc);
      }
      for (let i = 0; i < 6; i++) {
        if (old && i % 2 === 1) continue; // missing rail posts
        if (along) B.ch.deco.boxNB([0.06, 0.5, 0.06], [p.x - p.w / 2 + 0.2 + i * ((p.w - 0.4) / 5), p.top + 0.27, p.z + fz * (p.d / 2 - 0.1)], rc);
        else B.ch.deco.boxNB([0.06, 0.5, 0.06], [p.x + fx * (p.w / 2 - 0.1), p.top + 0.27, p.z - p.d / 2 + 0.2 + i * ((p.d - 0.4) / 5)], rc);
      }
      // Shop door and window painted on its outer face (decals).
      const ox = p.x + fx * (p.w / 2 + 0.04);
      const oz = p.z + fz * (p.d / 2 + 0.04);
      const yaw = facadeYaw(b);
      B.ch.deco.decal(old ? T.door0 : b.wallColor === 0xffffff ? T.door1 : T.door0, 1.0, 2.1, [ox, b.base + 1.05, oz], yaw);
      B.ch.deco.decal(T.window0, 1.0, 1.2, [ox + fx * 0.01, b.base + 3.2, oz + fz * 0.01], yaw);
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

/** Window decals (frame, glass, sill painted in the atlas); `h` is the height. Shutters only on upper floors (they are wider). */
function windows(B: Builder, b: CityBuilding, ats: number[], y: number, w = 1.1, h = 1.3, upper = true): void {
  for (const at of ats) {
    const r = hsh(b.x + at, b.z + y, 1);
    const tile = b.abandoned ? T.window3 : r < 0.4 || !upper ? T.window0 : r < 0.7 ? T.window2 : T.window1;
    // Keep the wide shuttered window inside the wall.
    const ww = h * ATLAS_TILES[tile].aspect;
    void w;
    facadeDecal(B.ch.deco, b, tile, at, 0.05, y, h, ww);
    if (!b.abandoned) B.ch.deco.boxNB(fs(b, ww * 0.92, 0.14, 0.07), fp(b, at, 0.1, y - h / 2 + 0.035), 0xf4ecdc); // real sill
  }
}

function drawBody(B: Builder, b: CityBuilding): void {
  const top = b.base + b.wall;
  const wall = b.abandoned ? b.wallColor : paint(b.wallColor, b.x, b.z);
  // Soft rounded vertical corners (visual only: the collider is the data's box).
  B.far.add(Sh.Body, [b.x, b.base + b.wall / 2, b.z], [b.w, b.wall, b.d], wall, undefined, T.plaster);
  if (b.roof === 'hip') {
    // Visual overhang a little wider than the collider roof (cute deep eaves); the apex stays where the data puts it.
    B.far.pyr(b.roofW + 0.5, b.roofH, b.roofD + 0.5, [b.x, top + b.roofH / 2 - 0.04, b.z], b.roofColor, roofTile(b));
    B.ch.deco.box([b.w + 0.3, 0.2, b.d + 0.3], [b.x, top - 0.08, b.z], b.abandoned ? 0x8a7a64 : C.CREAM); // eave trim
  } else {
    B.far.box([b.w + 0.3, 0.3, b.d + 0.3], [b.x, top - 0.15, b.z], b.roofColor, undefined, T.paving);
    edge(B, b.x, b.z, b.w, b.d, top);
  }
  if (b.kind === 'tower' || b.abandoned) return;
  // Brick plinth round the foot of the wall (a ring of 4 thin slabs would be 40 triangles: one slightly larger box is 10).
  B.ch.deco.boxNB([b.w + 0.1, 0.55, b.d + 0.1], [b.x, b.base + 0.275, b.z], 0xffffff, undefined, T.brick);
  // Downpipe at the facade's right corner.
  B.ch.deco.boxNB(fs(b, 0.09, 0.09, b.wall - 0.3), fp(b, facadeLen(b) / 2 - 0.12, 0.05, b.base + (b.wall - 0.3) / 2 + 0.15), 0x9aa5b1);
}

function drawHouse(B: Builder, b: CityBuilding): void {
  drawBody(B, b);
  const y0 = b.base;
  const door = b.pieces.find((p) => p.type === 'awning');
  const doorAt = door ? alongOf(b, door) : 0;
  if (b.kind === 'kiosk') {
    facadeDecal(B.ch.deco, b, T.door0, doorAt, 0.05, y0 + 1.05, 2.1, 1.1);
    // Counter with fruit, a fruit sign above the awning.
    const fruit = [0xff6b6b, 0xffd23f, 0x7bd389, 0xff9f43];
    B.ch.deco.box(fs(b, 2.4, 0.5, 0.9), fp(b, 0.45, 0.25, y0 + 0.45), 0xffffff, undefined, T.wood);
    for (let i = 0; i < 4; i++) B.ch.deco.ball(0.18, fp(b, -0.4 + i * 0.55, 0.25, y0 + 1.1), fruit[i]);
    facadeDecal(B.ch.deco, b, T.signApple, 0.45, 0.07, y0 + 2.68, 0.55);
    return;
  }
  facadeDecal(B.ch.deco, b, T.door0, doorAt, 0.05, y0 + 1.05, 2.1, 1.1);
  B.ch.deco.boxNB(fs(b, 1.5, 0.4, 0.1), fp(b, doorAt, 0.2, y0 + 0.05), 0xd9d2c4); // door step
  if (hsh(b.x, b.z, 14) < 0.6) {
    for (const o of [-0.95, 0.95]) {
      const q = fp(b, doorAt + o, 0.3, y0);
      B.ch.deco.boxNB([0.3, 0.28, 0.3], [q[0], y0 + 0.14, q[2]], 0xd9632f);
      B.ch.deco.ball(0.24, [q[0], y0 + 0.5, q[2]], o < 0 ? 0x4f9f3a : 0x5fb347, [1, 0.9, 1]);
      if (o > 0) B.ch.deco.ball(0.1, [q[0] + 0.1, y0 + 0.68, q[2]], 0xff7aa8);
    }
  }
  const L = facadeLen(b);
  windows(B, b, [-L / 2 + 1.2, L / 2 - 1.2].filter((a) => Math.abs(a - doorAt) > 1.4), y0 + 1.9);
  // Chimney on the back slope (not where anyone stands: the roof plateau is in the middle).
  if (hsh(b.x, b.z, 8) < 0.55) {
    const D = b.face < 2 ? b.d : b.w;
    const side = (hsh(b.x, b.z, 9) < 0.5 ? -1 : 1) * L * 0.3;
    const cy = b.base + b.wall + b.roofH * 0.32 + 0.45;
    B.ch.deco.boxNB([0.55, 1.4, 0.55], fp(b, side, -D * 0.84, cy), 0xffffff, undefined, T.brick);
    B.ch.deco.box([0.7, 0.14, 0.7], fp(b, side, -D * 0.84, cy + 0.74), 0xd9d2c4);
  }
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
  const old = b.abandoned === true;
  for (let f = 1; f < b.floors; f++) B.ch.deco.box(fs(b, L + 0.1, 0.16, 0.18), fp(b, 0, 0.06, b.base + f * fh), old ? 0x8a7a64 : C.CREAM);
  const ats: number[] = [];
  if (b.kind === 'ruko' || b.kind === 'oldBarongsai') ats.push(-L / 2 + 1.0, L / 2 - 0.9);
  else for (let a = -L / 2 + 2; a <= L / 2 - 2; a += 3.4) ats.push(a);
  for (let f = 1; f < b.floors; f++) windows(B, b, ats, b.base + f * fh + fh * 0.5);
  // Balconies with a plant, and an AC unit, under some upper windows of the shops (all decoration: no collider).
  if (b.kind === 'ruko') {
    for (let f = 2; f < b.floors; f++) {
      const at = ats[hsh(b.x, b.z, f) < 0.5 ? 0 : 1];
      const r = hsh(b.x + f, b.z, 4);
      const fy = b.base + f * fh;
      if (r < 0.55) {
        B.ch.deco.boxNB(fs(b, 1.9, 0.8, 0.14), fp(b, at, 0.4, fy + 0.07), 0xf0e6d2);
        B.ch.deco.boxNB(fs(b, 1.9, 0.07, 0.62), fp(b, at, 0.78, fy + 0.45), 0xffffff, undefined, T.wood);
        B.ch.deco.ball(0.22, fp(b, at - 0.5, 0.45, fy + 0.35), 0x4f9f3a, [1, 0.8, 1]);
        B.ch.deco.ball(0.14, fp(b, at - 0.5, 0.45, fy + 0.52), 0xff7aa8);
      } else {
        B.ch.deco.boxNB(fs(b, 0.75, 0.4, 0.5), fp(b, at + 0.5, 0.35, fy + 0.45), 0xe9eef3);
      }
    }
  }
  // Ground floor: big shop windows / entrance away from the bay.
  const bay = b.pieces.find((p) => p.type === 'bay');
  const bayAt = bay ? alongOf(b, bay) : 0;
  const ground = ats.filter((a) => Math.abs(a - bayAt) > 2.6);
  windows(B, b, ground, b.base + 1.5, 1.4, 1.6, false);
  const dist = districtById(b.district);
  if (b.kind === 'school') {
    B.far.cyl(0.08, 6, fp(b, -L / 2 - 1.2, 2, 3), C.GREY);
    B.far.box(fs(b, 1.6, 0.06, 1.0), fp(b, -L / 2 - 0.4, 2, 5.4), C.RED);
    B.ch.deco.box(fs(b, 6, 0.12, 0.9), fp(b, 4, 0.06, b.base + b.wall - 0.8), dist.color);
    facadeDecal(B.ch.deco, b, T.signBook, -1.2, 0.1, b.base + 2.6, 1.0);
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
    B.ch.deco.box(fs(b, 4, 0.12, 3.6), fp(b, -4, 0.06, b.base + 1.8), 0xffffff, undefined, T.wood);
    B.ch.deco.box(fs(b, 4, 0.14, 0.2), fp(b, -4, 0.08, b.base + 1.8), C.CREAM);
    facadeDecal(B.ch.deco, b, T.signBag, 3, 0.1, b.base + b.wall - 1.3, 0.9);
  } else if (b.kind === 'ruko') {
    const signs = [T.signBread, T.signBag, T.signCup, T.signBowl, T.signApple];
    facadeDecal(B.ch.deco, b, signs[Math.floor(hsh(b.x, b.z, 6) * signs.length)], -2.1, 0.07, b.base + 2.6, 0.9);
  }
  if (!old && b.roof === 'flat' && b.kind !== 'tower' && hsh(b.x, b.z, 12) < 0.6) {
    // A water tank on legs in the back corner of the roof.
    const top = b.base + b.wall;
    const t = fp(b, L / 2 - 0.9, -(b.face < 2 ? b.d : b.w) + 0.9, top);
    for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) B.ch.deco.boxNB([0.08, 0.5, 0.08], [t[0] + dx, top + 0.25, t[2] + dz], 0x8a96a3);
    B.ch.deco.cyl(0.55, 0.9, [t[0], top + 0.95, t[2]], 0x5aa9e6);
    B.ch.deco.cone(0.58, 0.3, [t[0], top + 1.55, t[2]], 0x4a8fd1);
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
    if (i === 3) continue; // keep the mouth (the door) clear
    const a = (i / 10) * Math.PI * 2;
    B.ch.deco.sph(0.7 + (i % 3) * 0.2, [b.x + Math.cos(a) * (b.w / 2 + 0.6), b.base + 0.4, b.z + Math.sin(a) * (b.d / 2 + 0.6)], i % 2 ? 0x4f8f3a : 0x6aa84f, [1, 0.7, 1]);
  }
  if (b.face === 0) barongsaiFacade(B, b, 1.5);
}

// Faded Barongsai colours (the same red / gold / cream / orange as the lion-head computer in the Lab, washed out by years).
const OF = { red: 0xa84a3c, redDark: 0x7a3a30, gold: 0xc4a458, cream: 0xd8cdb0, teeth: 0xe4dcc4, mane: 0xc08a4c, dark: 0x24160f, tile: 0x7b5a4a, vine: 0x4f8f3a, leaf: 0x6aa84f, wood: 0x6b4a32 };

/**
 * The old building's face (south-facing only: the data builds it with face 0): a big Barongsai lion head, the door being its open
 * mouth (`c` = the door's distance along the facade), round pillars, faded lanterns and a two-tier klenteng roof with upturned
 * corners. Everything is boxes, squashed spheres, cones and a few cylinders in the streamed chunk layers (about 1.4 k triangles).
 * Abandoned: faded paint, cracks, boards, vines and leaves, missing fur and roof tiles, only a dim glow in the eyes.
 */
function barongsaiFacade(B: Builder, b: CityBuilding, c: number): void {
  const y0 = b.base;
  const top = b.base + b.wall;
  const P = (at: number, out: number, y: number): Vec3 => fp(b, c + at, out, y0 + y);
  const sz = (len: number, h: number, thick: number): Vec3 => [len, h, thick];
  const lit = B.ch.lit;
  const deco = B.ch.deco;
  // Mane behind the face (orange, peeks out round the plate) and the red face plate.
  lit.sph(1, P(0, 0.1, 3.5), OF.mane, [3.0, 3.0, 0.3]);
  lit.box(sz(5.0, 5.6, 0.3), P(0, 0.15, 3.0), OF.red);
  // Fur fringe round the plate (cream blocks, some missing).
  for (let i = -4; i <= 4; i++) {
    if (i === 2) continue;
    deco.box(sz(0.55, 0.7, 0.3), P(i * 0.6, 0.3, 5.9 - Math.abs(i) * 0.08), OF.cream, [0, 0, i * 0.14]);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
    if (s > 0 && k === 3) continue;
    deco.box(sz(0.6, 0.45, 0.3), P(s * 2.65, 0.3, 1.2 + k * 0.95), OF.cream, [0, 0, s * (0.5 + k * 0.05)]);
  }
  // Beard: cream fringe hanging beside the mouth.
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) deco.box(sz(0.34, 0.9 - k * 0.1, 0.2), P(s * (1.65 + k * 0.32), 0.38, 0.6), OF.cream, [0, 0, s * 0.12]);
  // The mouth: the door. Dark red frame, black inside, gold lip, teeth, a faded red tongue carpet on the ground.
  deco.box(sz(2.5, 2.7, 0.12), P(0, 0.26, 1.35), OF.redDark);
  deco.box(sz(1.6, 2.35, 0.1), P(0, 0.34, 1.18), OF.dark);
  deco.box(sz(2.9, 0.2, 0.22), P(0, 0.34, 2.8), OF.gold);
  for (const s of [-1, 1]) deco.box(sz(0.16, 2.7, 0.2), P(s * 1.4, 0.34, 1.35), OF.gold);
  for (let k = -2; k <= 2; k++) deco.box(sz(0.26, k % 2 ? 0.42 : 0.3, 0.14), P(k * 0.3, 0.42, 2.4 - (k % 2 ? 0.1 : 0)), OF.teeth);
  for (const s of [-1, 1]) deco.cone(0.15, 0.7, P(s * 0.78, 0.42, 2.05), OF.teeth, [Math.PI, 0, 0]); // fangs
  for (let k = -2; k <= 2; k++) if (k !== 1) deco.box(sz(0.22, 0.22, 0.14), P(k * 0.3, 0.42, 0.15), OF.teeth);
  deco.quad(1.3, 1.4, P(0, 0.9, 0.07), 0x8a4a40);
  // Nose, gold cheeks with whisker dots.
  lit.sph(0.42, P(0, 0.5, 3.3), OF.gold, [1.1, 0.9, 0.9]);
  for (const s of [-1, 1]) {
    lit.sph(0.62, P(s * 1.95, 0.45, 2.3), OF.gold, [1, 0.8, 0.6]);
    for (let k = 0; k < 3; k++) deco.sph(0.06, P(s * (1.75 + k * 0.2), 0.8, 2.25 - k * 0.1), OF.redDark);
  }
  // Big round eyes: gold ring, pale ball, dark pupil, a dim amber glow (the only light left in the old place).
  for (const s of [-1, 1]) {
    const ex = s * 1.45;
    lit.cyl(0.98, 0.1, P(ex, 0.34, 4.2), OF.gold, [Math.PI / 2, 0, 0]);
    lit.sph(0.82, P(ex, 0.42, 4.2), 0xe0d6b8, [1, 1, 0.35]);
    deco.sph(0.42, P(ex - s * 0.08, 0.7, 4.16), OF.dark, [1, 1.1, 0.3]);
    B.ch.glow.sph(0.2, P(ex - s * 0.08, 0.84, 4.16), 0xb08a30, [1, 1, 0.3]);
    deco.sph(0.06, P(ex - s * 0.2, 0.86, 4.35), 0xe8dcc0);
    // Brows: raised at the outer end, gold trim on top.
    deco.box(sz(1.9, 0.36, 0.3), P(ex, 0.45, 5.2), OF.redDark, [0, 0, -s * 0.28]);
    deco.box(sz(1.9, 0.12, 0.32), P(ex, 0.45, 5.45), OF.gold, [0, 0, -s * 0.28]);
    // Ears.
    lit.sph(0.55, P(s * 2.6, 0.15, 5.4), OF.red);
    deco.sph(0.3, P(s * 2.6, 0.5, 5.4), OF.gold);
  }
  // Horn with its gem seat, forehead gem.
  lit.cone(0.3, 1.3, P(0, 0.4, 6.4), OF.gold);
  lit.sph(0.38, P(0, 0.5, 5.75), OF.gold);
  // Round pillars with gold bands, flanking the door.
  for (const at of [4.7 - c, -1.2 - c]) {
    lit.cyl(0.3, 6.3, P(at, 0.35, 3.15), OF.red);
    for (const y of [0.35, 5.9]) deco.cyl(0.36, 0.22, P(at, 0.35, y), OF.gold);
  }
  // Faded lanterns hanging from the eave, a dim amber glow inside.
  for (const at of [-2.3, 2.3]) {
    deco.cyl(0.02, 0.6, P(at, 1.15, 6.95), 0x5a4a3a);
    lit.sph(0.38, P(at, 1.15, 6.4), 0xb5605a, [1, 1.25, 1]);
    deco.cyl(0.2, 0.1, P(at, 1.15, 6.88), OF.gold);
    deco.cyl(0.14, 0.1, P(at, 1.15, 5.9), OF.gold);
    B.ch.glow.sph(0.17, P(at, 1.15, 6.4), 0xa98a3c);
  }
  // Boards: two planks nailed across the left cheek, one leaning at the mouth, cracks in the paint.
  deco.box(sz(2.2, 0.22, 0.1), P(1.8, 0.55, 3.4), OF.wood, [0, 0, 0.55]);
  deco.box(sz(2.0, 0.2, 0.1), P(1.7, 0.6, 2.7), 0x5a3a2a, [0, 0, -0.4]);
  deco.box(sz(0.22, 1.8, 0.1), P(-1.55, 0.5, 1.0), OF.wood, [0, 0, -0.25]);
  for (const [at, y, r] of [[-1.9, 3.9, 0.4], [0.7, 4.8, -0.5], [1.0, 3.0, 0.2]]) deco.box(sz(0.05, 0.9, 0.05), P(at, 0.34, y), OF.redDark, [0, 0, r]);
  // Vines over the face and leaf clumps.
  for (let i = 0; i < 6; i++) {
    const at = -2.2 + i * 0.9;
    const h = 1.2 + ((i * 37) % 4) * 0.6;
    deco.box(sz(0.14, h, 0.06), P(at, 0.5, 5.8 - h / 2), i % 2 ? OF.vine : OF.leaf);
    deco.sph(0.2, P(at, 0.52, 5.8 - h), OF.leaf, [1, 0.6, 0.7]);
  }
  for (const [at, y] of [[2.0, 5.55], [-2.7, 5.1], [-1.9, 0.5], [2.3, 0.4]]) deco.sph(0.4, P(at, 0.55, y), OF.vine, [1.3, 0.7, 0.7]);

  // ---- Roof: a curved skirt round the walls (steep, flatter, upturned lip), gold edge, flared corners, then a smaller upper tier.
  const hw = b.w / 2;
  const hd = b.d / 2;
  const segs: [number, number][] = [[0.5, 0.55], [0.5, 0.22], [0.4, -0.3]]; // [out length, slope (down = +)]
  const sides: { n: [number, number]; len: number; rot: (t: number) => Vec3; off: number }[] = [
    { n: [0, 1], len: b.w + 2.8, rot: (t) => [t, 0, 0], off: hd },
    { n: [0, -1], len: b.w + 2.8, rot: (t) => [-t, 0, 0], off: hd },
    { n: [1, 0], len: b.d, rot: (t) => [0, 0, -t], off: hw },
    { n: [-1, 0], len: b.d, rot: (t) => [0, 0, t], off: hw },
  ];
  sides.forEach((sd, si) => {
    let o = 0;
    let y = top - 0.05;
    segs.forEach(([ol, sl], k) => {
      const dy = -Math.tan(sl) * ol;
      const mid = o + ol / 2;
      const [nx, nz] = sd.n;
      const pos: Vec3 = [b.x + nx * (sd.off + mid), y + dy / 2, b.z + nz * (sd.off + mid)];
      const lenPlane = ol / Math.cos(sl);
      lit.box(nx ? [lenPlane, 0.16, sd.len] : [sd.len, 0.16, lenPlane], pos, OF.tile, sd.rot(sl));
      // Cracked / missing tiles (dark patches) and moss on the lower slope.
      if (k === 1 && si < 2) {
        deco.box([0.7, 0.05, 0.36], [pos[0] - 1.9, pos[1] + 0.1, pos[2]], 0x2e201a, sd.rot(sl));
        deco.box([0.5, 0.05, 0.3], [pos[0] + 2.4, pos[1] + 0.1, pos[2]], 0x2e201a, sd.rot(sl));
        deco.sph(0.45, [pos[0] + 0.6, pos[1] + 0.12, pos[2]], OF.vine, [1.4, 0.2, 0.9]);
      }
      o += ol;
      y += dy;
    });
    const [nx, nz] = sd.n;
    deco.box(nx ? [0.18, 0.14, sd.len] : [sd.len, 0.14, 0.18], [b.x + nx * (sd.off + o), y + 0.06, b.z + nz * (sd.off + o)], OF.gold);
  });
  for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) {
    // One corner tip is broken off.
    if (sx > 0 && sz2 < 0) continue;
    lit.cone(0.2, 1.0, [b.x + sx * (hw + 1.45), top - 0.1, b.z + sz2 * (hd + 1.45)], OF.red, [sz2 * 0.4, 0, -sx * 0.4]);
  }
  // Upper tier: a collar, a wider pyramid with an upturned lip at the corners, a gold finial.
  lit.box([3.8, 0.9, 3.0], [b.x, top + 0.5, b.z], OF.red);
  lit.pyr(6.8, 1.3, 5.4, [b.x, top + 1.1 + 0.65, b.z], OF.tile);
  deco.box([6.9, 0.14, 5.5], [b.x, top + 1.12, b.z], OF.gold);
  for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) {
    if (sx < 0 && sz2 > 0) continue;
    lit.cone(0.16, 0.8, [b.x + sx * 3.45, top + 1.3, b.z + sz2 * 2.75], OF.red, [sz2 * 0.4, 0, -sx * 0.4]);
  }
  lit.sph(0.28, [b.x, top + 2.5, b.z], OF.gold);
  lit.cone(0.1, 0.5, [b.x, top + 2.95, b.z], OF.gold);
}

function drawTower(B: Builder, b: CityBuilding): void {
  const t = b.tower as NonNullable<CityBuilding['tower']>;
  const dist = districtById(b.district);
  const pod = t.podium;
  const top = b.base + b.wall;
  const h = b.wall - pod;
  // Podium with a gold band and steps painted on its sides.
  B.far.box([12, pod, 12], [b.x, b.base + pod / 2, b.z], STONE, undefined, T.paving);
  B.far.box([12.04, 0.25, 12.04], [b.x, b.base + pod - 0.125, b.z], C.GOLD);
  B.far.box([12.04, 0.3, 12.04], [b.x, b.base + 0.15, b.z], lighten(dist.color, 20));
  // Tower body.
  const ty = b.base + pod + h / 2;
  if (t.round) B.far.cyl(t.size / 2, h, [b.x, ty, b.z], dist.color);
  else B.far.box([t.size, h, t.size], [b.x, ty, b.z], dist.color, undefined, T.plaster);
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
    for (const y of [pod + h * 0.18, pod + h * 0.5]) B.ch.deco.decal(T.window0, 1.0, 1.2, [b.x + fx * r, b.base + y, b.z + fz * r], Math.atan2(fx, fz));
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

const LEAF = [0x6fcf5a, 0x5cc04f, 0x86d85e, 0x4fb561];
const LEAF_DARK = [0x4fae4a, 0x3f9f47, 0x5fbf4f, 0x3a9650];

function drawProps(B: Builder, L: CityLayout): void {
  const E = {
    canopy: envModels.shape('canopy'),
    trunk: envModels.shape('trunk'),
    pine: envModels.shape('pine'),
    lamp: envModels.shape('lamp'),
    bench: envModels.shape('bench'),
  };
  for (const t of L.trees) {
    const ch = B.at(t.x, t.z);
    const s = t.s;
    const hv = hsh(t.x, t.z, 2);
    const yaw = hv * 6.283;
    if (t.kind === 'pine' && E.pine >= 0) {
      // Stylised pine (env model, own colours; 37 triangles): scalloped soft tiers, about 5.2 m at s = 1.
      const r = t.far ? B.far : ch.lit;
      const k = 0.9 + (Math.floor(hv * 3) / 3) * 0.2;
      r.add(E.pine as Sh, [t.x, t.base, t.z], [s, s * k, s], 0xffffff, [0, yaw, 0]);
    } else if (t.kind === 'pine') {
      const r = t.far ? B.far : ch.lit;
      const k = Math.floor(hv * 3);
      r.trunk(0.18 * s, 1.4 * s, [t.x, t.base + 0.7 * s, t.z], C.BROWN);
      r.add(Sh.Cone1, [t.x, t.base + 2.4 * s, t.z], [1.35 * s, 2.6 * s, 1.35 * s], [0x2f7f45, 0x2b7a4f, 0x35884a][k]);
      r.coneOpen(0.95 * s, 2.0 * s, [t.x, t.base + 3.9 * s, t.z], [0x3f9f4f, 0x3b9a58, 0x47a851][k]);
    } else if (E.canopy >= 0 && E.trunk >= 0) {
      // Stylised round tree (env models): flared trunk + one soft three-lobe canopy with baked light (the leaf hue comes from here).
      const bloom = hv > 0.88;
      const lc = bloom ? 0xffb8d4 : LEAF[Math.floor(hv * 4) % 4];
      ch.lit.add(E.trunk as Sh, [t.x, t.base, t.z], [0.32 * s, 2.0 * s, 0.32 * s], 0xffffff, [0, yaw, 0]);
      ch.lit.add(E.canopy as Sh, [t.x, t.base + 2.4 * s, t.z], [1.15 * s, 1.05 * s, 1.15 * s], lc, [0, yaw, 0]);
    } else {
      // Round crown: a main ball and three soft lobes (smooth normals make the cluster read as one round cloud). A few are in blossom.
      const bloom = hv > 0.88;
      const k = Math.floor(hv * 4) % 4;
      const lc = bloom ? 0xff9fc0 : LEAF[k];
      const ld = bloom ? 0xf07aa8 : LEAF_DARK[k];
      ch.lit.trunk(0.2 * s, 1.5 * s, [t.x, t.base + 0.75 * s, t.z], 0x9a6a45);
      ch.lit.add(Sh.Sph1, [t.x, t.base + 2.3 * s, t.z], [0.95 * s, 0.92 * s, 0.95 * s], lc);
      ch.lit.add(Sh.Sph0, [t.x + 0.62 * s, t.base + 2.0 * s, t.z - 0.2 * s], [0.72 * s, 0.7 * s, 0.72 * s], ld);
      ch.lit.add(Sh.Sph0, [t.x - 0.5 * s, t.base + 2.1 * s, t.z + 0.4 * s], [0.66 * s, 0.64 * s, 0.66 * s], ld);
      ch.lit.ball(0.6 * s, [t.x + 0.1 * s, t.base + 2.95 * s, t.z + 0.1 * s], lc);
    }
  }
  for (const l of L.lamps) {
    const ch = B.at(l.x, l.z);
    if (E.lamp >= 0) {
      // Env model: rounded plinth, tapered pole, curved arm, golden hood; the bulb stays in the glow layer.
      ch.deco.add(E.lamp as Sh, [l.x, 0, l.z], [1, 1, 1], 0xffffff);
      ch.glow.ball(0.2, [l.x + 0.42, 3.36, l.z], 0xffe9a0);
      continue;
    }
    // Teal pole on a base, a short arm with a golden cap and a glowing lantern.
    ch.deco.boxNB([0.3, 0.35, 0.3], [l.x, 0.175, l.z], 0x3d7f8a);
    ch.deco.trunk(0.07, 3.1, [l.x, 1.9, l.z], 0x3d7f8a);
    ch.deco.boxNB([0.5, 0.07, 0.07], [l.x + 0.2, 3.4, l.z], 0x3d7f8a);
    ch.deco.cone(0.26, 0.2, [l.x + 0.4, 3.62, l.z], C.GOLD);
    ch.glow.ball(0.22, [l.x + 0.4, 3.38, l.z], 0xffe9a0);
  }
  for (const b of L.benches) {
    const ch = B.at(b.x, b.z);
    const [w, d] = b.alongX ? [1.8, 0.6] : [0.6, 1.8];
    const bs = envModels.size('bench');
    if (E.bench >= 0 && bs) {
      // Poly Haven painted bench (CC0), fitted to the old 1.8 x 0.6 footprint; its backrest is on local -z (turned to -x across).
      ch.deco.add(E.bench as Sh, [b.x, 0, b.z], [1.8 / bs.x, 0.85 / bs.y, 0.62 / bs.z], 0xffffff, b.alongX ? undefined : [0, Math.PI / 2, 0]);
    } else {
    ch.deco.box([w, 0.1, d], [b.x, 0.45, b.z], 0xffffff, undefined, T.wood);
    ch.deco.boxNB(b.alongX ? [1.8, 0.5, 0.08] : [0.08, 0.5, 1.8], [b.x - (b.alongX ? 0 : 0.26), 0.75, b.z - (b.alongX ? 0.26 : 0)], 0xffffff, undefined, T.wood);
    for (const s of [-1, 1]) ch.deco.boxNB([b.alongX ? 0.1 : 0.62, 0.42, b.alongX ? 0.62 : 0.1], [b.x + (b.alongX ? s * 0.8 : 0), 0.21, b.z + (b.alongX ? 0 : s * 0.8)], 0x3d7f8a);
    }
    // A flower pot at one end.
    const px = b.x + (b.alongX ? 1.15 : 0);
    const pz = b.z + (b.alongX ? 0 : 1.15);
    ch.deco.boxNB([0.3, 0.28, 0.3], [px, 0.14, pz], 0xd9632f);
    ch.deco.ball(0.22, [px, 0.46, pz], 0x4f9f3a, [1, 0.85, 1]);
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
      ch.deco.boxNB([0.12, 1.1, 0.12], [x, y + 0.5, z], 0xe0b078, [tilt, yaw, 0], T.wood);
      if (k < n && !(f.broken && k % 2 === 0)) {
        const x2 = f.x0 + (f.x1 - f.x0) * ((k + 0.5) / n);
        const z2 = f.z0 + (f.z1 - f.z0) * ((k + 0.5) / n);
        const y2 = f.base0 + (f.base1 - f.base0) * ((k + 0.5) / n);
        ch.deco.boxNB([0.06, 0.1, len / n], [x2, y2 + 0.8, z2], 0xf0c48c, [0, yaw, 0], T.wood);
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

const GROUND_TILE: Record<GroundKind, number> = {
  grass: T.grass,
  field: T.grass,
  flowers: T.grass,
  sand: T.grass,
  dirt: T.grass,
  plaza: T.paving,
  paving: T.paving,
  water: 0,
};

function drawGround(B: Builder, L: CityLayout): void {
  const F = B.flat;
  F.quad(CITY.half * 2 + 140, CITY.half * 2 + 140, [0, Y.base, 0], 0x7cc566, T.grass);
  for (const g of L.ground) {
    const w = g.x1 - g.x0;
    const d = g.z1 - g.z0;
    if (w <= 0 || d <= 0) continue;
    F.quad(w, d, [(g.x0 + g.x1) / 2, Y[g.kind], (g.z0 + g.z1) / 2], g.color ?? GROUND_COLOR[g.kind], GROUND_TILE[g.kind]);
  }
  for (const r of L.roads) {
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    F.quad(w, d, [cx, Y.walk, cz], SIDEWALK, T.paving);
    const half = r.main ? CITY.main.road : CITY.local.road;
    const alongX = w > d;
    // Asphalt strip: u across the road (lane wear, edge lines), v along it.
    if (alongX) F.quad(half * 2, w, [cx, Y.road, cz], 0xffffff, T.asphalt, [0, Math.PI / 2, 0]);
    else F.quad(half * 2, d, [cx, Y.road, cz], 0xffffff, T.asphalt);
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
  envModels.cityBuilt = true;
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
