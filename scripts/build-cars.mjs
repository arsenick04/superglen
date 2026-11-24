/**
 * Build public/env/cars/cars.glb from two Quaternius packs (both CC0 1.0): "Realistic Car Pack" (Nov 2018) and "Public Transport
 * Pack" (Feb 2017).
 *
 *   CARS_SRC=<folder with the car pack OBJ/MTL> PT_SRC=<folder with the transport pack OBJ/MTL> node scripts/build-cars.mjs
 *
 * The sources are NOT committed; only the optimised result is. Look: the packs' realistic / dark colours are replaced by a bright
 * toy palette baked into vertex colours (no textures, one shared material, like downtown.glb). Per-vertex `_MASK` = 1 on the body
 * paint: the runtime tints it per car instance (CityModels.paintMaterial), everything else keeps its baked colour. Each model is
 * normalised: long axis = +z, front at +z, wheels on y = 0, centred in x / z, scaled to a toy size. Wheels stay part of the body
 * (cars roll by instancing, not by spinning wheels). Models are simplified to a small triangle budget.
 *
 * Models (node names are the runtime ids): car_n1, car_n2, car_suv, car_sports, car_taxi, bus_city, bus_school, and the traffic light as
 * light_pole + light_lamp. Cars carry `_WHEEL` (vec4 per vertex: wheel centre + radius, flag -1 = body, radius + 10 = front wheel): the
 * wheels are spun in the vertex shader around their own axle, so every car is still one draw call.
 * Skipped on purpose: Cop (police look), SportsCar2, Ambulance, Train, Bicycle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const CARS = process.env.CARS_SRC;
const PT = process.env.PT_SRC;
if (!CARS || !PT) throw new Error('set CARS_SRC and PT_SRC to the OBJ folders of the two packs');
const OUT = process.env.CARS_OUT ?? 'public/env/cars/cars.glb';
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const srgb = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lin = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => srgb(v / 255));
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** Paint is baked at this linear luminance so the runtime tint (instance colour * lum / 0.3) gives exactly the instance colour. */
const PAINT_LUM = 0.3;
const paint = (k) => { const g = PAINT_LUM * k; return [[g, g, g], 1]; };

const GLASS = lin(0x7cc4e8), TIRE = lin(0x2c2f3d), RIM = lin(0xc9d0dc), LAMP = lin(0xfff1a8), TAIL = lin(0xff6a6a), TRIM = lin(0x8d96a6);
const CAR_COMMON = { Windows: [GLASS, 0], Black: [TIRE, 0], Grey: [RIM, 0], Headlights: [LAMP, 0], TailLights: [TAIL, 0] };
const BUS_COMMON = { Windows: [lin(0x8fdcf2), 0], Lights: [LAMP, 0], Bumper: [lin(0x4a4f63), 0], Details: [lin(0x2c2f3d), 0] };

/** name, folder, size [length, ...] (length in m after scaling), material -> [linear rgb, mask]. */
const MODELS = [
  { name: 'car_n1', dir: CARS, file: 'NormalCar1', length: 3.9, mats: { ...CAR_COMMON, Blue: paint(1) }, tris: 700 },
  { name: 'car_n2', dir: CARS, file: 'NormalCar2', length: 3.5, mats: { ...CAR_COMMON, LightBlue: paint(1), 'Material.007': [TRIM, 0] }, tris: 700 },
  { name: 'car_suv', dir: CARS, file: 'SUV', length: 4.2, mats: { ...CAR_COMMON, White: paint(1) }, tris: 750 },
  { name: 'car_sports', dir: CARS, file: 'SportsCar', length: 3.8, mats: { ...CAR_COMMON, Orange: paint(1), DarkOrange: paint(0.7) }, tris: 700 },
  { name: 'car_taxi', dir: CARS, file: 'Taxi', length: 4.0, mats: { ...CAR_COMMON, Yellow: [lin(0xffd23f), 0] }, tris: 750 },
  { name: 'bus_city', dir: PT, file: 'Bus', length: 7.2, mats: { ...BUS_COMMON, Top: paint(1), Bottom: [lin(0x4b5b86), 0], Material: [TIRE, 0] }, tris: 1600 },
  { name: 'bus_school', dir: PT, file: 'SchoolBus', length: 7.0, mats: { ...BUS_COMMON, Yellow: [lin(0xffd23f), 0], Wheel: [TIRE, 0] }, tris: 1600 },
];

