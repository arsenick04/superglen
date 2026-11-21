import * as THREE from 'three';
import { startGate } from '../../core/StartGate';
import { Combat } from '../../config/combat';
import type { Level, LevelContext } from '../Level';
import { travel } from '../progress';
import { EagleBoss } from './EagleBoss';

/** Separate night sky arena: the city is unloaded and Glen starts inside the fight. */
export class EagleArena implements Level {
  readonly id = 'battle-elang';
  readonly spawn = { x: 0, y: 0, z: Combat.eagle.entryZ, yaw: Math.PI };
  private ctx!: LevelContext;
  private boss!: EagleBoss;
  private finishing = false;
  private lastExhaustions = 0;

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    this.lastExhaustions = ctx.health.exhaustions;
    ctx.scene.background = new THREE.Color(0x1b2d57);
    ctx.scene.fog = new THREE.Fog(0x253b61, 35, 100);
    ctx.root.add(new THREE.HemisphereLight(0xc5d8ff, 0x89929f, 1.35));
    const moon = new THREE.DirectionalLight(0xc4dcff, 1.5);
    moon.position.set(-14, 24, 8);
    ctx.root.add(moon);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(28, 56), new THREE.MeshStandardMaterial({ color: 0x71899e, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    ctx.root.add(floor);
    const center = new THREE.Mesh(new THREE.CircleGeometry(Combat.eagle.arenaRadius - 0.8, 56), new THREE.MeshStandardMaterial({ color: 0x8792ad, roughness: 0.85 }));
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.005;
    ctx.root.add(center);
    ctx.physics.addFixedCuboid({ x: 32, y: 0.5, z: 32 }, { x: 0, y: -0.5, z: 0 });
    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({ fly: true, laser: true, shield: true });
    ctx.player.flight.maxFlyHeight = Combat.eagle.flyHeight;
    ctx.player.flight.bounds = { minX: -17, maxX: 17, minZ: -17, maxZ: 17 };
    ctx.health.setShown(true);
    ctx.onDispose(() => {
      ctx.health.setShown(false);
      if (ctx.save.data.slot?.level === 'battle-elang') ctx.save.setSlot(null);
    });
    this.boss = new EagleBoss(ctx, () => this.win());
    ctx.game.preloadCinematic('elang');
    ctx.game.debugInfo.elangStage = 'fight';
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      // The city approach already played it; direct arena previews and resumed fights still get the introduction.
      await ctx.game.playCinematic('elang');
      this.enterBattle();
      await ctx.dialog.say('elang_nino_lawan', { lockControls: true });
    });
  }

  fixedUpdate(dt: number): void {
    const ctx = this.ctx;
    if (ctx.health.exhaustions !== this.lastExhaustions && !this.finishing) {
      this.lastExhaustions = ctx.health.exhaustions;
      this.boss.reset();
      ctx.seq.run(async () => {
        await ctx.seq.waitUntil(() => !ctx.health.resting && ctx.game.controlsEnabled);
        this.enterBattle();
      });
    }
    this.boss.fixedUpdate(dt, !this.finishing && ctx.game.controlsEnabled && ctx.battle.active && !ctx.battle.entering && !ctx.health.resting);
    ctx.game.debugInfo.elangStars = this.boss.stars;
    ctx.game.debugInfo.elangPhase = this.boss.phase;
    ctx.game.debugInfo.elangWing = this.boss.wing;
    ctx.game.debugInfo.elangVolleys = this.boss.volleys;
  }

  update(): void {
    this.boss.update();
  }

  dispose(): void {}

  private enterBattle(): void {
    const b = this.boss;
    this.ctx.battle.enter({
      id: 'elang_belang', name: 'Elang Belang', focus: () => b.aim,
      arena: { x: 0, z: 0, r: Combat.eagle.arenaRadius },
      stars: () => ({ left: b.stars, max: b.maxStars }), ownBar: true,
      aura: 0x77baff,
    });
  }

  private win(): void {
    if (this.finishing) return;
    this.finishing = true;
    const ctx = this.ctx;
    ctx.seq.run(async () => {
      ctx.game.setControlsEnabled(false);
      ctx.battle.exit(true);
      await ctx.dialog.say('elang_nino_menang', { lockControls: true });
      ctx.save.markChapterDone('bab7');
      ctx.save.setInterlude('elang_home');
      if (ctx.save.data.slot?.level === 'battle-elang') ctx.save.setSlot(null);
      ctx.game.debugInfo.elangStage = 'tamed';
      await travel(ctx.game, 'kota', 'elangVictory');
    });
  }
}
