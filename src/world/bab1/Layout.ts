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
  costume: { x: -4.6, z: -71.5 },
  // Practice nook in the back-right corner, behind Nino's platform: seen from the entrance and from the costume,
  // button and Nino spots the poles are always beyond the player, never between the camera and the player.
  poles: [
    { x: 3.7, z: -74.8, h: 1.0 },
    { x: 5.9, z: -74.8, h: 1.8 },
    { x: 5.9, z: -72.6, h: 2.6 },
  ],
  poleRadius: 0.7,
} as const;
