import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { ColorBatch } from './Batch';
import { Kit, C, basic } from './Kit';
import { Z, LAB, LAB_FLOOR, DOOR_HALF } from './Layout';
import type { Sparkles } from './Fx';

const F = LAB_FLOOR;
const WALL_C = 0xe8f0fa;
const NAVY = 0x10203a;

interface Screen {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const SCREENS: readonly Screen[] = [
  { x: -6.93, y: 2.4, z: -65.5, yaw: Math.PI / 2 },
  { x: -6.93, y: 2.4, z: -74.5, yaw: Math.PI / 2 },
  { x: 6.93, y: 2.4, z: -65.5, yaw: -Math.PI / 2 },
  { x: 6.93, y: 2.4, z: -70.5, yaw: -Math.PI / 2 },
  { x: 6.93, y: 2.4, z: -75, yaw: -Math.PI / 2 },
  { x: -5.6, y: 2.4, z: -75.95, yaw: 0 },
  { x: 5.6, y: 2.4, z: -75.95, yaw: 0 },
];
const BARS_PER_SCREEN = 5;

/**
 * The laboratory: bright clean blue-gold tech room, the Barongsai-head computer with its big button, Nino's
 * platform, the costume compartment and the practice poles. Everything animated is driven by small setters
 * that the story calls; `update` only does cheap per-frame shimmer.
 */
export class Lab {
  // Visible state for tests/story.
  readonly nino = new THREE.Group();
  readonly costume = new THREE.Group();
  readonly ninoPos = new THREE.Vector3(LAB.nino.x, F + 0.25, LAB.nino.z);
  readonly costumePos = new THREE.Vector3(LAB.costume.x, F + 0.25, LAB.costume.z);
  readonly buttonPos = new THREE.Vector3(LAB.button.x, F + 0.85, LAB.button.z);
  readonly headFront = new THREE.Vector3(0, F + 2.2, LAB.head.z + 1.4);

