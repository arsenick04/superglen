import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { LAB_DOOR_TARGET } from '../progress';
import { Kit, C } from './Kit';
import { LAB_FLOOR } from './Layout';
import type { Sparkles } from './Fx';

/** Door in the lab's left wall that leads to Nino's training hall (Chapter 2). Dim until Chapter 1 is done. */
export const LAB_DOOR = { x: -6.93, z: -69.25, w: 1.6, h: 2.7 } as const;

function doorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 432;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 432);
    grad.addColorStop(0, '#7ff6ea');
    grad.addColorStop(1, '#1fa8b8');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 432);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 14;
    g.strokeRect(7, 7, 242, 418);
    // Hangar pictogram: a dome with a base and a flying star.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(128, 250, 84, Math.PI, 0);
    g.closePath();
    g.fill();
    g.fillRect(36, 250, 184, 22);
    g.fillStyle = '#1fa8b8';
    g.beginPath();
    g.arc(128, 250, 44, Math.PI, 0);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 34 : 15;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(128 + Math.cos(a) * r, 120 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    // Chevrons pointing into the wall.
    g.strokeStyle = '#ffffff';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const y of [330, 372]) {
      g.beginPath();
      g.moveTo(90, y - 16);
      g.lineTo(128, y + 8);
      g.lineTo(166, y - 16);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LabDoor {
  private on = false;
  private readonly mat: THREE.MeshBasicMaterial;
  private t = 0;
  private acc = 0;

  constructor(
    ctx: LevelContext,
    kit: Kit,
    private readonly sparkles: Sparkles,
  ) {
    const F = LAB_FLOOR;
    const D = LAB_DOOR;
    this.mat = new THREE.MeshBasicMaterial({ map: doorTexture(), toneMapped: false });
    this.mat.color.setRGB(0.4, 0.4, 0.45);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(D.w, D.h), this.mat);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(D.x + 0.02, F + D.h / 2 + 0.05, D.z);
    ctx.root.add(panel);
    for (const s of [-1, 1]) kit.lit.box([0.16, D.h + 0.3, 0.14], [D.x, F + D.h / 2 + 0.1, D.z + s * (D.w / 2 + 0.07)], C.GOLD);
    kit.lit.box([0.16, 0.14, D.w + 0.3], [D.x, F + D.h + 0.2, D.z], C.GOLD);
    ctx.interactions.add({
      position: new THREE.Vector3(D.x + 1.0, F + 1.0, D.z),
      radius: 2.2,
      icon: 'hand',
      promptHeight: 1.5,
      enabled: () => this.on,
      onInteract: () => void ctx.game.loadLevel(LAB_DOOR_TARGET),
    });
  }

  /** Chapter 1 is done: the door lights up. */
  enable(): void {
    this.on = true;
    this.mat.color.setRGB(1, 1, 1);
  }

  get enabled(): boolean {
    return this.on;
  }

  update(dt: number): void {
    if (!this.on) return;
    this.t += dt;
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      const D = LAB_DOOR;
      this.sparkles.spawn(D.x + 0.4, LAB_FLOOR + 0.2, D.z + (Math.random() - 0.5) * 1.4, 0, 0.9, 0, 0xfff1a8, 1.4, -0.1);
    }
  }
}
