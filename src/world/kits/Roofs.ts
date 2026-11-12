import { Parkour } from '../../config/parkour';
import type { Kit } from '../bab1/Kit';
import type { Vec3 } from '../bab1/Batch';

/**
 * Walkable roofs.
 *
 * APPROACH (why there is no sliding): the player's character controller (Rapier KinematicCharacterController) climbs
 * slopes up to 45 degrees and only slides down slopes steeper than 50 (PlayerConfig.maxSlopeClimb / minSlopeSlide),
 * and the player's vertical speed is zero while grounded. So a roof whose collider has the SAME shape as the drawn
 * roof and no face steeper than `Parkour.world.roofMaxSlopeDeg` (40) can be stood on and walked on without any
 * special case in the controller: the roof is one convex hull (a hip roof cut flat just below the ridge so the top can
 * be stood on), widened by `Parkour.world.friendly` (10 cm) at the eaves. `addHipRoof` warns in the console when a
 * roof is too steep, so a new building cannot silently introduce a slide. Flat tops (decks, caps, awnings) use
 * `addRoofBox`, a box collider that is 10 cm wider than the drawn top.
 *
 * Every roof also registers a few sample points (x, visual surface y, z) in a `RoofList`. The smoke test drops the
 * player from 1.5 m above each point and checks it stands within 0.15 m of that visual surface, grounded and not
 * drifting, and can walk along it. `window.__SG_TEST` publishes the list as JSON in the level's debug info.
 */

export interface RoofSample {
  x: number;
  y: number;
  z: number;
}

export interface RoofEntry {
  id: string;
  kind: 'hip' | 'flat';
  /** Points on the drawn surface. The first two lie on the same face / level, so the test can walk between them. */
  samples: RoofSample[];
}

export class RoofList {
  readonly entries: RoofEntry[] = [];

  add(e: RoofEntry): void {
    this.entries.push(e);
  }

  /** Compact JSON for `levelInfo` (test-only). */
  json(): string {
    return JSON.stringify(this.entries, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
  }
}

export interface HipRoofOptions {
  id: string;
  /** Centre of the base rectangle and the height of its plane (m). */
  cx: number;
  cz: number;
  baseY: number;
  /** Base size along x and z (m) and height of the apex above the base. */
  w: number;
  d: number;
  h: number;
  color: number;
  /** False when the visual roof is drawn elsewhere (only the collider and the samples are added). */
  visual?: boolean;
}

/** Fractions of the half extents used as sample points (the first two share the +x / -x face, so a walk between them stays level). */
const HIP_SAMPLES: readonly (readonly [number, number])[] = [
  [0.55, 0.25],
  [0.55, -0.25],
  [-0.55, 0.25],
  [0.25, 0.55],
  [-0.25, -0.55],
];

/** A pyramid ("hip") roof: visual + one convex hull collider + sample points. */
export function addHipRoof(kit: Kit, o: HipRoofOptions): void {
  const W = Parkour.world;
  if (o.visual !== false) kit.lit.pyr(o.w, o.h, o.d, [o.cx, o.baseY + o.h / 2, o.cz], o.color);
  const slope = (Math.atan2(o.h, Math.min(o.w, o.d) / 2) * 180) / Math.PI;
  if (slope > W.roofMaxSlopeDeg) console.warn(`roof "${o.id}" is ${slope.toFixed(0)} degrees: steeper than ${W.roofMaxSlopeDeg}, it may not be walkable`);

  const f = W.friendly;
  const hw = o.w / 2 + f;
  const hd = o.d / 2 + f;
  const k = W.roofPlateau; // the flat top is this fraction of the base (a pyramid's section at 92% height)
  const top = o.baseY + o.h * (1 - W.roofPlateau);
  const pts: number[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pts.push(o.cx + sx * hw, o.baseY - 0.25, o.cz + sz * hd); // thick body below the eave
      pts.push(o.cx + sx * hw, o.baseY, o.cz + sz * hd); // eave line
      pts.push(o.cx + sx * hw * k, top, o.cz + sz * hd * k); // flat top
    }
  }
  const hull = kit.physics.addFixedConvexHull(new Float32Array(pts));
  if (!hull) console.warn(`roof "${o.id}": no collider could be built`);

  const samples: RoofSample[] = HIP_SAMPLES.map(([fx, fz]) => {
    const dx = fx * (o.w / 2);
    const dz = fz * (o.d / 2);
    const u = Math.max(Math.abs(dx) / (o.w / 2), Math.abs(dz) / (o.d / 2));
    return { x: o.cx + dx, y: o.baseY + o.h * (1 - u), z: o.cz + dz };
  });
  kit.roofs?.add({ id: o.id, kind: 'hip', samples });
}

export interface RoofBoxOptions {
  id: string;
  /** Size and centre of the DRAWN top (the collider is `friendly` wider in x and z). */
  size: Vec3;
  pos: Vec3;
  rot?: Vec3;
  /** Draw the box too (lit, casts shadows). Omit when the visual exists already. */
  color?: number;
  /** Do not register the samples (tiny or intentionally unwalkable tops). */
  noSamples?: boolean;
}

/**
 * A flat standable top: collider (10 cm wider than the visual in x and z, same top height) plus samples on its upper
 * surface. For tilted boxes (awnings) tilt only about z or x by less than 15 degrees.
 */
export function addRoofBox(kit: Kit, o: RoofBoxOptions): void {
  const f = Parkour.world.friendly;
  if (o.color !== undefined) kit.lit.box(o.size, o.pos, o.color, o.rot);
  kit.collider([o.size[0] + 2 * f, o.size[1], o.size[2] + 2 * f], o.pos, o.rot);
  if (o.noSamples) return;
  const topY = o.pos[1] + (o.size[1] / 2) * Math.cos(Math.max(Math.abs(o.rot?.[0] ?? 0), Math.abs(o.rot?.[2] ?? 0)));
  // Walk along the longer horizontal axis.
  const alongX = o.size[0] > o.size[2];
  const step = Math.min(0.8, (alongX ? o.size[0] : o.size[2]) / 4);
  const a: RoofSample = { x: o.pos[0], y: topY, z: o.pos[2] };
  const b: RoofSample = alongX ? { x: o.pos[0] + step, y: topY, z: o.pos[2] } : { x: o.pos[0], y: topY, z: o.pos[2] + step };
  kit.roofs?.add({ id: o.id, kind: 'flat', samples: [a, b] });
}
