/**
 * Reachability check for parkour layouts: `npm run check:reach` (PAKET_P1_PARKOUR.md section 5). Pakai: `npm run check:reach`.
 *
 * Reads the footholds / roofs / coins of every registered level from DATA (src/world/**\/ *Data.ts, no browser) and works
 * out which footholds the player reaches at each rhythm level 0..4, using only numbers from src/config/parkour.ts
 * (apex per level, air jump, mantle, gravities, friendly collider edge) and src/player/PlayerConfig.ts (capsule, run speed).
 *
 * REACH MODEL (conservative; level L = hard cap: the player holds rhythm level L when taking off; with the air jump
 * unless a mode says otherwise). A hop A -> B with tops hA, hB:
 *   vertical   jump  J = apex(L) (+ doubleJumpApex with the air jump, pressed at the top of the first jump)
 *              mantle M = clamp(thickness(B) + probeHeight, 0, capsuleHeight + maxAboveHead)   (cantilever slabs are
 *                         only grabbed while the chest probe hits their face; solid piers/walls give the full 1.6 m)
 *              reachable when hB <= hA + J + M   (a drop, hB <= hA, always passes this part)
 *   horizontal gap = distance between the two top outlines, each widened by Parkour.world.friendly (0 when they overlap).
 *              Take-off speed v = runSpeed of Superglen. Rise time t_up from launchSpeed(apex)/gravityUp (+ the air jump's),
 *              fall time from the top with gravityUp * fallMultiplier.
 *              solid  : T = t_up + fall(top -> hB) when the top is above hB (landing),   T = t_up when only the mantle
 *                       gets there (grab at the apex);  travel = v * T * (1 - safety)  must be >= gap
 *              tight  : the generous estimate (fall continues to hB - M, and the wall is grabbed from capsule radius +
 *                       mantle.reach away): travel = v * T_gen >= gap - radius - mantle.reach.  Only this => "tight jump" warning.
 *   from the ground the player can walk to the foot of anything, so ground -> B has no horizontal limit.
 *   bounce drums: a landing there lifts the level by one but never above the cap, so under the hard-cap model they only
 *   matter as the way a child GETS the level; the flag is printed, not used for extra reach.
 * Calibrated by the self-tests below (Menara Irama, drums, mini house, mini ruko) which run first.
 *
 * Exit code: 0 = all good (warnings allowed), 1 = at least one error or a failed self-test. `--strict` turns waived
 * findings and tight jumps into errors. `--quiet` prints only problems.
 */
import { Parkour, launchSpeed } from '../src/config/parkour';
import { PlayerConfig, ModeTunings } from '../src/player/PlayerConfig';
import { topOf, type Foothold, type LevelReachData } from '../src/world/kits/ParkourData';
import { ARENA_REACH } from '../src/world/arena/ArenaData';
import { STREET_REACH } from '../src/world/bab1/StreetData';

const R = Parkour.reachModel;
const MAX = Parkour.levels.length - 1;
const STRICT = process.argv.includes('--strict');
const QUIET = process.argv.includes('--quiet');
/** `--why=id1,id2`: print the cheapest route (every hop with its gap) to these footholds. */
const WHY = (process.argv.find((a) => a.startsWith('--why='))?.slice(6) ?? '').split(',').filter(Boolean);
const GROUND = 'ground';
const RUN = ModeTunings.superglen.runSpeed;
const HEAD = PlayerConfig.height;
const MANTLE_UP = HEAD + Parkour.mantle.maxAboveHead;
const FRIENDLY = Parkour.world.friendly;

// ---- Model parameters --------------------------------------------------------------------------------------------------

interface Mode {
  apex: number;
  air: boolean;
  speed: number;
}
const modeFor = (level: number, air: boolean): Mode => ({ apex: Parkour.levels[level].apex, air, speed: RUN });
const glenMode: Mode = { apex: Parkour.glenApex, air: false, speed: ModeTunings.glen.runSpeed };

