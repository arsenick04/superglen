import type { Action, InputSource, Vec2 } from './Input';
import { TouchControls, type TouchButtonDef } from '../ui/TouchControls';
import { startGate } from '../core/StartGate';

/**
 * Touch input via Pointer Events (not Touch Events): one code path for finger, pen and mouse
 * (handy for desktop debugging with ?touch=1), each pointer has its own id, and
 * setPointerCapture keeps events flowing when a finger leaves its element. Safari on iOS 13+
 * supports all of this. touchstart/touchmove are still used, but only to preventDefault
 * (scroll, pinch, double-tap zoom, callout), which Pointer Events cannot do.
 */
export const TouchConfig = {
  /** Joystick radius in CSS px (finger travel for full speed). */
  joystickRadius: 60,
  /** Stick below this fraction of the radius counts as zero; the rest is rescaled to 0..1. */
  deadZone: 0.12,
  /** Left part of the screen (fraction of width) where a touch starts the joystick. */
  joystickZone: 0.45,
  /** Radians of camera yaw per px of finger drag. */
  lookSensitivity: 0.005,
  /** Pitch drag is weaker than yaw so the view does not flip by accident. */
  pitchFactor: 0.6,
  /** A touch this close (px) to a button still counts as pressing it. */
  buttonHitMargin: 10,
  /** A finger must leave the button by this much (px) before it releases. */
  buttonReleaseMargin: 14,
} as const;

const ACTION_KEYS: readonly Action[] = ['jump', 'laser', 'shield', 'interact', 'transform'];

interface Held {
  kind: 'stick' | 'look' | 'button';
  x: number;
  y: number;
  action?: Action;
}

export class TouchSource implements InputSource {
  readonly move: Vec2 = { x: 0, y: 0 };
  readonly controls: TouchControls;

  private readonly held = new Map<number, Held>();
  /** How many fingers rest on each button (isDown runs every frame: no iterating the map there). */
  private readonly buttonCount: Record<Action, number> = { jump: 0, laser: 0, shield: 0, interact: 0, transform: 0 };
  private readonly latch = new Set<Action>();
  /** The stick picture is redrawn once per frame at most (pointermove can arrive faster than frames). */
  private stickDirty = false;
  private stickKx = 0;
  private stickKy = 0;
  private lookX = 0;
  private lookY = 0;
  private stickId = -1;
  private cx = 0;
  private cy = 0;
  private wasEnabled = false;
  private readonly portrait = window.matchMedia('(orientation: portrait)');

  constructor(root: HTMLElement, private readonly isTouchUi: () => boolean) {
    this.controls = new TouchControls(root, TouchConfig.joystickRadius);
    const l = this.controls.layer;
    l.addEventListener('pointerdown', this.onDown);
    l.addEventListener('pointermove', this.onMove);
    l.addEventListener('pointerup', this.onUp);
    l.addEventListener('pointercancel', this.onUp);
    l.addEventListener('lostpointercapture', this.onUp);
    window.addEventListener('blur', this.onReset);
    document.addEventListener('visibilitychange', this.onReset);
    document.addEventListener('touchcancel', this.onReset);
    document.addEventListener('touchstart', this.onTouchDefault, { passive: false });
    document.addEventListener('touchmove', this.onTouchDefault, { passive: false });
    document.addEventListener('gesturestart', this.onPrevent);
    document.addEventListener('gesturechange', this.onPrevent);
    document.addEventListener('contextmenu', this.onContext);
  }

  /** Swap the button layout (Glen <-> Superglen). Fingers resting on removed buttons are released. */
  setLayout(defs: readonly TouchButtonDef[]): void {
    this.controls.setLayout(defs);
    for (const [id, h] of this.held) {
      if (h.kind === 'button' && h.action && !this.controls.buttons.has(h.action)) this.release(id);
    }
    for (const a of this.controls.buttons.keys()) this.syncButton(a);
  }

  /** Input is live only on touch devices, after the start tap, and in landscape. */
  private get enabled(): boolean {
    return this.isTouchUi() && startGate.started && !this.portrait.matches;
  }

  update(): void {
    const en = this.enabled;
    if (!en && this.wasEnabled) this.reset();
    this.wasEnabled = en;
    if (this.stickDirty) {
      this.stickDirty = false;
      this.controls.showStick(this.cx, this.cy, this.stickKx, this.stickKy);
    }
  }

  drainLook(out: Vec2): void {
    out.x += this.lookX;
    out.y += this.lookY;
    this.lookX = 0;
    this.lookY = 0;
  }

  isDown(action: Action): boolean {
    return this.buttonCount[action] > 0;
  }

  private hold(id: number, h: Held): void {
    this.held.set(id, h);
    if (h.kind === 'button' && h.action) this.buttonCount[h.action]++;
  }

