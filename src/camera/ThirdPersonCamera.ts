import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../core/Physics';
import type { Input } from '../input/Input';
import { Quality } from '../core/Quality';
import { PlayerConfig } from '../player/PlayerConfig';

const DEG = Math.PI / 180;

export const CameraConfig = {
  fov: 55,
  near: 0.1,
  /** Radians of rotation per pixel of mouse movement (pointer locked). */
  mouseSensitivity: 0.0025,
  /** Default distance from the look target (m). */
  distance: 6,
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

  private readonly target = new THREE.Vector3();
  private currentDistance: number = CameraConfig.distance;
  private initialized = false;
  private manualThisFrame = false;
  private moveWasActive = false;
  private idleTime = 0;
  private followBlend = 0;
  private airLift = 0;
  private flyLift = 0;
  private bumpTime = 1e9;
  private readonly reducedMotion: boolean;

  // ---- Story framing (cutscenes): look partly at a point, optionally steer yaw and pull back ----
  private frameOn = false;
  private frameBlend = 0;
  private frameWeight = 0.5;
  private frameYaw: number | null = null;
  private frameExtra = 0;
  private readonly framePoint = new THREE.Vector3();

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
  setFraming(point: THREE.Vector3 | null, opts: { weight?: number; yaw?: number; distance?: number } = {}): void {
    if (!point) {
      this.frameOn = false;
      return;
    }
    this.frameOn = true;
    this.framePoint.copy(point);
    this.frameWeight = opts.weight ?? 0.5;
    this.frameYaw = opts.yaw ?? null;
    this.frameExtra = opts.distance ?? 0;
  }

  /** Tiny camera dip on a hard landing. Ignored under prefers-reduced-motion. */
  bump(): void {
    if (!this.reducedMotion) this.bumpTime = 0;
  }

  /** Apply look input. Call once per frame BEFORE the fixed steps so movement uses the new yaw. */
  handleInput(): void {
    const look = this.input.consumeLookDelta();
    if (Math.abs(look.x) > CameraConfig.followManualEpsilon || Math.abs(look.y) > CameraConfig.followManualEpsilon) {
      this.manualThisFrame = true;
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
    const c = CameraConfig;
    if (subject) {
      this.autoFollow(dt, subject);
      const want = THREE.MathUtils.clamp(
        (subject.airHeight - c.airStartHeight) / (c.airFullHeight - c.airStartHeight),
        0,
        1,
      );
      this.airLift += (want - this.airLift) * (1 - Math.exp(-c.airSharpness * dt));
      this.flyLift += ((subject.flying ? 1 : 0) - this.flyLift) * (1 - Math.exp(-c.flySharpness * dt));
    }
    const lift = this.airLift;
    const fly = this.flyLift;
    this.desiredTarget.set(focus.x, focus.y + c.targetHeight, focus.z);
    const fk = 1 - Math.exp(-2.2 * dt);
    this.frameBlend += ((this.frameOn ? 1 : 0) - this.frameBlend) * fk;
    if (this.frameBlend > 0.001) {
      this.desiredTarget.lerp(this.framePoint, this.frameBlend * this.frameWeight);
      if (this.frameOn && this.frameYaw !== null) {
        this.yaw += angleDelta(this.yaw, this.frameYaw) * (1 - Math.exp(-1.8 * dt));
      }
    }

    if (!this.initialized) {
      this.target.copy(this.desiredTarget);
      this.initialized = true;
    } else {
      const kxz = 1 - Math.exp(-c.followSharpnessXZ * dt);
      const ky = 1 - Math.exp(-c.followSharpnessY * dt);
      this.target.x += (this.desiredTarget.x - this.target.x) * kxz;
      this.target.z += (this.desiredTarget.z - this.target.z) * kxz;
      this.target.y += (this.desiredTarget.y - this.target.y) * ky;
    }

    // Direction from target to camera.
    const pitch = Math.min(this.pitch + lift * c.airExtraPitch + fly * c.flyExtraPitch, 75 * DEG);
    const cp = Math.cos(pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
    const maxDist = c.distance + lift * c.airExtraDistance + fly * c.flyExtraDistance + this.frameExtra * this.frameBlend;

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
      this.currentDistance = allowed; // pull in immediately: never show the inside of a wall
    } else {
      this.currentDistance += (allowed - this.currentDistance) * (1 - Math.exp(-c.zoomOutSharpness * dt));
    }

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.currentDistance);
    this.camera.lookAt(this.target);
    if (this.bumpTime < c.bumpDuration) {
      this.bumpTime += dt;
      const t = Math.min(this.bumpTime / c.bumpDuration, 1);
      this.camera.position.y -= Math.sin(t * Math.PI) * c.bumpAmount;
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
