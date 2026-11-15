/**
 * Every number of the "darah" system: Glen's hearts, the Curut Cemberut's fight, the laser assist and healing prices.
 * Nothing here hurts for real: a hit is stars and a "boing" and costs one heart; zero hearts only means "kelelahan"
 * (a soft fade and a rest at the Rumah Sakit with full hearts, nothing lost).
 */
export const Combat = {
  hearts: {
    max: 5,
  },
  /** What a hit does to Glen. */
  hurt: {
    /** Seconds nothing can hurt him after a hit (he blinks). */
    invuln: 1.5,
    /** A small push away from the attacker (m/s for this many seconds). */
    knockSpeed: 6,
    knockTime: 0.25,
    /** Seconds between the last heart going and the soft fade (the stars finish first). */
    exhaustDelay: 0.9,
    /** The shield stops anything coming from within this half-angle of where Superglen faces (degrees). */
    shieldArcDeg: 100,
    /** A short grace period after a shield block so a charge is not blocked twice (s). */
    blockGrace: 0.35,
  },
  /** Curut Cemberut (the small market rats). */
  rat: {
    /** Visual size multiplier of the old 0.6 m rat: about knee-to-waist of Glen. */
    scale: 1.5,
    /** Hits to tame (stomp and laser each count 1). */
    hp: 3,
    hpEasy: 2,
    /** The rat starts to attack a child closer than this (m). */
    aggroRadius: 11,
    /** Closer than this it charges; farther (up to aggroRadius) it throws crumbs. */
    chargeMaxDist: 6.5,
    /** Telegraph before an attack (s): shaking, puffs and an arrow on the ground. */
    windup: 0.8,
    windupEasy: 1.2,
    /** The direction of a charge is locked after this share of the wind-up (the arrow stops turning). */
    lockShare: 0.45,
    chargeSpeed: 7,
    chargeTime: 0.55,
    /** After an attack the rat pants (s) and is easy to hit. */
    recover: 1.1,
    /** Seconds between two attacks of one rat. */
    cooldown: 2.6,
    cooldownEasy: 4.2,
    /** Charge touches a child within this horizontal distance (m) and only while his feet are lower than `touchTop` (a jump dodges). */
    touchRadius: 1.0,
    touchTop: 0.75,
    /** Crumbs: slow and visible. */
    crumbSpeed: 3.4,
    crumbRadius: 0.3,
    crumbLife: 4,
    crumbColor: 0xe0b878,
    /** After a hit that does not tame it the rat is dizzy this long (s). */
    stun: 0.7,
    /** Minimum time between two attacks starting anywhere in the market (s): never a swarm at once. */
    globalGap: 0.9,
  },
  /** Ular Melar (Chapter 5 mini-boss): 3 stars; the head glows when dizzy and only then does the laser count. */
  snake: {
    /** Stars (health). One successful laser hit in a dizzy window takes one. */
    stars: 3,
    /** The snake wakes when a child comes this close to its coil (m). */
    engageRadius: 22,
    /** Size multiplier on the whole snake (the coil is about 3.2 m tall: clearly bigger than Glen). */
    scale: 1,
    /** Seconds the snake waits between two lunges (coiled, looking around). */
    cooldown: 2.2,
    cooldownEasy: 3.6,
    /** Wind-up: coils and wiggles, a red stripe shows the line of the lunge (s). */
    windup: 1.15,
    windupEasy: 1.8,
    /** The stripe's direction is locked after this share of the wind-up (walk or jump aside after that). */
    lockShare: 0.4,
    /** The lunge: the head shoots out this far (m) in `lungeTime` s. */
    reach: 9,
    lungeTime: 0.32,
    /** Body hits a child closer than `hitRadius` (m) to the stretched body; his feet must be lower than `touchTop` (a jump clears it). */
    hitRadius: 1.15,
    touchTop: 1.05,
    /** Width of the red stripe on the ground (m). */
    stripeWidth: 2.2,
    /** Dizzy time (s) after: a missed lunge, a shield block (longer: the reward), a hit on Glen (short). Head glows meanwhile. */
    dizzyMiss: 3.4,
    dizzyBlock: 4.4,
    dizzyHit: 1.8,
    dizzyEasyMul: 1.5,
    /** After a star is lost the snake stays dizzy this long at most (s), then pulls back. */
    afterHit: 1.0,
    /** Seconds to pull the stretched body back to the coil. */
    retract: 0.8,
    /** Laser aim: the head is big, so the assist cone is generous. */
    aimRadius: 1.2,
    assist: { range: 18, near: 10, nearConeDeg: 55, farConeDeg: 22 },
    /** Hint lines: Nino says them at most this often (s). */
    hintGap: 25,
  },
  /** Laser assist: a small cone, generous up close, narrow far away. */
  laser: {
    assistRange: 16,
    nearDist: 5,
    nearConeDeg: 50,
    farConeDeg: 8,
    /** A rat farther than `dodgeMinDist` may hop aside from a shot with this chance. */
    dodgeChance: 0.4,
    dodgeMinDist: 7,
    dodgeHop: 2.2,
  },
  /** Healing with coins (L5). */
  heal: {
    stallCost: 5,
    stallHearts: 1,
    hospitalCost: 15,
  },
} as const;

/** Random source of the fight (tests replace it for determinism). */
export const CombatRng = { next: (): number => Math.random() };
