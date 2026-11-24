import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { LevelContext } from '../Level';
import { Easings } from '../../gameplay/Sequence';
import { ColorBatch } from './Batch';
import { Kit, C, basic } from './Kit';
import { Z, HALL_HALF, DOOR_HALF, PANEL, LAB_FLOOR } from './Layout';
import type { Sparkles } from './Fx';
import { buildLionHead } from './LionHead';
import { rbox, ball, ring, lathe, tube, column, softPool } from './Round';

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
    // Curved timber beams: shallow arches spanning the hall with a gold inlay and rounded gold brackets at the walls.
    const rise = 0.8;
    const chord = HALL_HALF * 2;
    const R = (chord * chord / 4 + rise * rise) / (2 * rise);
    const arc = 2 * Math.asin(chord / 2 / R);
    for (let z = Z.facade - 2; z > Z.hallBack; z -= 4) {
      const crest = CEIL_Y - 0.28;
      ring(kit.lit, R, 0.17, [0, crest - R, z], 0x4a2222, [0, 0, Math.PI / 2 - arc / 2], arc, [1, 1, 1.5], 8, 40);
      ring(kit.deco, R - 0.17, 0.05, [0, crest - R, z], C.GOLD, [0, 0, Math.PI / 2 - arc / 2], arc, [1, 1, 1.2], 6, 40);
      for (const s of [-1, 1]) ball(kit.lit, [0.26, 0.3, 0.3], [s * (HALL_HALF - 0.2), crest - rise + 0.05, z], C.GOLD, undefined, 12, 8);
    }
    // Long ridge purlins tie the arches together.
    for (const x of [-4.4, 0, 4.4]) tube(kit.lit, [[x, CEIL_Y - 0.5 - (x === 0 ? 0 : 0.1), Z.facade - 0.4], [x, CEIL_Y - 0.5 - (x === 0 ? 0 : 0.1), Z.hallBack + 0.4]], 0.1, 0x5a2a2a, 1, 8);
    // Wooden floor: planks of varied warm tones with staggered joints and thin dark gaps.
    kit.lit.box([HALL_HALF * 2, 0.04, HALL_LEN], [0, 0.02, HALL_MID], 0x3d2a22);
    {
      const tones = [0x7a5240, 0x6f4a3a, 0x84583f, 0x694434, 0x7d5a45, 0x73503c];
      const pw = 0.37;
      const n = Math.floor((HALL_HALF * 2) / pw);
      for (let i = 0; i < n; i++) {
        const x = -HALL_HALF + pw * (i + 0.5);
        const cut = Z.facade - 3 - ((i * 7) % 11) * 1.1; // staggered joint
        const segs: [number, number][] = [[Z.facade, cut], [cut, Z.hallBack]];
        segs.forEach(([z0, z1], k) => {
          const c = tones[(i * 5 + k * 3 + (i % 3)) % tones.length];
          kit.lit.box([pw - 0.025, 0.05, Math.abs(z0 - z1) - 0.03], [x, 0.025, (z0 + z1) / 2], c);
        });
      }
    }
    rbox(kit.lit, [2.8, 0.07, HALL_LEN], [0, 0.04, HALL_MID], 0xb83a2e, 0.03, undefined, 1);
    for (const s of [-1, 1]) rbox(kit.lit, [0.12, 0.08, HALL_LEN], [s * 1.5, 0.046, HALL_MID], C.GOLD, 0.03, undefined, 1);
    // Gold wall trims.
    for (const s of [-1, 1]) {
      rbox(kit.lit, [0.12, 0.25, HALL_LEN], [s * (HALL_HALF - 0.02), 1.0, HALL_MID], C.GOLD, 0.05, undefined, 2);
      rbox(kit.lit, [0.12, 0.14, HALL_LEN], [s * (HALL_HALF - 0.02), 3.2, HALL_MID], C.GOLD, 0.05, undefined, 2);
      // Wainscot: warm timber panel under the gold rail.
      rbox(kit.deco, [0.1, 0.78, HALL_LEN - 0.4], [s * (HALL_HALF - 0.04), 0.55, HALL_MID], 0x7a3d2b, 0.04, undefined, 1);
    }

    // --- Pillars, drums, crates, the cute costume head ---
    for (const px of [-4.3, 4.3]) {
      for (const pz of [-47, -53]) {
        kit.physics.addFixedCylinder(2.1, 0.45, { x: px, y: 2.1, z: pz });
        column(kit.lit, px, pz, 0, 4.2, 0.42, C.RED, C.GOLD, 20);
      }
    }
    const drum = (x: number, z: number, r: number): void => {
      kit.physics.addFixedCylinder(0.45, r, { x, y: 0.45, z });
      // Barrel body with a belly, cream skins top and a gold rim; short wooden cradle feet underneath.
      lathe(kit.lit, [[0.001, 0.08], [r * 0.86, 0.08], [r * 0.98, 0.16], [r * 1.1, 0.45], [r * 0.98, 0.74], [r * 0.9, 0.84], [0.001, 0.84]], [x, 0, z], C.RED, undefined, undefined, 24);
      lathe(kit.lit, [[0.001, 0], [r * 0.9, 0.0], [r * 0.93, 0.03], [0.001, 0.05]], [x, 0.85, z], C.CREAM, undefined, undefined, 24);
      ring(kit.lit, r * 0.92, 0.035, [x, 0.84, z], C.GOLD, [Math.PI / 2, 0, 0], Math.PI * 2, undefined, 6, 24);
      ring(kit.lit, r * 0.9, 0.035, [x, 0.12, z], C.GOLD, [Math.PI / 2, 0, 0], Math.PI * 2, undefined, 6, 24);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ball(kit.deco, [0.035, 0.035, 0.035], [x + Math.cos(a) * r * 1.09, 0.45, z + Math.sin(a) * r * 1.09], C.GOLD, undefined, 8, 6);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        rbox(kit.lit, [0.16, 0.1, r * 0.7], [x + Math.cos(a) * r * 0.65, 0.05, z + Math.sin(a) * r * 0.65], 0x5a3b2a, 0.04, [0, -a, 0], 1);
      }
    };
    drum(-6.2, -45.5, 0.6);
    drum(-5.9, -47.1, 0.45);
    drum(6.1, -56.2, 0.6);
    const crate = (x: number, z: number, s: number, c: number): void => {
      kit.collider([s, s, s], [x, s / 2, z]);
      rbox(kit.lit, [s, s, s], [x, s / 2, z], c, 0.07, undefined, 2);
      rbox(kit.lit, [s + 0.03, 0.08, s + 0.03], [x, s * 0.5, z], 0x6b4a2f, 0.03, undefined, 1);
    };
    crate(6.2, -44.8, 1.0, 0xb98450);
    crate(6.2, -46.0, 1.0, 0xa97545);
    crate(6.2, -45.3, 0.8, C.GOLD);
    crate(-6.1, -55.6, 1.1, 0xb98450);
    crate(-4.9, -56.2, 0.8, 0xa97545);
    this.costumeHead(kit, 5.5, -50.5);

    // Round red paper lanterns with gold caps and tassels, each throwing a soft warm pool of light on the floor.
    for (const lx of [-3.2, 3.2]) {
      for (const lz of [-45, -50, -55]) {
        const ly = CEIL_Y - 1.15;
        kit.lit.cyl(0.02, 0.9, [lx, CEIL_Y - 0.45, lz], C.GOLD);
        lathe(kit.glow, [[0.001, -0.33], [0.14, -0.31], [0.3, -0.18], [0.35, 0], [0.3, 0.18], [0.14, 0.31], [0.001, 0.33]], [lx, ly, lz], 0xff7a3d, undefined, undefined, 20);
        for (const dy of [-0.14, 0, 0.14]) ring(kit.deco, 0.3 + (dy === 0 ? 0.06 : 0), 0.012, [lx, ly + dy * 1.2, lz], 0xb02e22, [Math.PI / 2, 0, 0], Math.PI * 2, undefined, 5, 20);
        lathe(kit.lit, [[0.001, 0], [0.16, 0], [0.19, 0.05], [0.14, 0.1], [0.001, 0.1]], [lx, ly + 0.31, lz], C.GOLD, undefined, undefined, 14);
        lathe(kit.lit, [[0.001, 0], [0.14, 0], [0.19, 0.05], [0.16, 0.1], [0.001, 0.1]], [lx, ly - 0.41, lz], C.GOLD, undefined, undefined, 14);
        // Tassel: gold knot, a plump red head and a skirt of soft strands.
        ball(kit.lit, [0.05, 0.05, 0.05], [lx, ly - 0.47, lz], C.GOLD, undefined, 8, 6);
        ball(kit.lit, [0.07, 0.12, 0.07], [lx, ly - 0.6, lz], C.RED, undefined, 10, 7);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ball(kit.deco, [0.02, 0.15, 0.02], [lx + Math.cos(a) * 0.045, ly - 0.82, lz + Math.sin(a) * 0.045], k % 2 ? C.RED : C.GOLD, [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12], 6, 5);
        }
        sparkles.addEmitter(lx, CEIL_Y - 1.9, lz, 0.3, 1.2, 0xffc27a);
      }
    }
    // Warm pools of light on the floor and drifting dust motes in the beams.
    const hallRoot = ctx.root;
    for (const lx of [-3.2, 3.2]) for (const lz of [-45, -50, -55]) softPool(hallRoot, lx, 0.075, lz, 2.6, [0.34, 0.19, 0.05]);
    softPool(hallRoot, 5.5, 0.075, -50.5, 2.0, [0.3, 0.17, 0.05]);
    sparkles.addEmitter(0, 2.2, -48, 5.5, 3, 0xffe2a0);
    sparkles.addEmitter(0, 2.2, -54, 5.5, 3, 0xffe2a0);
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
    // Wooden stand (rounded, with a flared foot) carrying the shared Barongsai head, looking toward the hall's middle (-X).
    kit.physics.addFixedCylinder(0.65, 0.1, { x, y: 0.65, z });
    kit.physics.addFixedCylinder(0.06, 0.5, { x, y: 0.06, z });
    lathe(kit.lit, [[0.001, 0], [0.5, 0], [0.52, 0.06], [0.3, 0.12], [0.12, 0.25], [0.09, 1.2], [0.16, 1.3], [0.001, 1.32]], [x, 0, z], 0x6b4a2f, undefined, undefined, 20);
    ring(kit.lit, 0.15, 0.03, [x, 1.28, z], C.GOLD, [Math.PI / 2, 0, 0], Math.PI * 2, undefined, 6, 18);
    buildLionHead({ batch: kit.lit, pos: [x, 1.95, z], yaw: -Math.PI / 2, scale: 1.0 });
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
