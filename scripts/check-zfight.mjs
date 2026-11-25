/**
 * Z-fighting audit of the open city (Kota Botanica) exactly as the game builds it: `npm run check:zfight`.
 *
 *   node scripts/check-zfight.mjs [--tol=0.015] [--min-area=0.0005] [--top=40] [--cache=FILE] [--use-cache] [--url=http://host:port] [--chrome=PATH]
 *
 * HOW: starts the vite dev server (unless --url is given), opens the game headless (Playwright + Chrome, level `kota`), hooks the live
 * THREE.Scene, walks the player to the centre of each of the 36 streaming chunks (so every chunk slot is loaded in turn) and collects the
 * WORLD-SPACE triangles of everything visible under the level group: baked far / flat layers, chunk slots (CityMesher), the Kenney /
 * Downtown / Tripo building models (BatchedMesh with per-instance matrix and LOD), InstancedMesh nature, decals, paths, markings, landmark
 * buildings. Skinned / animated things (crowd, bikes, characters, coins, traffic and walkers), Points and lines are skipped. Every triangle is counted in the chunk its
 * centroid lies in, so nothing is counted twice.
 *
 * THEN (in node): finds pairs of triangles that face the SAME way, are coplanar within --tol metres over their whole overlap, and overlap by
 * more than --min-area m2, but do not look the same (different mesh / material / colour or atlas tile). Pairs of the same look are
 * harmless and only counted. Groups are keyed by (source A, source B, colours, plane height) and printed with world positions.
 * Exit code 1 when significant groups remain.
 *
 * `--cache=FILE` stores the collected triangles (so the detection can be tuned without reloading the city), `--use-cache` reads them back.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const flag = (k) => process.argv.includes(`--${k}`);
const TOL = Number(arg('tol', '0.015'));
const MIN_AREA = Number(arg('min-area', '0.0005'));
const TOP = Number(arg('top', '40'));
const CACHE = arg('cache', '');
/** `--why=x,y,z,r`: list the builder primitives (shape, position, size, colour) touching a world point, then exit. */
const WHY = arg('why', '').split(',').filter(Boolean).map(Number);
const PORT = 5197;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------------------
// 1. Collect (browser)
// ---------------------------------------------------------------------------------------------------------------------------

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

