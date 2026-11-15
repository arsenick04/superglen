import { startGate } from './StartGate';

/** Hidden for longer than this, then the page is checked again when it comes back. */
const STALE_AFTER_MS = 10 * 60 * 1000;

declare global {
  interface Window {
    /** Test hook: counts reload requests instead of reloading (set when window.__SG_TEST is on). */
    __sgReloads?: number;
  }
}

/**
 * Stale-version guard. A tab or a cached index.html from an older build can keep running old code. The build embeds an id
 * (`__BUILD_ID__`) and ships `version.json`; this class fetches it (no-store) at startup and when the page comes back after
 * a long time hidden. A different id means "reload": at once on the start screen, in game only at a safe moment
 * (`applyIfPending`, called at level changes and when the menu opens). Offline or any error: silently nothing.
 */
export class VersionGuard {
  readonly buildId: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
  private pending = false;
  private reloading = false;
  private hiddenAt = 0;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
      } else if (this.hiddenAt && Date.now() - this.hiddenAt > STALE_AFTER_MS) {
        this.hiddenAt = 0;
        void this.check();
      }
    });
  }

  get isPending(): boolean {
    return this.pending;
  }

  /** Fetch version.json and compare. Resolves true when a newer build exists. Never throws. */
  async check(): Promise<boolean> {
    try {
      const base = import.meta.env.BASE_URL ?? './';
      const res = await fetch(`${base}version.json`, { cache: 'no-store' });
      if (!res.ok) return false;
      const data = (await res.json()) as { id?: unknown };
      if (typeof data.id !== 'string' || data.id === this.buildId) return false;
      this.pending = true;
      if (!startGate.started) this.reload();
      return true;
    } catch {
      return false; // offline, blocked or malformed: stay silent
    }
  }

  /** In-game safe moment (level change, menu or pause open): reload if a newer build was found. */
  applyIfPending(): void {
    if (this.pending) this.reload();
  }

  private reload(): void {
    if (this.reloading) return;
    this.reloading = true;
    const note = document.createElement('div');
    note.className = 'version-note';
    note.textContent = 'Memuat versi baru…';
    (document.getElementById('ui') ?? document.body).appendChild(note);
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST) {
      window.__sgReloads = (window.__sgReloads ?? 0) + 1;
      return;
    }
    window.setTimeout(() => location.reload(), 600);
  }
}

export const versionGuard = new VersionGuard();
if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST) (window as unknown as { __sgVersion?: VersionGuard }).__sgVersion = versionGuard;
