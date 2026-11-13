import type { SaveStore, QuizCategorySave } from '../core/Save';
import type { DrumSynth } from '../audio/DrumSynth';
import { QuizPanel } from '../ui/QuizPanel';
import { loadBank, type QuizBank } from './QuizBank';
import {
  CATEGORIES,
  type AlbumPage,
  type Category,
  type Choice,
  type DisplayKind,
  type PreparedQuestion,
  type Question,
  type QuizAnswerRecord,
  type QuizResult,
  type QuizRunOptions,
  type SpeakListener,
  type StickerRef,
} from './types';

/** Tunable numbers of the Tantangan Pintar in one place. */
export const QuizConfig = {
  /** Questions per challenge. */
  count: 3,
  /** Level up after this many first-try answers in a row. */
  levelUpStreak: 3,
  /** Level down when this many of the last `window` answers were not first try. */
  levelDownMisses: 3,
  window: 5,
  /** Coins: per answered question, plus a bonus for a first-try answer. */
  coinPerQuestion: 1,
  coinFirstTryBonus: 2,
  /** Questions remembered to avoid repeats. */
  recentMax: 40,
  /** Wrong picks after which only the right card remains. */
  wrongsBeforeHelp: 2,
  /** A "kepingan memori ilmuwan" for every this many completed challenges. */
  fragmentEvery: 5,
  /** Stickers per album page. */
  stickersPerPage: 24,
  /** First-try rate from which a category counts as "lancar" (parents page). */
  fluentRate: 0.6,
} as const;

/** Mulberry32: tiny seedable generator (the same seed gives the same quiz, for tests via `?quizseed=`). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface QuizDeps {
  save: SaveStore;
  synth: DrumSynth;
  /** The #ui overlay root. */
  ui: HTMLElement;
  /** The overlay opened / closed (the game locks the controls and lets go of the mouse). */
  onOpenChange: (open: boolean) => void;
}

/**
 * Tantangan Pintar: 3 questions, 3 big picture cards, never failed (after two wrong picks only the right card is left).
 *
 *   const r = await ctx.quiz.run({ category: 'berhitung', reason: 'unlock' });   // resolves when the child is done
 *   const cat = await ctx.quiz.pick();                                            // the 5-icon category picker (or null)
 *
 * Adaptive level per category (1..3, see QuizConfig): `levelUpStreak` first-try answers in a row go up one level,
 * `levelDownMisses` not-first-try answers among the last `window` go down one. Coins, stickers, memory fragments and
 * per-category statistics are stored in `save.data.quiz`.
 */
export class QuizEngine {
  readonly bank: QuizBank;
  readonly panel: QuizPanel;
  private readonly rng: () => number;
  private readonly listeners: SpeakListener[] = [];
  private running: Promise<QuizResult> | null = null;
  /** Spoken lines announced so far (tests / future audio manager). */
  readonly spoken: string[] = [];
  /** Test handle state. */
  lastResult: QuizResult | null = null;
  picked = '';

