/**
 * Input abstraction. Gameplay code reads ONLY this class, never DOM events.
 *
 * Any number of InputSources (keyboard+mouse now, touch in A2, gamepad later) are merged:
 * - move: sum of all sources, clamped to length 1.
 * - look: sum of all sources' deltas.
 * - buttons: down if down in any source; presses from any source are latched.
 *
 * Timing contract (used by core/Game.ts):
 * 1. `update()` once per rendered frame, before any fixed step.
 * 2. Fixed physics steps run (0..N per frame). Gameplay reads `move`, `isDown`, `wasPressed`.
 * 3. `endFixedStep()` after EACH fixed step clears the `wasPressed` latches.
 * So `wasPressed(a)` is true for exactly one fixed step: the first one after the press.
 * If a frame runs zero fixed steps (high refresh rate), the press stays latched for the next
 * frame, so presses are never lost and never seen twice.
 * `consumeLookDelta()` is per frame (the camera reads it once per rendered frame).
 */

export type Action = 'jump' | 'laser' | 'shield' | 'interact';

export const ACTIONS: readonly Action[] = ['jump', 'laser', 'shield', 'interact'];

export interface Vec2 {
  x: number;
  y: number;
}

export interface InputSource {
  /** Called once per frame by Input.update() before values are read. */
  update(): void;
  /** Movement contribution, each axis -1..1, y = forward. Length should be <= 1. */
  readonly move: Readonly<Vec2>;
  /** Add the look delta (radians: x = yaw, y = pitch) accumulated since the last call to `out`, then reset it. */
  drainLook(out: Vec2): void;
  isDown(action: Action): boolean;
  /** True if `action` was pressed since the last call; clears the source's own latch. */
  drainPressed(action: Action): boolean;
  /** Forget all held state (window blur, tab hidden). */
  reset(): void;
  dispose(): void;
}

export class Input {
  /** Merged movement, -1..1 per axis, length <= 1, y = forward. Read-only for gameplay. */
  readonly move: Vec2 = { x: 0, y: 0 };

  private readonly sources: InputSource[] = [];
  private readonly look: Vec2 = { x: 0, y: 0 };
  private readonly lookOut: Vec2 = { x: 0, y: 0 };
  private readonly down = new Map<Action, boolean>();
  private readonly pressed = new Map<Action, boolean>();

  constructor() {
    for (const a of ACTIONS) {
      this.down.set(a, false);
      this.pressed.set(a, false);
    }
  }

  addSource(source: InputSource): void {
    this.sources.push(source);
  }

  removeSource(source: InputSource): void {
    const i = this.sources.indexOf(source);
    if (i >= 0) this.sources.splice(i, 1);
  }

  /** Poll all sources. Call once per frame before fixed steps. */
  update(): void {
    let mx = 0;
    let my = 0;
    for (const s of this.sources) {
      s.update();
      mx += s.move.x;
      my += s.move.y;
      s.drainLook(this.look);
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.move.x = mx;
    this.move.y = my;

    for (const a of ACTIONS) {
      let isDown = false;
      let wasPressed = false;
      for (const s of this.sources) {
        if (s.isDown(a)) isDown = true;
        if (s.drainPressed(a)) wasPressed = true;
      }
      this.down.set(a, isDown);
      if (wasPressed) this.pressed.set(a, true);
    }
  }

  isDown(action: Action): boolean {
    return this.down.get(action) === true;
  }

  /** Edge: true during the first fixed step after the press. See the timing contract above. */
  wasPressed(action: Action): boolean {
    return this.pressed.get(action) === true;
  }

  /** Clears press edges. Called by the game loop after every fixed step. */
  endFixedStep(): void {
    for (const a of ACTIONS) this.pressed.set(a, false);
  }

  /**
   * Look delta in radians (x = yaw, y = pitch) accumulated since the previous call.
   * Returns a shared object: copy the values, do not keep the reference.
   */
  consumeLookDelta(): Readonly<Vec2> {
    this.lookOut.x = this.look.x;
    this.lookOut.y = this.look.y;
    this.look.x = 0;
    this.look.y = 0;
    return this.lookOut;
  }

  /** Drop all held input (e.g. when the tab is hidden) so nothing keeps moving by itself. */
  reset(): void {
    for (const s of this.sources) s.reset();
    this.move.x = 0;
    this.move.y = 0;
    this.look.x = 0;
    this.look.y = 0;
    for (const a of ACTIONS) {
      this.down.set(a, false);
      this.pressed.set(a, false);
    }
  }

  dispose(): void {
    for (const s of this.sources) s.dispose();
    this.sources.length = 0;
  }
}
