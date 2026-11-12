import * as THREE from 'three';
import { PracticeTarget } from '../../gameplay/props/PracticeTarget';
import { PADS, TARGETS, TARGET_GROUPS } from './Layout';
import { GOAL, Limiter, type Env, type Exercise, type RunOptions } from './Env';

const FALLBACK_FIRST = 25;
const FALLBACK_AGAIN = 15;

/**
 * Five practice targets pop up one or two at a time at 5 to 15 m from the marked spot; the 4th glides slowly. A hit
 * flips the disc, sparkles, and (every other time) Nino cheers. A miss makes Nino say "Tenang dulu, baru bidik." (at most
 * every 6 s). After a long time without a hit, the waiting targets come closer to the player and grow.
 */
export class LaserExercise implements Exercise {
  readonly kind = 'target' as const;
  active = false;
  count = 0;
  fallbacks = 0;

  private readonly targets: PracticeTarget[] = [];
  private group = 0;
  private left = 0;
  private resolve: (() => void) | null = null;
  private voice = false;
  private idle = 0;
  private time = 0;
  private readonly hideAt: number[] = [];
  private readonly tenang = new Limiter(6);
  private unsub: (() => void) | null = null;
  private readonly tmp = new THREE.Vector3();
  /** Total laser misses counted while a round ran (test hook). */
  misses = 0;

  constructor(private readonly env: Env) {
    TARGETS.forEach((t, i) => {
      const yaw = Math.atan2(PADS.laser.x - t.x, PADS.laser.z - t.z);
      const pt = new PracticeTarget(env.ctx, { x: t.x, z: t.z, height: t.h, yaw, radius: 0.7, path: t.path, speed: 0.9, resetAfter: 0, id: `b2target${i}`, onHit: () => this.onHit(i) });
      pt.hide();
      this.targets.push(pt);
      this.hideAt.push(-1);
    });
  }

  run(o: RunOptions): Promise<void> {
    this.voice = o.voice;
    this.active = true;
    this.count = 0;
    this.group = 0;
    this.idle = 0;
    this.fallbacks = 0;
    this.misses = 0;
    this.tenang.reset();
    TARGETS.forEach((t, i) => {
      const pt = this.targets[i];
      pt.hide();
      pt.moveTo(t.x, t.z);
      this.hideAt[i] = -1;
    });
    this.env.row.show('target');
    this.unsub?.();
    this.unsub = this.env.ctx.player.skills.on('laserMiss', () => {
      this.misses++;
      if (this.active && this.voice && this.tenang.try(this.time)) void this.env.ctx.dialog.say('bab2_nino_tenang');
    });
    this.showGroup();
    return new Promise<void>((res) => {
      this.resolve = res;
    });
  }

  stop(): void {
    this.active = false;
    this.resolve = null;
    this.unsub?.();
    this.unsub = null;
    for (const t of this.targets) t.hide();
    this.env.ctx.objectives.clear();
  }

  goal(out: { x: number; y: number; z: number }): boolean {
    if (!this.active) return false;
    const i = TARGET_GROUPS[this.group]?.find((k) => !this.targets[k].isDown && this.targets[k].group.visible);
    if (i === undefined) return false;
    const a = this.targets[i].aim;
    out.x = a.x;
    out.y = a.y;
    out.z = a.z;
    return true;
  }

  /** The beam always points at a target that still waits (a child who faces the wrong way follows it). */
  private point(): void {
    const g = TARGET_GROUPS[this.group];
    const i = g.find((k) => this.targets[k].group.visible && !this.targets[k].isDown);
    if (i === undefined) {
      this.env.ctx.objectives.clear();
      return;
    }
    const a = this.targets[i].aim;
    this.env.ctx.objectives.set(this.tmp.set(a.x, 0, a.z));
  }

  private showGroup(): void {
    const g = TARGET_GROUPS[this.group];
    this.left = g.length;
    for (const i of g) {
      this.targets[i].show(1);
      this.hideAt[i] = -1;
    }
    this.idle = 0;
    this.point();
  }

  private onHit(i: number): void {
    if (!this.active) return;
    const { ctx, row } = this.env;
    this.count++;
    this.idle = 0;
    this.fallbacks = 0;
    row.set(this.count);
    this.hideAt[i] = this.time + 1.0;
    if (this.voice && this.count < GOAL && this.count % 2 === 1) void ctx.dialog.say('bab2_nino_laser_bagus');
    this.left--;
    this.point();
    if (this.count >= GOAL) {
      this.active = false;
      this.env.ctx.objectives.clear();
      this.unsub?.();
      this.unsub = null;
      const done = this.resolve;
      this.resolve = null;
      // Let the last flip play before the story goes on.
      this.env.ctx.seq.run(async () => {
        await this.env.ctx.seq.wait(0.9);
        done?.();
      });
    }
  }

  tick(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (!t.group.visible) continue;
      t.tick(dt);
      if (this.hideAt[i] >= 0 && this.time >= this.hideAt[i]) {
        this.hideAt[i] = -1;
        const a = t.aim;
        this.env.ctx.fx.sparkles.burst(a.x, a.y, a.z, 10, 3, 0xffffff, { gravity: 1, life: 0.5 });
        t.hide();
      }
    }
    if (!this.active) return;
    if (TARGET_GROUPS[this.group].includes(3)) this.point(); // the moving one
    // Next group when every target of this one is down.
    if (this.left <= 0 && this.group < TARGET_GROUPS.length - 1) {
      const g = TARGET_GROUPS[this.group];
      if (g.every((i) => !this.targets[i].group.visible)) {
        this.group++;
        this.showGroup();
      }
    }
    this.idle += dt;
    if (this.idle >= (this.fallbacks === 0 ? FALLBACK_FIRST : FALLBACK_AGAIN)) this.helpOut();
  }

  /** Waiting targets come to about 6 m from the player and grow. */
  private helpOut(): void {
    const { ctx } = this.env;
    this.idle = 0;
    this.fallbacks++;
    if (this.voice) void ctx.dialog.say('bab2_nino_laser');
    const p = ctx.player.visualPosition;
    for (const i of TARGET_GROUPS[this.group]) {
      const t = this.targets[i];
      if (!t.group.visible || t.isDown) continue;
      t.settle();
      const dx = t.position.x - p.x;
      const dz = t.position.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const reach = Math.min(d, 6);
      t.moveTo(p.x + (dx / d) * reach, p.z + (dz / d) * reach);
      t.enlarge(1.5);
      ctx.fx.flashes.spawn(t.aim.x, t.aim.y, t.aim.z, 1.2, 0.5, 0xfff1a8);
    }
  }
}