/** Triangulate a polygon (ear clipping in the plane of its dominant normal axis): the packs have concave n-gons (window frames). */
function triangulate(c) {
  if (c.length <= 4) { const o = []; for (let i = 1; i + 1 < c.length; i++) o.push([c[0], c[i], c[i + 1]]); return o; }
  // Newell normal.
  const nrm = [0, 0, 0];
  for (let i = 0; i < c.length; i++) {
    const a = c[i].p, b = c[(i + 1) % c.length].p;
    nrm[0] += (a[1] - b[1]) * (a[2] + b[2]); nrm[1] += (a[2] - b[2]) * (a[0] + b[0]); nrm[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const d = [Math.abs(nrm[0]), Math.abs(nrm[1]), Math.abs(nrm[2])];
  const drop = d[0] >= d[1] && d[0] >= d[2] ? 0 : d[1] >= d[2] ? 1 : 2;
  const u = (drop + 1) % 3, v = (drop + 2) % 3;
  const sgn = nrm[drop] >= 0 ? 1 : -1;
  const pt = (i) => [c[i].p[u], c[i].p[v]];
  const cross = (a, b, q) => ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) * sgn * (drop === 1 ? -1 : 1);
  const idx = c.map((_, i) => i);
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = pt(i0), b = pt(i1), q = pt(i2);
      if (cross(a, b, q) <= 1e-12) continue; // reflex or degenerate
      let inside = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        const r = pt(j);
        if (cross(a, b, r) >= 0 && cross(b, q, r) >= 0 && cross(q, a, r) >= 0) { inside = true; break; }
      }
      if (inside) continue;
      out.push([c[i0], c[i1], c[i2]]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([c[idx[0]], c[idx[1]], c[idx[2]]]);
  else for (let i = 1; i + 1 < idx.length; i++) out.push([c[idx[0]], c[idx[i]], c[idx[i + 1]]]);
  return out;
}

/** Minimal OBJ reader: triangles with per-corner position + normal, material per face, object name per face. */
function readObj(file) {
  const V = [], VN = [];
  const tris = [];
  let mat = '', obj = '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') V.push([+t[1], +t[2], +t[3]]);
    else if (t[0] === 'vn') VN.push([+t[1], +t[2], +t[3]]);
    else if (t[0] === 'usemtl') mat = t.slice(1).join(' ');
    else if (t[0] === 'o' || t[0] === 'g') obj = t.slice(1).join(' ');
    else if (t[0] === 'f') {
      const c = t.slice(1).map((s) => { const p = s.split('/'); return { p: V[+p[0] - 1], n: VN[+p[2] - 1] ?? [0, 1, 0] }; });
      for (const tri of triangulate(c)) tris.push({ c: tri, mat, obj });
    }
  }
  return tris;
}

function weld(P, N, C, M, I, K) {
  const map = new Map();
  const o = { P: [], N: [], C: [], M: [], I: [], K: [] };
  const key = (k) => `${Math.round(P[k * 3] * 500)},${Math.round(P[k * 3 + 1] * 500)},${Math.round(P[k * 3 + 2] * 500)}|${C[k * 3].toFixed(3)},${C[k * 3 + 1].toFixed(3)}|${M[k]}|${K[k]}`;
  const remap = new Uint32Array(P.length / 3);
  for (let k = 0; k < remap.length; k++) {
    const kk = key(k);
    let v = map.get(kk);
    if (v === undefined) {
      v = o.P.length / 3;
      map.set(kk, v);
      o.P.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
      o.N.push(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]);
      o.C.push(C[k * 3], C[k * 3 + 1], C[k * 3 + 2]);
      o.M.push(M[k]);
      o.K.push(K[k]);
    }
    remap[k] = v;
  }
  for (let t = 0; t < I.length; t += 3) {
    const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]];
    if (a !== b && b !== c && a !== c) o.I.push(a, b, c);
  }
  return o;
}

