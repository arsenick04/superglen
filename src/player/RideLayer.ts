import * as THREE from 'three';
import { BikeRideConfig as C } from '../config/bikeRide';

/**
 * Riding pose, procedural on the Mixamo skeleton (no allocation per frame). After the clip (idle) has been sampled:
 *  - the hips go to the saddle marker (plus stand-up and a little bob), the torso leans forward and rolls with the bike,
 *  - each leg is solved by two-bone IK so the ankle sits on its pedal (or on the ground for the foot that is down),
 *  - each arm is solved by two-bone IK so the wrist sits on its grip,
 *  - the whole pose fades in with `w` after getting on.
 * Everything is computed in world space from the bike's marker nodes, so it works for any bike transform.
 */
export interface RideRig {
  /** Bike root (origin on the ground, +z front, +y up). */
  readonly root: THREE.Object3D;
  readonly seat: THREE.Object3D;
  readonly gripL: THREE.Object3D;
  readonly gripR: THREE.Object3D;
  readonly pedalL: THREE.Object3D;
  readonly pedalR: THREE.Object3D;
  /** 0..1 standing on the pedals. */
  stand: number;
  /** 0..1 the left foot is on the ground (stopped). */
  footDown: number;
  /** Rider's counter-roll (rad, rig +z). */
  roll: number;
  /** Torso twist toward the steering (rad, rig +y). */
  twist: number;
  /** Crank phase (rad), for the hip bob. */
  phase: number;
  /** Animate the bike (wheels, crank, steer) for this frame. Called right before the pose. */
  tick(dt: number): void;
}

const NAMES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
  'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
] as const;
type Name = (typeof NAMES)[number];

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vT = new THREE.Vector3();
const vU = new THREE.Vector3();
const vP = new THREE.Vector3();
const vK = new THREE.Vector3();
const vD = new THREE.Vector3();
const vE = new THREE.Vector3();
const vW = new THREE.Vector3();
const vR = new THREE.Vector3();
const vS = new THREE.Vector3();
const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const bz = new THREE.Vector3();
const qR = new THREE.Quaternion();
const qT = new THREE.Quaternion();
const qP = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const qW = new THREE.Quaternion();
const qS = new THREE.Quaternion();

export class RideLayer {
  private readonly bones: THREE.Bone[] = [];
  private readonly saved: THREE.Quaternion[] = [];
  private readonly savedPos = new THREE.Vector3();
  private readonly footRest: THREE.Quaternion[] = [new THREE.Quaternion(), new THREE.Quaternion()];
  private readonly ankleH: number[] = [0, 0];
  private rig: RideRig | null = null;
  private dt = 0;
  readonly ready: boolean;
  /** Weight of the ride pose (0..1). */
  w = 0;
  /** Ankle distance from the target after the last solve (m), for tests: [left foot, right foot, left hand, right hand]. */
  readonly miss = [0, 0, 0, 0];

