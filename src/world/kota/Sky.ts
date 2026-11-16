import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/**
 * L18 sky and image-based light for the city: Poly Haven "Kloofendal 48d Partly Cloudy (Pure Sky)" (CC0, scripts/env-kenney.mjs).
 * The 1k HDR becomes a PMREM environment (soft sky light and reflections on every MeshStandardMaterial), the 4k WebP is the visible
 * sky. Loaded once per session and kept (about 1.6 MB); until it arrives the level keeps its flat sky colour and hemisphere light.
 * The sun in the picture stands at about (0.57, 0.73, 0.36): the city's directional light comes from the same side.
 */
let env: THREE.Texture | null = null;
let back: THREE.Texture | null = null;
let loading: Promise<void> | null = null;
let R: THREE.WebGLRenderer | null = null;

/** Called once by Game: the renderer that makes the PMREM. Starts the download right away. */
export function setSkyRenderer(r: THREE.WebGLRenderer): void {
  R = r;
  void loadSky(r);
}

export function loadSky(renderer: THREE.WebGLRenderer): Promise<void> {
  loading ??= (async () => {
    const base = import.meta.env.BASE_URL;
    try {
      const [hdr, bg] = await Promise.all([new HDRLoader().loadAsync(`${base}env/sky/sky_1k.hdr`), new THREE.TextureLoader().loadAsync(`${base}env/sky/sky_4k.webp`)]);
      const pm = new THREE.PMREMGenerator(renderer);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      env = pm.fromEquirectangular(hdr).texture;
      pm.dispose();
      hdr.dispose();
      bg.mapping = THREE.EquirectangularReflectionMapping;
      bg.colorSpace = THREE.SRGBColorSpace;
      bg.generateMipmaps = true;
      bg.minFilter = THREE.LinearMipmapLinearFilter;
      bg.anisotropy = 4;
      back = bg;
    } catch {
      /* flat sky stays */
    }
  })();
  return loading;
}

/** Apply to a scene when loaded (now or later). `onApplied` lets the level tone its other lights down. */
export function applySky(scene: THREE.Scene, alive: () => boolean, onApplied: () => void): void {
  const go = (): void => {
    if (!env || !back || !alive()) return;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    scene.background = back;
    scene.backgroundIntensity = 1.05;
    scene.backgroundRotation.set(0, 0, 0);
    scene.environmentRotation.set(0, 0, 0);
    onApplied();
  };
  if (env) go();
  else if (R) void loadSky(R).then(go);
}
