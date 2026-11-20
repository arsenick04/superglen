import * as THREE from 'three';
import { startGate } from '../../core/StartGate';
import { BallThrower } from '../../gameplay/props/BallThrower';
import { FlyRing } from '../../gameplay/props/FlyRing';
import { PracticeTarget } from '../../gameplay/props/PracticeTarget';
import { makeMaterials } from '../bab1/Batch';
import { Kit } from '../bab1/Kit';
import { Hangar } from '../bab2/Hangar';
import { HALL } from '../bab2/Layout';
import type { Level, LevelContext } from '../Level';
import { travel } from '../progress';

const PATH = [[0, 3.5, -11], [0, 5.5, -19], [0, 6, -27]] as const;

/** After the SUPERGLEN letters: learn the one-tap flight switch while using laser and shield in the air. */
export class FlightTrainingLevel implements Level {
  readonly id = 'flight-training';
  readonly spawn = { x: 0, y: 0, z: -3, yaw: Math.PI };
  private ctx: LevelContext | null = null;
  private hangar: Hangar | null = null;
  private rings: FlyRing[] = [];
  private target: PracticeTarget | null = null;
  private thrower: BallThrower | null = null;
  private stage = 0;
  private index = 0;
  private finishing = false;
  private unsub: (() => void) | null = null;

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    ctx.scene.background = new THREE.Color(0xcfe3ff);
    ctx.scene.fog = new THREE.Fog(0xdfeaff, 70, 160);
    ctx.root.add(new THREE.HemisphereLight(0xf4f9ff, 0xd9d2c4, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
    sun.position.set(18, 22, 8);
    ctx.root.add(sun);
    const kit = new Kit(ctx.physics, makeMaterials(), false);
    this.hangar = new Hangar(ctx, kit);
    kit.build(ctx.root);

    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    ctx.player.flight.toggleEnabled = true;
    ctx.game.setSkills({ fly: true, laser: true, shield: true });
    ctx.player.flight.maxFlyHeight = 8.5;
    ctx.player.flight.bounds = { minX: HALL.minX + 1, maxX: HALL.maxX - 1, minZ: HALL.minZ + 1, maxZ: HALL.maxZ - 1 };
    ctx.audio.music.setScene('latihan');

    this.rings = PATH.map(([x, y, z], i) => {
      const ring = new FlyRing(ctx, { x, y, z, yaw: Math.PI, radius: 2.5, rearmAfter: 0, onPass: () => this.passRing(i) });
      ring.group.visible = i === 0;
      return ring;
    });
    this.target = new PracticeTarget(ctx, { x: 0, z: -38, height: 5.5, yaw: 0, radius: 1.1, resetAfter: 0, id: 'flightTrainingTarget', onHit: () => this.hitTarget() });
    this.target.hide();
    this.thrower = new BallThrower(ctx, { x: 8, z: -29, range: 30, interval: 3.5, speed: 6, color: 0xff8b47 });
    this.thrower.enabled = false;
    this.unsub = ctx.player.skills.on('shieldBlock', () => this.blockBall());
    ctx.objectives.set(new THREE.Vector3(...PATH[0]));
    ctx.game.debugInfo.flightTrainingStage = 'rings';
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      await ctx.dialog.say({ speaker: 'nino', text: 'Tekan tombol roket sekali untuk terbang. Arahkan Glen melewati tiga lingkaran cahaya!' }, { lockControls: true });
    });
  }

  fixedUpdate(dt: number): void {
    if (!this.ctx || !this.ctx.game.controlsEnabled || this.finishing) return;
    if (this.stage === 0) this.rings[this.index]?.tick(dt);
    if (this.stage === 1) this.target?.tick(dt);
    if (this.stage === 2) this.thrower?.tick(dt);
  }

  update(dt: number): void {
    this.hangar?.update(dt);
  }

  dispose(): void {
    this.unsub?.();
    this.unsub = null;
    this.ctx = null;
    this.hangar = null;
    this.rings = [];
    this.target = null;
    this.thrower = null;
  }

  private passRing(i: number): void {
    if (!this.ctx || this.stage !== 0 || i !== this.index) return;
    this.rings[i].group.visible = false;
    this.index++;
    if (this.index < this.rings.length) {
      this.rings[this.index].group.visible = true;
      this.ctx.objectives.set(new THREE.Vector3(...PATH[this.index]));
      return;
    }
    this.stage = 1;
    this.target?.show(1);
    this.ctx.objectives.set(new THREE.Vector3(0, 5.5, -38));
    this.ctx.game.debugInfo.flightTrainingStage = 'laser';
    void this.ctx.dialog.say({ speaker: 'nino', text: 'Bagus! Tetap di udara dan tembak sasaran dengan laser.' });
  }

  private hitTarget(): void {
    if (!this.ctx || this.stage !== 1) return;
    this.stage = 2;
    this.target?.hide();
    if (this.thrower) this.thrower.enabled = true;
    this.ctx.objectives.set(new THREE.Vector3(8, 3, -29));
    this.ctx.game.debugInfo.flightTrainingStage = 'shield';
    void this.ctx.dialog.say({ speaker: 'nino', text: 'Sekarang aktifkan perisai sambil terbang untuk menangkis bola latihan.' });
  }

  private blockBall(): void {
    const ctx = this.ctx;
    if (!ctx || this.stage !== 2 || !ctx.player.flight.isFlying || this.finishing) return;
    this.finishing = true;
    if (this.thrower) this.thrower.enabled = false;
    ctx.game.debugInfo.flightTrainingStage = 'complete';
    ctx.seq.run(async () => {
      ctx.objectives.clear();
      await ctx.dialog.say({ speaker: 'nino', text: 'Hebat, Glen! Kamu bisa terbang, menembak, dan bertahan di udara. Latihan selesai!' }, { lockControls: true });
      ctx.save.setInterlude('');
      await travel(ctx.game, 'lab', 'labFromHangar');
    });
  }
}
