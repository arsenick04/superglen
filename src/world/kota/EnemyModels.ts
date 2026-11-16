import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * The owner's static (unrigged) enemy models: public/models/enemies/<id>.glb (made by `npm run models`, Meshopt + source textures).
 * Loaded once at boot. A model becomes a plain geometry of unit height (feet at y = 0, centred on x/z, face toward +z) plus a shared
 * material (base colour + normal map), so every user scales it to its gameplay height and animates it with matrices (no rig).
 * Everything here is best effort: a missing or broken file leaves `has(id)` false and the caller draws its procedural figure.
 *
 * Ids: `curut_cemberut` (+ `curut_cemberut_lo`, the light copy for crowds), `ular_melar_head` (only the head: the stretching body is
 * drawn by SnakeBoss), `tikus_rakus`, `elang_belang`, `gorilla_gembira`.
 */
export type EnemyId = 'curut_cemberut' | 'curut_cemberut_lo' | 'ular_melar_head' | 'tikus_rakus' | 'elang_belang' | 'gorilla_gembira';

/** Loaded right away (the chapters that exist) and in the background (later chapters). */
const NOW: EnemyId[] = ['curut_cemberut_lo', 'ular_melar_head', 'tikus_rakus'];
const LATER: EnemyId[] = ['curut_cemberut', 'elang_belang', 'gorilla_gembira'];

interface Entry {
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  /** Size of the unit-height geometry (x width, y = 1, z depth) and the original height of the model. */
  size: THREE.Vector3;
}

/** Copy to plain float attributes (the Meshopt file uses normalized integers that cannot be transformed in place). */
function toFloat(src: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const P = src.getAttribute('position');
  const N = src.getAttribute('normal');
  const U = src.getAttribute('uv');
  const pos = new Float32Array(P.count * 3);
  const nrm = new Float32Array(P.count * 3);
  const uv = new Float32Array(P.count * 2);
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(m).toArray(pos, i * 3);
    if (N) v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize().toArray(nrm, i * 3);
    if (U) {
      uv[i * 2] = U.getX(i);
      uv[i * 2 + 1] = U.getY(i);
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const I = src.getIndex();
  if (I) g.setIndex(new THREE.BufferAttribute(P.count > 65535 ? Uint32Array.from(I.array as ArrayLike<number>) : Uint16Array.from(I.array as ArrayLike<number>), 1));
  return g;
}

class EnemyModels {
  private readonly entries = new Map<EnemyId, Entry>();
  private promise: Promise<void> | null = null;
  failed: string[] = [];
  bytes = 0;

  has(id: EnemyId): boolean {
    return this.entries.has(id);
  }

  /** Original (unit-height) size of a model: width and depth per metre of height. */
  size(id: EnemyId): THREE.Vector3 | null {
    return this.entries.get(id)?.size ?? null;
  }

  /**
   * A fresh geometry scaled to `height` metres (the caller owns it and may dispose it), feet at y = 0, or null when not loaded.
   * `centerY`: centre vertically instead (the snake head pivots around its middle).
   */
  geometry(id: EnemyId, height: number, centerY = false): THREE.BufferGeometry | null {
    const e = this.entries.get(id);
    if (!e) return null;
    const g = e.geo.clone();
    g.scale(height, height, height);
    if (centerY) {
      g.computeBoundingBox();
      const c = (g.boundingBox as THREE.Box3).getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  /** Shared material (do not dispose). */
  material(id: EnemyId): THREE.MeshStandardMaterial | null {
    return this.entries.get(id)?.mat ?? null;
  }

  /** Load once; resolves (never rejects) when the needed models are in, failed or after `timeoutMs`. The rest keeps loading quietly. */
  load(timeoutMs = 8000): Promise<void> {
    this.promise ??= new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const base = `${import.meta.env.BASE_URL}models/enemies/`;
      const one = async (id: EnemyId): Promise<void> => {
        try {
          const res = await fetch(`${base}${id}.glb`);
          if (!res.ok) throw new Error(`${res.status}`);
          const buf = await res.arrayBuffer();
          this.bytes += buf.byteLength;
          const gltf = await loader.parseAsync(buf, base);
          gltf.scene.updateMatrixWorld(true);
          let mesh: THREE.Mesh | null = null;
          gltf.scene.traverse((o) => {
            if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
          });
          if (!mesh) throw new Error('no mesh');
          const m = mesh as THREE.Mesh;
          const geo = toFloat(m.geometry, m.matrixWorld);
          m.geometry.dispose();
          geo.computeBoundingBox();
          const bb = geo.boundingBox as THREE.Box3;
          const h = bb.max.y - bb.min.y;
          const c = bb.getCenter(new THREE.Vector3());
          // Heads are cut from a taller model and keep their own origin; whole bodies stand on the ground, centred on x/z.
          if (id === 'ular_melar_head') geo.scale(1 / h, 1 / h, 1 / h);
          else {
            geo.translate(-c.x, -bb.min.y, -c.z);
            geo.scale(1 / h, 1 / h, 1 / h);
          }
          geo.computeBoundingBox();
          const size = (geo.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
          const src = m.material as THREE.MeshStandardMaterial;
          const mat = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughness: 0.85, metalness: 0 });
          if (mat.map) mat.map.anisotropy = 4;
          this.entries.set(id, { geo, mat, size });
        } catch (err) {
          this.failed.push(id);
          console.warn(`Enemy model ${id} failed to load, using the procedural figure.`, err);
        }
      };
      void Promise.all(NOW.map(one)).then(() => {
        clearTimeout(timer);
        resolve();
        for (const id of LATER) void one(id);
      });
    });
    return this.promise;
  }
}

export const enemyModels = new EnemyModels();

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__enemyModels = {
    info: () => ({ loaded: [...(enemyModels as unknown as { entries: Map<string, unknown> }).entries.keys()], failed: enemyModels.failed, bytes: enemyModels.bytes }),
  };
}
