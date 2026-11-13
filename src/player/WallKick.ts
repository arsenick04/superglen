import RAPIER from '@dimforge/rapier3d-compat';
import { Parkour } from '../config/parkour';

const K = Parkour.wallKick;
const FLAGS = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC;
const MAX_NORMAL_Y = Math.sin((K.angleTolDeg * Math.PI) / 180);
const DIR_COUNT = 8;

/**
 * Wall kick detection (the kick itself is done by Player). While airborne in Superglen mode it looks for a near-vertical
 * wall next to the capsule and remembers where and which face it touched, so a jump press kicks off it.
 *
 * Cost: only while airborne, on every n-th fixed step. One ball overlap test first; only when it finds something, up to
 * 8 horizontal rays around the capsule (a candidate needs a second ray above the head to prove the wall is tall). No
 * allocation except Rapier's own result objects on the rare ray hits (same as the mantle).
 *
 * Once per face: a face is (collider, side of the wall). After a kick the same face is skipped until landing (or a
 * mantle), so two close walls allow a zig-zag climb and one wall does not allow an endless one. `maxChain` kicks per airtime.
 */
export class WallKick {
  /** A kick would work right now (the hint icon shows). */
  available = false;
  /** Contact point on the wall and the wall normal (horizontal, unit, pointing out of the wall) of the latest valid contact. */
  px = 0;
  py = 0;
  pz = 0;
  nx = 0;
  nz = 0;
  /** Kicks in this airtime, and in total (tests). */
  chain = 0;
  total = 0;

  private face = -1;
  private lastFace = -1;
  private seenAt = -1e9;
  private probeCount = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  private readonly dir = { x: 1, y: 0, z: 0 };
  private readonly shapePos = { x: 0, y: 0, z: 0 };
  private readonly shapeRot = { x: 0, y: 0, z: 0, w: 1 };
  private readonly ball: RAPIER.Ball;
  private readonly cos = new Float32Array(DIR_COUNT);
  private readonly sin = new Float32Array(DIR_COUNT);

  constructor(
    private readonly world: RAPIER.World,
    private readonly self: RAPIER.Collider,
    private readonly radius: number,
    private readonly centerToFeet: number,
    /** True when this collider is a wall the kick may use. */
    private readonly isKickable: (handle: number) => boolean,
  ) {
    this.ball = new RAPIER.Ball(radius + K.probeDistance);
    for (let i = 0; i < DIR_COUNT; i++) {
      this.cos[i] = Math.cos((i / DIR_COUNT) * Math.PI * 2);
      this.sin[i] = Math.sin((i / DIR_COUNT) * Math.PI * 2);
    }
  }

  /** Forget everything (teleport, respawn, mode change). */
  reset(): void {
    this.available = false;
    this.face = -1;
    this.lastFace = -1;
    this.seenAt = -1e9;
    this.probeCount = 0;
    this.chain = 0;
  }

  /** Touchdown or mantle: the chain and the used face are forgotten. */
  landed(): void {
    this.available = false;
    this.lastFace = -1;
    this.chain = 0;
    this.seenAt = -1e9;
  }

  /**
   * Airborne step: refresh the contact memory (throttled) and `available`. `hx, hz` = heading (unit, or 0 when the player
   * neither presses nor moves). `allowed` false = not kick-capable right now (clears the hint).
   */
  update(t: number, cx: number, cy: number, cz: number, hx: number, hz: number, allowed: boolean): void {
    if (!allowed) {
      this.available = false;
      this.probeCount = 0;
      return;
    }
    if (++this.probeCount >= K.probeEvery) {
      this.probeCount = 0;
      this.scan(t, cx, cy, cz, hx, hz);
    }
    this.available = this.ready(t);
  }

  /** A jump was pressed: look once more, and when a kick is possible consume it (records the face, counts the chain). */
  tryKick(t: number, cx: number, cy: number, cz: number, hx: number, hz: number): boolean {
    if (this.chain >= K.maxChain) return false;
    this.scan(t, cx, cy, cz, hx, hz);
    if (!this.ready(t)) return false;
    this.lastFace = this.face;
    this.seenAt = -1e9;
    this.chain++;
    this.total++;
    this.available = false;
    return true;
  }

  private ready(t: number): boolean {
    return this.chain < K.maxChain && t - this.seenAt <= K.contactMemory && this.face !== this.lastFace;
  }

  private scan(t: number, cx: number, cy: number, cz: number, hx: number, hz: number): void {
    const reach = this.radius + K.probeDistance;
    const sp = this.shapePos;
    sp.x = cx;
    sp.y = cy;
    sp.z = cz;
    if (!this.world.intersectionWithShape(sp, this.shapeRot, this.ball, FLAGS, undefined, this.self)) return;
    const r = this.ray;
    const d = this.dir;
    r.origin.x = cx;
    r.origin.y = cy;
    r.origin.z = cz;
    r.dir = d;
    let best = Infinity;
    for (let i = 0; i < DIR_COUNT; i++) {
      d.x = this.cos[i];
      d.z = this.sin[i];
      r.origin.y = cy;
      const hit = this.world.castRayAndGetNormal(r, reach, true, FLAGS, undefined, this.self);
      if (!hit) continue;
      const n = hit.normal;
      const nh = Math.hypot(n.x, n.z);
      if (Math.abs(n.y) > MAX_NORMAL_Y || nh < 0.5) continue;
      const nx = n.x / nh;
      const nz = n.z / nh;
      // Distance from the capsule surface to the wall plane, measured along the normal.
      const surface = hit.timeOfImpact * -(d.x * nx + d.z * nz) - this.radius;
      if (surface >= best) continue;
      const touching = surface <= K.touchDistance;
      if (!touching && -(hx * nx + hz * nz) < K.minToward) continue;
      const handle = hit.collider.handle;
      if (!this.isKickable(handle)) continue;
      const sector = ((Math.round(Math.atan2(nz, nx) / (Math.PI / 2)) % 4) + 4) % 4;
      const face = handle * 4 + sector;
      if (face === this.lastFace) continue;
      // The wall must continue well above the head at this spot (not a low box, not a ledge the mantle would take).
      r.origin.y = cy + this.centerToFeet + K.minWallAboveHead;
      const high = this.world.castRay(r, hit.timeOfImpact + 0.35, true, FLAGS, undefined, this.self);
      r.origin.y = cy;
      if (!high || high.collider.handle !== handle) continue;
      best = surface;
      this.face = face;
      this.nx = nx;
      this.nz = nz;
      this.px = cx + d.x * hit.timeOfImpact;
      this.py = cy;
      this.pz = cz + d.z * hit.timeOfImpact;
      this.seenAt = t;
    }
  }
}
