import * as THREE from 'three';
import type { Level, LevelContext } from '../Level';
import { makeMaterials } from '../bab1/Batch';
import { Kit } from '../bab1/Kit';
import { Hangar } from './Hangar';
import { NinoActor } from './NinoActor';
import { ProgressRow } from './ProgressRow';
import { HoldHint } from './Hints';
import { RingsExercise } from './RingsExercise';
import { LaserExercise } from './LaserExercise';
import { ShieldExercise } from './ShieldExercise';
import { Lunch } from './Lunch';
import { Story } from './Story';
import { FLY_MAX, HALL, NINO_SPOT } from './Layout';
import type { Env } from './Env';

/**
 * Chapter 2: Latihan Pagi Bersama Nino. One big bright training hall with four floor stations (flying, laser, shield,
 * lunch) and a wall screen. First visit: the story (Story.ts). Once the chapter is done the hall is free play with all
 * skills, the exercises restart when the player steps on their icon, and a door leads back to the lab.
 */
export class Bab2Level implements Level {
  readonly id = 'bab2';
  readonly spawn = { x: 0, y: 0, z: 0, yaw: Math.PI };

  private ctx!: LevelContext;
  private env!: Env;
  private rings!: RingsExercise;
  private laser!: LaserExercise;
  private shield!: ShieldExercise;
  private lunch!: Lunch;
  private story!: Story;
  private readonly goal = { x: 0, y: 0, z: 0 };

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    const done = ctx.save.isChapterDone('bab2');
    const { root, physics, scene, game } = ctx;

    game.setTransformAllowed(false);
    game.setPlayerMode('superglen');
    // Finished chapter: every power is ready. Story: only Lompat Barongsai until each unlock step.
    game.setSkills(done ? { laser: true, shield: true, fly: true } : { laser: false, shield: false, fly: false });
    const fl = ctx.player.flight;
    fl.maxFlyHeight = FLY_MAX;
    fl.bounds = { minX: HALL.minX + 0.5, maxX: HALL.maxX - 0.5, minZ: HALL.minZ + 0.5, maxZ: HALL.maxZ - 0.5 };

    // Morning light: bright hemisphere + one warm sun from the window side. No shadow casters (cheap), constant light count.
    scene.background = new THREE.Color(0xcfe3ff);
    scene.fog = new THREE.Fog(0xdfeaff, 70, 160);
    const hemi = new THREE.HemisphereLight(0xf4f9ff, 0xe3d9c4, 2.7);
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    sun.position.set(18, 22, 8);
    root.add(hemi, sun);

    const kit = new Kit(physics, makeMaterials(), false);
    const hangar = new Hangar(ctx, kit);
    kit.build(root);
    const nino = new NinoActor(ctx, NINO_SPOT.start.x, NINO_SPOT.start.z);
    const row = new ProgressRow(ctx);
    const hold = new HoldHint(ctx);
    this.env = { ctx, hangar, nino, row, hold };
    this.rings = new RingsExercise(this.env);
    this.laser = new LaserExercise(this.env);
    this.shield = new ShieldExercise(this.env);
    this.lunch = new Lunch(this.env);
    this.story = new Story({ env: this.env, rings: this.rings, laser: this.laser, shield: this.shield, lunch: this.lunch });
    ctx.onDispose(() => hold.set(false));

    if (done) this.story.setupFree();
    else this.story.start();
  }

  fixedUpdate(dt: number): void {
    this.rings.tick(dt);
    this.laser.tick(dt);
    this.shield.tick(dt);
    this.lunch.tick(dt);
  }

  update(dt: number): void {
    const { hangar, nino, row } = this.env;
    hangar.update(dt);
    nino.update(dt);
    row.setLowered(this.ctx.dialog.active);
    const info = this.ctx.game.debugInfo;
    info.step = this.story.step;
    info.free = this.story.free;
    info.rings = this.rings.count;
    info.ringIndex = this.rings.current;
    info.ringFallbacks = this.rings.fallbacks;
    info.targets = this.laser.count;
    info.targetFallbacks = this.laser.fallbacks;
    info.laserMisses = this.laser.misses;
    info.blocks = this.shield.count;
    info.shieldFallbacks = this.shield.fallbacks;
    info.thrown = this.shield.thrower.thrown;
    info.thrownInterval = this.shield.thrower.interval;
    info.rowKind = row.visible ? row.shownKind : '';
    info.rowCount = row.visible ? row.count : -1;
    info.holdHint = this.env.hold.shown;
    info.alarm = Math.round(hangar.alarmLevel * 100) / 100;
    info.market = hangar.marketShown;
    info.alarmHz = hangar.pulseHz;
    info.crouch = Math.round(this.ctx.player.crouch * 100) / 100;
    info.lunch = this.lunch.running;
    for (const ex of [this.rings, this.laser, this.shield]) {
      if (ex.goal(this.goal)) {
        info.goalKind = ex.kind;
        info.goalX = Math.round(this.goal.x * 100) / 100;
        info.goalY = Math.round(this.goal.y * 100) / 100;
        info.goalZ = Math.round(this.goal.z * 100) / 100;
        break;
      }
      info.goalKind = '';
    }
  }

  dispose(): void {
    // Everything lives under ctx.root / physics / interactions; the DOM pieces remove themselves via onDispose.
  }
}
