import { FIXED_DT } from '../core/Physics';

export type PlayerMode = 'glen' | 'superglen';

/**
 * Launch speed (m/s) that reaches `apex` metres with the player's discrete integrator
 * (one fixed step of FIXED_DT; jump step moves with v0 and skips gravity, then v -= g*dt each step).
 *   apex = v0^2 / (2 g) + v0 * dt / 2     (rise sum of v_k*dt, v_k = v0 - k g dt)
 *   => v0 = -g dt / 2 + sqrt((g dt / 2)^2 + 2 g apex)
 * Measured peaks in the smoke test match the requested apex within a few cm.
 */
export function launchSpeed(apex: number, gravity: number, dt: number = FIXED_DT): number {
  const h = (gravity * dt) / 2;
  return -h + Math.sqrt(h * h + 2 * gravity * apex);
}

/** Per-mode movement and jump tuning. */
export interface ModeTuning {
  /** Top ground speed (m/s). */
  runSpeed: number;
  /** Gravity while rising (m/s^2). */
  gravityUp: number;
  /** Gravity multiplier while falling (snappier, less floaty descent). */
  fallMultiplier: number;
  /** First jump height above the takeoff point (m). */
  jumpApex: number;
  /** Extra height added by the air jump, measured from where it is pressed (m). 0 = no double jump. */
  doubleJumpApex: number;
  /** Landing stomp (rings, event) enabled. */
  stomp: boolean;
  /** Derived launch speeds (m/s). */
  jumpSpeed: number;
  doubleJumpSpeed: number;
  /** Body colour and darker face-marker colour. */
  color: number;
  faceColor: number;
}

function tuning(t: Omit<ModeTuning, 'jumpSpeed' | 'doubleJumpSpeed'>): ModeTuning {
  return {
    ...t,
    jumpSpeed: launchSpeed(t.jumpApex, t.gravityUp),
    doubleJumpSpeed: t.doubleJumpApex > 0 ? launchSpeed(t.doubleJumpApex, t.gravityUp) : 0,
  };
}

export const ModeTunings: Readonly<Record<PlayerMode, ModeTuning>> = {
  glen: tuning({
    runSpeed: 5.0,
    gravityUp: 25,
    fallMultiplier: 1.6,
    jumpApex: 0.9,
    doubleJumpApex: 0,
    stomp: false,
    color: 0xff8a1f,
    faceColor: 0x9a4a0a,
  }),
  superglen: tuning({
    runSpeed: 6.0,
    gravityUp: 25,
    fallMultiplier: 1.6,
    jumpApex: 2.4,
    doubleJumpApex: 2.0,
    stomp: true,
    color: 0xe02b20,
    faceColor: 0x6e140f,
  }),
};

/**
 * All player tuning numbers in one place. Units: metres, seconds, radians.
 * Glen is a chubby chibi kid: ~1.1 m tall. Values favour responsive, forgiving control
 * for a 5-year-old: quick (not instant) starts, quick stops, no sliding on normal slopes.
 */
export const PlayerConfig = {
  // --- Shape -------------------------------------------------------------
  /** Capsule radius. */
  radius: 0.32,
  /** Total capsule height including both hemispheres. */
  height: 1.1,

  // --- Ground movement ---------------------------------------------------
  /** Joystick/analog: deflection (after dead zone) at which full run speed is reached. */
  analogFullAt: 0.7,
  /** Joystick/analog: speed fraction right after the dead zone (slow walk with a tiny push). */
  analogMinSpeed: 0.25,
  /** Speed gained per second while the stick/keys are held (reaches full speed in ~0.13 s). */
  acceleration: 38,
  /** Speed lost per second when input is released (stops in ~0.1 s, no "ice skating"). */
  deceleration: 50,
  /** Multiplier on acceleration/deceleration while airborne. Generous so a child can steer onto a pole. */
  airControl: 0.75,
  /** Max yaw turn rate of the body toward the movement direction (rad/s). ~2 turns per second. */
  turnSpeed: 12,
  /** Input below this length is treated as zero (joystick dead zone handled again in A2). */
  inputDeadZone: 0.08,

  // --- Vertical ----------------------------------------------------------
  // (gravity lives in ModeTunings: the player applies its own, the world's gravity is for props)
  /** Terminal fall speed (m/s). */
  maxFallSpeed: 30,
  /**
   * Downward speed kept while grounded. MUST stay 0: any value > 0 makes Rapier's character controller return a
   * zero horizontal move now and then (a one-step stall every second or so) and, with snapping, bounce the capsule
   * by mm. Contact is kept by the controller's own ground detection and the conditional snap in Player.
   */
  groundStickSpeed: 0,

  // --- Jump forgiveness ---------------------------------------------------
  /** Can still jump this long after walking off an edge (counts as the first jump). */
  coyoteTime: 0.15,
  /** A jump pressed this long before landing still fires on landing. */
  jumpBuffer: 0.15,
  /** Air jump must wait this long after takeoff (a fast double tap is delayed, not wasted). */
  doubleJumpMinDelay: 0.1,
  /**
   * Falling and closer to the ground than max(this, fall speed x jumpBuffer), i.e. within the buffer time
   * of landing: a press is a buffered ground jump, not the air jump.
   */
  doubleJumpMinHeight: 0.4,
  /** Duration of the 360 degree forward flip of the air jump (s). */
  spinTime: 0.45,
  /** Landing faster than this (m/s) squashes a little. */
  squashMinImpact: 3,
  /** Superglen: landing faster than this (m/s) is a stomp (about a 0.8 m drop or more). */
  stompMinImpact: 8,
  /** Stomp radius for enemies (m). */
  stompRadius: 3,

  // --- Character controller (Rapier KinematicCharacterController) --------
  /** Skin gap between the capsule and the world (m). */
  skinOffset: 0.02,
  /** Steepest slope the player can walk up (rad). 45 degrees. */
  maxSlopeClimb: (45 * Math.PI) / 180,
  /** Slopes steeper than this make the player slide down (rad). 50 degrees. */
  minSlopeSlide: (50 * Math.PI) / 180,
  /** Ledges up to this height are stepped onto automatically (m). */
  stepHeight: 0.3,
  /** Minimum free width on top of a step for autostep (m). */
  stepMinWidth: 0.15,
  /** Keeps the player glued to the ground going down small steps / slopes (m). */
  snapToGround: 0.3,

  // --- Safety --------------------------------------------------------------
  /** Falling below this Y teleports the player back to the last safe spot (no game over). */
  respawnY: -15,
  /** How long the player must be grounded before a spot counts as "safe" (s). */
  safeGroundTime: 0.3,
  /** Spawn point (feet position). */
  spawn: { x: 0, y: 0, z: 0 },
} as const;

export type PlayerConfigType = typeof PlayerConfig;
