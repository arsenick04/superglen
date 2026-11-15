import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cone, cyl, merge, sph as sphFull, type Part } from '../world/kota/ColorMesh';

/** Spheres with fewer segments (a figure is drawn twice per frame, with the shadow pass; the triangle budget is tight). */
const sph = (r: number, w = 8, h = 6): THREE.BufferGeometry => (w >= 8 ? sphFull(r, w - 2, Math.max(4, h - 2)) : sphFull(r, w, Math.min(h, 4)));

/**
 * Low-poly child figures for Glen, Superglen and Nino (placeholder until the real models of Phase C). One merged mesh
 * (body+head, two arms, two legs, tagged per vertex with pivot + part id and posed in the vertex shader), vertex coloured, so a
 * figure is a single draw call (plus one in the shadow pass). Feet at y = 0,
 * about 1.3 m tall without the Superglen lion hat. Facing +Z. Poses are driven from code by `Figure.pose`.
 */
export type FigureKind = 'glen' | 'superglen' | 'nino';

const SKIN = 0xf1c9a0;
const NINO_SKIN = 0xc98f62;
const EYE = 0x2b1a12;
const BLACK = 0x1f1a1c;
const CREAM = 0xf3dfae;
const GOLD = 0xffc94d;

interface Look {
  skin: number;
  hair: number;
  top: number;
  sleeve: number;
  cuff: number;
  arm: number;
  pants: number;
  sock: number;
  shoe: number;
  sole: number;
}

const LOOKS: Record<FigureKind, Look> = {
  glen: { skin: SKIN, hair: BLACK, top: 0xff8a1f, sleeve: 0xf6f2ff, cuff: GOLD, arm: SKIN, pants: 0xff8a1f, sock: 0x2f6fd6, shoe: 0xf58a1f, sole: 0xffffff },
  superglen: { skin: SKIN, hair: BLACK, top: 0xe02b20, sleeve: 0xe02b20, cuff: GOLD, arm: 0xe02b20, pants: 0xd0261c, sock: CREAM, shoe: 0xc8201a, sole: GOLD },
  nino: { skin: NINO_SKIN, hair: BLACK, top: 0x2f5fe0, sleeve: 0x2f5fe0, cuff: 0xe8eef8, arm: 0x1c2a78, pants: 0x1c2a78, sock: 0xe8eef8, shoe: 0x2f5fe0, sole: 0xe8eef8 },
};

const HIP_Y = 0.46;
const SHOULDER_Y = 0.8;

function legParts(l: Look, kind: FigureKind): Part[] {
  const p: Part[] = [
    { g: cyl(0.078, 0.07, 0.3, 7), c: l.pants, p: [0, -0.15, 0] },
    { g: cyl(0.06, 0.06, 0.14, 7), c: l.sock, p: [0, -0.36, 0] },
    { g: box(0.13, 0.07, 0.22), c: l.shoe, p: [0, -0.425, 0.04] },
    { g: box(0.134, 0.02, 0.226), c: l.sole, p: [0, -0.45, 0.04] },
  ];
  if (kind !== 'glen') p.push({ g: cyl(0.09, 0.09, 0.07, 7), c: kind === 'superglen' ? CREAM : 0xe8eef8, p: [0, -0.3, 0] });
  return p;
}

function armParts(l: Look, kind: FigureKind): Part[] {
  const p: Part[] = [
    { g: cyl(0.068, 0.066, 0.16, 7), c: l.sleeve, p: [0, -0.07, 0] },
    { g: cyl(0.052, 0.05, 0.2, 6), c: l.arm, p: [0, -0.22, 0] },
    { g: sph(0.062, 6, 4), c: l.skin, p: [0, -0.34, 0] },
  ];
  if (kind === 'superglen') p.push({ g: cyl(0.062, 0.062, 0.05, 7), c: GOLD, p: [0, -0.28, 0] });
  if (kind === 'nino') p.push({ g: cyl(0.056, 0.056, 0.04, 7), c: 0x58c8ff, p: [0, -0.27, 0] });
  if (kind !== 'glen') p.push({ g: cyl(0.075, 0.075, 0.04, 7), c: kind === 'superglen' ? CREAM : 0xe8eef8, p: [0, -0.15, 0] });
  return p;
}

