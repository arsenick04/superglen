import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelContext } from '../Level';
import { CITY_LAYOUT, treePlatforms, type CityTree } from './CityData';

interface TreePart { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }
const templates = new Map<string, TreePart[]>();
let loading: Promise<void> | null = null;
let frozen = false;

/** Freeze availability at boot: failed downloads retain the existing city trees. */
export function preloadCityTrees(): Promise<void> {
  return loading ??= new Promise((resolve) => {
    const timer = setTimeout(() => { frozen = true; resolve(); }, 10000);
    void Promise.all(['round', 'pine'].map(async (kind) => {
      const file = kind === 'round' ? 'NormalTree_1' : 'PineTree_2';
      try {
        const { scene } = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}env/quaternius/${file}_city_upright.glb`);
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(scene);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const parts: TreePart[] = [];
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const geometry = object.geometry.clone();
          geometry.applyMatrix4(object.matrixWorld);
          geometry.translate(-center.x, -bounds.min.y, -center.z);
          geometry.scale(1 / Math.max(size.x, size.z), 1 / size.y, 1 / Math.max(size.x, size.z));
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (material instanceof THREE.MeshStandardMaterial) {
              material.roughness = 0.85;
              if (/Leaves/i.test(material.name)) {
                material.transparent = false;
                material.alphaTest = 0.5;
                material.side = THREE.DoubleSide;
              }
            }
          }
          parts.push({ geometry, material: object.material });
        });
        if (!frozen) templates.set(kind, parts);
      } catch (error) { console.warn(`City tree unavailable: ${kind}`, error); }
    })).then(() => { clearTimeout(timer); frozen = true; resolve(); });
  });
}

export function hasCityTree(tree: CityTree): boolean {
  return !tree.far && (templates.get(tree.kind)?.length ?? 0) > 0;
}

/** Reuse each textured mesh across nearby trees; the city owns all colliders. */
export class CityTrees {
  private readonly groups: { trees: { tree: CityTree; height: number }[]; meshes: THREE.InstancedMesh[] }[] = [];
  private readonly dummy = new THREE.Object3D();
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(ctx: LevelContext) {
    for (const [kind, parts] of templates) {
      const trees = CITY_LAYOUT.trees.filter((tree) => tree.kind === kind && hasCityTree(tree)).map((tree) => {
        const crown = treePlatforms(tree)[4];
        return { tree, height: crown ? crown.center[1] + crown.size[1] / 2 - tree.base : (tree.kind === 'pine' ? 4.25 : 4) * tree.s };
      });
      const meshes = parts.map(({ geometry, material }) => {
        const mesh = new THREE.InstancedMesh(geometry, material, trees.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.count = 0;
        ctx.root.add(mesh);
        ctx.onDispose(() => mesh.dispose()); // templates are shared across city visits
        return mesh;
      });
      this.groups.push({ trees, meshes });
    }
  }

  update(x: number, z: number): void {
    if (Math.hypot(x - this.lastX, z - this.lastZ) < 3) return;
    this.lastX = x;
    this.lastZ = z;
    for (const { trees, meshes } of this.groups) {
      let index = 0;
      for (const { tree, height } of trees) {
        if (Math.hypot(x - tree.x, z - tree.z) > 85) continue;
        this.dummy.position.set(tree.x, tree.base, tree.z);
        // Keep the original branch steps aligned with their colliders.
        this.dummy.rotation.set(0, Math.sin(tree.x * 7 + tree.z) * Math.PI, 0);
        this.dummy.scale.set(2.8 * tree.s, height, 2.8 * tree.s);
        this.dummy.updateMatrix();
        for (const mesh of meshes) mesh.setMatrixAt(index, this.dummy.matrix);
        index++;
      }
      for (const mesh of meshes) {
        mesh.count = index;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
