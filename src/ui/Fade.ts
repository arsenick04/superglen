/**
 * Full-screen fade used around level loads (~250 ms each way). Instant under prefers-reduced-motion.
 * UI only (CSS transition + timer), not gameplay: gameplay code must use gameplay/Sequence.
 */
export const FADE_MS = 250;

export class Fade {
  private readonly element: HTMLDivElement;
  private readonly reduced: boolean;
  private timer = 0;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'fade';
    root.appendChild(this.element);
    this.reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** 1 = fully covered. */
  get covered(): boolean {
    return this.element.classList.contains('on');
  }

  /** Fade to the cover colour. */
  out(): Promise<void> {
    return this.go(true);
  }

  /** Fade back to the game. */
  in(): Promise<void> {
    return this.go(false);
  }

  private go(on: boolean): Promise<void> {
    window.clearTimeout(this.timer);
    this.element.classList.toggle('instant', this.reduced);
    this.element.classList.toggle('on', on);
    if (this.reduced) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.timer = window.setTimeout(resolve, FADE_MS + 20);
    });
  }
}
