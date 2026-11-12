import * as THREE from 'three';
import { Easings } from '../../gameplay/Sequence';
import { PADS } from './Layout';
import type { Env } from './Env';

const DURATION = 5.2;
const SKIP_AFTER = 1.5;
const FOODS = 5;

const ease = Easings.easeInOut;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * The short lunch scene (about 5 s): Glen and Nino sit at the picnic mat, the lunch boxes open with a sparkle, little
 * onigiri / bakpao / fruit hop out, vanish with "Nyam!" bubbles, the lids close and both stand up again.
 * Driven by `tick(dt)` from the level's fixed update. After 1.5 s a press (Bicara / Lompat) or a tap on the bubble
 * fast-forwards the rest.
 */
export class Lunch {
  running = false;
  private t = 0;
  private fast = false;
  private resolve: (() => void) | null = null;
  private readonly foods: THREE.Group[] = [];
  private readonly bubbles = new Set<HTMLDivElement>();
  private readonly proj = new THREE.Vector3();
  private shown = new Array<boolean>(FOODS).fill(false);
  private opened = false;
  private spoke = false;
  private readonly mat = new THREE.Vector3(PADS.lunch.x, 0, PADS.lunch.z);
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();

  constructor(private readonly env: Env) {
    const { ctx } = env;
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b3a3a, roughness: 0.8 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xffe9c2, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xe8453c, roughness: 0.5 });
    const green = new THREE.MeshStandardMaterial({ color: 0x5fbf5a, roughness: 0.6 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff9f43, roughness: 0.5 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6 });
    const mk = (parts: [THREE.BufferGeometry, THREE.Material, number, number, number][]): THREE.Group => {
      const g = new THREE.Group();
      for (const [geo, m, x, y, z] of parts) {
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.set(x, y, z);
        g.add(mesh);
      }
      g.visible = false;
      ctx.root.add(g);
      this.foods.push(g);
      return g;
    };
    mk([[new THREE.ConeGeometry(0.2, 0.26, 3), white, 0, 0, 0], [new THREE.BoxGeometry(0.16, 0.1, 0.04), dark, 0, -0.07, 0.1]]); // onigiri
    mk([[new THREE.SphereGeometry(0.17, 12, 8), cream, 0, 0, 0]]); // bakpao
    mk([[new THREE.SphereGeometry(0.12, 10, 8), red, 0, 0, 0], [new THREE.ConeGeometry(0.06, 0.08, 5), green, 0, 0.12, 0]]); // strawberry
    mk([[new THREE.SphereGeometry(0.14, 12, 8), orange, 0, 0, 0]]); // orange
    mk([[new THREE.CylinderGeometry(0.08, 0.08, 0.26, 10), yellow, 0, 0, 0]]); // egg roll
    ctx.onDispose(() => this.clearBubbles());
  }

  /** Play the scene; resolves when everyone is standing again. */
  play(): Promise<void> {
    const { ctx, nino } = this.env;
    const pl = ctx.player;
    this.running = true;
    this.t = 0;
    this.fast = false;
    this.opened = false;
    this.spoke = false;
    this.shown.fill(false);
    // Face the mat; Nino takes the opposite side.
    const p = pl.visualPosition;
    pl.facing = Math.atan2(this.mat.x - p.x, this.mat.z - p.z);
    const dx = this.mat.x - p.x;
    const dz = this.mat.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    void nino.glideTo(this.mat.x + (dx / d) * 1.7, this.mat.z + (dz / d) * 1.7, 0.9);
    nino.faceTowards(this.mat);
    ctx.cameraRig.setFraming(this.to.set(this.mat.x, 0.9, this.mat.z), { weight: 0.55, distance: 1.6 });
    return new Promise<void>((res) => {
      this.resolve = res;
    });
  }

  get sitting(): number {
    return this.env.ctx.player.crouch;
  }

  tick(dt: number): void {
    if (!this.running) return;
    const { ctx, hangar, nino } = this.env;
    const pl = ctx.player;
    if (!this.fast && this.t > SKIP_AFTER && (ctx.input.wasPressed('interact') || ctx.input.wasPressed('jump'))) this.fast = true;
    this.t += dt * (this.fast ? 6 : 1);
    const t = this.t;
    // Sit down, then stand up at the end.
    const sit = ease(clamp01(t / 0.8)) * (1 - ease(clamp01((t - 4.6) / 0.6)));
    pl.crouch = sit;
    nino.sit = sit;
    // Lids.
    const open = ease(clamp01((t - 0.8) / 0.7)) * (1 - ease(clamp01((t - 3.9) / 0.7)));
    for (const b of hangar.lunchBoxes) b.lid.rotation.x = -1.9 * open;
    if (!this.opened && t >= 1.0) {
      this.opened = true;
      const s = ctx.fx.sparkles;
      for (const b of hangar.lunchBoxes) {
        const g = b.group.position;
        s.burst(g.x, 0.7, g.z, 22, 3, 0xffd23f, { gravity: 1, life: 0.9 });
        ctx.fx.flashes.spawn(g.x, 0.6, g.z, 0.9, 0.5, 0xffffff);
      }
    }
    if (!this.spoke && t >= 2.2) {
      this.spoke = true;
      void ctx.dialog.say('bab2_glen_enak', { lockControls: true });
    }
    // Food hops from a box to a mouth.
    for (let i = 0; i < FOODS; i++) {
      const g = this.foods[i];
      const u = (t - (1.5 + i * 0.45)) / 0.9;
      if (u <= 0 || u >= 1) {
        if (g.visible) {
          g.visible = false;
          this.nyam(i);
        }
        continue;
      }
      const box = hangar.lunchBoxes[i % 2].group.position;
      this.from.set(box.x, 0.7, box.z);
      if (i % 2 === 0) this.to.copy(pl.visualPosition).y += 0.1;
      else this.to.copy(nino.group.position).y += 0.65;
      const e = Easings.easeOutCubic(u);
      g.visible = true;
      g.position.lerpVectors(this.from, this.to, e);
      g.position.y += Math.sin(u * Math.PI) * 0.9;
      g.rotation.y = u * 9;
      g.scale.setScalar(Math.max(0.05, 1 - Math.max(0, u - 0.8) * 5));
    }
    if (t >= DURATION) this.finish();
  }

  /** A "Nyam!" bubble above the head of whoever just ate; it lives 1.1 s of game time and only during the scene. */
  private nyam(i: number): void {
    if (this.shown[i] || !this.running) return;
    this.shown[i] = true;
    const { ctx, nino } = this.env;
    const a = i % 2 === 0 ? ctx.player.visualPosition : nino.group.position;
    this.proj.set(a.x, a.y + (i % 2 === 0 ? 0.9 : 1.1), a.z).project(ctx.cameraRig.camera);
    const b = document.createElement('div');
    b.className = 'b2-nyam show';
    b.textContent = 'Nyam!';
    b.style.left = `${Math.max(8, Math.min(window.innerWidth - 110, (this.proj.x * 0.5 + 0.5) * window.innerWidth - 50))}px`;
    b.style.top = `${Math.max(8, (-this.proj.y * 0.5 + 0.5) * window.innerHeight - 30)}px`;
    ctx.ui.appendChild(b);
    this.bubbles.add(b);
    ctx.seq.run(async () => {
      await ctx.seq.wait(1.1);
      b.remove();
      this.bubbles.delete(b);
    });
    ctx.fx.sparkles.burst(a.x, a.y + 0.3, a.z, 8, 2, 0xffe14d, { gravity: 0.5, life: 0.6 });
  }

  private clearBubbles(): void {
    for (const b of this.bubbles) b.remove();
    this.bubbles.clear();
  }

  private finish(): void {
    const { ctx, nino, hangar } = this.env;
    this.running = false;
    this.clearBubbles();
    ctx.player.crouch = 0;
    nino.sit = 0;
    nino.faceTowards(null);
    for (const b of hangar.lunchBoxes) b.lid.rotation.x = 0;
    for (const f of this.foods) f.visible = false;
    ctx.cameraRig.setFraming(null);
    const done = this.resolve;
    this.resolve = null;
    done?.();
  }
}