  private readonly floorGlow: THREE.MeshBasicMaterial;
  private readonly eyeMat: THREE.MeshBasicMaterial;
  private readonly gemMat: THREE.MeshBasicMaterial;
  private readonly sweepMat: THREE.MeshBasicMaterial;
  private readonly sweepMesh: THREE.Mesh;
  private readonly bars: THREE.InstancedMesh;
  private readonly barData: { sx: number; sy: number; sz: number; w: number; h: number; q: THREE.Quaternion; phase: number }[] = [];
  private readonly button: THREE.Mesh;
  private readonly buttonMat: THREE.MeshStandardMaterial;
  private readonly compartment: THREE.Mesh;
  private readonly light: THREE.Mesh;
  private readonly lightMat: THREE.MeshBasicMaterial;
  private readonly spill: THREE.Mesh;
  private readonly spillMat: THREE.MeshBasicMaterial;
  private readonly ninoGlow: THREE.Mesh;
  private readonly costumeBody: THREE.Group;
  private readonly belt: THREE.Mesh;
  private readonly beltMat: THREE.MeshStandardMaterial;
  private readonly coinMesh: THREE.Mesh[] = [];
  private readonly coinOn: boolean[] = [];
  private readonly coinEmitters: ReturnType<Sparkles['addEmitter']>[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private time = 0;

  boot = 0; // 0 dark .. 1 fully running
  chaos = 0; // 0..1 funny ending: everything blinks
  private costumeRise = 0;
  private compartmentOpen = 0;

  constructor(
    ctx: LevelContext,
    kit: Kit,
    private readonly sparkles: Sparkles,
  ) {
    const root = ctx.root;
    // --- Floor, walls, trim ---
    kit.lit.box([14.8, 0.1, 14.8], [0, F - 0.05, (Z.labFront + Z.labBack) / 2], 0xdfe9f6);
    const midZ = (Z.labFront + Z.labBack) / 2;
    const len = Z.labFront - Z.labBack + 1.2;
    for (const s of [-1, 1]) {
      kit.solid([0.6, 6.5, len], [s * 7.3, F + 3.2, midZ - 0.3], WALL_C);
      kit.lit.box([0.1, 0.3, len], [s * 6.97, F + 1.0, midZ - 0.3], C.GOLD);
      kit.lit.box([0.1, 0.12, len], [s * 6.97, F + 4.3, midZ - 0.3], C.GOLD);
      kit.glow.box([0.08, 0.12, len], [s * 6.95, F + 4.6, midZ - 0.3], 0x6ff4ff);
    }
    kit.solid([15.2, 6.5, 0.6], [0, F + 3.2, Z.labBack - 0.3], WALL_C);
    kit.lit.box([15, 0.3, 0.1], [0, F + 1.0, Z.labBack + 0.03], C.GOLD);
    kit.glow.box([14.6, 0.12, 0.08], [0, F + 4.6, Z.labBack + 0.05], 0x6ff4ff);
    for (const s of [-1, 1]) {
      const w = 7.3 - DOOR_HALF - 0.3;
      kit.solid([w, 6.5, 0.6], [s * (DOOR_HALF + 0.3 + w / 2 + 0.05), F + 3.2, Z.labFront - 0.3], WALL_C);
      kit.lit.box([w, 0.3, 0.1], [s * (DOOR_HALF + 0.3 + w / 2), F + 1.0, Z.labFront + 0.03], C.GOLD);
      kit.glow.box([w, 0.12, 0.08], [s * (DOOR_HALF + 0.3 + w / 2), F + 4.6, Z.labFront + 0.05], 0x6ff4ff);
    }
    // Slim pillars with gold caps along the side walls for rhythm.
    for (const s of [-1, 1]) for (const z of [-64, -68, -72]) {
      kit.lit.box([0.35, 4.8, 0.5], [s * 6.9, F + 2.4, z], 0xcfdcf0);
      kit.lit.box([0.4, 0.2, 0.55], [s * 6.9, F + 4.85, z], C.GOLD);
    }

    // --- Glowing floor lines (their own material: brightness follows the boot-up) ---
    this.floorGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const fl = new ColorBatch(this.floorGlow, false, false);
    const y = F + 0.012;
    fl.box([0.18, 0.02, 12.2], [0, y, midZ - 0.5], 0x2ec4b6);
    for (const s of [-1, 1]) {
      fl.box([0.1, 0.02, 12.8], [s * 2.6, y, midZ - 0.2], 0xffc94d);
      fl.box([0.1, 0.02, 12.8], [s * 6.4, y, midZ - 0.2], 0x2ec4b6);
    }
    for (const zz of [-64.3, -67.5, -72.6]) fl.box([12.8, 0.02, 0.1], [0, y, zz], zz === -67.5 ? 0xffc94d : 0x2ec4b6);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      fl.box([0.24, 0.02, 0.55], [LAB.button.x + Math.cos(a) * 1.5, y + 0.002, LAB.button.z + Math.sin(a) * 1.5], 0xffc94d, [0, -a, 0]);
    }
    fl.build(root);
    this.floorGlow.color.setRGB(0.3, 0.34, 0.4);

    // --- Wall screens with animated bars ---
    for (const s of SCREENS) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.yaw, 0));
      kit.lit.box(s.yaw === 0 ? [3.4, 2.2, 0.12] : [0.12, 2.2, 3.4], [s.x, s.y, s.z], C.GOLD);
      kit.glow.box(s.yaw === 0 ? [3.1, 1.9, 0.14] : [0.14, 1.9, 3.1], [s.x, s.y, s.z], NAVY);
      for (let i = 0; i < BARS_PER_SCREEN; i++) {
        const lx = -1.1 + i * 0.55; // local x on the screen
        const off = new THREE.Vector3(lx, -0.8, 0.09).applyQuaternion(q);
        this.barData.push({ sx: s.x + off.x, sy: s.y + off.y, sz: s.z + off.z, w: 0.34, h: 1.5, q, phase: this.barData.length * 1.7 });
      }
    }
    const barGeo = new THREE.BoxGeometry(1, 1, 1);
    this.bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), this.barData.length);
    for (let i = 0; i < this.barData.length; i++) this.bars.setColorAt(i, this.col.setHex(i % 2 === 0 ? 0x2ec4b6 : 0xffc94d));
    this.bars.frustumCulled = false;
    root.add(this.bars);

    // --- The Barongsai-head computer ---
    this.eyeMat = basic(0x0c2a33);
    this.gemMat = basic(0x2ec4b6);
    const hz = LAB.head.z;
    const fz = hz + 1.25; // front of the face
    kit.collider([4.6, 3.8, 2.8], [0, F + 1.9, hz - 0.1]);
    kit.lit.box([4.4, 1.0, 2.6], [0, F + 0.5, hz], C.CREAM); // console base
    kit.lit.box([4.5, 0.14, 2.7], [0, F + 1.0, hz], C.GOLD);
    kit.lit.box([3.2, 0.5, 0.6], [0, F + 0.85, hz + 1.5], 0x2b3548); // keyboard shelf
    kit.glow.box([2.8, 0.04, 0.4], [0, F + 1.12, hz + 1.5], 0x6ff4ff);
    kit.lit.sph(1, [0, F + 2.3, hz - 0.1], C.RED, [2.3, 1.45, 1.4]); // the head
    kit.lit.sph(1, [0, F + 2.4, hz - 0.6], C.ORANGE, [2.9, 1.9, 0.9]); // mane behind
    for (let i = -4; i <= 4; i++) {
      kit.lit.box([0.5, 0.6, 0.5], [i * 0.5, F + 3.75 - Math.abs(i) * 0.1, hz - 0.2], C.CREAM, [0.3, 0, i * 0.12]); // fur trim blocks
    }
    for (const s of [-1, 1]) {
      kit.lit.sph(0.55, [s * 2.0, F + 3.55, hz - 0.2], C.RED); // ears
      kit.lit.sph(0.32, [s * 2.0, F + 3.55, hz + 0.1], C.GOLD);
      kit.lit.sph(0.55, [s * 1.85, F + 1.75, hz + 0.45], C.GOLD, [1, 0.8, 0.8]); // cheeks
      for (let k = 0; k < 4; k++) kit.lit.box([0.35, 0.22, 0.3], [s * (1.3 + k * 0.3), F + 1.25 - k * 0.12, hz + 0.9], C.CREAM, [0, 0, s * 0.2]); // side fur
      // Eye frames (the eyes themselves are screens, below).
      kit.lit.box([1.25, 1.2, 0.16], [s * 0.85, F + 2.45, fz - 0.2], C.GOLD);
    }
    kit.lit.add('cone', [0, F + 4.0, hz - 0.1], [0.28, 0.8, 0.28], C.GOLD); // horn
    kit.lit.sph(0.3, [0, F + 3.28, fz - 0.25], C.GOLD); // gem setting
    kit.lit.sph(0.3, [0, F + 1.95, fz - 0.15], C.GOLD, [1.1, 0.9, 0.9]); // nose
    kit.lit.box([1.9, 0.36, 0.3], [0, F + 1.42, fz - 0.2], 0x3a1a1a); // mouth slot
    for (let k = -2; k <= 2; k++) kit.lit.box([0.26, 0.2, 0.2], [k * 0.36, F + 1.52, fz - 0.05], C.CREAM);
    kit.lit.box([1.3, 0.5, 0.4], [0, F + 1.0, fz - 0.4], C.CREAM, [0.2, 0, 0]); // beard
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.0), this.eyeMat);
      eye.position.set(s * 0.85, F + 2.45, fz - 0.11);
      root.add(eye);
      kit.glow.sph(0.2, [s * 0.85 + s * 0.05, F + 2.42, fz - 0.1], 0x04141a, [1, 1.2, 0.2]);
      kit.glow.sph(0.06, [s * 0.85 + s * 0.05 - 0.07, F + 2.52, fz - 0.08], 0xffffff);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), this.gemMat);
    gem.position.set(0, F + 3.28, fz - 0.05);
    gem.scale.set(0.9, 1.3, 0.7);
    root.add(gem);

    // --- Pedestal and the big button ---
    kit.solidCyl(0.55, 0.75, [LAB.button.x, F + 0.375, LAB.button.z], C.CREAM);
    kit.lit.cyl(0.62, 0.1, [LAB.button.x, F + 0.05, LAB.button.z], C.GOLD);
    kit.lit.cyl(0.6, 0.08, [LAB.button.x, F + 0.74, LAB.button.z], C.GOLD);
    this.buttonMat = new THREE.MeshStandardMaterial({ color: 0xe8352b, emissive: 0xff2a1a, emissiveIntensity: 0.6, roughness: 0.35 });
    this.button = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.2, 24), this.buttonMat);
    this.button.position.set(LAB.button.x, F + 0.88, LAB.button.z);
    this.button.castShadow = true;
    root.add(this.button);

    // --- Nino's platform and the costume stand ---
    for (const p of [LAB.nino, LAB.costume]) {
      kit.solidCyl(1.1, 0.25, [p.x, F + 0.125, p.z], C.CREAM);
      kit.glow.add('cyl', [p.x, F + 0.26, p.z], [0.95, 0.03, 0.95], 0x6ff4ff);
      kit.lit.add('cyl', [p.x, F + 0.275, p.z], [0.8, 0.03, 0.8], 0xdfe9f6);
    }

    // --- Costume compartment in the left wall ---
    const cz = LAB.costume.z;
    this.lightMat = basic(0xfff0b0);
    this.light = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), this.lightMat);
    this.light.rotation.y = Math.PI / 2;
    this.light.position.set(-6.94, F + 1.7, cz);
    root.add(this.light);
    this.compartment = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 3.0, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.5, metalness: 0.2 }),
    );
    this.compartment.position.set(-6.88, F + 1.7, cz);
    root.add(this.compartment);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 2.3), new THREE.MeshStandardMaterial({ color: C.GOLD }));
    trim.position.set(-0.01, 0.9, 0);
    this.compartment.add(trim);
    const trim2 = trim.clone();
    trim2.position.y = -0.9;
    this.compartment.add(trim2);
    kit.lit.box([0.18, 3.3, 0.18], [-6.9, F + 1.7, cz - 1.35], C.GOLD);
    kit.lit.box([0.18, 3.3, 0.18], [-6.9, F + 1.7, cz + 1.35], C.GOLD);
    kit.lit.box([0.18, 0.18, 2.9], [-6.9, F + 3.4, cz], C.GOLD);
    // Pool of light on the floor in front of it.
    const sg = new THREE.PlaneGeometry(5.2, 3.4);
    sg.rotateX(-Math.PI / 2);
    const pa = sg.getAttribute('position');
    const sc = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const f = Math.max(0, 1 - (pa.getX(i) + 2.6) / 5.2); // bright at the wall side (x = -2.6), black far away
      const e = Math.max(0, 1 - Math.abs(pa.getZ(i)) / 1.7);
      sc[i * 3] = f * e * 0.9;
      sc[i * 3 + 1] = f * e * 0.8;
      sc[i * 3 + 2] = f * e * 0.4;
    }
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    this.spillMat = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    this.spill = new THREE.Mesh(sg, this.spillMat);
    this.spill.position.set(-6.9 + 2.6, F + 0.03, cz);
    this.spill.visible = false;
    root.add(this.spill);

    // --- Light sweep (boot-up) ---
    const swg = new THREE.PlaneGeometry(14.2, 2.2);
    swg.rotateX(-Math.PI / 2);
    const sp = swg.getAttribute('position');
    const swc = new Float32Array(sp.count * 3);
    for (let i = 0; i < sp.count; i++) {
      const f = Math.max(0, 1 - Math.abs(sp.getZ(i)) / 1.1);
      swc[i * 3] = f * 0.25;
      swc[i * 3 + 1] = f * 0.9;
      swc[i * 3 + 2] = f * 0.9;
    }
    swg.setAttribute('color', new THREE.BufferAttribute(swc, 3));
    this.sweepMat = new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    this.sweepMesh = new THREE.Mesh(swg, this.sweepMat);
    this.sweepMesh.position.set(0, F + 0.05, hz);
    this.sweepMesh.visible = false;
    root.add(this.sweepMesh);

    // --- Nino ---
    const nBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.4, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x4dabf7, emissive: 0x2a74c8, emissiveIntensity: 0.7, roughness: 0.4 }),
    );
    nBody.position.y = 0.48;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x0b2a4a });
    const eyeG = new THREE.SphereGeometry(0.05, 8, 6);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(eyeG, eyeM);
      e.position.set(sx * 0.1, 0.62, 0.25);
      this.nino.add(e);
    }
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.05), new THREE.MeshStandardMaterial({ color: 0x2f6fd6, emissive: 0x1a4fa8, emissiveIntensity: 0.4 }));
    cape.position.set(0, 0.4, -0.3);
    cape.rotation.x = 0.25;
    const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc94d }));
    clasp.position.set(0, 0.7, -0.16);
    this.ninoGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.ninoGlow.position.y = 0.5;
    this.nino.add(nBody, cape, clasp, this.ninoGlow);
    this.nino.position.copy(this.ninoPos);
    this.nino.rotation.y = Math.atan2(-this.ninoPos.x, 7);
    this.nino.visible = false;
    root.add(this.nino);

    // --- Costume (red suit with a golden belt, floating over its stand) ---
    this.costumeBody = new THREE.Group();
    const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.46, 6, 16), new THREE.MeshStandardMaterial({ color: 0xe02b20, roughness: 0.5, emissive: 0x500a06, emissiveIntensity: 0.4 }));
    this.beltMat = new THREE.MeshStandardMaterial({ color: C.GOLD, roughness: 0.35, metalness: 0.2, emissive: 0x6b4a00, emissiveIntensity: 0.6 });
    this.belt = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 8, 24), this.beltMat);
    this.belt.rotation.x = Math.PI / 2;
    this.belt.position.y = -0.08;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), new THREE.MeshStandardMaterial({ color: C.CREAM }));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.32;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), basic(0xffd23f));
    star.position.set(0, 0.12, 0.31);
    star.scale.z = 0.4;
    this.costumeBody.add(suit, this.belt, collar, star);
    this.costume.add(this.costumeBody);
    this.costume.position.copy(this.costumePos);
    this.costume.visible = false;
    root.add(this.costume);

    // --- Practice poles with gold coins ---
    const poleColors = [C.RED, C.TEAL, C.ORANGE, C.PINK];
    const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 20);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xc88a00, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.4 });
    LAB.poles.forEach((p, i) => {
      kit.solidCyl(LAB.poleRadius, p.h, [p.x, F + p.h / 2, p.z], poleColors[i]);
      kit.lit.cyl(LAB.poleRadius + 0.05, 0.12, [p.x, F + p.h - 0.05, p.z], C.GOLD);
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.position.set(p.x, F + p.h + 0.95, p.z);
      coin.visible = false;
      root.add(coin);
      this.coinMesh.push(coin);
      this.coinOn.push(false);
      const em = sparkles.addEmitter(p.x, F + p.h + 0.6, p.z, 0.3, 4, 0xffd23f);
      em.on = false;
      this.coinEmitters.push(em);
    });
  }

  // ---- story setters -------------------------------------------------------------------------

  setBoot(v: number): void {
    this.boot = v;
    this.eyeMat.color.setRGB(0.05 + 0.4 * v, 0.16 + 0.88 * v, 0.2 + 0.95 * v);
    const g = 0.3 + 0.7 * v;
    this.floorGlow.color.setRGB(g, g, g);
  }

  setSweep(t: number): void {
    this.sweepMesh.visible = t > 0 && t < 1;
    this.sweepMesh.position.z = LAB.head.z + 1.5 + (Z.labFront - LAB.head.z - 1.5) * t;
    this.sweepMat.opacity = 1 - 0.5 * t;
  }

  setButtonPressed(t: number): void {
    this.button.position.y = F + 0.88 - 0.1 * t;
    this.buttonMat.emissiveIntensity = 0.6 + 1.6 * t;
  }

  setNinoVisible(scale: number): void {
    this.nino.visible = scale > 0.001;
    this.nino.scale.setScalar(Math.max(0.001, scale));
  }

  setCompartment(t: number): void {
    this.compartmentOpen = t;
    this.compartment.position.y = F + 1.7 + 3.1 * t;
    this.compartment.visible = t < 0.999;
    this.spill.visible = t > 0.02;
    this.spillMat.opacity = Math.min(1, t * 2);
    this.spill.scale.set(0.3 + 0.7 * t, 1, 1);
    this.spill.position.x = -6.9 + 2.6 * (0.3 + 0.7 * t);
  }

  setCostumeRise(t: number): void {
    this.costumeRise = t;
    this.costume.visible = t > 0.001;
    this.costumeBody.scale.setScalar(Math.max(0.2, t));
  }

  hideCostume(): void {
    this.costume.visible = false;
  }

  /** Funny ending: rainbow belt on the *player's* overlay is handled by the story; this blinks Nino/screens. */
  setChaos(v: number): void {
    this.chaos = v;
  }

  showCoins(): void {
    for (let i = 0; i < this.coinMesh.length; i++) {
      this.coinOn[i] = true;
      this.coinMesh[i].visible = true;
      this.coinEmitters[i].on = true;
      const p = LAB.poles[i];
      this.sparkles.burst(p.x, F + p.h + 0.95, p.z, 14, 2, 0xffd23f, { gravity: 1 });
    }
  }

  /** Collect coins near the player; returns how many were taken this call. */
  collect(px: number, py: number, pz: number): number {
    let n = 0;
    for (let i = 0; i < this.coinMesh.length; i++) {
      if (!this.coinOn[i]) continue;
      const c = this.coinMesh[i].position;
      if (Math.hypot(c.x - px, c.z - pz) < 0.9 && Math.abs(c.y - py) < 1.3) {
        this.coinOn[i] = false;
        this.coinMesh[i].visible = false;
        this.coinEmitters[i].on = false;
        this.sparkles.burst(c.x, c.y, c.z, 22, 3, 0xffd23f, { gravity: 2, life: 0.9 });
        n++;
      }
    }
    return n;
  }

  get coinsLeft(): number {
    return this.coinOn.filter(Boolean).length;
  }

  /** Where the first coin hangs (objective for free play). */
  coinPosition(i: number): THREE.Vector3 {
    const p = LAB.poles[i];
    return new THREE.Vector3(p.x, F + p.h, p.z);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    // Bars: idle trickle, lively after boot, frantic in the funny ending.
    const speed = 1.5 + 4 * this.boot + 10 * this.chaos;
    const amp = 0.12 + 0.88 * this.boot;
    for (let i = 0; i < this.barData.length; i++) {
      const b = this.barData[i];
      const v = 0.5 + 0.5 * Math.sin(t * speed + b.phase);
      const h = Math.max(0.05, b.h * Math.min(1, amp * (0.25 + 0.75 * v)));
      this.pos.set(b.sx, b.sy + h / 2 - 0.0, b.sz);
      this.scl.set(b.w, h, 0.05);
      if (Math.abs(b.q.y) > 0.5) this.scl.set(0.05, h, b.w); // screens on the side walls
      this.m4.compose(this.pos, IDENTITY_Q, this.scl);
      this.bars.setMatrixAt(i, this.m4);
    }
    this.bars.instanceMatrix.needsUpdate = true;
    // Head details.
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    this.gemMat.color.setRGB(0.1 + 0.2 * pulse, 0.6 + 0.4 * pulse, 0.55 + 0.4 * pulse);
    if (this.chaos > 0.01 && Math.sin(t * 22) > 0) this.eyeMat.color.setRGB(1, 0.85, 0.3);
    else if (this.chaos > 0.01) this.eyeMat.color.setRGB(0.3, 1, 1);
    this.buttonMat.emissiveIntensity = Math.max(this.buttonMat.emissiveIntensity, 0.4 + 0.3 * pulse);
    // Nino hovers; costume floats and turns.
    if (this.nino.visible) {
      this.nino.position.y = this.ninoPos.y + 0.12 + 0.06 * Math.sin(t * 2.2);
      this.ninoGlow.scale.setScalar(1 + 0.08 * Math.sin(t * 3) + 0.25 * this.chaos * Math.sin(t * 25));
    }
    if (this.costume.visible) {
      this.costume.position.y = this.costumePos.y + 0.2 + 1.0 * this.costumeRise + 0.07 * Math.sin(t * 2);
      this.costume.rotation.y = t * 0.9;
    }
    for (let i = 0; i < this.coinMesh.length; i++) {
      if (!this.coinOn[i]) continue;
      this.coinMesh[i].rotation.y = t * 2.5;
      this.coinMesh[i].position.y = F + LAB.poles[i].h + 0.95 + 0.08 * Math.sin(t * 2 + i);
    }
    void this.compartmentOpen;
  }
}

const IDENTITY_Q = new THREE.Quaternion();
