import * as THREE from 'three';

/**
 * Streaming-friendly static geometry for the open city.
 *
 *  - `Recipe`: a compact list of coloured primitives (11 floats each: shape, position, size, rotation, packed colour). Cheap to
 *    keep for the whole city (about 45 bytes per part), no GPU memory.
 *  - `SlotPool`: a fixed number of preallocated GPU geometries ("slots") with room for the biggest chunk. Loading a chunk
 *    EXPANDS its recipe into a free slot a few thousand vertices per frame (no allocation), then uploads only the used range;
 *    unloading just hides the slot. GPU memory and draw calls are bounded by the slot count, whatever the city size.
 *  - `bakeStatic`: the same expansion into a normal one-off geometry (the always-visible "far" layer: ground, roads, building
 *    bodies and roofs).
 *
 * Vertex format: position float32 x3, normal int8 x3 (normalized), colour uint8 x3 (normalized, linear). 20 bytes a vertex.
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
} as const;
export type Sh = (typeof Sh)[keyof typeof Sh];

interface Template {
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint16Array;
  verts: number;
  tris: number;
}

function tpl(g: THREE.BufferGeometry): Template {
  const pos = g.getAttribute('position').array as Float32Array;
  const nrm = g.getAttribute('normal').array as Float32Array;
  const ix = g.getIndex();
  const idx = ix ? Uint16Array.from(ix.array as ArrayLike<number>) : Uint16Array.from({ length: pos.length / 3 }, (_, i) => i);
  const t: Template = { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), idx, verts: pos.length / 3, tris: idx.length / 3 };
  g.dispose();
  return t;
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
];

export function templateTris(shape: Sh): number {
  return TEMPLATES[shape].tris;
}

const STRIDE = 11;
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
  return r < 0.3 ? 0 : r < 0.9 ? 1 : 2;
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

  add(shape: Sh, pos: Vec3, size: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
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
    this.count++;
    const t = TEMPLATES[shape];
    this.verts += t.verts;
    this.indices += t.idx.length;
    // Conservative extent: half the diagonal for boxes, the radius for round shapes (rotation does not matter then).
    const round = shape >= Sh.Cyl0 && shape <= Sh.Hill;
    const r = round ? Math.hypot(size[0], size[1] / 2, size[2]) : Math.hypot(size[0], size[1], size[2]) / 2;
    this.min.set(Math.min(this.min.x, pos[0] - r), Math.min(this.min.y, pos[1] - r), Math.min(this.min.z, pos[2] - r));
    this.max.set(Math.max(this.max.x, pos[0] + r), Math.max(this.max.y, pos[1] + r), Math.max(this.max.z, pos[2] + r));
    return this;
  }

  box(size: Vec3, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add(Sh.Box, pos, size, color, rot);
  }
  /** Flat quad lying on y (w along x, d along z). */
  quad(w: number, d: number, pos: Vec3, color: THREE.ColorRepresentation): this {
    return this.add(Sh.Quad, pos, [w, 1, d], color);
  }
  cyl(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add((Sh.Cyl0 + tierFor(radius)) as Sh, pos, [radius, height, radius], color, rot);
  }
  sph(radius: number, pos: Vec3, color: THREE.ColorRepresentation, squash: Vec3 = [1, 1, 1]): this {
    const s: Vec3 = [radius * squash[0], radius * squash[1], radius * squash[2]];
    return this.add((Sh.Sph0 + tierFor(Math.max(s[0], s[1], s[2]))) as Sh, pos, s, color);
  }
  cone(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add((Sh.Cone0 + tierFor(radius)) as Sh, pos, [radius, height, radius], color, rot);
  }
  /** Four-sided pyramid, base w x d, height h; `pos` = centre of its volume. */
  pyr(w: number, h: number, d: number, pos: Vec3, color: THREE.ColorRepresentation): this {
    return this.add(Sh.Pyr, pos, [w, h, d], color);
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
      out.col[w] = cr;
      out.col[w + 1] = cg;
      out.col[w + 2] = cb;
      v++;
    }
    const ti = t.idx;
    const base = v - t.verts;
    for (let k = 0; k < ti.length; k++) out.idx[ii++] = ti[k] + base;
  }
  return [v, ii];
}

function makeGeometry(verts: number, indices: number): { g: THREE.BufferGeometry; out: Out } {
  const out: Out = { pos: new Float32Array(verts * 3), nrm: new Int8Array(verts * 3), col: new Uint8Array(verts * 3), idx: new Uint32Array(indices) };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(out.nrm, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(out.col, 3, true));
  g.setIndex(new THREE.BufferAttribute(out.idx, 1));
  return { g, out };
}

/** One-off static mesh from a recipe (the always-visible layers). */
export function bakeStatic(r: Recipe, material: THREE.Material, castShadow: boolean, receiveShadow: boolean): THREE.Mesh | null {
  if (r.count === 0) return null;
  const { g, out } = makeGeometry(r.verts, r.indices);
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
  ) {
    const { g, out } = makeGeometry(Math.max(4, capVerts), Math.max(6, capIndices));
    this.geo = g;
    this.out = out;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    g.setDrawRange(0, 0);
    for (const a of [g.getAttribute('position'), g.getAttribute('normal'), g.getAttribute('color')] as THREE.BufferAttribute[]) a.setUsage(THREE.DynamicDrawUsage);
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
    for (const name of ['position', 'normal', 'color'] as const) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.v * 3);
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
