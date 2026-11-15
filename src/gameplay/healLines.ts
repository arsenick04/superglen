/** Text-only lines of the energy system (ids are stable; the voice is added later in the audio pipeline). */
export const HealLines = {
  semangat: { id: 'combat_nino_semangat', speaker: 'nino', text: 'Kamu kelelahan, ya. Istirahat dulu. Hatimu sudah penuh lagi. Semangat, Glen!' },
  kiosHati: { id: 'heal_kios_hati', speaker: 'penjual', text: 'Nah, makan dulu biar kuat! Satu hati untuk 5 koin.' },
  kiosPenuh: { id: 'heal_kios_penuh', speaker: 'penjual', text: 'Hatimu sudah penuh. Tidak perlu makan lagi!' },
  kiosKurang: { id: 'heal_kios_kurang', speaker: 'penjual', text: 'Koinmu belum cukup. Kumpulkan koin dulu, ya!' },
  kiosTerima: { id: 'heal_kios_terima', speaker: 'penjual', text: 'Hmm, enak! Hatimu bertambah satu.' },
  rsHalo: { id: 'heal_rs_halo', speaker: 'dokter', text: 'Selamat datang! Mau pulih penuh? Harganya 15 koin.' },
  rsPenuh: { id: 'heal_rs_penuh', speaker: 'dokter', text: 'Kamu sehat sekali. Hatimu sudah penuh!' },
  rsKurang: { id: 'heal_rs_kurang', speaker: 'dokter', text: 'Koinmu belum cukup. Kumpulkan koin dulu, ya!' },
  rsSehat: { id: 'heal_rs_sehat', speaker: 'dokter', text: 'Sudah sehat! Hatimu penuh lagi.' },
} as const;
