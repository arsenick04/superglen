import * as THREE from 'three';
import { SkateConfig as S } from '../../config/skate';
import type { RideRig } from '../../player/RideLayer';
import { box, cyl, merge, type Part } from './ColorMesh';

/**
 * The skateboard: procedural, cute and chunky (rounded deck with kicked ends, striped grip print, big orange wheels), Glen-sized.
 * Origin on the ground, +z front. It is also the `RideRig` of the rider (markers for the hips, the feet and the hands); `tick`
 * animates wheels, tilt (carve, nose pitch in ollies), the kicking foot and the balancing arms. Nothing is allocated per frame.
 */
const TAU = Math.PI * 2;
const wrap = (a: number): number => a - TAU * Math.round(a / TAU);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** What the visual reads from the rider. */
export interface SkateMotionSource {
  velocity: { x: number; z: number };
  verticalVelocity: number;
  grounded: boolean;
  object: { rotation: { y: number } };
  /** True when the player is steering / pushing the stick. */
  wantsMove(): boolean;
  /** Top speed on the flat (m/s). */
  topSpeed(): number;
}

function deckGeo(): THREE.BufferGeometry {
  const M = S.model;
  const C = M.colors;
  const L = M.deckLength;
  const W = M.deckWidth;
  const T = 0.04;
  const top = M.deckTop;
  const mid = top - T / 2;
  const kick = 0.3;
  const body = L - 0.2;
  const parts: Part[] = [
    // The flat middle and the rounded, kicked-up ends (a flat disc each: round nose and tail).
    { g: box(W, T, body), c: C.under, p: [0, mid, 0] },
    { g: cyl(W / 2, W / 2, T, 16), c: C.under, p: [0, mid + 0.012, body / 2 + 0.02], r: [-kick, 0, 0] },
    { g: cyl(W / 2, W / 2, T, 16), c: C.under, p: [0, mid + 0.012, -body / 2 - 0.02], r: [kick, 0, 0] },
    // Grip print on top: dark tape with colourful stripes across the ends and a centre line.
    { g: box(W - 0.03, 0.006, body), c: C.grip, p: [0, top + 0.002, 0] },
    { g: cyl(W / 2 - 0.015, W / 2 - 0.015, 0.006, 16), c: C.grip, p: [0, mid + 0.012 + 0.0225, body / 2 + 0.02 + 0.0], r: [-kick, 0, 0] },
    { g: cyl(W / 2 - 0.015, W / 2 - 0.015, 0.006, 16), c: C.grip, p: [0, mid + 0.012 + 0.0225, -body / 2 - 0.02], r: [kick, 0, 0] },
  ];
  C.stripes.forEach((c, i) => {
    parts.push({ g: box(W - 0.05, 0.004, 0.028), c, p: [0, top + 0.0065, 0.12 + i * 0.045] });
    parts.push({ g: box(W - 0.05, 0.004, 0.028), c, p: [0, top + 0.0065, -0.12 - i * 0.045] });
  });
  // Yellow rim along both sides.
  parts.push({ g: box(0.012, T + 0.004, body), c: C.edge, p: [W / 2 - 0.004, mid, 0] });
  parts.push({ g: box(0.012, T + 0.004, body), c: C.edge, p: [-W / 2 + 0.004, mid, 0] });
  // Trucks and axles.
  for (const z of [M.truckZ, -M.truckZ]) {
    parts.push({ g: box(0.1, 0.035, 0.09), c: C.truck, p: [0, top - T - 0.016, z] });
    parts.push({ g: cyl(0.014, 0.014, M.wheelHalfTrack * 2 + 0.02, 6), c: C.truck, p: [0, M.wheelRadius, z], r: [0, 0, Math.PI / 2] });
  }
  return merge(parts);
}

function wheelGeo(): THREE.BufferGeometry {
  const M = S.model;
  const r = M.wheelRadius;
  const side = Math.PI / 2;
  return merge([
    { g: cyl(r, r, 0.06, 14), c: M.colors.wheel, r: [0, 0, side] },
    { g: cyl(r * 0.5, r * 0.5, 0.068, 8), c: M.colors.hub, r: [0, 0, side] },
    // Spokes so the spinning shows.
    { g: box(0.07, r * 0.95, 0.018), c: M.colors.hub },
    { g: box(0.07, 0.018, r * 0.95), c: M.colors.hub },
  ]);
}

