import { BallThrower } from '../../gameplay/props/BallThrower';
import { PADS, THROWER } from './Layout';
import { GOAL, Limiter, type Env, type Exercise, type RunOptions } from './Env';

const FALLBACK = 30;
const BALL_COLORS = [0xff5a4f, 0xffc94d, 0x4dabf7, 0x5fbf5a, 0xff8fb1];

/**
 * Nino's ball machine tosses soft rubber balls (with the usual warning arc) every ~3 s, but only while the player stands
 * inside the station circle. A blocked ball counts (the machine gets dizzy); a bonk costs nothing: Nino says "Hampir! Coba
 * lagi." (at most every 8 s) and the machine goes on. After 30 s without a block the machine slows down and Nino repeats
 * the hint, so every child gets there.
 */
export class ShieldExercise implements Exercise {
  readonly kind = 'shield' as const;
  active = false;
  count = 0;
  fallbacks = 0;
  readonly thrower: BallThrower;

  private resolve: (() => void) | null = null;
  private voice = false;
  private idle = 0;
  private time = 0;
  private lastThrown = 0;
  private readonly cobaLagi = new Limiter(8);
  private unsubs: (() => void)[] = [];
  private readonly baseInterval = 3;
  private readonly baseSpeed = 7;

  constructor(private readonly env: Env) {
    this.thrower = new BallThrower(env.ctx, { x: THROWER.x, z: THROWER.z, range: 24, interval: this.baseInterval, speed: this.baseSpeed, dizzyTime: 1.2, color: BALL_COLORS[0] });
    this.thrower.enabled = false;
  }

  /** The player stands inside the painted circle. */
  get inside(): boolean {
    const p = this.env.ctx.player.visualPosition;
    return Math.hypot(p.x - PADS.shield.x, p.z - PADS.shield.z) < PADS.shield.r;
  }

  run(o: RunOptions): Promise<void> {
    const { ctx, row } = this.env;
    this.voice = o.voice;
    this.active = true;
    this.count = 0;
    this.idle = 0;
    this.fallbacks = 0;
    this.thrower.interval = this.baseInterval;
    this.thrower.speed = this.baseSpeed;
    this.lastThrown = this.thrower.thrown;
    this.cobaLagi.reset();
    row.show('shield');
    for (const u of this.unsubs) u();
    this.unsubs = [
      ctx.player.skills.on('shieldBlock', () => this.onBlock()),
      ctx.player.skills.on('ballHit', () => {
        if (this.active && this.voice && this.cobaLagi.try(this.time)) void ctx.dialog.say('bab2_nino_coba_lagi');
      }),
    ];
    return new Promise<void>((res) => {
      this.resolve = res;
    });
  }

  stop(): void {
    this.active = false;
    this.resolve = null;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.thrower.enabled = false;
  }

  goal(out: { x: number; y: number; z: number }): boolean {
    if (!this.active) return false;
    out.x = PADS.shield.x;
    out.y = 0;
    out.z = PADS.shield.z;
    return true;
  }

  private onBlock(): void {
    if (!this.active) return;
    const { ctx, row } = this.env;
    this.count++;
    this.idle = 0;
    this.fallbacks = 0;
    row.set(this.count);
    if (this.voice && this.count < GOAL && this.count % 2 === 1) void ctx.dialog.say('bab2_nino_tangkis');
    if (this.count >= GOAL) {
      this.active = false;
      for (const u of this.unsubs) u();
      this.unsubs = [];
      this.thrower.enabled = false;
      const done = this.resolve;
      this.resolve = null;
      done?.();
    }
  }

  tick(dt: number): void {
    this.time += dt;
    const t = this.thrower;
    t.enabled = this.active && this.inside;
    t.color = BALL_COLORS[t.thrown % BALL_COLORS.length];
    t.tick(dt);
    if (t.thrown !== this.lastThrown) {
      this.lastThrown = t.thrown;
      this.env.nino.hop();
    }
    if (!this.active) return;
    this.idle += dt;
    if (this.idle >= FALLBACK) {
      this.idle = 0;
      this.fallbacks++;
      t.interval = Math.min(6, t.interval * 1.5);
      t.speed = Math.max(4.5, t.speed * 0.85);
      if (this.voice) void this.env.ctx.dialog.say('bab2_nino_perisai');
    }
  }
}
