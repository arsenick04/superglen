import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Tiny helper for the small low-poly things of the city (bikes, people, mission items): a list of coloured primitives merged
 * into ONE geometry with vertex colours, so a bike or a person is a single draw call with the city's shared `lit` material
 * (no new shader program).
 */
export interface Part {
  g: THREE.BufferGeometry;
  /** Vertex colour (sRGB hex). */
  c: number;
  p?: readonly [number, number, number];
  /** Euler rotation (radians), applied before the position. */
  r?: readonly [number, number, number];
  s?: readonly [number, number, number];
}

const tmp = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const sc = new THREE.Vector3();

export const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 8): THREE.BufferGeometry => new THREE.CylinderGeometry(rt, rb, h, seg);
export const sph = (r: number, w = 8, h = 6): THREE.BufferGeometry => new THREE.SphereGeometry(r, w, h);
export const cone = (r: number, h: number, seg = 8): THREE.BufferGeometry => new THREE.ConeGeometry(r, h, seg);

/** Merge the parts (consumes and disposes their geometries). */
export function merge(parts: readonly Part[]): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const g = part.g;
    const [rx, ry, rz] = part.r ?? [0, 0, 0];
    q.setFromEuler(e.set(rx, ry, rz));
    const [px, py, pz] = part.p ?? [0, 0, 0];
    const [sx, sy, sz] = part.s ?? [1, 1, 1];
    tmp.compose(v.set(px, py, pz), q, sc.set(sx, sy, sz));
    g.applyMatrix4(tmp);
    const n = g.getAttribute('position').count;
    const col = new THREE.Color(part.c);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    list.push(g);
  }
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!merged) throw new Error('ColorMesh: merge failed');
  merged.computeBoundingSphere();
  return merged;
}
