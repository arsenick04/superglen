const ARROW =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 L56 40 H41 V58 H23 V40 H8 Z" fill="#ffd23f" stroke="#fff" stroke-width="5" stroke-linejoin="round"/></svg>';

/** Gold arrow glued to the screen edge, pointing toward an off-screen objective. Icon only. */
export class EdgeArrow {
  readonly element: HTMLDivElement;
  private shown = false;
  private lastX = NaN;
  private lastY = NaN;
  private lastA = NaN;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'edge-arrow';
    this.element.hidden = true;
    const inner = document.createElement('div');
    inner.className = 'edge-arrow-icon';
    inner.innerHTML = ARROW;
    this.element.appendChild(inner);
    root.appendChild(this.element);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** `angle` in radians, clockwise from "up". */
  showAt(x: number, y: number, angle: number): void {
    if (!this.shown) {
      this.shown = true;
      this.element.hidden = false;
    }
    const rx = Math.round(x);
    const ry = Math.round(y);
    const ra = Math.round(angle * 50);
    if (rx === this.lastX && ry === this.lastY && ra === this.lastA) return;
    this.lastX = rx;
    this.lastY = ry;
    this.lastA = ra;
    this.element.style.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0) rotate(${angle.toFixed(2)}rad)`;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.element.hidden = true;
  }
}
