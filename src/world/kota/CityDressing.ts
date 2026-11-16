import * as THREE from 'three';
import { FACE_VEC, type CityBuilding, type CityLayout } from './CityData';
import { cityModels, type CustomBuilding, type KModel } from './CityModels';

/**
 * L18: the city's buildings drawn with real models instead of procedural boxes.
 *
 *  - Kenney kit models (houses, shops, kiosks, towers): ONE BatchedMesh for the whole city (one draw call + one in the shadow
 *    pass), per-instance matrix (fitted to the building's collider box) and colour (roof accent + wall hue, see `material`).
 *    Distance LOD: an instance swaps to the model's simplified `@1` geometry beyond `LOD_FAR` m (checked every few frames, no
 *    allocation).
 *  - The owner's custom buildings (public/env/buildings): a normal mesh each, placed by the hint in the manifest.
 *
 * The colliders, footholds and climbing pieces never change: the data (CityData.ts) is the truth, the models are only dressed
 * on top. `dressOf` is pure and deterministic: CityBuilder asks it which procedural parts to leave out.
 */
const LOD_FAR = 70;

/** Per-building dress: which model and how (all world units). */
export interface Dress {
  /** Kenney model name (kenney.glb) or custom building name (prefix `custom:`). */
  model: string;
  matrix: THREE.Matrix4;
  /** Instance colour: rgb = accent (house roof), a = wall hue (0 = keep white). */
  color: THREE.Vector4;
  /** Which procedural parts CityBuilder must not draw any more. */
  skipBody: boolean;
  skipRoof: boolean;
  skipFacade: boolean;
}

const HOUSES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'n', 'o', 's', 't', 'u'].map((c) => `sub_building-type-${c}`);
const SHOPS = ['a', 'b', 'd', 'f', 'g', 'h', 'i', 'l'].map((c) => `com_building-${c}`);
const KIOSKS = ['com_building-c', 'com_building-e'];
const TOWERS: Record<string, string> = { clock: 'com_building-skyscraper-a', bell: 'com_building-skyscraper-e', water: 'com_building-skyscraper-c', pagoda: 'com_building-skyscraper-b', coin: 'com_building-skyscraper-d' };
/** Peach, butter, mint, sky, lilac, rose, apricot, sage. */
const WALL_HUES = [0.06, 0.13, 0.36, 0.55, 0.74, 0.95, 0.09, 0.27];
const CUSTOM_KINDS = new Set(['school', 'bank', 'hospital', 'gudang', 'pasar', 'oldBarongsai']);

function hsh(a: number, b: number, k = 0): number {
  const s = Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const tmpC = new THREE.Color();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function hueOf(hex: number): number {
  const hsl = { h: 0, s: 0, l: 0 };
  tmpC.setHex(hex).getHSL(hsl);
  return hsl.s < 0.08 ? 0 : Math.max(0.002, hsl.h);
}

/** Matrix that puts the box [min, max] of a model (scale 1) onto a world box: centre (x, z), base y, size along / height / deep. */
function fit(min: THREE.Vector3, max: THREE.Vector3, x: number, y: number, z: number, yaw: number, along: number, height: number, deep: number): THREE.Matrix4 {
  const sx = along / Math.max(1e-4, max.x - min.x);
  const sy = height / Math.max(1e-4, max.y - min.y);
  const sz = deep / Math.max(1e-4, max.z - min.z);
  const c = new THREE.Vector3(((min.x + max.x) / 2) * sx, min.y * sy, ((min.z + max.z) / 2) * sz).applyAxisAngle(UP, yaw);
  tmpQ.setFromAxisAngle(UP, yaw);
  return new THREE.Matrix4().compose(new THREE.Vector3(x - c.x, y - c.y, z - c.z), tmpQ, new THREE.Vector3(sx, sy, sz));
}

function customFit(cb: CustomBuilding, b: CityBuilding, yaw: number, along: number, deep: number): THREE.Matrix4 {
  const h = cb.hint;
  const [x0, x1, z0, z1] = h.body ?? [-0.5, 0.5, -0.5, 0.5];
  const size = new THREE.Vector3().subVectors(cb.max, cb.min);
  const cx = (cb.min.x + cb.max.x) / 2;
  const cz = (cb.min.z + cb.max.z) / 2;
  const bw = (x1 - x0) * size.x;
  const bd = (z1 - z0) * size.z;
  const sx = along / bw;
  const sz = deep / bd;
  const sy = Math.sqrt(sx * sz) * (h.ySquash ?? 1);
  const y = (h.yaw ?? 0) + yaw;
  // Body centre in model units -> must land on the building centre (plus `shift` along the facade).
  const bc = new THREE.Vector3((cx + ((x0 + x1) / 2) * size.x) * sx, cb.min.y * sy, (cz + ((z0 + z1) / 2) * size.z) * sz).applyAxisAngle(UP, y);
  const [fx, fz] = FACE_VEC[b.face];
  const shift = h.shift ?? 0;
  // "Along the facade" = the facade's right-hand direction.
  const rx = fz;
  const rz = -fx;
  tmpQ.setFromAxisAngle(UP, y);
  // `sink`: the model's own ground plate (fraction of its height) goes under the city ground.
  const sink = (h.sink ?? 0.03) * size.y * sy;
  return new THREE.Matrix4().compose(new THREE.Vector3(b.x + rx * shift - bc.x, b.base - bc.y - sink, b.z + rz * shift - bc.z), tmpQ, new THREE.Vector3(sx, sy, sz));
}

/** Four vertical planes round the lot of `b` (keep inside): `yard` m in front of the facade, 1.2 m on the other sides. */
function lotPlanes(b: CityBuilding, yard: number): THREE.Plane[] {
  const [fx, fz] = FACE_VEC[b.face];
  const m = (sx: number, sz: number): number => (sx === fx && sz === fz ? yard : 1.2);
  const hx = b.w / 2;
  const hz = b.d / 2;
  return [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), b.x + hx + m(1, 0)),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -(b.x - hx - m(-1, 0))),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), b.z + hz + m(0, 1)),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -(b.z - hz - m(0, -1))),
  ];
}

