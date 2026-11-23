import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelContext } from '../Level';
import { CITY_LAYOUT, treePlatforms, type CityTree } from './CityData';

/**
 * The city's vegetation: Quaternius "Stylized Nature MegaKit" (CC0), optimised by scripts/build-megakit.mjs into
 * public/env/megakit/megakit.glb (about 340 KB): ONE material and ONE atlas for every variant (trees, pines, bushes, flower beds,
 * grass tufts, rocks), each variant a few hundred triangles. Every variant is one InstancedMesh (one draw call; trees also in the shadow
 * pass), refilled from the placement lists whenever the player has moved 3 m: only what is within a radius
 * of the player is drawn, everything shrinks away over the last 10 m of that radius instead of popping.
 *
 * Colliders and climbing steps belong to the city data; this is only the look. When the file is missing, the city keeps its
 * Kenney / procedural trees and plants (`natureReady()` is false and nothing here is used).
 */
export type NatureId = 'tree_a' | 'pine_a' | 'bush' | 'flowerbed' | 'grass' | 'rock';

interface Asset {
  geometry: THREE.BufferGeometry;
  /** Bounding box size at scale 1. */
  size: THREE.Vector3;
}

/** A decorative plant / rock placed by the city builder (no collider). */
export interface NaturePut {
  id: NatureId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Uniform scale of the model. */
  s: number;
  /** Instance tint (multiplies the atlas colours). */
  tint: number;
  /** Extra horizontal stretch (default 1): trees come stout or slim. */
  w?: number;
}

const assets = new Map<NatureId, Asset>();
let material: THREE.MeshStandardMaterial | null = null;
let loading: Promise<void> | null = null;
let frozen = false;
/** Filled by CityBuilder.scatterGreen while the city is built (once per page). */
export const GREEN_PLAN: NaturePut[] = [];

/** Draw radius (m) per variant, and the most instances drawn at once. */
const RADIUS: Record<NatureId, number> = { tree_a: 72, pine_a: 72, bush: 55, flowerbed: 48, grass: 40, rock: 60 };
const CAP: Record<NatureId, number> = { tree_a: 200, pine_a: 200, bush: 300, flowerbed: 220, grass: 260, rock: 120 };
const CASTS = new Set<NatureId>(['tree_a', 'pine_a']);
const EDGE = 10;

