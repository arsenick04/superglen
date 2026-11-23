import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { travel } from '../progress';
import { C } from './Kit';
import { LAB_FLOOR } from './Layout';
import type { Sparkles } from './Fx';

/**
 * Door in the lab's right wall next to Nino's platform that leads to the training room (the holograms). It exists only once the
 * whole story is finished: before that it is hidden and has no prompt. Visual only (no collider).
 */
export const TRAINING_DOOR = { x: 6.93, z: -68.0, w: 1.5, h: 2.5 } as const;

function doorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 416;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 416);
    grad.addColorStop(0, '#2a3f8f');
    grad.addColorStop(1, '#19a9c9');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 416);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 14;
    g.strokeRect(7, 7, 242, 402);
    // A hologram on a pedestal: glowing figure over a round base with beams.
    g.fillStyle = 'rgba(127,246,234,.28)';
    g.beginPath();
    g.moveTo(88, 290);
    g.lineTo(168, 290);
    g.lineTo(196, 120);
    g.lineTo(60, 120);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8fdff';
    g.beginPath();
    g.arc(128, 150, 26, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.roundRect(98, 182, 60, 78, 18);
    g.fill();
    g.fillStyle = '#7ff6ea';
    g.beginPath();
    g.ellipse(128, 300, 66, 16, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0b3a52';
    g.beginPath();
    g.ellipse(128, 298, 46, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 24 : 10;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(128 + Math.cos(a) * r, 362 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#0d2a55';
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(6, 6, 500, 116, 26);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = '800 62px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Ruang Latihan', 256, 68);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class TrainingDoor {
  private readonly group = new THREE.Group();
  private shown = false;
  private busy = false;
  private acc = 0;

  constructor(
    private readonly ctx: LevelContext,
    private readonly sparkles: Sparkles,
    /** True once the story is complete (the door appears and works). */
    private readonly open: () => boolean,
  ) {
    const F = LAB_FLOOR;
    const D = TRAINING_DOOR;
    const doorMat = new THREE.MeshBasicMaterial({ map: doorTexture(), toneMapped: false });
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false, transparent: true });
    const goldMat = new THREE.MeshStandardMaterial({ color: C.GOLD, roughness: 0.4, metalness: 0.3, emissive: 0x4a3000, emissiveIntensity: 0.5 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(D.w, D.h), doorMat);
    panel.rotation.y = -Math.PI / 2;
    panel.position.set(D.x - 0.5, F + D.h / 2 + 0.05, D.z);
    const post = new THREE.BoxGeometry(0.14, D.h + 0.3, 0.14);
    const lintel = new THREE.BoxGeometry(0.14, 0.14, D.w + 0.3);
    const a = new THREE.Mesh(post, goldMat);
    a.position.set(D.x - 0.5, F + D.h / 2 + 0.1, D.z - D.w / 2 - 0.07);
    const b = new THREE.Mesh(post, goldMat);
    b.position.set(D.x - 0.5, F + D.h / 2 + 0.1, D.z + D.w / 2 + 0.07);
    const top = new THREE.Mesh(lintel, goldMat);
    top.position.set(D.x - 0.5, F + D.h + 0.2, D.z);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.425), signMat);
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(D.x - 0.52, F + D.h + 0.62, D.z);
    this.group.add(panel, a, b, top, sign);
    this.group.visible = false;
    ctx.root.add(this.group);
    ctx.onDispose(() => {
      post.dispose();
      lintel.dispose();
      panel.geometry.dispose();
      sign.geometry.dispose();
      doorMat.map?.dispose();
      signMat.map?.dispose();
      doorMat.dispose();
      signMat.dispose();
      goldMat.dispose();
    });
    ctx.interactions.add({
      position: new THREE.Vector3(D.x - 1.4, F + 1.0, D.z),
      radius: 2.2,
      icon: 'hand',
      promptHeight: 1.5,
      enabled: () => this.open() && !this.busy,
      onInteract: () => this.go(),
    });
    this.sync();
  }

  /** Visible state for tests. */
  get visible(): boolean {
    return this.group.visible;
  }

  private go(): void {
    if (this.busy) return;
    this.busy = true;
    this.ctx.sfx.coin();
    void travel(this.ctx.game, 'training-room', 'trainingFromLab').finally(() => {
      this.busy = false;
    });
  }

  private sync(): void {
    this.shown = this.open();
    this.group.visible = this.shown;
  }

  update(dt: number): void {
    if (this.open() !== this.shown) this.sync();
    if (!this.shown) return;
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      const D = TRAINING_DOOR;
      this.sparkles.spawn(D.x - 0.8, LAB_FLOOR + 0.2, D.z + (Math.random() - 0.5) * 1.2, 0, 0.9, 0, 0x7ff6ea, 1.4, -0.1);
    }
  }
}
