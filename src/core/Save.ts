import type { PlayerMode } from '../player/PlayerConfig';
import { Parkour } from '../config/parkour';
import { Combat } from '../config/combat';
import { CATEGORIES, isCategory, type Category } from '../quiz/types';
import { Emitter } from './Emitter';

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

/**
 * Three save slots. Slot 1 IS the original single save (`superglen.save.v1`), so an existing save is "migrated" without
 * copying anything and can never be lost; slots 2 and 3 have their own keys. `ACTIVE_KEY` remembers which slot autosave
 * writes to (missing = slot 1).
 */
export const SLOT_COUNT = 3;
export const ACTIVE_KEY = 'superglen.save.active';
const PREFS_KEY = 'superglen.prefs.v1';
export const slotKey = (n: number): string => (n === 1 ? SAVE_KEY : `superglen.save.slot${n}`);
const validSlot = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT;

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** What a slot card shows. */
export interface SlotSummary {
  slot: number;
  empty: boolean;
  /** 1..8 (the chapter being played; the last one after the story ended). */
  chapter: number;
  ended: boolean;
  /** Human place name: Kota, Lab, Hangar, Hutan, ... */
  place: string;
  mode: PlayerMode;
  coins: number;
  playSec: number;
  /** Date.now() of the last save (0 = unknown, older save). */
  savedAt: number;
}

const PLACES: Record<string, string> = { kota: 'Kota', lab: 'Lab', bab2: 'Hangar Lab', ending: 'Kota', 'forest-training': 'Hutan', 'forest-rescue': 'Hutan', 'forest-firefight': 'Hutan', 'battle-gorilla': 'Hutan' };

function summarize(slot: number, d: SaveData): SlotSummary {
  let chapter = 1;
  while (chapter < 8 && d.chaptersDone.includes(`bab${chapter}`)) chapter++;
  const times = [d.meta.savedAt, d.slot?.t ?? 0, ...Object.values(d.doneAt)];
  return {
    slot,
    empty: false,
    chapter,
    ended: d.chaptersDone.includes('ending'),
    place: PLACES[d.where] ?? 'Kota',
    mode: d.lastMode,
    coins: d.quiz.coins,
    playSec: d.meta.playSec,
    savedAt: d.meta.savedAt || Math.max(...times),
  };
}

/** Summary of one slot (`empty: true` when nothing is stored there). Never throws. */
export function readSlotSummary(slot: number): SlotSummary {
  const empty: SlotSummary = { slot, empty: true, chapter: 1, ended: false, place: '', mode: 'glen', coins: 0, playSec: 0, savedAt: 0 };
  if (!validSlot(slot)) return empty;
  const txt = lsGet(slotKey(slot));
  if (!txt) return empty;
  try {
    return summarize(slot, sanitize(JSON.parse(txt)));
  } catch {
    return empty;
  }
}

export function readAllSlots(): SlotSummary[] {
  const out: SlotSummary[] = [];
  for (let i = 1; i <= SLOT_COUNT; i++) out.push(readSlotSummary(i));
  return out;
}

export function getActiveSlot(): number {
  const n = Number(lsGet(ACTIVE_KEY));
  return validSlot(n) ? n : 1;
}

export function setActiveSlot(n: number): void {
  if (validSlot(n)) lsSet(ACTIVE_KEY, String(n));
}

/** Empty a slot for good (the caller confirmed with the child / parent first). */
export function deleteSlot(n: number): void {
  if (!validSlot(n)) return;
  try {
    window.localStorage.removeItem(slotKey(n));
  } catch {
    // ignore
  }
}

/** A brand new game in slot `n`: the slot is written empty-but-valid and becomes the active one. */
export function startNewSlot(n: number): void {
  if (!validSlot(n)) return;
  const d = defaults();
  d.meta.savedAt = Date.now();
  deleteSlot(n);
  lsSet(slotKey(n), JSON.stringify(d));
  setActiveSlot(n);
}

/** Volumes chosen on the title screen apply to every slot (stored apart from the slots). */
export function readPrefs(): { musicVol?: number; sfxVol?: number } {
  try {
    const raw = JSON.parse(lsGet(PREFS_KEY) ?? 'null') as Record<string, unknown> | null;
    const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    return raw ? { musicVol: ok(raw.musicVol) ? Math.max(0, Math.min(1, raw.musicVol)) : undefined, sfxVol: ok(raw.sfxVol) ? Math.max(0, Math.min(1, raw.sfxVol)) : undefined } : {};
  } catch {
    return {};
  }
}