// ---- Geometry ------------------------------------------------------------------------------------------------------------

type P2 = [number, number];

function outline(f: Foothold): P2[] {
  const [cx, , cz] = f.center;
  if (f.round) {
    const r = f.size[0] / 2 + FRIENDLY;
    return Array.from({ length: 16 }, (_, i): P2 => [cx + Math.cos((i / 16) * Math.PI * 2) * r, cz + Math.sin((i / 16) * Math.PI * 2) * r]);
  }
  const hw = f.size[0] / 2 + FRIENDLY;
  const hd = f.size[2] / 2 + FRIENDLY;
  const c = Math.cos(f.yaw ?? 0);
  const s = Math.sin(f.yaw ?? 0);
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as P2[]).map(([x, z]): P2 => [cx + x * c - z * s, cz + x * s + z * c]);
}

function segDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}
function inside(p: P2, poly: P2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function polyDist(a: P2[], b: P2[]): number {
  if (a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))) return 0;
  let best = Infinity;
  for (const [pa, pb] of [[a, b], [b, a]] as [P2[], P2[]][]) {
    for (const p of pa) for (let i = 0; i < pb.length; i++) best = Math.min(best, segDist(p, pb[i], pb[(i + 1) % pb.length]));
  }
  // Crossing edges without a vertex inside (a plus shape): distance 0.
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (segCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return 0;
  return best;
}
function segCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

// ---- Hop model -------------------------------------------------------------------------------------------------------------

const tUp = (apex: number): number => launchSpeed(apex) / Parkour.gravityUp;
const tFall = (drop: number): number => Math.sqrt((2 * Math.max(0, drop)) / (Parkour.gravityUp * Parkour.fallMultiplier));

type Verdict = 'ok' | 'tight' | 'no';

interface Hop {
  verdict: Verdict;
  /** Height still missing (m) when the vertical part fails, else 0. */
  short: number;
  gap: number;
}

/** Can the player get from a standing top (hA, outline gapA) onto B in this mode? `gap` is the horizontal distance of the outlines. */
function hop(hA: number, B: Foothold, gap: number, m: Mode): Hop {
  const hB = topOf(B);
  const thick = B.size[1];
  const mantle = Math.max(0, Math.min(MANTLE_UP, thick + Parkour.mantle.probeHeight));
  const jump = m.apex + (m.air ? Parkour.doubleJumpApex : 0);
  const short = hB - (hA + jump + mantle) - R.eps;
  if (short > 0) return { verdict: 'no', short, gap };
  const rise = tUp(m.apex) + (m.air ? tUp(Parkour.doubleJumpApex) : 0);
  const topY = hA + jump;
  const landing = topY >= hB - R.eps;
  const tCons = landing ? rise + tFall(topY - hB) : rise;
  if (m.speed * tCons * (1 - R.safety) >= gap) return { verdict: 'ok', short: 0, gap };
  const tGen = rise + tFall(topY - (hB - mantle));
  const need = Math.max(0, gap - PlayerConfig.radius - Parkour.mantle.reach);
  if (m.speed * tGen >= need) return { verdict: 'tight', short: 0, gap };
  return { verdict: 'no', short: 0, gap };
}

// ---- Search -------------------------------------------------------------------------------------------------------------------

interface Result {
  /** Footholds reached (id -> path of ids from the start, and whether a hop on it is tight). */
  reached: Map<string, { path: string[]; tight: string[]; hops: string[] }>;
}

