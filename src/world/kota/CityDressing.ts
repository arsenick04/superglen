import * as THREE from 'three';
import { FACE_VEC, type CityBuilding, type CityLayout } from './CityData';
import { cityModels, type CustomBuilding, type KModel } from './CityModels';
import { Parkour } from '../../config/parkour';

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
const LOD_FAR = 38;

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

// Quaternius Downtown City MegaKit buildings (public/env/downtown, scripts/build-downtown.mjs); the Kenney lists below are the fallback.
const DT_HOUSES = ['a', 'b', 'c', 'd', 'e', 'f'].map((c) => `dt_house_${c}`);
const DT_RUKOS = ['a', 'b', 'c', 'd', 'e', 'f'].map((c) => `dt_ruko_${c}`);
const DT_KIOSKS = ['dt_kiosk_a', 'dt_kiosk_b'];
const DT_TOWERS: Record<string, string> = { clock: 'dt_tower_a', bell: 'dt_tower_b', water: 'dt_tower_c', pagoda: 'dt_tower_d', coin: 'dt_tower_a' };
const HOUSES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'n', 'o', 's', 't', 'u'].map((c) => `sub_building-type-${c}`);
const SHOPS = ['a', 'b', 'd', 'f', 'g', 'h', 'i', 'l'].map((c) => `com_building-${c}`);
const KIOSKS = ['com_building-c', 'com_building-e'];
// These towers have only 6.6 m above their podium. Tall skyscrapers would have to be crushed into a squat cube.
const TOWERS: Record<string, string> = { clock: 'com_building-a', bell: 'com_building-b', water: 'com_building-h', pagoda: 'com_building-d', coin: 'com_building-a' };
/** Peach, butter, mint, sky, lilac, rose, apricot, sage. */
const WALL_HUES = [0.06, 0.13, 0.36, 0.55, 0.74, 0.95, 0.09, 0.27];
const DT_LANDMARKS: Record<string, string> = { school: 'dt_school', hospital: 'dt_hospital', bank: 'dt_bank', pasar: 'dt_pasar', gudang: 'dt_gudang', oldBarongsai: 'dt_barongsai' };
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
  const s = Math.min(along / Math.max(1e-4, max.x - min.x), height / Math.max(1e-4, max.y - min.y), deep / Math.max(1e-4, max.z - min.z));
  // Uniform scale preserves doors, windows and roof pitch. A small masonry plinth fills any height difference.
  const base = y + height - (max.y - min.y) * s;
  const c = new THREE.Vector3(((min.x + max.x) / 2) * s, min.y * s, ((min.z + max.z) / 2) * s).applyAxisAngle(UP, yaw);
  tmpQ.setFromAxisAngle(UP, yaw);
  return new THREE.Matrix4().compose(new THREE.Vector3(x - c.x, base - c.y, z - c.z), tmpQ, new THREE.Vector3(s, s, s));
}

/**
 * Downtown model (authored at the data's size, origin = base centre, front +z): scale x / z to the footprint and y to the wall (+ roof)
 * height, so the visible walls sit exactly on the collider box and the roof plateau on the roof foothold.
 */
function fitExact(m: KModel, x: number, y: number, z: number, yaw: number, along: number, wall: number, deep: number): THREE.Matrix4 {
  const body = m.body as THREE.Vector3;
  tmpQ.setFromAxisAngle(UP, yaw);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(along / body.x, wall / body.y, deep / body.z));
}

