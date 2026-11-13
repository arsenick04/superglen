import * as THREE from 'three';
import { startGate } from '../../core/StartGate';
import type { SkillName } from '../../core/Save';
import { Celebration } from '../Celebration';
import { HALL_DOOR_TARGET } from '../progress';
import { SKILL_GATES } from '../../quiz/gates';
import { QuizLines } from '../../quiz/lines';
import { FLY_MAX, HALL, NINO_SPOT, PADS } from './Layout';
import { popButton } from './Hints';
import type { Env, Exercise } from './Env';
import type { RingsExercise } from './RingsExercise';
import type { LaserExercise } from './LaserExercise';
import type { ShieldExercise } from './ShieldExercise';
import type { Lunch } from './Lunch';

export interface StoryParts {
  env: Env;
  rings: RingsExercise;
  laser: LaserExercise;
  shield: ShieldExercise;
  lunch: Lunch;
}

/**
 * Chapter 2 as one linear script: flying (comic first try, 5 rings), laser (5 targets), shield (5 balls), lunch, alarm.
 * Each skill unlock is preceded by a "Tantangan Pintar" gate (`gate()`, categories in quiz/gates.ts).
 * Afterwards (or when the chapter was already done) the hall is free play: the station icons restart their exercise.
 */
export class Story {
  step = 'init';
  free = false;
  private readonly party: Celebration;
  private readonly tmp = new THREE.Vector3();
  private runId = 0;
  private current: Exercise | null = null;

  constructor(private readonly p: StoryParts) {
    this.party = new Celebration(p.env.ctx, 'Chapter 2 selesai!', p.env.ctx.fx.sparkles);
  }

  private get ctx() {
    return this.p.env.ctx;
  }

  /** Beam on the floor at (x, z) until the player is within `r`. */
  private async goTo(x: number, z: number, r: number): Promise<void> {
    await this.ctx.objectives.goTo(this.tmp.set(x, 0, z), r);
    this.ctx.player.markSafe(x, 0, z);
  }

  private unlock(name: SkillName): void {
    const { ctx } = this.p.env;
    ctx.save.unlockSkill(name);
    ctx.game.setSkills({ [name]: true });
    const p = ctx.player.visualPosition;
    ctx.fx.rings.spawn(p.x, p.y - 0.5, p.z, 2.2, 0.7, 0xffd23f);
    ctx.fx.sparkles.burst(p.x, p.y + 0.4, p.z, 30, 4, 0xffd23f, { gravity: 1 });
    if (name !== 'fly') {
      popButton(name);
      ctx.game.pulseButton(name, true);
      const ev = name === 'laser' ? 'laserFire' : 'shieldUp';
      const off = ctx.player.skills.on(ev, () => {
        ctx.game.pulseButton(name, false);
        off();
      });
    }
  }

  /**
   * "Kunci ini butuh jawaban pintar!": Nino asks for a Tantangan Pintar (3 questions) before a skill is granted. The challenge
   * cannot be failed. Skills already earned in an earlier visit (saved) are not asked again.
   */
  private async gate(name: SkillName): Promise<void> {
    const { ctx } = this.p.env;
    if (ctx.save.data.skills[name]) return;
    const before = this.step;
    this.step = 'quiz';
    ctx.game.debugInfo.quizGate = name;
    await ctx.dialog.say(QuizLines.kunci, { lockControls: true });
    await ctx.quiz.run({ category: SKILL_GATES[name], count: 3, reason: 'unlock' });
    await ctx.dialog.say(QuizLines.energi, { lockControls: true });
    ctx.game.debugInfo.quizGate = '';
    this.step = before;
  }

  /** Confetti around the player and the tune of a finished exercise. */
  private cheer(): void {
    const { ctx } = this.p.env;
    const p = ctx.player.visualPosition;
    ctx.fx.rings.spawn(p.x, p.y - 0.5, p.z, 2.6, 0.8, 0xffd23f);
    for (let i = 0; i < 3; i++) ctx.fx.sparkles.burst(p.x + (i - 1) * 1.4, p.y + 1.8, p.z - 0.6, 36, 5, -1, { gravity: 3, life: 1.5, up: 1 });
  }

