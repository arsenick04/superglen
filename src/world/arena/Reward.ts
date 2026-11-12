import * as THREE from 'three';

/** One shared five-point star (extruded, a few dozen triangles) for every reward. */
export function makeStarGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.46;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  g.translate(0, 0, -0.15);
  return g;
}

/**
 * A gold star that floats and turns over a goal. Walking into it (feet within `radius` horizontally and `window`
 * vertically of the star's base) fires `onTake` once; it can be taken again after `retake` seconds away from it.
 * No allocations per frame.
 */
export class Reward {
  readonly mesh: THREE.Mesh;
  /** How many times it was taken (tests read it). */
  count = 0;
  private inside = false;
  private spin = 0;
  private pop = 0;

  constructor(
    root: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    readonly id: string,
    readonly x: number,
    /** Height of the surface the star stands over. */
    readonly baseY: number,
    readonly z: number,
    /** Star radius (m). */
    readonly size: number,
    readonly onTake: (r: Reward) => void,
  ) {
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.setScalar(size);
    this.mesh.position.set(x, baseY + size * 1.5 + 0.4, z);
    this.mesh.castShadow = false;
    root.add(this.mesh);
  }

  /** Height of the star's centre. */
  get y(): number {
    return this.baseY + this.size * 1.5 + 0.4;
  }

  tick(px: number, py: number, pz: number, radius: number, window: number): void {
    const near = Math.hypot(px - this.x, pz - this.z) < radius && py > this.baseY - 0.6 && py < this.baseY + window;
    if (near && !this.inside) {
      this.inside = true;
      this.count++;
      this.pop = 1;
      this.onTake(this);
    } else if (!near) {
      this.inside = false;
    }
  }

  /** Visual only (per frame). */
  animate(dt: number): void {
    this.spin += dt * (1.1 + this.pop * 9);
    this.pop = Math.max(0, this.pop - dt * 1.4);
    this.mesh.rotation.y = this.spin;
    const s = this.size * (1 + this.pop * 0.35);
    this.mesh.scale.setScalar(s);
    this.mesh.position.y = this.y + Math.sin(this.spin * 0.9) * 0.12;
  }
}
