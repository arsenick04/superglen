import * as THREE from 'three';
import { Quality } from './Quality';

/**
 * Adaptive resolution. Frame time is smoothed (EMA); if fps stays under `lowFraction` of the preset's
 * target (30 -> 27, 60 -> 50) for `downAfter` s the pixel ratio drops one step, and it rises one step
 * after `upAfter` s with fps at/above `highFraction` of target. A step-up that is followed by a step-down
 * within `flapWindow` s doubles the next wait (up to `maxUpAfter`), so it cannot oscillate.
 */
export const AdaptiveConfig = {
  /** Pixel ratio multipliers on the preset ceiling min(devicePixelRatio, maxPixelRatio). */
  steps: [1, 0.85, 0.7, 0.6],
  /** Never render below this absolute pixel ratio. */
  minRatio: 0.75,
  /** Under these fps (for the 60 / 30 fps presets) counts as too slow. */
  lowFpsHigh: 50,
  lowFpsLow: 27,
  /** At or above this fraction of the target counts as headroom. */
  highFraction: 0.95,
  downAfter: 2,
  upAfter: 5,
  maxUpAfter: 40,
  flapWindow: 12,
  /** EMA weight of the newest frame. */
  smoothing: 0.08,
} as const;

/** Owns the WebGLRenderer and keeps it (and the camera aspect) in sync with the window size. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera | null = null;

  // Adaptive resolution state.
  private readonly adaptive = new URLSearchParams(window.location.search).get('adaptive') !== '0';
  private stepIndex = 0;
  private ratios: number[] = [1];
  private emaDt = 1 / Quality.targetFps;
  private lastRender = 0;
  private lowTime = 0;
  private highTime = 0;
  private upAfter: number = AdaptiveConfig.upAfter;
  private sinceStepUp = 1e9;
  /** Pixel ratio currently used by the canvas. */
  pixelRatio = 1;
  private readonly onResize = (): void => this.resize();
  private readonly onOrientation = (): void => {
    // iOS reports the new size a little after orientationchange fires.
    this.resize();
    window.setTimeout(this.onResize, 250);
  };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: Quality.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = Quality.shadows;
    this.renderer.shadowMap.type = Quality.shadowMapType;
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onOrientation);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** The camera whose aspect ratio should follow the canvas size. */
  attachCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.resize();
  }

  resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.buildRatios();
    this.pixelRatio = this.ratios[Math.min(this.stepIndex, this.ratios.length - 1)];
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
    if (this.adaptive) this.adapt();
  }

  /** Unique pixel ratios from the ceiling down to the floor. */
  private buildRatios(): void {
    const ceiling = Math.min(window.devicePixelRatio || 1, Quality.maxPixelRatio);
    this.ratios.length = 0;
    for (const m of AdaptiveConfig.steps) {
      const r = Math.max(AdaptiveConfig.minRatio, Math.round(ceiling * m * 100) / 100);
      if (this.ratios.length === 0 || r < this.ratios[this.ratios.length - 1] - 0.01) this.ratios.push(r);
    }
    if (this.ratios[0] > ceiling) this.ratios[0] = ceiling; // tiny ceilings (< floor) stay as they are
  }

  private adapt(): void {
    const now = performance.now();
    const dt = (now - this.lastRender) / 1000;
    this.lastRender = now;
    if (dt <= 0 || dt > 0.25) return; // first frame, tab switch or a one-off hitch: not a trend
    const A = AdaptiveConfig;
    this.emaDt += (dt - this.emaDt) * A.smoothing;
    this.sinceStepUp += dt;
    const fps = 1 / this.emaDt;
    const target = Quality.targetFps;
    if (fps < (target >= 60 ? A.lowFpsHigh : A.lowFpsLow)) {
      this.lowTime += dt;
      this.highTime = 0;
    } else if (fps >= target * A.highFraction) {
      this.highTime += dt;
      this.lowTime = 0;
    } else {
      this.lowTime = 0;
      this.highTime = 0;
    }
    if (this.lowTime >= A.downAfter && this.stepIndex < this.ratios.length - 1) {
      if (this.sinceStepUp < A.flapWindow) this.upAfter = Math.min(this.upAfter * 2, A.maxUpAfter);
      this.setStep(this.stepIndex + 1);
    } else if (this.highTime >= this.upAfter && this.stepIndex > 0) {
      this.sinceStepUp = 0;
      this.setStep(this.stepIndex - 1);
    }
  }

  private setStep(i: number): void {
    this.stepIndex = i;
    this.lowTime = 0;
    this.highTime = 0;
    this.emaDt = 1 / Quality.targetFps; // judge the new resolution on fresh numbers
    this.resize();
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onOrientation);
    this.renderer.dispose();
  }
}
