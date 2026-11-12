import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LevelContext } from '../Level';
import { Kit, C } from '../bab1/Kit';
import { HALL, PADS, SCREEN } from './Layout';
import { ICON, cellUV, makeIconAtlas, makeIdleScreen, makeMarketPicture } from './Paint';

const WALL = 0xe3f0fc;
const FLOOR = 0xf1e8d6;
const SKY = 0xcdeaff;
/** Soft pulse of the alarm light (well below 1 Hz: no strobing). */
const ALARM_HZ = 0.7;

/** One lunch box on the picnic mat (the lunch scene animates the lid). */
export interface LunchBox {
  group: THREE.Group;
  lid: THREE.Group;
}

const reduceMotion = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function quadUV(g: THREE.BufferGeometry, cell: number): void {
  const [u0, v0, u1, v1] = cellUV(cell);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) < 0.5 ? u0 : u1, uv.getY(i) < 0.5 ? v0 : v1);
}

/**
 * Nino's training hall: a bright blue-white-gold hangar (same look as the lab), 36 x 48 m with a real ceiling at 13 m,
 * a corridor with the lab door behind the spawn, windows with soft morning light, floor stations painted with big
 * icons, the big wall screen (idle picture / city market), an alarm beacon pair and the picnic mat. All static
 * geometry is merged through the kit; the few animated parts are plain meshes.
 */
export class Hangar {
  readonly lunchBoxes: LunchBox[] = [];
  readonly doorPos = new THREE.Vector3(0, 0, HALL.corridorEnd - 1.1);
  /** 0..1 how much the alarm is on (eased). */
  private alarm = 0;
  private alarmWant = 0;
  private t = 0;
  private readonly bonkPanel: THREE.Mesh;
  private bonkT = 99;
  private readonly marketPlane: THREE.Mesh;
  private marketAmount = 0;
  private readonly beacons: { dome: THREE.Mesh; beam: THREE.Mesh; pivot: THREE.Group; mat: THREE.MeshBasicMaterial; beamMat: THREE.MeshBasicMaterial }[] = [];
  private readonly mice: THREE.InstancedMesh;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  private readonly still = reduceMotion();
  private readonly col = new THREE.Color();

