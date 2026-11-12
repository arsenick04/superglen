import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { Easings } from '../../gameplay/Sequence';
import { startGate } from '../../core/StartGate';
import type { Atmosphere, Flashlight } from './Lighting';
import type { Sparkles } from './Fx';
import type { Hall } from './Hall';
import type { Lab } from './Lab';
import type { JumpTutorial } from './JumpTutorial';
import type { FunnyFx } from './FunnyFx';
import { Z, LAB, LAB_FLOOR, PANEL, FENCE_GAP_X } from './Layout';

export interface StoryParts {
  ctx: LevelContext;
  lab: Lab;
  hall: Hall;
  jump: JumpTutorial;
  sparkles: Sparkles;
  atmosphere: Atmosphere;
  flashlight: Flashlight;
  funny: FunnyFx;
}

const STAR_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 L40 23 L60 24.5 L45 38 L49.5 58 L32 47.5 L14.5 58 L19 38 L4 24.5 L24 23 Z" fill="#ffd23f" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M32 14 L36 25 L32 33 L28 25 Z" fill="#fff6b8" opacity="0.8"/></svg>';

/** The whole of Bab 1 as one linear script of awaits (beats A-F). Every wait is game-time, cancelled on unload. */
export class Story {
  private readonly p: StoryParts;
  private target: THREE.Vector3 | null = null;
  private readonly flash: HTMLDivElement;
  private readonly star: HTMLDivElement;
  private readonly tmp = new THREE.Vector3();
  coinsTaken = 0;
  step = 'init';

  constructor(parts: StoryParts) {
    this.p = parts;
    const ui = parts.ctx.ui;
    this.flash = document.createElement('div');
    this.flash.className = 'bab1-flash';
    this.star = document.createElement('div');
    this.star.className = 'bab1-star';
    this.star.innerHTML = `${STAR_SVG}<div class="bab1-star-text">Chapter 1 selesai!</div>`;
    ui.append(this.flash, this.star);
    parts.ctx.onDispose(() => {
      this.flash.remove();
      this.star.remove();
    });
  }

  private get player() {
    return this.p.ctx.player;
  }

  private near(x: number, z: number, r: number): () => boolean {
    return () => {
      const v = this.player.visualPosition;
      return Math.hypot(v.x - x, v.z - z) < r;
    };
  }

  private setTarget(x: number | null, z = 0): void {
    const o = this.p.ctx.objectives;
    if (x === null) {
      this.target = null;
      o.clear();
      return;
    }
    this.target = new THREE.Vector3(x, z <= Z.labFront ? LAB_FLOOR : 0, z);
    o.set(this.target);
  }

  private safe(x: number, y: number, z: number): void {
    this.player.markSafe(x, y, z);
  }

  /** Returning players: the finished lab, no story. */
  setupReturning(): void {
    const { lab, hall, ctx } = this.p;
    this.step = 'returning';
    hall.openInstant();
    lab.setBoot(1);
    lab.setNinoVisible(1);
    lab.setCompartment(1);
    lab.showCoins();
    ctx.game.setPlayerMode('superglen');
    this.addNinoTalk();
    ctx.game.debugInfo.chapterDone = true;
  }

  private addNinoTalk(): void {
    const { ctx, lab } = this.p;
    ctx.interactions.add({
      position: () => lab.nino.position,
      radius: 3.0,
      icon: 'talk',
      promptHeight: 1.5,
      onInteract: () => void ctx.dialog.say('bab1_nino_besok'),
    });
  }

  start(): void {
    this.p.ctx.seq.run(() => this.main());
  }

