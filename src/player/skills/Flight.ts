import * as THREE from 'three';
import type { Sparkles } from '../../world/bab1/Fx';
import type { SkillHub } from './Skills';

/**
 * Flight tuning. Units: metres, seconds.
 *
 * DEVIATION from the design text ("hold Lompat more than 1 second"): Superglen's whole jump lasts ~0.78 s, so a full
 * second would only work after a double jump. `holdTime` counts from the jump press itself, and 0.45 s puts the jets
 * on near the apex of a single jump (press and keep holding: jump, then the jets kick in).
 */
export const FlightConfig = {
  holdTime: 0.45,
  /** Default ceiling above the ground below (m). Levels override with `player.flight.maxFlyHeight`. */
  defaultMaxHeight: 12,
  riseSpeed: 4,
  /** Velocity smoothing (1/s) while the jets are on / during the scripted descent of `autoLaunch`. */
  riseEase: 6,
  glideEase: 5,
  /** Within this distance under the ceiling the rise slows to a hover (m). */
  easeDistance: 1.2,
  /** Fastest descent when above the ceiling (m/s). */
  ceilingPushDown: 3,
  /** Gentle descent of the SCRIPTED launch (`autoLaunch`) only; a real release just falls (m/s). */
  glideSpeed: 2.2,
  /**
   * After the jets are released (button let go) the character is "airborne after flight": it falls with this share of the
   * normal fall gravity (Parkour.gravityUp * Parkour.fallMultiplier) and never faster than `afterFlightMaxFall` (m/s).
   * Clearly a drop (no hover), but not a stone; the landing stays below the stomp / boing impact speeds.
   */
  afterFlightGravityFactor: 0.5,
  afterFlightMaxFall: 7,
  /** A fresh PRESS while airborne after a flight restarts the jets at once (no hold time). Set false for the old hold rule. */
  reigniteOnPress: true,
  flySpeed: 7,
  accel: 16,
  decel: 14,
  /** Gap kept under a real ceiling (m). */
  ceilingClearance: 0.12,
  /** How fast the ceiling follows a changing ground height (1/s). */
  ceilingSharpness: 5,
  /** Lean of the body into the movement (rad at full speed). */
  tilt: 0.35,
  bobAmplitude: 0.05,
  bobHz: 1.6,
  /** Distance from the level bounds where the player starts to be eased back (m). */
  boundsMargin: 3,
  boundsPush: 3,
  /** The ground probe reaches this far beyond the ceiling (m). */
  probePad: 14,
} as const;

/** Level-provided flight box. Reaching its edge eases the player back; there is never a hard wall. */
export interface FlightBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const OFF = 0;
const JETS = 1;
const GLIDE = 2;

/** Per-step facts the Player fills in before calling `step` (a persistent object: no allocation). */
export interface FlightInput {
  /** Superglen mode and (unlocked or scripted). */
  can: boolean;
  jumpDown: boolean;
  jumpPressed: boolean;
  grounded: boolean;
  /** Feet height (world Y) and the ground height below (NaN when there is none). */
  feetY: number;
  groundY: number;
  /** Free distance the capsule can still rise before a real ceiling (m), Infinity if none. */
  ceilGap: number;
  /** Current vertical velocity of the player. */
  vy: number;
}

const FLAME_X = 0.13;
const FLAME_Y = -0.5;
const FLAME_Z = -0.12;

/**
 * Jet-booster flight (Superglen only, once `enabled`).
 *
 *   hold Lompat (0.45 s, counted from the press)  -> jets on: gentle rise to the ceiling, then hover
 *   stick / keys                                  -> move horizontally (camera relative), no input = hover in place
 *   release Lompat                                -> the jets stop AT ONCE; "airborne after flight" (`afterFlight`): the
 *                                                    character falls with softer gravity and a capped fall speed
 *                                                    (afterFlightGravityFactor / afterFlightMaxFall), full air control
 *   press Lompat again while afterFlight          -> the jets re-ignite IMMEDIATELY (no hold), holding keeps rising
 *   afterFlight ends on: landing, mantle, re-ignition, teleport / level load / mode change (reset()).
 *
 * PRECEDENCE: the first ignition from the ground (or a normal jump) still needs the 0.45 s hold, so a tap is a jump
 * and the air jump / rhythm jumps are untouched. While afterFlight, a press is ALWAYS the re-ignite: Flight.step runs
 * before the Player's jump buffer and ignites in the same step, and the Player discards the buffered press while the
 * jets are in charge, so the air jump can never eat the re-ignite press (the air jump is still available after a
 * flight only if the child never presses again, which then is simply not needed).
 *
 * Level API:
 *   player.flight.enabled = true            unlock (or ctx.game.setSkills({ fly: true }))
 *   player.flight.maxFlyHeight = 8          ceiling above the ground below (m), reset to 12 on every level load
 *   player.flight.bounds = { minX, ... }    optional flight box (eased back at the edge)
 *   player.flight.isFlying / jetsOn         in flight mode / jets burning
 *   player.flight.autoLaunch(20)            scripted launch: rises (up to the ceiling), hovers briefly, then glides down by itself
 *   player.skills.on('flightStart' | 'flightStop', fn)
 */
