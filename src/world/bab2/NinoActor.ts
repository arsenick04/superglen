import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { Easings } from '../../gameplay/Sequence';

/**
 * Nino for Chapter 2: the blue glowing capsule of the lab, hovering, always turning to look at Glen. `glideTo` moves him
 * with a soft ease. Placeholder art until the real model arrives.
 */
export class NinoActor {
  readonly group = new THREE.Group();
  /** Ground position (the visible group floats a little above it). */
  readonly pos = new THREE.Vector3();
  private readonly glow: THREE.Mesh;
  private t = 0;
  private yaw = 0;
  /** 0 = hovering, 1 = sitting on the ground. */
  sit = 0;
  /** Face this point instead of the player (e.g. while throwing balls); null = the player. */
  private readonly lookAt = new THREE.Vector3();
  private looking = false;
  private hopT = 9;

  constructor(
    private readonly ctx: LevelContext,
    x: number,
    z: number,
  ) {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.4, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x4dabf7, emissive: 0x2a74c8, emissiveIntensity: 0.7, roughness: 0.4 }),
    );
    body.position.y = 0.48;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x0b2a4a });
    const eyeG = new THREE.SphereGeometry(0.05, 8, 6);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(eyeG, eyeM);
      e.position.set(sx * 0.1, 0.62, 0.25);
      this.group.add(e);
    }
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.05), new THREE.MeshStandardMaterial({ color: 0x2f6fd6, emissive: 0x1a4fa8, emissiveIntensity: 0.4 }));
    cape.position.set(0, 0.4, -0.3);
    cape.rotation.x = 0.25;
    const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc94d }));
    clasp.position.set(0, 0.7, -0.16);
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.glow.position.y = 0.5;
    this.group.add(body, cape, clasp, this.glow);
    this.pos.set(x, 0, z);
    this.group.position.set(x, 0.3, z);
    ctx.root.add(this.group);
  }

  /** Smooth glide to (x, z); resolves on arrival. */
  glideTo(x: number, z: number, duration = 1.6): Promise<void> {
    const sx = this.pos.x;
    const sz = this.pos.z;
    return this.ctx.seq.tween(
      duration,
      (u) => {
        this.pos.x = sx + (x - sx) * u;
        this.pos.z = sz + (z - sz) * u;
      },
      Easings.easeInOut,
    );
  }

  /** Jump to a spot without gliding. */
  placeAt(x: number, z: number): void {
    this.pos.x = x;
    this.pos.z = z;
  }

  /** A little hop (he "throws" a ball). */
  hop(): void {
    this.hopT = 0;
  }

  faceTowards(p: THREE.Vector3 | null): void {
    this.looking = p !== null;
    if (p) this.lookAt.copy(p);
  }

  update(dt: number): void {
    this.t += dt;
    const target = this.looking ? this.lookAt : this.ctx.player.visualPosition;
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let d = (want - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 6);
    this.group.rotation.y = this.yaw;
    let hover = 0.3 + 0.06 * Math.sin(this.t * 2.2);
    if (this.hopT < 0.4) {
      this.hopT += dt;
      hover += Math.sin(Math.min(1, this.hopT / 0.4) * Math.PI) * 0.4;
    }
    this.group.position.set(this.pos.x, hover * (1 - this.sit) + 0.0 * this.sit, this.pos.z);
    this.glow.scale.setScalar(1 + 0.08 * Math.sin(this.t * 3));
  }
}
