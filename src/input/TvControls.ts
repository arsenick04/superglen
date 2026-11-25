import { startGate } from '../core/StartGate';
import { tvMode, type TvKind } from '../core/TvMode';
import { padHub } from './GamepadHub';
import type { Action, InputSource, Vec2 } from './Input';
import type { PadUi } from './PadUi';
import type { Input } from './Input';
import type { SettingsMenu } from '../ui/SettingsMenu';
import '../ui/tv.css';

/** One entry of the radial action menu (a skill the child has unlocked, or the map). */
export interface TvRadialItem {
  action: Action | 'map';
  /** Inline SVG (same icons as the touch buttons). */
  icon: string;
  color: string;
}

export interface TvControlsDeps {
  input: Input;
  settings: SettingsMenu;
  padUi: PadUi;
  /** The player may be controlled right now (level running, no menu, no quiz, no fade). */
  canPlay: () => boolean;
  /** Skills and the map that the radial menu offers now. */
  radialItems: () => TvRadialItem[];
  /** The map button of the radial menu. */
  toggleMap: () => void;
  /** The first press on the "tap to start" screen (the title menu is not used, e.g. debug URLs). */
  start: () => void;
}

/** Long press on OK (ms) opens the action menu. */
const LONG_PRESS_MS = 550;
/** A radial pick holds its action this long (laser and shield are "held" skills). */
const PULSE_MS = 380;
const IDLE_CLOSE_MS = 9000;
const HINT_KEY = 'superglen.tv.hint.v1';
const HINT_MS = 7000;

const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);

/**
 * Playing with a TV remote (D-pad, OK, Back, Menu) and driving every panel with it.
 * - Gameplay: arrows move (the camera eases behind Glen by itself), OK = talk/take when a prompt or a dialog is up, else jump;
 *   Back = pause menu; Menu or a long press on OK = the radial action menu (laser, shield, fly, transform, map).
 * - Panels (quiz, pause menu, map, questions): arrows move the focus ring, OK presses, Back goes back (see input/PadUi.ts).
 * - Cinematic: OK or Back skips. Start screen: OK starts.
 * Registered as an InputSource so OK can latch jump / interact like any other source.
 */
export class TvControls implements InputSource {
  readonly move: Vec2 = { x: 0, y: 0 };
  private readonly latch = new Set<Action>();
  private readonly held = new Set<Action>();
  private readonly pulses = new Map<Action, number>();
  private okDown = false;
  private okTimer = 0;
  private okSwallowUp = false;
  private radial: HTMLDivElement | null = null;
  private radialItems: TvRadialItem[] = [];
  private radialIndex = 0;
  private radialIdle = 0;
  private hintEl: HTMLDivElement | null = null;
  private hintShown = false;
  private raf = 0;

  constructor(private readonly deps: TvControlsDeps) {
    tvMode.hook = this.onKey;
    tvMode.onChange((on) => {
      if (on) this.raf = requestAnimationFrame(this.frame);
      else {
        cancelAnimationFrame(this.raf);
        this.closeRadial();
        this.reset();
      }
    });
  }

  /** Test hook. */
  get debug(): { radialOpen: boolean; radialIndex: number; radialActions: string[]; okHeld: boolean; hint: boolean } {
    return { radialOpen: !!this.radial, radialIndex: this.radialIndex, radialActions: this.radialItems.map((i) => i.action), okHeld: this.okDown, hint: !!this.hintEl };
  }

  // ---- InputSource ------------------------------------------------------------------------------------------------

  update(): void {
    // nothing per frame: held / pulse state is time based (see isDown)
  }

  drainLook(): void {
    // the remote has no look axis: the camera eases behind the player by itself
  }

  isDown(action: Action): boolean {
    if (this.held.has(action)) return true;
    const until = this.pulses.get(action);
    if (until === undefined) return false;
    if (performance.now() < until) return true;
    this.pulses.delete(action);
    return false;
  }

