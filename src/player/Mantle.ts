import RAPIER from '@dimforge/rapier3d-compat';
import { Parkour } from '../config/parkour';

const M = Parkour.mantle;
const FLAGS = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC;

/**
 * Auto mantle: when airborne and heading into a ledge whose top is at most `maxAboveHead` above the head, the
 * character pulls itself up onto it (rise along the wall, then forward onto the top) in ~0.35 s.
 *
 * Detection is a handful of queries, only while airborne, on every n-th fixed step, and only the first ray (a short
 * horizontal probe) runs when no wall is near:
 *   1. probe ray forward at chest height: a vertical wall within reach, facing the heading
 *   2. ray forward above the ledge limit: if it hits too, the wall continues higher (no mantle)
 *   3. ray down just behind the wall face: the ledge top (flat enough, within the height window)
 *   4. capsule overlap test at the landing spot + a ground ray: standing room and real support
 * No allocation except Rapier's own result objects on the rare hits.
 */
export class Mantle {
  active = false;
  /** Seconds since the mantle started. */
  private t = 0;
  private cooldown = 0;
  private probeCount = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  private readonly down = { x: 0, y: -1, z: 0 };
  private readonly horiz = { x: 1, y: 0, z: 0 };
  private readonly shapePos = { x: 0, y: 0, z: 0 };
  private readonly shapeRot = { x: 0, y: 0, z: 0, w: 1 };
  private readonly shape: RAPIER.Capsule;
  /** Start and end capsule centres of the running mantle. */
  private fx = 0;
  private fy = 0;
  private fz = 0;
  private tx = 0;
  private ty = 0;
  private tz = 0;
  /** Output of `step`: current capsule centre. */
  x = 0;
  y = 0;
  z = 0;

  constructor(
    private readonly world: RAPIER.World,
    private readonly self: RAPIER.Collider,
    private readonly radius: number,
    halfHeight: number,
    private readonly centerToFeet: number,
  ) {
    this.shape = new RAPIER.Capsule(Math.max(0.01, halfHeight - M.roomShrink), Math.max(0.05, radius - M.roomShrink));
  }

  /** Forget a running mantle (teleport, respawn). */
  reset(): void {
    this.active = false;
    this.t = 0;
    this.cooldown = 0;
    this.probeCount = 0;
  }

  /** Called every fixed step with the time passed (for the cooldown). */
  tick(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
  }

  /**
   * Look for a ledge (throttled by the caller's airborne steps). `dx, dz` = unit heading. Returns true when a mantle
   * started; then `step` drives the body.
   */
  tryStart(cx: number, cy: number, cz: number, dx: number, dz: number): boolean {
    if (this.cooldown > 0 || this.active) return false;
    if (++this.probeCount < M.probeEvery) return false;
    this.probeCount = 0;

    const feetY = cy - this.centerToFeet;
    const headTop = cy + this.centerToFeet;
    const reach = this.radius + M.reach;
    const r = this.ray;
    const h = this.horiz;
    h.x = dx;
    h.z = dz;
    r.dir = h;

    // 1. Wall straight ahead at chest height.
    r.origin.x = cx;
    r.origin.y = feetY + M.probeHeight;
    r.origin.z = cz;
    const wall = this.world.castRayAndGetNormal(r, reach, true, FLAGS, undefined, this.self);
    if (!wall) return false;
    const n = wall.normal;
    const nh = Math.hypot(n.x, n.z);
    if (Math.abs(n.y) > M.wallMaxNormalY || nh < 0.5) return false;
    const nx = n.x / nh;
    const nz = n.z / nh;
    if (-(dx * nx + dz * nz) < M.minFacing) return false;
    const hx = cx + dx * wall.timeOfImpact;
    const hz = cz + dz * wall.timeOfImpact;

    // 2. The wall must end below the limit: a ray above it must pass.
    const limit = headTop + M.maxAboveHead;
    r.origin.y = limit + 0.06;
    if (this.world.castRay(r, reach, true, FLAGS, undefined, this.self)) return false;

    // 3. The ledge top, just behind the wall face.
    const inx = hx - nx * 0.12;
    const inz = hz - nz * 0.12;
    r.origin.x = inx;
    r.origin.y = limit + 0.04;
    r.origin.z = inz;
    r.dir = this.down;
    const top = this.world.castRayAndGetNormal(r, limit + 0.04 - (feetY + 0.1), true, FLAGS, undefined, this.self);
    r.dir = h;
    if (!top || top.normal.y < M.minTopNormalY) return false;
    const topY = limit + 0.04 - top.timeOfImpact;
    if (topY > limit + 1e-3 || topY < feetY + M.minAboveFeet) return false;

    // 4. Standing room and support at the landing spot.
    const lx = hx - nx * (this.radius + M.inset);
    const lz = hz - nz * (this.radius + M.inset);
    const ly = topY + this.centerToFeet + 0.02;
    const sp = this.shapePos;
    sp.x = lx;
    sp.y = ly + M.roomLift;
    sp.z = lz;
    if (this.world.intersectionWithShape(sp, this.shapeRot, this.shape, FLAGS, undefined, this.self)) return false;
    // The column the body rises through must be free too (an overhang above the player).
    sp.x = cx;
    sp.z = cz;
    if (this.world.intersectionWithShape(sp, this.shapeRot, this.shape, FLAGS, undefined, this.self)) return false;
    r.origin.x = lx;
    r.origin.y = ly;
    r.origin.z = lz;
    r.dir = this.down;
    const ground = this.world.castRay(r, this.centerToFeet + 0.25, true, FLAGS, undefined, this.self);
    r.dir = h;
    if (!ground || ly - ground.timeOfImpact < topY - 0.08) return false;

    this.fx = cx;
    this.fy = cy;
    this.fz = cz;
    this.tx = lx;
    this.ty = ly;
    this.tz = lz;
    this.x = cx;
    this.y = cy;
    this.z = cz;
    this.t = 0;
    this.active = true;
    return true;
  }

  /** Advance the animation; fills `x/y/z`. Returns true when it just finished. */
  step(dt: number): boolean {
    this.t += dt;
    const u = Math.min(1, this.t / M.duration);
    const rs = M.riseShare;
    if (u < rs) {
      const k = u / rs;
      const e = 1 - (1 - k) * (1 - k); // fast pull, soft end
      this.x = this.fx;
      this.z = this.fz;
      this.y = this.fy + (this.ty - this.fy) * e;
    } else {
      const k = (u - rs) / (1 - rs);
      const e = k * k * (3 - 2 * k);
      this.x = this.fx + (this.tx - this.fx) * e;
      this.z = this.fz + (this.tz - this.fz) * e;
      this.y = this.ty;
    }
    if (u >= 1) {
      this.active = false;
      this.cooldown = M.cooldown;
      this.x = this.tx;
      this.y = this.ty;
      this.z = this.tz;
      return true;
    }
    return false;
  }
}
