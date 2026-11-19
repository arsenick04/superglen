import type * as THREE from 'three';
import type { Player } from '../../player/Player';
import type { AaraActor } from './Aara';
import { FOLLOW } from './Bab5Data';

const FEET = 0.55;
/** One walked spot of the child (feet). */
interface Crumb {
  x: number;
  y: number;
  z: number;
}

/**
 * Aara walks behind the child (Chapter 5). She follows the child's trail of ground spots (so she takes the same stairs, paths and
 * ramps, never a straight line through a wall) and keeps `FOLLOW.gap` metres behind. Far behind (flying, a bike, a teleport):
 * she appears at the child's last ground spot. Pure visual: no collider, never pushes the child.
 */
export class AaraFollower {
  private readonly trail: Crumb[] = [];
  private last: Crumb = { x: 0, y: 0, z: 0 };
  private haveLast = false;
  /** Test counters. */
  teleports = 0;
  distance = 0;

  constructor(
    private readonly aara: AaraActor,
    private readonly player: Player,
  ) {}

  /** Stand next to the child (a few steps behind him) and forget the old trail. */
  reset(): void {
    const p = this.player.position;
    const f = this.player.facing;
    this.trail.length = 0;
    this.haveLast = false;
    this.aara.group.position.set(p.x - Math.sin(f) * 2, p.y - FEET, p.z - Math.cos(f) * 2);
    this.aara.group.rotation.y = f;
  }

  /** Fixed step: record the trail and move her along it. */
  fixedUpdate(dt: number): void {
    const p = this.player.position;
    const g = this.aara.group;
    const fy = p.y - FEET;
    if (this.player.grounded) {
      if (!this.haveLast || Math.hypot(p.x - this.last.x, p.z - this.last.z) > 0.28 || Math.abs(fy - this.last.y) > 0.25) {
        this.last = { x: p.x, y: fy, z: p.z };
        this.haveLast = true;
        this.trail.push(this.last);
        if (this.trail.length > 180) this.trail.shift();
      }
    }
    const dp = Math.hypot(p.x - g.position.x, p.z - g.position.z);
    this.distance = dp;
    if (dp > FOLLOW.teleportDist || Math.abs(g.position.y - fy) > 14) {
      // Left far behind: she is at the child's last ground spot.
      const c = this.trail.length > 0 ? this.trail[this.trail.length - 1] : { x: p.x, y: fy, z: p.z };
      g.position.set(c.x, c.y, c.z);
      this.trail.length = 0;
      this.teleports++;
      return;
    }
    // Walk to the next spot of the trail while the child is further than the gap.
    while (this.trail.length > 0 && dp > FOLLOW.gap) {
      const c = this.trail[0];
      const dx = c.x - g.position.x;
      const dz = c.z - g.position.z;
      const d = Math.hypot(dx, dz);
      const speed = Math.min(FOLLOW.maxSpeed, FOLLOW.speed + this.trail.length * 0.35);
      const step = speed * dt;
      if (d <= step) {
        g.position.set(c.x, c.y, c.z);
        this.trail.shift();
        // Close to the child already: stop at the gap even when the trail still has spots.
        if (Math.hypot(p.x - g.position.x, p.z - g.position.z) <= FOLLOW.gap) break;
        continue;
      }
      g.position.x += (dx / d) * step;
      g.position.z += (dz / d) * step;
      g.position.y += (c.y - g.position.y) * Math.min(1, dt * 10);
      g.rotation.y = turn(g.rotation.y, Math.atan2(dx, dz), dt * 10);
      break;
    }
    if (dp <= FOLLOW.gap + 0.3) g.rotation.y = turn(g.rotation.y, Math.atan2(p.x - g.position.x, p.z - g.position.z), dt * 4);
  }

  get position(): THREE.Vector3 {
    return this.aara.group.position;
  }
}

function turn(cur: number, target: number, k: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}