  drainPressed(action: Action): boolean {
    return this.latch.delete(action);
  }

  reset(): void {
    this.latch.clear();
    this.held.clear();
    this.pulses.clear();
    this.okDown = false;
    window.clearTimeout(this.okTimer);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.closeRadial();
    if (tvMode.hook === this.onKey) tvMode.hook = null;
  }

  // ---- context ----------------------------------------------------------------------------------------------------

  private cinematicUp(): boolean {
    return !!document.querySelector('.cinematic-layer:not([hidden])');
  }

  /** OK means "talk / take / go on" instead of "jump". */
  private interactContext(): boolean {
    const p = q('.prompt');
    if (p && !p.hidden) return true;
    const d = q('.dlg');
    return !!d && !d.hidden && !d.classList.contains('compact');
  }

  private panelOpen(): boolean {
    return !!this.deps.padUi.tvSync();
  }

  // ---- keys -------------------------------------------------------------------------------------------------------

  private readonly onKey = (kind: TvKind, e: KeyboardEvent, down: boolean): boolean => {
    if (!e.isTrusted && !tvMode.relaying) return false;
    if (document.querySelector('.title-menu')) return false; // the title menu has its own keys (arrows, Enter, Esc)

    if (this.cinematicUp()) {
      if (down && !e.repeat && (kind === 'ok' || kind === 'back')) {
        const stage = q('.cinematic-layer:not([hidden]) .cinematic-stage'); // the credit roll skips on a tap on its stage, a film on its skip button
        if (stage) stage.dispatchEvent(new Event('pointerup', { bubbles: true }));
        else q('.cinematic-layer:not([hidden]) .cinematic-skip')?.click();
      }
      return true; // nothing else moves behind a film
    }
    if (!startGate.started) {
      if (down && kind === 'ok') this.deps.start();
      return kind === 'ok';
    }

    if (this.radial) return this.radialKey(kind, down, e);

    if (this.panelOpen()) {
      if (kind === 'menu') return true;
      if (!down) return kind === 'ok'; // the matching key-up of a press the panel took
      if (kind === 'ok' && e.repeat) return true;
      return this.deps.padUi.tvKey(kind); // 'back' returns false: the panel's own Escape handling runs
    }

    // ---- gameplay ----
    if (kind === 'back') {
      if (down && !e.repeat) this.deps.settings.open();
      return true;
    }
    if (kind === 'menu') {
      if (down && !e.repeat) this.openRadial();
      return true;
    }
    if (kind === 'ok') {
      if (down) {
        if (e.repeat || this.okDown) return true;
        if (!this.deps.canPlay()) return true;
        this.okDown = true;
        if (this.interactContext()) {
          this.latch.add('interact');
          this.held.add('interact');
        } else {
          this.latch.add('jump');
          this.held.add('jump');
          this.okTimer = window.setTimeout(() => {
            if (!this.okDown) return;
            this.held.delete('jump');
            this.okSwallowUp = true;
            this.openRadial();
          }, LONG_PRESS_MS);
        }
      } else {
        window.clearTimeout(this.okTimer);
        this.okDown = false;
        this.held.delete('jump');
        this.held.delete('interact');
        this.okSwallowUp = false;
      }
      return true;
    }
    return false; // arrows: the keyboard source walks
  };

  // ---- radial action menu -----------------------------------------------------------------------------------------

