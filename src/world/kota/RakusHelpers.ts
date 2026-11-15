import * as THREE from 'three';
import type { LevelContext } from '../Level';
import type { HitInfo, Target } from '../../gameplay/Targets';
import { Combat, CombatRng } from '../../config/combat';
import { arrowGeo, pipGeo, ratGeo, RatConfig } from './MarketRats';

const S_OFF = 0;
const S_CHASE = 1;
const S_WIND = 2;
const S_CHARGE = 3;
const S_RECOVER = 4;
const S_STUN = 5;
const S_TAME = 6; // spinning with stars
const S_RUN = 7; // running away, then gone
const K_CHARGE = 0;
const K_CRUMB = 1;

/**
 * The Curut Cemberut helpers of Tikus Rakus (Chapter 6): up to 3 of the same grumpy little rats of Chapter 3 (3 hits each; stomp or
 * laser; a charge or a slow crumb after a clear wind-up). They join between rounds, chase the child at a walking pace, never attack
 * together and never while the boss slam ring is up. One tamed: dizzy spin with stars, runs away. Draw calls: rats, arrows, hearts
 * (1 instanced mesh each, only drawn while needed).
 */
export class RakusHelpers {
  readonly n = Combat.rakus.helpers.max;
  private readonly st = new Uint8Array(this.n);
  private readonly hx = new Float32Array(this.n);
  private readonly hz = new Float32Array(this.n);
  private readonly yaw = new Float32Array(this.n);
  private readonly timer = new Float32Array(this.n);
  private readonly hp = new Uint8Array(this.n);
  private readonly cool = new Float32Array(this.n);
  private readonly kind = new Uint8Array(this.n);
  private readonly dirX = new Float32Array(this.n);
  private readonly dirZ = new Float32Array(this.n);
  private readonly slX = new Float32Array(this.n);
  private readonly slZ = new Float32Array(this.n);
  private readonly squash = new Float32Array(this.n);
  private readonly puff = new Float32Array(this.n);
  private readonly exitX = new Float32Array(this.n);
  private readonly exitZ = new Float32Array(this.n);
  private readonly aim: THREE.Vector3[] = [];
  private readonly targets: Target[] = [];
  private readonly ratMesh: THREE.InstancedMesh;
  private readonly arrowMesh: THREE.InstancedMesh;
  private readonly pipMesh: THREE.InstancedMesh;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly hpMax: number;
  private readonly windup: number;
  private readonly cooldown: number;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private gap = 0;
  private t = 0;
  private disposed = false;
  /** False: they stand still (a scene, a rest, the child far away). */
  enabled = true;
  /** Test: nobody attacks by itself. */
  muted = false;
  /** Counters for tests. */
  tamedCount = 0;
  spawned = 0;
  attacks = 0;
  charges = 0;
  crumbs = 0;
  hurtGlen = 0;
  blocked = 0;
  hits = 0;
  dodges = 0;

