import type { LevelContext } from '../Level';
import type { Hangar } from './Hangar';
import type { NinoActor } from './NinoActor';
import type { ProgressRow } from './ProgressRow';
import type { HoldHint } from './Hints';
import type { RowKind } from './ProgressRow';

/** Everything the exercises and the story share. */
export interface Env {
  ctx: LevelContext;
  hangar: Hangar;
  nino: NinoActor;
  row: ProgressRow;
  hold: HoldHint;
}

export interface RunOptions {
  /** Guided (story): Nino talks, hints repeat. Free play: quiet. */
  voice: boolean;
}

/** One of the three practice exercises (5 things to do; counts only go up; nothing can fail). */
export interface Exercise {
  readonly kind: RowKind;
  /** True while a round runs. */
  readonly active: boolean;
  /** Counted so far in this round (0..5). */
  readonly count: number;
  /** Start a round; resolves after the fifth. */
  run(opts: RunOptions): Promise<void>;
  /** Fixed-step update (props, timers, fallbacks). */
  tick(dt: number): void;
  /** Where the current goal is (test helper / objective): null when idle. */
  goal(out: { x: number; y: number; z: number }): boolean;
}

export const GOAL = 5;

/** Wait-free rate limiter on a game-time clock: true at most once per `gap` seconds. */
export class Limiter {
  private last = -1e9;
  constructor(private readonly gap: number) {}
  try(now: number): boolean {
    if (now - this.last < this.gap) return false;
    this.last = now;
    return true;
  }
  reset(): void {
    this.last = -1e9;
  }
}
