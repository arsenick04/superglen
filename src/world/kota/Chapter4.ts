import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import type { Question } from '../../quiz/types';
import { AaraActor } from './Aara';
import { personGeo } from './CityPeople';
import { CITY_LAYOUT } from './CityData';
import { ClueProps } from './ClueProps';
import { AARA, AARA_QUESTIONS, BAB4_LINES as L, CLUE_ARRIVE, CLUE_HELP_AFTER, CLUE_PAPER0, CLUE_PRAISE, CLUES, FIGURE, PARK } from './Bab4Data';

/** What the level gives Chapter 4 (so this file does not need to know the level class). */
export interface Chapter4Hooks {
  /** The map star (null: it follows the objective beam). */
  setGoal(goal: { x: number; z: number } | null): void;
  /** A resident's mission may not run during the chapter: drop the running one. */
  dropMission(): void;
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
  /** Park clues: how many are read (saved), where the child is in the loop, the board and the beacon. */
  private clue = 0;
  private phase: '' | 'paper' | 'place' = '';
  private props: ClueProps | null = null;
  private reading = false;
  private saidTaman = false;
  private saidBaca = false;
  private figureScene = false;
  private idle = 0;
  private beamTick = 0;
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
        clues: () => ({
          clue: this.clue,
          phase: this.phase,
          reading: this.reading,
          paper: this.props ? { x: this.props.paperAt.x, z: this.props.paperAt.z, visible: this.props.paper.visible } : null,
          beacon: this.props ? { x: this.props.beacon.position.x, z: this.props.beacon.position.z, visible: this.props.beacon.visible } : null,
        }),
        /** Test: open the board's reading (as pressing the hand button at it). */
        read: () => this.readClue(),
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
    if (this.step === 'figure') this.runFigure();
    if (this.step === 'lab') this.pointToLab();
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
    if (step === 'figure') this.runFigure();
    if (step === 'lab') this.pointToLab();
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

  private pointToSchool(): void {
    this.hooks.setGoal({ x: AARA.pos.x, z: AARA.pos.z });
    this.ctx.objectives.set(this.tmp.set(AARA.pos.x, 0, AARA.pos.z));
  }

  /** The park step: Aara waits at the park gate (she ran ahead), the beam and the star lead to the park / the current board. */
  private enterPark(): void {
    this.putAara(PARK.aara.x, PARK.aara.z, PARK.aara.yaw);
    (this.aara as AaraActor).setLevel(3);
    this.hooks.setGoal({ x: PARK.centre.x, z: PARK.centre.z });
    const { ctx } = this;
    if (!this.props) {
      this.props = new ClueProps(this.lit);
      this.props.addTo(ctx.root);
      ctx.onDispose(() => this.props?.dispose());
      const target = new THREE.Vector3();
      ctx.interactions.add({
        position: () => target.set(this.props!.paperAt.x, 0.9, this.props!.paperAt.z),
        radius: 2.6,
        icon: 'hand',
        promptHeight: 1.9,
        enabled: () => this.step === 'park' && this.phase === 'paper' && !this.reading,
        onInteract: () => this.readClue(),
      });
    }
    this.clue = ctx.save.data.bab4.clue;
    this.idle = 0;
    if (this.clue >= CLUES.length) this.startPlace();
    else this.startPaper();
  }

  /** The board of clue `this.clue` stands at the place of the clue before (or on the north path). */
  private paperSpot(): { x: number; z: number } {
    return this.clue === 0 ? CLUE_PAPER0 : CLUES[this.clue - 1].spot;
  }

  private startPaper(): void {
    const sp = this.paperSpot();
    this.phase = 'paper';
    this.idle = 0;
    this.props!.hideBeacon();
    this.props!.showPaper(sp.x, sp.z);
    this.ctx.objectives.set(this.tmp.set(sp.x, 0, sp.z));
    this.ctx.game.debugInfo.ch4Phase = 'paper';
  }

  /** The last clue named a place: it glows and the beam leads there. */
  private startPlace(): void {
    const c = CLUES[this.clue - 1];
    this.phase = 'place';
    this.idle = 0;
    this.props!.hidePaper();
    this.props!.showBeacon(c.glow.x, c.glow.z);
    this.ctx.objectives.set(this.tmp.set(c.spot.x, 0, c.spot.z));
    this.ctx.game.debugInfo.ch4Phase = 'place';
  }

