/**
 * Build public/env/downtown/downtown.glb from the Quaternius "Downtown City MegaKit" (free Standard version, CC0 1.0).
 *
 *   DOWNTOWN_SRC=<folder with Exports/glTF (Godot)/*.gltf> node scripts/build-downtown.mjs
 *
 * The source (235 MB, 2k PBR textures) is NOT committed; only the optimised result is. The kit is modular (2 m wide, 3 m tall
 * facade pieces), so this script ASSEMBLES city buildings out of the kit's own pieces (walls, windows, door frames, trim,
 * columns, cornices, stairs, AC units, planters, bollards) at exactly the footprint and height of the buildings in
 * src/world/kota/CityData.ts (house 6 x 5.6, ruko 6 x 7.2, kiosk 3.4 x 3.4, tower 6 x 6), so colliders and climbing pieces
 * never change. Facade pieces are scaled along the wall only (width) and in height (storeys), never in thickness.
 *
 * Look: the kit's gritty PBR textures are replaced by a soft storybook palette baked into vertex colours (like the Kenney
 * models in kenney.glb, same shader in CityDressing): wall material = `_MASK` 0.5 (tinted per building), roof = `_MASK` 1
 * (accent colour of the building), everything else baked. No textures: no texture memory, one shared material, one batched draw.
 * Interiors / fake-interior planes are dropped (never visible from outside). Each model gets a far LOD (`name@1`).
 *
 * Models (node names are the runtime ids): dt_house_a..f, dt_ruko_a..f, dt_kiosk_a..b, dt_tower_a..d.
 * Not wired yet: the kit has no cars, lamps, benches, signs, hydrants or traffic lights (the free Standard version only has
 * a bollard, planter, drain, manhole and AC unit), so street furniture keeps the existing models.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const SRC = process.env.DOWNTOWN_SRC;
if (!SRC) throw new Error('set DOWNTOWN_SRC to the unzipped Downtown City MegaKit folder');
const GLTF = fs.existsSync(path.join(SRC, 'Exports', 'glTF (Godot)')) ? path.join(SRC, 'Exports', 'glTF (Godot)') : path.join(SRC, 'Exports', 'glTF');
const OUT = process.env.DOWNTOWN_OUT ?? 'public/env/downtown/downtown.glb';
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

// ---- Palette -----------------------------------------------------------------------------------------------------------------
/** kit material -> [sRGB hex, mask] (mask: 0.5 = wall tinted per building, 1 = roof accent, 0 = as baked); null = dropped. */
const PALETTE = {
  MI_RedBrick: [0xfbf1e1, 0.5],
  MI_RedBrick_Pale: [0xfffaf0, 0.5],
  MI_InteriorWall: null,
  MI_Trim: [0xfff3dc, 0],
  MI_Trim_Dark: [0x56658c, 0],
  MI_Trim_Green: [0x2f9c8c, 0],
  MI_Trim_MetalConcrete: [0xa9b4c6, 0],
  MI_Glass: [0x86c9ee, 0],
  MI_FakeInterior: null,
  MI_Ornaments: [0xdcc9a2, 0],
  MI_Concrete: [0xe4ddd0, 0],
  MI_Dirt: [0x7d5a3c, 0],
  MI_Roof_Slate: [0xa4a4a4, 1],
  MI_Asphalt: [0x6f7683, 0],
  MI_InteriorFloor: null,
  MI_InteriorRoof: null,
};
const srgb = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => srgb(v / 255));
const paletteOf = (matName) => {
  const key = matName.replace(/^(MI_FakeInterior)(_\d+)?$/, '$1');
  if (!(key in PALETTE)) throw new Error(`no palette for material ${matName}`);
  return PALETTE[key];
};

// ---- Pieces ------------------------------------------------------------------------------------------------------------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const cache = new Map();
let CUR_LOD = 0;

/**
 * Per-primitive simplification (one colour each, so position welding cannot mix colours): weld by position, meshopt simplify, then
 * flat normals again (architecture reads better flat shaded, like the Kenney models).
 */
function reducePrim(pos, idx, ratio) {
  if (ratio >= 1 || idx.length / 3 <= 48) return { pos, idx };
  const key = (i) => `${Math.round(pos[i * 3] * 1e3)},${Math.round(pos[i * 3 + 1] * 1e3)},${Math.round(pos[i * 3 + 2] * 1e3)}`;
  const rep = new Map();
  const remap = new Uint32Array(pos.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const k = key(i);
    let r = rep.get(k);
    if (r === undefined) { r = i; rep.set(k, i); }
    remap[i] = r;
  }
  const ind = Uint32Array.from(idx, (i) => remap[i]);
  const target = Math.max(6, Math.round((ind.length / 3) * ratio)) * 3;
  if (target >= ind.length) return { pos, idx };
  const P = Float32Array.from(pos);
  let out = MeshoptSimplifier.simplify(ind, P, 3, target, 0.012, [])[0];
  for (const e of [0.025, 0.04]) if (out.length > target * 1.25) out = MeshoptSimplifier.simplify(ind, P, 3, target, e, ['Prune'])[0];
  // Far LOD: topology does not matter at 45 m+, sloppy simplification reaches any budget.
  if (ratio < 0.2 && out.length > target * 1.25) out = MeshoptSimplifier.simplifySloppy(ind, P, 3, null, target, 0.3)[0];
  return { pos, idx: out };
}

/** Flat-shaded, unindexed triangles from positions + indices (degenerate ones dropped). */
function flatten(pos, idx, col, mask, out) {
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    const base = out.P.length / 3;
    for (const o of [a, b, c]) {
      out.P.push(pos[o], pos[o + 1], pos[o + 2]);
      out.N.push(nx, ny, nz);
      out.C.push(...col);
      out.M.push(mask);
    }
    out.I.push(base, base + 1, base + 2);
  }
}

/** One kit piece as flat arrays (colours baked, hidden materials dropped); lod 0 = near (about half the triangles), 1 = far. */
async function piece(name, lod = 0) {
  const ck = `${name}#${lod}`;
  let p = cache.get(ck);
  if (p) return p;
  const doc = await io.read(path.join(GLTF, `${name}.gltf`));
  const out = { P: [], N: [], C: [], M: [], I: [] };
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pal = paletteOf(prim.getMaterial()?.getName() ?? '');
      if (!pal) continue;
      const [hex, mask] = pal;
      const pa = prim.getAttribute('POSITION');
      const pos = new Float32Array(pa.getCount() * 3);
      const e = [0, 0, 0];
      for (let i = 0; i < pa.getCount(); i++) { pa.getElement(i, e); pos.set(e, i * 3); }
      const ind = prim.getIndices();
      const idx = Uint32Array.from({ length: ind.getCount() }, (_, i) => ind.getScalar(i));
      // Large flat parts (the wall slab) keep their 6-12 triangles; detail parts are reduced.
      const r = reducePrim(pos, idx, lod === 0 ? NEAR_RATIO : FAR_RATIO);
      flatten(r.pos, r.idx, lin(hex), mask, out);
    }
  }
  cache.set(ck, out);
  return out;
}
const NEAR_RATIO = Number(process.env.DT_NEAR ?? 0.3);
const FAR_RATIO = Number(process.env.DT_FAR ?? 0.1);

