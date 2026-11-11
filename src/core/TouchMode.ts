/**
 * Decides whether the touch UI is used. On when the device has a coarse pointer (phone/tablet),
 * or when the first real `touchstart` arrives (hybrid laptops), or with `?touch=1` (debugging).
 * Toggles the `touch-ui` class on <html> so CSS can show/hide things.
 */
type Listener = (on: boolean) => void;

class TouchMode {
  private _active = false;
  private readonly listeners: Listener[] = [];

  constructor() {
    const forced = new URLSearchParams(window.location.search).get('touch') === '1';
    if (forced || window.matchMedia('(pointer: coarse)').matches) this.set(true);
    window.addEventListener('touchstart', () => this.set(true), { capture: true, passive: true });
  }

  get active(): boolean {
    return this._active;
  }

  /** Calls `cb` now with the current value and again on every change. */
  onChange(cb: Listener): void {
    this.listeners.push(cb);
    cb(this._active);
  }

  private set(on: boolean): void {
    if (on === this._active) return;
    this._active = on;
    document.documentElement.classList.toggle('touch-ui', on);
    for (const l of this.listeners) l(on);
  }
}

export const touchMode = new TouchMode();
