/**
 * Back-navigation trap: while the game runs the page never goes back to the previous page (a TV remote / pad Back button, the
 * browser Back gesture, Backspace). A sentinel history entry is pushed at boot; every `popstate` re-pushes it and is treated as
 * the in-game Back (an Escape key: closes a panel or opens the pause menu). Back KEYS are also cancelled (preventDefault).
 * Generic: Android TV (keyCode 4), Tizen (10009), webOS / VIDAA (461 or 8), desktop Backspace / Alt+Left.
 */
export const backState = { lastKeyAt: -1e9, lastPopAt: -1e9 };

const SENTINEL = { superglen: 'back-trap' };
const BACK_CODES = new Set([4, 8, 10, 27, 461, 10009]);
const BACK_KEYS = new Set(['Backspace', 'BrowserBack', 'GoBack', 'XF86Back', 'Escape']);
let installed = false;

function push(): void {
  try {
    window.history.pushState(SENTINEL, '', window.location.href);
  } catch {
    // history unavailable (sandboxed frame): nothing to trap
  }
}

/** `onBack` is the in-game Back action (send Escape). Safe to call once; later calls do nothing. */
export function installBackTrap(onBack: () => void): void {
  if (installed) return;
  installed = true;
  push();
  // Chrome skips history entries pushed without a user gesture: push one more on the first real input.
  const gesture = (): void => {
    window.removeEventListener('keydown', gesture, true);
    window.removeEventListener('pointerdown', gesture, true);
    window.removeEventListener('touchstart', gesture, true);
    push();
  };
  window.addEventListener('keydown', gesture, true);
  window.addEventListener('pointerdown', gesture, true);
  window.addEventListener('touchstart', gesture, true);

  window.addEventListener('popstate', () => {
    const now = performance.now();
    push(); // stay on this page
    // A Back key press that came a moment ago was already handled as a key: do not do it twice.
    if (now - backState.lastKeyAt < 450) {
      backState.lastPopAt = now;
      return;
    }
    backState.lastPopAt = now;
    onBack();
  });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) return;
    if (!BACK_KEYS.has(e.key) && !BACK_CODES.has(e.keyCode)) return;
    const t = e.target as HTMLElement | null;
    if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return; // typing
    e.preventDefault();
    if (e.isTrusted && e.key !== 'Escape') backState.lastKeyAt = performance.now();
  }, true);
}
