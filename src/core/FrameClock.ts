/**
 * Turns noisy requestAnimationFrame timestamps into a steady frame delta.
 *
 * Why: a display refreshes at a fixed rate, but the timestamps the browser hands to rAF carry jitter
 * (rounding, 59.94 Hz panels, a late callback followed by an early one). Fed straight into the fixed-step
 * accumulator and the camera damping, that jitter makes the player/camera move by slightly different amounts
 * on consecutive frames, which reads as a faint judder even at 60 fps.
 *
 * How: keep a short ring of recent deltas, take their median as the display refresh interval R, and when a
 * delta is within +-35% of a whole multiple k*R (k = 1, 2, 3) use k*R. The difference between the real and the
 * snapped delta is carried in `err` and handed back slowly (10% per frame), so the sum of the deltas still
 * equals real time: game speed never drifts. Real hitches (not near a multiple of R) and long pauses pass
 * through untouched. No allocations.
 */
const RING = 32;
/** Deltas outside this range (s) are not refresh intervals (hitches, tab switches) and are not sampled. */
const MIN_SAMPLE = 0.004;
const MAX_SAMPLE = 0.05;
const SNAP_TOLERANCE = 0.35;
const SNAP_MULTIPLES = 3;
const ERR_RETURN = 0.1;

export class FrameClock {
  /** Master switch (tests compare smoothing on and off). */
  enabled = true;
  /** Measured refresh interval (s); 0 until enough samples were seen. */
  refresh = 0;

  private last = -1;
  private err = 0;
  private count = 0;
  private head = 0;
  private readonly ring = new Float64Array(RING);
  private readonly sorted = new Float64Array(RING);

  /** Forget everything (loop restart, tests). */
  reset(): void {
    this.last = -1;
    this.err = 0;
    this.count = 0;
    this.head = 0;
    this.refresh = 0;
  }

  /** Call with the rAF timestamp (ms). Returns the smoothed delta in seconds (0 on the first call). */
  tick(nowMs: number): number {
    if (this.last < 0) {
      this.last = nowMs;
      return 0;
    }
    const raw = Math.max(0, (nowMs - this.last) / 1000);
    this.last = nowMs;
    if (!this.enabled) return raw;

    if (raw >= MIN_SAMPLE && raw <= MAX_SAMPLE) {
      this.ring[this.head] = raw;
      this.head = (this.head + 1) % RING;
      if (this.count < RING) this.count++;
      this.refresh = this.median();
    } else if (raw > 0.1) {
      // Long pause: whatever error we carried is meaningless now.
      this.err = 0;
    }
    const r = this.refresh;
    if (this.count < 8 || r <= 0) return raw;

    const k = Math.round(raw / r);
    if (k >= 1 && k <= SNAP_MULTIPLES && Math.abs(raw - k * r) <= SNAP_TOLERANCE * r) {
      const snapped = k * r;
      this.err += raw - snapped;
      const back = this.err * ERR_RETURN;
      this.err -= back;
      return snapped + back;
    }
    return raw;
  }

  private median(): number {
    const n = this.count;
    const s = this.sorted;
    for (let i = 0; i < n; i++) {
      // Insertion sort into `sorted` (n <= 32, no allocation).
      const v = this.ring[i];
      let j = i - 1;
      while (j >= 0 && s[j] > v) {
        s[j + 1] = s[j];
        j--;
      }
      s[j + 1] = v;
    }
    return s[n >> 1];
  }
}
