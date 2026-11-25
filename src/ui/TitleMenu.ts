import { deleteSlot, getActiveSlot, readAllSlots, readPrefs, setActiveSlot, startNewSlot, writePrefs, type SlotSummary } from '../core/Save';
import { tvMode, type TvPref } from '../core/TvMode';
import { MenuIcons } from './MenuIcons';
import { QuizIcons } from './QuizIcons';
import { ModeIcons, bindPress, make, slotCard } from './SlotCards';
import './menu.css';

/**
 * The title screen: logo, then "Main Baru", "Lanjutkan / Muat" and "Pengaturan". It is plain DOM and lives before the Game
 * exists; picking a game calls `onChoose` synchronously inside the tap/click, so the Game (and its audio unlock) is created
 * inside the user's gesture, which iOS Safari needs.
 *
 * Works with touch and mouse (click), keyboard (arrows / WASD, Enter, Escape) and a gamepad (d-pad / stick, Cross, Circle).
 */

export interface TitleChoice {
  slot: number;
  /** 'new' = fresh game (slot already cleared), 'continue' = play the slot, 'parents' = open the parents' page first. */
  mode: 'new' | 'continue' | 'parents';
}

const DEBUG_KEYS = ['level', 'chapter', 'lab', 'training', 'ending', 'reset', 'free', 'story', 'battle', 'done', 'quiz', 'fire', 'rescue', 'gorilla', 'firefight', 'letters'];
const PARENTS_HOLD_MS = 3000;

/**
 * The title menu is for real play. Debug URLs (?level=, ?chapter=, ?lab=1, ?training=1, ?reset=1 ...) and the automated tests
 * (`window.__SG_TEST`) keep the plain "tap to start" screen, as before; `?menu=1` forces the menu, `?menu=0` turns it off.
 * Returning from a pause-menu load sets a one-time marker so the chosen slot starts without the menu again.
 */
export function shouldShowTitle(): boolean {
  const q = new URLSearchParams(window.location.search);
  let marker = false;
  try {
    marker = window.sessionStorage.getItem('superglen.skiptitle') === '1';
    window.sessionStorage.removeItem('superglen.skiptitle');
  } catch {
    // ignore
  }
  if (marker) return false;
  const menu = q.get('menu');
  if (menu === '0') return false;
  if (menu === '1') return true;
  if (DEBUG_KEYS.some((k) => q.has(k))) return false;
  return !(window as unknown as { __SG_TEST?: boolean }).__SG_TEST;
}

/** The next reload starts the active slot directly (no title menu). */
export function skipTitleOnce(): void {
  try {
    window.sessionStorage.setItem('superglen.skiptitle', '1');
  } catch {
    // ignore
  }
}

type Screen = 'main' | 'new' | 'load' | 'settings';

const ICON_PLAY = ModeIcons.play;

export class TitleMenu {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private screen: Screen = 'main';
  private confirm: HTMLDivElement | null = null;
  private focus: HTMLElement | null = null;
  private done = false;
  private raf = 0;
  private holdTimer = 0;
  private readonly padPrev = new Array<boolean>(18).fill(false);
  private padDir = '';
  private padTimer = 0;
  private lastPadT = 0;

