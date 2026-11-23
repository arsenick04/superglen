/**
 * Build public/env/megakit/megakit.glb from the Quaternius "Stylized Nature MegaKit" (CC0, https://quaternius.com/packs/stylizednaturemegakit.html).
 *
 *   MEGAKIT_SRC=<folder with the glTF + .bin + png files> node scripts/build-megakit.mjs
 *
 * The source files are NOT committed (46 MB of 2k PNG); only the optimised result is. What this does:
 *  - ONE material and ONE 2048x1024 WebP atlas (8 cells of 512 px) for every variant, so the whole nature set is drawn with one
 *    material (trees, bushes, flowers, grass, rocks). Tiling UVs are baked into the cells (leaf clusters tiled 2x2; the bark
 *    texture becomes a vertical-streak strip), colours of transparent texels are dilated (no dark mip halos on alpha cut-outs),
 *    greens are pushed warmer / more saturated for the soft storybook look.
 *  - Each variant is simplified with meshoptimizer to a triangle budget (phone friendly) and compacted.
 *  - Variants are merged flower beds / single models, base on y = 0, origin at the trunk / centre; node names are the runtime ids.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';

const SRC = process.env.MEGAKIT_SRC;
if (!SRC) throw new Error('set MEGAKIT_SRC to the folder with the downloaded MegaKit glTF files');
const OUT = 'public/env/megakit/megakit.glb';
await MeshoptSimplifier.ready;

// ---- Atlas -------------------------------------------------------------------------------------------------------------------
const CELL = 512;
const COLS = 4;
const ROWS = 2;
/** material name -> [cell index, how the texture fills the cell] */
const CELLS = {
  Leaves_NormalTree: [0, 'tile2', 'Leaves_NormalTree_C.png', { saturation: 1.4, brightness: 1.5 }],
  Leaves_TwistedTree: [1, 'tile2', 'Leaves_TwistedTree_C.png', { saturation: 1.4, brightness: 1.5 }],
  Leaves_Pine: [2, 'fit', 'Leaf_Pine_C.png', { saturation: 1.35, brightness: 1.45 }],
  Leaves: [3, 'fit', 'Leaves.png', { saturation: 1.3, brightness: 1.1 }],
  Flowers: [4, 'fit', 'Flowers.png', { saturation: 1.2, brightness: 1.08 }],
  Grass: [5, 'fit', 'Grass.png', { saturation: 1.25, brightness: 1.1 }],
  Rocks: [6, 'fit', 'Rocks_Diffuse.png', { saturation: 1.15, brightness: 1.12 }],
  Bark_NormalTree: [7, 'strip', 'Bark_NormalTree.png', { saturation: 1.25, brightness: 1.25 }],
};
const CELL_OF = (mat) => CELLS[mat] ?? CELLS[mat.replace(/_C$/, '')] ?? null;

/** Colours of (nearly) transparent texels become the average opaque colour: no dark fringes after minification. */
function dilate(rgba) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] > 200) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++; }
  if (!n) return;
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] < 128) { rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; }
}

async function cellImage(file, mode, adjust) {
  const p = path.join(SRC, file);
  let img = sharp(p).ensureAlpha();
  if (mode === 'strip') {
    // Average the bark over its height: vertical streaks only (the UV v is pinned to the middle of the cell).
    const small = await img.resize(CELL, 64, { fit: 'fill' }).modulate(adjust).raw().toBuffer();
    const row = Buffer.alloc(CELL * 4);
    for (let x = 0; x < CELL; x++) for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let y = 0; y < 64; y++) s += small[(y * CELL + x) * 4 + c];
      row[x * 4 + c] = Math.round(s / 64);
    }
    const out = Buffer.alloc(CELL * CELL * 4);
    for (let y = 0; y < CELL; y++) row.copy(out, y * CELL * 4);
    return out;
  }
  const size = mode === 'tile2' ? CELL / 2 : CELL;
  const buf = await img.resize(size, size, { fit: 'fill' }).modulate(adjust).raw().toBuffer();
  dilate(buf);
  if (mode === 'fit') return buf;
  const out = Buffer.alloc(CELL * CELL * 4);
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) buf.copy(out, (y * CELL + x) * 4, ((y % size) * size + (x % size)) * 4, ((y % size) * size + (x % size)) * 4 + 4);
  return out;
}

