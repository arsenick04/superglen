import * as THREE from 'three';
import { NIGHT, SUNSET } from '../../config/sky';

/** Procedural equirect backgrounds for night (moon, stars) and sunset (west glow, low sun). One-off, small, no per-frame cost. */

type V3 = readonly number[];
const W = 1024, H = 512;

/** Direction vector to equirect (u, v) as three.js maps it: u = atan2(z, x)/2pi + 0.5, v = asin(y)/pi + 0.5. */
function uv(d: V3): [number, number] {
  const l = Math.hypot(d[0], d[1], d[2]);
  return [Math.atan2(d[2], d[0]) / (2 * Math.PI) + 0.5, Math.asin(d[1] / l) / Math.PI + 0.5];
}

function make(data: Uint8Array): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, W, H);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const mix = (a: V3, b: V3, t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const put = (data: Uint8Array, o: number, c: V3) => {
  data[o] = Math.round(255 * Math.min(1, c[0]));
  data[o + 1] = Math.round(255 * Math.min(1, c[1]));
  data[o + 2] = Math.round(255 * Math.min(1, c[2]));
  data[o + 3] = 255;
};
const du = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

export function nightBackground(): THREE.DataTexture {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const t = Math.pow(Math.max(0, Math.sin((v - 0.5) * Math.PI)), 0.6);
    const c = mix(NIGHT.skyHorizon, NIGHT.skyTop, t);
    for (let x = 0; x < W; x++) put(data, (y * W + x) * 4, c);
  }
  // Moon: bright disc with a soft halo.
  const [mu, mv] = uv(NIGHT.sunOffset);
  const mc = new THREE.Color(NIGHT.moonColor);
  const r = NIGHT.moonRadius;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = du((x + 0.5) / W, mu) * 2 * Math.cos((mv - 0.5) * Math.PI), dy = ((y + 0.5) / H - mv); // u spans 2pi, v spans pi
    const d = Math.hypot(dx, dy) / r;
    if (d > 4) continue;
    const o = (y * W + x) * 4;
    const halo = Math.max(0, 1 - d / 4) ** 2 * 0.35;
    const disc = 1 - THREE.MathUtils.smoothstep(d, 0.85, 1.0);
    const k = Math.max(halo, disc);
    data[o] = Math.round(data[o] + (mc.r * 255 - data[o]) * k);
    data[o + 1] = Math.round(data[o + 1] + (mc.g * 255 - data[o + 1]) * k);
    data[o + 2] = Math.round(data[o + 2] + (mc.b * 255 - data[o + 2]) * k);
  }
  return make(data);
}

export function sunsetBackground(): THREE.DataTexture {
  const data = new Uint8Array(W * H * 4);
  const [su, sv] = uv(SUNSET.sunOffset);
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const elev = Math.max(0, Math.sin((v - 0.5) * Math.PI)); // 0 at horizon, 1 zenith
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const west = Math.max(0, 1 - du(u, su) / SUNSET.bandWidth); // 1 toward the sun azimuth
      const base = mix(SUNSET.skyEast, SUNSET.skyTop, Math.pow(elev, 0.5));
      // Warm band hugging the horizon, strongest in the west; pink fringe higher up.
      const low = Math.exp(-elev * 5.5) * west ** 0.8;
      const high = Math.exp(-elev * 2.2) * west ** 1.5;
      let c = mix(base, SUNSET.bandOuter, Math.min(1, high * 0.8));
      c = mix(c, SUNSET.bandInner, Math.min(1, low * 1.1));
      // Below the horizon keep the horizon colour (hidden by the ground anyway).
      const dxs = du(u, su) * 2, dys = v - sv, d = Math.hypot(dxs, dys) / SUNSET.sunRadius;
      if (d < 5) {
        c = mix(c, SUNSET.sunColor, Math.max(Math.max(0, 1 - d / 5) ** 2 * 0.5, 1 - THREE.MathUtils.smoothstep(d, 0.85, 1.0)));
      }
      put(data, (y * W + x) * 4, c);
    }
  }
  return make(data);
}

/** Crisp night stars as GL points (constant pixel size, centred on the player, hidden behind buildings). Twinkle = one opacity write per frame. */
export class StarField {
  readonly group = new THREE.Group();
  private readonly small: THREE.PointsMaterial;
  private readonly bright: THREE.PointsMaterial;
  private readonly cross: THREE.CanvasTexture;
  private t = 0;

  constructor() {
    let s = 987654;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const make = (n: number, minEl: number) => {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        // Fewer near the horizon: elevation sine biased toward the zenith.
        const el = Math.asin(minEl + (1 - minEl) * Math.sqrt(rnd())), az = rnd() * Math.PI * 2;
        pos[i * 3] = Math.cos(el) * Math.cos(az) * NIGHT.starRadius;
        pos[i * 3 + 1] = Math.sin(el) * NIGHT.starRadius;
        pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * NIGHT.starRadius;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return g;
    };
    const base = { sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, color: 0xffffff } as const;
    this.small = new THREE.PointsMaterial({ ...base, size: NIGHT.starSize });
    // Tiny sparkle cross for the bright ones.
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g2 = c.getContext('2d');
    if (g2) {
      g2.fillStyle = '#fff';
      g2.fillRect(15, 4, 2, 24);
      g2.fillRect(4, 15, 24, 2);
      g2.fillRect(13, 13, 6, 6);
    }
    this.cross = new THREE.CanvasTexture(c);
    this.bright = new THREE.PointsMaterial({ ...base, size: NIGHT.starBrightSize, map: this.cross });
    const sp = new THREE.Points(make(NIGHT.stars, 0.08), this.small);
    const bp = new THREE.Points(make(NIGHT.brightStars, 0.25), this.bright);
    for (const o of [sp, bp]) { o.frustumCulled = false; o.renderOrder = -1; this.group.add(o); }
  }

  update(dt: number, x: number, z: number): void {
    this.group.position.set(x, 0, z);
    this.t += dt;
    this.bright.opacity = 0.75 + 0.25 * Math.sin(this.t * 2.3);
    this.small.opacity = 0.85 + 0.15 * Math.sin(this.t * 1.1 + 1.3);
  }

  dispose(): void {
    for (const o of this.group.children) (o as THREE.Points).geometry.dispose();
    this.small.dispose(); this.bright.dispose(); this.cross.dispose();
  }
}
