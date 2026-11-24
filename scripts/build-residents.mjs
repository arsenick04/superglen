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
const TRIS = Number(process.env.RES_TRIS ?? 900);
const HEIGHT = 1.6;
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
  return { root, sm, sk, g, si, sw, verts, mat, mats, bones, bindWorld, parent, fix, k, flip, height: maxY - minY };
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
      J.push(si.getX(i), si.getY(i), si.getZ(i), si.getW(i));
      W.push(w[0] / s, w[1] / s, w[2] / s, w[3] / s);
    }
    remap[i] = id;
  }
  const idx = [];
  for (let i = 0; i < verts.length; i += 3) {
    const a = remap[i], b = remap[i + 1], c = remap[i + 2];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const n = P.length / 3;
  const attr = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) { attr[i * 5] = C[i * 3]; attr[i * 5 + 1] = C[i * 3 + 1]; attr[i * 5 + 2] = C[i * 3 + 2]; attr[i * 5 + 3] = Z[i] * 0.25; attr[i * 5 + 4] = W[i * 4]; }
  const pos = Float32Array.from(P);
  const target = TRIS * 3;
  const all = Uint32Array.from(idx);
  let out = all;
  for (const e of [0.01, 0.02, 0.04, 0.08, 0.15]) {
    out = MeshoptSimplifier.simplifyWithAttributes(all, pos, 3, attr, 5, [1, 1, 1, 3, 0.5], null, target, e, [])[0];
    if (out.length <= target * 1.1) break;
  }
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
  m.N = [];
  for (let i = 0; i < m.P.length / 3; i++) {
    const nrm = (acc.get(pk(i)) ?? new V3(0, 1, 0)).clone().normalize();
    m.N.push(nrm.x, nrm.y, nrm.z);
  }
  return m;
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
    console.log(`${v.name.padEnd(14)} height ${(ex.height / 100).toFixed(2)} flip ${ex.flip} tris ${mesh.I.length / 3} verts ${mesh.P.length / 3}`);
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
