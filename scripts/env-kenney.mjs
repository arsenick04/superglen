// Kenney kits (art/kenney/*.zip, CC0, https://kenney.nl) and the owner's building GLBs (art/models/buildings/*.glb) for the city.
// Called by scripts/build-env-assets.mjs (npm run env-assets). Outputs:
//
//   public/env/kenney.glb            every chosen Kenney model as one mesh "<name>" plus a simplified "<name>@1" (far LOD).
//                                    Kenney's palette texture (colormap.png: flat swatches with soft vertical gradients) is
//                                    sampled per vertex into COLOR_0 (linear): exact for these models (each face maps into one
//                                    swatch), no texture at run time, so nothing can look pixelated and every model shares one
//                                    material (one BatchedMesh draw call for the whole city). Nature kit models use material
//                                    colours (same treatment). A soft baked ambient term (height + concavity) goes into COLOR_0.
//   public/env/kenney.json           names, sizes (bbox at scale 1), triangles, kit and licence.
//   public/env/buildings/<n>.glb     owner's custom buildings: welded, simplified (meshopt), textures WebP <= 1024, meshopt.
//   public/env/buildings/manifest.json   size and placement hints per building (merged from art/models/buildings/buildings.json).
//
// Swapping a city building TYPE for a custom model: drop `<type>.glb` in art/models/buildings/, add a line in
// art/models/buildings/buildings.json (which kind / POI it replaces, its front direction), run `npm run env-assets`.
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { reorder, weld, simplify, textureCompress, prune, dedup, flatten, join } from '@gltf-transform/functions';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, statSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const KITS = {
  sub: { zip: 'kenney_city-kit-suburban_20.zip', dir: 'Models/GLB format', name: 'City Kit (Suburban)' },
  com: { zip: 'kenney_city-kit-commercial_2.1.zip', dir: 'Models/GLB format', name: 'City Kit (Commercial)' },
  road: { zip: 'kenney_city-kit-roads.zip', dir: 'Models/GLB format', name: 'City Kit (Roads)' },
  car: { zip: 'kenney_car-kit.zip', dir: 'Models/GLB format', name: 'Car Kit' },
  nat: { zip: 'kenney_nature-kit.zip', dir: 'Models/GLTF format', name: 'Nature Kit' },
};

const letters = (s) => s.split('');
/** [kit, file, lod1 ratio]. Names in the output are `<kit>_<file>` (GLTFLoader turns "/" into "_"). */
const MODELS = [
  ...letters('abcdefghijklmnopqrstu').map((c) => ['sub', `building-type-${c}`, 1]),
  ['sub', 'fence-1x4', 0.5], ['sub', 'planter', 0.5], ['sub', 'tree-large', 1], ['sub', 'tree-small', 1],
  ...letters('abcdefghijklmn').map((c) => ['com', `building-${c}`, 1]),
  ...letters('abcde').map((c) => ['com', `building-skyscraper-${c}`, 1]),
  ['com', 'detail-awning', 1], ['com', 'detail-awning-wide', 1], ['com', 'detail-overhang', 1], ['com', 'detail-overhang-wide', 1],
  ['com', 'detail-parasol-a', 0.6], ['com', 'detail-parasol-b', 0.6],
  ['road', 'light-curved', 0.6], ['road', 'light-square', 1], ['road', 'traffic-light', 0.6], ['road', 'road-sign-street', 0.6],
  ['road', 'dumpster', 0.5], ['road', 'construction-cone', 1], ['road', 'construction-barrier', 1],
  ...['sedan', 'suv', 'taxi', 'van', 'police', 'hatchback-sports', 'sedan-sports', 'delivery', 'truck', 'ambulance', 'garbage-truck', 'firetruck', 'suv-luxury', 'truck-flat'].map((n) => ['car', n, 1]),
  ['car', 'box', 1], ['car', 'cone', 1],
  ...['tree_oak', 'tree_default', 'tree_detailed', 'tree_fat', 'tree_plateau', 'tree_blocks', 'tree_oak_fall', 'tree_default_fall', 'tree_detailed_dark',
    'tree_pineRoundA', 'tree_pineRoundC', 'tree_pineTallA_detailed', 'tree_pineTallC_detailed', 'tree_pineDefaultA', 'tree_cone', 'tree_palmTall',
    'plant_bushDetailed', 'plant_bushLarge', 'plant_bush', 'flower_redA', 'flower_yellowB', 'flower_purpleA', 'flower_redB', 'flower_purpleC',
    'grass_large', 'grass_leafsLarge', 'rock_smallE', 'rock_smallH', 'rock_smallTopB', 'stone_tallB', 'stone_tallH', 'rock_largeA', 'rock_tallA',
    'fence_simple', 'fence_planks', 'log', 'stump_round', 'mushroom_red', 'lily_large', 'statue_column', 'hanging_moss'].map((n) => ['nat', n, 1]),
];

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function unzipKits(kenneyDir, cache) {
  for (const k of Object.values(KITS)) {
    const dst = path.join(cache, k.zip.replace(/\.zip$/, ''));
    if (!existsSync(dst)) {
      mkdirSync(dst, { recursive: true });
      execFileSync('unzip', ['-q', '-o', path.join(kenneyDir, k.zip), '-d', dst]);
    }
    k.root = path.join(dst, k.dir);
  }
}

