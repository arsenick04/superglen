import '../quiz.css';
import type { DrumSynth } from '../audio/DrumSynth';
import type { Sfx } from '../audio/Sfx';
import type { SaveStore } from '../core/Save';
import type { QuizBank } from '../quiz/QuizBank';
import { QuizLines, type QuizLine } from '../quiz/lines';
import { soundWord } from '../quiz/soundWords';
import { CATEGORIES, type AlbumPage, type Category, type Choice, type Display, type PreparedQuestion, type QuizReason, type StickerRef } from '../quiz/types';
import { faceSvg } from './DialogBubble';
import { CATEGORY_COLORS, CATEGORY_NAMES, QuizIcons } from './QuizIcons';

export interface PanelDeps {
  synth: DrumSynth;
  sfx: Sfx;
  bank: QuizBank;
  save: SaveStore;
  speak: (audioId: string, text: string, kind: 'prompt' | 'word' | 'nino' | 'sound') => void;
  /** True when this animal-sound file cannot be heard (missing or sound off): the panel then shows the sound as a word. */
  soundNeedsWord: (soundId: string) => boolean;
  onOpenChange: (open: boolean) => void;
  album: () => AlbumPage[];
}

export type PanelView = 'none' | 'question' | 'end' | 'picker' | 'album';
export type PanelState = 'idle' | 'answering' | 'feedback' | 'solved';

export interface EndSummary {
  coins: number;
  sticker: StickerRef | null;
  fragment: boolean;
  allowAlbum: boolean;
}

/** Seconds. All panel timing runs on the game clock (`tick`), so it follows the paused / stepped test loop. */
const T = {
  wobble: 0.75,
  goneAfter: 0.8,
  unlockAfterWrong: 1.1,
  bubbleBack: 2.2,
  continueGuard: 0.6,
  autoContinue: 3.2,
  closeHold: 1.0,
  hudCoins: 2.6,
  fxClear: 1.5,
  reveal: 0.9,
} as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

interface Timer {
  t: number;
  fn: () => void;
}

/**
 * The Tantangan Pintar screen: a full-screen friendly overlay over the game. Pure view + the small state machine of one
 * question (answering -> feedback -> answering ... -> solved); the engine (quiz/QuizEngine.ts) decides what is asked and
 * keeps the statistics. See quiz.css for the look.
 */
export class QuizPanel {
  readonly element: HTMLDivElement;
  view: PanelView = 'none';
  state: PanelState = 'idle';
  current: PreparedQuestion | null = null;

  private readonly face: HTMLDivElement;
  private readonly bubbleEl: HTMLSpanElement;
  private readonly dots: HTMLElement[];
  private readonly coinsEl: HTMLElement;
  private readonly plusEl: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly sayBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly display: HTMLDivElement;
  private readonly cardsEl: HTMLDivElement;
  private readonly cards: HTMLButtonElement[] = [];
  private readonly endEl: HTMLDivElement;
  private readonly pickerEl: HTMLDivElement;
  private readonly albumEl: HTMLDivElement;
  private readonly fx: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly hudNum: HTMLElement;

  private timers: Timer[] = [];
  private hudT = 0;
  private holding = false;
  private holdT = 0;
  private isOpen = false;
  private idx = 0;
  private tot = 3;
  private wrongs = 0;
  private canContinue = false;
  private onSolved: ((wrong: number) => number) | null = null;
  private askResolve: ((o: { wrong: number } | null) => void) | null = null;
  private endResolve: ((v: 'ok') => void) | null = null;
  private pickResolve: ((c: Category | null) => void) | null = null;
  private albumResolve: (() => void) | null = null;
  private albumReturn: PanelView | null = null;
  private albumTab: Category = 'berhitung';
  private bubble = '';
  private readonly dev: boolean;