function customFit(cb: CustomBuilding, b: CityBuilding, yaw: number, along: number, deep: number): THREE.Matrix4 {
  const h = cb.hint;
  const [x0, x1, z0, z1] = h.body ?? [-0.5, 0.5, -0.5, 0.5];
  const size = new THREE.Vector3().subVectors(cb.max, cb.min);
  const cx = (cb.min.x + cb.max.x) / 2;
  const cz = (cb.min.z + cb.max.z) / 2;
  const bw = (x1 - x0) * size.x;
  const bd = (z1 - z0) * size.z;
  const sinkFraction = h.sink ?? (b.kind === 'oldBarongsai' ? 0.08 : 0.03);
  const roofFraction = h.roof ?? 1;
  const height = b.wall + (b.roof === 'hip' ? b.roofH * (1 - Parkour.world.roofPlateau) : 0);
  const s = Math.min(along / bw, deep / bd, height / (size.y * (roofFraction - sinkFraction)));
  const y = (h.yaw ?? 0) + yaw;
  // Body centre in model units -> must land on the building centre (plus `shift` along the facade).
  // The Barongsai door projects forward of its wall; anchor that door, rather than clipping the projecting lion mask.
  const frontZ = b.kind === 'oldBarongsai' ? 0.26 : z1;
  const bc = new THREE.Vector3((cx + ((x0 + x1) / 2) * size.x) * s, cb.min.y * s, (cz + frontZ * size.z) * s).applyAxisAngle(UP, y);
  const [fx, fz] = FACE_VEC[b.face];
  const shift = (h.shift ?? 0) + (b.kind === 'oldBarongsai' ? -1.5 : 0);
  // "Along the facade" = the facade's right-hand direction.
  const rx = fz;
  const rz = -fx;
  tmpQ.setFromAxisAngle(UP, y);
  // `sink`: the model's own ground plate (fraction of its height) goes under the city ground.
  const base = b.base + height - size.y * roofFraction * s;
  const front = (b.face < 2 ? b.d : b.w) / 2 + (b.kind === 'oldBarongsai' ? 0.6 : 0);
  return new THREE.Matrix4().compose(new THREE.Vector3(b.x + rx * shift + fx * front - bc.x, base - bc.y, b.z + rz * shift + fz * front - bc.z), tmpQ, new THREE.Vector3(s, s, s));
}

/** Conservative body envelope used to join climbing pieces and masonry wings to a uniformly scaled model. */
export function dressedBody(d: Dress, envelope = false): THREE.Box3 {
  const custom = d.model.startsWith('custom:') ? cityModels.buildings.get(d.model.slice(7)) : undefined;
  const model = custom ?? cityModels.get(d.model);
  if (!model) return new THREE.Box3();
  if (!custom && (model as KModel).body) {
    // Downtown model: the walls are the data's box (the roof / cornice overhang is a few cm).
    const bd = (model as KModel).body as THREE.Vector3;
    return new THREE.Box3(new THREE.Vector3(-bd.x / 2, model.min.y, -bd.z / 2), new THREE.Vector3(bd.x / 2, bd.y, bd.z / 2)).applyMatrix4(d.matrix);
  }
  const min = model.min.clone();
  const max = model.max.clone();
  if (custom && !envelope) {
    const size = new THREE.Vector3().subVectors(max, min);
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    const [x0, x1, z0, z1] = custom.hint.body ?? [-0.5, 0.5, -0.5, 0.5];
    min.x = cx + x0 * size.x; max.x = cx + x1 * size.x;
    min.z = cz + z0 * size.z; max.z = cz + z1 * size.z;
  } else if (!custom && !envelope) {
    // Eaves are a little wider than the walls of the kit houses.
    const inset = (max.x - min.x) * 0.045;
    min.x += inset; max.x -= inset; min.z += inset; max.z -= inset;
  }
  return new THREE.Box3(min, max).applyMatrix4(d.matrix);
}

/** The lot of `b` as [x0, z0, x1, z1]: `yard` m in front of the facade, 1.2 m on the other sides. */
function lotRect(b: CityBuilding, yard: number): THREE.Vector4 {
  const [fx, fz] = FACE_VEC[b.face];
  const m = (sx: number, sz: number): number => (sx === fx && sz === fz ? Math.min(yard, 0.7) : 0.16);
  return new THREE.Vector4(b.x - b.w / 2 - m(-1, 0), b.z - b.d / 2 - m(0, -1), b.x + b.w / 2 + m(1, 0), b.z + b.d / 2 + m(0, 1));
}

