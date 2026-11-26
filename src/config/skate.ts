import { Parkour } from './parkour';

/**
 * Skateboard (city, Glen only): every number in ONE place. Lengths in metres, angles in radians, rates per second.
 * Riding numbers feed `Player.ride` (same shape as the bike); the look and the pose feed SkateboardModel / RideLayer.
 */
export const SkateConfig = {
  /** Inventory id that must be owned (Save inventory, see the shop). `?skate=1` grants it for testing. */
  ownId: 'skateboard',
  ride: {
    /** Between walking (5.0) and the bike (8.5). A push-off start, a long glide (low decel). */
    runSpeed: 6.8, accel: 5.5, decel: 4.5, turnSpeed: 2.9,
    hopApex: 0.6,
    uphillLoss: 1.0, downhillGain: 0.7, minSlopeScale: 0.5, maxSlopeScale: 1.3,
    /** Ollie apex (m): a small hop (the number lives in config/parkour.ts). */
    ollie: Parkour.ollieApex,
  },
  /** Marks "riding" for the animation state (must be above 0.01). */
  lift: 0.02,
  /** An ollie press is remembered this long (s) so a press just before landing still hops. */
  ollieBuffer: 0.12,
  /** Hard wall hit: speed before (m/s) and the share that is left after one step; then Glen steps off. */
  bumpSpeed: 4.2,
  bumpKeep: 0.3,
  /** Little hop (m/s) and push-back (m/s) when stepping off after a bump. */
  bumpHop: 3.2,
  bumpBack: 1.6,
  /** Pop in / pop out of the board (s). */
  popTime: 0.25,
  /** A dropped board (after a bump) stays this long (s) before it pops away. */
  dropStay: 1.0,
  /** Wheel rolling sound: tick interval at full speed / at crawl (s). */
  rollFast: 0.085,
  rollSlow: 0.22,
  /** Slower than this (m/s) there is no rolling sound. */
  rollMinSpeed: 0.6,

  model: {
    deckLength: 0.84,
    deckWidth: 0.25,
    deckTop: 0.12,
    wheelRadius: 0.066,
    wheelHalfTrack: 0.115,
    truckZ: 0.25,
    colors: {
      under: 0x2ec4b6,
      edge: 0xffd23f,
      grip: 0x3a3a48,
      stripes: [0xe8453c, 0xffd23f, 0x4dabf7],
      truck: 0xcfd6e4,
      wheel: 0xff9f43,
      hub: 0xffffff,
    },
  },

  /** Rider pose (board frame: +z forward, +x left). */
  pose: {
    /** Hips marker height above the deck top when standing tall / crouched (m). The legs are about this long, so the knees bend. */
    hipsHigh: 0.42,
    hipsLow: 0.34,
    /** Feet on the deck: half distance apart across (x) and along (z) the deck. Left foot is the front one. */
    footX: 0.065,
    footFront: 0.15,
    footBack: -0.17,
    /** Torso lean forward (rad). */
    lean: 0.3,
    /** Hands: out to the sides, height above the hips marker, forward. */
    handX: 0.36,
    handUp: 0.22,
    handForward: 0.04,
    /** Balance: the inner hand drops and the outer one rises with the turn (m at full turn), and the body leans the other way. */
    handTurn: 0.12,
    /** In the air the arms go up a little (m). */
    handAir: 0.1,
    /** Extra crouch (m) in the air (tuck) and right after landing (squash, decays). */
    airTuck: 0.03,
    landSquash: 0.07,
    landEase: 9,
  },
  /** One kick of the back foot. `period` seconds; the foot is on the ground between `groundFrom` and `groundTo` (phase 0..1). */
  push: {
    period: 0.78,
    groundFrom: 0.14,
    groundTo: 0.56,
    liftTo: 0.82,
    /** Foot on the ground: beside the board (x) and the z range it sweeps (front -> back). */
    footSide: 0.19,
    zFrom: 0.0,
    zTo: -0.5,
    /** How high the foot rises when returning (m). */
    liftHeight: 0.1,
    /** Keep kicking while slower than this share of top speed. */
    stopAt: 0.92,
    /** The hips dip (m) and the body leans (rad) while kicking. */
    dip: 0.02,
    leanExtra: 0.1,
  },
  /** Board animation. */
  anim: {
    /** Roll of the board and body into turns: roll = yawRate * speed * gain, capped. Body leans the other way a bit less. */
    leanGain: 0.03,
    leanMax: 0.3,
    leanEase: 7,
    counterLean: 0.35,
    /** Nose pitch in the air from vertical speed (rad per m/s), capped up / down. */
    pitchGain: 0.1,
    pitchUp: 0.35,
    pitchDown: 0.22,
    pitchEase: 14,
    /** Hip sway on the carve. */
    carveSway: 0.02,
    /** How much of the tilt's sideways swing of the hips is cancelled (1 = hips stay exactly above the board centre). */
    hipsOver: 0.9,
  },
} as const;
