/**
 * Game controller layer (Gamepad API). One shared hub reads the first active pad once per frame (`poll`) and exposes a
 * LOGICAL, PlayStation-named button set plus processed sticks. Gameplay input (GamepadSource) and menu navigation
 * (PadUi) both read this hub, so the mapping tables live in exactly one place.
 *
 * - `mapping === 'standard'`: the usual W3C layout (Chrome, Edge, Safari, ...).
 * - DualSense / DualShock that report a non-standard mapping (Firefox, some console browsers): a fallback table.
 * - Anything else non-standard: best effort with the standard layout.
 * - No allocation while a pad is present beyond what `navigator.getGamepads()` itself returns. Without a pad the browser
 *   is not asked at all (only a slow scan, and only until `gamepadconnected` fires).
 * - Presses are COUNTERS, so every consumer keeps its own "seen" count and no one steals another's press.
 */
import { tvMode } from '../core/TvMode';
import { tvDebug } from '../core/TvDebug';

/** All tunables in one place. */
export const PadConfig = {
  /** Left stick: radial dead zone, then the rest is rescaled to 0..1 and shaped by `moveCurve` (1 = linear). */
  moveDeadZone: 0.18,
  moveCurve: 1.35,
  /** Right stick (camera): dead zone, response curve, turn speed at full tilt (rad/s). Gentle for a 5-year-old. */
  lookDeadZone: 0.2,
  lookCurve: 1.8,
  lookYawRate: 2.6,
  lookPitchRate: 1.5,
  /** false = same convention as the mouse (stick down looks down). */
  invertY: false,
  /** Analogue buttons (triggers) count as pressed above this. */
  triggerThreshold: 0.45,
  /** A stick tilt beyond this switches the "active device" to the pad. */
  activateAxis: 0.6,
  /** Menu navigation: stick threshold, delay before repeat and repeat interval (s). */
  navAxis: 0.6,
  navRepeatDelay: 0.4,
  navRepeat: 0.16,
  /** Seconds between scans for a pad when the browser never fired `gamepadconnected`. */
  idleScanSeconds: 0.25,
  /** Pointer input is ignored for gameplay this long (ms) after the last pad input. */
  mouseIgnoreMs: 3000,
  /** Rumble: land harder than this (m/s) to feel it. */
  rumbleLandImpact: 8,
} as const;

/** Logical buttons (DualSense names). */
export const PadBtn = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  create: 8,
  options: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  ps: 16,
  touchpad: 17,
} as const;
export const PAD_BUTTONS = 18;

/** Logical -> physical button index, W3C "standard" layout (identity). */
const STANDARD_BUTTONS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

/**
 * DualSense / DualShock 4 with a non-standard mapping (Firefox, SDL-style HID): square 0, cross 1, circle 2, triangle 3,
 * L1 4, R1 5, L2 6, R2 7, create 8, options 9, L3 10, R3 11, PS 12, touchpad 13. The D-pad is a hat on axis 9.
 */
const DUALSENSE_BUTTONS: readonly number[] = [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1, -1, -1, -1, 12, 13];
const DUALSENSE_AXES = { lx: 0, ly: 1, rx: 2, ry: 5, hat: 9 } as const;
const STANDARD_AXES = { lx: 0, ly: 1, rx: 2, ry: 3, hat: -1 } as const;

const DUALSENSE_ID = /dualsense|dualshock|054c|0ce6|0df2|05c4|09cc|wireless controller|ps5 controller|ps4 controller/i;
/** Generic non-standard pad: standard button order, but Cross is ANY face button (0..3) so some press always confirms / jumps. */
const GENERIC_AXES = { lx: 0, ly: 1, rx: 2, ry: 3, hat: -1 } as const;

type AxisMap = { readonly lx: number; readonly ly: number; readonly rx: number; readonly ry: number; readonly hat: number };

export interface PadVec {
  x: number;
  y: number;
}

