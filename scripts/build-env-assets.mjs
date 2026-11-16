// Builds public/env/env.glb: the city's environment models (trees, lamps, benches, planters, rocks, cars).
//
//   npm run env-assets                 (sources are cached in .cache/env-src, git-ignored)
//
// Two kinds of sources, all CC0:
//   - Poly Haven models (https://polyhaven.com, CC0): downloaded as 1k glTF, the diffuse texture is BAKED INTO VERTEX COLOURS
//     (no texture download at run time), colours pushed a little toward a bright painted look, simplified with meshoptimizer.
//   - Stylised models generated here (CC0, this project): rounded, soft, with baked ambient occlusion and top light in the
//     vertex colours, so they sit next to the Pixar-like characters. Poly Haven has no stylised trees, cars or buildings
//     (its trees are 0.3 to 7 million triangles), and kenney.nl is not reachable from the build machine.
//
// Every mesh is a "template" for src/world/kota/CityMesher.ts: POSITION, NORMAL, COLOR_0 only, origin at the base centre, metres
// at scale 1. The city merges them into its chunk meshes (no extra draw calls). COLOR_0 multiplies the part colour: models with
// `tint: true` are grey-scale light (the city picks the hue), the others carry their own colours (the city passes white).
// Output: one Meshopt-compressed GLB + public/env/manifest.json (triangles, bytes, sources, licences).
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { reorder } from '@gltf-transform/functions';
import sharp from 'sharp';
import * as THREE from 'three';
import { mkdirSync, existsSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = process.env.ENV_CACHE || path.join(root, '.cache', 'env-src');
const OUT = path.join(root, 'public', 'env');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

// ---- small math helpers -------------------------------------------------------------------------------------------------------

/** Deterministic value noise in 3D (smooth, [-1, 1]). */
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  let s = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    s += hash3(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
  }
  return s * 2 - 1;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** Mesh under construction: plain arrays, colours 0..1 (sRGB, as authored). */
class M {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  get verts() { return this.p.length / 3; }
  /** Append a three geometry with a colour function (pos, normal) -> [r, g, b] and an optional normal override. */
  geo(g, color, normalFn) {
    g = g.index ? g : g;
    const pos = g.getAttribute('position');
    g.computeVertexNormals();
    const nrm = g.getAttribute('normal');
    const base = this.verts;
    for (let k = 0; k < pos.count; k++) {
      const P = [pos.getX(k), pos.getY(k), pos.getZ(k)];
      let N = [nrm.getX(k), nrm.getY(k), nrm.getZ(k)];
      if (normalFn) N = normalFn(P, N);
      const l = Math.hypot(N[0], N[1], N[2]) || 1;
      this.p.push(...P);
      this.n.push(N[0] / l, N[1] / l, N[2] / l);
      const C = typeof color === 'function' ? color(P, N) : color;
      this.c.push(...C);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) this.i.push(g.index.getX(k) + base);
    else for (let k = 0; k < pos.count; k++) this.i.push(k + base);
    g.dispose();
    return this;
  }
  get tris() { return this.i.length / 3; }
}

/** Merge duplicate positions of an indexed-or-not geometry (so displacement keeps it closed and normals are smooth). */
function welded(g) {
  const pos = g.getAttribute('position');
  const map = new Map();
  const p = [];
  const idx = [];
  for (let k = 0; k < pos.count; k++) {
    const key = `${pos.getX(k).toFixed(4)},${pos.getY(k).toFixed(4)},${pos.getZ(k).toFixed(4)}`;
    let v = map.get(key);
    if (v === undefined) { v = p.length / 3; map.set(key, v); p.push(pos.getX(k), pos.getY(k), pos.getZ(k)); }
    idx.push(v);
  }
  const src = g.index ? Array.from(g.index.array, (i) => idx[i]) : idx;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  out.setIndex(src);
  g.dispose();
  return out;
}

function displace(g, fn) {
  const pos = g.getAttribute('position');
  for (let k = 0; k < pos.count; k++) {
    const [x, y, z] = fn(pos.getX(k), pos.getY(k), pos.getZ(k));
    pos.setXYZ(k, x, y, z);
  }
  return g;
}

/** Rounded box (segments 2: one bevel ring, 48 triangles) with smooth normals, centred, w x h x d, corner radius r. */
function rbox(w, h, d, r) {
  const g = welded(new THREE.BoxGeometry(w, h, d, 2, 2, 2));
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const nrm = [];
  displace(g, (x, y, z) => {
    const ix = Math.max(-hw, Math.min(hw, x)), iy = Math.max(-hh, Math.min(hh, y)), iz = Math.max(-hd, Math.min(hd, z));
    let nx = x - ix, ny = y - iy, nz = z - iz;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    nrm.push(nx, ny, nz);
    return [ix + nx * r, iy + ny * r, iz + nz * r];
  });
  g.userData.nrm = nrm;
  return g;
}

/** Append a geometry whose normals were stored in userData.nrm (rounded boxes). */
function addR(m, g, color, at = [0, 0, 0]) {
  const nrm = g.userData.nrm;
  g.translate(at[0], at[1], at[2]);
  let k = 0;
  m.geo(g, color, () => { const N = [nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]]; k++; return N; });
}

