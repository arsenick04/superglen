import type { PlayerMode } from '../player/PlayerConfig';
import { Parkour } from '../config/parkour';
import { CATEGORIES, isCategory, type Category } from '../quiz/types';

/**
 * Progress storage. One versioned JSON blob in localStorage under `superglen.save.v1`.
 *
 * Every storage access is wrapped in try/catch (Safari private mode and blocked storage throw);
 * the in-memory copy is always the source of truth, so the game works the same without storage.
 *
 *   save.markChapterDone('bab1');
 *   if (save.data.skills.fly) ...
 *   save.unlockSkill('laser');
 */
export const SAVE_KEY = 'superglen.save.v1';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  chaptersDone: string[];
  skills: { laser: boolean; shield: boolean; fly: boolean };
  /** Mode the player was in last (restored by levels that want it). */
  lastMode: PlayerMode;
  /** Settings for the future parents' page. */
  settings: {
    /** Easy jump mode: holding the jump button bounces by itself (see config/parkour.ts). */
    easyJump: boolean;
    /** Sound on/off (voice, effects and the synthesized drum; off also silences the music). */
    sound: boolean;
    /** Background music on/off (default on). */
    music: boolean;
  };
  quiz: QuizSave;
}

export type SkillName = keyof SaveData['skills'];

/** Per-category quiz statistics (Tantangan Pintar). */
export interface QuizCategorySave {
  /** Difficulty 1..3 (rises with first-try answers, falls when the child is often wrong). */
  level: number;
  asked: number;
  firstTry: number;
  /** Wrong picks in total. */
  wrong: number;
  /** First-try answers in a row at the current level. */
  streak: number;
  /** Outcomes of the last 5 questions: 1 = not first try, 0 = first try. */
  recent: number[];
  /** Date.now() of the last question (0 = never). */
  last: number;
}

export interface QuizSave {
  cats: Record<Category, QuizCategorySave>;
  coins: number;
  /** Owned stickers as "<category>:<item key>". */
  stickers: string[];
  /** Completed challenges. */
  challenges: number;
  /** "Kepingan memori ilmuwan" (one per 5 challenges). */
  fragments: number;
  /** Ids of the last ~40 questions asked (no repeats soon). */
  recent: string[];
}

function defaultCategory(): QuizCategorySave {
  return { level: 1, asked: 0, firstTry: 0, wrong: 0, streak: 0, recent: [], last: 0 };
}

function defaultQuiz(): QuizSave {
  const cats = {} as Record<Category, QuizCategorySave>;
  for (const c of CATEGORIES) cats[c] = defaultCategory();
  return { cats, coins: 0, stickers: [], challenges: 0, fragments: 0, recent: [] };
}

function defaults(): SaveData {
  return {
    version: SAVE_VERSION,
    chaptersDone: [],
    skills: { laser: false, shield: false, fly: false },
    lastMode: 'glen',
    settings: { easyJump: Parkour.easy.defaultOn, sound: true, music: true },
    quiz: defaultQuiz(),
  };
}

const nat = (v: unknown, max = 1e9): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

function sanitizeQuiz(raw: unknown): QuizSave {
  const out = defaultQuiz();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  out.coins = nat(r.coins);
  out.challenges = nat(r.challenges);
  out.fragments = nat(r.fragments);
  if (Array.isArray(r.stickers)) out.stickers = [...new Set(r.stickers.filter((x): x is string => typeof x === 'string'))].slice(0, 500);
  if (Array.isArray(r.recent)) out.recent = r.recent.filter((x): x is string => typeof x === 'string').slice(-40);
  if (typeof r.cats === 'object' && r.cats !== null) {
    for (const [k, v] of Object.entries(r.cats as Record<string, unknown>)) {
      if (!isCategory(k) || typeof v !== 'object' || v === null) continue;
      const c = v as Record<string, unknown>;
      const t = out.cats[k];
      t.level = Math.max(1, Math.min(3, nat(c.level) || 1));
      t.asked = nat(c.asked);
      t.firstTry = Math.min(t.asked, nat(c.firstTry));
      t.wrong = nat(c.wrong);
      t.streak = nat(c.streak, 99);
      t.last = nat(c.last, 1e15);
      if (Array.isArray(c.recent)) t.recent = c.recent.filter((x): x is number => x === 0 || x === 1).slice(-5);
    }
  }
  return out;
}

/** Merge untrusted parsed JSON into a valid SaveData (unknown or malformed fields fall back to defaults). */
function sanitize(raw: unknown): SaveData {
  const out = defaults();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.chaptersDone)) out.chaptersDone = r.chaptersDone.filter((x): x is string => typeof x === 'string');
  if (typeof r.skills === 'object' && r.skills !== null) {
    const s = r.skills as Record<string, unknown>;
    out.skills.laser = s.laser === true;
    out.skills.shield = s.shield === true;
    out.skills.fly = s.fly === true;
  }
  if (r.lastMode === 'glen' || r.lastMode === 'superglen') out.lastMode = r.lastMode;
  out.quiz = sanitizeQuiz(r.quiz);
  if (typeof r.settings === 'object' && r.settings !== null) {
    const st = r.settings as Record<string, unknown>;
    if (typeof st.easyJump === 'boolean') out.settings.easyJump = st.easyJump;
    if (typeof st.sound === 'boolean') out.settings.sound = st.sound;
    if (typeof st.music === 'boolean') out.settings.music = st.music;
  }
  return out;
}

export class SaveStore {
  data: SaveData = defaults();

  constructor() {
    if (new URLSearchParams(window.location.search).get('reset') === '1') this.reset();
    else this.reload();
  }

  /** Re-read from storage (or keep the in-memory data when storage is unavailable or corrupt). */
  reload(): void {
    try {
      const txt = window.localStorage.getItem(SAVE_KEY);
      if (txt) this.data = sanitize(JSON.parse(txt));
    } catch {
      // Storage blocked or JSON corrupt: keep what we have in memory.
    }
  }

  /** Write to storage. Failure is silent: progress stays in memory for this session. */
  persist(): void {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Safari private mode / quota: ignore.
    }
  }

  /** Forget everything (also used by `?reset=1`). */
  reset(): void {
    this.data = defaults();
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }

  /** Parents' page: forget the story and quiz progress but keep the settings (easy jump, sound). */
  resetProgress(): void {
    const settings = { ...this.data.settings };
    this.data = defaults();
    this.data.settings = settings;
    this.persist();
  }

  isChapterDone(id: string): boolean {
    return this.data.chaptersDone.includes(id);
  }

  markChapterDone(id: string): void {
    if (!this.data.chaptersDone.includes(id)) this.data.chaptersDone.push(id);
    this.persist();
  }

  unlockSkill(name: SkillName): void {
    this.data.skills[name] = true;
    this.persist();
  }

  setLastMode(mode: PlayerMode): void {
    if (this.data.lastMode === mode) return;
    this.data.lastMode = mode;
    this.persist();
  }

  /** Parents' page: easy jump mode (default on). */
  setEasyJump(on: boolean): void {
    if (this.data.settings.easyJump === on) return;
    this.data.settings.easyJump = on;
    this.persist();
  }

  /** Parents' page: background music (default on). */
  setMusic(on: boolean): void {
    if (this.data.settings.music === on) return;
    this.data.settings.music = on;
    this.persist();
  }

  /** Parents' page: sound (default on). */
  setSound(on: boolean): void {
    if (this.data.settings.sound === on) return;
    this.data.settings.sound = on;
    this.persist();
  }
}