/** Runs inside the page: returns the triangles of the chunk at (cx, cz) as base64 parts. */
const PAGE_COLLECT = async ({ cx, cz, half, chunk }) => {
  const T = window.__T;
  const scene = window.__scene;
  const x0 = -half + cx * chunk, x1 = x0 + chunk, z0 = -half + cz * chunk, z1 = z0 + chunk;
  const n = 6;
  const inRect = (x, z) => {
    // Everything outside the square belongs to the nearest chunk.
    const ix = Math.max(0, Math.min(n - 1, Math.floor((x + half) / chunk)));
    const iz = Math.max(0, Math.min(n - 1, Math.floor((z + half) / chunk)));
    return ix === cx && iz === cz;
  };
  const labels = window.__labels;
  const label = (s) => { let i = labels.indexOf(s); if (i < 0) { i = labels.length; labels.push(s); } return i; };
  const mats = window.__mats;
  const matId = (m) => { let i = mats.indexOf(m.uuid); if (i < 0) { i = mats.length; mats.push(m.uuid); } return i; };
  const out = []; // [x0..z2 (9 floats), key, label, mat, flags, depth-bias units]
  const v = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const col = new T.Color();
  const m4 = new T.Matrix4();
  const bm = new T.Matrix4();
  const root = scene.children.find((c) => c.name === 'level:kota');
  const skip = (o) => /crowd|bike|frame_m|saddle|wheel|crank|pedal|fork|bar_m|tripo_node|player|glen|nino|aara/i.test(o.name || '');
  const visible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const under = (o) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
  const push = (g, ia, ib, ic, M, lab, matIdx, keyOf, flags, bias) => {
    const pos = g.attributes.position;
    for (let k = 0; k < 3; k++) {
      v[k].fromBufferAttribute(pos, k === 0 ? ia : k === 1 ? ib : ic).applyMatrix4(M);
    }
    const cxm = (v[0].x + v[1].x + v[2].x) / 3, czm = (v[0].z + v[1].z + v[2].z) / 3;
    if (!inRect(cxm, czm)) return;
    out.push(v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z, keyOf(ia, ib, ic), lab, matIdx, flags, bias);
  };
  const tmpC = new T.Color();
  const handleGeom = (g, M, lab, mat, instColor, drawStart, drawCount, flags) => {
    const idx = g.index;
    const total = idx ? idx.count : g.attributes.position.count;
    const s = Math.max(0, drawStart), e = Math.min(total, drawStart + drawCount);
    const cA = g.attributes.color;
    const tA = g.attributes.aTile;
    const baseCol = mat.color ? mat.color : col.set(0xffffff);
    const hasMap = !!mat.map;
    const keyOf = (a, b, c) => {
      let r = 1, gg = 1, bb = 1;
      if (cA) { r = (cA.getX(a) + cA.getX(b) + cA.getX(c)) / 3; gg = (cA.getY(a) + cA.getY(b) + cA.getY(c)) / 3; bb = (cA.getZ(a) + cA.getZ(b) + cA.getZ(c)) / 3; }
      r *= baseCol.r; gg *= baseCol.g; bb *= baseCol.b;
      if (instColor) { r *= instColor.r; gg *= instColor.g; bb *= instColor.b; }
      const q = (x) => Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, x), 1 / 2.2) * 255)));
      const tile = tA ? Math.round(tA.getX(a)) & 255 : hasMap ? 254 : 0;
      return ((q(r) << 16) | (q(gg) << 8) | q(bb)) + tile * 16777216;
    };
    const mid = matId(mat);
    const bias = mat.polygonOffset ? mat.polygonOffsetUnits : 0;
    for (let i = s; i + 2 < e; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      push(g, a, b, c, M, lab, mid, keyOf, flags, bias);
    }
  };
  scene.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o.isMesh) || o.isSkinnedMesh || !o.visible || !visible(o) || skip(o)) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat || mat.transparent && mat.opacity < 0.5 || mat.isMeshBasicMaterial && !mat.vertexColors && mat.color && mat.color.getHex() === 0xffffff && o.name === '') {
      // fall through: basic glow layers (climb edges) are real geometry: only skip fully transparent ones
    }
    if (mat && mat.transparent && mat.opacity < 0.2) return;
    // Dynamic instanced meshes (coins, traffic, walkers: unnamed, straight under the level group, moved every frame) are not static scenery.
    if (o.isInstancedMesh && !o.name && o.parent === root) return;
    const g = o.geometry;
    const dr = g.drawRange;
    const isSlot = dr.count !== Infinity && !o.isInstancedMesh && !o.isBatchedMesh;
    const slotKind = isSlot ? (mat.isMeshBasicMaterial ? 'glow' : o.castShadow ? 'lit' : 'deco') : '';
    let name;
    if (o.isBatchedMesh) name = `batched:${o.name || 'dressing'}`;
    else if (o.isInstancedMesh) name = `inst:${o.name || mat.type}`;
    else if (isSlot) name = `slot-${slotKind}`;
    else {
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      name = o.name || `static:${mat.type.replace('Mesh', '')}:${tris}t:${o.castShadow ? 'c' : 'n'}`;
    }
    const lab = label(name);
    if (o.isBatchedMesh) {
      const cnt = o.instanceCount ?? o.maxInstanceCount;
      for (let i = 0; i < (o.maxInstanceCount ?? cnt); i++) {
        let vis = true;
        try { vis = o.getVisibleAt(i); } catch { continue; }
        if (!vis) continue;
        let gid;
        try { gid = o.getGeometryIdAt(i); } catch { continue; }
        if (gid < 0) continue;
        o.getMatrixAt(i, bm);
        m4.multiplyMatrices(o.matrixWorld, bm);
        // Cheap reject: the instance origin must lie in this chunk (triangles are tested again below).
        let ic = null;
        try { ic = new T.Color(); o.getColorAt(i, ic); } catch { ic = null; }
        const range = o.getGeometryRangeAt(gid);
        handleGeom(g, m4, lab, mat, ic, range.start ?? range.indexStart ?? 0, range.count ?? range.indexCount ?? 0, 1);
      }
    } else if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, bm);
        m4.multiplyMatrices(o.matrixWorld, bm);
        let ic = null;
        if (o.instanceColor) { ic = new T.Color(); o.getColorAt(i, ic); }
        handleGeom(g, m4, lab, mat, ic, 0, Infinity, 1);
      }
    } else {
      handleGeom(g, o.matrixWorld, lab, mat, null, dr.start, dr.count, isSlot ? 2 : 0);
    }
  });
  // Pack: floats for positions, ints share the buffer through a DataView-free trick: keep two arrays.
  const f = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) f[i] = out[i];
  // key can exceed float precision (up to 2^32): split in two 16-bit halves is overkill; store key as two floats instead.
  const cnt = out.length / 14;
  const P = new Float32Array(cnt * 9);
  const K = new Uint32Array(cnt);
  const L = new Uint16Array(cnt);
  const M = new Uint16Array(cnt);
  const F = new Int8Array(cnt);
  for (let i = 0; i < cnt; i++) {
    for (let k = 0; k < 9; k++) P[i * 9 + k] = out[i * 14 + k];
    K[i] = out[i * 14 + 9]; L[i] = out[i * 14 + 10]; M[i] = out[i * 14 + 11]; F[i] = out[i * 14 + 13];
  }
  const b64 = (arr) => {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return { count: cnt, P: b64(P), K: b64(K), L: b64(L), M: b64(M), F: b64(F) };
};