// ---- Model builder -----------------------------------------------------------------------------------------------------------
class Model {
  constructor(name, lod = CUR_LOD) {
    this.name = name;
    this.lod = lod;
    this.m = { P: [], N: [], C: [], M: [], I: [] };
    /** Fixed colour (hex) for every tintable wall vertex added later; undefined = keep the tintable kit colour. */
    this.tint = undefined;
  }

  /**
   * Add a kit piece. at = [x, y, z] world position, yaw about Y (rotates +z to +sin,+cos), s = [sx, sy, sz] scale applied in the
   * piece's own axes (x = along the wall, y = up, z = thickness), `tint` overrides the colour of every vertex of mask 0.5 / 1.
   */
  async add(name, at, yaw = 0, s = [1, 1, 1], tint) {
    const p = await piece(name, this.lod);
    this.addRaw(p, at, yaw, s, tint);
  }

  addRaw(p, at, yaw = 0, s = [1, 1, 1], tint) {
    const m = this.m;
    const off = m.P.length / 3;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    tint ??= this.tint;
    const tl = tint === undefined ? null : lin(tint);
    for (let i = 0; i < p.P.length; i += 3) {
      const x = p.P[i] * s[0], y = p.P[i + 1] * s[1], z = p.P[i + 2] * s[2];
      m.P.push(x * c + z * sn + at[0], y + at[1], -x * sn + z * c + at[2]);
      // Normals: scaled non-uniformly only along the wall / height (faces stay axis aligned): rotation is enough.
      const nx = p.N[i], ny = p.N[i + 1], nz = p.N[i + 2];
      m.N.push(nx * c + nz * sn, ny, -nx * sn + nz * c);
      const k = i / 3;
      // A fixed wall colour (landmarks): replaces the tintable kit wall colour, mask 0 = no per-building tint.
      if (tl && p.M[k] > 0.25 && p.M[k] < 0.75) { m.C.push(tl[0], tl[1], tl[2]); m.M.push(0); }
      else { m.C.push(p.C[i], p.C[i + 1], p.C[i + 2]); m.M.push(p.M[k]); }
    }
    for (const i of p.I) m.I.push(i + off);
  }

  /** Axis-aligned bounds of everything added so far. */
  bounds() {
    const b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
    for (let i = 0; i < this.m.P.length; i += 3) for (let k = 0; k < 3; k++) {
      b.min[k] = Math.min(b.min[k], this.m.P[i + k]);
      b.max[k] = Math.max(b.max[k], this.m.P[i + k]);
    }
    return b;
  }
}

/** Custom geometry: an axis aligned box (outward normals), one colour. */
function boxPiece(w, h, d, hex, mask = 0, bottom = true) {
  const P = [], N = [], C = [], M = [], I = [];
  const col = lin(hex);
  const faces = [
    [[1, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, -1]]],
    [[-1, 0, 0], [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]],
    [[0, 1, 0], [[0, 1, 0], [0, 0, -1], [1, 0, 0]]],
    [[0, 0, 1], [[0, 0, 1], [0, 1, 0], [1, 0, 0]]],
    [[0, 0, -1], [[0, 0, -1], [0, 1, 0], [-1, 0, 0]]],
  ];
  if (bottom) faces.push([[0, -1, 0], [[0, -1, 0], [0, 0, 1], [1, 0, 0]]]);
  for (const [n, [a]] of faces) {
    void a;
    const off = P.length / 3;
    // two tangents u, v perpendicular to n
    const u = n[0] ? [0, 0, 1] : n[1] ? [1, 0, 0] : [1, 0, 0];
    const v = n[0] ? [0, 1, 0] : n[1] ? [0, 0, 1] : [0, 1, 0];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      P.push(
        (n[0] * w) / 2 + (u[0] * su * w) / 2 + (v[0] * sv * w) / 2,
        h / 2 + (n[1] * h) / 2 + (u[1] * su * h) / 2 + (v[1] * sv * h) / 2,
        (n[2] * d) / 2 + (u[2] * su * d) / 2 + (v[2] * sv * d) / 2,
      );
      N.push(...n); C.push(...col); M.push(mask);
    }
    // winding so the face looks along n
    const ax = [P[(off + 1) * 3] - P[off * 3], P[(off + 1) * 3 + 1] - P[off * 3 + 1], P[(off + 1) * 3 + 2] - P[off * 3 + 2]];
    const bx = [P[(off + 2) * 3] - P[off * 3], P[(off + 2) * 3 + 1] - P[off * 3 + 1], P[(off + 2) * 3 + 2] - P[off * 3 + 2]];
    const cr = [ax[1] * bx[2] - ax[2] * bx[1], ax[2] * bx[0] - ax[0] * bx[2], ax[0] * bx[1] - ax[1] * bx[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    if (flip) I.push(off, off + 2, off + 1, off, off + 3, off + 2);
    else I.push(off, off + 1, off + 2, off, off + 2, off + 3);
  }
  return { P, N, C, M, I };
}

/** Hip roof: frustum from eaves rectangle (ew x ed at y = 0) to the flat top (tw x td at y = h); 4 slopes + top. */
function hipPiece(ew, ed, h, tw, td, hex, mask = 1) {
  const P = [], N = [], C = [], M = [], I = [];
  const col = lin(hex);
  const hx = ew / 2, hz = ed / 2, tx = tw / 2, tz = td / 2;
  const quad = (a, b, c, d) => {
    const off = P.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    for (const q of [a, b, c, d]) { P.push(...q); N.push(nx, ny, nz); C.push(...col); M.push(mask); }
    I.push(off, off + 1, off + 2, off, off + 2, off + 3);
  };
  const A = [-hx, 0, hz], B = [hx, 0, hz], Cc = [hx, 0, -hz], D = [-hx, 0, -hz];
  const a = [-tx, h, tz], b = [tx, h, tz], c = [tx, h, -tz], d = [-tx, h, -tz];
  quad(A, B, b, a); // front (+z)
  quad(B, Cc, c, b); // right (+x)
  quad(Cc, D, d, c); // back
  quad(D, A, a, d); // left
  quad(a, b, c, d); // top (flat)
  return { P, N, C, M, I };
}


/** Small street props (templates merged into the chunk meshes, see CityBuilder.drawProps). Origin = base centre, base on y = 0. */
async function props() {
  const mdl = new Model('dt_prop_planter');
  await mdl.add('Prop_Planter_Single', [0, 0, 0]);
  return [mdl];
}

