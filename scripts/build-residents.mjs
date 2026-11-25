/**
 * Build public/models/residents/residents.glb from the owner-supplied Quaternius "Animated Men Characters" and "Animated Women
 * Characters" packs (Feb 2019, CC0 1.0; verify the License.txt of each). FBX is read with three's FBXLoader (no external converter).
 *
 *   RES_MEN=<folder with the men FBX files> RES_WOMEN=<folder with the women FBX files> node scripts/build-residents.mjs
 *
 * The sources are NOT committed; only the optimised result is. One shared skeleton per gender (checked: all variants of a gender have
 * the same inverse bind matrices) and the clips `idle`, `walk`, `run`, `wave` (the packs' Idle / Walk / Run / Clapping) resampled to a
 * fixed frame count, once per gender. Each variant is a skinned mesh simplified to ~TRIS triangles with baked kid-friendly vertex
 * colours and a per-vertex `_ZONE` (0 fixed colour, 1 skin, 2 top / dress, 3 trousers, 4 hair) that the runtime tints per instance
 * (src/world/kota/Crowd.ts bakes the clips into a bone matrix texture and skins on the GPU, one draw call per variant).
 * Each head is simplified separately (HEAD_TRIS) and a small cartoon face (eyes, brows, nose, mouth, blush; 3 styles per gender, ~130 tris)
 * is added in addFace(), skinned 100% to the Head bone and laid on the head surface.
 * Models are normalised: facing +z, feet on y = 0, HEIGHT m tall. The clips' ground speed (m/s of the stance foot) is stored in
 * `extras.clipSpeed` of the scene so the runtime can sync the cycle to the walking speed (no foot sliding).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const MEN = process.env.RES_MEN;
const WOMEN = process.env.RES_WOMEN;
if (!MEN || !WOMEN) throw new Error('set RES_MEN and RES_WOMEN to the folders with the FBX files of the two packs');
const OUT = process.env.RES_OUT ?? 'public/models/residents/residents.glb';
const TRIS = Number(process.env.RES_TRIS ?? 800);
const HEIGHT = 1.6;
const HEAD_TRIS = Number(process.env.RES_HEAD_TRIS ?? 420);
const HEAD_CUT = 0.0; // metres below the Head bone origin where the head part starts
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const VARIANTS = [
  { name: 'male_casual', gender: 'm', file: 'Smooth_Male_Casual.fbx', dir: MEN },
  { name: 'male_shirt', gender: 'm', file: 'Smooth_Male_Shirt.fbx', dir: MEN },
  { name: 'male_long', gender: 'm', file: 'Smooth_Male_LongSleeve.fbx', dir: MEN },
  { name: 'male_suit', gender: 'm', file: 'Smooth_Male_Suit.fbx', dir: MEN },
  { name: 'female_casual', gender: 'f', file: 'Smooth_Female_Casual.fbx', dir: WOMEN },
  { name: 'female_dress', gender: 'f', file: 'Smooth_Female_Dress.fbx', dir: WOMEN },
  { name: 'female_tank', gender: 'f', file: 'Smooth_Female_TankTop.fbx', dir: WOMEN },
  { name: 'female_alt', gender: 'f', file: 'Smooth_Female_Alternative.fbx', dir: WOMEN },
];
/** name -> [zone, linear-ish base colour hex (sRGB)] ; zone 0 keeps the colour, others are tinted (colour = white). */
const MAT = (n) => {
  if (/^Skin/.test(n)) return [1, 0xffffff];
  if (/^Eyes?/.test(n)) return [0, 0x2b2430];
  if (/Hair/.test(n)) return [4, 0xffffff];
  if (/^(Shirt|Dress|Top|Jacket|Suit|Vest|Tank|Sleeve)/i.test(n)) return [2, 0xffffff];
  if (/^(Pants|Skirt|Trouser)/i.test(n)) return [3, 0xffffff];
  if (/^Socks?/.test(n)) return [0, 0xf3f0ea];
  if (/^Shoes?/.test(n)) return [0, 0xf1ece2];
  if (/^Tie/i.test(n)) return [0, 0xe8453c];
  if (/^(Shirt|Under|Collar)/i.test(n)) return [0, 0xffffff];
  if (!MAT.seen.has(n)) { MAT.seen.add(n); console.warn('  unknown material', n, '-> top zone'); }
  return [2, 0xffffff];
};
MAT.seen = new Set();
const srgb = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => srgb(v / 255));

