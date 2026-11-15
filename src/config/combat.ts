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
