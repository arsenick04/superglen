import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { touchMode } from '../../core/TouchMode';
import { Easings } from '../../gameplay/Sequence';
import { Kit, C } from './Kit';
import { Z, STREET_HALF } from './Layout';
import type { Sparkles } from './Fx';

export const BARRIER_H = 0.45;
const BARRIER_D = 0.6;

function iconTexture(kind: 'space' | 'jump'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    if (kind === 'space') {
      // A wide space-bar key cap with an up arrow.
      g.fillStyle = '#6b7280';
      g.beginPath();
      g.roundRect(10, 24, 236, 94, 22);
      g.fill();
      g.fillStyle = '#f8fafc';
      g.beginPath();
      g.roundRect(10, 12, 236, 90, 22);
      g.fill();
      g.strokeStyle = '#94a3b8';
      g.lineWidth = 5;
      g.stroke();
      g.fillStyle = '#ff9f1c';
      g.beginPath();
      g.moveTo(128, 22);
      g.lineTo(168, 62);
      g.lineTo(144, 62);
      g.lineTo(144, 94);
      g.lineTo(112, 94);
      g.lineTo(112, 62);
      g.lineTo(88, 62);
      g.closePath();
      g.fill();
    } else {
      // The round orange jump button.
      g.fillStyle = '#ff9f1c';
      g.beginPath();
      g.arc(128, 64, 60, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 6;
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(128, 22);
      g.lineTo(170, 66);
      g.lineTo(144, 66);
      g.lineTo(144, 104);
      g.lineTo(112, 104);
      g.lineTo(112, 66);
      g.lineTo(86, 66);
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The jump lesson: a striped low barrier across the whole street (0.45 m: more than the 0.3 m auto-step,
 * less than Glen's 0.9 m jump), a bobbing icon above it (space bar on PC, jump button on touch, which also pulses),
 * and a safety plank that appears after 20 s so nobody can get stuck.
 */
export class JumpTutorial {
  private readonly sprites: { pc: THREE.Sprite; touch: THREE.Sprite };
  private hintOn = false;
  private time = 0;
  private plankGroup = new THREE.Group();
  private plankRevealed = false;
  readonly plankPos = new THREE.Vector3(3.2, 0, Z.barrier + 2.4);
  private emitter: ReturnType<Sparkles['addEmitter']> | null = null;
  /** Set when the plank was shown (for tests). */
  get plankShown(): boolean {
    return this.plankRevealed;
  }

  constructor(
    private readonly ctx: LevelContext,
    kit: Kit,
    private readonly sparkles: Sparkles,
  ) {
    // Barrier: alternating orange/cream blocks, one continuous collider.
    const z = Z.barrier;
    const n = STREET_HALF * 2;
    for (let i = 0; i < n; i++) {
      kit.lit.box([1.0, BARRIER_H, BARRIER_D], [-STREET_HALF + 0.5 + i, BARRIER_H / 2, z], i % 2 === 0 ? C.ORANGE : C.CREAM);
      kit.lit.box([1.0, 0.06, BARRIER_D + 0.02], [-STREET_HALF + 0.5 + i, BARRIER_H + 0.02, z], i % 2 === 0 ? C.RED : C.ORANGE);
    }
    kit.collider([STREET_HALF * 2 + 0.4, BARRIER_H, BARRIER_D], [0, BARRIER_H / 2, z]);
    for (const s of [-1, 1]) {
      kit.lit.add('cone', [s * 3.9, 0.3, z + 0.9], [0.22, 0.6, 0.22], C.ORANGE);
      kit.lit.add('cone', [s * 3.9, 0.04, z + 0.9], [0.3, 0.08, 0.3], C.CREAM);
    }

    const mk = (kind: 'space' | 'jump'): THREE.Sprite => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(kind), depthWrite: false, depthTest: false, transparent: true, fog: false }));
      s.scale.set(kind === 'space' ? 2.4 : 1.4, kind === 'space' ? 1.2 : 1.4, 1);
      s.position.set(0, 2.0, z + 1.4);
      s.visible = false;
      s.renderOrder = 6;
      ctx.root.add(s);
      return s;
    };
    this.sprites = { pc: mk('space'), touch: mk('jump') };
    this.buildPlank();
  }

  private buildPlank(): void {
    const g = this.plankGroup;
    const mat = new THREE.MeshStandardMaterial({ color: 0xc98b4a, roughness: 0.8 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const p = this.plankPos;
    const t = 0.12;
    const top = BARRIER_H + 0.1;
    const run = 1.9;
    const th = Math.atan2(top, run);
    const pieces: { size: [number, number, number]; pos: [number, number, number]; rot: [number, number, number] }[] = [];
    const w = 1.8;
    const up = (sign: 1 | -1): void => {
      // Surface mid-point relative to the plank centre, pushed down along the normal by half the thickness.
      const dz = sign === 1 ? 0.5 + run / 2 : -(0.5 + run / 2);
      const midY = top / 2;
      const len = Math.hypot(run, top);
      const ang = sign === 1 ? th : -th;
      const nz = sign === 1 ? Math.sin(th) : -Math.sin(th);
      pieces.push({ size: [w, t, len], pos: [0, midY - (t / 2) * Math.cos(th), dz - (t / 2) * nz], rot: [ang, 0, 0] });
    };
    pieces.push({ size: [w, t, 1.0], pos: [0, top - t / 2, 0], rot: [0, 0, 0] });
    up(1);
    up(-1);
    for (const pc of pieces) {
      const m = new THREE.Mesh(box, mat);
      m.scale.set(...pc.size);
      m.position.set(...pc.pos);
      m.rotation.set(...pc.rot);
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(p.x, 0, Z.barrier);
    g.scale.setScalar(0.001);
    g.visible = false;
    this.ctx.root.add(g);
    this.pieces = pieces;
  }
  private pieces: { size: [number, number, number]; pos: [number, number, number]; rot: [number, number, number] }[] = [];

  /** Show or hide the bobbing icon (and pulse the touch button). */
  setHint(on: boolean): void {
    this.hintOn = on;
    this.ctx.game.pulseButton('jump', on);
    if (!on) {
      this.sprites.pc.visible = false;
      this.sprites.touch.visible = false;
    }
  }

  get hinting(): boolean {
    return this.hintOn;
  }

  /** Per-frame visuals. */
  update(dt: number): void {
    this.time += dt;
    if (!this.hintOn) return;
    const touch = touchMode.active;
    const bob = 2.0 + Math.sin(this.time * 4) * 0.12;
    this.sprites.pc.visible = !touch;
    this.sprites.touch.visible = touch;
    this.sprites.pc.position.y = bob;
    this.sprites.touch.position.y = bob;
  }

  /** The friendly safety plank: grows in with a sparkle; colliders are added at once. */
  revealPlank(): void {
    if (this.plankRevealed) return;
    this.plankRevealed = true;
    const g = this.plankGroup;
    g.visible = true;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const pc of this.pieces) {
      e.set(pc.rot[0], pc.rot[1], pc.rot[2]);
      q.setFromEuler(e);
      this.ctx.physics.addFixedCuboid(
        { x: pc.size[0] / 2, y: pc.size[1] / 2, z: pc.size[2] / 2 },
        { x: g.position.x + pc.pos[0], y: pc.pos[1], z: g.position.z + pc.pos[2] },
        { x: q.x, y: q.y, z: q.z, w: q.w },
      );
    }
    this.emitter = this.sparkles.addEmitter(g.position.x, 0.2, Z.barrier + 2.0, 0.9, 14, 0xffe27a);
    this.sparkles.burst(g.position.x, 0.5, Z.barrier + 1.5, 24, 2.5, 0xffe27a, { gravity: 1 });
    void this.ctx.seq.tween(0.7, (t) => g.scale.setScalar(Math.max(0.001, t)), Easings.easeOutBack);
  }

  /** Stop the plank sparkle once the street has been crossed. */
  quietPlank(): void {
    if (this.emitter) this.emitter.on = false;
  }
}