  private release(id: number): void {
    const h = this.held.get(id);
    if (!h) return;
    this.held.delete(id);
    if (h.kind === 'button' && h.action) this.buttonCount[h.action]--;
  }

  drainPressed(action: Action): boolean {
    return this.latch.delete(action);
  }

  reset(): void {
    this.held.clear();
    for (const a of ACTION_KEYS) this.buttonCount[a] = 0;
    this.stickDirty = false;
    this.latch.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.stickId = -1;
    this.move.x = 0;
    this.move.y = 0;
    this.controls.hideStick();
    for (const a of this.controls.buttons.keys()) this.controls.setPressed(a, false);
  }

  dispose(): void {
    const l = this.controls.layer;
    l.removeEventListener('pointerdown', this.onDown);
    l.removeEventListener('pointermove', this.onMove);
    l.removeEventListener('pointerup', this.onUp);
    l.removeEventListener('pointercancel', this.onUp);
    l.removeEventListener('lostpointercapture', this.onUp);
    window.removeEventListener('blur', this.onReset);
    document.removeEventListener('visibilitychange', this.onReset);
    document.removeEventListener('touchcancel', this.onReset);
    document.removeEventListener('touchstart', this.onTouchDefault);
    document.removeEventListener('touchmove', this.onTouchDefault);
    document.removeEventListener('gesturestart', this.onPrevent);
    document.removeEventListener('gesturechange', this.onPrevent);
    document.removeEventListener('contextmenu', this.onContext);
    this.controls.dispose();
  }

  private hitButton(x: number, y: number, margin: number): Action | null {
    // Nearest button centre wins when the hit margins of two neighbours overlap.
    let best: Action | null = null;
    let bestD = Infinity;
    for (const [action, el] of this.controls.buttons) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin) {
        const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
        if (d < bestD) {
          bestD = d;
          best = action;
        }
      }
    }
    return best;
  }

  private syncButton(action: Action): void {
    this.controls.setPressed(action, this.isDown(action));
  }

  private updateStick(x: number, y: number): void {
    const R = TouchConfig.joystickRadius;
    let dx = x - this.cx;
    let dy = y - this.cy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    const mag = Math.min(len / R, 1);
    if (mag < TouchConfig.deadZone) {
      this.move.x = 0;
      this.move.y = 0;
    } else {
      const scaled = (mag - TouchConfig.deadZone) / (1 - TouchConfig.deadZone);
      this.move.x = (dx / (mag * R)) * scaled;
      this.move.y = (-dy / (mag * R)) * scaled;
    }
    this.stickKx = dx;
    this.stickKy = dy;
    this.stickDirty = true;
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.held.has(e.pointerId)) return;
    try {
      this.controls.layer.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic pointers; events still arrive while over the layer.
    }
    const x = e.clientX;
    const y = e.clientY;
    const action = this.hitButton(x, y, TouchConfig.buttonHitMargin);
    if (action) {
      this.hold(e.pointerId, { kind: 'button', x, y, action });
      this.latch.add(action);
      this.syncButton(action);
    } else if (this.stickId < 0 && x < window.innerWidth * TouchConfig.joystickZone) {
      this.hold(e.pointerId, { kind: 'stick', x, y });
      this.stickId = e.pointerId;
      this.cx = x;
      this.cy = y;
      this.updateStick(x, y);
    } else {
      this.hold(e.pointerId, { kind: 'look', x, y });
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    const h = this.held.get(e.pointerId);
    if (!h) return;
    const x = e.clientX;
    const y = e.clientY;
    if (h.kind === 'stick') {
      this.updateStick(x, y);
    } else if (h.kind === 'look') {
      this.lookX += (x - h.x) * TouchConfig.lookSensitivity;
      this.lookY += (y - h.y) * TouchConfig.lookSensitivity * TouchConfig.pitchFactor;
      h.x = x;
      h.y = y;
    } else if (h.action && this.hitButton(x, y, TouchConfig.buttonReleaseMargin) !== h.action) {
      // Finger slid off the button: release it (and ignore the rest of this touch).
      this.release(e.pointerId);
      this.syncButton(h.action);
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const h = this.held.get(e.pointerId);
    if (!h) return;
    this.release(e.pointerId);
    if (h.kind === 'stick') {
      this.stickDirty = false;
      this.stickId = -1;
      this.move.x = 0;
      this.move.y = 0;
      this.controls.hideStick();
    } else if (h.kind === 'button' && h.action) {
      this.syncButton(h.action);
    }
  };

  private readonly onReset = (): void => this.reset();

  private readonly onTouchDefault = (e: TouchEvent): void => {
    if (this.isTouchUi() && e.cancelable) e.preventDefault();
  };

  private readonly onPrevent = (e: Event): void => e.preventDefault();

  private readonly onContext = (e: Event): void => {
    if (this.isTouchUi()) e.preventDefault();
  };
}
