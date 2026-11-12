import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { LevelContext } from '../Level';
import { Easings } from '../../gameplay/Sequence';
import { ColorBatch } from './Batch';
import { Kit, C, basic } from './Kit';
import { Z, HALL_HALF, DOOR_HALF, PANEL, LAB_FLOOR } from './Layout';
import type { Sparkles } from './Fx';

const SIDE = HALL_HALF + 0.3; // centre of the side walls
const HALL_MID = (Z.facade + Z.hallBack) / 2;
const HALL_LEN = Z.facade - Z.hallBack;
const WALL = 0xb5432f;
const CEIL_Y = 4.4;

/**
 * The dim old hall behind the facade, the corridor ramp to the laboratory and the circuit panel that opens the
 * back wall. Props are friendly (drums, crates, a cute costume head); lanterns and little teal/gold lights glow.
 */
export class Hall {
  private readonly lineMat: THREE.MeshBasicMaterial;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly leaves: THREE.Mesh[] = [];
  private readonly doorBody: RAPIER.Collider;
  private lineBright = 0;
  private time = 0;
  opened = false;

  constructor(
    private readonly ctx: LevelContext,
    kit: Kit,
    sparkles: Sparkles,
  ) {
    const root = ctx.root;
    // --- Shell: side walls, back wall with the doorway, ceiling ---
    for (const s of [-1, 1]) kit.solid([0.6, 5, HALL_LEN + 0.6], [s * SIDE, 2.5, HALL_MID], WALL);
    const bw = SIDE - DOOR_HALF;
    for (const s of [-1, 1]) kit.solid([bw + 0.3, 5, 0.6], [s * (DOOR_HALF + (bw + 0.3) / 2), 2.5, Z.hallBack - 0.3], 0x8e3328);
    kit.solid([DOOR_HALF * 2, 1.6, 0.6], [0, 4.2, Z.hallBack - 0.3], 0x8e3328); // lintel over the door
    kit.solid([SIDE * 2 + 0.6, 0.4, HALL_LEN], [0, CEIL_Y + 0.2, HALL_MID], 0x5a2a2a);
    for (let z = Z.facade - 2; z > Z.hallBack; z -= 4) {
      kit.lit.box([SIDE * 2, 0.35, 0.5], [0, CEIL_Y - 0.15, z], 0x3d1c1c);
      kit.lit.box([SIDE * 2, 0.08, 0.6], [0, CEIL_Y - 0.34, z], C.GOLD);
    }
    // Floor boards and a red runner with golden edges.
    kit.lit.box([HALL_HALF * 2, 0.04, HALL_LEN], [0, 0.02, HALL_MID], 0x6f4a3a);
    for (let z = Z.facade - 0.5; z > Z.hallBack; z -= 1.0) kit.lit.box([HALL_HALF * 2, 0.045, 0.05], [0, 0.022, z], 0x5a3b2e);
    kit.lit.box([2.8, 0.06, HALL_LEN], [0, 0.04, HALL_MID], 0xb83a2e);
    for (const s of [-1, 1]) kit.lit.box([0.12, 0.07, HALL_LEN], [s * 1.5, 0.045, HALL_MID], C.GOLD);
    // Gold wall trims.
    for (const s of [-1, 1]) {
      kit.lit.box([0.1, 0.25, HALL_LEN], [s * (HALL_HALF - 0.02), 1.0, HALL_MID], C.GOLD);
      kit.lit.box([0.1, 0.12, HALL_LEN], [s * (HALL_HALF - 0.02), 3.2, HALL_MID], C.GOLD);
    }

    // --- Pillars, drums, crates, the cute costume head ---
    for (const px of [-4.3, 4.3]) {
      for (const pz of [-47, -53]) {
        kit.solidCyl(0.45, 4.2, [px, 2.1, pz], C.RED);
        kit.lit.cyl(0.58, 0.3, [px, 0.15, pz], C.GOLD);
        kit.lit.cyl(0.58, 0.3, [px, 4.05, pz], C.GOLD);
      }
    }
    const drum = (x: number, z: number, r: number): void => {
      kit.solidCyl(r, 0.9, [x, 0.45, z], C.RED);
      kit.lit.cyl(r + 0.03, 0.12, [x, 0.12, z], C.GOLD);
      kit.lit.cyl(r + 0.03, 0.12, [x, 0.78, z], C.GOLD);
      kit.lit.cyl(r - 0.04, 0.05, [x, 0.92, z], C.CREAM);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        kit.lit.sph(0.05, [x + Math.cos(a) * (r + 0.03), 0.45, z + Math.sin(a) * (r + 0.03)], C.GOLD);
      }
    };
    drum(-6.2, -45.5, 0.6);
    drum(-5.9, -47.1, 0.45);
    drum(6.1, -56.2, 0.6);
    const crate = (x: number, z: number, s: number, c: number): void => {
      kit.solid([s, s, s], [x, s / 2, z], c);
      kit.lit.box([s + 0.02, 0.08, s + 0.02], [x, s * 0.5, z], 0x6b4a2f);
    };
    crate(6.2, -44.8, 1.0, 0xb98450);
    crate(6.2, -46.0, 1.0, 0xa97545);
    crate(6.2, -45.3, 0.8, C.GOLD);
    crate(-6.1, -55.6, 1.1, 0xb98450);
    crate(-4.9, -56.2, 0.8, 0xa97545);
    this.costumeHead(kit, 5.5, -50.5);