export function writePrefs(musicVol: number, sfxVol: number): void {
  lsSet(PREFS_KEY, JSON.stringify({ musicVol, sfxVol }));
}

export type PreviewChapter = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Only an unambiguous, exact chapter number enables a temporary play session. */
export function previewChapterFor(query: URLSearchParams): PreviewChapter | null {
  const values = query.getAll('chapter');
  return values.length === 1 && values[0].length === 1 && /^[1-8]$/.test(values[0]) ? Number(values[0]) as PreviewChapter : null;
}

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
    /** Easy fight (parents' page): the small rats need 2 hits and attack more slowly. Default off. */
    easyFight: boolean;
    /** Parents' page: "kurangi guncangan" (battle camera shake and zoom punch off). */
    reduceShake: boolean;
    /** Camera zoom multiplier chosen by the child (1 = default distance). */
    zoom: number;
    /** Sound on/off (voice, effects and the synthesized drum; off also silences the music). */
    sound: boolean;
    /** Background music on/off (default on). */
    music: boolean;
    /** Music volume 0..1 (settings panel; the Musik switch silences it regardless). */
    musicVol: number;
    /** Effects volume 0..1 (procedural and file effects; the Suara switch silences it regardless). */
    sfxVol: number;
  };
  /** Manual save slot of the settings panel (null = empty). Chapter progress lives in `chaptersDone`, not here. */
  slot: SlotSave | null;
  /** Places the child has found (shown on the map only after that). */
  discovered: { lab: boolean };
  /**
   * Last story place the child was in: 'kota' (the city), 'lab' (inside the old building) or 'bab2' (Nino's hangar); '' =
   * never (older saves). `world/progress.ts` routes "continue" with it.
   */
  where: string;
  /** Short story pause between chapters. Empty keeps legacy saves on their old route. */
  interlude: '' | 'costume_home' | 'costume_return' | 'snake_lab' | 'snake_home' | 'snake_return' | 'rakus_home' | 'rakus_letters' | 'rakus_lab' | 'elang_bank' | 'elang_met' | 'elang_home' | 'forest_invite' | 'forest_lab' | 'forest_ready' | 'forest_training' | 'forest_quiz' | 'forest_quiz_done' | 'forest_home' | 'forest_fire_invite' | 'forest_fire_lab' | 'forest_fire_ready';
  /** Date.now() when each chapter was finished (0 / missing for saves older than this field). */
  doneAt: Record<string, number>;
  quiz: QuizSave;
  /** Kota Botanica, package D3: ids of the coins taken and of the missions done (both survive reloads). */
  city: { coins: string[]; missions: string[]; letters: number[] };
  /**
   * Chapter 3 ("Pasar Kacau!") progress in the city: `step` is '' (not started), 'chase', 'count', 'rakus' or 'closing'
   * (finished = 'bab3' in `chaptersDone`); `tamed` lists the indices of the little rats already tamed.
   */
  bab3: { step: string; tamed: number[] };
  /**
   * Chapter 4 ("Sosok Misterius", detective mode) progress in the city: `step` is '' (not started), 'school', 'aara', 'park',
   * 'track' (finished = 'bab4' in `chaptersDone`); `clue` is how many park clues were found (0..3).
   */
  bab4: { step: string; clue: number };
  /**
   * Chapter 5 ("Ular Melar") progress: `step` is '' (not started), 'walk' (to the old building with Aara), 'lab' (Aara meets Nino),
   * 'city' (to the school field), 'fight' (the snake was met) (finished = 'bab5' in `chaptersDone`).
   */
  bab5: { step: string };
  /** Chapter 6 ("Tikus Rakus") progress: `step` is '' (not started), 'city' (to the Gudang Pasar), 'fight' (the big rat was met) (finished = 'bab6' in `chaptersDone`). */
  bab6: { step: string };
  /** Toko Mainan: what the child owns and what is worn / used now (see `isOwned`, `own`, `equip` below). */
  inventory: InventorySave;
  /** Glen's hearts (1..Combat.hearts.max; running out refills at the Rumah Sakit, so 0 is never saved). */
  hearts: number;
  /** Ids of the tips (Petunjuk, see config/tips.ts) already shown in this slot. */
  tips: string[];
  /** Shown on the slot card: when this was last written and how long the child has played (seconds). */
  meta: { savedAt: number; playSec: number };
}

