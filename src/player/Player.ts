import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../core/Physics';
import type { Input } from '../input/Input';
import { PlayerConfig as C } from './PlayerConfig';

const CAPSULE_HALF_HEIGHT = (C.height - 2 * C.radius) / 2; // half length of the cylinder part
const CENTER_TO_FEET = C.height / 2;

/** Shortest signed difference between two angles (radians). */
function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Glen. Kinematic position-based capsule driven by Rapier's KinematicCharacterController.
 *
 * Per fixed step (see core/Game.ts):
 *   fixedUpdate(dt, cameraYaw)  -> computes movement, sets next kinematic translation
 *   physics.step()
 *   postStep()                  -> stores previous/current state for render interpolation
 * Per frame:
 *   updateVisual(alpha)         -> interpolates the mesh between the last two physics states
 */
export class Player {
  /** Visual root; position = capsule center (interpolated). Swap children for the GLB later. */
  readonly object = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;

  /** Horizontal velocity (m/s), world space. */
  readonly velocity = new THREE.Vector3();
  /** Vertical velocity (m/s). Positive = up. */
  verticalVelocity = 0;
  grounded = false;
  /** Body yaw in radians; 0 faces +Z. */
  facing = Math.PI;

  /** Interpolated capsule-center position for rendering and the camera. */
  readonly visualPosition = new THREE.Vector3();

  private readonly world: RAPIER.World;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly groundRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private prevFacing = Math.PI;
  private readonly safePos = new THREE.Vector3();
  private groundedTime = 0;

