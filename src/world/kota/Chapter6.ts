import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import { Celebration } from '../Celebration';
import { Combat } from '../../config/combat';
import { RakusBoss, type RakusEvent } from './RakusBoss';
import { RakusHelpers } from './RakusHelpers';
import { BAB6_LINES as L, RAKUS_ARENA } from './Bab6Data';

/** What the level gives Chapter 6 (so this file does not need to know the level class). */
export interface Chapter6Hooks {
  /** The map star (null: it follows the objective beam). */
  setGoal(goal: { x: number; z: number } | null): void;
  /** A resident's mission may not run during the chapter: drop the running one. */
  dropMission(): void;
  /** Place Glen in the isolated battle staging point before the intro starts. */
  placePlayer(x: number, z: number, yaw: number): void;
  /** City life (cars, people) is not drawn inside this circle while the fight is on (null: everywhere again). */
  clearZone(zone: { x: number; z: number; r: number } | null): void;
  /** Turn the city to evening before Nino sends Glen home. */
  nightFalls(): void;
  /** Chapter 6 is over (the city is free again, the residents offer missions). */
  onDone(): void;
}

/** Chapter 6 steps. '' = not started; over when 'bab6' is in `chaptersDone`. */
export type Ch6Step = '' | 'city' | 'fight';

/**
 * CHAPTER 6 "Tikus Rakus" (enemy 3). Built by KotaLevel when Chapter 5 is done and Chapter 6 is not.
 *
 *   ''      (Chapter 5 just ended) Nino reports that the food of the Gudang Pasar vanished -> 'city'
 *   'city'  the beam and map star lead to the road in front of the warehouse. Coming close: the big rat is eating, Nino
 *           explains the pattern -> 'fight'
 *   'fight' Tikus Rakus (RakusBoss.ts, numbers in config/combat.ts): glowing food pile -> he eats and grows (pop the pile first!) ->
 *           belly slam ring -> out of breath: laser takes a star and he shrinks. Curut Cemberut helpers (RakusHelpers.ts) join after
 *           round 1, 3 ... All hearts gone: rest at the Rumah Sakit, the fight starts over. 0 stars: tamed, back to normal size, gives the
 *           food back, says sorry, trots into the warehouse; chapter done.
 *
 * The step is saved in `save.data.bab6.step`; after a reload the chapter goes on from there. Missions pause meanwhile.
 */
