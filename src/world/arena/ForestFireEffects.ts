import type { LevelContext } from '../Level';
import { FireSystem, type FireSpotDef } from '../../fx/Fire';

/**
 * The forest fire around the arena: a ring of big background fires (shared Fire module), plus optional extra spots
 * (the firefight's extinguishable fires). Spot i of `extra` is system index `ringCount + i`.
 */
export class ForestFireEffects {
  readonly system: FireSystem;
  readonly ringCount: number;
  constructor(private readonly ctx: LevelContext, extra: FireSpotDef[] = []) {
    const spots: FireSpotDef[] = [];
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.399, radius = 17 + (i % 5) * 2.3;
      spots.push({ x: Math.cos(angle) * radius, y: 0, z: 18 + Math.sin(angle) * radius, scale: 1.6 + (i % 4) * 0.2, ambient: true });
    }
    this.ringCount = spots.length;
    this.system = new FireSystem(ctx.root, [...spots, ...extra], false);
    ctx.onDispose(() => this.system.dispose());
  }
  update(dt: number): void { this.system.update(dt, this.ctx.cameraRig.camera); }
  /** 1 = full background fire, 0 = out. */
  setStrength(k: number): void {
    for (let i = 0; i < this.ringCount; i++) this.system.setIntensity(i, k);
  }
}