const texCache = new Map();
async function loadTex(file) {
  if (!texCache.has(file)) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    texCache.set(file, { data, w: info.width, h: info.height });
  }
  return texCache.get(file);
}

/** Flatten one Kenney GLB into arrays (world space of the file, metres at scale 1), colour per vertex (linear 0..1). */
async function bakeModel(io, kit, file) {
  const fpath = path.join(kit.root, `${file}.glb`);
  const doc = await io.read(fpath);
  const P = [], N = [], Cl = [], I = [];
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const mul = (m, v, w) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * w, m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * w, m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * w];
  const visit = async (node) => {
    const mesh = node.getMesh();
    if (mesh) {
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const nrm = prim.getAttribute('NORMAL');
        const uv = prim.getAttribute('TEXCOORD_0');
        const mat = prim.getMaterial();
        const f = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
        const tex = mat?.getBaseColorTexture();
        let img = null;
        if (tex) {
          const uri = tex.getURI();
          img = uri ? await loadTex(path.join(path.dirname(fpath), uri)) : null;
          if (!img && tex.getImage()) {
            const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            img = { data, w: info.width, h: info.height };
          }
        }
        const base = P.length / 3;
        const a = [], b = [];
        for (let k = 0; k < pos.getCount(); k++) {
          const p = mul(m, pos.getElement(k, a), 1);
          P.push(...p);
          const n = nrm ? mul(m, nrm.getElement(k, b), 0) : [0, 1, 0];
          const l = Math.hypot(...n) || 1;
          N.push(n[0] / l, n[1] / l, n[2] / l);
          let c = [1, 1, 1];
          if (img && uv) {
            const t = uv.getElement(k, []);
            const x = Math.min(img.w - 1, Math.max(0, Math.floor((t[0] - Math.floor(t[0])) * img.w)));
            const y = Math.min(img.h - 1, Math.max(0, Math.floor((t[1] - Math.floor(t[1])) * img.h)));
            const o = (y * img.w + x) * 4;
            c = [img.data[o] / 255, img.data[o + 1] / 255, img.data[o + 2] / 255].map(srgbToLinear);
          }
          // Factors are linear already.
          Cl.push(c[0] * f[0], c[1] * f[1], c[2] * f[2]);
        }
        const idx = prim.getIndices();
        if (idx) for (let k = 0; k < idx.getCount(); k++) I.push(base + idx.getScalar(k));
        else for (let k = 0; k < pos.getCount(); k++) I.push(base + k);
      }
    }
    for (const c of node.listChildren()) await visit(c);
  };
  for (const n of scene.listChildren()) await visit(n);
  return { P, N, C: Cl, I };
}

/**
 * Per-vertex mask (glTF `_MASK`, 0..1) read by the city shader: 1 = repaintable accent (house roofs, car paint), 0.5 = wall
 * (tinted pastel per building), 0 = keep the baked colour. Nature colours get a little more saturation (Kenney's nature palette is
 * pale next to the city kits).
 */
