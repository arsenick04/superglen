import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import { Celebration } from '../Celebration';
import { Combat } from '../../config/combat';
import { AaraActor } from './Aara';
import { AaraFollower } from './AaraFollower';
import { SnakeBoss } from './SnakeBoss';
import { BAB5_DOOR, BAB5_LINES as L, SNAKE_FIELD } from './Bab5Data';

/** What the level gives Chapter 5 (so this file does not need to know the level class). */
export interface Chapter5Hooks {
  /** The map star (null: it follows the objective beam). */
  setGoal(goal: { x: number; z: number } | null): void;
  /** A resident's mission may not run during the chapter: drop the running one. */
  dropMission(): void;
  /** Chapter 5 is over (the city is free again, the residents offer missions). */
  onDone(): void;
}

/** Chapter 5 steps. '' = not started; over when 'bab5' is in `chaptersDone`. */
export type Ch5Step = '' | 'walk' | 'lab' | 'city' | 'fight';

/** The snake is met when the child is this close to its coil (m); farther than `LOSE` the fight pauses. */
const MEET = 34;
const LOSE = 52;

/**
 * CHAPTER 5 "Ular Melar" (the city side; the lab visit is in bab1/LabVisit.ts). Built by KotaLevel when Chapter 4 is done and
 * Chapter 5 is not.
 *
 *   ''      (Chapter 4 just ended) Glen asks Aara to come along -> 'walk'
 *   'walk'  Aara follows him to the old Barongsai building; at the lion head she gasps -> 'lab'
 *   'lab'   the beam leads to the door; inside, Aara and Nino meet (LabVisit sets 'city' when it is over)
 *   'city'  Superglen, out of the lab; Aara waits at the door; the beam and map star lead to the school field. Coming close: Nino
 *           explains the pattern -> 'fight'
 *   'fight' Ular Melar (SnakeBoss.ts, numbers in config/combat.ts): coil + wiggle, lunge along a red stripe, dizzy head, laser.
 *           3 stars. All hearts gone: rest at the Rumah Sakit, the fight starts over. 0 stars: tamed, slithers off, chapter done.
 *
 * The step is saved in `save.data.bab5.step`; after a reload the chapter goes on from there. Missions pause meanwhile.
 */