/** Equipment slots: Superglen costume, Glen outfit, Glen's own bike paint, and which vehicle the ride button uses. */
export type EquipSlot = 'superglen' | 'glen' | 'bike' | 'ride';
export type RideChoice = 'bike' | 'skateboard' | 'none';

export interface InventorySave {
  /** Ids of owned shop items (the free defaults are always in it). */
  owned: string[];
  equipped: { superglen: string; glen: string; bike: string; ride: RideChoice };
}

export const DEFAULT_OWNED: readonly string[] = ['sg-red', 'glen-orange', 'bike-default'];

function defaultInventory(): InventorySave {
  return { owned: [...DEFAULT_OWNED], equipped: { superglen: 'sg-red', glen: 'glen-orange', bike: 'bike-default', ride: 'bike' } };
}

function sanitizeInventory(raw: unknown): InventorySave {
  const out = defaultInventory();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 40;
  if (Array.isArray(r.owned)) out.owned = [...new Set([...DEFAULT_OWNED, ...r.owned.filter(id)])].slice(0, 200);
  if (typeof r.equipped === 'object' && r.equipped !== null) {
    const e = r.equipped as Record<string, unknown>;
    for (const k of ['superglen', 'glen', 'bike'] as const) if (id(e[k]) && out.owned.includes(e[k] as string)) out.equipped[k] = e[k] as string;
    if (e.ride === 'bike' || e.ride === 'skateboard' || e.ride === 'none') out.equipped.ride = e.ride === 'skateboard' && !out.owned.includes('skateboard') ? 'bike' : e.ride;
  }
  return out;
}

/** The store the module-level helpers below work on (the game creates exactly one). */
let currentStore: SaveStore | null = null;

/** Fired (also as a window `inventory-changed` CustomEvent) when an item was gained or the worn / used items changed. */
export const inventoryEvents = new Emitter<{ 'inventory-changed': InventorySave }>();

export function getInventory(): InventorySave {
  return currentStore?.data.inventory ?? defaultInventory();
}
export function isOwned(id: string): boolean {
  return getInventory().owned.includes(id);
}
/** Give an item (no coins involved: the shop charges first). Returns true when it was new. */
export function own(id: string): boolean {
  return currentStore ? currentStore.ownItem(id) : false;
}
/** Wear / use an owned item in `slot` (ride: 'bike' and 'none' are always allowed). Returns false when not owned. */
export function equip(slot: EquipSlot, id: string): boolean {
  return currentStore ? currentStore.equipItem(slot, id) : false;
}
export function onInventoryChanged(fn: () => void): () => void {
  return inventoryEvents.on('inventory-changed', fn);
}

