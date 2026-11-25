import { tvMode } from './TvMode';

/**
 * TV frame-rate cap. Physics always runs at the fixed 60 Hz (Game's accumulator); on a TV that cannot hold 40 fps the render
 * loop renders every second animation frame (the accumulator then runs two steps). 'auto' turns the cap on after two slow
 * 3 s windows in a row; `?tvfps=30|60|auto` or the saved value (localStorage superglen.tvfps.v1) forces a choice.
 */
const KEY = 'superglen.tvfps.v1';
type Pref = 'auto' | '30' | '60';

function readPref(): Pref {
  try {
    const u = new URLSearchParams(window.location.search).get('tvfps');
    if (u === '30' || u === '60' || u === 'auto') return u;
    const v = window.localStorage.getItem(KEY);
    if (v === '30' || v === '60' || v === 'auto') return v;
  } catch {
    // ignore
  }
  return 'auto';
}

class TvPerf {
  readonly pref: Pref = readPref();
  capped = this.pref === '30';
  private parity = 0;
  private winStart = -1;
  private frames = 0;
  private slow = 0;

  /** Call once per animation frame; true = skip this frame's update and render. */
  shouldSkip(now: number): boolean {
    if (!tvMode.active || this.pref === '60') return false;
    if (this.capped) {
      this.parity ^= 1;
      return this.parity === 1;
    }
    if (document.hidden) {
      this.winStart = -1;
      return false;
    }
    if (this.winStart < 0) {
      this.winStart = now;
      this.frames = 0;
    }
    this.frames++;
    const span = now - this.winStart;
    if (span >= 3000) {
      const fps = (this.frames * 1000) / span;
      this.slow = fps < 40 && this.frames > 20 ? this.slow + 1 : 0;
      if (this.slow >= 2) this.capped = true;
      this.winStart = now;
      this.frames = 0;
    }
    return false;
  }
}

export const tvPerf = new TvPerf();
