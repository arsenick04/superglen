import type { Action } from '../input/Input';

/**
 * Tips / tutorials ("Petunjuk"): every hint of the game in ONE table. Each tip is shown once per save slot, by Nino (or Aara),
 * when its trigger is true AND the game is calm (no fight, cinematic, dialog, quiz or menu). The child can replay any seen tip from
 * the pause menu. Text only for now; the voice files will be `tip_<id>_<n>` (with `{nama}`: `_g` / `_sg`, like name-lines.json).
 *
 * The numbers quoted in the lines come from the real mechanics: stall 5 coins = 1 heart and hospital 15 coins = full hearts
 * (`Combat.heal`), 5 rhythm drums (`Parkour.levels`), the coin / chapter rules of `Save`.
 */

/** What the game looks like right now (computed by the Game about four times a second, only read here). */
export interface TipCtx {
  level: string;
  mode: 'glen' | 'superglen';
  done: (chapter: string) => boolean;
  owned: (item: string) => boolean;
  coins: number;
  /** A heart was lost in this session (a fall or a hit). */
  heartLost: boolean;
  /** Rhythm jumps (perfect / good) landed in this session. */
  rhythmGood: number;
  /** Close to the food stall / the Rumah Sakit doctor / the Toko Mainan / a parked bike (city only). */
  nearStall: boolean;
  nearHospital: boolean;
  nearShop: boolean;
  nearBike: boolean;
  hasMap: boolean;
  objective: boolean;
  /** Tantangan Pintar challenges completed. */
  challenges: number;
  /** The story lets the child switch Glen <-> Superglen now. */
  transformAllowed: boolean;
  flyUnlocked: boolean;
}

export type TipIconName =
  | 'drums' | 'heart' | 'coin' | 'shop' | 'wardrobe' | 'skateboard' | 'bike' | 'star' | 'map' | 'arrow' | 'save' | 'quiz' | 'training' | 'gear' | 'food' | 'hospital';

/** One picture in the hint card: a button of the current input type (pulsing), a drawn icon, or the pause-menu hint. */
export type TipVisual =
  | { kind: 'button'; action: Action; /** 'bike': the bell icon; 'glen' / 'superglen' pick the matching button set. */ set?: 'glen' | 'superglen' | 'bike' }
  | { kind: 'icon'; icon: TipIconName }
  | { kind: 'pause' };

export interface TipLine {
  text: string;
}

export interface TipDef {
  id: string;
  /** Short name in the Petunjuk list (for the parent; the child recognises the icon). */
  title: string;
  icon: TipIconName;
  speaker: 'nino' | 'aara';
  /** 1 to 3 short lines; `{nama}` becomes Glen / Superglen. */
  lines: readonly string[];
  /** Pictures shown while Nino talks. */
  visual: readonly TipVisual[];
  /** Chapter that must be finished first (default `bab2`: the training is over and the child is free). */
  after?: string;
  /** Levels where the tip may appear on its own (default: the city). */
  levels?: readonly string[];
  /** Fires when true (checked while calm). Omit for replay-only tips. */
  when?: (c: TipCtx) => boolean;
  /** Also counts as seen when this chapter flag is set (a tutorial the story already played). */
  seenFlag?: string;
}

const CITY = ['kota'] as const;