/** Where the "Simpan" button put the player: level, feet position on safe ground, facing and mode. */
export interface SlotSave {
  level: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: PlayerMode;
  /** Date.now() when it was saved (0 = older save). */
  t: number;
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
    settings: { easyJump: Parkour.easy.defaultOn, easyFight: false, reduceShake: false, zoom: 1, sound: true, music: true, musicVol: 1, sfxVol: 1 },
    slot: null,
    discovered: { lab: false },
    where: '',
    interlude: '',
    doneAt: {},
    quiz: defaultQuiz(),
    city: { coins: [], missions: [], letters: [] },
    bab3: { step: '', tamed: [] },
    bab4: { step: '', clue: 0 },
    bab5: { step: '' },
    bab6: { step: '' },
    inventory: defaultInventory(),
    hearts: Combat.hearts.max,
    tips: [],
    meta: { savedAt: 0, playSec: 0 },
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
  if (typeof r.city === 'object' && r.city !== null) {
    const c = r.city as Record<string, unknown>;
    const ids = (v: unknown, max: number): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length < 40))].slice(0, max) : []);
    out.city.coins = ids(c.coins, 1000);
    out.city.missions = ids(c.missions, 100);
    if (Array.isArray(c.letters)) out.city.letters = [...new Set(c.letters.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 9))].sort((a, b) => a - b);
  }
  if (typeof r.bab3 === 'object' && r.bab3 !== null) {
    const b = r.bab3 as Record<string, unknown>;
    if (typeof b.step === 'string' && ['', 'chase', 'count', 'rakus', 'closing'].includes(b.step)) out.bab3.step = b.step;
    if (Array.isArray(b.tamed)) out.bab3.tamed = [...new Set(b.tamed.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 32))];
  }
  if (typeof r.bab4 === 'object' && r.bab4 !== null) {
    const b = r.bab4 as Record<string, unknown>;
    if (typeof b.step === 'string' && ['', 'school', 'aara', 'park', 'track', 'figure', 'lab'].includes(b.step)) out.bab4.step = b.step === 'figure' || b.step === 'lab' ? 'track' : b.step; // old saves: the figure/lab steps are gone
    if (typeof b.clue === 'number' && Number.isInteger(b.clue) && b.clue >= 0 && b.clue <= 3) out.bab4.clue = b.clue;
  }
  if (typeof r.bab5 === 'object' && r.bab5 !== null) {
    const b = r.bab5 as Record<string, unknown>;
    if (typeof b.step === 'string' && ['', 'walk', 'lab', 'city', 'fight'].includes(b.step)) out.bab5.step = b.step;
  }
  if (typeof r.bab6 === 'object' && r.bab6 !== null) {
    const b = r.bab6 as Record<string, unknown>;
    if (typeof b.step === 'string' && ['', 'city', 'fight'].includes(b.step)) out.bab6.step = b.step;
  }
  out.inventory = sanitizeInventory(r.inventory);
  if (typeof r.meta === 'object' && r.meta !== null) {
    const m = r.meta as Record<string, unknown>;
    out.meta.savedAt = nat(m.savedAt, 1e15);
    out.meta.playSec = nat(m.playSec, 1e9);
  }
  if (Array.isArray(r.tips)) out.tips = [...new Set(r.tips.filter((x): x is string => typeof x === 'string' && x.length < 40))].slice(0, 100);
  if (typeof r.hearts === 'number' && Number.isInteger(r.hearts) && r.hearts >= 1 && r.hearts <= Combat.hearts.max) out.hearts = r.hearts;
  if (typeof r.settings === 'object' && r.settings !== null) {
    const st = r.settings as Record<string, unknown>;
    if (typeof st.easyJump === 'boolean') out.settings.easyJump = st.easyJump;
    if (typeof st.easyFight === 'boolean') out.settings.easyFight = st.easyFight;
    if (typeof st.reduceShake === 'boolean') out.settings.reduceShake = st.reduceShake;
    if (typeof st.zoom === 'number' && Number.isFinite(st.zoom)) out.settings.zoom = Math.max(0.6, Math.min(2, st.zoom));
    if (typeof st.sound === 'boolean') out.settings.sound = st.sound;
    if (typeof st.music === 'boolean') out.settings.music = st.music;
    if (typeof st.musicVol === 'number' && Number.isFinite(st.musicVol)) out.settings.musicVol = Math.max(0, Math.min(1, st.musicVol));
    if (typeof st.sfxVol === 'number' && Number.isFinite(st.sfxVol)) out.settings.sfxVol = Math.max(0, Math.min(1, st.sfxVol));
  }
  if (typeof r.slot === 'object' && r.slot !== null) {
    const sl = r.slot as Record<string, unknown>;
    const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (typeof sl.level === 'string' && fin(sl.x) && fin(sl.y) && fin(sl.z)) {
      out.slot = { level: sl.level, x: sl.x, y: sl.y, z: sl.z, yaw: fin(sl.yaw) ? sl.yaw : Math.PI, mode: sl.mode === 'superglen' ? 'superglen' : 'glen', t: fin(sl.t) ? sl.t : 0 };
    }
  }
  if (typeof r.discovered === 'object' && r.discovered !== null) out.discovered.lab = (r.discovered as Record<string, unknown>).lab === true;
  if (typeof r.where === 'string') out.where = r.where;
  if (r.interlude === 'costume_home' || r.interlude === 'costume_return' || r.interlude === 'snake_lab' || r.interlude === 'snake_home' || r.interlude === 'snake_return' || r.interlude === 'rakus_home' || r.interlude === 'rakus_letters' || r.interlude === 'rakus_lab' || r.interlude === 'elang_bank' || r.interlude === 'elang_met' || r.interlude === 'elang_home' || r.interlude === 'forest_invite' || r.interlude === 'forest_lab' || r.interlude === 'forest_ready' || r.interlude === 'forest_training' || r.interlude === 'forest_quiz' || r.interlude === 'forest_quiz_done' || r.interlude === 'forest_home' || r.interlude === 'forest_fire_invite' || r.interlude === 'forest_fire_lab' || r.interlude === 'forest_fire_ready') out.interlude = r.interlude;
  if (typeof r.doneAt === 'object' && r.doneAt !== null) {
    for (const [k, v] of Object.entries(r.doneAt as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) out.doneAt[k] = v;
  }
  return out;
}

