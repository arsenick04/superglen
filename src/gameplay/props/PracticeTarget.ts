import * as THREE from 'three';
import type { Target } from '../Targets';
import type { PropEnv } from './PropEnv';

export interface PracticeTargetOptions {
  /** Ground position of the stand. */
  x: number;
  z: number;
  /** Ground height under the stand (default 0). */
  groundY?: number;
  /** Disc centre above the ground (default 1.2 m). */
  height?: number;
  /** Direction the disc faces (0 = +Z). */
  yaw?: number;
  /** Disc radius and aim radius (default 0.5). */
  radius?: number;
  /** Slow back-and-forth path (ground x/z points, first = start). Leave out for a fixed stand. */
  path?: readonly (readonly [number, number])[];
  /** Path speed (m/s, default 1.1). */
  speed?: number;
  /** Seconds after a hit before it stands up again (0 = stays down until `reset()`). */
  resetAfter?: number;
  id?: string;
  onHit?: (t: PracticeTarget) => void;
}

const READY = 0;
const HIT = 1;
const DOWN = 2;
const RISING = 3;

function discTexture(ring: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const bands: [number, string][] = [[64, '#ffc94d'], [54, ring], [40, '#ffffff'], [27, ring], [13, '#ffc94d']];
    for (const [r, col] of bands) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(64, 64, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A round red-white-gold target disc on a stand: a friendly laser practice prop. A hit makes it spin, flash and burst
 * into stars, light up green and tip back; `reset()` (or `resetAfter`) stands it up again. Some can glide slowly along
 * a path. Registers itself as a laser Target (disabled while it is down).
 *
 *   const t = new PracticeTarget(ctx, { x: 4, z: -6, yaw: Math.PI, onHit: () => hits++ });
 *   // in Level.fixedUpdate(dt):  t.tick(dt);
 */
export class PracticeTarget {
  readonly group = new THREE.Group();
  readonly target: Target;
  /** World aim point (the disc centre). */
  readonly aim = new THREE.Vector3();
  hits = 0;

  private readonly pivot = new THREE.Group();
  private readonly disc: THREE.Mesh;
  private readonly faceMat: THREE.MeshStandardMaterial;
  private readonly redTex: THREE.CanvasTexture;
  private readonly greenTex: THREE.CanvasTexture;
  private state = READY;
  private t = 0;
  private flash = 0;
  private boing = 99;
  private tilt = 0;
  private spin = 0;
  private seg = 0;
  private dir = 1;
  private readonly height: number;
  private readonly groundY: number;
  private appearT = 99;
  private baseScale = 1;
  private readonly baseRadius: number;

  constructor(
    private readonly env: PropEnv,
    private readonly opts: PracticeTargetOptions,
  ) {
    const h = (this.height = opts.height ?? 1.2);
    const R = (this.baseRadius = opts.radius ?? 0.5);
    this.groundY = opts.groundY ?? 0;
    this.redTex = discTexture('#e8453c');
    this.greenTex = discTexture('#2fbf5b');

    const metal = new THREE.MeshStandardMaterial({ color: 0x8aa0b8, roughness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 10), metal);
    pole.position.y = h / 2;
    pole.castShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.12, 16), gold);
    base.position.y = 0.06;
    base.castShadow = true;

    this.faceMat = new THREE.MeshStandardMaterial({ map: this.redTex, emissive: 0xffffff, emissiveMap: this.redTex, emissiveIntensity: 0.25, roughness: 0.6 });
    const back = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const geo = new THREE.CylinderGeometry(R, R, 0.08, 28);
    geo.rotateX(Math.PI / 2); // axis along Z; the +Y cap (the face) now looks toward +Z
    this.disc = new THREE.Mesh(geo, [gold, this.faceMat, back]);
    this.disc.castShadow = true;
    this.pivot.position.y = h;
    this.pivot.add(this.disc);
    this.group.add(pole, base, this.pivot);
    this.group.position.set(opts.x, this.groundY, opts.z);
    this.group.rotation.y = opts.yaw ?? 0;
    env.root.add(this.group);

    this.updateAim();
    this.target = env.targets.add({
      id: opts.id,
      position: () => this.aim,
      radius: R * 1.1,
      onHit: () => this.onHit(),
    });
  }

  get isDown(): boolean {
    return this.state !== READY;
  }

  /** Story use: pop up from the floor (scale 1 = normal; bigger for a helping hand). Standing and targetable. */
  show(scale = 1): void {
    this.baseScale = scale;
    this.group.visible = true;
    this.appearT = 0;
    this.reset();
    this.target.radius = this.baseRadius * 1.1 * scale;
  }

  /** Story use: gone (invisible, not targetable). */
  hide(): void {
    this.group.visible = false;
    this.target.enabled = false;
    this.state = DOWN;
  }

  /** Grow the (visible) target and its aim radius, e.g. when the child struggles. */
  enlarge(scale: number): void {
    this.baseScale = scale;
    this.group.scale.setScalar(scale);
    this.target.radius = this.baseRadius * 1.1 * scale;
  }

  /** Stop gliding along the path (the stand stays where it is). */
  settle(): void {
    this.opts.path = undefined;
  }

  /** Move the stand (story fallback: a target that comes closer). */
  moveTo(x: number, z: number): void {
    this.group.position.x = x;
    this.group.position.z = z;
    this.updateAim();
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  /** Stand it up again, ready for the next shot. */
  reset(): void {
    this.state = READY;
    this.tilt = 0;
    this.spin = 0;
    this.flash = 0;
    this.faceMat.map = this.redTex;
    this.faceMat.emissiveMap = this.redTex;
    this.faceMat.emissiveIntensity = 0.25;
    this.pivot.rotation.set(0, 0, 0);
    this.target.enabled = true;
  }

  /** Call from Level.fixedUpdate: slow movement and the hit animation. */
  tick(dt: number): void {
    const o = this.opts;
    if (o.path && o.path.length > 1) this.move(dt);

    switch (this.state) {
      case HIT: {
        this.t += dt;
        const u = Math.min(1, this.t / 0.7);
        this.spin = (1 - (1 - u) * (1 - u)) * Math.PI * 4;
        if (u >= 1) {
          this.state = DOWN;
          this.t = 0;
          this.spin = 0;
        }
        break;
      }
      case DOWN: {
        this.t += dt;
        this.tilt = -1.3 * Math.min(1, this.t / 0.35);
        if ((o.resetAfter ?? 0) > 0 && this.t > (o.resetAfter ?? 0)) {
          this.state = RISING;
          this.t = 0;
        }
        break;
      }
      case RISING: {
        this.t += dt;
        this.tilt = -1.3 * (1 - Math.min(1, this.t / 0.35));
        if (this.t >= 0.35) this.reset();
        break;
      }
      default:
        break;
    }

    // Cosmetics: flash fade, boing squash, pose.
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.faceMat.emissiveIntensity = this.state === READY ? 0.25 : 0.25 + this.flash * 0.9;
    let sc = 1;
    if (this.boing < 0.6) {
      this.boing += dt;
      sc = 1 + Math.exp(-7 * this.boing) * Math.cos(this.boing * 24) * 0.3;
    }
    this.pivot.scale.setScalar(sc);
    if (this.appearT < 0.45) {
      this.appearT += dt;
      const u = Math.min(1, this.appearT / 0.45);
      const c = 1.70158;
      const k = 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); // easeOutBack
      this.group.scale.setScalar(Math.max(0.01, this.baseScale * k));
    }
    this.pivot.rotation.x = this.tilt;
    this.disc.rotation.z = this.spin;
    this.updateAim();
  }

  private onHit(): void {
    if (this.state !== READY) return;
    const { sparkles, flashes } = this.env.fx;
    this.state = HIT;
    this.t = 0;
    this.hits++;
    this.flash = 1;
    this.boing = 0;
    this.target.enabled = false;
    this.faceMat.map = this.greenTex;
    this.faceMat.emissiveMap = this.greenTex;
    const p = this.aim;
    sparkles.burst(p.x, p.y, p.z, 16, 4, 0xffe14d, { up: 0.5, life: 0.9, gravity: 2.5 });
    sparkles.burst(p.x, p.y, p.z, 8, 3, 0x7dffa0, { up: 0.5, life: 0.8, gravity: 2.5 });
    flashes.spawn(p.x, p.y, p.z, 1.1, 0.4, 0xffffff);
    this.opts.onHit?.(this);
  }

  private move(dt: number): void {
    const path = this.opts.path as readonly (readonly [number, number])[];
    let left = (this.opts.speed ?? 1.1) * dt;
    for (let guard = 0; left > 1e-6 && guard < 8; guard++) {
      const b = path[this.seg + this.dir];
      const dx = b[0] - this.group.position.x;
      const dz = b[1] - this.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d <= left) {
        this.group.position.x = b[0];
        this.group.position.z = b[1];
        left -= d;
        this.seg += this.dir;
        if (this.seg + this.dir < 0 || this.seg + this.dir >= path.length) this.dir = -this.dir;
      } else {
        this.group.position.x += (dx / d) * left;
        this.group.position.z += (dz / d) * left;
        left = 0;
      }
    }
  }

  private updateAim(): void {
    const g = this.group.position;
    this.aim.set(g.x, g.y + this.height * this.baseScale, g.z);
  }
}