/** Copy of a custom building material that discards fragments outside the lot rectangle (world x / z). */
function lotMaterial(src: THREE.MeshStandardMaterial, lot: THREE.Vector4, groundOnly = -1e6): THREE.MeshStandardMaterial {
  const mat = src.clone();
  const uLot = { value: lot };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLot = uLot;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLotXZ;\nvarying float vLotY;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 lotPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
lotPosition = instanceMatrix * lotPosition;
#endif
vec3 lotWorld = (modelMatrix * lotPosition).xyz;
vLotXZ = lotWorld.xz;
vLotY = lotWorld.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLotXZ;\nvarying float vLotY;\nuniform vec4 uLot;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (${groundOnly > -1e5 ? `vLotY < ${groundOnly.toFixed(3)} && ` : ''}(vLotXZ.x < uLot.x || vLotXZ.y < uLot.y || vLotXZ.x > uLot.z || vLotXZ.y > uLot.w)) discard;`);
  };
  mat.customProgramCacheKey = () => `sg-custom-lot-${groundOnly > -1e5 ? 'ground' : 'all'}`;
  return mat;
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
  // Landmarks: assembled from the Downtown kit (scripts/build-downtown.mjs) at the exact footprint of the data.
  const lmName = b.glen ? 'dt_glen' : DT_LANDMARKS[b.kind];
  const lm = lmName ? cityModels.get(lmName) : undefined;
  if (lm?.body) {
    // Glen's house keeps the tintable wall (data colour) and gets an orange roof; the others have fixed colours baked in.
    const orange = new THREE.Color(0xf08a2e);
    const color = b.glen ? new THREE.Vector4(orange.r, orange.g, orange.b, wallHue) : new THREE.Vector4(1, 1, 1, 0);
    tmpC.setHex(b.roofColor);
    if (!b.glen) color.set(tmpC.r, tmpC.g, tmpC.b, 0);
    return { model: lm.name, matrix: fitExact(lm, b.x, b.base, b.z, yaw, along, b.wall, deep), color, skipBody: true, skipRoof: true, skipFacade: true };
  }
  // Custom (owner) models first.
  const customKey = b.glen ? 'glen' : CUSTOM_KINDS.has(b.kind) ? b.kind : null;
  const cb = customKey ? cityModels.custom(customKey) : undefined;
  if (cb) {
    return { model: `custom:${cb.name}`, matrix: customFit(cb, b, yaw, along, deep), color: new THREE.Vector4(1, 1, 1, 0), skipBody: true, skipRoof: true, skipFacade: true };
  }
  /** Downtown variant (hash of the position, so neighbours differ); undefined when the kit file is missing. */
  const dtPick = (list: string[], salt: number): KModel | undefined => {
    const ok = list.map((n) => cityModels.get(n)).filter((m): m is KModel => !!m && !!m.body);
    return ok.length ? ok[Math.floor(hsh(b.x, b.z, salt) * ok.length) % ok.length] : undefined;
  };
  const pick = (list: string[]): KModel | undefined => {
    const height = b.wall + (b.roof === 'hip' ? b.roofH * (1 - Parkour.world.roofPlateau) : 0);
    const ok = list.map((n) => cityModels.get(n)).filter((m): m is KModel => !!m);
    // Select a compatible silhouette first, then vary neighbours within that family.
    ok.sort((a, c) => {
      const score = (m: KModel): number => Math.abs(Math.log(((m.max.x - m.min.x) / (m.max.y - m.min.y)) / (along / height))) + Math.abs(Math.log(((m.max.z - m.min.z) / (m.max.y - m.min.y)) / (deep / height)));
      return score(a) - score(c);
    });
    return ok.length ? ok[Math.floor(r * Math.min(4, ok.length))] : undefined;
  };
  tmpC.setHex(b.roofColor);
  const accent = new THREE.Vector4(tmpC.r, tmpC.g, tmpC.b, wallHue);
  switch (b.kind) {
    case 'house': {
      const dt = dtPick(DT_HOUSES, 5);
      if (dt) return { model: dt.name, matrix: fitExact(dt, b.x, b.base, b.z, yaw, along, b.wall, deep), color: accent, skipBody: true, skipRoof: true, skipFacade: true };
      const m = pick(HOUSES);
      if (!m) return null;
      const roofW = b.face < 2 ? b.roofW : b.roofD;
      const roofD = b.face < 2 ? b.roofD : b.roofW;
      return { model: m.name, matrix: fit(m.min, m.max, b.x, b.base, b.z, yaw, roofW, b.wall + b.roofH * (1 - Parkour.world.roofPlateau), roofD), color: accent, skipBody: true, skipRoof: true, skipFacade: true };
    }
    case 'ruko': {
      const dt = dtPick(DT_RUKOS, 6);
      if (dt) return { model: dt.name, matrix: fitExact(dt, b.x, b.base, b.z, yaw, along, b.wall, deep), color: accent, skipBody: true, skipRoof: true, skipFacade: true };
      const m = pick(SHOPS);
      if (!m) return null;
      return { model: m.name, matrix: fit(m.min, m.max, b.x, b.base, b.z, yaw, along, b.wall, deep), color: accent, skipBody: true, skipRoof: false, skipFacade: true };
    }
    case 'kiosk': {
      const dt = dtPick(DT_KIOSKS, 7);
      if (dt) return { model: dt.name, matrix: fitExact(dt, b.x, b.base, b.z, yaw, along, b.wall, deep), color: accent, skipBody: true, skipRoof: true, skipFacade: false };
      const m = pick(KIOSKS);
      if (!m) return null;
      return { model: m.name, matrix: fit(m.min, m.max, b.x, b.base, b.z, yaw, along, b.wall, deep), color: accent, skipBody: true, skipRoof: true, skipFacade: false };
    }
    case 'tower': {
      const t = b.tower;
      const dt = t ? cityModels.get(DT_TOWERS[t.style]) : undefined;
      if (t && dt?.body) return { model: dt.name, matrix: fitExact(dt, b.x, b.base + t.podium, b.z, yaw, t.size, b.wall - t.podium, t.size), color: accent, skipBody: true, skipRoof: true, skipFacade: true };
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
    // HSL is authored in display space; convert once to the linear vertex-colour working space.
    vec3 lin = mix(t / 12.92, pow((t + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), t));
    vColor.rgb *= mix(vec3(1.0), lin, 0.48);
  }
}
#endif`,
      );
  };
  // Lift the commercial kit's near-black lower floors into a softer blue slate, before lighting.
  m.onBeforeCompile = ((compile) => (s, r) => {
    compile(s, r);
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.13, 0.17, 0.23), diffuseColor.rgb, smoothstep(0.02, 0.38, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b))));');
  })(m.onBeforeCompile);
  m.customProgramCacheKey = () => 'sg-city-dress-v3';
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
      const o = new THREE.Group();
      // Cut the model's own yard / ground plate to the building's lot: `yard` m in front, 1.2 m elsewhere (no plate over the
      // sidewalk or the road). A world-space discard in the shader (one shared program for every custom building; three's clipping
      // planes would compile extra program variants after the warm-up).
      const lot = lotRect(b, cb.hint.yard ?? 3);
      const bounds = dressedBody(d);
      const alongX = b.face < 2;
      const bodyWidth = alongX ? bounds.max.x - bounds.min.x : bounds.max.z - bounds.min.z;
      const width = alongX ? b.w : b.d;
      const count = b.kind === 'oldBarongsai' || b.glen ? 1 : Math.max(1, Math.ceil(width / bodyWidth));
      const [fx, fz] = FACE_VEC[b.face];
      cb.scene.updateMatrixWorld(true);
      cb.scene.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const inst = new THREE.InstancedMesh(m.geometry, lotMaterial(m.material as THREE.MeshStandardMaterial, lot, b.kind === 'oldBarongsai' ? b.base + 0.5 : undefined), count);
        inst.castShadow = true;
        inst.receiveShadow = true;
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * bodyWidth;
          const matrix = d.matrix.clone();
          matrix.elements[12] += fz * offset;
          matrix.elements[14] -= fx * offset;
          inst.setMatrixAt(i, matrix.multiply(m.matrixWorld));
        }
        inst.computeBoundingBox();
        inst.computeBoundingSphere();
        o.add(inst);
      });
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
    for (const o of this.customs) {
      o.traverse((child) => {
        const m = child as THREE.InstancedMesh;
        if (!m.isInstancedMesh) return;
        (m.material as THREE.Material).dispose();
        m.dispose(); // geometry and textures belong to the shared CityModels library
      });
      o.removeFromParent();
    }
  }
}