  constructor(ctx: LevelContext, kit: Kit) {
    const root = ctx.root;
    const { minX, maxX, minZ, maxZ, ceil } = HALL;
    const W = maxX - minX;
    const L = maxZ - minZ;
    const cz = (minZ + maxZ) / 2;

    // ---- Shell ----
    kit.solid([W + 1.2, 0.5, L + 0.6], [0, -0.25, cz], FLOOR);
    kit.solid([W + 1.2, 0.6, L + 1.2], [0, ceil + 0.3, cz - 0.3], 0xf4f8fd);
    for (const s of [-1, 1]) kit.solid([0.6, ceil, L + 1.2], [s * (maxX + 0.3), ceil / 2, cz - 0.3], WALL);
    kit.solid([W + 1.2, ceil, 0.6], [0, ceil / 2, minZ - 0.3], WALL);
    // Front wall with the corridor opening.
    const hw = HALL.corridorHalf + 0.3;
    const sideW = maxX + 0.6 - hw;
    for (const s of [-1, 1]) kit.solid([sideW, ceil, 0.6], [s * (hw + sideW / 2), ceil / 2, maxZ + 0.3], WALL);
    kit.solid([hw * 2, ceil - HALL.corridorH, 0.6], [0, HALL.corridorH + (ceil - HALL.corridorH) / 2, maxZ + 0.3], WALL);
    // Corridor.
    const cl = HALL.corridorEnd - maxZ - 0.6;
    const cmid = maxZ + 0.6 + cl / 2;
    kit.solid([hw * 2, 0.5, cl + 0.5], [0, -0.25, cmid], FLOOR);
    kit.solid([hw * 2, 0.4, cl + 0.5], [0, HALL.corridorH + 0.2, cmid], 0xf4f8fd);
    for (const s of [-1, 1]) kit.solid([0.5, HALL.corridorH, cl + 0.5], [s * (HALL.corridorHalf + 0.25), HALL.corridorH / 2, cmid], WALL);
    kit.solid([hw * 2 + 0.5, HALL.corridorH, 0.5], [0, HALL.corridorH / 2, HALL.corridorEnd + 0.25], WALL);
    kit.glow.box([0.5, 0.1, cl], [0, HALL.corridorH - 0.02, cmid], 0xffffff);
    for (const s of [-1, 1]) kit.lit.box([0.1, 0.25, cl], [s * (HALL.corridorHalf - 0.02), 0.9, cmid], C.GOLD);

    // ---- Gold trims, ribs, light panels, pillars ----
    for (const s of [-1, 1]) {
      kit.lit.box([0.1, 0.35, L], [s * (maxX - 0.02), 1.0, cz], C.GOLD);
      kit.lit.box([0.1, 0.18, L], [s * (maxX - 0.02), 7.2, cz], C.GOLD);
      kit.glow.box([0.08, 0.12, L], [s * (maxX - 0.04), 12.4, cz], 0x6ff4ff);
    }
    kit.lit.box([W, 0.35, 0.1], [0, 1.0, minZ + 0.02], C.GOLD);
    for (let z = minZ + 4; z < maxZ; z += 8) kit.lit.box([W, 0.4, 0.6], [0, ceil - 0.2, z], C.GOLD);
    for (const x of [-9, 0, 9]) {
      kit.lit.box([0.6, 0.4, L], [x, ceil - 0.2, cz], 0xcfdcf0);
      kit.glow.box([5.2, 0.05, L - 2], [x + (x === 0 ? 0 : 4.5 * Math.sign(x)), ceil - 0.03, cz], 0xfff8e6);
    }
    for (const s of [-1, 1]) {
      for (let z = minZ + 3; z < maxZ - 1; z += 8) {
        kit.lit.box([0.8, ceil - 0.5, 0.9], [s * (maxX - 0.6), (ceil - 0.5) / 2, z], 0xcfdcf0);
        kit.lit.box([1.0, 0.3, 1.1], [s * (maxX - 0.6), 0.15, z], C.GOLD);
        kit.lit.box([1.0, 0.3, 1.1], [s * (maxX - 0.6), ceil - 0.65, z], C.GOLD);
      }
    }

    // ---- High windows + soft morning light ----
    const shafts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      for (let z = minZ + 6; z < maxZ - 2; z += 8) {
        kit.glow.box([0.14, 3.4, 4.6], [s * (maxX - 0.05), 9.9, z], SKY);
        for (const dy of [-1.8, 1.8]) kit.lit.box([0.2, 0.2, 4.9], [s * (maxX - 0.08), 9.9 + dy, z], C.GOLD);
        for (const dz of [-2.4, 0, 2.4]) kit.lit.box([0.2, 3.6, 0.18], [s * (maxX - 0.08), 9.9, z + dz], C.GOLD);
        // One slanted quad of light from the window down to the floor.
        const g = new THREE.BufferGeometry();
        const x0 = s * (maxX - 0.3);
        const x1 = s * (maxX - 10);
        const v = new Float32Array([x0, 11.5, z - 2.2, x0, 8.4, z + 2.2, x1, 0.04, z + 2.2, x0, 11.5, z - 2.2, x1, 0.04, z + 2.2, x1, 0.04, z - 2.2]);
        const k = s > 0 ? 1 : 0.6;
        const colArr = new Float32Array(18);
        for (let i = 0; i < 6; i++) {
          const top = i < 3 && i !== 2 ? 1 : 0;
          const f = (top ? 0.14 : 0.01) * k;
          colArr.set([f, f * 0.95, f * 0.7], i * 3);
        }
        g.setAttribute('position', new THREE.BufferAttribute(v, 3));
        g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
        shafts.push(g);
      }
    }
    const shaftGeo = mergeGeometries(shafts, false);
    for (const g of shafts) g.dispose();
    const shaftMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.renderOrder = 2;
    shaftMesh.frustumCulled = false;
    root.add(shaftMesh);