export class SaveStore {
  data: SaveData = defaults();
  readonly previewChapter: PreviewChapter | null;
  readonly previewBattle: boolean;
  readonly previewEagleBattle: boolean;
  readonly previewFlightTraining: boolean;
  readonly previewForestTraining: boolean;
  readonly previewForestQuiz: boolean;
  readonly previewForestFire: boolean;
  readonly previewForestRescue: boolean;
  readonly previewGorillaBattle: boolean;
  readonly previewFirefight: boolean;
  readonly previewLetters: boolean;
  /** `?lab=1&done=1`: the finished story in the Lab, held in memory only (the real save is never touched). */
  readonly previewLabDone: boolean;
  /** The slot (1..3) autosave writes to. */
  activeSlot = getActiveSlot();
  private playSinceSave = 0;

  constructor() {
    const query = new URLSearchParams(window.location.search);
    this.previewChapter = previewChapterFor(query);
    this.previewBattle = this.previewChapter === 3 && query.get('battle') === '1';
    this.previewEagleBattle = this.previewChapter === 7 && query.get('battle') === '1';
    this.previewFlightTraining = this.previewChapter === 7 && !this.previewEagleBattle && query.getAll('training').length === 1 && query.get('training') === '1';
    this.previewForestTraining = this.previewChapter === 8 && query.getAll('training').length === 1 && query.get('training') === '1';
    this.previewForestQuiz = this.previewChapter === 8 && query.getAll('quiz').length === 1 && query.get('quiz') === '1';
    this.previewForestFire = this.previewChapter === 8 && query.getAll('fire').length === 1 && query.get('fire') === '1';
    this.previewForestRescue = this.previewChapter === 8 && query.get('rescue') === '1';
    this.previewGorillaBattle = this.previewChapter === 8 && query.get('gorilla') === '1';
    this.previewFirefight = this.previewChapter === 8 && query.get('firefight') === '1';
    const letters = query.getAll('letters');
    this.previewLetters = this.previewChapter === 6 && letters.length === 1 && letters[0] === '1';
    currentStore = this;
    this.previewLabDone = !this.previewChapter && query.get('lab') === '1' && query.get('done') === '1';
    if (this.previewChapter || this.previewLabDone || query.get('reset') === '1') this.reset();
    else this.reload();
  }

  private freshData(): SaveData {
    const data = defaults();
    const chapter = this.previewChapter;
    if (this.previewLabDone) {
      data.chaptersDone.push('bab1', 'bab2', 'bab3', 'bab4', 'bab5', 'bab6', 'bab7', 'bab8', 'forest-firefight', 'ending');
      data.discovered.lab = true;
      data.where = 'lab';
      data.lastMode = 'superglen';
      data.skills = { laser: true, shield: true, fly: true };
      return data;
    }
    if (!chapter) return data;
    for (let i = 1; i < chapter; i++) data.chaptersDone.push(`bab${i}`);
    data.discovered.lab = chapter >= 2;
    data.where = chapter === 2 ? 'bab2' : 'kota';
    data.lastMode = chapter === 1 || chapter === 4 || chapter === 5 ? 'glen' : 'superglen';
    if (chapter >= 3) data.skills = { laser: true, shield: true, fly: true };
    if (this.previewBattle) data.bab3.step = 'chase';
    if (this.previewLetters) {
      data.chaptersDone.push('bab6');
      data.interlude = 'rakus_letters';
    }
    if (chapter === 7) data.interlude = 'elang_bank';
    if (chapter === 8) data.interlude = this.previewForestFire ? 'forest_fire_lab' : this.previewForestQuiz ? 'forest_quiz' : this.previewForestTraining ? 'forest_training' : 'forest_invite';
    return data;
  }

