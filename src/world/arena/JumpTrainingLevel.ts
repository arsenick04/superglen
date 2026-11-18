import * as THREE from 'three';
import { Quality } from '../../core/Quality';
import { ShadowFollower } from '../../core/ShadowSnap';
import { startGate } from '../../core/StartGate';
import type { Level, LevelContext } from '../Level';
import { travel } from '../progress';
import { ArenaLompat } from './ArenaLompat';
import { ARENA_LAYOUT } from './ArenaData';

const GROUND_W = 64;
const GROUND_Z0 = -20;
const GROUND_Z1 = -104;

/** Post-Ular lesson: three increasingly high checkpoints in the existing platform arena. */
export class JumpTrainingLevel implements Level {
  readonly id = 'jump-training';
  readonly spawn = { x: -10, y: 0, z: -27, yaw: Math.PI };
  private arena: ArenaLompat | null = null;
  private follower: ShadowFollower | null = null;
  private readonly sunOffset = new THREE.Vector3(14, 24, 10);
  private readonly feet = new THREE.Vector3();
  private ctx: LevelContext | null = null;
  private stage = 0;
  private advancing = false;
  private readonly goals = [ARENA_LAYOUT.poles[0], ARENA_LAYOUT.poles[2], ARENA_LAYOUT.poles[4]];

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    ctx.scene.background = new THREE.Color(0x8fd3ff);
    ctx.scene.fog = new THREE.Fog(0x8fd3ff, Quality.cameraFar * 0.5, Quality.cameraFar * 0.95);
    const hemi = new THREE.HemisphereLight(0xd9f2ff, 0x6fae4f, 1.45);
    const sun = new THREE.DirectionalLight(0xfff1d0, 2.5);
    sun.position.copy(this.sunOffset);
    sun.castShadow = Quality.shadows;
    sun.target.position.set(0, 0, -45);
    ctx.root.add(hemi, sun, sun.target);
    this.follower = new ShadowFollower(sun, this.sunOffset, Quality.shadowArea, Quality.shadowMapSize);

    const depth = GROUND_Z0 - GROUND_Z1;
    const cz = (GROUND_Z0 + GROUND_Z1) / 2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_W, depth).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x83bd72, roughness: 0.95 }),
    );
    ground.position.z = cz;
    ground.receiveShadow = true;
    ctx.root.add(ground);
    ctx.physics.addFixedCuboid({ x: GROUND_W / 2, y: 0.5, z: depth / 2 }, { x: 0, y: -0.5, z: cz });

    this.arena = new ArenaLompat(ctx);
    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({ laser: false, shield: false, fly: false });
    ctx.audio.music.setScene('latihan');
    this.setGoal();
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      await ctx.dialog.say({ speaker: 'nino', text: 'Tiga tingkat Lompat Barongsai! Ikuti cahaya dari pijakan rendah sampai yang paling tinggi.' }, { lockControls: true });
    });
    ctx.game.debugInfo.jumpTrainingStage = 1;
  }

  fixedUpdate(dt: number): void {
    this.arena?.tick(dt);
    const ctx = this.ctx;
    const goal = this.goals[this.stage];
    if (!ctx || !goal || this.advancing || !ctx.game.controlsEnabled) return;
    ctx.player.getFeetPosition(this.feet);
    if (Math.hypot(this.feet.x - goal.x, this.feet.z - goal.z) > 1.15 || this.feet.y < goal.top - 0.35) return;
    this.advancing = true;
    ctx.seq.run(async () => {
      ctx.fx.sparkles.burst(goal.x, goal.top + 0.25, goal.z, 26, 3.4, 0xffd23f, { gravity: 2, life: 1, up: 0.8 });
      this.stage++;
      ctx.game.debugInfo.jumpTrainingStage = this.stage + 1;
      if (this.stage < this.goals.length) {
        await ctx.dialog.say({ speaker: 'nino', text: `Tingkat ${this.stage} selesai! Sekarang naik ke tingkat ${this.stage + 1}.` }, { lockControls: true });
        this.setGoal();
        this.advancing = false;
        return;
      }
      ctx.objectives.clear();
      await ctx.dialog.say({ speaker: 'nino', text: 'Hebat! Tiga tingkat selesai. Lompat Barongsaimu siap untuk pertarungan berikutnya!' }, { lockControls: true });
      ctx.save.setInterlude('');
      await travel(ctx.game, 'lab', 'labFromHangar');
    });
  }

  update(dt: number): void {
    if (this.ctx) this.follower?.follow(this.ctx.player.visualPosition);
    this.arena?.update(dt);
  }

  dispose(): void {
    this.ctx = null;
    this.arena = null;
    this.follower = null;
  }

  private setGoal(): void {
    const g = this.goals[this.stage];
    if (g && this.ctx) this.ctx.objectives.set(new THREE.Vector3(g.x, g.top, g.z));
  }
}
