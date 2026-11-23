import * as THREE from 'three';
import type { LevelContext } from '../../world/Level';
import type { Category } from '../../quiz/types';

export interface NinoTerminalOptions {
  /** Feet position (the floor under the stand). */
  x: number;
  y: number;
  z: number;
  /** Which way the screen faces (0 = +Z). */
  yaw?: number;
  /** A fixed category, 'mix' (random categories) or 'pick' (the child chooses one of five big icons first). */
  category: Category | 'mix' | 'pick';
  /** Reach of the "talk" prompt in metres (default 2.8). */
  radius?: number;
  /** Extra gate: when false the terminal is hidden and its prompt is off (default always on). */
  enabled?: () => boolean;
}

/** How close (m) the player must be for the screen to light up. */
const LIGHT_RANGE = 4.2;

/**
 * A "Nino terminal": a small blue screen on a stand. It glows brighter and bobs when Glen or Superglen comes near, and the
 * `talk` prompt starts a Tantangan Pintar (`ctx.quiz`). Visual only: no collider (nothing to climb or get stuck on), so the
 * parkour reachability data does not change. Everything is a handful of meshes under `ctx.root`.
 *
 *   const t = new NinoTerminal(ctx, { x: -2.8, y: LAB_FLOOR, z: -65, category: 'mix' });
 *   // in Level.update(dt):  t.update(dt);
 */
export class NinoTerminal {
  readonly position: THREE.Vector3;
  /** 0 (asleep) .. 1 (lit). */
  glow = 0;
  /** Times the terminal started a challenge. */
  uses = 0;
  private busy = false;
  private readonly group = new THREE.Group();
  private t = Math.random() * 6;
  private readonly screen: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly dim = new THREE.Color(0x5b7396);
  private readonly lit = new THREE.Color(0xffffff);

  constructor(
    private readonly ctx: LevelContext,
    private readonly opts: NinoTerminalOptions,
  ) {
    const { x, y, z } = opts;
    this.position = new THREE.Vector3(x, y, z);
    const g = this.group;
    g.position.set(x, y, z);
    g.rotation.y = opts.yaw ?? 0;

    const steel = new THREE.MeshStandardMaterial({ color: 0xcfdcf0, roughness: 0.5, metalness: 0.1 });
    const navy = new THREE.MeshStandardMaterial({ color: 0x1b3a6b, roughness: 0.45, emissive: 0x0d2a55, emissiveIntensity: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.4, emissive: 0x7a5200, emissiveIntensity: 0.3 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.1, 20), steel);
    base.position.y = 0.05;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.85, 12), steel);
    pole.position.y = 0.52;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 28), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.7, 0.08), navy);
    this.mat = new THREE.MeshBasicMaterial({ map: this.quizTexture(), color: this.dim.clone(), fog: false });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.58), this.mat);
    this.screen.position.z = 0.045;
    this.head.add(frame, this.screen);
    this.head.position.y = 1.2;
    this.head.rotation.x = -0.18;

    g.add(base, pole, ring, this.head);
    ctx.root.add(g);

    ctx.interactions.add({
      position: new THREE.Vector3(x, y + 0.9, z),
      radius: opts.radius ?? 2.8,
      icon: 'talk',
      promptHeight: 1.0,
      enabled: opts.enabled,
      onInteract: () => this.use(),
    });
  }

  /** A quiz book on the terminal, distinct from Nino standing beside it (drawn once). */
  private quizTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 86;
    const g = c.getContext('2d');
    if (g) {
      const bg = g.createLinearGradient(0, 0, 0, 86);
      bg.addColorStop(0, '#2155a3');
      bg.addColorStop(1, '#46a7dd');
      g.fillStyle = bg;
      g.fillRect(0, 0, 128, 86);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(19, 20);
      g.quadraticCurveTo(42, 14, 62, 24);
      g.lineTo(62, 67);
      g.quadraticCurveTo(43, 57, 19, 64);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(66, 24);
      g.quadraticCurveTo(86, 14, 109, 20);
      g.lineTo(109, 64);
      g.quadraticCurveTo(85, 57, 66, 67);
      g.closePath();
      g.fill();
      g.strokeStyle = '#2473b9';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(64, 24);
      g.lineTo(64, 69);
      g.stroke();
      g.fillStyle = '#f5ae25';
      g.font = 'bold 35px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', 42, 43);
      g.beginPath();
      g.moveTo(88, 29);
      g.lineTo(91, 37);
      g.lineTo(100, 37);
      g.lineTo(93, 43);
      g.lineTo(96, 52);
      g.lineTo(88, 47);
      g.lineTo(80, 52);
      g.lineTo(83, 43);
      g.lineTo(76, 37);
      g.lineTo(85, 37);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** The talk prompt: pick a category if asked to, then run 3 questions. */
  private use(): void {
    if (this.busy) return;
    this.busy = true;
    this.uses++;
    const { ctx } = this;
    ctx.seq.run(async () => {
      let cat = this.opts.category;
      if (cat === 'pick') {
        const chosen = await ctx.quiz.pick();
        if (!chosen) {
          this.busy = false;
          return;
        }
        cat = chosen;
      }
      await ctx.quiz.run({ category: cat, count: 3, reason: 'terminal' });
      this.busy = false;
    });
  }

  /** Visible and usable right now (tests). */
  get visibleNow(): boolean {
    return this.group.visible;
  }

  /** Once per rendered frame: glow towards "lit" when the player is near, a gentle bob. */
  update(dt: number): void {
    const on = this.opts.enabled ? this.opts.enabled() : true;
    this.group.visible = on;
    if (!on) return;
    this.t += dt;
    const p = this.ctx.player.visualPosition;
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    const near = d < LIGHT_RANGE && Math.abs(p.y - this.position.y) < 3;
    const target = near ? 1 : 0;
    this.glow += (target - this.glow) * Math.min(1, dt * 5);
    this.mat.color.copy(this.dim).lerp(this.lit, this.glow);
    this.head.position.y = 1.2 + this.glow * 0.04 * Math.sin(this.t * 3);
    const s = 1 + this.glow * 0.05 * (0.5 + 0.5 * Math.sin(this.t * 4));
    this.screen.scale.set(s, s, 1);
  }
}
