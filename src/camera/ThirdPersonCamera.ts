import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../core/Physics';
import type { Input } from '../input/Input';
import { Quality } from '../core/Quality';

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
} as const;

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

  private readonly target = new THREE.Vector3();
  private currentDistance: number = CameraConfig.distance;
  private initialized = false;

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
  }

  /** Apply look input. Call once per frame BEFORE the fixed steps so movement uses the new yaw. */
  handleInput(): void {
    const look = this.input.consumeLookDelta();
    this.yaw -= look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y, CameraConfig.minPitch, CameraConfig.maxPitch);
  }

  /** Call once per frame after the player visual was interpolated. `focus` = capsule center. */
  update(dt: number, focus: THREE.Vector3): void {
    const c = CameraConfig;
    this.desiredTarget.set(focus.x, focus.y + c.targetHeight, focus.z);

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
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // Wall avoidance: cast from the target toward the desired camera spot.
    let allowed: number = c.distance;
    this.ray.origin.x = this.target.x;
    this.ray.origin.y = this.target.y;
    this.ray.origin.z = this.target.z;
    this.ray.dir.x = this.dir.x;
    this.ray.dir.y = this.dir.y;
    this.ray.dir.z = this.dir.z;
    const hit = this.physics.world.castRay(
      this.ray,
      c.distance + c.wallPadding,
      true,
      undefined,
      undefined,
      this.excludeCollider,
    );
    if (hit) allowed = Math.max(c.minDistance, hit.timeOfImpact - c.wallPadding);

    if (allowed < this.currentDistance) {
      this.currentDistance = allowed; // pull in immediately: never show the inside of a wall
    } else {
      this.currentDistance += (allowed - this.currentDistance) * (1 - Math.exp(-c.zoomOutSharpness * dt));
    }

    this.camera.position.copy(this.target).addScaledVector(this.dir, this.currentDistance);
    this.camera.lookAt(this.target);
  }
}
