import * as THREE from 'three';
import { startGate } from '../../core/StartGate';
import type { Level, LevelContext } from '../Level';
import { Kit } from '../bab1/Kit';
import { makeMaterials } from '../bab1/Batch';
import { column, lathe, ring, tube, rbox } from '../bab1/Round';
import { NinoActor } from '../bab2/NinoActor';
import { enemyModels, type EnemyId } from '../kota/EnemyModels';
import { camoBallGeo } from '../kota/SnakeBoss';
import { flow, startPractice, takeArrival, travel, practice, type PracticeKind } from '../progress';
import { Holo, makeHologramMaterial } from './Hologram';

/**
 * Nino's tutorial on the first visit (no audio files yet: the text is shown and each clip plays once it exists under its id; with
 * {nama} the clip ids get `_g` / `_sg`). The first line replaces the old single welcome `lab_nino_hologram`.
 */
export const TrainingLines = {
  tutorial: [
    { id: 'lab_nino_latihan_1', speaker: 'nino', text: 'Selamat datang di Ruang Latihan, {nama}! Semua lawanmu tersimpan di sini sebagai hologram.' },
    { id: 'lab_nino_latihan_2', speaker: 'nino', text: 'Pilih lawan yang kamu mau, lalu berjalanlah ke depan hologramnya.' },
    { id: 'lab_nino_latihan_3', speaker: 'nino', text: 'Injak tombol oranye di lantai, atau tekan tombol tangan. Latihan pun dimulai!' },
    { id: 'lab_nino_latihan_4', speaker: 'nino', text: 'Setelah selesai, kamu kembali ke sini. Selamat berlatih!' },
  ],
} as const;

/** Save flag: the tutorial was heard once (it is not repeated). */
export const TRAINING_TUTORIAL_FLAG = 'training-tutorial';

/** Entered through the Lab door (the exit door then leads back to the Lab instead of the city). Kept across practice fights. */
let fromLab = false;

/** The room: x in [-W, W], z in [-D, D]; the exit door is in the front wall (+z). */
const W = 13.5, D = 9.5, H = 5.2;
const DOOR_HALF = 1.5;
const PED = { r: 1.35, h: 0.6 };

interface Slot {
  kind: PracticeKind;
  name: string;
  /** Hologram height (m). */
  height: number;
  /** Model id for a single-mesh opponent (the snake is built from its head and a coil). */
  model: EnemyId | null;
  x: number;
  z: number;
  group: THREE.Group;
  built: boolean;
}

/** The five opponents in story order, left to right. */
const ORDER: readonly { kind: PracticeKind; name: string; height: number; model: EnemyId | null }[] = [
  { kind: 'curut', name: 'Curut Cemberut', height: 1.5, model: 'curut_cemberut' },
  { kind: 'ular', name: 'Ular Melar', height: 1.9, model: null },
  { kind: 'rakus', name: 'Tikus Rakus', height: 2.0, model: 'tikus_rakus' },
  { kind: 'elang', name: 'Elang Belang', height: 1.9, model: 'elang_belang' },
  { kind: 'gorilla', name: 'Gorilla Gembira', height: 2.4, model: 'gorilla_gembira' },
];

/** The big name sign above each hologram: two lines, large, readable from the entrance (also on a small phone screen). */
function nameSign(name: string, accent: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(6,30,48,.88)';
    g.strokeStyle = accent;
    g.lineWidth = 12;
    g.beginPath();
    g.roundRect(8, 8, 624, 344, 44);
    g.fill();
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.font = '900 136px system-ui, "Arial Rounded MT Bold", sans-serif';
    g.lineWidth = 14;
    g.strokeStyle = '#04141f';
    g.fillStyle = '#ffffff';
    const [a, b] = name.split(' ');
    g.strokeText(a, 320, 118);
    g.fillText(a, 320, 118);
    g.fillStyle = accent;
    g.strokeText(b, 320, 252);
    g.fillText(b, 320, 252);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.set(SIGN.w, SIGN.h, 1);
  return s;
}

/** Sign size (m), the height of its centre and its distance in front of the pedestal: low and close, so the third-person camera at the entrance sees all five whole (a sign above the holograms was cut off on a phone). */
const SIGN = { w: 2.5, h: 1.4, y: 1.15, front: 1.9 } as const;
const ACCENTS = ['#7ff6ea', '#9bff8a', '#ffb25c', '#8ab8ff', '#ffd23f'] as const;

function exitDoorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#8bffb0');
    grad.addColorStop(1, '#2cae6c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const y of [90, 140, 190]) {
      g.beginPath();
      g.moveTo(34, y - 14);
      g.lineTo(64, y + 10);
      g.lineTo(94, y - 14);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The Lab training room after the story: the defeated opponents stand frozen on pedestals as cyan holograms. A big floor button in
 * front of each starts a practice fight (no story progress); winning or leaving returns here. The door in the front wall leads to
 * the free city. Reachable from the ending and from the training door in the Lab once the story is complete. Debug: `?training=1`.
 */
export class TrainingRoomLevel implements Level {
  readonly id = 'training-room';
  readonly spawn = { x: 0, y: 0, z: 4.2, yaw: Math.PI };
  private ctx!: LevelContext;
  private nino!: NinoActor;
  private mat!: ReturnType<typeof makeHologramMaterial>;
  private readonly slots: Slot[] = [];
  private readonly pads: THREE.Mesh[] = [];
  private time = 0;
  private recheck = 0;
  private launching = false;

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    const arrival = takeArrival(this.id);
    if (arrival === 'trainingFromLab') fromLab = true;
    else if (arrival !== 'trainingBack') fromLab = false;
    practice.level = '';
    const real = !flow.sandbox;
    if (real) ctx.save.setWhere('training-room');
    ctx.scene.background = new THREE.Color(0x0b1a2c);
    ctx.root.add(new THREE.HemisphereLight(0xcfeeff, 0x1c2b3d, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(4, 12, 10);
    ctx.root.add(key);
    ctx.audio.music.setScene('latihan');
    ctx.audio.preload(TrainingLines.tutorial.map((l) => l.id));

    // Superglen with every power ready; the child may switch back to Glen.
    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(true);
    ctx.game.setSkills({ laser: true, shield: true, fly: true });
    ctx.player.flight.maxFlyHeight = H - 1;
    ctx.player.flight.bounds = { minX: -W + 0.6, maxX: W - 0.6, minZ: -D + 0.6, maxZ: D - 0.6 };

    const kit = new Kit(ctx.physics, makeMaterials(), false);
    // Floor, walls (the front wall has the door gap), ceiling.
    kit.solid([W * 2 + 2, 0.4, D * 2 + 2], [0, -0.2, 0], 0x1f3047);
    kit.solid([W * 2 + 1, H, 0.5], [0, H / 2, -D - 0.25], 0x2b4263);
    kit.solid([0.5, H, D * 2 + 1], [-W - 0.25, H / 2, 0], 0x2b4263);
    kit.solid([0.5, H, D * 2 + 1], [W + 0.25, H / 2, 0], 0x2b4263);
    const sideW = W - DOOR_HALF;
    kit.solid([sideW, H, 0.5], [-DOOR_HALF - sideW / 2, H / 2, D + 0.25], 0x2b4263);
    kit.solid([sideW, H, 0.5], [DOOR_HALF + sideW / 2, H / 2, D + 0.25], 0x2b4263);
    kit.solid([DOOR_HALF * 2, H - 3.2, 0.5], [0, 3.2 + (H - 3.2) / 2, D + 0.25], 0x2b4263);
    kit.deco.box([W * 2, 0.3, D * 2], [0, H + 0.15, 0], 0x16263b);
    // Glow: ceiling strips, floor guide lines, a stripe along the back wall.
    for (const x of [-9, -3, 3, 9]) kit.glow.box([0.35, 0.08, D * 1.6], [x, H - 0.05, 0], 0xcff6ff);
    kit.glow.box([W * 2 - 1, 0.12, 0.12], [0, 3.6, -D + 0.05], 0x39e6ff);
    kit.glow.box([0.12, 0.12, D * 2 - 1], [-W + 0.05, 3.6, 0], 0x39e6ff);
    kit.glow.box([0.12, 0.12, D * 2 - 1], [W - 0.05, 3.6, 0], 0x39e6ff);
    kit.glow.box([0.14, 0.02, 7], [0, 0.02, 5.6], 0x39e6ff);
    // Pedestals in a gentle arc.
    ORDER.forEach((o, i) => {
      const x = (i - 2) * 5.1;
      const z = -6.3 + 1.4 * (x / 10.2) ** 2;
      kit.solidCyl(PED.r, PED.h, [x, PED.h / 2, z], 0x35516f);
      kit.glow.cyl(PED.r + 0.02, 0.05, [x, PED.h + 0.01, z], 0x1bb8d8);
      kit.glow.cyl(PED.r * 0.78, 0.06, [x, PED.h + 0.03, z], 0x083a4c);
      this.slots.push({ ...o, x, z, group: new THREE.Group(), built: false });
    });
    // Soft, rounded dressing (visual only): coves, rounded pedestal bases and rims, round pillars, wall panels.
    for (const sx of [-1, 1]) {
      tube(kit.lit, [[sx * (W - 0.3), H - 0.3, D], [sx * (W - 0.3), H - 0.3, -D]], 0.3, 0x3a5a82, 1, 14);
      tube(kit.glow, [[sx * (W - 0.7), H - 0.62, D - 0.3], [sx * (W - 0.7), H - 0.62, -D + 0.3]], 0.04, 0x39e6ff, 1, 6);
      for (const z of [-7, 0, 7]) {
        kit.physics.addFixedCylinder(H / 2, 0.36, { x: sx * (W - 0.55), y: H / 2, z });
        column(kit.lit, sx * (W - 0.55), z, 0, H - 0.3, 0.34, 0x4a6a96, 0x7fd8ff, 16);
      }
      for (const z of [-3.5, 3.5]) rbox(kit.deco, [0.12, 2.6, 5.4], [sx * (W - 0.12), 1.7, z], 0x34507a, 0.08, undefined, 2);
    }
    tube(kit.lit, [[-W + 0.3, H - 0.3, -D + 0.3], [W - 0.3, H - 0.3, -D + 0.3]], 0.3, 0x3a5a82, 1, 14);
    ORDER.forEach((_, i) => {
      const x = (i - 2) * 5.1;
      const z = -6.3 + 1.4 * (x / 10.2) ** 2;
      lathe(kit.lit, [[0.001, 0], [PED.r + 0.25, 0], [PED.r + 0.3, 0.05], [PED.r + 0.12, 0.16], [PED.r - 0.05, 0.22], [0.001, 0.22]], [x, 0, z], 0x4b6c92, undefined, undefined, 28);
      ring(kit.glow, PED.r + 0.28, 0.025, [x, 0.07, z], 0x39e6ff, [Math.PI / 2, 0, 0], Math.PI * 2, undefined, 6, 32);
    });
    kit.build(ctx.root);

    this.mat = makeHologramMaterial();
    ctx.onDispose(() => this.mat.dispose());
    const beam = new THREE.CylinderGeometry(0.95, 1.2, 3.4, 20, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: Holo.color, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const padGeo = new THREE.CylinderGeometry(0.78, 0.9, 0.14, 28);
    const padMat = new THREE.MeshStandardMaterial({ color: 0xff7a2e, emissive: 0xff4a10, emissiveIntensity: 0.55, roughness: 0.4 });
    const ringGeo = new THREE.RingGeometry(0.95, 1.1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false, fog: false, toneMapped: false });
    ctx.onDispose(() => { beam.dispose(); beamMat.dispose(); padGeo.dispose(); padMat.dispose(); ringGeo.dispose(); ringMat.dispose(); });
    for (const s of this.slots) {
      s.group.position.set(s.x, PED.h + 0.12, s.z);
      ctx.root.add(s.group);
      const b = new THREE.Mesh(beam, beamMat);
      b.position.set(s.x, PED.h + 1.7, s.z);
      ctx.root.add(b);
      const sign = nameSign(s.name, ACCENTS[this.slots.indexOf(s) % ACCENTS.length]);
      sign.position.set(s.x, SIGN.y, s.z + SIGN.front);
      sign.name = `sign-${s.kind}`;
      ctx.root.add(sign);
      ctx.onDispose(() => { sign.material.map?.dispose(); sign.material.dispose(); });
      // The big press button on the floor in front of the pedestal.
      const bz = s.z + 3.0;
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(s.x, 0.07, bz);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(s.x, 0.02, bz);
      ctx.root.add(pad, ring);
      this.pads.push(pad);
      ctx.interactions.add({
        position: new THREE.Vector3(s.x, 0.4, bz),
        radius: 1.7,
        icon: 'press',
        promptHeight: 1.3,
        enabled: () => !this.launching,
        onInteract: () => this.launch(s),
      });
      this.tryBuild(s);
    }
    ctx.game.debugInfo.holograms = this.slots.filter((s) => s.built).length;
    ctx.game.debugInfo.trainingButtons = JSON.stringify(this.slots.map((s) => ({ kind: s.kind, x: s.x, z: s.z + 3.0 })));

    // Exit door (front wall): walking into it leads to the free city at the hill door.
    const doorMat = new THREE.MeshBasicMaterial({ map: exitDoorTexture(), toneMapped: false });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_HALF * 2 - 0.2, 3.1), doorMat);
    door.position.set(0, 1.6, D + 0.02);
    door.rotation.y = Math.PI;
    ctx.root.add(door);
    ctx.onDispose(() => { door.geometry.dispose(); doorMat.map?.dispose(); doorMat.dispose(); });
    ctx.physics.addFixedCuboid({ x: DOOR_HALF, y: 0.2, z: 1.2 }, { x: 0, y: -0.2, z: D + 1.2 });
    ctx.interactions.addZone({
      shape: 'box',
      center: new THREE.Vector3(0, 1, D - 0.2),
      half: new THREE.Vector3(DOOR_HALF - 0.1, 2, 0.6),
      once: true,
      onEnter: () => { void (fromLab ? travel(ctx.game, 'lab', 'labFromTraining') : travel(ctx.game, 'kota', 'hillDoor')); },
    });

    this.nino = new NinoActor(ctx, -3.2, 3.2);

    // Back from a practice fight: stand in front of that opponent's button.
    if (arrival === 'trainingBack' && practice.kind) {
      const s = this.slots.find((x) => x.kind === practice.kind);
      if (s) { this.spawn.x = s.x; this.spawn.z = s.z + 4.6; }
    }
    // Nino's tutorial: the first time only (not after a practice fight, not on later visits).
    ctx.game.debugInfo.trainingSigns = this.slots.length;
    if (arrival !== 'trainingBack' && !ctx.save.isChapterDone(TRAINING_TUTORIAL_FLAG)) {
      ctx.seq.run(async () => {
        await ctx.seq.waitUntil(() => startGate.started);
        await ctx.seq.wait(0.6);
        for (const line of TrainingLines.tutorial) await ctx.dialog.say(line, { lockControls: true });
        ctx.save.markChapterDone(TRAINING_TUTORIAL_FLAG);
      });
    }
  }

  private launch(s: Slot): void {
    if (this.launching) return;
    this.launching = true;
    const ctx = this.ctx;
    ctx.sfx.coin();
    ctx.fx.sparkles.burst(s.x, 0.4, s.z + 3.0, 30, 3, 0x39e6ff, { life: 0.9, up: 2, gravity: 2 });
    practice.kind = s.kind;
    ctx.game.debugInfo.practiceStarted = s.kind;
    void startPractice(ctx.game, s.kind);
  }

  /** Build the hologram of a slot when its model is loaded (the later enemies load in the background). */
  private tryBuild(s: Slot): void {
    if (s.built) return;
    const h = s.height;
    if (s.kind === 'ular') {
      if (!enemyModels.has('ular_melar_head')) return;
      const head = enemyModels.geometry('ular_melar_head', 1.15, true);
      if (!head) return;
      const ball = camoBallGeo();
      this.ctx.onDispose(() => { head.dispose(); ball.dispose(); });
      const N = 9;
      for (let i = 0; i < N; i++) {
        const a = i * 0.95 + 0.4;
        const r = 0.75 * (1 - i * 0.04);
        const m = new THREE.Mesh(ball, this.mat);
        const rad = 0.34 * (1 - i * 0.03);
        m.scale.setScalar(rad);
        m.position.set(Math.cos(a) * r, rad + i * 0.12, Math.sin(a) * r);
        s.group.add(m);
      }
      const hm = new THREE.Mesh(head, this.mat);
      hm.position.set(0, 0.35 + N * 0.12 + 0.35, 0.2);
      s.group.add(hm);
      s.built = true;
    } else if (s.model) {
      const id = s.model;
      if (!enemyModels.has(id)) return;
      const geo = enemyModels.geometry(id, h);
      if (!geo) return;
      this.ctx.onDispose(() => geo.dispose());
      s.group.add(new THREE.Mesh(geo, this.mat));
      s.built = true;
    }
    this.ctx.game.debugInfo.holograms = this.slots.filter((x) => x.built).length;
  }

  fixedUpdate(): void {}

  update(dt: number): void {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    this.recheck -= dt;
    if (this.recheck <= 0) {
      this.recheck = 0.6;
      for (const s of this.slots) this.tryBuild(s);
    }
    this.slots.forEach((s, i) => {
      s.group.position.y = PED.h + 0.12 + Holo.bob * (1 + Math.sin(this.time * Holo.bobSpeed + i * 1.3));
      s.group.rotation.y = Math.sin(this.time * 0.5 + i) * Holo.sway;
    });
    for (let i = 0; i < this.pads.length; i++) this.pads[i].scale.y = 1 + 0.12 * Math.sin(this.time * 3 + i);
    this.nino.update(dt);
  }

  dispose(): void {}
}
