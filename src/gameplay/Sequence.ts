/**
 * Game-time async helpers for story scripts. Advanced by the game loop (once per fixed step), so they
 * follow the deterministic `pause/advance` stepping, pause when the tab is hidden, and never use
 * setTimeout / requestAnimationFrame.
 *
 *   await seq.wait(1.5);
 *   await seq.waitUntil(() => player.grounded);
 *   await seq.tween(0.6, (t) => (mesh.position.y = 2 * t), easeOutCubic);
 *   seq.run(async () => { await dialog.say('bab1_glen_pulang'); await seq.wait(1); game.loadLevel('test'); });
 *
 * Cancellation: `cancelAll()` (called when the level is disposed) drops every pending wait. Their
 * promises then never settle, so no continuation can run against a disposed level. Do not rely on
 * `finally` blocks after an await in a script.
 */
export type Easing = (t: number) => number;

export const Easings = {
  linear: (t: number): number => t,
  easeInOut: (t: number): number => t * t * (3 - 2 * t),
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  easeOutBack: (t: number): number => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
} as const;

interface Task {
  /** Returns true when finished (and has resolved its promise). */
  step(dt: number): boolean;
}

export class Sequence {
  private tasks: Task[] = [];
  private cancelled = false;
  private stepping = false;

  /** Resolve after `seconds` of game time. */
  wait(seconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.cancelled) return;
      let left = seconds;
      this.tasks.push({
        step: (dt) => {
          left -= dt;
          if (left > 0) return false;
          resolve();
          return true;
        },
      });
    });
  }

  /** Resolve the first fixed step on which `cond()` is true (checked immediately on the next step). */
  waitUntil(cond: () => boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.cancelled) return;
      this.tasks.push({
        step: () => {
          if (!cond()) return false;
          resolve();
          return true;
        },
      });
    });
  }

  /**
   * Call `apply(t)` with t going 0 -> 1 over `duration` seconds (eased), then resolve.
   * `apply(1)` is always called exactly once at the end; `apply(0)` on the first step.
   */
  tween(duration: number, apply: (t: number) => void, easing: Easing = Easings.linear): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.cancelled) return;
      let elapsed = 0;
      this.tasks.push({
        step: (dt) => {
          elapsed += dt;
          const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
          apply(easing(t));
          if (t < 1) return false;
          resolve();
          return true;
        },
      });
    });
  }

  /** Run an async script; errors are logged (never thrown into the game loop). */
  run(script: () => Promise<void>): void {
    if (this.cancelled) return;
    script().catch((err: unknown) => console.error('Sequence script failed:', err));
  }

  get pending(): number {
    return this.tasks.length;
  }

  /** Advance game time. Called by the LevelManager once per fixed step. */
  update(dt: number): void {
    if (this.cancelled || this.tasks.length === 0 || this.stepping) return;
    this.stepping = true;
    const tasks = this.tasks;
    const n = tasks.length; // tasks pushed by callbacks during this pass land after n and run next step
    let w = 0;
    for (let i = 0; i < n; i++) {
      if (this.cancelled) break;
      const t = tasks[i];
      let done = false;
      try {
        done = t.step(dt);
      } catch (err) {
        console.error('Sequence task failed:', err);
        done = true;
      }
      if (!done) tasks[w++] = t;
    }
    this.stepping = false;
    if (this.cancelled) return;
    for (let i = n; i < tasks.length; i++) tasks[w++] = tasks[i];
    tasks.length = w;
  }

  cancelAll(): void {
    this.cancelled = true;
    this.tasks = [];
  }
}
