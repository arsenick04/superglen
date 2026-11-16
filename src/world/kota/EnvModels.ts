import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { registerTemplate, type Sh } from './CityMesher';

/**
 * Environment models of the city (public/env/env.glb, made by scripts/build-env-assets.mjs, CC0): soft stylised trees, lamps,
 * benches and cars. They become CityMesher templates, so the city merges them into its chunk meshes like any primitive (no extra
 * draw calls, no extra material). Loaded once at boot next to Rapier (about 45 KB); if the file is missing or slow the city
 * falls back to its primitive shapes (every user checks `shape(name) >= 0`).
 */
export type EnvName = 'canopy' | 'trunk' | 'pine' | 'lamp' | 'car' | 'bench';

const NAMES: EnvName[] = ['canopy', 'trunk', 'pine', 'lamp', 'car', 'bench'];

class EnvModels {
  private readonly ids = new Map<EnvName, Sh>();
  private readonly geos = new Map<EnvName, THREE.BufferGeometry>();
  private readonly sizes = new Map<EnvName, THREE.Vector3>();
  private promise: Promise<void> | null = null;
  /** True once the templates are registered (before the city is built). */
  ready = false;

  /** Template id of a model, -1 when not loaded (draw the primitive fallback). */
  shape(name: EnvName): Sh | -1 {
    return this.ids.get(name) ?? -1;
  }

  /** Model size at scale 1 (bounding box), for fitting to a footprint. */
  size(name: EnvName): THREE.Vector3 | null {
    return this.sizes.get(name) ?? null;
  }

  /** Plain geometry (position, normal, color) for instanced meshes (cars). Shared: do not dispose. */
  geometry(name: EnvName): THREE.BufferGeometry | null {
    return this.geos.get(name) ?? null;
  }

  /** Load once; resolves (never rejects) when done, failed or after `timeoutMs`. */
  load(timeoutMs = 6000): Promise<void> {
    this.promise ??= new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.load(
        `${import.meta.env.BASE_URL}env/env.glb`,
        (gltf) => {
          // A late arrival after the timeout must not change templates under an already built city.
          if (this.ready || this.cityBuilt) return done();
          gltf.scene.updateMatrixWorld(true);
          for (const name of NAMES) {
            const mesh = gltf.scene.getObjectByName(name) as THREE.Mesh | undefined;
            if (!mesh?.isMesh) continue;
            const g = mesh.geometry;
            const P = g.getAttribute('position');
            const N = g.getAttribute('normal');
            const Cc = g.getAttribute('color');
            const I = g.getIndex();
            if (!P || !N || !Cc || !I) continue;
            const n = P.count;
            const pos = new Float32Array(n * 3);
            const nrm = new Float32Array(n * 3);
            const col = new Uint8Array(n * 3);
            const v = new THREE.Vector3();
            const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
            for (let k = 0; k < n; k++) {
              v.fromBufferAttribute(P, k).applyMatrix4(mesh.matrixWorld).toArray(pos, k * 3);
              v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize().toArray(nrm, k * 3);
              col[k * 3] = Math.round(Cc.getX(k) * 255);
              col[k * 3 + 1] = Math.round(Cc.getY(k) * 255);
              col[k * 3 + 2] = Math.round(Cc.getZ(k) * 255);
            }
            const idx = Uint16Array.from(I.array as ArrayLike<number>);
            this.ids.set(name, registerTemplate(pos, nrm, col, idx));
            const plain = new THREE.BufferGeometry();
            plain.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            plain.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
            plain.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
            plain.setIndex(new THREE.BufferAttribute(idx, 1));
            plain.computeBoundingSphere();
            plain.computeBoundingBox();
            this.geos.set(name, plain);
            this.sizes.set(name, (plain.boundingBox as THREE.Box3).getSize(new THREE.Vector3()));
            g.dispose();
          }
          this.ready = true;
          done();
        },
        undefined,
        () => done(),
      );
    });
    return this.promise;
  }

  /** Set by the city builder: templates are frozen from then on. */
  cityBuilt = false;
}

export const envModels = new EnvModels();