const atlas = Buffer.alloc(CELL * COLS * CELL * ROWS * 4);
for (const [name, [index, mode, file, adjust]] of Object.entries(CELLS)) {
  const px = await cellImage(file, mode, adjust);
  const cx = (index % COLS) * CELL;
  const cy = Math.floor(index / COLS) * CELL;
  for (let y = 0; y < CELL; y++) px.copy(atlas, ((cy + y) * CELL * COLS + cx) * 4, y * CELL * 4, (y + 1) * CELL * 4);
  console.log(`cell ${index} ${name} (${mode})`);
}
const atlasWebp = await sharp(atlas, { raw: { width: CELL * COLS, height: CELL * ROWS, channels: 4 } }).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
console.log(`atlas ${CELL * COLS}x${CELL * ROWS} webp ${(atlasWebp.length / 1024).toFixed(0)} KB`);

// ---- Variants ----------------------------------------------------------------------------------------------------------------
/** target = triangle budget of the variant (all parts); parts: source, offset [x, z], yaw, scale, share of the budget. */
const VARIANTS = [
  { name: 'tree_a', target: 1700, parts: [{ src: 'CommonTree_1' }] },
  { name: 'pine_a', target: 950, parts: [{ src: 'Pine_2' }] },
  { name: 'bush', target: 260, parts: [{ src: 'Bush_Common', cell: 'Leaves_NormalTree' }] },
  {
    name: 'flowerbed', target: 380,
    parts: [
      { src: 'Flower_3_Group', at: [-0.7, 0.2], yaw: 0.4, scale: 1, share: 0.36 },
      { src: 'Flower_4_Group', at: [0.8, -0.1], yaw: 2.1, scale: 1, share: 0.4 },
      { src: 'Flower_3_Group', at: [0.1, 0.9], yaw: 4.0, scale: 0.8, share: 0.24 },
    ],
  },
  { name: 'grass', target: 300, parts: [{ src: 'Grass_Common_Tall' }] },
  { name: 'rock', target: 220, parts: [{ src: 'Rock_Medium_1' }] },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const inset = 1.5 / CELL;

/** Read one source model: per primitive arrays with UVs remapped into the atlas; `alpha` = leaf / petal cards (cut-out). */
async function readModel(src, cellOverride) {
  const doc = await io.read(path.join(SRC, `${src}.gltf`));
  const prims = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const matName = prim.getMaterial()?.getName() ?? '';
      const cell = (cellOverride && matName.startsWith('Leaves') ? CELLS[cellOverride] : null) ?? CELL_OF(matName) ?? (matName.startsWith('Bark') ? CELLS.Bark_NormalTree : null);
      if (!cell) throw new Error(`${src}: no atlas cell for material ${matName}`);
      const [index, mode] = cell;
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0');
      const n = P.getCount();
      const e = [0, 0, 0];
      const pos = [], nrm = [], uv = [], idx = [];
      for (let i = 0; i < n; i++) {
        pos.push(...P.getElement(i, e)); nrm.push(...N.getElement(i, e));
        T.getElement(i, e);
        let u = e[0], v = e[1];
        if (mode === 'tile2') { u /= 2; v /= 2; } else if (mode === 'strip') { u = Math.min(1, Math.max(0, u)); v = 0.5; }
        u = Math.min(1 - inset, Math.max(inset, u)); v = Math.min(1 - inset, Math.max(inset, v));
        uv.push(((index % COLS) + u) / COLS, (Math.floor(index / COLS) + v) / ROWS);
      }
      const I = prim.getIndices();
      for (let i = 0; i < I.getCount(); i++) idx.push(I.getScalar(i));
      prims.push({ pos, nrm, uv, idx, alpha: prim.getMaterial().getAlphaMode() === 'MASK' && !matName.startsWith('Bark') });
    }
  }
  return prims;
}

function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Copy the used vertices of `idx` into compact arrays. */
function compact(m, idx) {
  const map = new Map();
  const res = { pos: [], nrm: [], uv: [], idx: [] };
  for (const i of idx) {
    let j = map.get(i);
    if (j === undefined) {
      j = res.pos.length / 3;
      map.set(i, j);
      res.pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
      res.nrm.push(m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]);
      res.uv.push(m.uv[i * 2], m.uv[i * 2 + 1]);
    }
    res.idx.push(j);
  }
  return res;
}