const CLIPS = [
  { name: 'idle', re: /Idle$/, fps: 12 },
  { name: 'walk', re: /Walk$/, fps: 30 },
  { name: 'run', re: /Run$/, fps: 30 },
  { name: 'wave', re: /Clapping$/, fps: 30 },
];

function loadFbx(file) {
  const buf = fs.readFileSync(file);
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  } finally {
    console.warn = origWarn;
  }
}

const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion;

/** Everything read from one FBX in the final space (metres, +z forward, feet at y = 0). */
function extract(v) {
  const root = loadFbx(path.join(v.dir, v.file));
  let sm;
  root.traverse((o) => { if (o.isSkinnedMesh) sm = o; });
  root.updateMatrixWorld(true);
  const sk = sm.skeleton;
  const g = sm.geometry;
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  // World-space bind positions (cm).
  const world = [];
  const p = new V3();
  for (let i = 0; i < pos.count; i++) world.push(p.fromBufferAttribute(pos, i).applyMatrix4(sm.matrixWorld).clone());
  let minY = Infinity, maxY = -Infinity;
  for (const q of world) { minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
  const k = HEIGHT / (maxY - minY);
  // Facing: eye vertices vs the head bone.
  const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
  const head = sk.bones.findIndex((b) => b.name === 'Head');
  const headW = new V3().setFromMatrixPosition(new M4().copy(sk.boneInverses[head]).invert());
  let ez = 0, en = 0;
  for (const gr of g.groups) {
    if (!/^Eyes?/.test(mats[gr.materialIndex].name)) continue;
    for (let i = gr.start; i < gr.start + gr.count; i++) { ez += world[i].z - headW.z; en++; }
  }
  const flip = en > 0 && ez < 0;
  // Final = T(0, -minY*k, 0) * Ry(flip? pi: 0) * S(k)  (applied to cm world coordinates).
  const fix = new M4().makeTranslation(0, -minY * k, 0).multiply(new M4().makeRotationY(flip ? Math.PI : 0)).multiply(new M4().makeScale(k, k, k));
  const verts = world.map((q) => q.clone().applyMatrix4(fix));
  const mat = new Uint16Array(pos.count);
  for (const gr of g.groups) for (let i = gr.start; i < gr.start + gr.count; i++) mat[i] = gr.materialIndex;
  const bones = sk.bones;
  const bindWorld = bones.map((b, i) => new M4().copy(sk.boneInverses[i]).invert().premultiply(fix));
  const parent = bones.map((b) => { let a = b.parent; while (a && !bones.includes(a)) a = a.parent; return a ? bones.indexOf(a) : -1; });
  const headIdx = head;
  return { headIdx, root, sm, sk, g, si, sw, verts, mat, mats, bones, bindWorld, parent, fix, k, flip, height: maxY - minY };
}

/** Sample every clip: world matrices (final space) per frame per bone. */
function sampleClips(ex) {
  const out = {};
  const { root, bones, fix } = ex;
  for (const c of CLIPS) {
    const clip = root.animations.find((a) => c.re.test(a.name));
    if (!clip) throw new Error('missing clip ' + c.name);
    const n = Math.max(2, Math.round(clip.duration * c.fps));
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    const frames = [];
    for (let f = 0; f <= n; f++) {
      action.time = (f / n) * clip.duration;
      action.paused = false;
      mixer.update(0);
      root.updateMatrixWorld(true);
      frames.push(bones.map((b) => new M4().copy(b.matrixWorld).premultiply(fix)));
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    out[c.name] = { n, duration: clip.duration, frames };
  }
  return out;
}

const tmpP = new V3(), tmpQ = new Q(), tmpS = new V3();
function local(worldM, parentWorldM) {
  const l = parentWorldM ? new M4().copy(parentWorldM).invert().multiply(worldM) : worldM.clone();
  l.decompose(tmpP, tmpQ, tmpS);
  return { t: tmpP.clone(), q: tmpQ.clone(), s: tmpS.clone() };
}

/** Ground speed of the stance foot (m/s): median over the cycle. */
function footSpeed(ex, clip) {
  const idx = ['FootL', 'FootR'].map((n) => ex.bones.findIndex((b) => b.name === n));
  const sp = [];
  const dt = clip.duration / clip.n;
  for (let f = 0; f < clip.n; f++) {
    for (const i of idx) {
      const a = new V3().setFromMatrixPosition(clip.frames[f][i]);
      const b = new V3().setFromMatrixPosition(clip.frames[f + 1][i]);
      // Stance = foot near the ground.
      if (a.y < 0.12 && b.y < 0.12) sp.push(Math.hypot(b.x - a.x, b.z - a.z) / dt);
    }
  }
  sp.sort((x, y) => x - y);
  return sp.length ? sp[Math.floor(sp.length / 2)] : 0;
}

// ---- Mesh: weld, simplify, smooth normals -----------------------------------------------------------------------------------

function buildMesh(ex) {
  const { verts, mat, mats, si, sw } = ex;
  // The foot bones are IK targets outside the leg chain: shoes follow the shin instead, so the runtime can reshape the legs.
  const jmap = ex.bones.map((b, i) => {
    const m = /^Foot([LR])$/.exec(b.name);
    return m ? ex.bones.findIndex((x) => x.name === `LowerLeg${m[1]}`) : i;
  });
  const key = new Map();
  const P = [], C = [], Z = [], J = [], W = [];
  const remap = new Uint32Array(verts.length);
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    const kk = `${Math.round(v.x * 4000)},${Math.round(v.y * 4000)},${Math.round(v.z * 4000)}|${mat[i]}`;
    let id = key.get(kk);
    if (id === undefined) {
      id = P.length / 3;
      key.set(kk, id);
      P.push(v.x, v.y, v.z);
      const [zone, hex] = MAT(mats[mat[i]].name);
      C.push(...lin(hex));
      Z.push(zone);
      const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      const s = w[0] + w[1] + w[2] + w[3] || 1;
      J.push(jmap[si.getX(i)], jmap[si.getY(i)], jmap[si.getZ(i)], jmap[si.getW(i)]);
      W.push(w[0] / s, w[1] / s, w[2] / s, w[3] / s);
    }
    remap[i] = id;
  }
  // The source's own eyebrows / eyelashes (Hair material around the eyes) are dropped: the drawn face has its own.
  const eyeV = [];
  for (let i = 0; i < verts.length; i++) {
    if (!/^Eyes?/.test(mats[mat[i]].name)) continue;
    let hw = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === ex.headIdx) hw += sw.getComponent(i, k);
    if (hw > 0.9) eyeV.push(verts[i]);
  }
  const eyeLo = Math.min(...eyeV.map((q) => q.y)), eyeHi = Math.max(...eyeV.map((q) => q.y));
  const browJunk = (i) => /Hair/.test(mats[mat[i]].name) && verts[i].y > eyeLo - 0.01 && verts[i].y < eyeHi + 0.02 && verts[i].z > 0.04 && Math.abs(verts[i].x) < 0.075;
  const idx = [];
  for (let i = 0; i < verts.length; i += 3) {
    if (browJunk(i) && browJunk(i + 1) && browJunk(i + 2)) continue;
    const a = remap[i], b = remap[i + 1], c = remap[i + 2];
    if (/^Eyes?/.test(mats[mat[i]].name)) continue; // replaced by the drawn face (addFace)
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const n = P.length / 3;
  const attr = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) { attr[i * 5] = C[i * 3]; attr[i * 5 + 1] = C[i * 3 + 1]; attr[i * 5 + 2] = C[i * 3 + 2]; attr[i * 5 + 3] = Z[i] * 0.25; attr[i * 5 + 4] = W[i * 4]; }
  // The head is simplified separately (HEAD_TRIS) so the face has a surface to sit on; seam vertices are locked so it stays watertight.
  const headY = new V3().setFromMatrixPosition(ex.bindWorld[ex.bones.findIndex((b) => b.name === 'Head')]).y - HEAD_CUT;
  const isH = new Uint8Array(n);
  for (let i = 0; i < n; i++) isH[i] = P[i * 3 + 1] >= headY ? 1 : 0;
  const hIdx = [], bIdx = [];
  for (let t = 0; t < idx.length; t += 3) {
    const h = isH[idx[t]] && isH[idx[t + 1]] && isH[idx[t + 2]];
    (h ? hIdx : bIdx).push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const inH = new Uint8Array(n), inB = new Uint8Array(n);
  for (const i of hIdx) inH[i] = 1;
  for (const i of bIdx) inB[i] = 1;
  const lock = new Uint8Array(n);
  for (let i = 0; i < n; i++) lock[i] = inH[i] && inB[i] ? 1 : 0;
  const pos = Float32Array.from(P);
  const simp = (list, tris) => {
    const target = tris * 3;
    const all = Uint32Array.from(list);
    let r = all;
    for (const e of [0.01, 0.02, 0.04, 0.08, 0.15]) {
      r = MeshoptSimplifier.simplifyWithAttributes(all, pos, 3, attr, 5, [1, 1, 1, 3, 0.5], lock, target, e, [])[0];
      if (r.length <= target * 1.1) break;
    }
    return r;
  };
  const bodyPart = simp(bIdx, TRIS);
  const out = Uint32Array.from([...bodyPart, ...simp(hIdx, HEAD_TRIS)]);
  // Compact.
  const map = new Map();
  const m = { P: [], C: [], Z: [], J: [], W: [], I: [] };
  for (const i of out) {
    let v = map.get(i);
    if (v === undefined) {
      v = m.P.length / 3;
      map.set(i, v);
      m.P.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      m.C.push(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]);
      m.Z.push(Z[i]);
      m.J.push(J[i * 4], J[i * 4 + 1], J[i * 4 + 2], J[i * 4 + 3]);
      m.W.push(W[i * 4], W[i * 4 + 1], W[i * 4 + 2], W[i * 4 + 3]);
    }
    m.I.push(v);
  }
  // Smooth normals: average face normals (area weighted) over vertices at the same position (also across colour borders).
  const acc = new Map();
  const pk = (i) => `${Math.round(m.P[i * 3] * 2000)},${Math.round(m.P[i * 3 + 1] * 2000)},${Math.round(m.P[i * 3 + 2] * 2000)}`;
  for (let t = 0; t < m.I.length; t += 3) {
    const [a, b, c] = [m.I[t], m.I[t + 1], m.I[t + 2]];
    const A = new V3(m.P[a * 3], m.P[a * 3 + 1], m.P[a * 3 + 2]), B = new V3(m.P[b * 3], m.P[b * 3 + 1], m.P[b * 3 + 2]), Cc = new V3(m.P[c * 3], m.P[c * 3 + 1], m.P[c * 3 + 2]);
    const fn = B.clone().sub(A).cross(Cc.clone().sub(A));
    for (const i of [a, b, c]) {
      const k = pk(i);
      const cur = acc.get(k) ?? new V3();
      cur.add(fn);
      acc.set(k, cur);
    }
  }
  m.headFrom = bodyPart.length; // indices from here on are the head part
  m.N = [];
  for (let i = 0; i < m.P.length / 3; i++) {
    const nrm = (acc.get(pk(i)) ?? new V3(0, 1, 0)).clone().normalize();
    m.N.push(nrm.x, nrm.y, nrm.z);
  }
  return m;
}