function gradeAndMask(m, kitId, file) {
  const n = m.P.length / 3;
  m.M = new Array(n).fill(0);
  let minY = Infinity, maxY = -Infinity;
  for (let k = 1; k < m.P.length; k += 3) { minY = Math.min(minY, m.P[k]); maxY = Math.max(maxY, m.P[k]); }
  const h = Math.max(1e-3, maxY - minY);
  // Most common saturated colour (car paint): area-free vertex vote, good enough for these models.
  let paint = null;
  if (kitId === 'car') {
    const votes = new Map();
    for (let k = 0; k < n; k++) {
      const c = [m.C[k * 3], m.C[k * 3 + 1], m.C[k * 3 + 2]];
      const mx = Math.max(...c), mn = Math.min(...c);
      if (mx - mn < 0.12 || mx < 0.15) continue;
      const key = c.map((v) => Math.round(v * 12)).join(',');
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    paint = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  for (let k = 0; k < n; k++) {
    const r = m.C[k * 3], g = m.C[k * 3 + 1], b = m.C[k * 3 + 2];
    const t = (m.P[k * 3 + 1] - minY) / h;
    if (kitId === 'nat') {
      const l = (r + g + b) / 3;
      const s = 1.45, v = 0.86;
      m.C[k * 3] = Math.max(0, (l + (r - l) * s) * v);
      m.C[k * 3 + 1] = Math.max(0, (l + (g - l) * s) * v);
      m.C[k * 3 + 2] = Math.max(0, (l + (b - l) * s) * v);
      // Kenney's leaves are mint / teal: push greens toward a warm sap green (fits the painted characters better).
      if (g > r && g > b) {
        m.C[k * 3] *= 1.15;
        m.C[k * 3 + 2] *= 0.45;
      }
    } else if (kitId === 'sub' && file.startsWith('building')) {
      if (g > r * 1.25 && g > b * 1.05 && t > 0.35) m.M[k] = 1; // green roof
      else if (Math.min(r, g, b) > 0.55) m.M[k] = 0.5; // white walls
    } else if (kitId === 'com' && file.startsWith('building')) {
      if (Math.min(r, g, b) > 0.55 && Math.abs(r - b) < 0.12) m.M[k] = 0.5;
    } else if (paint) {
      const key = [r, g, b].map((v) => Math.round(v * 12)).join(',');
      if (key === paint) m.M[k] = 1;
    }
  }
}

/** Soft baked ambient: darker low down and in creases between parts (cheap stand-in for AO, applied to every vertex colour). */
function bakeAmbient(m) {
  let minY = Infinity, maxY = -Infinity;
  for (let k = 1; k < m.P.length; k += 3) { minY = Math.min(minY, m.P[k]); maxY = Math.max(maxY, m.P[k]); }
  const h = Math.max(1e-3, maxY - minY);
  const n = m.P.length / 3;
  for (let k = 0; k < n; k++) {
    const t = (m.P[k * 3 + 1] - minY) / h;
    const ny = m.N[k * 3 + 1];
    // Ground contact: the lowest 15 % fades to 0.72; downward faces 0.8; up faces a hair brighter.
    let ao = 0.72 + 0.28 * Math.min(1, t / 0.15);
    if (ny < -0.5) ao *= 0.8;
    else if (ny > 0.5) ao *= 1.04;
    for (let c = 0; c < 3; c++) m.C[k * 3 + c] = Math.min(1, m.C[k * 3 + c] * ao);
  }
}

/** Merge identical vertices (position, normal, colour). */
function weldArrays(m) {
  const map = new Map();
  const P = [], N = [], C = [], I = [], M = [];
  const n = m.P.length / 3;
  const remap = new Uint32Array(n);
  for (let k = 0; k < n; k++) {
    const key = [m.P[k * 3], m.P[k * 3 + 1], m.P[k * 3 + 2]].map((v) => Math.round(v * 1e4)).join(',') + '|' + [m.N[k * 3], m.N[k * 3 + 1], m.N[k * 3 + 2]].map((v) => Math.round(v * 100)).join(',') + '|' + [m.C[k * 3], m.C[k * 3 + 1], m.C[k * 3 + 2]].map((v) => Math.round(v * 255)).join(',') + '|' + m.M[k];
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
  for (const i of m.I) I.push(remap[i]);
  // Drop degenerate triangles.
  const J = [];
  for (let t = 0; t < I.length; t += 3) if (I[t] !== I[t + 1] && I[t + 1] !== I[t + 2] && I[t] !== I[t + 2]) J.push(I[t], I[t + 1], I[t + 2]);
  return { P, N, C, M, I: J };
}

/** Far LOD: meshopt simplification on position only (attribute seams may move: fine at 40+ m). */
async function lod(m, ratio) {
  if (ratio >= 1) return m;
  await MeshoptSimplifier.ready;
  const idx = new Uint32Array(m.I);
  const pos = new Float32Array(m.P);
  const target = Math.max(12, Math.floor((idx.length * ratio) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.02, ['LockBorder']);
  let res = out;
  if (out.length > idx.length * ratio * 1.3) res = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, 0.03)[0];
  // Compact.
  const map = new Map();
  const r = { P: [], N: [], C: [], M: [], I: [] };
  for (const i of res) {
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

function addMesh(doc, buffer, scene, name, m) {
  const big = m.P.length / 3 > 65535;
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.P)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.N)).setBuffer(buffer))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setNormalized(true).setArray(Uint8Array.from(m.C, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255))).setBuffer(buffer))
    .setAttribute('_MASK', doc.createAccessor().setType('SCALAR').setNormalized(true).setArray(Uint8Array.from(m.M, (v) => Math.round(v * 255))).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(big ? Uint32Array.from(m.I) : Uint16Array.from(m.I)).setBuffer(buffer));
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}

