import * as THREE from 'three';
import { ATLAS_TILES } from './CityAtlas';

/**
 * Streaming-friendly static geometry for the open city.
 *
 *  - `Recipe`: a compact list of coloured primitives (12 floats each: shape, position, size, rotation, packed colour, atlas tile). Cheap to
 *    keep for the whole city (about 48 bytes per part), no GPU memory.
 *  - `SlotPool`: a fixed number of preallocated GPU geometries ("slots") with room for the biggest chunk. Loading a chunk
 *    EXPANDS its recipe into a free slot a few thousand vertices per frame (no allocation), then uploads only the used range;
 *    unloading just hides the slot. GPU memory and draw calls are bounded by the slot count, whatever the city size.
 *  - `bakeStatic`: the same expansion into a normal one-off geometry (the always-visible "far" layer: ground, roads, building
 *    bodies and roofs).
 *
 * Vertex format: position float32 x3, normal int8 x3 (normalized), colour uint8 x3 (normalized, linear); textured layers add aUv
 * float32 x2 and aTile uint8 (index into CityAtlas.ts, 0 = none: see CityMaterial.ts). The UVs are made while expanding: box-projected
 * world UVs (walls, roofs, ground), a strip mapping for roads or the template's own UVs for decals.
 */

export type Vec3 = readonly [number, number, number];

/** Shape ids (index into TEMPLATES). Round shapes come in three detail tiers by size (like bab1/Batch.ts). */
export const Sh = {
  Box: 0,
  Pyr: 1,
  Cyl0: 2,
  Cyl1: 3,
  Cyl2: 4,
  Sph0: 5,
  Sph1: 6,
  Sph2: 7,
  Cone0: 8,
  Cone1: 9,
  Cone2: 10,
  /** Frustum (top radius 0.45 of the bottom): hills. Unit height, bottom radius 1. */
  Hill: 11,
  /** Flat quad on XZ (1 x 1, facing up): ground tiles and road markings (2 triangles instead of a box's 12). */
  Quad: 12,
  /** Box without its bottom face (10 triangles): things that stand on something. */
  BoxNB: 13,
  /** Four-sided pyramid with flat faces, no base (4 triangles): hip roofs. Base 1 x 1, height 1. */
  Pyr4: 14,
  /** Vertical quad on XY facing +z (decals on facades: windows, doors, signs). */
  VQuad: 15,
  /** Open 6-sided cylinder (12 triangles, no caps): trunks and poles that stand on the ground and are capped by something. */
  Trunk: 16,
  /** Open 8-sided cone (8 triangles, no base): upper tiers of pines. */
  ConeO: 17,
  /** Icosahedron with smooth normals (12 vertices, 20 triangles): tiny balls (fruit, pots, bulbs, canopy lobes). */
  Ico: 18,
  /**
   * Building body: unit box without a bottom whose four vertical edges are rounded (a bevel strip with normals that blend from
   * one wall to the next, so the corner shades soft). 22 triangles. Fits inside the box of the same size (visual only).
   */
  Body: 19,
  /** Smooth upper hemisphere, base at y=0: distant scenery, never a climbable surface. */
  BackHill: 20,
} as const;
export type Sh = (typeof Sh)[keyof typeof Sh];

interface Template {
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  idx: Uint16Array;
  verts: number;
  tris: number;
  /** Model templates (EnvModels.ts): linear 0..255 colour multiplier per vertex and the bounding radius at scale 1. */
  col?: Uint8Array;
  radius?: number;
}

function tpl(g: THREE.BufferGeometry): Template {
  const pos = g.getAttribute('position').array as Float32Array;
  const nrm = g.getAttribute('normal').array as Float32Array;
  const ix = g.getIndex();
  const idx = ix ? Uint16Array.from(ix.array as ArrayLike<number>) : Uint16Array.from({ length: pos.length / 3 }, (_, i) => i);
  const uvA = g.getAttribute('uv');
  const uv = uvA ? Float32Array.from(uvA.array as ArrayLike<number>) : new Float32Array((pos.length / 3) * 2);
  const t: Template = { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), uv, idx, verts: pos.length / 3, tris: idx.length / 3 };
  g.dispose();
  return t;
}

