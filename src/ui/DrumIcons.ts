const DRUM =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="db" d="M6 17 V33 A18 8 0 0 0 42 33 V17 Z"/><path class="dl" d="M15 22 L21 40 M27 41 L33 22" fill="none" stroke-width="2.5" stroke-linecap="round"/><ellipse class="dt" cx="24" cy="17" rx="18" ry="8"/><ellipse class="dr" cx="24" cy="17" rx="18" ry="8" fill="none" stroke-width="3"/></svg>';

/**
 * Five small drum icons in the top-left corner (under the fps pill): the lit ones show the rhythm level
 * (level 0 = one drum, level 4 = all five). Icons only, no text. Hidden in Glen mode.
 * The DOM is written only when the lit count (or visibility) changes; `writes` counts those writes for the tests.
 */
export class DrumIcons {
  readonly element: HTMLDivElement;
  private readonly icons: HTMLDivElement[] = [];
  /** Lit count shown (-1 = hidden). */
  private shown = -2;
  /** Number of DOM updates so far. */
  writes = 0;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'drums';
    this.element.hidden = true;
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'drum';
      d.innerHTML = DRUM;
      this.element.appendChild(d);
      this.icons.push(d);
    }
    root.appendChild(this.element);
  }

  /** Number of lit drums right now (0 when hidden). */
  get lit(): number {
    return Math.max(0, this.shown);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  /** Cheap to call every frame: nothing is touched unless the state changed. */
  update(visible: boolean, level: number): void {
    const want = visible ? Math.max(0, Math.min(4, level)) + 1 : -1;
    if (want === this.shown) return;
    const prev = this.shown;
    this.shown = want;
    this.writes++;
    if (visible !== prev >= 0) this.element.hidden = !visible;
    for (let i = 0; i < this.icons.length; i++) {
      const on = i < want;
      const el = this.icons[i];
      if (el.classList.contains('on') !== on) el.classList.toggle('on', on);
      el.classList.remove('pop');
    }
    if (want > prev && want >= 1 && prev >= 0) {
      const el = this.icons[want - 1];
      void el.offsetWidth; // restart the pop animation
      el.classList.add('pop');
    }
  }

  dispose(): void {
    this.element.remove();
  }
}