async function collect() {
  const require = createRequire(import.meta.url);
  let chromium;
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { ({ chromium } = require(p)); break; } catch { /* try next */ }
  }
  if (!chromium) throw new Error('playwright not found');
  let url = arg('url', '');
  let vite = null;
  if (!url) {
    url = `http://127.0.0.1:${PORT}/`;
    if (!(await ping(url))) {
      vite = spawn('npx', ['vite', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
      for (let i = 0; i < 100 && !(await ping(url)); i++) await sleep(300);
    }
  }
  const exe = arg('chrome', fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?level=kota&free=1&fps=0&reset=1&adaptive=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__superglen?.level === 'kota', null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const u = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /deps\/three\.js/.test(n));
    const T = await import(u);
    window.__T = T;
    T.Scene.prototype.updateMatrixWorld = function (f) { window.__scene = this; return T.Object3D.prototype.updateMatrixWorld.call(this, f); };
    window.__labels = [];
    window.__mats = [];
    window.__superglen.pause(true);
    window.__superglen.advance(3, true);
  });
  await page.waitForFunction(() => window.__scene, null, { timeout: 20000 });
  if (WHY.length) {
    // Diagnostic: which recipe primitives (the city builder's own list, with the models loaded) touch this world point?
    const lines = await page.evaluate(async ([X, Y, Z, R]) => {
      const mod = await import('/src/world/kota/CityBuilder.ts');
      const data = await import('/src/world/kota/CityData.ts');
      const b = mod.buildCity(data.CITY_LAYOUT);
      const sh = ['Box', 'Pyr', 'Cyl0', 'Cyl1', 'Cyl2', 'Sph0', 'Sph1', 'Sph2', 'Cone0', 'Cone1', 'Cone2', 'Hill', 'Quad', 'BoxNB', 'Pyr4', 'VQuad', 'Trunk', 'ConeO', 'Ico', 'Body', 'BackHill'];
      const out = [];
      const scan = (name, r) => {
        const d = r.data;
        for (let i = 0; i < r.count; i++) {
          const o = i * 12;
          const s = d[o] < sh.length ? sh[d[o]] : `model#${d[o]}`;
          const rot = d[o + 7] !== 0 || d[o + 8] !== 0 || d[o + 9] !== 0;
          const model = d[o] >= sh.length;
          const ex = model ? Math.max(d[o + 4], d[o + 5], d[o + 6]) * 1.2 : rot ? Math.max(d[o + 4], d[o + 5], d[o + 6]) / 2 + R : d[o + 4] / 2 + R;
          const ey = model ? ex : rot ? ex : d[o + 5] / 2 + R;
          const ez = model ? ex : rot ? ex : d[o + 6] / 2 + R;
          if (Math.abs(d[o + 1] - X) <= ex && Math.abs(d[o + 3] - Z) <= ez && Math.abs(d[o + 2] - Y) <= ey) {
            out.push(`${name} ${s} pos ${[d[o + 1], d[o + 2], d[o + 3]].map((v) => v.toFixed(2))} size ${[d[o + 4], d[o + 5], d[o + 6]].map((v) => v.toFixed(2))} rot ${[d[o + 7], d[o + 8], d[o + 9]].map((v) => v.toFixed(2))} col ${(d[o + 10] >>> 0).toString(16)} tile ${d[o + 11]}`);
          }
        }
      };
      b.far.forEach((r, i) => scan(`far${i}`, r));
      scan('flat', b.flat);
      for (const c of b.chunks) { scan(`lit${c.index}`, c.lit); scan(`deco${c.index}`, c.deco); scan(`glow${c.index}`, c.glow); }
      return out;
    }, WHY);
    console.log(lines.join('\n'));
    await browser.close();
    if (vite) vite.kill();
    process.exit(0);
  }
  const half = 150, chunk = 50;
  const parts = [];
  for (let cz = 0; cz < 6; cz++) {
    for (let cx = 0; cx < 6; cx++) {
      const x = -half + (cx + 0.5) * chunk;
      const z = -half + (cz + 0.5) * chunk;
      let last = -1;
      for (let attempt = 0; attempt < 40; attempt++) {
        const st = await page.evaluate(([px, pz, first]) => {
          const g = window.__superglen;
          if (first) { g.placePlayer(px, pz); g.advance(60, false); }
          g.advance(10, false);
          return { loaded: g.levelInfo.visLoaded, loading: g.levelInfo.visLoading };
        }, [x, z, attempt === 0]);
        await page.waitForTimeout(40);
        if (st.loading === 0 && st.loaded === last && attempt > 2) break;
        last = st.loaded;
      }
      const r = await page.evaluate(PAGE_COLLECT, { cx, cz, half, chunk });
      process.stderr.write(`chunk ${cx},${cz}: ${r.count} triangles\n`);
      parts.push(r);
    }
  }
  const labels = await page.evaluate(() => window.__labels);
  await browser.close();
  if (vite) vite.kill();
  if (errors.length) process.stderr.write(`page errors: ${errors.slice(0, 3).join(' | ')}\n`);
  const dec = (b64, Ctor) => { const b = Buffer.from(b64, 'base64'); return new Ctor(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  const total = parts.reduce((s, p) => s + p.count, 0);
  const P = new Float32Array(total * 9), K = new Uint32Array(total), L = new Uint16Array(total), M = new Uint16Array(total), F = new Int8Array(total);
  let o = 0;
  for (const p of parts) {
    P.set(dec(p.P, Float32Array), o * 9); K.set(dec(p.K, Uint32Array), o); L.set(dec(p.L, Uint16Array), o); M.set(dec(p.M, Uint16Array), o); F.set(dec(p.F, Int8Array), o);
    o += p.count;
  }
  return { total, P, K, L, M, F, labels };
}

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Detect (node)
// ---------------------------------------------------------------------------------------------------------------------------

function saveCache(file, d) {
  const head = Buffer.from(JSON.stringify({ total: d.total, labels: d.labels }));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(head.length);
  const b = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  fs.writeFileSync(file, Buffer.concat([len, head, b(d.P), b(d.K), b(d.L), b(d.M), b(d.F)]));
}
function loadCache(file) {
  const buf = fs.readFileSync(file);
  const hl = buf.readUInt32LE(0);
  const head = JSON.parse(buf.subarray(4, 4 + hl).toString());
  let off = 4 + hl;
  const take = (Ctor, n) => { const bytes = n * Ctor.BYTES_PER_ELEMENT; const a = new Ctor(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + bytes)); off += bytes; return a; };
  const t = head.total;
  return { total: t, labels: head.labels, P: take(Float32Array, t * 9), K: take(Uint32Array, t), L: take(Uint16Array, t), M: take(Uint16Array, t), F: take(Int8Array, t) };
}

