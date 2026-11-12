import * as THREE from 'three';
import type { Physics, StaticBodyHandle } from '../../core/Physics';
import { ColorBatch, makeMaterials, type Vec3 } from './Batch';

/** Colour palette of the chapter (bright low-poly, red-gold-orange accents). */
export const C = {
  RED: 0xd9432f,
  DEEP_RED: 0x9c2f24,
  GOLD: 0xf2b632,
  ORANGE: 0xff9f43,
  CREAM: 0xfff1d6,
  TEAL: 0x2ec4b6,
  BLUE: 0x4dabf7,
  PINK: 0xff8fb1,
  MINT: 0xb8f2a8,
  SKY: 0xa2d2ff,
  YELLOW: 0xffe66d,
  PEACH: 0xffb4a2,
  LILAC: 0xcdb4db,
  GREEN: 0x5fbf5a,
  DARK_GREEN: 0x3f9f4f,
  BROWN: 0x8a5a3c,
  GREY: 0x8b95a5,
  WHITE: 0xffffff,
} as const;

const quat = new THREE.Quaternion();
const euler = new THREE.Euler();

/**
 * One area's static kit: a lit batch and an unlit "glow" batch (both single draw calls once built) plus
 * helpers that add the matching collider. All colliders go through Physics, so the level unload frees them.
 */
export class Kit {
  readonly lit: ColorBatch;
  readonly glow: ColorBatch;

  constructor(
    private readonly physics: Physics,
    mats: ReturnType<typeof makeMaterials>,
    shadows = true,
  ) {
    this.lit = new ColorBatch(mats.lit, shadows, shadows);
    this.glow = new ColorBatch(mats.glow, false, false);
  }

  /** Visible box with a collider. */
  solid(size: Vec3, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): StaticBodyHandle {
    this.lit.box(size, pos, color, rot);
    return this.collider(size, pos, rot);
  }

  /** Visible upright cylinder with a cylinder collider. */
  solidCyl(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation): StaticBodyHandle {
    this.lit.cyl(radius, height, pos, color);
    return this.physics.addFixedCylinder(height / 2, radius, { x: pos[0], y: pos[1], z: pos[2] });
  }

  /** Invisible box collider. */
  collider(size: Vec3, pos: Vec3, rot?: Vec3): StaticBodyHandle {
    let r: { x: number; y: number; z: number; w: number } | undefined;
    if (rot) {
      euler.set(rot[0], rot[1], rot[2]);
      quat.setFromEuler(euler);
      r = { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
    }
    return this.physics.addFixedCuboid(
      { x: size[0] / 2, y: size[1] / 2, z: size[2] / 2 },
      { x: pos[0], y: pos[1], z: pos[2] },
      r,
    );
  }

  build(parent: THREE.Object3D): void {
    this.lit.build(parent);
    this.glow.build(parent);
  }
}

/** Shared tiny mesh helpers for the few non-batched pieces. */
export function basic(color: THREE.ColorRepresentation, extra: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
