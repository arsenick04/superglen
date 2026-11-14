import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import { AARA, BAB4_LINES as L } from './Bab4Data';

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

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: Chapter4Hooks,
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
    }
    // Walked far away again before the meeting: the beam leads back.
    if (this.step === 'school' && this.arrived && Math.hypot(p.x - AARA.pos.x, p.z - AARA.pos.z) > AARA.arriveRadius + 25) {
      this.arrived = false;
      this.pointToSchool();
    }
  }

  update(): void {
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