// ---- Face ---------------------------------------------------------------------------------------------------------------------
// Cartoon face skinned 100% to the Head bone, laid on the front of the (simplified) head surface: every vertex is projected onto
// the rendered head triangles with a ray along -z and lifted a little along the surface normal. Because the face is rigidly bound
// to Head it follows every clip and scales with the baked head scale (Crowd.ts Cartoon.head). Layers are stacked a few millimetres
// apart (no coplanar overlap, so no z-fighting). Zones: 0 fixed colour, 1 skin (blush / nose follow the skin tint), 4 hair tint (brows).
const FACE_STYLES = [
  { eye: [0.3, 0.36], iris: 0.74, irisCol: 0x6a3f24, mouth: 'arc', smile: 0.9, width: 0.3, brow: 0.9, blush: true },
  { eye: [0.34, 0.4], iris: 0.8, irisCol: 0x2f2a33, mouth: 'open', smile: 0.5, width: 0.24, brow: 1.0, blush: true },
  { eye: [0.28, 0.33], iris: 0.72, irisCol: 0x3f6f5a, mouth: 'arc', smile: 1.1, width: 0.33, brow: 0.7, blush: false, lashes: true },
];

function addFace(ex, m, style, female) {
  const S = FACE_STYLES[style % FACE_STYLES.length];
  const head = ex.bones.findIndex((b) => b.name === 'Head');
  // Rendered head surface: triangles of the simplified mesh bound mostly to Head (skin first, any zone as fallback).
  const tris = { skin: [], any: [] };
  const vtx = (i) => new V3(m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]);
  const nrm = (i) => new V3(m.N[i * 3], m.N[i * 3 + 1], m.N[i * 3 + 2]);
  for (let t = m.headFrom; t < m.I.length; t += 3) {
    const [a, b, c] = [m.I[t], m.I[t + 1], m.I[t + 2]];
    const e = { a, b, c, A: vtx(a), B: vtx(b), C: vtx(c) };
    tris.any.push(e);
    if (m.Z[a] === 1 && m.Z[b] === 1 && m.Z[c] === 1) tris.skin.push(e);
  }
  const ray = new THREE.Ray(new V3(), new V3(0, 0, -1));
  const hit = new V3(), bc = new V3();
  const surface = (x, y) => {
    for (const list of [tris.skin, tris.any]) {
      let best = null, bz = -Infinity;
      for (const e of list) {
        ray.origin.set(x, y, 3);
        if (ray.intersectTriangle(e.A, e.B, e.C, false, hit) && hit.z > bz) {
          bz = hit.z;
          THREE.Triangle.getBarycoord(hit, e.A, e.B, e.C, bc);
          best = { p: hit.clone(), n: nrm(e.a).multiplyScalar(bc.x).addScaledVector(nrm(e.b), bc.y).addScaledVector(nrm(e.c), bc.z).normalize() };
        }
      }
      if (best) return best;
    }
    throw new Error(`${ex.v.name}: no head surface at ${x.toFixed(3)}, ${y.toFixed(3)}`);
  };
  // Layout from the source eyes (centroid per side) and the chin.
  const eyeSide = [new V3(), new V3()], en = [0, 0];
  for (let i = 0; i < ex.verts.length; i++) {
    if (!/^Eyes?/.test(ex.mats[ex.mat[i]].name)) continue;
    let hw = 0;
    for (let k = 0; k < 4; k++) if (ex.si.getComponent(i, k) === head) hw += ex.sw.getComponent(i, k);
    if (hw < 0.9) continue;
    const side = ex.verts[i].x < 0 ? 0 : 1;
    eyeSide[side].add(ex.verts[i]);
    en[side]++;
  }
  if (!en[0] || !en[1]) throw new Error(`${ex.v.name}: no eye vertices`);
  const ex0 = eyeSide[0].divideScalar(en[0]), ex1 = eyeSide[1].divideScalar(en[1]);
  const eyeX = (Math.abs(ex0.x) + Math.abs(ex1.x)) / 2, eyeY = (ex0.y + ex1.y) / 2;
  let chin = Infinity;
  for (let i = 0; i < ex.verts.length; i++) {
    if (!/^Skin/.test(ex.mats[ex.mat[i]].name) || Math.abs(ex.verts[i].x) > 0.03 || ex.verts[i].y < eyeY - 0.15 || ex.verts[i].z < 0) continue;
    let hw = 0;
    for (let k = 0; k < 4; k++) if (ex.si.getComponent(i, k) === head) hw += ex.sw.getComponent(i, k);
    if (hw > 0.9) chin = Math.min(chin, ex.verts[i].y);
  }
  const u = eyeY - chin; // eye-to-chin distance
  const eyeXs = Math.min(eyeX, u * 0.5) * 0.95;
  const mm = u / 22; // roughly one cm of source scale
  const before = m.I.length / 3;
  const put = (x, y, off, col, zone) => {
    const s = surface(x, y);
    const p = s.p.addScaledVector(s.n, off * mm * 0.1);
    const v = m.P.length / 3;
    m.P.push(p.x, p.y, p.z);
    m.N.push(s.n.x, s.n.y, s.n.z);
    m.C.push(...lin(col));
    m.Z.push(zone);
    m.J.push(head, 0, 0, 0);
    m.W.push(1, 0, 0, 0);
    return v;
  };
  const tri = (a, b, c) => m.I.push(a, b, c);
  const disc = (cx, cy, rx, ry, n, off, col, zone = 0, rot = 0) => {
    const c = put(cx, cy, off, col, zone);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const dx = Math.cos(a) * rx, dy = Math.sin(a) * ry;
      ring.push(put(cx + dx * Math.cos(rot) - dy * Math.sin(rot), cy + dx * Math.sin(rot) + dy * Math.cos(rot), off, col, zone));
    }
    for (let i = 0; i < n; i++) tri(c, ring[i], ring[(i + 1) % n]);
  };
  /** Thick polyline (points [x, y], half thickness per point) as a triangle strip. */
  const stroke = (pts, half, off, col, zone = 0) => {
    const L = [], R = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const h = typeof half === 'function' ? half(i / (pts.length - 1)) : half;
      L.push(put(p[0] - ty * h, p[1] + tx * h, off, col, zone));
      R.push(put(p[0] + ty * h, p[1] - tx * h, off, col, zone));
    });
    for (let i = 0; i < pts.length - 1; i++) { tri(L[i], R[i], L[i + 1]); tri(R[i], R[i + 1], L[i + 1]); }
  };
  const SCLERA = 0xfdfdfb, DARK = 0x1c141c, MOUTH = 0x6b2230, BROW = 0x5a4a44;
  const [rx, ry] = [S.eye[0] * u, S.eye[1] * u];
  for (const sx of [-1, 1]) {
    const cx = sx * eyeXs;
    disc(cx, eyeY, rx, ry, 10, 3.5, SCLERA);
    // Iris (the eye looks a touch inwards and down: friendly), pupil, highlight.
    const ix = cx - sx * rx * 0.08, iy = eyeY - ry * 0.05;
    disc(ix, iy, rx * S.iris, ry * S.iris * 0.98, 10, 5.5, S.irisCol);
    disc(ix, iy, rx * S.iris * 0.52, ry * S.iris * 0.52, 8, 7.2, DARK);
    disc(ix + rx * 0.2, iy + ry * 0.26, rx * 0.2, rx * 0.2, 6, 8.8, 0xffffff);
    disc(ix - rx * 0.22, iy - ry * 0.28, rx * 0.09, rx * 0.09, 5, 8.8, 0xffffff);
    // Eyebrow: a soft arch above the eye, rising a little to the outer side.
    const by = eyeY + ry * 1.35;
    const arch = [-1, -0.5, 0, 0.5, 1].map((t, i) => [cx + t * rx * 1.05, by + (0.18 - 0.18 * t * t) * ry * S.brow + (t * sx) * 0.0 + (i === 0 ? 0 : 0)]);
    stroke(arch, (t) => ry * 0.13 * (1 - Math.abs(t - 0.5) * 0.7), 3.5, BROW, 4);
    if (S.lashes) {
      // Two little lashes at the outer corner (girls' style 3).
      const ox = cx + sx * rx * 0.95, oy = eyeY + ry * 0.2;
      stroke([[ox, oy], [ox + sx * rx * 0.45, oy + ry * 0.35]], ry * 0.07, 7, DARK);
      stroke([[ox - sx * rx * 0.1, oy - ry * 0.25], [ox + sx * rx * 0.45, oy - ry * 0.12]], ry * 0.06, 7, DARK);
    }
    if (S.blush) disc(sx * eyeXs * 1.25, eyeY - u * 0.36, u * 0.17, u * 0.1, 8, 2.5, 0xff9a9a, 1);
  }
  // Nose: a small rounded bump (skin tone, slightly pinker), drawn as a few stacked ellipses so it reads from the side too.
  const ny = eyeY - u * 0.3;
  disc(0, ny, u * 0.12, u * 0.09, 8, 4, 0xffd9d0, 1);
  disc(0, ny + u * 0.012, u * 0.07, u * 0.055, 6, 9, 0xfff0ea, 1);
  // Mouth.
  const my = eyeY - u * 0.55, mw = S.width * u;
  if (S.mouth === 'arc') {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = (i / 6) * 2 - 1; pts.push([t * mw, my + (t * t - 0.35) * u * 0.1 * S.smile * 2]); }
    stroke(pts, (t) => u * (0.04 + 0.014 * Math.sin(t * Math.PI)), 4.5, MOUTH);
  } else {
    // Open smile: a D shape (flat top, round bottom) with a tongue.
    const topY = my + u * 0.05, depth = u * 0.17;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([Math.cos(a) * mw, topY - Math.sin(a) * depth]); }
    const c = put(0, topY - depth * 0.3, 4.5, MOUTH);
    const ring = pts.map((p) => put(p[0], p[1] + (Math.abs(p[0]) > mw * 0.9 ? 0 : 0), 4.5, MOUTH));
    for (let i = 0; i < ring.length - 1; i++) tri(c, ring[i + 1], ring[i]);
    tri(c, ring[0], ring[ring.length - 1]);
    disc(0, topY - depth * 0.78, mw * 0.42, depth * 0.2, 7, 6.2, 0xf26b7a);
  }
  return m.I.length / 3 - before;
}

