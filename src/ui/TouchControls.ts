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
  /** If set, the button hangs from the top edge instead of standing on the bottom edge. */
  top?: number;
}

const JUMP_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8 L54 32 H41 V56 H23 V32 H10 Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>';

const INTERACT_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 10 H52 A8 8 0 0 1 60 18 V38 A8 8 0 0 1 52 46 H34 L20 58 V46 H12 A8 8 0 0 1 4 38 V18 A8 8 0 0 1 12 10 Z" fill="#fff"/><circle cx="20" cy="28" r="4.5" fill="#e8453c"/><circle cx="32" cy="28" r="4.5" fill="#e8453c"/><circle cx="44" cy="28" r="4.5" fill="#e8453c"/></svg>';

// Lompat Barongsai: two stacked chevrons (jump + air jump).
const BARONGSAI_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 32 L32 10 L54 32" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 54 L32 32 L54 54" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/></svg>';

// Laser: lightning bolt.
const LASER_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M38 4 L14 36 H28 L24 60 L50 26 H35 Z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';

// Perisai: shield.
const SHIELD_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 L54 14 V32 C54 45 45 54 32 59 C19 54 10 45 10 32 V14 Z" fill="#fff"/><path d="M32 16 L45 21 V32 C45 40 40 46 32 50 Z" fill="#1fb5a8" opacity="0.55"/></svg>';

// Berubah: star.
const STAR_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 L39.5 23 L59 24.5 L44 37 L48.8 56 L32 45.5 L15.2 56 L20 37 L5 24.5 L24.5 23 Z" fill="#ffe066" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';

/** Transform star, top right below the safe-area inset; present in both layouts (test area only). */
const TRANSFORM_BUTTON: TouchButtonDef = {
  action: 'transform',
  icon: STAR_ICON,
  color: '#6c5ce7',
  size: 84,
  right: 20,
  bottom: 0,
  top: 12,
};

/** Glen mode: Lompat (big, bottom-right) and Bicara/Ambil (raised, to its left). Jump must stay first. */
export const GLEN_BUTTONS: readonly TouchButtonDef[] = [
  { action: 'jump', icon: JUMP_ICON, color: '#ff9f1c', size: 104, right: 26, bottom: 24 },
  { action: 'interact', icon: INTERACT_ICON, color: '#e8453c', size: 88, right: 148, bottom: 66 },
  TRANSFORM_BUTTON,
];

/**
 * Superglen mode: Lompat Barongsai (largest, gold, in the corner), Laser to its left and Perisai above it,
 * forming an arc around the thumb. Gaps of >= 22 px between buttons.
 */
export const SUPERGLEN_BUTTONS: readonly TouchButtonDef[] = [
  { action: 'jump', icon: BARONGSAI_ICON, color: '#f2b705', size: 104, right: 24, bottom: 24 },
  { action: 'laser', icon: LASER_ICON, color: '#e8453c', size: 88, right: 150, bottom: 30 },
  { action: 'shield', icon: SHIELD_ICON, color: '#1fa8b8', size: 88, right: 32, bottom: 150 },
  TRANSFORM_BUTTON,
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
      b.dataset.action = d.action;
      b.style.width = b.style.height = `${d.size}px`;
      b.style.right = `calc(env(safe-area-inset-right) + ${d.right}px)`;
      if (d.top !== undefined) b.style.top = `calc(env(safe-area-inset-top) + ${d.top}px)`;
      else b.style.bottom = `calc(env(safe-area-inset-bottom) + ${d.bottom}px)`;
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
