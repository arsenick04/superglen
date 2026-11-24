import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { ColorBatch } from './Batch';
import { buildLionHead } from './LionHead';
import { rbox, ball, ring, tube, column, lathe, softPool } from './Round';
import { Kit, C, basic } from './Kit';
import { Z, LAB, LAB_FLOOR, DOOR_HALF } from './Layout';
import type { Sparkles } from './Fx';
import { addRoofBox } from '../kits/Roofs';
import { figureMaterial } from '../../player/Figure';
import { Avatar, type AvatarState } from '../../player/CharacterModels';

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

/** Abstract costume energy kept in the cabinet; the old mannequin-like suit was intentionally removed. */
function makeCostumeDisplay(ctx: LevelContext): THREE.Group {
  const group = new THREE.Group();
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xff3328, emissive: 0xff160d, emissiveIntensity: 2.4, roughness: 0.18 });
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xff5a32, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const goldMat = new THREE.MeshStandardMaterial({ color: C.GOLD, emissive: 0x7a3c00, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.45 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 1), coreMat);
  core.scale.set(0.82, 1.35, 0.82);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.68, 16, 12), haloMat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.045, 8, 32), goldMat);
  ring.rotation.x = Math.PI / 2;
  group.add(halo, core, ring);
  group.position.y = 0.72;
  ctx.onDispose(() => {
    group.traverse((obj) => { if (obj instanceof THREE.Mesh) obj.geometry.dispose(); });
    coreMat.dispose();
    haloMat.dispose();
    goldMat.dispose();
  });
  return group;
}

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
  private readonly ninoFig: Avatar;
  private lastDt = 0;
  private readonly ninoSt: AvatarState = { speed: 0, airborne: false, vy: 0, flying: true, riding: false, talking: false };
  private readonly dialog: LevelContext['dialog'];
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
    kit.lit.box([14.8, 0.1, 14.8], [0, F - 0.06, (Z.labFront + Z.labBack) / 2], 0x7d8aa0); // dark seams under the rubber tiles
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
    // Lintel over the entrance and a flat roof on the walls: nobody who reaches the roofs can drop into the lab through the
    // open top or over the corridor before the story opens the way. The roof is a real walkable top (and a ravine
    // surrounds the building, see Bab1Level).
    const entryW = (DOOR_HALF + 0.3 + 0.05) * 2;
    kit.solid([entryW, 3.0, 0.6], [0, 4.95, Z.labFront - 0.3], WALL_C);
    const lidZ0 = Z.labFront + 0.3;
    const lidZ1 = Z.labBack - 0.6;
    addRoofBox(kit, { id: 'labRoof', size: [15.2, 0.3, lidZ0 - lidZ1], pos: [0, F + 6.45 + 0.15, (lidZ0 + lidZ1) / 2], color: 0xdfe9f6 });
    // Round pillars with gold capitals along the side walls for rhythm.
    for (const s of [-1, 1]) for (const z of [-64, -68, -72]) column(kit.lit, s * 6.7, z, F, 4.9, 0.27, 0xd3deef, C.GOLD, 16);
    // Warm timber ribs and plaster panels tie the technology back to the old Barongsai building.
    for (const s of [-1, 1]) {
      kit.lit.box([0.22, 5.7, len - 0.5], [s * 7.0, F + 2.85, midZ - 0.3], 0x8b5131);
      for (const z of [-62.3, -66.2, -70.1, -74.0]) {
        kit.deco.box([0.28, 5.6, 0.3], [s * 6.82, F + 2.8, z], 0x6f3c27);
        kit.deco.box([0.32, 0.28, 3.55], [s * 6.8, F + 5.5, z + 1.72], C.GOLD);
      }
    }
    for (const x of [-5.2, 0, 5.2]) {
      kit.lit.box([0.34, 0.34, len - 0.7], [x, F + 6.18, midZ - 0.3], 0x7a442c);
      kit.deco.box([0.24, 0.12, len - 1.1], [x, F + 5.98, midZ - 0.3], C.GOLD);
    }

    // A few rounded, warm details break up the rectangular shell without adding textures
    // or separate model files. They stay in the existing batches, so the render cost is tiny.
    for (const s of [-1, 1]) for (const z of [-66.1, -72.1]) {
      kit.deco.sph(0.42, [s * 6.62, F + 3.55, z], C.RED, [0.72, 1.05, 0.72]);
      kit.deco.cyl(0.22, 0.14, [s * 6.62, F + 4.02, z], C.GOLD);
      kit.deco.cyl(0.24, 0.12, [s * 6.62, F + 3.08, z], C.GOLD);
      kit.glow.sph(0.18, [s * 6.55, F + 3.55, z], 0xff5a32, [0.8, 1.2, 0.8]);
    }
    // Gold fan arch above the main Barongsai console: a strong curved silhouette made
    // from only seven small batched pieces.
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.18 + 0.64 * (i / 6));
      kit.deco.box(
        [0.16, 0.6, 0.12],
        [Math.cos(a) * 3.15, F + 3.7 + Math.sin(a) * 1.35, Z.labBack + 0.07],
        C.GOLD,
        [0, 0, a - Math.PI / 2],
      );
    }
    // A restrained red runner visually leads from the entrance toward the console.
    kit.deco.box([1.8, 0.018, 7.5], [0, F + 0.012, midZ + 1.45], 0xb52d28);
    kit.deco.box([0.1, 0.022, 7.6], [-0.96, F + 0.014, midZ + 1.45], C.GOLD);
    kit.deco.box([0.1, 0.022, 7.6], [0.96, F + 0.014, midZ + 1.45], C.GOLD);

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
    kit.lit.box([4.4, 1.0, 2.6], [0, F + 0.5, hz], C.CREAM); // console base
    kit.lit.box([4.5, 0.14, 2.7], [0, F + 1.0, hz], C.GOLD);
    kit.lit.box([3.2, 0.5, 0.6], [0, F + 0.85, hz + 1.5], 0x2b3548); // keyboard shelf
    kit.glow.box([2.8, 0.04, 0.4], [0, F + 1.12, hz + 1.5], 0x6ff4ff);
    // The head: the shared Barongsai head, big. Irises and the forehead gem are animated meshes (boot-up glow).
    buildLionHead({ batch: kit.lit, pos: [0, F + 2.55, hz - 0.5], scale: 2.9, root, irisMat: this.eyeMat, gemMat: this.gemMat });
    kit.collider([4.6, 3.8, 2.8], [0, F + 1.9, hz - 0.1]);
    void fz;

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

    // --- Glass costume cabinet in the left wall ---
    const cz = LAB.costume.z;
    // Red interior light gives the display a clear focal point even before the suit rises.
    this.lightMat = basic(0xff241c);
    this.lightMat.transparent = true;
    this.lightMat.opacity = 0.92;
    this.light = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), this.lightMat);
    this.light.rotation.y = Math.PI / 2;
    this.light.position.set(-6.94, F + 1.7, cz);
    root.add(this.light);
    this.compartment = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 3.0, 2.5),
      new THREE.MeshPhysicalMaterial({ color: 0x6f8795, roughness: 0.12, metalness: 0.05, transmission: 0.65, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.compartment.position.set(-6.88, F + 1.7, cz);
    root.add(this.compartment);
    const cabinetTop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.75, 2.25), new THREE.MeshBasicMaterial({ color: 0x4d0808, transparent: true, opacity: 0.72 }));
    cabinetTop.position.set(-6.81, F + 1.7, cz);
    root.add(cabinetTop);
    const cabinetLight = new THREE.PointLight(0xff2418, 1.35, 4.2, 2);
    cabinetLight.position.set(-6.15, F + 1.7, cz);
    root.add(cabinetLight);
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
      sc[i * 3] = f * e;
      sc[i * 3 + 1] = f * e * 0.18;
      sc[i * 3 + 2] = f * e * 0.08;
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
    this.ninoFig = new Avatar('nino', figureMaterial(0x2a74c8, 0.08), false);
    this.dialog = ctx.dialog;
    ctx.onDispose(() => this.ninoFig.dispose());
    this.ninoGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.ninoGlow.position.y = 0.65;
    this.nino.add(this.ninoFig.root, this.ninoGlow);
    this.nino.position.copy(this.ninoPos);
    this.nino.rotation.y = Math.atan2(-this.ninoPos.x, 7);
    this.nino.visible = false;
    root.add(this.nino);

    // --- Abstract red costume energy; no mannequin or literal suit is displayed. ---
    this.costumeBody = new THREE.Group();
    const emptySuit = makeCostumeDisplay(ctx);
    this.beltMat = new THREE.MeshStandardMaterial({ color: C.GOLD, roughness: 0.35, metalness: 0.2, emissive: 0x6b4a00, emissiveIntensity: 0.6 });
    // A thin golden halo ring under the suit (the funny ending blinks it).
    this.belt = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 28), this.beltMat);
    this.belt.rotation.x = Math.PI / 2;
    this.belt.position.y = -0.77;
    this.costumeBody.add(emptySuit, this.belt);
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
    this.decorate(ctx, kit, root);
  }

  private holo: THREE.Group | null = null;
  private holoMats: THREE.MeshBasicMaterial[] = [];

  /**
   * Rounded, varied-material dressing (visual only; the few colliders sit against the walls, away from every route):
   * rubber floor tiles, coves, pipes, cable runs, rounded consoles and a holographic table.
   */
  private decorate(ctx: LevelContext, kit: Kit, root: THREE.Object3D): void {
    const rubberMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.4 });
    const rubber = new ColorBatch(rubberMat, false, true);
    const metal = new ColorBatch(metalMat, false, true);
    const cableB = new ColorBatch(rubberMat, false, false);
    const rimGlow = new ColorBatch(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false, false);
    ctx.onDispose(() => {
      rubberMat.dispose();
      metalMat.dispose();
    });
    const midZ = (Z.labFront + Z.labBack) / 2;

    // Rubber floor: 8 x 8 tiles in two soft blue-grey tones with a slightly raised, bevelled look.
    const n = 8;
    const tile = 14.8 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = (i + j) % 2 ? 0xc9d6e8 : 0xd8e2f1;
        rbox(rubber, [tile - 0.05, 0.08, tile - 0.05], [-7.4 + tile * (i + 0.5), F - 0.04, midZ - 7.4 + tile * (j + 0.5)], c, 0.03, undefined, 1);
      }
    }

    // Curved coves where walls meet the roof, with a cyan rim light tube under each.
    for (const s of [-1, 1]) {
      tube(kit.lit, [[s * 6.62, F + 6.1, Z.labFront + 0.1], [s * 6.62, F + 6.1, Z.labBack - 0.2]], 0.34, 0xeef3fb, 1, 14);
      tube(rimGlow, [[s * 6.3, F + 5.62, Z.labFront + 0.1], [s * 6.3, F + 5.62, Z.labBack - 0.2]], 0.045, 0x6ff4ff, 1, 6);
      // Base rim light along the floor edge.
      tube(rimGlow, [[s * 6.78, F + 0.16, Z.labFront - 0.3], [s * 6.78, F + 0.16, Z.labBack + 0.3]], 0.04, 0x6ff4ff, 1, 6);
    }
    tube(kit.lit, [[-6.6, F + 6.1, Z.labBack + 0.3], [6.6, F + 6.1, Z.labBack + 0.3]], 0.34, 0xeef3fb, 1, 14);

    // Pipes along both side walls with gold collars, bending down at the back corners.
    for (const s of [-1, 1]) {
      const x = s * 6.5;
      const path: [number, number, number][] = [
        [x, F + 5.15, Z.labFront - 0.8],
        [x, F + 5.15, -72],
        [x, F + 5.15, Z.labBack + 1.2],
        [s * 6.5, F + 5.0, Z.labBack + 0.55],
        [s * 6.2, F + 4.1, Z.labBack + 0.42],
      ];
      tube(metal, path, 0.11, 0xb4c3d9, 40, 10);
      for (const z of [-64.5, -67.5, -70.5, -73.5]) ring(metal, 0.14, 0.03, [x, F + 5.15, z], C.GOLD, [0, Math.PI / 2, 0], Math.PI * 2, undefined, 6, 14);
      // A thinner teal pipe beside it.
      tube(metal, [[x, F + 4.82, Z.labFront - 0.8], [x, F + 4.82, Z.labBack + 1.4]], 0.06, 0x2ec4b6, 1, 8);
    }

    // Cable runs hanging between the roof ribs in soft loops, plus one along the back wall.
    for (const z of [-64.4, -67.9, -71.6, -74.6]) {
      tube(cableB, [[-5.2, F + 6.08, z], [-3.3, F + 5.45, z], [-1.2, F + 5.35, z], [1.2, F + 5.35, z], [3.3, F + 5.45, z], [5.2, F + 6.08, z]], 0.045, 0x2b3548, 30, 6);
    }
    tube(cableB, [[-5.9, F + 0.1, Z.labBack + 0.2], [-5.0, F + 0.22, Z.labBack + 0.6], [-4.0, F + 0.1, Z.labBack + 0.9], [-3.0, F + 0.2, Z.labBack + 0.5]], 0.05, 0x2b3548, 20, 6);
    tube(cableB, [[5.9, F + 0.1, Z.labBack + 0.25], [5.0, F + 0.2, Z.labBack + 0.7], [4.0, F + 0.1, Z.labBack + 0.95]], 0.05, 0x2b3548, 20, 6);

    // Rounded wall consoles: soft base, sloped deck, glowing screen, buttons. Facing the room.
    const consoleAt = (x: number, z: number, yaw: number, w: number, accent: number): void => {
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const W = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * cs + lz * sn, F + ly, z - lx * sn + lz * cs];
      rbox(metal, [0.9, 0.95, w], W(0, 0.475, 0), 0xe6edf8, 0.12, [0, yaw, 0], 3);
      rbox(metal, [0.96, 0.1, w + 0.08], W(0.02, 0.98, 0), C.GOLD, 0.05, [0, yaw, 0], 2);
      // Sloped deck facing the room.
      rbox(metal, [0.55, 0.16, w - 0.2], W(0.18, 1.08, 0), 0x2b3548, 0.07, [0, yaw, 0.0 - 0.0], 2);
      kit.glow.box([0.02, 0.3, w - 0.5], W(-0.18, 1.34, 0), 0x0a1c30, [0, yaw, 0]);
      rbox(metal, [0.1, 0.62, w - 0.3], W(-0.26, 1.34, 0), 0xe6edf8, 0.04, [0, yaw, 0], 2);
      kit.glow.box([0.03, 0.46, w - 0.55], W(-0.2, 1.36, 0), accent, [0, yaw, 0]);
      for (let k = 0; k < 5; k++) ball(metal, [0.06, 0.035, 0.06], W(0.3, 1.18, (k - 2) * (w / 6.5)), k % 2 ? 0xff9f43 : 0x2ec4b6, undefined, 10, 7);
      kit.collider([0.95, 1.0, w], W(0, 0.5, 0), [0, yaw, 0]);
    };
    consoleAt(-6.42, -65.5, 0, 2.8, 0x2ec4b6);
    consoleAt(6.42, -65.5, Math.PI, 2.8, 0xffc94d);
    consoleAt(-6.42, -74.7, 0, 2.2, 0x6ff4ff);

    // Holographic table with a glass dome and a slowly turning globe of rings.
    const hx = 4.5;
    const hz = -66.7;
    kit.physics.addFixedCylinder(0.5, 0.85, { x: hx, y: F + 0.5, z: hz });
    lathe(metal, [[0.001, 0], [0.95, 0], [1.0, 0.05], [0.9, 0.12], [0.55, 0.2], [0.42, 0.45], [0.5, 0.78], [0.78, 0.88], [0.86, 0.97], [0.001, 0.97]], [hx, F, hz], 0xe6edf8, undefined, undefined, 28);
    ring(metal, 0.82, 0.045, [hx, F + 0.93, hz], C.GOLD, [Math.PI / 2, 0, 0], Math.PI * 2, undefined, 8, 32);
    ring(rimGlow, 0.97, 0.025, [hx, F + 0.1, hz], 0x6ff4ff, [Math.PI / 2, 0, 0], Math.PI * 2, undefined, 6, 32);
    this.holo = new THREE.Group();
    this.holo.position.set(hx, F + 1.65, hz);
    const hm = (c: number, o: number): THREE.MeshBasicMaterial => {
      const mt = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      this.holoMats.push(mt);
      return mt;
    };
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 14), hm(0x2ec4b6, 0.28));
    this.holo.add(globe);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.05, 0.012, 6, 36), hm(i === 1 ? 0xffc94d : 0x6ff4ff, 0.8));
      r.rotation.set(i * 1.05, i * 0.6, 0);
      this.holo.add(r);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 0.78, 20, 1, true), hm(0x6ff4ff, 0.12));
    beam.position.y = -0.84;
    this.holo.add(beam);
    root.add(this.holo);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0xbfe6f2, roughness: 0.08, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
    );
    dome.position.set(hx, F + 0.95, hz);
    root.add(dome);
    ctx.onDispose(() => {
      this.holo?.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const mt of this.holoMats) mt.dispose();
      dome.geometry.dispose();
      (dome.material as THREE.Material).dispose();
    });
    softPool(root, hx, F + 0.03, hz, 2.2, [0.05, 0.3, 0.32]);
    softPool(root, 0, F + 0.035, LAB.head.z + 1.6, 3.2, [0.1, 0.32, 0.36]);
    softPool(root, LAB.button.x, F + 0.035, LAB.button.z, 2.4, [0.3, 0.22, 0.05]);

    rubber.build(root);
    metal.build(root);
    cableB.build(root);
    rimGlow.build(root);
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

  private barsInit = false;

  /** `near` = the player is in the hall or the lab (the street never sees the animated bars: skip their upload). */
  update(dt: number, near = true): void {
    this.time += dt;
    this.lastDt = dt;
    if (this.holo) {
      this.holo.rotation.y += dt * 0.7;
      this.holo.position.y = F + 1.65 + Math.sin(this.time * 1.6) * 0.04;
    }
    const t = this.time;
    if (near || !this.barsInit) this.updateBars(t);
    this.updateDetails(t);
  }

  private updateBars(t: number): void {
    this.barsInit = true;
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
  }

  /** Nino waves or cheers for a moment. */
  ninoEmote(clip: 'cheer' | 'wave', secs = 2.5): void {
    this.ninoFig.emote(clip, secs);
  }

  private updateDetails(t: number): void {
    // Head details.
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    this.gemMat.color.setRGB(0.1 + 0.2 * pulse, 0.6 + 0.4 * pulse, 0.55 + 0.4 * pulse);
    if (this.chaos > 0.01 && Math.sin(t * 22) > 0) this.eyeMat.color.setRGB(1, 0.85, 0.3);
    else if (this.chaos > 0.01) this.eyeMat.color.setRGB(0.3, 1, 1);
    this.buttonMat.emissiveIntensity = Math.max(this.buttonMat.emissiveIntensity, 0.4 + 0.3 * pulse);
    // Nino hovers; costume floats and turns.
    if (this.nino.visible) {
      this.ninoSt.talking = this.dialog.speaker === 'nino';
      this.ninoFig.pose(this.lastDt, this.ninoSt);
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
