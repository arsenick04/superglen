import * as THREE from 'three';
import { Parkour } from '../config/parkour';
import type { DrumSynth } from '../audio/DrumSynth';
import type { Player } from '../player/Player';
import type { Sparkles } from '../world/bab1/Fx';
import type { GroundRings } from './GroundRings';
import type { BillboardRings } from './BillboardRings';

const GOLD = 0xffc400;
const SPARK_GOLD = 0xffd23f;

/**
 * Everything the child sees and hears around the jump rhythm, driven by `player.events`:
 *  - a ring of light on the ground below that closes in during the last 0.35 s of a fall, pulses inside the good
 *    window and glows gold inside the perfect window (so the child learns when to press)
 *  - the drum note per rhythm jump (DrumSynth), a festive sparkle burst + gold ring on good/perfect, a lion roar at
 *    level 4, the soft boing on big landings
 *  - an air trail of sparkles from level 2 up
 * Pooled and allocation free per frame; the ring's material is the same plain MeshBasicMaterial program as the other
 * rings, so no shader compiles in play (it is shown once for the pre-warm).
 */
export class RhythmFx {
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private ringState = -1;
  private clock = 0;
  private trailAcc = 0;
  private warming = false;
  private readonly offs: (() => void)[] = [];
  private readonly feet = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly player: Player,
    private readonly sparkles: Sparkles,
    private readonly groundRings: GroundRings,
    private readonly flashes: BillboardRings,
    private readonly bump: () => void,
    private readonly synth: DrumSynth,
  ) {
    const geo = new THREE.RingGeometry(0.78, 1, 44);
    geo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: Parkour.fx.colorFar,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.ring = new THREE.Mesh(geo, this.ringMat);
    this.ring.visible = false;
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 2;
    scene.add(this.ring);

    const ev = player.events;
    this.offs.push(
      ev.on('rhythmJump', (e) => {
        const perfect = e.quality === 'perfect';
        this.synth.drum(e.level, perfect);
        if (e.level >= Parkour.levels.length - 1 && e.quality !== 'normal') this.synth.cheer();
        if (e.quality === 'normal') return;
        player.getFeetPosition(this.feet);
        this.celebrate(this.feet.x, this.feet.y, this.feet.z, e.level, e.quality);
      }),
      ev.on('land', (e) => {
        if (e.impact >= Parkour.boingMinImpact) this.synth.boing();
      }),
    );
  }

  /** Burst + gold ring at the feet when a timed press lands. */
  private celebrate(x: number, y: number, z: number, level: number, quality: 'perfect' | 'good' | 'auto' | 'normal'): void {
    const F = Parkour.fx;
    const top = level >= Parkour.levels.length - 1;
    if (quality === 'auto') {
      this.sparkles.burst(x, y + 0.1, z, 5, 1.8, SPARK_GOLD, { gravity: 3, life: 0.6 });
      return;
    }
    const perfect = quality === 'perfect';
    this.groundRings.spawn(x, y, z, perfect ? 2.2 : 1.5, perfect ? 0.45 : 0.35, perfect ? GOLD : 0xfff2a8, perfect ? 1 : 0.8);
    this.sparkles.burst(x, y + 0.15, z, perfect ? F.burstPerfect : F.burstGood, perfect ? 4.2 : 3, perfect ? -1 : SPARK_GOLD, { gravity: 3, life: 0.9, up: 0.9 });
    if (top) {
      // "Lompat Singa": a roar of sparkles, a big flash and a tiny camera dip.
      this.sparkles.burst(x, y + 0.6, z, F.burstLion, 6, -1, { gravity: 1.5, life: 1.2, up: 0.5 });
      this.flashes.spawn(x, y + 0.7, z, 2.6, 0.5, SPARK_GOLD, 0.95);
      this.bump();
    }
  }

  /** Show the ring for one shader pre-warm frame. */
  warm(on: boolean): void {
    this.warming = on;
    this.ring.visible = on || this.ringState >= 0;
    if (on) {
      this.ring.position.set(0, -500, 0);
      this.ringMat.opacity = 0.5;
    }
  }

  /** Per rendered frame: the landing ring and the air trail. */
  update(dt: number): void {
    const p = this.player;
    const F = Parkour.fx;
    this.clock += dt;
    const sg = p.mode === 'superglen';
    const eta = p.landEta;
    const show = sg && !p.grounded && !p.flying && p.hasGroundBelow && eta <= F.ringLead;
    if (show) {
      const W = Parkour.windows;
      const k = 1 - Math.max(0, eta) / F.ringLead;
      const ease = k * k * (3 - 2 * k);
      const state = eta <= W.perfect ? 2 : eta <= W.good ? 1 : 0;
      if (state !== this.ringState) {
        this.ringState = state;
        this.ringMat.color.setHex(state === 2 ? F.colorPerfect : state === 1 ? F.colorGood : F.colorFar);
      }
      const pulse = 0.7 + 0.3 * Math.sin(this.clock * Math.PI * 2 * F.ringPulseHz);
      this.ringMat.opacity = state === 2 ? 0.95 : state === 1 ? 0.45 + 0.35 * pulse : 0.18 + 0.2 * ease;
      this.ring.scale.setScalar(F.ringFar + (F.ringNear - F.ringFar) * ease);
      this.ring.position.set(p.visualPosition.x, p.groundBelowY + 0.06, p.visualPosition.z);
      this.ring.visible = true;
    } else if (this.ringState !== -1) {
      this.ringState = -1;
      this.ring.visible = this.warming;
    }

    // Air trail from level 2 up.
    const lvl = p.rhythmLevel;
    if (sg && lvl >= F.trailFromLevel && !p.grounded && !p.flying && dt > 0) {
      this.trailAcc += dt * F.trailRate * (lvl - F.trailFromLevel + 1);
      const v = p.visualPosition;
      while (this.trailAcc >= 1) {
        this.trailAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = 0.15 + Math.random() * 0.25;
        this.sparkles.spawn(v.x + Math.cos(a) * r, v.y - 0.35 + Math.random() * 0.5, v.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.4, -0.3 - Math.random() * 0.6, (Math.random() - 0.5) * 0.4, Math.random() < 0.7 ? SPARK_GOLD : 0xfff3d6, 0.5 + Math.random() * 0.3, 0.5);
      }
    } else this.trailAcc = 0;
  }

  dispose(): void {
    for (const o of this.offs) o();
    this.offs.length = 0;
  }
}
