/**
 * CHAPTER 6 "Tikus Rakus": where things stand and the dialog lines (PURE DATA, no three.js).
 * The fight numbers are in src/config/combat.ts (`Combat.rakus`).
 *
 * The fight is on the wide main road in front of the Gudang Pasar (the market warehouse, east cell, south side): flat ground with a
 * 9 m free circle (no trees, lamps or buildings), found with a clearance scan of CITY_LAYOUT. The food piles lie on a ring around it.
 */
import { CITY_LAYOUT } from './CityData';

/** Middle of the arena (the road in front of the warehouse door). */
export const RAKUS_ARENA = { x: 111, z: 49 } as const;

/** The warehouse door the food flies back to at the end (the building faces the road, -z). */
export const RAKUS_GUDANG = (() => {
  const g = CITY_LAYOUT.buildings.find((b) => b.kind === 'gudang');
  return g ? { x: g.x, z: g.z - g.d / 2 } : { x: 113.5, z: 60.2 };
})();

export const BAB6_LINES = {
  // After Chapter 5: the reports.
  ninoLaporan: { id: 'bab6_nino_laporan', speaker: 'nino', text: 'Superglen, ada laporan! Semua makanan di Gudang Pasar hilang!' },
  ninoCari: { id: 'bab6_nino_cari', speaker: 'nino', text: 'Mungkin tikus besar itu pelakunya. Ayo kita cari di Gudang Pasar!' },
  glenSiap: { id: 'bab6_glen_siap', speaker: 'glen', text: 'Siap, Nino! Ayo ke gudang!' },
  // Meeting him.
  rakusMakan: { id: 'bab6_rakus_makan', speaker: 'rakus', text: 'Hihihi! Makin banyak kumakan, makin besar aku!' },
  glenKembali: { id: 'bab6_glen_kembali', speaker: 'glen', text: 'Hei, Tikus Rakus! Kembalikan makanan kota!' },
  rakusRaja: { id: 'bab6_rakus_raja', speaker: 'rakus', text: 'Tidak mau! Lihat mahkotaku! Curut-curut, jaga makananku!' },
  ninoPola: { id: 'bab6_nino_pola', speaker: 'nino', text: 'Awas! Kalau makanannya bersinar, dia akan makan dan jadi besar. Tembak makanannya dulu!' },
  // The fight.
  ninoMakan: { id: 'bab6_nino_makan', speaker: 'nino', text: 'Makanannya bersinar! Tembak atau hentak sebelum dia makan!' },
  ninoSelamat: { id: 'bab6_nino_selamat', speaker: 'nino', text: 'Bagus! Makanannya selamat!' },
  ninoBesar: { id: 'bab6_nino_besar', speaker: 'nino', text: 'Dia makin besar! Awas cincin merah di tanah!' },
  ninoCincin: { id: 'bab6_nino_cincin', speaker: 'nino', text: 'Ada cincin merah! Lompat atau pakai perisai!' },
  ninoPusing: { id: 'bab6_nino_pusing', speaker: 'nino', text: 'Dia kehabisan napas! Tembak laser sekarang!' },
  ninoBelum: { id: 'bab6_nino_belum', speaker: 'nino', text: 'Belum. Tunggu sampai dia kehabisan napas.' },
  ninoKecil: { id: 'bab6_nino_kecil', speaker: 'nino', text: 'Kena! Dia mengecil lagi, hihi!' },
  ninoCurut: { id: 'bab6_nino_curut', speaker: 'nino', text: 'Curut Cemberut datang membantu! Tembak tiga kali atau hentak!' },
  ninoLagi: { id: 'bab6_nino_lagi', speaker: 'nino', text: 'Tikus Rakus masih di jalan depan gudang. Kamu pasti bisa!' },
  // Tamed.
  rakusSendawa: { id: 'bab6_rakus_sendawa', speaker: 'rakus', text: 'Hik! Sendawa... Perutku sakit. Sekarang aku kecil lagi.' },
  rakusMaaf: { id: 'bab6_rakus_maaf', speaker: 'rakus', text: 'Maaf ya, aku rakus sekali. Makanannya kukembalikan.' },
  rakusBagi: { id: 'bab6_rakus_bagi', speaker: 'rakus', text: 'Aku janji, mulai sekarang makanan kita bagi bersama!' },
  wargaHore: { id: 'bab6_warga_hore', speaker: 'warga', text: 'Hore! Makanan kota sudah kembali! Terima kasih, Superglen!' },
  ninoHebat: { id: 'bab6_nino_hebat', speaker: 'nino', text: 'Hebat, Superglen! Tikus Rakus sudah jinak dan kota kenyang lagi.' },
} as const;

export type Bab6Line = (typeof BAB6_LINES)[keyof typeof BAB6_LINES];