// ---- Finalise: weld, simplify, far LOD, write -------------------------------------------------------------------------------
function weld(m) {
  const map = new Map();
  const P = [], N = [], C = [], M = [];
  const remap = new Uint32Array(m.P.length / 3);
  for (let k = 0; k < remap.length; k++) {
    const key = `${Math.round(m.P[k * 3] * 1e3)},${Math.round(m.P[k * 3 + 1] * 1e3)},${Math.round(m.P[k * 3 + 2] * 1e3)}|${Math.round(m.N[k * 3] * 50)},${Math.round(m.N[k * 3 + 1] * 50)},${Math.round(m.N[k * 3 + 2] * 50)}|${Math.round(m.C[k * 3] * 255)},${Math.round(m.C[k * 3 + 1] * 255)},${Math.round(m.C[k * 3 + 2] * 255)}|${m.M[k]}`;
    let v = map.get(key);
    if (v === undefined) {
      v = P.length / 3;
      map.set(key, v);
      P.push(m.P[k * 3], m.P[k * 3 + 1], m.P[k * 3 + 2]);
      N.push(m.N[k * 3], m.N[k * 3 + 1], m.N[k * 3 + 2]);
      C.push(m.C[k * 3], m.C[k * 3 + 1], m.C[k * 3 + 2]);
      M.push(m.M[k]);
    }
    remap[k] = v;
  }
  const I = [];
  for (let t = 0; t < m.I.length; t += 3) {
    const a = remap[m.I[t]], b = remap[m.I[t + 1]], c = remap[m.I[t + 2]];
    if (a !== b && b !== c && a !== c) I.push(a, b, c);
  }
  return { P, N, C, M, I };
}

function compact(m, idx) {
  const map = new Map();
  const r = { P: [], N: [], C: [], M: [], I: [] };
  for (const i of idx) {
    let v = map.get(i);
    if (v === undefined) {
      v = r.P.length / 3;
      map.set(i, v);
      r.P.push(m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]);
      r.N.push(m.N[i * 3], m.N[i * 3 + 1], m.N[i * 3 + 2]);
      r.C.push(m.C[i * 3], m.C[i * 3 + 1], m.C[i * 3 + 2]);
      r.M.push(m.M[i]);
    }
    r.I.push(v);
  }
  return r;
}

/**
 * Reduce to ~targetTris: attribute aware (colour + mask are weighted so a window pane does not melt into the wall), borders of the
 * mesh locked only for the near model.
 */
function simplify(m, targetTris, error = 0.02) {
  const idx = Uint32Array.from(m.I);
  if (idx.length / 3 <= targetTris) return compact(m, idx);
  const pos = Float32Array.from(m.P);
  const attr = new Float32Array((m.P.length / 3) * 4);
  for (let i = 0; i < m.P.length / 3; i++) { attr[i * 4] = m.C[i * 3]; attr[i * 4 + 1] = m.C[i * 3 + 1]; attr[i * 4 + 2] = m.C[i * 3 + 2]; attr[i * 4 + 3] = m.M[i] * 0.5; }
  const target = Math.max(12, Math.round(targetTris) * 3);
  let out = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 4, [1, 1, 1, 1], null, target, error, [])[0];
  for (const e of [0.05, 0.1, 0.2, 0.4]) {
    if (out.length <= target * 1.15) break;
    out = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 4, [1, 1, 1, 1], null, target, e, [])[0];
  }
  return compact(m, out);
}

/** Soft ambient term like Kenney's: ground contact and downward faces a little darker, upward a hair brighter. */
function bakeAmbient(m, height) {
  for (let k = 0; k < m.P.length / 3; k++) {
    const y = m.P[k * 3 + 1], ny = m.N[k * 3 + 1];
    let ao = 0.86 + 0.14 * Math.min(1, Math.max(0, y) / 0.5);
    if (ny < -0.5) ao *= 0.88;
    else if (ny > 0.5) ao *= 1.03;
    void height;
    for (let c = 0; c < 3; c++) m.C[k * 3 + c] = Math.min(1, m.C[k * 3 + c] * ao);
  }
}

function addMesh(doc, buffer, scene, name, m, extras) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.P)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.N)).setBuffer(buffer))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setNormalized(true).setArray(Uint8Array.from(m.C, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255))).setBuffer(buffer))
    .setAttribute('_MASK', doc.createAccessor().setType('SCALAR').setNormalized(true).setArray(Uint8Array.from(m.M, (v) => Math.round(v * 255))).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(m.I)).setBuffer(buffer));
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
  scene.addChild(node);
  if (extras) node.setExtras(extras);
  return node;
}

/** Write models [{ name, m, near, far }] to a GLB; returns a report. */
async function writeGlb(models, out, { compress = true } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('downtown');
  const report = [];
  for (const { name, m, mFar, body } of models) {
    const a = weld(m);
    bakeAmbient(a);
    addMesh(doc, buffer, scene, name, a, body ? { body } : undefined);
    let f = null;
    if (mFar) {
      f = weld(mFar);
      bakeAmbient(f);
      addMesh(doc, buffer, scene, `${name}@1`, f);
    }
    report.push(`${name.padEnd(16)} near ${String(a.I.length / 3).padStart(5)} / far ${String(f ? f.I.length / 3 : 0).padStart(5)} tris`);
  }
  if (compress) {
    const { meshopt } = await import('@gltf-transform/functions');
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  return report;
}


// ---- Assembly helpers ----------------------------------------------------------------------------------------------------------
const FLOOR = 3;
const YAW = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };

function bbox(p) {
  const b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
  for (let i = 0; i < p.P.length; i += 3) for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], p.P[i + k]); b.max[k] = Math.max(b.max[k], p.P[i + k]); }
  return b;
}

/**
 * One wall run. The footprint is W (x) by D (z) centred on the origin, `side` is the outward direction. `rows[floor]` is a list of
 * kit pieces from left to right as seen from outside; a name ending in `*2` is a 4 m wide piece (counts double). Pieces are
 * stretched along the wall to fit exactly and scaled in height to `floorH`; thickness is never scaled.
 */
async function wallRun(model, side, W, D, y0, floorH, rows) {
  const alongX = side === 'front' || side === 'back';
  const len = alongX ? W : D;
  const face = (alongX ? D : W) / 2;
  const yaw = YAW[side];
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  for (let f = 0; f < rows.length; f++) {
    const row = rows[f];
    const units = row.reduce((a, n) => a + (n.endsWith('*2') ? 2 : 1), 0);
    const k = len / (units * 2); // stretch factor of a 2 m module
    let x = -len / 2;
    for (const n of row) {
      const w = (n.endsWith('*2') ? 4 : 2) * k;
      const cx = x + w / 2;
      const px = nx * face + Math.cos(yaw) * cx;
      const pz = nz * face - Math.sin(yaw) * cx;
      const name = n.replace('*2', '');
      if (name !== '-') await model.add(name, [px, y0 + f * floorH, pz], yaw, [k, floorH / FLOOR, 1]);
      if (name.startsWith('DoorFrame') && f === 0) {
        // Wooden door leaf in the opening (the kit's door frames are glazed): a plain wooden panel reads better for kids.
        model.addRaw(boxPiece(0.95 * k, 2.1 * (floorH / FLOOR), 0.05, 0xa5683f, 0, false), [px + nx * -0.06, y0 + 0.02, pz + nz * -0.06], yaw);
      }
      x += w;
    }
  }
}