class GamepadHub {
  readonly supported: boolean;
  /** A pad is currently read. */
  connected = false;
  id = '';
  mapping = '';
  /** Which table is used: 'standard' | 'dualsense' | 'standard-guess'. */
  table = '';
  /** Human readable remap profile in use (debug overlay). */
  profile = '';
  index = -1;
  /** Incremented by every poll that read a pad (consumers use it to apply per-poll values once). */
  seq = 0;
  /** Seconds between the last two polls (clamped), for rate-based look. */
  dt = 1 / 60;
  /** Logical button state (1 = held), press counters, "ignore until released" marks. */
  readonly down = new Uint8Array(PAD_BUTTONS);
  readonly count = new Uint32Array(PAD_BUTTONS);
  readonly swallowed = new Uint8Array(PAD_BUTTONS);
  /** Processed left stick + D-pad: movement, x right, y forward, length <= 1. */
  readonly move: PadVec = { x: 0, y: 0 };
  /** Processed right stick, -1..1, y positive = down (like mouse movementY). */
  readonly look: PadVec = { x: 0, y: 0 };
  /** Raw left stick as read (for menu navigation), y positive = down. */
  readonly leftRaw: PadVec = { x: 0, y: 0 };
  /** The last Gamepad snapshot (debug overlay, rumble). */
  pad: Gamepad | null = null;
  /** The player is currently using the pad (UI shows PlayStation glyphs, touch controls hide). */
  deviceActive = false;
  /** Rumble gate set by the game (sound effects on and volume above 0). */
  rumbleAllowed: () => boolean = () => true;

  /** performance.now() of the last real pad input (button press or a clear stick tilt). */
  lastPadAt = -1e9;
  private lastBtnAt = -1e9;
  private clashSent = false;
  private readonly clashListeners: (() => void)[] = [];
  private watch = false;
  private lastScan = -1e9;
  private lastNow = -1;
  private buttonMap: readonly number[] = STANDARD_BUTTONS;
  private axisMap: AxisMap = STANDARD_AXES;
  private readonly activeListeners: ((on: boolean) => void)[] = [];
  private readonly connectListeners: ((on: boolean) => void)[] = [];
  private readonly prevDown = new Uint8Array(PAD_BUTTONS);

  constructor() {
    this.supported = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
    if (!this.supported) return;
    window.addEventListener('gamepadconnected', this.onConnected);
    window.addEventListener('gamepaddisconnected', this.onDisconnected);
    // Switch back to keyboard / mouse / touch. Synthetic events (the menu navigation dispatches some) are ignored.
    // First in line: a TV browser turns the pad's B / Circle into a Back key. The game already reads the button itself.
    tvMode.echoGuard = (e) => this.connected && this.tvEcho(e);
    window.addEventListener('keydown', this.onKeyGuard, true);
    window.addEventListener('keyup', this.onKeyGuard, true);
    window.addEventListener('keydown', this.onOtherInput, true);
    window.addEventListener('mousedown', this.onOtherInput, true);
    window.addEventListener('touchstart', this.onOtherInput, { capture: true, passive: true });
    window.addEventListener('wheel', this.onOtherInput, { capture: true, passive: true });
    window.addEventListener('mousemove', this.onMouseMove, { capture: true, passive: true });
  }

  /** Calls `cb` when the active-device flag changes. */
  onActiveChange(cb: (on: boolean) => void): void {
    this.activeListeners.push(cb);
  }

  /** Calls `cb` once when real pointer input arrives while the pad is in use (TV browser cursor mode). */
  onCursorClash(cb: () => void): void {
    this.clashListeners.push(cb);
  }

  /**
   * Synthetic / cursor pointer input must not drive gameplay: always in TV mode, and for a few seconds after any pad input.
   * (A TV browser's "mouse mode" turns the pad and remote into a cursor.)
   */
  mouseSuppressed(): boolean {
    if (document.documentElement.classList.contains('tv-ui')) return true;
    return this.connected && performance.now() - this.lastPadAt < PadConfig.mouseIgnoreMs;
  }

