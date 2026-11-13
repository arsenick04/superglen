import { FIXED_DT } from '../core/Physics';

/**
 * THE single home of every jump / parkour number (heights, gravity, timing windows, rhythm, mantle, bounce drums,
 * camera and feedback tuning for the jump). Nothing about jumping may be hard-coded anywhere else; the smoke test
 * greps for that. Units: metres, seconds, m/s, m/s^2, Hz.
 *
 * Lompat Irama Barongsai in one paragraph: Superglen has a rhythm level 0..4. A jump press that lands inside a timing
 * window around the touchdown moment raises the level by one; the next jump goes higher. A miss (a press that is too
 * early/late) lowers it by ONE, standing around lowers it by one every 1.5 s. Nothing ever resets to zero.
 */
export const Parkour = {
  // ---- Gravity and falling -------------------------------------------------------------------------------
  /** Gravity while rising (m/s^2). The player applies its own; the physics world's gravity is only for props. */
  gravityUp: 25,
  /** Gravity multiplier while falling (snappier, less floaty descent). */
  fallMultiplier: 1.6,
  /** Terminal fall speed (m/s). */
  maxFallSpeed: 30,

  // ---- Jump heights --------------------------------------------------------------------------------------
  /** Glen (school mode): one small jump, no rhythm, no air jump. Apex above the takeoff point (m). */
  glenApex: 0.9,
  /** Superglen air jump: extra height above the point where it is pressed (m). From any rhythm level. */
  doubleJumpApex: 1.2,
  /**
   * Superglen rhythm levels 0..4: jump apex above the takeoff point (m) and the pentatonic drum note (Hz, G A B D E).
   * Level 4 is "Lompat Singa" and adds the lion cheer.
   */
  levels: [
    { apex: 1.6, hz: 196.0 },
    { apex: 2.1, hz: 220.0 },
    { apex: 2.7, hz: 246.94 },
    { apex: 3.4, hz: 293.66 },
    { apex: 4.2, hz: 329.63 },
  ],

  // ---- Forgiveness -----------------------------------------------------------------------------------------
  /** Can still jump this long after walking off an edge (counts as a plain first jump). */
  coyoteTime: 0.15,
  /** Glen: a jump pressed this long before landing still fires on landing. (Superglen uses windows.good.) */
  glenJumpBuffer: 0.15,
  /** The air jump must wait this long after takeoff (a fast double tap is delayed, not wasted). */
  doubleJumpMinDelay: 0.1,
  /** Falling and closer to the ground than this (m): a press is a buffered ground jump, not the air jump. */
  doubleJumpMinHeight: 0.4,
  /**
   * Near the top of the jump (falling slower than this, m/s) a press is always the air jump; a press while falling
   * faster AND within windows.good of touchdown is the buffered rhythm press for the landing. Without it a level-0
   * jump (whose whole fall is shorter than the window) could never be double-jumped.
   */
  doubleJumpApexGrace: 3,
  /** Duration of the 360 degree forward flip of the air jump (s). */
  spinTime: 0.45,
  /** Cosmetic hop of Player.smallHop() (m/s launch speed, about 0.25 m). */
  smallHopSpeed: 3.4,

  // ---- Landing ---------------------------------------------------------------------------------------------
  /** Landing faster than this (m/s) squashes a little. */
  squashMinImpact: 3,
  /** Superglen: landing faster than this (m/s) is a stomp (about a 0.8 m drop or more). */
  stompMinImpact: 8,
  /** Stomp radius for enemies (m) at level 0; each rhythm level adds this fraction of it. */
  stompRadius: 3,
  stompRadiusPerLevel: 0.12,
  /** Landing faster than this (m/s) plays the soft "boing". */
  boingMinImpact: 10,

  // ---- Rhythm ------------------------------------------------------------------------------------------------
  /**
   * Timing windows around the touchdown instant (s). A press this close BEFORE touchdown is buffered and fires on
   * touchdown; a press this close AFTER touchdown jumps at once. Both raise the level by one.
   */
  windows: { perfect: 0.12, good: 0.3 },
  /** Standing / walking without jumping for this long (s) on the ground lowers the level by one (and again every time). */
  idleDrop: 1.5,
  /**
   * A ground press later than this (s) after the last touchdown is a "first jump after standing": it is a plain
   * jump at the current level, no penalty. Between windows.good and this it counts as a miss (level - 1).
   */
  freshAfter: 1.5,

  /** Easy mode: holding the jump button bounces by itself. */
  easy: {
    /** Default of the saved setting `settings.easyJump`. Override with the URL `?easy=0|1`. */
    defaultOn: true,
    /** Highest level the automatic bounce reaches (level 4 needs a self-timed press). */
    maxLevel: 3,
    /** The level rises by one every this many automatic landings. */
    landingsPerLevel: 2,
    /** Pause on the ground between automatic bounces (s): a steady, readable rhythm. */
    gap: 0.05,
    /**
     * With flight unlocked, holding after a TIMED press keeps bouncing (instead of flying) only from this level up,
     * i.e. once the child is really in a bouncing chain. Below it, holding flies.
     */
    chainMinLevel: 2,
  },

  /** Bounce drums ("tambur pantul"): see Rhythm.registerBounce. */
  bounce: {
    /** The drum throws the player up at once with the new level's jump. */
    launch: true,
    /** Raycast reach below the feet to find what was landed on (m). */
    probe: 0.45,
  },

  // ---- Feedback (visual) ----------------------------------------------------------------------------------------
  fx: {
    /** The landing ring starts this long before touchdown (s). */
    ringLead: 0.35,
    /** Ring radius when it appears and at touchdown (m). */
    ringFar: 1.35,
    ringNear: 0.55,
    /** Ring pulse rate (Hz) inside the good window, and its colours. */
    ringPulseHz: 9,
    colorFar: 0xcfe9ff,
    colorGood: 0xffe27a,
    colorPerfect: 0xffc400,
    /** Golden aura shell: scale and opacity per level (index = level). */
    auraScale: [1, 1.1, 1.16, 1.22, 1.3],
    auraOpacity: [0, 0.16, 0.24, 0.32, 0.44],
    /** Body glow (emissive intensity) per level. */
    glow: [0, 0.12, 0.2, 0.3, 0.42],
    /** Air trail from this level up: sparkles per second per level above it. */
    trailFromLevel: 2,
    trailRate: 26,
    /** Takeoff stretch ("nod") added per level to the base stretch. */
    takeoffStretch: 0.2,
    takeoffStretchPerLevel: 0.045,
    /** Sparkle counts of the bursts. */
    burstGood: 10,
    burstPerfect: 22,
    burstLion: 46,
  },

  // ---- Camera ---------------------------------------------------------------------------------------------------------
  camera: {
    /** Extra distance (m) and pitch (degrees) per level while airborne, so the target stays in view. */
    extraDistance: [0, 0.3, 0.7, 1.1, 1.6],
    extraPitchDeg: [0, 1, 2.5, 4, 6],
    /** How fast it follows the level (1/s): eased. */
    sharpness: 2.2,
  },

  // ---- Auto mantle -----------------------------------------------------------------------------------------------------
  mantle: {
    enabled: true,
    /** Highest ledge top above the TOP OF THE HEAD (m). */
    maxAboveHead: 0.5,
    /** Lowest ledge top above the FEET (m); lower ones are plain steps / landings. */
    minAboveFeet: 0.4,
    /** How far in front of the capsule surface a wall is searched (m). */
    reach: 0.4,
    /** Height of the wall probe above the feet (m). */
    probeHeight: 0.55,
    /** Needs at least this much horizontal speed or stick push toward the wall (m/s). */
    minSpeed: 1.0,
    /** The wall must face the player this much (dot of heading and inverse wall normal). */
    minFacing: 0.5,
    /** A wall surface counts as vertical below this |normal.y|. */
    wallMaxNormalY: 0.35,
    /** A ledge top counts as flat above this normal.y (cos of about 31 degrees): steep roofs are not mantled. */
    minTopNormalY: 0.85,
    /** Too fast a fall cannot grab (m/s downward). */
    maxFallSpeed: 14,
    /** Throttle: look for a ledge on every n-th fixed step while airborne. */
    probeEvery: 2,
    /** Total animation time (s) and the share of it spent rising along the wall. */
    duration: 0.35,
    riseShare: 0.55,
    /** Where the capsule ends up: this far past the edge (m) beyond its radius. */
    inset: 0.14,
    /** Space check shrink and lift (m) so grazing the floor does not count as "no room". */
    roomLift: 0.03,
    roomShrink: 0.02,
    /** After a mantle (s) no new one starts. */
    cooldown: 0.3,
  },

  // ---- World kit: footholds, roofs, bounce drums (src/world/kits, src/world/arena) ---------------------------------------
  world: {
    /** Colliders of usable footholds are wider than what is drawn by this much on every side (m): "almost" still counts. */
    friendly: 0.1,
    /** Width of the bright strip along the top edge of a usable foothold (m). */
    edgeWidth: 0.1,
    /** Walkable (hip) roofs must not be steeper than this (degrees): the character controller climbs 45 and slides above 50. */
    roofMaxSlopeDeg: 40,
    /** Hip roof colliders are cut flat this fraction of the height below the ridge/apex, so the top can be stood on. */
    roofPlateau: 0.08,
    /** Bounce drum ("tambur pantul") of the Arena Lompat: radius and height (m), squash animation time (s) and depth (0..1). */
    drum: { radius: 1.2, height: 1.1, squashTime: 0.4, squashDepth: 0.55 },
    /** A reward star triggers inside this horizontal radius and vertical window of the player's feet (m). */
    rewardRadius: 1.5,
    rewardWindow: 2.4,
  },

  // ---- Reach model (scripts/reachability.ts, `npm run check:reach`) -----------------------------------------------------
  // Only the checker reads these; they never change how the game plays. Everything else the checker needs (apex per level,
  // air jump, mantle, capsule, gravities, friendly edge, run speed) is read from the blocks above and from PlayerConfig.
  reachModel: {
    /** Conservative horizontal reach = ideal reach times (1 - safety). Edges only inside the ideal reach are "tight jump" warnings. */
    safety: 0.15,
    /** Tolerance on height comparisons (m): float noise, not a design margin. */
    eps: 0.005,
    /** Tower self-test: a floor must be out of reach at level N-1 by at least this much and at most this much (m). */
    gateShortMin: 0.15,
    gateShortMax: 0.5,
    /** Layout rules of PAKET_P1_PARKOUR.md section 3 (rule 4: green route between neighbouring roofs). */
    greenMaxGap: 3,
    greenMaxHeightDiff: 1.5,
    /** Building classes (rule 3): wall height range (m) and the allowed range of the minimum rhythm level of the roof route. */
    classes: {
      house: { minWall: 3, maxWall: 4, minLevel: 0, maxLevel: 1 },
      ruko: { minWall: 6, maxWall: 8, minLevel: 2, maxLevel: 3 },
      landmark: { minWall: 10, maxWall: 12, minLevel: 4, maxLevel: 4 },
    },
  },
} as const;

