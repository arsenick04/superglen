/**
 * CHAPTER 4 "Sosok Misterius" (detective mode): where things stand in the city and the dialog lines (PURE DATA, no three.js).
 * Positions are on streets or open ground (nothing here needs a collider, so the reach checker has nothing new to prove).
 */

export const AARA = {
  /** Aara waits on the school street, east of the gate where Chapter 1 began; she faces the gate (-x). */
  pos: { x: -17, z: -93, yaw: -Math.PI / 2 },
  /** Arriving this close (m) starts the meeting. */
  arriveRadius: 9,
  /** Where Glen stands for the meeting (a few steps from her, facing her) when he was far away. */
  stage: { x: -22.5, z: -93, yaw: Math.PI / 2 },
} as const;

/** The town park (the west block of the school district): where the signal points and where the clues are. */
export const PARK = {
  /** Centre of the park block (the two sand paths cross here). */
  centre: { x: -113.5, z: -113.5 },
  /** Aara waits at the east gate of the park, facing in (-x). */
  aara: { x: -103, z: -114.5, yaw: -Math.PI / 2 },
  /** Arriving this close to the centre (m) counts as "in the park". */
  arriveRadius: 16,
} as const;

/**
 * The three park clues, read one after the other. The paper of clue 0 stands on the north path of the park; the paper of clue n
 * stands at the place found with clue n-1. `spot` is where the child stands at the place (clear of trees, benches and the pond);
 * the beacon glows at `glow` (the pond's middle for "kolam").
 */
export const CLUES = [
  { word: 'bola', place: 'tempat bermain', spot: { x: -108.5, z: -104.5 }, glow: { x: -108.5, z: -104.5 } },
  { word: 'pohon', place: 'pohon', spot: { x: -117.5, z: -119.5 }, glow: { x: -118.5, z: -120.3 } },
  { word: 'kolam', place: 'kolam', spot: { x: -107.1, z: -115.8 }, glow: { x: -107.12, z: -119.88 } },
] as const;
export const CLUE_PAPER0 = { x: -113.5, z: -108.5 } as const;
/** Standing this close (m) to a place's spot counts as "arrived". */
export const CLUE_ARRIVE = 4.5;
/** Seconds without progress after which Aara helps (no dead end). */
export const CLUE_HELP_AFTER = 22;

/** The three English words Aara asks (bank question ids, so their voice clips already exist). */
export const AARA_QUESTIONS = ['inggris_008', 'inggris_007', 'inggris_001'] as const;

/** Dialog lines of Chapter 4 (text only for now; the ids are stable so the voice can be added later in audio/dialog.json). */
export const BAB4_LINES = {
  ninoMulai: { id: 'bab4_nino_mulai', speaker: 'nino', text: 'Glen, ayo temui Aara di sekolah. Dia pintar mencari petunjuk!' },
  aaraHalo: { id: 'bab4_aara_halo', speaker: 'aara', text: 'Glen! Aku membuat alat penerjemah. Mau coba?' },
  glenMau: { id: 'bab4_glen_mau', speaker: 'glen', text: 'Mau! Aku siap menjawab.' },
  aaraBenar1: { id: 'bab4_aara_benar1', speaker: 'aara', text: 'Benar! Alatnya mulai menyala.' },
  aaraBenar2: { id: 'bab4_aara_benar2', speaker: 'aara', text: 'Betul! Alatnya makin canggih.' },
  aaraBenar3: { id: 'bab4_aara_benar3', speaker: 'aara', text: 'Hebat! Alatnya sudah canggih sekali!' },
  aaraSinyal: { id: 'bab4_aara_sinyal', speaker: 'aara', text: 'Tuut tuut! Ada sinyal. Menunjuk ke taman kota!' },
  glenTaman: { id: 'bab4_glen_taman', speaker: 'glen', text: 'Ayo ke taman, kita selidiki!' },
  aaraTaman: { id: 'bab4_aara_taman', speaker: 'aara', text: 'Lihat! Ada papan petunjuk. Ayo kita baca!' },
  aaraBaca: { id: 'bab4_aara_baca', speaker: 'aara', text: 'Baca katanya! Tekan gambar pengeras suara kalau mau mendengarnya.' },
  aaraPapan: { id: 'bab4_aara_papan', speaker: 'aara', text: 'Dekati papan itu, lalu tekan tombol tangan.' },
  aaraBola: { id: 'bab4_aara_bola', speaker: 'aara', text: 'Bola! Tempat bermain berkilau. Ayo ke sana!' },
  aaraPohon: { id: 'bab4_aara_pohon', speaker: 'aara', text: 'Pohon! Pohonnya berkilau. Ayo ke sana!' },
  aaraKolam: { id: 'bab4_aara_kolam', speaker: 'aara', text: 'Kolam! Kolamnya berkilau. Ayo ke sana!' },
  aaraLagi: { id: 'bab4_aara_lagi', speaker: 'aara', text: 'Ada papan lagi di sini! Baca, yuk.' },
  aaraAyo: { id: 'bab4_aara_ayo', speaker: 'aara', text: 'Ayo, ke tempat yang berkilau!' },
} as const;

/** Aara's praise after a clue is read right, by the clue's index. */
export const CLUE_PRAISE = [BAB4_LINES.aaraBola, BAB4_LINES.aaraPohon, BAB4_LINES.aaraKolam] as const;

export type Bab4Line = (typeof BAB4_LINES)[keyof typeof BAB4_LINES];