function bodyParts(l: Look, kind: FigureKind): Part[] {
  const p: Part[] = [
    // Torso, neck, shorts / belt line.
    { g: cyl(0.19, 0.21, 0.4, 8), c: kind === 'glen' ? 0xf6f2ff : l.top, p: [0, 0.66, 0] },
    { g: cyl(0.07, 0.08, 0.08, 6), c: l.skin, p: [0, 0.89, 0] },
    { g: cyl(0.225, 0.232, 0.17, 8), c: l.pants, p: [0, 0.52, 0] },
    // Head and face.
    { g: sph(0.23, 10, 8), c: l.skin, p: [0, 1.04, 0] },
    { g: sph(0.034, 6, 4), c: EYE, p: [-0.085, 1.05, 0.205] },
    { g: sph(0.034, 6, 4), c: EYE, p: [0.085, 1.05, 0.205] },
    { g: sph(0.04, 6, 4), c: 0xf29a8a, p: [-0.15, 0.98, 0.17], s: [1.2, 0.7, 0.5] },
    { g: sph(0.04, 6, 4), c: 0xf29a8a, p: [0.15, 0.98, 0.17], s: [1.2, 0.7, 0.5] },
    { g: sph(0.035, 6, 4), c: 0xd9806f, p: [0, 1.0, 0.225], s: [1.3, 0.8, 0.6] },
    { g: sph(0.045, 6, 4), c: 0xb5433a, p: [0, 0.94, 0.2], s: [1.5, 0.5, 0.5] },
    { g: sph(0.05, 6, 4), c: l.skin, p: [-0.225, 1.03, 0], s: [0.6, 1, 1] },
    { g: sph(0.05, 6, 4), c: l.skin, p: [0.225, 1.03, 0], s: [0.6, 1, 1] },
  ];
  if (kind === 'glen') {
    p.push(
      { g: cyl(0.2, 0.225, 0.34, 8), c: l.top, p: [0, 0.64, 0] },
      { g: box(0.09, 0.04, 0.04), c: 0xf6f2ff, p: [0, 0.84, 0.17] },
      { g: sph(0.255, 10, 7), c: l.hair, p: [0, 1.1, -0.035], s: [1, 0.75, 1] },
      { g: sph(0.25, 8, 6), c: l.hair, p: [0, 1.04, -0.1], s: [1, 1, 0.8] },
      { g: cone(0.06, 0.14, 5), c: l.hair, p: [-0.12, 1.3, 0.02], r: [0, 0, 0.4] },
      { g: cone(0.06, 0.15, 5), c: l.hair, p: [0.02, 1.34, 0.05] },
      { g: cone(0.06, 0.14, 5), c: l.hair, p: [0.13, 1.3, 0], r: [0, 0, -0.4] },
      { g: cone(0.055, 0.12, 5), c: l.hair, p: [0, 1.27, 0.16], r: [0.9, 0, 0] },
    );
  } else if (kind === 'superglen') {
    p.push(
      // Gold belt, chest plate with a "G" block, fur collar and a flowing red cape.
      { g: cyl(0.215, 0.225, 0.06, 8), c: GOLD, p: [0, 0.57, 0] },
      { g: box(0.17, 0.17, 0.04), c: GOLD, p: [0, 0.71, 0.19] },
      { g: box(0.09, 0.1, 0.045), c: l.top, p: [0, 0.71, 0.2] },
      { g: cyl(0.22, 0.25, 0.08, 8), c: CREAM, p: [0, 0.86, 0] },
      { g: box(0.5, 0.62, 0.03), c: 0xe02b20, p: [0, 0.58, -0.25], r: [0.12, 0, 0] },
      { g: box(0.52, 0.06, 0.04), c: CREAM, p: [0, 0.27, -0.3], r: [0.12, 0, 0] },
      { g: sph(0.236, 8, 6), c: BLACK, p: [0, 1.06, -0.03], s: [1, 0.9, 0.95] },
      // Barongsai lion hat: red dome, cream fur brim, big eyes, ears, gold knob, teal gem.
      { g: sph(0.31, 10, 7), c: 0xe02b20, p: [0, 1.2, -0.02], s: [1, 0.72, 1] },
      { g: sph(0.3, 10, 6), c: CREAM, p: [0, 1.13, 0.0], s: [1.04, 0.3, 1.0] },
      { g: sph(0.2, 8, 5), c: CREAM, p: [0, 1.14, 0.12], s: [1.15, 0.26, 0.75] },
      { g: sph(0.075, 8, 6), c: 0xffffff, p: [-0.14, 1.3, 0.2] },
      { g: sph(0.075, 8, 6), c: 0xffffff, p: [0.14, 1.3, 0.2] },
      { g: sph(0.045, 6, 5), c: 0x4a1f14, p: [-0.14, 1.3, 0.26] },
      { g: sph(0.045, 6, 5), c: 0x4a1f14, p: [0.14, 1.3, 0.26] },
      { g: sph(0.045, 6, 5), c: 0x1fb6a8, p: [0, 1.4, 0.24] },
      { g: sph(0.09, 6, 5), c: CREAM, p: [-0.27, 1.38, -0.02], s: [0.8, 1.2, 0.7] },
      { g: sph(0.09, 6, 5), c: CREAM, p: [0.27, 1.38, -0.02], s: [0.8, 1.2, 0.7] },
      { g: cone(0.08, 0.16, 8), c: 0xe02b20, p: [0, 1.52, -0.02] },
      { g: sph(0.04, 6, 4), c: GOLD, p: [0, 1.62, -0.02] },
    );
  } else {
    p.push(
      // Blue tunic with silver belt and gem, white fur trim, blue cape, swept black hair, temple light.
      { g: cyl(0.2, 0.225, 0.3, 8), c: 0x2f5fe0, p: [0, 0.66, 0] },
      { g: cyl(0.215, 0.225, 0.05, 8), c: 0xcfd8e6, p: [0, 0.58, 0] },
      { g: sph(0.04, 6, 4), c: 0x58c8ff, p: [0, 0.58, 0.22] },
      { g: box(0.13, 0.13, 0.03), c: 0xe8eef8, p: [0, 0.73, 0.19] },
      { g: box(0.07, 0.09, 0.035), c: 0x2f5fe0, p: [0, 0.73, 0.2] },
      { g: cyl(0.2, 0.22, 0.07, 8), c: 0xe8eef8, p: [0, 0.86, 0] },
      { g: box(0.5, 0.6, 0.03), c: 0x2f5fe0, p: [0, 0.58, -0.25], r: [0.12, 0, 0] },
      { g: box(0.52, 0.06, 0.04), c: 0xe8eef8, p: [0, 0.27, -0.3], r: [0.12, 0, 0] },
      { g: sph(0.255, 10, 7), c: l.hair, p: [0, 1.1, -0.035], s: [1, 0.78, 1] },
      { g: sph(0.24, 8, 6), c: l.hair, p: [0, 1.03, -0.1], s: [1, 1, 0.85] },
      { g: sph(0.14, 7, 5), c: l.hair, p: [0.07, 1.25, 0.1], s: [1.4, 0.7, 1], r: [0, 0, -0.3] },
      { g: sph(0.025, 5, 4), c: 0x58c8ff, p: [0.2, 1.16, 0.1] },
    );
  }
  return p;
}

