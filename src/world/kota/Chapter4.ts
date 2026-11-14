import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import type { Question } from '../../quiz/types';
import { AaraActor } from './Aara';
import { AARA, AARA_QUESTIONS, BAB4_LINES as L, PARK } from './Bab4Data';

/** What the level gives Chapter 4 (so this file does not need to know the level class). */
export interface Chapter4Hooks {
  /** The map star (null: it follows the objective beam). */
  setGoal(goal: { x: number; z: number } | null): void;
  /** A resident's mission may not run during the chapter: drop the running one. */
  dropMission(): void;
  /** The chapter ended: residents offer missions again (the map redraws). */
  finished(): void;
  /** Put the player on the ground at (x, z) facing `yaw` (colliders made ready, the camera snaps behind). */
  placePlayer(x: number, z: number, yaw: number): void;
}

/** Chapter 4 steps, in order. '' = not started; the chapter is over when 'bab4' is in `chaptersDone`. */
export type Ch4Step = '' | 'school' | 'aara' | 'park' | 'figure' | 'lab';

/**
 * CHAPTER 4 "Sosok Misterius" in the city (package D5). Built by KotaLevel only when Chapter 3 is done and Chapter 4 is not.
 *
 *   ''       (Chapter 3 just ended) Glen takes off the costume (a detective), Nino sends him to Aara; the beam and the map star
 *            point to the school -> 'school'
 *   'school' walk to Aara on the school street; arriving starts the meeting -> 'aara'
 *   'aara'   Aara's translator and the English words (L2) -> 'park'
 *   'park'   three written clues in the town park (L3) -> 'figure'
 *   'figure' the friendly silhouette in the park (L4) -> 'lab'
 *   'lab'    back to the old building: Nino has news (L4); the chapter is done
 *
 * The step (and the clue count) is saved in `save.data.bab4`: after a reload the chapter goes on from there. The residents'
 * missions are paused meanwhile (CityPeople `canOffer`). Glen stays Glen (no switch) until the chapter is over.
 */