  constructor(
    host: HTMLElement,
    private readonly onChoose: (choice: TitleChoice) => void,
  ) {
    this.root = make('div', 'title-menu');
    const bg = make('div', 'start-bg');
    bg.append(make('div', 'start-rays'));
    for (const c of ['c1', 'c2', 'c3', 'c4']) bg.append(make('div', `start-cloud ${c}`));
    for (const c of ['s1', 's2', 's3', 's4', 's5', 's6']) bg.append(make('div', `start-spark ${c}`));
    bg.append(make('div', 'start-hill'), make('div', 'start-hill h2'));
    const stage = make('div', 'title-stage');
    const img = document.createElement('img');
    img.className = 'title-logo';
    img.alt = 'Superglen';
    img.draggable = false;
    img.src = `${import.meta.env.BASE_URL}img/logo.webp`;
    stage.append(img);
    this.body = make('div', 'title-body');
    this.root.append(bg, stage, this.body);
    host.appendChild(this.root);

    // Long press on the logo (3 s): the parents' page (as on the old start screen).
    img.addEventListener('pointerdown', () => {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = window.setTimeout(() => this.finish({ slot: getActiveSlot(), mode: 'parents' }), PARENTS_HOLD_MS);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) img.addEventListener(ev, () => window.clearTimeout(this.holdTimer));

    // Any real pointer use hides the keyboard/pad focus ring.
    this.root.addEventListener('pointerdown', () => this.setFocus(null), true);
    window.addEventListener('keydown', this.onKey, true);
    this.show('main');
    this.raf = requestAnimationFrame(this.padLoop);
  }

  get open(): boolean {
    return !this.done;
  }

  /** Remove the menu (the Game is up). */
  remove(): void {
    this.done = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.holdTimer);
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  /** Test hook. */
  debugHandle(): Record<string, unknown> {
    const self = this;
    return {
      get screen() {
        return self.screen;
      },
      get confirming() {
        return !!self.confirm;
      },
    };
  }

  private finish(c: TitleChoice): void {
    if (this.done) return;
    window.clearTimeout(this.holdTimer);
    this.done = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    this.onChoose(c);
  }

  // ---- screens --------------------------------------------------------------------------------------------------

  private button(cls: string, icon: string, label: string, act: string, fn: () => void): HTMLButtonElement {
    const b = make('button', cls);
    b.type = 'button';
    b.dataset.act = act;
    b.append(make('span', 'menu-ico', icon), make('span', 'menu-label', label));
    b.setAttribute('aria-label', label);
    bindPress(b, 'click', fn);
    return b;
  }

  private show(screen: Screen): void {
    this.screen = screen;
    this.confirm = null;
    this.focus = null;
    this.body.replaceChildren();
    this.body.dataset.screen = screen;
    if (screen === 'main') this.buildMain();
    else if (screen === 'settings') this.buildSettings();
    else this.buildSlots(screen);
    this.root.dataset.screen = screen;
  }

  private header(title: string): HTMLElement {
    const head = make('div', 'title-head');
    head.append(this.button('title-btn title-back', ModeIcons.back, 'Kembali', 'back', () => this.back()), make('h1', 'title-h', title));
    return head;
  }

  private buildMain(): void {
    const slots = readAllSlots();
    const any = slots.some((s) => !s.empty);
    const col = make('div', 'title-buttons');
    const bNew = this.button('title-btn big new', ICON_PLAY, 'Main Baru', 'new', () => this.show('new'));
    const bLoad = this.button('title-btn big load', MenuIcons.load, 'Lanjutkan / Muat', 'load', () => this.show('load'));
    const bSet = this.button('title-btn big prefs', QuizIcons.gear, 'Pengaturan', 'settings', () => this.show('settings'));
    if (!any) {
      bLoad.disabled = true;
      bLoad.classList.add('off');
    }
    col.append(bNew, bLoad, bSet);
    this.body.append(col);
    this.setFocus(any ? bLoad : bNew);
  }

  private buildSlots(kind: 'new' | 'load'): void {
    const head = this.header(kind === 'new' ? 'Pilih tempat main' : 'Pilih permainan');
    const row = make('div', 'slot-row');
    const active = getActiveSlot();
    const slots = readAllSlots();
    for (const s of slots) {
      const card = slotCard(s, {
        evt: 'click',
        active: s.slot === active && !s.empty,
        disableEmpty: kind === 'load',
        onSelect: () => (kind === 'new' ? this.pickNew(s) : this.pickLoad(s)),
        onDelete: kind === 'load' ? () => this.ask(`Hapus slot ${s.slot}?`, () => {
          deleteSlot(s.slot);
          this.show(readAllSlots().some((x) => !x.empty) ? 'load' : 'main');
        }) : undefined,
      });
      row.append(card);
    }
    this.body.append(head, row);
    const first = slots.find((s) => (kind === 'load' ? !s.empty && s.slot === active : s.slot === active)) ?? slots.find((s) => (kind === 'load' ? !s.empty : true));
    const el = first ? this.body.querySelector<HTMLElement>(`.slot-main[data-slot="${first.slot}"]`) : null;
    this.setFocus(el);
  }

  private pickNew(s: SlotSummary): void {
    if (s.empty) {
      startNewSlot(s.slot);
      this.finish({ slot: s.slot, mode: 'new' });
      return;
    }
    this.ask(`Timpa slot ${s.slot}? Permainan lama akan hilang.`, () => {
      startNewSlot(s.slot);
      this.finish({ slot: s.slot, mode: 'new' });
    });
  }

  private pickLoad(s: SlotSummary): void {
    if (s.empty) return;
    setActiveSlot(s.slot);
    this.finish({ slot: s.slot, mode: 'continue' });
  }

  private buildSettings(): void {
    const head = this.header('Pengaturan');
    const prefs = readPrefs();
    let music = prefs.musicVol ?? 1;
    let sfx = prefs.sfxVol ?? 1;
    const rows = make('div', 'title-rows');
    const row = (id: string, icon: string, label: string, get: () => number, set: (v: number) => void): HTMLElement => {
      const r = make('div', 'title-vol');
      r.dataset.vol = id;
      const bar = make('div', 'title-vol-bar');
      const fill = make('div', 'title-vol-fill');
      bar.append(fill);
      const val = make('span', 'title-vol-val');
      const paint = (): void => {
        fill.style.width = `${Math.round(get() * 100)}%`;
        val.textContent = `${Math.round(get() * 100)}%`;
      };
      const step = (d: number): void => {
        set(Math.max(0, Math.min(1, Math.round((get() + d) * 10) / 10)));
        writePrefs(music, sfx);
        paint();
      };
      const lab = make('div', 'title-vol-label');
      lab.append(make('span', 'menu-ico', icon), make('span', '', label));
      r.append(lab, this.button('title-btn step', ModeIcons.minus, `${label} kurang`, `${id}-down`, () => step(-0.1)), bar, this.button('title-btn step', ModeIcons.plus, `${label} tambah`, `${id}-up`, () => step(0.1)), val);
      paint();
      return r;
    };
    rows.append(
      row('music', MenuIcons.music, 'Musik', () => music, (v) => (music = v)),
      row('sfx', MenuIcons.speaker, 'Suara efek', () => sfx, (v) => (sfx = v)),
    );
    // "Mode TV: Otomatis / Nyala / Mati": the first thing a TV owner needs when the box is not detected.
    const tvRow = make('div', 'title-vol title-tv');
    tvRow.append(make('div', 'title-vol-label', 'Mode TV'));
    const tvBtns: { pref: TvPref; el: HTMLButtonElement }[] = [];
    const paintTv = (): void => {
      for (const t of tvBtns) t.el.classList.toggle('on', t.pref === tvMode.pref);
    };
    const tvModes: [TvPref, string][] = [['auto', 'Otomatis'], ['on', 'Nyala'], ['off', 'Mati']];
    for (const [pref, label] of tvModes) {
      const b = this.button('title-btn tv-pref', '', label, `tv-${pref}`, () => {
        tvMode.setPref(pref);
        paintTv();
      });
      tvBtns.push({ pref, el: b });
      tvRow.append(b);
    }
    paintTv();
    rows.append(tvRow);
    this.body.append(head, rows);
    this.setFocus(this.body.querySelector<HTMLElement>('[data-act="music-up"]'));
  }

  /** Big "Ya" / "Tidak" question; "Tidak" has the focus. */
  private ask(question: string, yes: () => void): void {
    const box = make('div', 'title-confirm');
    const inner = make('div', 'title-confirm-box');
    const q = make('div', 'title-confirm-q', question);
    const row = make('div', 'title-confirm-row');
    const bYes = this.button('title-btn big yes', MenuIcons.yes, 'Ya', 'yes', () => {
      this.confirm = null;
      box.remove();
      yes();
    });
    const bNo = this.button('title-btn big no', MenuIcons.no, 'Tidak', 'no', () => this.closeConfirm());
    row.append(bYes, bNo);
    inner.append(q, row);
    box.append(inner);
    this.root.append(box);
    this.confirm = box;
    this.setFocus(bNo);
  }

  private closeConfirm(): void {
    this.confirm?.remove();
    this.confirm = null;
    // Back to the screen's first control.
    const first = this.body.querySelector<HTMLElement>('.slot-main:not([disabled]), .title-btn:not([disabled])');
    this.setFocus(first);
  }

  private back(): void {
    if (this.confirm) this.closeConfirm();
    else if (this.screen !== 'main') this.show('main');
  }

  // ---- keyboard and gamepad ---------------------------------------------------------------------------------------

  private scope(): HTMLElement {
    return this.confirm ?? this.body;
  }

  private candidates(): HTMLElement[] {
    return [...this.scope().querySelectorAll<HTMLElement>('button')].filter((b) => !(b as HTMLButtonElement).disabled && b.getClientRects().length > 0);
  }

  private setFocus(e: HTMLElement | null): void {
    this.focus?.classList.remove('pad-focus');
    this.focus = e;
    if (e) {
      e.classList.add('pad-focus');
      try {
        e.focus({ preventScroll: true });
      } catch {
        // ignore
      }
    }
  }

  /** dir: 0 up, 1 down, 2 left, 3 right. */
  private move(dir: number): void {
    const list = this.candidates();
    if (list.length === 0) return;
    const cur = this.focus && list.includes(this.focus) ? this.focus : null;
    if (!cur) {
      this.setFocus(list[0]);
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect();
      const dx = (b.left + b.right) / 2 - cx;
      const dy = (b.top + b.bottom) / 2 - cy;
      const along = dir === 0 ? -dy : dir === 1 ? dy : dir === 2 ? -dx : dx;
      const across = dir < 2 ? dx : dy;
      if (along < 4) continue;
      const score = along + 2.5 * Math.abs(across);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) this.setFocus(best);
  }

  private activate(): void {
    const e = this.focus && this.focus.isConnected ? this.focus : null;
    if (e) e.click();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.done) return;
    const k = e.key;
    const dir = k === 'ArrowUp' || k === 'w' || k === 'W' ? 0 : k === 'ArrowDown' || k === 's' || k === 'S' ? 1 : k === 'ArrowLeft' || k === 'a' || k === 'A' ? 2 : k === 'ArrowRight' || k === 'd' || k === 'D' ? 3 : -1;
    if (dir >= 0) {
      e.preventDefault();
      this.move(dir);
    } else if (k === 'Escape' || k === 'Backspace') {
      e.preventDefault();
      this.back();
    } else if ((k === 'Enter' || k === ' ') && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (!this.focus) this.move(1);
      else this.activate();
    }
  };

