/**
 * Build public/env/bike/bike.glb from the Quaternius "Public Transport Pack" (Feb 2017, CC0 1.0) Bicycle model.
 *
 *   PT_SRC=<folder with the transport pack OBJ/MTL> node scripts/build-bike.mjs
 *
 * The source is NOT committed; only the optimised result is. The OBJ already has separate objects for the handlebar + fork, both
 * wheels, the saddle and the frame. Built here: a child-size toy bike (frame squashed down so a chibi rider reaches the pedals,
 * chunky tyres, bright baked palette), plus a crank with two pedals (procedural, the source has none) and marker nodes.
 *
 * Node tree (runtime ids; +z is the front, +y up, origin on the ground in the middle of the wheelbase):
 *   frame (paint), saddle, wheel_b (spins about x), crank (spins about x; pedal_l / pedal_r children, kept level in code),
 *   steer (turns about its own local Y = the fork axis; children fork (paint), bar, wheel_f, grip_l, grip_r), seat (empty).
 * "paint" meshes are one flat colour (the runtime recolours COLOR_0 per bike).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';

const PT = process.env.PT_SRC;
if (!PT) throw new Error('set PT_SRC to the OBJ folder of the Public Transport pack');
const OUT = process.env.BIKE_OUT ?? 'public/env/bike/bike.glb';
await MeshoptEncoder.ready;

/** Tuning (metres). S: source units -> metres; K: vertical squash of everything above the wheel axle line. */
const S = 0.24;
const K = 0.55; // frame + saddle squash
const KH = 0.8; // handlebar + fork squash
const ZC = 0.62; // wheelbase / frame length compression (the rider is a chibi with short arms and legs)
const TIRE_W = 1.6; // tyre width multiplier
const CRANK_LEN = 0.07;
const PEDAL_OFF = 0.1;
const BB = { y: 0.06, z: 0.9 }; // bottom bracket in source units (y above the wheel axle line)

const srgb = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => srgb(v / 255));
const PAINT = lin(0xe8453c), DARK = lin(0x3a3a48), SADDLE = lin(0x5b3a29), TIRE = lin(0x2b2a30), RIM = lin(0xdfe5ef), STEEL = lin(0xb4bccb), GRIP = lin(0xffc94d);

function readObj(file) {
  const V = [], VN = [], tris = [];
  let mat = '', obj = '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') V.push([+t[1], +t[2], +t[3]]);
    else if (t[0] === 'vn') VN.push([+t[1], +t[2], +t[3]]);
    else if (t[0] === 'usemtl') mat = t.slice(1).join(' ');
    else if (t[0] === 'o') obj = t.slice(1).join(' ');
    else if (t[0] === 'f') {
      const c = t.slice(1).map((s) => { const p = s.split('/'); return { p: V[+p[0] - 1], n: VN[+p[2] - 1] ?? [0, 1, 0] }; });
      for (let i = 1; i + 1 < c.length; i++) tris.push({ c: [c[0], c[i], c[i + 1]], mat, obj });
    }
  }
  return tris;
}
const tris = readObj(path.join(PT, 'Bicycle.obj'));
const of = (re) => tris.filter((t) => re.test(t.obj));

// Wheel centres (source units) from the wheel objects' bounding boxes.
function centre(list) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const t of list) for (const c of t.c) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], c.p[k]); hi[k] = Math.max(hi[k], c.p[k]); }
  return lo.map((v, k) => (v + hi[k]) / 2);
}
const FW = centre(of(/FrontWheel/)), BW = centre(of(/BackWheel/));
const ZM = (FW[2] + BW[2]) / 2;
const R0 = 0.95;
console.log('front wheel', FW.map((v) => v.toFixed(2)).join(' '), 'back', BW.map((v) => v.toFixed(2)).join(' '));