// ---- Document ---------------------------------------------------------------------------------------------------------------

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('residents');
const clipSpeed = {};
const f32 = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
const mat4Arr = (ms) => { const a = new Float32Array(ms.length * 16); ms.forEach((m, i) => m.toArray(a, i * 16)); return a; };

for (const gender of ['m', 'f']) {
  const list = VARIANTS.filter((v) => v.gender === gender);
  const pfx = gender + '_';
  let base = null;
  for (const v of list) {
    const ex = extract(v);
    const mesh = buildMesh(ex);
    ex.v = v;
    const faceTris = addFace(ex, mesh, list.indexOf(v), gender === 'f');
    console.log(`${v.name.padEnd(14)} height ${(ex.height / 100).toFixed(2)} flip ${ex.flip} tris ${mesh.I.length / 3} (face ${faceTris}) verts ${mesh.P.length / 3}`);
    if (!base) {
      base = ex;
      // Skeleton nodes.
      const nodes = ex.bones.map((b) => doc.createNode(pfx + b.name));
      ex.bones.forEach((b, i) => {
        const l = local(ex.bindWorld[i], ex.parent[i] >= 0 ? ex.bindWorld[ex.parent[i]] : null);
        // The root bones carry the uniform model scale (the animation only writes translation and rotation).
        nodes[i].setTranslation(l.t.toArray()).setRotation(l.q.toArray()).setScale(l.s.toArray());
        if (ex.parent[i] >= 0) nodes[ex.parent[i]].addChild(nodes[i]);
        else scene.addChild(nodes[i]);
      });
      base.nodes = nodes;
      base.skin = doc.createSkin(pfx + 'skin').setInverseBindMatrices(f32('MAT4', mat4Arr(ex.bindWorld.map((m) => m.clone().invert())))).setSkeleton(nodes[ex.parent.indexOf(-1)]);
      for (const n of nodes) base.skin.addJoint(n);
      // Animations (rotation always when it moves, translation when it moves).
      const clips = sampleClips(ex);
      for (const c of CLIPS) {
        const cl = clips[c.name];
        const anim = doc.createAnimation(pfx + c.name);
        const times = new Float32Array(cl.n + 1).map((_, f) => (f / cl.n) * cl.duration);
        const timeAcc = f32('SCALAR', times);
        ex.bones.forEach((b, i) => {
          const bindL = local(ex.bindWorld[i], ex.parent[i] >= 0 ? ex.bindWorld[ex.parent[i]] : null);
          const rot = new Float32Array((cl.n + 1) * 4), tr = new Float32Array((cl.n + 1) * 3);
          let rotMoves = false, trMoves = false;
          let prev = null;
          for (let f = 0; f <= cl.n; f++) {
            const l = local(cl.frames[f][i], ex.parent[i] >= 0 ? cl.frames[ex.parent[i]] ? cl.frames[f][ex.parent[i]] : null : null);
            if (prev && prev.dot(l.q) < 0) l.q.set(-l.q.x, -l.q.y, -l.q.z, -l.q.w);
            prev = l.q.clone();
            l.q.toArray(rot, f * 4);
            l.t.toArray(tr, f * 3);
            if (1 - Math.abs(l.q.dot(bindL.q)) > 1e-6) rotMoves = true;
            if (l.t.distanceTo(bindL.t) > 1e-4) trMoves = true;
          }
          if (rotMoves) {
            const s = doc.createAnimationSampler().setInput(timeAcc).setOutput(f32('VEC4', rot)).setInterpolation('LINEAR');
            anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodes[i]).setTargetPath('rotation').setSampler(s));
          }
          if (trMoves) {
            const s = doc.createAnimationSampler().setInput(timeAcc).setOutput(f32('VEC3', tr)).setInterpolation('LINEAR');
            anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodes[i]).setTargetPath('translation').setSampler(s));
          }
        });
        if (c.name === 'walk' || c.name === 'run') clipSpeed[pfx + c.name] = footSpeed(ex, cl);
        console.log(`  ${pfx}${c.name}: ${cl.n} frames, ${cl.duration.toFixed(2)} s`);
      }
    } else {
      // Same skeleton? (max difference of the inverse bind matrices)
      let d = 0;
      ex.bindWorld.forEach((m, i) => { const a = m.toArray(), b = base.bindWorld[i].toArray(); for (let q = 0; q < 16; q++) d = Math.max(d, Math.abs(a[q] - b[q])); });
      console.log(`  skeleton difference to ${list[0].name}: ${d.toExponential(2)}`);
      if (d > 0.02) throw new Error('skeletons differ; per-variant skins needed');
    }
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', f32('VEC3', Float32Array.from(mesh.P)))
      .setAttribute('NORMAL', f32('VEC3', Float32Array.from(mesh.N)))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setNormalized(true).setArray(Uint8Array.from(mesh.C, (c) => Math.round(Math.max(0, Math.min(1, c)) * 255))).setBuffer(buffer))
      .setAttribute('_ZONE', f32('SCALAR', Float32Array.from(mesh.Z)))
      .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(Uint8Array.from(mesh.J)).setBuffer(buffer))
      .setAttribute('WEIGHTS_0', f32('VEC4', Float32Array.from(mesh.W)))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(mesh.I)).setBuffer(buffer));
    scene.addChild(doc.createNode(v.name).setMesh(doc.createMesh(v.name).addPrimitive(prim)).setSkin(base.skin));
  }
}
scene.setExtras({ clipSpeed });
console.log('clip ground speeds (m/s):', clipSpeed);
// Meshopt compression of the buffers only: NO quantize pass (it would move the scale into the node transform, which skinned meshes ignore).
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(OUT, doc);
console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