function analyse(data: LevelReachData, m: Mode): Result {
  const byId = new Map<string, Foothold>();
  for (const f of data.footholds) byId.set(f.id, f);
  const outlines = new Map<string, P2[]>();
  const top = (id: string): number => (id === GROUND ? 0 : topOf(byId.get(id) as Foothold));
  const gapOf = (a: string, b: string): number => {
    if (a === GROUND || b === GROUND) return 0; // the ground can be walked to the foot of anything
    if (!outlines.has(a)) outlines.set(a, outline(byId.get(a) as Foothold));
    if (!outlines.has(b)) outlines.set(b, outline(byId.get(b) as Foothold));
    return polyDist(outlines.get(a) as P2[], outlines.get(b) as P2[]);
  };
  // Dijkstra on (number of tight hops * 1000 + number of hops): solid routes win over tight ones.
  const cost = new Map<string, number>();
  const reached = new Map<string, { path: string[]; tight: string[]; hops: string[] }>();
  const queue: string[] = [];
  for (const s of data.starts) {
    cost.set(s, 0);
    reached.set(s, { path: [s], tight: [], hops: [] });
    queue.push(s);
  }
  while (queue.length) {
    queue.sort((a, b) => (cost.get(a) as number) - (cost.get(b) as number));
    const a = queue.shift() as string;
    const ra = reached.get(a) as { path: string[]; tight: string[]; hops: string[] };
    for (const B of data.footholds) {
      if (B.id === a) continue;
      if ((B.slopeDeg ?? 0) > Parkour.world.roofMaxSlopeDeg) continue;
      const h = hop(top(a), B, gapOf(a, B.id), m);
      if (h.verdict === 'no') continue;
      const c = (cost.get(a) as number) + 1 + (h.verdict === 'tight' ? 1000 : 0);
      if (c < (cost.get(B.id) ?? Infinity)) {
        cost.set(B.id, c);
        reached.set(B.id, {
          path: [...ra.path, B.id],
          tight: h.verdict === 'tight' ? [...ra.tight, `${a}->${B.id}`] : ra.tight,
          hops: [...ra.hops, `${a}(${top(a).toFixed(2)}) -> ${B.id}(${topOf(B).toFixed(2)}) gap ${h.gap.toFixed(2)} m ${h.verdict}`],
        });
        if (!queue.includes(B.id)) queue.push(B.id);
      }
    }
  }
  return { reached };
}

// ---- Checks ---------------------------------------------------------------------------------------------------------------------

interface Problem {
  level: 'error' | 'warn';
  msg: string;
}