/** Slim corner posts flush with the walls (hide the butt joints of the four wall runs). */
async function corners(model, W, D, y0, h, name = 'Trim_Column_Center') {
  const p = await piece(name, CUR_LOD);
  const b = bbox(p);
  const sw = 0.42 / (b.max[0] - b.min[0]);
  const sd = 0.42 / (b.max[2] - b.min[2]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    model.addRaw(p, [sx * (W / 2 - 0.21) - sx * 0 - ((b.min[0] + b.max[0]) / 2) * sw, y0, sz * (D / 2 - 0.21) - ((b.min[2] + b.max[2]) / 2) * sd], 0, [sw, h / FLOOR, sd]);
  }
}

function addBox(model, w, h, d, at, hex, mask = 0, bottom = false) {
  model.addRaw(boxPiece(w, h, d, hex, mask, bottom), at);
}

const DOOR = 'DoorFrame_Metal_Single';
const WINS = ['Brick_Window_Square_Single', 'Metal_Window_Half', 'Brick_Window_Trim_Single', 'Trim_FirstFloor_Window_001', 'Metal_FullWindow'];
const PLAIN = 'Brick_Plain_3';

// ---- Variants ----------------------------------------------------------------------------------------------------------------
// Footprints / heights as in CityData.ts. House 6.0 x 5.6, wall 3.4..3.8, hip roof 1.6 (x 0.92 up to the plateau); ruko 6 x 7.2,
// wall ~6.7..7.3 (hip roof on top, 2 storeys); kiosk 3.4 x 3.4 x 3.0, flat; tower 6 x 6 x ~6.6, flat. Instances are scaled to the
// exact data size at runtime (CityDressing: x / z to the footprint, y to the wall height), so a model only has to be close.
export const SIZES = {
  house: { W: 6, D: 5.6, wall: 3.6, roofH: 1.47 },
  ruko: { W: 6, D: 7.2, wall: 7.0, roofH: 1.47 },
  kiosk: { W: 3.4, D: 3.4, wall: 3.0, roofH: 0 },
  tower: { W: 6, D: 6, wall: 6.6, roofH: 0 },
  // Landmarks (CityData: big buildings 22 x 11, wall 6.65, flat walkable roof; Glen's house 6 x 5.6, wall 3.4; old Barongsai 9 x 7, wall 7.3).
  school: { W: 22, D: 11, wall: 6.65, roofH: 0 },
  hospital: { W: 22, D: 11, wall: 6.65, roofH: 0 },
  bank: { W: 22, D: 11, wall: 6.65, roofH: 0 },
  pasar: { W: 22, D: 11, wall: 6.65, roofH: 0 },
  gudang: { W: 22, D: 11, wall: 6.65, roofH: 0 },
  glen: { W: 6, D: 5.6, wall: 3.4, roofH: 1.47 },
  barongsai: { W: 9, D: 7, wall: 7.3, roofH: 1.47 },
};

/** Solid core inside the facade shell: closes every window / door opening and gap (what you see "inside" is wall colour). */
function core(mdl, W, D, h) {
  addBox(mdl, W - 0.5, h, D - 0.5, [0, 0.05, 0], 0xfbf1e1, 0.5, true);
}

function skirt(mdl, W, D, h = 0.4, hex = 0xe6d9bd) {
  addBox(mdl, W + 0.1, h, D + 0.1, [0, 0, 0], hex, 0, false);
}

async function house(name, o, sz = SIZES.house) {
  const { W, D, wall, roofH } = sz;
  const mdl = new Model(name);
  await wallRun(mdl, 'front', W, D, 0, wall, [o.front]);
  await wallRun(mdl, 'back', W, D, 0, wall, [o.back ?? [PLAIN, o.win, PLAIN]]);
  await wallRun(mdl, 'right', W, D, 0, wall, [o.side ?? [o.win, PLAIN, o.win]]);
  await wallRun(mdl, 'left', W, D, 0, wall, [o.side ?? [o.win, PLAIN, o.win]]);
  await corners(mdl, W, D, 0, wall, o.post);
  core(mdl, W, D, wall - 0.1);
  skirt(mdl, W, D);
  addBox(mdl, W + 0.12, 0.16, D + 0.12, [0, wall - 0.16, 0], o.band ?? 0xfff3dc, 0, true);
  mdl.addRaw(hipPiece(W + 0.5, D + 0.5, roofH, (W + 0.5) * 0.08, (D + 0.5) * 0.08, 0xa4a4a4), [0, wall - 0.04, 0]);
  return { name, mdl, near: 1300, far: 140, sz };
}

async function ruko(name, o) {
  const { W, D, wall, roofH } = SIZES.ruko;
  const fh = (wall - 0.5) / 2;
  const mdl = new Model(name);
  await wallRun(mdl, 'front', W, D, 0, fh, o.front);
  await wallRun(mdl, 'back', W, D, 0, fh, o.back ?? [[PLAIN, PLAIN, PLAIN], [PLAIN, o.win, PLAIN]]);
  await wallRun(mdl, 'right', W, D, 0, fh, o.side ?? [[PLAIN, o.win, o.win, PLAIN], [o.win, PLAIN, o.win, PLAIN]]);
  await wallRun(mdl, 'left', W, D, 0, fh, o.side ?? [[PLAIN, o.win, o.win, PLAIN], [o.win, PLAIN, o.win, PLAIN]]);
  await corners(mdl, W, D, 0, wall - 0.5, o.post);
  core(mdl, W, D, wall - 0.5);
  skirt(mdl, W, D, 0.5);
  addBox(mdl, W + 0.16, 0.5, D + 0.16, [0, wall - 0.5, 0], o.band ?? 0xfff3dc, 0, true);
  mdl.addRaw(hipPiece(W + 0.5, D + 0.5, roofH, (W + 0.5) * 0.08, (D + 0.5) * 0.08, 0xa4a4a4), [0, wall - 0.04, 0]);
  return { name, mdl, near: 2100, far: 220 };
}

async function kiosk(name, o) {
  const { W, D, wall } = SIZES.kiosk;
  const mdl = new Model(name);
  await wallRun(mdl, 'front', W, D, 0, wall, [o.front]);
  await wallRun(mdl, 'back', W, D, 0, wall, [[PLAIN, PLAIN]]);
  await wallRun(mdl, 'right', W, D, 0, wall, [o.side]);
  await wallRun(mdl, 'left', W, D, 0, wall, [o.side]);
  core(mdl, W, D, wall - 0.2);
  skirt(mdl, W, D, 0.35);
  addBox(mdl, W + 0.3, 0.2, D + 0.3, [0, wall - 0.2, 0], 0xfff3dc, 0, true);
  return { name, mdl, near: 700, far: 90 };
}

async function tower(name, o) {
  const { W, D, wall } = SIZES.tower;
  const fh = wall / 2;
  const mdl = new Model(name);
  for (const side of ['front', 'back', 'right', 'left']) await wallRun(mdl, side, W, D, 0, fh, o.rows);
  await corners(mdl, W, D, 0, wall - 0.2, o.post ?? 'Brick_CornerColumn_Center');
  core(mdl, W, D, wall - 0.3);
  addBox(mdl, W + 0.12, 0.35, D + 0.12, [0, wall - 0.35, 0], 0xfff3dc, 0, true);
  addBox(mdl, W + 0.12, 0.3, D + 0.12, [0, wall / 2 - 0.15, 0], 0xfff3dc, 0, true);
  return { name, mdl, near: 1500, far: 150 };
}

