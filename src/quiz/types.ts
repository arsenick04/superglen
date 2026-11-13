/** Shared types of the "Tantangan Pintar" quiz (data schema = src/data/quiz/*.json, see scripts/validate-quiz.mjs). */

export const CATEGORIES = ['berhitung', 'inggris', 'mandarin', 'hewan', 'membaca'] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(x: unknown): x is Category {
  return typeof x === 'string' && (CATEGORIES as readonly string[]).includes(x);
}

export interface QuizItem {
  id: string;
  label: string;
  /** Placeholder picture (a real image at public/img/quiz/<key>.webp replaces it once listed in images.json). */
  emoji: string;
  en?: string;
  zh?: string;
  pinyin?: string;
}

export type Display =
  | { kind: 'count'; item: string; count: number }
  | { kind: 'sum'; a: { item: string; count: number }; b: { item: string; count: number } }
  | { kind: 'equation'; text: string }
  | { kind: 'picture'; item: string }
  | { kind: 'silhouette'; item: string }
  | { kind: 'sound'; item: string; sound_id: string }
  | { kind: 'text'; text: string }
  | { kind: 'speak'; text: string; lang: 'en' | 'zh'; pinyin?: string; speak_audio_id: string }
  | { kind: 'none' };

export type DisplayKind = Display['kind'];
export const DISPLAY_KINDS: readonly DisplayKind[] = ['count', 'sum', 'equation', 'picture', 'silhouette', 'sound', 'text', 'speak', 'none'];

export type ChoiceId = 'a' | 'b' | 'c';

export interface Choice {
  id: ChoiceId;
  item?: string;
  text?: string;
  lang?: string;
  pinyin?: string;
}

export interface Question {
  id: string;
  category: Category;
  level: 1 | 2 | 3;
  prompt: string;
  audio_id: string;
  display: Display;
  choices: [Choice, Choice, Choice];
  answer: ChoiceId;
}

/** A question as shown: the three choices in on-screen order (shuffled) and the position of the right one. */
export interface PreparedQuestion {
  q: Question;
  order: [Choice, Choice, Choice];
  correctIndex: 0 | 1 | 2;
}

export type QuizReason = 'unlock' | 'terminal' | 'story';

export interface QuizRunOptions {
  category: Category | 'mix';
  /** Number of questions (default 3). */
  count?: number;
  reason?: QuizReason;
}

export interface StickerRef {
  category: Category;
  item: string;
}

export interface QuizAnswerRecord {
  id: string;
  category: Category;
  firstTry: boolean;
  wrong: number;
}

export interface QuizResult {
  category: Category | 'mix';
  reason: QuizReason;
  /** False when the child closed the challenge (terminal close button) or the level unloaded. */
  completed: boolean;
  answers: QuizAnswerRecord[];
  coins: number;
  sticker: StickerRef | null;
  /** The sticker was not owned before. */
  stickerNew: boolean;
  /** This challenge brought a "kepingan memori ilmuwan". */
  fragment: boolean;
}

/** Spoken-line hook (audio arrives in package B4): `audioId` may be missing from disk, never break on that. */
export type SpeakListener = (audioId: string, text: string, kind: 'prompt' | 'word' | 'nino' | 'sound') => void;

/** Everything the panel needs to draw the album. */
export interface AlbumPage {
  category: Category;
  /** Sticker candidates (item keys) in a fixed order. */
  pool: string[];
  owned: Set<string>;
}
