import * as THREE from 'three';
import { startGate } from '../../core/StartGate';
import { Combat } from '../../config/combat';
import type { Level, LevelContext } from '../Level';
import { backToTraining, isPractice, travel } from '../progress';
import { EagleBoss } from './EagleBoss';
import { EAGLE_SKY, EagleScenery } from './EagleScenery';

/** Separate night sky arena: the city is unloaded and Glen starts inside the fight. */
export class EagleArena implements Level {
  readonly id = 'battle-elang';
  readonly spawn = { x: 0, y: 0, z: Combat.eagle.entryZ, yaw: Math.PI };
  private ctx!: LevelContext;
  private boss!: EagleBoss;
  private finishing = false;
  /** Practice fight from the Lab training room: no story progress, back to the room at the end. */
  private practice = false;
  private lastExhaustions = 0;
  private scenery: EagleScenery | null = null;

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    this.practice = isPractice(this.id);
    this.lastExhaustions = ctx.health.exhaustions;
    // Twilight sky arena: warm low sun, violet dusk; feathers (cold blue / warm red) stay the brightest things.
    ctx.scene.background = new THREE.Color(EAGLE_SKY.mid);
    ctx.scene.fog = new THREE.Fog(EAGLE_SKY.fog, 38, 120);
    ctx.root.add(new THREE.HemisphereLight(0xdccfff, 0xa89bbf, 1.45));
    const sun = new THREE.DirectionalLight(0xffd7aa, 1.7);
    sun.position.set(-14, 20, -10);
    ctx.root.add(sun);
    this.buildNightCity(ctx);
    this.scenery = new EagleScenery(ctx.root);
    ctx.onDispose(() => this.scenery?.dispose());
    ctx.physics.addFixedCuboid({ x: 32, y: 0.5, z: 32 }, { x: 0, y: -0.5, z: 0 });
    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({ fly: true, laser: true, shield: true });
    ctx.player.flight.maxFlyHeight = Combat.eagle.flyHeight;
    const radius = Combat.eagle.arenaRadius;
    ctx.player.flight.bounds = { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius };
    ctx.health.setShown(true);
    ctx.onDispose(() => {
      ctx.health.setShown(false);
      if (ctx.save.data.slot?.level === 'battle-elang') ctx.save.setSlot(null);
    });
    this.boss = new EagleBoss(ctx, () => this.win());
    ctx.game.preloadCinematic('elang');
    ctx.game.preloadCinematic('elang-defeat');
    ctx.game.debugInfo.elangStage = 'fight';
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      (window as unknown as { __elang?: unknown }).__elang = this.boss;
      ctx.onDispose(() => { delete (window as unknown as { __elang?: unknown }).__elang; });
    }
    if (this.practice) {
      const exit = document.createElement('button');
      exit.className = 'arena-return';
      exit.textContent = 'Kembali ke ruang latihan';
      exit.addEventListener('click', () => { if (!this.finishing) { this.finishing = true; ctx.battle.exit(); void backToTraining(ctx.game); } });
      ctx.ui.appendChild(exit);
      ctx.onDispose(() => exit.remove());
    }
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (this.practice) { this.enterBattle(); return; }
      // The city approach already played it; direct arena previews and resumed fights still get the introduction.
      await ctx.game.playCinematic('elang');
      this.enterBattle();
      await ctx.dialog.say('elang_nino_lawan', { lockControls: true });
    });
  }

  fixedUpdate(dt: number): void {
    const ctx = this.ctx;
    this.scenery?.update(dt);
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

  /** A rooftop above lit streets: scenery stays outside the flight space, with no crowd/city simulation. */
  private buildNightCity(ctx: LevelContext): void {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xa9a0cc, roughness: 0.9 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a5b98, roughness: 0.9 });
    const streetMat = new THREE.MeshStandardMaterial({ color: 0x5a4d80 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe3a0 });
    const roof = new THREE.Mesh(box, roofMat);
    roof.position.y = -0.3;
    roof.scale.set(42, 0.6, 42);
    ctx.root.add(roof);
    const bank = new THREE.Mesh(box, bodyMat);
    bank.position.set(0, -5, 0);
    bank.scale.set(42, 9.4, 42);
    ctx.root.add(bank);
    const streets = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), streetMat);
    streets.rotation.x = -Math.PI / 2;
    streets.position.y = -9.8;
    ctx.root.add(streets);
    // Instancing keeps the skyline and hundreds of lit windows to two draw calls.
    const buildings = new THREE.InstancedMesh(box, bodyMat, 24);
    const windows = new THREE.InstancedMesh(box, lightMat, 24 * 12);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    let wi = 0;
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      const radius = i % 2 ? 55 : 39;
      const height = 8 + (i * 7 % 15);
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      position.set(x, height / 2 - 9.8, z);
      scale.set(8, height, 8);
      buildings.setMatrixAt(i, matrix.compose(position, rotation, scale));
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
        const y = -7 + row * (height - 3) / 3;
        // Put windows on the inward-facing facade.
        if (Math.abs(x) > Math.abs(z)) {
          position.set(x - Math.sign(x) * 4.02, y, z + (col - 1.5) * 1.7);
          scale.set(0.05, 1.1, 0.8);
        } else {
          position.set(x + (col - 1.5) * 1.7, y, z - Math.sign(z) * 4.02);
          scale.set(0.8, 1.1, 0.05);
        }
        windows.setMatrixAt(wi++, matrix.compose(position, rotation, scale));
      }
    }
    ctx.root.add(buildings, windows);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const paint = canvas.getContext('2d');
    if (paint) {
      paint.fillStyle = '#3d3470'; paint.fillRect(0, 0, 512, 128);
      paint.fillStyle = '#ffe9b0'; paint.font = 'bold 72px sans-serif';
      paint.textAlign = 'center'; paint.fillText('BANK', 256, 92);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide }));
      sign.position.set(0, 2, -21);
      ctx.root.add(sign);
    }
  }

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
      if (this.practice) {
        ctx.save.addCoins(10);
        ctx.quiz.coinsChanged();
        await ctx.seq.wait(1.2);
        await backToTraining(ctx.game);
        return;
      }
      await ctx.game.playCinematic('elang-defeat');
      ctx.game.setControlsEnabled(false);
      await ctx.dialog.say('elang_nino_menang', { lockControls: true });
      ctx.save.markChapterDone('bab7');
      ctx.save.finishCityMission('bab7', 25);
      ctx.quiz.coinsChanged();
      ctx.save.setInterlude('elang_home');
      if (ctx.save.data.slot?.level === 'battle-elang') ctx.save.setSlot(null);
      ctx.game.debugInfo.elangStage = 'tamed';
      await travel(ctx.game, 'kota', 'elangVictory');
    });
  }
}
