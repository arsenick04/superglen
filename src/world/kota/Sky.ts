import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/**
 * L18 sky and image-based light for the city: Poly Haven "Kloofendal 48d Partly Cloudy (Pure Sky)" (CC0, scripts/env-kenney.mjs).
 * The 1k HDR becomes a PMREM environment (soft sky light and reflections on every MeshStandardMaterial), the 4k WebP is the visible
 * sky. Downloaded at boot next to Rapier (`preloadSky`, about 1.6 MB) so the city is built and its shaders warmed up WITH the
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
  loading ??= new Promise<void>((resolve) => {
    const base = import.meta.env.BASE_URL;
    const timer = setTimeout(resolve, timeoutMs);
    Promise.all([new HDRLoader().loadAsync(`${base}env/sky/sky_1k.hdr`), new THREE.TextureLoader().loadAsync(`${base}env/sky/sky_4k.webp`)])
      .then(([h, bg]) => {
        h.mapping = THREE.EquirectangularReflectionMapping;
        hdr = h;
        bg.mapping = THREE.EquirectangularReflectionMapping;
        bg.colorSpace = THREE.SRGBColorSpace;
        bg.generateMipmaps = true;
        bg.minFilter = THREE.LinearMipmapLinearFilter;
        bg.anisotropy = 4;
        back = bg;
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
  return loading;
}

/** Called once by Game: the renderer that makes the PMREM. */
export function setSkyRenderer(r: THREE.WebGLRenderer): void {
  R = r;
}

/** Apply to a scene (synchronous: the pictures were preloaded at boot). `onApplied` lets the level tone its other lights down. */
export function applySky(scene: THREE.Scene, onApplied: () => void): void {
  if (!env && hdr && R) {
    const pm = new THREE.PMREMGenerator(R);
    env = pm.fromEquirectangular(hdr).texture;
    pm.dispose();
    hdr.dispose();
    hdr = null;
  }
  if (!env || !back) return;
  scene.environment = env;
  scene.environmentIntensity = 0.36;
  scene.background = back;
  scene.backgroundIntensity = 1.15;
  onApplied();
}