/** Flat-shaded triangles from a vertex list (3 per triangle) plus optional uvs; normals from the winding. */
function flatTpl(tri: number[], uvs?: number[]): Template {
  const n = tri.length / 3;
  const nrm = new Float32Array(tri.length);
  for (let i = 0; i < n; i += 3) {
    const a = i * 3;
    const ux = tri[a + 3] - tri[a], uy = tri[a + 4] - tri[a + 1], uz = tri[a + 5] - tri[a + 2];
    const vx = tri[a + 6] - tri[a], vy = tri[a + 7] - tri[a + 1], vz = tri[a + 8] - tri[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) { nrm[a + k * 3] = nx; nrm[a + k * 3 + 1] = ny; nrm[a + k * 3 + 2] = nz; }
  }
  return { pos: Float32Array.from(tri), nrm, uv: Float32Array.from(uvs ?? new Array(n * 2).fill(0)), idx: Uint16Array.from({ length: n }, (_, i) => i), verts: n, tris: n / 3 };
}

function boxNoBottom(): Template {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.getAttribute('position').array as Float32Array;
  const nrm = g.getAttribute('normal').array as Float32Array;
  const uv = g.getAttribute('uv').array as Float32Array;
  // Faces are 4 vertices each (+x, -x, +y, -y, +z, -z): drop the -y face (index 3).
  const keep = [0, 1, 2, 4, 5];
  const p: number[] = [], nn: number[] = [], u: number[] = [], idx: number[] = [];
  for (const f of keep) {
    const base = p.length / 3;
    for (let k = 0; k < 4; k++) {
      const v = f * 4 + k;
      p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      nn.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
      u.push(uv[v * 2], uv[v * 2 + 1]);
    }
    idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1); // BoxGeometry face winding
  }
  g.dispose();
  return { pos: Float32Array.from(p), nrm: Float32Array.from(nn), uv: Float32Array.from(u), idx: Uint16Array.from(idx), verts: p.length / 3, tris: idx.length / 3 };
}