const [w0, w1, w2, w3, w4] = WINS;
// ---- Landmarks -----------------------------------------------------------------------------------------------------------------
/** 5 x 7 pixel capitals for the signs (rows top to bottom, '#' = lit). */
const FONT = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
};

/** Sign lettering as one flat quad per lit pixel facing +z; centred on x = 0, bottom at y = 0, z = 0. */
function textPiece(str, px, hex) {
  const P = [], N = [], C = [], M = [], I = [];
  const col = lin(hex);
  const width = str.length * 6 - 1;
  for (let li = 0; li < str.length; li++) {
    const rows = FONT[str[li]];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (rows[r][c] !== '#') continue;
      const x0 = (li * 6 + c - width / 2) * px, y0 = (6 - r) * px;
      const off = P.length / 3;
      P.push(x0, y0, 0, x0 + px, y0, 0, x0 + px, y0 + px, 0, x0, y0 + px, 0);
      for (let k = 0; k < 4; k++) { N.push(0, 0, 1); C.push(...col); M.push(0); }
      I.push(off, off + 1, off + 2, off, off + 2, off + 3);
    }
  }
  return { P, N, C, M, I, width: width * px };
}

/** Round prism facing +z (a disc with a rim of thickness t), centre at the origin, front face at z = t. */
function discPiece(r, t, hex, seg = 20, mask = 0) {
  const P = [], N = [], C = [], M = [], I = [];
  const col = lin(hex);
  let off = 0;
  P.push(0, 0, t); N.push(0, 0, 1);
  for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; P.push(Math.cos(a) * r, Math.sin(a) * r, t); N.push(0, 0, 1); }
  for (let i = 0; i < seg; i++) I.push(0, 1 + i, 1 + ((i + 1) % seg));
  off = P.length / 3;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2, nx = Math.cos(am), ny = Math.sin(am);
    const b = P.length / 3;
    P.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, t, Math.cos(a0) * r, Math.sin(a0) * r, t);
    for (let k = 0; k < 4; k++) N.push(nx, ny, 0);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  void off;
  for (let i = 0; i < P.length / 3; i++) { C.push(...col); M.push(mask); }
  return { P, N, C, M, I };
}

