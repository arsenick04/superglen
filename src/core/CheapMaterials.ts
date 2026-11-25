import * as THREE from 'three';

/**
 * Cheaper materials for the 'TV ringan' tier: every MeshStandardMaterial becomes an equivalent MeshLambertMaterial (no PBR,
 * no environment reflections), which costs far less per pixel on a weak TV GPU. There is no global material hook in three, so a
 * periodic scan of the scene swaps what is new (chunks stream in all the time). The original is kept and a later change to its
 * colour / emissive / opacity (a hit flash, a fade) is copied to the replacement during the next scan.
 */
interface Link {
  orig: THREE.MeshStandardMaterial;
  color: number;
  emissive: number;
  opacity: number;
  emissiveIntensity: number;
}

const cache = new WeakMap<THREE.Material, THREE.MeshLambertMaterial>();
const links = new WeakMap<THREE.Material, Link>();
const NO_HOOK = THREE.Material.prototype.onBeforeCompile;

function swappable(m: THREE.Material): m is THREE.MeshStandardMaterial {
  return m.type === 'MeshStandardMaterial' && m.onBeforeCompile === NO_HOOK && m.userData.keepStandard !== true;
}

function toLambert(m: THREE.MeshStandardMaterial): THREE.MeshLambertMaterial {
  let l = cache.get(m);
  if (l) return l;
  l = new THREE.MeshLambertMaterial({
    name: m.name,
    color: m.color,
    map: m.map,
    emissive: m.emissive,
    emissiveMap: m.emissiveMap,
    emissiveIntensity: m.emissiveIntensity,
    alphaMap: m.alphaMap,
    alphaTest: m.alphaTest,
    aoMap: m.aoMap,
    aoMapIntensity: m.aoMapIntensity,
    lightMap: m.lightMap,
    lightMapIntensity: m.lightMapIntensity,
    vertexColors: m.vertexColors,
    flatShading: m.flatShading,
    side: m.side,
    transparent: m.transparent,
    opacity: m.opacity,
    depthWrite: m.depthWrite,
    depthTest: m.depthTest,
    blending: m.blending,
    fog: m.fog,
    wireframe: m.wireframe,
    toneMapped: m.toneMapped,
    polygonOffset: m.polygonOffset,
    polygonOffsetFactor: m.polygonOffsetFactor,
    polygonOffsetUnits: m.polygonOffsetUnits,
  });
  l.visible = m.visible;
  l.userData = m.userData;
  cache.set(m, l);
  links.set(l, { orig: m, color: m.color.getHex(), emissive: m.emissive.getHex(), opacity: m.opacity, emissiveIntensity: m.emissiveIntensity });
  return l;
}

function follow(l: THREE.Material): void {
  const k = links.get(l);
  if (!k) return;
  const lm = l as THREE.MeshLambertMaterial;
  const o = k.orig;
  const c = o.color.getHex();
  if (c !== k.color) {
    k.color = c;
    lm.color.copy(o.color);
  }
  const e = o.emissive.getHex();
  if (e !== k.emissive) {
    k.emissive = e;
    lm.emissive.copy(o.emissive);
  }
  if (o.opacity !== k.opacity) {
    k.opacity = o.opacity;
    lm.opacity = o.opacity;
  }
  if (o.emissiveIntensity !== k.emissiveIntensity) {
    k.emissiveIntensity = o.emissiveIntensity;
    lm.emissiveIntensity = o.emissiveIntensity;
  }
  if (lm.transparent !== o.transparent) {
    lm.transparent = o.transparent;
    lm.needsUpdate = true;
  }
}

function fix(m: THREE.Material): THREE.Material {
  if (swappable(m)) return toLambert(m);
  follow(m);
  return m;
}

/** Swap the materials of every mesh under `root` (also skinned and instanced ones). Returns how many meshes changed. */
export function cheapenMaterials(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const mat = mesh.material;
    if (!mat) return;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i++) {
        const r = fix(mat[i]);
        if (r !== mat[i]) {
          mat[i] = r;
          n++;
        }
      }
    } else {
      const r = fix(mat);
      if (r !== mat) {
        mesh.material = r;
        n++;
      }
    }
  });
  return n;
}