function compact(m, idx) {
  const map = new Map();
  const r = { P: [], N: [], C: [], M: [], I: [], K: [] };
  for (const i of idx) {
    let v = map.get(i);
    if (v === undefined) {
      v = r.P.length / 3;
      map.set(i, v);
      for (let k = 0; k < 3; k++) { r.P.push(m.P[i * 3 + k]); r.N.push(m.N[i * 3 + k]); r.C.push(m.C[i * 3 + k]); }
      r.M.push(m.M[i]);
      r.K.push(m.K[i]);
    }
    r.I.push(v);
  }
  return r;
}

function simplify(m, targetTris) {
  const idx = Uint32Array.from(m.I);
  if (idx.length / 3 <= targetTris) return compact(m, idx);
  const pos = Float32Array.from(m.P);
  const n = m.P.length / 3;
  const attr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { attr[i * 4] = m.C[i * 3]; attr[i * 4 + 1] = m.C[i * 3 + 1]; attr[i * 4 + 2] = m.C[i * 3 + 2]; attr[i * 4 + 3] = m.M[i] * 0.5; }
  const target = targetTris * 3;
  let out = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 4, [2, 2, 2, 2], null, target, 0.02, [])[0];
  for (const e of [0.05, 0.1, 0.2, 0.4]) {
    if (out.length <= target * 1.15) break;
    out = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 4, [2, 2, 2, 2], null, target, e, [])[0];
  }
  return compact(m, out);
}

/** Faceted toy look: every triangle gets its own vertices with the face normal. */
function flat(m) {
  const o = { P: [], N: [], C: [], M: [], I: [], K: [] };
  for (let t = 0; t < m.I.length; t += 3) {
    const i = [m.I[t], m.I[t + 1], m.I[t + 2]];
    const p = i.map((k) => [m.P[k * 3], m.P[k * 3 + 1], m.P[k * 3 + 2]]);
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    for (let c = 0; c < 3; c++) {
      o.I.push(o.P.length / 3);
      o.P.push(...p[c]);
      o.N.push(n[0] / l, n[1] / l, n[2] / l);
      o.C.push(m.C[i[c] * 3], m.C[i[c] * 3 + 1], m.C[i[c] * 3 + 2]);
      o.M.push(m.M[i[c]]);
      o.K.push(m.K[i[c]]);
    }
  }
  return o;
}

/** Triangles of `m` whose first corner satisfies `pred(K)`, as a compact mesh. */
function subset(m, pred) {
  const idx = [];
  for (let t = 0; t < m.I.length; t += 3) if (pred(m.K[m.I[t]])) idx.push(m.I[t], m.I[t + 1], m.I[t + 2]);
  return compact(m, idx);
}

function concat(a, b) {
  const base = a.P.length / 3;
  return { P: a.P.concat(b.P), N: a.N.concat(b.N), C: a.C.concat(b.C), M: a.M.concat(b.M), K: a.K.concat(b.K), I: a.I.concat(b.I.map((i) => i + base)) };
}

/** Wheel clusters (K = 0..3: back-left, back-right, front-left, front-right) -> per-vertex [cx, cy, cz, flag]: flag = -1 body, radius (back) or 10 + radius (front). */
function wheelAttr(m, info) {
  const out = new Float32Array((m.P.length / 3) * 4);
  for (let k = 0; k < m.K.length; k++) {
    const w = m.K[k] >= 0 ? info[m.K[k]] : null;
    out.set(w ? [w.c[0], w.c[1], w.c[2], w.front ? 10 + w.r : w.r] : [0, 0, 0, -1], k * 4);
  }
  return out;
}

