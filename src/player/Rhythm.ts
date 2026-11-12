import type RAPIER from '@dimforge/rapier3d-compat';
import { Emitter } from '../core/Emitter';
import { MAX_LEVEL, Parkour } from '../config/parkour';

/** How a rhythm jump was triggered. */
export type RhythmQuality = 'perfect' | 'good' | 'normal' | 'auto';

/** Every payload object is owned by the emitting system and REUSED: copy values, never keep the reference. */
export interface RhythmJumpEvent {
  /** Level the jump was launched with (its apex is Parkour.levels[level].apex). */
  level: number;
  quality: RhythmQuality;
}
export interface RhythmLevelEvent {
  level: number;
  previous: number;
}
export interface RhythmMissEvent {
  /** Level after the drop. */
  level: number;
}
export interface BounceEvent {
  /** Level after the bounce raised it. */
  level: number;
}
export interface LandEvent {
  /** Downward speed at touchdown (m/s). */
  impact: number;
  x: number;
  y: number;
  z: number;
}
export interface MantleEvent {
  x: number;
  y: number;
  z: number;
}

/**
 * Events on `player.events`:
 *   rhythmJump  every Superglen ground jump (quality perfect / good / normal / auto)
 *   rhythmLevel the level changed
 *   rhythmMiss  a late/early press lowered the level by one
 *   bounce      a bounce drum was landed on (always perfect)
 *   land        any touchdown (feet position, impact speed): sound and fx hook here
 *   mantle      the character pulled itself onto a ledge
 */
export interface PlayerEventMap {
  rhythmJump: RhythmJumpEvent;
  rhythmLevel: RhythmLevelEvent;
  rhythmMiss: RhythmMissEvent;
  bounce: BounceEvent;
  land: LandEvent;
  mantle: MantleEvent;
}

/**
 * Rhythm state of Superglen's jump (Lompat Irama Barongsai): the level, the settings and the bounce-drum registry.
 * The timing decisions live in Player (they need the step clock); this class owns the numbers that outlive a jump.
 *
 * BOUNCE DRUM HOOK (for level builders):
 *   player.rhythm.registerBounce(collider)   mark a fixed collider (its top face) as a bounce drum
 *   -> landing on it (Superglen) raises the level by one, counts as a perfect press and, with Parkour.bounce.launch,
 *      throws the player up at once with the new level's jump. Emits `bounce` and `rhythmJump {quality:'perfect'}`.
 *   player.rhythm.bounce()                   the same effect without a collider (scripted / trigger volumes)
 *   player.rhythm.unregisterBounce(collider) / clearBounce()  (the Game clears all of them when a level unloads)
 */
export class Rhythm {
  /** Current level 0..4. Read-only for everybody except Player (use setLevel for tests/story). */
  level = 0;
  /** Test-only: the level can never rise above this (default no cap). Used by the smoke test to prove which jumps need which level. */
  cap = MAX_LEVEL;
  /** Easy mode (holding the jump button bounces by itself). Saved in settings.easyJump, URL ?easy=0|1 overrides. */
  easyMode: boolean = Parkour.easy.defaultOn;
  readonly events = new Emitter<PlayerEventMap>();
  /** Counters for the debug handle and tests. */
  readonly stats = { perfect: 0, good: 0, misses: 0, autos: 0, bounces: 0, normals: 0, raises: 0, lowers: 0 };
  /** Quality of the most recent Superglen ground jump ('' before the first). */
  lastQuality: RhythmQuality | '' = '';
  /** Set by Player: perform a bounce (level up, perfect, optional launch). */
  bounceHook: ((launch: boolean) => void) | null = null;

  private readonly bounceHandles = new Set<number>();
  private readonly levelEvent: RhythmLevelEvent = { level: 0, previous: 0 };
  private readonly missEvent: RhythmMissEvent = { level: 0 };

  /** Listen to player events (same as `events.on`). */
  on<K extends keyof PlayerEventMap>(name: K, fn: (payload: PlayerEventMap[K]) => void): () => void {
    return this.events.on(name, fn);
  }

  registerBounce(collider: RAPIER.Collider): void {
    this.bounceHandles.add(collider.handle);
  }

  unregisterBounce(collider: RAPIER.Collider): void {
    this.bounceHandles.delete(collider.handle);
  }

  clearBounce(): void {
    this.bounceHandles.clear();
  }

  isBounce(handle: number): boolean {
    return this.bounceHandles.size > 0 && this.bounceHandles.has(handle);
  }

  get hasBounceSurfaces(): boolean {
    return this.bounceHandles.size > 0;
  }

  /** Scripted bounce without a collider. `launch` defaults to Parkour.bounce.launch. */
  bounce(launch: boolean = Parkour.bounce.launch): void {
    this.bounceHook?.(launch);
  }

  /** Set the level (clamped); emits `rhythmLevel` when it changed. */
  setLevel(n: number): void {
    const next = Math.max(0, Math.min(MAX_LEVEL, this.cap, Math.round(n)));
    if (next === this.level) return;
    const e = this.levelEvent;
    e.previous = this.level;
    e.level = next;
    this.level = next;
    if (next > e.previous) this.stats.raises++;
    else this.stats.lowers++;
    this.events.emit('rhythmLevel', e);
  }

  raise(): void {
    this.setLevel(this.level + 1);
  }

  /** One level down (never below 0). */
  lower(): void {
    this.setLevel(this.level - 1);
  }

  /** A late/early press: one level down plus the `rhythmMiss` event. */
  miss(): void {
    this.stats.misses++;
    this.lower();
    this.missEvent.level = this.level;
    this.events.emit('rhythmMiss', this.missEvent);
  }

  /** Back to level 0 (mode switch, level load). */
  reset(): void {
    this.setLevel(0);
  }
}
