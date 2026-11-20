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
    invuln: 1.2,
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
    /** Head contact: crown below the ear tips, as a share of the normalized model height; feet + head allowance (m). */
    headStomp: { heightShare: 0.85, radius: 0.5 },
    /** Hits to tame (stomp and laser each count 1). */
    hp: 5,
    hpEasy: 3,
    /** The rat starts to attack a child closer than this (m). */
    aggroRadius: 13,
    /** Closer than this it charges; farther (up to aggroRadius) it throws crumbs. */
    chargeMaxDist: 6.5,
    /** Telegraph before an attack (s): shaking, puffs and an arrow on the ground. */
    windup: 0.6,
    windupEasy: 1.2,
    /** The direction of a charge is locked after this share of the wind-up (the arrow stops turning). */
    lockShare: 0.45,
    chargeSpeed: 7.5,
    chargeTime: 0.55,
    /** After an attack the rat pants (s) and is easy to hit. */
    recover: 0.9,
    /** Seconds between two attacks of one rat. */
    cooldown: 2.2,
    cooldownEasy: 4.2,
    /** Rats help each other: while one rat attacks, a second one near the child joins after this delay (s) whatever its own cooldown (normal mode only; 2 rats at most, in turn, never at the same moment). */
    assistDelay: 1.2,
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
    globalGap: 0.5,
    /** Sequential Curut encounter: celebrate the tame, then reveal the next rat with a short attack rest (s). */
    nextDelay: 1.2,
    entryCooldown: 1,
    /** Dedicated real-time Curut arena; the camera follows Glen. */
    arena: {
      /** Retreat onto the west road outside the visible Pasar district, so returning cannot immediately reenter. */
      returnSpot: { x: 48, y: 0, z: 0, yaw: Math.PI / 2 },
      radius: 5.2,
      entryZ: 0,
      returnInset: 0.2,
      victoryDelay: 1.5,
      ratRingX: 3,
      ratRingZ: 4,
      ratLoopRadius: 1.1,
      cameraHeight: 8,
      cameraBack: 11.5,
      cameraLookY: 3,
      cameraLookZ: 0.5,
      cameraFov: 72,
    },
  },
  /** Ular Melar (Chapter 5 mini-boss): 5 stars of 2 laser hits each; the head glows when dizzy and only then does the laser count. */
  snake: {
    /** Glen appears inside the isolated field when battle starts (m south of the coil). */
    entryOffset: 10,
    /** Start the battle entrance at the field boundary; leaving farther away pauses the encounter. */
    areaEntryRadius: 34,
    areaExitRadius: 52,
    /** Stars (health). `hitsPerStar` successful laser hits in ONE dizzy window take one (a half-hit is forgotten when the window closes). */
    stars: 5,
    starsEasy: 3,
    hitsPerStar: 2,
    hitsPerStarEasy: 1,
    /** A first hit of a star keeps the window open at least this long (s) so the second one can follow. */
    partialKeep: 1.6,
    /** After this many stars are lost the snake lunges twice in a row (two stripes), the second one after a short wind-up (s). */
    doubleAfter: 2,
    doubleWind: 0.9,
    /** The second stripe locks after this share of its wind-up (earlier than the first: it still leaves 0.6 s to step aside). */
    doubleLockShare: 0.3,
    doubleRetract: 0.28,
    /** After this many stars are lost the lunge is a sweep: the stripe and the body bend (curvature in 1/m, the side alternates). */
    sweepAfter: 4,
    sweepCurve: 0.085,
    /** The snake wakes when a child comes this close to its coil (m). */
    engageRadius: 22,
    /** Size multiplier on the whole snake (the coil is about 3.2 m tall: clearly bigger than Glen). */
    scale: 1,
    /** Seconds the snake waits between two lunges (coiled, looking around). */
    cooldown: 4.2,
    cooldownEasy: 3.6,
    /** Wind-up: coils and wiggles, a red stripe shows the line of the lunge (s). */
    windup: 1.1,
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
    dizzyMiss: 2.2,
    dizzyBlock: 3.2,
    dizzyHit: 1.4,
    dizzyEasyMul: 2.2,
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
  /**
   * Tikus Rakus (Chapter 6 mini-boss): 5 stars of 2 hits each. Pattern, repeated: a food pile glows -> he runs to it and EATS (grows one size step,
   * `maxLevel` at most; the child can pop the glowing pile with the laser or a stomp first) -> belly-bounce slam (a ring on the ground
   * shows where, jump / shield / step out) -> out of breath (dizzy): only now the laser takes a star, and he shrinks one step.
   * Curut Cemberut helpers join between rounds. Everything is silly, nobody is hurt.
   */
  rakus: {
    /** Glen appears inside the isolated warehouse arena after the cinematic (m south of its centre). */
    entryOffset: 9,
    /** Start the battle entrance at the warehouse boundary; leaving farther away pauses the encounter. */
    areaEntryRadius: 32,
    areaExitRadius: 50,
    /** Stars (health); `hitsPerStar` laser hits in ONE out-of-breath window take one. */
    stars: 5,
    starsEasy: 3,
    hitsPerStar: 2,
    hitsPerStarEasy: 1,
    partialKeep: 1.6,
    /** He only shrinks one step every this many stars lost (so he stays big: the big size comes sooner and stays; easy mode: every star). */
    shrinkEvery: 2,
    /** From this size step on the slam comes as a double ring: a second wave `doubleGap` s after the first (normal mode only). */
    doubleFrom: 2,
    doubleGap: 0.55,
    /** Biggest size step (steps 0..maxLevel). At the biggest size he no longer eats: slower, bigger ring. */
    maxLevel: 3,
    /** Height of the body at step 0 (m): Glen is 1.1, so about 1.5 times Glen from the start. */
    baseHeight: 1.7,
    /** Size multiplier per step. */
    sizes: [1, 1.24, 1.48, 1.76],
    /** Walking speed per step (m/s): the bigger the slower. */
    speed: [4.4, 3.9, 3.3, 2.4],
    /** He wakes when a child comes this close to the arena centre (m). */
    engageRadius: 22,
    /** Arena: the food piles lie on this ring around the centre (m); he stays inside `arenaRadius`. */
    pileRadius: 6.6,
    pileCount: 4,
    arenaRadius: 8.6,
    /** A popped or eaten pile comes back after this long (s). */
    pileRespawn: 5,
    /** The pile glows this long before he goes for it (s): the clear cue. */
    cue: 1.2,
    cueEasy: 2.6,
    /** Eating takes this long (s); the pile shrinks meanwhile. */
    eat: 1.4,
    eatEasy: 3,
    /** Growing one step (s). */
    grow: 0.45,
    /** After a popped pile he pouts this long (s) before the tantrum slam. */
    pout: 1.3,
    /** Laser / stomp aim radius of a pile (m). */
    pileAim: 1.0,
    /** Walk toward the child until closer than this share of the ring radius (or `approachMax` s). */
    approachShare: 0.8,
    approachMax: 2.4,
    /** Slam: ring wind-up (s), the hop (s), ring radius per size step (m), the child's feet must be lower than `touchTop` (a jump clears it). */
    wind: 1.0,
    windEasy: 1.5,
    hop: 0.38,
    ring: [3.0, 3.8, 4.8, 6.0],
    ringEasyMul: 0.8,
    touchTop: 0.9,
    /** Out-of-breath time (s): after a slam that missed, was blocked by the shield (the reward), hit Glen (short). Easy mode multiplies. */
    dizzyMiss: 3.0,
    dizzyBlock: 4.2,
    dizzyHit: 1.8,
    dizzyEasyMul: 1.5,
    /** After a star is lost he stays dizzy at most this long (s). */
    afterHit: 1.0,
    /** Short get-up before the next round (s). */
    recover: 1.0,
    /** Rest between two rounds (s), when he is idle and looks around. */
    roundGap: 1.5,
    roundGapEasy: 1.4,
    /** Laser aim at his belly: the body is big, so the assist cone is generous. */
    aimRadius: 1.4,
    assist: { range: 18, near: 10, nearConeDeg: 55, farConeDeg: 22 },
    /** Hint lines: Nino says them at most this often (s). */
    hintGap: 25,
    /** Curut Cemberut helpers (the small rats of Chapter 3, 3 hits each) join after round 1, 3, 5 ... */
    helpers: {
      max: 1,
      perWave: 1,
      /** Walking speed while chasing (m/s). */
      speed: 2.6,
      /** Seconds between any two helper attacks starting. */
      gap: 1.3,
      /** Helpers wind up a little longer and rest longer than the market rats (the boss is already in the picture). */
      windup: 0.8,
      cooldown: 3.2,
      /** Helper attacks never start while the boss slam ring is up; a boss slam waits at most this long for a helper wind-up (s). */
      bossWait: 1.5,
    },
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
