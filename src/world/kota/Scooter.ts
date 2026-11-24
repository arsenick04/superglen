import * as THREE from 'three';
import { box, cyl, merge, sph, type Part } from './ColorMesh';

/**
 * Stylised scooter (Vespa-like) and child bicycle for the city traffic, built from rounded primitives (facing +Z, origin on the
 * ground between the wheels). One merged geometry per vehicle, ONE shared material (`vehicleMaterial`): vertex colour, per-vertex
 * mask (aMask: 1 = painted with the instance colour, 0.5 = the rider's helmet, tinted from the instance colour too, 0 = plain),
 * and wheel vertices (aWheel = axle centre + radius) that spin about their axle by the rolled distance (aRoll), like the cars.
 * The rider is NOT part of this mesh: it is a Crowd person in the baked riding pose (see Crowd.ts), seated at `RideSeat`.
 */
export const ScooterConfig = {
  wheelR: 0.27,
  wheelZ: 0.6,
  /** Head of the rider in model space (for the helmet): measured from the baked pose. */
  head: { y: 1.43, z: 0.02, r: 0.23 },
} as const;

interface Tagged extends Part {
  /** Mask value. */
  m?: number;
  /** Wheel axle (y, z) and radius: the part spins about it. */
  wheel?: readonly [number, number, number];
}

const DARK = 0x2b2a33;
const GREY = 0xb9bfc9;
const CREAM = 0xfff4cf;
const W = 0xffffff;

function build(parts: readonly Tagged[]): THREE.BufferGeometry {
  const counts = parts.map((p) => p.g.getAttribute('position').count);
  const geo = merge(parts);
  const n = geo.getAttribute('position').count;
  const mask = new Float32Array(n);
  const wheel = new Float32Array(n * 4);
  let o = 0;
  parts.forEach((p, i) => {
    for (let k = 0; k < counts[i]; k++, o++) {
      mask[o] = p.m ?? 0;
      if (p.wheel) {
        wheel[o * 4 + 1] = p.wheel[0];
        wheel[o * 4 + 2] = p.wheel[1];
        wheel[o * 4 + 3] = p.wheel[2];
      }
    }
  });
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  geo.setAttribute('aWheel', new THREE.BufferAttribute(wheel, 4));
  geo.computeBoundingBox();
  return geo;
}

/** A wheel (tyre, hub, spoke bar) at (0, r, z). */
function wheelParts(r: number, z: number, tyre: number, hub: number, tyreR = r): Tagged[] {
  const wheel = [r, z, r] as const;
  return [
    { g: cyl(tyreR, tyreR, tyre, 20), c: DARK, p: [0, r, z], r: [0, 0, Math.PI / 2], wheel },
    { g: cyl(r * 0.62, r * 0.62, tyre + 0.03, 16), c: hub, p: [0, r, z], r: [0, 0, Math.PI / 2], wheel },
    { g: box(0.035, r * 1.05, 0.05), c: GREY, p: [0, r, z], wheel },
  ];
}

export function scooterGeo(): THREE.BufferGeometry {
  const R = ScooterConfig.wheelR;
  const Z = ScooterConfig.wheelZ;
  const parts: Tagged[] = [
    ...wheelParts(R, Z, 0.15, GREY),
    ...wheelParts(R, -Z, 0.17, GREY),
    // Rounded rear body (engine cover) and its tail bump.
    { g: sph(0.4, 14, 10), c: W, p: [0, 0.42, -0.4], s: [0.62, 0.6, 1.08], m: 1 },
    { g: sph(0.25, 10, 8), c: W, p: [0, 0.36, -0.84], s: [1.1, 0.85, 0.9], m: 1 },
    // Floor board (low rounded slab) and the leg shield in front of the rider.
    { g: sph(0.4, 12, 8), c: W, p: [0, 0.2, 0.12], s: [0.62, 0.14, 0.9], m: 1 },
    { g: sph(0.4, 12, 10), c: W, p: [0, 0.5, 0.5], s: [0.62, 1.0, 0.28], m: 1 },
    // Fenders over the wheels.
    { g: sph(0.3, 10, 6), c: W, p: [0, 0.46, Z], s: [0.5, 0.42, 1.0], m: 1 },
    // Fork, steering head and handlebar with grips.
    { g: cyl(0.03, 0.03, 0.7, 6), c: GREY, p: [0, 0.6, 0.5], r: [0.2, 0, 0] },
    { g: sph(0.1, 8, 6), c: GREY, p: [0, 0.92, 0.42] },
    { g: cyl(0.03, 0.03, 0.62, 8), c: GREY, p: [0, 0.96, 0.42], r: [0, 0, Math.PI / 2] },
    { g: cyl(0.04, 0.04, 0.16, 8), c: DARK, p: [0.3, 0.96, 0.42], r: [0, 0, Math.PI / 2] },
    { g: cyl(0.04, 0.04, 0.16, 8), c: DARK, p: [-0.3, 0.96, 0.42], r: [0, 0, Math.PI / 2] },
    // Round headlight with a chrome ring, tail light, mirrors on stalks.
    { g: sph(0.12, 12, 8), c: GREY, p: [0, 0.99, 0.54], s: [1, 1, 0.8] },
    { g: sph(0.095, 12, 8), c: CREAM, p: [0, 0.99, 0.61], s: [1, 1, 0.7] },
    { g: sph(0.06, 8, 6), c: 0xff5a4f, p: [0, 0.44, -1.06], s: [1.8, 1, 0.8] },
    ...[-1, 1].flatMap((s): Tagged[] => [
      { g: cyl(0.012, 0.012, 0.18, 5), c: GREY, p: [s * 0.27, 1.06, 0.42], r: [0, 0, s * 0.3] },
      { g: sph(0.05, 8, 6), c: GREY, p: [s * 0.3, 1.16, 0.42], s: [1.3, 1, 0.6] },
      // Footpegs under the rider's feet.
      { g: box(0.1, 0.03, 0.2), c: DARK, p: [s * 0.2, 0.26, 0.2] },
    ]),
    // Seat (dark leather) and an exhaust pipe.
    { g: sph(0.2, 12, 8), c: 0x4a2f27, p: [0, 0.6, -0.24], s: [1, 0.4, 1.7] },
    { g: cyl(0.045, 0.05, 0.5, 8), c: GREY, p: [0.2, 0.18, -0.62], r: [Math.PI / 2, 0, 0] },
  ];
  return build(parts);
}