export async function buildKenney(root, cacheDir) {
  const kenneyDir = path.join(root, 'art', 'kenney');
  if (!existsSync(kenneyDir)) return console.log('art/kenney missing: Kenney models skipped');
  const cache = path.join(cacheDir, 'kenney');
  mkdirSync(cache, { recursive: true });
  unzipKits(kenneyDir, cache);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('kenney');
  const info = { generated: new Date().toISOString().slice(0, 10), file: 'kenney.glb', license: 'CC0 1.0 (Kenney, https://kenney.nl)', models: {} };
  let tris0 = 0;
  for (const [kitId, file, ratio] of MODELS) {
    const kit = KITS[kitId];
    if (!existsSync(path.join(kit.root, `${file}.glb`))) { console.warn(`  missing ${kitId}/${file}`); continue; }
    let m = await bakeModel(io, kit, file);
    gradeAndMask(m, kitId, file);
    bakeAmbient(m);
    m = weldArrays(m);
    const l1 = await lod(m, ratio);
    const name = `${kitId}_${file}`;
    addMesh(doc, buffer, scene, name, m);
    if (ratio < 1) addMesh(doc, buffer, scene, `${name}@1`, l1);
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let k = 0; k < m.P.length; k++) { mn[k % 3] = Math.min(mn[k % 3], m.P[k]); mx[k % 3] = Math.max(mx[k % 3], m.P[k]); }
    info.models[name] = { tris: m.I.length / 3, lod1: l1.I.length / 3, min: mn.map((v) => +v.toFixed(3)), max: mx.map((v) => +v.toFixed(3)), kit: `Kenney ${kit.name}` };
    tris0 += m.I.length / 3;
  }
  await MeshoptEncoder.ready;
  await doc.transform(reorder({ encoder: MeshoptEncoder }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const out = path.join(root, 'public', 'env', 'kenney.glb');
  await io.write(out, doc);
  info.bytes = statSync(out).size;
  writeFileSync(path.join(root, 'public', 'env', 'kenney.json'), JSON.stringify(info, null, 1) + '\n');
  console.log(`public/env/kenney.glb: ${Object.keys(info.models).length} models, ${tris0} tris (lod0), ${info.bytes} bytes`);
}

/** Owner's custom buildings: art/models/buildings/<name>.glb + buildings.json -> public/env/buildings/. */
export async function buildBuildings(root) {
  const src = path.join(root, 'art', 'models', 'buildings');
  if (!existsSync(src)) return;
  const outDir = path.join(root, 'public', 'env', 'buildings');
  mkdirSync(outDir, { recursive: true });
  const hintsFile = path.join(src, 'buildings.json');
  const hints = existsSync(hintsFile) ? JSON.parse(readFileSync(hintsFile, 'utf8')) : {};
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const manifest = { generated: new Date().toISOString().slice(0, 10), buildings: {} };
  for (const f of readdirSync(src).filter((f) => f.endsWith('.glb')).sort()) {
    const name = f.replace(/\.glb$/, '');
    const h = hints[name] ?? {};
    const doc = await io.read(path.join(src, f));
    const before = countTris(doc);
    const target = h.tris ?? 16000;
    await doc.transform(
      dedup(), flatten(), join(), weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / before), error: 0.004, lockBorder: false }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [h.texture ?? 1024, h.texture ?? 1024], quality: 88 }),
      prune(),
      reorder({ encoder: MeshoptEncoder }),
    );
    // Stylised look: the models carry their own normal + roughness/metal maps; keep them, metal off.
    for (const mat of doc.getRoot().listMaterials()) mat.setMetallicFactor(0);
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    const out = path.join(outDir, f);
    await io.write(out, doc);
    const after = countTris(doc);
    const b = bounds(doc);
    manifest.buildings[name] = { file: `buildings/${f}`, tris: after, bytes: statSync(out).size, min: b.min, max: b.max, ...h, source: 'Pemilik proyek (Higgsfield + Tripo)' };
    console.log(`  building ${name.padEnd(14)} ${before} -> ${after} tris, ${statSync(out).size} bytes`);
  }
  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
}