  /** The reading question of clue `i`: the written word, three picture cards (the speaker button reads the word aloud). */
  private clueQuestion(i: number): Question {
    const ids = CLUES.map((c) => c.word);
    return {
      id: `bab4_clue_${CLUES[i].word}`,
      category: 'membaca',
      level: 1,
      prompt: 'Baca katanya. Tempat apa?',
      audio_id: `bab4_kata_${CLUES[i].word}`,
      display: { kind: 'text', text: CLUES[i].word },
      choices: [
        { id: 'a', item: ids[0] },
        { id: 'b', item: ids[1] },
        { id: 'c', item: ids[2] },
      ],
      answer: (['a', 'b', 'c'] as const)[i],
    };
  }

  /** Read the board: the word big on a card with the speaker button; the right picture makes the place glow. */
  private readClue(): void {
    if (this.reading || this.step !== 'park' || this.phase !== 'paper' || this.clue >= CLUES.length) return;
    this.reading = true;
    const { ctx } = this;
    const { seq, dialog } = ctx;
    seq.run(async () => {
      const i = this.clue;
      ctx.game.debugInfo.ch4Reading = CLUES[i].word;
      if (!this.saidBaca) {
        this.saidBaca = true;
        await dialog.say(L.aaraBaca, { lockControls: true });
      }
      let done = false;
      while (!done) {
        this.quizRuns++;
        const res = await ctx.quiz.runQuestion(this.clueQuestion(i));
        done = res.completed;
        if (!done) await seq.wait(0.4);
      }
      this.questionsDone++;
      this.clue = i + 1;
      ctx.save.setBab4('park', this.clue);
      ctx.game.debugInfo.ch4Clue = this.clue;
      ctx.sfx.bling();
      const sp = this.props!.paperAt;
      ctx.fx.sparkles.burst(sp.x, 1.3, sp.z, 20, 3, 0xffe27a, { gravity: 1.5, life: 1, up: 0.8 });
      this.startPlace();
      this.reading = false;
      await dialog.say(CLUE_PRAISE[i]);
    });
  }

  /** Arrived at the glowing place: the beacon fades, the next board shows up here (or, after the last clue, the figure). */
  private arrivedAtPlace(): void {
    const { ctx } = this;
    const c = CLUES[this.clue - 1];
    ctx.sfx.bling();
    ctx.fx.sparkles.burst(c.glow.x, 0.6, c.glow.z, 28, 3.5, 0xffe27a, { gravity: 1.2, life: 1.1, up: 0.9 });
    ctx.fx.flashes.spawn(c.glow.x, 0.8, c.glow.z, 2.4, 0.7, 0xffe27a);
    this.props!.hideBeacon();
    ctx.objectives.clear();
    if (this.clue >= CLUES.length) {
      this.phase = '';
      this.setStep('figure');
      return;
    }
    this.startPaper();
    this.ctx.objectives.clear();
    void ctx.dialog.say(L.aaraLagi);
  }

  /**
   * The Sosok Misterius: across the pond a soft dark-blue silhouette fades in, waves, says "Aku sudah lama mengawasimu...
   * Superglen." and is gone in a sparkle (friendly, nothing to fear). Aara asks Glen to report to Nino in the lab.
   */
  private runFigure(): void {
    if (this.figureScene) return;
    this.figureScene = true;
    const { ctx } = this;
    const { seq, dialog, cameraRig, fx } = ctx;
    seq.run(async () => {
      await seq.waitUntil(() => startGate.started);
      const info = ctx.game.debugInfo;
      info.ch4Scene = 'figure';
      ctx.game.setControlsEnabled(false);
      ctx.objectives.clear();
      this.hooks.setGoal(null);
      this.props?.hideBeacon();
      this.stage(FIGURE.stage, 5);
      this.putAara(PARK.aara.x, PARK.aara.z, PARK.aara.yaw);
      const f = FIGURE.pos;
      const geo = personGeo(0x34406a, 0x34406a);
      const mat = new THREE.MeshBasicMaterial({ color: 0x34406a, transparent: true, opacity: 0, fog: true });
      const fig = new THREE.Mesh(geo, mat);
      fig.position.set(f.x, 0, f.z);
      fig.rotation.y = Math.atan2(FIGURE.stage.x - f.x, FIGURE.stage.z - f.z);
      fig.scale.setScalar(1.2);
      fig.castShadow = false;
      ctx.root.add(fig);
      cameraRig.setFraming(this.tmp.set(f.x, 1.2, f.z), { weight: 0.45, distance: 3 });
      await seq.tween(0.9, (t) => (mat.opacity = 0.8 * t));
      let t = 0;
      const wave = (): boolean => {
        t += 1 / 60;
        fig.rotation.z = Math.sin(t * 7) * 0.12;
        return false;
      };
      seq.run(() => seq.waitUntil(wave));
      await dialog.say(L.aaraLihat, { lockControls: true });
      await dialog.say(L.misteriusAwas, { lockControls: true });
      await seq.tween(0.7, (u) => (mat.opacity = 0.8 * (1 - u)));
      fx.sparkles.burst(f.x, 1, f.z, 22, 2.6, 0xbcd0ff, { gravity: 0.5, life: 1.1, up: 0.6 });
      fig.removeFromParent();
      geo.dispose();
      mat.dispose();
      await dialog.say(L.glenTahu, { lockControls: true });
      await dialog.say(L.aaraLapor, { lockControls: true });
      cameraRig.setFraming(null);
      this.setStep('lab');
      ctx.game.setControlsEnabled(true);
      info.ch4Scene = 'lab';
    });
  }