function build(spec) {
  const tris = readObj(path.join(spec.dir, `${spec.file}.obj`));
  // Bounds and front (the front wheels' centre along the long axis) before any transform.
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  const fw = [0, 0, 0], bw = [0, 0, 0];
  let nf = 0, nb = 0;
  for (const t of tris) for (const c of t.c) {
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], c.p[k]); hi[k] = Math.max(hi[k], c.p[k]); }
    if (/front/i.test(t.obj) && /wheel/i.test(t.obj)) { for (let k = 0; k < 3; k++) fw[k] += c.p[k]; nf++; }
    if (/back/i.test(t.obj) && /wheel/i.test(t.obj)) { for (let k = 0; k < 3; k++) bw[k] += c.p[k]; nb++; }
  }
  if (!nf || !nb) throw new Error(`${spec.file}: wheels not found`);
  const axis = hi[0] - lo[0] > hi[2] - lo[2] ? 0 : 2;
  const sign = fw[axis] / nf > bw[axis] / nb ? 1 : -1; // +1: front is at +axis
  const cen = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  const scale = spec.length / (hi[axis] - lo[axis]);
  // x' = lateral, z' = forward.
  const xf = (p) => {
    const lat = axis === 2 ? (p[0] - cen[0]) * sign : (p[2] - cen[2]) * -sign;
    const fwd = (p[axis] - cen[axis]) * sign;
    return [lat * scale, (p[1] - cen[1]) * scale, fwd * scale];
  };
  const nx = (n) => {
    const lat = axis === 2 ? n[0] * sign : n[2] * -sign;
    return [lat, n[1], n[axis] * sign];
  };
  const P = [], N = [], C = [], M = [], I = [], K = [];
  const wlo = [[1e9, 1e9, 1e9], [1e9, 1e9, 1e9], [1e9, 1e9, 1e9], [1e9, 1e9, 1e9]], whi = wlo.map((x) => x.map((v) => -v));
  for (const t of tris) {
    const e = spec.mats[t.mat];
    if (!e) throw new Error(`${spec.file}: no colour for material ${t.mat}`);
    let cluster = -1;
    if (/wheel/i.test(t.obj)) {
      const lat = (xf(t.c[0].p)[0] + xf(t.c[1].p)[0] + xf(t.c[2].p)[0]) / 3;
      cluster = (/front/i.test(t.obj) ? 2 : 0) + (lat > 0 ? 1 : 0);
    }
    for (const c of t.c) {
      const q = xf(c.p);
      const nn = nx(c.n);
      // Window / decal panes sit (almost) in the wall plane in the packs: lift them a little so they never z-fight with it.
      if (/^(Windows|Details|Lights)$/.test(t.mat)) for (let k = 0; k < 3; k++) q[k] += nn[k] * 0.02;
      P.push(...q);
      N.push(...nn);
      C.push(...e[0]);
      M.push(e[1]);
      K.push(cluster);
      I.push(I.length);
      if (cluster >= 0) for (let k = 0; k < 3; k++) { wlo[cluster][k] = Math.min(wlo[cluster][k], q[k]); whi[cluster][k] = Math.max(whi[cluster][k], q[k]); }
    }
  }
  // The map is a pure rotation, so winding should survive; verify on the first triangle anyway.
  const a = [P[0], P[1], P[2]], b = [P[3], P[4], P[5]], c = [P[6], P[7], P[8]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (cr[0] * N[0] + cr[1] * N[1] + cr[2] * N[2] < 0) for (let i = 0; i < I.length; i += 3) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]];
  let m = weld(P, N, C, M, I, K);
  const before = m.I.length / 3;
  const info = wlo.map((l, i) => ({ c: [0, 1, 2].map((k) => (l[k] + whi[i][k]) / 2), r: (whi[i][1] - l[1]) / 2, front: i >= 2 }));
  if (info.some((w) => w.r < 0.1 || w.r > 0.8)) throw new Error(`${spec.file}: odd wheel radius ${JSON.stringify(info)}`);
  // Body and wheels are simplified apart, so a wheel never melts into the body (the wheels spin in the vertex shader).
  const wheelsAll = subset(m, (k) => k >= 0);
  const wheelBudget = Math.min(Math.round(wheelsAll.I.length / 3 * 0.45), spec.wheelTris ?? 300);
  console.log(`  ${spec.name}: wheels ${wheelsAll.I.length / 3} -> ${wheelBudget}`);
  m = flat(concat(simplify(subset(m, (k) => k < 0), spec.tris - 300), simplify(wheelsAll, wheelBudget)));
  m.wheel = wheelAttr(m, info);
  // Soft ambient: lower body a bit darker, like the other baked models.
  for (let k = 0; k < m.P.length / 3; k++) {
    const ao = 0.88 + 0.12 * Math.min(1, m.P[k * 3 + 1] / 0.5);
    for (let c2 = 0; c2 < 3; c2++) m.C[k * 3 + c2] = Math.min(1, m.C[k * 3 + c2] * ao);
  }
  console.log(`${spec.name.padEnd(11)} ${before} -> ${m.I.length / 3} tris, size ${(Math.max(...m.P.filter((_, i) => i % 3 === 0)) * 2).toFixed(2)} wide, ${(Math.max(...m.P.filter((_, i) => i % 3 === 1))).toFixed(2)} tall`);
  return m;
}

