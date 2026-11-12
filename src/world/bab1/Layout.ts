/** Coordinates of the chapter (metres). The player walks toward -Z all the way. */
export const Z = {
  spawn: 0,
  schoolWall: 5.5,
  barrier: -9,
  streetEnd: -36,
  fence: -38.2,
  facade: -42,
  hallBack: -58,
  labFront: -62,
  labBack: -76,
} as const;

export const LAB_FLOOR = -0.9;
/** Half width of the passable street (house fronts) and of the outer boundary. */
export const STREET_HALF = 7;
export const BOUNDARY = 13.5;

export const FENCE_GAP = { x0: 3.6, x1: 6.0 } as const;
export const FENCE_GAP_X = (FENCE_GAP.x0 + FENCE_GAP.x1) / 2;

/** Hall interior half width. */
export const HALL_HALF = 7.4;
/** Doorway (wall opening) half width. */
export const DOOR_HALF = 1.9;
/** The circuit panel on the hall's back wall. */
export const PANEL = { x: -4, z: Z.hallBack + 0.35 } as const;
/** Lab: head computer, button pedestal, Nino platform, costume stand. */
export const LAB = {
  head: { x: 0, z: -74 },
  button: { x: 0, z: -69 },
  nino: { x: 4.2, z: -70.5 },
  costume: { x: -4.6, z: -70 },
  poles: [
    { x: 3.0, z: -64.2, h: 1.0 },
    { x: 5.2, z: -64.2, h: 1.8 },
    { x: 5.2, z: -66.6, h: 2.6 },
    { x: 3.0, z: -66.6, h: 3.4 },
  ],
  poleRadius: 0.9,
} as const;
