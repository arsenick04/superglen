import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Input } from '../../input/Input';
import type { Physics } from '../../core/Physics';
import type { ThirdPersonCamera } from '../../camera/ThirdPersonCamera';
import type { Sparkles } from '../../world/bab1/Fx';
import type { BillboardRings } from '../../fx/BillboardRings';
import { makeCandidates, type AimQuery, type HitInfo, type Target, type Targets } from '../../gameplay/Targets';
import type { Player } from '../Player';
import type { LaserShotInfo } from './Skills';

export const LaserConfig = {
  /** Auto-aim reach (m). */
  range: 22,
  /** Half-angle of the aim cone around the facing / the camera forward (degrees). Generous on purpose. */
  coneDeg: 55,
  /** Holding the button fires again every this many seconds. */
  repeat: 0.45,
  /** A fresh press fires again after this short gap (button mashing is fine, spamming is not). */
  minGap: 0.2,
  beamLife: 0.12,
  /** Wrist offset from the capsule centre: right, forward, up (m). */
  wristRight: 0.3,
  wristForward: 0.28,
  wristUp: 0.12,
  /** At most this many line-of-sight rays per shot. */
  losChecks: 4,
  /** The aim marker re-evaluates this often (s). */
  markerInterval: 0.1,
  beamPool: 3,
} as const;

interface Beam {
  group: THREE.Group;
  glow: THREE.Mesh;
  core: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
  age: number;
  active: boolean;
}

function markerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.translate(64, 64);
    g.lineCap = 'round';
    // Four friendly corner arcs, dark outline first so it reads on any background.
    for (const [col, w] of [['rgba(120,10,10,0.85)', 15], ['#ffd23f', 9]] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        g.beginPath();
        g.arc(0, 0, 46, a - 0.38, a + 0.38);
        g.stroke();
      }
    }
    g.fillStyle = '#ff4d3d';
    g.beginPath();
    g.arc(0, 0, 8, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Laser tangan: a short bright red-gold beam from the right wrist with auto-aim.
 *
 *   press (or hold: repeats every 0.45 s) -> pick the best enabled Target within 22 m inside a wide cone around the
 *   player's facing OR the camera's forward, behind no wall -> the body turns to it, the beam goes to it, its onHit
 *   runs (stars, never harm). Nothing to aim at: the beam goes straight ahead and 'laserMiss' fires.
 *
 * A friendly bracket floats on the target that would be hit, so the child sees it before pressing.
 * Only in Superglen mode, when unlocked, input enabled and the shield is down.
 */
export class Laser {
  /** Target the next press would hit (null = none). */
  aimTarget: Target | null = null;
  private sinceShot = 10;
  private markerT = 0;
  private readonly query: AimQuery = { x: 0, y: 0, z: 0, facingX: 0, facingZ: 1, cameraX: 0, cameraZ: -1, range: LaserConfig.range, cone: (LaserConfig.coneDeg * Math.PI) / 180 };
  private readonly cands = makeCandidates(LaserConfig.losChecks + 2);
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private readonly beams: Beam[] = [];
  private nextBeam = 0;
  private readonly marker: THREE.Sprite;
  private readonly markerMat: THREE.SpriteMaterial;
  private markerAge = 0;
  private warming = false;
  private readonly shot: LaserShotInfo = { fromX: 0, fromY: 0, fromZ: 0, toX: 0, toY: 0, toZ: 0, targetId: '', hit: false };
  private readonly hitInfo: HitInfo;
  private readonly dir = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly player: Player,
    private readonly input: Input,
    private readonly physics: Physics,
    private readonly cameraRig: ThirdPersonCamera,
    private readonly targets: Targets,
    private readonly fx: { sparkles: Sparkles; flashes: BillboardRings },
  ) {
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    cyl.rotateX(Math.PI / 2);
    cyl.translate(0, 0, 0.5); // axis along +Z, starts at the origin
    for (let i = 0; i < LaserConfig.beamPool; i++) {
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3d2e, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const glow = new THREE.Mesh(cyl, glowMat);
      const core = new THREE.Mesh(cyl, coreMat);
      glow.frustumCulled = false;
      core.frustumCulled = false;
      glow.renderOrder = 8;
      core.renderOrder = 9;
      const group = new THREE.Group();
      group.add(glow, core);
      group.visible = false;
      scene.add(group);
      this.beams.push({ group, glow, core, glowMat, coreMat, age: 0, active: false });
    }
    this.markerMat = new THREE.SpriteMaterial({ map: markerTexture(), transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.marker = new THREE.Sprite(this.markerMat);
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    this.marker.frustumCulled = false;
    scene.add(this.marker);
    this.hitInfo = { target: this.cands[0].target, x: 0, y: 0, z: 0, dirX: 0, dirY: 0, dirZ: 0, distance: 0 };
  }

  /** Can the laser fire right now? */
  get canFire(): boolean {
    const p = this.player;
    return p.skills.unlocked.laser && p.mode === 'superglen' && p.inputEnabled && !p.skills.shield.up;
  }

  /** Fixed step (before the player moves). */
  fixedUpdate(dt: number): void {
    this.sinceShot += dt;
    if (!this.canFire) return;
    const press = this.input.wasPressed('laser');
    const down = this.input.isDown('laser');
    if ((press && this.sinceShot >= LaserConfig.minGap) || (down && this.sinceShot >= LaserConfig.repeat)) this.fire();
  }

  /** Fire one shot now (also what a press does). Returns true if it hit a target. */
  fire(): boolean {
    const L = LaserConfig;
    const p = this.player;
    const pos = p.position;
    this.sinceShot = 0;
    const hub = p.skills;
    hub.stats.laserShots++;

    const target = this.pickTarget(true);
    const s = this.shot;
    let yaw = p.facing;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    if (target) {
      const tp = target.position();
      tx = tp.x;
      ty = tp.y;
      tz = tp.z;
      yaw = Math.atan2(tx - pos.x, tz - pos.z);
      p.turnTo(yaw);
    }
    // Wrist: front-right of the body, seen from the (new) facing.
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const wx = pos.x + sin * L.wristForward + cos * L.wristRight;
    const wy = pos.y + L.wristUp;
    const wz = pos.z + cos * L.wristForward - sin * L.wristRight;
    s.fromX = wx;
    s.fromY = wy;
    s.fromZ = wz;

    if (target) {
      s.toX = tx;
      s.toY = ty;
      s.toZ = tz;
      s.targetId = target.id;
      s.hit = true;
      const dx = tx - wx;
      const dy = ty - wy;
      const dz = tz - wz;
      const dist = Math.max(0.01, Math.hypot(dx, dy, dz));
      this.spawnBeam(wx, wy, wz, tx, ty, tz);
      this.fx.sparkles.burst(tx, ty, tz, 14, 4.5, 0xffd23f, { up: 0.3, life: 0.7, gravity: 2 });
      this.fx.sparkles.burst(tx, ty, tz, 8, 3.5, 0xff5a4a, { up: 0.3, life: 0.6, gravity: 2 });
      this.fx.flashes.spawn(tx, ty, tz, 0.9, 0.35, 0xffd23f);
      hub.stats.laserHits++;
      hub.emit('laserFire', s);
      hub.emit('laserHit', s);
      const h = this.hitInfo;
      h.target = target;
      h.x = tx;
      h.y = ty;
      h.z = tz;
      h.dirX = dx / dist;
      h.dirY = dy / dist;
      h.dirZ = dz / dist;
      h.distance = dist;
      target.onHit(h);
    } else {
      // Straight ahead along the body's facing, to max range or the first wall.
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      this.ray.origin.x = wx;
      this.ray.origin.y = wy;
      this.ray.origin.z = wz;
      this.ray.dir.x = dx;
      this.ray.dir.y = 0;
      this.ray.dir.z = dz;
      const hit = this.physics.world.castRay(this.ray, L.range, true, undefined, undefined, p.collider);
      const len = hit ? hit.timeOfImpact : L.range;
      s.toX = wx + dx * len;
      s.toY = wy;
      s.toZ = wz + dz * len;
      s.targetId = '';
      s.hit = false;
      this.spawnBeam(wx, wy, wz, s.toX, s.toY, s.toZ);
      if (hit) this.fx.sparkles.burst(s.toX, s.toY, s.toZ, 5, 2, 0xffd23f, { up: 0.3, life: 0.4, gravity: 2 });
      hub.stats.laserMisses++;
      hub.emit('laserFire', s);
      hub.emit('laserMiss', s);
    }
    this.fx.sparkles.burst(wx, wy, wz, 4, 1.5, 0xfff6c8, { up: 0.2, life: 0.3, gravity: 0 });
    return !!target;
  }

  /**
   * Best target right now: candidates by angle and distance from the player's facing OR the camera forward, then the
   * first one with a clear line (walls block). `shot` = a real shot (more rays) vs the cheap marker check.
   */
  private pickTarget(shot: boolean): Target | null {
    const p = this.player;
    const pos = p.position;
    const q = this.query;
    q.x = pos.x;
    q.y = pos.y;
    q.z = pos.z;
    q.facingX = Math.sin(p.facing);
    q.facingZ = Math.cos(p.facing);
    q.cameraX = -Math.sin(this.cameraRig.yaw);
    q.cameraZ = -Math.cos(this.cameraRig.yaw);
    const n = this.targets.findCandidates(q, this.cands);
    const max = shot ? LaserConfig.losChecks : 2;
    for (let i = 0; i < n && i < max; i++) {
      const t = this.cands[i].target;
      const d = this.cands[i].dist;
      const tp = t.position();
      const inv = 1 / d;
      this.ray.origin.x = pos.x;
      this.ray.origin.y = pos.y;
      this.ray.origin.z = pos.z;
      this.ray.dir.x = (tp.x - pos.x) * inv;
      this.ray.dir.y = (tp.y - pos.y) * inv;
      this.ray.dir.z = (tp.z - pos.z) * inv;
      const hit = this.physics.world.castRay(this.ray, d, true, undefined, undefined, p.collider);
      if (!hit || hit.timeOfImpact >= d - t.radius - 0.15) return t;
    }
    return null;
  }

  private spawnBeam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const b = this.beams[this.nextBeam];
    this.nextBeam = (this.nextBeam + 1) % this.beams.length;
    b.active = true;
    b.age = 0;
    b.group.visible = true;
    b.group.position.set(x0, y0, z0);
    this.dir.set(x1 - x0, y1 - y0, z1 - z0);
    const len = Math.max(0.05, this.dir.length());
    b.group.lookAt(x1, y1, z1);
    b.group.scale.set(1, 1, len);
    b.glow.scale.set(0.1, 0.1, 1);
    b.core.scale.set(0.038, 0.038, 1);
    b.glowMat.opacity = 0.6;
    b.coreMat.opacity = 1;
  }

  /** Per rendered frame: beams fade, aim marker follows its target. */
  update(dt: number): void {
    for (const b of this.beams) {
      if (!b.active) continue;
      b.age += dt;
      const t = b.age / LaserConfig.beamLife;
      if (t >= 1) {
        b.active = false;
        b.group.visible = this.warming;
        continue;
      }
      const w = 1 - t * 0.6;
      b.glow.scale.set(0.1 * w, 0.1 * w, 1);
      b.core.scale.set(0.038 * w, 0.038 * w, 1);
      b.glowMat.opacity = 0.6 * (1 - t);
      b.coreMat.opacity = 1 - t * t;
    }

    // Aim marker: only while a press would fire.
    if (this.canFire) {
      this.markerT -= dt;
      if (this.markerT <= 0) {
        this.markerT = LaserConfig.markerInterval;
        this.aimTarget = this.pickTarget(false);
      }
    } else {
      this.aimTarget = null;
    }
    const a = this.aimTarget;
    if (a && !a.removed && a.enabled) {
      this.markerAge += dt;
      const tp = a.position();
      this.marker.visible = true;
      this.marker.position.copy(tp);
      const size = a.radius * 2.6 + 0.25 + 0.08 * Math.sin(this.markerAge * 8);
      this.marker.scale.set(size, size, 1);
      this.markerMat.rotation = this.markerAge * 1.2;
    } else {
      this.aimTarget = null;
      this.marker.visible = this.warming;
    }
  }

  /** Called when the targets list was cleared (level unload). */
  clear(): void {
    this.aimTarget = null;
    for (const b of this.beams) {
      b.active = false;
      b.group.visible = this.warming;
    }
  }

  warm(on: boolean): void {
    this.warming = on;
    for (const b of this.beams) b.group.visible = on || b.active;
    this.marker.visible = on || !!this.aimTarget;
  }
}