    // Hanging lanterns (glowing) and friendly teal/gold lights.
    for (const lx of [-3.2, 3.2]) {
      for (const lz of [-45, -50, -55]) {
        kit.lit.cyl(0.02, 0.9, [lx, CEIL_Y - 0.45, lz], C.GOLD);
        kit.glow.sph(0.34, [lx, CEIL_Y - 1.1, lz], 0xff9a4d, [1, 1.2, 1]);
        kit.lit.cyl(0.18, 0.1, [lx, CEIL_Y - 0.82, lz], C.GOLD);
        kit.lit.cyl(0.18, 0.1, [lx, CEIL_Y - 1.5, lz], C.GOLD);
        sparkles.addEmitter(lx, CEIL_Y - 1.9, lz, 0.3, 1.2, 0xffc27a);
      }
    }
    sparkles.addEmitter(-5.5, 0.4, -43.5, 1.0, 1.5, 0x5ef0e0);
    sparkles.addEmitter(5.0, 0.6, -47.5, 1.0, 1.5, 0xffd86b);
    sparkles.addEmitter(0, 0.4, -50, 2.5, 1.5, 0x5ef0e0);
    sparkles.addEmitter(-3.0, 0.5, -56.0, 1.2, 2.0, 0x5ef0e0);

    // --- Circuit panel on the back wall and the lines that run to the doors ---
    const pz = Z.hallBack + 0.02;
    kit.lit.box([2.0, 1.6, 0.12], [PANEL.x, 1.5, pz + 0.04], 0x2b3548);
    kit.lit.box([2.2, 0.12, 0.16], [PANEL.x, 2.36, pz + 0.05], C.GOLD);
    kit.lit.box([2.2, 0.12, 0.16], [PANEL.x, 0.64, pz + 0.05], C.GOLD);
    this.screenMat = basic(0x2ec4b6);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), this.screenMat);
    screen.position.set(PANEL.x, 1.5, pz + 0.115);
    root.add(screen);
    const lines = new ColorBatch(
      (this.lineMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
      false,
      false,
    );
    const L = (w: number, h: number, x: number, y: number, c: number): void => {
      lines.box([w, h, 0.05], [x, y, pz + 0.04], c);
      lines.box([0.16, 0.16, 0.06], [x, y, pz + 0.045], C.GOLD);
    };
    // Panel -> door frame -> across the arch and down the other side.
    L(1.7, 0.07, PANEL.x + 1.85, 1.5, 0x2ec4b6);
    L(0.07, 1.4, -DOOR_HALF - 0.25, 2.2, 0x2ec4b6);
    L(0.07, 3.0, -DOOR_HALF - 0.25, 1.5, 0xffd23f);
    L(0.07, 3.0, DOOR_HALF + 0.25, 1.5, 0xffd23f);
    L(DOOR_HALF * 2 + 0.5, 0.07, 0, 3.15, 0x2ec4b6);
    L(0.07, 1.2, -DOOR_HALF - 0.9, 3.0, 0x2ec4b6);
    L(0.07, 1.2, DOOR_HALF + 0.9, 3.0, 0x2ec4b6);
    L(1.3, 0.07, DOOR_HALF + 1.6, 1.2, 0xffd23f);
    L(1.3, 0.07, -DOOR_HALF - 1.6, 2.6, 0xffd23f);
    L(0.07, 1.0, PANEL.x - 0.9, 3.0, 0x2ec4b6);
    L(1.7, 0.07, PANEL.x - 0.05, 3.5, 0x2ec4b6);
    L(0.07, 1.0, PANEL.x + 0.8, 3.0, 0xffd23f);
    lines.build(root);
    this.lineMat.color.setRGB(0.22, 0.3, 0.34);

    // --- Door leaves (slide sideways into the wall) ---
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7a1f1a, roughness: 0.7 });
    const trimMat = new THREE.MeshStandardMaterial({ color: C.GOLD, roughness: 0.4, metalness: 0.2 });
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF, 3.4, 0.5), leafMat);
      leaf.position.set(s * DOOR_HALF * 0.5, 1.7, Z.hallBack - 0.27);
      leaf.castShadow = false;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 20), trimMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(-s * 0.2, 0.3, 0.27);
      leaf.add(disc);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(DOOR_HALF - 0.1, 0.1, 0.56), trimMat);
      rim.position.set(0, 1.55, 0);
      leaf.add(rim);
      root.add(leaf);
      this.leaves.push(leaf);
    }
    this.doorBody = kit.collider([DOOR_HALF * 2, 3.4, 0.6], [0, 1.7, Z.hallBack - 0.3]).collider;

    // --- Corridor and ramp down to the lab (floor y = LAB_FLOOR) ---
    const run = 4;
    const start = Z.hallBack - 0.6; // the ramp starts behind the door wall
    const th = Math.atan2(-LAB_FLOOR, run);
    const t = 1.0;
    const mid = start - run / 2;
    const n = [Math.cos(th), -Math.sin(th)]; // surface normal (y, z); the ramp falls toward -Z
    kit.solid([DOOR_HALF * 2, t, Math.hypot(run, -LAB_FLOOR)], [0, LAB_FLOOR / 2 - n[0] * (t / 2), mid - n[1] * (t / 2)], 0xd8e2f0, [-th, 0, 0]);
    for (const s of [-1, 1]) {
      kit.solid([0.6, 5.2, run + 0.6], [s * (DOOR_HALF + 0.3), 1.65, mid], 0xdfe9f7);
      kit.glow.box([0.05, 0.1, run], [s * (DOOR_HALF - 0.02), 0.7 + LAB_FLOOR / 2, mid], 0x5ef0e0, [-th, 0, 0]);
    }
    kit.solid([DOOR_HALF * 2 + 1.2, 0.5, run + 0.6], [0, 3.7, mid], 0xdfe9f7);
  }

  private costumeHead(kit: Kit, x: number, z: number): void {
    // Wooden stand with a cute red lion head looking toward the hall's middle (-X).
    kit.solidCyl(0.1, 1.3, [x, 0.65, z], 0x6b4a2f);
    kit.solidCyl(0.5, 0.12, [x, 0.06, z], 0x6b4a2f);
    const hy = 1.75;
    kit.lit.sph(0.62, [x, hy, z], C.RED, [0.9, 0.95, 1]);
    kit.lit.sph(0.6, [x + 0.15, hy + 0.02, z], C.ORANGE, [0.5, 1.2, 1.3]); // mane behind
    kit.lit.sph(0.2, [x, hy + 0.7, z - 0.35], C.RED);
    kit.lit.sph(0.2, [x, hy + 0.7, z + 0.35], C.RED);
    kit.lit.sph(0.15, [x - 0.1, hy + 0.7, z - 0.35], C.GOLD);
    kit.lit.sph(0.15, [x - 0.1, hy + 0.7, z + 0.35], C.GOLD);
    kit.lit.sph(0.22, [x - 0.5, hy + 0.12, z - 0.24], C.WHITE);
    kit.lit.sph(0.22, [x - 0.5, hy + 0.12, z + 0.24], C.WHITE);
    kit.lit.sph(0.11, [x - 0.68, hy + 0.1, z - 0.24], 0x222222);
    kit.lit.sph(0.11, [x - 0.68, hy + 0.1, z + 0.24], 0x222222);
    kit.lit.sph(0.04, [x - 0.76, hy + 0.15, z - 0.28], C.WHITE);
    kit.lit.sph(0.04, [x - 0.76, hy + 0.15, z + 0.2], C.WHITE);
    kit.lit.sph(0.14, [x - 0.58, hy - 0.12, z], C.GOLD);
    kit.lit.sph(0.25, [x - 0.42, hy - 0.4, z], C.CREAM, [0.8, 0.7, 1.4]); // beard
    kit.lit.add('cone', [x - 0.1, hy + 0.55, z], [0.1, 0.45, 0.1], C.GOLD);
  }

  get lines(): number {
    return this.lineBright;
  }

  /** Light the circuit lines and open the doors. Resolves when the doors are open. */
  async open(): Promise<void> {
    const { seq } = this.ctx;
    this.opened = true;
    await seq.tween(1.6, (t) => (this.lineBright = t), Easings.easeInOut);
    this.doorBody.setEnabled(false);
    const x0 = this.leaves.map((l) => l.position.x);
    await seq.tween(
      1.8,
      (t) => {
        for (let i = 0; i < 2; i++) this.leaves[i].position.x = x0[i] + (i === 0 ? -1 : 1) * (DOOR_HALF + 0.1) * t;
      },
      Easings.easeInOut,
    );
  }

  /** Skip the animation (returning players). */
  openInstant(): void {
    this.opened = true;
    this.lineBright = 1;
    this.doorBody.setEnabled(false);
    this.leaves[0].position.x -= DOOR_HALF + 0.1;
    this.leaves[1].position.x += DOOR_HALF + 0.1;
  }

  update(dt: number): void {
    this.time += dt;
    // Lines: dim and breathing until powered, then bright with a little shimmer.
    const b = this.lineBright;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
    const base = 0.22 + 0.1 * pulse;
    const v = base + (0.85 + 0.15 * pulse - base) * b;
    this.lineMat.color.setRGB(v, v, v);
    const s = 0.55 + 0.45 * pulse;
    this.screenMat.color.setRGB(0.18 * s + 0.1, 0.77 * s + 0.1, 0.71 * s + 0.1);
  }
}