  // Reused temporaries (no per-step allocations).
  private readonly desired = { x: 0, y: 0, z: 0 };
  private readonly next = { x: 0, y: 0, z: 0 };
  private readonly wishDir = new THREE.Vector3();
  private readonly targetVel = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    physics: Physics,
    private readonly input: Input,
    scene: THREE.Scene,
  ) {
    const world = physics.world;
    this.world = world;
    const s = C.spawn;
    const cy = s.y + CENTER_TO_FEET + C.skinOffset;

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(s.x, cy, s.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, C.radius), this.body);

    this.controller = world.createCharacterController(C.skinOffset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle(C.maxSlopeClimb);
    this.controller.setMinSlopeSlideAngle(C.minSlopeSlide);
    this.controller.enableAutostep(C.stepHeight, C.stepMinWidth, false);
    this.controller.enableSnapToGround(C.snapToGround);
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(true);

    this.currPos.set(s.x, cy, s.z);
    this.prevPos.copy(this.currPos);
    this.visualPosition.copy(this.currPos);
    this.safePos.copy(this.currPos);

    this.buildPlaceholderMesh();
    this.object.position.copy(this.currPos);
    this.object.rotation.y = this.facing;
    scene.add(this.object);
  }

  /** Feet position (bottom of the capsule) of the interpolated visual. */
  getFeetPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.visualPosition).setY(this.visualPosition.y - CENTER_TO_FEET);
  }

  fixedUpdate(dt: number, cameraYaw: number): void {
    // ---- Horizontal: camera-relative input -> target velocity ----------------
    let mx = this.input.move.x;
    let my = this.input.move.y;
    const len = Math.hypot(mx, my);
    if (len < C.inputDeadZone) {
      mx = 0;
      my = 0;
    }
    // Camera forward on the ground plane is (-sin yaw, 0, -cos yaw); right is (cos yaw, 0, -sin yaw).
    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    this.wishDir.set(mx * cosY - my * sinY, 0, -mx * sinY - my * cosY);
    this.targetVel.copy(this.wishDir).multiplyScalar(C.walkSpeed);

    const hasInput = mx !== 0 || my !== 0;
    let rate = hasInput ? C.acceleration : C.deceleration;
    if (!this.grounded) rate *= C.airControl;
    // Move velocity toward target by at most rate*dt (frame-rate independent at fixed dt).
    this.tmp.subVectors(this.targetVel, this.velocity);
    const diff = this.tmp.length();
    const maxDelta = rate * dt;
    if (diff <= maxDelta || diff < 1e-6) this.velocity.copy(this.targetVel);
    else this.velocity.addScaledVector(this.tmp, maxDelta / diff);

    // ---- Facing: turn smoothly toward the movement direction -----------------
    this.prevFacing = this.facing;
    if (hasInput) {
      const targetYaw = Math.atan2(this.wishDir.x, this.wishDir.z);
      const d = angleDelta(this.facing, targetYaw);
      const step = C.turnSpeed * dt;
      this.facing += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }

    // ---- Vertical ------------------------------------------------------------
    if (this.grounded && this.verticalVelocity <= 0) {
      this.verticalVelocity = -C.groundStickSpeed;
    } else {
      this.verticalVelocity = Math.max(this.verticalVelocity - C.gravity * dt, -C.maxFallSpeed);
    }
    // [A3 JUMP] Add jump / double jump here: set this.verticalVelocity to a positive
    // launch speed when this.input.wasPressed('jump') (and the jump is allowed).
    // [A3 STOMP] Landing stomp: detect `!wasGrounded && this.grounded` after the move below.

    // ---- Move through the character controller -------------------------------
    this.desired.x = this.velocity.x * dt;
    this.desired.y = this.verticalVelocity * dt;
    this.desired.z = this.velocity.z * dt;
    this.controller.computeColliderMovement(this.collider, this.desired);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    // Bumped a ceiling while going up: stop rising.
    if (this.desired.y > 0 && moved.y < this.desired.y * 0.5) this.verticalVelocity = 0;
    // Blocked horizontally (wall): drop the velocity we could not use so we do not "push" forever.
    if (dt > 0) {
      const vx = moved.x / dt;
      const vz = moved.z / dt;
      if (Math.abs(vx) < Math.abs(this.velocity.x)) this.velocity.x = vx;
      if (Math.abs(vz) < Math.abs(this.velocity.z)) this.velocity.z = vz;
    }

    const p = this.body.translation();
    this.next.x = p.x + moved.x;
    this.next.y = p.y + moved.y;
    this.next.z = p.z + moved.z;
    this.body.setNextKinematicTranslation(this.next);

    // ---- Safety: remember safe ground, respawn after a fall ------------------
    if (this.grounded) {
      this.groundedTime += dt;
      if (this.groundedTime >= C.safeGroundTime && this.hasGroundBelowCenter(this.next)) {
        this.safePos.set(this.next.x, this.next.y, this.next.z);
      }
    } else {
      this.groundedTime = 0;
    }
    if (this.next.y < C.respawnY) this.respawn();
  }

  /**
   * True if solid ground is directly under the capsule center. Prevents saving a "safe" spot
   * while balancing on a ledge edge (respawning there would just fall off again).
   */
  private hasGroundBelowCenter(center: { x: number; y: number; z: number }): boolean {
    this.groundRay.origin.x = center.x;
    this.groundRay.origin.y = center.y;
    this.groundRay.origin.z = center.z;
    const hit = this.world.castRay(this.groundRay, CENTER_TO_FEET + 0.25, true, undefined, undefined, this.collider);
    return hit !== null;
  }

  /** Call right after physics.step(). */
  postStep(): void {
    this.prevPos.copy(this.currPos);
    const p = this.body.translation();
    this.currPos.set(p.x, p.y, p.z);
  }

  /** Interpolate the visual between the last two physics states. alpha in [0,1]. */
  updateVisual(alpha: number): void {
    this.visualPosition.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.position.copy(this.visualPosition);
    this.object.rotation.y = this.prevFacing + angleDelta(this.prevFacing, this.facing) * alpha;
  }

  /** Teleport to a capsule-center position without interpolation streaks. */
  teleport(x: number, y: number, z: number): void {
    this.next.x = x;
    this.next.y = y;
    this.next.z = z;
    this.body.setTranslation(this.next, true);
    this.body.setNextKinematicTranslation(this.next);
    this.currPos.set(x, y, z);
    this.prevPos.copy(this.currPos);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = false;
    this.groundedTime = 0;
  }

  respawn(): void {
    this.teleport(this.safePos.x, this.safePos.y + 0.5, this.safePos.z);
  }

  /** Placeholder visual for "Glen": orange capsule with a darker face marker. */
  private buildPlaceholderMesh(): void {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.6 });
    const faceMat = new THREE.MeshStandardMaterial({ color: 0x9a4a0a, roughness: 0.7 });

    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(C.radius, CAPSULE_HALF_HEIGHT * 2, 6, 16), bodyMat);
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    capsule.name = 'body';
    this.object.add(capsule);

    // Nose marker on the +Z side (local forward) at about eye height.
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), faceMat);
    nose.position.set(0, C.height * 0.18, C.radius * 0.95);
    nose.castShadow = true;
    nose.name = 'nose';
    this.object.add(nose);
  }
}