interface Analysis {
  /** air -> level -> result */
  air: Result[];
  noAir: Result[];
}
function analyseAll(data: LevelReachData): Analysis {
  const a: Analysis = { air: [], noAir: [] };
  for (let l = 0; l <= MAX; l++) {
    a.air.push(analyse(data, modeFor(l, true)));
    a.noAir.push(analyse(data, modeFor(l, false)));
  }
  return a;
}
/** Lowest level (0..4) at which `id` is reached, or -1. */
function minLevel(rs: Result[], id: string): number {
  for (let l = 0; l <= MAX; l++) if (rs[l].reached.has(id)) return l;
  return -1;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function checkLevel(data: LevelReachData, out: Problem[]): void {
  const A = analyseAll(data);
  const byId = new Map(data.footholds.map((f) => [f.id, f]));
  const err = (msg: string): void => void out.push({ level: 'error', msg: `[${data.id}] ${msg}` });
  const warn = (msg: string): void => void out.push({ level: 'warn', msg: `[${data.id}] ${msg}` });
  const known = (id: string): boolean => id === GROUND || byId.has(id);

  for (const s of data.starts) if (!known(s)) err(`titik mulai tidak dikenal / unknown start "${s}"`);
  for (const f of data.footholds) {
    if ((f.slopeDeg ?? 0) > Parkour.world.roofMaxSlopeDeg) err(`pijakan "${f.id}" terlalu miring / too steep: ${f.slopeDeg?.toFixed(0)} deg > ${Parkour.world.roofMaxSlopeDeg}`);
  }
  const tightWarn = (what: string, level: number, r: Result, id: string): void => {
    const t = r.reached.get(id)?.tight ?? [];
    if (t.length) warn(`lompatan mepet / tight jump for ${what} at level ${level}: ${t.join(', ')} (only inside the generous estimate)`);
  };

  // ---- table rows
  type Row = { name: string; id: string; level: number; kind: string };
  const rows: Row[] = [];

  // Buildings: route exists, roofs reachable at the assigned level, class rules.
  for (const b of data.buildings) {
    const cls = R.classes[b.class];
    if (b.wall < cls.minWall || b.wall > cls.maxWall) err(`bangunan "${b.id}" (${b.class}) tinggi dinding ${b.wall.toFixed(2)} m di luar ${cls.minWall}-${cls.maxWall} m / wall height outside the class range`);
    if (b.level < cls.minLevel || b.level > cls.maxLevel) err(`bangunan "${b.id}" (${b.class}) dirancang untuk tingkat ${b.level}, kelas ${b.class} = tingkat ${cls.minLevel}-${cls.maxLevel} / assigned level outside the class range`);
    if (!b.roofIds.length) err(`bangunan "${b.id}" tidak punya atap / building has no roof`);
    for (const rid of b.roofIds) {
      if (!byId.has(rid)) {
        err(`bangunan "${b.id}": atap "${rid}" tidak ada di daftar pijakan / roof id not in footholds`);
        continue;
      }
      rows.push({ name: `${b.id}/${rid}`, id: rid, level: b.level, kind: 'roof' });
      const mAir = minLevel(A.air, rid);
      if (mAir < 0) {
        err(`bangunan "${b.id}" atap "${rid}": TIDAK ADA rute dari tanah ke atap pada tingkat apa pun / no route from the ground to the roof at any level`);
        continue;
      }
      if (mAir > b.level) {
        err(`bangunan "${b.id}" atap "${rid}": tidak terjangkau di tingkat ${b.level} (terendah ${mAir}) / not reachable at its assigned level ${b.level} (lowest ${mAir}); rute terbaik: ${A.air[mAir].reached.get(rid)?.path.join(' > ')}`);
      } else {
        tightWarn(`${b.id}/${rid}`, b.level, A.air[b.level], rid);
      }
      if (mAir < cls.minLevel || mAir > cls.maxLevel) {
        const msg = `bangunan "${b.id}" (${b.class}) rute ke atap butuh tingkat ${mAir} (dengan lompat ganda; tanpa: ${minLevel(A.noAir, rid)}), kelas ${b.class} harus ${cls.minLevel}-${cls.maxLevel} / route difficulty does not match the building class`;
        if (b.waiver && !STRICT) warn(`${msg}. WAIVED: ${b.waiver}`);
        else err(msg + (b.waiver ? ` (waiver ignored by --strict)` : ''));
      }
    }
  }

  // Coins / rewards.
  for (const c of data.coins) {
    let onId = c.on;
    if (!onId) {
      let best: Foothold | undefined;
      const pt: P2 = [c.pos[0], c.pos[2]];
      for (const f of data.footholds) {
        if (topOf(f) > c.pos[1] + 0.05 || !inside(pt, outline(f))) continue;
        if (!best || topOf(f) > topOf(best)) best = f;
      }
      onId = best?.id;
    }
    if (onId === GROUND) {
      // A guide coin on the street: always reachable (the ground can be walked), but it must lie at normal coin height.
      if (c.pos[1] > 3) err(`koin "${c.id}" di tanah terlalu tinggi / ground coin too high: ${c.pos[1].toFixed(2)} m`);
      rows.push({ name: `coin ${c.id}`, id: GROUND, level: 0, kind: 'coin' });
      continue;
    }
    const f = onId ? byId.get(onId) : undefined;
    if (!f) {
      err(`koin "${c.id}" tidak berada di atas pijakan mana pun / coin is not over any foothold (pos ${c.pos.map((v) => v.toFixed(2)).join(', ')})`);
      continue;
    }
    const owner = data.buildings.find((b) => b.id === f.building);
    const lv = c.level ?? owner?.level ?? MAX;
    rows.push({ name: `coin ${c.id}`, id: f.id, level: lv, kind: 'coin' });
    const hi = f.peak ?? topOf(f);
    if (c.pos[1] > hi + (Parkour.levels[lv].apex + Parkour.doubleJumpApex)) err(`koin "${c.id}" terlalu tinggi di atas "${f.id}" / coin too high above its foothold: ${(c.pos[1] - hi).toFixed(2)} m`);
    if (c.pos[1] < topOf(f) - 0.3) err(`koin "${c.id}" tertanam di bawah "${f.id}" / coin is below its foothold top`);
    const m = minLevel(A.air, f.id);
    if (m < 0 || m > lv) err(`koin "${c.id}" di "${f.id}": tidak terjangkau di tingkat ${lv} (terendah ${m < 0 ? 'tidak ada' : m}) / not reachable at level ${lv}`);
    else tightWarn(`coin ${c.id}`, lv, A.air[lv], f.id);
  }

  // Intended gates.
  for (const g of data.gates) {
    if (!byId.has(g.foothold)) {
      err(`gerbang: pijakan "${g.foothold}" tidak ada / gate foothold unknown`);
      continue;
    }
    rows.push({ name: `gate ${g.foothold}`, id: g.foothold, level: g.level ?? MAX, kind: 'gate' });
    const m = minLevel(A.air, g.foothold);
    if (g.level !== undefined && (m < 0 || m > g.level)) err(`gerbang "${g.foothold}": tidak terjangkau di tingkat ${g.level} (terendah ${m < 0 ? 'tidak ada' : m}) / not reachable at its level`);
    if (g.notBelowLevel !== undefined && m >= 0 && m < g.notBelowLevel) err(`gerbang "${g.foothold}": sudah terjangkau di tingkat ${m}, seharusnya tidak di bawah ${g.notBelowLevel} / reachable below its intended gate level ${g.notBelowLevel}`);
    if (g.level !== undefined && m >= 0 && m <= g.level) tightWarn(`gate ${g.foothold}`, g.level, A.air[g.level], g.foothold);
  }

  // Glen footholds.
  const glenFor = data.footholds.filter((f) => f.glen);
  if (glenFor.length) {
    const r = analyse(data, glenMode);
    for (const f of glenFor) if (!r.reached.has(f.id)) err(`pijakan "${f.id}" harus bisa dicapai Glen (tanpa lompat ganda dan irama) / not reachable by Glen`);
  }

  // Rule 4: green roof links.
  for (const [a, b] of data.greenLinks ?? []) {
    const fa = byId.get(a);
    const fb = byId.get(b);
    if (!fa || !fb) {
      err(`rute hijau: "${a}" atau "${b}" tidak ada / unknown foothold in green link`);
      continue;
    }
    const gap = polyDist(outline(fa), outline(fb));
    const dh = Math.abs(topOf(fa) - topOf(fb));
    if (gap > R.greenMaxGap) err(`rute hijau ${a} - ${b}: jarak mendatar ${gap.toFixed(2)} m > ${R.greenMaxGap} m / horizontal gap too wide`);
    if (dh > R.greenMaxHeightDiff) err(`rute hijau ${a} - ${b}: selisih tinggi ${dh.toFixed(2)} m > ${R.greenMaxHeightDiff} m / height difference too big`);
  }

  if (WHY) {
    for (const id of WHY) {
      const m = minLevel(A.air, id);
      if (m < 0) continue;
      console.log(`  why ${id}: level ${m}`);
      for (const h of A.air[m].reached.get(id)?.hops ?? []) console.log(`     ${h}`);
    }
  }
  if (!QUIET) printTable(data, A, rows);
}

function printTable(data: LevelReachData, A: Analysis, rows: { name: string; id: string; level: number; kind: string }[]): void {
  console.log(`\n== ${data.id}: ${data.footholds.length} pijakan / footholds, ${data.buildings.length} bangunan, ${data.coins.length} koin ==`);
  const head = `${pad('target', 26)}${pad('lvl', 4)}${[0, 1, 2, 3, 4].map((l) => pad(`L${l}`, 4)).join('')}${pad('min', 5)}${pad('min-noair', 10)}rute (tingkat terendah) / route`;
  console.log(head);
  for (const r of rows) {
    const marks = [0, 1, 2, 3, 4].map((l) => pad(A.air[l].reached.has(r.id) ? (A.air[l].reached.get(r.id)?.tight.length ? '~' : 'v') : 'x', 4));
    const m = minLevel(A.air, r.id);
    const mn = minLevel(A.noAir, r.id);
    const path = m >= 0 ? (A.air[m].reached.get(r.id)?.path ?? []).filter((p) => p !== GROUND).join(' > ') : '-';
    console.log(`${pad(r.name, 26)}${pad(String(r.level), 4)}${marks.join('')}${pad(m < 0 ? '-' : String(m), 5)}${pad(mn < 0 ? '-' : String(mn), 10)}${path}`);
  }
  console.log('  v = bisa / reachable, x = tidak / not, ~ = lompatan mepet / tight jump, lvl = target level');
}

// ---- Self-tests (calibration against what the bot verified in the browser) ----------------------------------------------------------

function selfTest(): Problem[] {
  const out: Problem[] = [];
  const fail = (msg: string): void => void out.push({ level: 'error', msg: `SELF-TEST ${msg}` });
  const expect = (cond: boolean, msg: string): void => {
    if (!cond) fail(msg);
  };
  const A = analyseAll(ARENA_REACH);
  const byId = new Map(ARENA_REACH.footholds.map((f) => [f.id, f]));
  const reaches = (rs: Result[], l: number, id: string): boolean => rs[l].reached.has(id);

  // Menara Irama: floor tops and "floor N at level N, not at N-1" with a short fall of 0.15..0.5 m.
  const tops = [3.0, 7.65, 12.85, 18.7, 25.3];
  for (let n = 0; n < 5; n++) {
    const id = `floor${n}`;
    const t = topOf(byId.get(id) as Foothold);
    expect(Math.abs(t - tops[n]) < 0.01, `${id} top ${t.toFixed(3)} != ${tops[n]}`);
    expect(reaches(A.air, n, id), `${id} must be reachable at level ${n}`);
    if (n > 0) {
      expect(!reaches(A.air, n - 1, id), `${id} must NOT be reachable at level ${n - 1}`);
      const below = byId.get(`floor${n - 1}`) as Foothold;
      const h = hop(topOf(below), byId.get(id) as Foothold, 0, modeFor(n - 1, true));
      expect(h.short >= R.gateShortMin && h.short <= R.gateShortMax, `${id}: short by ${h.short.toFixed(2)} m at level ${n - 1}, expected ${R.gateShortMin}-${R.gateShortMax}`);
    }
  }
  // Drums and their high ledge: only level 3.
  expect(Math.abs(topOf(byId.get('drumLedge') as Foothold) - 6.95) < 0.01, 'drumLedge top must be 6.95');
  expect(reaches(A.air, 3, 'drumLedge') && !reaches(A.air, 2, 'drumLedge'), 'drumLedge: reachable at level 3, not at level 2');
  expect(reaches(A.air, 0, 'drum3'), 'drums are reachable at level 0');
  // Mini house: levels 0 and 1, even without the air jump.
  expect(reaches(A.air, 0, 'houseRoof') && reaches(A.air, 1, 'houseRoof') && reaches(A.noAir, 0, 'houseRoof'), 'houseRoof: reachable at level 0 and 1, also without the air jump');
  expect(Math.abs(topOf(byId.get('houseAwning') as Foothold) - 2.6) < 0.01, 'houseAwning top must be 2.6');
  // Mini ruko (class ruko): one 0.9 m crate, balcony 5.2 m above it. Not at 0 or 1, level 2 with the air jump; without it
  // level 3 fails (plain 5.0 m) and level 4 works (plain 5.8 m).
  expect(Math.abs(topOf(byId.get('rukoBalcony') as Foothold) - 6.1) < 0.01, 'rukoBalcony top must be 6.1');
  expect(Math.abs(topOf(byId.get('rukoRoof') as Foothold) - 7.55) < 0.01, 'rukoRoof eave must be 7.55');
  expect(!reaches(A.air, 0, 'rukoRoof') && !reaches(A.air, 1, 'rukoRoof'), 'rukoRoof: NOT reachable at level 0 or 1');
  expect(reaches(A.air, 2, 'rukoRoof'), 'rukoRoof: reachable at level 2 with the air jump');
  expect(!reaches(A.noAir, 3, 'rukoRoof') && reaches(A.noAir, 4, 'rukoRoof'), 'rukoRoof: without the air jump level 3 fails and level 4 works');
  // Model sanity: tight jumps must not appear in the calibrated arena.
  for (const f of ARENA_REACH.footholds) for (let l = 0; l <= MAX; l++) {
    const t = A.air[l].reached.get(f.id)?.tight ?? [];
    if (t.length && l === (ARENA_REACH.gates.find((g) => g.foothold === f.id)?.level ?? -1)) fail(`${f.id} is only a tight jump at its level ${l}: ${t.join(', ')}`);
  }
  // Green-link rule on synthetic data.
  const synth: LevelReachData = {
    id: 'synthetic',
    starts: ['ground'],
    footholds: [
      { id: 'a', kind: 'other', center: [0, 1.5, 0], size: [3, 3, 3] },
      { id: 'b', kind: 'other', center: [7, 1.5, 0], size: [3, 3, 3] },
      { id: 'c', kind: 'other', center: [3, 3, 0], size: [3, 6, 3] },
    ],
    buildings: [],
    coins: [],
    gates: [],
    greenLinks: [['a', 'b'], ['a', 'c']],
  };
  const sp: Problem[] = [];
  checkLevel(synth, sp);
  const errs = sp.filter((p) => p.level === 'error').map((p) => p.msg);
  expect(errs.some((m) => m.includes('a - b') && m.includes('jarak mendatar')), 'green gap rule must flag a - b (gap 4 m)');
  expect(errs.some((m) => m.includes('a - c') && m.includes('selisih tinggi')), 'green height rule must flag a - c (3 m)');
  return out;
}

// ---- Main -------------------------------------------------------------------------------------------------------------------------

/** Registered levels. Add the Chapter 1 street here once it has a *Data.ts. */
const LEVELS: LevelReachData[] = [ARENA_REACH, STREET_REACH];
const PENDING: string[] = [];

function main(): void {
  const problems: Problem[] = [];
  // Self-tests first (silently: their synthetic table is not interesting).
  const realLog = console.log;
  console.log = (): void => {};
  const st = selfTest();
  console.log = realLog;
  if (st.length) {
    for (const p of st) console.error(`ERROR ${p.msg}`);
    console.error('\nSelf-test GAGAL: model jangkauan tidak cocok dengan arena yang sudah diuji di browser / the reach model no longer reproduces the verified arena results (did src/config/parkour.ts change?).');
    process.exit(1);
  }
  if (!QUIET) console.log('Self-test OK (Menara Irama, tambur, rumah mini, ruko mini, aturan rute hijau).');
  for (const d of LEVELS) checkLevel(d, problems);
  for (const id of PENDING) problems.push({ level: 'warn', msg: `[${id}] belum ada data jangkauan / no reach data yet: skipped` });

  console.log('');
  let errors = 0;
  let warns = 0;
  for (const p of problems) {
    const tight = STRICT && p.level === 'warn' && (p.msg.includes('tight jump') || p.msg.includes('WAIVED'));
    if (p.level === 'error' || tight) {
      errors++;
      console.log(`ERROR ${p.msg}`);
    } else {
      warns++;
      console.log(`WARN  ${p.msg}`);
    }
  }
  console.log(`\n${errors === 0 ? 'LULUS / PASS' : 'GAGAL / FAIL'}: ${errors} error, ${warns} warning`);
  process.exit(errors === 0 ? 0 : 1);
}

main();
