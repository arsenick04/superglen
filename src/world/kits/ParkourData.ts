/**
 * Pure level-layout data for the parkour reachability checker (PAKET_P1_PARKOUR.md, sections 3 and 5).
 *
 * NO three.js, no Rapier, no browser imports here: the level builders (Arena Lompat, later the Chapter 1 street) AND
 * `scripts/reachability.ts` (`npm run check:reach`) both import the same data, so the checked layout cannot drift from
 * the built one. Units: metres, radians. All coordinates are world coordinates.
 *
 * Example (a crate stack and a house):
 *   box('crateA', 'crate', 5, 3, 1.2, 1.2, 0.9, { building: 'house' })      // a block down to the ground, top 0.9 m
 *   box('awning', 'awning', 6, 4, 2.2, 1.6, 2.6, { building: 'house', thickness: 0.25 })   // a cantilever slab
 *   hipRoof('houseRoof', 'house', cx, cz, 5.6, 5.6, wallHeight, roofHeight)
 *   buildings: [{ id: 'house', class: 'house', roofIds: ['houseRoof'], wall: 3.4, level: 1 }]
 *   coins: [{ id: 'star', pos: [cx, 4.6, cz], on: 'houseRoof' }]
 *   gates: [{ foothold: 'floor2', level: 2, notBelowLevel: 2 }]
 */

export type FootholdKind = 'crate' | 'ac' | 'ledge' | 'balcony' | 'sign' | 'awning' | 'pole' | 'drum' | 'pier' | 'roof' | 'tree' | 'other';

export interface Foothold {
  id: string;
  /** Building this foothold belongs to (a `Building.id`), if any. */
  building?: string;
  /** Free-form group (e.g. 'tower'), for the tables. */
  group?: string;
  kind: FootholdKind;
  /** Centre of the box. The standable top is at `center[1] + size[1] / 2`. */
  center: [number, number, number];
  /** Width (x), height / thickness (y), depth (z) of the DRAWN box before the friendly collider margin. */
  size: [number, number, number];
  /** Rotation about the vertical axis (radians). */
  yaw?: number;
  /** Round top (pole, drum): the footprint is a circle of diameter `size[0]`. */
  round?: boolean;
  isRoof?: boolean;
  /** Steepness of a roof (degrees); the top height is then the EAVE height and `peak` is the highest walkable point. */
  slopeDeg?: number;
  /** Highest walkable point of a sloped roof (m). */
  peak?: number;
  /** Bounce drum: landing raises the rhythm level by one (never above the cap, see the reach model in the script). */
  bounce?: boolean;
  /** Must also be reachable by Glen (school mode: glenApex jump, no air jump, no rhythm). */
  glen?: boolean;
  /** Walkable from the ground without jumping (a gentle hill): ground -> this foothold always succeeds. */
  ramp?: boolean;
}

export type BuildingClass = 'house' | 'ruko' | 'landmark';

export interface Building {
  id: string;
  class: BuildingClass;
  roofIds: string[];
  /** Wall height up to the eave (m), for the class check. */
  wall: number;
  /** The rhythm level (0..4) the roofs and coins of this building are designed for (reachable at this level, with the air jump). */
  level: number;
  /** Reason text: the class-level mismatch of this building is a known, accepted finding (printed as a warning, not an error). */
  waiver?: string;
}

export interface Coin {
  id: string;
  pos: [number, number, number];
  /** Level it must be reachable at; default: the level of its building, else 4. */
  level?: number;
  /** Foothold it lies over (default: the highest foothold whose top contains pos.x / pos.z and lies at or below pos.y). */
  on?: string;
}

export interface Gate {
  foothold: string;
  /** Must be reachable at this level (with the air jump). */
  level?: number;
  /** Must NOT be reachable (with the air jump) at any level below this one: an intended gate (Menara Irama). */
  notBelowLevel?: number;
}

/**
 * A kick alley ("Gang Tendang"): two close parallel tall walls. Their tops are reachable ONLY with wall kicks (the checker
 * proves both halves: no route at any rhythm level without kicks, a route with kicks). `gap` = distance between the two
 * wall faces (collider to collider, m), `wallTop` = height of the wall tops (m).
 */
export interface KickAlley {
  id: string;
  /** Ids of the footholds on top of the walls. */
  tops: string[];
  gap: number;
  wallTop: number;
}

export interface LevelReachData {
  id: string;
  /** Where the player may start / respawn: 'ground' or any foothold id. */
  starts: string[];
  footholds: Foothold[];
  buildings: Building[];
  coins: Coin[];
  gates: Gate[];
  /** Roof-to-roof neighbours of a green route (rule 4): checked for gap and height difference. */
  greenLinks?: [string, string][];
  /** Kick alleys (see KickAlley): their tops are exempt from the plain-jump reach rules and checked by the kick model. */
  kickAlleys?: KickAlley[];
  /** Big level (the open city): print a summary instead of one table row per roof. */
  compact?: boolean;
}

/** Top height of a foothold (the entry height for a sloped roof). */
export function topOf(f: Foothold): number {
  return f.center[1] + f.size[1] / 2;
}

/** A box foothold with its top at `top`. Solid down to the ground unless `thickness` is given (a cantilever slab). */
export function box(
  id: string,
  kind: FootholdKind,
  x: number,
  z: number,
  w: number,
  d: number,
  top: number,
  o: { building?: string; group?: string; thickness?: number; yaw?: number; bounce?: boolean; glen?: boolean } = {},
): Foothold {
  const t = o.thickness ?? top;
  return { id, kind, building: o.building, group: o.group, center: [x, top - t / 2, z], size: [w, t, d], yaw: o.yaw, bounce: o.bounce, glen: o.glen };
}

/** A round pole / drum from the ground to `top`. */
export function cylinder(id: string, kind: 'pole' | 'drum', x: number, z: number, radius: number, top: number, o: { group?: string; bounce?: boolean } = {}): Foothold {
  return { id, kind, group: o.group, center: [x, top / 2, z], size: [radius * 2, top, radius * 2], round: true, bounce: o.bounce };
}

/**
 * A walkable hip roof: `w` x `d` is the base including the overhang, `baseY` the eave height, `h` the roof height.
 * Solid below the eave (the wall carries it). `plateau` is the fraction of `h` cut off at the top (Parkour.world.roofPlateau).
 */
export function hipRoof(id: string, building: string, cx: number, cz: number, w: number, d: number, baseY: number, h: number, plateau: number): Foothold {
  return {
    id,
    building,
    kind: 'roof',
    center: [cx, baseY / 2, cz],
    size: [w, baseY, d],
    isRoof: true,
    slopeDeg: (Math.atan2(h, Math.min(w, d) / 2) * 180) / Math.PI,
    peak: baseY + h * (1 - plateau),
  };
}
