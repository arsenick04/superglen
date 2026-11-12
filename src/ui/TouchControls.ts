import type { Action } from '../input/Input';
import type { PlayerMode } from '../player/PlayerConfig';

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
  /** Optional: computes size/position from the visible viewport (overrides the static fields above). */
  place?: (m: ViewMetrics) => Placement;
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

/** Visible page size and safe-area insets (CSS px). */
export interface ViewMetrics {
  w: number;
  h: number;
  insetTop: number;
  insetRight: number;
  insetBottom: number;
  insetLeft: number;
}

export interface Placement {
  size: number;
  right: number;
  bottom: number;
  top?: number;
}

/** Below this visible height the compact "short" arrangement is used (Safari with its bars shown). */
export const SHORT_HEIGHT = 360;
export const MIN_BUTTON = 80;
/** Touch buttons must stay out of the joystick zone (fraction of width, see TouchConfig.joystickZone). */
const JOYSTICK_ZONE = 0.45;

const isShort = (m: ViewMetrics): boolean => m.h < SHORT_HEIGHT;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Jump is the biggest button. Short: scales with the height, 88..100. Tall: 104. */
function jumpSize(m: ViewMetrics): number {
  return isShort(m) ? Math.round(clamp(m.h * 0.34, 88, 100)) : 104;
}

/** Horizontal gap between the buttons of the short bottom row; shrinks (down to 10) when width is tight. */
function shortGap(m: ViewMetrics, buttons: number): number {
  const free = m.w * (1 - JOYSTICK_ZONE) - m.insetRight - 4;
  const used = SHORT_MARGIN + jumpSize(m) + (buttons - 1) * MIN_BUTTON;
  return clamp((free - used) / buttons, 10, 24);
}
const SHORT_MARGIN = 16;
const SHORT_BOTTOM = 12;
const SHORT_RAISE = 28;

/** Transform star: top-right corner on its own (top margin differs per arrangement). */
function transformPlacement(m: ViewMetrics): Placement {
  return isShort(m)
    ? { size: MIN_BUTTON, right: 20, bottom: 0, top: 8 }
    : { size: 84, right: 20, bottom: 0, top: 12 };
}

function jumpPlacement(m: ViewMetrics): Placement {
  return isShort(m)
    ? { size: jumpSize(m), right: SHORT_MARGIN, bottom: SHORT_BOTTOM }
    : { size: 104, right: 24, bottom: 24 };
}

function interactPlacement(m: ViewMetrics): Placement {
  if (!isShort(m)) return { size: 88, right: 148, bottom: 66 };
  const g = shortGap(m, 2);
  return { size: MIN_BUTTON, right: SHORT_MARGIN + jumpSize(m) + g, bottom: SHORT_BOTTOM + 16 };
}

function laserPlacement(m: ViewMetrics): Placement {
  if (!isShort(m)) return { size: 88, right: 150, bottom: 30 };
  const g = shortGap(m, 3);
  return { size: MIN_BUTTON, right: SHORT_MARGIN + jumpSize(m) + g, bottom: SHORT_BOTTOM };
}

/** Tall: above jump. Short: raised and further left, so the three form a gentle arc along the bottom-right. */
function shieldPlacement(m: ViewMetrics): Placement {
  if (!isShort(m)) return { size: 88, right: 32, bottom: 150 };
  const g = shortGap(m, 3);
  return {
    size: MIN_BUTTON,
    right: SHORT_MARGIN + jumpSize(m) + g + MIN_BUTTON + g,
    bottom: SHORT_BOTTOM + SHORT_RAISE,
  };
}

/** Glen mode: Lompat (big, bottom-right) and Bicara/Ambil (to its left). Jump must stay first. */
export const GLEN_BUTTONS: readonly TouchButtonDef[] = [
  { action: 'jump', icon: JUMP_ICON, color: '#ff9f1c', size: 104, right: 24, bottom: 24, place: jumpPlacement },
  { action: 'interact', icon: INTERACT_ICON, color: '#e8453c', size: 88, right: 148, bottom: 66, place: interactPlacement },
  { action: 'transform', icon: STAR_ICON, color: '#6c5ce7', size: 84, right: 20, bottom: 0, top: 12, place: transformPlacement },
];

/**
 * Superglen mode: Lompat Barongsai (largest, gold, in the corner), Laser to its left and Perisai above it
 * (tall) or raised further left (short), forming an arc around the thumb.
 */
