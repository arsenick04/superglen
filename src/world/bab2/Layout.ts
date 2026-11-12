/**
 * Coordinates of Chapter 2: Nino's training hall (metres). The player spawns at (0, 0) facing -Z (towards the big wall
 * screen); a short corridor behind the spawn (+Z) ends in the door to the lab.
 */
export const HALL = {
  minX: -18,
  maxX: 18,
  minZ: -46,
  maxZ: 2,
  /** Underside of the real ceiling collider. */
  ceil: 13,
  corridorHalf: 2.2,
  corridorEnd: 12,
  corridorH: 4,
} as const;

/** Floor stations. `r` = radius of the zone where the exercise is "at home". */
export const PADS = {
  fly: { x: 0, z: -9, r: 3.8 },
  laser: { x: -9, z: -30, r: 2.6 },
  shield: { x: 6, z: -27, r: 6 },
  lunch: { x: -12, z: -7 },
} as const;

/** The five rings (centre of each), an easy rising-then-level path along -Z. */
export const RING_PATH: readonly (readonly [number, number, number])[] = [
  [0, 3.6, -9],
  [0, 5.4, -15.5],
  [3, 7.0, -22],
  [0, 7.6, -29],
  [-3, 7.6, -36],
];
export const RING_RADIUS = 2.4;
/** Highest point the jets lift Superglen in normal play (m above the ground); the ceiling is above it. */
export const FLY_MAX = 11;

/**
 * Practice targets: ground position, disc height, optional slow path. 5 to 14 m from the laser spot, on the side the
 * child arrives facing (the rings end at the far wall, the walk to the laser spot heads back towards the spawn).
 */
export const TARGETS: readonly { x: number; z: number; h: number; path?: readonly (readonly [number, number])[] }[] = [
  { x: -9, z: -25, h: 1.3 },
  { x: -14.5, z: -20, h: 2.2 },
  { x: -3, z: -18, h: 1.5 },
  { x: -13, z: -22, h: 1.8, path: [[-13, -22], [-6, -22]] },
  { x: -9, z: -16, h: 3.4 },
];
/** Which targets pop up together ("one or two at a time"). */
export const TARGET_GROUPS: readonly (readonly number[])[] = [[0], [1, 2], [3], [4]];

export const THROWER = { x: 15, z: -27 };

export const SCREEN = { x: 0, y: 7.2, z: -45.7, w: 18, h: 9 };

/** Nino's resting spots. */
export const NINO_SPOT = {
  start: { x: 2.8, z: -4 },
  fly: { x: 4.6, z: -9 },
  laser: { x: -5.2, z: -31.6 },
  shield: { x: 14.6, z: -31 },
} as const;
