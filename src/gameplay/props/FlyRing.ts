import * as THREE from 'three';
import type { PropEnv } from './PropEnv';

export interface FlyRingOptions {
  /** Ring centre (world). */
  x: number;
  y: number;
  z: number;
  /** Direction the ring faces / is flown through (yaw, 0 = +Z). Either way through counts. */
  yaw?: number;
  /** Ring radius in metres (default 1.6). */
  radius?: number;
  /** Seconds before a passed ring lights up again (0 = stays passed). Default 3. */
  rearmAfter?: number;
  /** Called every time the player flies through. */
  onPass?: (ring: FlyRing) => void;
}

/**
 * A glowing hover ring in the air. Flying through it (a generous volume: the whole disc plus half a body of slack,
 * about 2 m deep) pops it with sparkles and calls `onPass`. It lights up again after a few seconds so a child can
 * fly through it again.
 *
 *   const ring = new FlyRing(ctx, { x: 4, y: 7, z: -6, onPass: () => passed++ });
 *   // in Level.fixedUpdate(dt):  ring.tick(dt);
 */
export class FlyRing {
  readonly group = new THREE.Group();
  passes = 0;
  /** True while lit up and waiting for the player. */
  armed = true;

  private readonly mat: THREE.MeshBasicMaterial;
  private readonly glow: THREE.MeshBasicMaterial;
  private readonly radius: number;
  private readonly nx: number;
  private readonly nz: number;
  private popT = 99;
  private idleT = 0;
  private cooldown = 0;

  constructor(
    private readonly env: PropEnv,
    private readonly opts: FlyRingOptions,
  ) {
    const R = (this.radius = opts.radius ?? 1.6);
    const yaw = opts.yaw ?? 0;
    this.nx = Math.sin(yaw);
    this.nz = Math.cos(yaw);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false });
    this.glow = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.28, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 10, 40), this.mat);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(R, 0.34, 8, 40), this.glow);
    this.group.add(ring, halo);
    this.group.position.set(opts.x, opts.y, opts.z);
    this.group.rotation.y = yaw;
    env.root.add(this.group);
  }

  /** Call from Level.fixedUpdate (the pass test must run every fixed step, not every frame). */
  tick(dt: number): void {
    this.idleT += dt;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && (this.opts.rearmAfter ?? 3) > 0) this.setArmed(true);
    } else if (this.armed) {
      const p = this.env.player.position;
      const o = this.opts;
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const dz = p.z - o.z;
      const along = dx * this.nx + dz * this.nz;
      if (Math.abs(along) < 1.0) {
        const rx = dx - along * this.nx;
        const rz = dz - along * this.nz;
        if (Math.hypot(Math.hypot(rx, rz), dy) < this.radius + 0.5) this.pass();
      }
    }
    // Animation: idle shimmer, pop on a pass.
    let sc = 1 + 0.02 * Math.sin(this.idleT * 3);
    if (this.popT < 0.5) {
      this.popT += dt;
      sc = 1 + Math.exp(-6 * this.popT) * Math.sin(this.popT * Math.PI * 3.2) * 0.35;
    }
    this.group.scale.setScalar(sc);
  }

  private pass(): void {
    const o = this.opts;
    this.passes++;
    this.popT = 0;
    this.cooldown = o.rearmAfter ?? 3;
    this.setArmed(false);
    if (this.cooldown <= 0) this.cooldown = 1e9;
    const { sparkles, flashes } = this.env.fx;
    sparkles.burst(o.x, o.y, o.z, 22, 5, 0xffe14d, { up: 0, life: 0.9, gravity: 1 });
    sparkles.burst(o.x, o.y, o.z, 10, 4, 0xffffff, { up: 0, life: 0.7, gravity: 1 });
    flashes.spawn(o.x, o.y, o.z, this.radius * 1.1, 0.45, 0xffffff);
    this.env.player.skills.emit('ringPass', undefined);
    o.onPass?.(this);
  }

  /** Light up again right now (a ring reused by a new round). */
  rearm(): void {
    this.cooldown = 0;
    this.setArmed(true);
  }

  /** Move the ring (story fallback: a ring that comes closer to the player). */
  moveTo(x: number, y: number, z: number): void {
    this.opts.x = x;
    this.opts.y = y;
    this.opts.z = z;
    this.group.position.set(x, y, z);
  }

  get centre(): { x: number; y: number; z: number } {
    return this.opts;
  }

  private setArmed(on: boolean): void {
    this.armed = on;
    this.mat.color.setHex(on ? 0xffd23f : 0x7dffa0);
    this.glow.color.setHex(on ? 0xfff1a8 : 0xc8ffd8);
    this.glow.opacity = on ? 0.28 : 0.14;
  }
}
