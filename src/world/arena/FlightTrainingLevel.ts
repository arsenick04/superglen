import * as THREE from 'three';
import { FlightTrainingCombat } from '../../config/combat';
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

const ROUTES = [
  { radius: 2.5, points: [[0, -12], [-7, -22], [7, -31], [0, -37]] },
  { radius: 1.9, points: [[-9, -29], [9, -20], [-8, -11], [8, -23], [0, -37]] },
  { radius: 1.3, points: [[10, -28], [-10, -18], [9, -9], [-9, -27], [9, -36], [0, -30]] },
] as const;

export const FlightTrainingLines = {
  easy: { id: 'flight_nino_easy', speaker: 'nino', text: 'Level satu! Tahan lompat tetap bisa untuk terbang. Sekarang tombol roket juga bisa menjaga Glen di udara. Lewati empat lingkaran besar!' },
  medium: { id: 'flight_nino_medium', speaker: 'nino', text: 'Level dua! Ikuti lima lingkaran yang lebih kecil, lalu bidik sasaran bergerak dan tangkis tiga bola.' },
  hard: { id: 'flight_nino_hard', speaker: 'nino', text: 'Level tiga! Lewati enam lingkaran sempit. Sasaran dan bola makin cepat. Tetap tenang dan gunakan perisai!' },
  laser: { id: 'flight_nino_laser', speaker: 'nino', text: 'Lintasan selesai! Tetap terbang dan tembak semua sasaran yang muncul bergantian.' },
  shield: { id: 'flight_nino_shield', speaker: 'nino', text: 'Sekarang hadapi mesin bola. Tetap di udara dan tangkis bolanya dengan perisai sampai latihan level ini selesai.' },
  done: { id: 'flight_nino_done', speaker: 'nino', text: 'Tiga level selesai! Glen sudah mahir terbang, membidik, dan bertahan di udara. Ayo kembali ke Lab!' },
} as const;

/** After the SUPERGLEN letters: learn the one-tap flight switch while using laser and shield in the air. */
export class FlightTrainingLevel implements Level {
  readonly id = 'flight-training';
  readonly spawn = { x: 0, y: 0, z: -3, yaw: Math.PI };
  private ctx: LevelContext | null = null;
  private hangar: Hangar | null = null;
  private rings: FlyRing[][] = [];
  private targets: PracticeTarget[] = [];
  private round = 0;
  private hits = 0;
  private blocks = 0;
  private readonly goal = new THREE.Vector3();
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

    this.rings = ROUTES.map((route) => route.points.map(([x, z], i) => {
      const ring = new FlyRing(ctx, { x, y: 9, z, yaw: Math.PI, radius: route.radius, rearmAfter: 0, onPass: () => this.passRing(i) });
      ring.group.visible = false;
      return ring;
    }));
    this.targets = FlightTrainingCombat.map((tuning, round) => {
      const target = new PracticeTarget(ctx, { x: -6, z: -39, height: 9, radius: tuning.targetRadius,
        path: round ? [[-6, -39], [6, -39]] : undefined, speed: tuning.targetSpeed,
        resetAfter: 0, id: `flightTrainingTarget${round}`, onHit: () => this.hitTarget() });
      target.hide();
      return target;
    });
    this.thrower = new BallThrower(ctx, { x: 8, z: -29, groundY: 7.5, range: 50, interval: 3.5, speed: 6, gravity: 0, color: 0xff8b47 });
    this.thrower.enabled = false;
    this.unsub = ctx.player.skills.on('shieldBlock', () => this.blockBall());
    this.beginRound();
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      await ctx.dialog.say(FlightTrainingLines.easy, { lockControls: true });
    });
  }

  fixedUpdate(dt: number): void {
    if (!this.ctx || !this.ctx.game.controlsEnabled || this.finishing) return;
    if (this.stage === 0 && this.ctx.player.flight.isFlying) this.rings[this.round][this.index]?.tick(dt);
    if (this.stage === 1 && this.target) {
      // Ground shots never satisfy an aerial lesson; leave the target available for a retry.
      this.target.target.enabled = this.ctx.player.flight.isFlying && !this.target.isDown;
      this.target.tick(dt);
      this.ctx.objectives.set(this.target.aim);
    }
    this.thrower?.tick(dt);
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
    this.targets = [];
    this.target = null;
    this.thrower = null;
  }

  private beginRound(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.stage = this.index = this.hits = this.blocks = 0;
    this.target = this.targets[this.round];
    const tuning = FlightTrainingCombat[this.round];
    if (this.thrower) {
      this.thrower.enabled = false;
      this.thrower.interval = tuning.interval;
      this.thrower.speed = tuning.speed;
    }
    this.rings[this.round][0].group.visible = true;
    this.setRingGoal();
    ctx.game.debugInfo.flightTrainingRound = this.round + 1;
    ctx.game.debugInfo.flightTrainingStage = 'rings';
    ctx.game.debugInfo.flightTrainingProgress = 0;
  }

  private setRingGoal(): void {
    const p = this.rings[this.round][this.index].centre;
    this.goal.set(p.x, p.y, p.z);
    this.ctx?.objectives.set(this.goal);
  }

  private passRing(i: number): void {
    if (!this.ctx || this.stage !== 0 || i !== this.index) return;
    const rings = this.rings[this.round];
    rings[i].group.visible = false;
    this.index++;
    this.ctx.game.debugInfo.flightTrainingProgress = this.index;
    if (this.index < rings.length) {
      rings[this.index].group.visible = true;
      this.setRingGoal();
      return;
    }
    this.stage = 1;
    this.target?.show(1);
    this.ctx.game.debugInfo.flightTrainingStage = 'laser';
    this.ctx.game.debugInfo.flightTrainingProgress = 0;
    void this.ctx.dialog.say(FlightTrainingLines.laser);
  }

  private hitTarget(): void {
    if (!this.ctx || this.stage !== 1 || !this.target) return;
    this.hits++;
    this.ctx.game.debugInfo.flightTrainingProgress = this.hits;
    if (this.hits < FlightTrainingCombat[this.round].targets) {
      this.target.moveTo(this.hits % 2 ? 6 : -6, -39);
      this.target.show(1);
      return;
    }
    this.stage = 2;
    this.target.hide();
    if (this.thrower) this.thrower.enabled = true;
    this.ctx.objectives.set(this.goal.set(8, 9, -29));
    this.ctx.game.debugInfo.flightTrainingStage = 'shield';
    this.ctx.game.debugInfo.flightTrainingProgress = 0;
    void this.ctx.dialog.say(FlightTrainingLines.shield);
  }

  private blockBall(): void {
    const ctx = this.ctx;
    if (!ctx || this.stage !== 2 || !ctx.player.flight.isFlying || this.finishing) return;
    this.blocks++;
    ctx.game.debugInfo.flightTrainingProgress = this.blocks;
    if (this.blocks < FlightTrainingCombat[this.round].blocks) return;
    if (this.thrower) this.thrower.enabled = false;
    if (this.round < ROUTES.length - 1) {
      this.round++;
      this.beginRound();
      void ctx.dialog.say(this.round === 1 ? FlightTrainingLines.medium : FlightTrainingLines.hard);
      return;
    }
    this.finishing = true;
    ctx.game.debugInfo.flightTrainingStage = 'complete';
    ctx.seq.run(async () => {
      ctx.objectives.clear();
      await ctx.dialog.say(FlightTrainingLines.done, { lockControls: true });
      ctx.save.markChapterDone('flight-training-unlocked');
      ctx.save.setInterlude('elang_bank');
      await travel(ctx.game, 'lab', 'labFromHangar');
    });
  }
}