  constructor(private readonly deps: QuizDeps) {
    this.bank = loadBank();
    const q = new URLSearchParams(window.location.search).get('quizseed');
    const seed = q !== null && q !== '' && Number.isFinite(Number(q)) ? Number(q) : (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
    this.rng = makeRng(seed);
    this.panel = new QuizPanel(deps.ui, {
      synth: deps.synth,
      bank: this.bank,
      save: deps.save,
      speak: (id, text, kind) => this.announce(id, text, kind),
      onOpenChange: deps.onOpenChange,
      album: () => this.albumPages(),
    });
  }

  private get data() {
    return this.deps.save.data.quiz;
  }

  /** True while the quiz overlay is on screen. */
  get open(): boolean {
    return this.panel.open;
  }

  /** Audio hook: called with the audio id of every line the quiz says (the file may not exist; never break on that). */
  onSpeak(cb: SpeakListener): void {
    this.listeners.push(cb);
  }

  private announce(audioId: string, text: string, kind: 'prompt' | 'word' | 'nino'): void {
    this.spoken.push(audioId);
    if (this.spoken.length > 200) this.spoken.shift();
    for (const l of this.listeners) {
      try {
        l(audioId, text, kind);
      } catch (err) {
        console.error('Quiz onSpeak listener failed:', err);
      }
    }
  }

  /** Game-time tick (fixed step): panel timers. Does nothing while closed. */
  tick(dt: number): void {
    this.panel.tick(dt);
  }

  /** Close the overlay now (level unload, terminal close). A running challenge resolves as not completed. */
  cancel(): void {
    this.panel.close();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Running a challenge
  // ---------------------------------------------------------------------------------------------------------------

  run(opts: QuizRunOptions): Promise<QuizResult> {
    if (this.running) return this.running;
    const p = this.runInner(opts).finally(() => {
      this.running = null;
    });
    this.running = p;
    return p;
  }

  /** The category picker (hall terminal). Resolves with the chosen category, or null when closed. */
  pick(): Promise<Category | null> {
    return this.panel.pickCategory();
  }

  /** The sticker album screen. Resolves when it is closed. */
  showAlbum(): Promise<void> {
    return this.panel.showAlbum();
  }

  private async runInner(opts: QuizRunOptions): Promise<QuizResult> {
    const count = Math.max(1, opts.count ?? QuizConfig.count);
    const reason = opts.reason ?? 'story';
    const result: QuizResult = { category: opts.category, reason, completed: false, answers: [], coins: 0, sticker: null, stickerNew: false, fragment: false };
    const cats: Category[] = [];
    if (opts.category === 'mix') {
      const all = this.shuffle([...CATEGORIES]);
      for (let i = 0; i < count; i++) cats.push(all[i % all.length]);
    } else {
      for (let i = 0; i < count; i++) cats.push(opts.category);
    }
    const taken = new Set<string>();
    this.panel.openChallenge(reason, reason === 'terminal');
    for (let i = 0; i < count; i++) {
      const q = this.choose(cats[i], taken);
      taken.add(q.id);
      const prep = this.prepare(q);
      const out = await this.panel.ask(prep, i, count, (wrong) => {
        const rec = this.record(q, wrong);
        result.answers.push(rec.answer);
        result.coins += rec.coins;
        return rec.coins;
      });
      if (out === null) {
        // Closed in the middle: what was earned stays; no sticker.
        this.panel.close();
        return result;
      }
    }
    result.completed = true;
    // ---- Rewards: sticker, fragment ----
    const d = this.data;
    d.challenges++;
    if (d.challenges % QuizConfig.fragmentEvery === 0) {
      d.fragments++;
      result.fragment = true;
    }
    const stickerCat = cats[0];
    const st = this.awardSticker(stickerCat);
    if (st) {
      result.sticker = st;
      result.stickerNew = true;
    }
    this.deps.save.persist();
    await this.panel.showEnd({ coins: result.coins, sticker: result.sticker, fragment: result.fragment, allowAlbum: reason === 'terminal' });
    this.panel.close();
    return result;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Choosing and preparing questions
  // ---------------------------------------------------------------------------------------------------------------

  /** A question for `cat` at the child's current level, avoiding the recently asked ones and the ones already in this challenge. */
  choose(cat: Category, taken: ReadonlySet<string>): Question {
    const pool = this.bank.byCategory[cat];
    const level = this.data.cats[cat].level;
    const recent = new Set(this.data.recent);
    const fresh = pool.filter((q) => !taken.has(q.id));
    const tiers: Question[][] = [];
    tiers.push(fresh.filter((q) => q.level === level && !recent.has(q.id)));
    // Nearest levels first.
    for (const dist of [1, 2]) tiers.push(fresh.filter((q) => Math.abs(q.level - level) === dist && !recent.has(q.id)));
    tiers.push(fresh.filter((q) => q.level === level));
    tiers.push(fresh);
    tiers.push(pool);
    for (const t of tiers) if (t.length > 0) return t[Math.floor(this.rng() * t.length)];
    throw new Error(`Quiz: no questions for ${cat}`);
  }

  /** Shuffle the on-screen order of the three choices (the answer is tracked by position). */
  prepare(q: Question): PreparedQuestion {
    const order = this.shuffle([...q.choices]) as [Choice, Choice, Choice];
    const correctIndex = order.findIndex((c) => c.id === q.answer) as 0 | 1 | 2;
    return { q, order, correctIndex };
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Statistics, adaptive level, coins
  // ---------------------------------------------------------------------------------------------------------------

  /** Called when a question has been answered right (`wrong` = wrong picks before). Updates and saves. */
  private record(q: Question, wrong: number): { answer: QuizAnswerRecord; coins: number } {
    const d = this.data;
    const s = d.cats[q.category];
    const firstTry = wrong === 0;
    s.asked++;
    s.wrong += wrong;
    if (firstTry) s.firstTry++;
    s.last = Date.now();
    this.adapt(s, firstTry);
    d.recent.push(q.id);
    if (d.recent.length > QuizConfig.recentMax) d.recent.splice(0, d.recent.length - QuizConfig.recentMax);
    const coins = QuizConfig.coinPerQuestion + (firstTry ? QuizConfig.coinFirstTryBonus : 0);
    d.coins += coins;
    this.deps.save.persist();
    this.panel.coinsChanged();
    return { answer: { id: q.id, category: q.category, firstTry, wrong }, coins };
  }

  /** The adaptive difficulty rule (see class comment). */
  private adapt(s: QuizCategorySave, firstTry: boolean): void {
    s.streak = firstTry ? s.streak + 1 : 0;
    s.recent.push(firstTry ? 0 : 1);
    if (s.recent.length > QuizConfig.window) s.recent.splice(0, s.recent.length - QuizConfig.window);
    if (s.streak >= QuizConfig.levelUpStreak && s.level < 3) {
      s.level++;
      s.streak = 0;
      s.recent = [];
    } else if (s.recent.reduce((a, b) => a + b, 0) >= QuizConfig.levelDownMisses && s.level > 1) {
      s.level--;
      s.streak = 0;
      s.recent = [];
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Stickers and album
  // ---------------------------------------------------------------------------------------------------------------

  private readonly poolCache = new Map<Category, string[]>();

  /** Item keys that can become a sticker of this category (pictures seen in its questions), at most one album page. */
  stickerPool(cat: Category): string[] {
    const hit = this.poolCache.get(cat);
    if (hit) return hit;
    const keys: string[] = [];
    const add = (k: string | undefined): void => {
      if (k && this.bank.items[k] && !keys.includes(k)) keys.push(k);
    };
    for (const q of this.bank.byCategory[cat]) {
      const d = q.display;
      if ('item' in d) add(d.item);
      if (d.kind === 'sum') {
        add(d.a.item);
        add(d.b.item);
      }
      for (const c of q.choices) add(c.item);
    }
    const pool = keys.slice(0, QuizConfig.stickersPerPage);
    this.poolCache.set(cat, pool);
    return pool;
  }

  private awardSticker(cat: Category): StickerRef | null {
    const owned = new Set(this.data.stickers);
    const free = this.stickerPool(cat).filter((k) => !owned.has(`${cat}:${k}`));
    if (free.length === 0) return null;
    const item = free[Math.floor(this.rng() * free.length)];
    this.data.stickers.push(`${cat}:${item}`);
    return { category: cat, item };
  }

  albumPages(): AlbumPage[] {
    const owned = new Set(this.data.stickers);
    return CATEGORIES.map((category) => {
      const pool = this.stickerPool(category);
      return { category, pool, owned: new Set(pool.filter((k) => owned.has(`${category}:${k}`))) };
    });
  }

  /** Parents' page: per category numbers. */
  categoryStats(): { category: Category; level: number; asked: number; firstTry: number; rate: number; label: 'lancar' | 'perlu latihan' | 'baru mulai' }[] {
    return CATEGORIES.map((category) => {
      const s = this.data.cats[category];
      const rate = s.asked > 0 ? s.firstTry / s.asked : 0;
      const label = s.asked < 3 ? 'baru mulai' : rate >= QuizConfig.fluentRate ? 'lancar' : 'perlu latihan';
      return { category, level: s.level, asked: s.asked, firstTry: s.firstTry, rate, label };
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Test handle
  // ---------------------------------------------------------------------------------------------------------------

  /** Live values for `window.__superglen.quiz` (getters: nothing is computed per frame). */
  debugHandle(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const p = this.panel;
    return {
      get open() {
        return p.open;
      },
      get view() {
        return p.view;
      },
      get state() {
        return p.state;
      },
      get index() {
        return p.debugIndex;
      },
      get total() {
        return p.debugTotal;
      },
      get questionId() {
        return p.current ? p.current.q.id : '';
      },
      get category() {
        return p.current ? p.current.q.category : '';
      },
      get kind() {
        return p.current ? p.current.q.display.kind : '';
      },
      get prompt() {
        return p.current ? p.current.q.prompt : '';
      },
      /** 1..3: the on-screen key of the right card. */
      get correctKey() {
        return p.current ? p.current.correctIndex + 1 : 0;
      },
      /** Keys (1..3) of the cards still on screen. */
      get visibleKeys() {
        return p.visibleKeys();
      },
      get wrong() {
        return p.wrongCount;
      },
      get bubble() {
        return p.bubbleText;
      },
      get coins() {
        return self.data.coins;
      },
      get challenges() {
        return self.data.challenges;
      },
      get fragments() {
        return self.data.fragments;
      },
      get stickers() {
        return self.data.stickers.length;
      },
      get spoken() {
        return self.spoken.slice(-6);
      },
      get bankSource() {
        return self.bank.source;
      },
      get bankSize() {
        return Object.fromEntries(CATEGORIES.map((c) => [c, self.bank.byCategory[c].length]));
      },
      get levels() {
        return Object.fromEntries(CATEGORIES.map((c) => [c, self.data.cats[c].level]));
      },
      /** One question id per (category, display kind) in the bank, for the render tests. */
      samples(): { id: string; category: Category; kind: DisplayKind }[] {
        const out: { id: string; category: Category; kind: DisplayKind }[] = [];
        for (const c of CATEGORIES) {
          const seen = new Set<string>();
          for (const q of self.bank.byCategory[c]) {
            if (!seen.has(q.display.kind)) {
              seen.add(q.display.kind);
              out.push({ id: q.id, category: c, kind: q.display.kind });
            }
          }
        }
        return out;
      },
      /** Every question id of the bank (render tests). */
      allIds(): string[] {
        return CATEGORIES.flatMap((c) => self.bank.byCategory[c].map((q) => q.id));
      },
      /** Show one question in the panel without running a challenge (render tests). */
      preview(id: string): boolean {
        for (const c of CATEGORIES) {
          const q = self.bank.byCategory[c].find((x) => x.id === id);
          if (q) {
            p.openChallenge('terminal', true);
            void p.ask(self.prepare(q), 0, 3, () => 0);
            return true;
          }
        }
        return false;
      },
      /** Start a challenge without a promise handle; the outcome appears in `lastResult`. */
      start(category: Category | 'mix', count = 3, reason: 'unlock' | 'terminal' | 'story' = 'terminal'): void {
        self.lastResult = null;
        void self.run({ category, count, reason }).then((r) => {
          self.lastResult = r;
        });
      },
      get lastResult() {
        return self.lastResult;
      },
      /** Open the category picker; the chosen category appears in `picked`. */
      pickStart(): void {
        self.picked = '';
        void self.pick().then((c) => {
          self.picked = c ?? 'null';
        });
      },
      get picked() {
        return self.picked;
      },
      showAlbum(): void {
        void self.showAlbum();
      },
      close() {
        self.cancel();
      },
    };
  }
}