  /** A trusted key event that is just the browser echoing a pad button press (read live: the poll may lag a frame). */
  private padKeyEcho(e: Event): boolean {
    if (!e.isTrusted || !this.connected) return false;
    const now = performance.now();
    try {
      const list = navigator.getGamepads();
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const g = list[i];
          if (!g || !g.connected) continue;
          for (let b = 0; b < g.buttons.length; b++) {
            if (g.buttons[b].pressed) {
              this.lastBtnAt = now;
              return true;
            }
          }
        }
      }
    } catch {
      // ignore
    }
    return now - this.lastBtnAt < 500;
  }

  /**
   * TV browsers may also translate the pad into keys (D-pad / stick -> arrows, A -> Enter, B -> Back). While the Gamepad API reports a
   * pad with a button down or a stick pushed (same moment, plus 500 ms for the key-up), a trusted key event is such an echo.
   */
  private tvEcho(e: KeyboardEvent): boolean {
    if (!e.isTrusted || !document.documentElement.classList.contains('tv-ui')) return false;
    if (this.padKeyEcho(e)) return true;
    const now = performance.now();
    try {
      const list = navigator.getGamepads();
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const g = list[i];
          if (!g || !g.connected) continue;
          for (let a = 0; a < g.axes.length; a++) {
            if (Math.abs(g.axes[a]) > 0.4) {
              this.lastBtnAt = now;
              return true;
            }
          }
        }
      }
    } catch {
      // ignore
    }
    return now - this.lastBtnAt < 500;
  }

  private clash(): void {
    if (this.clashSent || !this.connected || performance.now() - this.lastPadAt > PadConfig.mouseIgnoreMs) return;
    this.clashSent = true;
    for (const l of this.clashListeners) l();
  }

  /** Calls `cb` when a pad appears / disappears. */
  onConnectChange(cb: (on: boolean) => void): void {
    this.connectListeners.push(cb);
  }

  /** Ignore a held button until it is released (used after a menu consumed the press). */
  swallow(btn: number): void {
    if (this.down[btn]) this.swallowed[btn] = 1;
  }

  /** Read the pad. `nowMs` is the frame timestamp (rAF time, or a virtual clock in tests). Cheap when no pad exists. */
  poll(nowMs: number): void {
    if (!this.supported) return;
    if (!this.connected && !this.watch) {
      if (Math.abs(nowMs - this.lastScan) < PadConfig.idleScanSeconds * 1000) return;
      this.lastScan = nowMs;
    }
    let pad: Gamepad | null = null;
    try {
      const list = navigator.getGamepads();
      if (list) {
        if (this.index >= 0) {
          const cur = list[this.index];
          if (cur && cur.connected) pad = cur;
        }
        if (!pad) {
          for (let i = 0; i < list.length; i++) {
            const g = list[i];
            if (g && g.connected) {
              pad = g;
              break;
            }
          }
        }
      }
    } catch {
      pad = null;
    }
    if (!pad) {
      if (this.connected) this.lose();
      this.watch = false;
      this.lastNow = -1;
      return;
    }
    if (!this.connected || pad.index !== this.index) this.attach(pad);
    this.pad = pad;
    this.dt = this.lastNow < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, (nowMs - this.lastNow) / 1000));
    this.lastNow = nowMs;
    this.seq++;
    this.read(pad);
  }

  /** Short, light vibration (hard landing, transform). Never throws; does nothing without a pad or when sound is off. */
  rumble(strong: number, weak: number, ms: number): void {
    const pad = this.pad;
    if (!this.connected || !pad || !this.deviceActive || !this.rumbleAllowed()) return;
    try {
      const act = (pad as unknown as { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }).vibrationActuator;
      if (!act || typeof act.playEffect !== 'function') return;
      const r = act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      if (r && typeof r.catch === 'function') r.catch(() => undefined);
    } catch {
      // not supported: no rumble
    }
  }

  private attach(pad: Gamepad): void {
    this.index = pad.index;
    this.id = pad.id;
    this.mapping = pad.mapping;
    if (pad.mapping === 'standard') {
      this.table = 'standard';
      this.profile = 'standard (identity)';
      this.buttonMap = STANDARD_BUTTONS;
      this.axisMap = STANDARD_AXES;
    } else if (DUALSENSE_ID.test(pad.id)) {
      this.table = 'dualsense';
      this.profile = 'DualSense/DS4 non-standard (btn 0 Sq,1 X,2 O; axes 0,1 / 2,5; hat axis 9)';
      this.buttonMap = DUALSENSE_BUTTONS;
      this.axisMap = DUALSENSE_AXES;
    } else {
      this.table = 'standard-guess';
      this.profile = 'generic (axes 0,1 move; any face button = confirm/jump)';
      this.buttonMap = STANDARD_BUTTONS;
      this.axisMap = pad.axes.length >= 4 ? GENERIC_AXES : STANDARD_AXES;
    }
    this.down.fill(0);
    this.prevDown.fill(0);
    this.swallowed.fill(0);
    if (!this.connected) {
      this.connected = true;
      for (const l of this.connectListeners) l(true);
    }
  }

  /** The pad vanished mid-play: everything reads as released so nothing keeps walking. */
  private lose(): void {
    this.connected = false;
    this.index = -1;
    this.pad = null;
    this.down.fill(0);
    this.prevDown.fill(0);
    this.swallowed.fill(0);
    this.move.x = this.move.y = this.look.x = this.look.y = this.leftRaw.x = this.leftRaw.y = 0;
    this.seq++;
    this.setActive(false);
    for (const l of this.connectListeners) l(false);
  }

  private read(pad: Gamepad): void {
    const btns = pad.buttons;
    const map = this.buttonMap;
    let pressedNow = false;
    for (let i = 0; i < PAD_BUTTONS; i++) {
      const idx = map[i];
      let d = 0;
      if (idx >= 0 && idx < btns.length) {
        const b = btns[idx];
        if (b.pressed || b.value > PadConfig.triggerThreshold) d = 1;
      }
      this.down[i] = d;
    }
    if (this.table === 'standard-guess') {
      // Unknown layout: any of the first four buttons counts as Cross (jump / confirm).
      for (let i = 0; i < 4 && i < btns.length; i++) if (i !== 1 && (btns[i].pressed || btns[i].value > 0.5)) this.down[PadBtn.cross] = 1;
    }
    const ax = pad.axes;
    const am = this.axisMap;
    if (am.hat >= 0 && am.hat < ax.length) {
      // D-pad as a hat axis: eight steps from -1 (up) clockwise; anything beyond +-1 is "centred".
      const v = ax[am.hat];
      if (v >= -1.05 && v <= 1.05) {
        const step = Math.round((v + 1) * 3.5);
        if (step === 0 || step === 1 || step === 7) this.down[PadBtn.up] = 1;
        if (step >= 1 && step <= 3) this.down[PadBtn.right] = 1;
        if (step >= 3 && step <= 5) this.down[PadBtn.down] = 1;
        if (step >= 5 && step <= 7) this.down[PadBtn.left] = 1;
      }
    }
    for (let i = 0; i < PAD_BUTTONS; i++) {
      if (this.down[i] && !this.prevDown[i]) {
        this.count[i]++;
        pressedNow = true;
      }
      if (!this.down[i]) this.swallowed[i] = 0;
      this.prevDown[i] = this.down[i];
    }

    const lx = ax.length > am.lx ? ax[am.lx] : 0;
    const ly = ax.length > am.ly ? ax[am.ly] : 0;
    const rx = ax.length > am.rx ? ax[am.rx] : 0;
    const ry = ax.length > am.ry ? ax[am.ry] : 0;
    this.leftRaw.x = lx;
    this.leftRaw.y = ly;
    shape(lx, ly, PadConfig.moveDeadZone, PadConfig.moveCurve, this.move);
    this.move.y = -this.move.y; // stick up is negative: forward is positive
    // D-pad also walks (small children): digital full speed, summed with the stick (Input clamps the length).
    this.move.x += this.down[PadBtn.right] - this.down[PadBtn.left];
    this.move.y += this.down[PadBtn.up] - this.down[PadBtn.down];
    const ml = Math.hypot(this.move.x, this.move.y);
    if (ml > 1) {
      this.move.x /= ml;
      this.move.y /= ml;
    }
    shape(rx, ry, PadConfig.lookDeadZone, PadConfig.lookCurve, this.look);
    if (PadConfig.invertY) this.look.y = -this.look.y;

    if (pressedNow || Math.hypot(lx, ly) > 0.3 || Math.hypot(rx, ry) > 0.3) this.lastPadAt = performance.now();
    if (pressedNow || Math.hypot(lx, ly) > PadConfig.activateAxis || Math.hypot(rx, ry) > PadConfig.activateAxis) this.setActive(true);
  }

  private setActive(on: boolean): void {
    if (on === this.deviceActive) return;
    this.deviceActive = on;
    document.documentElement.classList.toggle('pad-ui', on);
    for (const l of this.activeListeners) l(on);
  }

  private readonly onConnected = (): void => {
    this.watch = true;
    this.lastScan = -1e9;
  };

  private readonly onDisconnected = (): void => {
    // The next poll rescans and notices the pad is gone (or that another one remains).
    this.watch = true;
  };

  private readonly onKeyGuard = (e: KeyboardEvent): void => {
    if (!e.isTrusted || !this.connected) return;
    if (!isBackish(e) && !(document.documentElement.classList.contains('tv-ui') && this.tvEcho(e))) return;
    if (e.key === 'Backspace' && e.target instanceof HTMLElement && /^(input|textarea)$/i.test(e.target.tagName)) return;
    if (!this.padKeyEcho(e) && !this.tvEcho(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // PadUi sends its own Escape for Circle: handling both would open and close the menu
  };

  private readonly onOtherInput = (e: Event): void => {
    if (!e.isTrusted || !this.deviceActive) return;
    if (e.type === 'keydown' && this.padKeyEcho(e)) return; // the browser echoing a pad button as a key
    if (e.type === 'mousedown' && this.mouseSuppressed()) {
      this.clash();
      return;
    }
    this.setActive(false);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!e.isTrusted) return;
    if (Math.abs(e.movementX) + Math.abs(e.movementY) <= 6) return;
    if (this.mouseSuppressed()) {
      this.clash();
      return;
    }
    if (this.deviceActive) this.setActive(false);
  };
}