export class Chapter6 {
  step: Ch6Step;
  private over = false;
  private disposed = false;
  private readonly tmp = new THREE.Vector3();
  boss: RakusBoss | null = null;
  helpers: RakusHelpers | null = null;
  /** The child is in the fight area (he wakes, the stars show). */
  engaged = false;
  private introScene = false;
  private tamedScene = false;
  private said = new Set<string>();
  private lastBelum = -999;
  private beamTick = 0;
  private clock = 0;
  private lastExh: number;
  /** Test counters. */
  resets = 0;
  introSeen = false;

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: Chapter6Hooks,
  ) {
    this.step = ctx.save.data.bab6.step as Ch6Step;
    this.lastExh = ctx.health.exhaustions;
    // During the fight the story lines are small call-outs that never stop it (Dialog compact mode).
    const dropRule = ctx.dialog.addCompactRule(() => this.engaged && !this.tamedScene);
    ctx.onDispose(() => {
      this.disposed = true;
      dropRule();
      this.hooks.clearZone(null);
    });
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __ch6?: unknown };
      w.__ch6 = {
        step: () => this.step,
        advance: (s: Ch6Step) => this.setStep(s),
        done: () => this.over,
        engaged: () => this.engaged,
        boss: () => (this.boss ? this.boss.debug() : null),
        helpers: () => (this.helpers ? { list: this.helpers.debug(), counts: this.helpers.counts() } : null),
        mute: (on: boolean) => {
          if (this.boss) this.boss.muted = on;
          if (this.helpers) this.helpers.muted = on;
        },
        muteHelpers: (on: boolean) => {
          if (this.helpers) this.helpers.muted = on;
        },
        engage: () => this.engage(),
        takeStar: () => this.boss?.takeStar(),
        setCool: (v: number) => this.boss && ((this.boss as unknown as { cool: number }).cool = v),
        setLevel: (n: number) => this.boss?.setLevelNow(n),
        cue: (i: number) => this.boss?.beginCue(i),
        slam: () => this.boss?.beginWind(),
        idle: () => this.boss?.testIdle(),
        endRound: () => this.boss?.testEndRound(),
        spawnHelpers: (n: number) => this.helpers?.spawn(n),
        helperHit: (i: number) => this.helpers?.testHit(i),
        helperAttack: (i: number, crumb: boolean) => this.helpers?.forceAttack(i, crumb),
        counts: () => ({ resets: this.resets, introSeen: this.introSeen }),
        /** Test: a laser hit on a target, exactly as the beam would deliver it. */
        laser: (id: string) => {
          const t = ctx.targets.list.find((x) => x.id === id);
          if (!t || !t.enabled) return false;
          const p = t.position();
          t.onHit({ target: t, x: p.x, y: p.y, z: p.z, dirX: 0, dirY: 0, dirZ: 1, distance: 5 });
          return true;
        },
      };
      ctx.onDispose(() => {
        delete w.__ch6;
      });
    }
  }

  /** True until the chapter is finished (the residents' missions wait). */
  get active(): boolean {
    return !this.over;
  }

  /** Called once the level is built. */
  start(): void {
    const { ctx } = this;
    ctx.game.preloadCinematic('rakus-warehouse');
    this.hooks.dropMission();
    if (this.step === 'city' || this.step === 'fight') this.buildBoss();
    this.applyStep();
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (this.step === '') {
        // Chapter 5 has just ended (or the game was loaded right after it): the reports.
        await ctx.seq.wait(1.0);
        if (this.disposed || this.step !== '') return;
        await ctx.dialog.say(L.ninoLaporan);
        await ctx.dialog.say(L.ninoCari);
        await ctx.dialog.say(L.glenSiap);
        this.buildBoss();
        this.setStep('city');
      }
    });
  }

  private arenaGoal(): void {
    this.hooks.setGoal({ x: RAKUS_ARENA.x, z: RAKUS_ARENA.z });
    this.ctx.objectives.set(this.tmp.set(RAKUS_ARENA.x, 0, RAKUS_ARENA.z));
  }

  private applyStep(): void {
    this.ctx.game.debugInfo.ch6Step = this.step;
    if (this.step === 'city' || this.step === 'fight') this.arenaGoal();
  }

  /** Save and switch to a step. */
  setStep(step: Ch6Step): void {
    this.step = step;
    this.ctx.save.setBab6(step);
    this.ctx.game.debugInfo.ch6Step = step;
  }

  private buildBoss(): void {
    if (this.boss) return;
    this.boss = new RakusBoss(this.ctx, RAKUS_ARENA.x, RAKUS_ARENA.z, {
      onStar: (left) => {
        this.ctx.game.debugInfo.ch6Stars = left;
        if (left <= 0) this.runTamed();
      },
      onEvent: (kind) => this.onRakusEvent(kind),
      onRoundEnd: (round) => this.onRoundEnd(round),
    });
    this.helpers = new RakusHelpers(this.ctx, RAKUS_ARENA.x, RAKUS_ARENA.z, () => {
      const p = this.boss?.phase;
      return p !== 'wind' && p !== 'hop';
    });
    this.boss.helpersBusy = () => this.helpers?.attacking ?? false;
    this.hooks.clearZone({ x: RAKUS_ARENA.x, z: RAKUS_ARENA.z, r: Combat.rakus.arenaRadius + 3 });
    this.ctx.game.debugInfo.ch6Stars = this.boss.stars;
  }

  private sayOnce(key: string, line: (typeof L)[keyof typeof L]): void {
    if (this.said.has(key) || this.tamedScene) return;
    this.said.add(key);
    void this.ctx.dialog.say(line);
  }

  private onRakusEvent(kind: RakusEvent): void {
    if (this.tamedScene) return;
    switch (kind) {
      case 'cue':
        this.sayOnce('cue', L.ninoMakan);
        break;
      case 'saved':
        this.sayOnce('saved', L.ninoSelamat);
        break;
      case 'grew':
        this.sayOnce('grew', L.ninoBesar);
        break;
      case 'ring':
        this.sayOnce('ring', L.ninoCincin);
        break;
      case 'dizzy':
        if (this.boss && this.boss.stars > 0) this.sayOnce('dizzy', L.ninoPusing);
        break;
      case 'shrunk':
        this.sayOnce('shrunk', L.ninoKecil);
        break;
      case 'laserEarly':
        if (this.clock - this.lastBelum > Combat.rakus.hintGap) {
          this.lastBelum = this.clock;
          void this.ctx.dialog.say(L.ninoBelum);
        }
        break;
      default:
        break;
    }
  }

  /** Between rounds: Curut Cemberut join (after round 1, 3, 5 ...). */
  private onRoundEnd(round: number): void {
    const h = this.helpers;
    if (!h || this.tamedScene || round % 2 !== 1) return;
    const room = Combat.rakus.helpers.max - h.alive;
    if (room <= 0) return;
    if (h.spawn(Math.min(Combat.rakus.helpers.perWave, room)) > 0) this.sayOnce('curut', L.ninoCurut);
  }

  // ---- the fight area ----------------------------------------------------------------------------------------

  private engage(): void {
    const { ctx } = this;
    if (!this.boss) return;
    // The warehouse cinematic hands control back with Glen already inside the battle arena.
    this.hooks.placePlayer(RAKUS_ARENA.x, RAKUS_ARENA.z + Combat.rakus.entryOffset, Math.PI);
    this.engaged = true;
    if (ctx.player.mode !== 'superglen') ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    this.boss.setEnabled(false);
    this.boss.showHud(true);
    if (this.helpers) this.helpers.enabled = false;
    ctx.objectives.clear();
    const b = this.boss;
    ctx.battle.enter({
      id: 'tikus_rakus',
      name: 'Tikus Rakus',
      focus: () => ({ x: b.x, y: b.headAt.y * 0.7, z: b.z }),
      arena: { x: RAKUS_ARENA.x, z: RAKUS_ARENA.z, r: Combat.rakus.arenaRadius + 3.5 },
      isolated: true,
      stars: () => ({ left: b.stars, max: b.maxStars }),
    });
    ctx.game.debugInfo.ch6Engaged = true;
  }

  private disengage(): void {
    this.engaged = false;
    this.boss?.setEnabled(false);
    this.boss?.showHud(false);
    if (this.helpers) this.helpers.enabled = false;
    this.helpers?.clear();
    this.ctx.battle.exit();
    this.ctx.game.setTransformAllowed(true);
    this.ctx.game.debugInfo.ch6Engaged = false;
  }

  /** First time near him: the scene, Nino explains, then the fight starts. */
  private runIntro(): void {
    if (this.introScene) return;
    this.introScene = true;
    const { ctx } = this;
    const { seq } = ctx;
    ctx.game.setControlsEnabled(false);
    seq.run(async () => {
      await seq.waitUntil(() => startGate.started);
      ctx.game.debugInfo.ch6Scene = 'intro';
      this.introSeen = true;
      ctx.game.setControlsEnabled(false);
      ctx.objectives.clear();
      if (ctx.player.mode !== 'superglen') ctx.game.setPlayerMode('superglen', false);
      await ctx.game.playCinematic('rakus-warehouse');
      if (this.disposed) return;
      ctx.game.setControlsEnabled(false);
      this.setStep('fight');
      this.engage();
      this.introScene = false;
      ctx.game.setControlsEnabled(true);
      ctx.game.debugInfo.ch6Scene = 'fight';
    });
  }

  /** The last star is gone: back to normal size, sorry, the food goes home; the chapter is done. */
  private runTamed(): void {
    if (this.tamedScene) return;
    this.tamedScene = true;
    const { ctx } = this;
    const { seq, dialog, cameraRig, fx } = ctx;
    const b = this.boss as RakusBoss;
    seq.run(async () => {
      ctx.game.debugInfo.ch6Scene = 'tamed';
      ctx.game.setControlsEnabled(false);
      b.setEnabled(false);
      b.showHud(false);
      this.helpers?.clear();
      this.engaged = false;
      ctx.battle.exit(true);
      cameraRig.setFraming(b.headAt, { weight: 0.55, distance: 9 });
      await b.tameLook();
      await dialog.say(L.rakusSendawa, { lockControls: true });
      const food = b.returnFood();
      await dialog.say(L.rakusMaaf, { lockControls: true });
      await dialog.say(L.rakusBagi, { lockControls: true });
      await food;
      ctx.synth.cheer();
      await dialog.say(L.wargaHore, { lockControls: true });
      const home = b.trotHome();
      await dialog.say(L.ninoHebat, { lockControls: true });
      await home;
      this.hooks.nightFalls();
      await dialog.say(L.ninoPulang, { lockControls: true });
      cameraRig.setFraming(null);
      this.over = true;
      ctx.save.markChapterDone('bab6');
      ctx.save.setInterlude('rakus_home');
      ctx.save.setBab6('');
      ctx.save.finishCityMission('bab6', 15);
      ctx.quiz.coinsChanged();
      ctx.game.setControlsEnabled(true);
      ctx.game.setTransformAllowed(true);
      ctx.objectives.clear();
      this.hooks.clearZone(null);
      ctx.game.debugInfo.ch6Scene = 'done';
      await new Celebration(ctx, 'Chapter 6 selesai!', fx.sparkles).play();
      this.hooks.setGoal(null);
      this.hooks.onDone();
    });
  }

  /** Hearts all gone (the Game rested him at the Rumah Sakit): the fight starts over, Nino encourages. */
  private resetFight(): void {
    const { ctx } = this;
    this.resets++;
    if (this.boss && !this.tamedScene) {
      this.boss.reset();
      this.helpers?.clear();
      this.disengage();
      ctx.game.debugInfo.ch6Stars = this.boss.stars;
    }
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => !ctx.health.resting);
      await ctx.seq.wait(0.4);
      if (!this.over) await ctx.dialog.say(L.ninoLagi);
    });
  }

  // ---- updates -----------------------------------------------------------------------------------------------

  fixedUpdate(dt = 1 / 60): void {
    if (this.over || this.disposed) return;
    this.clock += dt;
    const { ctx } = this;
    const p = ctx.player.position;
    if (this.step === 'city' || this.step === 'fight') {
      if (ctx.health.exhaustions !== this.lastExh) {
        this.lastExh = ctx.health.exhaustions;
        this.resetFight();
      }
      const b = this.boss;
      if (b && !this.tamedScene) {
        const d = Math.hypot(p.x - b.cx, p.z - b.cz);
        if (!this.engaged && d <= Combat.rakus.areaEntryRadius && !ctx.health.resting && ctx.game.controlsEnabled && startGate.started) {
          if (this.step === 'city') this.runIntro();
          else this.engage();
        } else if (this.engaged && d > Combat.rakus.areaExitRadius) {
          this.disengage();
        }
        const ready = this.engaged && !this.introScene && !ctx.battle.entering;
        b.setEnabled(ready);
        if (this.helpers) this.helpers.enabled = ready;
        // The beam: far away it leads to the arena, near it would stand in the fight.
        if (++this.beamTick % 20 === 0 && !this.introScene) {
          if (d < 40 && ctx.objectives.active) ctx.objectives.clear();
          else if (d >= 55 && !ctx.objectives.active && !ctx.health.resting) this.arenaGoal();
        }
      }
      b?.fixedUpdate(dt);
      this.helpers?.fixedUpdate(dt);
    }
  }

  update(_dt = 1 / 60): void {
    if (this.disposed) return;
    this.boss?.update(_dt);
    this.helpers?.update();
    const info = this.ctx.game.debugInfo;
    info.ch6Step = this.step;
    if (this.boss) {
      info.ch6Phase = this.boss.phase;
      info.ch6Stars = this.boss.stars;
    }
  }
}
