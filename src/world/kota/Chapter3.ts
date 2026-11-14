import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import { BAB3_LINES as L, MARKET, type FoodKind } from './Bab3Data';
import { MarketRats } from './MarketRats';

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
  /** The little rats, their food, Bu Lina and the drains. */
  readonly rats: MarketRats;
  private hintedSuper = false;
  private saidLucu = false;

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: Chapter3Hooks,
  ) {
    this.step = ctx.save.data.bab3.step as Ch3Step;
    ctx.onDispose(() => {
      this.disposed = true;
    });
    this.rats = new MarketRats(
      ctx,
      {
        onTamed: (i, food) => this.onTamed(i, food),
        onCollect: (kind) => this.onCollect(kind),
      },
      ctx.save.data.bab3.tamed,
    );
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __ch3?: unknown };
      w.__ch3 = {
        step: () => this.step,
        arrived: () => this.arrived,
        advance: (s: Ch3Step) => this.setStep(s),
        rats: () => this.rats.list(),
        tame: (i: number) => this.rats.tame(i),
        counts: () => ({ ...this.rats.collected, tamed: this.rats.tamedCount, stomps: this.rats.stomps, lasers: this.rats.lasers, dropped: this.rats.dropped }),
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

  /** A rat was tamed: remember it (saved), and when the last one is gone the chase is won. */
  private onTamed(i: number, _food: FoodKind): void {
    const save = this.ctx.save;
    const tamed = save.data.bab3.tamed;
    if (!tamed.includes(i)) save.setBab3(this.step, [...tamed, i]);
    if (!this.saidLucu) {
      this.saidLucu = true;
      void this.ctx.dialog.say(L.glenLucu);
    }
    if (this.rats.allTamed && this.step === 'chase') {
      this.ctx.seq.run(async () => {
        await this.ctx.seq.wait(2.2);
        if (this.step !== 'chase') return;
        this.setStep('count');
        await this.ctx.dialog.say(L.glenSemua);
      });
    }
  }

  private onCollect(_kind: FoodKind): void {
    // The count (L3) listens here.
  }

  private pointToMarket(): void {
    this.ctx.objectives.set(this.tmp.set(MARKET.hub.x, 0, MARKET.hub.z));
  }

  fixedUpdate(dt = 1 / 60): void {
    if (this.over || this.disposed) return;
    this.rats.fixedUpdate(dt);
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

  update(dt: number): void {
    const info = this.ctx.game.debugInfo;
    info.ch3Step = this.step;
    info.ch3Arrived = this.arrived;
    this.rats.update(dt);
    info.ch3Tamed = this.rats.tamedCount;
    info.ch3Dropped = this.rats.dropped;
    // Glen cannot tame: near the rats, Nino says to change into Superglen (the star button pulses on touch).
    const pl = this.ctx.player;
    const pv = pl.visualPosition;
    const glen = pl.mode === 'glen';
    const closeRats = this.step === 'chase' && this.rats.nearestRat(pv.x, pv.z) < 16;
    if (glen && closeRats && !this.hintedSuper) {
      this.hintedSuper = true;
      void this.ctx.dialog.say(L.ninoUbah);
    }
    this.ctx.game.pulseButton('transform', glen && closeRats);
    info.ch3GlenHint = this.hintedSuper;
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
