import * as THREE from 'three';
import { cone, cyl, merge, sph, type Part } from './ColorMesh';

/**
 * The garden around Ular Melar's fight: a mowed lawn with soft stripes, a winding path of stepping stones, a little pond with
 * rocks, lily pads and reeds, flowers, grass tufts, mushrooms, a low blossom hedge.
 * Decoration only: no colliders, nothing near the middle (the snake coils within `clear` metres of the centre).
 * Phone cost: ONE merged mesh, ONE material (vertex colours), no shadows.
 */
const GRASS = [0x7ccf5f, 0x6fc454];
const FLOWERS = [0xff6f91, 0xffd23f, 0xffffff, 0xb08cff, 0xff9a3d, 0x62d0ff];

/** Small deterministic random generator so the garden is the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildGarden(cx: number, cz: number, R: number): THREE.Group {
  const rnd = rng(7);
  const parts: Part[] = [];
  const flat = -Math.PI / 2;
  const clear = 5.2;
  const ok = (x: number, z: number, pad = 0): boolean => {
    const d = Math.hypot(x, z);
    if (d < clear + pad) return false;
    // keep the path and the pond free
    if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 0.9 + pad) return false;
    return true;
  };
  const pond = { x: Math.cos(0.7) * (R - 4.4), z: Math.sin(0.7) * (R - 4.4), r: 3.1 };

  // Lawn: concentric mowed stripes (alternating greens). Slightly above the stage floor.
  const rings = 8;
  for (let i = 0; i < rings; i++) {
    parts.push({ g: new THREE.RingGeometry((i * (R + 0.6)) / rings, ((i + 1) * (R + 0.6)) / rings + 0.01, 56), c: GRASS[i % 2], p: [0, 0.035, 0], r: [flat, 0, 0] });
  }
  parts.push({ g: new THREE.CircleGeometry((R + 0.6) / rings + 0.01, 24), c: GRASS[0], p: [0, 0.035, 0], r: [flat, 0, 0] });
  // A soft sandy circle in the middle where the snake coils.
  parts.push({ g: new THREE.CircleGeometry(clear - 0.4, 40), c: 0xf0dca4, p: [0, 0.045, 0], r: [flat, 0, 0] });
  parts.push({ g: new THREE.RingGeometry(clear - 0.55, clear - 0.35, 48), c: 0xffffff, p: [0, 0.05, 0], r: [flat, 0, 0] });

  // Stepping stones: a winding path from the south edge (where Glen enters) towards the middle, then a ring of stones around it.
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const z = R - 1.2 - u * (R - clear - 1.6);
    const x = Math.sin(u * 5) * 1.6 + (u - 0.5) * 2;
    const r = 0.5 + rnd() * 0.18;
    parts.push({ g: cyl(r, r * 1.05, 0.08, 10), c: i % 2 ? 0xdcd6c8 : 0xcfc8b8, p: [x, 0.07, z], s: [1.15, 1, 0.9], r: [0, rnd() * 3, 0] });
  }

  // Pond: dark rim, blue water, lily pads and a flower, rocks around the edge, reeds on one side.
  parts.push({ g: new THREE.CircleGeometry(pond.r + 0.45, 30), c: 0x9c7a56, p: [pond.x, 0.04, pond.z], r: [flat, 0, 0], s: [1.15, 1, 0.85] });
  parts.push({ g: new THREE.CircleGeometry(pond.r, 30), c: 0x57c3ec, p: [pond.x, 0.06, pond.z], r: [flat, 0, 0], s: [1.15, 1, 0.85] });
  parts.push({ g: new THREE.CircleGeometry(pond.r * 0.6, 24), c: 0x8fdcf5, p: [pond.x - 0.4, 0.065, pond.z + 0.2], r: [flat, 0, 0], s: [1.1, 1, 0.8] });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.5;
    const px = pond.x + Math.cos(a) * pond.r * 0.55;
    const pz = pond.z + Math.sin(a) * pond.r * 0.4;
    parts.push({ g: cyl(0.36, 0.36, 0.03, 10), c: 0x4fb04a, p: [px, 0.085, pz] });
    if (i === 1) {
      parts.push({ g: sph(0.12, 6, 4), c: 0xff8fb1, p: [px, 0.16, pz], s: [1, 0.8, 1] });
      parts.push({ g: sph(0.07, 5, 4), c: 0xffe14d, p: [px, 0.22, pz] });
    }
  }
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.3;
    const rr = pond.r + 0.45;
    const s = 0.28 + rnd() * 0.22;
    parts.push({ g: sph(s, 7, 5), c: i % 2 ? 0xb9b2a4 : 0xa49d92, p: [pond.x + Math.cos(a) * rr * 1.15, s * 0.45, pond.z + Math.sin(a) * rr * 0.85], s: [1.2, 0.8, 1] });
  }
  for (let i = 0; i < 6; i++) {
    const a = 2.2 + i * 0.18;
    const px = pond.x + Math.cos(a) * (pond.r + 0.7);
    const pz = pond.z + Math.sin(a) * (pond.r * 0.8 + 0.6);
    const h = 0.8 + rnd() * 0.5;
    parts.push({ g: cone(0.06, h, 4), c: 0x5fae48, p: [px, h / 2, pz], r: [0, 0, (rnd() - 0.5) * 0.3] });
    if (i % 2 === 0) parts.push({ g: cyl(0.07, 0.07, 0.3, 5), c: 0x8a5a38, p: [px, h, pz] });
  }

  // Flowers: stem, blossom, yellow heart. Scattered in drifts.
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const d = clear + 0.6 + Math.sqrt(rnd()) * (R - clear - 1.8);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!ok(x, z, 0.3)) continue;
    const c = FLOWERS[(i * 7 + Math.floor(rnd() * 3)) % FLOWERS.length];
    const h = 0.25 + rnd() * 0.18;
    parts.push({ g: cyl(0.015, 0.02, h, 4), c: 0x4ea03f, p: [x, h / 2, z] });
    parts.push({ g: sph(0.1, 6, 4), c, p: [x, h + 0.04, z], s: [1.2, 0.6, 1.2] });
    parts.push({ g: sph(0.045, 5, 3), c: c === 0xffd23f ? 0xff9a3d : 0xffe14d, p: [x, h + 0.09, z] });
  }
  // Grass tufts (three blades).
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const d = clear + rnd() * (R - clear - 0.6);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!ok(x, z, 0.2)) continue;
    const c = i % 2 ? 0x5bb544 : 0x8ad66a;
    for (let b = -1; b <= 1; b++) parts.push({ g: cone(0.07, 0.4 + rnd() * 0.2, 4), c, p: [x + b * 0.07, 0.2, z], r: [0, 0, -b * 0.25] });
  }
  // Mushrooms: red caps with white dots.
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const d = clear + 1.2 + rnd() * (R - clear - 4);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!ok(x, z, 0.5)) continue;
    const s = 0.7 + rnd() * 0.5;
    parts.push({ g: cyl(0.08 * s, 0.1 * s, 0.22 * s, 6), c: 0xfff0d8, p: [x, 0.11 * s, z] });
    parts.push({ g: sph(0.2 * s, 8, 5), c: 0xe8423a, p: [x, 0.24 * s, z], s: [1, 0.65, 1] });
    parts.push({ g: sph(0.04 * s, 4, 3), c: 0xffffff, p: [x + 0.08 * s, 0.34 * s, z + 0.04 * s] });
    parts.push({ g: sph(0.04 * s, 4, 3), c: 0xffffff, p: [x - 0.07 * s, 0.32 * s, z - 0.06 * s] });
  }
  // Rocks scattered round the edge.
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const d = R - 3 + rnd() * 2.2;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!ok(x, z, 1.2)) continue;
    const s = 0.4 + rnd() * 0.55;
    parts.push({ g: sph(s, 7, 5), c: i % 3 === 0 ? 0xc9c2b2 : 0xb3ab9c, p: [x, s * 0.4, z], s: [1.2, 0.75, 1], r: [0, rnd() * 3, 0] });
    parts.push({ g: sph(s * 0.55, 6, 4), c: 0x9fd876, p: [x + s * 0.2, s * 0.62, z], s: [1, 0.5, 1] });
  }

  // A low round hedge with blossoms.
  const hedgeN = 64;
  for (let i = 0; i < hedgeN; i++) {
    const a = (i / hedgeN) * Math.PI * 2;
    const d = R - 0.5 + rnd() * 0.3;
    const s = 0.36 + rnd() * 0.18;
    parts.push({ g: sph(s, 8, 6), c: i % 3 === 0 ? 0x4fae4a : 0x3f9d44, p: [Math.cos(a) * d, s * 0.5, Math.sin(a) * d], s: [1, 0.7, 1] });
    if (i % 3 === 0) parts.push({ g: sph(0.11, 5, 4), c: FLOWERS[i % FLOWERS.length], p: [Math.cos(a) * (d - s * 0.7), s * 0.7, Math.sin(a) * (d - s * 0.7)] });
  }
  const geo = merge(parts);
  const mesh = new THREE.Mesh(geo.index ? geo.toNonIndexed() : geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.position.set(cx, 0, cz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}
