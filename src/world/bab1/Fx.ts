import * as THREE from 'three';

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
  }
  return new THREE.CanvasTexture(c);
}

export interface Emitter {
  on: boolean;
  x: number;
  y: number;
  z: number;
  remove(): void;
}

interface EmitterState extends Emitter {
  radius: number;
  rate: number;
  color: number;
  acc: number;
  removed: boolean;
}

const COLORS_PARTY = [0xffd23f, 0xff6b6b, 0x4dabf7, 0x2ec4b6, 0xff8fb1, 0xb8f2a8];

/**
 * One pooled additive Points object = one draw call for every sparkle, confetti bit and glow dot of the
 * chapter. No allocations per frame. Dead particles sit far below the world, black (invisible when additive).
 */
export class Sparkles {
  private readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly base: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grav: Float32Array;
  private readonly emitters: EmitterState[] = [];
  private next = 0;
  private alive = 0;
  private readonly c = new THREE.Color();

  constructor(
    parent: THREE.Object3D,
    private readonly count = 192,
  ) {
    this.pos = new Float32Array(count * 3).fill(-1000);
    this.col = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.grav = new Float32Array(count);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.34,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    parent.add(this.points);
  }

  /** A single particle. `gravity` > 0 pulls down. */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, gravity: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    if (this.life[i] <= 0) this.alive++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.c.setHex(color);
    this.base[i * 3] = this.c.r;
    this.base[i * 3 + 1] = this.c.g;
    this.base[i * 3 + 2] = this.c.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
  }

  /** Round burst. `color` -1 = party colours (confetti). */
  burst(x: number, y: number, z: number, n: number, speed: number, color: number, opts: { up?: number; gravity?: number; life?: number } = {}): void {
    const up = opts.up ?? 0.5;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.4 + Math.random() * 0.6);
      const col = color >= 0 ? color : COLORS_PARTY[(Math.random() * COLORS_PARTY.length) | 0];
      this.spawn(x, y, z, Math.cos(a) * r * s, (u * 0.6 + up) * s, Math.sin(a) * r * s, col, (opts.life ?? 1) * (0.7 + Math.random() * 0.5), opts.gravity ?? 3);
    }
  }

  /** A slowly rising stream of sparkles around a point while `on`. */
  addEmitter(x: number, y: number, z: number, radius: number, rate: number, color: number): Emitter {
    const e: EmitterState = {
      on: true,
      x,
      y,
      z,
      radius,
      rate,
      color,
      acc: Math.random(),
      removed: false,
      remove: () => {
        e.removed = true;
      },
    };
    this.emitters.push(e);
    return e;
  }

  update(dt: number): void {
    for (let k = this.emitters.length - 1; k >= 0; k--) {
      const e = this.emitters[k];
      if (e.removed) {
        this.emitters.splice(k, 1);
        continue;
      }
      if (!e.on) continue;
      e.acc += e.rate * dt;
      while (e.acc >= 1) {
        e.acc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * e.radius;
        this.spawn(e.x + Math.cos(a) * r, e.y + Math.random() * 0.3, e.z + Math.sin(a) * r, 0, 0.5 + Math.random() * 0.5, 0, e.color, 1.2, -0.2);
      }
    }
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      const l = this.life[i];
      if (l <= 0) continue;
      const nl = l - dt;
      if (nl <= 0) {
        this.life[i] = 0;
        this.pos[i * 3 + 1] = -1000;
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.life[i] = nl;
      alive++;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.min(1, nl / this.maxLife[i] * 1.6);
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.alive = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
