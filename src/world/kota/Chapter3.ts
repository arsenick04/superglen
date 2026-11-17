import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import type { Question } from '../../quiz/types';
import { BAB3_LINES as L, MARKET, MISSING, type FoodKind } from './Bab3Data';
import { Combat, CombatRng } from '../../config/combat';
import { MarketRats } from './MarketRats';
import { Celebration } from '../Celebration';
import { Easings } from '../../gameplay/Sequence';

const BUN_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="38" rx="25" ry="20" fill="#fff" stroke="#d9c7a8" stroke-width="3"/><circle cx="32" cy="17" r="5" fill="#f3e6d2" stroke="#d9c7a8" stroke-width="2"/></svg>';
const CAKE_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="30" width="52" height="24" rx="8" fill="#ffa6c9" stroke="#e0709b" stroke-width="3"/><path d="M6 36 Q14 28 22 36 Q30 44 38 36 Q46 28 58 36" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="22" r="7" fill="#e53935"/></svg>';

/** The story question of the count (not from the bank): 3 bakpao + 2 kue. */
const TOTAL_QUESTION: Question = {
  id: 'bab3_total',
  category: 'berhitung',
  level: 1,
  prompt: 'Totalnya berapa?',
  audio_id: 'bab3_lina_total',
  display: { kind: 'sum', a: { item: 'bakpao', count: MISSING.bakpao }, b: { item: 'kue', count: MISSING.kue } },
  choices: [
    { id: 'a', text: String(MISSING.bakpao + MISSING.kue - 1) },
    { id: 'b', text: String(MISSING.bakpao + MISSING.kue) },
    { id: 'c', text: String(MISSING.bakpao + MISSING.kue + 1) },
  ],
  answer: 'b',
};

/** What the level gives Chapter 3 (so this file does not need to know the level class). */
export interface Chapter3Hooks {
  /** The map star (null: it follows the objective beam). */
  setGoal(goal: { x: number; z: number } | null): void;
  /** A resident's mission may not run during the chapter: drop the running one. */
  dropMission(): void;
  /** The chapter ended: residents offer missions again (the map redraws). */
  finished(): void;
  /** Put the player on the ground at (x, z) facing `yaw` (colliders made ready, the camera snaps behind). */
  placePlayer(x: number, z: number, yaw: number): void;
  /** The chapter, its celebration included, is over: the story goes on (Chapter 4 starts). */
  afterParty(): void;
}

/** Chapter 3 steps, in order. '' = not started; the chapter is over when 'bab3' is in `chaptersDone`. */
export type Ch3Step = '' | 'chase' | 'count' | 'rakus' | 'closing';