  private readonly padLoop = (now: number): void => {
    if (this.done) return;
    this.raf = requestAnimationFrame(this.padLoop);
    const dt = this.lastPadT ? Math.min(0.1, (now - this.lastPadT) / 1000) : 0;
    this.lastPadT = now;
    let pad: Gamepad | null = null;
    try {
      const list = navigator.getGamepads?.() ?? [];
      for (const g of list) if (g && g.connected) { pad = g; break; }
    } catch {
      return;
    }
    if (!pad) return;
    const down = (i: number): boolean => !!pad.buttons[i]?.pressed;
    const edge = (i: number): boolean => {
      const d = down(i);
      const f = d && !this.padPrev[i];
      this.padPrev[i] = d;
      return f;
    };
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    let dir = '';
    if (down(12) || ay < -0.6) dir = '0';
    else if (down(13) || ay > 0.6) dir = '1';
    else if (down(14) || ax < -0.6) dir = '2';
    else if (down(15) || ax > 0.6) dir = '3';
    if (dir !== this.padDir) {
      this.padDir = dir;
      this.padTimer = 0.4;
      if (dir) this.move(Number(dir));
    } else if (dir) {
      this.padTimer -= dt;
      if (this.padTimer <= 0) {
        this.padTimer = 0.16;
        this.move(Number(dir));
      }
    }
    const cross = edge(0);
    const circle = edge(1);
    if (cross) {
      if (!this.focus) this.move(1);
      else this.activate();
    } else if (circle) this.back();
  };
}

