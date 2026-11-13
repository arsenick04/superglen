import type { Category } from '../quiz/types';

/** Inline SVG icons of the quiz screens (no text: the child cannot read yet). */
export const QuizIcons = {
  speaker:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 24 H20 L34 12 V52 L20 40 H8 Z" fill="#fff"/><path d="M42 22 Q50 32 42 42" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M48 14 Q62 32 48 50" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>',
  next: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 32 H46 M32 16 L48 32 L32 48" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 34 L27 48 L52 18" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 16 L48 48 M48 16 L16 48" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/></svg>',
  book: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 14 Q22 8 32 16 Q42 8 56 14 V50 Q42 44 32 52 Q22 44 8 50 Z" fill="#fff" stroke="#c9822b" stroke-width="3" stroke-linejoin="round"/><path d="M32 16 V52" stroke="#c9822b" stroke-width="3"/><path d="M14 24 Q22 22 27 26 M14 32 Q22 30 27 34 M37 26 Q42 22 50 24 M37 34 Q42 30 50 32" fill="none" stroke="#9bb8d9" stroke-width="3" stroke-linecap="round"/></svg>',
  coin: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="#ffc94d" stroke="#e39b16" stroke-width="5"/><circle cx="32" cy="32" r="19" fill="none" stroke="#e39b16" stroke-width="3"/><path d="M32 18 L35.6 27.4 L45.6 28 L38 34.4 L40.4 44 L32 38.8 L23.6 44 L26 34.4 L18.4 28 L28.4 27.4 Z" fill="#fff3b0" stroke="#e39b16" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  puzzle:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 18 H26 Q22 8 32 8 Q42 8 38 18 H54 V32 Q44 28 44 38 Q44 48 54 44 V56 H10 Z" fill="#7bc96f" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>',
  gift: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="26" width="44" height="30" rx="4" fill="#ff8fb1" stroke="#fff" stroke-width="3"/><rect x="6" y="18" width="52" height="12" rx="4" fill="#ff6f9c" stroke="#fff" stroke-width="3"/><rect x="28" y="18" width="8" height="38" fill="#ffd23f"/><path d="M32 18 Q20 4 16 12 Q14 18 32 18 Q50 18 48 12 Q44 4 32 18Z" fill="#ffd23f"/></svg>',
  gear: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27 6 H37 L39 13 Q42 14 45 16 L52 13 L57 21 L51 26 Q52 30 51 34 L57 39 L52 47 L45 44 Q42 46 39 47 L37 54 H27 L25 47 Q22 46 19 44 L12 47 L7 39 L13 34 Q12 30 13 26 L7 21 L12 13 L19 16 Q22 14 25 13 Z" fill="#9aa7bd"/><circle cx="32" cy="30" r="9" fill="#fff"/></svg>',
  /** Picker / album tab symbols (text or emoji: they are drawn big in a round card). */
  category: {
    berhitung: '123',
    inggris: 'A',
    mandarin: '🏮',
    hewan: '🐾',
    membaca: '📖',
  } as Record<Category, string>,
} as const;

export const CATEGORY_NAMES: Record<Category, string> = {
  berhitung: 'Berhitung',
  inggris: 'Bahasa Inggris',
  mandarin: 'Bahasa Mandarin',
  hewan: 'Hewan',
  membaca: 'Membaca',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  berhitung: '#ffb347',
  inggris: '#5fb0ff',
  mandarin: '#ff6f6f',
  hewan: '#7bc96f',
  membaca: '#b583ff',
};