  /** Re-read from storage (or keep the in-memory data when storage is unavailable or corrupt). */
  reload(): void {
    if (this.previewChapter || this.previewLabDone) {
      this.data = this.freshData();
      return;
    }
    try {
      const txt = window.localStorage.getItem(slotKey(this.activeSlot));
      if (txt) this.data = sanitize(JSON.parse(txt));
    } catch {
      // Storage blocked or JSON corrupt: keep what we have in memory.
    }
    const prefs = readPrefs();
    if (prefs.musicVol !== undefined) this.data.settings.musicVol = prefs.musicVol;
    if (prefs.sfxVol !== undefined) this.data.settings.sfxVol = prefs.sfxVol;
    this.inventoryChanged();
  }

  /** Count play time (only while the child is really playing); written out with the next save and at least every 30 s. */
  tickPlay(dt: number): void {
    if (this.previewChapter || this.previewLabDone) return;
    this.playSinceSave += dt;
    const whole = Math.floor(this.playSinceSave);
    if (whole <= 0) return;
    this.playSinceSave -= whole;
    this.data.meta.playSec += whole;
    if (this.data.meta.playSec % 30 === 0) this.persist();
  }

  /** Save the current progress into slot `n` ("Simpan" in the pause menu) and make it the slot autosave writes to. */
  saveToSlot(n: number): boolean {
    if (!validSlot(n) || this.previewChapter || this.previewLabDone) return false;
    const old = this.activeSlot;
    this.activeSlot = n;
    if (!this.writeNow()) {
      this.activeSlot = old;
      return false;
    }
    setActiveSlot(n);
    return true;
  }

  /** Write to storage. Failure is silent: progress stays in memory for this session. */
  persist(): void {
    if (this.previewChapter || this.previewLabDone) return;
    this.writeNow();
  }

  private writeNow(): boolean {
    this.data.meta.savedAt = Date.now();
    try {
      window.localStorage.setItem(slotKey(this.activeSlot), JSON.stringify(this.data));
      return true;
    } catch {
      // Safari private mode / quota: ignore.
      return false;
    }
  }

  /** Forget everything (also used by `?reset=1`). */
  reset(): void {
    this.data = this.freshData();
    if (this.previewChapter || this.previewLabDone) return;
    deleteSlot(this.activeSlot);
  }

  /** Parents' page: forget the story and quiz progress but keep the settings (easy jump, sound). */
  resetProgress(): void {
    const settings = { ...this.data.settings };
    this.data = this.freshData();
    this.data.settings = settings;
    this.persist();
  }

  isChapterDone(id: string): boolean {
    return this.data.chaptersDone.includes(id);
  }

  markChapterDone(id: string): void {
    if (!this.data.chaptersDone.includes(id)) {
      this.data.chaptersDone.push(id);
      this.data.doneAt[id] = Date.now();
    }
    this.persist();
  }

  /** The story place the child is in now ('kota', 'lab', 'bab2'): "continue" starts there. */
  setWhere(where: string): void {
    if (this.data.where === where) return;
    this.data.where = where;
    this.persist();
  }

