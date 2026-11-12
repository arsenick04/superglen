import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Player } from '../player/Player';
import type { Sparkles } from '../world/bab1/Fx';
import type { BillboardRings } from '../fx/BillboardRings';
import type { DizzyStars } from '../fx/DizzyStars';

/** Where projectiles come from / go to: any {x,y,z}. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface ProjectileSpec {
  /** Start point (copied). */
  from: Vec3Like;
  /** Aim point (copied). With `gravity` the ball follows an arc that arrives at `to` after dist/speed seconds. */
  to?: Vec3Like;
  /** Or an explicit velocity (m/s). One of `to` / `velocity` is required. */
  velocity?: Vec3Like;
  /** m/s along the path when `to` is used (default 7: slow, so a small child can react). */
  speed?: number;
  /** Sphere radius (default 0.24). */
  radius?: number;
  /** Downward acceleration (m/s^2, default 0 = straight line). */
  gravity?: number;
  color?: number;
  /** Seconds before it pops by itself (default 6). */
  life?: number;
  /** Pop on level geometry (default true). */
  collideLevel?: boolean;
  /** Where a reflected ball flies back to. Pass a LIVE vector (the thrower) or leave out to use `from`. */
  returnTo?: THREE.Vector3;
  /** The shield bounced it. The projectile is passed: read, do not keep. */
  onBlocked?: (p: Projectile) => void;
  /** It touched the player (harmless: stars and a tiny hop). */
  onHitPlayer?: (p: Projectile) => void;
  /** It ran out of time or popped on the level. */
  onExpire?: (p: Projectile) => void;
  /** A reflected ball arrived back at `returnTo`. */
  onReturned?: (p: Projectile) => void;
}

export const ProjectileConfig = {
  pool: 8,
  defaultSpeed: 7,
  defaultRadius: 0.24,
  defaultLife: 6,
  /** Reflected balls fly back at least this fast (m/s) and a bit faster than they came. */
  reflectMinSpeed: 8,
  reflectBoost: 1.25,
  /** The dome catches anything within this many degrees of the facing (generous). */
  blockArcDeg: 75,
  /** A reflected ball counts as returned within this distance of its target (m). */
  returnRadius: 0.8,
  squashTime: 0.45,
} as const;

const COS_BLOCK = Math.cos((ProjectileConfig.blockArcDeg * Math.PI) / 180);
const PLAYER_HALF_CYL = 0.23; // (height - 2 radius) / 2 of the player capsule
const PLAYER_RADIUS = 0.32;

/** One pooled projectile. Callbacks receive it: its fields are valid only during the call. */
export class Projectile {
  active = false;
  /** True until the shield bounces it; reflected balls never hurt (not even harmlessly). */
  hostile = true;
  reflected = false;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  radius = 0.24;
  gravity = 0;
  speed = 7;
  age = 0;
  life = 6;
  collideLevel = true;
  /** Where a reflected ball goes (copy of `from`, or a live vector). */
  readonly home = new THREE.Vector3();
  liveHome: THREE.Vector3 | null = null;
  onBlocked?: (p: Projectile) => void;
  onHitPlayer?: (p: Projectile) => void;
  onExpire?: (p: Projectile) => void;
  onReturned?: (p: Projectile) => void;
  squash = 1e9;
  groundY = 0;
  hasGround = false;
  groundSkip = 0;
  spin = 0;
  readonly group = new THREE.Group();
  readonly shadow: THREE.Mesh;
  readonly mat: THREE.MeshLambertMaterial;

  constructor(shadow: THREE.Mesh, mat: THREE.MeshLambertMaterial) {
    this.shadow = shadow;
    this.mat = mat;
  }
}

/**
 * Pooled soft projectiles (rubber balls). Moved kinematically in the fixed step: swept sphere tests against the
 * shield dome and the player capsule, plus a level raycast. No Rapier bodies, no allocation per shot.
 *
 *   ctx.projectiles.spawn({ from: thrower, to: player.position, speed: 7, gravity: 6, color: 0xff6b6b,
 *                           onBlocked: () => thrower.getDizzy(), onHitPlayer: () => ... });
 *
 * Rules: a ball that meets the raised shield's front arc (±75°, a bit above) is reflected back to its source;
 * a ball that touches the player only shows stars and a tiny hop. Nothing ever damages or pushes the player.
 */