/** Solid geometry (trunk, branches, rocks, grass blades): meshopt simplification. */
function simplifySolid(m, targetTris) {
  // Weld by position first: UV / normal seams would otherwise count as open borders and stall the simplifier.
  const rep = new Map();
  const remap = new Uint32Array(m.pos.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const key = `${Math.round(m.pos[i * 3] * 1000)},${Math.round(m.pos[i * 3 + 1] * 1000)},${Math.round(m.pos[i * 3 + 2] * 1000)}`;
    let r = rep.get(key);
    if (r === undefined) { r = i; rep.set(key, i); }
    remap[i] = r;
  }
  const indices = Uint32Array.from(m.idx, (i) => remap[i]);
  const target = Math.min(indices.length, Math.max(3, Math.round(targetTris) * 3));
  let out = indices;
  if (target < indices.length) {
    const positions = Float32Array.from(m.pos);
    out = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.6, [])[0];
    // Twig tubes are disconnected pieces and stall the plain simplifier: drop the smallest pieces (Prune), then simplify more.
    for (const err of [0.04, 0.08, 0.15, 0.3, 0.5]) {
      if (out.length <= target * 1.2) break;
      out = MeshoptSimplifier.simplify(indices, positions, 3, target, err, ['Prune'])[0];
    }
  }
  return compact(m, out);
}

/**
 * Leaf / petal cards: meshopt cannot thin disjoint cards, so keep a deterministic share of the cards (connected pieces) and
 * grow the survivors about their centre so the canopy keeps its volume.
 */
function thinCards(m, targetTris) {
  const tris = m.idx.length / 3;
  if (targetTris >= tris) return compact(m, m.idx);
  // Connected pieces by shared position (cards of one cluster touch each other).
  const parent = Array.from({ length: m.pos.length / 3 }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const byPos = new Map();
  for (let i = 0; i < parent.length; i++) {
    const key = `${Math.round(m.pos[i * 3] * 2000)},${Math.round(m.pos[i * 3 + 1] * 2000)},${Math.round(m.pos[i * 3 + 2] * 2000)}`;
    const j = byPos.get(key);
    if (j === undefined) byPos.set(key, i); else parent[find(i)] = find(j);
  }
  for (let t = 0; t < m.idx.length; t += 3) { parent[find(m.idx[t + 1])] = find(m.idx[t]); parent[find(m.idx[t + 2])] = find(m.idx[t]); }
  const comps = new Map();
  for (let t = 0; t < m.idx.length; t += 3) {
    const r = find(m.idx[t]);
    (comps.get(r) ?? comps.set(r, []).get(r)).push(t);
  }
  const keep = targetTris / tris;
  if (process.env.DEBUG_MK) console.log(`cards: ${tris} tris in ${comps.size} pieces, keep ${keep.toFixed(2)}`);
  const grow = Math.min(2.0, Math.pow(1 / keep, 0.48));
  const kept = [...comps.entries()].filter(([r]) => hash(r) < keep * 1.02);
  const res = { pos: [], nrm: [], uv: [], idx: [] };
  for (const [, list] of kept) {
    const ids = new Set();
    for (const t of list) { ids.add(m.idx[t]); ids.add(m.idx[t + 1]); ids.add(m.idx[t + 2]); }
    let cx = 0, cy = 0, cz = 0;
    for (const i of ids) { cx += m.pos[i * 3]; cy += m.pos[i * 3 + 1]; cz += m.pos[i * 3 + 2]; }
    cx /= ids.size; cy /= ids.size; cz /= ids.size;
    const map = new Map();
    for (const i of ids) {
      map.set(i, res.pos.length / 3);
      // grow in the horizontal plane and a little vertically, but keep the lowest points anchored
      res.pos.push(cx + (m.pos[i * 3] - cx) * grow, cy + (m.pos[i * 3 + 1] - cy) * grow, cz + (m.pos[i * 3 + 2] - cz) * grow);
      res.nrm.push(m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]);
      res.uv.push(m.uv[i * 2], m.uv[i * 2 + 1]);
    }
    for (const t of list) res.idx.push(map.get(m.idx[t]), map.get(m.idx[t + 1]), map.get(m.idx[t + 2]));
  }
  return res;
}