/** How a building is dressed (null: procedural as before). Pure: same answer for CityBuilder and CityDressing. */
export function dressOf(b: CityBuilding): Dress | null {
  if (!cityModels.ready) return null;
  const [fx, fz] = FACE_VEC[b.face];
  const yaw = Math.atan2(fx, fz);
  const along = b.face < 2 ? b.w : b.d;
  const deep = b.face < 2 ? b.d : b.w;
  const r = hsh(b.x, b.z, 3);
  // Wall hue: the data's wall colour, or (white / grey walls) a pastel from the town palette, so no two neighbours match.
  const hue0 = hueOf(b.wallColor);
  const wallHue = hue0 > 0 ? hue0 : WALL_HUES[Math.floor(hsh(b.x, b.z, 9) * WALL_HUES.length) % WALL_HUES.length];
  // Custom (owner) models first.
  const customKey = b.glen ? 'glen' : CUSTOM_KINDS.has(b.kind) ? b.kind : null;
  const cb = customKey ? cityModels.custom(customKey) : undefined;
  if (cb) {
    return { model: `custom:${cb.name}`, matrix: customFit(cb, b, yaw, along, deep), color: new THREE.Vector4(1, 1, 1, 0), skipBody: true, skipRoof: true, skipFacade: true };
  }
  const pick = (list: string[]): KModel | undefined => {
    const ok = list.filter((n) => cityModels.has(n));
    return ok.length ? cityModels.get(ok[Math.floor(r * ok.length) % ok.length]) : undefined;
  };
  tmpC.setHex(b.roofColor);
  const accent = new THREE.Vector4(tmpC.r, tmpC.g, tmpC.b, wallHue);
  switch (b.kind) {
    case 'house': {
      const m = pick(HOUSES);
      if (!m) return null;
      const roofW = b.face < 2 ? b.roofW : b.roofD;
      const roofD = b.face < 2 ? b.roofD : b.roofW;
      return { model: m.name, matrix: fit(m.min, m.max, b.x, b.base, b.z, yaw, roofW, b.wall + b.roofH, roofD), color: accent, skipBody: true, skipRoof: true, skipFacade: true };
    }
    case 'ruko': {
      const m = pick(SHOPS);
      if (!m) return null;
      return { model: m.name, matrix: fit(m.min, m.max, b.x, b.base, b.z, yaw, along, b.wall, deep), color: accent, skipBody: true, skipRoof: false, skipFacade: true };
    }
    case 'kiosk': {
      const m = pick(KIOSKS);
      if (!m) return null;
      return { model: m.name, matrix: fit(m.min, m.max, b.x, b.base, b.z, yaw, along, b.wall, deep), color: accent, skipBody: true, skipRoof: true, skipFacade: false };
    }
    case 'tower': {
      const t = b.tower;
      const name = t ? TOWERS[t.style] : undefined;
      const m = name ? cityModels.get(name) : undefined;
      if (!t || !m) return null;
      return { model: m.name, matrix: fit(m.min, m.max, b.x, b.base + t.podium, b.z, yaw, t.size, b.wall - t.podium, t.size), color: accent, skipBody: true, skipRoof: true, skipFacade: true };
    }
    case 'school':
    case 'bank':
    case 'hospital':
    case 'gudang':
    case 'pasar': {
      // No custom model (yet): a big Kenney office block, flat roof like the collider.
      const m = pick(['com_building-j', 'com_building-k', 'com_building-n']);
      if (!m) return null;
      return { model: m.name, matrix: fit(m.min, m.max, b.x, b.base, b.z, yaw, along, b.wall, deep), color: accent, skipBody: true, skipRoof: true, skipFacade: true };
    }
    default:
      return null;
  }
}

