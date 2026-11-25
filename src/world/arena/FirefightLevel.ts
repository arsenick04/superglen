import * as THREE from 'three';
import { Combat } from '../../config/combat';
import { startGate } from '../../core/StartGate';
import type { Level, LevelContext } from '../Level';
import { Kit } from '../bab1/Kit';
import { makeMaterials } from '../bab1/Batch';
import { NinoActor } from '../bab2/NinoActor';
import { AaraActor } from '../kota/Aara';
import { Celebration } from '../Celebration';
import { travel } from '../progress';
import { Parkour } from '../../config/parkour';
import { buildFirefightLayout } from './FirefightData';
import { buildForestScenery } from './ForestScenery';
import { ForestFireEffects } from './ForestFireEffects';

const F = Combat.firefight, T = Parkour.firefightTrees;
// Falling from a canopy step is fine here: the child lands on the ground and climbs again (no respawn).
const STEAM = 0xd9e4ea;

export const FirefightLines = {
  nino: { id: 'ff_nino_hose', speaker: 'nino', text: 'Ini selang air! Arahkan ke api, lalu tahan tombol semprot sampai apinya padam.' },
  aara: { id: 'ff_aara_help', speaker: 'aara', text: 'Aku dan Nino juga menyemprot! Ayo kita padamkan semua api!' },
  ninoDone: { id: 'ff_nino_all_out', speaker: 'nino', text: 'Semua api sudah padam! Kerja bagus, Superglen!' },
  aaraDone: { id: 'ff_aara_hooray', speaker: 'aara', text: 'Hutannya selamat! Hore!' },
  glenDone: { id: 'ff_glen_proud', speaker: 'glen', text: 'Kita berhasil bersama! Tidak ada lagi api.' },
  gorilla: { id: 'ff_gorilla_thanks', speaker: 'gorila', text: 'Terima kasih, {nama}! Hutanku selamat berkat kamu, Nino, dan Aara.' },
} as const;

interface Fire {
  x: number; z: number;
  /** Height of the ground the fire stands on (0, or the top of its canopy). */
  y: number;
  /** 1 = full fire, 0 = out. */
  s: number;
  gone: boolean;
  group: THREE.Group;
  steamT: number;
  /** Index in the fire system and the steam puff level (1 right after a hit, fades out). */
  idx: number;
  steam: number;
}

