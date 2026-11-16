import '../zoom.css';
import type { Input } from '../input/Input';

const PLUS =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="8" fill="none" stroke="#fff" stroke-width="3"/><path d="M20 20l7 7" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M14 10v8M10 14h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';
const MINUS =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="8" fill="none" stroke="#fff" stroke-width="3"/><path d="M20 20l7 7" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M10 14h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';

/** Touch only: two small magnifier buttons (closer / farther) stacked beside the star button. CSS shows them on touch UI after the start tap. */
export class ZoomButtons {
  private readonly root: HTMLDivElement;

  constructor(ui: HTMLElement, input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'zoom-col';
    const mk = (cls: string, svg: string, label: string, step: number): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `zoom-btn ${cls}`;
      b.innerHTML = svg;
      b.setAttribute('aria-label', label);
      const hold = (e: Event): void => {
        e.preventDefault();
        e.stopPropagation();
      };
      b.addEventListener('pointerdown', (e) => {
        hold(e);
        input.pushZoom(step);
      });
      for (const ev of ['pointerup', 'touchstart', 'mousedown']) b.addEventListener(ev, hold);
      this.root.appendChild(b);
    };
    mk('zoom-in', PLUS, 'Lebih dekat', -0.2);
    mk('zoom-out', MINUS, 'Lebih jauh', 0.2);
    ui.appendChild(this.root);
  }
}
