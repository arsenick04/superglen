import type { SlotSummary } from '../core/Save';
import { MenuIcons } from './MenuIcons';

/** Shared by the title menu and the pause menu: one card per save slot, Indonesian text, big touch targets. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Small icons (no text needed): Glen = round face, Superglen = star on a cape. */
export const ModeIcons = {
  glen: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="#ffcf8a" stroke="#fff" stroke-width="4"/><path d="M10 28 Q32 -2 54 28 Q32 16 10 28 Z" fill="#6b3f1d"/><circle cx="23" cy="34" r="3.5" fill="#25324a"/><circle cx="41" cy="34" r="3.5" fill="#25324a"/><path d="M22 44 Q32 53 42 44" fill="none" stroke="#25324a" stroke-width="3.5" stroke-linecap="round"/></svg>',
  superglen: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="#e8453c" stroke="#fff" stroke-width="4"/><path d="M32 10 L38 25 L54 26 L42 36 L46 52 L32 43 L18 52 L22 36 L10 26 L26 25 Z" fill="#ffd23f"/></svg>',
  coin: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="#ffd23f" stroke="#e0a100" stroke-width="5"/><path d="M32 18 V46 M24 26 H38 M24 38 H40" fill="none" stroke="#e0a100" stroke-width="5" stroke-linecap="round"/></svg>',
  clock: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="#fff" stroke="#3b82f6" stroke-width="6"/><path d="M32 16 V33 L44 40" fill="none" stroke="#3b82f6" stroke-width="6" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 10 L54 32 L20 54 Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8 L39 25 L57 26 L43 38 L48 56 L32 46 L16 56 L21 38 L7 26 L25 25 Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 18 H52 M25 18 V10 H39 V18 M17 18 L20 54 H44 L47 18" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M40 12 L18 32 L40 52" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 12 V52 M12 32 H52" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/></svg>',
  minus: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 32 H52" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/></svg>',
};

export function chapterLabel(s: SlotSummary): string {
  return s.ended ? `Tamat · ${s.place}` : `Chapter ${s.chapter} · ${s.place}`;
}

/** "1j 12m" / "35m" / "<1m". */
export function formatPlay(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m < 1) return '<1m';
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}j ${m % 60}m` : `${m}m`;
}

/** "12 Nov 19:30", or '' when the date is unknown. */
export function formatDate(t: number): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** `evt` is 'click' on the title screen and 'pointerdown' in the pause menu (touch there does not synthesise clicks). */
export function bindPress(b: HTMLElement, evt: 'click' | 'pointerdown', fn: () => void): void {
  b.addEventListener(evt, (e) => {
    if (evt === 'pointerdown') {
      e.preventDefault();
      e.stopPropagation();
    }
    if ((b as HTMLButtonElement).disabled) return;
    fn();
  });
  if (evt === 'pointerdown') {
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      if (!(b as HTMLButtonElement).disabled) fn();
    });
  }
}

export interface CardOpts {
  evt: 'click' | 'pointerdown';
  /** The slot the game is playing on now (highlighted). */
  active?: boolean;
  /** Empty slots cannot be picked (Load). */
  disableEmpty?: boolean;
  onSelect: () => void;
  /** Adds a trash button under a filled card. */
  onDelete?: () => void;
}

/** One slot card: `.slot-card` > `.slot-main` button (+ `.slot-del` button). */
export function slotCard(s: SlotSummary, o: CardOpts): HTMLElement {
  const card = make('div', 'slot-card');
  card.dataset.slot = String(s.slot);
  if (o.active) card.classList.add('active');
  const main = make('button', 'slot-main');
  main.type = 'button';
  main.dataset.slot = String(s.slot);
  main.dataset.act = `slot${s.slot}`;
  const head = make('div', 'slot-head');
  head.append(make('span', 'slot-num', `Slot ${s.slot}`));
  if (s.empty) {
    main.classList.add('empty');
    main.append(head, make('div', 'slot-title', 'Kosong'), make('div', 'slot-empty-ico', MenuIcons.save));
  } else {
    head.append(make('span', `slot-mode ${s.mode}`, ModeIcons[s.mode]));
    const lines = make('div', 'slot-lines');
    const line = (ico: string, text: string, cls: string): void => {
      const l = make('div', `slot-line ${cls}`);
      l.append(make('span', 'slot-ico', ico), make('span', 'slot-text', text));
      lines.append(l);
    };
    line(ModeIcons[s.mode], s.mode === 'superglen' ? 'Superglen' : 'Glen', 'mode');
    line(ModeIcons.coin, String(s.coins), 'coins');
    line(ModeIcons.clock, formatPlay(s.playSec), 'time');
    main.append(head, make('div', 'slot-title', chapterLabel(s)), lines);
    const date = formatDate(s.savedAt);
    if (date) main.append(make('div', 'slot-date', date));
  }
  const label = s.empty ? `Slot ${s.slot}, kosong` : `Slot ${s.slot}, ${chapterLabel(s)}`;
  main.setAttribute('aria-label', label);
  if (s.empty && o.disableEmpty) {
    main.disabled = true;
    main.classList.add('off');
  }
  bindPress(main, o.evt, o.onSelect);
  card.append(main);
  if (!s.empty && o.onDelete) {
    const del = make('button', 'slot-del');
    del.type = 'button';
    del.dataset.act = `del${s.slot}`;
    del.setAttribute('aria-label', `Hapus slot ${s.slot}`);
    del.append(make('span', 'menu-ico', ModeIcons.trash));
    bindPress(del, o.evt, o.onDelete);
    card.append(del);
  }
  return card;
}
