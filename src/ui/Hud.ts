/**
 * DOM HUD overlay: FPS meter, PC start/help card, touch note.
 * Mounted in the #ui root. All text is Indonesian. The DOM is only touched when something changes
 * (fps text at most ~2x per second).
 */
export class Hud {
  private readonly fpsEl: HTMLDivElement | null;
  private readonly card: HTMLDivElement | null;
  private readonly isTouch: boolean;
  private readonly canLock: boolean;
  private lastFpsShown = -1;
  private dismissed = false;

  constructor(
    root: HTMLElement,
    private readonly canvas: HTMLElement,
  ) {
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    this.canLock = typeof canvas.requestPointerLock === 'function' && 'pointerLockElement' in document;

    const showFps = new URLSearchParams(window.location.search).get('fps') !== '0';
    if (showFps) {
      this.fpsEl = el('div', 'hud-fps', 'FPS --');
      root.appendChild(this.fpsEl);
    } else {
      this.fpsEl = null;
    }

    if (this.isTouch) {
      this.card = null;
      root.appendChild(el('div', 'hud-note', 'Kontrol sentuh segera hadir'));
    } else {
      const card = el('div', 'hud-card');
      card.appendChild(el('div', 'hud-title', 'Superglen'));
      card.appendChild(el('div', 'hud-start', 'Klik untuk mulai'));
      const list = el('ul', 'hud-controls');
      for (const t of ['W A S D atau panah: jalan', 'Mouse: putar kamera', 'Esc: lepas kursor']) {
        list.appendChild(el('li', '', t));
      }
      card.appendChild(list);
      root.appendChild(card);
      this.card = card;

      if (this.canLock) {
        document.addEventListener('pointerlockchange', this.syncCard);
      } else {
        // No pointer lock (e.g. some browsers): hide after the first click or key press.
        const dismiss = (): void => {
          this.dismissed = true;
          this.syncCard();
        };
        window.addEventListener('mousedown', dismiss, { once: true });
        window.addEventListener('keydown', dismiss, { once: true });
      }
      this.syncCard();
    }
  }

  /** Call whenever the game's fps value is refreshed; the DOM is only written when it changed. */
  setFps(fps: number): void {
    if (!this.fpsEl || fps === this.lastFpsShown) return;
    this.lastFpsShown = fps;
    this.fpsEl.textContent = `FPS ${fps}`;
  }

  private readonly syncCard = (): void => {
    if (!this.card) return;
    const locked = this.canLock && document.pointerLockElement === this.canvas;
    this.card.style.display = locked || this.dismissed ? 'none' : '';
  };
}

function el(tag: string, className: string, text?: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement;
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
