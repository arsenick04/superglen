import { Parkour } from '../../config/parkour';
import type { Coin as ReachCoin } from '../kits/ParkourData';
import type { CityBuilding, CityLayout, DistrictId } from './CityData';

/**
 * KOTA BOTANICA, PACKAGE D3: where the extra content stands, as PURE DATA (no three.js, no DOM). Generated from the finished
 * city layout (`generateCity` calls `generatePlaces` last) with the same seeded generator, so every device and every run gets
 * the same coins, bikes, residents, missions and signposts.
 *
 *  - COINS (about 200): street trails, plaza ring, parks, rooftops, the climbing pieces that lead there, the tops of the five
 *    landmarks, and floating flight-only trails. `reachCoins` is what `npm run check:reach` proves reachable (ground coins
 *    `on: 'ground'`, roofs on their roof foothold, flight trails only checked for height).
 *  - BIKES (3), parked: Rumah Glen, the plaza next to the race resident, the east avenue.
 *  - RESIDENTS (8) and their MISSIONS (8): see `buildMissions`. All visible text is here (short, text only, no voice yet).
 *  - SIGNPOSTS (8): main crossings and the plaza; arms to six places. No arm and no post points at the hidden old building.
 *
 * Ground things avoid every collider, tree, lamp, bench and pond through `free` (so nothing hangs inside a wall).
 */

export type CoinKind = 'street' | 'park' | 'roof' | 'route' | 'tower' | 'fly';

export interface CityCoin {
  /** Stable id `group.k` (saved in the save file once taken). */
  id: string;
  x: number;
  y: number;
  z: number;
  chunk: number;
  kind: CoinKind;
  /** Floating trail: only reachable by flying. */
  flight?: boolean;
}

export interface CityBike {
  id: string;
  x: number;
  /** Ground height (the hill bike stands on the hill top); 0 when omitted. */
  y?: number;
  z: number;
  yaw: number;
}

export type ItemIcon = 'ball' | 'apple' | 'balloon' | 'cat' | 'bell' | 'flower' | 'letter' | 'bike';

export interface MissionItem {
  x: number;
  y: number;
  z: number;
}

export interface CityMission {
  id: string;
  giver: string;
  icon: ItemIcon;
  /** collect: take every item (then back to the giver when `returns`); reach: take the one item; ride: arrive on a bike; deliver: talk to `deliverTo`. */
  kind: 'collect' | 'reach' | 'ride' | 'deliver';
  items: MissionItem[];
  /** Ground target (ride). */
  target?: { x: number; z: number };
  deliverTo?: string;
  returns: boolean;
  /** Lines (Indonesian, text only, each under about 8 words). */
  offer: string;
  remind: string;
  done: string;
  reward: number;
}

export interface CityResident {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;
  district: DistrictId;
  /** Clothes and hair colours. */
  color: number;
  hair: number;
  mission: string;
}

export type SignIcon = 'home' | 'school' | 'basket' | 'clock' | 'coin' | 'cross';

export interface SignDest {
  id: string;
  name: string;
  icon: SignIcon;
  color: number;
  x: number;
  z: number;
}

export interface CitySign {
  id: string;
  x: number;
  z: number;
  /** Destinations (indices into `signDests`) this post points at. */
  arms: number[];
}

export interface CityPlaces {
  coins: CityCoin[];
  bikes: CityBike[];
  residents: CityResident[];
  missions: CityMission[];
  signs: CitySign[];
  signDests: SignDest[];
  /** Healing with coins (L5): the food stall in the Pasar and the doctor in front of the Rumah Sakit. */
  care: { stall: { x: number; z: number; yaw: number }; doctor: { x: number; z: number; yaw: number } };
  /** Toko Mainan: the ruko on the plaza that became the toy shop: its centre, the facade line, the keeper's spot and facing. */
  shop: { x: number; z: number; yaw: number; face: number; keeper: { x: number; z: number }; facade: { x: number; z: number } };
  /** Coins and mission items for the reach checker. */
  reachCoins: ReachCoin[];
}

/** What the generator needs from CityData (passed in, so this file has no runtime import of it). */
export interface PlacesKit {
  chunkIndex(x: number, z: number): number;
  districtAt(x: number, z: number): { id: DistrictId };
  cellZone(i: number, j: number): [number, number, number, number];
  flyHeight: number;
}

