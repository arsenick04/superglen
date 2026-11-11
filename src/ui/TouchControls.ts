import type { Action } from '../input/Input';

/** One on-screen button. Layout is data so the Superglen layout (3 buttons in an arc) can swap in. */
export interface TouchButtonDef {
  action: Action;
  /** Inline SVG markup (no text: the player cannot read). */
  icon: string;
  color: string;
  /** CSS px, must stay >= 80. */
  size: number;
  /** Distance of the button's right/bottom edge from the screen corner (safe area is added). */
  right: number;
  bottom: number;
}

const JUMP_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8 L54 32 H41 V56 H23 V32 H10 Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>';

const INTERACT_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 10 H52 A8 8 0 0 1 60 18 V38 A8 8 0 0 1 52 46 H34 L20 58 V46 H12 A8 8 0 0 1 4 38 V18 A8 8 0 0 1 12 10 Z" fill="#fff"/><circle cx="20" cy="28" r="4.5" fill="#e8453c"/><circle cx="32" cy="28" r="4.5" fill="#e8453c"/><circle cx="44" cy="28" r="4.5" fill="#e8453c"/></svg>';

/** Glen mode: Lompat (big, bottom-right) and Bicara/Ambil (raised, to its left). */
export const GLEN_BUTTONS: readonly TouchButtonDef[] = [
  { action: 'jump', icon: JUMP_ICON, color: '#ff9f1c', size: 104, right: 26, bottom: 24 },
  { action: 'interact', icon: INTERACT_ICON, color: '#e8453c', size: 88, right: 148, bottom: 66 },
];

/** DOM for the touch controls. Pure view: TouchSource owns all the event logic. */
export class TouchControls {
  readonly layer: HTMLDivElement;
  readonly buttons = new Map<Action, HTMLDivElement>();
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly hint: HTMLDivElement;

  constructor(
    root: HTMLElement,
    private readonly radius: number,
  ) {
    this.layer = div('touch-layer');

    this.hint = div('tc-hint');
    this.hint.appendChild(div('tc-knob'));
    this.hint.style.width = this.hint.style.height = `${radius * 2}px`;
    this.layer.appendChild(this.hint);

    this.base = div('tc-base');
    this.base.style.width = this.base.style.height = `${radius * 2}px`;
    this.knob = div('tc-knob');
    this.base.appendChild(this.knob);
    this.layer.appendChild(this.base);

    this.setLayout(GLEN_BUTTONS);
    root.appendChild(this.layer);
  }

  /** Replace all buttons (Glen <-> Superglen). */
  setLayout(defs: readonly TouchButtonDef[]): void {
    for (const b of this.buttons.values()) b.remove();
    this.buttons.clear();
    for (const d of defs) {
      const b = div('tc-button');
      b.style.width = b.style.height = `${d.size}px`;
      b.style.right = `calc(env(safe-area-inset-right) + ${d.right}px)`;
      b.style.bottom = `calc(env(safe-area-inset-bottom) + ${d.bottom}px)`;
      b.style.background = d.color;
      b.innerHTML = d.icon;
      this.layer.appendChild(b);
      this.buttons.set(d.action, b);
    }
  }

  setPressed(action: Action, pressed: boolean): void {
    this.buttons.get(action)?.classList.toggle('pressed', pressed);
  }

  /** Show the stick with its base centered at (cx, cy) and the knob offset (kx, ky) in px. */
  showStick(cx: number, cy: number, kx: number, ky: number): void {
    const r = this.radius;
    this.base.style.display = 'block';
    this.base.style.transform = `translate(${cx - r}px, ${cy - r}px)`;
    this.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    this.hint.style.visibility = 'hidden';
  }

  hideStick(): void {
    this.base.style.display = 'none';
    this.hint.style.visibility = 'visible';
  }

  dispose(): void {
    this.layer.remove();
  }
}

function div(className: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = className;
  return e;
}
