import * as THREE from 'three';
import { Combat } from '../../config/combat';
import type { Target } from '../../gameplay/Targets';
import type { LevelContext } from '../Level';
import { EagleVisual } from './EagleVisual';

type Wing = 'ice' | 'fire';
type Phase = 'cooldown' | 'warning' | 'recover' | 'tamed';
interface Feather {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  active: boolean;
}

/** A gentle, readable airborne duel: alternating blue ice and red fire feather volleys. */
export class EagleBoss {
  readonly visual = new EagleVisual();
  readonly aim = new THREE.Vector3();
  readonly maxStars: number;
  stars: number;
  phase: Phase = 'cooldown';
  wing: Wing = 'ice';
  volleys = 0;
  blocks = 0;
  hits = 0;
  private readonly target: Target;
  private readonly feathers: Feather[] = [];
  private readonly mark: THREE.Mesh;
  private readonly markMat: THREE.MeshBasicMaterial;
  private readonly locked = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private timer: number = Combat.eagle.cooldown;
  private time = 0;
  private warnedGround = false;

  constructor(private readonly ctx: LevelContext, private readonly onTamed: () => void) {
    const c = Combat.eagle;
    this.maxStars = ctx.save.data.settings.easyFight ? c.starsEasy : c.stars;
    this.stars = this.maxStars;
    ctx.root.add(this.visual.group);
    this.markMat = new THREE.MeshBasicMaterial({ color: 0x4dabf7, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide });
    this.mark = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.09, 8, 28), this.markMat);
    this.mark.visible = false;
    ctx.root.add(this.mark);
    const geo = new THREE.ConeGeometry(0.28, 0.9, 5);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4dabf7 }));
      mesh.visible = false;
      ctx.root.add(mesh);
      this.feathers.push({ mesh, pos: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, active: false });
    }
    this.target = ctx.targets.add({
      id: 'elang_belang', position: () => this.aim, radius: c.aimRadius, assist: c.assist,
      onHit: () => this.onLaser(),
    });
    this.reset();
  }

  reset(): void {
    this.stars = this.maxStars;
    this.phase = 'cooldown';
    this.timer = Combat.eagle.cooldown;
    this.wing = 'ice';
    this.target.enabled = false;
    this.mark.visible = false;
    for (const f of this.feathers) { f.active = false; f.mesh.visible = false; }
  }

  fixedUpdate(dt: number, attacking: boolean): void {
    const c = Combat.eagle;
    this.time += dt;
    const bird = this.visual.group.position;
    bird.set(Math.sin(this.time * 0.52) * c.hoverSweepX, c.hoverY + Math.sin(this.time * 1.4) * 0.65, c.hoverZ + Math.sin(this.time * 0.4) * 1.5);
    this.aim.copy(bird);
    this.updateFeathers(dt);
    if (!attacking || this.phase === 'tamed') return;
    this.timer -= dt;
    if (this.phase === 'cooldown' && this.timer <= 0) {
      this.phase = 'warning';
      this.timer = c.warning;
      this.locked.copy(this.ctx.player.position);
      this.markMat.color.setHex(this.wing === 'ice' ? 0x4dabf7 : 0xff644e);
      this.mark.visible = true;
    } else if (this.phase === 'warning') {
      if (this.timer > c.warning * 0.45) this.locked.copy(this.ctx.player.position);
      this.mark.position.copy(this.locked);
      this.mark.scale.setScalar(1 + (1 - this.timer / c.warning) * 0.8);
      if (this.timer <= 0) {
        this.fire();
        this.mark.visible = false;
        this.phase = 'recover';
        this.timer = c.recover;
        this.target.enabled = true;
        this.volleys++;
        this.wing = this.wing === 'ice' ? 'fire' : 'ice';
      }
    } else if (this.phase === 'recover' && this.timer <= 0) {
      this.target.enabled = false;
      this.phase = 'cooldown';
      this.timer = c.cooldown;
    }
  }

  update(): void {
    this.visual.update(this.time, this.phase === 'warning' ? this.wing : null);
    if (this.mark.visible) this.mark.quaternion.copy(this.ctx.cameraRig.camera.quaternion);
  }

  tame(): void {
    this.phase = 'tamed';
    this.target.enabled = false;
    this.mark.visible = false;
    for (const f of this.feathers) { f.active = false; f.mesh.visible = false; }
  }

  private fire(): void {
    const c = Combat.eagle;
    const from = this.visual.group.position;
    for (let i = 0; i < 3; i++) {
      const f = this.feathers.find((x) => !x.active);
      if (!f) break;
      f.active = true;
      f.age = 0;
      f.pos.set(from.x + (this.wing === 'ice' ? -1.1 : 1.1), from.y, from.z);
      this.direction.set(this.locked.x + (i - 1) * 1.1 - f.pos.x, this.locked.y + (i - 1) * 0.35 - f.pos.y, this.locked.z - f.pos.z).normalize();
      f.velocity.copy(this.direction).multiplyScalar(c.featherSpeed);
      f.mesh.position.copy(f.pos);
      f.mesh.quaternion.setFromUnitVectors(this.up, this.direction);
      (f.mesh.material as THREE.MeshBasicMaterial).color.setHex(this.wing === 'ice' ? 0x4dabf7 : 0xff644e);
      f.mesh.visible = true;
    }
    this.ctx.fx.sparkles.burst(from.x, from.y, from.z, 14, 3, this.wing === 'ice' ? 0x4dabf7 : 0xff644e, { up: 0, life: 0.7, gravity: 0 });
  }

  private updateFeathers(dt: number): void {
    const p = this.ctx.player.position;
    for (const f of this.feathers) {
      if (!f.active) continue;
      f.age += dt;
      f.pos.addScaledVector(f.velocity, dt);
      f.mesh.position.copy(f.pos);
      if (f.age > Combat.eagle.featherLife || f.pos.y < 0.2) {
        f.active = false;
        f.mesh.visible = false;
      } else if (f.pos.distanceTo(p) < Combat.eagle.featherRadius + 0.45) {
        const result = this.ctx.health.hurt(this.visual.group.position.x, this.visual.group.position.z);
        if (result === 'hit') this.hits++;
        if (result === 'blocked') this.blocks++;
        f.active = false;
        f.mesh.visible = false;
      }
    }
  }

  private onLaser(): void {
    if (this.phase !== 'recover') return;
    if (!this.ctx.player.flight.isFlying) {
      if (!this.warnedGround) {
        this.warnedGround = true;
        void this.ctx.dialog.say('elang_nino_terbang');
      }
      return;
    }
    this.stars--;
    this.ctx.fx.sparkles.burst(this.aim.x, this.aim.y, this.aim.z, 24, 4, 0xffd23f, { up: 0.5, life: 0.8, gravity: 1 });
    if (this.stars <= 0) {
      this.tame();
      this.onTamed();
    } else {
      this.target.enabled = false;
      this.phase = 'cooldown';
      this.timer = Combat.eagle.cooldown;
    }
  }
}
