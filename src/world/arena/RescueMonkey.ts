import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LevelContext } from '../Level';

let asset: Promise<GLTF> | null = null;
/** Imported, textured and rigged monkey; the existing panic hop drives its holder. */
export class RescueMonkey {
  private mixer: THREE.AnimationMixer | null = null;
  constructor(group: THREE.Group, ctx: LevelContext) {
    let disposed = false;
    ctx.onDispose(() => { disposed = true;this.mixer?.stopAllAction(); });
    asset ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/rescue/monkey.glb`);
    void asset.then((gltf) => {
      if (disposed) return;
      const model = clone(gltf.scene);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const scale = 1.1 / Math.max(size.y, 0.01);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      for (const child of [...group.children]) {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
        group.remove(child);
      }
      group.add(model);
      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(model);
        const action = this.mixer.clipAction(gltf.animations[0]);
        action.play();action.time = Math.random() * gltf.animations[0].duration;
      }
    }).catch((error: unknown) => { console.warn('Rescue monkey model unavailable', error); });
  }
  update(dt: number): void { this.mixer?.update(dt); }
}
