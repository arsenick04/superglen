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
    for (let i = 0; i < p.P.length; i += 3) {
      const x = p.P[i] * s[0], y = p.P[i + 1] * s[1], z = p.P[i + 2] * s[2];
      m.P.push(x * c + z * sn + at[0], y + at[1], -x * sn + z * c + at[2]);
      // Normals: scaled non-uniformly only along the wall / height (faces stay axis aligned): rotation is enough.
      const nx = p.N[i], ny = p.N[i + 1], nz = p.N[i + 2];
      m.N.push(nx * c + nz * sn, ny, -nx * sn + nz * c);
      const k = i / 3;
      m.C.push(p.C[i], p.C[i + 1], p.C[i + 2]);
      m.M.push(p.M[k]);
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
};

/** Solid core inside the facade shell: closes every window / door opening and gap (what you see "inside" is wall colour). */
function core(mdl, W, D, h) {
  addBox(mdl, W - 0.5, h, D - 0.5, [0, 0.05, 0], 0xfbf1e1, 0.5, true);
}

function skirt(mdl, W, D, h = 0.4, hex = 0xe6d9bd) {
  addBox(mdl, W + 0.1, h, D + 0.1, [0, 0, 0], hex, 0, false);
}

async function house(name, o) {
  const { W, D, wall, roofH } = SIZES.house;
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
  return { name, mdl, near: 1300, far: 140 };
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
    return { name: b.name, m: b.mdl.m, mFar: far[i].mdl.m, body: [z.W, z.D, z.wall] };
  });
  CUR_LOD = 0;
  for (const mdl of await props()) models.push({ name: mdl.name, m: mdl.m });
  const report = await writeGlb(models, OUT);
  console.log(report.join('\n'));
  console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
}
