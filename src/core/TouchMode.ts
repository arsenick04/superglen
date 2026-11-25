/**
 * Decides whether the touch UI is used. On when the device has a coarse pointer (phone/tablet),
 * or when the first real `touchstart` arrives (hybrid laptops), or with `?touch=1` (debugging).
 * Toggles the `touch-ui` class on <html> so CSS can show/hide things.
 */
import { tvMode } from './TvMode';

type Listener = (on: boolean) => void;

class TouchMode {
  private _active = false;
  private readonly listeners: Listener[] = [];
  private readonly forced: boolean;

  constructor() {
    this.forced = new URLSearchParams(window.location.search).get('touch') === '1';
    this.evaluate();
    window.addEventListener('touchstart', () => this.set(true), { capture: true, passive: true });
    // TV mode (a remote, no finger): the touch UI never shows; switching TV mode off lets the device decide again.
    tvMode.onChange(() => this.evaluate());
  }

  get active(): boolean {
    return this._active;
  }

  /** Calls `cb` now with the current value and again on every change. */
  onChange(cb: Listener): void {
    this.listeners.push(cb);
    cb(this._active);
  }

  private evaluate(): void {
    if (tvMode.active && !this.forced) this.set(false);
    else if (this.forced || window.matchMedia('(pointer: coarse)').matches) this.set(true);
  }

  private set(on: boolean): void {
    if (on && tvMode.active && !this.forced) return;
    if (on === this._active) return;
    this._active = on;
    document.documentElement.classList.toggle('touch-ui', on);
    for (const l of this.listeners) l(on);
  }
}

export const touchMode = new TouchMode();
