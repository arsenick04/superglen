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
  // Stars: deterministic pseudo-random points, only above the horizon.
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < NIGHT.stars; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor((0.55 + rnd() * 0.45) * H);
    const b = NIGHT.starBrightness * (0.5 + rnd() * 0.5), big = rnd() < 0.08;
    for (let dy = 0; dy <= 0; dy++) for (let dx = 0; dx <= (big ? 1 : 0); dx++) {
      const o = (Math.min(H - 1, y + dy) * W + ((x + dx) % W)) * 4;
      put(data, o, [b, b, b * 0.95]);
    }
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
