import { CATEGORIES, DISPLAY_KINDS, type Category, type Question, type QuizItem } from './types';
import { FALLBACK_ITEMS, FALLBACK_QUESTIONS } from './fallbackBank';

/**
 * The question bank. Files are written by the content pipeline into src/data/quiz/ and picked up at build time with a
 * static glob (`import.meta.glob`, eager): a missing file simply is not in the glob, so the game still builds and a small
 * built-in sample (fallbackBank.ts) stands in for that category. `npm run check:quiz` is the strict validator; this loader
 * only drops questions it cannot show.
 *
 *   items.json    { key: { id, label, emoji, en?, zh?, pinyin? } }
 *   images.json   ["key", ...]  items that have a real picture at public/img/quiz/<key>.webp
 *   <category>.json   Question[]
 */
const files = import.meta.glob('../data/quiz/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

function fileFor(name: string): unknown {
  for (const [path, value] of Object.entries(files)) if (path.endsWith(`/${name}.json`)) return value;
  return undefined;
}

export interface QuizBank {
  items: Record<string, QuizItem>;
  byCategory: Record<Category, Question[]>;
  /** Item keys with a real image file. */
  images: Set<string>;
  /** Where each category came from. */
  source: Record<Category, 'file' | 'fallback'>;
  /** True when at least one category uses the built-in sample. */
  usingFallback: boolean;
  /** Questions dropped because they could not be shown. */
  dropped: number;
}

function usable(q: unknown, cat: Category, items: Record<string, QuizItem>): q is Question {
  if (typeof q !== 'object' || q === null) return false;
  const r = q as Partial<Question>;
  if (typeof r.id !== 'string' || r.category !== cat || typeof r.prompt !== 'string' || typeof r.audio_id !== 'string') return false;
  if (r.level !== 1 && r.level !== 2 && r.level !== 3) return false;
  if (!Array.isArray(r.choices) || r.choices.length !== 3) return false;
  if (!r.choices.some((c) => c && c.id === r.answer)) return false;
  const d = r.display;
  if (!d || !DISPLAY_KINDS.includes(d.kind)) return false;
  for (const c of r.choices) {
    if (!c || (c.item === undefined && c.text === undefined)) return false;
    if (c.item !== undefined && !items[c.item]) return false;
  }
  return true;
}

export function loadBank(): QuizBank {
  const items: Record<string, QuizItem> = { ...FALLBACK_ITEMS };
  const rawItems = fileFor('items');
  if (rawItems && typeof rawItems === 'object' && !Array.isArray(rawItems)) {
    for (const [key, v] of Object.entries(rawItems as Record<string, Partial<QuizItem>>)) {
      if (v && typeof v.label === 'string' && typeof v.emoji === 'string') items[key] = { ...(v as QuizItem), id: key };
    }
  }
  const rawImages = fileFor('images');
  const images = new Set<string>(Array.isArray(rawImages) ? (rawImages as unknown[]).filter((x): x is string => typeof x === 'string') : []);

  const byCategory = {} as Record<Category, Question[]>;
  const source = {} as Record<Category, 'file' | 'fallback'>;
  let dropped = 0;
  for (const cat of CATEGORIES) {
    const raw = fileFor(cat);
    const list: Question[] = [];
    if (Array.isArray(raw)) {
      for (const q of raw) {
        if (usable(q, cat, items)) list.push(q);
        else dropped++;
      }
    }
    if (list.length >= 3) {
      byCategory[cat] = list;
      source[cat] = 'file';
    } else {
      byCategory[cat] = FALLBACK_QUESTIONS[cat].filter((q) => usable(q, cat, items));
      source[cat] = 'fallback';
    }
  }
  if (dropped > 0) console.warn(`Quiz: ${dropped} question(s) in src/data/quiz were skipped (run npm run check:quiz).`);
  return { items, byCategory, images, source, usingFallback: CATEGORIES.some((c) => source[c] === 'fallback'), dropped };
}