/** A mesh builder: corners in, welded indexed geometry out. */
class Mesh {
  constructor() { this.P = []; this.N = []; this.C = []; this.map = new Map(); this.I = []; }
  tri(a, b, c, col) {
    for (const v of [a, b, c]) {
      const k = `${v.p.map((x) => Math.round(x * 4000)).join(',')}|${v.n.map((x) => Math.round(x * 50)).join(',')}|${col.join(',')}`;
      let i = this.map.get(k);
      if (i === undefined) { i = this.P.length / 3; this.map.set(k, i); this.P.push(...v.p); this.N.push(...v.n); this.C.push(...col); }
      this.I.push(i);
    }
  }
  get empty() { return this.I.length === 0; }
}
/** Box / cylinder helpers for the procedural parts (local coordinates). */
function addBox(m, [cx, cy, cz], [w, h, d], col) {
  const f = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]], [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
  ];
  for (const [n, q] of f) {
    const v = q.map((s) => ({ p: [cx + s[0] * w / 2, cy + s[1] * h / 2, cz + s[2] * d / 2], n }));
    m.tri(v[0], v[1], v[2], col); m.tri(v[0], v[2], v[3], col);
  }
}
/** Cylinder along x. */
function addCylX(m, [cx, cy, cz], r, len, col, seg = 14) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const P = (a, x) => [cx + x, cy + Math.cos(a) * r, cz + Math.sin(a) * r];
    const N = (a) => [0, Math.cos(a), Math.sin(a)];
    const x0 = -len / 2, x1 = len / 2;
    const q = [{ p: P(a0, x0), n: N(a0) }, { p: P(a0, x1), n: N(a0) }, { p: P(a1, x1), n: N(a1) }, { p: P(a1, x0), n: N(a1) }];
    m.tri(q[0], q[2], q[1], col); m.tri(q[0], q[3], q[2], col);
    for (const [x, nx] of [[x1, 1], [x0, -1]]) {
      const c = { p: [cx + x, cy, cz], n: [nx, 0, 0] };
      const a = { p: [cx + x, cy + Math.cos(a0) * r, cz + Math.sin(a0) * r], n: [nx, 0, 0] };
      const b = { p: [cx + x, cy + Math.cos(a1) * r, cz + Math.sin(a1) * r], n: [nx, 0, 0] };
      if (nx > 0) m.tri(c, b, a, col); else m.tri(c, a, b, col);
    }
  }
}

// ---- source space -> bike space (rotate 180 deg about y so the front is +z; squash above the axle line; metres) ---------------
const sq = (y, k) => (y > 0 ? y * k : y);
const toBike = (p, k = K) => [-p[0] * S, (sq(p[1], k) + R0) * S, -(p[2] - ZM) * S * ZC];
const norm = (n) => { const l = Math.hypot(...n) || 1; return n.map((v) => v / l); };
// squash makes the normals lean: scale them by the inverse of the position scale, then renormalise.
const toBikeN = (n, k) => [-n[0] / S, n[1] / (S * (n[1] !== 0 ? k : 1)), -n[2] / (S * ZC)];
const conv = (c, k = K) => ({ p: toBike(c.p, k), n: norm(toBikeN(c.n, k)) });

// Frame, saddle: baked into the bike-space meshes.
const frame = new Mesh(), saddle = new Mesh();
for (const t of of(/Frame/)) frame.tri(conv(t.c[0]), conv(t.c[1]), conv(t.c[2]), PAINT);
for (const t of of(/Saddle/)) saddle.tri(conv(t.c[0]), conv(t.c[1]), conv(t.c[2]), SADDLE);
// Bottom bracket: chunky sleeve so the crank looks attached.
const BBp = [0, (BB.y * K + R0) * S, -(BB.z - ZM) * S * ZC];
addCylX(frame, BBp, 0.034, 0.12, PAINT, 10);

// Wheels: vertices relative to the axle; tyre vs rim by radius; tyre widened.
function wheelMesh(list, centreSrc) {
  const m = new Mesh();
  const cv = (c) => ({ p: [c.p[0] * -S * TIRE_W, (c.p[1] - centreSrc[1]) * S, -(c.p[2] - centreSrc[2]) * S], n: norm([-c.n[0], c.n[1], -c.n[2]]) });
  for (const t of list) {
    const r = (c) => Math.hypot(c.p[1] - centreSrc[1], c.p[2] - centreSrc[2]);
    const rr = (r(t.c[0]) + r(t.c[1]) + r(t.c[2])) / 3;
    const col = rr > 0.8 * R0 ? TIRE : rr > 0.1 * R0 ? RIM : STEEL;
    m.tri(cv(t.c[0]), cv(t.c[1]), cv(t.c[2]), col);
  }
  return m;
}
const wheelB = wheelMesh(of(/BackWheel/), BW);
const wheelF = wheelMesh(of(/FrontWheel/), FW);
const axleB = [0, R0 * S, -(BW[2] - ZM) * S * ZC];
const axleF = [0, R0 * S, -(FW[2] - ZM) * S * ZC];