/**
 * CHAPTER 3 "Pasar Kacau!" in the city (package D4). Built by KotaLevel only when Chapter 2 is done and Chapter 3 is not.
 *
 *   ''        (the alarm already sounded at the end of Chapter 2) a short Nino line, Superglen, the beam and the map star point to the market crossing -> 'chase'
 *   'chase'   the 7 little rats (MarketRats.ts) run around the market; each one tamed drops its food
 *   'count'   Bu Lina: "Bakpaoku hilang 3, kue hilang 2." collect the 5 foods, then "Totalnya berapa?" (quiz card)
 *   'rakus'   Si Tikus Rakus laughs and runs down the drain (a scene, no fight)
 *   'closing' Nino cheers; the chapter is done, the city is free again
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
  private counting = false;
  private scene = false;
  private party: Celebration | null = null;
  private beamTick = 0;
  /** The top-centre counter: bakpao and kue picked up out of what Bu Lina misses. */
  private readonly hud: HTMLDivElement;
  private readonly hudNum: Record<'bakpao' | 'kue', HTMLElement>;
  private readonly hudChip: Record<'bakpao' | 'kue', HTMLElement>;
  /** Test counters. */
  quizRuns = 0;
  countsDone = 0;

  constructor(
    private readonly ctx: LevelContext,
    private readonly hooks: Chapter3Hooks,
  ) {
    this.step = ctx.save.data.bab3.step as Ch3Step;
    // Once the rats fight back, story lines are small call-outs that never stop the chase (Dialog compact mode).
    const dropRule = ctx.dialog.addCompactRule(() => this.step === 'chase' && this.arrived && (this.rats.lasers > 0 || this.rats.tamedCount > 0 || this.rats.combatCounts().attacks > 0));
    ctx.onDispose(() => {
      this.disposed = true;
      dropRule();
    });
    this.hud = document.createElement('div');
    this.hud.className = 'ch3-count';
    this.hud.innerHTML =
      `<div class="ch3-chip" data-k="bakpao">${BUN_SVG}<span>0/${MISSING.bakpao}</span></div>` + `<div class="ch3-chip" data-k="kue">${CAKE_SVG}<span>0/${MISSING.kue}</span></div>`;
    ctx.ui.appendChild(this.hud);
    ctx.onDispose(() => this.hud.remove());
    const chip = (k: string): HTMLElement => this.hud.querySelector(`[data-k="${k}"]`) as HTMLElement;
    this.hudChip = { bakpao: chip('bakpao'), kue: chip('kue') };
    this.hudNum = { bakpao: this.hudChip.bakpao.querySelector('span') as HTMLElement, kue: this.hudChip.kue.querySelector('span') as HTMLElement };
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
        done: () => this.over,
        rats: () => this.rats.list(),
        tame: (i: number) => this.rats.tame(i),
        attack: (i: number, kind: 0 | 1) => this.rats.forceAttack(i, kind),
        hit: (i: number) => this.rats.hit(i),
        combat: () => this.rats.combatCounts(),
        mute: (on: boolean) => {
          this.rats.muted = on;
        },
        setRng: (v: number | null) => {
          CombatRng.next = v === null ? Math.random : () => v;
        },
        // The deterministic city combat suites exercise each mechanic in
        // place. A separate smoke suite leaves this enabled and verifies the
        // real city -> encounter transition.
        setArenaEnabled: (on: boolean) => {
          this.arenaEnabled = on;
        },
        collect: () => this.rats.collectAll(),
        counts: () => ({ quizRuns: this.quizRuns, countsDone: this.countsDone, ...this.rats.collected, tamed: this.rats.tamedCount, stomps: this.rats.stomps, lasers: this.rats.lasers, dropped: this.rats.dropped }),
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
    // The last tame is saved before its delayed victory sequence runs. A
    // reload in that window must resume counting, without waiting for a tame
    // callback from rats that have already gone.
    if (this.step === 'chase' && this.rats.allTamed) {
      this.step = 'count';
      ctx.save.setBab3('count', ctx.save.data.bab3.tamed);
    }
    if (this.step === '' || this.step === 'chase') this.pointToMarket();
    if (this.step === 'count') this.runCount();
    if (this.step === 'rakus' || this.step === 'closing') {
      // Resumed after the count: the market is calm again (food back at the stalls), the scene plays.
      this.rats.clearFoods();
      this.hud.classList.remove('show');
      this.runRakus(this.step === 'closing');
    }
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (this.step === '') {
        // Chapter 2 ended with the market alarm: no second alarm, just a short nudge from Nino. The market needs Superglen.
        this.setStep('chase');
        ctx.game.setPlayerMode('superglen', false);
        await ctx.dialog.say(L.ninoCepat);
      }
    });
  }

  /** Save and switch to a step. */
  setStep(step: Ch3Step): void {
    this.step = step;
    const s = this.ctx.save.data.bab3;
    this.ctx.save.setBab3(step, s.tamed);
    this.ctx.game.debugInfo.ch3Step = step;
    if (step === 'count') this.runCount();
    if (step === 'rakus') this.runRakus(false);
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
    this.paintHud();
    this.ctx.game.debugInfo.ch3Collected = this.rats.collected.bakpao + this.rats.collected.kue;
  }

  private paintHud(): void {
    const c = this.rats.collected;
    const shown = this.rats.dropped > 0 || c.bakpao + c.kue > 0 || this.step === 'count';
    this.hud.classList.toggle('show', shown && this.step !== 'rakus' && this.step !== 'closing');
    for (const k of ['bakpao', 'kue'] as const) {
      const n = Math.min(MISSING[k], c[k]);
      const txt = `${n}/${MISSING[k]}`;
      if (this.hudNum[k].textContent !== txt) this.hudNum[k].textContent = txt;
      this.hudChip[k].classList.toggle('full', n >= MISSING[k]);
    }
  }

  private get gotAll(): boolean {
    const c = this.rats.collected;
    return c.bakpao >= MISSING.bakpao && c.kue >= MISSING.kue;
  }

  /**
   * The count: Bu Lina says what is missing, the child picks up the fallen bakpao and kue (the beam leads to the nearest), then
   * "Totalnya berapa?": three big cards (the quiz panel; the pictures of 3 bakpao + 2 kue are on screen, a wrong card shakes and
   * after two wrong ones only the right one stays). Right: the food flies back to the stall, hooray, on to Si Tikus Rakus.
   */
  private runCount(): void {
    if (this.counting) return;
    this.counting = true;
    const { ctx } = this;
    const { seq, dialog } = ctx;
    seq.run(async () => {
      await dialog.sequence([L.linaHilang, L.linaTolong]);
      await seq.waitUntil(() => this.gotAll);
      ctx.objectives.clear();
      await dialog.say(L.linaTotal, { lockControls: true });
      let done = false;
      while (!done) {
        this.quizRuns++;
        const res = await ctx.quiz.runQuestion(TOTAL_QUESTION);
        done = res.completed;
        if (!done) await seq.wait(0.5);
      }
      this.countsDone++;
      this.rats.returnAll();
      ctx.sfx.fanfare();
      const p = ctx.player.visualPosition;
      for (let i = 0; i < 3; i++) {
        ctx.fx.sparkles.burst(p.x + (i - 1) * 1.1, p.y + 2.2, p.z, 30, 4.5, -1, { gravity: 3, life: 1.4, up: 1 });
        await seq.wait(0.2);
      }
      await dialog.say(L.linaHore);
      this.setStep('rakus');
    });
  }

  /** While counting: the beam shows the nearest fallen food. */
  /**
   * Si Tikus Rakus (a scene, no fight): he pops up at the crossing, laughs "Hihihi, semua makanan ini milikku!", runs to a drain
   * shouting that he will be KING one day. Then the closing: Nino cheers.
   */
  private runRakus(skipRakus: boolean): void {
    if (this.scene) return;
    this.scene = true;
    const { ctx } = this;
    const { seq, dialog, game, cameraRig } = ctx;
    seq.run(async () => {
      await seq.waitUntil(() => startGate.started);
      const info = game.debugInfo;
      info.ch3Scene = 'start';
      game.setControlsEnabled(false);
      ctx.objectives.clear();
      this.hooks.setGoal(null);
      const hub = MARKET.hub;
      if (!skipRakus) {
        // The scene needs the child at the crossing (a clear view of the street, not behind pines or on the plaza).
        this.stage(MARKET.stage.rakus, 14);
        cameraRig.setFraming(this.tmp.set(hub.x, 1.2, hub.z), { weight: 0.6, distance: 5 });
        const mesh = this.rats.makeRakus();
        mesh.position.set(hub.x, 0, hub.z);
        mesh.visible = true;
        info.ch3Scene = 'rakus';
        mesh.scale.setScalar(0.01);
        ctx.sfx.bling();
        ctx.fx.sparkles.burst(hub.x, 0.8, hub.z, 30, 4, 0xffe6a8, { gravity: 2, life: 0.9, up: 0.8 });
        ctx.fx.flashes.spawn(hub.x, 1.0, hub.z, 3, 0.7, 0xffffff);
        await seq.tween(0.5, (t) => mesh.scale.setScalar(0.01 + 3.2 * t), Easings.easeOutBack);
        mesh.rotation.y = 0;
        await dialog.say(L.rakusTawa, { lockControls: true });
        await dialog.say(L.glenHei, { lockControls: true });
        // He runs down the street to the north drain, laughing; the line is said while he runs.
        const d = MARKET.drains[MARKET.rakus.drain];
        const x0 = mesh.position.x;
        const z0 = mesh.position.z;
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = Math.atan2(d.x - x0, d.z - z0);
        void dialog.say(L.rakusRaja, { lockControls: true });
        const dur = Math.hypot(d.x - x0, d.z - z0) / 8;
        await seq.tween(dur, (t) => {
          mesh.position.set(x0 + (d.x - x0) * t, Math.abs(Math.sin(t * dur * 7)) * 0.22, z0 + (d.z - z0) * t);
          // Waddling run (the model is static): rocks side to side and leans forward, with a squash on every hop.
          mesh.rotation.z = Math.sin(t * dur * 7) * 0.1;
          mesh.rotation.x = 0.16;
          mesh.scale.set(3.2 * (1 + Math.sin(t * dur * 14) * 0.03), 3.2 * (1 - Math.sin(t * dur * 14) * 0.04), 3.2);
          cameraRig.setFraming(this.tmp.set(mesh.position.x, 1.2, mesh.position.z), { weight: 0.6, distance: 5 });
        });
        ctx.fx.sparkles.burst(d.x, 0.4, d.z, 18, 3, 0xdfe6f2, { gravity: 1.5, life: 0.7, up: 0.7 });
        ctx.sfx.pop();
        mesh.visible = false;
        await dialog.say(L.ninoRakus, { lockControls: true });
        this.setStep('closing');
      }
      info.ch3Scene = 'closing';
      await this.closing();
      info.ch3Scene = 'end';
    });
  }

  /** The end: Nino cheers (Tikus Rakus fled), then the chapter is done with stars and confetti. */
  private async closing(): Promise<void> {
    const { ctx } = this;
    const { dialog, game, cameraRig } = ctx;
    await dialog.say(L.ninoHebat, { lockControls: true });
    cameraRig.setFraming(null);
    game.setControlsEnabled(true);
    // The chapter is done: stars and confetti, a few coins, the city is free again.
    this.complete();
    ctx.save.finishCityMission('bab3', 5);
    ctx.quiz.coinsChanged();
    this.party = new Celebration(ctx, 'Chapter 3 selesai!', ctx.fx.sparkles);
    await this.party.play();
    this.hooks.afterParty();
  }

  /** Put the child at a stage spot (street, clear view) when he is further than `maxDist` from it. */
  private stage(spot: { x: number; z: number; yaw: number }, maxDist: number): void {
    const p = this.ctx.player.position;
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > maxDist) this.hooks.placePlayer(spot.x, spot.z, spot.yaw);
  }

  private foodBeam(): void {
    if (this.step !== 'count' || !this.counting || this.gotAll) return;
    if (++this.beamTick % 15 !== 0) return;
    const p = this.ctx.player.position;
    const f = this.rats.nearestFood(p.x, p.z);
    if (f) this.ctx.objectives.set(this.tmp.set(f.x, 0, f.z));
  }

  private pointToMarket(): void {
    this.ctx.objectives.set(this.tmp.set(MARKET.hub.x, 0, MARKET.hub.z));
  }

  // ---- battle mode: the rats fight back once the child is close to one ----
  private arenaLoading = false;
  private arenaEnabled = true;
  private readonly ratAt = { x: 0, y: 0.9, z: 0 };

  private battleCheck(): void {
    const { ctx } = this;
    const p = ctx.player.position;
    const near = this.step === 'chase' && this.arrived && !ctx.health.resting && this.rats.nearestPos(p.x, p.z, this.ratAt);
    const d = near ? Math.hypot(this.ratAt.x - p.x, this.ratAt.z - p.z) : Infinity;
    if (this.arenaEnabled && !this.arenaLoading && d < Combat.rat.aggroRadius && startGate.started && ctx.game.controlsEnabled) {
      this.arenaLoading = true;
      void ctx.game.loadLevel('battle-curut');
    }
  }

  fixedUpdate(dt = 1 / 60): void {
    if (this.over || this.disposed) return;
    this.rats.fixedUpdate(dt);
    this.battleCheck();
    this.foodBeam();
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
    if (this.over) return;
    const info = this.ctx.game.debugInfo;
    info.ch3Step = this.step;
    info.ch3Arrived = this.arrived;
    this.rats.update(dt);
    this.paintHud();
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
    this.ctx.game.pulseButton('transform', false);
    this.hud.classList.remove('show');
    this.ctx.save.markChapterDone('bab3');
    this.ctx.save.setBab3('', []);
    this.ctx.objectives.clear();
    this.hooks.setGoal(null);
    this.hooks.finished();
    this.ctx.game.debugInfo.ch3Step = 'done';
  }
}
