import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../core/Physics';
import type { Input } from '../input/Input';
import { PlayerConfig as C, ModeTunings, type ModeTuning, type PlayerMode } from './PlayerConfig';
import { LaunchSpeeds, Parkour, tableAt } from '../config/parkour';
import { Flight, FlightConfig } from './skills/Flight';
import { SkillHub } from './skills/Skills';
import { Rhythm, type RhythmQuality } from './Rhythm';
import { Mantle } from './Mantle';
import { WallKick } from './WallKick';

/*
 * JUMP RULES (numbers: src/config/parkour.ts)
 *
 * Glen:      one small jump (0.9 m). No rhythm, no air jump, no flight.
 * Superglen: rhythm level 0..4 sets the apex of a ground jump (1.6 / 2.1 / 2.7 / 3.4 / 4.2 m).
 *   - A press within +-0.12 s ("tepat") or +-0.30 s ("bagus") of TOUCHDOWN raises the level by one, and that very jump
 *     already uses the new level. A press BEFORE touchdown is buffered (up to 0.30 s) and fires on touchdown; a press
 *     AFTER touchdown jumps at once.
 *   - A press 0.30 .. 1.5 s after touchdown is a miss: plain jump, level - 1 (never to zero in one go).
 *     Later than 1.5 s it is "the first jump after standing": plain jump, no penalty.
 *   - Not jumping for 1.5 s on the ground lowers the level by one, again every further 1.5 s.
 *   - Landing on a bounce drum (Rhythm.registerBounce) counts as a perfect press by itself.
 *   - A second press in the air is the air jump (+1.2 m above where it is pressed), unless the fall is within 0.30 s
 *     of touchdown: then it is the buffered rhythm press for the landing.
 *
 * PRESS PRECEDENCE IN THE AIR (a fresh press, Superglen; highest first):
 *   1. flight re-ignite after a real flight (Flight.step: while "airborne after flight" a press always restarts the jets)
 *   2. wall kick (only off walls registered with Rhythm.registerKick, i.e. the Gang Tendang): touching (or just moved toward / touched within 0.15 s) a tall near-vertical wall, kick not yet used on that
 *      face, fewer than 6 kicks this airtime, at least 0.4 m above the ground -> +1.4 m and a push away from the wall.
 *      It does not use up the air jump, does not change the rhythm level (not a landing), is never done in Glen mode, on a
 *      bounce drum, on a low obstacle (the wall must reach 0.6 m above the head) or while mantling (a ledge within mantle
 *      reach is that low, so the mantle wins by itself).
 *   3. air jump (once per airtime)
 *   4. buffered rhythm press for the landing
 * A ground jump (or the coyote jump) always comes before all of these.
 *
 * HOLDING THE JUMP BUTTON (three features share it; the rule, in plain words):
 *   1. A press jumps. Holding it on after the jump:
 *   2. If flight is unlocked (Chapter 2 on) and this was NOT a timed press in a bounce chain (level 2 or more), the jets
 *      switch on after 0.45 s: hold = fly.
 *   3. Otherwise (flight still locked, or the child kept the button down through landings of a bounce chain), easy mode
 *      bounces by itself on every touchdown; the level climbs by one every 2 landings up to 3. Level 4 needs timed taps.
 * So: flight locked -> holding bounces. Flight unlocked -> a held jump flies; but a child who is already bouncing at
 * level 2+ and keeps the button down keeps bouncing. Letting go of the button always ends it; flying ends the moment
 * the button is released.
 */

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

  /**
   * False while a cutscene/fade/locked dialog runs: stick and jump are ignored (the player brakes
   * to a stop). Set through Game.setControlsEnabled / the level context, not directly.
   */
  inputEnabled = true;

  /** Interpolated capsule-center position for rendering and the camera. */
  readonly visualPosition = new THREE.Vector3();

  /** Unlock flags, events and counters of the three skills (see player/skills/Skills.ts). */
  readonly skills = new SkillHub();
  /** Jet-booster flight (see player/skills/Flight.ts). */
  readonly flight: Flight;
  /** Multiplier on walking and flying speed (the raised shield sets 0.6 each fixed step). */
  speedScale = 1;

  private readonly world: RAPIER.World;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly groundRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private prevFacing = Math.PI;
  private readonly safePos = new THREE.Vector3();
  private groundedTime = 0;
  private readonly ceilRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  /** Turn-to-face override (laser auto-aim, shield assist). */
  private aimYaw = 0;
  private aimTime = 0;
  /** Pending cosmetic hop speed (a projectile touched the player). */
  private hopPending = 0;
  private spinAngle = 0;

  // ---- Mode and jump state (see PlayerConfig for the numbers) -------------
  private _mode: PlayerMode = 'glen';
  private tuning: ModeTuning = ModeTunings.glen;
  /** Rhythm level, settings, bounce-drum registry and the `events` emitter (rhythmJump, rhythmLevel, ...). */
  readonly rhythm = new Rhythm();
  /** Same emitter as `rhythm.events`: `player.events.on('land', fn)`. */
  readonly events = this.rhythm.events;
  private readonly mantle: Mantle;
  private readonly wallKick: WallKick;
  /** Test-only switch: false = wall kicks are off (the Gang Tendang cannot be climbed). */
  wallKickEnabled = true;
  private kickLock = 0;
  private simTime = 0;
  private pressTime = -1e9;
  private landTime = -1e9;
  private idleTimer = 0;
  private scriptedPress = false;
  private bounceJump = false;
  private chainHold = false;
  private heldSincePress = false;
  private autoJumps = 0;
  private flewThisAir = false;
  private landedFromFlight = false;
  private mantleCount = 0;
  private teleported = false;
  /** Predicted seconds until the feet touch the ground (Infinity when flying or nothing below). */
  landEta = Infinity;
  private timeSinceGrounded = 0;
  private airTime = 0;
  private jumpBufferTimer = 0;
  private doubleUsed = false;
  /** Height of the feet above the ground below (m), 0 when grounded. Used by the camera. */
  airHeight = 0;
  private groundY = 0;
  private hasGround = false;
  private probeSkip = 0;
  private safeSkip = 0;

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
  private aura!: THREE.Mesh;
  private auraMat!: THREE.MeshBasicMaterial;
  /** Smoothed rhythm level (0..4) driving the aura and glow. */
  private auraLevel = 0;
  private squash = 0;
  private squashVel = 0;
  /** 0..1 sitting/crouching look (the story lowers the body for the lunch scene). Visual only. */
  crouch = 0;
  private pop = 0;
  private popVel = 0;
  private spinning = false;
  private spinT = 0;
  private readonly stompListeners: StompListener[] = [];
  private readonly stompEvent: StompEvent = { x: 0, y: 0, z: 0, radius: Parkour.stompRadius, impact: 0 };

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
    // Snap-to-ground stays OFF in the controller; fixedUpdate asks for it only on steps where the plain move lost
    // the ground (see there). Always-on snapping made the capsule hop up and down by several mm on flat ground.
    this.controller.disableSnapToGround();
    this.controller.setSlideEnabled(true);
    this.controller.setApplyImpulsesToDynamicBodies(true);

    this.flight = new Flight(this.skills);
    this.mantle = new Mantle(world, this.collider, C.radius, CAPSULE_HALF_HEIGHT, CENTER_TO_FEET);
    this.wallKick = new WallKick(world, this.collider, C.radius, CENTER_TO_FEET, (h) => !this.rhythm.isBounce(h) && (Parkour.wallKick.anyWall || this.rhythm.isKick(h)));
    this.rhythm.bounceHook = (launch) => this.doBounce(launch);
    this.currPos.set(s.x, cy, s.z);
    this.prevPos.copy(this.currPos);
    this.visualPosition.copy(this.currPos);
    this.safePos.copy(this.currPos);

    this.buildPlaceholderMesh();
    this.flight.attach(this.spinGroup);
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

  /** Capsule centre of the latest physics step (not interpolated). Do not modify. */
  get position(): THREE.Vector3 {
    return this.currPos;
  }

  /** In flight mode (jets or glide): the camera pulls back while this is true. */
  get flying(): boolean {
    return this.flight.isFlying;
  }

  /** Rhythm level for the camera and effects (0 in Glen mode). */
  get rhythmLevel(): number {
    return this._mode === 'superglen' ? this.rhythm.level : 0;
  }

  /** Ground below the player (world Y), valid when `hasGroundBelow`. Used by the landing ring. */
  get groundBelowY(): number {
    return this.groundY;
  }

  get hasGroundBelow(): boolean {
    return this.hasGround;
  }

  /** Turn the body to face `yaw` quickly for a moment (auto-aim, shield assist). Overrides walking turns. */
  turnTo(yaw: number): void {
    this.aimYaw = yaw;
    this.aimTime = 0.3;
  }

  /** Comic squash (negative, e.g. -0.35) or stretch (positive) that springs back by itself. Visual only. */
  squashBounce(amount: number): void {
    this.squash = amount;
    this.squashVel = 0;
  }

  /** A tiny cosmetic hop (about 0.25 m) when standing on the ground; ignored in the air. Not a jump. */
  smallHop(speed: number = Parkour.smallHopSpeed): void {
    this.hopPending = speed;
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
    if (mode === 'glen') this.flight.reset();
    if (changed) {
      this.rhythm.reset();
      this.landTime = -1e9;
      this.chainHold = false;
      this.autoJumps = 0;
      this.idleTimer = 0;
    }
    this.bodyMat.color.setHex(this.tuning.color);
    this.faceMat.color.setHex(this.tuning.faceColor);
    this.belt.visible = mode === 'superglen';
    if (changed) {
      this.popVel = 7;
      // A spin that belongs to Superglen's air jump must not linger after switching away.
      if (mode === 'glen') {
        this.spinning = false;
        this.spinAngle = 0;
      }
    }
  }

  /** Feet position (bottom of the capsule) of the interpolated visual. */
  getFeetPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.visualPosition).setY(this.visualPosition.y - CENTER_TO_FEET);
  }

  fixedUpdate(dt: number, cameraYaw: number): void {
    const T = this.tuning;
    this.simTime += dt;
    this.mantle.tick(dt);
    if (this.kickLock > 0) this.kickLock -= dt;
    if (this.mantle.active) {
      this.stepMantle(dt);
      return;
    }
    // ---- Horizontal: camera-relative input -> target velocity ----------------
    let mx = this.inputEnabled ? this.input.move.x : 0;
    let my = this.inputEnabled ? this.input.move.y : 0;
    const len = Math.hypot(mx, my);
    if (len < C.inputDeadZone) {
      mx = 0;
      my = 0;
    }
    const hasInput = mx !== 0 || my !== 0;
    const flyingNow = this.flight.isFlying;
    // Camera forward on the ground plane is (-sin yaw, 0, -cos yaw); right is (cos yaw, 0, -sin yaw).
    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    if (hasInput) {
      // Direction from the stick, speed from a mild response curve: small push = slow walk,
      // full run from analogFullAt deflection. Keyboard (length 1) always runs.
      const dx = mx / len;
      const dy = my / len;
      const t = Math.min(1, len / C.analogFullAt);
      const speed = (flyingNow ? FlightConfig.flySpeed : T.runSpeed) * this.speedScale * (C.analogMinSpeed + (1 - C.analogMinSpeed) * t);
      this.wishDir.set(dx * cosY - dy * sinY, 0, -dx * sinY - dy * cosY);
      this.targetVel.copy(this.wishDir).multiplyScalar(speed);
    } else {
      this.wishDir.set(0, 0, 0);
      this.targetVel.set(0, 0, 0);
    }

    let rate: number = hasInput ? C.acceleration : C.deceleration;
    if (flyingNow) {
      rate = hasInput ? FlightConfig.accel : FlightConfig.decel;
      this.flight.limitVelocity(this.currPos.x, this.currPos.z, this.targetVel);
    } else if (!this.grounded) {
      rate *= C.airControl;
      // Just after a wall kick the push must carry: no stick = no braking, a stick against it is weak.
      if (this.kickLock > 0) rate = hasInput ? rate * Parkour.wallKick.steerScale : 0;
    }
    // Move velocity toward target by at most rate*dt (frame-rate independent at fixed dt).
    this.tmp.subVectors(this.targetVel, this.velocity);
    const diff = this.tmp.length();
    const maxDelta = rate * dt;
    if (diff <= maxDelta || diff < 1e-6) this.velocity.copy(this.targetVel);
    else this.velocity.addScaledVector(this.tmp, maxDelta / diff);

    // ---- Facing: turn smoothly toward the movement direction -----------------
    this.prevFacing = this.facing;
    if (this.aimTime > 0) {
      this.aimTime -= dt;
      const d = angleDelta(this.facing, this.aimYaw);
      const step = C.turnSpeed * 2.5 * dt;
      this.facing += Math.abs(d) <= step ? d : Math.sign(d) * step;
    } else if (hasInput) {
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
    this.updateLandEta();

    const sg = T.superglen;
    const jumpDown = this.inputEnabled && this.input.isDown('jump');
    const pressed = this.inputEnabled && this.input.wasPressed('jump');
    if (!jumpDown) {
      this.chainHold = false;
      this.heldSincePress = false;
      this.autoJumps = 0;
    }
    if (pressed) this.heldSincePress = true;

    // ---- Flight (Superglen + unlocked): hold jump in the air; see skills/Flight.ts ----
    const F = this.flight;
    const fi = F.inp;
    fi.can = sg && ((F.enabled && !this.chainHold) || F.forced);
    fi.jumpDown = jumpDown;
    fi.jumpPressed = pressed;
    fi.grounded = wasGrounded;
    fi.feetY = this.currPos.y - CENTER_TO_FEET;
    fi.groundY = this.hasGround ? this.groundY : Number.NaN;
    fi.ceilGap = F.isFlying ? this.probeCeiling() : Infinity;
    fi.vy = this.verticalVelocity;
    F.step(dt);
    const flying = F.isFlying;
    if (flying) {
      this.spinning = false;
      this.spinAngle = 0;
      this.flewThisAir = true;
    }
    if (F.justReleased) this.verticalVelocity = Math.min(this.verticalVelocity, 0); // released: fall at once

    // ---- Wall kick: contact memory and hint (airborne Superglen only), see the precedence rules at the top ----
    const WK = Parkour.wallKick;
    const kickOk =
      sg && WK.enabled && this.wallKickEnabled && !wasGrounded && !flying && !F.afterFlight && this.inputEnabled &&
      this.airHeight >= WK.minAirHeight && this.timeSinceGrounded > Parkour.coyoteTime;
    let kx = 0;
    let kz = 0;
    if (kickOk) {
      if (hasInput) {
        kx = this.wishDir.x;
        kz = this.wishDir.z;
      } else {
        const sp = Math.hypot(this.velocity.x, this.velocity.z);
        if (sp > 0.5) {
          kx = this.velocity.x / sp;
          kz = this.velocity.z / sp;
        }
      }
    }
    this.wallKick.update(this.simTime, this.currPos.x, this.currPos.y, this.currPos.z, kx, kz, kickOk);

    // Edge-triggered: a press is buffered; holding only repeats through easy mode (see the rules at the top).
    if (pressed) {
      this.jumpBufferTimer = sg ? Parkour.windows.good : Parkour.glenJumpBuffer;
      this.pressTime = this.simTime;
      this.scriptedPress = false;
    }
    if (flying) this.jumpBufferTimer = 0; // no jumps while the jets are in charge
    let jumped = false;
    if (this.jumpBufferTimer > 0) {
      if (wasGrounded || this.timeSinceGrounded <= Parkour.coyoteTime) {
        this.startJump(false, wasGrounded, false);
        jumped = true;
      } else if (pressed && kickOk && this.wallKick.tryKick(this.simTime, this.currPos.x, this.currPos.y, this.currPos.z, kx, kz)) {
        this.doWallKick();
        jumped = true;
      } else if (
        sg &&
        !this.doubleUsed &&
        this.airTime >= Parkour.doubleJumpMinDelay &&
        !this.aboutToLand()
      ) {
        this.startJump(true, false, false);
        jumped = true;
      }
      if (!jumped) this.jumpBufferTimer -= dt;
    }
    if (sg && wasGrounded && !jumped) {
      // Easy mode: the held button bounces on every touchdown (flight locked, or a held bounce chain).
      if (
        this.rhythm.easyMode &&
        jumpDown &&
        this.heldSincePress &&
        (!F.enabled || this.chainHold) &&
        this.verticalVelocity <= 0 &&
        this.simTime - this.landTime >= Parkour.easy.gap
      ) {
        this.startJump(false, true, true);
        jumped = true;
      } else if (!jumped) {
        // Standing or walking without a jump: the level sinks by one every idleDrop seconds.
        this.idleTimer += dt;
        if (this.idleTimer >= Parkour.idleDrop) {
          this.idleTimer -= Parkour.idleDrop;
          this.rhythm.lower();
        }
      }
    }

    // ---- Vertical ------------------------------------------------------------
    // The jump step moves with exactly the launch speed (no gravity yet): see launchSpeed().
    if (!jumped) {
      if (flying) {
        this.verticalVelocity = F.vy;
      } else if (this.hopPending > 0 && wasGrounded && this.verticalVelocity <= 0) {
        this.verticalVelocity = this.hopPending; // cosmetic hop: no jump counters, same step skips gravity
        jumped = true;
        this.squash = 0.12;
        this.squashVel = 0;
      } else if (wasGrounded && this.verticalVelocity <= 0) {
        this.verticalVelocity = -C.groundStickSpeed;
      } else {
        const soft = F.afterFlight && this.verticalVelocity <= 0;
        const g = this.verticalVelocity > 0 ? Parkour.gravityUp : Parkour.gravityUp * Parkour.fallMultiplier * (soft ? FlightConfig.afterFlightGravityFactor : 1);
        const floor = soft ? Math.min(this.verticalVelocity, -FlightConfig.afterFlightMaxFall) : -Parkour.maxFallSpeed;
        this.verticalVelocity = Math.max(this.verticalVelocity - g * dt, floor);
      }
    }

    // ---- Move through the character controller -------------------------------
    const vyAtMove = this.verticalVelocity;
    this.desired.x = this.velocity.x * dt;
    this.desired.y = this.verticalVelocity * dt;
    this.desired.z = this.velocity.z * dt;
    const ctl = this.controller;
    ctl.computeColliderMovement(this.collider, this.desired);
    let groundedNow = ctl.computedGrounded();
    // Lost the ground while not rising (walked down a step or slope): ask again with snap-to-ground so the
    // player stays glued to the floor. On flat ground the plain move already is grounded and snapping is skipped.
    if (!groundedNow && vyAtMove <= 0) {
      ctl.enableSnapToGround(C.snapToGround);
      ctl.computeColliderMovement(this.collider, this.desired);
      groundedNow = ctl.computedGrounded();
      ctl.disableSnapToGround();
    }
    let moved = ctl.computedMovement();
    // Rapier occasionally returns a zero horizontal move for a single step while resting on flat ground (the
    // contact normal comes out exactly vertical and the slide degenerates). A real wall blocks the retry as
    // well; this only recovers the numerical stall, which felt like a hiccup in the walk every second or so.
    if (groundedNow && vyAtMove <= 0) {
      const wantH = this.desired.x * this.desired.x + this.desired.z * this.desired.z;
      if (wantH > 4e-4 && moved.x * moved.x + moved.z * moved.z < wantH * 0.01) {
        const dy = this.desired.y;
        this.desired.y = 0;
        ctl.computeColliderMovement(this.collider, this.desired);
        this.desired.y = dy;
        moved = ctl.computedMovement();
      }
    }
    // Rising is never "grounded": the controller can report contact while sliding up a wall or pole.
    this.grounded = groundedNow && !jumped && vyAtMove <= 0;

    // Bumped a ceiling while going up: stop rising.
    if (this.desired.y > 0 && moved.y < this.desired.y * 0.5) this.verticalVelocity = 0;
    if (flying) F.vy = this.verticalVelocity;
    this.hopPending = 0;
    // Blocked horizontally (wall): drop the velocity we could not use so we do not "push" forever.
    if (dt > 0) {
      const vx = moved.x / dt;
      const vz = moved.z / dt;
      if (Math.abs(vx) < Math.abs(this.velocity.x)) this.velocity.x = vx;
      if (Math.abs(vz) < Math.abs(this.velocity.z)) this.velocity.z = vz;
    }

    // The kinematic body sits exactly where we last put it (currPos), so no need to ask Rapier (each translation()
    // call allocates a wrapper object).
    const p = this.currPos;
    this.next.x = p.x + moved.x;
    this.next.y = p.y + moved.y;
    this.next.z = p.z + moved.z;
    this.body.setNextKinematicTranslation(this.next);

    // ---- Landing / peak tracking -----------------------------------------------
    if (!wasGrounded && this.grounded) this.onLand(Math.max(0, -vyAtMove));
    if (!this.grounded) this.peakFeetY = Math.max(this.peakFeetY, this.next.y - CENTER_TO_FEET);

    // ---- Auto mantle: airborne, heading into a ledge just above the head -----------
    if (!this.grounded && !flying && this.inputEnabled && Parkour.mantle.enabled && this.verticalVelocity > -Parkour.mantle.maxFallSpeed) {
      let hx = 0;
      let hz = 0;
      if (hasInput) {
        hx = this.wishDir.x;
        hz = this.wishDir.z;
      } else {
        const sp = Math.hypot(this.velocity.x, this.velocity.z);
        if (sp >= Parkour.mantle.minSpeed) {
          hx = this.velocity.x / sp;
          hz = this.velocity.z / sp;
        }
      }
      if ((hx !== 0 || hz !== 0) && this.mantle.tryStart(this.next.x, this.next.y, this.next.z, hx, hz)) {
        this.velocity.set(0, 0, 0);
        this.verticalVelocity = 0;
        this.jumpBufferTimer = 0;
        this.flight.clearAfterFlight();
        this.squash = -0.12;
        this.squashVel = 0;
        const ang = Math.atan2(hx, hz);
        this.facing = this.prevFacing + angleDelta(this.prevFacing, ang);
      }
    }

    // ---- Safety: remember safe ground, respawn after a fall ------------------
    if (this.grounded) {
      this.groundedTime += dt;
      if (this.groundedTime >= C.safeGroundTime && ++this.safeSkip >= 6) {
        this.safeSkip = 0; // the safe spot is refreshed 10 times a second, not 60
        if (this.hasGroundBelowCenter(this.next)) this.safePos.set(this.next.x, this.next.y, this.next.z);
      }
    } else {
      this.groundedTime = 0;
    }
    if (this.next.y < C.respawnY) this.respawn();
  }

  /**
   * Falling (clearly past the apex) and so close to touchdown that a press now is the buffered rhythm press for the
   * landing (within the good window, or a hair above the ground), not the air jump.
   */
  private aboutToLand(): boolean {
    if (this.verticalVelocity >= 0) return false;
    if (this.airHeight < Parkour.doubleJumpMinHeight) return true;
    return this.verticalVelocity < -Parkour.doubleJumpApexGrace && this.landEta <= Parkour.windows.good;
  }

  /** Seconds until the feet touch the ground, from the height and vertical speed (Infinity when unknown/flying). */
  private updateLandEta(): void {
    if (this.grounded || !this.hasGround || this.flight.isFlying || this.flight.afterFlight || this.airHeight >= SHADOW_PROBE_RANGE - 0.01) {
      this.landEta = Infinity;
      return;
    }
    const gd = Parkour.gravityUp * Parkour.fallMultiplier;
    const vy = this.verticalVelocity;
    let h = this.airHeight;
    let t0 = 0;
    let s = -vy;
    if (vy > 0) {
      t0 = vy / Parkour.gravityUp;
      h += (vy * vy) / (2 * Parkour.gravityUp);
      s = 0;
    }
    this.landEta = t0 + (-s + Math.sqrt(s * s + 2 * gd * h)) / gd;
  }

  /**
   * Decide the rhythm result of a ground jump and return its launch speed.
   * `onGround` false = coyote jump (plain), `auto` = easy-mode bounce.
   */
  private judgeGroundJump(onGround: boolean, auto: boolean): RhythmQuality {
    const R = this.rhythm;
    const W = Parkour.windows;
    let q: RhythmQuality = 'normal';
    if (this.bounceJump) {
      this.bounceJump = false;
      q = 'perfect'; // the level was already raised by the bounce
    } else if (auto) {
      q = 'auto';
      R.stats.autos++;
      this.autoJumps++;
      if (R.level > Parkour.easy.maxLevel) R.setLevel(Parkour.easy.maxLevel);
      else if (this.autoJumps % Parkour.easy.landingsPerLevel === 0 && R.level < Parkour.easy.maxLevel) R.raise();
    } else if (onGround && !this.scriptedPress && this.landTime > -1e8) {
      const d = this.pressTime - this.landTime; // negative: pressed before touchdown
      const a = Math.abs(d);
      if (a <= W.perfect) {
        q = 'perfect';
        R.stats.perfect++;
        R.raise();
      } else if (a <= W.good) {
        q = 'good';
        R.stats.good++;
        R.raise();
      } else if (d > W.good && d <= Parkour.freshAfter) {
        R.miss(); // too late: one level down, plain jump
      }
    }
    if (q === 'normal') R.stats.normals++;
    return q;
  }

  private startJump(air: boolean, onGround: boolean, auto: boolean): void {
    const T = this.tuning;
    const R = this.rhythm;
    let speed: number;
    let quality: RhythmQuality = 'normal';
    if (air) speed = LaunchSpeeds.double;
    else if (!T.superglen) speed = LaunchSpeeds.glen;
    else {
      quality = this.judgeGroundJump(onGround, auto);
      speed = LaunchSpeeds.levels[R.level];
      R.lastQuality = quality;
      if (R.easyMode && (quality === 'perfect' || quality === 'good' || quality === 'auto') && R.level >= Parkour.easy.chainMinLevel && !this.landedFromFlight) this.chainHold = true;
      this.idleTimer = 0;
    }
    this.landedFromFlight = false;
    this.scriptedPress = false;
    this.verticalVelocity = speed;
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
    const lvl = !air && T.superglen ? R.level : 0;
    this.squash = air ? 0.1 : Parkour.fx.takeoffStretch + Parkour.fx.takeoffStretchPerLevel * lvl; // takeoff stretch ("nod")
    this.squashVel = 0;
    if (!air && T.superglen) {
      this.jumpEvent.level = R.level;
      this.jumpEvent.quality = quality;
      R.events.emit('rhythmJump', this.jumpEvent);
    }
  }

  /** The kick itself: fixed apex, push away from the wall, turn away, feedback event. The air jump stays available. */
  private doWallKick(): void {
    const W = this.wallKick;
    const K = Parkour.wallKick;
    this.verticalVelocity = LaunchSpeeds.kick;
    this.velocity.x = W.nx * K.pushSpeed;
    this.velocity.z = W.nz * K.pushSpeed;
    this.jumpBufferTimer = 0;
    this.timeSinceGrounded = 1e9;
    this.grounded = false;
    this.kickLock = K.steerLock;
    this.turnTo(Math.atan2(W.nx, W.nz));
    this.squash = K.squash;
    this.squashVel = 0;
    const e = this.kickEvent;
    e.x = W.px;
    e.y = W.py;
    e.z = W.pz;
    e.nx = W.nx;
    e.nz = W.nz;
    e.chain = W.chain;
    this.rhythm.events.emit('wallKick', e);
  }

  /** Wall kicks done so far (tests). */
  get wallKicks(): number {
    return this.wallKick.total;
  }

  /** Kicks in this airtime. */
  get kickChain(): number {
    return this.wallKick.chain;
  }

  /** True while a kick is possible right now; the contact point to draw the hint at is `kickContact`. */
  get kickHint(): boolean {
    return this.wallKick.available && !this.grounded;
  }

  get kickContact(): { px: number; py: number; pz: number; nx: number; nz: number } {
    return this.wallKick;
  }

  private readonly kickEvent = { x: 0, y: 0, z: 0, nx: 0, nz: 0, chain: 0 };
  private readonly jumpEvent: { level: number; quality: RhythmQuality } = { level: 0, quality: 'normal' };
  private readonly landEvent = { impact: 0, x: 0, y: 0, z: 0 };
  private readonly mantleEvent = { x: 0, y: 0, z: 0 };
  private readonly bounceEvent = { level: 0 };

  private onLand(impact: number): void {
    this.landings++;
    this.wallKick.landed();
    this.spinning = false;
    this.spinAngle = 0;
    // The settle after a teleport / spawn is not a rhythm landing: a press right after it is a fresh jump.
    if (this.teleported) this.teleported = false;
    else this.landTime = this.simTime;
    this.idleTimer = 0;
    this.landedFromFlight = this.flewThisAir;
    this.flewThisAir = false;
    this.flight.clearAfterFlight();
    if (impact > Parkour.squashMinImpact) {
      this.squash = -Math.min(0.32, 0.08 + impact * 0.018);
      this.squashVel = 0;
    }
    const sg = this.tuning.superglen;
    if (sg && impact > Parkour.stompMinImpact) {
      this.stomps++;
      this.squash = -0.34;
      const e = this.stompEvent;
      e.x = this.next.x;
      e.y = this.next.y - CENTER_TO_FEET;
      e.z = this.next.z;
      e.radius = Parkour.stompRadius * (1 + Parkour.stompRadiusPerLevel * this.rhythm.level);
      e.impact = impact;
      for (const l of this.stompListeners) l(e);
    }
    const le = this.landEvent;
    le.impact = impact;
    le.x = this.next.x;
    le.y = this.next.y - CENTER_TO_FEET;
    le.z = this.next.z;
    this.rhythm.events.emit('land', le);
    if (sg && this.rhythm.hasBounceSurfaces && impact > 0 && this.landedOnBounce()) this.doBounce(Parkour.bounce.launch);
  }

  /** What is under the feet: is it a registered bounce drum? (Only called on a touchdown, so the ray cost is fine.) */
  private landedOnBounce(): boolean {
    const r = this.groundRay;
    r.origin.x = this.next.x;
    r.origin.y = this.next.y;
    r.origin.z = this.next.z;
    const hit = this.world.castRay(r, CENTER_TO_FEET + Parkour.bounce.probe, true, undefined, undefined, this.collider);
    return !!hit && this.rhythm.isBounce(hit.collider.handle);
  }

  /** A bounce drum was landed on (or Rhythm.bounce() was called): always perfect, level + 1, optional instant launch. */
  private doBounce(launch: boolean): void {
    const R = this.rhythm;
    R.stats.bounces++;
    R.stats.perfect++;
    R.raise();
    this.bounceEvent.level = R.level;
    R.events.emit('bounce', this.bounceEvent);
    this.idleTimer = 0;
    if (launch && this.tuning.superglen) {
      // Fire through the normal jump path on the next step, as an exactly-on-time press.
      this.bounceJump = true;
      this.scriptedPress = false;
      this.jumpBufferTimer = Parkour.windows.good;
      this.pressTime = this.landTime = this.simTime;
    }
  }

  /** Drive the body through the mantle animation (controls locked). */
  private stepMantle(dt: number): void {
    const m = this.mantle;
    this.probeGround();
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.prevFacing = this.facing;
    const done = m.step(dt);
    this.next.x = m.x;
    this.next.y = m.y;
    this.next.z = m.z;
    this.body.setNextKinematicTranslation(this.next);
    this.grounded = false;
    this.peakFeetY = Math.max(this.peakFeetY, this.next.y - CENTER_TO_FEET);
    if (done) {
      this.grounded = true;
      this.mantleCount++;
      this.landEta = Infinity;
      this.timeSinceGrounded = 0;
      this.airTime = 0;
      this.doubleUsed = false;
      this.squash = -0.1;
      this.squashVel = 0;
      this.groundedTime = 0;
      const e = this.mantleEvent;
      e.x = m.x;
      e.y = m.y - CENTER_TO_FEET;
      e.z = m.z;
      this.rhythm.events.emit('mantle', e);
      this.onLand(0); // a normal landing: rhythm level unchanged
    }
  }

  /** True while a held jump button keeps bouncing instead of flying (see the rules at the top). */
  get bounceChain(): boolean {
    return this.chainHold;
  }

  /** True while the mantle animation runs. */
  get mantling(): boolean {
    return this.mantle.active;
  }

  /** Number of completed mantles (tests). */
  get mantles(): number {
    return this.mantleCount;
  }

  /** Ray straight down from the capsule center: ground height under the player for shadow, camera, jump rules. */
  private probeGround(): void {
    // Grounded and settled: the ground height only matters for the blob shadow, so look every 4th step.
    // Airborne (or just landed/left the ground): every step, the jump rules need the exact height.
    if (this.grounded && this.hasGround && this.probeSkip < 3) {
      this.probeSkip++;
      this.airHeight = 0;
      return;
    }
    this.probeSkip = 0;
    this.groundRay.origin.x = this.currPos.x;
    this.groundRay.origin.y = this.currPos.y;
    this.groundRay.origin.z = this.currPos.z;
    const range = this.flight.isFlying ? this.flight.probeRange : SHADOW_PROBE_RANGE;
    const hit = this.world.castRay(this.groundRay, range, true, undefined, undefined, this.collider);
    if (hit) {
      this.hasGround = true;
      this.groundY = this.currPos.y - hit.timeOfImpact;
      this.airHeight = Math.max(0, hit.timeOfImpact - CENTER_TO_FEET);
    } else {
      this.hasGround = false;
      this.airHeight = range;
    }
    if (this.grounded) this.airHeight = 0;
  }

  /** Free distance the capsule can rise before a real ceiling (m), Infinity when nothing is within 8 m. */
  private probeCeiling(): number {
    const r = this.ceilRay;
    r.origin.x = this.currPos.x;
    r.origin.y = this.currPos.y;
    r.origin.z = this.currPos.z;
    const hit = this.world.castRay(r, 8, true, undefined, undefined, this.collider);
    return hit ? hit.timeOfImpact - CENTER_TO_FEET : Infinity;
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
    this.currPos.set(this.next.x, this.next.y, this.next.z);
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
        const t = this.spinT / Parkour.spinTime;
        if (t >= 1) {
          this.spinning = false;
          this.spinAngle = 0;
        } else {
          // Forward flip (head over heels), fast start and soft end; positive X rotation tips +Z (face) down.
          this.spinAngle = Math.PI * 2 * (1 - (1 - t) * (1 - t));
        }
      }
    }
    // Rhythm aura and body glow follow the level smoothly.
    {
      const target = this._mode === 'superglen' ? this.rhythm.level : 0;
      this.auraLevel += (target - this.auraLevel) * Math.min(1, dt * 8);
      if (this._mode !== 'superglen' && this.auraLevel < 0.01) this.auraLevel = 0;
      const al = this.auraLevel;
      const on = this._mode === 'superglen' && al > 0.02;
      if (on !== this.aura.visible && !this.warmingFx) this.aura.visible = on;
      if (on) {
        const f = Parkour.fx;
        const sc = tableAt(f.auraScale, al);
        this.aura.scale.setScalar(sc);
        this.auraMat.opacity = tableAt(f.auraOpacity, al);
        this.bodyMat.emissiveIntensity = tableAt(f.glow, al);
      } else if (this.bodyMat.emissiveIntensity !== 0) this.bodyMat.emissiveIntensity = 0;
    }
    const sy = (1 + this.squash) * (1 - 0.32 * this.crouch);
    const sxz = (1 - this.squash * 0.5) * (1 + 0.1 * this.crouch);
    this.squashGroup.scale.set(sxz, sy, sxz);
    this.object.scale.setScalar(1 + this.pop);

    // Flight visuals: flames, trail, lean and hover bob (the spin flip shares the same group).
    const F = this.flight;
    F.updateVisual(dt, this.visualPosition, this.velocity.x, this.velocity.z, this.object.rotation.y, this.verticalVelocity);
    this.spinGroup.rotation.set(this.spinAngle + F.tiltX, 0, F.tiltZ);
    this.spinGroup.position.y = CENTER_TO_FEET + F.bob;

    // Blob shadow on the ground below: shrinks and fades with height.
    if (this.hasGround) {
      const k = Math.min(this.airHeight / 4, 1);
      this.shadow.visible = true;
      this.shadow.position.set(this.visualPosition.x, this.groundY + 0.03, this.visualPosition.z);
      // While flying the blob is the child's depth cue: it stays larger and darker than a jump shadow.
      const fly = F.isFlying ? 1 : 0;
      this.shadow.scale.setScalar(SHADOW_BASE_RADIUS * (1 - (0.35 - 0.12 * fly) * k));
      this.shadowMat.opacity = 0.42 - (0.2 - 0.07 * fly) * k;
    } else {
      this.shadow.visible = false;
    }
  }

  private warmingFx = false;
  /** Show the aura for one shader pre-warm frame. */
  warmFx(on: boolean): void {
    this.warmingFx = on;
    this.aura.visible = on || (this._mode === 'superglen' && this.auraLevel > 0.02);
    if (on) this.auraMat.opacity = 0.2;
  }

  /** Teleport to a capsule-center position without interpolation streaks. */
  teleport(x: number, y: number, z: number): void {
    this.next.x = x;
    this.next.y = y;
    this.next.z = z;
    this.body.setTranslation(this.next, true);
    this.body.setNextKinematicTranslation(this.next);
    // The character controller reads the collider's pose: bring it up to date without waiting for a step.
    this.world.propagateModifiedBodyPositionsToColliders();
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
    this.spinAngle = 0;
    this.landTime = -1e9;
    this.teleported = true;
    this.idleTimer = 0;
    this.chainHold = false;
    this.flewThisAir = false;
    this.landedFromFlight = false;
    this.bounceJump = false;
    this.mantle.reset();
    this.wallKick.reset();
    this.kickLock = 0;
    this.flight.reset();
    this.aimTime = 0;
    this.hopPending = 0;
    this.squash = 0;
    this.squashVel = 0;
    this.crouch = 0;
    this.peakFeetY = y - CENTER_TO_FEET;
  }

  /**
   * Put the player on a level spawn: `feetY` is the standing height of the feet, `yaw` the direction
   * to face (0 = +Z; omit to keep the current facing). Resets velocity, the safe-respawn point and the
   * visual, so nothing streaks. The feet are resolved onto the floor below the spawn (see resolveFloor),
   * so a spawn at or slightly above (or a bit inside) a floor ends up standing on its surface.
   * Rapier's scene queries must know the colliders: call Physics.refreshQueries() after building a level.
   */
  placeAt(x: number, feetY: number, z: number, yaw: number = this.facing): void {
    const floor = this.resolveFloor(x, feetY, z);
    const cy = floor + CENTER_TO_FEET + C.skinOffset;
    this.teleport(x, cy, z);
    this.safePos.set(x, cy, z);
    this.facing = yaw;
    this.prevFacing = yaw;
    this.updateVisual(1, 0);
  }

  /**
   * Floor height under (x, z): ray down from 1 m above `feetY` (up to 8 m). If nothing is found (or the
   * ray starts inside solid geometry) the requested height is kept.
   */
  private resolveFloor(x: number, feetY: number, z: number): number {
    const r = this.groundRay;
    r.origin.x = x;
    r.origin.y = feetY + 1;
    r.origin.z = z;
    const hit = this.world.castRay(r, 9, true, undefined, undefined, this.collider);
    if (hit && hit.timeOfImpact > 1e-4) return feetY + 1 - hit.timeOfImpact;
    return feetY;
  }

  /** Story checkpoint: a fall returns the player here (feet position). */
  markSafe(x: number, feetY: number, z: number): void {
    this.safePos.set(x, feetY + CENTER_TO_FEET + C.skinOffset, z);
  }

  /** A hop on its own (cutscene fun): same as a jump press, even while input is disabled. */
  hop(): void {
    this.jumpBufferTimer = Parkour.windows.good;
    this.pressTime = this.simTime;
    this.scriptedPress = true; // a scripted press never judges the rhythm
  }

  /** Back to the last safe ground (same floor resolution as a level spawn). */
  respawn(): void {
    const feet = this.safePos.y - CENTER_TO_FEET - C.skinOffset;
    this.placeAt(this.safePos.x, feet + 0.5, this.safePos.z);
  }

  /**
   * Placeholder visual: capsule with a face (nose + two eyes) so a spin reads clearly, a gold belt in
   * Superglen mode and a blob shadow. Hierarchy: object (position, yaw, pop) > squashGroup (pivot at the
   * feet, squash/stretch) > spinGroup (pivot at the capsule center, flip) > meshes.
   */
  private buildPlaceholderMesh(): void {
    this.bodyMat = new THREE.MeshStandardMaterial({ color: ModeTunings.glen.color, roughness: 0.6, emissive: 0xffc94d, emissiveIntensity: 0 });
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

    // Golden aura: a slightly larger translucent shell, thicker per rhythm level (Superglen only).
    this.auraMat = new THREE.MeshBasicMaterial({
      color: 0xffc94d,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.aura = new THREE.Mesh(new THREE.CapsuleGeometry(C.radius * 1.12, CAPSULE_HALF_HEIGHT * 2 * 1.05, 4, 14), this.auraMat);
    this.aura.visible = false;
    this.aura.frustumCulled = false;
    this.aura.renderOrder = 3;
    this.spinGroup.add(this.aura);

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
