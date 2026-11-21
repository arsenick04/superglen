import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { registerTemplate, type Sh } from './CityMesher';

/**
 * Model library of the city (L18):
 *
 *  - public/env/kenney.glb: Kenney CC0 kits (houses, shops, towers, trees, cars, street furniture), palette baked into vertex
 *    colours by scripts/env-kenney.mjs. Each model has a full mesh and (most) a simplified `@1` far LOD. Attributes: position,
 *    normal, color (linear), aMask (1 = repaintable accent: house roof / car paint, 0.5 = wall tinted per building, 0 = as baked).
 *  - public/env/quaternius-nature.glb: a tiny texture-free subset of Quaternius Ultimate Stylized Nature. Its colours are baked
 *    into vertices by scripts/quaternius-nature.py, so the four tree variants can still be merged into streamed city chunks.
 *  - public/env/buildings/*.glb: the owner's custom buildings (textured, PBR). public/env/buildings/manifest.json says which city
 *    building each one replaces (`kind`, or `glen` for Glen's house) and how its body sits inside the model (`body`, `yaw`).
 *
 * Loaded once at boot next to Rapier. Everything is optional: a building whose model is missing keeps its procedural look.
 */
export interface KModel {
  name: string;
  geo: THREE.BufferGeometry;
  lod: THREE.BufferGeometry | null;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface CustomBuilding {
  name: string;
  scene: THREE.Group;
  min: THREE.Vector3;
  max: THREE.Vector3;
  hint: BuildingHint;
}

/** One entry of art/models/buildings/buildings.json (copied into the manifest by the pipeline). */
export interface BuildingHint {
  /** City building kind it replaces ('school', 'bank', 'hospital', 'gudang', 'pasar', 'oldBarongsai') or 'glen' (Glen's house). */
  kind?: string;
  /** Body (the part that should match the collider) inside the model's bounding box, normalised: [x0, x1, z0, z1] in -0.5..0.5. */
  body?: [number, number, number, number];
  /** Extra yaw (radians) when the model's front is not +z. */
  yaw?: number;
  /** Height scale relative to the mean of the x / z scales (1 = proportional). */
  ySquash?: number;
  /** Ground plate thickness as a fraction of the model height: sunk under the city ground (default 0.03). */
  sink?: number;
  /** Actual walkable roof height as a fraction of the model bounds; excludes signs / crosses above a flat roof. */
  roof?: number;
  /** Metres of the model's yard kept in front of the facade (the rest is clipped; default 3). */
  yard?: number;
  /** Shift along the facade (m, after scaling): e.g. to put the model's door on the city's door. */
  shift?: number;
}

class CityModels {
  readonly models = new Map<string, KModel>();
  readonly buildings = new Map<string, CustomBuilding>();
  private readonly templates = new Map<string, Sh>();
  private promise: Promise<void> | null = null;
  ready = false;

  has(name: string): boolean {
    return this.models.has(name);
  }

  get(name: string): KModel | undefined {
    return this.models.get(name);
  }

  /** CityLife car: the Kenney sedan scaled to the old 3.5 m car, front +z (own copy: the caller disposes it). */
  carGeometry(): THREE.BufferGeometry | null {
    const m = this.models.get('car_sedan');
    if (!m) return null;
    const g = m.geo.clone();
    g.scale(1.36, 1.36, 1.36);
    g.computeBoundingSphere();
    return g;
  }

  /** Custom building replacing a city kind (or 'glen'). */
  custom(kind: string): CustomBuilding | undefined {
    for (const b of this.buildings.values()) if (b.hint.kind === kind) return b;
    return undefined;
  }

  /**
   * The model as a CityMesher template (merged into the streamed chunk meshes: small props like trees, bushes, lamps). Registered on
   * first use, which must happen while the city is built (before `envModels.cityBuilt`). -1 when the model is missing.
   */
  template(name: string): Sh | -1 {
    const t = this.templates.get(name);
    if (t !== undefined) return t;
    const m = this.models.get(name);
    if (!m) return -1;
    const g = m.geo;
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    const Cc = g.getAttribute('color');
    const I = g.getIndex();
    if (!I || P.count > 65535) return -1;
    const n = P.count;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const col = new Uint8Array(n * 3);
    for (let k = 0; k < n; k++) {
      // Templates are authored at the origin (base centre); Kenney props are already base-centred.
      pos[k * 3] = P.getX(k);
      pos[k * 3 + 1] = P.getY(k) - m.min.y;
      pos[k * 3 + 2] = P.getZ(k);
      nrm[k * 3] = N.getX(k);
      nrm[k * 3 + 1] = N.getY(k);
      nrm[k * 3 + 2] = N.getZ(k);
      col[k * 3] = Math.round(Cc.getX(k) * 255);
      col[k * 3 + 1] = Math.round(Cc.getY(k) * 255);
      col[k * 3 + 2] = Math.round(Cc.getZ(k) * 255);
    }
    const id = registerTemplate(pos, nrm, col, Uint16Array.from(I.array as ArrayLike<number>));
    this.templates.set(name, id);
    return id;
  }