  /** Back to the old building: the beam and the star lead to its door; inside, Nino has news (Story.chapter4Finale). */
  private pointToLab(): void {
    const d = CITY_LAYOUT.lab.door;
    this.hooks.setGoal({ x: d.x, z: d.z });
    this.ctx.objectives.set(this.tmp.set(d.x, d.y, d.z + 0.9));
    this.props?.hidePaper();
    this.props?.hideBeacon();
    this.putAara(PARK.aara.x, PARK.aara.z, PARK.aara.yaw);
  }

  private labBeam(): void {
    if (++this.beamTick % 20 !== 0) return;
    const d = CITY_LAYOUT.lab.door;
    const p = this.ctx.player.position;
    const dist = Math.hypot(p.x - d.x, p.z - d.z);
    if (dist < 6 && this.ctx.objectives.active) this.ctx.objectives.clear();
    else if (dist >= 10 && !this.ctx.objectives.active) this.ctx.objectives.set(this.tmp.set(d.x, d.y, d.z + 0.9));
  }

  /** Clue help: nobody gets stuck (Aara says what to do again; the beam leads back when the child wandered off). */
  private clueTick(dt: number): void {
    const p = this.ctx.player.position;
    const tgt = this.phase === 'paper' ? this.paperSpot() : this.phase === 'place' ? CLUES[this.clue - 1].spot : null;
    if (!tgt) return;
    const d = Math.hypot(p.x - tgt.x, p.z - tgt.z);
    if (this.phase === 'place' && d < CLUE_ARRIVE) {
      this.arrivedAtPlace();
      return;
    }
    if (!this.saidTaman && Math.hypot(p.x - PARK.centre.x, p.z - PARK.centre.z) < PARK.arriveRadius && this.phase === 'paper' && this.clue === 0) {
      this.saidTaman = true;
      void this.ctx.dialog.say(L.aaraTaman);
    }
    // The beam shows when the target is not close (it would stand in the child's face).
    if (++this.beamTick % 20 === 0) {
      if (d < 4.5 && this.ctx.objectives.active) this.ctx.objectives.clear();
      else if (d >= 7 && !this.ctx.objectives.active && !this.reading) this.ctx.objectives.set(this.tmp.set(tgt.x, 0, tgt.z));
    }
    if (this.reading || this.ctx.dialog.active) {
      this.idle = 0;
      return;
    }
    this.idle += dt;
    if (this.idle > CLUE_HELP_AFTER) {
      this.idle = 0;
      void this.ctx.dialog.say(this.phase === 'paper' ? L.aaraPapan : L.aaraAyo);
    }
  }

  fixedUpdate(dt = 1 / 60): void {
    if (this.over || this.disposed) return;
    if (this.step === 'park') this.clueTick(dt);
    if (this.step === 'lab') this.labBeam();
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
    if (this.props) {
      const pv = this.ctx.player.visualPosition;
      this.props.update(dt, pv.x, pv.z, (x, y, z) => this.ctx.fx.sparkles.burst(x, y, z, 3, 1.4, 0xffe27a, { gravity: -0.5, life: 1.4, up: 1.6 }));
    }
    if (this.over) return;
    const info = this.ctx.game.debugInfo;
    info.ch4Step = this.step;
    info.ch4Arrived = this.arrived;
  }
}
