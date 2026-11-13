import type { SaveStore } from '../core/Save';
import type { QuizEngine } from '../quiz/QuizEngine';
import { CATEGORY_NAMES } from './QuizIcons';

export interface ParentsDeps {
  save: SaveStore;
  quiz: QuizEngine;
  setEasyJump: (on: boolean) => void;
  setSound: (on: boolean) => void;
  /** Called after "reset progres" has cleared the save (the game reloads so every level starts clean). */
  afterReset: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The hidden page for parents: opened by a 3 s long-press on the logo of the start screen (touch) or the small gear on the PC
 * help card. Plain Indonesian text: per category level / answered / first-try rate with a "lancar / perlu latihan" label,
 * coins / stickers / fragments, the easy-jump and sound switches, the sticker album and a guarded progress reset.
 */
export class ParentsPage {
  readonly element: HTMLDivElement;
  private shown = false;
  private confirming = false;

  constructor(
    root: HTMLElement,
    private readonly deps: ParentsDeps,
  ) {
    this.element = el('div', 'parents');
    this.element.hidden = true;
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart']) this.element.addEventListener(ev, (e) => e.stopPropagation());
    this.element.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    root.appendChild(this.element);
  }

  get open(): boolean {
    return this.shown;
  }

  show(): void {
    this.shown = true;
    this.confirming = false;
    this.element.hidden = false;
    this.render();
  }

  close(): void {
    this.shown = false;
    this.element.hidden = true;
  }

  private button(label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = el('button', cls, label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    return b;
  }

  private render(): void {
    const { save, quiz } = this.deps;
    const q = save.data.quiz;
    const root = this.element;
    root.replaceChildren();

    const head = el('div', 'parents-head');
    head.append(el('h1', '', 'Untuk Orang Tua'), this.button('Tutup', 'plain parents-close', () => this.close()));

    // ---- Left: progress per category ----
    const left = el('div', 'parents-col');
    const table = el('table');
    table.innerHTML = '<thead><tr><th>Kategori</th><th>Level</th><th>Dijawab</th><th>Sekali benar</th><th>Status</th></tr></thead>';
    const tb = el('tbody');
    for (const s of quiz.categoryStats()) {
      const tr = el('tr');
      tr.dataset.category = s.category;
      const rate = s.asked > 0 ? `${Math.round(s.rate * 100)}%` : '-';
      const pill = el('span', `pill ${s.label === 'lancar' ? 'lancar' : s.label === 'perlu latihan' ? 'latih' : 'none'}`, s.label === 'baru mulai' ? 'baru mulai' : s.label);
      const status = el('td');
      status.appendChild(pill);
      tr.append(el('td', '', CATEGORY_NAMES[s.category]), el('td', 'lv', `${s.level} / 3`), el('td', 'asked', String(s.asked)), el('td', 'rate', rate), status);
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    const sum = el('div', 'parents-sum');
    sum.append(
      el('span', 'p-coins', `Koin: ${q.coins}`),
      el('span', 'p-stickers', `Stiker: ${q.stickers.length}`),
      el('span', 'p-fragments', `Kepingan memori: ${q.fragments}`),
      el('span', 'p-challenges', `Tantangan selesai: ${q.challenges}`),
    );
    left.append(table, sum, el('div', 'parents-note', 'Level naik pelan kalau anak sering benar di percobaan pertama, dan turun lagi kalau sering salah. Halaman ini dibuka dengan menekan lama logo (3 detik) di layar awal, atau roda gigi kecil di kartu bantuan PC.'));

    // ---- Right: settings, album, reset ----
    const right = el('div', 'parents-col');
    right.append(this.toggle('Lompat mudah (tahan tombol lompat)', 'easy', save.data.settings.easyJump, (on) => {
      this.deps.setEasyJump(on);
      this.render();
    }));
    right.append(this.toggle('Suara', 'sound', save.data.settings.sound, (on) => {
      this.deps.setSound(on);
      this.render();
    }));
    const actions = el('div', 'parents-actions');
    right.append(actions);
    actions.append(
      this.button('Album stiker', 'parents-album', () => {
        void quiz.showAlbum();
      }),
    );
    if (this.confirming) {
      const c = el('div', 'parents-confirm');
      c.append(
        el('span', '', 'Yakin hapus semua progres cerita dan Tantangan Pintar?'),
        this.button('Ya, hapus', 'warn parents-reset-yes', () => {
          save.resetProgress();
          this.close();
          this.deps.afterReset();
        }),
        this.button('Batal', 'plain parents-reset-no', () => {
          this.confirming = false;
          this.render();
        }),
      );
      right.appendChild(c);
    } else {
      actions.appendChild(
        this.button('Reset progres', 'warn parents-reset', () => {
          this.confirming = true;
          this.render();
        }),
      );
    }

    const body = el('div', 'parents-body');
    body.append(left, right);
    root.append(head, body);
  }

  private toggle(label: string, id: string, on: boolean, set: (on: boolean) => void): HTMLElement {
    const row = el('div', 'toggle');
    row.dataset.setting = id;
    const sw = this.button('', `switch${on ? ' on' : ''}`, () => set(!on));
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(on));
    sw.setAttribute('aria-label', label);
    row.append(el('span', '', label), sw);
    return row;
  }
}