  constructor(private readonly scene: THREE.Object3D) {
    const map = new Map<string, THREE.Bone>();
    scene.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      const n = o.name.replace(/^mixamorig:?/, '');
      if ((NAMES as readonly string[]).includes(n)) map.set(n, o as THREE.Bone);
    });
    this.ready = map.size === NAMES.length;
    if (!this.ready) return;
    for (const n of NAMES) {
      this.bones.push(map.get(n)!);
      this.saved.push(new THREE.Quaternion());
    }
    // Bind pose: the feet's orientation relative to the model, and the ankle height above the ground (model units).
    scene.updateMatrixWorld(true);
    scene.getWorldQuaternion(qS);
    qS.invert();
    for (let s = 0; s < 2; s++) {
      const foot = this.b(s === 0 ? 'LeftFoot' : 'RightFoot');
      foot.getWorldQuaternion(this.footRest[s]).premultiply(qS);
      this.ankleH[s] = foot.matrixWorld.elements[13] - scene.matrixWorld.elements[13];
    }
  }

  private b(n: Name): THREE.Bone {
    return this.bones[(NAMES as readonly string[]).indexOf(n)];
  }

  get active(): boolean {
    return this.rig !== null;
  }

  attach(r: RideRig | null): void {
    this.rig = r;
    if (!r) this.w = 0;
  }

  /** Per frame, after the clip has been sampled. */
  run(dt: number): void {
    if (!this.ready || !this.rig) return;
    this.dt = dt;
    const k = 1 - Math.exp(-dt * C.rider.blend);
    this.w += (1 - this.w) * k;
    if (this.w > 0.999) this.w = 1;
    this.apply();
  }

  /** Rotate bone `i` by the rig-space rotation `qR` about its own joint (see JumpLayer.rot). */
  private rot(i: number): void {
    const bone = this.bones[i];
    qP.identity();
    for (let n: THREE.Object3D | null = bone.parent; n && n !== this.scene; n = n.parent) qP.premultiply(n.quaternion);
    qC.copy(qP).invert();
    qT.copy(qC).multiply(qR).multiply(qP);
    bone.quaternion.premultiply(qT);
  }

  private rotAxis(i: number, axis: THREE.Vector3, ang: number): void {
    qR.setFromAxisAngle(axis, ang);
    this.rot(i);
  }

  /** Turn `bone` so that the direction to `from` (its child, now) points along `want` (both world space). */
  private aim(bone: THREE.Object3D, pos: THREE.Vector3, child: THREE.Vector3, want: THREE.Vector3): void {
    vD.subVectors(child, pos).normalize();
    vE.copy(want).normalize();
    qT.setFromUnitVectors(vD, vE);
    bone.getWorldQuaternion(qW).premultiply(qT);
    bone.parent!.getWorldQuaternion(qP).invert();
    bone.quaternion.copy(qP.multiply(qW));
    bone.updateMatrixWorld(true);
  }

  /** Two-bone IK: root `a`, middle `m`, end `e` (bones) reach `target` (world), the middle bends toward `pole` (world direction). Returns the miss distance. */
  private solve(a: THREE.Object3D, m: THREE.Object3D, e: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3): number {
    vA.setFromMatrixPosition(a.matrixWorld);
    vB.setFromMatrixPosition(m.matrixWorld);
    vC.setFromMatrixPosition(e.matrixWorld);
    const l1 = vB.distanceTo(vA);
    const l2 = vC.distanceTo(vB);
    vU.subVectors(target, vA);
    let d = vU.length();
    if (d < 1e-5) return 0;
    vU.divideScalar(d);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    vP.copy(pole).addScaledVector(vU, -pole.dot(vU));
    if (vP.lengthSq() < 1e-8) vP.copy(by);
    vP.normalize();
    vK.copy(vA).addScaledVector(vU, along).addScaledVector(vP, h);
    vR.copy(vA).addScaledVector(vU, d); // reachable end point
    // Upper bone: toward the knee / elbow.
    vW.copy(vK).sub(vA);
    this.aim(a, vA, vB, vW);
    // Lower bone: from the new middle toward the end point.
    vB.setFromMatrixPosition(m.matrixWorld);
    vC.setFromMatrixPosition(e.matrixWorld);
    vW.copy(vR).sub(vB);
    this.aim(m, vB, vC, vW);
    e.updateMatrixWorld(true);
    vC.setFromMatrixPosition(e.matrixWorld);
    return vC.distanceTo(target);
  }

  private apply(): void {
    const rig = this.rig!;
    const w = this.w;
    const sc = this.scene;
    rig.tick(this.dt);
    rig.root.updateWorldMatrix(true, true);
    sc.updateWorldMatrix(true, true);
    for (let i = 0; i < this.bones.length; i++) this.saved[i].copy(this.bones[i].quaternion);
    const hips = this.b('Hips');
    this.savedPos.copy(hips.position);
    const e = rig.root.matrixWorld.elements;
    bx.set(e[0], e[1], e[2]).normalize();
    by.set(e[4], e[5], e[6]).normalize();
    bz.set(e[8], e[9], e[10]).normalize();
    const R = C.rider;
    const wscale = sc.matrixWorld.getMaxScaleOnAxis();

    // Hips on the saddle.
    rig.seat.getWorldPosition(vT);
    const bob = Math.sin(rig.phase * 2) * C.bob * (1 - rig.footDown);
    vT.addScaledVector(by, R.hipsAboveSeat + rig.stand * C.standHeight + bob - rig.footDown * R.footDownDrop);
    vT.addScaledVector(bz, rig.footDown * R.footDownForward);
    vT.addScaledVector(bx, Math.sin(rig.phase) * C.sway * (1 - rig.footDown));
    hips.parent!.worldToLocal(vT);
    const hx = vT.x, hy = vT.y, hz = vT.z;
    hips.position.set(hx, hy, hz);
    // Torso: roll with the bike, lean forward (more when standing), head stays up.
    this.rotAxis(0, AZ, rig.roll);
    const lean = R.lean + rig.stand * C.standLean;
    for (let i = 1; i <= 3; i++) {
      this.rotAxis(i, AX, lean / 3);
      this.rotAxis(i, AY, rig.twist / 3);
    }
    this.rotAxis(4, AX, -lean * R.headBack * 0.5);
    this.rotAxis(5, AX, -lean * R.headBack * 0.5);
    hips.updateMatrixWorld(true);

    // Legs.
    for (let s = 0; s < 2; s++) {
      const L = s === 0;
      const side = L ? 1 : -1;
      const ped = L ? rig.pedalL : rig.pedalR;
      const ank = this.ankleH[s] * wscale;
      ped.getWorldPosition(vT);
      vT.addScaledVector(by, ank + R.ankleLift);
      if (L && rig.footDown > 0.001) {
        // The foot that is down: on the ground beside the bike.
        rig.root.getWorldPosition(vA);
        vA.addScaledVector(bx, R.footSide).addScaledVector(by, ank).addScaledVector(bz, -0.09 + R.footForward);
        vT.lerp(vA, rig.footDown);
      }
      vK.copy(bz).addScaledVector(bx, side * R.kneeOut);
      vS.copy(vK); // `solve` uses vK itself
      const up = this.b(L ? 'LeftUpLeg' : 'RightUpLeg');
      const leg = this.b(L ? 'LeftLeg' : 'RightLeg');
      const foot = this.b(L ? 'LeftFoot' : 'RightFoot');
      this.miss[s] = this.solve(up, leg, foot, vT, vS);
      // Foot flat (like the bind pose, in the model's frame).
      sc.getWorldQuaternion(qS);
      qW.copy(qS).multiply(this.footRest[s]);
      qT.setFromAxisAngle(AX, R.toePitch);
      qW.multiply(qT);
      foot.parent!.getWorldQuaternion(qP).invert();
      foot.quaternion.copy(qP.multiply(qW));
      foot.updateMatrixWorld(true);
    }

    // Arms.
    for (let s = 0; s < 2; s++) {
      const L = s === 0;
      const side = L ? 1 : -1;
      (L ? rig.gripL : rig.gripR).getWorldPosition(vT);
      vT.addScaledVector(bz, -R.gripBack);
      vS.set(0, 0, 0).addScaledVector(bx, side * R.elbowOut).addScaledVector(by, -R.elbowDown).addScaledVector(bz, -R.elbowBack);
      this.miss[2 + s] = this.solve(this.b(L ? 'LeftArm' : 'RightArm'), this.b(L ? 'LeftForeArm' : 'RightForeArm'), this.b(L ? 'LeftHand' : 'RightHand'), vT, vS);
    }

    // Fade in from the clip pose.
    if (w < 1) {
      for (let i = 0; i < this.bones.length; i++) {
        qT.copy(this.bones[i].quaternion);
        this.bones[i].quaternion.copy(this.saved[i]).slerp(qT, w);
      }
      hips.position.set(this.savedPos.x + (hx - this.savedPos.x) * w, this.savedPos.y + (hy - this.savedPos.y) * w, this.savedPos.z + (hz - this.savedPos.z) * w);
    }
  }
}


