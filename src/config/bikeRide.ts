/**
 * Bike look and riding animation (visual only; the speed, turning and braking numbers stay in `BikeConfig` in world/kota/Bike.ts).
 * Angles in radians, lengths in metres, rates per second.
 */
export const BikeRideConfig = {
  url: 'env/bike/bike.glb',
  wheelRadius: 0.228,
  /** Crank turns per wheel turn (a kid's low gear) and the fastest the legs may spin (rad/s). */
  crankRatio: 0.55,
  crankMaxRate: 11,
  /** Crank angle when stopped (pedal_r forward, pedal_l back: the left foot goes down) and how fast it settles. */
  idleCrank: Math.PI,
  crankEase: 7,
  /** Below this speed (m/s) the rider is "stopped": one foot down, the crank settles. */
  idleSpeed: 0.35,
  /** Handlebar: the full steer angle at a full turn (yaw rate / `turnRef`), and the smoothing rate. */
  maxSteer: 0.55,
  turnRef: 2.8,
  steerEase: 9,
  /** Lean into turns: roll = -yawRate * speed * leanGain, capped; the stopped bike leans a little onto the foot that is down. */
  leanGain: 0.028,
  leanMax: 0.2,
  leanEase: 6,
  idleLean: 0.05,
  /** The rider's body leans less than the bike (fraction of the bike roll, opposite sign). */
  riderCounterLean: 0.3,
  /** The torso turns toward the handlebar (fraction of the steer angle). */
  torsoTwist: 0.7,
  /** Standing on the pedals: when speeding up (m/s^2 above `standAccel`, full at `standAccel + standRange`) or climbing (m/s). */
  standAccel: 1.6,
  standRange: 2.5,
  standClimb: 0.6,
  standHeight: 0.045,
  standLean: 0.2,
  standEase: 5,
  /** Hip bob and sway with the pedal stroke. */
  bob: 0.006,
  sway: 0.007,
  /** Rider. */
  rider: {
    /** Hips bone above the seat marker (m). */
    hipsAboveSeat: 0.02,
    /** Torso lean forward (total, spread over three spine bones) and the head's counter-rotation (fraction of it). */
    lean: 0.62,
    headBack: 0.85,
    /** Ankle above the pedal / the ground (m, before the model scale is applied: measured from the rig). */
    ankleLift: 0.0,
    /** Foot toes down (+) / up (-). */
    toePitch: 0.0,
    /** Knee and elbow pole directions (bike frame). */
    kneeOut: 0.22,
    elbowOut: 0.8,
    elbowDown: 0.6,
    elbowBack: 0.25,
    /** The wrist sits this far behind the grip centre (m). */
    gripBack: 0.05,
    /** Foot down: how far to the side of the bike and forward of the bottom bracket (m). */
    footSide: 0.17,
    footForward: 0.03,
    footDownEase: 7,
    /** Stopped: the rider slides off the saddle a little (down / forward, m) so the foot reaches the ground. */
    footDownDrop: 0.1,
    footDownForward: 0.04,
    /** Weight of the ride pose after getting on (1/s). */
    blend: 7,
  },
} as const;
