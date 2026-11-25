import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cone, cyl, merge, sph, type Part } from './ColorMesh';

/**
 * Dressing of the Curut Cemberut arena: a cheerful little market square. Everything is decoration only (no colliders, nothing inside
 * the fight ring): a ring of stalls with striped awnings and fruit, bunting and lanterns, planters, a row of village houses far
 * behind, and a tiled floor with a medallion that marks the fight ring.
 * Cost: ONE merged mesh for the lit things, ONE merged mesh for the glowing lanterns, two floor discs. No shadows.
 */
export const CurutDressConfig = {
  /** Stall ring radius (m) measured from the arena centre, and the number of stalls. */
  stallRadius: 11,
  stalls: 9,
  /** Village houses far behind. */
  houseRadius: 27,
  houses: 14,
} as const;

const STRIPES: readonly (readonly [number, number])[] = [
  [0xe84a4a, 0xfff4e0],
  [0x2f9fd8, 0xfff4e0],
  [0xf5b232, 0xfff4e0],
  [0x4bb86b, 0xfff4e0],
  [0xd964b0, 0xfff4e0],
];
const FRUITS = [0xe8423a, 0xff9a2e, 0x7ccd3c, 0xf7d33a, 0xb25ad6];
const FLAGS = [0xe84a4a, 0xf5b232, 0x4bb86b, 0x2f9fd8, 0xd964b0, 0xfff0c8];

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const eul = new THREE.Euler();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const unit = new THREE.Vector3(1, 1, 1);

/** Transform a merged geometry by yaw and position (consumes it). */
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number): THREE.BufferGeometry {
  m4.compose(v1.set(x, y, z), q.setFromEuler(eul.set(0, yaw, 0)), unit);
  g.applyMatrix4(m4);
  return g;
}

/** A thin box from a to b (ropes). */
function rope(a: THREE.Vector3, b: THREE.Vector3, t: number, c: number): Part {
  const len = a.distanceTo(b);
  const mid = v2.copy(a).add(b).multiplyScalar(0.5);
  const dir = new THREE.Vector3().copy(b).sub(a);
  const yaw = Math.atan2(dir.x, dir.z);
  const pitch = -Math.asin(dir.y / Math.max(0.001, len));
  return { g: box(t, t, len), c, p: [mid.x, mid.y, mid.z], r: [pitch, yaw, 0] };
}