export function bicycleGeo(): THREE.BufferGeometry {
  const R = 0.3;
  const Z = 0.58;
  const parts: Tagged[] = [
    ...wheelParts(R, Z, 0.07, 0xe9edf3),
    ...wheelParts(R, -Z, 0.07, 0xe9edf3),
    // Frame: top tube, down tube, seat post, fork.
    { g: cyl(0.032, 0.032, 0.95, 7), c: W, p: [0, 0.5, 0.05], r: [Math.PI / 2 - 0.12, 0, 0], m: 1 },
    { g: cyl(0.032, 0.032, 0.8, 7), c: W, p: [0, 0.4, 0.15], r: [Math.PI / 2 + 0.7, 0, 0], m: 1 },
    { g: cyl(0.03, 0.03, 0.42, 7), c: GREY, p: [0, 0.42, -0.22] },
    { g: cyl(0.03, 0.03, 0.74, 7), c: W, p: [0, 0.62, 0.48], r: [0.2, 0, 0], m: 1 },
    { g: cyl(0.025, 0.025, 0.5, 7), c: GREY, p: [0, 0.96, 0.42], r: [0, 0, Math.PI / 2] },
    { g: sph(0.06, 6, 5), c: DARK, p: [0.26, 0.96, 0.42] },
    { g: sph(0.06, 6, 5), c: DARK, p: [-0.26, 0.96, 0.42] },
    { g: sph(0.15, 10, 6), c: 0x4a2f27, p: [0, 0.62, -0.24], s: [0.9, 0.35, 1.5] },
    ...[-1, 1].map((s): Tagged => ({ g: box(0.1, 0.03, 0.2), c: DARK, p: [s * 0.2, 0.26, 0.16] })),
  ];
  return build(parts);
}

/** One program for every two-wheeler: instance colour paints the body, a shifted version of it paints the helmet. */
export function vehicleMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aMask;
attribute vec4 aWheel;
attribute float aRoll;
vec3 sgSpinB(vec3 v, vec3 c, float r, bool pos) {
  vec3 d = pos ? v - c : v;
  float a = aRoll / r;
  float cs = cos(a), sn = sin(a);
  d = vec3(d.x, d.y * cs - d.z * sn, d.y * sn + d.z * cs);
  return pos ? d + c : d;
}`,
      )
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(color, 1.0);
#ifdef USE_INSTANCING_COLOR
if (aMask > 0.75) vColor.rgb = instanceColor.rgb * clamp(dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.3, 0.6, 1.3);
else if (aMask > 0.25) vColor.rgb = mix(instanceColor.gbr, vec3(1.0), 0.15) * 1.1;
#endif`,
      )
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nif (aWheel.w > 0.0) objectNormal = sgSpinB(objectNormal, vec3(0.0), aWheel.w, false);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (aWheel.w > 0.0) transformed = sgSpinB(transformed, aWheel.xyz, aWheel.w, true);');
  };
  m.customProgramCacheKey = () => 'sg-two-wheeler';
  return m;
}