// ---- Stylised models ------------------------------------------------------------------------------------------------------------

/**
 * Round tree canopy (tint): three lumpy blobs around (0, 0, 0), main blob radius 1. Normals point away from the canopy centre
 * (one soft cloud, the "Pixar foliage" look), colours = baked light: warm and bright on top, cool and dark below and between lumps.
 */
function canopy(lumps, detail, seed) {
  const m = new M();
  const centre = [0, 0.05, 0];
  for (const [cx, cy, cz, r] of lumps) {
    let g = welded(new THREE.IcosahedronGeometry(1, detail));
    g = displace(g, (x, y, z) => {
      const k = 1 + 0.13 * noise3(x * 1.7 + seed, y * 1.7 + cx * 3, z * 1.7 + cz * 3) + 0.05 * noise3(x * 4 + seed, y * 4, z * 4);
      return [cx + x * r * k, cy + y * r * k * 0.92, cz + z * r * k];
    });
    m.geo(
      g,
      (P) => {
        const t = clamp01((P[1] + 0.95) / 1.85);
        const out = Math.hypot(P[0] - centre[0], (P[1] - centre[1]) * 0.8, P[2] - centre[2]);
        const ao = clamp01(0.84 + 0.16 * (out / 1.15)); // dents between the lumps get darker
        const L = lerp(0.8, 1.0, Math.pow(t, 0.8)) * ao; // sRGB: 0.8 is about 0.6 linear
        return [Math.min(1, L * lerp(0.9, 1.0, t)), Math.min(1, L * lerp(0.94, 1.0, t)), Math.min(1, L * lerp(1.0, 0.96, t))];
      },
      (P, N) => {
        const o = [P[0] - centre[0], (P[1] - centre[1]) * 0.85, P[2] - centre[2]];
        const l = Math.hypot(...o) || 1;
        return [o[0] / l * 0.7 + N[0] * 0.3, o[1] / l * 0.7 + N[1] * 0.3, o[2] / l * 0.7 + N[2] * 0.3];
      },
    );
  }
  return m;
}

/** Tapered trunk with a flared base and two branch stubs into the crown (own colours). Base at y = 0, height 1, radius 1 at the base. */
function trunk() {
  const m = new M();
  const bark = (P) => { const t = clamp01(P[1]); const k = lerp(0.75, 1, t); const c = hex(0xb07e55); return [c[0] * k, c[1] * k, c[2] * k]; };
  const pts = [new THREE.Vector2(1.0, 0), new THREE.Vector2(0.6, 0.14), new THREE.Vector2(0.42, 1.0)];
  m.geo(welded(new THREE.LatheGeometry(pts, 7)), bark);
  return m;
}

/** Pine (own colours): short trunk and three scalloped cone tiers. Base at y = 0, metres at scale 1 (about 5.2 m tall). */
function pine() {
  const m = new M();
  m.geo(new THREE.CylinderGeometry(0.13, 0.2, 1.3, 5, 1, true).translate(0, 0.65, 0), hex(0xa87650));
  const tiers = [[1.0, 1.45, 2.3], [2.2, 1.12, 2.0], [3.3, 0.8, 1.9]];
  const dark = hex(0x2e7a49), light = hex(0x6cc06a);
  tiers.forEach(([y0, r, h], ti) => {
    const n = 9;
    const p = [0, y0 + h, 0];
    const rim = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * (k % 2 ? 0.86 : 1.0);
      rim.push([Math.cos(a) * rr, y0 + (k % 2 ? 0.1 : -0.06), Math.sin(a) * rr]);
    }
    const pos = [];
    for (let k = 0; k < n; k++) pos.push(...p, ...rim[(k + 1) % n], ...rim[k]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const g2 = welded(g);
    m.geo(g2, (P, N) => {
      const t = clamp01((P[1] - y0) / h);
      const up = N[1] < 0 ? 0.55 : 1;
      const k = lerp(0.62, 1.0, t) * up * (0.92 + ti * 0.05);
      return [lerp(dark[0], light[0], t * 0.6) * k + 0.04, lerp(dark[1], light[1], t * 0.6) * k, lerp(dark[2], light[2], t * 0.6) * k];
    }, (P, N) => {
      // Soft cone normals: lean outward-up.
      const l = Math.hypot(P[0], P[2]) || 1;
      return N[1] < 0 ? N : [P[0] / l * 0.75, 0.66, P[2] / l * 0.75];
    });
  });
  return m;
}