/** Triangular prism (gable) facing +z: base width w at y = 0, apex height h, depth d. */
function gablePiece(w, h, d, hex, mask = 0) {
  const P = [], N = [], C = [], M = [], I = [];
  const col = lin(hex);
  const tri = (a, b, c, n) => { const o = P.length / 3; P.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { N.push(...n); C.push(...col); M.push(mask); } I.push(o, o + 1, o + 2); };
  const z0 = -d / 2, z1 = d / 2, hw = w / 2;
  tri([-hw, 0, z1], [hw, 0, z1], [0, h, z1], [0, 0, 1]);
  tri([hw, 0, z0], [-hw, 0, z0], [0, h, z0], [0, 0, -1]);
  const sl = Math.hypot(hw, h);
  const quad = (a, b, c, d2, n) => { const o = P.length / 3; P.push(...a, ...b, ...c, ...d2); for (let k = 0; k < 4; k++) { N.push(...n); C.push(...col); M.push(mask); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  quad([0, h, z1], [hw, 0, z1], [hw, 0, z0], [0, h, z0], [h / sl, hw / sl, 0]);
  quad([-hw, 0, z1], [0, h, z1], [0, h, z0], [-hw, 0, z0], [-h / sl, hw / sl, 0]);
  return { P, N, C, M, I };
}

const SIGN_FACE = 0.16;
/** Sign board with pixel lettering on the front wall: centre x, bottom y, wall face z. */
function sign(mdl, str, cx, y, zf, px, board, ink, bw) {
  if (mdl.lod === 1 && str.length > 0) { addBox(mdl, bw, px * 9, SIGN_FACE, [cx, y, zf], board, 0, false); return; }
  addBox(mdl, bw ?? str.length * 6 * px + px * 2, px * 9, SIGN_FACE, [cx, y, zf], board, 0, false);
  const t = textPiece(str, px, ink);
  mdl.addRaw(t, [cx, y + px, zf + SIGN_FACE + 0.01]);
}

const rep = (n, k) => Array.from({ length: k }, () => n);

/** Shared body of a big (22 x 11) public building: windows on both storeys, solid core, plinth, roof slab. Returns the model. */
async function bigBody(name, wallHex, o) {
  const { W, D, wall } = SIZES[o.size];
  const fh = (wall - 0.35) / 2;
  const mdl = new Model(name);
  mdl.tint = wallHex;
  const win = o.win ?? w0;
  const sideRows = [[PLAIN, ...rep(win, 3), PLAIN, ...rep(win, 3), PLAIN], [PLAIN, ...rep(win, 3), PLAIN, ...rep(win, 3), PLAIN]];
  const run = [
    [PLAIN, ...rep(win, 9), PLAIN],
    [PLAIN, ...rep(win, 9), PLAIN],
  ];
  await wallRun(mdl, 'front', W, D, 0, fh, o.front ?? run);
  await wallRun(mdl, 'back', W, D, 0, fh, o.back ?? run);
  await wallRun(mdl, 'right', W, D, 0, fh, sideRows.map((r) => r.slice(0, 5)));
  await wallRun(mdl, 'left', W, D, 0, fh, sideRows.map((r) => r.slice(0, 5)));
  await corners(mdl, W, D, 0, wall - 0.35, o.post ?? 'Trim_Column_Center');
  addBox(mdl, W - 0.5, wall - 0.4, D - 0.5, [0, 0.05, 0], wallHex, 0, true);
  skirt(mdl, W, D, o.skirtH ?? 0.5, o.skirt ?? 0xd9c9a6);
  addBox(mdl, W + 0.2, 0.3, D + 0.2, [0, wall / 2 - 0.15 - 0.17, 0], o.band ?? 0xfff3dc, 0, true);
  addBox(mdl, W + 0.3, 0.35, D + 0.3, [0, wall - 0.35, 0], o.roofBand ?? 0x6aa9e8, 0, true);
  return mdl;
}

async function school(name) {
  const { W, D, wall } = SIZES.school;
  const dd = [PLAIN, w0, w0, w0, w0, DOOR, DOOR, w0, w0, w0, PLAIN];
  const mdl = await bigBody(name, 0xffe9a8, { size: 'school', roofBand: 0x3f86d8, band: 0x3f86d8, front: [dd, [PLAIN, ...rep(w0, 9), PLAIN]], skirt: 0xe4a84a });
  const zf = D / 2;
  // entrance steps + blue porch lintel, sign, flagpole with a red-white flag, colourful stripe of small kids' windows (bunting)
  addBox(mdl, 5.0, 0.18, 1.0, [0, 0, zf + 0.5], 0xe9dcc0, 0, false);
  addBox(mdl, 4.4, 0.18, 0.6, [0, 0.18, zf + 0.3], 0xf3e7cc, 0, false);
  sign(mdl, 'SEKOLAH', -2.6, 3.25, zf, 0.15, 0x2f6fd0, 0xffffff, 6.6);
  const fx = W / 2 - 1.2;
  addBox(mdl, 0.12, 4.2, 0.12, [-fx, wall, 0], 0xb9c2cc, 0, true);
  addBox(mdl, 1.3, 0.45, 0.04, [-fx + 0.7, wall + 3.7, 0], 0xe0463c, 0, true);
  addBox(mdl, 1.3, 0.45, 0.04, [-fx + 0.7, wall + 3.25, 0], 0xffffff, 0, true);
  const cols = [0xe0463c, 0xf2b632, 0x4cb86a, 0x3f86d8];
  for (let i = 0; i < 12; i++) addBox(mdl, 0.5, 0.5, 0.12, [-5.6 + i, wall - 0.9, zf + 0.06], cols[i % 4], 0, false);
  return { name, mdl, sz: SIZES.school };
}

async function hospital(name) {
  const { D, wall } = SIZES.hospital;
  const dd = [PLAIN, w2, w2, w2, w2, DOOR, DOOR, w2, w2, w2, PLAIN];
  const mdl = await bigBody(name, 0xfdfdff, { size: 'hospital', win: w2, roofBand: 0x3fc4b6, band: 0x3fc4b6, front: [dd, [PLAIN, ...rep(w2, 9), PLAIN]], skirt: 0xcfeff0 });
  const zf = D / 2;
  // entrance canopy on two posts, red cross emblem on a white board with teal rim, teal stripe along the facade
  addBox(mdl, 5.4, 0.22, 2.0, [0, 2.75, zf + 1.0], 0x3fc4b6, 0, true);
  for (const sx of [-2.5, 2.5]) addBox(mdl, 0.2, 2.75, 0.2, [sx, 0, zf + 1.8], 0xf5f5f5, 0, false);
  addBox(mdl, 0.9 * 3.4, 0.14, 3.0, [0, 0, zf + 1.5], 0xe6eef0, 0, false);
  addBox(mdl, 3.0, 3.0, SIGN_FACE, [0, 3.35, zf], 0x3fc4b6, 0, false);
  addBox(mdl, 2.7, 2.7, 0.04, [0, 3.5, zf + SIGN_FACE], 0xffffff, 0, false);
  addBox(mdl, 0.55, 1.8, 0.05, [0, 3.95, zf + SIGN_FACE + 0.04], 0xe0463c, 0, false);
  addBox(mdl, 1.8, 0.55, 0.05, [0, 4.575, zf + SIGN_FACE + 0.04], 0xe0463c, 0, false);
  addBox(mdl, W22(), 0.35, 0.06, [0, 3.0, zf + 0.03], 0x3fc4b6, 0, false);
  // roof: red cross on a small stand
  addBox(mdl, 0.5, 2.2, 0.3, [0, wall, -D / 2 + 1.2], 0xe0463c, 0, true);
  addBox(mdl, 2.2, 0.5, 0.3, [0, wall + 0.85, -D / 2 + 1.2], 0xe0463c, 0, true);
  return { name, mdl, sz: SIZES.hospital };
}
const W22 = () => 22.1;

async function bank(name) {
  const { D, wall } = SIZES.bank;
  const dd = [PLAIN, w1, w1, w1, w1, DOOR, DOOR, w1, w1, w1, PLAIN];
  const mdl = await bigBody(name, 0xf6ecd6, { size: 'bank', win: w1, roofBand: 0xd8b25a, band: 0xd8b25a, front: [dd, [PLAIN, ...rep(w1, 9), PLAIN]], skirt: 0xcfc3a6 });
  const zf = D / 2;
  // portico: six round-ish cream columns with capitals over a stepped base, a stepped pediment, gold coin emblem
  const xs = [-4.5, -2.7, -0.9, 0.9, 2.7, 4.5];
  for (const x of xs) {
    addBox(mdl, 0.62, 0.3, 0.62, [x, 0.2, zf + 1.4], 0xe9dcc0, 0, true);
    addBox(mdl, 0.46, wall - 1.5, 0.46, [x, 0.5, zf + 1.4], 0xfff8e8, 0, true);
    addBox(mdl, 0.7, 0.28, 0.7, [x, wall - 1.0, zf + 1.4], 0xe9dcc0, 0, true);
  }
  addBox(mdl, 11.0, 0.14, 2.6, [0, 0, zf + 1.3], 0xe3d6b8, 0, false);
  addBox(mdl, 10.2, 0.2, 2.2, [0, 0.14, zf + 1.35], 0xeee2c6, 0, false);
  addBox(mdl, 10.8, 0.5, 2.8, [0, wall - 0.75, zf + 1.3], 0xe9dcc0, 0, true);
  mdl.addRaw(gablePiece(11.2, 1.5, 2.8, 0xf6ecd6), [0, wall - 0.25, zf + 1.3]);
  const coin = (r, t, hex, z) => mdl.addRaw(discPiece(r, t, hex, 24), [0, wall + 0.55, zf + z]);
  if (mdl.lod === 0) {
    mdl.addRaw(discPiece(0.62, 0.1, 0xf2b632, 20), [0, wall - 0.25 + 0.55, zf + 2.55]);
    mdl.addRaw(discPiece(0.46, 0.04, 0xffd76a, 20), [0, wall - 0.25 + 0.55, zf + 2.65]);
    void coin;
  }
  sign(mdl, 'BANK', 0, 3.15, zf, 0.2, 0x1e8f86, 0xffe08a, 5.2);
  // big coin on the roof, on a stand
  mdl.addRaw(discPiece(1.1, 0.25, 0xf2b632, 28), [-7.5, wall + 1.35, -0.1]);
  mdl.addRaw(discPiece(0.8, 0.06, 0xffd76a, 28), [-7.5, wall + 1.35, 0.15]);
  addBox(mdl, 0.3, 1.0, 0.3, [-7.5, wall, 0], 0xb59a4a, 0, true);
  return { name, mdl, sz: SIZES.bank };
}

async function pasar(name) {
  const { W, D, wall } = SIZES.pasar;
  const sh = 'Metal_FirstFloor_Window';
  const dd = [PLAIN, sh, sh, sh, sh, DOOR, sh, sh, sh, sh, PLAIN];
  const mdl = await bigBody(name, 0xffdcb4, { size: 'pasar', win: w3, roofBand: 0xe2653a, band: 0xe2653a, front: [dd, [PLAIN, ...rep(w3, 9), PLAIN]], skirt: 0xc98f6a });
  const zf = D / 2;
  // striped stall awnings along the whole front (red / cream / green / yellow), market tables with crates of fruit underneath
  const cols = [[0xe0463c, 0xfff3dc], [0x3f9f5a, 0xfff3dc], [0xf2b632, 0xfff3dc]];
  const n = 10, aw = (W - 4) / n;
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + 2 + aw * (i + 0.5);
    const [a, b] = cols[i % 3];
    for (let k = 0; k < 4; k++) addBox(mdl, aw * 0.25, 0.14 + k * 0.04, 1.6 - k * 0.3, [cx - aw * 0.375 + k * aw * 0.25, 2.55 - k * 0.0, zf + 0.9 - k * 0.0], k % 2 ? b : a, 0, true);
    addBox(mdl, 0.1, 2.55, 0.1, [cx - aw * 0.47, 0, zf + 1.6], 0xb78458, 0, false);
    addBox(mdl, 0.1, 2.55, 0.1, [cx + aw * 0.47, 0, zf + 1.6], 0xb78458, 0, false);
    if (mdl.lod === 0) {
      addBox(mdl, aw * 0.8, 0.7, 0.8, [cx, 0, zf + 1.0], 0xc58a56, 0, true);
      const fruit = [0xe0463c, 0xf2b632, 0x6ec24c][(i + 1) % 3];
      addBox(mdl, aw * 0.6, 0.18, 0.55, [cx, 0.7, zf + 1.0], fruit, 0, true);
    }
  }
  sign(mdl, 'PASAR', 0, 3.4, zf, 0.2, 0xe2653a, 0xfff3dc, 6.8);
  // wide overhanging hall roof (walkable flat top at the wall height)
  addBox(mdl, W + 1.6, 0.4, D + 1.6, [0, wall - 0.4, 0], 0xe2653a, 1, true);
  addBox(mdl, W + 1.8, 0.14, D + 1.8, [0, wall - 0.54, 0], 0xfff3dc, 0, true);
  return { name, mdl, sz: SIZES.pasar };
}

async function gudang(name) {
  const { W, D, wall } = SIZES.gudang;
  const dd = [PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN];
  const mdl = await bigBody(name, 0xe8b27c, { size: 'gudang', roofBand: 0x8a6a52, band: 0xcf9a62, front: [dd, dd], back: [dd, dd], skirt: 0xb4553a, skirtH: 1.1 });
  const zf = D / 2;
  // corrugated look: thin dark ribs over the long walls, brick base, big roller door with hazard frame, high windows
  if (mdl.lod === 0) {
    for (let x = -W / 2 + 0.6; x < W / 2; x += 0.6) {
      if (Math.abs(x) < 3.1) continue;
      addBox(mdl, 0.12, wall - 1.8, 0.05, [x, 1.2, zf + 0.03], 0xd29a62, 0, false);
      addBox(mdl, 0.12, wall - 1.8, 0.05, [x, 1.2, -zf - 0.03], 0xd29a62, 0, false);
    }
  }
  addBox(mdl, 6.2, 4.6, 0.12, [0, 0.05, zf + 0.03], 0xf2c230, 0, false);
  addBox(mdl, 5.6, 4.3, 0.18, [0, 0.05, zf + 0.06], 0x6f8fae, 0, false);
  if (mdl.lod === 0) for (let k = 1; k < 9; k++) addBox(mdl, 5.6, 0.07, 0.04, [0, 0.05 + k * 0.47, zf + 0.16], 0x4d6a88, 0, false);
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) addBox(mdl, 3.4, 1.0, 0.12, [sx * (W / 4 + 2.2 * 0) + (i - 2) * 0, wall - 2.6, zf + 0.03], 0x86c9ee, 0, false);
  // sign over the door and a stack of crates beside it
  sign(mdl, 'GUDANG', 0, 4.9, zf, 0.17, 0xb4553a, 0xfff3dc, 6.2);
  for (const [x, y] of [[4.4, 0], [5.6, 0], [5.0, 0.9]]) addBox(mdl, 1.0, 0.9, 0.9, [x, y, zf + 0.6], 0xc58a56, 0, true);
  return { name, mdl, sz: SIZES.gudang };
}