function detect(d) {
  const { total, P, K, L, M, F, labels } = d;
  const N = new Float32Array(total * 3); // unit normals
  const D = new Float32Array(total); // plane offset
  const AREA = new Float32Array(total);
  const live = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const o = i * 9;
    const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
    const vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-7) continue; // degenerate
    AREA[i] = l / 2;
    nx /= l; ny /= l; nz /= l;
    N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
    D[i] = nx * P[o] + ny * P[o + 1] + nz * P[o + 2];
    live[i] = 1;
  }
  // Uniform grid on xz.
  const CELL = 4;
  const grid = new Map();
  const key = (ix, iz) => ix * 4096 + iz + 1e7 * 0;
  let inserted = 0;
  for (let i = 0; i < total; i++) {
    if (!live[i]) continue;
    const o = i * 9;
    const minx = Math.min(P[o], P[o + 3], P[o + 6]) - TOL, maxx = Math.max(P[o], P[o + 3], P[o + 6]) + TOL;
    const minz = Math.min(P[o + 2], P[o + 5], P[o + 8]) - TOL, maxz = Math.max(P[o + 2], P[o + 5], P[o + 8]) + TOL;
    const ix0 = Math.floor(minx / CELL), ix1 = Math.floor(maxx / CELL), iz0 = Math.floor(minz / CELL), iz1 = Math.floor(maxz / CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = key(ix + 2048, iz + 2048);
        let a = grid.get(k);
        if (!a) { a = []; grid.set(k, a); }
        a.push(i);
        inserted++;
      }
    }
  }
  process.stderr.write(`${total} triangles, ${grid.size} cells, ${inserted} insertions\n`);

  const groups = new Map();
  let pairsTested = 0, same = 0, bad = 0, biased = 0, under = 0;
  const seen = new Set();
  // Clip polygon A (2D) by convex triangle B (2D, CCW normalised).
  const poly = [];
  const clipTri = (A, B) => {
    let cur = A;
    for (let e = 0; e < 3 && cur.length; e++) {
      const p = B[e], q = B[(e + 1) % 3];
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const nxt = [];
      for (let k = 0; k < cur.length; k++) {
        const a = cur[k], b = cur[(k + 1) % cur.length];
        const da = ex * (a[1] - p[1]) - ey * (a[0] - p[0]);
        const db = ex * (b[1] - p[1]) - ey * (b[0] - p[0]);
        if (da >= 0) nxt.push(a);
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          nxt.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        }
      }
      cur = nxt;
    }
    return cur;
  };
  const hex = (k) => `${(k >>> 24) ? `t${k >>> 24}:` : ''}${(k & 0xffffff).toString(16).padStart(6, '0')}`;
  for (const [, list] of grid) {
    for (let a = 0; a < list.length; a++) {
      const i = list[a];
      for (let b = a + 1; b < list.length; b++) {
        const j = list[b];
        const dn = N[i * 3] * N[j * 3] + N[i * 3 + 1] * N[j * 3 + 1] + N[i * 3 + 2] * N[j * 3 + 2];
        if (dn < 0.995) continue;
        const dd = Math.abs(D[i] - D[j]);
        if (dd > TOL + 0.02) continue;
        const pk = i < j ? i * 4194304 + j : j * 4194304 + i;
        if (seen.has(pk)) continue;
        pairsTested++;
        const oi = i * 9, oj = j * 9;
        // Vertex distances: every vertex of one triangle against the other plane.
        let mx = 0;
        for (let k = 0; k < 3; k++) {
          mx = Math.max(mx, Math.abs(N[j * 3] * P[oi + k * 3] + N[j * 3 + 1] * P[oi + k * 3 + 1] + N[j * 3 + 2] * P[oi + k * 3 + 2] - D[j]));
        }
        if (mx > 0.5) continue;
        // Project along the dominant axis of normal i.
        const ax = Math.abs(N[i * 3]), ay = Math.abs(N[i * 3 + 1]), az = Math.abs(N[i * 3 + 2]);
        const drop = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
        const u = drop === 0 ? 1 : 0, v = drop === 2 ? 1 : 2;
        const mk = (o, off) => [P[o + off * 3 + u], P[o + off * 3 + v], P[o + off * 3 + drop]];
        const A = [mk(oi, 0), mk(oi, 1), mk(oi, 2)];
        let B = [mk(oj, 0), mk(oj, 1), mk(oj, 2)];
        const ar = (T) => (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[1][1] - T[0][1]) * (T[2][0] - T[0][0]);
        let A2 = A;
        if (ar(A2) < 0) A2 = [A[0], A[2], A[1]];
        if (ar(B) < 0) B = [B[0], B[2], B[1]];
        const clip = clipTri(A2, B);
        if (clip.length < 3) continue;
        let area2 = 0;
        for (let k = 0; k < clip.length; k++) { const p = clip[k], q = clip[(k + 1) % clip.length]; area2 += p[0] * q[1] - q[0] * p[1]; }
        const area = Math.abs(area2) / 2 / Math.max(1e-6, Math.abs(N[i * 3 + drop]));
        if (area < MIN_AREA) continue;
        // Separation over the overlap polygon (3D point on plane i vs plane j).
        let sep = 0, cxm = 0, cym = 0, czm = 0;
        for (const p of clip) {
          const q = [0, 0, 0];
          q[u] = p[0]; q[v] = p[1]; q[drop] = (D[i] - N[i * 3 + u] * p[0] - N[i * 3 + v] * p[1]) / N[i * 3 + drop];
          sep = Math.max(sep, Math.abs(N[j * 3] * q[0] + N[j * 3 + 1] * q[1] + N[j * 3 + 2] * q[2] - D[j]));
          cxm += q[0]; cym += q[1]; czm += q[2];
        }
        if (sep > TOL) continue;
        seen.add(pk);
        // Looks the same? (same material + same colour/tile) -> harmless.
        // Downward faces at ground level are under the ground (the ground layers lie above them): never seen.
        if (N[i * 3 + 1] < -0.9 && cym / clip.length < 0.1) { under++; continue; }
        const lookSame = M[i] === M[j] && K[i] === K[j];
        if (lookSame) { same++; continue; }
        // A depth bias (polygonOffset) of at least 3 units between the two layers settles who is on top.
        if (Math.abs(F[i] - F[j]) >= 3) { biased++; continue; }
        bad++;
        const la = labels[L[i]], lb = labels[L[j]];
        let ka = `${la}[${hex(K[i])}]`, kb = `${lb}[${hex(K[j])}]`;
        if (ka > kb) [ka, kb] = [kb, ka];
        const horiz = Math.abs(N[i * 3 + 1]) > 0.9;
        const lvl = horiz ? `y~${(cym / clip.length).toFixed(2)}` : `n=(${N[i * 3].toFixed(0)},${N[i * 3 + 2].toFixed(0)})`;
        const g = `${ka}  <->  ${kb}  @ ${lvl}`;
        let e = groups.get(g);
        if (!e) { e = { n: 0, area: 0, minSep: 1, maxSep: 0, at: [], src: [la, lb] }; groups.set(g, e); }
        e.n++;
        e.area += area;
        e.minSep = Math.min(e.minSep, sep);
        e.maxSep = Math.max(e.maxSep, sep);
        if (e.at.length < 3) e.at.push(`(${(cxm / clip.length).toFixed(1)}, ${(cym / clip.length).toFixed(2)}, ${(czm / clip.length).toFixed(1)})`);
      }
    }
  }
  return { groups, pairsTested, same, bad, biased, under };
}

