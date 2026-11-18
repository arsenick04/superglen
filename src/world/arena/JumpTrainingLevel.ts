import * as THREE from 'three';
import { startGate } from '../../core/StartGate';
import { makeMaterials } from '../bab1/Batch';
import { C, Kit } from '../bab1/Kit';
import { Hangar } from '../bab2/Hangar';
import { HALL } from '../bab2/Layout';
import type { Level, LevelContext } from '../Level';
import { travel } from '../progress';

interface Course {
  name: string;
  start: { x: number; z: number };
  radius: number;
  color: number;
  steps: readonly { x: number; z: number; top: number }[];
}

const COURSES: readonly Course[] = [
  {
    name: 'mudah', start: { x: -10, z: -3 }, radius: 1.7, color: C.MINT,
    steps: [
      { x: -10, z: -8, top: 0.65 }, { x: -10, z: -13, top: 1.0 },
      { x: -10, z: -18, top: 1.35 }, { x: -10, z: -23, top: 1.7 },
    ],
  },
  {
    name: 'menengah', start: { x: 0, z: -3 }, radius: 1.05, color: C.ORANGE,
    steps: [
      { x: -1.2, z: -8, top: 0.8 }, { x: 1.2, z: -13, top: 1.55 },
      { x: -1.2, z: -18, top: 2.3 }, { x: 1.2, z: -23, top: 3.05 },
      { x: 0, z: -28, top: 3.8 },
    ],
  },
  {
    name: 'sulit', start: { x: 10, z: -3 }, radius: 0.62, color: C.RED,
    // The 4.1 m rises cannot be cleared by the normal jump alone; use the air jump.
    steps: [
      { x: 10, z: -9, top: 1.2 }, { x: 8.5, z: -15, top: 5.3 },
      { x: 11, z: -21, top: 9.4 }, { x: 9, z: -27, top: 10.4 },
    ],
  },
] as const;

/** Post-Ular lesson inside Nino's hangar: large, medium, then small/double-jump platforms. */
export class JumpTrainingLevel implements Level {
  readonly id = 'jump-training';
  readonly spawn = { x: -10, y: 0, z: -3, yaw: Math.PI };
  private ctx: LevelContext | null = null;
  private hangar: Hangar | null = null;
  private readonly feet = new THREE.Vector3();
  private stage = 0;
  private advancing = false;

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
    for (const course of COURSES) {
      for (const step of course.steps) {
        kit.solidCyl(course.radius, step.top, [step.x, step.top / 2, step.z], course.color);
        kit.glow.cyl(course.radius + 0.05, 0.06, [step.x, step.top + 0.03, step.z], 0xffd23f);
      }
    }
    kit.build(ctx.root);

    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({ laser: false, shield: false, fly: false });
    ctx.player.flight.bounds = { minX: HALL.minX + 0.5, maxX: HALL.maxX - 0.5, minZ: HALL.minZ + 0.5, maxZ: HALL.maxZ - 0.5 };
    ctx.audio.music.setScene('latihan');
    this.setGoal();
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      await ctx.dialog.say({ speaker: 'nino', text: 'Mulai dari lintasan mudah: pijakannya besar. Setelah itu menengah dan sulit!' }, { lockControls: true });
    });
    ctx.game.debugInfo.jumpTrainingStage = 1;
    ctx.game.debugInfo.jumpTrainingCourse = COURSES[0].name;
  }

  fixedUpdate(): void {
    const ctx = this.ctx;
    const course = COURSES[this.stage];
    const goal = course?.steps[course.steps.length - 1];
    if (!ctx || !course || !goal || this.advancing || !ctx.game.controlsEnabled) return;
    ctx.player.getFeetPosition(this.feet);
    if (Math.hypot(this.feet.x - goal.x, this.feet.z - goal.z) > course.radius + 0.35 || Math.abs(this.feet.y - goal.top) > 0.7) return;
    this.advancing = true;
    ctx.seq.run(async () => {
      ctx.fx.sparkles.burst(goal.x, goal.top + 0.25, goal.z, 28, 3.5, 0xffd23f, { gravity: 2, life: 1, up: 0.8 });
      this.stage++;
      if (this.stage < COURSES.length) {
        const next = COURSES[this.stage];
        await ctx.dialog.say({ speaker: 'nino', text: `Lintasan ${course.name} selesai! Berikutnya ${next.name}.` }, { lockControls: true });
        ctx.player.placeAt(next.start.x, 0, next.start.z, Math.PI);
        ctx.cameraRig.snapBehind(Math.PI);
        ctx.game.debugInfo.jumpTrainingStage = this.stage + 1;
        ctx.game.debugInfo.jumpTrainingCourse = next.name;
        this.setGoal();
        this.advancing = false;
        return;
      }
      ctx.objectives.clear();
      await ctx.dialog.say({ speaker: 'nino', text: 'Hebat! Pijakan kecil dan double jump pun berhasil. Latihan selesai!' }, { lockControls: true });
      ctx.save.setInterlude('');
      await travel(ctx.game, 'lab', 'labFromHangar');
    });
  }

  update(dt: number): void {
    this.hangar?.update(dt);
  }

  dispose(): void {
    this.ctx = null;
    this.hangar = null;
  }

  private setGoal(): void {
    const course = COURSES[this.stage];
    const goal = course?.steps[course.steps.length - 1];
    if (goal && this.ctx) this.ctx.objectives.set(new THREE.Vector3(goal.x, goal.top, goal.z));
  }
}
