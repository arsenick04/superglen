import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { CITY_LAYOUT } from './CityData';
import { enemyModels } from './EnemyModels';

/** Nighttime approach to the Bank. The airborne fight begins in the next chapter step. */
export class Chapter7Intro {
  private readonly bank = CITY_LAYOUT.buildings.find((b) => b.kind === 'bank');
  private readonly bird = new THREE.Group();
  private readonly leftWing = new THREE.Group();
  private readonly rightWing = new THREE.Group();
  private readonly perch = this.bank ? this.bank.base + this.bank.wall + 4 : 10;
  private met: boolean;
  private t = 0;

  constructor(private readonly ctx: LevelContext, private readonly onMeet: () => void) {
    this.met = ctx.save.data.interlude === 'elang_met';
    if (!this.bank) return;
    const model = enemyModels.geometry('elang_belang', 3.4, true);
    const mat = enemyModels.material('elang_belang');
    if (model && mat) {
      this.bird.add(new THREE.Mesh(model, mat));
    } else {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf7d671 }));
      body.scale.set(0.8, 1.25, 0.7);
      this.bird.add(body);
      const wingShape = new THREE.ConeGeometry(0.6, 2.8, 4);
      this.leftWing.add(new THREE.Mesh(wingShape, new THREE.MeshBasicMaterial({ color: 0x4dabf7, side: THREE.DoubleSide })));
      this.rightWing.add(new THREE.Mesh(wingShape, new THREE.MeshBasicMaterial({ color: 0xff644e, side: THREE.DoubleSide })));
      this.leftWing.position.x = -0.6;
      this.rightWing.position.x = 0.6;
      this.leftWing.rotation.z = Math.PI / 2;
      this.rightWing.rotation.z = -Math.PI / 2;
      this.bird.add(this.leftWing, this.rightWing);
    }
    this.bird.position.set(this.bank.x, this.perch, this.bank.z);
    ctx.root.add(this.bird);
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
    void this.ctx.dialog.say('elang_glen_melihat');
  }

  update(dt: number): void {
    if (!this.bank) return;
    this.t += dt;
    this.bird.position.y = this.perch + Math.sin(this.t * 1.5) * 0.5;
    this.bird.rotation.y = Math.sin(this.t * 0.65) * 0.35;
    if (this.leftWing.children.length) this.leftWing.rotation.x = Math.sin(this.t * 5) * 0.35;
    if (this.rightWing.children.length) this.rightWing.rotation.x = -Math.sin(this.t * 5) * 0.35;
  }
}
