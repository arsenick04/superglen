import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { AaraActor } from '../kota/Aara';
import { LAB_FLOOR } from './Layout';

/** Aara's greeting when she opens the quiz (voice clip `lab_aara_kuis_halo` plays when the file exists; else text only). */
export const AaraHostLines = {
  halo: { id: 'lab_aara_kuis_halo', speaker: 'aara', text: 'Halo, {nama}! Ayo main Tantangan Pintar bersamaku!' },
} as const;

/**
 * After the story is finished Aara stands where Nino's quiz computer was and hosts the Tantangan Pintar: the same quiz as the
 * terminal, but her portrait and her voice (`aara_<line id>` clips; a missing one is text only, never Nino's voice).
 * Before that the level shows the computer instead (`active()` is false, nothing here is visible or interactive).
 */
export class LabAaraHost {
  private readonly aara: AaraActor;
  private readonly base = new THREE.Group();
  private busy = false;
  /** Times the quiz was opened here (tests). */
  uses = 0;

  constructor(
    private readonly ctx: LevelContext,
    lit: THREE.Material,
    private readonly at: { x: number; z: number },
    private readonly active: () => boolean,
  ) {
    this.aara = new AaraActor(lit, ctx.dialog);
    this.aara.group.position.set(at.x, LAB_FLOOR + 0.12, at.z);
    this.aara.setLevel(3);
    const padMat = new THREE.MeshStandardMaterial({ color: 0xdfe9f6, roughness: 0.5 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x6ff4ff, toneMapped: false });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.12, 24), padMat);
    pad.position.set(at.x, LAB_FLOOR + 0.06, at.z);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.02, 24), glowMat);
    ring.position.set(at.x, LAB_FLOOR + 0.125, at.z);
    this.base.add(pad, ring);
    this.base.visible = false;
    this.aara.group.visible = false;
    ctx.root.add(this.base, this.aara.group);
    ctx.onDispose(() => {
      pad.geometry.dispose();
      ring.geometry.dispose();
      padMat.dispose();
      glowMat.dispose();
      this.aara.dispose();
    });
    ctx.interactions.add({
      position: new THREE.Vector3(at.x, LAB_FLOOR + 1.0, at.z),
      radius: 2.6,
      icon: 'talk',
      promptHeight: 1.7,
      enabled: () => this.active() && !this.busy,
      onInteract: () => this.use(),
    });
    this.sync();
  }

  get visible(): boolean {
    return this.aara.group.visible;
  }

  private use(): void {
    if (this.busy) return;
    this.busy = true;
    this.uses++;
    const { ctx } = this;
    this.aara.emote('wave', 1.6);
    ctx.seq.run(async () => {
      try {
        await ctx.dialog.say(AaraHostLines.halo, { lockControls: true });
        await ctx.quiz.run({ category: 'mix', count: 3, reason: 'terminal', promptSpeaker: 'aara' });
      } finally {
        this.busy = false;
      }
    });
  }

  private sync(): void {
    const on = this.active();
    this.base.visible = on;
    this.aara.group.visible = on;
  }

  update(dt: number): void {
    if (this.active() !== this.aara.group.visible) this.sync();
    if (!this.aara.group.visible) return;
    // She turns to whoever is near.
    const p = this.ctx.player.visualPosition;
    this.aara.group.rotation.y = Math.atan2(p.x - this.at.x, p.z - this.at.z);
    this.aara.update(dt);
  }
}
