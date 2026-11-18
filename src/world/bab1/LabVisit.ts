import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import { AaraActor } from '../kota/Aara';
import { AaraFollower } from '../kota/AaraFollower';
import { BAB5_LINES as L } from '../kota/Bab5Data';
import { Easings } from '../../gameplay/Sequence';
import type { Lab } from './Lab';
import { LAB_FLOOR } from './Layout';

/**
 * Chapter 5 inside the old Barongsai building: Glen brings Aara. She follows him to Nino (Aara and Nino meet for the first time),
 * Nino greets her and calls her translator clever, scans the snake skin ("Ular Melar! Badannya bisa memanjang."), Aara learns that
 * Glen is Superglen, Nino sends them to the school field. Afterwards the beam leads out of the front door (the city step is 'city').
 * Eight lines (bab5_*); the save step 'lab' (or 'walk') becomes 'city' at the end, so a reload mid-scene plays it again.
 */
export class LabVisit {
  private readonly aara: AaraActor;
  private readonly follower: AaraFollower;
  private readonly tmp = new THREE.Vector3();
  private scene = false;
  done = false;
  private disposed = false;

  constructor(
    private readonly ctx: LevelContext,
    private readonly lab: Lab,
    lit: THREE.Material,
    private readonly exit: { x: number; z: number },
    private readonly mode: 'first' | 'snakeCelebration' = 'first',
  ) {
    this.aara = new AaraActor(lit, ctx.dialog);
    this.aara.setLevel(3);
    ctx.root.add(this.aara.group);
    ctx.onDispose(() => {
      this.disposed = true;
      this.aara.dispose();
    });
    this.follower = new AaraFollower(this.aara, ctx.player);
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __labVisit?: unknown };
      w.__labVisit = {
        done: () => this.done,
        scene: () => this.scene,
        aara: () => ({ x: this.aara.group.position.x, y: this.aara.group.position.y, z: this.aara.group.position.z }),
        nino: () => ({ x: this.lab.ninoPos.x, z: this.lab.ninoPos.z }),
      };
      ctx.onDispose(() => {
        delete w.__labVisit;
      });
    }
  }

  start(): void {
    if (this.mode === 'snakeCelebration') {
      this.startSnakeCelebration();
      return;
    }
    const { ctx, lab } = this;
    this.follower.reset();
    ctx.game.debugInfo.ch5Lab = 'walk';
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      ctx.objectives.set(this.tmp.set(lab.ninoPos.x - 1.6, LAB_FLOOR, lab.ninoPos.z + 2.6));
      await ctx.seq.waitUntil(() => Math.hypot(ctx.player.position.x - lab.ninoPos.x, ctx.player.position.z - lab.ninoPos.z) < 6.5 && ctx.game.controlsEnabled);
      await this.meet();
    });
  }

  private startSnakeCelebration(): void {
    const { ctx, lab } = this;
    const { seq, dialog, cameraRig, fx } = ctx;
    this.scene = true;
    this.aara.place(lab.ninoPos.x - 2.2, lab.ninoPos.z + 2.4, Math.PI);
    this.aara.group.position.y = LAB_FLOOR;
    ctx.audio.preload(ctx.dialog.idsWithPrefix('bab5_'));
    ctx.seq.run(async () => {
      await seq.waitUntil(() => startGate.started);
      ctx.game.debugInfo.ch5Lab = 'celebration';
      ctx.game.setControlsEnabled(false);
      ctx.objectives.clear();
      cameraRig.setFraming(this.tmp.set(lab.ninoPos.x - 1.2, LAB_FLOOR + 1.3, lab.ninoPos.z + 1.2), { weight: 0.6, distance: 3, yaw: -Math.PI / 2 });
      await dialog.say(L.ninoPanggilLab, { lockControls: true });
      await dialog.say(L.glenRayakan, { lockControls: true });
      await dialog.say(L.aaraRayakan, { lockControls: true });
      ctx.sfx.bling();
      fx.sparkles.burst(lab.ninoPos.x, LAB_FLOOR + 1.3, lab.ninoPos.z, 24, 3, 0xffd23f, { gravity: 1, life: 1, up: 0.8 });
      await dialog.say(L.ninoPulang, { lockControls: true });
      cameraRig.setFraming(null);
      ctx.save.setInterlude('snake_home');
      this.done = true;
      ctx.game.setControlsEnabled(true);
      ctx.objectives.set(this.tmp.set(this.exit.x, 0, this.exit.z));
      ctx.game.debugInfo.ch5Lab = 'celebrationDone';
    });
  }

  /** Frame update (the follower walks on frame time here: the lab level has no fixed step of its own). */
  update(dt: number): void {
    if (this.disposed) return;
    if (!this.scene) this.follower.fixedUpdate(dt);
    this.aara.update(dt);
  }

  private async meet(): Promise<void> {
    const { ctx, lab, aara } = this;
    const { seq, dialog, cameraRig, fx } = ctx;
    this.scene = true;
    ctx.game.debugInfo.ch5Lab = 'meet';
    ctx.game.setControlsEnabled(false);
    ctx.objectives.clear();
    // Aara steps up beside Glen, facing Nino.
    const sx = aara.group.position.x;
    const sz = aara.group.position.z;
    const tx = lab.ninoPos.x - 1.7;
    const tz = lab.ninoPos.z + 2.8;
    const yaw = Math.atan2(lab.ninoPos.x - tx, lab.ninoPos.z - tz);
    cameraRig.setFraming(this.tmp.set(lab.ninoPos.x - 1.2, LAB_FLOOR + 1.3, lab.ninoPos.z + 1.2), { weight: 0.6, distance: 3, yaw: -Math.PI / 2 });
    await seq.tween(
      1.1,
      (u) => {
        aara.group.position.x = sx + (tx - sx) * u;
        aara.group.position.z = sz + (tz - sz) * u;
        aara.group.position.y = LAB_FLOOR;
        aara.group.rotation.y = yaw;
      },
      Easings.easeInOut,
    );
    await dialog.say(L.ninoHalo, { lockControls: true });
    await dialog.say(L.aaraKagum, { lockControls: true });
    ctx.sfx.bling();
    fx.sparkles.burst(lab.ninoPos.x, LAB_FLOOR + 1.3, lab.ninoPos.z, 14, 2.4, 0x7fe3a0, { gravity: 1, life: 0.9, up: 0.7 });
    await dialog.say(L.ninoAlat, { lockControls: true });
    await dialog.say(L.glenUlar, { lockControls: true });
    // Nino scans the skin: a ring sweeps and flashes.
    ctx.sfx.blip();
    for (let k = 0; k < 3; k++) {
      fx.flashes.spawn(lab.ninoPos.x, LAB_FLOOR + 1.2, lab.ninoPos.z, 1.4 + k * 0.6, 0.6, 0x7fd8ff);
      await seq.wait(0.3);
    }
    await dialog.say(L.ninoUlar, { lockControls: true });
    // Glen shows who he is.
    if (ctx.player.mode !== 'superglen') ctx.game.setPlayerMode('superglen');
    const p = ctx.player.visualPosition;
    fx.rings.spawn(p.x, p.y - 0.5, p.z, 2.2, 0.7, 0xffd23f);
    fx.sparkles.burst(p.x, p.y + 0.4, p.z, 30, 4, 0xffd23f, { gravity: 1 });
    await dialog.say(L.glenSuper, { lockControls: true });
    await dialog.say(L.aaraSuper, { lockControls: true });
    await dialog.say(L.ninoLapangan, { lockControls: true });
    cameraRig.setFraming(null);
    // Done: the next step is in the city (Aara waits at the door there); the beam leads out of the front door.
    ctx.save.setBab5('city');
    this.done = true;
    ctx.game.setControlsEnabled(true);
    ctx.objectives.set(this.tmp.set(this.exit.x, 0, this.exit.z));
    ctx.game.debugInfo.ch5Lab = 'done';
  }
}