  private async main(): Promise<void> {
    const { ctx, hall, lab, flashlight } = this.p;
    const { seq, dialog } = ctx;
    const pl = this.player;
    this.step = 'street';
    await seq.waitUntil(() => startGate.started);

    // ---- A. Street ----
    void dialog.say('bab1_glen_pulang');
    this.setTarget(0, -34);
    seq.run(() => this.jumpLesson());
    await seq.waitUntil(() => pl.visualPosition.z < -33.8);
    this.safe(0, 0, -34);

    // ---- B. Building exterior ----
    this.step = 'building';
    void dialog.say('bab1_glen_gedung');
    this.setTarget(FENCE_GAP_X, -38.2);
    await seq.waitUntil(this.near(FENCE_GAP_X, -38.2, 2.8));
    void dialog.say('bab1_glen_pagar');
    this.setTarget(0, -43.6);
    await seq.waitUntil(() => pl.visualPosition.z < Z.facade - 1.4 && Math.abs(pl.visualPosition.x) < 3);
    this.safe(0, 0, -44);

    // ---- C. Hall ----
    this.step = 'hall';
    void dialog.say('bab1_glen_gelap');
    flashlight.enabled = true;
    this.setTarget(PANEL.x, PANEL.z);
    const panelPressed = new Promise<void>((resolve) => {
      ctx.interactions.add({
        position: new THREE.Vector3(PANEL.x, 1.2, PANEL.z + 0.4),
        radius: 2.6,
        icon: 'press',
        promptHeight: 1.0,
        once: true,
        onInteract: resolve,
      });
    });
    seq.run(async () => {
      await seq.waitUntil(this.near(PANEL.x, PANEL.z, 4.2));
      void dialog.say('bab1_glen_panel');
    });
    await panelPressed;
    this.step = 'wall';
    this.setTarget(null);
    ctx.fx.rings.spawn(PANEL.x, 1.4, PANEL.z + 0.3, 1.2, 0.6, 0x2ec4b6);
    this.p.sparkles.burst(PANEL.x, 1.5, PANEL.z + 0.4, 18, 2.5, 0x5ef0e0, { gravity: 0.5 });
    seq.run(async () => {
      await seq.wait(1.6);
      void dialog.say('bab1_glen_dinding');
    });
    await hall.open();
    this.safe(0, 0, -57);
    this.setTarget(0, -61);

    // ---- D. Laboratory ----
    await seq.waitUntil(() => pl.visualPosition.z < Z.labFront - 0.8);
    this.step = 'lab';
    void dialog.say('bab1_glen_lab');
    this.safe(0, LAB_FLOOR, -64);
    this.setTarget(LAB.button.x, LAB.button.z);
    const buttonPressed = new Promise<void>((resolve) => {
      ctx.interactions.add({
        position: new THREE.Vector3(LAB.button.x, LAB_FLOOR + 0.9, LAB.button.z),
        radius: 3.0,
        icon: 'press',
        promptHeight: 0.9,
        once: true,
        onInteract: resolve,
      });
    });
    seq.run(async () => {
      await seq.waitUntil(this.near(LAB.button.x, LAB.button.z, 3.6));
      void dialog.say('bab1_glen_tombol');
    });
    await buttonPressed;

    // ---- E. Activation ----
    await this.activation();
    this.step = 'costume';
    const taken = new Promise<void>((resolve) => {
      ctx.interactions.add({
        position: () => this.tmp.set(lab.costumePos.x, LAB_FLOOR + 1.2, lab.costumePos.z),
        radius: 3.0,
        icon: 'hand',
        promptHeight: 1.1,
        once: true,
        onInteract: resolve,
      });
    });
    this.setTarget(LAB.costume.x, LAB.costume.z);
    this.safe(0, LAB_FLOOR, -65);
    await taken;
    await this.transform();
    await this.funnyEnding();

    // ---- F. Done ----
    await this.finish();
  }

  /** Jump lesson: line + hint when the barrier is near; a plank appears after 20 s without crossing. */
  private async jumpLesson(): Promise<void> {
    const { ctx, jump } = this.p;
    const { seq, dialog } = ctx;
    const pl = this.player;
    const crossed = (): boolean => pl.visualPosition.z < Z.barrier - 0.9;
    await seq.waitUntil(() => pl.visualPosition.z < Z.barrier + 3.2 || crossed());
    if (crossed()) return;
    void dialog.say('bab1_glen_lompat');
    jump.setHint(true);
    await Promise.race([seq.wait(20), seq.waitUntil(crossed)]);
    if (!crossed()) {
      jump.revealPlank();
      this.setTarget(jump.plankPos.x, jump.plankPos.z);
      await seq.waitUntil(crossed);
      this.setTarget(0, -34);
    }
    jump.setHint(false);
    jump.quietPlank();
    this.safe(0, 0, Z.barrier - 2);
  }

