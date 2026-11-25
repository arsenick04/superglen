import * as THREE from 'three';
import { C } from '../bab1/Kit';
import { EDGE_COLOR } from '../kits/ParkourKit';
import { Parkour } from '../../config/parkour';
import { Recipe, Sh, type Vec3 } from './CityMesher';
import { ATLAS_TILES, T } from './CityAtlas';
import { envModels } from './EnvModels';
import { dressedBody, dressOf, type Dress } from './CityDressing';
import { cityModels } from './CityModels';
import { GREEN_PLAN, hasCityTree, natureReady, natureSize, type NatureId } from './CityNature';
import { CHUNKS, CITY, FACE_VEC, chunkIndex, districtById, hillSurfaceY, treePlatforms, isEdgeHill, type CityBuilding, type CityLayout, type CityPiece, type GroundKind, type Solid } from './CityData';

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
  /** Flat ground items of level 1.. (index = level; [0] unused): same height band, each level its own mesh with a depth bias (see FLAT_STEP). */
  flatLayers: Recipe[];
  chunks: ChunkRecipes[];
  globalSolids: Solid[];
}

const SIDEWALK = 0xeadcbf;
const MARK = 0xfff3b0;
const STONE = 0xe8d9b5;
/**
 * Visual heights of the flat layers (the collider ground is y = 0, the feet stand on it: every flat layer stays within +-1 cm of it).
 * Every flat item that overlaps an item of a different look gets its own level: a 2.5 mm height step plus a polygonOffset of
 * FLAT_BIAS_UNITS per level (each level is its own mesh/material, see ChunkStreamer), so ground tints, plazas, sidewalks, asphalt and
 * markings never z-fight at any distance, without lifting them off the collider. Items are stacked by class (later classes lie above
 * earlier ones, see `FLAT_CLASS`); an item's height is `FLAT_Y0 + level * FLAT_STEP` (see `layerFlat`).
 */