/** Street lamp (own colours): rounded plinth, tapered pole, curved arm, lantern hood. Bulb (glow layer) at (0.4, 3.38, 0). */
function lamp() {
  const m = new M();
  const teal = hex(0x3d7f8a), tealD = hex(0x2c5f69), gold = hex(0xd8b25a);
  m.geo(new THREE.CylinderGeometry(0.15, 0.2, 0.36, 6).translate(0, 0.18, 0), (P) => (P[1] < 0.2 ? tealD : teal));
  m.geo(new THREE.CylinderGeometry(0.055, 0.085, 3.0, 6, 1, true).translate(0, 1.84, 0), (P) => (P[1] < 0.6 ? tealD : teal));
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 3.3, 0), new THREE.Vector3(0.05, 3.62, 0), new THREE.Vector3(0.42, 3.6, 0));
  m.geo(new THREE.TubeGeometry(curve, 3, 0.045, 4, false), teal);
  m.geo(new THREE.ConeGeometry(0.28, 0.22, 8, 1, true).translate(0.42, 3.55, 0), gold);
  m.geo(new THREE.SphereGeometry(0.06, 4, 2).translate(0.42, 3.69, 0), gold);
  return m;
}

/** Car (own colours; white body parts take the instance tint): rounded body and cabin, glass, round wheels, lamps. +z = front. */
function car() {
  const m = new M();
  const W = [1, 1, 1], glass = hex(0x2e3d55), dark = hex(0x2a2a33), hub = hex(0xc9ccd6);
  const shade = (base) => (P) => { const k = lerp(0.72, 1, clamp01((P[1] - 0.15) / 0.9)); return [base[0] * k, base[1] * k, base[2] * k]; };
  addR(m, rbox(1.62, 0.62, 3.5, 0.26), shade(W), [0, 0.6, 0]);
  // Cabin in body colour with a glass band slightly proud of it (windows all round, body-colour roof and sills).
  addR(m, rbox(1.36, 0.62, 1.9, 0.27), shade(W), [0, 1.1, -0.22]);
  addR(m, rbox(1.4, 0.42, 1.78, 0.19), glass, [0, 1.12, -0.22]);
  for (const [x, z] of [[0.74, 1.08], [-0.74, 1.08], [0.74, -1.08], [-0.74, -1.08]]) {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
    g.rotateZ(Math.PI / 2);
    g.translate(x, 0.34, z);
    m.geo(g, (P, N) => (Math.abs(N[0]) > 0.9 && Math.abs(P[0]) > 0.8 ? hub : dark));
  }
  for (const s of [-1, 1]) {
    m.geo(new THREE.SphereGeometry(0.12, 6, 3).scale(1, 0.8, 0.5).translate(s * 0.52, 0.66, 1.74), hex(0xfff2b0));
    m.geo(new THREE.SphereGeometry(0.11, 6, 3).scale(1, 0.7, 0.5).translate(s * 0.55, 0.66, -1.74), hex(0xe0503c));
  }
  return m;
}

// ---- Poly Haven sources --------------------------------------------------------------------------------------------------------

async function fetchOk(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      console.warn(`  ${url}: HTTP ${r.status}`);
    } catch (e) {
      console.warn(`  ${url}: ${e.message}`);
    }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 30000));
  }
  throw new Error(`download failed: ${url}`);
}

