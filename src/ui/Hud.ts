import { startGate } from '../core/StartGate';
import { touchMode } from '../core/TouchMode';

const TAP_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="14" r="8" fill="none" stroke="#fff" stroke-width="3" opacity="0.8"/><circle cx="32" cy="14" r="13" fill="none" stroke="#fff" stroke-width="2" opacity="0.4"/><rect x="26" y="10" width="12" height="32" rx="6" fill="#fff"/><rect x="16" y="34" width="32" height="24" rx="10" fill="#fff"/></svg>';

const ROTATE_ICON =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><g class="rotate-phone"><rect x="22" y="6" width="20" height="36" rx="5" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="35" r="2" fill="#fff"/></g><path d="M10 54 Q32 66 54 54" fill="none" stroke="#ffd23f" stroke-width="4" stroke-linecap="round"/><path d="M54 54 L46 52 M54 54 L53 62" stroke="#ffd23f" stroke-width="4" stroke-linecap="round"/></svg>';

/**
 * DOM HUD overlay: FPS meter, PC start/help card, touch start screen, rotate-phone screen.
 * Mounted in the #ui root. All text is Indonesian. The DOM is only touched when something changes.
 */
export class Hud {
  private readonly fpsEl: HTMLDivElement | null;
  private readonly card: HTMLDivElement;
  private readonly canLock: boolean;
  private readonly list: HTMLUListElement | HTMLDivElement;
  private lastFpsShown = -1;
  private story = false;
  private transformHelp = false;
  private skillLines: string[] = [];
  private dismissed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLElement,
  ) {
    this.canLock = typeof canvas.requestPointerLock === 'function' && 'pointerLockElement' in document;

    const showFps = new URLSearchParams(window.location.search).get('fps') !== '0';
    if (showFps) {
      this.fpsEl = el('div', 'hud-fps', 'FPS --');
      root.appendChild(this.fpsEl);
    } else {
      this.fpsEl = null;
    }

    const card = el('div', 'hud-card');
    card.appendChild(el('div', 'hud-start', 'Klik untuk lanjut'));
    this.list = el('ul', 'hud-controls');
    this.setStoryHelp(false);
    card.appendChild(this.list);
    root.appendChild(card);
    this.card = card;
    this.buildStartScreen();

    if (this.canLock) {
      document.addEventListener('pointerlockchange', this.onLockChange);
    } else {
      // No pointer lock (e.g. some browsers): start after the first click or key press.
      const dismiss = (): void => {
        this.dismissed = true;
        this.syncCard();
        if (!touchMode.active) startGate.start();
      };
      window.addEventListener('mousedown', dismiss, { once: true });
      window.addEventListener('keydown', dismiss, { once: true });
    }

    // Rotate-phone screen: always in the DOM, CSS shows it only for touch UI in portrait.
    const rotate = el('div', 'rotate-overlay');
    const ri = el('div', 'rotate-icon');
    ri.innerHTML = ROTATE_ICON;
    rotate.appendChild(ri);
    rotate.appendChild(el('div', 'rotate-text', 'Putar HP ke samping'));
    root.appendChild(rotate);

    touchMode.onChange(() => this.syncMode());
  }

  /** Key help on the PC card: the test area shows the temporary transform key, story levels the real ones. */
  setStoryHelp(story: boolean): void {
    this.story = story;
    this.renderHelp();
  }

  /** Story levels: show "Q: berubah" once the child may switch Glen <-> Superglen. */
  setTransformHelp(on: boolean): void {
    if (on === this.transformHelp) return;
    this.transformHelp = on;
    this.renderHelp();
  }

  /** Extra key lines for the skills the story has unlocked so far. */
  setSkillHelp(sk: { laser: boolean; shield: boolean; fly: boolean }): void {
    const lines: string[] = [];
    if (sk.fly) lines.push('Tahan Spasi: terbang');
    if (sk.laser) lines.push('J atau klik kiri: laser');
    if (sk.shield) lines.push('K atau klik kanan: perisai');
    if (lines.join() === this.skillLines.join()) return;
    this.skillLines = lines;
    this.renderHelp();
  }

  private renderHelp(): void {
    const lines = this.story
      ? ['W A S D atau panah: jalan', 'Mouse: putar kamera', 'Spasi: lompat', 'E: bicara / ambil']
      : ['W A S D atau panah: jalan', 'Spasi: lompat', 'E: berubah jadi Superglen', 'Mouse: putar kamera'];
    if (this.story && this.transformHelp) lines.push('Q: berubah');
    lines.push(...this.skillLines, 'Esc: lepas kursor');
    this.list.replaceChildren(...lines.map((t) => el('li', '', t)));
  }

  /** Call whenever the game's fps value is refreshed; the DOM is only written when it changed. */
  setFps(fps: number): void {
    if (!this.fpsEl || fps === this.lastFpsShown) return;
    this.lastFpsShown = fps;
    this.fpsEl.textContent = `FPS ${fps}`;
  }

  private syncMode(): void {
    this.syncCard();
  }

  /**
   * Full-screen logo start screen for PC and touch. On PC it ignores pointer events so the first
   * click lands on the canvas (pointer lock needs that gesture); on touch it takes the tap itself.
   */
  private buildStartScreen(): void {
    const o = el('div', 'start-overlay');
    const fallback = el('div', 'start-title', 'Superglen');
    fallback.style.display = 'none';
    const img = document.createElement('img');
    img.className = 'start-logo';
    img.alt = 'Superglen';
    img.draggable = false;
    img.decoding = 'async';
    img.addEventListener('error', () => {
      img.style.display = 'none';
      fallback.style.display = '';
    });
    img.src = `${import.meta.env.BASE_URL}img/logo.webp`;
    const hint = el('div', 'start-hint');
    const icon = el('div', 'start-icon');
    icon.innerHTML = TAP_ICON;
    hint.appendChild(icon);
    hint.appendChild(el('span', 'start-text start-text-touch', 'Ketuk untuk mulai'));
    hint.appendChild(el('span', 'start-text start-text-pc', 'Klik untuk mulai'));
    const bg = el('div', 'start-bg');
    bg.append(el('div', 'start-rays'));
    for (const c of ['c1', 'c2', 'c3', 'c4']) bg.append(el('div', `start-cloud ${c}`));
    for (const c of ['s1', 's2', 's3', 's4', 's5', 's6']) bg.append(el('div', `start-spark ${c}`));
    bg.append(el('div', 'start-hill'), el('div', 'start-hill h2'));
    const stage = el('div', 'start-stage');
    stage.append(img, fallback);
    o.append(bg, stage, hint);
    // pointerup (a real user gesture on iOS) rather than pointerdown: audio/fullscreen need it.
    o.addEventListener('pointerup', () => {
      if (touchMode.active) this.onStartTap();
    });
    this.root.appendChild(o);
    startGate.onStart(() => {
      o.classList.add('leaving');
      window.setTimeout(() => o.remove(), 300);
      this.syncCard();
    });
  }

  private readonly onStartTap = (): void => {
    try {
      const p = document.documentElement.requestFullscreen?.() as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      // iPhone Safari has no fullscreen API; ignore.
    }
    startGate.start();
  };

  private readonly onLockChange = (): void => {
    if (document.pointerLockElement === this.canvas && !touchMode.active) startGate.start();
    this.syncCard();
  };

  private syncCard(): void {
    const locked = this.canLock && document.pointerLockElement === this.canvas;
    this.card.style.display =
      touchMode.active || locked || this.dismissed || !startGate.started ? 'none' : '';
  }
}

function el(tag: string, className: string, text?: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement;
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