export const SUPERGLEN_BUTTONS: readonly TouchButtonDef[] = [
  { action: 'jump', icon: BARONGSAI_ICON, color: '#f2b705', size: 104, right: 24, bottom: 24, place: jumpPlacement },
  { action: 'laser', icon: LASER_ICON, color: '#e8453c', size: 88, right: 150, bottom: 30, place: laserPlacement },
  { action: 'shield', icon: SHIELD_ICON, color: '#1fa8b8', size: 88, right: 32, bottom: 150, place: shieldPlacement },
  { action: 'transform', icon: STAR_ICON, color: '#6c5ce7', size: 84, right: 20, bottom: 0, top: 12, place: transformPlacement },
];

// ---- Story layouts (every level except the test area) ----------------------------------------------
// Superglen story set: Lompat Barongsai in the corner, Bicara/Ambil always next to it (same spot as in Glen
// mode), Perisai above/left and Laser above Bicara. Skills that are not unlocked yet are simply left out, so
// the remaining buttons never move. Short layout uses ONE gap for all three, so the columns cannot collide.

function storyInteractPlacement(m: ViewMetrics): Placement {
  if (!isShort(m)) return interactPlacement(m);
  return { size: MIN_BUTTON, right: SHORT_MARGIN + jumpSize(m) + shortGap(m, 3), bottom: SHORT_BOTTOM + 16 };
}

/** Laser in the story set: tall = above Bicara; short = stacked on top of Bicara. */
function storyLaserPlacement(m: ViewMetrics): Placement {
  if (!isShort(m)) return { size: 88, right: 150, bottom: 166 };
  const i = storyInteractPlacement(m);
  return { size: MIN_BUTTON, right: i.right, bottom: i.bottom + MIN_BUTTON + 10 };
}

const STORY_INTERACT: TouchButtonDef = { action: 'interact', icon: INTERACT_ICON, color: '#e8453c', size: 88, right: 148, bottom: 66, place: storyInteractPlacement };
const STORY_LASER: TouchButtonDef = { action: 'laser', icon: LASER_ICON, color: '#e8453c', size: 88, right: 150, bottom: 166, place: storyLaserPlacement };
const STORY_SHIELD: TouchButtonDef = { action: 'shield', icon: SHIELD_ICON, color: '#1fa8b8', size: 88, right: 32, bottom: 150, place: shieldPlacement };
const GLEN_JUMP = GLEN_BUTTONS[0];
const SUPERGLEN_JUMP = SUPERGLEN_BUTTONS[0];
const TRANSFORM = GLEN_BUTTONS[2];

/** What the current level allows on screen. */
export interface ControlProfile {
  /** The test area keeps its old full button sets (incl. the temporary Glen <-> Superglen star). */
  legacyTest: boolean;
  /** Show the "Berubah" star (only where the story allows the transformation). */
  transform: boolean;
  /** Unlocked skills (Superglen mode only). */
  laser: boolean;
  shield: boolean;
}

const layoutCache = new Map<string, readonly TouchButtonDef[]>();

/** Button set for a mode and profile. Results are cached: the same arguments return the same array. */
export function getLayout(mode: PlayerMode, p: ControlProfile): readonly TouchButtonDef[] {
  if (p.legacyTest) return mode === 'superglen' ? SUPERGLEN_BUTTONS : GLEN_BUTTONS;
  const key = `${mode}|${p.transform ? 1 : 0}${mode === 'superglen' ? `${p.laser ? 1 : 0}${p.shield ? 1 : 0}` : ''}`;
  let defs = layoutCache.get(key);
  if (!defs) {
    const list: TouchButtonDef[] = [];
    if (mode === 'superglen') {
      list.push(SUPERGLEN_JUMP, STORY_INTERACT);
      if (p.laser) list.push(STORY_LASER);
      if (p.shield) list.push(STORY_SHIELD);
    } else {
      list.push(GLEN_JUMP, GLEN_BUTTONS[1]);
    }
    if (p.transform) list.push(TRANSFORM);
    defs = list;
    layoutCache.set(key, defs);
  }
  return defs;
}

/** DOM for the touch controls. Pure view: TouchSource owns all the event logic. */
export class TouchControls {
  readonly layer: HTMLDivElement;
  readonly buttons = new Map<Action, HTMLDivElement>();
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private stickShown = false;
  private lastBx = NaN;
  private lastBy = NaN;
  private lastKx = NaN;
  private lastKy = NaN;

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

    this.probe = div('tc-inset-probe');
    document.body.appendChild(this.probe);

    this.setLayout(GLEN_BUTTONS);
    root.appendChild(this.layer);