export class SkateVisual implements RideRig {
  readonly root = new THREE.Group();
  /** Everything that tilts (roll and nose pitch), pivot at the deck top. */
  private readonly tilt = new THREE.Group();
  readonly seat = new THREE.Object3D();
  readonly gripL = new THREE.Object3D();
  readonly gripR = new THREE.Object3D();
  readonly pedalL = new THREE.Object3D();
  readonly pedalR = new THREE.Object3D();
  private readonly wheels: THREE.Object3D[] = [];
  readonly geometries: THREE.BufferGeometry[] = [];
  stand = 0;
  footDown = 0;
  roll = 0;
  twist = 0;
  phase = 0;
  lean: number = S.pose.lean;
  /** Test handles. */
  wheelAngle = 0;
  speed = 0;
  tiltRoll = 0;
  tiltPitch = 0;
  pushPhase = 0;
  pushes = 0;
  /** The kicking foot is on the ground (0..1). */
  kickDown = 0;
  private yaw = 0;
  private yawRate = 0;
  private started = false;
  private landDip = 0;
  private wasAir = false;
  private air = 0;
  private pitch = 0;
  private carve = 0;

  constructor(lit: THREE.Material, private readonly src: SkateMotionSource | null) {
    const M = S.model;
    const deck = new THREE.Mesh(deckGeo(), lit);
    this.geometries.push(deck.geometry);
    deck.castShadow = false;
    this.tilt.position.y = M.deckTop;
    deck.position.y = -M.deckTop;
    this.tilt.add(deck);
    const wg = wheelGeo();
    this.geometries.push(wg);
    for (const z of [M.truckZ, -M.truckZ]) {
      for (const x of [M.wheelHalfTrack, -M.wheelHalfTrack]) {
        const w = new THREE.Mesh(wg, lit);
        w.castShadow = false;
        w.position.set(x, M.wheelRadius - M.deckTop, z);
        this.tilt.add(w);
        this.wheels.push(w);
      }
    }
    for (const m of [this.seat, this.gripL, this.gripR, this.pedalL, this.pedalR]) this.tilt.add(m);
    this.root.add(this.tilt);
    this.root.name = 'skateboard';
    this.applyPose(0);
  }

  private mark(o: THREE.Object3D, x: number, y: number, z: number): void {
    o.position.set(x, y, z); // y above the deck top (the tilt group sits at the deck top)
  }

  tick(dt: number): void {
    const s = this.src;
    if (!s || dt <= 0) return;
    const A = S.anim;
    const P = S.pose;
    const K = S.push;
    const k = (rate: number): number => 1 - Math.exp(-dt * rate);
    const speed = Math.hypot(s.velocity.x, s.velocity.z);
    const y = s.object.rotation.y;
    if (!this.started) {
      this.started = true;
      this.yaw = y;
    }
    const yr = wrap(y - this.yaw) / dt;
    this.yaw = y;
    this.yawRate += (yr - this.yawRate) * k(12);
    this.speed += (speed - this.speed) * k(18);
    const grounded = s.grounded;
    this.wheelAngle = wrap(this.wheelAngle + (this.speed / S.model.wheelRadius) * dt * (grounded ? 1 : 0.6));
    for (const w of this.wheels) w.rotation.x = this.wheelAngle;

    // Air / landing: tuck in the air, a squash right after landing, the nose follows the vertical speed.
    if (!grounded) {
      this.air += (1 - this.air) * k(14);
      this.wasAir = true;
    } else {
      if (this.wasAir) this.landDip = 1;
      this.wasAir = false;
      this.air += (0 - this.air) * k(10);
    }
    this.landDip += (0 - this.landDip) * k(P.landEase);
    const pitchT = grounded ? 0 : clamp(s.verticalVelocity * A.pitchGain, -A.pitchDown, A.pitchUp);
    this.pitch += (pitchT - this.pitch) * k(A.pitchEase);

    // Carve: the board and body lean into the turn.
    const moving = this.speed > 0.5;
    const rollT = moving ? clamp(-this.yawRate * this.speed * A.leanGain, -A.leanMax, A.leanMax) : 0;
    this.tiltRoll += (rollT - this.tiltRoll) * k(A.leanEase);
    this.roll = -this.tiltRoll * A.counterLean;
    this.carve = clamp(this.yawRate / 2.9, -1, 1) * Math.min(1, this.speed / 4);

    // Kicking: keep kicking while the stick is held and the board is below cruise speed; finish the kick before stopping.
    const wants = s.wantsMove() && grounded && this.speed < s.topSpeed() * K.stopAt;
    if (wants || this.pushPhase > 0) {
      this.pushPhase += dt / K.period;
      if (this.pushPhase >= 1) {
        this.pushes++;
        this.pushPhase = wants ? this.pushPhase - 1 : 0;
      }
    }

    this.applyPose(dt);
  }