/** One market stall in its own frame: the front (customers) is +z, the back wall at -z. */
function stallGeo(k: number, wood: number): THREE.BufferGeometry {
  const [sa, sb] = STRIPES[k % STRIPES.length];
  const parts: Part[] = [
    { g: box(3, 0.9, 1), c: wood, p: [0, 0.45, 0] },
    { g: box(3.2, 0.1, 1.3), c: 0xf0c27a, p: [0, 0.95, 0.05] },
    { g: box(3.1, 2.3, 0.12), c: k % 2 ? 0xfde6b8 : 0xcfe9f6, p: [0, 1.15, -0.78] },
    { g: cyl(0.07, 0.07, 2.7), c: 0x9a6a3c, p: [-1.5, 1.35, -0.72] },
    { g: cyl(0.07, 0.07, 2.7), c: 0x9a6a3c, p: [1.5, 1.35, -0.72] },
    { g: cyl(0.07, 0.07, 2.1), c: 0x9a6a3c, p: [-1.5, 1.05, 0.62] },
    { g: cyl(0.07, 0.07, 2.1), c: 0x9a6a3c, p: [1.5, 1.05, 0.62] },
  ];
  // The striped awning, sloping down towards the customers, with a scalloped front edge.
  const n = 8;
  const w = 3.4 / n;
  const slope = Math.atan2(0.55, 1.5);
  for (let i = 0; i < n; i++) {
    const x = -1.7 + w * (i + 0.5);
    const c = i % 2 ? sb : sa;
    parts.push({ g: box(w, 0.08, 1.62), c, p: [x, 2.45, -0.02], r: [slope, 0, 0] });
    parts.push({ g: sph(w * 0.52, 8, 5), c, p: [x, 2.1, 0.78], s: [1, 0.8, 0.45] });
  }
  // Fruit baskets on the counter and a crate stack at the side.
  for (let i = 0; i < 3; i++) {
    const bx = -0.95 + i * 0.95;
    parts.push({ g: box(0.7, 0.2, 0.55), c: 0xb97a3e, p: [bx, 1.08, 0.12] });
    for (let f = 0; f < 5; f++) {
      const col = FRUITS[(k + i + f) % FRUITS.length];
      parts.push({ g: sph(0.14, 7, 5), c: col, p: [bx + (f % 3 - 1) * 0.2, 1.27 + (f > 2 ? 0.1 : 0), 0.12 + (f % 2 - 0.5) * 0.2] });
    }
  }
  parts.push({ g: box(0.7, 0.55, 0.7), c: 0xc78a4a, p: [-2.05, 0.28, 0.4] });
  parts.push({ g: box(0.62, 0.5, 0.62), c: 0xd79b58, p: [-2.0, 0.8, 0.4], r: [0, 0.3, 0] });
  for (let f = 0; f < 4; f++) parts.push({ g: sph(0.15, 7, 5), c: FRUITS[(k + f) % FRUITS.length], p: [-2.2 + (f % 2) * 0.28, 1.1, 0.25 + (f > 1 ? 0.3 : 0)] });
  parts.push({ g: box(0.75, 0.6, 0.75), c: 0xc78a4a, p: [2.1, 0.3, 0.45], r: [0, -0.2, 0] });
  for (let f = 0; f < 5; f++) parts.push({ g: sph(0.14, 7, 5), c: FRUITS[(k + f + 2) % FRUITS.length], p: [1.9 + (f % 3) * 0.2, 0.66, 0.3 + (f > 2 ? 0.3 : 0)] });
  // A round little sign above the counter.
  parts.push({ g: cyl(0.3, 0.3, 0.06, 14), c: 0xfff4e0, p: [0, 1.95, 0.7], r: [Math.PI / 2, 0, 0] });
  parts.push({ g: sph(0.17, 8, 6), c: FRUITS[k % FRUITS.length], p: [0, 1.95, 0.75], s: [1, 1, 0.5] });
  return merge(parts);
}

function planterGeo(k: number): THREE.BufferGeometry {
  const parts: Part[] = [
    { g: cyl(0.42, 0.32, 0.5, 10), c: 0xd4733f, p: [0, 0.25, 0] },
    { g: sph(0.5, 8, 6), c: 0x58b947, p: [0, 0.72, 0], s: [1, 0.8, 1] },
  ];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1 + k;
    parts.push({ g: sph(0.1, 6, 4), c: FLAGS[(i + k) % FLAGS.length], p: [Math.cos(a) * 0.35, 0.9 + (i % 2) * 0.1, Math.sin(a) * 0.35] });
  }
  return merge(parts);
}

function houseGeo(k: number): THREE.BufferGeometry {
  const walls = [0xfbe3b4, 0xf7c6c0, 0xcfe7f4, 0xd8efc6, 0xfdd7a0, 0xe6d3f0];
  const roofs = [0xd2573f, 0x3f86c2, 0xc4488e, 0x44a06b];
  const h = 4 + (k % 3) * 1.6;
  const w = 5.5 + (k % 2) * 1.5;
  const parts: Part[] = [
    { g: box(w, h, 4.2), c: walls[k % walls.length], p: [0, h / 2, 0] },
    { g: cone(w * 0.78, 2.2, 4), c: roofs[k % roofs.length], p: [0, h + 1.1, 0], r: [0, Math.PI / 4, 0], s: [1, 1, 0.8] },
    { g: box(1, 1.7, 0.1), c: 0x8a5a3a, p: [0, 0.85, 2.12] },
  ];
  for (let i = 0; i < 2; i++) {
    parts.push({ g: box(0.9, 0.9, 0.1), c: 0xffe9a8, p: [-w * 0.3 + i * w * 0.6, h * 0.62, 2.12] });
    parts.push({ g: box(1.1, 0.1, 0.2), c: 0xffffff, p: [-w * 0.3 + i * w * 0.6, h * 0.62 - 0.5, 2.15] });
  }
  return merge(parts);
}

function medallionTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const R = S / 2;
  const disc = (r: number, col: string): void => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(R, R, r * R, 0, Math.PI * 2);
    g.fill();
  };
  disc(1, '#f6e2b5');
  // Tile spokes: alternating wedges for a warm sunburst.
  for (let i = 0; i < 24; i++) {
    g.fillStyle = i % 2 ? '#f3d49a' : '#f9ecc9';
    g.beginPath();
    g.moveTo(R, R);
    g.arc(R, R, R, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  // The ring that marks the fight area (arena radius 5.2 of a 7.4 disc = 0.7), as chunky coloured studs on a white band.
  disc(0.74, '#ffffff');
  disc(0.68, '#f9ecc9');
  g.fillStyle = '#ff9a3d';
  g.beginPath();
  g.arc(R, R, 0.71 * R, 0, Math.PI * 2);
  g.lineWidth = R * 0.03;
  g.strokeStyle = '#ff9a3d';
  g.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    g.fillStyle = FLAGS[i % FLAGS.length] ? '#' + FLAGS[i % FLAGS.length].toString(16).padStart(6, '0') : '#fff';
    g.beginPath();
    g.arc(R + Math.cos(a) * R * 0.71, R + Math.sin(a) * R * 0.71, R * 0.022, 0, Math.PI * 2);
    g.fill();
  }
  // Inner decoration: concentric pale rings and a big soft star in the middle.
  g.strokeStyle = 'rgba(214,150,80,0.55)';
  g.lineWidth = 4;
  for (const r of [0.3, 0.5]) {
    g.beginPath();
    g.arc(R, R, r * R, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,200,90,0.5)';
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = (i % 2 ? 0.14 : 0.3) * R;
    g.lineTo(R + Math.cos(a) * r, R + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function tileTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const cols = ['#f8e6bb', '#d9946a', '#f8e6bb', '#d9946a'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = cols[i];
    g.fillRect((i % 2) * (S / 2), Math.floor(i / 2) * (S / 2) * 1, S / 2, S / 2);
  }
  // Checker (swap the lower row), soft grout and a few pebbles.
  g.fillStyle = '#d9946a';
  g.fillRect(S / 2, 0, S / 2, S / 2);
  g.fillStyle = '#f8e6bb';
  g.fillRect(0, S / 2, S / 2, S / 2);
  g.fillStyle = '#d9946a';
  g.fillRect(S / 2, S / 2, S / 2, S / 2);
  g.fillStyle = '#f8e6bb';
  g.fillRect(0, 0, S / 2, S / 2);
  g.strokeStyle = 'rgba(150,100,60,0.35)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, S / 2 - 4, S / 2 - 4);
  g.strokeRect(S / 2 + 2, 2, S / 2 - 4, S / 2 - 4);
  g.strokeRect(2, S / 2 + 2, S / 2 - 4, S / 2 - 4);
  g.strokeRect(S / 2 + 2, S / 2 + 2, S / 2 - 4, S / 2 - 4);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * S, Math.random() * S, 4, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Build the market square around (cx, cz); `floorR` is the radius of the old plain floor (replaced here). */
export function buildMarketDressing(root: THREE.Object3D, cx: number, cz: number, floorR: number): void {
  const R = CurutDressConfig.stallRadius;
  const lit: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];

  // Stalls in a ring, facing the middle. A gap is left to the east (+x) where the camera and the street would be: no, evenly all round.
  const N = CurutDressConfig.stalls;
  const topAnchors: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.2;
    const x = cx + Math.sin(a) * R;
    const z = cz + Math.cos(a) * R;
    // Local +z must point at the middle: yaw of the direction from the stall to the centre.
    const yaw = Math.atan2(cx - x, cz - z);
    lit.push(place(stallGeo(i, i % 2 ? 0xb97a3e : 0xd4985a), x, 0, z, yaw));
    // Awning corners (for the bunting): the two outer front corners.
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    topAnchors.push(new THREE.Vector3(x - cy * 1.7 + sy * 0.9, 2.55, z + sy * 1.7 + cy * 0.9));
    topAnchors.push(new THREE.Vector3(x + cy * 1.7 + sy * 0.9, 2.55, z - sy * 1.7 + cy * 0.9));
    // A planter between this stall and the next, a little closer to the middle.
    const pa = a + Math.PI / N;
    lit.push(place(planterGeo(i), cx + Math.sin(pa) * (R - 0.6), 0, cz + Math.cos(pa) * (R - 0.6), 0));
  }

  // Bunting: a sagging rope between each stall's right corner and the next stall's left corner, hung with little flags.
  const ropeParts: Part[] = [];
  const flagParts: Part[] = [];
  let fi = 0;
  for (let i = 0; i < N; i++) {
    const a = topAnchors[i * 2 + 1];
    const b = topAnchors[((i + 1) % N) * 2];
    const steps = 9;
    let prev = a.clone();
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const p = new THREE.Vector3().lerpVectors(a, b, u);
      p.y -= Math.sin(u * Math.PI) * 0.55;
      ropeParts.push(rope(prev, p, 0.05, 0x6b4a2e));
      if (s < steps) flagParts.push({ g: cone(0.2, 0.42, 3), c: FLAGS[fi++ % FLAGS.length], p: [p.x, p.y - 0.2, p.z], r: [Math.PI, -Math.atan2(cx - p.x, cz - p.z), 0], s: [1, 1, 0.12] });
      prev = p;
    }
  }
  lit.push(merge(ropeParts), merge(flagParts));

  // Lantern posts on a second, wider ring: a pole, a crossbar and three glowing paper lanterns.
  const posts = 6;
  const lampParts: Part[] = [];
  const lanternParts: Part[] = [];
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2 + 0.55;
    const px = cx + Math.sin(a) * (R + 3.2);
    const pz = cz + Math.cos(a) * (R + 3.2);
    lampParts.push({ g: cyl(0.09, 0.12, 3.6), c: 0x7a4f2f, p: [px, 1.8, pz] });
    for (let l = -1; l <= 1; l++) {
      const dx = Math.cos(a) * l * 0.55;
      const dz = -Math.sin(a) * l * 0.55;
      const col = l === 0 ? 0xffb340 : l < 0 ? 0xff5a4a : 0xff8aa8;
      lanternParts.push({ g: sph(0.26, 9, 7), c: col, p: [px + dx, 3.35 - Math.abs(l) * 0.35, pz + dz], s: [1, 1.2, 1] });
      lampParts.push({ g: box(0.08, 0.08, 0.08), c: 0xffd23f, p: [px + dx, 3.7 - Math.abs(l) * 0.35, pz + dz] });
    }
    lampParts.push({ g: box(Math.abs(Math.sin(a)) > 0.5 ? 0.12 : 1.2, 0.1, Math.abs(Math.sin(a)) > 0.5 ? 1.2 : 0.12), c: 0x7a4f2f, p: [px, 3.7, pz] });
  }
  lit.push(merge(lampParts));
  glow.push(merge(lanternParts));

  // Village houses far behind, so the horizon is a little town and not an empty field.
  for (let i = 0; i < CurutDressConfig.houses; i++) {
    const a = (i / CurutDressConfig.houses) * Math.PI * 2 + 0.1;
    const x = cx + Math.sin(a) * CurutDressConfig.houseRadius;
    const z = cz + Math.cos(a) * CurutDressConfig.houseRadius;
    lit.push(place(houseGeo(i), x, 0, z, Math.atan2(cx - x, cz - z)));
  }

  const litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const litMesh = new THREE.Mesh(mergeGeometries(lit.map((g) => (g.index ? g.toNonIndexed() : g)), false) as THREE.BufferGeometry, litMat);
  const glowMesh = new THREE.Mesh(mergeGeometries(glow.map((g) => (g.index ? g.toNonIndexed() : g)), false) as THREE.BufferGeometry, glowMat);
  for (const m of [litMesh, glowMesh]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.matrixAutoUpdate = false;
    root.add(m);
  }
  for (const g of [...lit, ...glow]) g.dispose();

  // Floor: checkered plaza tiles, then the medallion disc that carries the fight ring marker.
  const tiles = tileTexture();
  tiles.repeat.set((floorR * 2) / 2.2, (floorR * 2) / 2.2);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(floorR, 48), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.92 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(cx, -0.01, cz);
  root.add(plaza);
  const med = new THREE.Mesh(new THREE.CircleGeometry(7.4, 64), new THREE.MeshStandardMaterial({ map: medallionTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  med.rotation.x = -Math.PI / 2;
  med.position.set(cx, 0.005, cz);
  root.add(med);
}
