import { padHub, PadBtn, PadConfig, PAD_BUTTONS } from './GamepadHub';
import { startGate } from '../core/StartGate';
import type { SettingsMenu } from '../ui/SettingsMenu';
import type { MapView } from '../ui/MapView';

export interface PadUiDeps {
  settings: SettingsMenu;
  maps: MapView;
  /** The quiz overlay is open. */
  quizOpen: () => boolean;
  /** Retry waking up the AudioContext (browsers may not count a pad press as a user gesture). Cheap when it is running. */
  resumeAudio: () => void;
}

const FACE_BUTTONS = [PadBtn.cross, PadBtn.circle, PadBtn.square, PadBtn.triangle] as const;
const FOCUSABLE = 'button, [role="slider"]';
/** First match wins when a panel opens: a safe, obvious choice (e.g. "Tidak" in the restart question, a quiz card). */
const DEFAULT_PICKS = ['[data-pad-default]', '.qp-card', '.qp-cat', '.qp-ok', '.qp-tab.on'];

const DIR_NONE = 0;
const DIR_UP = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 3;
const DIR_RIGHT = 4;

/**
 * Everything the controller does outside gameplay: the start press, Options (settings), Create / touchpad (map), and
 * focus navigation in the DOM panels (quiz, settings, restart question, full map). Panels are driven through the events
 * they already understand: Cross sends the same `pointerdown` a finger would, Circle sends Escape, and left/right on a
 * volume slider sends the arrow keys it already handles. No game logic is duplicated here.
 */
export class PadUi {
  private readonly seen = new Uint32Array(PAD_BUTTONS);
  private readonly fresh = new Uint8Array(PAD_BUTTONS);
  private scope: HTMLElement | null = null;
  private focus: HTMLElement | null = null;
  private dir = DIR_NONE;
  private timer = 0;
  private readonly cache = new Map<string, HTMLElement | null>();

  constructor(private readonly deps: PadUiDeps) {}

  /** Once per polled frame, right after `padHub.poll`. */
  update(): void {
    const h = padHub;
    if (!h.connected) {
      this.clearFocus();
      this.scope = null;
      return;
    }
    let any = false;
    for (let i = 0; i < PAD_BUTTONS; i++) {
      const f = h.count[i] !== this.seen[i] ? 1 : 0;
      this.fresh[i] = f;
      this.seen[i] = h.count[i];
      if (f) any = true;
    }
    if (any) this.deps.resumeAudio();

    if (!startGate.started) {
      if (any) {
        startGate.start();
        for (let i = 0; i < PAD_BUTTONS; i++) h.swallow(i);
      }
      return;
    }

    const f = this.fresh;
    const st = this.deps.settings;
    if (f[PadBtn.options]) {
      if (st.opened) st.close();
      else st.open();
    }
    if (f[PadBtn.create] || f[PadBtn.touchpad]) st.toggleMap();

    const scope = this.findScope();
    if (scope !== this.scope) {
      this.clearFocus();
      this.scope = scope;
      this.dir = DIR_NONE;
    }
    if (!scope) return;

    // The face buttons belong to the panel while it is open: they must not jump / shoot when it closes.
    for (let i = 0; i < FACE_BUTTONS.length; i++) h.swallow(FACE_BUTTONS[i]);

    if (!this.focus || !this.usable(this.focus, scope)) this.setFocus(this.pickDefault(scope));

    this.navigate(h.dt);

    if (f[PadBtn.cross]) this.activate();
    else if (f[PadBtn.circle]) this.back();
  }

  /** Test hook: what has focus. */
  get focusInfo(): { scope: string; act: string; label: string; cls: string } {
    const e = this.focus;
    return {
      scope: this.scope ? this.scope.className : '',
      act: e ? (e.dataset.act ?? '') : '',
      label: e ? (e.getAttribute('aria-label') ?? '') : '',
      cls: e ? e.className : '',
    };
  }

  // -----------------------------------------------------------------------------------------------------------------

  private query(sel: string): HTMLElement | null {
    let e = this.cache.get(sel);
    if (e === undefined || (e && !e.isConnected)) {
      e = document.querySelector<HTMLElement>(sel);
      this.cache.set(sel, e);
    }
    return e;
  }

