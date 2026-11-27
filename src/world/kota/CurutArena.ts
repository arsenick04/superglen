import * as THREE from 'three';
import type { Level, LevelContext } from '../Level';
import { MarketRats } from './MarketRats';
import { buildMarketDressing } from './CurutDressing';
import { MARKET, RATS } from './Bab3Data';
import { backToTraining, isPractice, travel } from '../progress';
import { Combat, CombatRng } from '../../config/combat';

/** A separate real-time encounter scene. City geometry and traffic are unloaded. */
export class CurutArena implements Level {
  readonly id = 'battle-curut';
  readonly spawn = { x: MARKET.hub.x, y: 0, z: Combat.rat.arena.entryZ, yaw: Math.PI };
  private ctx!: LevelContext;
  private rats!: MarketRats;
  private leaving = false;
  /** Practice fight from the Lab training room: no story progress, back to the room at the end. */
  private practice = false;
  private victoryLeft = -1;
  private readonly battleFocus = { x: MARKET.hub.x, y: Combat.rat.arena.cameraLookY, z: 0 };
  private readonly screenPoint = new THREE.Vector3();

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    this.practice = isPractice(this.id);
    const { root, scene } = ctx;
    scene.background = new THREE.Color(0x62bdf5);
    scene.fog = new THREE.Fog(0xa6dbed, 45, 90);
    root.add(new THREE.HemisphereLight(0xffffff, 0xb7ce95, 2));
    const sun = new THREE.DirectionalLight(0xfff4d8, 2.4);
    sun.position.set(100, 20, 12);
    sun.target.position.set(MARKET.hub.x, 0, 0);
    root.add(sun, sun.target);
    // Market square: tiled plaza, a medallion that marks the fight ring, stalls with awnings, bunting, lanterns, houses far behind.
    buildMarketDressing(root, MARKET.hub.x, 0, 35);
    // Warm rim light from behind the enemy side, so Glen and the rats get a golden edge.
    const rim = new THREE.DirectionalLight(0xffc78a, 1.1);
    rim.position.set(MARKET.hub.x - 14, 9, -10);
    rim.target.position.set(MARKET.hub.x, 1, 0);
    root.add(rim, rim.target);
    ctx.physics.addFixedCuboid({ x: 40, y: 0.5, z: 40 }, { x: MARKET.hub.x, y: -0.5, z: 0 });
    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    // Double jump remains available; this ground encounter keeps free flight disabled.
    ctx.game.setSkills({ laser: true, shield: true, fly: false });
    ctx.health.setShown(true);
    const arena = Combat.rat.arena;
    document.documentElement.classList.add('curut-arena');
    ctx.onDispose(() => {
      ctx.health.setShown(false);
      document.documentElement.classList.remove('curut-arena');
      if (ctx.save.data.slot?.level === 'battle-curut') ctx.save.setSlot(null);
    });
    // Keep seven persistent rat identities, but stage their loops close enough
    // for a compact encounter rather than a city-wide chase.
    const specs = RATS.map((r, i) => ({ ...r, cx: MARKET.hub.x + Math.sin(i * Math.PI * 2 / RATS.length) * arena.ratRingX, cz: Math.cos(i * Math.PI * 2 / RATS.length) * arena.ratRingZ, r: arena.ratLoopRadius }));
    this.rats = new MarketRats(ctx, {
      onTamed: (i) => {
        if (this.practice) return;
        const t = ctx.save.data.bab3.tamed;
        if (!t.includes(i)) ctx.save.setBab3('chase', [...t, i]);
      },
      onCollect: () => {},
    }, this.practice ? [] : ctx.save.data.bab3.tamed, specs, false, true);
    ctx.battle.enter({ id: 'curut_cemberut', name: 'Curut Cemberut', focus: () => this.battleFocus, arena: { x: MARKET.hub.x, z: 0, r: arena.radius }, stars: () => ({ left: this.rats.remaining, max: this.rats.n }), ownBar: true, intro: false, punchy: false });
    // Soft blob shadows under the rats (Glen has his own) (the shared battle fx; no real shadows on the small things).
    const fx = ctx.battle.bfx;
    for (let i = 0; i < RATS.length; i++) {
      const sh = { x: 0, y: 0, z: 0, r: 0.5, a: 1 };
      fx.addShadow(() => (this.rats.shadowOf(i, sh) ? sh : null));
    }
    const exit = document.createElement('button');
    exit.className = 'arena-return';
    exit.textContent = this.practice ? 'Kembali ke ruang latihan' : 'Kembali ke kota';
    exit.addEventListener('click', () => this.leave(false));
    ctx.ui.appendChild(exit);
    ctx.onDispose(() => exit.remove());
    ctx.game.debugInfo.arena = 'curut';
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST) {
      const w = window as unknown as { __arena?: unknown };
      w.__arena = {
        handoffDelay: Combat.rat.nextDelay,
        rats: () => this.rats.list(),
        tame: (i: number) => this.rats.tame(i),
        attack: (i: number, kind: 0 | 1) => this.rats.forceAttack(i, kind),
        hit: (i: number) => this.rats.hit(i),
        combat: () => this.rats.combatCounts(),
        counts: () => ({ ...this.rats.collected, tamed: this.rats.tamedCount, stomps: this.rats.stomps, lasers: this.rats.lasers, dropped: this.rats.dropped }),
        mute: (on: boolean) => { this.rats.muted = on; },
        setRng: (v: number | null) => { CombatRng.next = v === null ? Math.random : () => v; },
        project: (x: number, y: number, z: number) => {
          const p = this.screenPoint.set(x, y, z).project(ctx.cameraRig.camera);
          return { x: p.x, y: p.y, z: p.z };
        },
        leave: () => this.leave(false),
      };
      ctx.onDispose(() => { delete w.__arena; });
    }
  }

  private leave(won: boolean): void {
    if (this.leaving) return;
    this.leaving = true;
    const ctx = this.ctx;
    this.rats.muted = true;
    if (!this.practice && won && ctx.save.data.bab3.step === 'chase') ctx.save.setBab3('count', ctx.save.data.bab3.tamed);
    // A position inside this transient encounter must never remain the
    // preferred Continue slot after the encounter has ended.
    if (ctx.save.data.slot?.level === 'battle-curut') ctx.save.setSlot(null);
    ctx.battle.exit(won);
    if (this.practice && won) {
      ctx.save.addCoins(10);
      ctx.quiz.coinsChanged();
    }
    if (this.practice) void backToTraining(ctx.game);
    else void travel(ctx.game, 'kota', 'marketBattle');
  }

  fixedUpdate(dt: number): void {
    if (this.leaving) return;
    this.rats.fixedUpdate(dt);
    if (this.rats.allTamed) {
      if (this.victoryLeft < 0) {
        this.victoryLeft = Combat.rat.arena.victoryDelay;
        this.rats.muted = true;
      }
      this.victoryLeft -= dt;
      if (this.victoryLeft <= 0) this.leave(true);
    }
    const p = this.ctx.player.position;
    const dx = p.x - MARKET.hub.x, dz = p.z;
    const d = Math.hypot(dx, dz);
    const edge = Combat.rat.arena.radius;
    if (d > edge) this.ctx.player.teleport(MARKET.hub.x + dx / d * (edge - Combat.rat.arena.returnInset), p.y, dz / d * (edge - Combat.rat.arena.returnInset));
  }

  update(dt: number): void { this.rats.update(dt); }
  dispose(): void {}
}
