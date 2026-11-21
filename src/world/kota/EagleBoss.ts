import * as THREE from 'three';
import { Combat } from '../../config/combat';
import type { Target } from '../../gameplay/Targets';
import type { LevelContext } from '../Level';
import { EagleVisual } from './EagleVisual';

type Wing = 'ice' | 'fire';
type Phase = 'cooldown' | 'warning' | 'resolve' | 'recover' | 'tamed';
interface Feather {
  mesh: THREE.Mesh;
  wing: Wing;
  pos: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  active: boolean;
}

/** An escalating aerial duel: telegraphed fire/ice bursts, then a clear recovery window. */
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
  private readonly alert: THREE.Sprite;
  private readonly alertMat: THREE.SpriteMaterial;
  private readonly locked = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private timer: number = Combat.eagle.cooldown;
  private time = 0;
  private warnedGround = false;
  private orbit = 0;
  private burstLeft = 0;
  private starHits = 0;
  private attackHits = 0;
  private readonly easy: boolean;

  constructor(private readonly ctx: LevelContext, private readonly onTamed: () => void) {
    const c = Combat.eagle;
    this.easy = ctx.save.data.settings.easyFight;
    this.maxStars = this.easy ? c.starsEasy : c.stars;
    this.stars = this.maxStars;
    ctx.root.add(this.visual.group);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const paint = canvas.getContext('2d');
    if (paint) {
      paint.fillStyle = '#14223d'; paint.beginPath(); paint.arc(64, 64, 49, 0, Math.PI * 2); paint.fill();
      paint.strokeStyle = '#ffffff'; paint.lineWidth = 7; paint.stroke();
      paint.fillStyle = '#ffffff'; paint.font = 'bold 88px sans-serif'; paint.textAlign = 'center'; paint.textBaseline = 'middle'; paint.fillText('!', 64, 68);
    }
    this.alertMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), color: 0x4dabf7, depthTest: false });
    this.alert = new THREE.Sprite(this.alertMat);
    this.alert.scale.set(1.7, 1.7, 1);
    this.alert.visible = false;
    ctx.root.add(this.alert);
    const geo = new THREE.ConeGeometry(0.4, 1.35, 7);
    const auraGeo = new THREE.ConeGeometry(0.67, 1.65, 7);
    for (let i = 0; i < c.featherPool; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x58dfff, toneMapped: false }));
      const aura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color: 0x4dabf7, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }));
      mesh.add(aura);
      mesh.visible = false;
      ctx.root.add(mesh);
      this.feathers.push({ mesh, wing: 'ice', pos: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, active: false });
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
    this.timer = this.easy ? Combat.eagle.cooldownEasy : Combat.eagle.cooldown;
    this.starHits = 0;
    this.burstLeft = 0;
    this.attackHits = 0;
    this.wing = 'ice';
    this.target.enabled = false;
    this.alert.visible = false;
    for (const f of this.feathers) { f.active = false; f.mesh.visible = false; }
  }

  fixedUpdate(dt: number, attacking: boolean): void {
    const c = Combat.eagle;
    if (!attacking || this.phase === 'tamed') return;
    this.time += dt;
    this.orbit += dt * c.orbitSpeed * (this.phase === 'recover' ? c.recoveryMotion : 1);
    const bird = this.visual.group.position;
    const x = Math.sin(this.orbit) * c.hoverSweepX + Math.sin(this.orbit * 2.3) * 2.5;
    const z = c.hoverZ + Math.cos(this.orbit * 1.7) * c.hoverSweepZ;
    const wantY = THREE.MathUtils.clamp(this.ctx.player.position.y + c.heightOffset, c.minHoverY, c.flyHeight - c.aimRadius);
    bird.set(THREE.MathUtils.clamp(x, -13, 13), bird.y + (wantY - bird.y) * Math.min(1, dt * c.heightFollow), z);
    this.aim.copy(bird);
    this.updateFeathers(dt);
    if (this.phase !== 'warning') this.alert.visible = this.feathers.some((f) => f.active && f.pos.distanceTo(this.ctx.player.position) < 5);
    if (this.alert.visible) this.alert.position.copy(this.ctx.player.position).add(this.up);
    this.timer -= dt;
    if (this.phase === 'cooldown' && this.timer <= 0) {
      this.burstLeft = this.easy ? c.burstShotsEasy : c.burstShots[this.stage];
      this.attackHits = 0;
      this.beginWarning();
    } else if (this.phase === 'warning') {
      const duration = this.easy ? c.warningEasy : c.warning;
      if (this.timer > duration * c.lockShare) this.locked.copy(this.ctx.player.position);
      this.alert.visible = this.timer <= c.alertSeconds;
      this.alert.position.copy(this.ctx.player.position).add(this.up);
      this.alert.scale.setScalar(1.7 + Math.sin(this.time * 20) * 0.18);
      if (this.timer <= 0) {
        this.fire();
        this.volleys++;
        this.wing = this.wing === 'ice' ? 'fire' : 'ice';
        if (--this.burstLeft > 0) this.beginWarning();
        else {
          this.alert.visible = false;
          this.phase = 'resolve';
        }
      }
    } else if (this.phase === 'resolve' && this.feathers.every((f) => !f.active)) {
      // A full ice/fire sequence must be survived before the bird is vulnerable.
      this.phase = this.attackHits ? 'cooldown' : 'recover';
      this.timer = this.attackHits ? (this.easy ? c.cooldownEasy : c.cooldown) : (this.easy ? c.recoverEasy : c.recover);
      this.target.enabled = !this.attackHits;
      this.starHits = 0;
    } else if (this.phase === 'recover' && this.timer <= 0) {
      this.target.enabled = false;
      this.phase = 'cooldown';
      this.timer = this.easy ? c.cooldownEasy : c.cooldown;
    }
  }

  update(): void {
    const bird = this.visual.group.position;
    const player = this.ctx.player.position;
    this.visual.update(this.time, this.phase === 'warning' ? this.wing : null, Math.atan2(player.x - bird.x, player.z - bird.z), this.phase === 'recover' ? 0 : Math.cos(this.orbit) * 0.25);
  }

  tame(): void {
    this.phase = 'tamed';
    this.target.enabled = false;
    this.alert.visible = false;
    for (const f of this.feathers) { f.active = false; f.mesh.visible = false; }
  }

  private get stage(): number {
    return Math.min(2, Math.floor((this.maxStars - this.stars) * 3 / this.maxStars));
  }

  private beginWarning(): void {
    this.phase = 'warning';
    this.timer = this.easy ? Combat.eagle.warningEasy : Combat.eagle.warning;
    this.locked.copy(this.ctx.player.position);
    this.alertMat.color.setHex(this.wing === 'ice' ? 0x4dabf7 : 0xff644e);
  }

  private fire(): void {
    const c = Combat.eagle;
    const from = this.visual.group.position;
    const count = this.easy ? c.featherCountEasy : c.featherCount;
    const speed = this.easy ? c.featherSpeedEasy : c.featherSpeed + this.stage * c.featherSpeedPerStage;
    for (let i = 0; i < count; i++) {
      const f = this.feathers.find((x) => !x.active);
      if (!f) break;
      f.active = true;
      f.wing = this.wing;
      f.age = 0;
      f.pos.set(from.x + (this.wing === 'ice' ? -c.wingOffset : c.wingOffset), from.y, from.z);
      // Fan spreads perpendicular to the shot, so dodging is readable from every camera angle.
      this.direction.subVectors(this.locked, f.pos).normalize();
      const spread = (i - (count - 1) / 2) * c.featherSpread;
      const dx = this.locked.x + this.direction.z * spread - f.pos.x;
      const dz = this.locked.z - this.direction.x * spread - f.pos.z;
      this.direction.set(dx, this.locked.y - f.pos.y, dz).normalize();
      f.velocity.copy(this.direction).multiplyScalar(speed);
      f.mesh.position.copy(f.pos);
      f.mesh.quaternion.setFromUnitVectors(this.up, this.direction);
      (f.mesh.material as THREE.MeshBasicMaterial).color.setHex(this.wing === 'ice' ? 0x58dfff : 0xffaa35);
      ((f.mesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(this.wing === 'ice' ? 0x2e9fff : 0xff3d21);
      f.mesh.visible = true;
    }
    this.ctx.fx.sparkles.burst(from.x, from.y, from.z, 32, 5, this.wing === 'ice' ? 0x6deaff : 0xffae32, { up: 0, life: 0.9, gravity: 0 });
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
      } else if (f.pos.distanceTo(p) < Combat.eagle.featherRadius + Combat.eagle.playerHitRadius) {
        const result = this.ctx.health.hurt(this.visual.group.position.x, this.visual.group.position.z);
        if (result === 'hit') { this.hits++; this.attackHits++; }
        if (result === 'blocked') this.blocks++;
        this.ctx.fx.sparkles.burst(f.pos.x, f.pos.y, f.pos.z, 18, 2, f.wing === 'ice' ? 0x6deaff : 0xffae32);
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
    this.starHits++;
    if (this.starHits < (this.easy ? Combat.eagle.hitsPerStarEasy : Combat.eagle.hitsPerStar)) {
      this.ctx.fx.sparkles.burst(this.aim.x, this.aim.y, this.aim.z, 12, 2, 0xffd23f);
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
      this.timer = this.easy ? Combat.eagle.cooldownEasy : Combat.eagle.cooldown;
      this.starHits = 0;
      this.burstLeft = 0;
    }
  }
}