  private openRadial(): void {
    if (this.radial || !this.deps.canPlay()) return;
    const items = this.deps.radialItems();
    if (items.length === 0) return;
    this.deps.input.reset(); // arrows held when the menu opens must not keep walking
    this.radialItems = items;
    this.radialIndex = 0;
    const root = document.createElement('div');
    root.className = 'tv-radial';
    root.setAttribute('role', 'menu');
    const ring = document.createElement('div');
    ring.className = 'tv-radial-ring';
    const n = items.length;
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tv-radial-item';
      b.dataset.action = it.action;
      b.setAttribute('aria-label', it.action);
      b.style.setProperty('--c', it.color);
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      b.style.setProperty('--x', `${(Math.cos(ang) * 50).toFixed(2)}%`);
      b.style.setProperty('--y', `${(Math.sin(ang) * 50).toFixed(2)}%`);
      b.innerHTML = it.icon;
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.radialIndex = i;
        this.pick();
      });
      ring.append(b);
    });
    root.append(ring);
    (document.getElementById('ui') ?? document.body).appendChild(root);
    this.radial = root;
    this.radialIdle = performance.now();
    this.paintRadial();
  }

  private paintRadial(): void {
    if (!this.radial) return;
    const btns = this.radial.querySelectorAll<HTMLElement>('.tv-radial-item');
    btns.forEach((b, i) => b.classList.toggle('pad-focus', i === this.radialIndex));
  }

  private closeRadial(): void {
    this.radial?.remove();
    this.radial = null;
  }

  private pick(): void {
    const it = this.radialItems[this.radialIndex];
    this.closeRadial();
    if (!it) return;
    if (it.action === 'map') {
      this.deps.toggleMap();
      return;
    }
    this.latch.add(it.action);
    this.pulses.set(it.action, performance.now() + PULSE_MS);
  }

  private radialKey(kind: TvKind, down: boolean, e: KeyboardEvent): boolean {
    if (!down) {
      if (kind === 'ok') {
        this.okSwallowUp = false;
        this.okDown = false; // the long press that opened the menu ends here
      }
      return true;
    }
    this.radialIdle = performance.now();
    const n = this.radialItems.length;
    if (kind === 'left' || kind === 'up') this.radialIndex = (this.radialIndex + n - 1) % n;
    else if (kind === 'right' || kind === 'down') this.radialIndex = (this.radialIndex + 1) % n;
    else if (kind === 'ok') {
      if (!e.repeat && !this.okSwallowUp && !this.okDown) this.pick();
      return true;
    } else if (kind === 'back' || kind === 'menu') {
      if (!e.repeat) this.closeRadial();
      return true;
    }
    this.paintRadial();
    return true;
  }

  // ---- per frame: focus ring of the open panel, idle close, one-time gamepad hint ----------------------------------

  private readonly frame = (): void => {
    if (!tvMode.active) return;
    this.raf = requestAnimationFrame(this.frame);
    if (!document.querySelector('.title-menu')) this.deps.padUi.tvSync();
    if (this.radial && performance.now() - this.radialIdle > IDLE_CLOSE_MS) this.closeRadial();
    if (this.radial && !this.deps.canPlay()) this.closeRadial();
    if (!this.hintShown && startGate.started) this.showHint();
  };

  private showHint(): void {
    this.hintShown = true;
    let seen = false;
    try {
      seen = window.localStorage.getItem(HINT_KEY) === '1';
      window.localStorage.setItem(HINT_KEY, '1');
    } catch {
      // ignore
    }
    if (seen || padHub.connected) return;
    const el = document.createElement('div');
    el.className = 'tv-hint';
    el.innerHTML =
      '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M14 6 H50 Q60 6 62 18 L64 30 Q64 38 56 38 Q50 38 46 30 H18 Q14 38 8 38 Q0 38 0 30 L2 18 Q4 6 14 6 Z" fill="#fff"/><circle cx="46" cy="14" r="3" fill="#e8453c"/><circle cx="52" cy="20" r="3" fill="#2f8fe0"/><rect x="12" y="12" width="4" height="12" rx="1" fill="#333"/><rect x="8" y="16" width="12" height="4" rx="1" fill="#333"/></svg><span>Pakai gamepad untuk pengalaman terbaik</span>';
    (document.getElementById('ui') ?? document.body).appendChild(el);
    this.hintEl = el;
    window.setTimeout(() => {
      el.remove();
      if (this.hintEl === el) this.hintEl = null;
    }, HINT_MS);
  }
}
