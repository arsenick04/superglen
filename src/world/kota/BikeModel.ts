import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BikeRideConfig as C } from '../../config/bikeRide';
import type { RideRig } from '../../player/RideLayer';

/**
 * The bike model (public/env/bike/bike.glb, built by scripts/build-bike.mjs from the Quaternius Public Transport pack, CC0) and
 * its animation: wheels and crank spin with the speed, the handlebar turns with the turning, the bike leans into turns, the crank
 * settles when stopped. The rider (RideLayer) reads the marker nodes and follows. Nothing is allocated per frame.
 */
let template: Promise<THREE.Object3D | null> | null = null;

/** Load the model once (null when it fails: the old blocky bike stays). */
export function loadBikeTemplate(): Promise<THREE.Object3D | null> {
  if (!template) {
    template = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(`${import.meta.env.BASE_URL}${C.url}`)
      .then((g) => g.scene.getObjectByName('bike') ?? null)
      .catch(() => null);
  }
  return template;
}

/** What the visual needs to know about the rider's vehicle. */
export interface BikeMotionSource {
  velocity: { x: number; z: number };
  verticalVelocity: number;
  object: { rotation: { y: number } };
}

const AY = new THREE.Vector3(0, 1, 0);
const qTmp = new THREE.Quaternion();
const TAU = Math.PI * 2;
const wrap = (a: number): number => a - TAU * Math.round(a / TAU);

function must(root: THREE.Object3D, name: string): THREE.Object3D {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`bike model: no node ${name}`);
  return o;
}

export class BikeVisual implements RideRig {
  readonly root: THREE.Object3D;
  readonly seat: THREE.Object3D;
  readonly gripL: THREE.Object3D;
  readonly gripR: THREE.Object3D;
  readonly pedalL: THREE.Object3D;
  readonly pedalR: THREE.Object3D;
  private readonly steer: THREE.Object3D;
  private readonly wheelF: THREE.Object3D;
  private readonly wheelB: THREE.Object3D;
  private readonly crank: THREE.Object3D;
  private readonly steerBase = new THREE.Quaternion();
  readonly geometries: THREE.BufferGeometry[] = [];
  stand = 0;
  footDown = 1;
  roll = 0;
  twist = 0;
  phase = C.idleCrank;
  /** Test handles (read only). */
  steerAngle = 0;
  lean = 0;
  wheelAngle = 0;
  speed = 0;
  private yaw = 0;
  private yawRate = 0;
  private accel = 0;
  private prevSpeed = 0;
  private started = false;

  constructor(
    template: THREE.Object3D,
    lit: THREE.Material,
    paint: number,
    private readonly src: BikeMotionSource | null,
  ) {
    this.root = template.clone(true);
    const col = new THREE.Color(paint);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = lit;
      m.castShadow = false;
      m.frustumCulled = true;
      // Only the frame and the fork carry the bike's paint (their whole mesh is one colour).
      if (o.parent && (o.parent.name === 'frame' || o.parent.name === 'fork')) {
        const g = m.geometry.clone();
        const c = g.getAttribute('color') as THREE.BufferAttribute;
        for (let i = 0; i < c.count; i++) c.setXYZ(i, col.r, col.g, col.b);
        m.geometry = g;
        this.geometries.push(g);
      }
    });
    this.seat = must(this.root, 'seat');
    this.steer = must(this.root, 'steer');
    this.gripL = must(this.root, 'grip_l');
    this.gripR = must(this.root, 'grip_r');
    this.wheelF = must(this.root, 'wheel_f');
    this.wheelB = must(this.root, 'wheel_b');
    this.crank = must(this.root, 'crank');
    this.pedalL = must(this.root, 'pedal_l');
    this.pedalR = must(this.root, 'pedal_r');
    this.steerBase.copy(this.steer.quaternion);
    this.applyPose();
  }

  /** Advance the animation by `dt` (rendered-frame time) from the rider's motion. */
  tick(dt: number): void {
    const s = this.src;
    if (!s || dt <= 0) return;
    const speed = Math.hypot(s.velocity.x, s.velocity.z);
    const y = s.object.rotation.y;
    if (!this.started) {
      this.started = true;
      this.yaw = y;
      this.prevSpeed = speed;
    }
    const k = (rate: number): number => 1 - Math.exp(-dt * rate);
    const yr = wrap(y - this.yaw) / dt;
    this.yaw = y;
    this.yawRate += (yr - this.yawRate) * k(12);
    const ac = (speed - this.prevSpeed) / dt;
    this.prevSpeed = speed;
    this.accel += (ac - this.accel) * k(6);
    this.speed += (speed - this.speed) * k(20);
    const moving = this.speed > C.idleSpeed;

    // Wheels roll with the ground speed.
    this.wheelAngle = wrap(this.wheelAngle + (this.speed / C.wheelRadius) * dt);
    // Crank: legs spin with the wheels (capped), settle to the stop pose when stopped.
    if (moving) this.phase = wrap(this.phase + Math.min(C.crankMaxRate, (this.speed / C.wheelRadius) * C.crankRatio) * dt);
    else this.phase = wrap(this.phase + wrap(C.idleCrank - this.phase) * k(C.crankEase));
    // Steering and leaning follow the turn.
    const steerT = moving ? Math.max(-1, Math.min(1, this.yawRate / C.turnRef)) * C.maxSteer : 0;
    this.steerAngle += (steerT - this.steerAngle) * k(C.steerEase);
    const leanT = moving
      ? Math.max(-C.leanMax, Math.min(C.leanMax, -this.yawRate * this.speed * C.leanGain))
      : -C.idleLean * this.footDown;
    this.lean += (leanT - this.lean) * k(C.leanEase);
    this.roll = -this.lean * C.riderCounterLean;
    this.twist = this.steerAngle * C.torsoTwist;
    // Standing on the pedals: speeding up hard or climbing.
    const push = Math.max(0, Math.min(1, (this.accel - C.standAccel) / C.standRange));
    const climb = s.verticalVelocity > C.standClimb && moving ? 1 : 0;
    const standT = Math.max(push, climb);
    this.stand += (standT - this.stand) * k(C.standEase);
    // One foot down when stopped.
    const downT = moving ? 0 : 1;
    this.footDown += (downT - this.footDown) * k(C.rider.footDownEase);
    this.applyPose();
  }

  private applyPose(): void {
    qTmp.setFromAxisAngle(AY, this.steerAngle);
    this.steer.quaternion.copy(this.steerBase).multiply(qTmp);
    this.wheelF.rotation.x = this.wheelAngle;
    this.wheelB.rotation.x = this.wheelAngle;
    this.crank.rotation.x = this.phase;
    this.pedalL.rotation.x = -this.phase;
    this.pedalR.rotation.x = -this.phase;
    this.root.rotation.z = this.lean;
  }

  /** Parked: stand still, upright, crank in the stop pose. */
  rest(): void {
    this.steerAngle = this.lean = this.roll = this.twist = this.stand = 0;
    this.footDown = 1;
    this.phase = C.idleCrank;
    this.speed = this.yawRate = this.accel = 0;
    this.started = false;
    this.applyPose();
  }
}