// Steering: the fork axis runs from the front axle to the middle of the stem (source: Handle object).
const handle = of(/Handle/);
let stem = [0, 0, 0], ns = 0;
const grip = { l: [0, 0, 0, 0], r: [0, 0, 0, 0] };
for (const t of handle) for (const c of t.c) {
  const b = toBike(c.p, KH);
  if (Math.abs(c.p[0]) < 0.12 && c.p[1] > 1.6) { stem[0] += b[0]; stem[1] += b[1]; stem[2] += b[2]; ns++; }
  if (c.p[1] > 1.7 && Math.abs(c.p[0]) > 0.55) { const g = c.p[0] < 0 ? grip.l : grip.r; g[0] += b[0]; g[1] += b[1]; g[2] += b[2]; g[3]++; }
}
stem = stem.map((v) => v / ns);
// (rotating by 180 deg about y mapped source -x to +x: "l" here, source x < 0, is bike +x = the rider's left.)
const gl = grip.l.slice(0, 3).map((v) => v / grip.l[3]), gr = grip.r.slice(0, 3).map((v) => v / grip.r[3]);
const dir = norm([0, stem[1] - axleF[1], stem[2] - axleF[2]]);
const theta = Math.atan2(dir[2], dir[1]); // tilt of the fork about x (Y -> dir)
const cs = Math.cos(theta), sn = Math.sin(theta);
const toSteer = (p) => { const d = [p[0] - axleF[0], p[1] - axleF[1], p[2] - axleF[2]]; return [d[0], d[1] * cs + d[2] * sn, -d[1] * sn + d[2] * cs]; };
const toSteerN = (n) => [n[0], n[1] * cs + n[2] * sn, -n[1] * sn + n[2] * cs];
const fork = new Mesh(), bar = new Mesh();
const cs2 = (c) => { const b = conv(c, KH); return { p: toSteer(b.p), n: toSteerN(b.n) }; };
for (const t of handle) (t.mat === 'Bike' ? fork : bar).tri(cs2(t.c[0]), cs2(t.c[1]), cs2(t.c[2]), t.mat === 'Bike' ? PAINT : DARK);
// Yellow grips: short sleeves on both ends of the bar, built in steer space.
const gripS = [toSteer(gl), toSteer(gr)];
for (const g of gripS) addCylX(bar, [g[0] + Math.sign(g[0]) * 0.0, g[1], g[2]], 0.02, 0.09, GRIP, 8);
// Wheel in steer space: the wheel mesh is relative to its axle, which is the steer origin; its local x is shared.

// Crank (procedural): chainring on the right side, two arms, pedals are separate nodes (they stay level).
const crank = new Mesh();
addCylX(crank, [-0.045, 0, 0], 0.062, 0.012, STEEL, 14);
addBox(crank, [0.045, 0, CRANK_LEN / 2], [0.016, 0.022, CRANK_LEN], STEEL);
addBox(crank, [-0.045, 0, -CRANK_LEN / 2], [0.016, 0.022, CRANK_LEN], STEEL);
const pedalMesh = () => { const m = new Mesh(); addBox(m, [0, 0, 0], [0.07, 0.022, 0.13], DARK); return m; };
const pedalL = pedalMesh(), pedalR = pedalMesh();

// ---- write the GLB -------------------------------------------------------------------------------------------------------------
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('bike');
const mat = doc.createMaterial('toy').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7).setMetallicFactor(0);
function node(name, m, pos = [0, 0, 0], rot = [0, 0, 0, 1]) {
  // A pivot node (the runtime moves / spins it) with the mesh on a child: the optimiser may fold a quantisation offset into mesh nodes.
  const n = doc.createNode(name).setTranslation(pos).setRotation(rot);
  if (m && !m.empty) {
    const mn = doc.createNode(`${name}_m`);
    n.addChild(mn);
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.P)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.N)).setBuffer(buffer))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.C)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(m.I)).setBuffer(buffer));
    mn.setMesh(doc.createMesh(name).addPrimitive(prim));
  }
  return n;
}
const root = doc.createNode('bike');
scene.addChild(root);
const steer = node('steer', null, axleF, [Math.sin(theta / 2), 0, 0, Math.cos(theta / 2)]);
steer.addChild(node('fork', fork));
steer.addChild(node('bar', bar));
steer.addChild(node('wheel_f', wheelF));
steer.addChild(node('grip_l', null, toSteer(gl).map((v, i) => (i === 0 ? v : v))));
steer.addChild(node('grip_r', null, toSteer(gr)));
const crankN = node('crank', crank, BBp);
crankN.addChild(node('pedal_l', pedalL, [PEDAL_OFF, 0, CRANK_LEN]));
crankN.addChild(node('pedal_r', pedalR, [-PEDAL_OFF, 0, -CRANK_LEN]));
const seatTop = [0, 0, 0]; let nsd = 0;
for (let i = 0; i < saddle.P.length; i += 3) { if (saddle.P[i + 1] > 0) { seatTop[0] += saddle.P[i]; seatTop[1] += saddle.P[i + 1]; seatTop[2] += saddle.P[i + 2]; nsd++; } }
const seat = [0, Math.max(...saddle.P.filter((_, i) => i % 3 === 1)), seatTop[2] / nsd];
for (const c of [node('frame', frame), node('saddle', saddle), node('wheel_b', wheelB, axleB), crankN, steer, node('seat', null, seat)]) root.addChild(c);
const { meshopt } = await import('@gltf-transform/functions');
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(OUT, doc);
const tc = [frame, saddle, wheelB, wheelF, fork, bar, crank, pedalL, pedalR].reduce((s, m) => s + m.I.length / 3, 0);
console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${tc} tris; saddle top y ${seat[1].toFixed(2)} z ${seat[2].toFixed(2)}; grips`, gl.map((v) => v.toFixed(2)).join(' '), '|', gr.map((v) => v.toFixed(2)).join(' '), 'BB', BBp.map((v) => v.toFixed(2)).join(' '), 'tilt deg', (theta * 180 / Math.PI).toFixed(1));