/** Download (or reuse) a Poly Haven 1k glTF with its diffuse texture. Returns the .gltf path. */
async function polyhaven(id) {
  const dir = path.join(CACHE, id);
  const meta = path.join(dir, 'files.json');
  if (!existsSync(meta)) {
    mkdirSync(path.join(dir, 'textures'), { recursive: true });
    writeFileSync(meta, await fetchOk(`https://api.polyhaven.com/files/${id}`));
  }
  const g = JSON.parse(readFileSync(meta, 'utf8')).gltf['1k'].gltf;
  const file = path.join(dir, g.url.split('/').pop());
  if (!existsSync(file)) writeFileSync(file, await fetchOk(g.url));
  for (const [rel, v] of Object.entries(g.include)) {
    if (/_(nor|arm|rough|spec|metal|ao|disp)/.test(rel) && !/_diff/.test(rel)) continue;
    const f = path.join(dir, rel);
    mkdirSync(path.dirname(f), { recursive: true });
    if (!existsSync(f)) writeFileSync(f, await fetchOk(v.url));
  }
  return file;
}

/** Load a Poly Haven glTF into an M: world transforms applied, diffuse texture sampled into vertex colours, simplified. */
async function fromPolyhaven(id, { maxTris, height, sat = 1.25, bright = 1.1, yaw = 0 }) {
  const file = await polyhaven(id);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  // Keep only the diffuse map: drop normal / ARM textures (not downloaded) from the materials, then read a sanitised copy.
  const json = JSON.parse(readFileSync(file, 'utf8'));
  for (const mt of json.materials ?? []) {
    delete mt.normalTexture;
    delete mt.occlusionTexture;
    if (mt.pbrMetallicRoughness) delete mt.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  const used = new Set((json.materials ?? []).map((mt) => mt.pbrMetallicRoughness?.baseColorTexture?.index).filter((i) => i !== undefined));
  for (const [ti, t] of (json.textures ?? []).entries()) if (!used.has(ti)) json.images[t.source] = { uri: json.images.find((im) => /_diff/.test(im.uri))?.uri ?? json.images[t.source].uri };
  const clean = file.replace(/\.gltf$/, '.clean.gltf');
  writeFileSync(clean, JSON.stringify(json));
  const doc = await io.read(clean);
  const texCache = new Map();
  const m = new M();
  const tmp = new THREE.Vector3();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const mat4 = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const nmat = new THREE.Matrix3().getNormalMatrix(mat4);
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION');
      const N = prim.getAttribute('NORMAL');
      const UV = prim.getAttribute('TEXCOORD_0');
      const mat = prim.getMaterial();
      const factor = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
      const tex = mat?.getBaseColorTexture();
      let img = null;
      if (tex && tex.getImage()) {
        if (!texCache.has(tex)) {
          const { data, info } = await sharp(Buffer.from(tex.getImage())).resize(256, 256, { fit: 'fill' }).blur(1.2).raw().toBuffer({ resolveWithObject: true });
          texCache.set(tex, { data, w: info.width, h: info.height, ch: info.channels });
        }
        img = texCache.get(tex);
      }
      const base = m.verts;
      for (let k = 0; k < P.getCount(); k++) {
        const p = P.getElement(k, []);
        tmp.set(p[0], p[1], p[2]).applyMatrix4(mat4);
        m.p.push(tmp.x, tmp.y, tmp.z);
        const n = N ? N.getElement(k, []) : [0, 1, 0];
        tmp.set(n[0], n[1], n[2]).applyMatrix3(nmat).normalize();
        m.n.push(tmp.x, tmp.y, tmp.z);
        let c = [factor[0], factor[1], factor[2]];
        if (img && UV) {
          const uv = UV.getElement(k, []);
          const x = Math.min(img.w - 1, Math.max(0, Math.floor((((uv[0] % 1) + 1) % 1) * img.w)));
          const y = Math.min(img.h - 1, Math.max(0, Math.floor((((uv[1] % 1) + 1) % 1) * img.h)));
          const o = (y * img.w + x) * img.ch;
          c = [(img.data[o] / 255) * c[0], (img.data[o + 1] / 255) * c[1], (img.data[o + 2] / 255) * c[2]];
        }
        // Painted look: more saturation, a little brighter.
        const g = (c[0] + c[1] + c[2]) / 3;
        c = c.map((v) => Math.min(1, (g + (v - g) * sat) * bright));
        m.c.push(...c);
      }
      const idx = prim.getIndices();
      if (idx) for (let k = 0; k < idx.getCount(); k++) m.i.push(idx.getScalar(k) + base);
      else for (let k = 0; k < P.getCount(); k++) m.i.push(base + k);
    }
  }
  // Base centre at the origin, scaled to `height`, turned by `yaw`.
  const box = new THREE.Box3();
  for (let k = 0; k < m.verts; k++) box.expandByPoint(tmp.fromArray(m.p, k * 3));
  const s = height / (box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (let k = 0; k < m.verts; k++) {
    const x = (m.p[k * 3] - cx) * s, y = (m.p[k * 3 + 1] - box.min.y) * s, z = (m.p[k * 3 + 2] - cz) * s;
    m.p[k * 3] = x * cy + z * sy; m.p[k * 3 + 1] = y; m.p[k * 3 + 2] = -x * sy + z * cy;
    const nx = m.n[k * 3], nz = m.n[k * 3 + 2];
    m.n[k * 3] = nx * cy + nz * sy; m.n[k * 3 + 2] = -nx * sy + nz * cy;
  }
  return simplifyM(m, maxTris);
}

