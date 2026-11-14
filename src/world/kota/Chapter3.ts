import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import { BAB3_LINES as L, MARKET } from './Bab3Data';

/** What the level gives Chapter 3 (so this file does not need to know the level class). */
export interface Chapter3Hooks {
  /** The map star (null: it follows the objective beam). */
  setGoal(goal: { x: number; z: number } | null): void;
  /** A resident's mission may not run during the chapter: drop the running one. */
  dropMission(): void;
  /** The chapter ended: residents offer missions again (the map redraws). */
  finished(): void;
}

/** Chapter 3 steps, in order. '' = not started; the chapter is over when 'bab3' is in `chaptersDone`. */
export type Ch3Step = '' | 'chase' | 'count' | 'rakus' | 'closing';

/**
 * CHAPTER 3 "Pasar Kacau!" in the city (package D4). Built by KotaLevel only when Chapter 2 is done and Chapter 3 is not.
 *
 *   ''        Nino's alarm over the comm (dialog), the beam and the map star point to the market crossing -> 'chase'
 *   'chase'   the 7 little rats (MarketRats.ts) run around the market; each one tamed drops its food
 *   'count'   Bu Lina: "Bakpaoku hilang 3, kue hilang 2." collect the 5 foods, then "Totalnya berapa?" (quiz card)
 *   'rakus'   Si Tikus Rakus laughs and runs down the drain (a scene, no fight)
 *   'closing' a figure waves in the shade of the pagoda and is gone; the chapter is done, the city is free again
 *
 * The step and the tamed rats are saved (`save.data.bab3`): after a reload the chapter goes on from there (the alarm is not
 * repeated; the beam shows the way). The residents' missions are paused meanwhile (CityPeople `canOffer`).
 */
export class Chapter3 {
  step: Ch3Step;
  /** The child has reached the market crossing (this session). */
  arrived = false;
  private over = false;
  private readonly tmp = new THREE.Vector3();
  private disposed = false;

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: Chapter3Hooks,
  ) {
    this.step = ctx.save.data.bab3.step as Ch3Step;
    ctx.onDispose(() => {
      this.disposed = true;
    });
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __ch3?: unknown };
      w.__ch3 = {
        step: () => this.step,
        arrived: () => this.arrived,
        advance: (s: Ch3Step) => this.setStep(s),
      };
      ctx.onDispose(() => {
        delete w.__ch3;
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
    this.hooks.setGoal({ x: MARKET.hub.x, z: MARKET.hub.z });
    if (this.step === '' || this.step === 'chase') this.pointToMarket();
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (this.step === '') {
        // The alarm of Chapter 2 sounded in the lab: Nino calls over the comm.
        this.setStep('chase');
        await ctx.dialog.sequence([L.ninoAlarm, L.glenSiap]);
      }
    });
  }

  /** Save and switch to a step. */
  setStep(step: Ch3Step): void {
    this.step = step;
    const s = this.ctx.save.data.bab3;
    this.ctx.save.setBab3(step, s.tamed);
    this.ctx.game.debugInfo.ch3Step = step;
  }

  private pointToMarket(): void {
    this.ctx.objectives.set(this.tmp.set(MARKET.hub.x, 0, MARKET.hub.z));
  }

  fixedUpdate(): void {
    if (this.over || this.disposed) return;
    const p = this.ctx.player.position;
    if (!this.arrived && Math.hypot(p.x - MARKET.hub.x, p.z - MARKET.hub.z) < MARKET.arriveRadius) {
      this.arrived = true;
      this.ctx.objectives.clear();
      this.hooks.setGoal(null);
      if (this.step === 'chase') void this.ctx.dialog.say(L.ninoTiba);
    }
    // Far from the market again: the beam leads back (chase and count).
    if (this.arrived && (this.step === 'chase' || this.step === 'count')) {
      const far = Math.hypot(p.x - MARKET.hub.x, p.z - MARKET.hub.z) > MARKET.arriveRadius + 30;
      if (far) {
        this.arrived = false;
        this.hooks.setGoal({ x: MARKET.hub.x, z: MARKET.hub.z });
        this.pointToMarket();
      }
    }
  }

  update(_dt: number): void {
    this.ctx.game.debugInfo.ch3Step = this.step;
    this.ctx.game.debugInfo.ch3Arrived = this.arrived;
  }

  /** The chapter is over: the save says so and the city is free again. */
  complete(): void {
    if (this.over) return;
    this.over = true;
    this.ctx.save.markChapterDone('bab3');
    this.ctx.save.setBab3('', []);
    this.ctx.objectives.clear();
    this.hooks.setGoal(null);
    this.hooks.finished();
    this.ctx.game.debugInfo.ch3Step = 'done';
  }
}
