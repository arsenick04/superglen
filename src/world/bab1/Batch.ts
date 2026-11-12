import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Vec3 = readonly [number, number, number];
export type Shape = 'box' | 'cyl' | 'sph' | 'cone' | 'pyr';

function pyramid(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4); // square base of side 1
  return g;
}

// CPU-only template geometries (never uploaded; every add() clones one).
const BASES: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  sph: new THREE.SphereGeometry(1, 12, 8),
  cone: new THREE.ConeGeometry(1, 1, 12),
  pyr: pyramid(),
};

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const col = new THREE.Color();

/**
 * Collects many coloured primitives (vertex colours) and merges them into ONE mesh = one draw call.
 * Positions are shape centres; scale is the full size (box: w,h,d; cyl/cone: radius, height, radius; sph: radii).
 */
export class ColorBatch {
  private readonly parts: THREE.BufferGeometry[] = [];

  constructor(
    private readonly material: THREE.Material,
    private readonly castShadow = true,
    private readonly receiveShadow = true,
  ) {}

  add(shape: Shape, pos: Vec3, scale: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    const g = BASES[shape].clone();
    e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q, new THREE.Vector3(scale[0], scale[1], scale[2]));
    g.applyMatrix4(m4);
    col.set(color);
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r;
      c[i * 3 + 1] = col.g;
      c[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.parts.push(g);
    return this;
  }

  box(size: Vec3, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add('box', pos, size, color, rot);
  }

  /** Upright cylinder. */
  cyl(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add('cyl', pos, [radius, height, radius], color, rot);
  }

  sph(radius: number, pos: Vec3, color: THREE.ColorRepresentation, squash: Vec3 = [1, 1, 1]): this {
    return this.add('sph', pos, [radius * squash[0], radius * squash[1], radius * squash[2]], color);
  }

  /** Four-sided pyramid (roof): base w x d, height h; `pos` is the centre of the pyramid's volume. */
  pyr(w: number, h: number, d: number, pos: Vec3, color: THREE.ColorRepresentation): this {
    return this.add('pyr', pos, [w, h, d], color);
  }

  get count(): number {
    return this.parts.length;
  }

  /** Merge, add to `parent`, free the pieces. Returns the mesh (null when empty). */
  build(parent: THREE.Object3D): THREE.Mesh | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts.length = 0;
    if (!merged) return null;
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    parent.add(mesh);
    return mesh;
  }
}

/** Shared materials of the chapter (one lit vertex-coloured, one unlit "glow" vertex-coloured). */
export function makeMaterials(): { lit: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial } {
  return {
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
}