  setupFree(): void {
    const { ctx, nino, hangar } = this.p.env;
    this.free = true;
    this.step = 'free';
    ctx.game.debugInfo.chapterDone = true;
    ctx.game.setTransformAllowed(true); // free play: the child may switch Glen <-> Superglen
    nino.placeAt(NINO_SPOT.start.x, NINO_SPOT.start.z);
    const player = ctx.player;
    ctx.interactions.add({
      position: () => this.tmp.set(nino.pos.x, 0.4, nino.pos.z),
      radius: 3,
      icon: 'talk',
      promptHeight: 1.4,
      onInteract: () => void ctx.dialog.say('bab2_nino_hebat'),
    });
    ctx.interactions.add({
      position: new THREE.Vector3(hangar.doorPos.x, 1, hangar.doorPos.z),
      radius: 2.6,
      icon: 'hand',
      promptHeight: 1.6,
      onInteract: () => void ctx.game.loadLevel(HALL_DOOR_TARGET),
    });
    const zone = (ex: Exercise, x: number, z: number, r: number): void => {
      ctx.interactions.addZone({
        shape: 'sphere',
        center: new THREE.Vector3(x, 0.6, z),
        radius: r,
        onEnter: () => {
          if (!this.free || !ctx.game.controlsEnabled || ex.active) return;
          const id = ++this.runId;
          this.current?.stop();
          this.current = ex;
          // The exercises need Superglen: switch to him and hide the switch while one runs.
          if (ctx.player.mode !== 'superglen') ctx.game.setPlayerMode('superglen');
          ctx.game.setTransformAllowed(false);
          ctx.seq.run(async () => {
            await ex.run({ voice: false });
            if (id !== this.runId) return;
            ctx.game.setTransformAllowed(true);
            this.cheer();
            await ctx.seq.wait(1.2);
            if (id !== this.runId) return;
            this.p.env.row.hide();
            this.current = null;
          });
        },
      });
    };
    zone(this.p.rings, PADS.fly.x, PADS.fly.z, 3.4);
    zone(this.p.laser, PADS.laser.x, PADS.laser.z, 2.4);
    zone(this.p.shield, PADS.shield.x, PADS.shield.z, 3.2);
    player.markSafe(0, 0, 0);
  }

  start(): void {
    this.ctx.seq.run(() => this.main());
  }

  private async main(): Promise<void> {
    const { ctx, nino, hangar, row } = this.p.env;
    const { seq, dialog, game } = ctx;
    this.step = 'start';
    await seq.waitUntil(() => startGate.started);

    // ---- 1. Flying ----
    this.step = 'fly';
    void dialog.say('bab2_nino_pagi');
    void nino.glideTo(NINO_SPOT.fly.x, NINO_SPOT.fly.z, 2.4);
    await this.goTo(PADS.fly.x, PADS.fly.z, 3.2);
    await dialog.say('bab2_nino_terbang');
    await this.gate('fly');
    this.unlock('fly');
    await this.comicBonk();
    // The rings start once Glen is back on the floor (the gentle glide down must not "pass" the first ring by accident).
    await Promise.race([seq.waitUntil(() => ctx.player.grounded), seq.wait(14)]);
    void dialog.say('bab2_nino_cincin');
    this.step = 'rings';
    await this.p.rings.run({ voice: true });
    this.cheer();
    this.step = 'rings_done';
    await dialog.say('bab2_nino_hebat');
    row.hide();

    // ---- 2. Laser ----
    this.step = 'laser';
    void nino.glideTo(NINO_SPOT.laser.x, NINO_SPOT.laser.z, 2.2);
    await this.goTo(PADS.laser.x, PADS.laser.z, 2.2);
    await dialog.say('bab2_nino_laser');
    await this.gate('laser');
    this.unlock('laser');
    await this.p.laser.run({ voice: true });
    this.cheer();
    this.step = 'laser_done';
    await dialog.say('bab2_nino_hebat');
    row.hide();

    // ---- 3. Shield ----
    this.step = 'shield';
    void nino.glideTo(NINO_SPOT.shield.x, NINO_SPOT.shield.z, 2.4);
    await this.goTo(PADS.shield.x, PADS.shield.z, PADS.shield.r - 1.5);
    await dialog.say('bab2_nino_perisai');
    await this.gate('shield');
    this.unlock('shield');
    await this.p.shield.run({ voice: true });
    this.cheer();
    this.step = 'shield_done';
    await dialog.say('bab2_nino_hebat');
    row.hide();

    // ---- 4. Lunch ----
    this.step = 'lunch';
    void nino.glideTo(PADS.lunch.x + 3.4, PADS.lunch.z + 1.2, 2.4);
    void dialog.say('bab2_nino_bekal');
    const sat = new Promise<void>((resolve) => {
      ctx.interactions.add({
        position: new THREE.Vector3(PADS.lunch.x, 0.5, PADS.lunch.z),
        radius: 2.8,
        icon: 'hand',
        promptHeight: 1.2,
        once: true,
        onInteract: resolve,
      });
    });
    ctx.objectives.set(this.tmp.set(PADS.lunch.x, 0, PADS.lunch.z));
    await sat;
    ctx.objectives.clear();
    this.step = 'lunch_scene';
    game.setControlsEnabled(false);
    await this.p.lunch.play();
    game.setControlsEnabled(true);
    ctx.player.markSafe(ctx.player.visualPosition.x, 0, ctx.player.visualPosition.z);

    // ---- 5. Alarm ----
    await this.alarm();
    this.free = false;
    this.step = 'done';
    ctx.save.markChapterDone('bab2');
    game.debugInfo.chapterDone = true;
    game.setControlsEnabled(true);
    await this.party.play();
    hangar.setAlarm(false);
    this.setupFree();
  }

