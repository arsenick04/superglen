import * as THREE from 'three';
import { FlyRing } from '../../gameplay/props/FlyRing';
import { RING_PATH, RING_RADIUS } from './Layout';
import { GOAL, type Env, type Exercise, type RunOptions } from './Env';

/** Seconds without a ring before the helper kicks in (first time / again). */
const FALLBACK_FIRST = 25;
const FALLBACK_AGAIN = 12;

/**
 * Fly through five big rings of light, one at a time. A ring shows only after the previous one was passed; the objective
 * beam points at it. Nothing resets if the child lands or wanders; after 25 s without a pass Nino repeats the hint and
 * the ring lowers itself toward the player (again every 12 s, and from the second time it also comes closer).
 */
export class RingsExercise implements Exercise {
  readonly kind = 'ring' as const;
  active = false;
  count = 0;
  /** Index of the ring currently waiting (test hook). */
  current = -1;
  fallbacks = 0;

  private readonly rings: FlyRing[] = [];
  private readonly fading: { ring: FlyRing; t: number }[] = [];
  private resolve: (() => void) | null = null;
  private voice = false;
  private idle = 0;
  private notFlying = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly env: Env) {
    RING_PATH.forEach((p, i) => {
      const a = RING_PATH[Math.min(i + 1, RING_PATH.length - 1)];
      const b = RING_PATH[Math.max(i - 1, 0)];
      const yaw = i === RING_PATH.length - 1 ? Math.atan2(p[0] - b[0], p[2] - b[2]) : Math.atan2(a[0] - p[0], a[2] - p[2]);
      const ring = new FlyRing(env.ctx, { x: p[0], y: p[1], z: p[2], yaw, radius: RING_RADIUS, rearmAfter: 0, onPass: () => this.onPass(i) });
      ring.group.visible = false;
      this.rings.push(ring);
    });
  }

  run(o: RunOptions): Promise<void> {
    const { row } = this.env;
    this.voice = o.voice;
    this.active = true;
    this.count = 0;
    this.idle = 0;
    this.notFlying = 1;
    this.fallbacks = 0;
    this.fading.length = 0;
    RING_PATH.forEach((p, i) => {
      this.rings[i].moveTo(p[0], p[1], p[2]);
      this.rings[i].rearm();
      this.rings[i].group.visible = false;
    });
    row.show('ring');
    this.showRing(0);
    return new Promise<void>((res) => {
      this.resolve = res;
    });
  }

  goal(out: { x: number; y: number; z: number }): boolean {
    if (!this.active || this.current < 0) return false;
    const c = this.rings[this.current].centre;
    out.x = c.x;
    out.y = c.y;
    out.z = c.z;
    return true;
  }

  private showRing(i: number): void {
    this.current = i;
    const r = this.rings[i];
    r.group.visible = true;
    r.rearm();
    this.pointAt(i);
  }

  private pointAt(i: number): void {
    const c = this.rings[i].centre;
    // The beam rises from the ring's centre; the arrow floats above the ring.
    this.env.ctx.objectives.set(this.tmp.set(c.x, c.y - 0.5, c.z));
  }

  private onPass(i: number): void {
    if (!this.active || i !== this.current) return;
    const { ctx, row, hold } = this.env;
    this.count++;
    this.idle = 0;
    this.fallbacks = 0;
    ctx.player.skills.stats.ringsPassed++;
    row.set(this.count);
    this.fading.push({ ring: this.rings[i], t: 0.7 });
    if (this.voice && this.count === 2) void ctx.dialog.say('bab2_nino_cincin_bagus');
    if (this.count >= GOAL) {
      this.active = false;
      this.current = -1;
      ctx.objectives.clear();
      hold.set(false);
      const done = this.resolve;
      this.resolve = null;
      done?.();
      return;
    }
    this.showRing(i + 1);
  }

  tick(dt: number): void {
    const { ctx, hold } = this.env;
    for (const r of this.rings) if (r.group.visible) r.tick(dt);
    for (let k = this.fading.length - 1; k >= 0; k--) {
      const f = this.fading[k];
      f.t -= dt;
      if (f.t <= 0) {
        f.ring.group.visible = false;
        this.fading.splice(k, 1);
      }
    }
    if (!this.active) return;
    // "Hold the jump button" hint: while the child is not flying (and has not been for a moment).
    if (this.voice) {
      this.notFlying = ctx.player.flight.isFlying ? 0 : this.notFlying + dt;
      hold.set(this.notFlying > 0.9);
    }
    this.idle += dt;
    if (this.idle >= (this.fallbacks === 0 ? FALLBACK_FIRST : FALLBACK_AGAIN)) this.helpOut();
  }

  /** No ring for a long while: say the hint again and bring the ring to the player. */
  private helpOut(): void {
    const { ctx } = this.env;
    this.idle = 0;
    this.fallbacks++;
    if (this.voice) void ctx.dialog.say('bab2_nino_cincin');
    const ring = this.rings[this.current];
    const c = ring.centre;
    const p = ctx.player.visualPosition;
    const y = Math.max(1.7, p.y + (c.y - p.y) * 0.45);
    let x = c.x;
    let z = c.z;
    if (this.fallbacks >= 2) {
      x += (p.x - x) * 0.45;
      z += (p.z - z) * 0.45;
    }
    ring.moveTo(x, y, z);
    ctx.fx.flashes.spawn(x, y, z, RING_RADIUS * 1.2, 0.6, 0xfff1a8);
    this.pointAt(this.current);
  }
}
