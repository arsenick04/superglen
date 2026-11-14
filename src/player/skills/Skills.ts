import { Emitter } from '../../core/Emitter';

/** Why a laser shot went where it went. Reused object: copy values. */
export interface LaserShotInfo {
  /** Beam start (the wrist) and end. */
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  toZ: number;
  /** Id of the auto-aimed target ('' on a miss). */
  targetId: string;
  hit: boolean;
}

/** A blocked or landed projectile. `x/y/z` is the contact point. Reused object: copy values. */
export interface ProjectileEventInfo {
  x: number;
  y: number;
  z: number;
}

/**
 * Events of the three skills (the story and the audio manager subscribe through `player.skills.on(...)`):
 *   laserFire    every shot (hit or miss)
 *   laserHit     a shot that hit a target (the target's own onHit also runs)
 *   laserMiss    a shot with nothing to aim at ("Tenang dulu, baru bidik." in the story)
 *   shieldUp / shieldDown   the dome was raised / lowered
 *   shieldBlock  a projectile bounced off the dome
 *   ballHit      a projectile touched the player (harmless: stars and a tiny hop)
 *   flightStart  the jets ignited (also on every re-ignition after a glide)
 *   flightStop   the jets were cut (released, landed, mode change)
 *   ringPass     the player flew through a FlyRing (sound hook)
 *   targetFlip   a practice target flipped to green after a hit (sound hook)
 */
export interface SkillEventMap {
  laserFire: LaserShotInfo;
  laserHit: LaserShotInfo;
  laserMiss: LaserShotInfo;
  shieldUp: undefined;
  shieldDown: undefined;
  shieldBlock: ProjectileEventInfo;
  ballHit: ProjectileEventInfo;
  flightStart: undefined;
  flightStop: undefined;
  ringPass: undefined;
  targetFlip: undefined;
}

/** The dome as the projectile system sees it. Written by Shield every fixed step. */
export interface ShieldState {
  up: boolean;
  /** Dome centre (world) and facing yaw (0 = +Z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Shell radius (m). */
  radius: number;
}

/**
 * Shared state of Superglen's skills, owned by the Player: unlock flags, events, shield state and the counters
 * the smoke test reads. `player.skills.on('laserHit', fn)` returns an unsubscribe function.
 */
export class SkillHub {
  private readonly events = new Emitter<SkillEventMap>();
  /** Subscribers that live for the whole session (the sound layer): `clearListeners` leaves them alone. */
  private readonly always = new Emitter<SkillEventMap>();
  /** Which skills the story has unlocked (set through `ctx.game.setSkills`). Only active in Superglen mode. */
  readonly unlocked = { laser: false, shield: false, fly: false };
  readonly shield: ShieldState = { up: false, x: 0, y: 0, z: 0, yaw: 0, radius: 1.25 };
  readonly stats = { laserShots: 0, laserHits: 0, laserMisses: 0, shieldBlocks: 0, ballHits: 0, ringsPassed: 0, flights: 0 };

  on<K extends keyof SkillEventMap>(name: K, fn: (payload: SkillEventMap[K]) => void): () => void {
    return this.events.on(name, fn);
  }

  /** Like `on`, but survives level unloads (for systems owned by the Game, not by a level). */
  onAlways<K extends keyof SkillEventMap>(name: K, fn: (payload: SkillEventMap[K]) => void): () => void {
    return this.always.on(name, fn);
  }

  emit<K extends keyof SkillEventMap>(name: K, payload: SkillEventMap[K]): void {
    this.events.emit(name, payload);
    this.always.emit(name, payload);
  }

  /** Drop every subscriber (the level manager calls this when a level unloads). */
  clearListeners(): void {
    this.events.clear();
  }
}
