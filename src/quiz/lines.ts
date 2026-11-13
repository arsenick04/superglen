/**
 * Lines Nino says in the Tantangan Pintar. They are literal here (`{ id, speaker, text }`) until the orchestrator adds the
 * same ids to audio/dialog.json; the ids are also the future voice file names (public/audio/<id>.mp3).
 */
export interface QuizLine {
  id: string;
  speaker: 'nino';
  text: string;
}

const line = (id: string, text: string): QuizLine => ({ id, speaker: 'nino', text });

export const QuizLines = {
  /** Before a locked skill: Nino asks for a clever answer. */
  kunci: line('quiz_nino_kunci', 'Kunci ini butuh jawaban pintar!'),
  /** Wrong pick (the card wobbles and goes away). */
  hampir: line('quiz_nino_hampir', 'Hampir! Coba lagi.'),
  /** After two wrong picks only the right card is left. */
  tinggal: line('quiz_nino_tinggal', 'Ini dia! Ketuk yang ini ya.'),
  /** Right pick. */
  hebat: line('quiz_nino_hebat', 'Hebat, Glen!'),
  /** The end screen of a challenge (coins and sticker). */
  selesai: line('quiz_nino_selesai', 'Tantangan selesai! Ini koin dan stikermu.'),
  /** A "kepingan memori ilmuwan" was won. */
  kepingan: line('quiz_nino_kepingan', 'Wah, kamu dapat kepingan memori ilmuwan!'),
  /** The category picker at the hall terminal. */
  pilih: line('quiz_nino_pilih', 'Mau tantangan apa? Pilih satu ya.'),
  /** The sticker album. */
  album: line('quiz_nino_album', 'Ini album stikermu!'),
  /** The costume powers up after a clever answer (Chapter 2). */
  energi: line('quiz_nino_energi', 'Energi Pintar menyala! Kostummu makin kuat.'),
  /** A terminal lights up as Glen comes near (said once when it opens). */
  terminal: line('quiz_nino_terminal', 'Layar Nino menyala! Ayo main Tantangan Pintar.'),
} as const;

export type QuizLineName = keyof typeof QuizLines;
