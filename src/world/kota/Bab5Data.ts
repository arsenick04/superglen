/**
 * CHAPTER 5 "Ular Melar": where things stand and the dialog lines (PURE DATA, no three.js).
 * The fight numbers are in src/config/combat.ts (`Combat.snake`).
 */
import { CITY_LAYOUT } from './CityData';

const door = CITY_LAYOUT.lab.door;

/** The old Barongsai building's door (the walk with Aara ends here) and where Aara waits outside during the fight. */
export const BAB5_DOOR = {
  x: door.x,
  y: door.y,
  z: door.z,
  /** Aara gasps at the lion head when the child is this close (m, horizontal). */
  arriveRadius: 7,
  /** Aara waits here (beside the door spot the child comes out at) once the lab visit is over. */
  wait: { x: door.x + 3.2, z: door.z + 4.4, yaw: Math.PI * 0.85 },
} as const;

/** The school field ("Lapangan", the open 25 x 25 m block of the school district): the snake coils in its middle. */
export const SNAKE_FIELD = (() => {
  const f = CITY_LAYOUT.pois.find((p) => p.name === 'Lapangan' && p.x < 0 && p.z < 0);
  return { x: f ? f.x : -72.5, z: f ? f.z : -72.5 };
})();

/** Aara's walk: she follows this close behind (m); further than `teleportDist` she appears next to the child. */
export const FOLLOW = { gap: 2.6, speed: 6.2, maxSpeed: 12, teleportDist: 28 } as const;

export const BAB5_LINES = {
  glenAjak: { id: 'bab5_glen_ajak', speaker: 'glen', text: 'Aara, ikut aku ke gedung tua di bukit. Temanku ada di sana!' },
  aaraIkut: { id: 'bab5_aara_ikut', speaker: 'aara', text: 'Gedung tua? Wah, seru! Aku ikut!' },
  aaraSinga: { id: 'bab5_aara_singa', speaker: 'aara', text: 'Wow! Kepala singa yang besar! Keren sekali!' },
  glenMasuk: { id: 'bab5_glen_masuk', speaker: 'glen', text: 'Ayo masuk, Aara. Tekan tombol tangan di pintu.' },
  // The lab: Aara and Nino meet (8 lines).
  ninoHalo: { id: 'bab5_nino_halo', speaker: 'nino', text: 'Selamat datang, Glen! Siapa temanmu ini?' },
  aaraKagum: { id: 'bab5_aara_kagum', speaker: 'aara', text: 'Halo! Aku Aara. Wah, ruangan ini canggih sekali!' },
  ninoAlat: { id: 'bab5_nino_alat', speaker: 'nino', text: 'Aku Nino. Alat penerjemahmu pintar sekali, Aara!' },
  glenUlar: { id: 'bab5_glen_ular', speaker: 'glen', text: 'Nino, lihat kulit ular ini. Besar sekali!' },
  ninoUlar: { id: 'bab5_nino_ular', speaker: 'nino', text: 'Kupindai dulu... Ular Melar! Badannya bisa memanjang.' },
  glenSuper: { id: 'bab5_glen_super', speaker: 'glen', text: 'Aara, ini rahasia. Aku adalah Superglen!' },
  aaraSuper: { id: 'bab5_aara_super', speaker: 'aara', text: 'Hah? Glen itu Superglen? Hebat sekali!' },
  ninoLapangan: { id: 'bab5_nino_lapangan', speaker: 'nino', text: 'Ularnya di lapangan sekolah. Semua orang takut lewat. Tolong, Superglen!' },
  // Outside again.
  aaraTunggu: { id: 'bab5_aara_tunggu', speaker: 'aara', text: 'Aku tunggu di sini. Hati-hati, ya!' },
  aaraSemangat: { id: 'bab5_aara_semangat', speaker: 'aara', text: 'Semangat, Superglen! Kamu pasti bisa!' },
  // The fight.
  ninoPola: { id: 'bab5_nino_pola', speaker: 'nino', text: 'Awas! Ular Melar akan melar lurus. Lompat ke samping atau pakai perisai!' },
  ninoGaris: { id: 'bab5_nino_garis', speaker: 'nino', text: 'Lihat garis merah di tanah. Minggir sebelum dia melar!' },
  ninoPusing: { id: 'bab5_nino_pusing', speaker: 'nino', text: 'Kepalanya bersinar! Tembak laser sekarang!' },
  ninoBelum: { id: 'bab5_nino_belum', speaker: 'nino', text: 'Belum. Tunggu sampai kepalanya bersinar.' },
  ninoLagi: { id: 'bab5_nino_lagi', speaker: 'nino', text: 'Ular Melar masih menunggu di lapangan. Kamu pasti bisa!' },
  // Tamed.
  ularMaaf: { id: 'bab5_ular_maaf', speaker: 'ular', text: 'Sssssori ya! Aku tidak mau menakuti. Aku cuma tersesat, sss!' },
  ularPergi: { id: 'bab5_ular_pergi', speaker: 'ular', text: 'Sss... aku pulang ke hutan. Dadah, sss!' },
  ninoHebat: { id: 'bab5_nino_hebat', speaker: 'nino', text: 'Keren, Superglen! Ular Melar sudah jinak.' },
  ninoTikus: { id: 'bab5_nino_tikus', speaker: 'nino', text: 'Kenapa ular ini sampai ke kota? Mungkin ada tikus besar yang mengusirnya. Nanti kita cari tahu.' },
} as const;

export type Bab5Line = (typeof BAB5_LINES)[keyof typeof BAB5_LINES];
