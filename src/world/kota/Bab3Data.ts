/**
 * CHAPTER 3 "Pasar Kacau!": where things stand in the market (PURE DATA, no three.js). The market is the crossing of the two
 * local streets of the east cell (x 87..99 running north-south, z -6..6 running east-west) with the kiosks along them. The rats
 * only ever run on those streets (nothing there but lamps at the very edge), so nothing needs a collider and the reach checker
 * has nothing new to prove. Positions were probed with `makeFree` (see D4_PLAN.md).
 */

export type FoodKind = 'bakpao' | 'kue' | 'sayur';

export interface RatSpec {
  /** Where the rat circles around (a street point) and how widely (m). */
  cx: number;
  cz: number;
  r: number;
  /** What it carries. */
  food: FoodKind;
}

export const MARKET = {
  /** The crossing: the beam and the map star point here, arriving here starts the chase talk. */
  hub: { x: 93, z: 0 },
  /** Arrive within this distance of the hub (m). */
  arriveRadius: 22,
  /** Bu Lina, the vendor, in front of her kiosk (faces the street, +z). */
  vendor: { x: 113.5, z: -6.6, yaw: 0 },
  /** The street axes: z-street runs along x at z = 0; x-street runs along z at x = hub.x. Rats stay this close to the centre line. */
  half: 3.6,
  /** Ends of the streets: x from `zStreet.x0` to `x1`, z from `xStreet.z0` to `z1`. */
  zStreet: { x0: 61, x1: 125 },
  xStreet: { z0: -40, z1: 40 },
  /** Storm drains ("gorong-gorong") at the street ends: rats run there when tamed. */
  drains: [
    { x: 62, z: 0 },
    { x: 124, z: 0 },
    { x: 93, z: -40 },
    { x: 93, z: 40 },
  ],
  /** Where the big rat shows up (the crossing) and which drain he leaves by. */
  rakus: { x: 93, z: 0, drain: 2 },
  /** Where the child stands for the two closing scenes (on the streets, facing the action; yaw 0 = +z). */
  stage: {
    rakus: { x: 93, z: 9, yaw: Math.PI },
  },
} as const;

/** Seven little rats: 3 with bakpao, 2 with kue, 2 with vegetables (those go back to the stall by themselves). */
export const RATS: readonly RatSpec[] = [
  { cx: 73, cz: 0, r: 2.6, food: 'bakpao' },
  { cx: 93, cz: -16, r: 2.4, food: 'bakpao' },
  { cx: 93, cz: 16, r: 2.4, food: 'bakpao' },
  { cx: 108, cz: 0, r: 2.8, food: 'kue' },
  { cx: 93, cz: -30, r: 2.4, food: 'kue' },
  { cx: 93, cz: 30, r: 2.4, food: 'sayur' },
  { cx: 122, cz: 0, r: 2.6, food: 'sayur' },
];

/** What Bu Lina is missing (the counting question). */
export const MISSING = { bakpao: 3, kue: 2 } as const;

/** Nearest point of the street cross to (x, z) (rats never leave it). */
export function clampToStreets(x: number, z: number, out: { x: number; z: number }): void {
  const H = MARKET.half;
  const hx = MARKET.hub.x;
  // z-street: x free along the street, z within +-H.
  const ax = Math.max(MARKET.zStreet.x0, Math.min(MARKET.zStreet.x1, x));
  const az = Math.max(-H, Math.min(H, z));
  // x-street: x within hub.x +- H, z along the street.
  const bx = Math.max(hx - H, Math.min(hx + H, x));
  const bz = Math.max(MARKET.xStreet.z0, Math.min(MARKET.xStreet.z1, z));
  const da = (ax - x) * (ax - x) + (az - z) * (az - z);
  const db = (bx - x) * (bx - x) + (bz - z) * (bz - z);
  if (da <= db) {
    out.x = ax;
    out.z = az;
  } else {
    out.x = bx;
    out.z = bz;
  }
}

/** Dialog lines of Chapter 3 (text only for now; the ids are stable so the voice can be added later in audio/dialog.json). */
export const BAB3_LINES = {
  // Chapter 2 already ends with the alarm (bab2_nino_alarm, bab2_glen_siap): this is only a short nudge on arrival in the city.
  ninoCepat: { id: 'bab3_nino_cepat', speaker: 'nino', text: 'Cepat, ke pasar, Superglen!' },
  ninoUbah: { id: 'bab3_nino_ubah', speaker: 'nino', text: 'Ubah jadi Superglen dulu, Glen!' },
  ninoTiba: { id: 'bab3_nino_tiba', speaker: 'nino', text: 'Itu mereka! Tembak atau hentakkan, ya!' },
  glenLucu: { id: 'bab3_glen_lucu2', speaker: 'glen', text: 'Hihi, Curut Cemberutnya lucu sekali!' },
  glenSemua: { id: 'bab3_glen_semua2', speaker: 'glen', text: 'Semua Curut Cemberut sudah kabur!' },
  linaHilang: { id: 'bab3_lina_hilang', speaker: 'lina', text: 'Bakpaoku hilang 3, kue hilang 2.' },
  linaTolong: { id: 'bab3_lina_tolong', speaker: 'lina', text: 'Tolong kumpulkan, ya, Superglen!' },
  linaTotal: { id: 'bab3_lina_total', speaker: 'lina', text: 'Terima kasih! Totalnya berapa?' },
  linaHore: { id: 'bab3_lina_hore', speaker: 'lina', text: 'Hore! Semua kembali ke kios. Kamu pintar!' },
  rakusTawa: { id: 'bab3_rakus_tawa', speaker: 'rakus', text: 'Hihihi, semua makanan ini milikku!' },
  glenHei: { id: 'bab3_glen_hei', speaker: 'glen', text: 'Hei, jangan lari!' },
  rakusRaja: { id: 'bab3_rakus_raja', speaker: 'rakus', text: 'Suatu hari aku akan jadi RAJA kota ini!' },
  ninoRakus: { id: 'bab3_nino_rakus', speaker: 'nino', text: 'Itu Si Tikus Rakus! Kita pasti bertemu lagi.' },
  ninoHebat: { id: 'bab3_nino_hebat', speaker: 'nino', text: 'Kerja bagus, Glen! Tikus Rakus kabur, tapi kamu hebat sekali!' },
  linaTerima: { id: 'bab3_lina_terima', speaker: 'lina', text: 'Terima kasih, Superglen!' },
} as const;

export type Bab3Line = (typeof BAB3_LINES)[keyof typeof BAB3_LINES];