    window.addEventListener('resize', this.relayout);
    window.addEventListener('orientationchange', this.relayout);
    window.visualViewport?.addEventListener('resize', this.relayout);
  }

  private defs: readonly TouchButtonDef[] = [];
  private readonly pulsing = new Set<Action>();
  private readonly probe: HTMLDivElement;
  private relayoutTimer = 0;
  private lastW = 0;
  private lastH = 0;
  /**
   * Resize, orientation and visualViewport events (Safari fires them while its bars move) are coalesced into one
   * layout ~100 ms later, and skipped when the visible size did not change.
   */
  private readonly relayout = (): void => {
    if (this.relayoutTimer) return;
    this.relayoutTimer = window.setTimeout(() => {
      this.relayoutTimer = 0;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === this.lastW && h === this.lastH) return;
      this.applyPlacement();
    }, 100);
  };

  private metrics(): ViewMetrics {
    const cs = getComputedStyle(this.probe);
    return {
      w: window.innerWidth,
      h: window.innerHeight,
      insetTop: parseFloat(cs.paddingTop) || 0,
      insetRight: parseFloat(cs.paddingRight) || 0,
      insetBottom: parseFloat(cs.paddingBottom) || 0,
      insetLeft: parseFloat(cs.paddingLeft) || 0,
    };
  }

  /** Position and size every button for the current visible viewport. */
  private applyPlacement(): void {
    this.lastW = window.innerWidth;
    this.lastH = window.innerHeight;
    const m = this.metrics();
    for (const d of this.defs) {
      const b = this.buttons.get(d.action);
      if (!b) continue;
      const p: Placement = d.place ? d.place(m) : d;
      b.style.width = b.style.height = `${Math.max(MIN_BUTTON, p.size)}px`;
      b.style.right = `calc(env(safe-area-inset-right) + ${p.right}px)`;
      if (p.top !== undefined) {
        b.style.top = `calc(env(safe-area-inset-top) + ${p.top}px)`;
        b.style.bottom = '';
      } else {
        b.style.bottom = `calc(env(safe-area-inset-bottom) + ${p.bottom}px)`;
        b.style.top = '';
      }
    }
  }

  /** Replace all buttons (Glen <-> Superglen). */
  setLayout(defs: readonly TouchButtonDef[]): void {
    for (const b of this.buttons.values()) b.remove();
    this.buttons.clear();
    this.defs = defs;
    for (const d of defs) {
      const b = div('tc-button');
      b.dataset.action = d.action;
      b.style.background = d.color;
      b.innerHTML = d.icon;
      this.layer.appendChild(b);
      this.buttons.set(d.action, b);
      if (this.pulsing.has(d.action)) b.classList.add('pulse');
    }
    this.applyPlacement();
  }

  /** Gently pulse a button ("press me now"), e.g. Bicara/Ambil while something is in reach. */
  setPulse(action: Action, on: boolean): void {
    if (on) this.pulsing.add(action);
    else this.pulsing.delete(action);
    this.buttons.get(action)?.classList.toggle('pulse', on);
  }

  setPressed(action: Action, pressed: boolean): void {
    this.buttons.get(action)?.classList.toggle('pressed', pressed);
  }

  /** Show the stick with its base centered at (cx, cy) and the knob offset (kx, ky) in px. */
  showStick(cx: number, cy: number, kx: number, ky: number): void {
    const r = this.radius;
    if (!this.stickShown) {
      this.stickShown = true;
      this.base.style.display = 'block';
      this.hint.style.visibility = 'hidden';
    }
    // Whole pixels are enough and keep the strings (and the style writes) to the moves that matter.
    const bx = Math.round(cx - r);
    const by = Math.round(cy - r);
    if (bx !== this.lastBx || by !== this.lastBy) {
      this.lastBx = bx;
      this.lastBy = by;
      this.base.style.transform = `translate3d(${bx}px, ${by}px, 0)`;
    }
    const nx = Math.round(kx * 2) / 2;
    const ny = Math.round(ky * 2) / 2;
    if (nx !== this.lastKx || ny !== this.lastKy) {
      this.lastKx = nx;
      this.lastKy = ny;
      this.knob.style.transform = `translate3d(calc(-50% + ${nx}px), calc(-50% + ${ny}px), 0)`;
    }
  }

  hideStick(): void {
    if (!this.stickShown) return;
    this.stickShown = false;
    this.lastBx = this.lastBy = this.lastKx = this.lastKy = NaN;
    this.base.style.display = 'none';
    this.hint.style.visibility = 'visible';
  }

  dispose(): void {
    window.removeEventListener('resize', this.relayout);
    window.removeEventListener('orientationchange', this.relayout);
    window.visualViewport?.removeEventListener('resize', this.relayout);
    if (this.relayoutTimer) window.clearTimeout(this.relayoutTimer);
    this.probe.remove();
    this.layer.remove();
  }
}

function div(className: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = className;
  return e;
}