async function glen(name) {
  const sz = SIZES.glen;
  const r = await house(name, { win: w0, front: [w0, DOOR, w0] }, sz);
  const { W, D, wall } = sz;
  const mdl = r.mdl;
  // the model was authored with the cream tint (tinted per building at runtime: warm yellow from CityData); add chimney, flower boxes, mat
  addBox(mdl, 0.7, 1.6, 0.7, [W * 0.28, wall + 0.6, -D * 0.15], 0xc9674a, 0, true);
  addBox(mdl, 0.9, 0.12, 0.9, [W * 0.28, wall + 2.2, -D * 0.15], 0xe8d8c0, 0, true);
  if (mdl.lod === 0) {
    for (const sx of [-1.85, 1.85]) {
      addBox(mdl, 1.1, 0.3, 0.4, [sx, 0.9, D / 2 + 0.2], 0xa5683f, 0, true);
      for (let i = 0; i < 4; i++) addBox(mdl, 0.2, 0.22, 0.2, [sx - 0.4 + i * 0.27, 1.2, D / 2 + 0.2], [0xe84b6c, 0xf2b632, 0xffffff, 0xe84b6c][i], 0, true);
    }
    addBox(mdl, 1.6, 0.06, 1.0, [0, 0.01, D / 2 + 0.5], 0xe35d3c, 0, false);
  }
  addBox(mdl, 2.0, 0.16, 0.6, [0, 0, D / 2 + 0.3], 0xeadfca, 0, false);
  return { name, mdl, sz };
}

