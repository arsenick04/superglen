import * as THREE from 'three';
import { SkateConfig as S } from '../../config/skate';
import type { LevelContext } from '../Level';
import { SkateVisual, type SkateMotionSource } from './SkateboardModel';

const SKIN = 0.55; // capsule centre to feet (PlayerConfig.height / 2)

/** Debug: `?skate=1` grants the skateboard for testing (until the shop owns the inventory). */
function debugGrant(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('skate') === '1';
  } catch {
    return false;
  }
}

/** Fired by the wardrobe / shop UI (`window.dispatchEvent(new Event('skate-toggle'))`) to take the skateboard out or put it away. */
export const SKATE_TOGGLE_EVENT = 'skate-toggle';

/**
 * Glen's skateboard (bought in the shop). When owned, the interact button / E takes it out anywhere in the city (when no
 * prompt is in range), the same button puts it away. On the board the big button is an ollie (small hop; the numbers are in
 * `SkateConfig`). Superglen never rides it. A hard hit on a wall steps Glen off gently. The pose is procedural (RideLayer).
 */
export class SkateSystem {
  private visual: SkateVisual | null = null;
  private riding = false;
  /** 0 none, 1 popping in, 2 popping out (put away), 3 dropped on the ground after a bump. */
  private phase = 0;
  private phaseT = 0;
  private toggleReq = false;
  private prevSpeed = 0;
  private dirX = 0;
  private dirZ = 1;
  private rollT = 0;
  private wasGrounded = true;
  private disposed = false;
  private readonly lit: THREE.Material;
  private readonly src: SkateMotionSource;
  private readonly grant = debugGrant();
  /** Counters for tests. */
  mounts = 0;
  dismounts = 0;
  bumps = 0;
  ollieSounds = 0;
  rolls = 0;

  constructor(private readonly ctx: LevelContext, lit: THREE.Material) {
    this.lit = lit;
    const p = ctx.player;
    const input = ctx.input;
    this.src = {
      velocity: p.velocity,
      get verticalVelocity() { return p.verticalVelocity; },
      get grounded() { return p.grounded; },
      object: p.object,
      wantsMove: () => p.inputEnabled && Math.hypot(input.move.x, input.move.y) > 0.25,
      topSpeed: () => S.ride.runSpeed,
    };
    const onToggle = (): void => {
      this.toggleReq = true;
    };
    window.addEventListener(SKATE_TOGGLE_EVENT, onToggle);
    ctx.onDispose(() => {
      window.removeEventListener(SKATE_TOGGLE_EVENT, onToggle);
      this.dispose();
    });
  }

  get isRiding(): boolean {
    return this.riding;
  }

  /** Owned in the shop inventory (defensive: the field may not exist yet). */
  owned(): boolean {
    if (this.grant) return true;
    try {
      const save = this.ctx.save as unknown as { isOwned?: (id: string) => boolean; data?: { inventory?: { owned?: string[] } } };
      if (typeof save.isOwned === 'function') return !!save.isOwned(S.ownId);
      return !!save.data?.inventory?.owned?.includes(S.ownId);
    } catch {
      return false;
    }
  }

  /** Test handle. */
  info(): { riding: boolean; phase: number; wheel: number; roll: number; pitch: number; speed: number; kick: number; pushes: number; kickDown: number; miss: number[]; w: number; ollies: number } | null {
    const v = this.visual;
    if (!v) return null;
    const rl = this.ctx.player.avatar.rig?.rideLayer;
    return {
      riding: this.riding, phase: this.phase, wheel: v.wheelAngle, roll: v.tiltRoll, pitch: v.tiltPitch, speed: v.speed,
      kick: v.pushPhase, pushes: v.pushes, kickDown: v.kickDown, miss: rl ? Array.from(rl.miss) : [], w: rl?.w ?? 0, ollies: this.ctx.player.ollies,
    };
  }

  toggle(): void {
    if (this.riding) this.putAway();
    else this.summon();
  }

  /** The ride slot is 'none' (the child chose to walk): nothing is summoned by the interact button. */
  private rideNone(): boolean {
    if (this.grant) return false;
    try {
      const save = this.ctx.save as unknown as { data?: { inventory?: { equipped?: { ride?: string } } } };
      return save.data?.inventory?.equipped?.ride === 'none';
    } catch {
      return false;
    }
  }

  private canSummon(): boolean {
    const { player, game, dialog } = this.ctx;
    return !this.riding && !this.rideNone() && this.owned() && player.mode === 'glen' && !player.ride && !player.flight.isFlying && game.controlsEnabled && !dialog.active && player.grounded;
  }