  setInterlude(interlude: SaveData['interlude']): void {
    if (this.data.interlude === interlude) return;
    this.data.interlude = interlude;
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

  /** Glen's hearts (clamped to 1..max: running out is handled by refilling). */
  setHearts(n: number): void {
    const v = Math.max(1, Math.min(Combat.hearts.max, Math.round(n)));
    if (this.data.hearts === v) return;
    this.data.hearts = v;
    this.persist();
  }

  /** Parents' page: easy fight mode (default off). */
  setEasyFight(on: boolean): void {
    if (this.data.settings.easyFight === on) return;
    this.data.settings.easyFight = on;
    this.persist();
  }

  /** Parents' page: reduce camera shake in fights (default off). */
  setReduceShake(on: boolean): void {
    if (this.data.settings.reduceShake === on) return;
    this.data.settings.reduceShake = on;
    this.persist();
  }

  /** The camera zoom the child chose (saved). */
  setZoom(z: number): void {
    if (this.data.settings.zoom === z) return;
    this.data.settings.zoom = z;
    this.persist();
  }

  /** Toko Mainan: add an item to the inventory (true when it was new). */
  ownItem(id: string): boolean {
    if (!id || id.length >= 40) return false;
    const inv = this.data.inventory;
    if (inv.owned.includes(id)) return false;
    inv.owned.push(id);
    this.persist();
    this.inventoryChanged();
    return true;
  }

  /** Toko Mainan: wear / use an owned item. */
  equipItem(slot: EquipSlot, id: string): boolean {
    const inv = this.data.inventory;
    if (slot === 'ride') {
      if (id !== 'bike' && id !== 'none' && id !== 'skateboard') return false;
      if (id === 'skateboard' && !inv.owned.includes('skateboard')) return false;
      if (inv.equipped.ride === id) return true;
      inv.equipped.ride = id;
    } else {
      if (slot !== 'superglen' && slot !== 'glen' && slot !== 'bike') return false;
      if (!inv.owned.includes(id)) return false;
      if (inv.equipped[slot] === id) return true;
      inv.equipped[slot] = id;
    }
    this.persist();
    this.inventoryChanged();
    return true;
  }

  private inventoryChanged(): void {
    inventoryEvents.emit('inventory-changed', this.data.inventory);
    try {
      window.dispatchEvent(new CustomEvent('inventory-changed', { detail: this.data.inventory }));
    } catch {
      // no DOM events: the emitter above still fired
    }
  }

  /** A tip (Petunjuk) was shown: never show it on its own again in this slot. */
  markTipSeen(id: string): void {
    if (!id || id.length >= 40 || this.data.tips.includes(id)) return;
    this.data.tips.push(id);
    this.persist();
  }

  /** Spend coins (healing). Returns false and changes nothing when there are not enough. */
  spendCoins(n: number): boolean {
    if (this.data.quiz.coins < n) return false;
    this.data.quiz.coins -= n;
    this.persist();
    return true;
  }

  /** Award coins (practice boss wins, bonuses) into the shared total and persist. */
  addCoins(n: number): void {
    if (n <= 0) return;
    this.data.quiz.coins += n;
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

  /** Settings panel: music and effects volume (0..1). */
  setVolumes(music: number, sfx: number): void {
    const m = Math.max(0, Math.min(1, music));
    const f = Math.max(0, Math.min(1, sfx));
    if (this.data.settings.musicVol === m && this.data.settings.sfxVol === f) return;
    this.data.settings.musicVol = m;
    this.data.settings.sfxVol = f;
    writePrefs(m, f);
    this.persist();
  }

  /** Settings panel: write (or clear) the manual slot. */
  setSlot(slot: SlotSave | null): void {
    this.data.slot = slot;
    this.persist();
  }

  /** The child found the hidden old Barongsai building: the map may show it from now on. */
  discoverLab(): void {
    if (this.data.discovered.lab) return;
    this.data.discovered.lab = true;
    this.persist();
  }

  /** City coin taken (once per id): it is also one more coin in the shared total. Returns false when it was already taken. */
  takeCityCoin(id: string): boolean {
    if (this.data.city.coins.includes(id)) return false;
    this.data.city.coins.push(id);
    this.data.quiz.coins += 1;
    this.persist();
    return true;
  }

  /** One position of the nine-letter SUPERGLEN hunt (the two E positions have different indices). */
  takeCityLetter(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= 9 || this.data.city.letters.includes(index)) return false;
    this.data.city.letters.push(index);
    this.data.city.letters.sort((a, b) => a - b);
    this.persist();
    return true;
  }

  /** A resident's mission was done: remember it and pay `coins` into the shared total. */
  finishCityMission(id: string, coins: number): void {
    if (!this.data.city.missions.includes(id)) this.data.city.missions.push(id);
    this.data.quiz.coins += coins;
    this.persist();
  }

  /** Chapter 3 progress (see `SaveData.bab3`). */
  setBab3(step: string, tamed: readonly number[]): void {
    this.data.bab3 = { step, tamed: [...tamed] };
    this.persist();
  }

  /** Chapter 4 progress (see `SaveData.bab4`). */
  setBab4(step: string, clue: number): void {
    this.data.bab4 = { step, clue };
    this.persist();
  }

  /** Chapter 5 progress (see `SaveData.bab5`). */
  setBab5(step: string): void {
    this.data.bab5 = { step };
    this.persist();
  }

  /** Chapter 6 progress (see `SaveData.bab6`). */
  setBab6(step: string): void {
    this.data.bab6 = { step };
    this.persist();
  }

  /** Parents' page: sound (default on). */
  setSound(on: boolean): void {
    if (this.data.settings.sound === on) return;
    this.data.settings.sound = on;
    this.persist();
  }
}