  private applyPose(_dt: number): void {
    const P = S.pose;
    const K = S.push;
    const A = S.anim;
    this.tilt.rotation.set(-this.pitch, 0, this.tiltRoll);
    this.tiltPitch = this.pitch;

    // Hips: crouched on the board (lower with speed a little), lower in the air and after landing.
    const kick = this.pushPhase > 0 ? Math.sin(this.pushPhase * Math.PI) : 0;
    const crouch = Math.min(1, this.speed / 5);
    const seatY = P.hipsHigh + (P.hipsLow - P.hipsHigh) * crouch - this.air * P.airTuck - this.landDip * P.landSquash - kick * K.dip;
    // In a carve the hips stay over the board: cancel the sideways swing the tilt would give them.
    this.mark(this.seat, this.carve * A.carveSway + seatY * Math.tan(this.tiltRoll) * A.hipsOver, seatY, -0.01);
    this.lean = P.lean + kick * K.leanExtra;

    // Feet: front (left) foot fixed, back (right) foot kicks.
    this.mark(this.pedalL, P.footX, 0, P.footFront);
    let fx = -P.footX;
    let fy = 0;
    let fz = P.footBack;
    let down = 0;
    const p = this.pushPhase;
    if (p > 0) {
      const a = K.groundFrom;
      const b = K.groundTo;
      const c = K.liftTo;
      const side = -K.footSide;
      if (p < a) {
        const t = smooth(p / a);
        fx = -P.footX + (side + P.footX) * t;
        fz = P.footBack + (K.zFrom - P.footBack) * t;
        fy = -S.model.deckTop * t; // down to the ground
        down = t;
      } else if (p < b) {
        const t = (p - a) / (b - a);
        fx = side;
        fz = K.zFrom + (K.zTo - K.zFrom) * t;
        fy = -S.model.deckTop;
        down = 1;
      } else if (p < c) {
        const t = smooth((p - b) / (c - b));
        fx = side + (-P.footX - side) * t;
        fz = K.zTo + (P.footBack - K.zTo) * t;
        fy = -S.model.deckTop * (1 - t) + Math.sin(t * Math.PI) * K.liftHeight;
        down = 1 - t;
      } else {
        const t = smooth((p - c) / (1 - c));
        fy = (1 - t) * 0.01;
      }
    }
    this.kickDown = down;
    // The tilt group carries the foot marker with the board; ground contact needs it in board space (tilt is small while kicking).
    this.mark(this.pedalR, fx, fy, fz);

    // Hands: out to the sides for balance; the outer hand up and the inner hand down in a carve; both up a little in the air;
    // the arms swing against the kicking leg.
    const air = this.air * P.handAir;
    const swing = kick * 0.06;
    const hx = seatY * Math.tan(this.tiltRoll) * A.hipsOver;
    this.mark(this.gripL, hx + P.handX, seatY + P.handUp + air + this.carve * P.handTurn + swing, P.handForward - swing);
    this.mark(this.gripR, hx - P.handX, seatY + P.handUp + air - this.carve * P.handTurn - swing, P.handForward + swing);
    this.twist = -this.carve * 0.12;
  }

  /** Put the pose back to standing (summon / put away). */
  rest(): void {
    this.speed = this.yawRate = this.tiltRoll = this.roll = this.pitch = this.carve = this.air = this.landDip = 0;
    this.pushPhase = 0;
    this.started = false;
    this.wasAir = false;
    this.applyPose(0);
  }
}