const PIVOTS: readonly [number, number, number][] = [
  [0, 0, 0],
  [-0.27, SHOULDER_Y, 0],
  [0.27, SHOULDER_Y, 0],
  [-0.105, HIP_Y, 0],
  [0.105, HIP_Y, 0],
];

/** Move a limb geometry to its pivot and tag every vertex with (pivot xyz, part id): 0 body, 1/2 arms, 3/4 legs. */
function tag(g: THREE.BufferGeometry, id: number): THREE.BufferGeometry {
  const [x, y, z] = PIVOTS[id];
  g.translate(x, y, z);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    arr[i * 4] = x;
    arr[i * 4 + 1] = y;
    arr[i * 4 + 2] = z;
    arr[i * 4 + 3] = id;
  }
  g.setAttribute('pivotPart', new THREE.BufferAttribute(arr, 4));
  return g;
}

const cache = new Map<FigureKind, THREE.BufferGeometry>();

function geos(kind: FigureKind): THREE.BufferGeometry {
  let g = cache.get(kind);
  if (!g) {
    const l = LOOKS[kind];
    const arm = () => merge(armParts(l, kind));
    const leg = () => merge(legParts(l, kind));
    const list = [tag(merge(bodyParts(l, kind)), 0), tag(arm(), 1), tag(arm(), 2), tag(leg(), 3), tag(leg(), 4)];
    const m = mergeGeometries(list, false);
    for (const x of list) x.dispose();
    if (!m) throw new Error('Figure: merge failed');
    m.computeBoundingSphere();
    g = m;
    cache.set(kind, g);
  }
  return g;
}

/** Pose uniforms, shared by the lit material and the shadow depth material of one figure. */
interface PoseU {
  /** arm L, arm R, leg L, leg R swing (rad). */
  limb: { value: THREE.Vector4 };
  /** x: arm spread (rad), y: body bob (m). */
  zb: { value: THREE.Vector2 };
}

const GLSL_POSE = `
attribute vec4 pivotPart;
uniform vec4 uLimb;
uniform vec2 uZB;
mat3 figR(float id) {
  float ax = id < 1.5 ? uLimb.x : (id < 2.5 ? uLimb.y : (id < 3.5 ? uLimb.z : uLimb.w));
  float az = id < 0.5 ? 0.0 : (id < 1.5 ? -uZB.x : (id < 2.5 ? uZB.x : 0.0));
  if (id < 0.5) ax = 0.0;
  float cx = cos(ax), sx = sin(ax), cz = cos(az), sz = sin(az);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
  return rx * rz;
}
`;

