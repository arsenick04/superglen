import * as THREE from 'three';
import type { ColorBatch, Vec3 } from './Batch';
import { sphereGeo, matrixOf } from './Round';

/**
 * The one Barongsai (Chinese lion-dance) head used by every level that shows one: the big Lab computer, the costume
 * on its stand in the hall and the two guardians outside. Built in local space facing +Z, ~1.2 m wide at scale 1:
 * rounded head, big round eyes with lids and lashes, a gold forehead mirror and a single horn, fluffy cream brows,
 * ear tufts and beard, a wide open mouth with soft lips, teeth and tongue, and a red-green-gold mane.
 * All pieces are smooth ellipsoids/tori (computed normals), merged into the given batch (no extra draw calls).
 */
export interface LionHeadOpts {
  batch: ColorBatch;
  pos: Vec3;
  /** Rotation around Y (the head looks along +Z at yaw 0). */
  yaw?: number;
  scale?: number;
  /** Cheaper version for small/far heads: fewer segments, no lashes. */
  simple?: boolean;
  /** When given, the irises / forehead gem become separate meshes (added to `root`) with these materials, so a level can animate them. */
  root?: THREE.Object3D;
  irisMat?: THREE.Material;
  gemMat?: THREE.Material;
}

const RED = 0xd8322b;
const DEEP = 0x8f2420;
const GOLD = 0xf4b72e;
const CREAM = 0xfff3dc;
const WHITE = 0xffffff;
const GREEN = 0x2fa86a;
const PINK = 0xf2808a;
const MOUTH = 0x45101a;