  private async activation(): Promise<void> {
    const { ctx, lab, sparkles } = this.p;
    const { seq, dialog, game, cameraRig } = ctx;
    this.step = 'activation';
    this.setTarget(null);
    game.setControlsEnabled(false);
    const head = new THREE.Vector3(0, LAB_FLOOR + 1.6, LAB.head.z + 1);
    cameraRig.setFraming(head, { weight: 0.5, distance: 1.8, yaw: 0 });
    await seq.tween(0.25, (t) => lab.setButtonPressed(t));
    ctx.fx.rings.spawn(LAB.button.x, LAB_FLOOR + 0.8, LAB.button.z, 2.2, 0.7, 0xffd23f);
    sparkles.burst(LAB.button.x, LAB_FLOOR + 1.0, LAB.button.z, 20, 3, 0xffd23f);
    await seq.tween(0.4, (t) => lab.setButtonPressed(1 - t));
    await seq.wait(0.2);
    await seq.tween(2.4, (t) => {
      lab.setBoot(t);
      lab.setSweep(t);
    }, Easings.easeInOut);
    lab.setSweep(1);
    sparkles.burst(0, LAB_FLOOR + 2.4, LAB.head.z + 1.4, 24, 3, 0x6ff4ff, { gravity: 0.5 });
    await seq.wait(0.3);

    // Nino appears.
    const n = lab.ninoPos;
    cameraRig.setFraming(this.tmp.set(n.x * 0.5, LAB_FLOOR + 1.2, n.z), { weight: 0.5, distance: 1.2, yaw: 0.35 });
    ctx.fx.rings.spawn(n.x, n.y, n.z, 1.8, 0.8, 0x6ff4ff);
    ctx.fx.rings.spawn(n.x, n.y, n.z, 1.0, 0.5, 0xffffff);
    sparkles.burst(n.x, n.y + 0.6, n.z, 26, 3, 0x9fd8ff, { gravity: 0.5 });
    await seq.tween(0.9, (t) => lab.setNinoVisible(t), Easings.easeOutBack);
    await dialog.sequence(['bab1_nino_halo', 'bab1_glen_siapa', 'bab1_nino_terpilih'], { lockControls: true });
    await seq.wait(0.3);

    // The costume comes out.
    const c = lab.costumePos;
    cameraRig.setFraming(this.tmp.set(c.x, LAB_FLOOR + 1.3, c.z), { weight: 0.55, distance: 1.2, yaw: -0.6 });
    await seq.tween(1.4, (t) => lab.setCompartment(t), Easings.easeInOut);
    ctx.fx.rings.spawn(c.x, c.y, c.z, 1.6, 0.7, 0xffd23f);
    sparkles.addEmitter(c.x, c.y + 0.8, c.z, 0.6, 12, 0xffd23f);
    await seq.tween(1.6, (t) => lab.setCostumeRise(t), Easings.easeOutCubic);
    await dialog.say('bab1_nino_kostum', { lockControls: true });
    cameraRig.setFraming(null);
    game.setControlsEnabled(true);
  }