/** Priority = order of this table (the first eligible tip is shown first). */
export const TIPS: readonly TipDef[] = [
  {
    id: 'irama',
    title: 'Lompat Irama',
    icon: 'drums',
    speaker: 'nino',
    lines: [
      'Lihat gendang di pojok kiri atas? Itu Lompat Irama Barongsai!',
      'Tahan tombol lompat, atau tekan lagi tepat saat kakimu mendarat.',
      'Makin banyak gendang menyala, makin tinggi lompatanmu. Sampai lima!',
    ],
    visual: [{ kind: 'icon', icon: 'drums' }, { kind: 'button', action: 'jump', set: 'superglen' }],
    levels: ['kota', 'jump-training', 'forest-training'],
    when: (c) => c.mode === 'superglen' && (c.rhythmGood >= 2 || c.level === 'jump-training' || c.level === 'forest-training'),
  },
  {
    id: 'hati',
    title: 'Hati',
    icon: 'heart',
    speaker: 'nino',
    lines: [
      'Aduh, hatimu berkurang satu! Hati merah itu tenagamu, {nama}.',
      'Jatuh atau tertabrak membuat hati berkurang. Tidak apa-apa, kamu tidak kalah.',
      'Kalau hatimu habis, kamu istirahat sebentar dan hatimu penuh lagi.',
    ],
    visual: [{ kind: 'icon', icon: 'heart' }],
    when: (c) => c.heartLost,
  },
  {
    id: 'kios',
    title: 'Kios makanan',
    icon: 'food',
    speaker: 'nino',
    lines: ['Itu kios makanan! Bayar 5 koin, hatimu bertambah satu.', 'Dekati kios, lalu tekan tombol tangan.'],
    visual: [{ kind: 'icon', icon: 'food' }, { kind: 'icon', icon: 'coin' }, { kind: 'button', action: 'interact', set: 'glen' }],
    when: (c) => c.nearStall,
  },
  {
    id: 'rumahsakit',
    title: 'Rumah Sakit',
    icon: 'hospital',
    speaker: 'nino',
    lines: ['Ini Rumah Sakit. Dokter bisa mengisi semua hatimu sekaligus.', 'Harganya 15 koin. Dekati dokter, lalu tekan tombol tangan.'],
    visual: [{ kind: 'icon', icon: 'hospital' }, { kind: 'icon', icon: 'heart' }, { kind: 'button', action: 'interact', set: 'glen' }],
    when: (c) => c.nearHospital,
  },
  {
    id: 'koin',
    title: 'Koin',
    icon: 'coin',
    speaker: 'nino',
    lines: ['Wah, koinmu sudah banyak, {nama}!', 'Belanjakan di Toko Mainan: kostum, baju, sepeda, dan papan luncur.'],
    visual: [{ kind: 'icon', icon: 'coin' }, { kind: 'icon', icon: 'shop' }],
    when: (c) => c.coins >= 10,
  },
  {
    id: 'toko',
    title: 'Toko Mainan',
    icon: 'shop',
    speaker: 'nino',
    lines: ['Itu Toko Mainan! Dekati penjualnya, lalu tekan tombol tangan.', 'Pilih barang yang kamu suka. Koinmu yang membayar.'],
    visual: [{ kind: 'icon', icon: 'shop' }, { kind: 'button', action: 'interact', set: 'glen' }],
    when: (c) => c.nearShop,
  },
  {
    id: 'lemari',
    title: 'Ganti kostum (Lemari)',
    icon: 'wardrobe',
    speaker: 'nino',
    lines: ['Barang baru! Mau dipakai? Buka Pengaturan, lalu tekan Lemari.', 'Di Lemari kamu bisa ganti kostum Superglen, baju Glen, dan warna sepeda.'],
    visual: [{ kind: 'pause' }, { kind: 'icon', icon: 'wardrobe' }],
    levels: ['kota', 'lab', 'jump-training', 'flight-training', 'forest-training'],
    when: (c) => c.owned('sg-blue') || c.owned('sg-green') || c.owned('sg-purple') || c.owned('sg-gold') || c.owned('sg-merahputih') || c.owned('sg-holo') || c.owned('glen-blue') || c.owned('glen-green') || c.owned('glen-yellow') || c.owned('glen-red') || c.owned('glen-striped') || c.owned('bike-red') || c.owned('bike-blue') || c.owned('bike-green') || c.owned('bike-yellow') || c.owned('bike-purple') || c.owned('bike-sparkle') || c.owned('bike-racing') || c.owned('skateboard'),
  },
  {
    id: 'papan',
    title: 'Papan luncur',
    icon: 'skateboard',
    speaker: 'nino',
    lines: [
      'Papan luncurmu siap! Berdiri di tempat lega, lalu tekan tombol tangan.',
      'Tekan lagi untuk menyimpannya. Di atas papan, tombol lompat membuat lompatan kecil.',
      'Papan hanya dipakai saat kamu jadi Glen.',
    ],
    visual: [{ kind: 'icon', icon: 'skateboard' }, { kind: 'button', action: 'interact', set: 'glen' }],
    when: (c) => c.owned('skateboard'),
  },
  {
    id: 'sepeda',
    title: 'Sepeda',
    icon: 'bike',
    speaker: 'nino',
    lines: ['Ada sepeda! Dekati, lalu tekan tombol tangan untuk naik.', 'Di atas sepeda, tombol lompat membunyikan bel. Tekan tombol tangan lagi untuk turun.'],
    visual: [{ kind: 'icon', icon: 'bike' }, { kind: 'button', action: 'interact', set: 'glen' }, { kind: 'button', action: 'jump', set: 'bike' }],
    when: (c) => c.nearBike && c.mode === 'glen',
  },
  {
    id: 'berubah',
    title: 'Berubah jadi Superglen',
    icon: 'star',
    speaker: 'nino',
    lines: ['Tombol bintang mengubahmu jadi Superglen, {nama}!', 'Tekan lagi untuk kembali jadi Glen. Superglen bisa lompat tinggi dan terbang.'],
    visual: [{ kind: 'button', action: 'transform', set: 'glen' }],
    after: 'bab3',
    when: (c) => c.transformAllowed,
  },
  {
    id: 'terbang',
    title: 'Mode terbang',
    icon: 'star',
    speaker: 'nino',
    lines: ['Tombol roket membuatmu terbang terus, {nama}.', 'Tekan lagi untuk turun.'],
    visual: [{ kind: 'button', action: 'flight', set: 'superglen' }],
    after: 'bab3',
    when: (c) => c.mode === 'superglen' && c.flyUnlocked,
  },
  {
    id: 'peta',
    title: 'Peta',
    icon: 'map',
    speaker: 'nino',
    lines: ['Ketuk peta kecil di pojok untuk melihat seluruh kota.', 'Bintang di peta menunjukkan tujuanmu. Peta juga ada di Pengaturan.'],
    visual: [{ kind: 'icon', icon: 'map' }],
    when: (c) => c.hasMap,
  },
  {
    id: 'panah',
    title: 'Panah tujuan',
    icon: 'arrow',
    speaker: 'nino',
    lines: ['Lihat panah emas? Ikuti panah itu menuju tujuanmu.', 'Kalau tujuannya di luar layar, panahnya muncul di pinggir layar.'],
    visual: [{ kind: 'icon', icon: 'arrow' }],
    when: (c) => c.objective,
  },
  {
    id: 'simpan',
    title: 'Simpan permainan',
    icon: 'save',
    speaker: 'nino',
    lines: ['Permainanmu tersimpan sendiri. Tenang saja!', 'Mau menyimpan di slot lain? Buka Pengaturan, tekan Simpan, lalu pilih slot.'],
    visual: [{ kind: 'pause' }, { kind: 'icon', icon: 'save' }],
    after: 'bab3',
    when: () => true,
  },
  {
    id: 'tantangan',
    title: 'Tantangan Pintar',
    icon: 'quiz',
    speaker: 'nino',
    lines: ['Tantangan Pintar memberi hadiah: koin dan stiker.', 'Setiap lima tantangan, kamu dapat satu kepingan memori ilmuwan.'],
    visual: [{ kind: 'icon', icon: 'quiz' }, { kind: 'icon', icon: 'coin' }],
    levels: ['kota', 'lab', 'bab2'],
    when: (c) => c.challenges >= 1,
  },
  {
    // Replay only: the Ruang Latihan plays its own welcome the first time; this is the short version to see again.
    id: 'latihan',
    title: 'Ruang Latihan',
    icon: 'training',
    speaker: 'nino',
    lines: [
      'Selamat datang di Ruang Latihan, {nama}! Semua lawanmu jadi hologram di sini.',
      'Dekati tombol oranye di depan hologram yang kamu mau.',
      'Lalu tekan tombol aksi. Latihan pun dimulai!',
    ],
    visual: [{ kind: 'icon', icon: 'training' }, { kind: 'button', action: 'interact', set: 'glen' }],
    seenFlag: 'training-tutorial',
  },
];

export const TIP_BY_ID: ReadonlyMap<string, TipDef> = new Map(TIPS.map((t) => [t.id, t]));
export const TIP_DEFAULT_LEVELS = CITY;

export const TipConfig = {
  /** Distances (m) for "near the stall / hospital / shop / a bike". */
  near: { stall: 14, hospital: 14, shop: 12, bike: 6 },
  /** Heart (coin) milestones are in the table above. Seconds the game must stay calm before a tip shows. */
  calmSeconds: 1.5,
  /** Seconds between two tips on their own (a replay ignores it). */
  gapSeconds: 20,
  /** A tip never shows in the first seconds of a level. */
  levelWarmup: 4,
  /** Failsafe: the card is removed after this long even if the dialog never reports an end. */
  maxShowSeconds: 40,
} as const;

/** Voice id of line `n` (1-based) of a tip. */
export const tipLineId = (tipId: string, n: number): string => `tip_${tipId}_${n}`;
