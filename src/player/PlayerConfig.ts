export type PlayerMode = 'glen' | 'superglen';

/** Per-mode movement tuning. Everything about jumping lives in config/parkour.ts. */
export interface ModeTuning {
  /** Top ground speed (m/s). */
  runSpeed: number;
  /** Superglen: landing stomp, rhythm jumps and the air jump are enabled. */
  superglen: boolean;
  /** Body colour and darker face-marker colour. */
  color: number;
  faceColor: number;
}

export const ModeTunings: Readonly<Record<PlayerMode, ModeTuning>> = {
  glen: { runSpeed: 5.0, superglen: false, color: 0xff8a1f, faceColor: 0x9a4a0a },
  superglen: { runSpeed: 6.0, superglen: true, color: 0xe02b20, faceColor: 0x6e140f },
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
  // (jump heights, gravity, coyote time, rhythm and mantle numbers live in config/parkour.ts)
  /**
   * Downward speed kept while grounded. MUST stay 0: any value > 0 makes Rapier's character controller return a
   * zero horizontal move now and then (a one-step stall every second or so) and, with snapping, bounce the capsule
   * by mm. Contact is kept by the controller's own ground detection and the conditional snap in Player.
   */
  groundStickSpeed: 0,

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
