import * as THREE from 'three';
import { Quality } from '../../core/Quality';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/**
 * L18 sky and image-based light for the city: Poly Haven "Kloofendal 48d Partly Cloudy (Pure Sky)" (CC0, scripts/env-kenney.mjs).
 * The 1k HDR becomes a PMREM environment (soft sky light and reflections on every MeshStandardMaterial). A clean blue gradient
 * with sparse white clouds supplies the visible sky. Loaded at boot next to Rapier so the city is built and its shaders warmed up WITH the
 * environment (a late environment would recompile every material in the middle of play). If it fails the level keeps its flat sky
 * colour and hemisphere light. The sun in the picture stands at about (0.57, 0.73, 0.36): the city's sun comes from the same side.
 */
let hdr: THREE.DataTexture | null = null;
let env: THREE.Texture | null = null;
let back: THREE.Texture | null = null;
let loading: Promise<void> | null = null;
let R: THREE.WebGLRenderer | null = null;

/** Boot: download both pictures (no renderer needed yet). Resolves (never rejects) when done, failed or after `timeoutMs`. */
export function preloadSky(timeoutMs = 12000): Promise<void> {
  if (Quality.cheapMaterials) return Promise.resolve(); // TV ringan: no environment picture
  loading ??= new Promise<void>((resolve) => {
    const base = import.meta.env.BASE_URL;
    const timer = setTimeout(resolve, timeoutMs);
    new HDRLoader().loadAsync(`${base}env/sky/sky_1k.hdr`)
      .then((h) => {
        h.mapping = THREE.EquirectangularReflectionMapping;
        hdr = h;
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
  return loading;
}

/** A small procedural equirectangular background: saturated daytime blue, with calm white cloud clusters. */
function blueBackground(): THREE.Texture {
  if (back) return back;
  const w = 512, h = 256;
  const data = new Uint8Array(w * h * 4);
  const clouds = [[0.12, 0.70], [0.39, 0.78], [0.67, 0.72], [0.87, 0.82]];
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const elevation = Math.max(0, Math.sin((v - 0.5) * Math.PI));
    const t = Math.pow(elevation, 0.55);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      let cloud = 0;
      for (const [cu, cv] of clouds) {
        const du = Math.min(Math.abs(u - cu), 1 - Math.abs(u - cu));
        for (const [dx, dy, radius] of [[-0.025, 0, 0.025], [0, 0.012, 0.033], [0.035, -0.002, 0.028]]) {
          const q = ((du + dx) / radius) ** 2 + ((v - cv - dy) / (radius * 0.55)) ** 2;
          cloud = Math.max(cloud, 1 - THREE.MathUtils.smoothstep(q, 0.65, 1.5));
        }
      }
      const c = cloud * 0.9;
      const o = (y * w + x) * 4;
      data[o] = Math.round(255 * THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.68, 0.20, t), 1, c));
      data[o + 1] = Math.round(255 * THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.87, 0.57, t), 1, c));
      data[o + 2] = Math.round(255 * THREE.MathUtils.lerp(THREE.MathUtils.lerp(1, 0.95, t), 1, c));
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  back = tex;
  return tex;
}

/** Called once by Game: the renderer that makes the PMREM. */
export function setSkyRenderer(r: THREE.WebGLRenderer): void {
  R = r;
}

/** Apply to a scene (synchronous: the pictures were preloaded at boot). `onApplied` lets the level tone its other lights down. */
export function applySky(scene: THREE.Scene, onApplied: () => void): void {
  if (Quality.cheapMaterials) {
    scene.background = new THREE.Color(0x9fd8ff); // simple sky: a flat colour, no environment map (PMREM); the lights keep their full strength
    return;
  }
  scene.background = blueBackground();
  scene.backgroundIntensity = 1;
  if (!env && hdr && R) {
    const pm = new THREE.PMREMGenerator(R);
    env = pm.fromEquirectangular(hdr).texture;
    pm.dispose();
    hdr.dispose();
    hdr = null;
  }
  if (!env) return;
  scene.environment = env;
  scene.environmentIntensity = 0.36;
  onApplied();
}
