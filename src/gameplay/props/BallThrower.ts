import * as THREE from 'three';
import type { PropEnv } from './PropEnv';

export interface BallThrowerOptions {
  x: number;
  z: number;
  groundY?: number;
  /** Throws only while the player is within this distance (m, default 12). */
  range?: number;
  /** Seconds between throws while the player is in range (default 3). */
  interval?: number;
  /** Warning time before each throw (default 0.8 s): the machine pulses and a dotted arc shows where the ball goes. */
  telegraph?: number;
  /** Ball speed (m/s, default 7: slow and readable). */
  speed?: number;
  /** Ball arc: downward acceleration (default 6). */
  gravity?: number;
  /** Ball colour (bright, default tomato red). */
  color?: number;
  id?: string;
}

const DOTS = 14;
const MUZZLE_Y = 1.15;

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#7a4a00';
    g.beginPath();
    g.arc(16, 16, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffe14d';
    g.beginPath();
    g.arc(16, 16, 11, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/**
 * A friendly ball machine that tosses a soft rubber ball at the player (a reusable story helper). While the player is
 * within `range` it throws every `interval` seconds, always with a clear warning: ~0.8 s before the throw it pulses and
 * a dotted arc plus a ground marker show where the ball will go. The ball is slow (7 m/s). With the shield up the ball
 * bounces back and the machine gets dizzy for a moment (no throws), otherwise it just bonks the player harmlessly.
 *
 *   const m = new BallThrower(ctx, { x: 6, z: -8 });
 *   // in Level.fixedUpdate(dt):  m.tick(dt);
 */
export class BallThrower {
  enabled = true;
  /** Balls thrown / balls the shield sent back. */
  thrown = 0;
  returned = 0;
  readonly group = new THREE.Group();

  private readonly head = new THREE.Group();
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly arc: THREE.Points;
  private readonly arcPos: Float32Array;
  private readonly marker: THREE.Mesh;
  private readonly muzzle = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
  private cycle = 0;
  private t = 0;
  private dizzy = 0;
  private spinT = 99;
  private yaw = 0;
  private telegraphing = false;
  private readonly range: number;
  private readonly interval: number;
  private readonly telegraph: number;
  private readonly speed: number;
  private readonly gravity: number;
  private readonly color: number;
  private readonly groundY: number;

  constructor(
    private readonly env: PropEnv,
    opts: BallThrowerOptions,
  ) {
    this.range = opts.range ?? 12;
    this.interval = opts.interval ?? 3;
    this.telegraph = opts.telegraph ?? 0.8;
    this.speed = opts.speed ?? 7;
    this.gravity = opts.gravity ?? 6;
    this.color = opts.color ?? 0xff5a4f;
    this.groundY = opts.groundY ?? 0;

    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8fb1, roughness: 0.55, emissive: 0xffd23f, emissiveIntensity: 0 });
    const teal = new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.4 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.5 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.2, 20), gold);
    base.position.y = 0.1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.95, 20), this.bodyMat);
    body.position.y = 0.67;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 24), gold);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.62;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.bodyMat);
    dome.position.y = 1.14;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 14), teal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, MUZZLE_Y - 0.05, 0.45);
    const eyeGeo = new THREE.SphereGeometry(0.11, 12, 8);
    const pupilGeo = new THREE.SphereGeometry(0.055, 8, 6);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, white);
      eye.position.set(sx * 0.2, 0.86, 0.46);
      const pupil = new THREE.Mesh(pupilGeo, dark);
      pupil.position.set(sx * 0.2, 0.86, 0.55);
      this.head.add(eye, pupil);
    }
    for (const m of [base, body, dome, tube]) m.castShadow = true;
    this.head.add(body, belt, dome, tube);
    this.group.add(base, this.head);
    this.group.position.set(opts.x, this.groundY, opts.z);
    env.root.add(this.group);

    // Dotted arc (one draw call; draw range 0 = nothing drawn but the shader is compiled at level build).
    this.arcPos = new Float32Array(DOTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arc = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.26, map: dotTexture(), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: true, fog: false }),
    );
    this.arc.frustumCulled = false;
    this.arc.renderOrder = 5;
    geo.setDrawRange(0, 0);
    env.root.add(this.arc);

    const mg = new THREE.RingGeometry(0.55, 0.8, 32);
    mg.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 2;
    mg.setDrawRange(0, 0);
    env.root.add(this.marker);
    this.updateMuzzle();
  }

  /** Throw right now (also what the timer does). */
  throwNow(): void {
    this.updateMuzzle();
    const p = this.env.player.position;
    this.aim.set(p.x, p.y, p.z);
    this.thrown++;
    this.env.projectiles.spawn({
      from: this.muzzle,
      to: this.aim,
      speed: this.speed,
      gravity: this.gravity,
      color: this.color,
      radius: 0.26,
      returnTo: this.muzzle,
      onReturned: () => this.react(),
    });
    const m = this.muzzle;
    this.env.fx.sparkles.burst(m.x, m.y, m.z, 6, 2, 0xffe14d, { up: 0.3, life: 0.4, gravity: 0 });
  }

  /** Call from Level.fixedUpdate. */
  tick(dt: number): void {
    this.t += dt;
    this.updateMuzzle();
    const pl = this.env.player.position;
    const dx = pl.x - this.group.position.x;
    const dz = pl.z - this.group.position.z;
    const dist = Math.hypot(dx, dz);

    // The head turns to look at the player when nearby.
    if (dist < this.range + 4 && this.dizzy <= 0) {
      const want = Math.atan2(dx, dz);
      let d = (want - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 6);
    }
    let spin = 0;
    let squash = 1;
    if (this.spinT < 1.2) {
      this.spinT += dt;
      spin = (1 - Math.exp(-4 * this.spinT)) * Math.PI * 4;
      squash = 1 + Math.exp(-6 * this.spinT) * Math.cos(this.spinT * 24) * 0.25;
    }
    this.head.rotation.y = this.yaw + spin;
    this.head.scale.set(squash, 2 - squash, squash);

    if (this.dizzy > 0) this.dizzy -= dt;
    const active = this.enabled && this.dizzy <= 0 && dist <= this.range;
    if (!active) {
      this.cycle = 0;
      this.setTelegraph(false);
      this.bodyMat.emissiveIntensity = 0;
      return;
    }
    this.cycle += dt;
    const left = this.interval - this.cycle;
    if (left <= this.telegraph) {
      this.setTelegraph(true);
      // Follow the player until 0.25 s before the throw, then hold still (fair for a small child).
      this.updateMuzzle();
      if (left > 0.25) this.aim.set(pl.x, pl.y, pl.z);
      this.drawArc();
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 22);
      this.bodyMat.emissiveIntensity = 0.25 + 0.5 * pulse;
      this.head.scale.multiplyScalar(1 + 0.08 * pulse);
    }
    if (this.cycle >= this.interval) {
      this.cycle = 0;
      this.setTelegraph(false);
      this.bodyMat.emissiveIntensity = 0;
      this.throwNow();
    }
  }

  private react(): void {
    this.returned++;
    this.dizzy = 2.5;
    this.spinT = 0;
    this.cycle = 0;
    this.setTelegraph(false);
    this.top.set(this.group.position.x, this.groundY + 2.0, this.group.position.z);
    this.env.fx.stars.show(this.top, 0, 2.2, 0.5);
  }

  private updateMuzzle(): void {
    const g = this.group.position;
    const f = this.yaw;
    this.muzzle.set(g.x + Math.sin(f) * 0.8, this.groundY + MUZZLE_Y, g.z + Math.cos(f) * 0.8);
  }

  private setTelegraph(on: boolean): void {
    if (on === this.telegraphing) return;
    this.telegraphing = on;
    this.arc.geometry.setDrawRange(0, on ? DOTS : 0);
    this.marker.geometry.setDrawRange(0, on ? Infinity : 0);
  }

  /** Dots along the ballistic path to the aim point, and the marker on the ground under it. */
  private drawArc(): void {
    const m = this.muzzle;
    const a = this.aim;
    const dx = a.x - m.x;
    const dy = a.y - m.y;
    const dz = a.z - m.z;
    const T = Math.max(0.05, Math.hypot(dx, dy, dz) / this.speed);
    const vx = dx / T;
    const vy = dy / T + 0.5 * this.gravity * T;
    const vz = dz / T;
    for (let i = 0; i < DOTS; i++) {
      const t = (T * (i + 1)) / (DOTS + 1);
      this.arcPos[i * 3] = m.x + vx * t;
      this.arcPos[i * 3 + 1] = m.y + vy * t - 0.5 * this.gravity * t * t;
      this.arcPos[i * 3 + 2] = m.z + vz * t;
    }
    this.arc.geometry.attributes.position.needsUpdate = true;
    const pulse = 1 + 0.12 * Math.sin(this.t * 18);
    this.marker.position.set(a.x, this.env.player.visualPosition.y - 0.5, a.z);
    this.marker.scale.setScalar(pulse);
  }
}