  constructor(
    private readonly ctx: LevelContext,
    private readonly cx: number,
    private readonly cz: number,
    /** Helpers may start an attack now (the boss slam is not on). */
    private readonly mayAttack: () => boolean,
  ) {
    const easy = ctx.save.data.settings.easyFight;
    this.hpMax = easy ? Combat.rat.hpEasy : Combat.rat.hp;
    this.windup = easy ? Combat.rat.windupEasy : Combat.rat.windup;
    this.cooldown = easy ? Combat.rat.cooldownEasy : Combat.rat.cooldown;
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, fog: false });
    arrowMat.polygonOffset = true;
    arrowMat.polygonOffsetFactor = -2;
    this.mats.push(lit, arrowMat);
    const rg = ratGeo();
    const ag = arrowGeo();
    const pg = pipGeo();
    this.geos.push(rg, ag, pg);
    this.ratMesh = new THREE.InstancedMesh(rg, lit, this.n);
    this.arrowMesh = new THREE.InstancedMesh(ag, arrowMat, this.n);
    this.pipMesh = new THREE.InstancedMesh(pg, lit, this.n * this.hpMax);
    this.arrowMesh.renderOrder = 3;
    for (const m of [this.ratMesh, this.arrowMesh, this.pipMesh]) {
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.visible = false;
    }
    for (let k = 0; k < this.n * this.hpMax; k++) this.pipMesh.setColorAt(k, this.col.setHex(0xff4d6d));
    ctx.root.add(this.ratMesh, this.arrowMesh, this.pipMesh);
    for (let i = 0; i < this.n; i++) {
      this.aim.push(new THREE.Vector3());
      this.targets.push(
        ctx.targets.add({
          id: `rakusHelper${i}`,
          position: () => this.aim[i],
          radius: RatConfig.aimRadius,
          enabled: false,
          assist: { range: Combat.laser.assistRange, near: Combat.laser.nearDist, nearConeDeg: Combat.laser.nearConeDeg, farConeDeg: Combat.laser.farConeDeg },
          onHit: (h) => this.laserHit(i, h),
        }),
      );
    }
    // A landing stomp bonks every helper in its radius (one hit).
    ctx.player.onStomp((e) => {
      if (this.disposed) return;
      for (let i = 0; i < this.n; i++) {
        if (this.st[i] === S_OFF || this.st[i] >= S_TAME) continue;
        if (Math.hypot(this.hx[i] - e.x, this.hz[i] - e.z) < e.radius + 0.4 && Math.abs(e.y) < 3) this.hit(i, true);
      }
    });
    ctx.onDispose(() => {
      this.disposed = true;
      for (const g of this.geos) g.dispose();
      for (const m of this.mats) m.dispose();
      this.ratMesh.dispose();
      this.arrowMesh.dispose();
      this.pipMesh.dispose();
    });
  }

  /** Helpers that are still in the fight (not tamed yet). */
  get alive(): number {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.st[i] !== S_OFF && this.st[i] < S_TAME) c++;
    return c;
  }

  /** Someone is in a wind-up or a charge right now. */
  get attacking(): boolean {
    for (let i = 0; i < this.n; i++) if (this.st[i] === S_WIND || this.st[i] === S_CHARGE) return true;
    return false;
  }

  /** `count` more helpers run in from the edge of the arena (never more than `max` at once). Returns how many came. */
  spawn(count: number): number {
    let made = 0;
    for (let i = 0; i < this.n && made < count; i++) {
      if (this.st[i] !== S_OFF) continue;
      const a = CombatRng.next() * Math.PI * 2;
      const R = Combat.rakus.arenaRadius + 1;
      this.hx[i] = this.cx + Math.cos(a) * R;
      this.hz[i] = this.cz + Math.sin(a) * R;
      this.yaw[i] = a + Math.PI;
      this.hp[i] = this.hpMax;
      this.st[i] = S_CHASE;
      this.timer[i] = 0;
      this.cool[i] = 1.5 + made * 0.8;
      this.squash[i] = 0;
      this.slX[i] = this.slZ[i] = 0;
      this.targets[i].enabled = true;
      this.aim[i].set(this.hx[i], 0.4 * Combat.rat.scale, this.hz[i]);
      this.ctx.fx.sparkles.burst(this.hx[i], 0.4, this.hz[i], 10, 2, 0xdfe6f2, { gravity: 0.5, life: 0.5, up: 0.4 });
      this.ctx.sfx.blip();
      this.spawned++;
      made++;
    }
    if (made > 0) this.refreshVisible();
    return made;
  }

  /** All helpers vanish (the fight is over or starts again). */
  clear(): void {
    for (let i = 0; i < this.n; i++) {
      this.st[i] = S_OFF;
      this.targets[i].enabled = false;
    }
    this.refreshVisible();
  }

  private refreshVisible(): void {
    let any = false;
    for (let i = 0; i < this.n; i++) if (this.st[i] !== S_OFF) any = true;
    this.ratMesh.visible = any;
    if (!any) this.arrowMesh.visible = this.pipMesh.visible = false;
  }

  private laserHit(i: number, h: HitInfo): void {
    const s = this.st[i];
    if (s === S_OFF || s >= S_TAME) return;
    if (s !== S_STUN && h.distance > Combat.laser.dodgeMinDist && CombatRng.next() < Combat.laser.dodgeChance) {
      this.dodges++;
      const side = (i % 2 ? 1 : -1) * Combat.laser.dodgeHop;
      const l = Math.hypot(h.dirX, h.dirZ) || 1;
      this.slX[i] = (-h.dirZ / l) * side;
      this.slZ[i] = (h.dirX / l) * side;
      this.ctx.sfx.pop();
      this.ctx.fx.sparkles.burst(this.hx[i], 0.4, this.hz[i], 6, 2, 0xdfe6f2, { gravity: 0.5, life: 0.4, up: 0.3 });
      return;
    }
    this.hit(i, false);
  }

  /** One hit: the last one tames it (dizzy spin, then it runs away), the others only make it dizzy for a moment. */
  hit(i: number, _stomp: boolean): void {
    const s = this.st[i];
    if (s === S_OFF || s >= S_TAME) return;
    const { ctx } = this;
    this.hits++;
    this.squash[i] = 1;
    ctx.synth.boing();
    ctx.sfx.pop();
    this.aim[i].set(this.hx[i], 0.4 * Combat.rat.scale, this.hz[i]);
    if (this.hp[i] > 1) {
      this.hp[i]--;
      this.st[i] = S_STUN;
      this.timer[i] = 0;
      this.cool[i] = Math.max(this.cool[i], this.cooldown * 0.5);
      ctx.fx.stars.show(this.aim[i], 0.75 * Combat.rat.scale, Combat.rat.stun + 0.2, 0.3);
      ctx.fx.sparkles.burst(this.hx[i], 0.6, this.hz[i], 10, 2.4, 0xffe14d, { gravity: 2, life: 0.6, up: 0.8 });
      return;
    }
    this.hp[i] = 0;
    this.st[i] = S_TAME;
    this.timer[i] = 0;
    this.targets[i].enabled = false;
    this.tamedCount++;
    ctx.fx.stars.show(this.aim[i], 0.75 * Combat.rat.scale, RatConfig.dizzyTime + 0.3, 0.3);
    ctx.fx.sparkles.burst(this.hx[i], 0.5, this.hz[i], 14, 2.6, 0xffe14d, { gravity: 2, life: 0.7, up: 0.8 });
    const a = Math.atan2(this.hz[i] - this.cz, this.hx[i] - this.cx);
    this.exitX[i] = Math.cos(a);
    this.exitZ[i] = Math.sin(a);
  }

  private beginAttack(i: number, dp: number): void {
    const pl = this.ctx.player.position;
    this.attacks++;
    this.gap = Combat.rakus.helpers.gap;
    this.kind[i] = dp <= Combat.rat.chargeMaxDist ? K_CHARGE : K_CRUMB;
    this.st[i] = S_WIND;
    this.timer[i] = 0;
    this.puff[i] = 0;
    const d = Math.hypot(pl.x - this.hx[i], pl.z - this.hz[i]) || 1;
    this.dirX[i] = (pl.x - this.hx[i]) / d;
    this.dirZ[i] = (pl.z - this.hz[i]) / d;
    this.ctx.sfx.blip();
  }

  private launch(i: number): void {
    const { ctx } = this;
    if (this.kind[i] === K_CRUMB) {
      this.crumbs++;
      const pl = ctx.player.position;
      const t = Combat.rat;
      ctx.projectiles.spawn({
        from: { x: this.hx[i] + this.dirX[i] * 0.5, y: 0.75, z: this.hz[i] + this.dirZ[i] * 0.5 },
        to: { x: pl.x, y: pl.y, z: pl.z },
        speed: t.crumbSpeed,
        radius: t.crumbRadius,
        color: t.crumbColor,
        life: t.crumbLife,
        returnTo: this.aim[i],
        onHitPlayer: (p) => this.hurtGlenAt(p.pos.x, p.pos.z, i),
        onReturned: () => this.hit(i, false),
      });
      this.st[i] = S_RECOVER;
      this.timer[i] = 0;
      return;
    }
    this.charges++;
    this.st[i] = S_CHARGE;
    this.timer[i] = 0;
  }

  private hurtGlenAt(x: number, z: number, i: number): 'hit' | 'blocked' | 'ignored' {
    const r = this.ctx.health.hurt(x, z);
    if (r === 'hit') this.hurtGlen++;
    else if (r === 'blocked') {
      this.blocked++;
      if (this.st[i] === S_CHARGE) {
        this.st[i] = S_STUN;
        this.timer[i] = 0;
        this.squash[i] = 1;
        this.ctx.fx.stars.show(this.aim[i], 0.75 * Combat.rat.scale, Combat.rat.stun, 0.3);
      }
    }
    return r;
  }

  private turn(from: number, to: number, k: number): number {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    return from + d * Math.min(1, k);
  }

  /** Keep a helper inside the arena (a little wider than the piles) so none runs into the warehouse. */
  private clamp(i: number): void {
    const R = Combat.rakus.arenaRadius + 2;
    const dx = this.hx[i] - this.cx;
    const dz = this.hz[i] - this.cz;
    const d = Math.hypot(dx, dz);
    if (d > R) {
      this.hx[i] = this.cx + (dx / d) * R;
      this.hz[i] = this.cz + (dz / d) * R;
    }
  }

  fixedUpdate(dt: number): void {
    if (this.disposed) return;
    this.t += dt;
    const { ctx } = this;
    const pl = ctx.player.position;
    const C = Combat.rat;
    this.gap = Math.max(0, this.gap - dt);
    const calm = this.muted || !this.enabled || !ctx.game.controlsEnabled || ctx.dialog.active || ctx.health.resting;
    const feet = pl.y - 0.55;
    let changed = false;
    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      if (s === S_OFF) continue;
      const dx = this.hx[i] - pl.x;
      const dz = this.hz[i] - pl.z;
      const dp = Math.hypot(dx, dz);
      this.cool[i] = Math.max(0, this.cool[i] - dt);
      this.squash[i] = Math.max(0, this.squash[i] - dt * 3);
      if (this.slX[i] !== 0 || this.slZ[i] !== 0) {
        const L = Math.hypot(this.slX[i], this.slZ[i]);
        const step = Math.min(L, 9 * dt);
        this.hx[i] += (this.slX[i] / L) * step;
        this.hz[i] += (this.slZ[i] / L) * step;
        this.slX[i] -= (this.slX[i] / L) * step;
        this.slZ[i] -= (this.slZ[i] / L) * step;
        if (L - step < 0.01) this.slX[i] = this.slZ[i] = 0;
      }
      switch (s) {
        case S_CHASE: {
          if (!this.enabled) break;
          this.yaw[i] = this.turn(this.yaw[i], Math.atan2(-dx, -dz), dt * 6);
          if (!calm && dp > 3.4) {
            this.hx[i] -= (dx / dp) * Combat.rakus.helpers.speed * dt;
            this.hz[i] -= (dz / dp) * Combat.rakus.helpers.speed * dt;
          }
          if (!calm && dp < C.aggroRadius && this.cool[i] <= 0 && this.gap <= 0 && this.mayAttack()) this.beginAttack(i, dp);
          break;
        }
        case S_WIND: {
          this.timer[i] += dt;
          this.yaw[i] = this.turn(this.yaw[i], Math.atan2(this.dirX[i], this.dirZ[i]), dt * 6);
          if (this.timer[i] < this.windup * C.lockShare) {
            const d = dp || 1;
            this.dirX[i] = -dx / d;
            this.dirZ[i] = -dz / d;
          }
          this.puff[i] -= dt;
          if (this.puff[i] <= 0) {
            this.puff[i] = 0.1;
            ctx.fx.sparkles.burst(this.hx[i] - this.dirX[i] * 0.5, 0.15, this.hz[i] - this.dirZ[i] * 0.5, 2, 1.1, 0xf4f1e8, { gravity: -0.2, life: 0.4, up: 0.3 });
          }
          if (this.timer[i] >= this.windup) this.launch(i);
          break;
        }
        case S_CHARGE: {
          this.timer[i] += dt;
          this.hx[i] += this.dirX[i] * C.chargeSpeed * dt;
          this.hz[i] += this.dirZ[i] * C.chargeSpeed * dt;
          this.yaw[i] = Math.atan2(this.dirX[i], this.dirZ[i]);
          if (Math.hypot(this.hx[i] - pl.x, this.hz[i] - pl.z) < C.touchRadius && feet < C.touchTop) {
            const res = this.hurtGlenAt(this.hx[i], this.hz[i], i);
            if (res === 'hit' && this.st[i] === S_CHARGE) {
              this.st[i] = S_RECOVER;
              this.timer[i] = 0;
              this.cool[i] = this.cooldown;
            }
          }
          if (this.st[i] === S_CHARGE && this.timer[i] >= C.chargeTime) {
            this.st[i] = S_RECOVER;
            this.timer[i] = 0;
          }
          break;
        }
        case S_RECOVER: {
          this.timer[i] += dt;
          if (this.timer[i] >= C.recover) {
            this.st[i] = S_CHASE;
            this.cool[i] = this.cooldown;
          }
          break;
        }
        case S_STUN: {
          this.timer[i] += dt;
          this.yaw[i] += dt * 7;
          if (this.timer[i] >= C.stun) this.st[i] = S_CHASE;
          break;
        }
        case S_TAME: {
          this.timer[i] += dt;
          this.yaw[i] += dt * 9;
          if (this.timer[i] >= RatConfig.dizzyTime) {
            this.st[i] = S_RUN;
            this.timer[i] = 0;
          }
          break;
        }
        case S_RUN: {
          this.timer[i] += dt;
          this.hx[i] += this.exitX[i] * RatConfig.drainSpeed * dt;
          this.hz[i] += this.exitZ[i] * RatConfig.drainSpeed * dt;
          this.yaw[i] = this.turn(this.yaw[i], Math.atan2(this.exitX[i], this.exitZ[i]), dt * 6);
          if (this.timer[i] > 1.3) {
            this.st[i] = S_OFF;
            ctx.fx.sparkles.burst(this.hx[i], 0.3, this.hz[i], 10, 2, 0xdfe6f2, { gravity: 1.5, life: 0.5, up: 0.6 });
            ctx.sfx.pop();
            changed = true;
          }
          break;
        }
        default:
          break;
      }
      if (s !== S_RUN && s !== S_TAME) this.clamp(i);
      this.aim[i].set(this.hx[i], 0.4 * C.scale, this.hz[i]);
    }
    if (changed) this.refreshVisible();
  }

  update(): void {
    if (this.disposed || !this.ratMesh.visible) return;
    const t = this.t;
    const SC = Combat.rat.scale;
    let anyArrow = false;
    let anyPips = false;
    const cyaw = this.ctx.cameraRig.yaw;
    const rxv = Math.cos(cyaw);
    const rzv = -Math.sin(cyaw);
    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      let arrow = 0;
      if (s === S_OFF) this.m4.makeScale(0, 0, 0);
      else {
        let y = 0;
        let sy = 1;
        let sxz = 1;
        let jx = 0;
        let jz = 0;
        if (s === S_CHASE) y = Math.abs(Math.sin(t * 9 + i)) * 0.05;
        else if (s === S_RUN) {
          y = Math.abs(Math.sin(t * 15 + i)) * 0.09;
          sy = 1 + Math.sin(t * 30 + i) * 0.04;
        } else if (s === S_WIND) {
          const u = Math.min(1, this.timer[i] / this.windup);
          jx = Math.sin(t * 70 + i) * 0.05 * (0.4 + u);
          jz = Math.cos(t * 63 + i) * 0.05 * (0.4 + u);
          sy = 1 - 0.18 * u;
          sxz = 1 + (this.kind[i] === K_CRUMB ? 0.3 : 0.12) * u;
          if (this.kind[i] === K_CHARGE) arrow = 0.75 + 0.25 * Math.sin(t * 20);
        } else if (s === S_CHARGE) {
          y = Math.abs(Math.sin(t * 24 + i)) * 0.06;
          sy = 0.92;
        } else if (s === S_RECOVER) sy = 1 + Math.sin(t * 16 + i) * 0.05;
        else if (s === S_STUN) y = Math.sin(Math.PI * Math.min(1, this.timer[i] / Combat.rat.stun)) * 0.25;
        else if (s === S_TAME) {
          const u = Math.min(1, this.timer[i] / RatConfig.dizzyTime);
          y = Math.sin(Math.PI * Math.min(1, u * 2)) * 0.5;
          sy = 1 + 0.15 * Math.sin(u * 20);
        }
        const sq = this.squash[i];
        sy *= 1 - 0.25 * sq;
        sxz *= 1 + 0.2 * sq;
        this.q.setFromAxisAngle(this.up, this.yaw[i]);
        this.m4.compose(this.p.set(this.hx[i] + jx, y * SC, this.hz[i] + jz), this.q, this.sc.set(SC * sxz, SC * sy, SC * sxz));
      }
      this.ratMesh.setMatrixAt(i, this.m4);
      if (arrow > 0) {
        this.q.setFromAxisAngle(this.up, Math.atan2(this.dirX[i], this.dirZ[i]));
        this.m4.compose(this.p.set(this.hx[i] + this.dirX[i] * 0.7, 0.07, this.hz[i] + this.dirZ[i] * 0.7), this.q, this.sc.set(1.1, 1, arrow * 1.6));
        anyArrow = true;
      } else this.m4.makeScale(0, 0, 0);
      this.arrowMesh.setMatrixAt(i, this.m4);
      const fighting = s !== S_OFF && s < S_TAME;
      if (fighting) anyPips = true;
      for (let k = 0; k < this.hpMax; k++) {
        const idx = i * this.hpMax + k;
        if (!fighting) this.m4.makeScale(0, 0, 0);
        else {
          const off = (k - (this.hpMax - 1) / 2) * 0.32;
          const full = k < this.hp[i];
          const z = full ? 1.7 : 0.9;
          this.m4.compose(this.p.set(this.hx[i] + rxv * off, 1.35 + (full ? Math.sin(t * 5 + k) * 0.03 : 0), this.hz[i] + rzv * off), this.q.identity(), this.sc.set(z, z, z));
        }
        this.pipMesh.setMatrixAt(idx, this.m4);
        this.pipMesh.setColorAt(idx, this.col.setHex(k < this.hp[i] ? 0xff4d6d : 0x9aa0b4));
      }
    }
    this.ratMesh.instanceMatrix.needsUpdate = true;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    this.pipMesh.instanceMatrix.needsUpdate = true;
    if (this.pipMesh.instanceColor) this.pipMesh.instanceColor.needsUpdate = true;
    this.arrowMesh.visible = anyArrow;
    this.pipMesh.visible = anyPips;
  }

  /** Test handle. */
  debug(): { i: number; state: number; x: number; z: number; hp: number }[] {
    return Array.from({ length: this.n }, (_, i) => ({ i, state: this.st[i], x: this.hx[i], z: this.hz[i], hp: this.hp[i] }));
  }

  /** Test: helper i starts a charge (0) or crumb (1) now. */
  forceAttack(i: number, crumb: boolean): void {
    if (this.st[i] === S_OFF || this.st[i] >= S_TAME) return;
    this.beginAttack(i, crumb ? Combat.rat.chargeMaxDist + 2 : 1);
  }

  /** Test: one hit on helper i. */
  testHit(i: number): void {
    this.hit(i, false);
  }

  counts(): Record<string, number> {
    return { spawned: this.spawned, tamed: this.tamedCount, attacks: this.attacks, charges: this.charges, crumbs: this.crumbs, hurtGlen: this.hurtGlen, blocked: this.blocked, hits: this.hits, dodges: this.dodges, alive: this.alive };
  }
}