  private findScope(): HTMLElement | null {
    const d = this.deps;
    if (d.quizOpen()) return this.query('.qp');
    if (d.maps.isFullOpen) return this.query('.fullmap');
    if (d.settings.opened) return this.query(d.settings.confirmOpen ? '.settings-confirm' : '.settings');
    return null;
  }

  private usable(e: HTMLElement, scope: HTMLElement): boolean {
    if (!e.isConnected || !scope.contains(e)) return false;
    if ((e as HTMLButtonElement).disabled || e.classList.contains('gone') || e.classList.contains('qp-close')) return false;
    return e.getClientRects().length > 0;
  }

  private candidates(scope: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    const all = scope.querySelectorAll<HTMLElement>(FOCUSABLE);
    for (let i = 0; i < all.length; i++) if (this.usable(all[i], scope)) out.push(all[i]);
    return out;
  }

  private pickDefault(scope: HTMLElement): HTMLElement | null {
    for (const sel of DEFAULT_PICKS) {
      const list = scope.querySelectorAll<HTMLElement>(sel);
      for (let i = 0; i < list.length; i++) if (this.usable(list[i], scope)) return list[i];
    }
    const c = this.candidates(scope);
    return c.length > 0 ? c[0] : null;
  }

  private setFocus(e: HTMLElement | null): void {
    if (e === this.focus) return;
    this.focus?.classList.remove('pad-focus');
    this.focus = e;
    e?.classList.add('pad-focus');
  }

  private clearFocus(): void {
    this.setFocus(null);
  }

  private currentDir(): number {
    const h = padHub;
    if (h.down[PadBtn.up]) return DIR_UP;
    if (h.down[PadBtn.down]) return DIR_DOWN;
    if (h.down[PadBtn.left]) return DIR_LEFT;
    if (h.down[PadBtn.right]) return DIR_RIGHT;
    const x = h.leftRaw.x;
    const y = h.leftRaw.y;
    const t = PadConfig.navAxis;
    if (Math.abs(y) >= Math.abs(x) && Math.abs(y) > t) return y < 0 ? DIR_UP : DIR_DOWN;
    if (Math.abs(x) > t) return x < 0 ? DIR_LEFT : DIR_RIGHT;
    return DIR_NONE;
  }

  /** Stick / D-pad with key-repeat: one step on the first tilt, then steady steps while held. */
  private navigate(dt: number): void {
    const d = this.currentDir();
    if (d === DIR_NONE) {
      this.dir = DIR_NONE;
      return;
    }
    if (d !== this.dir) {
      this.dir = d;
      this.timer = PadConfig.navRepeatDelay;
      this.step(d);
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = PadConfig.navRepeat;
      this.step(d);
    }
  }

  private step(d: number): void {
    const cur = this.focus;
    const scope = this.scope;
    if (!scope) return;
    if (cur && cur.getAttribute('role') === 'slider' && (d === DIR_LEFT || d === DIR_RIGHT)) {
      cur.dispatchEvent(new KeyboardEvent('keydown', { key: d === DIR_LEFT ? 'ArrowLeft' : 'ArrowRight', bubbles: true, cancelable: true }));
      return;
    }
    const list = this.candidates(scope);
    if (list.length === 0) return;
    if (!cur) {
      this.setFocus(list[0]);
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    // Two passes: first only targets inside a 50 degree cone around the direction, then (nothing there) anything ahead.
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (let pass = 0; pass < 2 && !best; pass++) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e === cur) continue;
        const b = e.getBoundingClientRect();
        const dx = (b.left + b.right) / 2 - cx;
        const dy = (b.top + b.bottom) / 2 - cy;
        let along: number;
        let across: number;
        if (d === DIR_UP) {
          along = -dy;
          across = dx;
        } else if (d === DIR_DOWN) {
          along = dy;
          across = dx;
        } else if (d === DIR_LEFT) {
          along = -dx;
          across = dy;
        } else {
          along = dx;
          across = dy;
        }
        if (along < 4) continue;
        if (pass === 0 && Math.abs(across) > along * 1.2) continue;
        const score = along + 2 * Math.abs(across);
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
    }
    if (best) this.setFocus(best);
  }

  private activate(): void {
    const e = this.focus;
    if (!e || e.getAttribute('role') === 'slider') return;
    try {
      const ev =
        typeof PointerEvent === 'function'
          ? new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 })
          : new Event('pointerdown', { bubbles: true, cancelable: true });
      e.dispatchEvent(ev);
    } catch {
      // ignore
    }
  }

  private back(): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }
}