/** Boot: download the model file. Resolves (never rejects) when done, failed or after 10 s; availability is frozen after that. */
export function preloadCityNature(): Promise<void> {
  return loading ??= new Promise((resolve) => {
    const timer = setTimeout(() => { frozen = true; resolve(); }, 10000);
    new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}env/megakit/megakit.glb`).then(({ scene }) => {
      if (frozen) return;
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const geometry = o.geometry as THREE.BufferGeometry;
        geometry.computeBoundingBox();
        const mat = o.material as THREE.MeshStandardMaterial;
        if (!material) {
          material = mat;
          material.side = THREE.DoubleSide;
          material.shadowSide = THREE.DoubleSide;
          material.alphaTest = Math.max(material.alphaTest, 0.42);
          material.roughness = 0.92;
          material.metalness = 0;
          material.envMapIntensity = 0.65;
          if (material.map) { material.map.anisotropy = 4; material.map.generateMipmaps = true; material.map.minFilter = THREE.LinearMipmapLinearFilter; }
        }
        assets.set(o.name as NatureId, { geometry, size: (geometry.boundingBox as THREE.Box3).getSize(new THREE.Vector3()) });
      });
    }).catch((error: unknown) => console.warn('City nature unavailable', error)).finally(() => { clearTimeout(timer); frozen = true; resolve(); });
  });
}

/** True when the MegaKit file loaded: the city draws vegetation with it. */
export function natureReady(): boolean {
  return material !== null && assets.has('tree_a') && assets.has('pine_a') && assets.has('bush') && assets.has('flowerbed') && assets.has('grass');
}

export function hasCityTree(_tree: CityTree): boolean {
  return natureReady();
}

/** Shared geometry + material of a variant, for other levels (ForestScenery). Never dispose them. */
export function natureAsset(id: NatureId): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; size: THREE.Vector3 } | null {
  const a = assets.get(id);
  return a && material ? { geometry: a.geometry, material, size: a.size } : null;
}

/** Model size at scale 1 (for fitting). */
export function natureSize(id: NatureId): THREE.Vector3 | null {
  return assets.get(id)?.size ?? null;
}

const LEAF_TINTS = [0xffffff, 0xf2ffe0, 0xe6ffd2, 0xfff2cc];
const PINE_TINTS = [0xeafff0, 0xdcf8e6, 0xf2ffe8];

function hash(a: number, b: number, k = 0): number {
  const s = Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

interface Group {
  id: NatureId;
  items: NaturePut[];
  mesh: THREE.InstancedMesh;
}

/** Instanced vegetation around the player; the city owns all colliders. */
export class CityNature {
  private readonly groups: Group[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(ctx: LevelContext) {
    const items = new Map<NatureId, NaturePut[]>();
    const add = (p: NaturePut): void => { (items.get(p.id) ?? items.set(p.id, []).get(p.id))?.push(p); };
    for (const tree of CITY_LAYOUT.trees) {
      const crown = treePlatforms(tree)[4];
      const height = crown ? crown.center[1] + crown.size[1] / 2 - tree.base : (tree.kind === 'pine' ? 4.25 : 4) * tree.s;
      const hv = hash(tree.x, tree.z, 2);
      const id: NatureId = tree.kind === 'pine' ? 'pine_a' : 'tree_a';
      const a = assets.get(id);
      if (!a) continue;
      // Fit the crown height of the collider; width follows the tree (a little stout, like a storybook tree).
      const s = height / a.size.y;
      const tints = tree.kind === 'pine' ? PINE_TINTS : LEAF_TINTS;
      add({ id, x: tree.x, y: tree.base, z: tree.z, yaw: Math.sin(tree.x * 7 + tree.z) * Math.PI, s, w: tree.kind === 'pine' ? 0.85 + hash(tree.z, tree.x, 3) * 0.25 : 0.95 + hash(tree.z, tree.x, 3) * 0.3, tint: tints[Math.floor(hv * 997) % tints.length] });
    }
    for (const p of GREEN_PLAN) add(p);
    for (const [id, list] of items) {
      const a = assets.get(id);
      if (!a || !material) continue;
      const mesh = new THREE.InstancedMesh(a.geometry, material, Math.min(list.length, CAP[id]));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.tint.set(0xffffff));
      mesh.castShadow = CASTS.has(id);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `nature-${id}`;
      ctx.root.add(mesh);
      ctx.onDispose(() => mesh.dispose()); // geometry and material are shared across city visits
      this.groups.push({ id, items: list, mesh });
    }
  }

  update(x: number, z: number): void {
    if (Math.hypot(x - this.lastX, z - this.lastZ) < 3) return;
    this.lastX = x;
    this.lastZ = z;
    const d = this.dummy;
    for (const { id, items, mesh } of this.groups) {
      const R = RADIUS[id];
      const R2 = R * R;
      const cap = mesh.instanceMatrix.count;
      let n = 0;
      for (let i = 0; i < items.length && n < cap; i++) {
        const p = items[i];
        const dx = p.x - x, dz = p.z - z;
        const q = dx * dx + dz * dz;
        if (q > R2) continue;
        let s = p.s;
        if (q > (R - EDGE) * (R - EDGE)) s *= Math.max(0.02, (R - Math.sqrt(q)) / EDGE);
        d.position.set(p.x, p.y, p.z);
        d.rotation.set(0, p.yaw, 0);
        const w = p.w ?? 1;
        d.scale.set(s * w, s, s * w);
        d.updateMatrix();
        mesh.setMatrixAt(n, d.matrix);
        mesh.setColorAt(n, this.tint.set(p.tint));
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
