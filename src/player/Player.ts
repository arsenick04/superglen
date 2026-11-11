import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../core/Physics';
import type { Input } from '../input/Input';
import { PlayerConfig as C, ModeTunings, type ModeTuning, type PlayerMode } from './PlayerConfig';

const CAPSULE_HALF_HEIGHT = (C.height - 2 * C.radius) / 2; // half length of the cylinder part
const CENTER_TO_FEET = C.height / 2;

/** Shortest signed difference between two angles (radians). */
function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Fired when Superglen lands hard. The object is reused: copy values, do not keep the reference. */
export interface StompEvent {
  /** Feet position where the stomp landed. */
  x: number;
  y: number;
  z: number;
  /** Radius (m) within which enemies should react. */
  radius: number;
  /** Downward speed at impact (m/s). */
  impact: number;
}

export type StompListener = (e: StompEvent) => void;

/** Squash/stretch and pop spring constants. */
const SPRING_K = 300;
const SPRING_C = 16;
const SHADOW_BASE_RADIUS = 0.4;
const SHADOW_PROBE_RANGE = 12;

/**
 * Glen / Superglen. Kinematic position-based capsule driven by Rapier's KinematicCharacterController.
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

  // ---- Mode and jump state (see PlayerConfig for the numbers) -------------
  private _mode: PlayerMode = 'glen';
  private tuning: ModeTuning = ModeTunings.glen;
  private timeSinceGrounded = 0;
  private airTime = 0;
  private jumpBufferTimer = 0;
  private doubleUsed = false;
  private snapEnabled = true;
  /** Height of the feet above the ground below (m), 0 when grounded. Used by the camera. */
  airHeight = 0;
  private groundY = 0;
  private hasGround = false;

  /** Counters and peak for the debug handle / tests. */
  jumps = 0;
  doubleJumps = 0;
  stomps = 0;
  landings = 0;
  /** Highest feet Y since the last first-jump takeoff. */
  peakFeetY = 0;

  // ---- Visual feedback ------------------------------------------------------
  private readonly squashGroup = new THREE.Group();
  private readonly spinGroup = new THREE.Group();
  private bodyMat!: THREE.MeshStandardMaterial;
  private faceMat!: THREE.MeshStandardMaterial;
  private belt!: THREE.Mesh;
  private shadow!: THREE.Mesh;
  private shadowMat!: THREE.MeshBasicMaterial;
  private squash = 0;
  private squashVel = 0;
  private pop = 0;
  private popVel = 0;
  private spinning = false;
  private spinT = 0;
  private readonly stompListeners: StompListener[] = [];
  private readonly stompEvent: StompEvent = { x: 0, y: 0, z: 0, radius: C.stompRadius, impact: 0 };

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
    scene.add(this.shadow);
    this.peakFeetY = s.y;
    this.setMode('glen');
  }

  get mode(): PlayerMode {
    return this._mode;
  }

  /** Subscribe to Superglen landing stomps. */
  onStomp(cb: StompListener): void {
    this.stompListeners.push(cb);
  }

  /** Switch Glen <-> Superglen: colours, belt, tuning, and a small scale pop. Safe mid-air. */
  setMode(mode: PlayerMode): void {
    const changed = mode !== this._mode;
    this._mode = mode;
    this.tuning = ModeTunings[mode];
    this.bodyMat.color.setHex(this.tuning.color);
    this.faceMat.color.setHex(this.tuning.faceColor);
    this.belt.visible = mode === 'superglen';
    if (changed) {
      this.popVel = 7;
      // A spin that belongs to Superglen's air jump must not linger after switching away.
      if (mode === 'glen') {
        this.spinning = false;
        this.spinGroup.rotation.x = 0;
      }
    }
  }

  /** Feet position (bottom of the capsule) of the interpolated visual. */
  getFeetPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.visualPosition).setY(this.visualPosition.y - CENTER_TO_FEET);
  }

  fixedUpdate(dt: number, cameraYaw: number): void {
    const T = this.tuning;
    // ---- Horizontal: camera-relative input -> target velocity ----------------
    let mx = this.input.move.x;
    let my = this.input.move.y;
    const len = Math.hypot(mx, my);
    if (len < C.inputDeadZone) {
      mx = 0;
      my = 0;
    }
    const hasInput = mx !== 0 || my !== 0;
    // Camera forward on the ground plane is (-sin yaw, 0, -cos yaw); right is (cos yaw, 0, -sin yaw).
    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    if (hasInput) {
      // Direction from the stick, speed from a mild response curve: small push = slow walk,
      // full run from analogFullAt deflection. Keyboard (length 1) always runs.
      const dx = mx / len;
      const dy = my / len;
      const t = Math.min(1, len / C.analogFullAt);
      const speed = T.runSpeed * (C.analogMinSpeed + (1 - C.analogMinSpeed) * t);
      this.wishDir.set(dx * cosY - dy * sinY, 0, -dx * sinY - dy * cosY);
      this.targetVel.copy(this.wishDir).multiplyScalar(speed);
    } else {
      this.wishDir.set(0, 0, 0);
      this.targetVel.set(0, 0, 0);
    }

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

    // ---- Jump bookkeeping ------------------------------------------------------
    this.probeGround();
    const wasGrounded = this.grounded;
    if (wasGrounded) {
      this.timeSinceGrounded = 0;
      this.airTime = 0;
      this.doubleUsed = false;
    } else {
      this.timeSinceGrounded += dt;
      this.airTime += dt;
    }

    // Edge-triggered only: holding the button never repeats (wasPressed fires once per press).
    if (this.input.wasPressed('jump')) this.jumpBufferTimer = C.jumpBuffer;
    let jumped = false;
    if (this.jumpBufferTimer > 0) {
      if (wasGrounded || this.timeSinceGrounded <= C.coyoteTime) {
        this.startJump(false);
        jumped = true;
      } else if (
        T.doubleJumpApex > 0 &&
        !this.doubleUsed &&
        this.airTime >= C.doubleJumpMinDelay &&
        !this.aboutToLand()
      ) {
        this.startJump(true);
        jumped = true;
      }
      if (!jumped) this.jumpBufferTimer -= dt;
    }

    // ---- Vertical ------------------------------------------------------------
    // The jump step moves with exactly the launch speed (no gravity yet): see launchSpeed().
    if (!jumped) {
      if (wasGrounded && this.verticalVelocity <= 0) {
        this.verticalVelocity = -C.groundStickSpeed;
      } else {
        const g = this.verticalVelocity > 0 ? T.gravityUp : T.gravityUp * T.fallMultiplier;
        this.verticalVelocity = Math.max(this.verticalVelocity - g * dt, -C.maxFallSpeed);
      }
    }

    // Snap-to-ground would glue us back down on the first frames of a jump: off while rising.
    const wantSnap = this.verticalVelocity <= 0;
    if (wantSnap !== this.snapEnabled) {
      if (wantSnap) this.controller.enableSnapToGround(C.snapToGround);
      else this.controller.disableSnapToGround();
      this.snapEnabled = wantSnap;
    }

    // ---- Move through the character controller -------------------------------
    const vyAtMove = this.verticalVelocity;
    this.desired.x = this.velocity.x * dt;
    this.desired.y = this.verticalVelocity * dt;
    this.desired.z = this.velocity.z * dt;
    this.controller.computeColliderMovement(this.collider, this.desired);
    const moved = this.controller.computedMovement();
    // Rising is never "grounded": the controller can report contact while sliding up a wall or pole.
    this.grounded = this.controller.computedGrounded() && !jumped && vyAtMove <= 0;

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

    // ---- Landing / peak tracking -----------------------------------------------
    if (!wasGrounded && this.grounded) this.onLand(Math.max(0, -vyAtMove));
    if (!this.grounded) this.peakFeetY = Math.max(this.peakFeetY, this.next.y - CENTER_TO_FEET);

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
   * Falling and so close to the ground that a press now is a buffered ground jump (fires on landing)
   * rather than the air jump: within jumpBuffer seconds of landing at the current fall speed, min height floor.
   */
  private aboutToLand(): boolean {
    if (this.verticalVelocity >= 0) return false;
    return this.airHeight < Math.max(C.doubleJumpMinHeight, -this.verticalVelocity * C.jumpBuffer);
  }

  private startJump(air: boolean): void {
    const T = this.tuning;
    this.verticalVelocity = air ? T.doubleJumpSpeed : T.jumpSpeed;
    this.jumpBufferTimer = 0;
    this.timeSinceGrounded = 1e9; // a coyote window must not allow a second ground jump
    this.grounded = false;
    if (air) {
      this.doubleUsed = true;
      this.doubleJumps++;
      this.spinning = true;
      this.spinT = 0;
    } else {
      this.jumps++;
      this.airTime = 0;
      this.peakFeetY = this.currPos.y - CENTER_TO_FEET;
    }
    this.squash = air ? 0.1 : 0.2; // light stretch on takeoff
    this.squashVel = 0;
  }

  private onLand(impact: number): void {
    this.landings++;
    this.spinning = false;
    this.spinGroup.rotation.x = 0;
    if (impact > C.squashMinImpact) {
      this.squash = -Math.min(0.32, 0.08 + impact * 0.018);
      this.squashVel = 0;
    }
    if (this.tuning.stomp && impact > C.stompMinImpact) {
      this.stomps++;
      this.squash = -0.34;
      const e = this.stompEvent;
      e.x = this.next.x;
      e.y = this.next.y - CENTER_TO_FEET;
      e.z = this.next.z;
      e.radius = C.stompRadius;
      e.impact = impact;
      for (const l of this.stompListeners) l(e);
    }
  }

  /** Ray straight down from the capsule center: ground height under the player for shadow, camera, jump rules. */
  private probeGround(): void {
    this.groundRay.origin.x = this.currPos.x;
    this.groundRay.origin.y = this.currPos.y;
    this.groundRay.origin.z = this.currPos.z;
    const hit = this.world.castRay(this.groundRay, SHADOW_PROBE_RANGE, true, undefined, undefined, this.collider);
    if (hit) {
      this.hasGround = true;
      this.groundY = this.currPos.y - hit.timeOfImpact;
      this.airHeight = Math.max(0, hit.timeOfImpact - CENTER_TO_FEET);
    } else {
      this.hasGround = false;
      this.airHeight = SHADOW_PROBE_RANGE;
    }
    if (this.grounded) this.airHeight = 0;
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

  /** Interpolate the visual between the last two physics states and run the cosmetic springs. */
  updateVisual(alpha: number, dt = 0): void {
    this.visualPosition.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.position.copy(this.visualPosition);
    this.object.rotation.y = this.prevFacing + angleDelta(this.prevFacing, this.facing) * alpha;

    if (dt > 0) {
      const h = Math.min(dt, 0.05);
      this.squashVel += (-SPRING_K * this.squash - SPRING_C * this.squashVel) * h;
      this.squash += this.squashVel * h;
      this.popVel += (-SPRING_K * this.pop - SPRING_C * this.popVel) * h;
      this.pop += this.popVel * h;
      if (this.spinning) {
        this.spinT += h;
        const t = this.spinT / C.spinTime;
        if (t >= 1) {
          this.spinning = false;
          this.spinGroup.rotation.x = 0;
        } else {
          // Forward flip (head over heels), fast start and soft end; positive X rotation tips +Z (face) down.
          this.spinGroup.rotation.x = Math.PI * 2 * (1 - (1 - t) * (1 - t));
        }
      }
    }
    const sy = 1 + this.squash;
    const sxz = 1 - this.squash * 0.5;
    this.squashGroup.scale.set(sxz, sy, sxz);
    this.object.scale.setScalar(1 + this.pop);

    // Blob shadow on the ground below: shrinks and fades with height.
    if (this.hasGround) {
      const k = Math.min(this.airHeight / 4, 1);
      this.shadow.visible = true;
      this.shadow.position.set(this.visualPosition.x, this.groundY + 0.03, this.visualPosition.z);
      this.shadow.scale.setScalar(SHADOW_BASE_RADIUS * (1 - 0.35 * k));
      this.shadowMat.opacity = 0.42 - 0.2 * k;
    } else {
      this.shadow.visible = false;
    }
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
    this.jumpBufferTimer = 0;
    this.timeSinceGrounded = 0;
    this.airTime = 0;
    this.spinning = false;
    this.spinGroup.rotation.x = 0;
    this.squash = 0;
    this.squashVel = 0;
    this.peakFeetY = y - CENTER_TO_FEET;
  }

  respawn(): void {
    this.teleport(this.safePos.x, this.safePos.y + 0.5, this.safePos.z);
  }

  /**
   * Placeholder visual: capsule with a face (nose + two eyes) so a spin reads clearly, a gold belt in
   * Superglen mode and a blob shadow. Hierarchy: object (position, yaw, pop) > squashGroup (pivot at the
   * feet, squash/stretch) > spinGroup (pivot at the capsule center, flip) > meshes.
   */
  private buildPlaceholderMesh(): void {
    this.bodyMat = new THREE.MeshStandardMaterial({ color: ModeTunings.glen.color, roughness: 0.6 });
    this.faceMat = new THREE.MeshStandardMaterial({ color: ModeTunings.glen.faceColor, roughness: 0.7 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.5 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.35, metalness: 0.2 });

    this.squashGroup.position.y = -CENTER_TO_FEET;
    this.spinGroup.position.y = CENTER_TO_FEET;
    this.squashGroup.add(this.spinGroup);
    this.object.add(this.squashGroup);

    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(C.radius, CAPSULE_HALF_HEIGHT * 2, 6, 16), this.bodyMat);
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    capsule.name = 'body';
    this.spinGroup.add(capsule);

    // Nose marker on the +Z side (local forward) at about eye height.
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), this.faceMat);
    nose.position.set(0, C.height * 0.18, C.radius * 0.95);
    nose.castShadow = true;
    nose.name = 'nose';
    this.spinGroup.add(nose);

    const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx * 0.12, C.height * 0.27, C.radius * 0.9);
      this.spinGroup.add(eye);
    }

    this.belt = new THREE.Mesh(new THREE.TorusGeometry(C.radius * 1.02, 0.04, 8, 28), goldMat);
    this.belt.rotation.x = Math.PI / 2;
    this.belt.position.y = -C.height * 0.08;
    this.belt.visible = false;
    this.spinGroup.add(this.belt);

    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const sg = new THREE.CircleGeometry(1, 20);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, this.shadowMat);
    this.shadow.renderOrder = 1;
    this.shadow.frustumCulled = false;
  }
}
