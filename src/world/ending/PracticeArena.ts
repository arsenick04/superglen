import * as THREE from 'three';
import { Combat } from '../../config/combat';
import { startGate } from '../../core/StartGate';
import type { Level, LevelContext } from '../Level';
import { Celebration } from '../Celebration';
import { backToTraining } from '../progress';
import { SnakeBoss } from '../kota/SnakeBoss';
import { RakusBoss } from '../kota/RakusBoss';
import { BAB5_LINES } from '../kota/Bab5Data';
import { BAB6_LINES } from '../kota/Bab6Data';

/**
 * Practice fight against Ular Melar or Tikus Rakus from the Lab training room: the same boss classes on a plain field, with no
 * story progress (nothing is saved). Winning or the "Kembali" button returns to the training room. When Glen is tired the boss
 * starts over (like in the chapters).
 */
export class PracticeArena implements Level {
  readonly id: string;
  readonly spawn: { x: number; y: number; z: number; yaw: number };
  private ctx!: LevelContext;
  private boss!: SnakeBoss | RakusBoss;
  private engaged = false;
  private over = false;
  private lastExh = 0;
  private said = new Set<string>();

  constructor(private readonly kind: 'ular' | 'rakus') {
    this.id = `practice-${kind}`;
    this.spawn = { x: 0, y: 0, z: kind === 'ular' ? Combat.snake.entryOffset : Combat.rakus.entryOffset, yaw: Math.PI };
  }

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    const { root, scene } = ctx;
    scene.background = new THREE.Color(0x62bdf5);
    scene.fog = new THREE.Fog(0xa6dbed, 45, 90);
    root.add(new THREE.HemisphereLight(0xffffff, 0xb7ce95, 2));
    const sun = new THREE.DirectionalLight(0xfff4d8, 2.4);
    sun.position.set(30, 40, 12);
    root.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x86c977, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    root.add(floor);
    const field = new THREE.Mesh(new THREE.CircleGeometry(this.kind === 'ular' ? 15 : 12, 48), new THREE.MeshStandardMaterial({ color: 0xe6d3a0, roughness: 0.95 }));
    field.rotation.x = -Math.PI / 2;
    field.position.y = 0.005;
    root.add(field);
    ctx.physics.addFixedCuboid({ x: 45, y: 0.5, z: 45 }, { x: 0, y: -0.5, z: 0 });
    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({ laser: true, shield: true, fly: false });
    ctx.health.setShown(true);
    ctx.onDispose(() => ctx.health.setShown(false));
    this.lastExh = ctx.health.exhaustions;

    if (this.kind === 'ular') {
      this.boss = new SnakeBoss(ctx, 0, 0, {
        onStar: (left) => { if (left <= 0) this.win(); },
        onEvent: (k) => { if (k === 'dizzy' && this.boss.stars > 0) this.hint('pusing', BAB5_LINES.ninoPusing); },
      });
    } else {
      this.boss = new RakusBoss(ctx, 0, 0, {
        onStar: (left) => { if (left <= 0) this.win(); },
        onEvent: (k) => {
          if (k === 'cue') this.hint('cue', BAB6_LINES.ninoMakan);
          else if (k === 'dizzy' && this.boss.stars > 0) this.hint('pusing', BAB6_LINES.ninoPusing);
        },
        onRoundEnd: () => {},
      });
    }

    const exit = document.createElement('button');
    exit.className = 'arena-return';
    exit.textContent = 'Kembali ke ruang latihan';
    exit.addEventListener('click', () => this.leave());
    ctx.ui.appendChild(exit);
    ctx.onDispose(() => exit.remove());
    ctx.game.debugInfo.arena = `practice-${this.kind}`;

    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      this.engage();
    });
  }

  private hint(key: string, line: { id: string; speaker: string; text: string }): void {
    if (this.said.has(key) || this.over) return;
    this.said.add(key);
    void this.ctx.dialog.say(line);
  }

  private engage(): void {
    const { ctx } = this;
    const b = this.boss;
    this.engaged = true;
    b.setEnabled(false);
    b.showHud(true);
    if (this.kind === 'ular') {
      ctx.battle.enter({ id: 'ular_melar', name: 'Ular Melar', focus: () => ({ x: 0, y: 1.1, z: 0 }), arena: { x: 0, z: 0, r: 15 }, isolated: true, stars: () => ({ left: b.stars, max: b.maxStars }), aura: 0x6fe08a, stage: { floor: 0x7ccf5f, wall: 0xa9dcef, light: 0xfff0c0 } });
    } else {
      const rb = b as RakusBoss;
      ctx.battle.enter({ id: 'tikus_rakus', name: 'Tikus Rakus', focus: () => ({ x: 0, y: rb.headAt.y * 0.7, z: 0 }), arena: { x: 0, z: 0, r: Combat.rakus.arenaRadius + 3.5 }, isolated: true, stars: () => ({ left: b.stars, max: b.maxStars }) });
    }
  }

  private async win(): Promise<void> {
    if (this.over) return;
    this.over = true;
    const { ctx } = this;
    const b = this.boss;
    ctx.game.setControlsEnabled(false);
    b.setEnabled(false);
    b.showHud(false);
    ctx.battle.exit(true);
    await b.tameLook();
    if (b instanceof SnakeBoss) await b.slitherAway(-1, -1, 1.2); else b.finishAfterCinematic();
    ctx.save.addCoins(10);
    ctx.quiz.coinsChanged();
    ctx.synth.cheer();
    await new Celebration(ctx, 'Latihan selesai!', ctx.fx.sparkles).play();
    await this.leave();
  }

  private async leave(): Promise<void> {
    if (this.engaged) this.ctx.battle.exit();
    this.engaged = false;
    this.over = true;
    await backToTraining(this.ctx.game);
  }

  fixedUpdate(dt: number): void {
    const { ctx } = this;
    if (this.over) return;
    if (ctx.health.exhaustions !== this.lastExh) {
      // Tired: the fight starts over after the rest.
      this.lastExh = ctx.health.exhaustions;
      this.boss.reset();
      this.engaged = false;
      ctx.seq.run(async () => {
        await ctx.seq.waitUntil(() => !ctx.health.resting && ctx.game.controlsEnabled);
        if (!this.over) this.engage();
      });
    }
    if (this.engaged) this.boss.setEnabled(!ctx.battle.entering && !ctx.health.resting && ctx.game.controlsEnabled);
    this.boss.fixedUpdate(dt);
  }

  update(dt: number): void {
    this.boss.update(dt);
  }

  dispose(): void {}
}
