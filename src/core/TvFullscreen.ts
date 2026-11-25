import { tvMode } from './TvMode';
import { startGate } from './StartGate';

/**
 * TV: hide the browser's toolbar and cursor. Both calls need a user gesture, so they are tried on the first real key press / click
 * (and again on the next ones, a few times at most): requestFullscreen (also the webkit prefix) first; once the game has started
 * and the page is fullscreen, pointer lock on the canvas, which hides the cursor where the browser supports it. Failures are ignored.
 */
type FsDoc = Document & { webkitFullscreenElement?: Element | null };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };

const MAX_TRIES = 4;
let fsTries = 0;
let lockTries = 0;

function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(document.fullscreenElement ?? d.webkitFullscreenElement);
}

function swallow(r: unknown): void {
  if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
}

function onGesture(e: Event): void {
  if (!tvMode.active || !e.isTrusted) return;
  try {
    if (!isFullscreen() && fsTries < MAX_TRIES) {
      fsTries++;
      const el = document.documentElement as FsEl;
      if (typeof el.requestFullscreen === 'function') swallow(el.requestFullscreen());
      else if (typeof el.webkitRequestFullscreen === 'function') swallow(el.webkitRequestFullscreen());
    }
  } catch {
    // not allowed here: ignore
  }
  try {
    const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
    if (startGate.started && canvas && typeof canvas.requestPointerLock === 'function' && document.pointerLockElement !== canvas && lockTries < MAX_TRIES) {
      lockTries++;
      swallow(canvas.requestPointerLock());
    }
  } catch {
    // no pointer lock on this browser: nothing breaks
  }
}

export function installTvFullscreen(): void {
  window.addEventListener('keydown', onGesture, true);
  window.addEventListener('mousedown', onGesture, true);
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('touchstart', onGesture, { capture: true, passive: true });
}
