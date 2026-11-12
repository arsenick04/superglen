import * as THREE from 'three';
import type { Player } from '../../player/Player';
import type { Sparkles } from './Fx';

/**
 * The funny ending: every suit feature switches on at once, harmlessly. A rainbow belt, sparkle jets from the
 * feet, a bubble that pops on and off, tiny light beams sweeping up. Pure visuals (hops are driven by the story).
 */
export class FunnyFx {
  active = false;
  private t = 0;
  private bubbleT = 0;
  private bubbleOn = false;
  private jetAcc = 0;
  private readonly belt: THREE.Mesh;
  private readonly beltMat = new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false });
  private readonly bubble: THREE.Mesh;
  private readonly beams = new THREE.Group();
  private readonly beamPivots: THREE.Group[] = [];
  private readonly col = new THREE.Color();

  constructor(
    root: THREE.Object3D,
    private readonly player: Player,
    private readonly sparkles: Sparkles,
  ) {
    this.belt = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 24), this.beltMat);
    this.belt.rotation.x = Math.PI / 2;
    this.belt.visible = false;
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.bubble.visible = false;
    const beamGeo = new THREE.CylinderGeometry(0.02, 0.14, 5, 8, 1, true);
    beamGeo.translate(0, 2.5, 0);
    [0x7fe9ff, 0xffd23f, 0xff8fb1].forEach((c) => {
      const piv = new THREE.Group();
      piv.add(
        new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })),
      );
      this.beams.add(piv);
      this.beamPivots.push(piv);
    });
    this.beams.visible = false;
    root.add(this.belt, this.bubble, this.beams);
  }

  start(): void {
    this.active = true;
    this.t = 0;
    this.bubbleT = 0;
    this.belt.visible = true;
    this.beams.visible = true;
  }

  stop(): void {
    this.active = false;
    this.belt.visible = false;
    this.bubble.visible = false;
    this.beams.visible = false;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const p = this.player.visualPosition;
    this.belt.position.set(p.x, p.y - 0.088, p.z);
    this.beltMat.color.setHSL((this.t * 1.5) % 1, 1, 0.55);
    this.beams.position.set(p.x, p.y + 0.3, p.z);
    this.beamPivots.forEach((b, i) => b.rotation.set(Math.sin(this.t * 3 + i * 2.1) * 0.8, 0, Math.cos(this.t * 2.4 + i * 1.7) * 0.8));
    // Bubble: on for 0.45 s, pops, off for 0.3 s.
    this.bubbleT += dt;
    const cycle = this.bubbleT % 0.75;
    const on = cycle < 0.45;
    if (on !== this.bubbleOn) {
      this.bubbleOn = on;
      if (!on) this.sparkles.burst(p.x, p.y, p.z, 10, 2.5, 0x7fe9ff, { gravity: 1, life: 0.6 });
    }
    this.bubble.visible = on;
    this.bubble.position.copy(p);
    this.bubble.scale.setScalar(0.5 + Math.min(1, cycle / 0.2) * 0.5);
    // Sparkle jets from the feet.
    this.jetAcc += dt * 40;
    while (this.jetAcc >= 1) {
      this.jetAcc -= 1;
      this.col.setHSL(Math.random(), 1, 0.65);
      for (const s of [-1, 1]) {
        this.sparkles.spawn(p.x + s * 0.15, p.y - 0.5, p.z, s * (0.4 + Math.random() * 0.6), 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8, this.col.getHex(), 0.7, 4);
      }
    }
  }
}