function countTris(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return t;
}
function bounds(doc) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh();
    if (!mesh) continue;
    const w = n.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION');
      const e = [];
      for (let k = 0; k < a.getCount(); k++) {
        a.getElement(k, e);
        const v = [w[0] * e[0] + w[4] * e[1] + w[8] * e[2] + w[12], w[1] * e[0] + w[5] * e[1] + w[9] * e[2] + w[13], w[2] * e[0] + w[6] * e[1] + w[10] * e[2] + w[14]];
        for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], v[c]); max[c] = Math.max(max[c], v[c]); }
      }
    }
  }
  return { min: min.map((v) => +v.toFixed(4)), max: max.map((v) => +v.toFixed(4)) };
}

/**
 * Sky (Poly Haven, CC0): "Kloofendal 48d Partly Cloudy (Pure Sky)" by Greg Zaal. The 1k HDR lights the city (image-based
 * lighting, PMREM at run time); the tonemapped 8k JPG becomes a 4k WebP for the visible sky (sharper than the 1k HDR).
 * Downloaded with curl (honours the build machine's proxy), cached in .cache/sky.
 */
export async function buildSky(root, cacheDir) {
  const id = 'kloofendal_48d_partly_cloudy_puresky';
  const dir = path.join(cacheDir, '..', 'sky');
  mkdirSync(dir, { recursive: true });
  const get = (url, file) => {
    const f = path.join(dir, file);
    if (!existsSync(f)) execFileSync('curl', ['-sSfL', '-o', f, url]);
    return f;
  };
  const hdr = get(`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/${id}_1k.hdr`, 'sky_1k.hdr');
  const jpg = get(`https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/${id}.jpg`, 'sky_tm.jpg');
  const out = path.join(root, 'public', 'env', 'sky');
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'sky_1k.hdr'), readFileSync(hdr));
  await sharp(jpg).resize(4096, 2048).webp({ quality: 82 }).toFile(path.join(out, 'sky_4k.webp'));
  console.log(`public/env/sky: sky_1k.hdr ${statSync(path.join(out, 'sky_1k.hdr')).size} bytes, sky_4k.webp ${statSync(path.join(out, 'sky_4k.webp')).size} bytes`);
}
