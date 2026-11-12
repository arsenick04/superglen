import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Vec3 = readonly [number, number, number];
export type Shape = 'box' | 'cyl' | 'sph' | 'cone' | 'pyr';

function pyramid(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4); // square base of side 1
  return g;
}

// CPU-only template geometries (never uploaded; every add() clones one). Round shapes come in three detail tiers
// chosen by their size: a 0.17 m flower bud does not need the 168 triangles of a tree crown.
type Tier = 0 | 1 | 2;
const TIERS = {
  cyl: [
    new THREE.CylinderGeometry(1, 1, 1, 6),
    new THREE.CylinderGeometry(1, 1, 1, 8),
    new THREE.CylinderGeometry(1, 1, 1, 12),
  ],
  sph: [new THREE.SphereGeometry(1, 8, 5), new THREE.SphereGeometry(1, 10, 6), new THREE.SphereGeometry(1, 12, 8)],
  cone: [new THREE.ConeGeometry(1, 1, 6), new THREE.ConeGeometry(1, 1, 8), new THREE.ConeGeometry(1, 1, 12)],
} as const;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PYR = pyramid();

/** Detail tier from the largest radius (m) of a round shape. */
function tierFor(radius: number): Tier {
  return radius < 0.3 ? 0 : radius < 0.9 ? 1 : 2;
}

function baseFor(shape: Shape, scale: Vec3, detail?: Tier): THREE.BufferGeometry {
  switch (shape) {
    case 'box':
      return BOX;
    case 'pyr':
      return PYR;
    case 'cyl':
      return TIERS.cyl[(detail ?? tierFor(Math.max(scale[0], scale[2])))];
    case 'cone':
      return TIERS.cone[(detail ?? tierFor(Math.max(scale[0], scale[2])))];
    default:
      return TIERS.sph[detail ?? tierFor(Math.max(scale[0], scale[1], scale[2]))];
  }
}

/**
 * Spatial cell edge (m) of a batch chunk: a chunk is culled (view and shadow) as a whole. Deliberately coarse: every
 * chunk costs 1-3 draw calls (CPU), and the aim is only to separate the street from the building, hall and lab.
 * The grid is centred on x = 0 and has a row boundary at z = CHUNK_Z0 (the plaza, where the street ends).
 */
const CHUNK = 48;
/** Parts bigger than this in any direction go to one shared "big" chunk (a huge bounding sphere would defeat culling). */
const BIG = 30;
const CHUNK_Z0 = -37;

interface Part {
  g: THREE.BufferGeometry;
  cx: number;
  cz: number;
  big: boolean;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const col = new THREE.Color();

/**
 * Collects many coloured primitives (vertex colours) and merges them into ONE mesh = one draw call.
 * Positions are shape centres; scale is the full size (box: w,h,d; cyl/cone: radius, height, radius; sph: radii).
 */
export class ColorBatch {
  private readonly parts: Part[] = [];

  constructor(
    private readonly material: THREE.Material,
    private readonly castShadow = true,
    private readonly receiveShadow = true,
  ) {}

  add(shape: Shape, pos: Vec3, scale: Vec3, color: THREE.ColorRepresentation, rot?: Vec3, detail?: 0 | 1 | 2): this {
    const g = baseFor(shape, scale, detail).clone();
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
    const sx = Math.abs(scale[0]);
    const sy = Math.abs(scale[1]);
    const sz = Math.abs(scale[2]);
    const big = Math.max(sx, sy, sz) > BIG;
    this.parts.push({ g, cx: pos[0], cz: pos[2], big });
    return this;
  }

  box(size: Vec3, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add('box', pos, size, color, rot);
  }

  /** Upright cylinder. */
  cyl(radius: number, height: number, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3): this {
    return this.add('cyl', pos, [radius, height, radius], color, rot);
  }

  sph(radius: number, pos: Vec3, color: THREE.ColorRepresentation, squash: Vec3 = [1, 1, 1], detail?: 0 | 1 | 2): this {
    return this.add('sph', pos, [radius * squash[0], radius * squash[1], radius * squash[2]], color, undefined, detail);
  }

  /** Four-sided pyramid (roof): base w x d, height h; `pos` is the centre of the pyramid's volume. */
  pyr(w: number, h: number, d: number, pos: Vec3, color: THREE.ColorRepresentation): this {
    return this.add('pyr', pos, [w, h, d], color);
  }

  get count(): number {
    return this.parts.length;
  }

  /**
   * Merge into one mesh per spatial chunk (so view/shadow culling can drop far chunks), add to `parent`, free the
   * pieces. Returns the first mesh (null when empty). Chunks are static: matrixAutoUpdate off.
   */
  build(parent: THREE.Object3D): THREE.Mesh | null {
    if (this.parts.length === 0) return null;
    const groups = new Map<string, THREE.BufferGeometry[]>();
    for (const p of this.parts) {
      const key = p.big ? 'big' : `${Math.floor((p.cx + CHUNK / 2) / CHUNK)},${Math.floor((p.cz - CHUNK_Z0) / CHUNK)}`;
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push(p.g);
    }
    let first: THREE.Mesh | null = null;
    for (const list of groups.values()) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.material);
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      first ??= mesh;
    }
    this.parts.length = 0;
    return first;
  }
}

/** Shared materials of the chapter (one lit vertex-coloured, one unlit "glow" vertex-coloured). */
export function makeMaterials(): { lit: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial } {
  return {
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
}
