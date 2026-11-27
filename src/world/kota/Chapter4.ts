import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import type { Question } from '../../quiz/types';
import { AaraActor } from './Aara';
import { Celebration } from '../Celebration';
import { ClueProps } from './ClueProps';
import { AARA, AARA_QUESTIONS, BAB4_LINES as L, CLUE_ARRIVE, CLUE_HELP_AFTER, CLUE_PAPER0, CLUE_PRAISE, CLUES, PARK, TRACK } from './Bab4Data';
import { enemyModels } from './EnemyModels';
import { camoBallGeo } from './SnakeBoss';

/** What the level gives Chapter 4 (so this file does not need to know the level class). */
export interface Chapter4Hooks {
  /** The map star (null: it follows the objective beam). */
  setGoal(goal: { x: number; z: number } | null): void;
  /** A resident's mission may not run during the chapter: drop the running one. */
  dropMission(): void;
  /** Put the player on the ground at (x, z) facing `yaw` (colliders made ready, the camera snaps behind). */
  placePlayer(x: number, z: number, yaw: number): void;
  /** Chapter 4 is over (the city is free again). Hook for the next chapter (Ular Melar, the Lab with Aara). */
  onDone(): void;
}

/** Chapter 4 steps, in order. '' = not started; the chapter is over when 'bab4' is in `chaptersDone`. */
export type Ch4Step = '' | 'school' | 'aara' | 'park' | 'track';