const FLAT_STEP = 0.0025;
const FLAT_Y0 = -0.005;
/** Depth bias per flat level (polygonOffset units; the real layering, the 2.5 mm height steps only keep planes apart). */
export const FLAT_BIAS_UNITS = 3;
/** Height of the dirt path quads above the collider surface (just over the z-fight tolerance of the ground layers, under the 2 cm target). */
const PATH_LIFT = 0.016;
const FLAT_CLASS: Record<GroundKind, number> = { grass: 1, field: 2, flowers: 3, sand: 4, dirt: 5, plaza: 6, paving: 7, water: 8 };
const FLAT_WALK = 9;
const FLAT_ROAD = 10;
const FLAT_TILE = 11;
const FLAT_MARK = 12;
const GROUND_COLOR: Record<GroundKind, number> = {
  grass: 0x69bc61,
  field: 0x5bb04f,
  flowers: 0x7dc86b,
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
  readonly flatLayers: Recipe[] = [new Recipe()];
  flatAt(level: number): Recipe {
    while (this.flatLayers.length <= level) this.flatLayers.push(new Recipe());
    return this.flatLayers[level];
  }
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

/**
 * Visual push (m) of the blocks of the pieces of a building that wears a model: the data's footholds end flush with the facade, which
 * is also where the model's wall is, so the block's front face would share the wall's plane. 3 cm outward (towards the street)
 * separates them; the collider (and so the walkable top) is unchanged. Set per piece by `drawPiece`.
 */
const blockShift: [number, number] = [0, 0];

function block(B: Builder, p: CityPiece, base: number, color: number, cap = lighten(color), tile = 0, capTile = 0): void {
  const t = p.thick ?? p.top - base;
  const bottom = p.top - t;
  const capH = Math.min(0.16, t * 0.3);
  const px = p.x + blockShift[0];
  const pz = p.z + blockShift[1];
  B.ch.lit.box([p.w, t - capH, p.d], [px, bottom + (t - capH) / 2, pz], color, undefined, tile);
  B.ch.lit.box([p.w + 0.04, capH, p.d + 0.04], [px, p.top - capH / 2, pz], capTile ? 0xffffff : cap, undefined, capTile);
  edge(B, p.x, p.z, p.w, p.d, p.top);
}

/** HSL (all 0..1) to 0xrrggbb. */
function hslHex(h: number, sat: number, l: number): number {
  const hh = ((h % 1) + 1) % 1;
  const f = (n: number): number => {
    const k = (n + hh * 12) % 12;
    const a = sat * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

interface Palette {
  /** Pastel of the wall hue (balcony body). */
  body: number;
  /** Strong pastel accent (balcony apron, crate label). */
  accent: number;
  /** Second accent (sign board, awning valance). */
  accent2: number;
  trim: number;
  /** Awning post / railing paint. */
  rail: number;
}

/** Piece colours that follow the building's own pastel: the wall hue of its Downtown model, else a hash of the position. */
function palette(b: CityBuilding): Palette {
  const dress = dressOf(b);
  const h = dress && dress.color.w > 0 ? dress.color.w : hsh(b.x, b.z, 9);
  return {
    body: hslHex(h, 0.62, 0.88),
    accent: hslHex(h + 0.5, 0.58, 0.66),
    accent2: hslHex(h + 0.14, 0.7, 0.68),
    trim: 0xfff4e0,
    rail: 0xfffaf0,
  };
}

function drawPiece(B: Builder, b: CityBuilding, p: CityPiece): void {
  const [fx, fz] = FACE_VEC[b.face];
  const along = b.face < 2; // piece long side along x
  const old = b.abandoned === true;
  const dress = dressOf(b);
  blockShift[0] = dress ? fx * 0.03 : 0;
  blockShift[1] = dress ? fz * 0.03 : 0;
  if (dress && p.type !== 'crate' && p.type !== 'podium') {
    const body = dressedBody(dress);
    const face = fz > 0 ? body.max.z : fz < 0 ? body.min.z : fx > 0 ? body.max.x : body.min.x;
    const rear = fz !== 0 ? p.z - fz * p.d / 2 : p.x - fx * p.w / 2;
    const gap = Math.max(0, (rear - face) * (fx || fz));
    // A real mounting ledge joins the unchanged foothold to the model wall; it can never hang in midair.
    if (gap > 0.025) {
      const thick = p.type === 'bay' ? p.top - b.base : Math.min(p.thick ?? 0.22, 0.22);
      const x = fz !== 0 ? p.x : (rear + face) / 2;
      const z = fz !== 0 ? (rear + face) / 2 : p.z;
      B.ch.lit.box(fz !== 0 ? [p.w, thick, gap + 0.08] : [gap + 0.08, thick, p.d], [x, p.top - thick / 2, z], old ? p.type === 'bay' ? 0x985347 : 0x91775c : 0xf2e5cb, undefined, old && p.type === 'bay' ? T.wood : 0);
    }
    if (p.type === 'awning') {
      for (const s of [-1, 1]) {
        const x = p.x + (along ? s * (p.w / 2 - 0.12) : fx * (p.w / 2 - 0.12));
        const z = p.z + (along ? fz * (p.d / 2 - 0.12) : s * (p.d / 2 - 0.12));
        const h = p.top - (p.thick ?? 0.25) - b.base;
        B.ch.deco.boxNB([0.09, h, 0.09], [x, b.base + h / 2, z], old ? 0x81684d : palette(b).rail);
      }
    }
  }
  switch (p.type) {
    case 'crate': {
      const n = p.n ?? 1;
      const sz = (p.top - b.base) / n;
      const pal = palette(b);
      for (let i = 0; i < n; i++) {
        B.ch.deco.boxNB([p.w + 0.06, 0.07, p.d + 0.06], [p.x, b.base + i * sz + 0.04, p.z], 0x8a5a2c);
        B.ch.deco.box([p.w + 0.06, 0.07, p.d + 0.06], [p.x, b.base + (i + 1) * sz - 0.075, p.z], 0x8a5a2c); // lid top 4 cm under the block's cap
        // Corner posts, a painted label plate and a cross brace on the outward face: reads as a real shipping crate.
        for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) B.ch.deco.boxNB([0.09, sz, 0.09], [p.x + sx * (p.w / 2 + 0.01), b.base + i * sz + sz / 2, p.z + sz2 * (p.d / 2 + 0.01)], 0x7a4c22);
        const cx = p.x + fx * (p.w / 2 + 0.04);
        const cz = p.z + fz * (p.d / 2 + 0.04);
        const cy = b.base + i * sz + sz / 2;
        const span = Math.hypot(sz - 0.2, along ? p.w : p.d);
        const ang = Math.atan2(sz - 0.2, along ? p.w : p.d);
        B.ch.deco.boxNB(along ? [span, 0.07, 0.04] : [0.04, 0.07, span], [cx, cy, cz], 0x7a4c22, along ? [0, 0, ang] : [ang, 0, 0]);
        B.ch.deco.boxNB(along ? [0.34, 0.24, 0.1] : [0.1, 0.24, 0.34], [cx + fx * 0.01, cy, cz + fz * 0.01], pal.accent); // label front 4 cm proud of the brace
      }
      block(B, p, b.base, 0xeac08a, 0xf5d09c, T.wood, T.wood);
      break;
    }
    case 'ac': {
      const pal = palette(b);
      block(B, p, b.base, 0xf4f7fb, 0xffffff);
      const t = p.thick ?? 0.8;
      const ox = along ? 0 : fx * (p.w / 2 + 0.02);
      const oz = along ? fz * (p.d / 2 + 0.02) : 0;
      const wide = (along ? p.w : p.d) * 0.82;
      // Grille slats, a round fan guard and a coloured stripe on top: a cute split-unit outdoor box.
      for (let i = 0; i < 4; i++) B.ch.deco.boxNB(along ? [wide, 0.04, 0.04] : [0.04, 0.04, wide], [p.x + ox, p.top - t * 0.28 - i * t * 0.12, p.z + oz], 0x8fa3ba);
      B.ch.deco.cyl(t * 0.2, 0.05, [p.x + ox + (along ? 0 : fx * 0.03), p.top - t * 0.5, p.z + oz + (along ? fz * 0.03 : 0)], 0xb9c8d8, along ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]);
      B.ch.deco.boxNB([p.w + 0.05, 0.09, p.d + 0.05], [p.x, p.top - 0.6, p.z], pal.accent2); // stripe wholly inside the body height, clear of the cap and of the grille slats
      // Two wall brackets under the unit.
      for (const sx of [-1, 1]) B.ch.deco.boxNB(along ? [0.1, 0.1, p.d * 0.7] : [p.w * 0.7, 0.1, 0.1], [p.x + (along ? sx * (p.w / 2 - 0.25) : 0), p.top - t - 0.05, p.z + (along ? 0 : sx * (p.d / 2 - 0.25))], 0x7b8ea3);
      break;
    }
    case 'awning': {
      // Stripes come from the texture (no more 6 boxes per awning).
      const st = old ? 0 : stripeTile(b.district);
      block(B, p, b.base, old ? 0x9c8a74 : 0xffffff, old ? 0xb5a58c : 0xffffff, st, st);
      if (!old) {
        // Coloured valance hanging off the outer edge (canopy edge).
        const pal = palette(b);
        const t = p.thick ?? 0.25;
        B.ch.deco.boxNB(along ? [p.w + 0.04, 0.13, 0.05] : [0.05, 0.13, p.d + 0.04], [p.x + fx * (p.w / 2 + 0.01), p.top - t - 0.05, p.z + fz * (p.d / 2 + 0.01)], pal.accent2);
      }
      break;
    }
    case 'bay': {
      // L18: next to a Kenney / owner model the bay takes the kit's look (pale wall, slate trim and rails).
      const kit = dressOf(b) !== null;
      const pal = palette(b);
      const col = kit ? (old ? 0xb08a6a : pal.body) : old ? 0x9c8a74 : b.wallColor === 0xffffff ? 0xbfeee8 : C.YELLOW;
      block(B, p, b.base, old ? 0x985347 : col, old ? 0xb59a62 : kit ? pal.trim : C.GOLD, old ? T.wood : T.plaster, old ? T.wood : 0);
      // Painted apron band under the deck (was a dark slab).
      B.ch.deco.box([p.w + 0.04, 0.5, p.d + 0.04], [p.x, p.top - 0.45, p.z], old ? 0x7a5048 : kit ? pal.accent : C.RED, undefined, old ? T.wood : 0);
      // Railing: two rails and thin posts (boxes: a round post is 24 triangles).
      const rc = old ? 0x9c8052 : kit ? pal.rail : C.GOLD;
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
      if (kit && !old) {
        // Flower box on the front rail: terracotta tub with round blooms (outside the standing area of the deck).
        const px = p.x + (along ? 0 : fx * (p.w / 2 - 0.1 + 0.1));
        const pz = p.z + (along ? fz * (p.d / 2 - 0.1 + 0.1) : 0);
        const len = (along ? p.w : p.d) * 0.55;
        B.ch.deco.box(along ? [len, 0.22, 0.2] : [0.2, 0.22, len], [px, p.top + 0.5, pz], 0xd98a5f);
        for (let i = 0; i < 4; i++) {
          const k = (i - 1.5) * (len / 4);
          B.ch.deco.ball(0.13, [px + (along ? k : 0), p.top + 0.7 + (i % 2) * 0.03, pz + (along ? 0 : k)], i % 2 ? 0xff8fb1 : 0xffd45c);
        }
        B.ch.deco.boxNB(along ? [len, 0.06, 0.16] : [0.16, 0.06, len], [px, p.top + 0.63, pz], 0x5fae5a);
      }
      if (old) {
        // Weathered red timber pillars and gold collars match the owner's old temple, without a modern shop entrance.
        for (const s of [-1, 1]) {
          const x = p.x + (along ? s * (p.w / 2 - 0.16) : fx * (p.w / 2 - 0.1));
          const z = p.z + (along ? fz * (p.d / 2 - 0.1) : s * (p.d / 2 - 0.16));
          const h = p.top - b.base - 0.25;
          B.ch.deco.boxNB([0.28, h, 0.28], [x, b.base + h / 2, z], 0xb76b4c, undefined, T.wood);
          for (const y of [b.base + 0.22, p.top - 0.65]) B.ch.deco.boxNB([0.3, 0.14, 0.3], [x, y, z], 0xb49559);
        }
        for (const y of [b.base + 1.8, b.base + 3.6, p.top - 0.8]) B.ch.deco.boxNB(along ? [p.w, 0.15, 0.12] : [0.12, 0.15, p.d], [p.x + fx * (p.w / 2 - 0.04), y, p.z + fz * (p.d / 2 - 0.04)], 0xb49559);
        // Aged tiled eave below the unchanged landing deck joins the little wing to the temple's roof language.
        for (const [nx, nz] of FACE_VEC) {
          B.ch.deco.box(nz !== 0 ? [p.w + 0.35, 0.12, 0.3] : [0.3, 0.12, p.d + 0.35], [p.x + nx * (p.w / 2 + 0.05), p.top - 0.2, p.z + nz * (p.d / 2 + 0.05)], 0x7d7758, nz !== 0 ? [nz * 0.3, 0, 0] : [0, 0, -nx * 0.3], T.roofTerra);
        }
        break;
      }
      // Shop door and window painted on its outer face (decals).
      const ox = p.x + fx * (p.w / 2 + 0.04);
      const oz = p.z + fz * (p.d / 2 + 0.04);
      const yaw = facadeYaw(b);
      B.ch.deco.decal(old ? T.door0 : b.wallColor === 0xffffff ? T.door1 : T.door0, 1.0, 2.1, [ox, b.base + 1.05, oz], yaw);
      B.ch.deco.decal(T.window0, 1.0, 1.2, [ox + fx * 0.03, b.base + 3.2, oz + fz * 0.03], yaw);
      break;
    }
    case 'sign':
      if (old) {
        block(B, p, b.base, 0x8d6348, 0xb69c65, T.wood, T.wood);
        const bay = b.pieces.find((piece) => piece.type === 'bay');
        if (bay) {
          const bottom = p.top - (p.thick ?? 0.5);
          const h = Math.max(0.12, bottom - bay.top);
          B.ch.deco.boxNB([Math.abs(bay.x - p.x) + 0.24, 0.16, 0.2], [(bay.x + p.x) / 2, bay.top + 0.08, p.z], 0x825442, undefined, T.wood);
          B.ch.deco.boxNB([0.2, h, 0.2], [p.x, bay.top + h / 2, p.z], 0x9d5544, undefined, T.wood);
        }
      } else if (dressOf(b) !== null) {
        // Painted shop sign board with a cream rim and two little hanger posts (was a dark slab).
        const pal = palette(b);
        block(B, p, b.base, pal.accent2, pal.trim);
        const t = p.thick ?? 0.5;
        const ox = along ? 0 : fx * (p.w / 2 + 0.03);
        const oz = along ? fz * (p.d / 2 + 0.03) : 0;
        B.ch.deco.box(along ? [p.w * 0.8, t * 0.55, 0.04] : [0.04, t * 0.55, p.d * 0.8], [p.x + ox, p.top - t / 2, p.z + oz], pal.trim);
        B.ch.deco.box(along ? [p.w * 0.5, t * 0.22, 0.1] : [0.1, t * 0.22, p.d * 0.5], [p.x + ox, p.top - t / 2, p.z + oz], pal.accent); // 3 cm proud of the trim board
      }
      else block(B, p, b.base, old ? 0xa08a5a : C.GOLD, old ? 0xc9b48a : C.CREAM);
      break;
    case 'podium':
      // Drawn by the tower (far layer); only the bright edge belongs to the chunk.
      edge(B, p.x, p.z, p.w, p.d, p.top);
      break;
  }
}

/**
 * Tree platform branch: bark-coloured limb (the exact walkable box), a mossy top strip, a slanted support strut to the trunk and a leaf
 * tuft at the tip. Everything stays at or below the walkable top, or beyond the edge, so the visible top is the collider top.
 */
function branchLook(r: Recipe, t: { x: number; z: number; s: number; base: number }, center: Vec3, size: Vec3, leaf: number, _leafDark: number): void {
  const alongX = size[0] >= size[2];
  const u = Math.sign(alongX ? center[0] - t.x : center[2] - t.z) || 1;
  const len = alongX ? size[0] : size[2];
  const top = center[1] + size[1] / 2;
  r.add(Sh.Body, center, size, 0x9a6a44);
  // Moss strip: flat green quad just above the top face, inset from the bark rim.
  r.quad(alongX ? size[0] - 0.14 : size[0] * 0.62, alongX ? size[2] * 0.62 : size[2] - 0.14, [center[0], top + 0.03, center[2]], leaf);
  // Support strut (12 triangles), top at 0.55 of the limb, leaning in to the trunk.
  const L = 0.8 * t.s;
  const th = 0.6;
  const dTop = Math.abs(alongX ? center[0] - t.x : center[2] - t.z) - len * 0.2;
  const bx = (alongX ? t.x + u * (dTop - (L * Math.sin(th)) / 2) : center[0]);
  const bz = (alongX ? center[2] : t.z + u * (dTop - (L * Math.sin(th)) / 2));
  const by = center[1] - size[1] / 2 - (L * Math.cos(th)) / 2 + 0.02;
  r.boxNB([0.1 * t.s, L, 0.1 * t.s], [bx, by, bz], 0x84583a, alongX ? [0, 0, -u * th] : [u * th, 0, 0]);
  // Leaf tuft at the outer tip (beyond the edge).
  const tx = alongX ? center[0] + u * (len / 2 + 0.03) : center[0];
  const tz = alongX ? center[2] : center[2] + u * (len / 2 + 0.03);
  r.ball(0.2 * t.s, [tx, center[1] + 0.02, tz], leaf);
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

function drawTowerDressed(B: Builder, b: CityBuilding): void {
  drawTower(B, b, true);
}

function drawTower(B: Builder, b: CityBuilding, dressed = false): void {
  const t = b.tower as NonNullable<CityBuilding['tower']>;
  const dist = districtById(b.district);
  const pod = t.podium;
  const top = b.base + b.wall;
  const h = b.wall - pod;
  // Podium with a gold band and steps painted on its sides.
  B.far.add(Sh.Body, [b.x, b.base + (pod - 0.25) / 2, b.z], [12, pod - 0.25, 12], STONE, undefined, T.plaster);
  B.far.box([12.04, 0.25, 12.04], [b.x, b.base + pod - 0.125, b.z], C.GOLD);
  B.far.box([12.04, 0.3, 12.04], [b.x, b.base + 0.15, b.z], lighten(dist.color, 20));
  // Recessed arches, pilasters and a cornice give the climbable podium an architectural scale.
  for (let side = 0; side < 4; side++) {
    const [fx, fz] = FACE_VEC[side];
    const yaw = Math.atan2(fx, fz);
    for (const a of [-3.8, 0, 3.8]) {
      B.far.decal(T.window2, 1.8, Math.min(2.3, pod - 0.8), [b.x + fx * 6.03 - fz * a, b.base + pod * 0.5, b.z + fz * 6.03 + fx * a], yaw);
      B.far.box(fz !== 0 ? [0.24, pod - 0.4, 0.16] : [0.16, pod - 0.4, 0.24], [b.x + fx * 6.03 - fz * (a + 1.1), b.base + pod / 2, b.z + fz * 6.03 + fx * (a + 1.1)], 0xffedcc);
    }
    B.far.box(fz !== 0 ? [12.12, 0.16, 0.16] : [0.16, 0.16, 12.12], [b.x + fx * 6, b.base + pod - 0.48, b.z + fz * 6], 0xfff1d9);
  }
  if (!dressed) {
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
  for (let s = 0; s < 4; s++) {
    const [fx, fz] = FACE_VEC[s];
    const r = t.size / 2 + 0.04;
    for (const y of [pod + h * 0.18, pod + h * 0.5]) B.ch.deco.decal(T.window0, 1.0, 1.2, [b.x + fx * r, b.base + y, b.z + fz * r], Math.atan2(fx, fz));
  }
  }
  edge(B, b.x, b.z, t.size - (t.round ? 1.4 : 0), t.size - (t.round ? 1.4 : 0), top);
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

const KENNEY_ROUND: [string, number][] = [['nat_tree_oak', 1.23], ['nat_tree_default', 1.71], ['nat_tree_detailed', 1.33], ['nat_tree_plateau', 1.25], ['nat_tree_fat', 1.15], ['nat_tree_oak_fall', 1.23]];
const KENNEY_PINE: [string, number][] = [['nat_tree_pineRoundA', 1.37], ['nat_tree_pineTallA_detailed', 1.53], ['nat_tree_pineRoundC', 1.25], ['nat_tree_pineDefaultA', 1.55]];

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
  // L18: Kenney nature kit trees (CC0) when loaded: [model, height at s = 1].
  const ROUND = KENNEY_ROUND.map(([n, h]) => [cityModels.template(n), h] as const).filter(([id]) => id >= 0);
  const PINES = KENNEY_PINE.map(([n, h]) => [cityModels.template(n), h] as const).filter(([id]) => id >= 0);
  const lampK = cityModels.template('road_light-curved');
  for (const t of L.trees) {
    const ch = B.at(t.x, t.z);
    const s = t.s;
    const hv = hsh(t.x, t.z, 2);
    const yaw = hv * 6.283;
    const platforms = treePlatforms(t);
    if (hasCityTree(t)) {
      // Imported tree supplies trunk and foliage; keep the climbable branch
      // steps explicit so their visuals remain aligned with the shared physics.
      const lk = Math.floor(hv * LEAF.length) % LEAF.length;
      for (const { center, size } of platforms.slice(0, -1)) branchLook(ch.lit, t, center, size, LEAF[lk], LEAF_DARK[lk]);
      continue;
    }
    if (platforms.length) {
      const crown = platforms[4];
      const top = crown.center[1] + crown.size[1] / 2;
      const trunk = top - t.base - 0.35;
      const k = Math.floor(hv * LEAF.length) % LEAF.length;
      const color = hv > 0.91 ? 0xf3a0c4 : LEAF[k];
      const shade = hv > 0.91 ? 0xd978a3 : LEAF_DARK[k];
      ch.lit.trunk(0.23 * s, trunk, [t.x, t.base + trunk / 2, t.z], 0x946140);
      for (const { center, size } of platforms.slice(0, -1)) {
        branchLook(ch.lit, t, center, size, color, shade);
      }
      // The forgiving flat collider stays hidden inside a layered crown. Five
      // uneven lobes produce a natural silhouette and a darker underside,
      // rather than the old mushroom/flat-platform look.
      ch.lit.add(Sh.Sph1, [t.x, top - 0.53, t.z], [0.92 * s, 0.55, 0.88 * s], shade);
      ch.lit.add(Sh.Sph1, [t.x - 0.12 * s, top - 0.30, t.z + 0.06 * s], [0.78 * s, 0.46, 0.76 * s], color);
      ch.deco.add(Sh.Sph0, [t.x + 0.62 * s, top - 0.55, t.z - 0.06 * s], [0.54 * s, 0.38, 0.50 * s], color);
      ch.deco.add(Sh.Sph0, [t.x - 0.58 * s, top - 0.52, t.z + 0.18 * s], [0.56 * s, 0.40, 0.58 * s], shade);
      ch.deco.add(Sh.Sph0, [t.x + 0.12 * s, top - 0.48, t.z + 0.62 * s], [0.50 * s, 0.36, 0.52 * s], color);
      continue;
    }
    const kl = t.kind === 'pine' ? PINES : ROUND;
    if (kl.length) {
      const [id, h] = kl[Math.floor(hv * 997) % kl.length];
      const r = t.far ? B.far : ch.lit;
      const k = (t.kind === 'pine' ? 4.25 : 4.0) * s / h * (0.9 + hsh(t.x, t.z, 5) * 0.2);
      const tint = t.kind === 'pine'
        ? [0xd9f0df, 0xcce9d5, 0xe1f2dc][Math.floor(hv * 3) % 3]
        : [0xe3f3d6, 0xd5edcf, 0xeff0c7, 0xf3d9df][Math.floor(hv * 4) % 4];
      r.add(id as Sh, [t.x, t.base, t.z], [k * (0.94 + hv * 0.12), k, k * (1.04 - hv * 0.1)], tint, [0, yaw, 0]);
      continue;
    }
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
    if (lampK >= 0) {
      // Kenney curved street light, 3.7 m, arm turned to +x; the bulb stays in the glow layer.
      ch.deco.add(lampK as Sh, [l.x, 0, l.z], [5.5, 5.5, 5.5], 0xffffff, [0, -Math.PI / 2, 0]);
      ch.glow.ball(0.16, [l.x + 1.0, 3.62, l.z], 0xffe9a0);
      continue;
    }
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
    // Downtown City MegaKit planter (concrete box with soil) when loaded; the bush on top stays.
    const planter = cityModels.template('dt_prop_planter');
    const pm = cityModels.get('dt_prop_planter');
    if (planter >= 0 && pm) {
      ch.deco.add(planter as Sh, [px, 0, pz], [0.52 / (pm.max.x - pm.min.x), 0.3 / (pm.max.y - pm.min.y), 0.52 / (pm.max.z - pm.min.z)], 0xffffff);
      ch.deco.ball(0.2, [px, 0.4, pz], 0x4f9f3a, [1, 0.85, 1]);
    } else {
      ch.deco.boxNB([0.3, 0.28, 0.3], [px, 0.14, pz], 0xd9632f);
      ch.deco.ball(0.22, [px, 0.46, pz], 0x4f9f3a, [1, 0.85, 1]);
    }
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
  scatterGreen(B, L);
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

/**
 * L18: Kenney nature kit bushes, flowers and grass tufts (decoration, no collider): in front of every house and shop and scattered
 * over the grass of the blocks, never on a building, a climbing piece or a path. Deterministic (hash of the position).
 */
function scatterGreen(B: Builder, L: CityLayout): void {
  const nature = natureReady();
  GREEN_PLAN.length = 0;
  const bush = ['nat_plant_bushDetailed', 'nat_plant_bushLarge', 'nat_plant_bush'].map((n) => cityModels.template(n)).filter((i) => i >= 0);
  const flower = ['nat_flower_redA', 'nat_flower_yellowB', 'nat_flower_purpleA', 'nat_flower_redB', 'nat_flower_purpleC'].map((n) => cityModels.template(n)).filter((i) => i >= 0);
  const tuft = ['nat_grass_large', 'nat_grass_leafsLarge'].map((n) => cityModels.template(n)).filter((i) => i >= 0);
  if (!nature && (!bush.length || !flower.length || !tuft.length)) return;
  const blocked = (x: number, z: number, m: number): boolean =>
    L.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m) ||
    L.buildings.some((b) => b.pieces.some((p) => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m)) ||
    L.trees.some((t) => Math.abs(x - t.x) < 1 && Math.abs(z - t.z) < 1) ||
    L.benches.some((t) => Math.abs(x - t.x) < 1.6 && Math.abs(z - t.z) < 1.6) ||
    L.ponds.some((p) => Math.abs(x - p.x) < p.r + 1 && Math.abs(z - p.z) < p.r + 1);
  const put = (list: number[], x: number, z: number, size: number, k: number): void => {
    if (blocked(x, z, 0.4)) return;
    const h = hsh(x, z, k);
    const ch = B.at(x, z);
    const scale = size * (0.92 + h * 0.16);
    ch.deco.add(list[Math.floor(h * 97) % list.length] as Sh, [x, 0, z], [scale, scale, scale], 0xffffff, [0, h * 6.283, 0]);
  };
  // MegaKit plants (CityNature.ts): same places, drawn as instances around the player; `size` is the height in metres.
  const green = (id: NatureId, x: number, z: number, size: number, k: number, tints: number[] = [0xffffff], free = false): void => {
    if (!free && blocked(x, z, 0.4)) return;
    const h = hsh(x, z, k);
    const a = natureSize(id);
    if (!a) return;
    GREEN_PLAN.push({ id, x, y: 0, z, yaw: h * 6.283, s: (size * (0.9 + hsh(x, z, k + 11) * 0.2)) / a.y, tint: tints[Math.floor(h * 97) % tints.length] });
  };
  const BUSH_TINT = [0xffffff, 0xf0ffd8, 0xe4ffd0];
  const GRASS_TINT = [0xffffff, 0xf2ffd6, 0xe6ffc8];
  // Front gardens: a bush at both front corners, flowers between.
  for (const b of L.buildings) {
    if (b.base > 0 || (b.kind !== 'house' && b.kind !== 'ruko' && b.kind !== 'kiosk')) continue;
    const L2 = facadeLen(b) / 2;
    for (const s of [-1, 1]) {
      const [x, , z] = fp(b, s * (L2 - 0.3), 0.75, 0);
      const [fx, , fz] = fp(b, s * (L2 - 1.3), 0.6, 0);
      if (nature) {
        green('bush', x, z, 1.25, 1, BUSH_TINT);
        green('flowerbed', fx, fz, 1.0, 2);
      } else {
        put(bush, x, z, 2.6, 1);
        put(flower, fx, fz, 3.2, 2);
      }
    }
  }
  // Grass of the blocks: a tuft, a flower bed, a bush or a rock every ~9 m (jittered grid).
  for (const g of L.ground) {
    if (g.kind !== 'grass' && g.kind !== 'flowers') continue;
    const step = g.kind === 'flowers' ? (nature ? 3 : 1.6) : 9;
    for (let x = g.x0 + step / 2; x < g.x1; x += step)
      for (let z = g.z0 + step / 2; z < g.z1; z += step) {
        const jx = x + (hsh(x, z, 3) - 0.5) * step * 0.8;
        const jz = z + (hsh(x, z, 4) - 0.5) * step * 0.8;
        if (jx < g.x0 + 0.5 || jx > g.x1 - 0.5 || jz < g.z0 + 0.5 || jz > g.z1 - 0.5) continue;
        const r = hsh(jx, jz, 5);
        if (nature) {
          if (g.kind === 'flowers') green('flowerbed', jx, jz, 0.95, 6);
          else if (r < 0.5) green('grass', jx, jz, 0.8, 7, GRASS_TINT);
          else if (r < 0.74) green('flowerbed', jx, jz, 0.95, 8);
          else if (r < 0.93) green('bush', jx, jz, 1.1, 9, BUSH_TINT);
          else green('rock', jx, jz, 0.55 + hsh(jx, jz, 14) * 0.4, 10);
          continue;
        }
        if (g.kind === 'flowers') put(flower, jx, jz, 3.0, 6);
        else if (r < 0.55) put(tuft, jx, jz, 2.4, 7);
        else if (r < 0.8) put(flower, jx, jz, 2.8, 8);
        else put(bush, jx, jz, 2.2, 9);
      }
  }
  // Pond edges: a ring of rocks with a few tufts (nature kit only).
  if (nature) {
    for (const p of L.ponds) {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hsh(p.x, p.z, i) * 0.4;
        const rr = p.r + 0.5 + hsh(p.z, p.x, i) * 0.5;
        const px = p.x + Math.cos(a) * rr, pz = p.z + Math.sin(a) * rr;
        if (i % 3 === 0) green('rock', px, pz, 0.45 + hsh(px, pz, 3) * 0.4, 20, [0xffffff], true);
        else green('grass', px, pz, 0.8, 21, GRASS_TINT, true);
      }
    }
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

/** One flat item of the ground / road layers: its footprint on XZ, its look and how to emit it at a given height. */
interface FlatItem {
  cls: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  look: string;
  level: number;
  emit: (y: number, R: Recipe) => void;
}

/**
 * Give every flat item the lowest step such that it lies above every earlier-class item it overlaps (one extra step when the look
 * differs: identical looks may share a plane, nothing to fight over). The base quad is level 0. Returns the highest level.
 */
function layerFlat(B: Builder, items: FlatItem[]): number {
  items.sort((a, b) => a.cls - b.cls);
  let top = 0;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    let lv = 1;
    for (let j = 0; j < i; j++) {
      const f = items[j];
      if (f.x1 <= e.x0 + 0.01 || f.x0 >= e.x1 - 0.01 || f.z1 <= e.z0 + 0.01 || f.z0 >= e.z1 - 0.01) continue;
      const l = f.level + (f.look === e.look ? 0 : 1);
      if (l > lv) lv = l;
    }
    e.level = lv;
    if (lv > top) top = lv;
    e.emit(FLAT_Y0 + lv * FLAT_STEP, B.flatAt(lv));
  }
  return top;
}

function drawGround(B: Builder, L: CityLayout): void {
  const F = B.flat;
  const flat: FlatItem[] = [];
  /** Axis-aligned flat quad (footprint w x d centred on cx, cz); `rot` turns a strip tile (the footprint stays w x d in the world). */
  const addFlat = (cls: number, cx: number, cz: number, w: number, d: number, color: number, tile: number, rot?: Vec3): void => {
    flat.push({
      cls,
      x0: cx - w / 2,
      x1: cx + w / 2,
      z0: cz - d / 2,
      z1: cz + d / 2,
      look: `${color}:${tile}`,
      level: 0,
      emit: (y, R) => (rot ? R.quad(d, w, [cx, y, cz], color, tile, rot) : R.quad(w, d, [cx, y, cz], color, tile)),
    });
  };
  const roadKit = cityModels.template('road_road-straight');
  const roadTiles: { x: number; z: number; ax: boolean; half: number; width: number }[] = [];
  if (roadKit >= 0) {
    for (const r of L.roads) {
      const ax = r.x1 - r.x0 > r.z1 - r.z0;
      // Fit the complete square tile to the existing road + sidewalk corridor, with one uniform scale and no grass spill.
      const scale = (r.main ? CITY.main.half : CITY.local.half) * 2;
      const a0 = ax ? r.x0 : r.z0;
      const a1 = ax ? r.x1 : r.z1;
      const c = ax ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
      for (let a = a0 + scale / 2; a + scale / 2 <= a1 + 0.001; a += scale) {
        const x = ax ? a : c;
        const z = ax ? c : a;
        const crossing = L.roads.some((other) => {
          if ((other.x1 - other.x0 > other.z1 - other.z0) === ax) return false;
          return x + (ax ? scale / 2 : 0) > other.x0 - 0.1 && x - (ax ? scale / 2 : 0) < other.x1 + 0.1 && z + (ax ? 0 : scale / 2) > other.z0 - 0.1 && z - (ax ? 0 : scale / 2) < other.z1 + 0.1;
        });
        if (!crossing) roadTiles.push({ x, z, ax, half: scale / 2, width: scale });
      }
    }
  }
  const onRoadTile = (x: number, z: number): boolean => roadTiles.some((t) => Math.abs(x - t.x) < (t.ax ? t.half : t.width / 2) + 0.01 && Math.abs(z - t.z) < (t.ax ? t.width / 2 : t.half) + 0.01);
  F.quad(CITY.half * 2 + 140, CITY.half * 2 + 140, [0, FLAT_Y0, 0], 0x6eb85a, T.grass);
  for (const g of L.ground) {
    const w = g.x1 - g.x0;
    const d = g.z1 - g.z0;
    if (w <= 0 || d <= 0) continue;
    addFlat(FLAT_CLASS[g.kind], (g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2, w, d, g.color ?? GROUND_COLOR[g.kind], GROUND_TILE[g.kind]);
  }
  // Zebra crossings sit just outside every intersection. Paint and road stay in the same flat batch.
  const crossingKeys = new Set<string>();
  for (const r of L.roads) {
    const ax = r.x1 - r.x0 > r.z1 - r.z0;
    const half = r.main ? CITY.main.road : CITY.local.road;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    for (const o of L.roads) {
      if ((o.x1 - o.x0 > o.z1 - o.z0) === ax) continue;
      const ix = ax ? (o.x0 + o.x1) / 2 : cx;
      const iz = ax ? cz : (o.z0 + o.z1) / 2;
      if (ix < r.x0 || ix > r.x1 || iz < r.z0 || iz > r.z1) continue;
      const off = (o.main ? CITY.main.road : CITY.local.road) + 2;
      for (const side of [-1, 1]) {
        const x = ix + (ax ? off * side : 0);
        const z = iz + (ax ? 0 : off * side);
        const key = `${ax}:${x.toFixed(2)}:${z.toFixed(2)}`;
        if (crossingKeys.has(key)) continue;
        crossingKeys.add(key);
        for (let a = -half + 0.55; a < half - 0.2; a += 1.05) addFlat(FLAT_MARK, x + (ax ? 0 : a), z + (ax ? a : 0), ax ? 2.2 : 0.58, ax ? 0.58 : 2.2, 0xfff9df, 0);
      }
    }
  }
  for (const r of L.roads) {
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    addFlat(FLAT_WALK, cx, cz, w, d, SIDEWALK, T.paving);
    const half = r.main ? CITY.main.road : CITY.local.road;
    const alongX = w > d;
    // Same vertex-colour asphalt as the Kenney surface: no near/far or tile/intersection colour seams.
    if (alongX) addFlat(FLAT_ROAD, cx, cz, w, half * 2, 0x6f7683, 0, [0, Math.PI / 2, 0]);
    else addFlat(FLAT_ROAD, cx, cz, half * 2, d, 0x6f7683, 0);
  }
  for (const t of roadTiles) {
    // The Kenney tile (flat model, its asphalt is as wide as the corridor): its own step above the procedural asphalt.
    flat.push({
      cls: FLAT_TILE,
      x0: t.x - t.width / 2,
      x1: t.x + t.width / 2,
      z0: t.z - t.width / 2,
      z1: t.z + t.width / 2,
      look: 'kenney-road',
      level: 0,
      emit: (y, R) => R.add(roadKit as Sh, [t.x, y, t.z], [t.width, t.width, t.width], 0xffffff, t.ax ? undefined : [0, Math.PI / 2, 0]),
    });
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
      if (onRoadTile(x, z)) continue; // the Kenney tile carries its own lane markings
      // Inside another road's corridor (perpendicular) = an intersection.
      let skip = false;
      for (const o of L.roads) {
        if (o === r) continue;
        const oAlongX = o.x1 - o.x0 > o.z1 - o.z0;
        if (oAlongX === alongX) continue;
        if (x > o.x0 - 1 && x < o.x1 + 1 && z > o.z0 - 1 && z < o.z1 + 1) skip = true;
      }
      if (skip) continue;
      addFlat(FLAT_MARK, x, z, alongX ? 1.6 : 0.2, alongX ? 0.2 : 1.6, MARK, 0);
    }
  }
  layerFlat(B, flat);
  // L18: raised kerbs along the asphalt (Kenney roads look; visual only, 12 cm), broken at the crossings.
  for (const r of L.roads) {
    const alongX = r.x1 - r.x0 > r.z1 - r.z0;
    const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
    const half = r.main ? CITY.main.road : CITY.local.road;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const seg = 2;
    for (let t = seg / 2; t < len; t += seg) {
      for (const sd of [-1, 1]) {
        const x = alongX ? r.x0 + t : cx + sd * (half + 0.1);
        const z = alongX ? cz + sd * (half + 0.1) : r.z0 + t;
        let skip = false;
        for (const o of L.roads) {
          if (o === r) continue;
          const oAlongX = o.x1 - o.x0 > o.z1 - o.z0;
          if (oAlongX === alongX) continue;
          const oh = (o.main ? CITY.main.road : CITY.local.road) + 0.6;
          const ocx = (o.x0 + o.x1) / 2;
          const ocz = (o.z0 + o.z1) / 2;
          if (oAlongX ? Math.abs(z - ocz) < oh && x > o.x0 && x < o.x1 : Math.abs(x - ocx) < oh && z > o.z0 && z < o.z1) skip = true;
        }
        if (skip) continue;
        F.boxNB(alongX ? [seg, 0.12, 0.2] : [0.2, 0.12, seg], [x, 0.06, z], 0xd9d6cf);
      }
    }
  }
  for (const h of L.hills) {
    const edgeHill = isEdgeHill(h);
    B.at(h.x, h.z);
    if (edgeHill) {
      // Distant, non-playable hills are broad overlapping domes rather than a wall of identical cut-off cones.
      const r = hsh(h.x, h.z, 41);
      B.far.add(Sh.BackHill, [h.x, -0.1, h.z], [h.rBottom * (1.15 + r * 0.35), h.h * (0.82 + r * 0.23), h.rBottom * 1.2], r > 0.5 ? 0x7ab278 : 0x89be79);
    } else B.far.hill(h.rBottom, h.h, [h.x, h.h / 2, h.z], 0x78bb60);
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
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      const dxn = (x1 - x0) / len;
      const dzn = (z1 - z0) / len;
      // Dirt quads draped on the physical hill (the same 14-sided frustum as the collider), each tilted to the local surface and
      // lifted PATH_LIFT: the path lies on the collider within a centimetre or two, never inside the feet. Coarse cells on flat ground.
      const COLS = 4;
      const PATH_W = 2.6;
      const up = new THREE.Vector3(0, 1, 0);
      const qYaw = new THREE.Quaternion().setFromAxisAngle(up, yaw);
      let t = 0;
      while (t < len) {
        const midX = x0 + dxn * (t + 0.3);
        const midZ = z0 + dzn * (t + 0.3);
        const onHill = hillSurfaceY(hill, midX, midZ) > 0.001 || hillSurfaceY(hill, x0 + dxn * (t + 1.5), z0 + dzn * (t + 1.5)) > 0.001;
        const cell = onHill ? 0.45 : 1.2;
        const seg = Math.min(cell, len - t);
        for (let c = 0; c < COLS; c++) {
          const off = ((c + 0.5) / COLS - 0.5) * PATH_W;
          const cx = x0 + dxn * (t + seg / 2) + dzn * off;
          const cz = z0 + dzn * (t + seg / 2) - dxn * off;
          const e = 0.15;
          const sx = (hillSurfaceY(hill, cx + e, cz) - hillSurfaceY(hill, cx - e, cz)) / (2 * e);
          const sz = (hillSurfaceY(hill, cx, cz + e) - hillSurfaceY(hill, cx, cz - e)) / (2 * e);
          const nrm = new THREE.Vector3(-sx, 1, -sz).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(up, nrm).multiply(qYaw);
          const rot = new THREE.Euler().setFromQuaternion(q, 'XYZ');
          const ch = B.at(cx, cz);
          // A tilted quad covers less ground: grow it a little so neighbours overlap (same colour, no seam).
          // Over a ridge between two sides of the hill the tangent plane lies above the surface: split that error (+- half).
          const yc = hillSurfaceY(hill, cx, cz);
          let excess = 0;
          for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const px = cx + ox * (PATH_W / COLS / 2) * dzn + oz * (seg / 2) * dxn;
            const pz = cz - ox * (PATH_W / COLS / 2) * dxn + oz * (seg / 2) * dzn;
            excess = Math.max(excess, yc + sx * (px - cx) + sz * (pz - cz) - hillSurfaceY(hill, px, pz));
          }
          ch.deco.quad(PATH_W / COLS + 0.06, seg * (onHill ? 1.15 : 1.02) + 0.04, [cx, yc + PATH_LIFT - excess / 2, cz], 0xc9a46f, 0, [rot.x, rot.y, rot.z]);
        }
        t += seg;
      }
    }
  }
}

/** Build every recipe and collider list of the city. */
/** The procedural parts a model does not replace: hip roofs of the shops, the towers' podium and style, flat-roof edges. */
function drawDressed(B: Builder, b: CityBuilding, d: Dress): void {
  const top = b.base + b.wall;
  const body = dressedBody(d);
  const custom = d.model.startsWith('custom:');
  const [fx, fz] = FACE_VEC[b.face];
  const alongX = fz !== 0;
  const sealed = custom && (b.kind === 'school' || b.kind === 'hospital' || b.glen);
  if (sealed) {
    // A complete, recessed interior closes scanned/clipped side and back openings. The original front remains in front of it.
    // Glen's ground-floor door is recessed farther than the upper storey in the owner's mesh.
    const recess = b.glen ? 1.6 : 0.8;
    const cx = b.x - fx * recess / 2;
    const cz = b.z - fz * recess / 2;
    const w = b.w - 0.12 - (fx !== 0 ? recess : 0);
    const deep = b.d - 0.12 - (fz !== 0 ? recess : 0);
    const hospital = b.kind === 'hospital';
    const school = b.kind === 'school';
    const wallH = school ? b.wall * 0.77 : b.wall - (hospital ? 0.13 : 0.14);
    const wallColor = hospital ? 0xd2e1e0 : school ? 0xdfd1b8 : 0xe7dfd3;
    const trim = hospital ? 0x6f9294 : school ? 0xf3dfbd : 0x8c7761;
    B.far.add(Sh.Body, [cx, b.base + wallH / 2, cz], [w, wallH, deep], wallColor, undefined, T.plaster);
    if (hospital) B.far.box([w, 0.1, deep], [cx, top - 0.08, cz], 0x91b4b5, undefined, T.paving);
    else {
      const peak = b.wall + (b.roof === 'hip' ? b.roofH * (1 - Parkour.world.roofPlateau) : 0);
      B.far.pyr(w, peak - wallH, deep, [cx, b.base + (wallH + peak) / 2, cz], school ? 0xbb8057 : 0x55514d, school ? T.roofTerra : T.roofZinc);
    }
    for (let side = 0; side < 4; side++) {
      if (side === b.face) continue;
      const [nx, nz] = FACE_VEC[side];
      const len = nz !== 0 ? w : deep;
      const px = cx + nx * (w / 2 + 0.03);
      const pz = cz + nz * (deep / 2 + 0.03);
      for (let a = -len / 2 + 1; a < len / 2 - 0.4; a += 2) {
        for (const y of b.floors > 1 ? [1.5, Math.min(4.1, wallH - 0.8)] : [1.7]) B.far.decal(T.window0, 1, 1.25, [px - nz * a, b.base + y, pz + nx * a], Math.atan2(nx, nz));
      }
      for (const y of [0.3, wallH - 0.16]) B.far.box(nz !== 0 ? [w, 0.13, 0.1] : [0.1, 0.13, deep], [px, b.base + y, pz], trim);
    }
  }
  // Owner facades repeat as uniform architectural modules across wide lots (CityDressing).
  // A detailed rear wing fills only the space BEHIND those facades; never put a blanket slab over their roofs.
  if (custom && !sealed && b.kind !== 'oldBarongsai' && b.kind !== 'house') {
    const back = alongX ? b.z - fz * b.d / 2 : b.x - fx * b.w / 2;
    const envelope = dressedBody(d, true);
    const modelBack = fz > 0 ? envelope.min.z : fz < 0 ? envelope.max.z : fx > 0 ? envelope.min.x : envelope.max.x;
    const depth = Math.max(0, (modelBack - back) * (fx || fz));
    if (depth > 0.1) {
      const cx = alongX ? b.x : (back + modelBack) / 2;
      const cz = alongX ? (back + modelBack) / 2 : b.z;
      const w = alongX ? b.w : depth;
      const deep = alongX ? depth : b.d;
      B.far.add(Sh.Body, [cx, b.base + (b.wall - 0.16) / 2, cz], [w, b.wall - 0.16, deep], b.kind === 'hospital' ? 0xffe9e3 : 0xf0dfbd, undefined, T.plaster);
      B.far.box([w, 0.16, deep], [cx, top - 0.08, cz], b.roofColor, undefined, T.paving);
      for (let side = 0; side < 4; side++) {
        const [nx, nz] = FACE_VEC[side];
        const len = nz !== 0 ? w : deep;
        for (let a = -len / 2 + 1; a < len / 2 - 0.4; a += 2) {
          for (const y of [1.6, 4.5]) B.far.decal(T.window0, 1.05, 1.5, [cx + nx * (w / 2 + 0.03) - nz * a, b.base + y, cz + nz * (deep / 2 + 0.03) + nx * a], Math.atan2(nx, nz));
        }
        for (const y of [0.3, 3.2, b.wall - 0.3]) B.far.box(nz !== 0 ? [w, 0.14, 0.12] : [0.12, 0.14, deep], [cx + nx * w / 2, b.base + y, cz + nz * deep / 2], 0xfff1d5);
      }
    }
  }
  const modelBase = Math.max(b.base, body.min.y);
  // (A tower's podium is a closed 12 x 12 body already: a plinth inside it would only share the podium's top plane.)
  if (modelBase > b.base + 0.08 && b.kind !== 'tower') {
    B.far.box([Math.min(b.w, body.max.x - body.min.x), modelBase - b.base, Math.min(b.d, body.max.z - body.min.z)], [(body.min.x + body.max.x) / 2, (modelBase + b.base) / 2, (body.min.z + body.max.z) / 2], 0xe5d3b4, undefined, T.brick);
  }
  // Flat-roof slab: kept 3 cm under the model's own roof plane and 4 cm inside its walls (it only closes gaps), so it never shares a plane.
  if (!custom && b.roof === 'flat' && b.kind !== 'tower') B.far.box([b.w - 0.08, 0.12, b.d - 0.08], [b.x, top - 0.09, b.z], 0xf3e6ce);
  if (b.kind === 'oldBarongsai') {
    // Keep the owner's original carved door and complete lion face; the step marks CityData's interaction axis.
    B.ch.deco.boxNB([1.8, 0.12, 0.9], [b.x - 1.5, b.base + 0.06, b.z + b.d / 2 + 0.45], 0xbba780);
  }
  if (!d.skipRoof && b.roof === 'hip') {
    B.far.pyr(b.roofW + 0.5, b.roofH, b.roofD + 0.5, [b.x, top + b.roofH / 2 - 0.04, b.z], b.roofColor, roofTile(b));
    B.ch.deco.box([b.w + 0.3, 0.2, b.d + 0.3], [b.x, top - 0.08, b.z], C.CREAM);
  }
  if (b.roof === 'flat' && b.kind !== 'tower') edge(B, b.x, b.z, b.w, b.d, top);
  if (b.kind === 'tower' && b.tower) {
    drawTowerDressed(B, b);
    const t = b.tower;
    // (No corner posts: the Downtown tower models carry their own corner trims, and any post would share their wall planes.)
    B.far.box([t.size - 0.08, 0.18, t.size - 0.08], [b.x, top - 0.12, b.z], 0xf3e6c9);
  }
  if (b.kind === 'kiosk' && !d.skipFacade) {
    const fruit = [0xff6b6b, 0xffd23f, 0x7bd389, 0xff9f43];
    B.ch.deco.box(fs(b, 2.4, 0.5, 0.9), fp(b, 0.45, 0.25, b.base + 0.45), 0xffffff, undefined, T.wood);
    for (let i = 0; i < 4; i++) B.ch.deco.ball(0.18, fp(b, -0.4 + i * 0.55, 0.25, b.base + 1.1), fruit[i]);
  }
  if (b.glen && !d.model.startsWith('custom:')) {
    const L = facadeLen(b);
    const [x, , z] = fp(b, -L / 2 - 0.6, 1.2, 0);
    B.far.cyl(0.06, 5.2, [x, 2.6, z], C.GREY);
    B.far.box([1.4, 0.8, 0.06], [x + 0.7, 4.7, z], C.ORANGE);
  }
}

export function buildCity(L: CityLayout): BuiltCity {
  const B = new Builder();
  envModels.cityBuilt = true;
  drawGround(B, L);
  for (const b of L.buildings) {
    B.at(b.x, b.z);
    // L18: buildings dressed with a model (CityDressing.ts) keep only what the model does not show (climbing pieces always).
    const dress = dressOf(b);
    if (dress) {
      drawDressed(B, b, dress);
      for (const p of b.pieces) drawPiece(B, b, p);
      continue;
    }
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
  for (const r of B.flatLayers) r.trim();
  return { far: B.farCells, flat: B.flat, flatLayers: B.flatLayers, chunks: B.chunks, globalSolids: B.globalSolids };
}
