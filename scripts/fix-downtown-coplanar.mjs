/**
 * Post-process public/env/downtown/downtown.glb: remove z-fighting.
 *
 * The Downtown kit buildings are assembled from overlapping modular pieces (wall panel + column + trim + window frame ...), so
 * hundreds of same-facing triangles per building lie in (almost) the same plane. The depth buffer cannot tell them apart and the
 * wall shows blocky, flickering patches (worst on phones). This script finds every pair of overlapping, same-facing triangles
 * closer than TOL metres and lifts the later one along its normal in steps of STEP metres (the layer on top is stable).
 *
 *   node scripts/fix-downtown-coplanar.mjs [file.glb]      (idempotent: lifted layers are no longer closer than TOL)
 *
 * Lifted triangles get their own vertices (attributes copied). Positions are int16 normalised, so the whole mesh is shrunk a little
 * and the node scale enlarged by the same factor to leave head-room for the lift.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const FILE = process.argv[2] ?? 'public/env/downtown/downtown.glb';
const TOL = 0.004; // m: closer than this and overlapping = z-fight
const STEP = 0.006; // m per layer
const MAX_LAYERS = 6;
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(FILE);

function overlap(A, B) {
  // SAT in the shared plane, strict by 0.5 mm.
  for (const T of [A, B]) {
    for (let i = 0; i < 3; i++) {
      const p = T[i], q = T[(i + 1) % 3];
      let ax0 = -(q[1] - p[1]), ax1 = q[0] - p[0];
      const l = Math.hypot(ax0, ax1);
      if (l < 1e-12) continue;
      ax0 /= l; ax1 /= l;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const s of A) { const v = s[0] * ax0 + s[1] * ax1; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
      for (const s of B) { const v = s[0] * ax0 + s[1] * ax1; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
      if (a1 <= b0 + 0.0005 || b1 <= a0 + 0.0005) return false;
    }
  }
  return true;
}

let totalLifted = 0;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const S = node.getScale()[0]; // world metres per normalised unit
  const prims = mesh.listPrimitives();
  // Triangles of the whole mesh (all primitives), positions in metres relative to the node.
  const tris = [];
  prims.forEach((p, pi) => {
    const pa = p.getAttribute('POSITION');
    const ia = p.getIndices();
    const n = ia ? ia.getCount() : pa.getCount();
    for (let i = 0; i < n; i += 3) {
      const idx = [0, 1, 2].map((k) => (ia ? ia.getScalar(i + k) : i + k));
      const a = idx.map((j) => pa.getElement(j, [0, 0, 0]).map((v) => v * S));
      const e1 = a[1].map((x, k) => x - a[0][k]), e2 = a[2].map((x, k) => x - a[0][k]);
      const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(...c);
      if (l < 1e-9) continue;
      const nn = c.map((x) => x / l);
      tris.push({ pi, i, a, nn, d: nn[0] * a[0][0] + nn[1] * a[0][1] + nn[2] * a[0][2], area: l / 2, level: 0 });
    }
  });
  const groups = new Map();
  for (const t of tris) {
    const k = t.nn.map((x) => Math.round(x * 50)).join(',');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  for (const g of groups.values()) {
    g.sort((x, y) => Math.round(x.d / 0.0005) - Math.round(y.d / 0.0005) || y.area - x.area);
    for (let j = 1; j < g.length; j++) {
      const B = g[j];
      const n = B.nn;
      const u = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      let U = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      const ul = Math.hypot(...U); U = U.map((x) => x / ul);
      const V = [n[1] * U[2] - n[2] * U[1], n[2] * U[0] - n[0] * U[2], n[0] * U[1] - n[1] * U[0]];
      const P = (t) => t.a.map((q) => [q[0] * U[0] + q[1] * U[1] + q[2] * U[2], q[0] * V[0] + q[1] * V[1] + q[2] * V[2]]);
      const pb = P(B);
      let lvl = 0;
      for (let i = j - 1; i >= 0 && B.d - g[i].d <= TOL + 0.001 + g[i].level * STEP; i--) {
        const A = g[i];
        if (B.d - (A.d + A.level * STEP) > TOL) continue;
        if (overlap(P(A), pb)) lvl = Math.max(lvl, A.level + 1);
      }
      B.level = Math.min(lvl, MAX_LAYERS);
    }
  }
  const lifted = tris.filter((t) => t.level > 0);
  if (!lifted.length) continue;
  totalLifted += lifted.length;
  const maxLift = Math.max(...lifted.map((t) => t.level)) * STEP;
  // Head-room: shrink the quantised mesh, enlarge the node scale.
  const f = 1 - (maxLift / S) * 1.05 / 1.0;
  const shrink = Math.max(0.9, f);
  const per = new Map();
  for (const t of lifted) { if (!per.has(t.pi)) per.set(t.pi, []); per.get(t.pi).push(t); }
  prims.forEach((p, pi) => {
    const pa = p.getAttribute('POSITION');
    const ia = p.getIndices();
    const n = pa.getCount();
    const mine = per.get(pi) ?? [];
    const sems = p.listSemantics();
    const newCount = n + mine.length * 3;
    const out = {};
    for (const s of sems) {
      const acc = p.getAttribute(s);
      const es = acc.getElementSize();
      const src = acc.getArray();
      const dst = new src.constructor(newCount * es);
      dst.set(src);
      out[s] = dst;
    }
    // Shrink the positions of the whole primitive.
    const pos = out.POSITION;
    const maxRaw = pa.getNormalized() ? (pa.getComponentType() === 5122 ? 32767 : 1) : 1;
    for (let k = 0; k < n * 3; k++) pos[k] = Math.round(pos[k] * shrink);
    const idxArr = ia ? Array.from(ia.getArray()) : Array.from({ length: n }, (_, k) => k);
    mine.forEach((t, m) => {
      for (let c = 0; c < 3; c++) {
        const oldV = idxArr[t.i + c];
        const nv = n + m * 3 + c;
        for (const s of sems) {
          const es = p.getAttribute(s).getElementSize();
          for (let e = 0; e < es; e++) out[s][nv * es + e] = out[s][oldV * es + e];
        }
        const off = (t.level * STEP) / S * maxRaw * shrink; // raw units
        for (let e = 0; e < 3; e++) pos[nv * 3 + e] = Math.max(-maxRaw, Math.min(maxRaw, Math.round(pos[nv * 3 + e] + t.nn[e] * off)));
        idxArr[t.i + c] = nv;
      }
    });
    for (const s of sems) {
      const acc = p.getAttribute(s);
      acc.setArray(out[s]);
    }
    const IdxType = newCount > 65535 ? Uint32Array : Uint16Array;
    if (ia) ia.setArray(new IdxType(idxArr));
    else p.setIndices(doc.createAccessor().setArray(new IdxType(idxArr)).setType('SCALAR').setBuffer(pa.getBuffer()));
  });
  node.setScale(node.getScale().map((v) => v / shrink));
  console.log(node.getName(), 'lifted', lifted.length, 'of', tris.length, 'max layers', maxLift / STEP);
}
console.log('total lifted', totalLifted);
if (totalLifted > 0) {
  const { meshopt } = await import('@gltf-transform/functions');
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(FILE, doc);
}