export class Projectiles {
  readonly pool: Projectile[] = [];
  /** Total spawned since load (tests). */
  spawned = 0;
  private next = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private readonly downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private readonly info = { x: 0, y: 0, z: 0 };
  private warming = false;

  constructor(
    scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly player: Player,
    private readonly fx: { sparkles: Sparkles; flashes: BillboardRings; stars: DizzyStars },
  ) {
    const ballGeo = new THREE.SphereGeometry(1, 18, 12);
    const bandGeo = new THREE.TorusGeometry(1.0, 0.13, 6, 28);
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const shadowGeo = new THREE.CircleGeometry(1, 16);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (let i = 0; i < ProjectileConfig.pool; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xff6b6b, emissive: 0xff6b6b, emissiveIntensity: 0.35 });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.renderOrder = 1;
      shadow.frustumCulled = false;
      shadow.visible = false;
      const p = new Projectile(shadow, mat);
      const ball = new THREE.Mesh(ballGeo, mat);
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.rotation.x = Math.PI / 2;
      const band2 = new THREE.Mesh(bandGeo, bandMat);
      band2.scale.setScalar(0.995);
      p.group.add(ball, band, band2);
      p.group.visible = false;
      scene.add(p.group, shadow);
      this.pool.push(p);
    }
  }

  /** Live projectile count. */
  get liveCount(): number {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].active) n++;
    return n;
  }

  spawn(spec: ProjectileSpec): Projectile {
    // Free slot, else recycle the oldest.
    let p: Projectile | null = null;
    for (let k = 0; k < this.pool.length; k++) {
      const c = this.pool[(this.next + k) % this.pool.length];
      if (!c.active) {
        p = c;
        break;
      }
    }
    if (!p) {
      p = this.pool[this.next];
      this.retire(p, false);
    }
    this.next = (this.pool.indexOf(p) + 1) % this.pool.length;
    this.spawned++;

    p.active = true;
    p.hostile = true;
    p.reflected = false;
    p.radius = spec.radius ?? ProjectileConfig.defaultRadius;
    p.gravity = spec.gravity ?? 0;
    p.speed = spec.speed ?? ProjectileConfig.defaultSpeed;
    p.life = spec.life ?? ProjectileConfig.defaultLife;
    p.collideLevel = spec.collideLevel ?? true;
    p.age = 0;
    p.pos.set(spec.from.x, spec.from.y, spec.from.z);
    p.home.set(spec.from.x, spec.from.y, spec.from.z);
    p.liveHome = spec.returnTo ?? null;
    p.onBlocked = spec.onBlocked;
    p.onHitPlayer = spec.onHitPlayer;
    p.onExpire = spec.onExpire;
    p.onReturned = spec.onReturned;
    p.squash = 0;
    p.groundSkip = 0;
    p.hasGround = false;

    if (spec.velocity) {
      p.vel.set(spec.velocity.x, spec.velocity.y, spec.velocity.z);
    } else if (spec.to) {
      const dx = spec.to.x - spec.from.x;
      const dy = spec.to.y - spec.from.y;
      const dz = spec.to.z - spec.from.z;
      const dist = Math.max(0.01, Math.hypot(dx, dy, dz));
      const T = dist / p.speed;
      // Arrive at `to` after T seconds under constant gravity.
      p.vel.set(dx / T, dy / T + 0.5 * p.gravity * T, dz / T);
    } else {
      p.vel.set(0, 0, 1).multiplyScalar(p.speed);
    }
    p.mat.color.setHex(spec.color ?? 0xff6b6b);
    p.mat.emissive.setHex(spec.color ?? 0xff6b6b);
    p.group.position.copy(p.pos);
    p.group.scale.setScalar(p.radius);
    p.group.visible = true;
    p.shadow.visible = true;
    return p;
  }

  /** The nearest hostile projectile flying toward (x, z) within `range` metres, or null. Used by the shield assist. */
  nearestIncoming(x: number, z: number, range: number): Projectile | null {
    let best: Projectile | null = null;
    let bestD = range * range;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active || !p.hostile) continue;
      const dx = x - p.pos.x;
      const dz = z - p.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD && p.vel.x * dx + p.vel.z * dz > 0) {
        bestD = d2;
        best = p;
      }
    }
    return best;
  }

  clear(): void {
    for (const p of this.pool) this.retire(p, false);
  }

  warm(on: boolean): void {
    this.warming = on;
    for (const p of this.pool) {
      p.group.visible = on || p.active;
      p.shadow.visible = on || p.active;
    }
  }

  // ------------------------------------------------------------------------------------------------------

  fixedUpdate(dt: number): void {
    const pool = this.pool;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.active) this.step(p, dt);
    }
  }

  /** Per frame: meshes, spin, boing squash and the ground blob. */
  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.group.position.copy(p.pos);
      p.spin += dt * 6;
      p.group.rotation.set(p.spin, p.spin * 0.7, 0);
      let sx = 1;
      let sy = 1;
      if (p.squash < ProjectileConfig.squashTime) {
        p.squash += dt;
        const k = Math.exp(-7 * p.squash) * Math.cos(p.squash * 26) * 0.4;
        sx = 1 + k;
        sy = 1 - k;
      }
      p.group.scale.set(p.radius * sx, p.radius * sy, p.radius * sx);
      if (p.hasGround) {
        const h = Math.max(0, p.pos.y - p.groundY);
        p.shadow.position.set(p.pos.x, p.groundY + 0.03, p.pos.z);
        p.shadow.scale.setScalar(p.radius * (1.3 - Math.min(0.6, h * 0.12)));
      } else {
        p.shadow.visible = this.warming;
      }
    }
  }

  private step(p: Projectile, dt: number): void {
    p.age += dt;
    if (p.age > p.life) {
      this.pop(p, true);
      return;
    }
    if (p.reflected && p.liveHome) p.home.copy(p.liveHome);
    const ox = p.pos.x;
    const oy = p.pos.y;
    const oz = p.pos.z;
    p.vel.y -= p.gravity * dt;
    const nx = ox + p.vel.x * dt;
    const ny = oy + p.vel.y * dt;
    const nz = oz + p.vel.z * dt;
    const sx = nx - ox;
    const sy = ny - oy;
    const sz = nz - oz;
    const len = Math.hypot(sx, sy, sz);

    // Ground blob height (a few times a second).
    if (++p.groundSkip >= 4 || !p.hasGround) {
      p.groundSkip = 0;
      this.downRay.origin.x = ox;
      this.downRay.origin.y = oy;
      this.downRay.origin.z = oz;
      const g = this.world.castRay(this.downRay, 30, true, undefined, undefined, this.player.collider);
      p.hasGround = !!g;
      if (g) p.groundY = oy - g.timeOfImpact;
    }

    // Level geometry: a ball that meets a wall or the floor pops.
    if (p.collideLevel && len > 1e-5) {
      this.ray.origin.x = ox;
      this.ray.origin.y = oy;
      this.ray.origin.z = oz;
      this.ray.dir.x = sx / len;
      this.ray.dir.y = sy / len;
      this.ray.dir.z = sz / len;
      const hit = this.world.castRay(this.ray, len + p.radius, true, undefined, undefined, this.player.collider);
      if (hit) {
        const t = Math.max(0, hit.timeOfImpact - p.radius * 0.5);
        p.pos.set(ox + (sx / len) * t, oy + (sy / len) * t, oz + (sz / len) * t);
        this.pop(p, true);
        return;
      }
    }

    // Swept tests: a few sample points along the step (the ball is never faster than ~0.4 m per step).
    const samples = Math.max(1, Math.ceil(len / 0.2));
    const hub = this.player.skills;
    const sh = hub.shield;
    const pp = this.player.position;
    for (let k = 1; k <= samples; k++) {
      const f = k / samples;
      const qx = ox + sx * f;
      const qy = oy + sy * f;
      const qz = oz + sz * f;
      if (p.hostile) {
        if (sh.up) {
          const rx = qx - sh.x;
          const ry = qy - sh.y;
          const rz = qz - sh.z;
          const lim = sh.radius + p.radius;
          if (rx * rx + ry * ry + rz * rz <= lim * lim && ry > -0.9 && p.vel.x * rx + p.vel.y * ry + p.vel.z * rz < 0) {
            const dh = Math.hypot(rx, rz);
            const cos = dh < 0.05 ? 1 : (rx * Math.sin(sh.yaw) + rz * Math.cos(sh.yaw)) / dh;
            if (cos >= COS_BLOCK) {
              p.pos.set(qx, qy, qz);
              this.reflect(p);
              return;
            }
          }
        }
        const ay = Math.max(pp.y - PLAYER_HALF_CYL, Math.min(pp.y + PLAYER_HALF_CYL, qy));
        const dx = qx - pp.x;
        const dy = qy - ay;
        const dz = qz - pp.z;
        const lim = PLAYER_RADIUS + p.radius;
        if (dx * dx + dy * dy + dz * dz <= lim * lim) {
          p.pos.set(qx, qy, qz);
          this.hitPlayer(p);
          return;
        }
      } else if (p.reflected) {
        const dx = qx - p.home.x;
        const dy = qy - p.home.y;
        const dz = qz - p.home.z;
        if (dx * dx + dy * dy + dz * dz <= ProjectileConfig.returnRadius * ProjectileConfig.returnRadius) {
          p.pos.set(qx, qy, qz);
          this.returned(p);
          return;
        }
      }
    }
    p.pos.set(nx, ny, nz);
  }

  private reflect(p: Projectile): void {
    const C = ProjectileConfig;
    const speed = Math.max(C.reflectMinSpeed, Math.hypot(p.vel.x, p.vel.y, p.vel.z) * C.reflectBoost);
    if (p.liveHome) p.home.copy(p.liveHome);
    let dx = p.home.x - p.pos.x;
    let dy = p.home.y - p.pos.y;
    let dz = p.home.z - p.pos.z;
    const d = Math.max(1e-3, Math.hypot(dx, dy, dz));
    dx /= d;
    dy /= d;
    dz /= d;
    p.vel.set(dx * speed, dy * speed, dz * speed);
    p.gravity = 0;
    p.hostile = false;
    p.reflected = true;
    p.age = 0;
    p.life = 4;
    p.squash = 0; // boing
    const hub = this.player.skills;
    hub.stats.shieldBlocks++;
    this.info.x = p.pos.x;
    this.info.y = p.pos.y;
    this.info.z = p.pos.z;
    this.fx.flashes.spawn(p.pos.x, p.pos.y, p.pos.z, 0.95, 0.35, 0xffd23f);
    this.fx.sparkles.burst(p.pos.x, p.pos.y, p.pos.z, 10, 3.5, 0xffd23f, { up: 0.2, life: 0.6, gravity: 1.5 });
    hub.emit('shieldBlock', this.info);
    p.onBlocked?.(p);
  }

  private hitPlayer(p: Projectile): void {
    const hub = this.player.skills;
    hub.stats.ballHits++;
    this.info.x = p.pos.x;
    this.info.y = p.pos.y;
    this.info.z = p.pos.z;
    this.fx.stars.show(this.player.visualPosition, 0.85, 1.3);
    this.fx.sparkles.burst(p.pos.x, p.pos.y, p.pos.z, 8, 2.5, 0xffe14d, { up: 0.5, life: 0.6, gravity: 3 });
    this.player.smallHop();
    hub.emit('ballHit', this.info);
    p.onHitPlayer?.(p);
    this.retire(p, false);
  }

  private returned(p: Projectile): void {
    this.fx.flashes.spawn(p.pos.x, p.pos.y, p.pos.z, 0.8, 0.4, 0xffffff);
    this.fx.sparkles.burst(p.pos.x, p.pos.y, p.pos.z, 10, 3, 0xffd23f, { up: 0.5, life: 0.7, gravity: 2 });
    p.onReturned?.(p);
    this.retire(p, false);
  }

  private pop(p: Projectile, notify: boolean): void {
    this.fx.sparkles.burst(p.pos.x, p.pos.y, p.pos.z, 6, 2, p.mat.color.getHex(), { up: 0.4, life: 0.5, gravity: 3 });
    if (notify) p.onExpire?.(p);
    this.retire(p, false);
  }

  private retire(p: Projectile, _notify: boolean): void {
    p.active = false;
    p.group.visible = this.warming;
    p.shadow.visible = this.warming;
  }
}
