import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ColorBatch, Vec3 } from './Batch';

/**
 * Smooth-shaded shape helpers for the interiors (rounded boxes, lathe profiles, tubes, tori, soft spheres).
 * Everything goes through ColorBatch.addGeometry, so the pieces still merge into the level's few draw calls.
 */
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const eu = new THREE.Euler();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

export function matrixOf(pos: Vec3, rot?: Vec3, scale?: Vec3, out: THREE.Matrix4 = m): THREE.Matrix4 {
  eu.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
  q.setFromEuler(eu);
  return out.compose(v1.set(pos[0], pos[1], pos[2]), q, v2.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1));
}

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

/** Unit sphere with the given segment counts (shared template). */
export function sphereGeo(w = 14, h = 10): THREE.BufferGeometry {
  return cached(`s${w}x${h}`, () => new THREE.SphereGeometry(1, w, h));
}

/** Box with bevelled edges. `r` is the bevel radius (m). */
export function rbox(b: ColorBatch, size: Vec3, pos: Vec3, color: THREE.ColorRepresentation, r = 0.06, rot?: Vec3, seg = 2): void {
  const rr = Math.min(r, Math.min(size[0], size[1], size[2]) / 2 - 0.001);
  const g = cached(`rb${size.join(',')}|${rr}|${seg}`, () => new RoundedBoxGeometry(size[0], size[1], size[2], seg, rr));
  b.addGeometry(g, matrixOf(pos, rot), color);
}

/** Ellipsoid with radii `r`. */
export function ball(b: ColorBatch, r: Vec3, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3, w = 14, h = 10): void {
  b.addGeometry(sphereGeo(w, h), matrixOf(pos, rot, r), color);
}

/** Surface of revolution around Y from (radius, y) profile points. */
export function lathe(b: ColorBatch, profile: readonly (readonly [number, number])[], pos: Vec3, color: THREE.ColorRepresentation, scale?: Vec3, rot?: Vec3, seg = 20): void {
  const key = `l${profile.join(';')}|${seg}`;
  const g = cached(key, () => new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg));
  b.addGeometry(g, matrixOf(pos, rot, scale), color);
}

/** Torus (ring) in the local XY plane; rotate to taste. */
export function ring(b: ColorBatch, R: number, tube: number, pos: Vec3, color: THREE.ColorRepresentation, rot?: Vec3, arc = Math.PI * 2, scale?: Vec3, rs = 8, ts = 24): void {
  const g = cached(`t${R}|${tube}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(R, tube, rs, ts, arc));
  b.addGeometry(g, matrixOf(pos, rot, scale), color);
}

/** Smooth tube along a Catmull-Rom path (cables, pipes, curved beams). Points are world coordinates. */
export function tube(b: ColorBatch, pts: readonly Vec3[], radius: number, color: THREE.ColorRepresentation, seg = 24, rs = 6): void {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.5);
  const g = new THREE.TubeGeometry(curve, seg, radius, rs, false);
  b.addGeometry(g, m.identity(), color);
  g.dispose();
}

/** Capsule-like upright pillar: cylinder shaft with a rounded profile (no sharp rim). */
export function column(b: ColorBatch, x: number, z: number, y0: number, h: number, r: number, color: THREE.ColorRepresentation, cap: THREE.ColorRepresentation, seg = 18): void {
  // Slightly bulged shaft (entasis) with a rounded foot and neck.
  const prof: [number, number][] = [
    [0.001, 0],
    [r * 1.18, 0.0],
    [r * 1.22, 0.06],
    [r * 1.05, 0.14],
    [r * 0.98, 0.3],
    [r * 1.02, h * 0.5],
    [r * 0.96, h - 0.3],
    [r * 1.05, h - 0.14],
    [r * 1.2, h - 0.06],
    [0.001, h - 0.04],
  ];
  lathe(b, prof, [x, y0, z], color, undefined, undefined, seg);
  // Gold capital: flared rounded collar plus a foot ring.
  lathe(b, [[r * 0.9, 0], [r * 1.35, 0.04], [r * 1.5, 0.14], [r * 1.35, 0.26], [r * 1.0, 0.3], [r * 0.9, 0.3]], [x, y0 + h - 0.32, z], cap, undefined, undefined, seg);
  lathe(b, [[r * 0.9, 0], [r * 1.4, 0.03], [r * 1.5, 0.1], [r * 1.35, 0.2], [r * 0.9, 0.22]], [x, y0 - 0.0, z], cap, undefined, undefined, seg);
  ring(b, r * 1.0, 0.035, [x, y0 + h * 0.5, z], cap, [Math.PI / 2, 0, 0], Math.PI * 2, undefined, 6, seg);
}

let poolMat: THREE.MeshBasicMaterial | null = null;
/** One shared material for every fake light pool: additive, no depth write, pulled toward the camera (no z-fighting with the floor). */
function poolMaterial(): THREE.MeshBasicMaterial {
  return (poolMat ??= new THREE.MeshBasicMaterial({
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  }));
}

function poolGeometry(x: number, y: number, z: number, radius: number, rgb: readonly [number, number, number], vertical?: 'x' | 'z'): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, 20);
  const pa = g.getAttribute('position');
  const c = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) {
    const d = Math.min(1, Math.hypot(pa.getX(i), pa.getY(i)) / radius);
    const f = Math.pow(1 - d, 1.6);
    c[i * 3] = rgb[0] * f;
    c[i * 3 + 1] = rgb[1] * f;
    c[i * 3 + 2] = rgb[2] * f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!vertical) g.rotateX(-Math.PI / 2);
  else if (vertical === 'x') g.rotateY(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Many soft light pools merged into ONE draw call (fake light: no real light, cheap on phones). */
export class PoolBatch {
  private readonly geos: THREE.BufferGeometry[] = [];

  add(x: number, y: number, z: number, radius: number, rgb: readonly [number, number, number], vertical?: 'x' | 'z'): this {
    this.geos.push(poolGeometry(x, y, z, radius, rgb, vertical));
    return this;
  }

  build(parent: THREE.Object3D): THREE.Mesh | null {
    if (this.geos.length === 0) return null;
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    if (!merged) return null;
    const mesh = new THREE.Mesh(merged, poolMaterial());
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;
    parent.add(mesh);
    return mesh;
  }
}

/** Soft additive light pool lying on a surface (single pool; prefer PoolBatch for several). */
export function softPool(parent: THREE.Object3D, x: number, y: number, z: number, radius: number, rgb: readonly [number, number, number], vertical?: 'x' | 'z'): THREE.Mesh {
  const mesh = new THREE.Mesh(poolGeometry(x, y, z, radius, rgb, vertical), poolMaterial());
  mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false;
  parent.add(mesh);
  return mesh;
}