  private async transform(): Promise<void> {
    const { ctx, lab, sparkles } = this.p;
    const { seq, dialog, game } = ctx;
    const pl = this.player;
    this.step = 'transform';
    this.setTarget(null);
    game.setControlsEnabled(false);
    const from = lab.costume.position.clone();
    const pp = pl.visualPosition;
    let last = 0;
    let flipped = false;
    ctx.fx.rings.spawn(pp.x, pp.y - 0.5, pp.z, 1.4, 0.5, 0xffd23f);
    await seq.tween(1.3, (t) => {
      // Costume flies to Glen, who spins; flash at the peak, then the red suit takes over.
      const f = Math.min(1, t / 0.5);
      lab.costume.position.set(from.x + (pp.x - from.x) * f, from.y + (pp.y + 0.2 - from.y) * f, from.z + (pp.z - from.z) * f);
      lab.costume.scale.setScalar(1 - 0.5 * f);
      pl.facing += (t - last) * Math.PI * 6;
      last = t;
      const fl = t < 0.5 ? 0 : t < 0.62 ? (t - 0.5) / 0.12 : Math.max(0, 1 - (t - 0.62) / 0.3);
      this.flash.style.opacity = String(fl);
      if (!flipped && t >= 0.6) {
        flipped = true;
        lab.hideCostume();
        game.setPlayerMode('superglen');
        for (let i = 0; i < 3; i++) ctx.fx.rings.spawn(pp.x, pp.y - 0.5 + i * 0.5, pp.z, 1.6 + i * 0.9, 0.7, 0xffd23f);
        sparkles.burst(pp.x, pp.y, pp.z, 40, 5, 0xffd23f, { gravity: 2 });
      }
    });
    this.flash.style.opacity = '0';
    await dialog.say('bab1_glen_superglen', { lockControls: true });
  }

  private async funnyEnding(): Promise<void> {
    const { ctx, lab, funny } = this.p;
    const { seq, dialog, game } = ctx;
    const pl = this.player;
    this.step = 'funny';
    game.setControlsEnabled(false);
    funny.start();
    lab.setChaos(1);
    const lines = dialog.sequence(['bab1_nino_semua_nyala', 'bab1_glen_tertawa'], { lockControls: true });
    const pp = pl.visualPosition;
    ctx.cameraRig.setFraming(this.tmp.set(pp.x, pp.y + 1, pp.z), { weight: 0.2, distance: 1.5 });
    let hopAt = 0.3;
    await seq.tween(3, (t) => {
      if (t * 3 >= hopAt) {
        pl.hop();
        hopAt += 0.55;
      }
    });
    funny.stop();
    lab.setChaos(0);
    await lines;
    ctx.cameraRig.setFraming(null);
    await seq.wait(0.2);
    game.pulseButton('jump', true);
    seq.run(async () => {
      await Promise.race([seq.wait(14), seq.waitUntil(() => pl.doubleJumps > 0)]);
      game.pulseButton('jump', false);
    });
    await dialog.sequence(['bab1_nino_lompat_barongsai', 'bab1_nino_besok'], { lockControls: true });
  }

  private async finish(): Promise<void> {
    const { ctx, lab, sparkles } = this.p;
    const { seq, game, save } = ctx;
    const pl = this.player;
    this.step = 'done';
    save.markChapterDone('bab1');
    game.debugInfo.chapterDone = true;
    game.setControlsEnabled(true);
    this.safe(pl.visualPosition.x, LAB_FLOOR, pl.visualPosition.z);
    for (let i = 0; i < 4; i++) {
      const p = pl.visualPosition;
      sparkles.burst(p.x + (i - 1.5) * 1.2, p.y + 2.5, p.z - 1, 40, 5, -1, { gravity: 3, life: 1.6, up: 1 });
      await seq.wait(0.25);
    }
    this.star.classList.remove('show');
    void this.star.offsetWidth;
    this.star.classList.add('show');
    // More confetti while the star is up.
    seq.run(async () => {
      for (let i = 0; i < 4; i++) {
        const p = pl.visualPosition;
        sparkles.burst(p.x + (i % 2 ? 1.6 : -1.6), p.y + 2.2, p.z - 0.5, 36, 5, -1, { gravity: 3, life: 1.6, up: 1 });
        await seq.wait(0.6);
      }
    });
    await seq.wait(3.2);
    this.star.classList.remove('show');
    this.addNinoTalk();
    lab.showCoins();
    this.setTarget(LAB.poles[0].x, LAB.poles[0].z);
    await seq.waitUntil(() => this.coinsTaken > 0 || this.near(LAB.poles[0].x, LAB.poles[0].z, 2)());
    this.setTarget(null);
  }

  onCoins(n: number): void {
    this.coinsTaken += n;
  }
}
