/**
 * Every number of the "darah" system: Glen's hearts, the Curut Cemberut's fight, the laser assist and healing prices.
 * Nothing here hurts for real: a hit is stars and a "boing" and costs one heart; zero hearts only means "kelelahan"
 * (a soft fade and a rest at the Rumah Sakit with full hearts, nothing lost).
 */
export const Combat = {
  /** Chapter 8 part 2: putting out the forest fire with water hoses (nothing hurts; every fire can be put out). */
  firefight: {
    /**
     * Fire spots. Ground fires have no `steps`. A tree fire sits on the top of `steps` round canopy platforms (Parkour.firefightTrees);
     * the lower steps lead away from the fire along `dir` (radians; direction = (sin dir, cos dir)), so the child must jump up them
     * to get into spray range. Every spot lies inside the walkable arena.
     */
    fires: [
      { x: -5, z: 10 }, { x: -13, z: 15 }, { x: -8, z: 18 }, { x: 13, z: 15 }, { x: 8, z: 19 }, { x: 3, z: 18 },
      { x: -20, z: 7, steps: 3, dir: Math.PI / 2 }, { x: -4, z: 26, steps: 3, dir: Math.PI },
      { x: 20, z: 8, steps: 3, dir: -Math.PI / 2 }, { x: 19, z: 25, steps: 4, dir: -Math.PI / 2 },
      { x: -19, z: 24, steps: 3, dir: Math.PI / 2 },
    ] as ReadonlyArray<{ x: number; z: number; steps?: number; dir?: number }>,
    /** Fires the NPCs spray at (indexes into `fires`; ground fires only); the player must put out all others. */
    npcFires: { aara: [1, 2], nino: [3, 4] } as Readonly<Record<'aara' | 'nino', readonly number[]>>,
    /** Low logs in front of some ground fires (x, z, length, rotation y): the child walks around or hops over. */
    logs: [[3, 16, 5, 0], [-5, 8, 4, 0.3], [-13, 13, 3.5, 0.2]] as ReadonlyArray<readonly [number, number, number, number]>,
    /** Seconds of steady spraying that put one fire out (child). */
    seconds: 2.4,
    /** Same for NPC helpers: slower, so the child always has work to do. */
    npcSeconds: 9, npcDelay: 25,
    /** Spray reach (m, 3D) and half-angle of the aim cone around facing / camera forward (degrees). */
    range: 9, coneDeg: 45,
    /** The nozzle sits this high above the feet (m); the target may be at most `maxUp` above the nozzle (tree fires need a canopy step). */
    nozzleHeight: 0.9, maxUp: 2, targetHeight: 0.5,
    /** Any ground fire this close (m) is sprayed even when it is behind (a small child may face the wrong way). */
    closeRange: 4,
    /** A helper's fire is only sprayed by the child when aimed at within this tight half-angle (degrees). */
    helperConeDeg: 12,
    /** A fire grows back this fast (fraction/s) when nobody sprays it, up to its last size. */
    regrow: 0.1,
    /** Falling from a canopy step this high or more puts the child back on it (m). */
    /** Visual: fire size at full strength (m), water particles per stream, stream arc height (m), speed (cycles/s). */
    fireHeight: 2.2, particles: 26, arc: 1.2, flow: 1.5, particleSize: 0.3,
    /** Where the helpers stand (x, z) and where the player starts. */
    aaraAt: [-10, 14] as readonly [number, number], ninoAt: [10, 14] as readonly [number, number],
    spawn: { x: 0, y: 0, z: 2, yaw: 0 },
    arenaHalf: 28,
    /** Seconds the NPCs wait before they begin to help, and the pause before the end dialog. */
    endDelay: 0.8,
  },
  gorilla: {
    stars: 5, starsEasy: 3, height: 2.5, arenaRadius: 14,
    windup: 1.5, leapTime: 1.15, leapArc: 7, recover: 1.3,
    cooldown: 1, retreatTime: 1.1, vulnerable: 3.5, hitRadius: 1.65, hitHeight: 2,
    fastLeapTime: .85, enrageWindScale: .8, impactTime: .55, slamArcScale: .75,
    missesToOpen: 2, targetRadius: 1.6,
    /** Body language (all visual). Crouch/lean in radians or share of height; rates are easing speeds per second. */
    anim: {
      breathe: 0.016, breatheSpeed: 2.2, breatheOpenSpeed: 5, shiftRoll: 0.05, shiftSpeed: 0.9, armSwing: 0.1, armSwingSpeed: 1.8,
      windCrouch: 0.26, windLeanBack: -0.2, windArms: -0.9, leapLean: 0.28, leapStretch: 0.07, followThrough: 0.05,
      yawRate: 7, poseRate: 8, strikeRate: 30,
    },
    /** Ground pound: dust ring (radius = hitRadius, so it matches the danger zone), debris, camera shake. */
    pound: { ringTime: 0.55, innerRing: 0.6, dust: 28, leaves: 22, shake: 0.32, shakeTime: 0.35 },
    /** Hurt flinch and the tired/dizzy wobble after the last star (s). Flash fades over hurtTime. */
    hurtTime: 0.8, hurtRecoil: -0.4, hurtArms: -0.8, tiredTime: 1.5, tiredWobble: 0.12, sweatDrops: 8,
  },
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
  /** Elang Belang: alternating ice and fire feather volleys in the separate night sky arena. */
  eagle: {
    stars: 5,
    starsEasy: 3,
    hitsPerStar: 1,
    hitsPerStarEasy: 1,
    arenaRadius: 17,
    flyHeight: 12,
    hoverY: 7.5,
    hoverZ: -5,
    hoverSweepX: 9,
    hoverSweepZ: 5,
    hoverSweepY: 1.8,
    orbitSpeed: 1.15,
    recoveryMotion: 0.08,
    heightFollow: 2.8,
    heightOffset: 0.4,
    minHoverY: 3,
    alertSeconds: 0.48,
    entryZ: 9,
    cooldown: 1.2,
    cooldownEasy: 2,
    warning: 1.45,
    warningEasy: 1.65,
    recover: 4,
    recoverEasy: 4.2,
    burstShots: [2, 2, 2],
    burstShotsEasy: 2,
    featherCount: 3,
    featherCountEasy: 3,
    featherPool: 30,
    featherSpread: 1.35,
    featherSpeed: 10,
    featherSpeedEasy: 7,
    featherSpeedPerStage: 1.5,
    featherRadius: 0.7,
    featherLife: 4,
    wingOffset: 1.1,
    lockShare: 0.45,
    playerHitRadius: 0.45,
    aimRadius: 1.55,
    assist: { range: 18, near: 10, nearConeDeg: 55, farConeDeg: 28 },
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

/** Harmless advanced-flight practice: more targets and faster balls each round. */
export const FlightTrainingCombat = [
  { targets: 2, blocks: 2, interval: 3.5, speed: 6, targetSpeed: 0, targetRadius: 1.1 },
  { targets: 3, blocks: 3, interval: 2.8, speed: 7, targetSpeed: 1.2, targetRadius: 0.9 },
  { targets: 4, blocks: 4, interval: 2.1, speed: 8, targetSpeed: 2, targetRadius: 0.75 },
] as const;