export class Flight {
  maxFlyHeight: number = FlightConfig.defaultMaxHeight;
  bounds: FlightBounds | null = null;
  /** Filled by the Player every fixed step. */
  readonly inp: FlightInput = { can: false, jumpDown: false, jumpPressed: false, grounded: false, feetY: 0, groundY: NaN, ceilGap: Infinity, vy: 0 };
  /** Vertical velocity the flight wants this step (the Player applies it). */
  vy = 0;
  /** Smoothed lean of the body (rad), applied by the Player to its spin group. */
  tiltX = 0;
  tiltZ = 0;
  /** Vertical bob of the body while hovering (m). */
  bob = 0;
  /** Shared particle system for the trail (set by the Game). */
  sparkles: Sparkles | null = null;

  private state: number = OFF;
  private heldTime = 0;
  private armed = false;
  private ceilY = 0;
  private ceilInit = false;
  private lastGroundY = 0;
  private forceHold = false;
  private autoTarget = 0;
  private autoCeilTimer = 0;
  private grace = 0;
  /** Jets were burning in this airtime and have been released: soft fall, press = instant re-ignite. */
  private _afterFlight = false;
  private bobT = 0;
  private bobAmp = 0;
  private flameAmount = 0;
  private flameT = 0;
  private trailT = 0;
  private readonly flames = new THREE.Group();
  private readonly flameMeshes: THREE.Mesh[] = [];
  private warming = false;
  /** The current flight belongs to `autoLaunch`: it ends in a gentle scripted glide (controls are locked there). */
  private scripted = false;
  /** True for the one fixed step in which a released button ended the flight (the Player cuts upward speed). */
  justReleased = false;

  constructor(private readonly hub: SkillHub) {}

  /** Unlock flag (mirrors `player.skills.unlocked.fly`). */
  get enabled(): boolean {
    return this.hub.unlocked.fly;
  }
  set enabled(v: boolean) {
    this.hub.unlocked.fly = v;
  }

  /** In flight mode: jets burning or gliding down. */
  get isFlying(): boolean {
    return this.state !== OFF;
  }
  /** Airborne after a real flight (released the button): the Player uses the soft fall while this is true and not flying. */
  get afterFlight(): boolean {
    return this._afterFlight && this.state === OFF;
  }
  /** Leave the after-flight state (mantle, landing). */
  clearAfterFlight(): void {
    this._afterFlight = false;
  }
  /** Jets burning right now. */
  get jetsOn(): boolean {
    return this.state === JETS;
  }
  /** A scripted launch (autoLaunch) is still pushing. */
  get forced(): boolean {
    return this.forceHold;
  }
  /** How far below the player the ground probe must reach while flying (m). */
  get probeRange(): number {
    return this.maxFlyHeight + FlightConfig.probePad;
  }

  /** Back to the defaults for the next level. */
  resetLevelSettings(): void {
    this.maxFlyHeight = FlightConfig.defaultMaxHeight;
    this.bounds = null;
  }

  /**
   * Scripted launch for the story: rise up to `height` metres above the ground (capped by the ceiling; hitting
   * the ceiling is the comic "first try" moment), hover briefly, then glide down. Works without the unlock.
   */
  autoLaunch(height: number): void {
    this.forceHold = true;
    this.scripted = true;
    this.autoTarget = height;
    this.autoCeilTimer = 0;
    this.grace = 0.25;
    this.ignite(this.inp.vy);
  }

  /** Cut everything now (teleport, respawn, mode change). Emits `flightStop` if the jets were burning. */
  reset(): void {
    this.end();
    this.forceHold = false;
    this.scripted = false;
    this.justReleased = false;
    this._afterFlight = false;
    this.heldTime = 0;
    this.armed = false;
    this.ceilInit = false;
    this.tiltX = this.tiltZ = this.bob = this.bobAmp = 0;
  }

