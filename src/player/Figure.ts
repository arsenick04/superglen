import * as THREE from 'three';
import { box, cone, cyl, merge, sph, type Part } from '../world/kota/ColorMesh';

/**
 * Low-poly child figures for Glen, Superglen and Nino (placeholder until the real models of Phase C). Five merged meshes
 * each (body+head, two arms, two legs), vertex coloured, so a figure is 5 draw calls on one shared material. Feet at y = 0,
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

const cache = new Map<FigureKind, { body: THREE.BufferGeometry; arm: THREE.BufferGeometry; leg: THREE.BufferGeometry }>();

function geos(kind: FigureKind) {
  let g = cache.get(kind);
  if (!g) {
    const l = LOOKS[kind];
    g = { body: merge(bodyParts(l, kind)), arm: merge(armParts(l, kind)), leg: merge(legParts(l, kind)) };
    cache.set(kind, g);
  }
  return g;
}

/** One shared vertex-colour material per tint set (Player needs its own so the rhythm glow stays on the player). */
export function figureMaterial(emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, emissive, emissiveIntensity });
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
  private readonly body: THREE.Mesh;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private phase = 0;
  private t = Math.random() * 6;
  private aL = 0;
  private aR = 0;
  private lL = 0;
  private lR = 0;
  private aZ = 0;

  constructor(kind: FigureKind, mat: THREE.Material, shadows = true) {
    const g = geos(kind);
    this.body = new THREE.Mesh(g.body, mat);
    this.body.castShadow = shadows;
    this.root.add(this.body);
    const mk = (geo: THREE.BufferGeometry, x: number, y: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadows;
      pivot.add(m);
      this.root.add(pivot);
      return pivot;
    };
    this.armL = mk(g.arm, -0.27, SHOULDER_Y);
    this.armR = mk(g.arm, 0.27, SHOULDER_Y);
    this.legL = mk(g.leg, -0.105, HIP_Y);
    this.legR = mk(g.leg, 0.105, HIP_Y);
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
    this.lL += (tLL - this.lL) * k;
    this.lR += (tLR - this.lR) * k;
    this.aL += (tAL - this.aL) * k;
    this.aR += (tAR - this.aR) * k;
    this.aZ += (tZ - this.aZ) * k;
    this.legL.rotation.x = this.lL;
    this.legR.rotation.x = this.lR;
    this.armL.rotation.x = this.aL;
    this.armR.rotation.x = this.aR;
    this.armL.rotation.z = -this.aZ;
    this.armR.rotation.z = this.aZ;
    this.body.position.y = bob;
  }
}
