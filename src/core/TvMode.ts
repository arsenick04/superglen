/**
 * TV mode (Android TV / Google TV / Fire TV / smart-TV browsers, and casting to a big screen).
 *
 * - Detection: `?tv=1` (on) / `?tv=0` (off) beat everything; else the saved choice "Mode TV: Otomatis / Nyala / Mati"
 *   (default Otomatis = TV user agents, or a large screen with no touch and no fine pointer).
 * - Effect: `tv-ui` class on <html> (CSS: big focus ring, larger HUD, overscan margins, no cursor, no touch controls).
 * - Remote keys: ONE early capture listener normalises the keys a TV remote sends (D-pad keyCodes 19-23, Back = keyCode 4 /
 *   'GoBack' / 'BrowserBack' / Backspace, Menu = keyCode 82 / 'ContextMenu') into the standard ones the rest of the game already
 *   understands (Arrow keys, Enter, Escape), then lets the TV controls (input/TvControls.ts) look at them first.
 * The preference lives on the device (not in a save slot) and every storage access is wrapped in try/catch.
 */
import './TvDebug'; // registers its raw event recorder before any handler below can swallow an event
import { backState } from './BackTrap';

export type TvPref = 'auto' | 'on' | 'off';
export type TvKind = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'menu';

const PREF_KEY = 'superglen.tv.v1';
const TV_UA = /Android[^)]*\bTV\b|Android ?TV|GoogleTV|Google TV|\bAFT[A-Z0-9]{1,6}\b|BRAVIA|SmartTV|SMART-TV|HbbTV|Hisense|VIDAA|Tizen|Web0S|WebOS|NetCast|CrKey|\bTV Safari|Large Screen/i;

/** Standard replacement for each kind (what the rest of the game listens for). */
const CANON: Readonly<Record<TvKind, { key: string; code: string; keyCode: number }>> = {
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ok: { key: 'Enter', code: 'Enter', keyCode: 13 },
  back: { key: 'Escape', code: 'Escape', keyCode: 27 },
  menu: { key: 'ContextMenu', code: 'ContextMenu', keyCode: 93 },
};

/** Which kind a keyboard event is, or null (not a navigation key). */
export function tvKindOf(e: KeyboardEvent): TvKind | null {
  switch (e.key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'Enter': case 'Select': case 'OK': return 'ok';
    case 'Escape': case 'GoBack': case 'BrowserBack': case 'XF86Back': case 'Backspace': return 'back';
    case 'ContextMenu': case 'Menu': case 'F1': return 'menu';
    default:
  }
  switch (e.keyCode) {
    // keyCode 19 is Pause on Samsung Tizen (media/colour keys 403-406, 412, 413, 415, 417, 10252 are left alone); Android TV also sends key 'ArrowUp'.
    case 20: return 'down';
    case 21: return 'left';
    case 22: return 'right';
    case 23: case 66: case 13: return 'ok';
    case 4: case 8: case 111: case 10009: case 461: return 'back'; // Android, Tizen, webOS, VIDAA (Hisense: 8 or 461)
    case 82: case 1082: return 'menu';
    default: return null;
  }
}

type Listener = (on: boolean) => void;
/** Return true when the key was used (the key is then swallowed). */
export type TvKeyHook = (kind: TvKind, e: KeyboardEvent, down: boolean) => boolean;

function urlOverride(): boolean | null {
  try {
    const v = new URLSearchParams(window.location.search).get('tv');
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  } catch {
    // ignore
  }
  return null;
}

function detectTvDevice(): boolean {
  try {
    if (TV_UA.test(navigator.userAgent)) return true;
    const mm = (q: string): boolean => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
    // A large screen with neither a mouse nor a finger: a TV browser that does not say so in its user agent.
    const big = Math.max(window.screen.width, window.screen.height) >= 1280;
    const noPointer = !mm('(any-pointer: fine)') && !mm('(any-pointer: coarse)') && !mm('(pointer: fine)') && !mm('(pointer: coarse)');
    return big && noPointer && (navigator.maxTouchPoints || 0) === 0;
  } catch {
    return false;
  }
}

class TvMode {
  private _active = false;
  private _pref: TvPref = 'auto';
  private readonly listeners: Listener[] = [];
  private readonly override = urlOverride();
  /** Set by input/TvControls.ts. */
  hook: TvKeyHook | null = null;
  /** True only while a remote alias is being re-sent as its standard key (the hook may use that synthetic event). */
  relaying = false;
  /** Set by input/GamepadHub.ts: true when a trusted key event is only the browser echoing a pad button (the pad is read directly). */
  echoGuard: ((e: KeyboardEvent) => boolean) | null = null;

  constructor() {
    try {
      const raw = window.localStorage.getItem(PREF_KEY);
      if (raw === 'on' || raw === 'off' || raw === 'auto') this._pref = raw;
    } catch {
      // ignore
    }
    this.apply();
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
  }

  get active(): boolean {
    return this._active;
  }

  get pref(): TvPref {
    return this._pref;
  }

  /** The URL forces the mode (the settings choice is then ignored this session). */
  get forcedByUrl(): boolean {
    return this.override !== null;
  }

  setPref(p: TvPref): void {
    this._pref = p;
    try {
      window.localStorage.setItem(PREF_KEY, p);
    } catch {
      // ignore
    }
    this.apply();
  }

  /** Calls `cb` now with the current value and again on every change. */
  onChange(cb: Listener): void {
    this.listeners.push(cb);
    cb(this._active);
  }

  private apply(): void {
    const on = this.override ?? (this._pref === 'on' ? true : this._pref === 'off' ? false : detectTvDevice());
    document.documentElement.classList.toggle('tv-ui', on);
    if (on === this._active) return;
    this._active = on;
    for (const l of this.listeners) l(on);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this._active || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.isTrusted && this.echoGuard?.(e)) {
      e.preventDefault();
      e.stopImmediatePropagation(); // the Gamepad API reports this pad: its own key echo must not drive the menus a second time
      return;
    }
    const kind = tvKindOf(e);
    if (!kind) return;
    const down = e.type === 'keydown';
    const t = e.target as HTMLElement | null;
    if (kind === 'back' && e.key === 'Backspace' && t && /^(input|textarea)$/i.test(t.tagName)) return; // typing
    if (kind === 'back' && down && e.isTrusted && performance.now() - backState.lastPopAt < 350) {
      // The browser already reported this Back as a history step (handled by BackTrap): do not handle it twice.
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (kind === 'back' && down && e.isTrusted) backState.lastKeyAt = performance.now();
    const c = CANON[kind];
    // Remote aliases (keyCode 4 / 23, GoBack, Backspace ...) become the standard key, once.
    if (e.isTrusted && (e.key !== c.key || e.code !== c.code) && kind !== 'menu') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.relaying = true;
      try {
        const ne = new KeyboardEvent(e.type, { key: c.key, code: c.code, repeat: e.repeat, bubbles: true, cancelable: true });
        window.dispatchEvent(ne);
      } catch {
        // ignore
      }
      this.relaying = false;
      return;
    }
    if (this.hook && this.hook(kind, e, down)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
}

export const tvMode = new TvMode();