/** Keys a TV browser sends for Back (and the ones its pad B / Circle button may be mapped to). */
export function isBackish(e: KeyboardEvent): boolean {
  switch (e.key) {
    case 'GoBack': case 'BrowserBack': case 'XF86Back': case 'Backspace': case 'Escape': return true;
    default:
  }
  const k = e.keyCode;
  return k === 4 || k === 8 || k === 27 || k === 10009 || k === 461;
}

/** Radial dead zone + curve: out = dir * curve(rescaled magnitude). */
function shape(ax: number, ay: number, dead: number, curve: number, out: PadVec): void {
  const m = Math.hypot(ax, ay);
  if (m <= dead) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const s = Math.pow(Math.min(1, (m - dead) / (1 - dead)), curve);
  out.x = (ax / m) * s;
  out.y = (ay / m) * s;
}

export const padHub = new GamepadHub();
tvDebug.hubInfo = () => {
  const h = padHub;
  const out = [`hub: ${h.connected ? 'connected' : 'no pad'}  profile ${h.profile || '-'}  table ${h.table || '-'}  active ${h.deviceActive}  mouseSuppressed ${h.mouseSuppressed()}`];
  if (h.connected) out.push(`   logical down ${Array.from(h.down).map((v, i) => (v ? i : -1)).filter((i) => i >= 0).join(' ') || '-'}  move ${h.move.x.toFixed(1)},${h.move.y.toFixed(1)}`);
  return out;
};