/** A reused pool of water drops flying from a nozzle to a point (one InstancedMesh, no per-frame allocation). */
class WaterStream {
  readonly mesh: THREE.InstancedMesh;
  readonly nozzle: THREE.Mesh;
  readonly from = new THREE.Vector3();
  readonly to = new THREE.Vector3();
  on = false;
  private phase = 0;
  private readonly dummy = new THREE.Object3D();
  constructor(root: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, nozzleGeo: THREE.BufferGeometry, nozzleMat: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geo, mat, F.particles);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    root.add(this.mesh, this.nozzle);
  }
  update(dt: number): void {
    this.mesh.visible = this.on;
    if (!this.on) return;
    this.phase = (this.phase + dt * F.flow) % 1;
    const n = F.particles, d = this.dummy;
    for (let i = 0; i < n; i++) {
      const t = (this.phase + i / n) % 1;
      d.position.lerpVectors(this.from, this.to, t);
      d.position.y += F.arc * 4 * t * (1 - t);
      d.scale.setScalar(F.particleSize * (0.7 + 0.6 * t));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Chapter 8, part 2: Superglen, Aara and Nino put out the forest fire with water hoses. Nothing hurts; every fire can be put out. */
export class FirefightLevel implements Level {
  readonly id = 'forest-firefight';
  readonly spawn = { ...F.spawn };
  private ctx!: LevelContext;
  private readonly fires: Fire[] = [];
  private fireFx!: ForestFireEffects;
  private nino!: NinoActor;
  private aara!: AaraActor;
  private streams: WaterStream[] = [];
  private hud!: HTMLDivElement;
  private dlgOpen = false;
  private time = 0;
  private activeTime = 0;
  private finished = false;
  private spraying = false;
  private readonly aimFrom = new THREE.Vector3();
  private readonly marker = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly npcAim: (Fire | null)[] = [null, null];
  private readonly feet = new THREE.Vector3();

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    ctx.save.setWhere(this.id);
    ctx.scene.background = new THREE.Color(0xd9a77a);
    ctx.scene.fog = new THREE.Fog(0xc0a38b, 45, 110);
    ctx.root.add(new THREE.HemisphereLight(0xffe5c7, 0x596747, 1.6));
    const sun = new THREE.DirectionalLight(0xffc684, 2);
    sun.position.set(-12, 25, 10);
    ctx.root.add(sun);
    const mats = makeMaterials();
    const kit = new Kit(ctx.physics, mats);
    kit.solid([110, 0.4, 110], [0, -0.2, 0], 0x453a2c);
    const layout = buildFirefightLayout();
    // Canopy steps: a thin trunk, a disc collider on top (like the forest rescue) and a leafy cap.
    for (const st of layout.steps) {
      kit.solidCyl(0.3, st.top, [st.x, st.top / 2, st.z], 0x895e40);
      ctx.physics.addFixedCylinder(0.08, T.radius, { x: st.x, y: st.top - 0.08, z: st.z });
      for (let side = -1; side <= 1; side++) kit.lit.sph(1.5, [st.x + side * 0.8, st.top - 0.4, st.z + (side % 2) * 0.3], side === 0 ? 0x6fad47 : 0x497e37, [1, 0.3, 1], 1);
    }
    // Low logs in front of some fires.
    for (const [lx, lz, len, rot] of F.logs) kit.solid([len, 1.2, 0.9], [lx, 0.6, lz], 0x7a5230, [0, rot, 0]);
    kit.build(ctx.root);
    buildForestScenery(ctx, true);
    this.fireFx = new ForestFireEffects(ctx, layout.fires.map((f) => ({ x: f.x, y: f.y + 0.1, z: f.z, scale: 0.55 })));
    ctx.game.preloadCinematic('ending');

    // Fire spots: the flames themselves live in the shared FireSystem (ForestFireEffects); here only the charred ground disc.
    const disc = new THREE.CircleGeometry(1, 14);
    disc.rotateX(-Math.PI / 2);
    const charMat = new THREE.MeshBasicMaterial({ color: 0x2a211b });
    ctx.onDispose(() => { disc.dispose(); charMat.dispose(); });
    layout.fires.forEach((spot, i) => {
      const { x, y, z } = spot;
      const group = new THREE.Group();
      group.position.set(x, y, z);
      const char = new THREE.Mesh(disc, charMat);
      char.position.set(x, y + 0.14, z);
      char.scale.setScalar(1.1);
      ctx.root.add(char);
      ctx.root.add(group);
      this.fires.push({ x, y, z, s: 1, gone: false, group, steamT: 0, idx: this.fireFx.ringCount + i, steam: 0 });
    });

    // Water streams: 0 = player, 1 = Aara, 2 = Nino.
    const drop = new THREE.SphereGeometry(1, 6, 4);
    const water = new THREE.MeshBasicMaterial({ color: 0x7fd2ff, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    const nozzleGeo = new THREE.CylinderGeometry(0.05, 0.09, 0.45, 8);
    nozzleGeo.rotateX(Math.PI / 2);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xe0382e });
    ctx.onDispose(() => { drop.dispose(); water.dispose(); nozzleGeo.dispose(); nozzleMat.dispose(); });
    for (let i = 0; i < 3; i++) this.streams.push(new WaterStream(ctx.root, drop, water, nozzleGeo, nozzleMat));

    // Helpers.
    this.aara = new AaraActor(mats.lit, ctx.dialog);
    this.aara.setLevel(3);
    this.aara.place(F.aaraAt[0], F.aaraAt[1], 0);
    ctx.root.add(this.aara.group);
    ctx.onDispose(() => this.aara.dispose());
    this.nino = new NinoActor(ctx, F.ninoAt[0], F.ninoAt[1]);

    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    // The laser button is the water button here; the beam itself stays off.
    ctx.game.setSkills({ laser: true, shield: false, fly: false });
    ctx.game.setLaserSuppressed(true);
    ctx.game.setHoseIcon(true);
    ctx.player.levelSpeedScale = 0.9;
    const bounds = { minX: -F.arenaHalf, maxX: F.arenaHalf, minZ: -F.arenaHalf, maxZ: F.arenaHalf };
    ctx.player.flight.bounds = bounds;
    ctx.player.flight.groundBounds = bounds;
    ctx.audio.music.setScene('jelajah');

    this.hud = document.createElement('div');
    this.hud.className = 'firefight-hud';
    ctx.ui.append(this.hud);
    ctx.onDispose(() => this.hud.remove());
    this.refresh();

    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (ctx.save.isChapterDone('forest-firefight')) { await this.leave(); return; }
      await ctx.dialog.say(FirefightLines.nino, { lockControls: true });
      await ctx.dialog.say(FirefightLines.aara, { lockControls: true });
    });
  }

  private get remaining(): number {
    let n = 0;
    for (const f of this.fires) if (!f.gone) n++;
    return n;
  }

  private refresh(): void {
    const total = this.fires.length;
    this.hud.textContent = `Api padam: ${total - this.remaining}/${total}`;
    this.ctx.game.debugInfo.firesOut = total - this.remaining;
    this.ctx.game.debugInfo.firesTotal = total;
    this.ctx.game.debugInfo.fireLeft = this.fires.map((f) => (f.gone ? '0' : '1')).join('');
    // Marker: the nearest fire the helpers are not handling, else any.
    const p = this.ctx.player.position;
    let best: Fire | null = null, bestD = Infinity;
    for (let pass = 0; pass < 2 && !best; pass++) {
      for (let i = 0; i < this.fires.length; i++) {
        const f = this.fires[i];
        if (f.gone || (pass === 0 && this.isNpcFire(i))) continue;
        const d = (f.x - p.x) ** 2 + (f.z - p.z) ** 2;
        if (d < bestD) { bestD = d; best = f; }
      }
    }
    if (best) { this.marker.set(best.x, best.y + 0.5, best.z); this.ctx.objectives.set(this.marker); } else this.ctx.objectives.clear();
  }

  private isNpcFire(i: number): boolean {
    return F.npcFires.aara.includes(i) || F.npcFires.nino.includes(i);
  }

  private extinguish(f: Fire): void {
    f.gone = true;
    f.s = 0;
    f.group.visible = false;
    const fx = this.ctx.fx.sparkles;
    fx.burst(f.x, f.y + 0.8, f.z, 22, 2.2, STEAM, { life: 1.1, up: 2.2, gravity: -0.4 });
    fx.burst(f.x, f.y + 0.4, f.z, 10, 3, 0x9fdcff, { life: 0.6, up: 1, gravity: 3 });
    this.ctx.sfx.coin();
    this.refresh();
    this.fireFx.setStrength(0.15 + 0.85 * (this.remaining / this.fires.length));
    if (!this.remaining && !this.finished) this.finish();
  }

  private hit(f: Fire, rate: number, dt: number): void {
    f.s = Math.max(0, f.s - rate * dt);
    f.steam = 1;
    f.steamT -= dt;
    if (f.steamT <= 0 && f.s > 0) {
      f.steamT = 0.35;
      this.ctx.fx.sparkles.burst(f.x, f.y + 0.6 + f.s, f.z, 4, 1.2, STEAM, { life: 0.8, up: 1.6, gravity: -0.3 });
    }
    if (f.s <= 0) this.extinguish(f);
  }

  /**
   * Best lit fire in reach: 3D distance within range, target at most `maxUp` above the nozzle (a tree fire needs a canopy step),
   * inside the cone of the facing or the camera forward. The helpers' fires are skipped unless aimed at within a tight cone.
   */
  private pickFire(): Fire | null {
    const pl = this.ctx.player, p = pl.position;
    pl.getFeetPosition(this.feet);
    const nozzleY = this.feet.y + F.nozzleHeight;
    const fx = Math.sin(pl.facing), fz = Math.cos(pl.facing);
    const cx = -Math.sin(this.ctx.cameraRig.yaw), cz = -Math.cos(this.ctx.cameraRig.yaw);
    const cos = Math.cos((F.coneDeg * Math.PI) / 180), tight = Math.cos((F.helperConeDeg * Math.PI) / 180);
    let best: Fire | null = null, bestScore = Infinity;
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i];
      if (f.gone) continue;
      const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
      const dy = f.y + F.targetHeight - nozzleY;
      if (dy > F.maxUp || Math.hypot(d, dy) > F.range) continue;
      const nx = d > 0.001 ? dx / d : fx, nz = d > 0.001 ? dz / d : fz;
      const dot = Math.max(nx * fx + nz * fz, nx * cx + nz * cz);
      if (this.isNpcFire(i)) { if (dot < tight) continue; }
      else if (!(d <= F.closeRange && f.y === 0) && dot < cos) continue;
      const score = d * 0.5 + (1 - dot) * 12;
      if (score < bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  fixedUpdate(dt: number): void {
    const ctx = this.ctx;
    this.spraying = false;
    if (!startGate.started || this.finished) return;
    if (!ctx.game.controlsEnabled) return;
    this.activeTime += dt;
    // Child: hold the laser button / key / mouse.
    const target = ctx.input.isDown('laser') && ctx.player.mode === 'superglen' ? this.pickFire() : null;
    const s0 = this.streams[0];
    s0.on = false;
    if (target) {
      this.spraying = true;
      ctx.player.turnTo(Math.atan2(target.x - ctx.player.position.x, target.z - ctx.player.position.z));
      this.hit(target, 1 / F.seconds, dt);
      s0.on = true;
      s0.to.set(target.x, target.y + 0.5 + target.s * 0.8, target.z);
    }
    // Helpers: slow, start after a while, only their own fires.
    const slots: [number, readonly number[], number][] = [[1, F.npcFires.aara, 0], [2, F.npcFires.nino, 1]];
    for (const [si, list, k] of slots) {
      const st = this.streams[si];
      st.on = false;
      this.npcAim[k] = null;
      if (this.activeTime < F.npcDelay || this.finished) continue;
      for (const idx of list) {
        const f = this.fires[idx];
        if (f.gone) continue;
        this.npcAim[k] = f;
        st.on = true;
        st.to.set(f.x, f.y + 0.5 + f.s * 0.8, f.z);
        this.hit(f, 1 / F.npcSeconds, dt);
        break;
      }
    }
    // Fires that nobody sprays grow back a little (never past their start size).
    for (const f of this.fires) if (!f.gone && f !== target && f !== this.npcAim[0] && f !== this.npcAim[1]) f.s = Math.min(1, f.s + F.regrow * dt);
    ctx.game.debugInfo.spraying = this.spraying;
  }

  private finish(): void {
    this.finished = true;
    const ctx = this.ctx;
    for (const s of this.streams) { s.on = false; s.mesh.visible = false; }
    this.fireFx.setStrength(0);
    ctx.objectives.clear();
    ctx.save.markChapterDone('forest-firefight');
    ctx.save.markChapterDone('bab8');
    ctx.game.debugInfo.firefightDone = true;
    ctx.seq.run(async () => {
      await ctx.seq.wait(F.endDelay);
      this.nino.emote('cheer');
      this.aara.emote('cheer');
      await ctx.dialog.say(FirefightLines.ninoDone, { lockControls: true });
      await ctx.dialog.say(FirefightLines.aaraDone, { lockControls: true });
      await ctx.dialog.say(FirefightLines.glenDone, { lockControls: true });
      await ctx.dialog.say(FirefightLines.gorilla, { lockControls: true });
      await new Celebration(ctx, 'Chapter 8 selesai!', ctx.fx.sparkles).play();
      await this.leave();
    });
  }

  /** After the closing scene: the ending (sky film + credits, then the training room). A finished story goes straight to the city. */
  private async leave(): Promise<void> {
    this.ctx.save.setInterlude('');
    if (this.ctx.save.isChapterDone('ending')) {
      this.ctx.save.setWhere('kota');
      await travel(this.ctx.game, 'kota', 'hillDoor');
      return;
    }
    this.ctx.save.setWhere('ending');
    await this.ctx.game.loadLevel('ending');
  }

  update(dt: number): void {
    this.time += dt;
    // The counter never sits on a dialog bubble.
    const dlg = this.ctx.dialog.active;
    if (dlg !== this.dlgOpen) { this.dlgOpen = dlg; this.hud.style.visibility = dlg ? 'hidden' : ''; }
    this.fireFx.update(dt);
    const sys = this.fireFx.system;
    for (const f of this.fires) {
      f.steam = Math.max(0, f.steam - 1.4 * dt);
      sys.setIntensity(f.idx, f.gone ? 0 : 0.2 + 0.8 * f.s);
      sys.setSteam(f.idx, f.steam);
    }
    const pl = this.ctx.player, vp = pl.visualPosition;
    // Nozzles: player at the wrist, helpers beside them.
    const s0 = this.streams[0];
    const fy = pl.facing;
    s0.from.set(vp.x + Math.sin(fy) * 0.5 + Math.cos(fy) * 0.3, vp.y + 0.1, vp.z + Math.cos(fy) * 0.5 - Math.sin(fy) * 0.3);
    this.placeNozzle(s0, this.spraying || s0.on);
    this.nino.update(dt);
    this.aara.update(dt);
    const np = this.nino.group.position, ap = this.aara.group.position;
    const sn = this.streams[2], sa = this.streams[1];
    sa.from.set(ap.x, 1.0, ap.z);
    sn.from.set(np.x, 0.9, np.z);
    const aimA = this.npcAim[0], aimN = this.npcAim[1];
    if (aimA) { this.aara.group.rotation.y = Math.atan2(aimA.x - ap.x, aimA.z - ap.z); sa.from.x += Math.sin(this.aara.group.rotation.y) * 0.5; sa.from.z += Math.cos(this.aara.group.rotation.y) * 0.5; }
    if (aimN) { this.tmp.set(aimN.x, 0, aimN.z); this.nino.faceTowards(this.tmp); sn.from.x += Math.sin(this.nino.group.rotation.y) * 0.5; sn.from.z += Math.cos(this.nino.group.rotation.y) * 0.5; } else this.nino.faceTowards(null);
    this.placeNozzle(sa, !!aimA);
    this.placeNozzle(sn, !!aimN);
    for (const s of this.streams) s.update(dt);
    if (!this.finished) this.refreshMarker();
  }

  private markerT = 0;
  private refreshMarker(): void {
    this.markerT += 1;
    if (this.markerT % 20 === 0) this.refresh();
  }

  private placeNozzle(s: WaterStream, on: boolean): void {
    s.nozzle.visible = on;
    if (!on) return;
    s.nozzle.position.copy(s.from);
    this.aimFrom.copy(s.to);
    s.nozzle.lookAt(this.aimFrom);
  }

  dispose(): void {}
}
