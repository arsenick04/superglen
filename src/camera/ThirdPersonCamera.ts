import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../core/Physics';
import type { Input } from '../input/Input';
import { Quality } from '../core/Quality';
import { PlayerConfig } from '../player/PlayerConfig';
import { Parkour, tableAt } from '../config/parkour';

const DEG = Math.PI / 180;

export const CameraConfig = {
  fov: 55,
  near: 0.1,
  /** Radians of rotation per pixel of mouse movement (pointer locked). */
  mouseSensitivity: 0.0025,
  /** Default distance from the look target (m). */
  // Owner review: Glen was too small on the phone. 4.2 m (was 5 m) makes him ~19% larger on screen
  // at zoom 1. Save.ts migrates zoom values chosen against the old 5 m.
  distance: 4.2,
  /** Closest the camera may get when pulled in by walls (m). */
  minDistance: 1.2,
  /** Look target height above the capsule center (capsule center ~0.55 m, head top ~1.1 m). */
  targetHeight: 0.85,
  /** Pitch limits: positive = camera above the player looking down. */
  minPitch: -10 * DEG,
  maxPitch: 60 * DEG,
  defaultPitch: 18 * DEG,
  /** Exponential follow sharpness (1/s). Higher = tighter. */
  followSharpnessXZ: 14,
  followSharpnessY: 7,
  /** How fast the camera moves back out after a wall stops blocking it (1/s). */
  zoomOutSharpness: 4,
  /** Gap kept between the camera and a wall hit (m). */
  wallPadding: 0.25,

  // --- Auto-follow: a child often never drags the camera, so it eases itself behind the movement ---
  /** Seconds without manual look input before auto-follow may start. */
  followDelay: 1.5,
  /** Player must move faster than this (m/s) horizontally. */
  followMinSpeed: 1.5,
  /** Fastest auto yaw (rad/s). */
  followMaxRate: 1.2,
  /** Yaw rate per radian of misalignment (1/s), capped by followMaxRate. Low = gentle. */
  followGain: 1.0,
  /** Seconds to ramp the follow rate from 0 to full (no sudden swing). */
  followRampTime: 0.8,
  /** Rate starts fading beyond this angle between camera-behind and movement direction (rad)... */
  followFadeFrom: 90 * DEG,
  /** ...and is zero at this angle: moving almost straight toward the camera never spins it. 180 - 35 deg. */
  followCutoff: 145 * DEG,
  /** Look input smaller than this (rad per frame) does not count as manual (mouse jitter). */
  followManualEpsilon: 0.0004,

  // --- Airborne: lift the view so the landing spot stays visible while jumping high ---
  /** Feet height (m) at which the lift starts and where it is full. */
  airStartHeight: 0.8,
  airFullHeight: 3.5,
  /** Extra pitch (looking more downward) and distance at full lift. */
  airExtraPitch: 9 * DEG,
  airExtraDistance: 1.0,
  /** How fast the lift follows (1/s): subtle, smooth. */
  airSharpness: 3,
  /** Flying: the camera pulls further back and up so the ground below stays in view. */
  flyExtraPitch: 10 * DEG,
  flyExtraDistance: 2.8,
  flySharpness: 2.5,

  // --- Manual zoom (wheel, +/-, pinch, buttons, R3/L3): a multiplier on the whole follow distance ---
  zoomMin: 0.6,
  zoomMax: 2,
  /** Sharpness of the zoom easing (1/s) and seconds without change before it is saved. */
  zoomSharpness: 7,
  zoomSaveDelay: 0.6,

  // --- Battle camera (BattleMode): lock-on that keeps the enemy in view ---
  /** How far the look target moves from Glen toward the enemy (0..1). */
  battleLook: 0.42,
  /** Extra pull-back (m): a base plus a share of the Glen-enemy distance, capped. */
  battleBack: 1.4,
  battleBackPerM: 0.4,
  battleBackMax: 8,
  /** Lower, more dramatic pitch while fighting (rad). */
  battlePitch: 11 * DEG,
  /** Auto-orbit sharpness (1/s) and the pause after the child drags the camera himself (s). */
  battleYawSharpness: 2.6,
  battleManualHold: 1.4,
  /** Sharpness of blending in and out of the battle camera (1/s). */
  battleBlendSharpness: 2.2,
  /**
   * Battle lock stability: everything below is critically damped (no overshoot) with a dead zone,
   * so the framing stays calm while the enemy lunges and Glen jumps, flies or is knocked back.
   */
  /** Look target: dead zone (m) around the target and smoothing time (s) on the ground plane / vertically. */
  battleTargetDeadXZ: 0.45,
  battleTargetDeadY: 0.35,
  battleTargetTimeXZ: 0.28,
  battleTargetTimeY: 0.3,
  /** Yaw: dead zone (rad), smoothing time (s) and the fastest turn (rad/s). */
  battleYawDead: 14 * DEG,
  battleYawTime: 0.6,
  battleYawMaxRate: 0.7,
  /** Pitch: smoothing time (s) and the fastest change (rad/s). */
  battlePitchTime: 0.8,
  battlePitchMaxRate: 0.3,
  /** Distance: Glen-enemy separation dead zone (m), smoothing time (s) and fastest change (m/s). */
  battleSepDead: 1,
  battleDistTime: 0.6,
  battleDistMaxRate: 2.5,
  /** Fastest the wall-avoidance pull-in may move the camera during a fight (m/s). */
  battlePullInRate: 6,
  /** Share of the jump height the look target follows, and how much of the air lift is cut during a fight (0..1). */
  battleAirFollow: 0.5,
  battleAirCut: 0.7,

  /** Largest camera shake (m): a per-frame step is about this size, so it stays a gentle rumble, not a jolt. */
  shakeMax: 0.07,

  // --- Landing bump (stomp) ---
  bumpDuration: 0.1,
  /** Peak downward camera dip (m). */
  bumpAmount: 0.07,
} as const;

