import * as THREE from 'three';
import { box, cone, cyl, merge, sph } from './ColorMesh';

const SKIN = 0xf1c9a0;
const ORANGE = 0xf58a1f;
const HAIR = 0x1f1a1c;
const WHITE = 0xf4f0ff;

/** Aara (low poly, one merged mesh): black bob with a star clip, white blouse, orange vest and pleated skirt, white socks, orange shoes. */
export function aaraGeo(): THREE.BufferGeometry {
  const eye = 0x2b1a12;
  return merge([
    // Shoes, socks, legs.
    { g: box(0.13, 0.07, 0.22), c: ORANGE, p: [-0.1, 0.035, 0.03] },
    { g: box(0.13, 0.07, 0.22), c: ORANGE, p: [0.1, 0.035, 0.03] },
    { g: cyl(0.055, 0.055, 0.2, 6), c: WHITE, p: [-0.1, 0.17, 0] },
    { g: cyl(0.055, 0.055, 0.2, 6), c: WHITE, p: [0.1, 0.17, 0] },
    { g: cyl(0.05, 0.05, 0.16, 6), c: SKIN, p: [-0.1, 0.35, 0] },
    { g: cyl(0.05, 0.05, 0.16, 6), c: SKIN, p: [0.1, 0.35, 0] },
    // Pleated skirt, blouse, vest.
    { g: cyl(0.2, 0.36, 0.36, 12), c: ORANGE, p: [0, 0.6, 0] },
    { g: cyl(0.19, 0.22, 0.46, 8), c: WHITE, p: [0, 0.99, 0] },
    { g: cyl(0.2, 0.225, 0.38, 8), c: ORANGE, p: [0, 0.96, 0] },
    { g: box(0.1, 0.06, 0.05), c: WHITE, p: [0, 1.2, 0.17] },
    // Arms: the left one (her right) waves up, the other holds the translator.
    { g: cyl(0.06, 0.06, 0.2, 6), c: WHITE, p: [-0.3, 1.06, 0], r: [0, 0, 0.5] },
    { g: cyl(0.05, 0.05, 0.28, 6), c: SKIN, p: [-0.43, 0.88, 0], r: [0, 0, 0.35] },
    { g: cyl(0.06, 0.06, 0.2, 6), c: WHITE, p: [0.3, 1.06, 0], r: [0, 0, -0.5] },
    { g: cyl(0.05, 0.05, 0.24, 6), c: SKIN, p: [0.4, 0.92, 0.1], r: [-0.9, 0, -0.2] },
    // Head, bob, clip, face.
    { g: sph(0.26, 10, 7), c: SKIN, p: [0, 1.46, 0] },
    { g: sph(0.285, 10, 7), c: HAIR, p: [0, 1.52, -0.04], s: [1, 0.82, 1] },
    { g: cyl(0.11, 0.1, 0.34, 8), c: HAIR, p: [-0.235, 1.34, -0.03] },
    { g: cyl(0.11, 0.1, 0.34, 8), c: HAIR, p: [0.235, 1.34, -0.03] },
    { g: sph(0.27, 8, 6), c: HAIR, p: [0, 1.36, -0.1], s: [1, 1.05, 0.75] },
    { g: cone(0.075, 0.04, 5), c: ORANGE, p: [0.17, 1.64, 0.16], r: [Math.PI / 2, 0, 0.3] },
    { g: sph(0.034, 6, 4), c: eye, p: [-0.09, 1.47, 0.235] },
    { g: sph(0.034, 6, 4), c: eye, p: [0.09, 1.47, 0.235] },
    { g: sph(0.045, 6, 4), c: 0xf29a8a, p: [-0.15, 1.4, 0.2], s: [1.2, 0.7, 0.5] },
    { g: sph(0.045, 6, 4), c: 0xf29a8a, p: [0.15, 1.4, 0.2], s: [1.2, 0.7, 0.5] },
    { g: sph(0.045, 6, 4), c: 0xe0746a, p: [0, 1.37, 0.245], s: [1.6, 0.6, 0.5] },
    // The translator in her hand: a small teal box with a screen and an antenna (the orb sits on top, see AaraActor).
    { g: box(0.2, 0.3, 0.06), c: 0x2fb7c5, p: [0.43, 0.98, 0.26], r: [0, 0, -0.15] },
    { g: box(0.14, 0.14, 0.02), c: 0xe9fbff, p: [0.43, 1.0, 0.295], r: [0, 0, -0.15] },
    { g: cyl(0.012, 0.012, 0.18, 4), c: 0x8a96a3, p: [0.47, 1.22, 0.26], r: [0, 0, -0.15] },
  ]);
}

/** Where the orb sits on the antenna (model space, before the actor's scale). */
const ORB_AT = new THREE.Vector3(0.49, 1.33, 0.26);
/** Orb size and colour per translator level 0..3 (0: sleeping, 3: fully upgraded). */
const LEVELS = [
  { r: 0.035, color: 0x9fb3c4 },
  { r: 0.055, color: 0x7fe3a0 },
  { r: 0.075, color: 0xffe27a },
  { r: 0.1, color: 0xff9ad5 },
];

/**
 * Aara in the world: the person mesh (shared city `lit` material), the glowing orb of her translator (2 draw calls in all).
 * `setLevel(n)` makes the translator more advanced (bigger, brighter orb and a pop of sparkles by the caller).
 */
export class AaraActor {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly orb: THREE.Mesh;
  private readonly orbMat: THREE.MeshBasicMaterial;
  private level = 0;
  private t = 0;
  /** 0 = idle sway, 1 = big wave (arm swing is the whole body tilt: one mesh). */
  waving = true;

  constructor(lit: THREE.Material) {
    this.body = new THREE.Mesh(aaraGeo(), lit);
    this.body.castShadow = false;
    this.orbMat = new THREE.MeshBasicMaterial({ color: LEVELS[0].color, toneMapped: false, fog: false });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), this.orbMat);
    this.orb.position.copy(ORB_AT);
    this.group.add(this.body, this.orb);
    this.setLevel(0);
  }

  get translatorLevel(): number {
    return this.level;
  }

  get orbWorld(): THREE.Vector3 {
    return this.orb.getWorldPosition(new THREE.Vector3());
  }

  setLevel(n: number): void {
    this.level = Math.max(0, Math.min(3, n));
    const l = LEVELS[this.level];
    this.orb.scale.setScalar(l.r);
    this.orbMat.color.setHex(l.color);
  }

  place(x: number, z: number, yaw: number): void {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
  }

  update(dt: number): void {
    this.t += dt;
    // A friendly bounce and sway; the orb pulses faster the more advanced the translator is.
    this.body.position.y = Math.abs(Math.sin(this.t * 3)) * 0.03;
    this.body.rotation.z = this.waving ? Math.sin(this.t * 5) * 0.07 : 0;
    const k = 1 + 0.25 * Math.sin(this.t * (3 + this.level * 2));
    this.orb.scale.setScalar(LEVELS[this.level].r * k);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.body.geometry.dispose();
    this.orb.geometry.dispose();
    this.orbMat.dispose();
  }
}