function patch(mat: THREE.Material, u: PoseU): void {
  mat.userData.poseU = u;
  mat.customProgramCacheKey = () => 'figure-pose';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLimb = u.limb;
    sh.uniforms.uZB = u.zb;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_POSE)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = figR(pivotPart.w) * objectNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed = pivotPart.xyz + figR(pivotPart.w) * (position - pivotPart.xyz) + vec3(0.0, pivotPart.w < 0.5 ? uZB.y : 0.0, 0.0);',
      );
  };
}

/** Per-figure state read back by the renderer hook (materials may be shared, uniforms are set right before each draw). */
function bindPose(mesh: THREE.Mesh, fig: { limb: THREE.Vector4; zb: THREE.Vector2 }): void {
  mesh.onBeforeRender = (_r, _s, _c, _g, material) => {
    const u = (material as THREE.Material).userData.poseU as PoseU | undefined;
    if (!u) return;
    u.limb.value.copy(fig.limb);
    u.zb.value.copy(fig.zb);
    (material as THREE.ShaderMaterial).uniformsNeedUpdate = true;
  };
}

let depthMat: THREE.MeshDepthMaterial | null = null;
function figureDepth(): THREE.MeshDepthMaterial {
  if (!depthMat) {
    depthMat = new THREE.MeshDepthMaterial();
    patch(depthMat, { limb: { value: new THREE.Vector4() }, zb: { value: new THREE.Vector2() } });
  }
  return depthMat;
}

/** One shared vertex-colour material per tint set (Player needs its own so the rhythm glow stays on the player). */
export function figureMaterial(emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, emissive, emissiveIntensity });
  patch(m, { limb: { value: new THREE.Vector4() }, zb: { value: new THREE.Vector2() } });
  return m;
}

export interface FigureState {
  /** Horizontal speed (m/s). */
  speed: number;
  airborne: boolean;
  /** Vertical speed (m/s). */
  vy: number;
  flying: boolean;
  riding: boolean;
}

/** A posable figure. `root` has its origin at the feet. */
export class Figure {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  /** Current pose, fed to the shader: (arm L, arm R, leg L, leg R) and (arm spread, bob). */
  readonly limb = new THREE.Vector4();
  readonly zb = new THREE.Vector2();
  private phase = 0;
  private t = Math.random() * 6;

  constructor(kind: FigureKind, mat: THREE.Material, shadows = true) {
    this.mesh = new THREE.Mesh(geos(kind), mat);
    this.mesh.castShadow = shadows;
    this.mesh.frustumCulled = false;
    if (shadows) this.mesh.customDepthMaterial = figureDepth();
    bindPose(this.mesh, this);
    this.root.add(this.mesh);
  }

  /** Advance the code animation (no allocation). Positive x rotation swings a limb backwards (-Z). */
  pose(dt: number, s: FigureState): void {
    this.t += dt;
    let tAL = 0;
    let tAR = 0;
    let tLL = 0;
    let tLR = 0;
    let tZ = 0.08;
    let bob = 0;
    if (s.riding) {
      tLL = -1.15;
      tLR = -0.75;
      tAL = tAR = -0.95;
      tZ = 0.1;
    } else if (s.flying) {
      // Superman pose: both arms stretched forward over the head, legs trailing.
      tAL = tAR = -2.9;
      tLL = tLR = 0.25;
      tZ = 0.12;
      bob = 0.01 * Math.sin(this.t * 6);
    } else if (s.airborne) {
      const up = s.vy > 0;
      tAL = up ? -2.5 : -1.3;
      tAR = up ? -2.3 : -1.1;
      tZ = up ? 0.35 : 0.6;
      tLL = up ? -0.7 : -0.2;
      tLR = up ? 0.3 : 0.25;
    } else if (s.speed > 0.4) {
      this.phase += dt * (5 + s.speed * 1.6);
      const amp = Math.min(s.speed / 5, 1.2) * 0.85;
      const sw = Math.sin(this.phase);
      tLL = sw * amp;
      tLR = -sw * amp;
      tAL = -sw * amp * 0.8;
      tAR = sw * amp * 0.8;
      bob = Math.abs(Math.cos(this.phase)) * 0.03 * Math.min(s.speed / 5, 1);
    } else {
      bob = 0.012 * Math.sin(this.t * 2.4);
      tAL = 0.03 * Math.sin(this.t * 2.4);
      tAR = -tAL;
    }
    const k = Math.min(1, dt * 18);
    const L = this.limb;
    L.z += (tLL - L.z) * k;
    L.w += (tLR - L.w) * k;
    L.x += (tAL - L.x) * k;
    L.y += (tAR - L.y) * k;
    this.zb.x += (tZ - this.zb.x) * k;
    this.zb.y = bob;
  }
}