/**
 * CHAPTER 4 "Aara dan Alat Penerjemah" in the city (package D5). Built by KotaLevel only when Chapter 3 is done and Chapter 4 is not.
 *
 *   ''       (Chapter 3 just ended) Glen takes off the costume (a detective), Nino sends him to Aara; the beam and the map star
 *            point to the school -> 'school'
 *   'school' walk to Aara on the school street; arriving starts the meeting -> 'aara'
 *   'aara'   Aara's translator and the English words (L2) -> 'park'
 *   'park'   three written clues in the town park (L3) -> 'track'
 *   'track'  a long shed snake skin by the pond (L4, teaser for the Ular Melar): Glen says he knows someone who can help;
 *            Chapter 4 is done (celebration, `hooks.onDone`). NEXT CHAPTER: the Lab introduction + Ular Melar fight.
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
  private trackScene = false;
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
    const saved = ctx.save.data.bab4.step;
    this.step = (saved === 'figure' || saved === 'lab' ? 'track' : saved) as Ch4Step;
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
    ctx.game.preloadCinematic('aara-meet');
    if (this.step === '' || this.step === 'school') this.pointToSchool();
    if (this.step === 'aara') this.runAara();
    if (this.step === 'park') this.enterPark();
    if (this.step === 'track') this.runTrack();
    if (this.step === '' || this.step === 'school' || this.step === 'aara') this.putAara(AARA.pos.x, AARA.pos.z, AARA.pos.yaw);
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (this.step === '') {
        this.setStep('school');
        await ctx.dialog.say(L.glenMulai);
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
    if (step === 'track') this.runTrack();
  }

  private putAara(x: number, z: number, yaw: number): void {
    if (!this.aara) {
      this.aara = new AaraActor(this.lit, this.ctx.dialog);
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

  /** Ids already asked by Aara in this session, per set; a set resets once its pool is exhausted (no repeats until then). */
  private readonly asked = new Map<string, Set<string>>();

  /** A random question of Aara's own `set` (aara_sekolah / aara_taman), never repeating one within the session until the pool runs out. */
  private pickAara(cat: 'inggris' | 'membaca', set: string, fallbackId?: string): Question {
    const all = this.ctx.quiz.bank.byCategory[cat];
    const pool = all.filter((q) => q.set === set);
    if (pool.length === 0) return fallbackId ? this.english(fallbackId) : all[0];
    let used = this.asked.get(set);
    if (!used) this.asked.set(set, (used = new Set()));
    let fresh = pool.filter((q) => !used.has(q.id));
    if (fresh.length === 0) {
      used.clear();
      fresh = pool;
    }
    const q = fresh[Math.floor(Math.random() * fresh.length)];
    used.add(q.id);
    return q;
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
      await ctx.game.playCinematic('aara-meet');
      ctx.game.setControlsEnabled(false);
      const after = [L.aaraBenar1, L.aaraBenar2, L.aaraBenar3];
      for (let i = 0; i < AARA_QUESTIONS.length; i++) {
        // Three random English questions from Aara's school set (the story only needs three right answers).
        const q = this.pickAara('inggris', 'aara_sekolah', AARA_QUESTIONS[i]);
        let done = false;
        while (!done) {
          this.quizRuns++;
          const res = await ctx.quiz.runQuestion(q, 'story', 'aara');
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

  /**
   * The reading question at a board: drawn at random from the bank set "aara_taman" (varies each play). It is decoupled from the
   * place: the story flow (3 fixed map spots, each glowing after a right answer) is unchanged, and Aara's praise names the place.
   */
  private clueQuestion(): Question {
    return this.pickAara('membaca', 'aara_taman');
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
      const q = this.clueQuestion();
      let done = false;
      while (!done) {
        this.quizRuns++;
        const res = await ctx.quiz.runQuestion(q, 'story', 'aara');
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

  /** Arrived at the glowing place: the beacon fades, the next board shows up here (or, after the last clue, the track scene). */
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
      this.setStep('track');
      return;
    }
    this.startPaper();
    this.ctx.objectives.clear();
    void ctx.dialog.say(L.aaraLagi);
  }

  /** A pale, flattened copy of Ular Melar: textured owner head plus its camo body, lying empty on the grass. */
  private makeSkin(): { group: THREE.Group; dispose: () => void } {
    const group = new THREE.Group();
    group.position.set(TRACK.pos.x, 0, TRACK.pos.z);
    group.rotation.y = TRACK.yaw;
    const bodyGeo = camoBallGeo();
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.68, depthWrite: false });
    const n = 18;
    const body = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const radius = 0.72 * (0.45 + 0.55 * t);
      p.set(Math.sin(t * Math.PI * 3) * 0.72, 0.055, (t - 0.5) * (TRACK.length - 1));
      s.set(radius, 0.075, 0.78);
      body.setMatrixAt(i, m.compose(p, q, s));
    }
    body.instanceMatrix.needsUpdate = true;
    body.castShadow = false;
    body.receiveShadow = false;
    group.add(body);

    const headGeo = enemyModels.geometry('ular_melar_head', 1.45, true);
    let headMat: THREE.Material | null = null;
    if (headGeo) {
      const source = enemyModels.material('ular_melar_head');
      headMat = source?.clone() ?? bodyMat.clone();
      if (headMat instanceof THREE.MeshStandardMaterial) {
        headMat.color.set(0xdde6bd);
        headMat.transparent = true;
        headMat.opacity = 0.72;
        headMat.depthWrite = false;
      }
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(0.12, 0.075, TRACK.length * 0.5 - 0.1);
      head.scale.set(1.05, 0.09, 1.12);
      head.castShadow = false;
      head.receiveShadow = false;
      group.add(head);
    }
    return {
      group,
      dispose: () => {
        body.dispose();
        bodyGeo.dispose();
        bodyMat.dispose();
        headGeo?.dispose();
        headMat?.dispose();
      },
    };
  }

  /**
   * The last clue (the pond) leads to a long, pale track on the lawn: a shed snake skin. Aara and Glen wonder about it, Glen says he
   * knows someone who can help (the Lab and Nino come in the next chapter). Chapter 4 ends here with a celebration.
   */
  private runTrack(): void {
    if (this.trackScene) return;
    this.trackScene = true;
    const { ctx } = this;
    const { seq, dialog, cameraRig, fx } = ctx;
    seq.run(async () => {
      await seq.waitUntil(() => startGate.started);
      const info = ctx.game.debugInfo;
      info.ch4Scene = 'track';
      ctx.game.setControlsEnabled(false);
      ctx.objectives.clear();
      this.hooks.setGoal(null);
      this.props?.hideBeacon();
      this.props?.hidePaper();
      this.stage(TRACK.stage, 5);
      this.putAara(PARK.aara.x, PARK.aara.z, PARK.aara.yaw);
      const skin = this.makeSkin();
      skin.group.scale.setScalar(0.01);
      ctx.root.add(skin.group);
      ctx.onDispose(() => {
        skin.group.removeFromParent();
        skin.dispose();
      });
      cameraRig.setFraming(this.tmp.set(TRACK.pos.x, 0.6, TRACK.pos.z), { weight: 0.45, distance: 4 });
      ctx.sfx.bling();
      fx.sparkles.burst(TRACK.pos.x, 0.5, TRACK.pos.z, 18, 2.6, 0xdfeccd, { gravity: 0.8, life: 1, up: 0.6 });
      await seq.tween(0.7, (t) => skin.group.scale.setScalar(0.01 + 0.99 * t));
      await dialog.say(L.aaraKulit, { lockControls: true });
      await dialog.say(L.glenKulit, { lockControls: true });
      await dialog.say(L.aaraBantuan, { lockControls: true });
      await dialog.say(L.glenKenal, { lockControls: true });
      cameraRig.setFraming(null);
      // Chapter 4 is done: stars, confetti, a few coins. The skin stays as a hint for what comes next.
      this.over = true;
      ctx.save.markChapterDone('bab4');
      ctx.save.setBab4('', 0);
      ctx.save.finishCityMission('bab4', 5);
      ctx.quiz.coinsChanged();
      ctx.game.setControlsEnabled(true);
      info.ch4Scene = 'done';
      await new Celebration(ctx, 'Chapter 4 selesai!', fx.sparkles).play();
      ctx.game.setTransformAllowed(true);
      // Chapter 5 creates its own Aara. Remove Chapter 4's actor first so she
      // cannot appear twice during the hand-off between chapters.
      this.aara?.group.removeFromParent();
      this.aara?.dispose();
      this.aara = null;
      this.hooks.onDone();
    });
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