/**
 * Launch speed (m/s) that reaches `apex` metres with the player's discrete integrator
 * (one fixed step of FIXED_DT; the jump step moves with v0 and skips gravity, then v -= g*dt each step).
 *   apex = v0^2 / (2 g) + v0 * dt / 2
 *   => v0 = -g dt / 2 + sqrt((g dt / 2)^2 + 2 g apex)
 */
export function launchSpeed(apex: number, gravity: number = Parkour.gravityUp, dt: number = FIXED_DT): number {
  const h = (gravity * dt) / 2;
  return -h + Math.sqrt(h * h + 2 * gravity * apex);
}

/** Highest rhythm level index. */
export const MAX_LEVEL = Parkour.levels.length - 1;

/** Launch speeds derived from the table above (computed once). */
export const LaunchSpeeds = {
  glen: launchSpeed(Parkour.glenApex),
  double: launchSpeed(Parkour.doubleJumpApex),
  levels: Parkour.levels.map((l) => launchSpeed(l.apex)) as readonly number[],
};

/** Linear interpolation in a per-level table at a fractional level (clamped). */
export function tableAt(t: readonly number[], x: number): number {
  const i = Math.max(0, Math.min(t.length - 1, Math.floor(x)));
  const j = Math.min(t.length - 1, i + 1);
  return t[i] + (t[j] - t[i]) * Math.max(0, Math.min(1, x - i));
}
