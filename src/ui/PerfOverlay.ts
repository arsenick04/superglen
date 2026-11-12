import { perfTakeMarks, PerfMark } from '../core/PerfMarks';

/** Numbers the game hands to the panel (filled in place, 4 times per second). */
export interface PerfStats {
  pixelRatio: number;
  ratioChanges: number;
  calls: number;
  triangles: number;
  programs: number;
}

const W = 240;
const H = 48;
const REFRESH_MS = 250;
const WINDOW_MS = 10000;
const HITCH_RING = 64;
const GRAPH_MAX_MS = 50;

/**
 * Diagnostics panel for a real phone (`?perf=1`). Only built when that flag is present.
 *
 *  - frame-time bars of the last 240 frames (red = slower than 1.5x the median)
 *  - median / 99th percentile frame ms, hitches (> 2x median) in the last 10 s
 *  - fixed steps per frame histogram, pixel ratio and how often it changed, draw calls, triangles
 *  - JS ms per frame (time spent in our frame function)
 *  - the largest hitch of the last 10 s and what happened in that frame
 *
 * Tap the panel to freeze it (screenshot), tap again to continue. Nothing is allocated per frame; the text
 * and the graph are redrawn 4 times per second.
 */
export class PerfOverlay {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly text: HTMLDivElement;

  private readonly frameMs = new Float32Array(W);
  private readonly jsMs = new Float32Array(W);
  private readonly steps = new Uint8Array(W);
  private readonly sorted = new Float32Array(W);
  private head = 0;
  private filled = 0;
  private lastNow = -1;
  private prevJs = 0;
  private prevEv = 0;
  private lastDraw = 0;
  private median = 16.7;
  private frozen = false;

  private readonly hitchAt = new Float64Array(HITCH_RING);
  private hitchHead = 0;
  private worstMs = 0;
  private worstAt = -1e9;
  private worstWhy = '';

  constructor(
    root: HTMLElement,
    private readonly getStats: (out: PerfStats) => void,
  ) {
    const el = document.createElement('div');
    el.className = 'perf-panel';
    const s = el.style;
    s.position = 'fixed';
    s.top = 'calc(env(safe-area-inset-top) + 2px)';
    s.left = '50%';
    s.transform = 'translateX(-50%)';
    s.zIndex = '60';
    s.padding = '3px 4px';
    s.background = 'rgba(0,0,0,0.55)';
    s.color = '#fff';
    s.font = '9px/1.25 ui-monospace, Menlo, monospace';
    s.borderRadius = '4px';
    s.pointerEvents = 'auto';
    s.whiteSpace = 'pre';
    s.userSelect = 'none';
    (s as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = 'none';
    s.touchAction = 'none';
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.display = 'block';
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.g = this.canvas.getContext('2d');
    this.text = document.createElement('div');
    this.text.textContent = 'perf ...';
    el.append(this.canvas, this.text);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.frozen = !this.frozen;
      this.element.style.outline = this.frozen ? '2px solid #ffd23f' : 'none';
    });
    this.hitchAt.fill(-1e9);
    root.appendChild(el);
    this.element = el;
  }

  /** Test helper. */
  get isFrozen(): boolean {
    return this.frozen;
  }

  /**
   * Once per rendered frame. `now` = rAF timestamp (ms), `js` = ms spent in our frame function,
   * `steps` = fixed steps run in that frame.
   */
  frame(now: number, js: number, steps: number): void {
    const ev = perfTakeMarks();
    if (this.frozen) {
      this.lastNow = now;
      return;
    }
    if (this.lastNow >= 0) {
      const ms = now - this.lastNow;
      const i = this.head;
      this.frameMs[i] = ms;
      this.jsMs[i] = js;
      this.steps[i] = steps > 255 ? 255 : steps;
      this.head = (i + 1) % W;
      if (this.filled < W) this.filled++;
      if (this.filled >= 30 && ms > this.median * 2 && ms < 2000) {
        this.hitchAt[this.hitchHead] = now;
        this.hitchHead = (this.hitchHead + 1) % HITCH_RING;
        if (ms >= this.worstMs || now - this.worstAt > WINDOW_MS) {
          this.worstMs = ms;
          this.worstAt = now;
          this.worstWhy = this.explain(ev | this.prevEv, ms, this.prevJs);
        }
      }
    }
    this.prevEv = ev;
    this.prevJs = js;
    this.lastNow = now;
    if (now - this.lastDraw >= REFRESH_MS) {
      this.lastDraw = now;
      this.redraw(now);
    }
  }

  dispose(): void {
    this.element.remove();
  }

  private explain(ev: number, ms: number, jsPrev: number): string {
    if (ev & PerfMark.RATIO) return 'ratio change';
    if (ev & PerfMark.RESIZE) return 'resize event';
    if (ev & PerfMark.LOAD) return 'level load';
    if (ev & PerfMark.DIALOG) return 'dialog open';
    if (jsPrev > ms * 0.5) return 'JS busy';
    return 'GC/GPU? (JS small)';
  }

  private redraw(now: number): void {
    const n = this.filled;
    if (n < 2) return;
    // Sorted copy for median / p99 (typed array sort: no allocation worth mentioning at 4 Hz).
    const s = this.sorted;
    for (let i = 0; i < n; i++) s[i] = this.frameMs[(this.head - n + i + W) % W];
    const view = s.subarray(0, n);
    view.sort();
    this.median = view[n >> 1];
    const p99 = view[Math.min(n - 1, Math.floor(n * 0.99))];

    let hist0 = 0;
    let hist1 = 0;
    let hist2 = 0;
    let hist3 = 0;
    let jsSum = 0;
    for (let i = 0; i < n; i++) {
      const k = (this.head - n + i + W) % W;
      const st = this.steps[k];
      if (st === 0) hist0++;
      else if (st === 1) hist1++;
      else if (st === 2) hist2++;
      else hist3++;
      jsSum += this.jsMs[k];
    }
    let hitches = 0;
    for (let i = 0; i < HITCH_RING; i++) if (now - this.hitchAt[i] <= WINDOW_MS) hitches++;
    if (now - this.worstAt > WINDOW_MS) {
      this.worstMs = 0;
      this.worstWhy = '';
    }

    const g = this.g;
    if (g) {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(0, 0, W, H);
      const lim = this.median * 1.5;
      const k = H / GRAPH_MAX_MS;
      for (let i = 0; i < n; i++) {
        const ms = this.frameMs[(this.head - n + i + W) % W];
        const h = Math.min(H, Math.max(1, ms * k));
        g.fillStyle = ms > lim ? '#ff5a4d' : '#59d98e';
        g.fillRect(W - n + i, H - h, 1, h);
      }
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(0, H - 16.7 * k, W, 1); // 60 fps line
    }

    const st: PerfStats = this.stats;
    this.getStats(st);
    this.text.textContent =
      `med ${this.median.toFixed(1)} p99 ${p99.toFixed(1)} ms  hitch/10s ${hitches}\n` +
      `steps 0:${hist0} 1:${hist1} 2:${hist2} 3+:${hist3}  js ${(jsSum / n).toFixed(1)}ms\n` +
      `ratio ${st.pixelRatio.toFixed(2)} chg ${st.ratioChanges}  calls ${st.calls} tri ${st.triangles}\n` +
      `worst ${this.worstMs > 0 ? `${this.worstMs.toFixed(0)}ms ${this.worstWhy}` : '-'}${this.frozen ? '  [FREEZE]' : ''}`;
  }

  private readonly stats: PerfStats = { pixelRatio: 1, ratioChanges: 0, calls: 0, triangles: 0, programs: 0 };
}