export class Chapter5 {
  step: Ch5Step;
  private over = false;
  private disposed = false;
  private readonly tmp = new THREE.Vector3();
  private aara: AaraActor | null = null;
  private follower: AaraFollower | null = null;
  boss: SnakeBoss | null = null;
  /** The child is in the fight area (the snake wakes, the stars show). */
  engaged = false;
  private doorScene = false;
  private introScene = false;
  private tamedScene = false;
  private saidPusing = false;
  private saidGaris = false;
  private lastBelum = -999;
  private beamTick = 0;
  private clock = 0;
  private lastExh: number;
  /** Test counters. */
  resets = 0;
  introSeen = false;

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: Chapter5Hooks,
    private readonly lit: THREE.Material,
  ) {
    this.step = ctx.save.data.bab5.step as Ch5Step;
    this.lastExh = ctx.health.exhaustions;
    // During the fight the story lines are small call-outs that never stop it (Dialog compact mode).
    const dropRule = ctx.dialog.addCompactRule(() => this.engaged && !this.tamedScene);
    ctx.onDispose(() => {
      this.disposed = true;
      dropRule();
    });
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __ch5?: unknown };
      w.__ch5 = {
        step: () => this.step,
        advance: (s: Ch5Step) => this.setStep(s),
        done: () => this.over,
        engaged: () => this.engaged,
        boss: () => (this.boss ? this.boss.debug() : null),
        /** Test: the snake's methods. */
        wind: () => this.boss?.setEnabled(true),
        mute: (on: boolean) => {
          if (this.boss) this.boss.muted = on;
        },
        engage: () => this.engage(),
        takeStar: () => this.boss?.takeStar(),
        setCool: (v: number) => this.boss && ((this.boss as unknown as { cool: number }).cool = v),
        aara: () =>
          this.aara
            ? { x: this.aara.group.position.x, y: this.aara.group.position.y, z: this.aara.group.position.z, teleports: this.follower?.teleports ?? 0, dist: this.follower?.distance ?? 0 }
            : null,
        counts: () => ({ resets: this.resets, introSeen: this.introSeen }),
        /** Test: laser hit exactly as the beam would deliver it. */
        laser: () => {
          const t = ctx.targets.list.find((x) => x.id === 'ularMelar');
          if (!t) return false;
          const p = t.position();
          t.onHit({ target: t, x: p.x, y: p.y, z: p.z, dirX: 0, dirY: 0, dirZ: 1, distance: 5 });
          return true;
        },
        /** Test: a lunge now along the direction to the child. */
        lunge: () => {
          const b = this.boss as unknown as { beginWind(): void } | null;
          b?.beginWind();
        },
      };
      ctx.onDispose(() => {
        delete w.__ch5;
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
    this.hooks.dropMission();
    this.aara = new AaraActor(this.lit, ctx.dialog);
    this.aara.setLevel(3);
    ctx.root.add(this.aara.group);
    ctx.onDispose(() => this.aara?.dispose());
    this.follower = new AaraFollower(this.aara, ctx.player);
    if (this.step === 'city' || this.step === 'fight') this.buildBoss();
    this.applyStep();
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (this.step === '') {
        this.setStep('walk');
        await ctx.dialog.say(L.glenAjak);
        await ctx.dialog.say(L.aaraIkut);
      } else if (this.step === 'city') {
        // Just out of the old building: Aara waits by the door and wishes him luck.
        const p = ctx.player.position;
        if (Math.hypot(p.x - BAB5_DOOR.wait.x, p.z - BAB5_DOOR.wait.z) < 15) await ctx.dialog.say(L.aaraTunggu);
      }
    });
  }

  private doorGoal(): void {
    this.hooks.setGoal({ x: BAB5_DOOR.x, z: BAB5_DOOR.z });
    this.ctx.objectives.set(this.tmp.set(BAB5_DOOR.x, BAB5_DOOR.y, BAB5_DOOR.z + 0.9));
  }

  private fieldGoal(): void {
    this.hooks.setGoal({ x: SNAKE_FIELD.x, z: SNAKE_FIELD.z });
    this.ctx.objectives.set(this.tmp.set(SNAKE_FIELD.x, 0, SNAKE_FIELD.z));
  }

  /** Put the world in the state of the current step (also after a reload). */
  private applyStep(): void {
    const { ctx } = this;
    const a = this.aara as AaraActor;
    ctx.game.debugInfo.ch5Step = this.step;
    if (this.step === '' || this.step === 'walk' || this.step === 'lab') {
      // Aara walks with him; the beam leads to the old building.
      this.follower?.reset();
      this.doorGoal();
    } else {
      // Out of the lab: she waits at the door (on the hill) and cheers.
      const w = BAB5_DOOR.wait;
      a.place(w.x, w.z, w.yaw);
      a.group.position.y = BAB5_DOOR.y;
      ctx.interactions.add({
        position: () => this.tmp.set(a.group.position.x, a.group.position.y + 0.8, a.group.position.z),
        radius: 2.8,
        icon: 'talk',
        promptHeight: 1.7,
        enabled: () => this.step === 'city' || this.step === 'fight',
        onInteract: () => void ctx.dialog.say(L.aaraSemangat),
      });
      this.fieldGoal();
    }
  }

  /** Save and switch to a step. */
  setStep(step: Ch5Step): void {
    this.step = step;
    this.ctx.save.setBab5(step);
    this.ctx.game.debugInfo.ch5Step = step;
    if (step === 'lab') this.doorGoal();
  }

  private buildBoss(): void {
    this.boss = new SnakeBoss(this.ctx, SNAKE_FIELD.x, SNAKE_FIELD.z, {
      onStar: (left) => {
        this.ctx.game.debugInfo.ch5Stars = left;
        if (left <= 0) this.runTamed();
      },
      onEvent: (kind) => this.onSnakeEvent(kind),
    });
    this.ctx.game.debugInfo.ch5Stars = this.boss.stars;
  }

  private onSnakeEvent(kind: 'wind' | 'dizzy' | 'laserEarly' | 'blocked' | 'hurt'): void {
    const { dialog } = this.ctx;
    if (this.tamedScene) return;
    if (kind === 'dizzy' && !this.saidPusing && this.boss && this.boss.stars > 0) {
      this.saidPusing = true;
      void dialog.say(L.ninoPusing);
    } else if (kind === 'hurt' && !this.saidGaris) {
      this.saidGaris = true;
      void dialog.say(L.ninoGaris);
    } else if (kind === 'laserEarly' && this.clock - this.lastBelum > Combat.snake.hintGap) {
      this.lastBelum = this.clock;
      void dialog.say(L.ninoBelum);
    }
  }

  // ---- the fight area ----------------------------------------------------------------------------------------

  /** The child came close: Superglen, the snake wakes, the stars show. */
  private engage(): void {
    const { ctx } = this;
    if (!this.boss) return;
    this.engaged = true;
    if (ctx.player.mode !== 'superglen') ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    this.boss.setEnabled(true);
    this.boss.showHud(true);
    ctx.objectives.clear();
    const b = this.boss;
    ctx.battle.enter({
      id: 'ular_melar',
      name: 'Ular Melar',
      focus: () => ({ x: b.x, y: 1.1, z: b.z }),
      arena: { x: b.x, z: b.z, r: 15 },
      stars: () => ({ left: b.stars, max: b.maxStars }),
      aura: 0x6fe08a,
    });
    ctx.game.debugInfo.ch5Engaged = true;
  }

  private disengage(): void {
    this.engaged = false;
    this.boss?.setEnabled(false);
    this.boss?.showHud(false);
    this.ctx.battle.exit();
    this.ctx.game.setTransformAllowed(true);
    this.ctx.game.debugInfo.ch5Engaged = false;
  }

  /** First time near the snake: Nino explains, then the fight starts. */
  private runIntro(): void {
    if (this.introScene) return;
    this.introScene = true;
    const { ctx } = this;
    const { seq, dialog, cameraRig } = ctx;
    seq.run(async () => {
      await seq.waitUntil(() => startGate.started);
      const b = this.boss as SnakeBoss;
      ctx.game.debugInfo.ch5Scene = 'intro';
      this.introSeen = true;
      ctx.game.setControlsEnabled(false);
      ctx.objectives.clear();
      if (ctx.player.mode !== 'superglen') ctx.game.setPlayerMode('superglen', false);
      cameraRig.setFraming(this.tmp.set(b.x, 1.6, b.z), { weight: 0.5, distance: 7 });
      await dialog.say(L.ninoPola, { lockControls: true });
      cameraRig.setFraming(null);
      this.setStep('fight');
      ctx.game.setControlsEnabled(true);
      this.engage();
      ctx.game.debugInfo.ch5Scene = 'fight';
    });
  }

  /** The last star is gone: the snake is tamed (not hurt), says sorry, slithers off; the chapter is done. */
  private runTamed(): void {
    if (this.tamedScene) return;
    this.tamedScene = true;
    const { ctx } = this;
    const { seq, dialog, cameraRig, fx } = ctx;
    const b = this.boss as SnakeBoss;
    seq.run(async () => {
      ctx.game.debugInfo.ch5Scene = 'tamed';
      ctx.game.setControlsEnabled(false);
      b.setEnabled(false);
      b.showHud(false);
      this.engaged = false;
      ctx.battle.exit(true);
      cameraRig.setFraming(b.headAt, { weight: 0.55, distance: 8 });
      await b.tameLook();
      await dialog.say(L.ularMaaf, { lockControls: true });
      await dialog.say(L.ninoHebat, { lockControls: true });
      const gone = b.slitherAway(-1, -1, 5.5);
      await dialog.say(L.ularPergi, { lockControls: true });
      await gone;
      await dialog.say(L.ninoTikus, { lockControls: true });
      cameraRig.setFraming(null);
      // Chapter 5 is done: coins, stars, confetti; the city is free again.
      this.over = true;
      ctx.save.markChapterDone('bab5');
      ctx.save.setBab5('');
      ctx.save.finishCityMission('bab5', 12);
      ctx.quiz.coinsChanged();
      ctx.game.setControlsEnabled(true);
      ctx.game.setTransformAllowed(true);
      ctx.objectives.clear();
      ctx.game.debugInfo.ch5Scene = 'done';
      await new Celebration(ctx, 'Chapter 5 selesai!', fx.sparkles).play();
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
      this.disengage();
      ctx.game.debugInfo.ch5Stars = this.boss.stars;
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
    if (this.step === '' || this.step === 'walk' || this.step === 'lab') this.follower?.fixedUpdate(dt);
    if (this.step === 'walk' && !this.doorScene) {
      const near = Math.hypot(p.x - BAB5_DOOR.x, p.z - BAB5_DOOR.z) < BAB5_DOOR.arriveRadius && Math.abs(p.y - 0.55 - BAB5_DOOR.y) < 4;
      if (near && ctx.game.controlsEnabled && startGate.started) this.runDoorScene();
    }
    if (this.step === 'city' || this.step === 'fight') {
      if (ctx.health.exhaustions !== this.lastExh) {
        this.lastExh = ctx.health.exhaustions;
        this.resetFight();
      }
      const b = this.boss;
      if (b && !this.tamedScene) {
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (!this.engaged && d < MEET && !ctx.health.resting && ctx.game.controlsEnabled && startGate.started) {
          if (this.step === 'city') this.runIntro();
          else {
            // Back in the area at "fight" (after a reload, a rest or a walk away): the snake wakes again.
            this.engage();
            if (!this.saidGaris && !this.introScene) {
              this.saidGaris = true;
              void ctx.dialog.say(L.ninoGaris);
            }
          }
        } else if (this.engaged && d > LOSE) {
          this.disengage();
        }
        // The beam: far away it leads to the field, near it would stand in the arena.
        if (++this.beamTick % 20 === 0 && !this.introScene) {
          if (d < 45 && ctx.objectives.active) ctx.objectives.clear();
          else if (d >= 60 && !ctx.objectives.active && !ctx.health.resting) this.fieldGoal();
        }
      }
      b?.fixedUpdate(dt);
    }
  }

  update(dt = 1 / 60): void {
    this.aara?.update(dt);
    if (this.disposed) return;
    this.boss?.update(dt);
    const info = this.ctx.game.debugInfo;
    info.ch5Step = this.step;
    if (this.boss) {
      info.ch5Phase = this.boss.phase;
      info.ch5Stars = this.boss.stars;
    }
  }

  /** At the old building: Aara gasps at the lion head, Glen says to go in. */
  private runDoorScene(): void {
    this.doorScene = true;
    const { ctx } = this;
    const { seq, dialog, cameraRig } = ctx;
    seq.run(async () => {
      ctx.game.debugInfo.ch5Scene = 'door';
      ctx.game.setControlsEnabled(false);
      ctx.objectives.clear();
      const a = this.aara as AaraActor;
      a.group.rotation.y = Math.atan2(BAB5_DOOR.x - a.group.position.x, BAB5_DOOR.z - a.group.position.z);
      cameraRig.setFraming(this.tmp.set(BAB5_DOOR.x, BAB5_DOOR.y + 3.5, BAB5_DOOR.z), { weight: 0.5, distance: 5 });
      ctx.fx.sparkles.burst(a.group.position.x, a.group.position.y + 1.9, a.group.position.z, 12, 2, 0xffe27a, { gravity: 0.5, life: 0.8, up: 0.8 });
      await dialog.say(L.aaraSinga, { lockControls: true });
      await dialog.say(L.glenMasuk, { lockControls: true });
      // The dialog holds its control lock for a short gap after the last line; let it settle before the scene ends.
      await seq.waitUntil(() => !dialog.active);
      cameraRig.setFraming(null);
      this.setStep('lab');
      ctx.game.setControlsEnabled(true);
      ctx.game.debugInfo.ch5Scene = 'lab';
    });
  }
}