  /** The comic first try: the jets throw Glen at the ceiling (controls locked), a soft bonk, stars, a gentle glide down. */
  private async comicBonk(): Promise<void> {
    const { ctx, hangar } = this.p.env;
    const { seq, dialog, game } = ctx;
    const pl = ctx.player;
    this.step = 'bonk';
    game.setControlsEnabled(false);
    // Wide view from below: the camera would otherwise be squeezed against the ceiling Glen is about to hit.
    ctx.cameraRig.setFraming(this.tmp.set(pl.visualPosition.x, 4, pl.visualPosition.z), { weight: 0.5, distance: 5, pitch: -10 * Math.PI / 180 });
    pl.flight.maxFlyHeight = 40;
    pl.flight.autoLaunch(40);
    let t = 0;
    await seq.waitUntil(() => {
      t += 1 / 60;
      return pl.visualPosition.y + 0.55 >= HALL.ceil - 0.5 || t > 10 || (t > 1.2 && pl.verticalVelocity < 0.3);
    });
    const p = pl.visualPosition;
    this.step = 'bonked';
    hangar.bonk(p.x, p.z);
    pl.squashBounce(-0.4);
    ctx.fx.stars.show(p, 0.95, 2.4, 0.5);
    ctx.fx.flashes.spawn(p.x, p.y + 0.9, p.z, 1.8, 0.6, 0xffd23f);
    ctx.fx.flashes.spawn(p.x, p.y + 0.9, p.z, 3.0, 0.9, 0xffffff, 0.6); // the cartoon "boing" ring
    ctx.fx.sparkles.burst(p.x, p.y + 0.8, p.z, 26, 4, 0xffe14d, { gravity: 2 });
    ctx.cameraRig.bump();
    await dialog.say('bab2_glen_aduh', { lockControls: true });
    await dialog.say('bab2_nino_pelan', { lockControls: true });
    pl.flight.maxFlyHeight = FLY_MAX;
    ctx.cameraRig.setFraming(null);
    game.setControlsEnabled(true);
  }

  /** Red-gold beacons spin softly, the wall screen shows the city market, Nino and Glen react. */
  private async alarm(): Promise<void> {
    const { ctx, nino, hangar } = this.p.env;
    const { seq, dialog, game } = ctx;
    this.step = 'alarm';
    game.setControlsEnabled(false);
    const p = ctx.player.visualPosition;
    void nino.glideTo(p.x + 1.8, p.z - 1.2, 1.2);
    hangar.setAlarm(true);
    ctx.cameraRig.setFraming(this.tmp.set(p.x * 0.5, 7.5, -32), { weight: 0.45, yaw: 0, distance: 3 });
    await seq.wait(0.6);
    await seq.tween(0.7, (t) => hangar.showMarket(t));
    await dialog.sequence(['bab2_nino_alarm', 'bab2_glen_siap'], { lockControls: true });
    ctx.cameraRig.setFraming(null);
    game.setControlsEnabled(true);
  }
}
