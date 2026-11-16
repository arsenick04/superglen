import * as THREE from 'three';
import { Quality } from './Quality';
import { perfMark, PerfMark } from './PerfMarks';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * L18 post-processing (desktop / high preset only; `?post=0` turns it off): ground-truth ambient occlusion (GTAO, half
 * resolution, denoised) for contact shadows between the flat-coloured models, a gentle bloom on the brightest highlights (sun
 * glints, lamps, the sky), then tone mapping (ACES) + sRGB in the output pass. 4x MSAA on the scene target. The draw-call counters
 * add up every pass of a frame (renderer.info is reset per frame, not per pass).
 */
export const PostConfig = {
  enabled: Quality.level === 'high' && new URLSearchParams(window.location.search).get('post') !== '0',
  aoScale: 0.5,
  aoRadius: 1.6,
  aoBlend: 1,
  bloomStrength: 0.12,
  bloomRadius: 0.45,
  bloomThreshold: 1.6,
};

/**
 * Adaptive resolution. Changing the pixel ratio reallocates the drawing buffer, which is a visible hitch on a
 * phone, so this is deliberately conservative:
 *
 *  - Frame time is smoothed (EMA). Under `lowFpsHigh`/`lowFpsLow` (60 / 30 fps presets: 50 / 27) for `downAfter`
 *    seconds drops one step.
 *  - Going back up needs `upAfterIdle` seconds of headroom while the player stands still, or `upAfterMoving`
 *    while walking, and never within `lockout` seconds of the last step down. A step-up that is
 *    followed by a step-down within `flapWindow` s doubles the lockout (up to `maxLockout`).
 *  - Hard cap: at most `maxChangesPerMinute` changes in any 60 s. Staying a bit low beats oscillating.
 */