function ico(): Template {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute('position').array as Float32Array;
  const map = new Map<string, number>();
  const p: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const key = `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = p.length / 3;
      map.set(key, k);
      p.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
    idx.push(k);
  }
  g.dispose();
  const pa = Float32Array.from(p);
  return { pos: pa, nrm: Float32Array.from(pa), uv: new Float32Array((pa.length / 3) * 2), idx: Uint16Array.from(idx), verts: pa.length / 3, tris: idx.length / 3 };
}

function body(): Template {
  const b = 0.04; // bevel in unit space (scaled with the size: about 0.25 to 0.55 m on a house)
  const h = 0.5;
  // Octagon in XZ, counter-clockwise seen from above; every side has the normals at its two ends.
  const ring: [number, number, number, number][] = [
    [h, -h + b, 1, 0], [h, h - b, 1, 0], [h - b, h, 0, 1], [-h + b, h, 0, 1],
    [-h, h - b, -1, 0], [-h, -h + b, -1, 0], [-h + b, -h, 0, -1], [h - b, -h, 0, -1],
  ];
  const p: number[] = [], n: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => {
    p.push(x, y, z);
    n.push(nx, ny, nz);
    return p.length / 3 - 1;
  };
  const tri = (a: number, b2: number, c: number, nx: number, nz: number, ny = 0): void => {
    // Orient so the geometric normal agrees with the intended one.
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b2 * 3] - ax, uy = p[b2 * 3 + 1] - ay, uz = p[b2 * 3 + 2] - az;
    const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * nx + gy * ny + gz * nz >= 0) idx.push(a, b2, c);
    else idx.push(a, c, b2);
  };
  for (let i = 0; i < 8; i++) {
    const A = ring[i];
    const B = ring[(i + 1) % 8];
    const a0 = push(A[0], -h, A[1], A[2], 0, A[3]);
    const a1 = push(A[0], h, A[1], A[2], 0, A[3]);
    const b0 = push(B[0], -h, B[1], B[2], 0, B[3]);
    const b1 = push(B[0], h, B[1], B[2], 0, B[3]);
    // Mean outward direction of this side (a bevel side has two different end normals).
    const mx = A[2] + B[2] || (A[0] + B[0]);
    const mz = A[3] + B[3] || (A[1] + B[1]);
    tri(a0, b0, b1, mx, mz);
    tri(a0, b1, a1, mx, mz);
  }
  const top = ring.map((r) => push(r[0], h, r[1], 0, 1, 0));
  for (let i = 1; i < 7; i++) tri(top[0], top[i], top[i + 1], 0, 0, 1);
  return { pos: Float32Array.from(p), nrm: Float32Array.from(n), uv: new Float32Array((p.length / 3) * 2), idx: Uint16Array.from(idx), verts: p.length / 3, tris: idx.length / 3 };
}

function pyr4(): Template {
  const A: number[][] = [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]];
  const apex = [0, 0.5, 0];
  const tri: number[] = [];
  for (let i = 0; i < 4; i++) tri.push(...A[i], ...A[(i + 1) % 4], ...apex);
  return flatTpl(tri);
}

function pyramid(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  return g;
}

function quad(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

const TEMPLATES: Template[] = [
  tpl(new THREE.BoxGeometry(1, 1, 1)),
  tpl(pyramid()),
  tpl(new THREE.CylinderGeometry(1, 1, 1, 6)),
  tpl(new THREE.CylinderGeometry(1, 1, 1, 8)),
  tpl(new THREE.CylinderGeometry(1, 1, 1, 12)),
  tpl(new THREE.SphereGeometry(1, 7, 4)),
  tpl(new THREE.SphereGeometry(1, 9, 5)),
  tpl(new THREE.SphereGeometry(1, 12, 7)),
  tpl(new THREE.ConeGeometry(1, 1, 6)),
  tpl(new THREE.ConeGeometry(1, 1, 8)),
  tpl(new THREE.ConeGeometry(1, 1, 12)),
  tpl(new THREE.CylinderGeometry(0.45, 1, 1, 14)),
  tpl(quad()),
  boxNoBottom(),
  pyr4(),
  flatTpl([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
  tpl(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)),
  tpl(new THREE.ConeGeometry(1, 1, 8, 1, true)),
  ico(),
  body(),
  tpl(new THREE.SphereGeometry(1, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2)),
];

/**
 * Register a model template (src/world/kota/EnvModels.ts): metres at scale 1, origin at its base. Returns its shape id; parts
 * use `size` as a per-axis scale. Must run before any Recipe adds it (the city is built after the env models load).
 */
export function registerTemplate(pos: Float32Array, nrm: Float32Array, col: Uint8Array, idx: Uint16Array): Sh {
  let radius = 0;
  for (let k = 0; k < pos.length; k += 3) radius = Math.max(radius, Math.hypot(pos[k], pos[k + 1], pos[k + 2]));
  TEMPLATES.push({ pos, nrm, uv: new Float32Array((pos.length / 3) * 2), idx, verts: pos.length / 3, tris: idx.length / 3, col, radius });
  return (TEMPLATES.length - 1) as Sh;
}

export function templateTris(shape: Sh): number {
  return TEMPLATES[shape].tris;
}

const STRIDE = 12;
const NT = ATLAS_TILES.length;
const TILE_MODE = Uint8Array.from(ATLAS_TILES.map((t) => t.mode));
const TILE_INV_M = Float32Array.from(ATLAS_TILES.map((t) => 1 / t.meters));
const col = new THREE.Color();

/** Packs a colour as linear 8-bit RGB in one float (exact: 24 bits). */
export function packColor(c: THREE.ColorRepresentation): number {
  col.set(c); // sRGB hex -> linear working space (same as bab1/Batch.ts vertex colours)
  const r = Math.max(0, Math.min(255, Math.round(col.r * 255)));
  const g = Math.max(0, Math.min(255, Math.round(col.g * 255)));
  const b = Math.max(0, Math.min(255, Math.round(col.b * 255)));
  return (r << 16) | (g << 8) | b;
}

function tierFor(r: number): 0 | 1 | 2 {
  return r < 0.35 ? 0 : r < 1.3 ? 1 : 2;
}

/** A growable list of primitives. Positions are shape centres; size is the full extent (cyl / cone: radius, height, radius). */
export class Recipe {
  data = new Float32Array(STRIDE * 64);
  count = 0;
  verts = 0;
  indices = 0;
  /** World bounds of everything added (for the bounding sphere). */
  readonly min = new THREE.Vector3(Infinity, Infinity, Infinity);
  readonly max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  add(shape: Sh, pos: Vec3, size: Vec3, color: THREE.ColorRepresentation, rot?: Vec3, tile = 0): this {
    if ((this.count + 1) * STRIDE > this.data.length) {
      const d = new Float32Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
    }
    const o = this.count * STRIDE;
    const d = this.data;
    d[o] = shape;
    d[o + 1] = pos[0];
    d[o + 2] = pos[1];
    d[o + 3] = pos[2];
    d[o + 4] = size[0];
    d[o + 5] = size[1];
    d[o + 6] = size[2];
    d[o + 7] = rot?.[0] ?? 0;
    d[o + 8] = rot?.[1] ?? 0;
    d[o + 9] = rot?.[2] ?? 0;
    d[o + 10] = packColor(color);
    d[o + 11] = tile < NT ? tile : 0;
    this.count++;
    const t = TEMPLATES[shape];
    this.verts += t.verts;
    this.indices += t.idx.length;
    // Conservative extent: half the diagonal for boxes, the radius for round shapes (rotation does not matter then).
    const round = (shape >= Sh.Cyl0 && shape <= Sh.Hill) || shape >= Sh.Trunk;
    const r = t.radius !== undefined
      ? t.radius * Math.max(Math.abs(size[0]), Math.abs(size[1]), Math.abs(size[2]))
      : round ? Math.hypot(size[0], size[1] / 2, size[2]) : Math.hypot(size[0], size[1], size[2]) / 2;
    this.min.set(Math.min(this.min.x, pos[0] - r), Math.min(this.min.y, pos[1] - r), Math.min(this.min.z, pos[2] - r));
    this.max.set(Math.max(this.max.x, pos[0] + r), Math.max(this.max.y, pos[1] + r), Math.max(this.max.z, pos[2] + r));
    return this;
  }

  box(size: Vec3, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3, tile = 0): this {
    return this.add(Sh.Box, pos, size, color, rot, tile);
  }
  /** Box without a bottom face (10 triangles). */
  boxNB(size: Vec3, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3, tile = 0): this {
    return this.add(Sh.BoxNB, pos, size, color, rot, tile);
  }
  /** Flat quad lying on y (w along x, d along z). Strip tiles (roads) run their u across x and v along z: turn it with rot [0, PI/2, 0]. */
  quad(w: number, d: number, pos: Vec3, color: THREE.ColorRepresentation, tile = 0, rot?: Vec3): this {
    return this.add(Sh.Quad, pos, [w, 1, d], color, rot, tile);
  }
  /** Decal: vertical w x h quad facing +z turned by `yaw` (so +z becomes the facade normal). */
  decal(tile: number, w: number, h: number, pos: Vec3, yaw: number): this {
    return this.add(Sh.VQuad, pos, [w, h, 1], 0xffffff, [0, yaw, 0], tile);
  }
  cyl(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add((Sh.Cyl0 + tierFor(radius)) as Sh, pos, [radius, height, radius], color, rot);
  }
  sph(radius: number, pos: Vec3, color: THREE.ColorRepresentation, squash: Vec3 = [1, 1, 1]): this {
    const s: Vec3 = [radius * squash[0], radius * squash[1], radius * squash[2]];
    return this.add((Sh.Sph0 + tierFor(Math.max(s[0], s[1], s[2]))) as Sh, pos, s, color);
  }
  /** Open trunk / pole (no caps, 12 triangles). */
  trunk(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation, tile = 0): this {
    return this.add(Sh.Trunk, pos, [radius, height, radius], color, undefined, tile);
  }
  /** Tiny smooth ball (20 triangles); `squash` scales the axes. */
  ball(radius: number, pos: Vec3, color: THREE.ColorRepresentation, squash: Vec3 = [1, 1, 1]): this {
    return this.add(Sh.Ico, pos, [radius * squash[0], radius * squash[1], radius * squash[2]], color);
  }
  /** Open 8-sided cone, no base (8 triangles). */
  coneOpen(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation): this {
    return this.add(Sh.ConeO, pos, [radius, height, radius], color);
  }
  cone(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add((Sh.Cone0 + tierFor(radius)) as Sh, pos, [radius, height, radius], color, rot);
  }
  /** Four-sided pyramid, base w x d, height h; `pos` = centre of its volume. */
  pyr(w: number, h: number, d: number, pos: Vec3, color: THREE.ColorRepresentation, tile = 0): this {
    return this.add(tile ? Sh.Pyr4 : Sh.Pyr, pos, [w, h, d], color, undefined, tile);
  }
  hill(rBottom: number, h: number, pos: Vec3, color: THREE.ColorRepresentation): this {
    return this.add(Sh.Hill, pos, [rBottom, h, rBottom], color);
  }

  get triangles(): number {
    return this.indices / 3;
  }

  /** Bounding sphere of the recipe (into `out`). */
  sphere(out: THREE.Sphere): THREE.Sphere {
    if (this.count === 0) return out.set(out.center.set(0, 0, 0), 0);
    out.center.addVectors(this.min, this.max).multiplyScalar(0.5);
    out.radius = this.min.distanceTo(this.max) / 2;
    return out;
  }

  /** Drop the growth slack once building is done. */
  trim(): void {
    if (this.data.length > this.count * STRIDE) this.data = this.data.slice(0, this.count * STRIDE);
  }
}

/** Target arrays of an expansion. */
interface Out {
  pos: Float32Array;
  nrm: Int8Array;
  col: Uint8Array;
  idx: Uint32Array;
  /** Textured layers only. */
  uv: Float32Array | null;
  tile: Uint8Array | null;
}

/**
 * Expand parts [from, to) of `r` into `out` starting at vertex `v0` / index `i0`. Returns nothing; the caller advances
 * its cursors by the template sizes (`partVerts`). Allocation free.
 */
function expand(r: Recipe, from: number, to: number, out: Out, v0: number, i0: number): [number, number] {
  const d = r.data;
  let v = v0;
  let ii = i0;
  for (let p = from; p < to; p++) {
    const o = p * STRIDE;
    const t = TEMPLATES[d[o]];
    const px = d[o + 1];
    const py = d[o + 2];
    const pz = d[o + 3];
    const sx = d[o + 4];
    const sy = d[o + 5];
    const sz = d[o + 6];
    const rx = d[o + 7];
    const ry = d[o + 8];
    const rz = d[o + 9];
    const c = d[o + 10];
    const tile = d[o + 11];
    const tex = out.uv !== null && out.tile !== null;
    const tmode = tile > 0 ? TILE_MODE[tile] : 0;
    const invM = tile > 0 ? TILE_INV_M[tile] : 1;
    const tu = t.uv;
    const cr = (c >> 16) & 255;
    const cg = (c >> 8) & 255;
    const cb = c & 255;
    // Rotation matrix (Euler XYZ, as three.js Matrix4.makeRotationFromEuler), rows m0.. m8.
    let m0 = 1, m1 = 0, m2 = 0, m3 = 0, m4 = 1, m5 = 0, m6 = 0, m7 = 0, m8 = 1;
    const rotated = rx !== 0 || ry !== 0 || rz !== 0;
    if (rotated) {
      const a = Math.cos(rx), b = Math.sin(rx), cc = Math.cos(ry), dd = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      m0 = cc * e; m1 = -cc * f; m2 = dd;
      m3 = af + be * dd; m4 = ae - bf * dd; m5 = -b * cc;
      m6 = bf - ae * dd; m7 = be + af * dd; m8 = a * cc;
    }
    const isx = sx !== 0 ? 1 / sx : 0;
    const isy = sy !== 0 ? 1 / sy : 0;
    const isz = sz !== 0 ? 1 / sz : 0;
    const tp = t.pos;
    const tn = t.nrm;
    const tc = t.col;
    for (let k = 0; k < t.verts; k++) {
      const k3 = k * 3;
      const lx = tp[k3] * sx;
      const ly = tp[k3 + 1] * sy;
      const lz = tp[k3 + 2] * sz;
      let nx = tn[k3] * isx;
      let ny = tn[k3 + 1] * isy;
      let nz = tn[k3 + 2] * isz;
      const w = v * 3;
      if (rotated) {
        out.pos[w] = m0 * lx + m1 * ly + m2 * lz + px;
        out.pos[w + 1] = m3 * lx + m4 * ly + m5 * lz + py;
        out.pos[w + 2] = m6 * lx + m7 * ly + m8 * lz + pz;
        const qx = m0 * nx + m1 * ny + m2 * nz;
        const qy = m3 * nx + m4 * ny + m5 * nz;
        const qz = m6 * nx + m7 * ny + m8 * nz;
        nx = qx;
        ny = qy;
        nz = qz;
      } else {
        out.pos[w] = lx + px;
        out.pos[w + 1] = ly + py;
        out.pos[w + 2] = lz + pz;
      }
      const inv = 127 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      out.nrm[w] = Math.round(nx * inv);
      out.nrm[w + 1] = Math.round(ny * inv);
      out.nrm[w + 2] = Math.round(nz * inv);
      if (tc) {
        out.col[w] = (cr * tc[k3] + 127) / 255;
        out.col[w + 1] = (cg * tc[k3 + 1] + 127) / 255;
        out.col[w + 2] = (cb * tc[k3 + 2] + 127) / 255;
      } else {
        out.col[w] = cr;
        out.col[w + 1] = cg;
        out.col[w + 2] = cb;
      }
      if (tex && tile > 0) {
        const uo = v * 2;
        const ux = out.pos[w], uy = out.pos[w + 1], uz = out.pos[w + 2];
        (out.tile as Uint8Array)[v] = tile;
        const uvo = out.uv as Float32Array;
        if (tmode === 1) {
          // Box-projected world UVs: walls and slopes by their tangent / slope distance, flats by x z (offset to the part's corner).
          const hh = Math.sqrt(nx * nx + nz * nz) / Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (hh < 0.35) {
            uvo[uo] = (ux - (px - sx / 2)) * invM;
            uvo[uo + 1] = (uz - (pz - sz / 2)) * invM;
          } else {
            const nl = Math.sqrt(nx * nx + nz * nz);
            uvo[uo] = ((-nz * ux + nx * uz) / nl) * invM;
            uvo[uo + 1] = ((uy - (py - sy / 2)) / hh) * invM;
          }
        } else if (tmode === 2) {
          uvo[uo] = tu[k * 2];
          uvo[uo + 1] = tu[k * 2 + 1] * sz * invM;
        } else {
          uvo[uo] = tu[k * 2];
          uvo[uo + 1] = tu[k * 2 + 1];
        }
      } else if (tex) {
        (out.tile as Uint8Array)[v] = 0;
        (out.uv as Float32Array)[v * 2] = 0;
        (out.uv as Float32Array)[v * 2 + 1] = 0;
      }
      v++;
    }
    const ti = t.idx;
    const base = v - t.verts;
    for (let k = 0; k < ti.length; k++) out.idx[ii++] = ti[k] + base;
  }
  return [v, ii];
}

function makeGeometry(verts: number, indices: number, textured: boolean): { g: THREE.BufferGeometry; out: Out } {
  const out: Out = {
    pos: new Float32Array(verts * 3),
    nrm: new Int8Array(verts * 3),
    col: new Uint8Array(verts * 3),
    idx: new Uint32Array(indices),
    uv: textured ? new Float32Array(verts * 2) : null,
    tile: textured ? new Uint8Array(verts) : null,
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(out.nrm, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(out.col, 3, true));
  if (out.uv && out.tile) {
    g.setAttribute('aUv', new THREE.BufferAttribute(out.uv, 2));
    g.setAttribute('aTile', new THREE.BufferAttribute(out.tile, 1));
  }
  g.setIndex(new THREE.BufferAttribute(out.idx, 1));
  return { g, out };
}

/** One-off static mesh from a recipe (the always-visible layers). */
export function bakeStatic(r: Recipe, material: THREE.Material, castShadow: boolean, receiveShadow: boolean, textured = true): THREE.Mesh | null {
  if (r.count === 0) return null;
  const { g, out } = makeGeometry(r.verts, r.indices, textured);
  expand(r, 0, r.count, out, 0, 0);
  g.boundingSphere = r.sphere(new THREE.Sphere());
  g.boundingBox = new THREE.Box3(r.min.clone(), r.max.clone());
  const m = new THREE.Mesh(g, material);
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

/** A preallocated slot: one mesh whose geometry is refilled when it gets another chunk. */
export class Slot {
  readonly mesh: THREE.Mesh;
  private readonly out: Out;
  private readonly geo: THREE.BufferGeometry;
  /** Expansion state. */
  recipe: Recipe | null = null;
  private part = 0;
  private v = 0;
  private i = 0;
  owner = -1;

  constructor(
    readonly capVerts: number,
    readonly capIndices: number,
    material: THREE.Material,
    castShadow: boolean,
    receiveShadow: boolean,
    textured = true,
  ) {
    const { g, out } = makeGeometry(Math.max(4, capVerts), Math.max(6, capIndices), textured);
    this.geo = g;
    this.out = out;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    g.setDrawRange(0, 0);
    for (const name of ['position', 'normal', 'color', 'aUv', 'aTile']) (g.getAttribute(name) as THREE.BufferAttribute | undefined)?.setUsage(THREE.DynamicDrawUsage);
    g.getIndex()?.setUsage(THREE.DynamicDrawUsage);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = receiveShadow;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
  }

  /** Start filling with `r` for chunk `owner` (hidden until `step` reports done). */
  begin(r: Recipe, owner: number): void {
    this.recipe = r;
    this.owner = owner;
    this.part = 0;
    this.v = 0;
    this.i = 0;
    this.mesh.visible = false;
  }

  /** Expand up to `budget` vertices. Returns the vertices used; `done` tells when the slot is shown. */
  step(budget: number): number {
    const r = this.recipe;
    if (!r) return 0;
    const d = r.data;
    let end = this.part;
    let used = 0;
    while (end < r.count && (used === 0 || used + TEMPLATES[d[end * STRIDE]].verts <= budget)) {
      used += TEMPLATES[d[end * STRIDE]].verts;
      end++;
    }
    const res = expand(r, this.part, end, this.out, this.v, this.i);
    this.v = res[0];
    this.i = res[1];
    this.part = end;
    if (end >= r.count) this.finish();
    return used;
  }

  get done(): boolean {
    return this.recipe !== null && this.part >= this.recipe.count;
  }

  private finish(): void {
    const g = this.geo;
    const r = this.recipe as Recipe;
    for (const name of ['position', 'normal', 'color', 'aUv', 'aTile']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!a) continue;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.v * a.itemSize);
      a.needsUpdate = true;
    }
    const ix = g.getIndex() as THREE.BufferAttribute;
    ix.clearUpdateRanges();
    ix.addUpdateRange(0, this.i);
    ix.needsUpdate = true;
    g.setDrawRange(0, this.i);
    r.sphere(g.boundingSphere as THREE.Sphere);
    this.mesh.visible = this.i > 0;
  }

  /** Hide and forget (the GPU buffers stay allocated for the next chunk). */
  release(): void {
    this.recipe = null;
    this.owner = -1;
    this.mesh.visible = false;
  }
}