/** Shader: vertex colour x per-instance accent / wall tint, by the model's mask attribute. */
function material(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, envMapIntensity: 1 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMask;\nvec3 sgHsl(float h, float sat, float l) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return l + sat * (k - 0.5) * (1.0 - abs(2.0 * l - 1.0)); }')
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(1.0);
#ifdef USE_COLOR
vColor.rgb *= color;
#endif
#ifdef USE_BATCHING_COLOR
{
  vec4 bc = getBatchingColor( getIndirectIndex( gl_DrawID ) );
  float lum = dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  if (aMask > 0.75) vColor.rgb = bc.rgb * clamp(lum / 0.36, 0.55, 1.35);
  else if (aMask > 0.25 && bc.a > 0.001) {
    vec3 t = sgHsl(bc.a, 0.7, 0.78);
    vColor.rgb *= t * t * 1.35;
  }
}
#endif`,
      );
  };
  m.customProgramCacheKey = () => 'sg-city-dress';
  return m;
}

export class CityDressing {
  readonly mesh: THREE.BatchedMesh | null = null;
  readonly customs: THREE.Object3D[] = [];
  /** Per instance: id, near geometry, far geometry, x, z. */
  private readonly inst: { id: number; g0: number; g1: number; x: number; z: number; far: boolean }[] = [];
  private tick = 0;
  /** Triangles of the full-detail geometry of all instances (report). */
  tris = 0;

  constructor(L: CityLayout, root: THREE.Object3D) {
    const dresses: { b: CityBuilding; d: Dress }[] = [];
    for (const b of L.buildings) {
      const d = dressOf(b);
      if (d) dresses.push({ b, d });
    }
    // Custom buildings: one mesh each.
    for (const { b, d } of dresses) {
      if (!d.model.startsWith('custom:')) continue;
      const cb = cityModels.buildings.get(d.model.slice(7));
      if (!cb) continue;
      const o = cb.scene.clone();
      // Cut the model's own yard / ground plate to the building's lot: `yard` m in front, 1.2 m elsewhere (no plate over the
      // sidewalk or the road). World-space clipping planes on its own material copies.
      const planes = lotPlanes(b, cb.hint.yard ?? 3);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.clippingPlanes = planes;
        mat.clipShadows = true;
        m.material = mat;
      });
      o.matrixAutoUpdate = false;
      o.matrix.copy(d.matrix);
      o.updateMatrixWorld(true);
      root.add(o);
      this.customs.push(o);
    }
    const kd = dresses.filter((x) => !x.d.model.startsWith('custom:'));
    if (kd.length === 0) return;
    const used = [...new Set(kd.map((x) => x.d.model))];
    let verts = 0;
    let idx = 0;
    for (const n of used) {
      const m = cityModels.get(n) as KModel;
      for (const g of [m.geo, m.lod]) {
        if (!g) continue;
        verts += g.getAttribute('position').count;
        idx += g.getIndex()?.count ?? 0;
      }
    }
    const mesh = new THREE.BatchedMesh(kd.length, verts, idx, material());
    mesh.sortObjects = false; // opaque; sorting would allocate per frame
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'cityDressing';
    const ids = new Map<string, [number, number]>();
    for (const n of used) {
      const m = cityModels.get(n) as KModel;
      const g0 = mesh.addGeometry(m.geo);
      const g1 = m.lod ? mesh.addGeometry(m.lod) : g0;
      ids.set(n, [g0, g1]);
    }
    for (const { b, d } of kd) {
      const [g0, g1] = ids.get(d.model) as [number, number];
      const id = mesh.addInstance(g1);
      mesh.setMatrixAt(id, d.matrix);
      mesh.setColorAt(id, d.color);
      this.inst.push({ id, g0, g1, x: b.x, z: b.z, far: true });
      this.tris += ((cityModels.get(d.model) as KModel).geo.getIndex()?.count ?? 0) / 3;
    }
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    root.add(mesh);
    (this as { mesh: THREE.BatchedMesh | null }).mesh = mesh;
  }

  /** Distance LOD around the player (every 8th call; `force` for teleports). No allocation. */
  update(px: number, pz: number, force = false): void {
    const mesh = this.mesh;
    if (!mesh) return;
    if (!force && this.tick++ % 8 !== 0) return;
    const f2 = LOD_FAR * LOD_FAR;
    for (let i = 0; i < this.inst.length; i++) {
      const it = this.inst[i];
      const dx = it.x - px;
      const dz = it.z - pz;
      const far = dx * dx + dz * dz > f2;
      if (far !== it.far) {
        it.far = far;
        mesh.setGeometryIdAt(it.id, far ? it.g1 : it.g0);
      }
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.removeFromParent();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh.dispose();
    }
    for (const o of this.customs) o.removeFromParent();
  }
}