export const AdaptiveConfig = {
  /** Pixel ratio multipliers on the preset ceiling min(devicePixelRatio, maxPixelRatio). */
  steps: [1, 0.85, 0.7, 0.6],
  /** Never render below this absolute pixel ratio. */
  minRatio: 1,
  /** Under these fps (for the 60 / 30 fps presets) counts as too slow. */
  lowFpsHigh: 40,
  lowFpsLow: 40,
  /** At or above this fraction of the target counts as headroom. */
  highFraction: 0.95,
  downAfter: 1.5,
  /** Seconds of headroom before a step up while standing still / while walking . */
  upAfterIdle: 3,
  upAfterMoving: 6,
  /** No step up this long (s) after the last step down; doubled after every flap. */
  lockout: 10,
  maxLockout: 120,
  flapWindow: 60,
  maxChangesPerMinute: 3,
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
  private lastObserved = -1;
  private lowTime = 0;
  private highTime = 0;
  private lockout: number = AdaptiveConfig.lockout;
  private sinceStepDown = 1e9;
  private sinceStepUp = 1e9;
  private readonly changeTimes: number[] = [];
  /** Pixel ratio currently used by the canvas. */
  pixelRatio = 1;
  /** How many times the pixel ratio changed because of the adaptive logic (diagnostics). */
  ratioChanges = 0;
  private appliedW = 0;
  private appliedH = 0;
  private appliedRatio = 0;
  private resizeTimer = 0;
  private readonly onResize = (): void => this.scheduleResize();
  private readonly onOrientation = (): void => {
    // iOS reports the new size a little after orientationchange fires: look again later (a no-op if unchanged).
    this.scheduleResize();
    window.setTimeout(this.onResize, 350);
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
    // Safari moves its bars and fires visualViewport events constantly: all of them end up in one debounced check.
    window.visualViewport?.addEventListener('resize', this.onResize);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** The camera whose aspect ratio should follow the canvas size. */
  attachCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.appliedW = 0; // force the aspect update
    this.resize();
  }

  /** Coalesce bursts of resize-like events into one check ~100 ms later (iOS reports the new size a bit late). */
  private scheduleResize(): void {
    if (this.resizeTimer) return;
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = 0;
      this.resize();
    }, 100);
  }

  /** Apply the window size and the current pixel ratio. Does nothing when neither changed. */
  resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.buildRatios();
    const ratio = this.ratios[Math.min(this.stepIndex, this.ratios.length - 1)];
    if (w === this.appliedW && h === this.appliedH && ratio === this.appliedRatio) return;
    if (this.appliedW !== 0 && (w !== this.appliedW || h !== this.appliedH)) perfMark(PerfMark.RESIZE);
    this.appliedW = w;
    this.appliedH = h;
    this.appliedRatio = ratio;
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    if (this.post) {
      const sz = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.post.composer.setSize(sz.x, sz.y);
      this.post.ao.setSize(Math.round(sz.x * PostConfig.aoScale), Math.round(sz.y * PostConfig.aoScale));
    }
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Render, then feed the adaptive logic. `now` = the frame timestamp (ms), `moving` = the player walks. */
  render(scene: THREE.Scene, camera: THREE.Camera, now: number, moving: boolean): void {
    this.renderFrame(scene, camera);
    this.observeFrame(now, moving);
  }

  private post: { composer: EffectComposer; render: RenderPass; ao: GTAOPass; bloom: UnrealBloomPass } | null = null;

  /** One frame: with the post chain on the high preset, else a plain render. */
  renderFrame(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    r.info.autoReset = false;
    r.info.reset();
    if (!PostConfig.enabled || !(camera instanceof THREE.PerspectiveCamera)) {
      r.render(scene, camera);
      return;
    }
    const p = (this.post ??= this.makePost(scene, camera));
    p.render.scene = scene;
    p.render.camera = camera;
    p.ao.scene = scene;
    p.ao.camera = camera;
    p.composer.render();
  }

  private makePost(scene: THREE.Scene, camera: THREE.PerspectiveCamera): NonNullable<Renderer['post']> {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Quality.antialias ? 4 : 0 });
    const composer = new EffectComposer(r, target);
    composer.setPixelRatio(1);
    composer.setSize(size.x, size.y);
    const render = new RenderPass(scene, camera);
    const ao = new GTAOPass(scene, camera, Math.round(size.x * PostConfig.aoScale), Math.round(size.y * PostConfig.aoScale));
    ao.updateGtaoMaterial({ radius: PostConfig.aoRadius, distanceExponent: 1, thickness: 1, scale: 1, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    ao.blendIntensity = PostConfig.aoBlend;
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), PostConfig.bloomStrength, PostConfig.bloomRadius, PostConfig.bloomThreshold);
    composer.addPass(render);
    composer.addPass(ao);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return { composer, render, ao, bloom };
  }

  /**
   * Compile every shader program of the scene (hidden objects included: the flashlight cone, the objective beam,
   * the sparkles ...) and draw one frame, so nothing is compiled or uploaded for the first time in the middle of
   * play. A first-use compile is a 50-200 ms freeze on a phone.
   */
  prewarm(scene: THREE.Scene, camera: THREE.Camera): void {
    try {
      // three's compile() skips hidden objects: show them for the compile only (cars that appear later, effects, ...).
      const hidden: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (!o.visible) hidden.push(o);
      });
      for (const o of hidden) o.visible = true;
      this.renderer.compile(scene, camera);
      for (const o of hidden) o.visible = false;
      this.renderFrame(scene, camera); // also builds the post chain (GTAO normal pass variants, bloom, output)
    } catch (err) {
      console.warn('prewarm failed:', err);
    }
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

  /** The adaptive logic for one finished frame (public so tests can drive it with a fake clock). */
  observeFrame(nowMs: number, moving: boolean): void {
    if (!this.adaptive) return;
    const last = this.lastObserved;
    this.lastObserved = nowMs;
    if (last < 0) return;
    const dt = (nowMs - last) / 1000;
    if (dt <= 0 || dt > 0.25) return; // tab switch or a one-off hitch: not a trend
    const A = AdaptiveConfig;
    this.emaDt += (dt - this.emaDt) * A.smoothing;
    this.sinceStepDown += dt;
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
      if (this.canChange(nowMs)) {
        if (this.sinceStepUp < A.flapWindow) this.lockout = Math.min(this.lockout * 2, A.maxLockout);
        this.sinceStepDown = 0;
        this.setStep(this.stepIndex + 1, nowMs);
      }
    } else if (
      this.stepIndex > 0 &&
      this.sinceStepDown >= this.lockout &&
      this.highTime >= (moving ? A.upAfterMoving : A.upAfterIdle)
    ) {
      if (this.canChange(nowMs)) {
        this.sinceStepUp = 0;
        this.setStep(this.stepIndex - 1, nowMs);
      }
    }
  }

  /** Hard cap: at most `maxChangesPerMinute` changes in any 60 s. */
  private canChange(nowMs: number): boolean {
    const ts = this.changeTimes;
    while (ts.length > 0 && nowMs - ts[0] > 60000) ts.shift();
    return ts.length < AdaptiveConfig.maxChangesPerMinute;
  }

  private setStep(i: number, nowMs: number): void {
    this.stepIndex = i;
    this.lowTime = 0;
    this.highTime = 0;
    this.emaDt = 1 / Quality.targetFps; // judge the new resolution on fresh numbers
    this.changeTimes.push(nowMs);
    this.ratioChanges++;
    perfMark(PerfMark.RATIO);
    this.resize();
  }

  /** Test helper: back to full resolution with fresh adaptive state and a zero change counter. */
  resetAdaptive(): void {
    this.stepIndex = 0;
    this.lastObserved = -1;
    this.lowTime = 0;
    this.highTime = 0;
    this.emaDt = 1 / Quality.targetFps;
    this.lockout = AdaptiveConfig.lockout;
    this.sinceStepDown = 1e9;
    this.sinceStepUp = 1e9;
    this.changeTimes.length = 0;
    this.ratioChanges = 0;
    this.resize();
  }

  /** Test helper: the current step index (0 = full resolution). */
  get step(): number {
    return this.stepIndex;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onOrientation);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
    this.renderer.dispose();
  }
}