/** What the camera needs to know about the thing it follows. */
export interface CameraSubject {
  readonly velocity: THREE.Vector3;
  /** Feet height above the ground below (m). */
  readonly airHeight: number;
  /** In flight mode (jets or glide). */
  readonly flying?: boolean;
  /** Rhythm level 0..4 (the camera backs off a little more in the air at higher levels). */
  readonly rhythmLevel?: number;
}

/** Critically damped smoothing toward `to` (no overshoot). `v` holds the velocity between calls. */
function smoothDamp(from: number, to: number, v: { v: number }, smoothTime: number, maxRate: number, dt: number): number {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxChange = maxRate * smoothTime;
  const change = THREE.MathUtils.clamp(from - to, -maxChange, maxChange);
  const target = from - change;
  const temp = (v.v + omega * change) * dt;
  v.v = (v.v - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  if (to - from > 0 === out > to) {
    out = to;
    v.v = 0;
  }
  return out;
}

/** Shrink a delta by a dead zone: zero inside, the excess outside. */
function deadZone(d: number, dead: number): number {
  return Math.abs(d) <= dead ? 0 : d - Math.sign(d) * dead;
}

function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Orbit-follow camera. yaw/pitch come from Input look deltas; follows the player's interpolated
 * position with exponential damping; a Rapier ray keeps it from passing through geometry.
 *
 * yaw = 0 places the camera on +Z of the player looking toward -Z.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch: number = CameraConfig.defaultPitch;
  /**
   * Steering yaw: the frame the player uses to turn stick/keyboard input into a world direction.
   *
   * Why it exists: auto-follow turns the camera toward the heading. If the stick were read relative
   * to the live camera yaw, a steady off-axis stick would keep rotating the heading and the player
   * would walk in circles. So while move input is held, this value is latched and only changes by the
   * MANUAL look delta (finger drag / mouse), never by auto-follow. With no move input it simply
   * follows the camera yaw. Result: with a steady stick the player walks a straight line while the
   * camera swings behind; after releasing and pressing again the frame re-latches to the camera's
   * current yaw, so "forward on the stick" = forward on screen.
   */
  steeringYaw = 0;
  /** Test-only fixed pose [x, y, z, targetX, targetY, targetZ] (smoke-test screenshots from above); null = follow the player. */
  testPose: [number, number, number, number, number, number] | null = null;
  /** Dedicated arena composition; gameplay steering stays aligned to this camera. */
  private arenaPose: [number, number, number, number, number, number] | null = null;
  private arenaFov: number = CameraConfig.fov;

  setArenaPose(pose: [number, number, number, number, number, number] | null, fov: number = CameraConfig.fov): void {
    this.arenaPose = pose;
    this.arenaFov = fov;
    if (pose) this.yaw = this.steeringYaw = Math.atan2(pose[0] - pose[3], pose[2] - pose[5]);
  }

  private readonly target = new THREE.Vector3();
  private currentDistance: number = CameraConfig.distance;
  private initialized = false;
  private manualThisFrame = false;
  private moveWasActive = false;
  private idleTime = 0;
  private followBlend = 0;
  private airLift = 0;
  private flyLift = 0;
  private rhythmEase = 0;
  private bumpTime = 1e9;
  private readonly reducedMotion: boolean;

  // ---- Story framing (cutscenes): look partly at a point, optionally steer yaw and pull back ----
  private frameOn = false;
  private frameBlend = 0;
  private frameWeight = 0.5;
  private frameYaw: number | null = null;
  private frameExtra = 0;
  private framePitch: number | null = null;
  private pitchRestore: number | null = null;
  private readonly framePoint = new THREE.Vector3();

  // ---- Battle lock-on, shake and zoom punch ----
  private battleFocus: THREE.Vector3 | null = null;
  private battleBlend = 0;
  private battleExtra = 0;
  private battleHold = 0;
  private readonly bvx = { v: 0 };
  private readonly bvy = { v: 0 };
  private readonly bvz = { v: 0 };
  private readonly bvYaw = { v: 0 };
  private readonly bvPitch = { v: 0 };
  private readonly bvSep = { v: 0 };
  private readonly bvExtra = { v: 0 };
  private battleSep = 0;
  private shakeAmp = 0;
  private shakeTime = 0;
  private shakeLen = 0;
  private shakeClock = 0;
  private punchAmt = 0;
  private punchTime = 0;
  private punchLen = 0;
  private fovShown: number = CameraConfig.fov;
  /** The camera is locked on an enemy (or still easing out of it). */
  get battleActive(): boolean {
    return this.battleFocus !== null || this.battleBlend > 0.02;
  }
  /** 0..1: how much of the battle camera is in effect (tests, UI). */
  get battleWeight(): number {
    return this.battleBlend;
  }

  /** Distance (m) from the look target to the camera after wall avoidance (tests). */
  get shownDistance(): number {
    return this.currentDistance;
  }

  // ---- Manual zoom ----
  /** Wanted and shown zoom multiplier (1 = the old default distance). */
  zoomTarget = 1;
  zoomNow = 1;
  private zoomSaveIn = -1;
  /** Called (debounced) with the multiplier after the child changed the zoom: the game saves it. */
  onZoomChange: ((z: number) => void) | null = null;

  /** Set the zoom multiplier (clamped). `instant`: no easing. */
  setZoom(z: number, instant = false, notify = true): void {
    const c = CameraConfig;
    this.zoomTarget = THREE.MathUtils.clamp(Number.isFinite(z) ? z : 1, c.zoomMin, c.zoomMax);
    if (instant) this.zoomNow = this.zoomTarget;
    if (notify) this.zoomSaveIn = c.zoomSaveDelay;
  }

  /** Zoom by log steps (positive = farther). */
  zoomBy(logSteps: number): void {
    if (logSteps !== 0) this.setZoom(this.zoomTarget * Math.exp(logSteps));
  }

  private readonly ray: RAPIER.Ray;
  private readonly dir = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();

  constructor(
    private readonly physics: Physics,
    private readonly input: Input,
    private readonly excludeCollider: RAPIER.Collider | undefined,
  ) {
    this.camera = new THREE.PerspectiveCamera(
      CameraConfig.fov,
      window.innerWidth / Math.max(1, window.innerHeight),
      CameraConfig.near,
      Quality.cameraFar,
    );
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.reducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Snap the camera behind a player who faces `facing` (0 = +Z): no easing, no auto-follow carry-over.
   * Used when a level loads.
   */
  snapBehind(facing: number): void {
    let y = (facing + Math.PI) % (Math.PI * 2);
    if (y > Math.PI) y -= Math.PI * 2;
    this.yaw = Math.abs(y) < 1e-9 ? 0 : y; // the default spawn (facing -Z) gives exactly yaw 0
    this.steeringYaw = this.yaw;
    this.pitch = CameraConfig.defaultPitch;
    this.initialized = false;
    this.currentDistance = CameraConfig.distance;
    this.airLift = 0;
    this.flyLift = 0;
    this.rhythmEase = 0;
    this.followBlend = 0;
    this.idleTime = 0;
    this.moveWasActive = false;
    this.manualThisFrame = false;
    this.bumpTime = 1e9;
    this.frameOn = false;
    this.frameBlend = 0;
  }

  /**
   * Gentle cutscene framing: the look target moves `weight` (0..1) of the way from the player to `point`,
   * the camera eases toward `yaw` (camera-on-the-+Z-side convention of `yaw`) and backs off by `distance` m.
   * `null` returns to the normal follow view. Input look is still honoured (it simply fights the ease).
   */
  setFraming(point: THREE.Vector3 | null, opts: { weight?: number; yaw?: number; distance?: number; pitch?: number } = {}): void {
    if (!point) {
      this.frameOn = false;
      if (this.framePitch !== null) this.pitchRestore ??= CameraConfig.defaultPitch;
      this.framePitch = null;
      return;
    }
    if (opts.pitch !== undefined && this.framePitch === null) this.pitchRestore = this.pitch;
    this.framePitch = opts.pitch ?? null;
    this.frameOn = true;
    this.framePoint.copy(point);
    this.frameWeight = opts.weight ?? 0.5;
    this.frameYaw = opts.yaw ?? null;
    this.frameExtra = opts.distance ?? 0;
  }

  /**
   * Lock-on: frame the enemy at `focus` (a live vector the caller keeps updating) together with the player: the camera orbits to stay
   * behind Glen on the line to the enemy, a little further back and lower. `null` returns to the normal follow camera.
   */
  setBattle(focus: THREE.Vector3 | null): void {
    this.battleFocus = focus;
    if (!focus) this.pitchRestore ??= CameraConfig.defaultPitch;
  }

  /** A short shake (m at the camera, seconds). Callers pass 0 when the parents chose "kurangi guncangan". */
  shake(amount: number, seconds: number): void {
    if (this.reducedMotion || amount <= 0) return;
    amount = Math.min(amount, CameraConfig.shakeMax);
    if (amount >= this.shakeAmp * this.shakeLeft()) {
      this.shakeAmp = amount;
      this.shakeLen = this.shakeTime = seconds;
    }
  }

  private shakeLeft(): number {
    return this.shakeLen > 0 ? Math.max(0, this.shakeTime / this.shakeLen) : 0;
  }

  /** A brief zoom-in: the field of view dips by `deg` and returns over `seconds`. */
  punch(deg: number, seconds: number): void {
    if (this.reducedMotion || deg <= 0) return;
    this.punchAmt = deg;
    this.punchLen = this.punchTime = seconds;
  }

  /** Tiny camera dip on a hard landing. Ignored under prefers-reduced-motion. */
  bump(): void {
    if (!this.reducedMotion) this.bumpTime = 0;
  }

  /** Apply look input. Call once per frame BEFORE the fixed steps so movement uses the new yaw. */
  handleInput(): void {
    if (this.arenaPose) {
      this.input.consumeZoom();
      this.input.consumeLookDelta();
      return;
    }
    const zs = this.input.consumeZoom();
    if (zs !== 0) this.zoomBy(zs);
    const look = this.input.consumeLookDelta();
    if (Math.abs(look.x) > CameraConfig.followManualEpsilon || Math.abs(look.y) > CameraConfig.followManualEpsilon) {
      this.manualThisFrame = true;
      this.battleHold = CameraConfig.battleManualHold;
    }
    // Latch the steering frame (see steeringYaw). Once per rendered frame, before the fixed steps,
    // so every fixed step in the frame sees the same value.
    const m = this.input.move;
    const active = Math.hypot(m.x, m.y) >= PlayerConfig.inputDeadZone;
    const before = this.yaw;
    this.yaw -= look.x;
    if (!active) {
      this.steeringYaw = this.yaw;
    } else {
      // On the first active frame, latch to the yaw before this frame's manual delta (includes any
      // auto-follow that happened while the stick was released), then add only the manual delta.
      if (!this.moveWasActive) this.steeringYaw = before;
      this.steeringYaw -= look.x;
    }
    this.moveWasActive = active;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y, CameraConfig.minPitch, CameraConfig.maxPitch);
  }

  /** Call once per frame after the player visual was interpolated. `focus` = capsule center. */
  update(dt: number, focus: THREE.Vector3, subject?: CameraSubject): void {
    if (this.arenaPose) {
      const p = this.arenaPose;
      // Respawn/load may call snapBehind after the level has selected this
      // pose. Reassert the arena heading so movement never rotates while the
      // visible camera remains fixed.
      this.yaw = this.steeringYaw = Math.atan2(p[0] - p[3], p[2] - p[5]);
      this.camera.position.set(p[0], p[1], p[2]);
      this.camera.lookAt(p[3], p[4], p[5]);
      this.camera.fov = this.arenaFov;
      this.camera.updateProjectionMatrix();
      return;
    }
    const c = CameraConfig;
    if (subject) {
      if (this.battleFocus === null && this.battleBlend < 0.05) this.autoFollow(dt, subject);
      const want = THREE.MathUtils.clamp(
        (subject.airHeight - c.airStartHeight) / (c.airFullHeight - c.airStartHeight),
        0,
        1,
      );
      this.airLift += (want - this.airLift) * (1 - Math.exp(-c.airSharpness * dt));
      this.flyLift += ((subject.flying ? 1 : 0) - this.flyLift) * (1 - Math.exp(-c.flySharpness * dt));
      this.rhythmEase += ((subject.rhythmLevel ?? 0) - this.rhythmEase) * (1 - Math.exp(-Parkour.camera.sharpness * dt));
    }
    // In a fight the air lift is mostly off: the vertical follow below keeps Glen framed through jumps instead.
    const lift = this.airLift * (1 - c.battleAirCut * this.battleBlend);
    const fly = this.flyLift;
    this.desiredTarget.set(focus.x, focus.y + c.targetHeight, focus.z);
    if (subject && this.battleBlend > 0.01) {
      // Follow only part of a jump: the target rides between the ground and Glen, so he neither leaves the
      // top of the frame going up nor lands far below the target coming down.
      const air = Math.max(0, subject.airHeight);
      this.desiredTarget.y -= air * (1 - c.battleAirFollow) * this.battleBlend;
    }
    const fk = 1 - Math.exp(-2.2 * dt);
    this.frameBlend += ((this.frameOn ? 1 : 0) - this.frameBlend) * fk;
    if (this.frameBlend > 0.001) {
      this.desiredTarget.lerp(this.framePoint, this.frameBlend * this.frameWeight);
      if (this.frameOn && this.frameYaw !== null) {
        this.yaw += angleDelta(this.yaw, this.frameYaw) * (1 - Math.exp(-1.8 * dt));
      }
    }
    // Battle lock-on: look partway toward the enemy, back off with the distance, orbit behind Glen on the line to it, lower pitch.
    const bf = this.battleFocus;
    this.battleBlend += ((bf ? 1 : 0) - this.battleBlend) * (1 - Math.exp(-c.battleBlendSharpness * dt));
    if (this.battleHold > 0) this.battleHold -= dt;
    let extraWant = 0;
    if (bf) {
      const sepNow = Math.hypot(focus.x - bf.x, focus.z - bf.z);
      if (this.battleBlend < 0.05) this.battleSep = sepNow;
      // Dead zone + damping on the separation: lunges and knock-back do not pump the distance.
      this.battleSep = smoothDamp(this.battleSep, this.battleSep + deadZone(sepNow - this.battleSep, c.battleSepDead), this.bvSep, 0.5, 4, dt);
      extraWant = Math.min(c.battleBackMax, c.battleBack + this.battleSep * c.battleBackPerM);
      const w = c.battleLook * this.battleBlend;
      this.desiredTarget.x += (bf.x - this.desiredTarget.x) * w;
      this.desiredTarget.z += (bf.z - this.desiredTarget.z) * w;
      this.desiredTarget.y += (Math.max(bf.y, focus.y + 0.3) - this.desiredTarget.y) * w * 0.6;
      if (!this.frameOn && this.battleHold <= 0 && sepNow > 0.8) {
        const err = deadZone(angleDelta(this.yaw, Math.atan2(focus.x - bf.x, focus.z - bf.z)), c.battleYawDead);
        this.yaw += smoothDamp(0, err, this.bvYaw, c.battleYawTime, c.battleYawMaxRate, dt) * this.battleBlend;
        this.pitch = smoothDamp(this.pitch, c.battlePitch, this.bvPitch, c.battlePitchTime, c.battlePitchMaxRate, dt);
        this.pitchRestore = null;
      } else {
        this.bvYaw.v = 0;
        this.bvPitch.v = 0;
      }
    }
    this.battleExtra = smoothDamp(this.battleExtra, extraWant, this.bvExtra, c.battleDistTime, c.battleDistMaxRate, dt);
    if (this.frameOn && this.framePitch !== null) {
      this.pitch += (this.framePitch - this.pitch) * (1 - Math.exp(-2 * dt));
    } else if (this.pitchRestore !== null) {
      this.pitch += (this.pitchRestore - this.pitch) * (1 - Math.exp(-2 * dt));
      if (Math.abs(this.pitchRestore - this.pitch) < 0.01) this.pitchRestore = null;
    }

    if (!this.initialized) {
      this.target.copy(this.desiredTarget);
      this.initialized = true;
    } else {
      if (this.battleBlend > 0.01) {
        // Battle: dead zone + critically damped follow, so the view neither snaps nor oscillates.
        const dx = deadZone(this.desiredTarget.x - this.target.x, c.battleTargetDeadXZ);
        const dz = deadZone(this.desiredTarget.z - this.target.z, c.battleTargetDeadXZ);
        const dy = deadZone(this.desiredTarget.y - this.target.y, c.battleTargetDeadY);
        this.target.x = smoothDamp(this.target.x, this.target.x + dx, this.bvx, c.battleTargetTimeXZ, 6.5, dt);
        this.target.z = smoothDamp(this.target.z, this.target.z + dz, this.bvz, c.battleTargetTimeXZ, 6.5, dt);
        this.target.y = smoothDamp(this.target.y, this.target.y + dy, this.bvy, c.battleTargetTimeY, 6, dt);
      } else {
        this.bvx.v = this.bvy.v = this.bvz.v = 0;
        const kxz = 1 - Math.exp(-c.followSharpnessXZ * dt);
        const ky = 1 - Math.exp(-c.followSharpnessY * dt);
        this.target.x += (this.desiredTarget.x - this.target.x) * kxz;
        this.target.z += (this.desiredTarget.z - this.target.z) * kxz;
        this.target.y += (this.desiredTarget.y - this.target.y) * ky;
      }
    }

    // Direction from target to camera.
    // Higher rhythm levels back off a little more, only while in the air (lift).
    const rExtraPitch = lift * tableAt(Parkour.camera.extraPitchDeg, this.rhythmEase) * DEG;
    const rExtraDist = lift * tableAt(Parkour.camera.extraDistance, this.rhythmEase);
    const pitch = Math.min(this.pitch + lift * c.airExtraPitch + fly * c.flyExtraPitch + rExtraPitch, 75 * DEG);
    const cp = Math.cos(pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
    const zk = 1 - Math.exp(-c.zoomSharpness * dt);
    this.zoomNow += (this.zoomTarget - this.zoomNow) * zk;
    if (this.zoomSaveIn >= 0) {
      this.zoomSaveIn -= dt;
      if (this.zoomSaveIn < 0) this.onZoomChange?.(this.zoomTarget);
    }
    const maxDist = this.zoomNow * (c.distance + lift * c.airExtraDistance + fly * c.flyExtraDistance + rExtraDist + this.frameExtra * this.frameBlend + this.battleExtra);

    // Wall avoidance: cast from the target toward the desired camera spot.
    let allowed: number = maxDist;
    this.ray.origin.x = this.target.x;
    this.ray.origin.y = this.target.y;
    this.ray.origin.z = this.target.z;
    this.ray.dir.x = this.dir.x;
    this.ray.dir.y = this.dir.y;
    this.ray.dir.z = this.dir.z;
    const hit = this.physics.world.castRay(
      this.ray,
      maxDist + c.wallPadding,
      true,
      undefined,
      undefined,
      this.excludeCollider,
    );
    if (hit) {
      // Normally keep at least minDistance. When the obstacle is closer than that (a pole right behind the player
      // looking the other way), stop just in front of its surface instead: never put the camera inside it.
      const toi = hit.timeOfImpact;
      allowed = Math.max(Math.min(c.minDistance, toi - 0.12), toi - c.wallPadding, 0.4);
    }

    if (allowed < this.currentDistance) {
      // Pull in immediately: never show the inside of a wall. In a fight the pull-in is rate-limited so a prop
      // passing behind Glen cannot snap the view (the wall padding absorbs the short lag).
      this.currentDistance = this.battleBlend > 0.05 ? Math.max(allowed, this.currentDistance - c.battlePullInRate * dt) : allowed;
    } else {
      this.currentDistance += (allowed - this.currentDistance) * (1 - Math.exp(-c.zoomOutSharpness * dt));
    }

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.currentDistance);
    this.camera.lookAt(this.target);
    if (this.testPose) {
      const t = this.testPose;
      this.camera.position.set(t[0], t[1], t[2]);
      this.camera.lookAt(t[3], t[4], t[5]);
      return;
    }
    if (this.bumpTime < c.bumpDuration) {
      this.bumpTime += dt;
      const t = Math.min(this.bumpTime / c.bumpDuration, 1);
      this.camera.position.y -= Math.sin(t * Math.PI) * c.bumpAmount;
    }
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      this.shakeClock += dt;
      const k = this.shakeLeft();
      const a = this.shakeAmp * k * k;
      const t = this.shakeClock;
      this.camera.position.x += Math.sin(t * 61) * a;
      this.camera.position.y += Math.sin(t * 47 + 1.3) * a * 0.8;
      this.camera.position.z += Math.sin(t * 53 + 2.1) * a;
    }
    let fov: number = c.fov as number;
    if (this.punchTime > 0) {
      this.punchTime = Math.max(0, this.punchTime - dt);
      const u = this.punchLen > 0 ? this.punchTime / this.punchLen : 0;
      fov -= this.punchAmt * Math.sin(Math.min(1, u) * Math.PI) ** 0.7;
    }
    if (Math.abs(fov - this.fovShown) > 0.01) {
      this.fovShown = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Gently turn the camera behind the direction of travel when the player has not touched the look
   * control for a while. Never fights manual input, and never spins when walking toward the camera.
   */
  private autoFollow(dt: number, subject: CameraSubject): void {
    const c = CameraConfig;
    if (this.manualThisFrame) {
      this.idleTime = 0;
      this.followBlend = 0;
      this.manualThisFrame = false;
      return;
    }
    this.idleTime += dt;
    const vx = subject.velocity.x;
    const vz = subject.velocity.z;
    const speed = Math.hypot(vx, vz);
    let active = this.idleTime >= c.followDelay && speed >= c.followMinSpeed;
    let diff = 0;
    let fade = 0;
    if (active) {
      // Camera sits at (sin yaw, cos yaw) from the target, so "behind the movement" is the opposite of velocity.
      diff = angleDelta(this.yaw, Math.atan2(-vx, -vz));
      const a = Math.abs(diff);
      if (a >= c.followCutoff) active = false;
      else fade = a <= c.followFadeFrom ? 1 : 1 - (a - c.followFadeFrom) / (c.followCutoff - c.followFadeFrom);
    }
    if (!active) {
      this.followBlend = Math.max(0, this.followBlend - dt / 0.25);
      return;
    }
    this.followBlend = Math.min(1, this.followBlend + dt / c.followRampTime);
    const ease = this.followBlend * this.followBlend * (3 - 2 * this.followBlend);
    const rate = THREE.MathUtils.clamp(diff * c.followGain, -c.followMaxRate, c.followMaxRate);
    this.yaw += rate * fade * ease * dt;
  }
}