    // ---- Floor: tile lines, station ring ----
    for (let x = minX + 6; x < maxX; x += 6) kit.glow.box([0.06, 0.012, L], [x, 0.008, cz], 0xc3d3ea);
    for (let z = minZ + 6; z < maxZ; z += 6) kit.glow.box([W, 0.012, 0.06], [0, 0.008, z], 0xc3d3ea);
    kit.glow.box([0.4, 0.014, L], [0, 0.012, cz], 0x2ec4b6);
    kit.glow.box([0.14, 0.014, L], [-0.9, 0.012, cz], 0xffc94d);
    kit.glow.box([0.14, 0.014, L], [0.9, 0.012, cz], 0xffc94d);
    const sh = PADS.shield;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      kit.glow.box([0.34, 0.014, 1.0], [sh.x + Math.cos(a) * sh.r, 0.014, sh.z + Math.sin(a) * sh.r], i % 2 ? 0x2ec4b6 : 0xffc94d, [0, -a + Math.PI / 2, 0]);
    }

    // ---- Station icons (one merged quad mesh) ----
    const atlas = makeIconAtlas();
    const pads: THREE.BufferGeometry[] = [];
    const pad = (cell: number, x: number, z: number, size: number): void => {
      const g = new THREE.PlaneGeometry(size, size);
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.025, z);
      quadUV(g, cell);
      pads.push(g);
    };
    pad(ICON.fly, PADS.fly.x, PADS.fly.z, 8);
    pad(ICON.laser, PADS.laser.x, PADS.laser.z, 5.6);
    pad(ICON.shield, sh.x, sh.z, 6);
    pad(ICON.lunch, PADS.lunch.x, PADS.lunch.z + 4.6, 3.6);
    const padMesh = new THREE.Mesh(
      mergeGeometries(pads, false),
      new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    for (const g of pads) g.dispose();
    padMesh.renderOrder = 1;
    root.add(padMesh);

    // ---- Lab door at the end of the corridor ----
    const dz = HALL.corridorEnd - 0.02;
    const doorGeo = new THREE.PlaneGeometry(2.6, 2.6);
    quadUV(doorGeo, ICON.lab);
    const door = new THREE.Mesh(doorGeo, new THREE.MeshBasicMaterial({ map: atlas, transparent: true, toneMapped: false }));
    door.rotation.y = Math.PI;
    door.position.set(0, 1.9, dz);
    root.add(door);
    kit.lit.box([3.6, 3.8, 0.02], [0, 1.9, dz + 0.015], 0x2ec4b6);
    kit.lit.box([3.8, 0.16, 0.2], [0, 3.85, dz - 0.08], C.GOLD);
    for (const s of [-1, 1]) kit.lit.box([0.16, 3.9, 0.2], [s * 1.9, 1.95, dz - 0.08], C.GOLD);
    this.doorPos.set(0, 0, dz - 1.2);

    // ---- Wall screen ----
    const S = SCREEN;
    kit.lit.box([S.w + 0.8, S.h + 0.8, 0.3], [S.x, S.y, S.z - 0.35], C.GOLD);
    const idle = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshBasicMaterial({ map: makeIdleScreen(), toneMapped: false, fog: false }));
    idle.position.set(S.x, S.y, S.z);
    root.add(idle);
    this.marketPlane = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshBasicMaterial({ map: makeMarketPicture(), toneMapped: false, fog: false }));
    this.marketPlane.position.set(S.x, S.y, S.z + 0.04);
    this.marketPlane.visible = false;
    root.add(this.marketPlane);
    this.mice = this.makeMice();
    this.mice.visible = false;
    root.add(this.mice);

    // ---- Alarm beacons ----
    const domeGeo = new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const beamGeo = new THREE.ConeGeometry(2.2, 9, 14, 1, true);
    beamGeo.rotateX(-Math.PI / 2); // apex at the origin, opening towards +Z
    beamGeo.translate(0, 0, 4.5);
    const bp = beamGeo.getAttribute('position');
    const bc = new Float32Array(bp.count * 3);
    for (let i = 0; i < bp.count; i++) {
      const f = Math.max(0, 1 - bp.getZ(i) / 9) * 0.5;
      bc.set([f, f * 0.55, f * 0.12], i * 3);
    }
    beamGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    for (const s of [-1, 1]) {
      kit.lit.cyl(0.7, 0.4, [s * 11, 10.2, S.z + 0.3], 0x2b3548);
      const mat = new THREE.MeshBasicMaterial({ color: 0x5a1a14, toneMapped: false });
      const dome = new THREE.Mesh(domeGeo, mat);
      dome.position.set(s * 11, 10.4, S.z + 0.3);
      const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, opacity: 0 });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      const pivot = new THREE.Group();
      pivot.position.set(s * 11, 10.7, S.z + 0.4);
      pivot.add(beam);
      beam.visible = false;
      beam.frustumCulled = false;
      root.add(dome, pivot);
      this.beacons.push({ dome, beam, pivot, mat, beamMat });
    }

    // ---- Picnic mat with two lunch boxes ----
    const L0 = PADS.lunch;
    kit.lit.box([4.6, 0.05, 3.6], [L0.x, 0.03, L0.z], 0xfff1d6);
    for (let i = -2; i <= 2; i++) kit.lit.box([0.45, 0.056, 3.6], [L0.x + i * 0.9, 0.032, L0.z], i % 2 ? 0xff8fb1 : 0xe8453c);
    kit.lit.box([4.8, 0.06, 0.12], [L0.x, 0.033, L0.z + 1.8], C.GOLD);
    kit.lit.box([4.8, 0.06, 0.12], [L0.x, 0.033, L0.z - 1.8], C.GOLD);
    const boxDefs: [number, number][] = [[-0.8, 0xff8fb1], [0.8, 0x4dabf7]];
    for (const [dx, color] of boxDefs) {
      const group = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.62), m);
      body.position.y = 0.26;
      const lid = new THREE.Group();
      const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.14, 0.68), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
      knob.position.y = 0.11;
      lid.add(lidMesh, knob);
      lid.position.set(0, 0.52, -0.31); // hinge at the back edge
      lidMesh.position.set(0, 0, 0.31);
      knob.position.z = 0.31;
      group.add(body, lid);
      group.position.set(L0.x + dx, 0.0, L0.z);
      root.add(group);
      this.lunchBoxes.push({ group, lid });
    }

    // ---- Ceiling bonk panel (wobbles when the first flight bumps the ceiling) ----
    this.bonkPanel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 3.4), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x6b4a00, emissiveIntensity: 0.5, roughness: 0.4 }));
    this.bonkPanel.visible = false;
    root.add(this.bonkPanel);
  }

  /** Ceiling panel over (x, z) wobbles for about a second. */
  bonk(x: number, z: number): void {
    this.bonkT = 0;
    this.bonkPanel.visible = true;
    this.bonkPanel.position.set(x, HALL.ceil - 0.13, z);
  }

  setAlarm(on: boolean): void {
    this.alarmWant = on ? 1 : 0;
  }

  /** Pulse rate of the alarm light in Hz (0 with prefers-reduced-motion). */
  get pulseHz(): number {
    return this.still ? 0 : ALARM_HZ;
  }

  get alarmLevel(): number {
    return this.alarm;
  }

  /** TV switch-on: the market picture grows from a bright line to full height. */
  showMarket(t: number): void {
    this.marketAmount = t;
    this.marketPlane.visible = t > 0.001;
    this.marketPlane.scale.set(1, Math.max(0.01, t), 1);
    this.mice.visible = t >= 1;
  }

  get marketShown(): boolean {
    return this.marketAmount >= 1;
  }

  private makeMice(): THREE.InstancedMesh {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, color: number): void => {
      this.col.set(color);
      const n = g.getAttribute('position').count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([this.col.r, this.col.g, this.col.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      parts.push(g.index ? g.toNonIndexed() : g);
    };
    const body = new THREE.SphereGeometry(0.5, 8, 6);
    body.scale(1, 0.62, 0.62);
    add(body, 0x7d8296);
    add(new THREE.SphereGeometry(0.27, 8, 6).translate(0.55, 0.06, 0), 0x7d8296);
    add(new THREE.SphereGeometry(0.13, 6, 5).translate(0.5, 0.3, 0.17), 0xffb4c8);
    add(new THREE.SphereGeometry(0.13, 6, 5).translate(0.5, 0.3, -0.17), 0xffb4c8);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5).rotateZ(Math.PI / 2).translate(-0.85, -0.05, 0), 0xffb4c8);
    const geo = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, side: THREE.DoubleSide }), 3);
    m.frustumCulled = false;
    return m;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Alarm: eased on/off; slow soft pulse (0.7 Hz) and a lazy sweep; no pulse or sweep with reduced motion.
    if (this.alarm !== this.alarmWant) {
      this.alarm += Math.sign(this.alarmWant - this.alarm) * Math.min(Math.abs(this.alarmWant - this.alarm), dt * 1.5);
      if (Math.abs(this.alarmWant - this.alarm) < 1e-3) this.alarm = this.alarmWant;
    }
    if (this.alarm > 0 || this.beacons[0].beam.visible) {
      const pulse = this.still ? 0.8 : 0.65 + 0.35 * Math.sin(t * Math.PI * 2 * ALARM_HZ);
      const a = this.alarm;
      this.beacons.forEach((b, i) => {
        b.mat.color.setRGB(0.35 + 0.65 * a * pulse, 0.1 + 0.55 * a * pulse, 0.08 + 0.1 * a * pulse);
        b.beamMat.opacity = a * (0.55 + 0.45 * pulse);
        b.beam.visible = a > 0.01;
        if (!this.still) b.pivot.rotation.y = t * 0.9 * (i ? -1 : 1) + i * 2;
        else b.pivot.rotation.y = i ? 0.6 : -0.6;
      });
    }
    if (this.bonkT < 1.4) {
      this.bonkT += dt;
      const u = Math.min(1, this.bonkT / 1.4);
      const e = Math.exp(-4 * u) * Math.sin(this.bonkT * 26);
      this.bonkPanel.rotation.set(e * 0.12, 0, e * 0.1);
      this.bonkPanel.position.y = HALL.ceil - 0.13 - Math.max(0, e) * 0.25;
      if (u >= 1) this.bonkPanel.visible = false;
    }
    if (this.mice.visible) {
      const S = SCREEN;
      for (let i = 0; i < 3; i++) {
        const sp = 0.45 + i * 0.17;
        const ph = i * 2.1;
        const x = Math.sin(t * sp + ph) * (6.5 - i * 0.8) + (i - 1) * 1.5;
        const dir = Math.cos(t * sp + ph) >= 0 ? 1 : -1;
        const hop = this.still ? 0 : Math.abs(Math.sin(t * 9 + i * 1.3)) * 0.14;
        this.pos.set(S.x + x, S.y - 3.9 + hop - i * 0.3, S.z + 0.2 + i * 0.01);
        this.scl.set(0.8 * dir, 0.8, 0.8);
        this.m4.compose(this.pos, this.q, this.scl);
        this.mice.setMatrixAt(i, this.m4);
      }
      this.mice.instanceMatrix.needsUpdate = true;
    }
  }
}