  constructor(
    root: HTMLElement,
    private readonly deps: PanelDeps,
  ) {
    this.dev = new URLSearchParams(window.location.search).get('quizdev') === '1';
    // ---- Small coin counter on the HUD (shows for a moment when the coins change) ----
    this.hud = el('div', 'coin-hud', `<span class="coin-ico">${QuizIcons.coin}</span><b>0</b>`);
    this.hudNum = this.hud.querySelector('b') as HTMLElement;
    root.appendChild(this.hud);

    const o = el('div', 'qp');
    o.hidden = true;
    this.element = o;
    // ---- Top: Nino, speech bubble, progress dots, coins, close ----
    const top = el('div', 'qp-top');
    this.face = el('div', 'qp-face', faceSvg('nino'));
    const bub = el('div', 'qp-bubble');
    this.bubbleEl = el('span', 'qp-bubble-text');
    bub.appendChild(this.bubbleEl);
    const dots = el('div', 'qp-dots');
    this.dots = [0, 1, 2].map(() => el('i'));
    dots.append(...this.dots);
    const coins = el('div', 'qp-coins', `<span class="coin-ico">${QuizIcons.coin}</span><b>0</b><em class="qp-plus"></em>`);
    this.coinsEl = coins.querySelector('b') as HTMLElement;
    this.plusEl = coins.querySelector('.qp-plus') as HTMLElement;
    this.closeBtn = el('button', 'qp-close', `${QuizIcons.close}<span class="qp-ring"></span>`);
    this.closeBtn.setAttribute('aria-label', 'Tutup');
    top.append(this.face, bub, dots, coins, this.closeBtn);

    // ---- Stage: repeat button, display, continue arrow ----
    const body = el('div', 'qp-body');
    const stage = el('div', 'qp-stage');
    this.sayBtn = el('button', 'qp-say', QuizIcons.speaker);
    this.sayBtn.setAttribute('aria-label', 'Ulangi');
    this.display = el('div', 'qp-display');
    this.nextBtn = el('button', 'qp-next', QuizIcons.next);
    this.nextBtn.setAttribute('aria-label', 'Lanjut');
    stage.append(this.sayBtn, this.display, this.nextBtn);

    // ---- Three big cards ----
    this.cardsEl = el('div', 'qp-cards');
    for (let i = 0; i < 3; i++) {
      const c = el('button', `qp-card c${i + 1}`);
      c.dataset.slot = String(i + 1);
      this.cards.push(c);
      this.cardsEl.appendChild(c);
    }
    this.endEl = el('div', 'qp-end');
    this.pickerEl = el('div', 'qp-picker');
    this.albumEl = el('div', 'qp-album');
    body.append(stage, this.cardsEl, this.endEl, this.pickerEl, this.albumEl);
    this.fx = el('div', 'qp-fx');
    o.append(top, body, this.fx);
    root.appendChild(o);

    // ---- Input: pointerdown (finger, pen and mouse; click is unreliable after touch preventDefault) ----
    const tap = (target: HTMLElement, fn: () => void): void => {
      target.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };
    this.cards.forEach((c, i) => tap(c, () => this.pickSlot(i)));
    tap(this.sayBtn, () => this.repeat());
    tap(this.nextBtn, () => this.continueNow());
    this.closeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.view === 'picker' || this.view === 'album') {
        this.escape();
        return;
      }
      this.holding = true;
      this.holdT = 0;
      this.closeBtn.classList.add('holding');
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.closeBtn.addEventListener(ev, () => this.releaseHold());
    // The overlay swallows every touch / click so nothing reaches the game underneath.
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart', 'contextmenu']) {
      o.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev === 'touchstart' || ev === 'contextmenu') e.preventDefault();
      });
    }
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // State for tests and the engine
  // ---------------------------------------------------------------------------------------------------------------

  get open(): boolean {
    return this.isOpen;
  }
  get debugIndex(): number {
    return this.idx;
  }
  get debugTotal(): number {
    return this.tot;
  }
  get wrongCount(): number {
    return this.wrongs;
  }
  get bubbleText(): string {
    return this.bubble;
  }

  /** Keys (1..3) of the cards still on screen. */
  visibleKeys(): number[] {
    if (this.view !== 'question') return [];
    return this.cards.map((c, i) => (c.classList.contains('gone') ? 0 : i + 1)).filter((n) => n > 0);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------------------------------------------

  /** Open the overlay for a challenge (or keep it open when the picker just ran). */
  openChallenge(reason: QuizReason, closable: boolean): void {
    this.element.dataset.reason = reason;
    this.element.classList.toggle('closable', closable);
    this.show();
    this.coinsEl.textContent = String(this.deps.save.data.quiz.coins);
  }

  private show(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.element.hidden = false;
    document.documentElement.classList.add('quiz-open');
    this.deps.onOpenChange(true);
  }

  /** Close now. Pending promises settle with "nothing" (ask / pick resolve null). */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.timers.length = 0;
    this.holding = false;
    this.closeBtn.classList.remove('holding');
    this.fx.replaceChildren();
    this.element.hidden = true;
    this.view = 'none';
    this.element.dataset.view = 'none';
    this.state = 'idle';
    this.current = null;
    document.documentElement.classList.remove('quiz-open');
    const a = this.askResolve;
    const e = this.endResolve;
    const p = this.pickResolve;
    const al = this.albumResolve;
    this.askResolve = this.endResolve = this.pickResolve = this.albumResolve = null;
    this.albumReturn = null;
    this.deps.onOpenChange(false);
    a?.(null);
    e?.('ok');
    p?.(null);
    al?.();
  }

  private setView(v: PanelView): void {
    this.view = v;
    this.element.dataset.view = v;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Time
  // ---------------------------------------------------------------------------------------------------------------

  private after(sec: number, fn: () => void): void {
    this.timers.push({ t: sec, fn });
  }

  /** Fixed-step tick. Free when nothing is happening. */
  tick(dt: number): void {
    if (this.hudT > 0) {
      this.hudT -= dt;
      if (this.hudT <= 0) this.hud.classList.remove('show');
    }
    if (!this.isOpen) return;
    if (this.holding) {
      this.holdT += dt;
      if (this.holdT >= T.closeHold) {
        this.holding = false;
        this.closeBtn.classList.remove('holding');
        this.close();
        return;
      }
    }
    if (this.timers.length === 0) return;
    const due: Timer[] = [];
    for (const t of this.timers) {
      t.t -= dt;
      if (t.t <= 0) due.push(t);
    }
    if (due.length > 0) {
      this.timers = this.timers.filter((t) => !due.includes(t));
      for (const t of due) t.fn();
    }
  }

  private releaseHold(): void {
    if (!this.holding) return;
    this.holding = false;
    this.closeBtn.classList.remove('holding');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Coins
  // ---------------------------------------------------------------------------------------------------------------

  /** The coin total changed: update the counters and flash the small HUD one (outside a quiz). */
  coinsChanged(): void {
    const n = String(this.deps.save.data.quiz.coins);
    this.hudNum.textContent = n;
    this.coinsEl.textContent = n;
    if (!this.isOpen) {
      this.hud.classList.add('show');
      this.hudT = T.hudCoins;
    }
  }

  private floatPlus(n: number): void {
    this.plusEl.textContent = `+${n}`;
    this.plusEl.classList.remove('go');
    void this.plusEl.offsetWidth;
    this.plusEl.classList.add('go');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Speech bubble
  // ---------------------------------------------------------------------------------------------------------------

  private setBubble(text: string): void {
    this.bubble = text;
    this.bubbleEl.textContent = text;
  }

  private ninoSays(line: QuizLine): void {
    this.setBubble(line.text);
    this.deps.speak(line.id, line.text, 'nino');
  }

  private repeat(): void {
    const q = this.current?.q;
    if (!q || this.view !== 'question') return;
    this.sayBtn.classList.remove('pulse');
    void this.sayBtn.offsetWidth;
    this.sayBtn.classList.add('pulse');
    this.speakQuestion(q.audio_id, q.prompt, q.display);
  }

  private speakQuestion(audioId: string, prompt: string, d: Display): void {
    this.deps.speak(audioId, prompt, 'prompt');
    if (d.kind === 'speak') this.deps.speak(d.speak_audio_id, d.text, 'word');
    if (d.kind === 'sound') this.deps.speak(d.sound_id, '', 'sound');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // One question
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Show a question. Resolves `{ wrong }` after the child found the right card and moved on, or null when the overlay was
   * closed. `onSolved(wrong)` runs the moment the right card is picked (the engine saves the statistics) and returns the
   * coins it gave.
   */
  ask(prep: PreparedQuestion, index: number, total: number, onSolved: (wrong: number) => number): Promise<{ wrong: number } | null> {
    return new Promise((resolve) => {
      this.askResolve?.(null);
      this.askResolve = resolve;
      this.onSolved = onSolved;
      this.current = prep;
      this.idx = index;
      this.tot = total;
      this.wrongs = 0;
      this.canContinue = false;
      this.timers.length = 0;
      this.fx.replaceChildren();
      this.setView('question');
      this.state = 'answering';
      this.element.dataset.cat = prep.q.category;
      this.element.dataset.kind = prep.q.display.kind;
      this.element.dataset.state = 'answering';
      this.dots.forEach((d, i) => {
        d.style.display = i < total ? '' : 'none';
        d.className = i < index ? 'done' : i === index ? 'now' : '';
      });
      this.nextBtn.classList.remove('show');
      this.setBubble(prep.q.prompt);
      this.renderDisplay(prep.q.display);
      this.renderCards(prep.order);
      this.layout();
      this.speakQuestion(prep.q.audio_id, prep.q.prompt, prep.q.display);
    });
  }

  private pickSlot(i: number): void {
    const cur = this.current;
    if (this.view !== 'question' || this.state !== 'answering' || !cur) return;
    const card = this.cards[i];
    if (!card || card.classList.contains('gone')) return;
    this.deps.sfx.quizTap();
    if (i === cur.correctIndex) this.solve(card);
    else this.wrongPick(card);
  }

  private wrongPick(card: HTMLButtonElement): void {
    const cur = this.current as PreparedQuestion;
    this.wrongs++;
    this.state = 'feedback';
    this.element.dataset.state = 'feedback';
    card.classList.add('wobble');
    this.deps.sfx.quizWrong();
    const help = this.wrongs >= 2;
    this.ninoSays(help ? QuizLines.tinggal : QuizLines.hampir);
    this.after(T.goneAfter, () => {
      card.classList.remove('wobble');
      card.classList.add('gone');
      if (help) {
        // Only the right card remains.
        this.cards.forEach((c, k) => {
          if (k !== cur.correctIndex) c.classList.add('gone');
        });
        this.cards[cur.correctIndex].classList.add('hint');
      }
    });
    this.after(T.unlockAfterWrong, () => {
      this.state = 'answering';
      this.element.dataset.state = 'answering';
    });
    this.after(T.bubbleBack, () => {
      if (this.state === 'answering') this.setBubble(cur.q.prompt);
    });
  }

  private solve(card: HTMLButtonElement): void {
    const cur = this.current as PreparedQuestion;
    this.state = 'solved';
    this.element.dataset.state = 'solved';
    this.timers.length = 0;
    card.classList.add('right');
    card.classList.remove('hint');
    this.cards.forEach((c, k) => {
      if (k !== cur.correctIndex && !c.classList.contains('gone')) c.classList.add('dim');
    });
    this.dots[this.idx]?.classList.replace('now', 'done');
    const coins = this.onSolved ? this.onSolved(this.wrongs) : 0;
    this.coinsEl.textContent = String(this.deps.save.data.quiz.coins);
    if (coins > 0) this.floatPlus(coins);
    this.ninoSays(QuizLines.hebat);
    this.deps.synth.drum(Math.min(4, 1 + this.idx), true);
    this.deps.sfx.quizRight();
    this.after(0.18, () => this.deps.synth.drum(Math.min(4, 2 + this.idx), true));
    this.fireworks(card);
    this.nextBtn.classList.add('show');
    this.canContinue = false;
    this.after(T.continueGuard, () => {
      this.canContinue = true;
    });
    this.after(T.autoContinue, () => this.continueNow(true));
    this.after(T.fxClear, () => this.fx.replaceChildren());
  }

  /** Go on to the next question (tap the arrow, Enter / Space, or by itself after a moment). */
  private continueNow(auto = false): void {
    if (this.state !== 'solved' || (!this.canContinue && !auto)) return;
    this.state = 'idle';
    this.nextBtn.classList.remove('show');
    const r = this.askResolve;
    this.askResolve = null;
    r?.({ wrong: this.wrongs });
  }

  /** A few small bursts of sparks over the right card. */
  private fireworks(card: HTMLElement): void {
    const r = card.getBoundingClientRect();
    const host = this.element.getBoundingClientRect();
    const cx = r.left - host.left + r.width / 2;
    const cy = r.top - host.top + r.height / 2;
    const colors = ['#ffd23f', '#ff6f6f', '#5fd6c4', '#ff8fb1', '#9fd8ff', '#b583ff'];
    const frag = document.createDocumentFragment();
    for (let b = 0; b < 3; b++) {
      const bx = cx + (b - 1) * Math.min(90, r.width * 0.45);
      const by = cy - 20 - (b === 1 ? 20 : 0);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + b;
        const dist = 38 + ((k * 7 + b * 5) % 5) * 9;
        const s = el('span', 'qp-spark');
        s.style.left = `${bx}px`;
        s.style.top = `${by}px`;
        s.style.setProperty('--dx', `${Math.cos(a) * dist}px`);
        s.style.setProperty('--dy', `${Math.sin(a) * dist}px`);
        s.style.background = colors[(k + b) % colors.length];
        s.style.animationDelay = `${b * 0.12}s`;
        frag.appendChild(s);
      }
    }
    this.fx.appendChild(frag);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Rendering: pictures, display area, cards
  // ---------------------------------------------------------------------------------------------------------------

  private picture(itemKey: string | undefined, extra = ''): HTMLElement {
    const item = itemKey ? this.deps.bank.items[itemKey] : undefined;
    if (itemKey && item && this.deps.bank.images.has(itemKey)) {
      const img = el('img', `qp-pic ${extra}`);
      img.alt = item.label;
      img.draggable = false;
      img.src = `${import.meta.env.BASE_URL}img/quiz/${itemKey}.webp`;
      img.addEventListener('error', () => {
        const s = el('span', `qp-emoji ${extra}`, item.emoji);
        img.replaceWith(s);
      });
      return img;
    }
    return el('span', `qp-emoji ${extra}`, item ? item.emoji : '❓');
  }

  private group(itemKey: string, count: number): HTMLElement {
    const rows = count > 6 ? 2 : 1;
    const g = el('span', `qp-group r${rows}`);
    const cols = Math.ceil(count / rows);
    g.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    for (let i = 0; i < count; i++) g.appendChild(this.picture(itemKey));
    return g;
  }

  private renderDisplay(d: Display): void {
    const inner = el('div', `qp-display-in kind-${d.kind}`);
    switch (d.kind) {
      case 'count':
        inner.appendChild(this.group(d.item, d.count));
        break;
      case 'sum':
        inner.append(this.group(d.a.item, d.a.count), el('span', 'qp-op', '+'), this.group(d.b.item, d.b.count), el('span', 'qp-op', '= ?'));
        break;
      case 'equation':
        inner.appendChild(el('span', 'qp-eq', d.text.includes('=') ? d.text : `${d.text} = ?`));
        break;
      case 'picture':
        inner.appendChild(this.picture(d.item, 'big'));
        break;
      case 'silhouette':
        inner.appendChild(this.picture(d.item, 'big sil'));
        break;
      case 'sound': {
        inner.appendChild(el('span', 'qp-sound', QuizIcons.speaker));
        // No sound file (or sound off): a pre-reader still needs a clue, so the animal's own word shows in a speech bubble.
        const word = this.deps.soundNeedsWord(d.sound_id) ? soundWord(d.item) : '';
        if (word) inner.appendChild(el('span', 'qp-soundword', word));
        if (this.dev) inner.appendChild(el('span', 'qp-dev', d.sound_id));
        break;
      }
      case 'text':
        inner.appendChild(el('span', 'qp-bigtext', d.text));
        break;
      case 'speak': {
        const w = el('span', `qp-word lang-${d.lang}`);
        w.appendChild(el('span', 'qp-word-t', d.text));
        if (d.pinyin) w.appendChild(el('span', 'qp-pinyin', d.pinyin));
        inner.appendChild(w);
        break;
      }
      case 'none':
        break;
    }
    this.display.replaceChildren(inner);
    this.display.classList.toggle('empty', d.kind === 'none');
  }

  private cardContent(c: Choice): HTMLElement {
    const inner = el('div', 'qp-card-in');
    if (c.item !== undefined) inner.appendChild(this.picture(c.item, c.text !== undefined ? 'small' : ''));
    if (c.text !== undefined) {
      const t = el('span', `qp-ctext${c.lang === 'zh' || c.pinyin ? ' zh' : ''}${c.item !== undefined ? ' under' : ''}`);
      t.appendChild(el('span', 'qp-ctext-t', c.text));
      if (c.pinyin) t.appendChild(el('span', 'qp-pinyin', c.pinyin));
      inner.appendChild(t);
    }
    return inner;
  }

  private renderCards(order: readonly Choice[]): void {
    this.cards.forEach((card, i) => {
      card.className = `qp-card c${i + 1}`;
      const key = el('span', 'qp-key', String(i + 1));
      card.replaceChildren(key, this.cardContent(order[i]));
    });
  }

  /** Measure the free space once, hand it to the CSS and shrink anything that does not fit (also on resize). */
  private layout(): void {
    if (!this.isOpen) return;
    const dh = this.display.clientHeight;
    this.element.style.setProperty('--dh', `${Math.max(40, dh)}px`);
    this.element.style.setProperty('--dw', `${Math.max(100, this.display.clientWidth)}px`);
    if (this.view === 'question') {
      this.fit(this.display, this.display.firstElementChild as HTMLElement | null, 12);
      for (const c of this.cards) this.fit(c, c.querySelector('.qp-card-in'), 14);
    }
  }

  private fit(box: HTMLElement, inner: HTMLElement | null, pad: number): void {
    if (!inner) return;
    inner.style.scale = '';
    const w = inner.offsetWidth;
    const h = inner.offsetHeight;
    if (w <= 0 || h <= 0) return;
    const s = Math.min(1, (box.clientWidth - pad) / w, (box.clientHeight - pad) / h);
    if (s < 1) inner.style.scale = String(Math.max(0.2, s).toFixed(3));
  }

  private readonly onResize = (): void => {
    if (this.isOpen) this.layout();
  };

  // ---------------------------------------------------------------------------------------------------------------
  // End screen
  // ---------------------------------------------------------------------------------------------------------------

  showEnd(s: EndSummary): Promise<'ok'> {
    return new Promise((resolve) => {
      this.endResolve = resolve;
      this.timers.length = 0;
      this.fx.replaceChildren();
      this.setView('end');
      this.state = 'idle';
      this.element.dataset.state = 'idle';
      this.dots.forEach((d) => (d.className = 'done'));
      const e = this.endEl;
      e.replaceChildren();
      const coin = el('div', 'qp-end-coin', `<span class="coin-ico">${QuizIcons.coin}</span><b>+${s.coins}</b>`);
      e.appendChild(coin);
      if (s.sticker) {
        const st = el('div', 'qp-end-sticker');
        const gift = el('div', 'qp-gift', QuizIcons.gift);
        const face = el('div', 'qp-sticker-face');
        face.appendChild(this.picture(s.sticker.item));
        st.append(gift, face);
        e.appendChild(st);
        this.after(T.reveal, () => {
          st.classList.add('reveal');
          this.deps.sfx.sparkle();
          this.deps.synth.cheer();
          this.fireworks(st);
        });
      }
      if (s.fragment) e.appendChild(el('div', 'qp-end-frag', `<span class="frag-ico">${QuizIcons.puzzle}</span><b>+1</b>`));
      const btns = el('div', 'qp-end-btns');
      if (s.allowAlbum) {
        const ab = el('button', 'qp-albumbtn', QuizIcons.book);
        ab.setAttribute('aria-label', 'Album stiker');
        ab.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.openAlbum('end');
        });
        btns.appendChild(ab);
      }
      const ok = el('button', 'qp-ok', QuizIcons.check);
      ok.setAttribute('aria-label', 'Selesai');
      ok.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.finishEnd();
      });
      btns.appendChild(ok);
      e.appendChild(btns);
      this.ninoSays(QuizLines.selesai);
      this.deps.synth.cheer();
      if (s.fragment) this.after(2.2, () => this.ninoSays(QuizLines.kepingan));
    });
  }

  private finishEnd(): void {
    const r = this.endResolve;
    this.endResolve = null;
    r?.('ok');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Category picker
  // ---------------------------------------------------------------------------------------------------------------

  pickCategory(): Promise<Category | null> {
    return new Promise((resolve) => {
      this.pickResolve?.(null);
      this.pickResolve = resolve;
      this.openChallenge('terminal', true);
      this.timers.length = 0;
      this.setView('picker');
      this.state = 'idle';
      this.dots.forEach((d) => (d.style.display = 'none'));
      const p = this.pickerEl;
      p.replaceChildren();
      CATEGORIES.forEach((cat, i) => {
        const b = el('button', 'qp-cat');
        b.dataset.category = cat;
        b.style.setProperty('--cc', CATEGORY_COLORS[cat]);
        b.append(el('span', 'qp-key', String(i + 1)), el('span', `qp-cat-ico ico-${cat}`, QuizIcons.category[cat]));
        b.setAttribute('aria-label', CATEGORY_NAMES[cat]);
        b.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.choose(cat);
        });
        p.appendChild(b);
      });
      this.ninoSays(QuizLines.pilih);
    });
  }

  private choose(cat: Category): void {
    if (this.view !== 'picker') return;
    const r = this.pickResolve;
    this.pickResolve = null;
    r?.(cat);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Sticker album
  // ---------------------------------------------------------------------------------------------------------------

  /** Open the album on its own (parents' page). Resolves when closed. */
  showAlbum(): Promise<void> {
    return new Promise((resolve) => {
      this.albumResolve?.();
      this.albumResolve = resolve;
      this.openChallenge('terminal', true);
      this.openAlbum(null);
    });
  }

  private openAlbum(returnTo: PanelView | null): void {
    this.albumReturn = returnTo;
    this.setView('album');
    this.dots.forEach((d) => (d.style.display = 'none'));
    this.setBubble('Album stikermu');
    this.deps.speak(QuizLines.album.id, QuizLines.album.text, 'nino');
    this.renderAlbum();
  }

  private renderAlbum(): void {
    const pages = this.deps.album();
    const page = pages.find((p) => p.category === this.albumTab) ?? pages[0];
    const a = this.albumEl;
    a.replaceChildren();
    const tabs = el('div', 'qp-tabs');
    CATEGORIES.forEach((cat, i) => {
      const b = el('button', `qp-tab${cat === page.category ? ' on' : ''}`);
      b.dataset.category = cat;
      b.style.setProperty('--cc', CATEGORY_COLORS[cat]);
      b.append(el('span', 'qp-key', String(i + 1)), el('span', 'qp-tab-ico', QuizIcons.category[cat]));
      b.setAttribute('aria-label', CATEGORY_NAMES[cat]);
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.albumTab = cat;
        this.renderAlbum();
      });
      tabs.appendChild(b);
    });
    const ok = el('button', 'qp-ok sm', QuizIcons.check);
    ok.setAttribute('aria-label', 'Tutup');
    ok.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.escape();
    });
    tabs.appendChild(ok);
    const grid = el('div', 'qp-grid');
    grid.dataset.owned = String(page.owned.size);
    grid.dataset.total = String(page.pool.length);
    for (const key of page.pool) {
      const own = page.owned.has(key);
      const cell = el('div', `qp-slot${own ? ' own' : ''}`);
      cell.dataset.item = key;
      cell.appendChild(this.picture(key, own ? '' : 'sil'));
      grid.appendChild(cell);
    }
    a.append(tabs, grid, el('div', 'qp-album-count', `${page.owned.size} / ${page.pool.length}`));
    // Slot size: as large as the free height allows (rows computed from the width).
    const cols = page.pool.length > 12 ? 8 : 6;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    requestAnimationFrame(() => this.sizeGrid(grid, cols, page.pool.length));
    this.sizeGrid(grid, cols, page.pool.length);
  }

  private sizeGrid(grid: HTMLElement, cols: number, n: number): void {
    if (!this.isOpen || !grid.isConnected) return;
    const rows = Math.max(1, Math.ceil(n / cols));
    const side = Math.floor(Math.min(grid.clientWidth / cols, grid.clientHeight / rows)) - 6;
    grid.style.setProperty('--slot', `${Math.max(24, side)}px`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------------------------------------------

  /** Esc: leaves the picker and the album (never a challenge: a story gate cannot be skipped). */
  private escape(): void {
    if (this.view === 'album') {
      const back = this.albumReturn;
      this.albumReturn = null;
      if (back === 'end') {
        this.setView('end');
        this.setBubble(QuizLines.selesai.text);
      } else this.close();
    } else if (this.view === 'picker') this.close();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const digit = k >= '1' && k <= '9' ? Number(k) : 0;
    let used = false;
    if (this.view === 'question') {
      if (digit >= 1 && digit <= 3) {
        this.pickSlot(digit - 1);
        used = true;
      } else if (k === 'Enter' || k === ' ') {
        this.continueNow();
        used = true;
      }
    } else if (this.view === 'end') {
      if (k === 'Enter' || k === ' ') {
        this.finishEnd();
        used = true;
      }
    } else if (this.view === 'picker') {
      if (digit >= 1 && digit <= CATEGORIES.length) {
        this.choose(CATEGORIES[digit - 1]);
        used = true;
      } else if (k === 'Escape') this.escape();
    } else if (this.view === 'album') {
      if (digit >= 1 && digit <= CATEGORIES.length) {
        this.albumTab = CATEGORIES[digit - 1];
        this.renderAlbum();
        used = true;
      } else if (k === 'Enter' || k === ' ' || k === 'Escape') {
        this.escape();
        used = true;
      }
    }
    if (used) {
      e.preventDefault();
      e.stopImmediatePropagation(); // the game must not see Space / Enter as jump / interact
    }
  };
}