const FACE: readonly (readonly [number, number])[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const r2 = (v: number): number => Math.round(v * 100) / 100;
const GROUND_LIFT = 0.85;

/** Top of the standable roof of a building (hip roofs: the plateau just below the ridge). */
export function roofTop(b: CityBuilding): number {
  const eave = b.base + b.wall;
  return b.roof === 'hip' ? eave + b.roofH * (1 - Parkour.world.roofPlateau) : eave;
}

export function makeFree(L: CityLayout): (x: number, z: number, m: number) => boolean {
  const solids = L.solids.filter((s) => !s.global && s.c[1] + s.s[1] / 2 > 0.25);
  const hills = L.hills.filter((h) => !h.id.startsWith('edgeHill'));
  return (x, z, m) => {
    for (const s of solids) {
      if (s.shape === 'cyl') {
        if (Math.hypot(x - s.c[0], z - s.c[2]) < s.s[0] / 2 + m) return false;
      } else if (Math.abs(x - s.c[0]) < s.s[0] / 2 + m && Math.abs(z - s.c[2]) < s.s[2] / 2 + m) return false;
    }
    for (const t of L.trees) if (Math.hypot(x - t.x, z - t.z) < 0.5 * t.s + 0.6 + m * 0.3) return false;
    for (const l of L.lamps) if (Math.hypot(x - l.x, z - l.z) < 0.6 + m * 0.3) return false;
    for (const b of L.benches) if (Math.abs(x - b.x) < (b.alongX ? 1.2 : 0.6) + m * 0.5 && Math.abs(z - b.z) < (b.alongX ? 0.6 : 1.2) + m * 0.5) return false;
    for (const b of L.banners) if (Math.hypot(x - b.x, z - b.z) < 0.8 + m * 0.3) return false;
    for (const p of L.ponds) if (Math.hypot(x - p.x, z - p.z) < p.r + 1.2) return false;
    for (const h of hills) if (Math.hypot(x - h.x, z - h.z) < h.rBottom + 1.5) return false;
    for (const b of L.buildings) if (Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m) return false;
    return true;
  };
}

export function generatePlaces(L: CityLayout, k: PlacesKit): CityPlaces {
  const free = makeFree(L);
  const chunk = k.chunkIndex;

  /** Nearest free ground spot to (x, z) (a spiral search), or the point itself when nothing is free within `maxR`. */
  const findFree = (x: number, z: number, m = 1.2, maxR = 10): { x: number; z: number } => {
    if (free(x, z, m)) return { x: r2(x), z: r2(z) };
    for (let r = 1; r <= maxR; r += 1) {
      const n = Math.max(8, Math.round(r * 6));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (free(px, pz, m)) return { x: r2(px), z: r2(pz) };
      }
    }
    return { x: r2(x), z: r2(z) };
  };

  const coins: CityCoin[] = [];
  const reach: ReachCoin[] = [];
  const addCoin = (group: string, idx: number, x: number, y: number, z: number, kind: CoinKind, on: string, flight = false): void => {
    const c: CityCoin = { id: `${group}.${idx}`, x: r2(x), y: r2(y), z: r2(z), chunk: chunk(x, z), kind };
    if (flight) c.flight = true;
    coins.push(c);
    reach.push({ id: c.id, pos: [c.x, c.y, c.z], on, ...(flight ? { flight: true } : {}) } as ReachCoin);
  };

  /** A straight trail of ground coins; a coin on a blocked spot is skipped. */
  const trail = (group: string, x0: number, z0: number, x1: number, z1: number, n: number, kind: CoinKind = 'street'): void => {
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (free(x, z, 0.6)) addCoin(group, idx++, x, GROUND_LIFT, z, kind, 'ground');
    }
  };

  // ---- Ground: local street trails (every cell but the plaza and the hill), avenue trails, plaza ring, parks ----------------
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if ((i === 0 && j === 0) || (i === 1 && j === -1)) continue;
      const [x0, x1, z0, z1] = k.cellZone(i, j);
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      trail(`Lv${i}_${j}`, mx, mz - 24, mx, mz - 12, 4);
      trail(`Lh${i}_${j}`, mx + 12, mz, mx + 24, mz, 4);
    }
  }
  for (const c of [-50, 50]) {
    trail(`Av${c}a`, c, -34, c, -22, 4);
    trail(`Av${c}b`, c, 22, c, 34, 4);
    trail(`Ah${c}a`, -34, c, -22, c, 4);
    trail(`Ah${c}b`, 22, c, 34, c, 4);
  }
  {
    let idx = 0;
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(t) * 15.5;
      const z = Math.sin(t) * 15.5;
      if (free(x, z, 0.6)) addCoin('PL', idx++, x, GROUND_LIFT, z, 'park', 'ground');
    }
  }
  const parks = L.pois.filter((p) => p.name === 'Taman');
  parks.forEach((p, n) => {
    let idx = 0;
    for (let a = 0; a < 10 && idx < 3; a++) {
      const t = (a / 10) * Math.PI * 2;
      const x = p.x + Math.cos(t) * 5.5;
      const z = p.z + Math.sin(t) * 5.5;
      if (free(x, z, 0.8)) addCoin(`P${n}`, idx++, x, GROUND_LIFT, z, 'park', 'ground');
    }
  });

  // ---- Up high: rooftops, the pieces that lead there, the landmark tops ------------------------------------------------------
  const roofY = (b: CityBuilding): number => (b.roof === 'hip' ? roofTop(b) + 0.6 : roofTop(b) + GROUND_LIFT);
  const pieceOf = (b: CityBuilding, type: string): CityBuilding['pieces'][number] | undefined => b.pieces.find((p) => p.type === type);
  let nHouse = 0;
  let nRuko = 0;
  let nKiosk = 0;
  for (const b of L.buildings) {
    if (b.kind === 'oldBarongsai') continue;
    if (b.kind === 'tower') {
      const top = roofTop(b) + GROUND_LIFT;
      const d = 1.4;
      [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]].slice(0, 4).forEach(([dx, dz], idx) => addCoin(`T:${b.id}`, idx, b.x + dx, top, b.z + dz, 'tower', b.roofId));
      continue;
    }
    let pick = false;
    if (b.kind === 'house') pick = nHouse++ % 6 === 2;
    else if (b.kind === 'ruko') pick = nRuko++ % 2 === 0;
    else if (b.kind === 'kiosk') pick = nKiosk++ % 4 === 1;
    else pick = true; // school, bank, hospital, warehouse
    if (!pick) continue;
    addCoin(`R:${b.id}`, 0, b.x, roofY(b), b.z, 'roof', b.roofId);
    if (b.kind === 'house') {
      const p = pieceOf(b, 'awning');
      if (p) addCoin(`R:${b.id}`, 1, p.x, p.top + GROUND_LIFT, p.z, 'route', p.id);
    } else if (b.kind !== 'kiosk') {
      const p = pieceOf(b, 'bay');
      if (p) addCoin(`R:${b.id}`, 1, p.x, p.top + GROUND_LIFT, p.z, 'route', p.id);
    }
  }

  // ---- Flight-only trails (high above the streets; the checker only looks at their height) ------------------------------------
  const maxFly = Math.min(k.flyHeight - 1.5, 14.5);
  const flyTrail = (group: string, pts: [number, number, number][]): void => pts.forEach(([x, y, z], i) => addCoin(group, i, x, Math.min(y, maxFly), z, 'fly', 'ground', true));
  {
    // A rising ring round the clock tower.
    const ring: [number, number, number][] = [];
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      ring.push([Math.cos(t) * 15, 8 + a * 0.8, Math.sin(t) * 15]);
    }
    flyTrail('F0', ring);
    // Along the north avenue, over the school roofs.
    const line: [number, number, number][] = [];
    for (let x = -24; x <= 24; x += 8) line.push([x, 10, -50]);
    flyTrail('F1', line);
    // An arc over the market.
    const arc: [number, number, number][] = [];
    for (let a = 0; a < 6; a++) {
      const t = (a / 5) * Math.PI;
      arc.push([100, 7 + Math.sin(t) * 5, -20 + a * 8]);
    }
    flyTrail('F2', arc);
    // Climbing line over the bank district.
    const up: [number, number, number][] = [];
    for (let a = 0; a < 6; a++) up.push([-20 + a * 8, 7 + a * 1.2, 70]);
    flyTrail('F3', up);
  }

  // ---- Bikes -----------------------------------------------------------------------------------------------------------------------
  const bikes: CityBike[] = [];
  const glen = L.buildings.find((b) => b.glen);
  if (glen) {
    const [fx, fz] = FACE[glen.face];
    const half = glen.face < 2 ? glen.d / 2 : glen.w / 2;
    const p = findFree(glen.x + fx * (half + 3.4) - fz * 2.4, glen.z + fz * (half + 3.4) + fx * 2.4, 1.0, 6);
    bikes.push({ id: 'bike-rumah', x: p.x, z: p.z, yaw: Math.atan2(-fz, fx) + Math.PI / 2 });
  }
  const plazaBike = findFree(-15, 11, 1.0, 5);
  bikes.push({ id: 'bike-alun', x: plazaBike.x, z: plazaBike.z, yaw: Math.PI / 2 });
  const eastBike = findFree(64, -18, 1.0, 6);
  bikes.push({ id: 'bike-pasar', x: eastBike.x, z: eastBike.z, yaw: 0 });
  // More bikes, a few in every district (always on free ground away from buildings, trees, lamps and benches; never on a street).
  const near = (x: number, z: number): boolean => bikes.some((b) => Math.hypot(b.x - x, b.z - z) < 12);
  const extra = (id: string, x: number, z: number, yaw: number): void => {
    const p = findFree(x, z, 1.6, 8);
    if (free(p.x, p.z, 1.6) && !near(p.x, p.z)) bikes.push({ id, x: p.x, z: p.z, yaw });
  };
  const schoolB = L.buildings.find((b) => b.kind === 'school');
  if (schoolB) extra('bike-sekolah', schoolB.x + schoolB.w / 2 + 5, schoolB.z + schoolB.d / 2 + 4, 0.8);
  extra('bike-sekolah2', -95, -90, 2.2);
  parks.forEach((pk, n) => extra(`bike-taman${n}`, pk.x + 7, pk.z + 3, 1.2 + n));
  extra('bike-alun2', 14, -14, 3.9);
  extra('bike-pasar2', 100, 40, 1.9);
  extra('bike-pasar3', 105, -42, 0.4);
  extra('bike-bank', 0, 82, 2.6);
  extra('bike-bank2', 30, 105, 5.1);
  extra('bike-rumah2', -82, -30, 4.2);
  extra('bike-rumah3', -100, 62, 1.0);
  extra('bike-rumah4', -62, 100, 2.9);
  // A small discovery: one bike behind the old building on the hill top (the building's door faces south; this is its north side).
  {
    const ob = L.buildings.find((b) => b.kind === 'oldBarongsai');
    if (ob) bikes.push({ id: 'bike-bukit', x: r2(ob.x + 3.2), y: ob.base ?? L.lab.door.y, z: r2(ob.z - ob.d / 2 - 3.4), yaw: 0.5 });
  }

  // ---- Residents and missions --------------------------------------------------------------------------------------------------
  const cellOf = (x: number, z: number): [number, number] => [Math.max(-1, Math.min(1, Math.floor((x + 50) / 100))), Math.max(-1, Math.min(1, Math.floor((z + 50) / 100)))];
  const parkIn = (i: number, j: number): { x: number; z: number } => parks.find((p) => {
    const [ci, cj] = cellOf(p.x, p.z);
    return ci === i && cj === j;
  }) ?? { x: i * 90, z: j * 90 };
  const towerOf = (style: string): CityBuilding => L.buildings.find((b) => b.tower?.style === style) as CityBuilding;
  const bigOf = (kind: string): CityBuilding => L.buildings.find((b) => b.kind === kind) as CityBuilding;
  const frontOf = (b: CityBuilding, out: number): { x: number; z: number } => {
    const [fx, fz] = FACE[b.face];
    const half = b.face < 2 ? b.d / 2 : b.w / 2;
    return { x: b.x + fx * (half + out), z: b.z + fz * (half + out) };
  };

  const missions: CityMission[] = [];
  const residents: CityResident[] = [];
  const person = (id: string, name: string, at: { x: number; z: number }, color: number, hair: number, mission: string, m = 1.4): void => {
    const p = findFree(at.x, at.z, m, 9);
    residents.push({ id, name, x: p.x, z: p.z, yaw: Math.PI, district: k.districtAt(p.x, p.z).id, color, hair, mission });
  };
  const spots = (n: number, from: { x: number; z: number }[]): { x: number; z: number }[] => {
    if (from.length <= n) return from;
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < n; i++) out.push(from[Math.floor((i * (from.length - 1)) / Math.max(1, n - 1))]);
    return out;
  };

  // 1. Kitten: Bu Sari (Perumahan park) lost it; it sits in the north-west park of the Sekolah quarter (about 145 m away).
  {
    const home = parkIn(-1, 0);
    const far = parkIn(-1, -1);
    const kit = findFree(far.x + 4, far.z - 3, 1.2, 8);
    person('sari', 'Bu Sari', { x: home.x + 4, z: home.z + 4 }, 0xe8577e, 0x3a2a22, 'kucing');
    missions.push({ id: 'kucing', giver: 'sari', icon: 'cat', kind: 'collect', items: [{ x: kit.x, y: 0.5, z: kit.z }], returns: true, offer: 'Kucingku hilang! Tolong cari.', remind: 'Cari kucing di taman, ya.', done: 'Kucingku pulang! Terima kasih!', reward: 9 });
  }
  // 2. Apples: Pak Joko (Pasar park) wants 5 from the market stalls.
  {
    const home = parkIn(1, 1);
    const kiosks = L.buildings.filter((b) => b.kind === 'kiosk').filter((b) => {
      const [ci, cj] = cellOf(b.x, b.z);
      return ci === 1 && cj === 0;
    }).sort((a, b) => a.z - b.z || a.x - b.x);
    const front = kiosks.map((b) => findFree(frontOf(b, 2.9).x, frontOf(b, 2.9).z, 0.9, 3));
    const items = spots(5, front).map((p) => ({ x: p.x, y: 0.8, z: p.z }));
    person('joko', 'Pak Joko', { x: home.x - 4, z: home.z + 4 }, 0xf0a020, 0x222222, 'apel');
    missions.push({ id: 'apel', giver: 'joko', icon: 'apple', kind: 'collect', items, returns: true, offer: 'Aku mau 5 apel dari pasar.', remind: 'Ambil apel di pasar, ya.', done: 'Apel segar! Terima kasih!', reward: 8 });
  }
  // 3. Balloons on three roofs in the school quarter; Kak Dimas waits at the west edge of the Pasar (about 80-125 m away).
  {
    const houses = L.buildings.filter((b) => b.kind === 'house' && b.district === 'sekolah').filter((b) => {
      const [ci, cj] = cellOf(b.x, b.z);
      return ci === 0 && cj === -1;
    }).sort((a, b) => a.x - b.x || a.z - b.z);
    const chosen = spots(3, houses.map((b) => ({ x: b.x, z: b.z })));
    const items = chosen.map((c) => {
      const b = houses.find((h) => h.x === c.x && h.z === c.z) as CityBuilding;
      return { x: b.x, y: r2(roofTop(b) + 1.1), z: b.z, roof: b.roofId };
    });
    const start = findFree(58, -30, 1.4, 8);
    person('dimas', 'Kak Dimas', start, 0x3b8fe0, 0x6b3f1d, 'balon');
    missions.push({ id: 'balon', giver: 'dimas', icon: 'balloon', kind: 'collect', items: items.map(({ x, y, z }) => ({ x, y, z })), returns: false, offer: 'Ada 3 balon di atap! Carikan?', remind: 'Balonnya ada di atap rumah.', done: 'Hore! Semua balon ketemu!', reward: 9 });
    items.forEach((it, i) => reach.push({ id: `m.balon.${i}`, pos: [it.x, it.y, it.z], on: it.roof }));
  }
  // 4. The bell on the top of Menara Lonceng.
  {
    const t = towerOf('bell');
    const [fx, fz] = FACE[t.face];
    void fx;
    void fz;
    person('guru', 'Pak Guru', { x: 4, z: -20 }, 0x2f7fd1, 0x888888, 'lonceng'); // north edge of the plaza, about 100 m from the tower
    const y = r2(roofTop(t) + 0.95);
    missions.push({ id: 'lonceng', giver: 'guru', icon: 'bell', kind: 'reach', items: [{ x: t.x, y, z: t.z }], returns: false, offer: 'Bunyikan lonceng di menara!', remind: 'Loncengnya di atas menara.', done: 'Ding dong! Bagus sekali!', reward: 10 });
    reach.push({ id: 'm.lonceng.0', pos: [t.x, y, t.z], on: t.roofId });
  }
  // 5. Bike race to the fountain of the plaza.
  {
    const start = findFree(-62, -26, 1.4, 6); // Perumahan, near the parked bike of Rumah Glen; the fountain is about 90 m away
    const goal = findFree(26, 8.5, 1.2, 4);
    person('lala', 'Mbak Lala', start, 0xf2b632, 0x2a1a14, 'balap');
    missions.push({ id: 'balap', giver: 'lala', icon: 'bike', kind: 'ride', items: [], target: goal, returns: false, offer: 'Balapan! Naik sepeda ke air mancur.', remind: 'Naik sepeda ke air mancur!', done: 'Kamu cepat sekali!', reward: 9 });
  }
  // 6. + 7. A letter from Pak Pos (bank) to Dokter Ani (hospital); she also lost her ball near the coin tower.
  {
    const bank = bigOf('bank');
    const hosp = bigOf('hospital');
    const fb = frontOf(bank, 4.5);
    const fh = frontOf(hosp, 4.5);
    void fb;
    person('pos', 'Pak Pos', { x: 88, z: 2 }, 0x1e9e92, 0x333333, 'surat'); // Pasar; the hospital is about 90 m away
    person('ani', 'Dokter Ani', { x: fh.x - 4, z: fh.z }, 0xffffff, 0x3a2a22, 'bola');
    missions.push({ id: 'surat', giver: 'pos', icon: 'letter', kind: 'deliver', items: [], deliverTo: 'ani', returns: false, offer: 'Tolong antar surat ke dokter.', remind: 'Surat untuk Dokter Ani.', done: 'Suratnya sampai! Terima kasih!', reward: 8 });
    const ct = towerOf('coin');
    const ball = findFree(ct.x - 10, ct.z + 6, 1.2, 8);
    missions.push({ id: 'bola', giver: 'ani', icon: 'ball', kind: 'collect', items: [{ x: ball.x, y: 0.5, z: ball.z }], returns: true, offer: 'Bolaku hilang! Bisa cari?', remind: 'Bolanya dekat menara koin.', done: 'Bolaku ketemu! Terima kasih!', reward: 8 });
  }
  // 8. Flowers on the school field for Kak Bima (he waits on the west side of the plaza, about 95 m away).
  {
    const home = { x: -26, z: 2 };
    const field = L.pois.find((p) => p.name === 'Lapangan' && cellOf(p.x, p.z)[0] === -1 && cellOf(p.x, p.z)[1] === -1) ?? { x: home.x + 40, z: home.z + 40 };
    const items = [[-5, -4], [5, -4], [-5, 4], [5, 4]].map(([dx, dz]) => {
      const p = findFree(field.x + dx, field.z + dz, 1.0, 4);
      return { x: p.x, y: 0.5, z: p.z };
    });
    person('bima', 'Kak Bima', { x: home.x, z: home.z }, 0x7bc96f, 0x1b1b1b, 'bunga');
    missions.push({ id: 'bunga', giver: 'bima', icon: 'flower', kind: 'collect', items, returns: true, offer: 'Aku mau 4 bunga. Bantu?', remind: 'Bunganya ada di lapangan.', done: 'Cantik sekali! Terima kasih!', reward: 8 });
  }
  // Ground items of every mission are proven reachable like coins.
  for (const m of missions) {
    if (m.id === 'balon' || m.id === 'lonceng') continue;
    m.items.forEach((it, i) => reach.push({ id: `m.${m.id}.${i}`, pos: [it.x, it.y + 0.4, it.z], on: 'ground' }));
  }

  // ---- Signposts -----------------------------------------------------------------------------------------------------------------
  const school = bigOf('school');
  const bank = bigOf('bank');
  const hosp = bigOf('hospital');
  const pasar = L.buildings.filter((b) => b.district === 'pasar' && b.kind === 'kiosk');
  const pc = pasar.reduce((a, b) => ({ x: a.x + b.x / pasar.length, z: a.z + b.z / pasar.length }), { x: 0, z: 0 });
  const signDests: SignDest[] = [
    { id: 'home', name: 'Rumah Glen', icon: 'home', color: 0xff6b6b, x: glen?.x ?? -93, z: glen?.z ?? 0 },
    { id: 'school', name: 'Sekolah', icon: 'school', color: 0x4dabf7, x: school.x, z: school.z },
    { id: 'pasar', name: 'Pasar', icon: 'basket', color: 0xff9f43, x: r2(pc.x), z: r2(pc.z) },
    { id: 'alun', name: 'Alun-alun', icon: 'clock', color: 0xf2b632, x: 0, z: 0 },
    { id: 'bank', name: 'Bank', icon: 'coin', color: 0x2ec4b6, x: bank.x, z: bank.z },
    { id: 'rs', name: 'Rumah Sakit', icon: 'cross', color: 0xe53935, x: hosp.x, z: hosp.z },
  ];
  const signs: CitySign[] = [];
  const addSign = (id: string, cands: [number, number][]): void => {
    for (const [x, z] of cands) {
      if (!free(x, z, 1.0)) continue;
      const arms: number[] = [];
      signDests.forEach((d, i) => {
        if (Math.hypot(d.x - x, d.z - z) > 20) arms.push(i);
      });
      signs.push({ id, x: r2(x), z: r2(z), arms });
      return;
    }
  };
  for (const cx of [-50, 50]) {
    for (const cz of [-50, 50]) {
      const sx = -Math.sign(cx);
      const sz = -Math.sign(cz);
      const c: [number, number][] = [];
      for (const o of [6.4, 8.4, 5.2, 9.6]) c.push([cx + sx * o, cz + sz * o], [cx - sx * o, cz + sz * o], [cx + sx * o, cz - sz * o]);
      addSign(`x${cx}_${cz}`, c);
    }
  }
  for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const c: [number, number][] = [];
    for (let o = 0; o < 8; o++) c.push([qx * (18 + o * 0.7), qz * (10 + (o % 3) * 1.4)]);
    addSign(`p${qx}_${qz}`, c);
  }

  // ---- Healing: a food stall on the Pasar plaza (next to the kiosks, off the rat streets) and the doctor at the hospital door ----
  const stallAt = findFree(pc.x + 6, pc.z + 10, 2.2, 14);
  const stall = { x: stallAt.x, z: stallAt.z, yaw: r2(Math.atan2(pc.x - stallAt.x, pc.z - stallAt.z)) };
  const hf = frontOf(hosp, 4.2);
  const [hfx, hfz] = FACE[hosp.face];
  const docAt = findFree(hf.x - hfz * 2.6, hf.z + hfx * 2.6, 1.0, 6);
  const doctor = { x: docAt.x, z: docAt.z, yaw: r2(Math.atan2(hfx, hfz)) };

  // ---- Toko Mainan: the plaza ruko nearest to (4, north row) becomes the toy shop; the keeper stands in front of its door ----
  const shopB = L.buildings.filter((b) => b.district === 'alun' && b.kind === 'ruko' && b.face === 0 && b.z < 0).sort((a, b) => Math.abs(a.x - 4.2) - Math.abs(b.x - 4.2))[0] ?? L.buildings[0];
  const [sfx, sfz] = FACE[shopB.face];
  const kp = findFree(frontOf(shopB, 2.6).x + 1.6, frontOf(shopB, 2.6).z, 0.9, 3);
  const shop = { x: shopB.x, z: shopB.z, yaw: r2(Math.atan2(sfx, sfz)), face: shopB.face, keeper: kp, facade: frontOf(shopB, 0) };

  return { coins, bikes, residents, missions, signs, signDests, care: { stall, doctor }, shop, reachCoins: reach };
}
