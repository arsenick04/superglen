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
  /** Top running speed on the ground (m/s). */
  walkSpeed: 5.0,
  /** Speed gained per second while the stick/keys are held (reaches full speed in ~0.13 s). */
  acceleration: 38,
  /** Speed lost per second when input is released (stops in ~0.1 s, no "ice skating"). */
  deceleration: 50,
  /** Multiplier on acceleration/deceleration while airborne (A3 jump uses this). */
  airControl: 0.6,
  /** Max yaw turn rate of the body toward the movement direction (rad/s). ~2 turns per second. */
  turnSpeed: 12,
  /** Input below this length is treated as zero (joystick dead zone handled again in A2). */
  inputDeadZone: 0.08,

  // --- Vertical ----------------------------------------------------------
  /** Gravity applied by the player itself (m/s^2, positive number = downward). */
  gravity: 25,
  /** Terminal fall speed (m/s). */
  maxFallSpeed: 30,
  /** Small downward speed kept while grounded so the controller keeps ground contact. */
  groundStickSpeed: 1.0,

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
