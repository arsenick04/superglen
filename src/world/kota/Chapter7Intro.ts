import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { CITY_LAYOUT } from './CityData';
import { EagleVisual } from './EagleVisual';

/** Nighttime approach to the Bank. The airborne fight begins in the next chapter step. */
export class Chapter7Intro {
  private readonly bank = CITY_LAYOUT.buildings.find((b) => b.kind === 'bank');
  private readonly bird = new EagleVisual();
  private readonly perch = this.bank ? this.bank.base + this.bank.wall + 4 : 10;
  private met: boolean;
  private t = 0;

  constructor(private readonly ctx: LevelContext, private readonly onMeet: () => void) {
    this.met = ctx.save.data.interlude === 'elang_met';
    if (!this.bank) return;
    this.bird.group.position.set(this.bank.x, this.perch, this.bank.z);
    ctx.root.add(this.bird.group);
    ctx.objectives.set(new THREE.Vector3(this.bank.x, this.perch, this.bank.z));
    ctx.game.debugInfo.elangStage = this.met ? 'met' : 'approach';
  }

  fixedUpdate(): void {
    if (this.met || !this.bank || !this.ctx.game.controlsEnabled) return;
    const p = this.ctx.player.position;
    if (Math.hypot(p.x - this.bank.x, p.z - this.bank.z) > 17 || p.y < this.bank.base + this.bank.wall - 2) return;
    this.met = true;
    this.ctx.save.setInterlude('elang_met');
    this.ctx.game.debugInfo.elangStage = 'met';
    this.onMeet();
  }

  update(dt: number): void {
    if (!this.bank) return;
    this.t += dt;
    this.bird.group.position.y = this.perch + Math.sin(this.t * 1.5) * 0.5;
    this.bird.update(this.t, null);
  }
}