export function buildLionHead(o: LionHeadOpts): void {
  const b = o.batch;
  const S = o.scale ?? 1;
  const hi = !o.simple;
  const base = matrixOf(o.pos, [0, o.yaw ?? 0, 0], [S, S, S], new THREE.Matrix4());
  const tmp = new THREE.Matrix4();
  const w = hi ? 18 : 10;
  const h = hi ? 12 : 7;
  const ws = hi ? 12 : 8; // small parts
  const hs = hi ? 8 : 6;

  /** Ellipsoid in head space. */
  const e = (r: Vec3, p: Vec3, color: number, rot?: Vec3, big = false): void => {
    tmp.multiplyMatrices(base, matrixOf(p, rot, r, new THREE.Matrix4()));
    b.addGeometry(big ? sphereGeo(w, h) : sphereGeo(ws, hs), tmp, color);
  };
  /** Torus in head space (default facing +Z). */
  const t = (R: number, tube: number, p: Vec3, color: number, rot?: Vec3, arc = Math.PI * 2, sc?: Vec3): void => {
    const lb = new THREE.Matrix4();
    // Reuse ring() through a throw-away batch matrix: build the matrix ourselves and use the shared template.
    ringAt(b, base, R, tube, p, color, rot, arc, sc, lb, hi);
  };
  const meshAt = (r: Vec3, p: Vec3, mat: THREE.Material): void => {
    const mesh = new THREE.Mesh(sphereGeo(ws, hs), mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.multiplyMatrices(base, matrixOf(p, undefined, r, new THREE.Matrix4()));
    mesh.matrixWorldNeedsUpdate = true;
    o.root!.add(mesh);
  };

  // --- Mane behind the head: deep red base, a ring of green and cream fluff ---
  e([0.64, 0.58, 0.3], [0, 0.02, -0.2], DEEP, undefined, true);
  const fluff = hi ? 18 : 12;
  for (let i = 0; i < fluff; i++) {
    const a = (i / fluff) * Math.PI * 2;
    const rr = 0.17 + 0.03 * Math.sin(i * 2.1);
    e([rr, rr, rr], [Math.cos(a) * 0.68, 0.02 + Math.sin(a) * 0.62, -0.2], i % 3 === 0 ? CREAM : GREEN);
  }
  if (hi) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      e([0.14, 0.14, 0.14], [Math.cos(a) * 0.52, 0.02 + Math.sin(a) * 0.48, -0.06], i % 2 ? RED : GOLD);
    }
  }

  // --- Skull, forehead bump, muzzle ---
  e([0.58, 0.5, 0.5], [0, 0, 0], RED, undefined, true);
  e([0.36, 0.26, 0.3], [0, 0.29, 0.2], RED, undefined, true);
  e([0.42, 0.26, 0.28], [0, -0.13, 0.36], RED, undefined, true);
  // Cheek puffs with gold dots.
  for (const s of [-1, 1]) {
    e([0.17, 0.15, 0.15], [s * 0.42, -0.18, 0.28], RED);
    e([0.05, 0.05, 0.04], [s * 0.45, -0.1, 0.4], GOLD);
    e([0.04, 0.04, 0.04], [s * 0.5, -0.17, 0.38], GOLD);
    e([0.035, 0.035, 0.035], [s * 0.5, -0.25, 0.35], GOLD);
  }
  // Gold dots across the forehead like stitched trim.
  for (let i = -4; i <= 4; i++) e([0.03, 0.03, 0.025], [i * 0.1, 0.5 - Math.abs(i) * 0.018, 0.18 - Math.abs(i) * 0.03], GOLD);

  // --- Mouth: dark opening, soft lips, rounded teeth, tongue, lower jaw ---
  e([0.3, 0.17, 0.12], [0, -0.3, 0.5], MOUTH);
  e([0.34, 0.15, 0.2], [0, -0.44, 0.42], RED, undefined, true);
  e([0.17, 0.07, 0.15], [0, -0.35, 0.55], PINK);
  t(0.31, 0.055, [0, -0.29, 0.54], 0xe35a52, undefined, Math.PI * 2, [1, 0.58, 1]);
  for (let i = -2; i <= 2; i++) e([0.045, 0.065, 0.04], [i * 0.1, -0.2, 0.57], CREAM);
  for (const s of [-1, 1]) e([0.05, 0.05, 0.04], [s * 0.2, -0.385, 0.58], CREAM);

  // --- Nose ---
  e([0.1, 0.075, 0.08], [0, 0.0, 0.62], GOLD);
  for (const s of [-1, 1]) e([0.02, 0.016, 0.015], [s * 0.04, -0.01, 0.69], MOUTH);

  // --- Eyes: round white, glossy iris, lid, gold ring, lashes ---
  for (const s of [-1, 1]) {
    const ex = s * 0.22;
    e([0.15, 0.165, 0.1], [ex, 0.15, 0.41], WHITE);
    if (o.root && o.irisMat) meshAt([0.095, 0.105, 0.06], [ex + s * 0.01, 0.145, 0.48], o.irisMat);
    else e([0.095, 0.105, 0.06], [ex + s * 0.01, 0.145, 0.48], 0x2a1812);
    e([0.032, 0.036, 0.02], [ex - 0.03 + s * 0.015, 0.19, 0.53], WHITE);
    e([0.17, 0.09, 0.12], [ex, 0.265, 0.415], RED); // upper lid, slightly proud
    t(0.162, 0.02, [ex, 0.15, 0.49], GOLD, undefined, Math.PI * 2, [1, 1.08, 1]);
    if (hi) {
      for (let k = 0; k < 5; k++) {
        const a = Math.PI * (0.18 + 0.64 * (k / 4));
        const ax = s === 1 ? a : Math.PI - a;
        const px = ex + Math.cos(ax) * 0.17;
        const py = 0.165 + Math.sin(a) * 0.19;
        const lash = new THREE.Matrix4();
        tmp.multiplyMatrices(base, matrixOf([px, py, 0.495], [0.3, 0, ax - Math.PI / 2], [0.016, 0.09, 0.016], lash));
        b.addGeometry(lashGeo(), tmp, 0x2a1812);
      }
    }
  }
  // Fluffy cream eyebrows (rounded clusters) arching above the eyes.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const k = i / 4;
      const rr = 0.065 + 0.03 * Math.sin(k * Math.PI);
      e([rr * 1.15, rr, rr], [s * (0.1 + k * 0.38), 0.42 + 0.1 * Math.sin(k * Math.PI) - k * 0.04, 0.33 - k * 0.1], i % 2 ? WHITE : CREAM);
    }
  }

  // --- Forehead mirror (gold disc with a gem), and a single horn ---
  const mirrorM = matrixOf([0, 0.5, 0.47], [-0.55, 0, 0], [0.115, 0.115, 0.03], new THREE.Matrix4());
  tmp.multiplyMatrices(base, mirrorM);
  b.addGeometry(sphereGeo(ws, hs), tmp, GOLD);
  t(0.125, 0.026, [0, 0.505, 0.48], GOLD, [-0.55, 0, 0]);
  if (o.root && o.gemMat) meshAt([0.07, 0.07, 0.04], [0, 0.52, 0.5], o.gemMat);
  else e([0.065, 0.065, 0.04], [0, 0.52, 0.5], 0x2ec4b6);
  // Horn curving backwards, in two rounded segments so it bends.
  e([0.08, 0.17, 0.08], [0, 0.62, 0.1], GOLD, [-0.35, 0, 0]);
  e([0.06, 0.15, 0.06], [0, 0.78, 0.0], GOLD, [-0.8, 0, 0]);
  e([0.05, 0.05, 0.05], [0, 0.88, -0.1], CREAM);

  // --- Ears with cream tufts ---
  for (const s of [-1, 1]) {
    e([0.14, 0.21, 0.1], [s * 0.57, 0.28, -0.02], RED, [0, 0, s * -0.45]);
    e([0.08, 0.13, 0.05], [s * 0.56, 0.28, 0.06], GOLD, [0, 0, s * -0.45]);
    for (let i = 0; i < 3; i++) e([0.07, 0.07, 0.07], [s * (0.64 + i * 0.05), 0.44 + i * 0.07, -0.02], i === 1 ? WHITE : CREAM);
  }

  // --- Beard: two fluffy rows hanging from the jaw ---
  for (let i = -4; i <= 4; i++) {
    const x = i * 0.095;
    const drop = 1 - Math.pow(Math.abs(i) / 4, 2);
    const rr = 0.095 + 0.03 * drop;
    e([rr, rr * 1.25, rr], [x, -0.54 - 0.08 * drop, 0.34 - Math.abs(i) * 0.04], i % 2 ? WHITE : CREAM);
  }
  for (let i = -2; i <= 2; i++) e([0.085, 0.12, 0.085], [i * 0.1, -0.68 - 0.04 * (1 - Math.abs(i) / 2), 0.3], i % 2 ? CREAM : WHITE);
}

let lashG: THREE.BufferGeometry | null = null;
function lashGeo(): THREE.BufferGeometry {
  return (lashG ??= new THREE.ConeGeometry(1, 1, 5));
}

/** Torus placed relative to the head matrix. */
function ringAt(
  b: ColorBatch,
  base: THREE.Matrix4,
  R: number,
  tube: number,
  p: Vec3,
  color: number,
  rot: Vec3 | undefined,
  arc: number,
  sc: Vec3 | undefined,
  scratch: THREE.Matrix4,
  hi: boolean,
): void {
  const g = ringTemplate(R, tube, arc, hi);
  const local = matrixOf(p, rot, sc, scratch);
  b.addGeometry(g, new THREE.Matrix4().multiplyMatrices(base, local), color);
}

const ringCache = new Map<string, THREE.BufferGeometry>();
function ringTemplate(R: number, tube: number, arc: number, hi: boolean): THREE.BufferGeometry {
  const k = `${R}|${tube}|${arc}|${hi}`;
  let g = ringCache.get(k);
  if (!g) {
    g = new THREE.TorusGeometry(R, tube, hi ? 8 : 5, hi ? 28 : 14, arc);
    ringCache.set(k, g);
  }
  return g;
}