// ---------------------------------------------------------------------------------------------------------------------------

let data;
if (flag('use-cache') && CACHE && fs.existsSync(CACHE)) data = loadCache(CACHE);
else {
  data = await collect();
  if (CACHE) saveCache(CACHE, data);
}
const res = detect(data);
const sorted = [...res.groups.entries()].sort((a, b) => b[1].area - a[1].area);
const bySource = new Map();
for (const [, e] of sorted) {
  const k = [...new Set(e.src)].sort().join(' + ');
  const s = bySource.get(k) ?? { groups: 0, pairs: 0, area: 0 };
  s.groups++; s.pairs += e.n; s.area += e.area;
  bySource.set(k, s);
}
console.log(`\nz-fight audit: tol ${TOL} m, min overlap ${MIN_AREA} m2, ${data.total} triangles`);
console.log(`pairs coplanar+overlapping: ${res.bad + res.same} (same look, harmless: ${res.same}; settled by polygonOffset: ${res.biased}; underground bottoms: ${res.under}); SIGNIFICANT pairs: ${res.bad} in ${res.groups.size} groups`);
console.log('\n== by source ==');
for (const [k, s] of [...bySource.entries()].sort((a, b) => b[1].area - a[1].area)) console.log(`${String(s.pairs).padStart(7)} pairs  ${s.area.toFixed(1).padStart(8)} m2  ${s.groups} groups  ${k}`);
console.log(`\n== top ${TOP} groups (by overlapping area) ==`);
for (const [g, e] of sorted.slice(0, TOP)) console.log(`${String(e.n).padStart(6)}x ${e.area.toFixed(2).padStart(8)} m2  sep ${(e.minSep * 100).toFixed(1)}-${(e.maxSep * 100).toFixed(1)} cm  ${g}\n         e.g. ${e.at.join(' ')}`);
process.exit(res.bad > 0 ? 1 : 0);