  /** Load once; resolves (never rejects) when done, failed or after `timeoutMs`. */
  load(timeoutMs = 15000): Promise<void> {
    this.promise ??= new Promise<void>((resolve) => {
      let finished = false;
      const done = (): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        finished = true;
        resolve();
      }, timeoutMs);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const base = import.meta.env.BASE_URL;
      const loadLibrary = (url: string): Promise<void> => loader
        .loadAsync(url)
        .then((gltf) => {
          if (finished) return;
          const lods = new Map<string, THREE.BufferGeometry>();
          for (const o of gltf.scene.children) {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) continue;
            const g = plain(mesh.geometry);
            if (o.name.endsWith('@1')) lods.set(o.name.slice(0, -2), g);
            else {
              g.computeBoundingBox();
              const bb = g.boundingBox as THREE.Box3;
              this.models.set(o.name, { name: o.name, geo: g, lod: null, min: bb.min.clone(), max: bb.max.clone() });
            }
            mesh.geometry.dispose();
          }
          for (const [k, g] of lods) {
            const m = this.models.get(k);
            if (m) m.lod = g;
          }
        })
        .catch(() => undefined);
      const libraries = Promise.all([
        loadLibrary(`${base}env/kenney.glb`),
        loadLibrary(`${base}env/quaternius-nature.glb`),
      ]);
      const custom = fetch(`${base}env/buildings/manifest.json`)
        .then((r) => (r.ok ? (r.json() as Promise<{ buildings: Record<string, { file: string } & BuildingHint> }>) : null))
        .then((man) => {
          if (!man) return;
          return Promise.all(
            Object.entries(man.buildings).map(([name, e]) =>
              loader
                .loadAsync(`${base}env/${e.file}`)
                .then((gltf) => {
                  if (finished) return;
                  const bb = new THREE.Box3().setFromObject(gltf.scene);
                  gltf.scene.traverse((o) => {
                    const m = o as THREE.Mesh;
                    if (!m.isMesh) return;
                    m.castShadow = true;
                    m.receiveShadow = true;
                    const mat = m.material as THREE.MeshStandardMaterial;
                    if (mat.map) {
                      mat.map.anisotropy = 8;
                      mat.map.generateMipmaps = true;
                      mat.map.minFilter = THREE.LinearMipmapLinearFilter;
                    }
                    mat.metalness = 0;
                    mat.envMapIntensity = 0.65;
                    // A back-facing scan triangle should not turn a cheek or roof into a see-through opening.
                    mat.side = THREE.DoubleSide;
                  });
                  this.buildings.set(name, { name, scene: gltf.scene, min: bb.min.clone(), max: bb.max.clone(), hint: e });
                })
                .catch(() => undefined),
            ),
          );
        })
        .catch(() => undefined);
      void Promise.all([libraries, custom]).then(() => {
        if (!finished) this.ready = this.models.size > 0 || this.buildings.size > 0;
        done();
      });
    });
    return this.promise;
  }
}

/** Copy into a plain geometry: position, normal, color (float), aMask, index. */
function plain(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const P = src.getAttribute('position');
  const n = P.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const mask = new Float32Array(n);
  const N = src.getAttribute('normal');
  const C = src.getAttribute('color');
  const M = src.getAttribute('_mask');
  for (let k = 0; k < n; k++) {
    pos[k * 3] = P.getX(k);
    pos[k * 3 + 1] = P.getY(k);
    pos[k * 3 + 2] = P.getZ(k);
    nrm[k * 3] = N.getX(k);
    nrm[k * 3 + 1] = N.getY(k);
    nrm[k * 3 + 2] = N.getZ(k);
    col[k * 3] = C ? C.getX(k) : 1;
    col[k * 3 + 1] = C ? C.getY(k) : 1;
    col[k * 3 + 2] = C ? C.getZ(k) : 1;
    mask[k] = M ? M.getX(k) : 0;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  const I = src.getIndex();
  if (I) g.setIndex(new THREE.BufferAttribute(n > 65535 ? Uint32Array.from(I.array as ArrayLike<number>) : Uint16Array.from(I.array as ArrayLike<number>), 1));
  return g;
}

export const cityModels = new CityModels();

/** Car-kit material: per-instance colour only on the paint (aMask = 1); everything else keeps the baked colours. */
export function paintMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMask;').replace(
      '#include <color_vertex>',
      `vColor = vec4(1.0);
#ifdef USE_COLOR
vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
if (aMask > 0.75) vColor.rgb = instanceColor.rgb * clamp(dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.3, 0.6, 1.3);
#endif`,
    );
  };
  m.customProgramCacheKey = () => 'sg-car-paint';
  return m;
}
