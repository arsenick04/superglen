import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelContext } from '../Level';

/** Small Quaternius grove behind the lesson clearing; course landings stay visible. */
export function buildForestScenery(ctx: LevelContext): void {
  let disposed = false;
  const geometries: THREE.BufferGeometry[] = [];
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const release = (): void => {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  };
  ctx.onDispose(() => { disposed = true; release(); });
  const plans = [
    { name: 'NormalTree_1', height: 9, points: [[-12, 34], [13, 36], [-22, 37], [23, 39]] },
    { name: 'PineTree_2', height: 11, points: [[-17, 43], [18, 46], [-29, 43], [30, 46]] },
    { name: 'Bush', height: 1.25, points: [[-10, 33], [11, 34], [-19, 35], [21, 36], [-25, 41], [27, 42]] },
    { name: 'Rock_1', height: 0.9, points: [[-8, 36], [8, 38], [-24, 35], [25, 35]] },
  ];
  for (const plan of plans) {
    void new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}env/quaternius/${plan.name}_upright.glb`).then(({ scene }) => {
      scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(scene);
      const scale = plan.height / Math.max(0.01, bounds.max.y - bounds.min.y);
      const center = bounds.getCenter(new THREE.Vector3());
      const matrix = new THREE.Matrix4();
      const dummy = new THREE.Object3D();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        geometry.translate(-center.x, -bounds.min.y, -center.z);
        geometry.scale(scale, scale, scale);
        geometries.push(geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of meshMaterials) {
          materials.add(material);
          if (material instanceof THREE.MeshStandardMaterial) {
            material.roughness = 0.85;
            if (material.map) textures.add(material.map);
            if (/Leaves/i.test(material.name)) {
              material.transparent = false;
              material.alphaTest = 0.5;
              material.side = THREE.DoubleSide;
            }
          }
        }
        if (disposed) return;
        const instances = new THREE.InstancedMesh(geometry, object.material, plan.points.length);
        plan.points.forEach(([x, z], index) => {
          dummy.position.set(x, 0, z);
          dummy.rotation.set(0, index * 2.399, 0);
          dummy.scale.setScalar(0.92 + (index % 3) * 0.08);
          dummy.updateMatrix();
          matrix.copy(dummy.matrix);
          instances.setMatrixAt(index, matrix);
        });
        instances.castShadow = true;
        instances.receiveShadow = true;
        ctx.root.add(instances);
        ctx.onDispose(() => instances.dispose());
      });
      if (disposed) release();
    }).catch((error: unknown) => console.warn(`Forest scenery unavailable: ${plan.name}`, error));
  }
  for (const plan of plans.slice(0, 2)) for (const [x, z] of plan.points) {
    ctx.physics.addFixedCylinder(plan.height * 0.32, 0.35, { x, y: plan.height * 0.32, z });
  }
}