/** One source model reduced to ~targetTris: solid parts first (at most 40 %), cards get the rest. */
function reduceModel(prims, targetTris) {
  const solid = prims.filter((p) => !p.alpha), cards = prims.filter((p) => p.alpha);
  const solidTris = solid.reduce((a, p) => a + p.idx.length / 3, 0);
  const cardTris = cards.reduce((a, p) => a + p.idx.length / 3, 0);
  const solidTarget = cards.length ? Math.min(solidTris, Math.max(120, targetTris * 0.4)) : targetTris;
  const out = { pos: [], nrm: [], uv: [], idx: [] };
  const add = (r) => {
    const off = out.pos.length / 3;
    out.pos.push(...r.pos); out.nrm.push(...r.nrm); out.uv.push(...r.uv);
    for (const i of r.idx) out.idx.push(i + off);
  };
  let used = 0;
  for (const p of solid) {
    const r = simplifySolid(p, solidTarget * (p.idx.length / 3 / solidTris));
    used += r.idx.length / 3;
    if (process.env.DEBUG_MK) console.log(`solid ${p.idx.length / 3} -> ${r.idx.length / 3} (target ${solidTarget * (p.idx.length / 3 / solidTris)})`);
    add(r);
  }
  for (const p of cards) add(thinCards(p, Math.max(8, (targetTris - used) * (p.idx.length / 3 / cardTris))));
  return out;
}

const doc = new Document();
doc.createExtension(EXTTextureWebP).setRequired(true);
const buffer = doc.createBuffer();
const texture = doc.createTexture('nature-atlas').setMimeType('image/webp').setImage(new Uint8Array(atlasWebp));
const material = doc.createMaterial('nature').setBaseColorTexture(texture).setAlphaMode('MASK').setAlphaCutoff(0.42).setDoubleSided(true).setMetallicFactor(0).setRoughnessFactor(0.92);
const scene = doc.createScene('megakit');
const report = [];

for (const v of VARIANTS) {
  const total = { pos: [], nrm: [], uv: [], idx: [] };
  const srcTris = [];
  for (const part of v.parts) {
    const full = await readModel(part.src, part.cell);
    srcTris.push(full.reduce((a, p) => a + p.idx.length / 3, 0));
    const s = reduceModel(full, v.target * (part.share ?? 1));
    // place the part
    const [ox, oz] = part.at ?? [0, 0];
    const yaw = part.yaw ?? 0, k = part.scale ?? 1;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const off = total.pos.length / 3;
    for (let i = 0; i < s.pos.length; i += 3) {
      const x = s.pos[i] * k, y = s.pos[i + 1] * k, z = s.pos[i + 2] * k;
      total.pos.push(x * c + z * sn + ox, y, -x * sn + z * c + oz);
      const nx = s.nrm[i], nz = s.nrm[i + 2];
      total.nrm.push(nx * c + nz * sn, s.nrm[i + 1], -nx * sn + nz * c);
    }
    total.uv.push(...s.uv);
    for (const i of s.idx) total.idx.push(i + off);
  }
  // base on y = 0 (pebbles / rocks / bushes may sink slightly under their origin)
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < total.pos.length; i += 3) {
    minX = Math.min(minX, total.pos[i]); maxX = Math.max(maxX, total.pos[i]);
    minY = Math.min(minY, total.pos[i + 1]); maxY = Math.max(maxY, total.pos[i + 1]);
    minZ = Math.min(minZ, total.pos[i + 2]); maxZ = Math.max(maxZ, total.pos[i + 2]);
  }
  for (let i = 1; i < total.pos.length; i += 3) total.pos[i] -= minY;
  const pos = doc.createAccessor(`${v.name}-pos`).setType('VEC3').setArray(Float32Array.from(total.pos)).setBuffer(buffer);
  const nrm = doc.createAccessor(`${v.name}-nrm`).setType('VEC3').setArray(Float32Array.from(total.nrm)).setBuffer(buffer);
  const uv = doc.createAccessor(`${v.name}-uv`).setType('VEC2').setArray(Float32Array.from(total.uv)).setBuffer(buffer);
  const ind = doc.createAccessor(`${v.name}-idx`).setType('SCALAR').setArray(Uint16Array.from(total.idx)).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nrm).setAttribute('TEXCOORD_0', uv).setIndices(ind).setMaterial(material);
  const mesh = doc.createMesh(v.name).addPrimitive(prim);
  scene.addChild(doc.createNode(v.name).setMesh(mesh));
  report.push(`${v.name}: ${srcTris.join('+')} -> ${total.idx.length / 3} tris, ${(maxX - minX).toFixed(2)} x ${(maxY - minY).toFixed(2)} x ${(maxZ - minZ).toFixed(2)} m, x ${minX.toFixed(2)}..${maxX.toFixed(2)} z ${minZ.toFixed(2)}..${maxZ.toFixed(2)}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
console.log(report.join('\n'));
console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