async function simplifyM(m, maxTris) {
  if (m.tris <= maxTris) return m;
  await MeshoptSimplifier.ready;
  const pos = Float32Array.from(m.p);
  const attrs = new Float32Array(m.verts * 3);
  attrs.set(m.c);
  const [idx] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(m.i), pos, 3, attrs, 3, [0.5, 0.5, 0.5], null, maxTris * 3, 0.08, []);
  const out = new M();
  const remap = new Map();
  for (const v of idx) {
    let r = remap.get(v);
    if (r === undefined) {
      r = out.verts;
      remap.set(v, r);
      out.p.push(m.p[v * 3], m.p[v * 3 + 1], m.p[v * 3 + 2]);
      out.n.push(m.n[v * 3], m.n[v * 3 + 1], m.n[v * 3 + 2]);
      out.c.push(m.c[v * 3], m.c[v * 3 + 1], m.c[v * 3 + 2]);
    }
    out.i.push(r);
  }
  return out;
}

// ---- Assets ---------------------------------------------------------------------------------------------------------------------

const PH = (id, name) => ({ source: `Poly Haven: ${name} (https://polyhaven.com/a/${id})`, license: 'CC0 1.0' });
const OWN = { source: 'Superglen (generated by scripts/build-env-assets.mjs)', license: 'CC0 1.0' };

const assets = [
  { name: 'canopy', tint: true, ...OWN, make: () => { const a = canopy([[-0.1, 0.08, 0.04, 0.98]], 2, 1.3); const b = canopy([[0.58, -0.22, -0.12, 0.72], [-0.5, -0.18, 0.36, 0.66]], 1, 1.7); const o = a.verts; a.p.push(...b.p); a.n.push(...b.n); a.c.push(...b.c); a.i.push(...b.i.map((i) => i + o)); return a; } },
  { name: 'trunk', ...OWN, make: trunk },
  { name: 'pine', ...OWN, make: pine },
  { name: 'lamp', ...OWN, make: lamp },
  { name: 'car', ...OWN, make: car },
  { name: 'bench', ...PH('painted_wooden_bench', 'Painted Wooden Bench by Kirill Sannikov'), make: () => fromPolyhaven('painted_wooden_bench', { maxTris: 250, height: 0.82, sat: 1.15, bright: 1.15 }) },
];

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('env');
const manifest = { generated: new Date().toISOString().slice(0, 10), file: 'env.glb', models: {} };
for (const a of assets) {
  const m = await a.make();
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.p)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.n)).setBuffer(buffer))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setNormalized(true).setArray(Uint8Array.from(m.c, (v) => Math.round(Math.pow(clamp01(v), 2.2) * 255))).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(m.i)).setBuffer(buffer));
  const mesh = doc.createMesh(a.name).addPrimitive(prim);
  scene.addChild(doc.createNode(a.name).setMesh(mesh));
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let k = 0; k < m.verts; k++) box.expandByPoint(v.fromArray(m.p, k * 3));
  manifest.models[a.name] = {
    tris: m.tris,
    verts: m.verts,
    tint: !!a.tint,
    size: [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((x) => +x.toFixed(3)),
    source: a.source,
    license: a.license,
  };
  console.log(`  ${a.name.padEnd(9)} ${String(m.tris).padStart(4)} tris  ${a.source}`);
}

await MeshoptEncoder.ready;
await doc.transform(reorder({ encoder: MeshoptEncoder }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const outFile = path.join(OUT, 'env.glb');
await io.write(outFile, doc);
manifest.bytes = statSync(outFile).size;
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`public/env/env.glb: ${manifest.bytes} bytes`);