  /** One fixed step. Reads `inp`, updates the state and `vy`. */
  step(dt: number): void {
    const i = this.inp;
    this.justReleased = false;
    if (i.jumpPressed) {
      this.heldTime = 0;
      this.armed = true;
    }
    if (i.jumpDown) this.heldTime += dt;
    else {
      this.armed = false;
      this.heldTime = 0;
    }
    if (this.grace > 0) this.grace -= dt;
    if (!Number.isNaN(i.groundY)) this.lastGroundY = i.groundY;

    if (i.grounded && this.grace <= 0) this._afterFlight = false;
    if (this.state === OFF) {
      if (!i.can) this._afterFlight = false;
      const reignite = FlightConfig.reigniteOnPress && this._afterFlight && i.jumpPressed;
      if (i.can && !i.grounded && (reignite || (this.armed && this.heldTime >= FlightConfig.holdTime))) this.ignite(i.vy);
      else return;
    }

    if (!i.can) {
      this.forceHold = false;
      this.end();
      return;
    }
    if (i.grounded && this.grace <= 0) {
      this.forceHold = false;
      this.end(); // landed
      return;
    }

    // Ceiling above the ground below, smoothed so a roof edge does not snap it.
    const target = this.lastGroundY + this.maxFlyHeight;
    if (!this.ceilInit) {
      this.ceilY = target;
      this.ceilInit = true;
    } else {
      this.ceilY += (target - this.ceilY) * (1 - Math.exp(-FlightConfig.ceilingSharpness * dt));
    }
    const airH = i.feetY - this.lastGroundY;
    let room = Math.min(this.ceilY - i.feetY, i.ceilGap - FlightConfig.ceilingClearance);

    // Scripted launch: let go at the wanted height, or shortly after bumping the ceiling.
    if (this.forceHold) {
      if (airH >= this.autoTarget - 0.05) this.forceHold = false;
      else if (room < 0.1) {
        this.autoCeilTimer += dt;
        if (this.autoCeilTimer > 0.6) this.forceHold = false;
      }
    }

    const hold = i.jumpDown || this.forceHold;
    if (hold && this.state === GLIDE) {
      if (i.jumpDown) this.scripted = false; // the child took over
      this.ignite(i.vy);
    } else if (!hold && this.state === JETS) {
      if (this.scripted) {
        this.state = GLIDE; // scripted launch: gentle descent while the controls are locked
        this.hub.emit('flightStop', undefined);
      } else {
        this.justReleased = true;
        this._afterFlight = true;
        this.end(); // released: stop at once, the Player falls with normal gravity
        return;
      }
    }

    let want: number;
    let ease: number;
    if (this.state === JETS) {
      ease = FlightConfig.riseEase;
      if (this.forceHold) room = Math.min(room, this.autoTarget - airH);
      if (room >= 0) want = FlightConfig.riseSpeed * Math.min(1, room / FlightConfig.easeDistance);
      else want = Math.max(-FlightConfig.ceilingPushDown, room * 3);
    } else {
      ease = FlightConfig.glideEase;
      want = -FlightConfig.glideSpeed;
    }
    this.vy += (want - this.vy) * (1 - Math.exp(-ease * dt));
    if (this.state === GLIDE && this.vy < -FlightConfig.glideSpeed) this.vy = -FlightConfig.glideSpeed;
  }

  /**
   * Ease the wanted horizontal velocity away from the level bounds (never a hard stop).
   * `target` is the stick-driven velocity (m/s) and is modified in place.
   */
  limitVelocity(px: number, pz: number, target: THREE.Vector3): void {
    const b = this.bounds;
    if (!b) return;
    const m = FlightConfig.boundsMargin;
    const push = FlightConfig.boundsPush;
    let t = (px - (b.maxX - m)) / m;
    if (t > 0) {
      t = Math.min(t, 1.5);
      if (target.x > 0) target.x *= Math.max(0, 1 - t);
      target.x -= t * push;
    }
    t = ((b.minX + m) - px) / m;
    if (t > 0) {
      t = Math.min(t, 1.5);
      if (target.x < 0) target.x *= Math.max(0, 1 - t);
      target.x += t * push;
    }
    t = (pz - (b.maxZ - m)) / m;
    if (t > 0) {
      t = Math.min(t, 1.5);
      if (target.z > 0) target.z *= Math.max(0, 1 - t);
      target.z -= t * push;
    }
    t = ((b.minZ + m) - pz) / m;
    if (t > 0) {
      t = Math.min(t, 1.5);
      if (target.z < 0) target.z *= Math.max(0, 1 - t);
      target.z += t * push;
    }
  }

  // ---- visuals ----------------------------------------------------------------------------------------

