import type { LevelContext } from '../Level';

export type RowKind = 'star' | 'ring' | 'target' | 'shield';

const STAR = 'M32 5 L40 23 L60 24.5 L45 38 L49.5 58 L32 47.5 L14.5 58 L19 38 L4 24.5 L24 23 Z';
const SHIELD = 'M32 5 L55 13 V32 C55 46 45 55 32 60 C19 55 9 46 9 32 V13 Z';

function icon(kind: RowKind): string {
  const base = (shape: string, color: string): string =>
    `<svg viewBox="0 0 64 64" aria-hidden="true"><g class="e">${shape.replace(/@c/g, 'rgba(255,255,255,0.5)').replace(/@s/g, 'rgba(20,40,80,0.45)')}</g><g class="f">${shape.replace(/@c/g, color).replace(/@s/g, '#fff')}</g></svg>`;
  switch (kind) {
    case 'ring':
      return base('<circle cx="32" cy="32" r="22" fill="none" stroke="@c" stroke-width="11"/><circle cx="32" cy="32" r="27.5" fill="none" stroke="@s" stroke-width="2"/>', '#ffd23f');
    case 'target':
      return base('<circle cx="32" cy="32" r="28" fill="@c" stroke="@s" stroke-width="3"/><circle cx="32" cy="32" r="18" fill="#fff" fill-opacity="0.9"/><circle cx="32" cy="32" r="8" fill="@c"/>', '#e8453c');
    case 'shield':
      return base(`<path d="${SHIELD}" fill="@c" stroke="@s" stroke-width="4" stroke-linejoin="round"/>`, '#1fb5a8');
    default:
      return base(`<path d="${STAR}" fill="@c" stroke="@s" stroke-width="4" stroke-linejoin="round"/>`, '#ffd23f');
  }
}

/**
 * Five big icons at the top-centre that fill in one by one (no text): the progress of the running exercise.
 * Touch: the dialog bubble lives at the top, so the row steps below it while a line is showing.
 * DOM is only written when something changes.
 */
export class ProgressRow {
  readonly element: HTMLDivElement;
  private readonly pips: HTMLDivElement[] = [];
  private kind: RowKind | '' = '';
  private _count = 0;
  private lowered = false;

  constructor(ctx: LevelContext, readonly size = 5) {
    this.element = document.createElement('div');
    this.element.className = 'b2-row';
    this.element.hidden = true;
    for (let i = 0; i < size; i++) {
      const p = document.createElement('div');
      p.className = 'b2-pip';
      this.element.appendChild(p);
      this.pips.push(p);
    }
    ctx.ui.appendChild(this.element);
    ctx.onDispose(() => this.element.remove());
  }

  get count(): number {
    return this._count;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  get shownKind(): string {
    return this.kind;
  }

  show(kind: RowKind): void {
    if (this.kind !== kind) {
      this.kind = kind;
      const html = icon(kind);
      for (const p of this.pips) p.innerHTML = html;
    }
    this._count = 0;
    for (const p of this.pips) p.classList.remove('on', 'pop');
    this.element.hidden = false;
  }

  /** Fill the first `n` icons (only ever forward: counts only go up). */
  set(n: number): void {
    n = Math.max(this._count, Math.min(this.size, n));
    for (let i = this._count; i < n; i++) {
      const p = this.pips[i];
      p.classList.add('on', 'pop');
    }
    this._count = n;
  }

  hide(): void {
    this.element.hidden = true;
  }

  /** Called every frame with "a dialog line is up": writes only on change. */
  setLowered(on: boolean): void {
    if (on === this.lowered) return;
    this.lowered = on;
    this.element.classList.toggle('lowered', on);
  }
}