export class Chapter4 {
  step: Ch4Step;
  /** The child has reached Aara (this session). */
  arrived = false;
  private over = false;
  private disposed = false;
  private readonly tmp = new THREE.Vector3();
  /** Aara: at school until the translator test is done, then at the park gate. */
  private aara: AaraActor | null = null;
  private meeting = false;
  /** Test counters. */
  quizRuns = 0;
  questionsDone = 0;

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: Chapter4Hooks,
    private readonly lit: THREE.Material,
  ) {
    this.step = ctx.save.data.bab4.step as Ch4Step;
    ctx.onDispose(() => {
      this.disposed = true;
    });
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __ch4?: unknown };
      w.__ch4 = {
        step: () => this.step,
        arrived: () => this.arrived,
        advance: (s: Ch4Step) => this.setStep(s),
        done: () => this.over,
        aara: () => (this.aara ? { x: this.aara.group.position.x, z: this.aara.group.position.z, visible: this.aara.group.visible, level: this.aara.translatorLevel } : null),
        counts: () => ({ quizRuns: this.quizRuns, questionsDone: this.questionsDone }),
      };
      ctx.onDispose(() => {
        delete w.__ch4;
      });
    }
  }

  /** True until the chapter is finished (the residents' missions wait). */
  get active(): boolean {
    return !this.over;
  }

  /** Called once the level is built (and for Chapter 3's follow-on, once its celebration is over). */
  start(): void {
    const { ctx } = this;
    this.hooks.dropMission();
    // A detective: Glen without the costume, the switch is off until the chapter is over.
    ctx.game.setTransformAllowed(false);
    ctx.game.setPlayerMode('glen', false);
    if (this.step === '' || this.step === 'school') this.pointToSchool();
    if (this.step === 'aara') this.runAara();
    if (this.step === 'park') this.enterPark();
    if (this.step === '' || this.step === 'school' || this.step === 'aara') this.putAara(AARA.pos.x, AARA.pos.z, AARA.pos.yaw);
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (this.step === '') {
        this.setStep('school');
        await ctx.dialog.say(L.ninoMulai);
      }
    });
  }

  /** Save and switch to a step. */
  setStep(step: Ch4Step): void {
    this.step = step;
    this.ctx.save.setBab4(step, this.ctx.save.data.bab4.clue);
    this.ctx.game.debugInfo.ch4Step = step;
    if (step === 'school') this.pointToSchool();
    if (step === 'aara') this.runAara();
    if (step === 'park') this.enterPark();
  }

  private putAara(x: number, z: number, yaw: number): void {
    if (!this.aara) {
      this.aara = new AaraActor(this.lit);
      this.ctx.root.add(this.aara.group);
      this.ctx.onDispose(() => this.aara?.dispose());
    }
    this.aara.place(x, z, yaw);
  }

  /** Put the child at a stage spot when he is further than `maxDist` from it. */
  private stage(spot: { x: number; z: number; yaw: number }, maxDist: number): void {
    const p = this.ctx.player.position;
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > maxDist) this.hooks.placePlayer(spot.x, spot.z, spot.yaw);
  }

  /** The bank question (voice clips exist) or, when the bank lacks it, the first level-1 English question. */
  private english(id: string): Question {
    const list = this.ctx.quiz.bank.byCategory.inggris;
    return list.find((q) => q.id === id) ?? list.find((q) => q.level === 1) ?? list[0];
  }

  /**
   * Aara's translator test: she greets Glen, asks three English words (the quiz panel, bank questions "Apa bahasa Inggrisnya
   * buku / bola / kucing?"); every right answer makes the translator more advanced (bigger, brighter orb, sparkles, a ring).
   * Then it catches a signal that points to the town park: the beam and the map star lead there and Aara runs ahead.
   */
  private runAara(): void {
    if (this.meeting) return;
    this.meeting = true;
    const { ctx } = this;
    const { seq, dialog, cameraRig, fx } = ctx;
    seq.run(async () => {
      await seq.waitUntil(() => startGate.started);
      const info = ctx.game.debugInfo;
      info.ch4Scene = 'aara';
      ctx.game.setControlsEnabled(false);
      ctx.objectives.clear();
      this.hooks.setGoal(null);
      this.stage(AARA.stage, 7);
      const a = this.aara as AaraActor;
      a.setLevel(0);
      cameraRig.setFraming(this.tmp.set((AARA.pos.x + AARA.stage.x) / 2, 1.2, AARA.pos.z), { weight: 0.55, distance: 3 });
      await dialog.say(L.aaraHalo, { lockControls: true });
      await dialog.say(L.glenMau, { lockControls: true });
      const after = [L.aaraBenar1, L.aaraBenar2, L.aaraBenar3];
      for (let i = 0; i < AARA_QUESTIONS.length; i++) {
        const q = this.english(AARA_QUESTIONS[i]);
        let done = false;
        while (!done) {
          this.quizRuns++;
          const res = await ctx.quiz.runQuestion(q);
          done = res.completed;
          if (!done) await seq.wait(0.5);
        }
        this.questionsDone++;
        info.ch4Questions = this.questionsDone;
        // The translator grows: bigger, brighter orb, a pop of sparkles and a ring.
        a.setLevel(i + 1);
        const o = a.orbWorld;
        ctx.sfx.bling();
        fx.sparkles.burst(o.x, o.y, o.z, 14 + i * 8, 2.4 + i * 0.6, [0x7fe3a0, 0xffe27a, 0xff9ad5][i], { gravity: 1.2, life: 0.9 + i * 0.2, up: 0.7 });
        fx.flashes.spawn(o.x, o.y, o.z, 1.6 + i * 0.7, 0.6, [0x7fe3a0, 0xffe27a, 0xff9ad5][i]);
        await dialog.say(after[i], { lockControls: true });
      }
      // The signal: a big pop, then it points to the park.
      ctx.sfx.fanfare();
      const o = a.orbWorld;
      for (let k = 0; k < 3; k++) {
        fx.flashes.spawn(o.x, o.y, o.z, 2.2 + k * 0.9, 0.7, 0xffe27a);
        await seq.wait(0.25);
      }
      await dialog.say(L.aaraSinyal, { lockControls: true });
      await dialog.say(L.glenTaman, { lockControls: true });
      cameraRig.setFraming(null);
      this.setStep('park');
      ctx.game.setControlsEnabled(true);
      info.ch4Scene = 'park';
    });
  }

  /** The park step: Aara waits at the park gate (she ran ahead), the beam and the star lead there. */
  private enterPark(): void {
    this.putAara(PARK.aara.x, PARK.aara.z, PARK.aara.yaw);
    (this.aara as AaraActor).setLevel(3);
    this.hooks.setGoal({ x: PARK.centre.x, z: PARK.centre.z });
    this.ctx.objectives.set(this.tmp.set(PARK.centre.x, 0, PARK.centre.z));
  }

  private pointToSchool(): void {
    this.hooks.setGoal({ x: AARA.pos.x, z: AARA.pos.z });
    this.ctx.objectives.set(this.tmp.set(AARA.pos.x, 0, AARA.pos.z));
  }

  fixedUpdate(): void {
    if (this.over || this.disposed) return;
    const p = this.ctx.player.position;
    if (this.step === 'school' && !this.arrived && Math.hypot(p.x - AARA.pos.x, p.z - AARA.pos.z) < AARA.arriveRadius) {
      this.arrived = true;
      this.ctx.objectives.clear();
      this.hooks.setGoal(null);
      this.setStep('aara');
    }
    // Walked far away again before the meeting: the beam leads back.
    if (this.step === 'school' && this.arrived && Math.hypot(p.x - AARA.pos.x, p.z - AARA.pos.z) > AARA.arriveRadius + 25) {
      this.arrived = false;
      this.pointToSchool();
    }
  }

  update(dt = 1 / 60): void {
    this.aara?.update(dt);
    if (this.over) return;
    const info = this.ctx.game.debugInfo;
    info.ch4Step = this.step;
    info.ch4Arrived = this.arrived;
  }

  /** The chapter is over: the save says so and the city is free again. */
  complete(): void {
    if (this.over) return;
    this.over = true;
    this.ctx.save.markChapterDone('bab4');
    this.ctx.save.setBab4('', 0);
    this.ctx.objectives.clear();
    this.hooks.setGoal(null);
    this.ctx.game.setTransformAllowed(true);
    this.hooks.finished();
    this.ctx.game.debugInfo.ch4Step = 'done';
  }
}