async function barongsai(name) {
  const { W, D, wall } = SIZES.barongsai;
  const fh = (wall - 0.5) / 2;
  const mdl = new Model(name);
  mdl.tint = 0xd99a86;
  const win = w0;
  await wallRun(mdl, 'front', W, D, 0, fh, [[win, win, win, PLAIN, win, win], [win, win, PLAIN, PLAIN, win, win]]);
  await wallRun(mdl, 'back', W, D, 0, fh, [[PLAIN, win, PLAIN, win, PLAIN], [PLAIN, win, PLAIN, win, PLAIN]].map((r) => r.concat(['Brick_Plain_3'])).map((r) => r.slice(0, 5)));
  await wallRun(mdl, 'right', W, D, 0, fh, [[PLAIN, win, win, PLAIN], [win, PLAIN, win, PLAIN]]);
  await wallRun(mdl, 'left', W, D, 0, fh, [[PLAIN, win, win, PLAIN], [win, PLAIN, win, PLAIN]]);
  await corners(mdl, W, D, 0, wall - 0.5, 'Trim_Column_Center');
  addBox(mdl, W - 0.5, wall - 0.5, D - 0.5, [0, 0.05, 0], 0xd99a86, 0, true);
  skirt(mdl, W, D, 0.5, 0xa8806c);
  addBox(mdl, W + 0.16, 0.5, D + 0.16, [0, wall - 0.5, 0], 0xf0cf8a, 0, true);
  mdl.addRaw(hipPiece(W + 0.7, D + 0.7, 1.47, (W + 0.7) * 0.08, (D + 0.7) * 0.08, 0xa4a4a4), [0, wall - 0.04, 0]);
  const zf = D / 2;
  // old carved door (the Lab entrance, x = -1.5) with gold studs, red lanterns on both sides
  addBox(mdl, 2.0, 2.7, 0.2, [-1.5, 0, zf + 0.04], 0xf0cf8a, 0, false);
  addBox(mdl, 1.6, 2.4, 0.24, [-1.5, 0, zf + 0.07], 0x8c3a30, 0, false);
  if (mdl.lod === 0) for (let i = 0; i < 3; i++) for (const sx of [-0.4, 0.4]) addBox(mdl, 0.14, 0.14, 0.05, [-1.5 + sx, 0.6 + i * 0.7, zf + 0.2], 0xf2b632, 0, false);
  for (const x of [-3.2, 0.2]) mdl.addRaw(discPiece(0.28, 0.26, 0xe0463c, 14), [x, 2.35, zf + 0.2]);
  // lion face (Barongsai) on the upper storey: red-gold mane, golden face, big eyes, nose and smiling mouth with teeth
  const lx = 0, ly = 5.15;
  const L = (r, t, hex, x, y, z) => mdl.addRaw(discPiece(r, t, hex, 24), [lx + x, ly + y, zf + z]);
  L(2.05, 0.06, 0xf2b632, 0, 0, 0);
  L(1.8, 0.06, 0xd0463c, 0, 0, 0.06);
  L(0.42, 0.06, 0xd0463c, -1.55, 1.25, 0.04);
  L(0.42, 0.06, 0xd0463c, 1.55, 1.25, 0.04);
  L(1.35, 0.06, 0xf6c35a, 0, -0.05, 0.12);
  for (const sx of [-1, 1]) {
    L(0.42, 0.06, 0xffffff, sx * 0.6, 0.35, 0.18);
    L(0.2, 0.06, 0x2a2230, sx * 0.6, 0.35, 0.24);
    L(0.28, 0.06, 0xe56f6f, sx * 0.85, -0.35, 0.18);
    addBox(mdl, 0.8, 0.14, 0.06, [lx + sx * 0.6 - 0.4, ly + 0.9, zf + 0.18], 0xd0463c, 0, false);
  }
  L(0.22, 0.08, 0xc03a3a, 0, -0.1, 0.18);
  addBox(mdl, 1.2, 0.34, 0.08, [lx - 0.6, ly - 0.95, zf + 0.18], 0x7a2a2a, 0, false);
  for (let i = 0; i < 4; i++) addBox(mdl, 0.2, 0.15, 0.06, [lx - 0.5 + i * 0.25, ly - 0.7, zf + 0.26], 0xffffff, 0, false);
  return { name, mdl, sz: SIZES.barongsai };
}

async function buildAll() {
  const out = [];
  // houses: door in the middle (the awning / canopy of the climbing piece stands there), windows beside it
  out.push(await house('dt_house_a', { win: w0, front: [w0, DOOR, w0] }));
  out.push(await house('dt_house_b', { win: w2, front: [w2, 'DoorFrame_Trim', w2], post: 'Trim_Column_Center' }));
  out.push(await house('dt_house_c', { win: w1, front: [w1, DOOR, w1] }));
  out.push(await house('dt_house_d', { win: w3, front: [w3, 'DoorFrame_Wooden', w3] }));
  out.push(await house('dt_house_e', { win: w4, front: [w0, DOOR, w4] }));
  out.push(await house('dt_house_f', { win: w2, front: [w2, DOOR, w0] }));
  // ruko: shop-front ground floor (the bay / sign pieces cover the left of it, the door is on the right), two storeys
  out.push(await ruko('dt_ruko_a', { win: w0, front: [[w3, w3, 'DoorFrame_Trim'], [w0, w0, w0]] }));
  out.push(await ruko('dt_ruko_b', { win: w2, front: [['Metal_FirstFloor_Window', 'Metal_FirstFloor_Window', DOOR], [w2, w2, w2]] }));
  out.push(await ruko('dt_ruko_c', { win: w1, front: [[w3, w3, 'DoorFrame_Wooden'], [w1, w1, w1]] }));
  out.push(await ruko('dt_ruko_d', { win: w4, front: [['Metal_FirstFloor_Window', w3, DOOR], [w4, w4, w4]] }));
  out.push(await ruko('dt_ruko_e', { win: w0, front: [[w3, w3, DOOR], [w2, w0, w2]] }));
  out.push(await ruko('dt_ruko_f', { win: w2, front: [[w3, w3, 'DoorFrame_Trim'], [w4, w4, w4]] }));
  // kiosks
  out.push(await kiosk('dt_kiosk_a', { front: [w3, w3], side: [w0, PLAIN] }));
  out.push(await kiosk('dt_kiosk_b', { front: ['Metal_FirstFloor_Window', 'Metal_FirstFloor_Window'], side: [PLAIN, w2] }));
  // towers (body above the 4.4 m podium; the style decoration, clock faces etc., is drawn by CityBuilder on the upper storey)
  out.push(await tower('dt_tower_a', { rows: [[w0, PLAIN, w0], [PLAIN, w0, PLAIN]] }));
  out.push(await tower('dt_tower_b', { rows: [[w2, PLAIN, w2], [PLAIN, w2, PLAIN]] }));
  out.push(await tower('dt_tower_c', { rows: [[w1, PLAIN, w1], [PLAIN, w1, PLAIN]] }));
  out.push(await tower('dt_tower_d', { rows: [[w4, PLAIN, w4], [PLAIN, w4, PLAIN]] }));
  // landmarks (replace the owner's Tripo models, which had holes in walls and roofs)
  out.push(await school('dt_school'), await hospital('dt_hospital'), await bank('dt_bank'), await pasar('dt_pasar'), await gudang('dt_gudang'), await glen('dt_glen'), await barongsai('dt_barongsai'));
  return out;
}
// ---- Sheet mode (visual check of kit pieces) -------------------------------------------------------------------------------
if (process.env.DOWNTOWN_SHEET) {
  const names = process.env.DOWNTOWN_SHEET.split(',');
  const models = [];
  let x = 0;
  const mdl = new Model('sheet');
  for (const n of names) {
    const p = await piece(n);
    const b = bbox(p);
    const w = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    mdl.addRaw(p, [x - (b.min[0] + b.max[0]) / 2, 0, 0]);
    x += w + 0.6;
  }
  models.push({ name: 'sheet', m: mdl.m, near: 1e9 });
  console.log((await writeGlb(models, process.env.DOWNTOWN_OUT ?? 'sheet.glb', { compress: false })).join('\n'));
  process.exit(0);
}


// ---- Build -------------------------------------------------------------------------------------------------------------------
{
  CUR_LOD = 0;
  const near = await buildAll();
  CUR_LOD = 1;
  const far = await buildAll();
  // `body` = wall box (x along the facade, z deep, wall height) of the model at scale 1: CityDressing scales instances to the data.
  const models = near.map((b, i) => {
    const z = SIZES[b.name.split('_')[1]];
    void z;
    return { name: b.name, m: b.mdl.m, mFar: far[i].mdl.m, body: [z.W, z.D, z.wall] };
  });
  CUR_LOD = 0;
  for (const mdl of await props()) models.push({ name: mdl.name, m: mdl.m });
  const report = await writeGlb(models, OUT);
  console.log(report.join('\n'));
  console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
}