/**
 * Traffic light (Public Transport Pack): pole + housing (`light_pole`, plain vertex colours) and the three lamps (`light_lamp`,
 * `_LAMP` = 0 red, 1 yellow, 2 green; the runtime lights one of them and dims the others). Height 4 m, lamps face +z.
 */
function buildLight() {
  const tris = readObj(path.join(PT, 'TrafficLight.obj'));
  const LAMPS = { Red: [0, lin(0xff3b30)], Yellow: [1, lin(0xffd23f)], Green: [2, lin(0x34d17a)] };
  let bx = 0, bz = 0, bn = 0;
  for (const t of tris) for (const c of t.c) if (c.p[1] < 0.3) { bx += c.p[0]; bz += c.p[2]; bn++; }
  bx /= bn; bz /= bn;
  const scale = 4.0 / 1.876;
  const P = [], N = [], C = [], M = [], I = [], K = [];
  for (const t of tris) {
    const lamp = LAMPS[t.mat];
    for (const c of t.c) {
      // Lamps face -x in the pack: rotate 90 degrees about y so they face +z.
      P.push((c.p[2] - bz) * scale, c.p[1] * scale, -(c.p[0] - bx) * scale);
      N.push(c.n[2], c.n[1], -c.n[0]);
      C.push(...(lamp ? lamp[1] : lin(0x3d4254)));
      M.push(0);
      K.push(lamp ? lamp[0] : -1);
      I.push(I.length);
    }
  }
  const m = weld(P, N, C, M, I, K);
  const pole = flat(simplify(subset(m, (k) => k < 0), 260));
  const lamps = flat(simplify(subset(m, (k) => k >= 0), 150));
  console.log(`light_pole ${pole.I.length / 3} tris, light_lamp ${lamps.I.length / 3} tris`);
  return { pole, lamps };
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('cars');
for (const spec of MODELS) {
  const m = build(spec);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.P)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.N)).setBuffer(buffer))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setNormalized(true).setArray(Uint8Array.from(m.C, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255))).setBuffer(buffer))
    .setAttribute('_MASK', doc.createAccessor().setType('SCALAR').setNormalized(true).setArray(Uint8Array.from(m.M, (v) => Math.round(v * 255))).setBuffer(buffer))
    .setAttribute('_WHEEL', doc.createAccessor().setType('VEC4').setArray(m.wheel).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(m.I)).setBuffer(buffer));
  scene.addChild(doc.createNode(spec.name).setMesh(doc.createMesh(spec.name).addPrimitive(prim)));
}
{
  const { pole, lamps } = buildLight();
  const mk = (name, m, extra) => {
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.P)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(m.N)).setBuffer(buffer))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setNormalized(true).setArray(Uint8Array.from(m.C, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255))).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(m.I)).setBuffer(buffer));
    if (extra) prim.setAttribute('_LAMP', doc.createAccessor().setType('SCALAR').setArray(Float32Array.from(m.K)).setBuffer(buffer));
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  };
  mk('light_pole', pole, false);
  mk('light_lamp', lamps, true);
}
const { meshopt } = await import('@gltf-transform/functions');
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(OUT, doc);
console.log(`${OUT}: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