  fixedUpdate(dt: number): void {
    const { player, input, game, dialog, interactions } = this.ctx;
    if (this.toggleReq) {
      this.toggleReq = false;
      this.toggle();
    }
    if (!this.riding) {
      if (this.phase === 0 && game.controlsEnabled && !dialog.active && input.wasPressed('interact') && !interactions.inRange && this.canSummon()) this.summon();
      return;
    }
    if (player.mode !== 'glen' || player.flight.isFlying) {
      this.putAway();
      return;
    }
    if (!game.controlsEnabled || dialog.active) {
      this.prevSpeed = 0;
      return;
    }
    if (input.wasPressed('interact')) {
      this.putAway();
      return;
    }
    // A hard hit on a wall: the speed collapses in one step while Glen steers into it. Step off gently.
    const sp = Math.hypot(player.velocity.x, player.velocity.z);
    if (player.grounded && this.prevSpeed > S.bumpSpeed && sp < this.prevSpeed * S.bumpKeep && player.inputEnabled && Math.hypot(input.move.x, input.move.y) > 0.3) {
      this.bump();
      return;
    }
    this.prevSpeed = sp;
    if (sp > 1) {
      this.dirX = player.velocity.x / sp;
      this.dirZ = player.velocity.z / sp;
    }
    // Ollie sound (the hop itself is in Player).
    const g = player.grounded;
    if (this.wasGrounded && !g && player.verticalVelocity > 2 && player.ollies > this.ollieSounds) {
      this.ollieSounds = player.ollies;
      this.ctx.sfx.ollie();
    }
    if (!this.wasGrounded && g) this.ctx.sfx.land(5);
    this.wasGrounded = g;
    // Wheel rolling: ticks that come faster with speed.
    if (g && sp > S.rollMinSpeed) {
      this.rollT -= dt;
      if (this.rollT <= 0) {
        const k = Math.min(1, sp / S.ride.runSpeed);
        this.rollT = S.rollSlow + (S.rollFast - S.rollSlow) * k;
        this.rolls++;
        this.ctx.sfx.roll(k);
      }
    } else this.rollT = 0;
  }

  /** Per rendered frame: pop in / out animation of the board. */
  update(dt: number): void {
    const v = this.visual;
    if (!v || this.phase === 0) return;
    this.phaseT += dt;
    if (this.phase === 1) {
      const t = Math.min(1, this.phaseT / S.popTime);
      v.root.scale.setScalar(Math.max(0.01, 1 + 0.15 * Math.sin(t * Math.PI) - (1 - t) * (1 - t)));
      if (t >= 1) {
        this.phase = 0;
        v.root.scale.setScalar(1);
      }
    } else if (this.phase === 3 && this.phaseT >= S.dropStay) {
      this.phase = 2;
      this.phaseT = 0;
    } else if (this.phase === 2) {
      const t = Math.min(1, this.phaseT / S.popTime);
      v.root.scale.setScalar(Math.max(0.01, 1 - t * t));
      if (t >= 1) this.hideBoard();
    }
  }

  private ensureVisual(): SkateVisual {
    if (!this.visual) this.visual = new SkateVisual(this.lit, this.src);
    return this.visual;
  }

  private summon(): void {
    if (!this.canSummon()) return;
    const { player, game } = this.ctx;
    const v = this.ensureVisual();
    if (this.phase !== 0) this.hideBoard();
    this.riding = true;
    this.mounts++;
    v.rest();
    v.root.removeFromParent();
    v.root.position.set(0, -SKIN, 0);
    v.root.rotation.set(0, 0, 0);
    v.root.scale.setScalar(0.01);
    v.root.visible = true;
    player.object.add(v.root);
    player.ride = S.ride;
    player.rideLift = S.lift;
    player.ollieBufferTime = S.ollieBuffer;
    player.avatar.setRide(v);
    this.phase = 1;
    this.phaseT = 0;
    this.prevSpeed = 0;
    this.rollT = 0;
    this.wasGrounded = player.grounded;
    game.setRiding(false);
    this.ctx.sfx.pop();
    const p = player.visualPosition;
    this.ctx.fx.sparkles.burst(p.x, p.y - SKIN + 0.2, p.z, 7, 1.8, 0xffd23f, { gravity: 1, life: 0.5, up: 0.5 });
  }

  /** Rider off, board pops away at the feet. */
  private putAway(): void {
    if (!this.riding) return;
    const { player } = this.ctx;
    this.leave();
    this.dismounts++;
    this.phase = 2;
    this.phaseT = 0;
    this.ctx.sfx.pop();
    const p = player.visualPosition;
    this.ctx.fx.sparkles.burst(p.x, p.y - SKIN + 0.2, p.z, 6, 1.6, 0xffffff, { gravity: 1, life: 0.45, up: 0.4 });
  }

  /** Hit a wall hard: Glen hops off backwards, the board stays on the ground for a moment. No damage. */
  private bump(): void {
    const { player } = this.ctx;
    this.bumps++;
    this.dismounts++;
    const v = this.visual!;
    // Leave the board where it is in the world.
    const pos = player.visualPosition;
    v.root.removeFromParent();
    v.root.position.set(pos.x, Math.max(0, pos.y - SKIN), pos.z);
    v.root.rotation.set(0, player.object.rotation.y, 0);
    this.ctx.root.add(v.root);
    this.leave();
    this.phase = 3;
    this.phaseT = 0;
    // A little hop back, harmless.
    player.verticalVelocity = S.bumpHop;
    player.velocity.x = -this.dirX * S.bumpBack;
    player.velocity.z = -this.dirZ * S.bumpBack;
    this.ctx.sfx.thump();
    this.ctx.fx.sparkles.burst(pos.x, pos.y + 0.8, pos.z, 6, 1.4, 0xffe27a, { gravity: 0.5, life: 0.5, up: 0.6 });
  }

  /** Common part of getting off: the rider is a normal walker again. */
  private leave(): void {
    const { player } = this.ctx;
    this.riding = false;
    player.ride = null;
    player.rideLift = 0;
    player.avatar.setRide(null);
    this.visual?.rest();
    this.ctx.game.setRiding(false);
    this.prevSpeed = 0;
  }

  private hideBoard(): void {
    this.phase = 0;
    this.visual?.root.removeFromParent();
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.riding) this.leave();
    this.visual?.root.removeFromParent();
    if (this.visual) for (const g of this.visual.geometries) g.dispose();
  }
}