  /** Build the two flames below the body. `parent` is the player's spin group (they tilt with the body). */
  attach(parent: THREE.Object3D): void {
    const geo = new THREE.ConeGeometry(0.13, 0.7, 10, 1);
    geo.rotateX(Math.PI);
    geo.translate(0, -0.35, 0);
    const outer = new THREE.MeshBasicMaterial({ color: 0xff8a1f, fog: false });
    const inner = new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false });
    for (const sx of [-1, 1]) {
      const o = new THREE.Mesh(geo, outer);
      o.position.set(sx * FLAME_X, FLAME_Y, FLAME_Z);
      const n = new THREE.Mesh(geo, inner);
      n.position.copy(o.position);
      n.scale.set(0.55, 0.7, 0.55);
      this.flames.add(o, n);
      this.flameMeshes.push(o, n);
    }
    this.flames.visible = false;
    parent.add(this.flames);
  }

  /** Show the flames for one shader pre-warm frame (the Game calls this around Renderer.prewarm). */
  warm(on: boolean): void {
    this.warming = on;
    this.flames.visible = on || this.flameAmount > 0.02;
  }

  /**
   * Per rendered frame: flames, trail, lean and hover bob. `pos` is the interpolated capsule centre,
   * `vx/vz` the horizontal velocity and `yaw` the interpolated body yaw.
   */
  updateVisual(dt: number, pos: THREE.Vector3, vx: number, vz: number, yaw: number, vy: number): void {
    const jets = this.state === JETS;
    this.flameAmount += ((jets ? 1 : 0) - this.flameAmount) * Math.min(1, dt * 14);
    const fa = this.flameAmount;
    this.flames.visible = this.warming || fa > 0.02;
    if (fa > 0.02) {
      this.flameT += dt;
      for (let k = 0; k < this.flameMeshes.length; k++) {
        const flick = 0.82 + 0.28 * Math.sin(this.flameT * 38 + k * 1.9) + 0.1 * Math.sin(this.flameT * 71 + k);
        const base = k % 2 === 0 ? 1 : 0.55;
        this.flameMeshes[k].scale.set(base * (0.9 + 0.1 * flick), (k % 2 === 0 ? 1 : 0.7) * fa * flick, base * (0.9 + 0.1 * flick));
      }
    }

    // Lean into the movement (local forward / right components of the velocity).
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const fwd = vx * s + vz * c;
    const right = vx * c - vz * s;
    const flying = this.state !== OFF;
    const lim = FlightConfig.flySpeed;
    const wantX = flying ? THREE.MathUtils.clamp(fwd / lim, -1, 1) * FlightConfig.tilt : 0;
    const wantZ = flying ? -THREE.MathUtils.clamp(right / lim, -1, 1) * FlightConfig.tilt * 0.8 : 0;
    const k = Math.min(1, dt * 7);
    this.tiltX += (wantX - this.tiltX) * k;
    this.tiltZ += (wantZ - this.tiltZ) * k;

    // Gentle bob while hovering (visual only: the physics stays still).
    const still = 1 - Math.min(1, Math.hypot(vx, vz) / 2.5 + Math.abs(vy) / 1.2);
    this.bobAmp += ((jets ? still : 0) * FlightConfig.bobAmplitude - this.bobAmp) * Math.min(1, dt * 5);
    this.bobT += dt;
    this.bob = this.bobAmp * Math.sin(this.bobT * Math.PI * 2 * FlightConfig.bobHz);

    // Soft particle trail under the jets.
    if (jets && this.sparkles && dt > 0) {
      this.trailT += dt;
      while (this.trailT >= 0.04) {
        this.trailT -= 0.04;
        const sx = Math.random() < 0.5 ? -FLAME_X : FLAME_X;
        const lx = sx;
        const lz = FLAME_Z - 0.1;
        const wx = pos.x + lx * c + lz * s;
        const wz = pos.z - lx * s + lz * c;
        const pick = Math.random();
        const col = pick < 0.4 ? 0xffd23f : pick < 0.8 ? 0xff8a1f : 0xfff3d6;
        this.sparkles.spawn(wx, pos.y - 0.65, wz, (Math.random() - 0.5) * 0.5, -1.2 - Math.random() * 0.8, (Math.random() - 0.5) * 0.5, col, 0.5 + Math.random() * 0.3, -0.3);
      }
    }
  }

  // ---- internals ----------------------------------------------------------------------------------------

  private ignite(vy: number): void {
    const was = this.state;
    this.state = JETS;
    this._afterFlight = false;
    if (was === OFF) {
      this.vy = vy;
      this.hub.stats.flights++;
    }
    if (was !== JETS) this.hub.emit('flightStart', undefined);
  }

  private end(): void {
    this.scripted = false;
    if (this.state === OFF) return;
    const jets = this.state === JETS;
    this.state = OFF;
    this.forceHold = false;
    if (jets) this.hub.emit('flightStop', undefined);
  }
}
