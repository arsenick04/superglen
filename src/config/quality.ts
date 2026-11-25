/**
 * Automatic quality tiers (high / medium / low). Pure data and logic, no three.js: `core/Quality.ts` applies it.
 *
 *  - `detectTier()` makes the first guess from device hints (cores, memory, GPU string, screen, touch, platform).
 *  - `QualityGovernor` watches the frame rate and steps the tier down (< ~45 fps sustained) or, carefully, up
 *    (> 58 fps for a long time). Hysteresis: windows of a few seconds, a cool-down after every change, and a tier that
 *    failed is only retried once, much later. So it never oscillates.
 *  - The player's choice (Otomatis / Tinggi / Sedang / Rendah) is stored in localStorage; `?quality=low|medium|high|auto`
 *    overrides it for tests (not stored).
 */
export type Tier = 'high' | 'medium' | 'low';
export type QualityMode = 'auto' | Tier;
export const TIER_ORDER: readonly Tier[] = ['high', 'medium', 'low'];

export interface TierSpec {
  /** Upper bound of the renderer pixel ratio (min(devicePixelRatio, this)). */
  maxPixelRatio: number;
  /** Antialias is a context-creation flag: only the first guess matters. */
  antialias: boolean;
  shadowMapSize: number;
  /** Half-size (m) of the sun's shadow frustum = shadow distance. */
  shadowArea: number;
  /** Small props (street dressing, parked models, trees) cast shadows. */
  propShadows: boolean;
  cameraFar: number;
  /** Multiplier on the chunk streaming radii (city detail draw distance). */
  chunkScale: number;
  /** Multiplier on the nature draw radius and on its instance cap (density). */
  natureRadius: number;
  natureDensity: number;
  /** Multiplier on the radius where traffic / walkers are drawn and on how many are simulated. */
  crowdRadius: number;
  crowdSim: number;
  /** Fraction of particles actually emitted (BattleFx), and "phone mode" of fire (fewer smoke / ember sprites). */
  particleKeep: number;
  fireLite: boolean;
  /** Bloom / ambient occlusion post chain (desktop-class only; the city never uses it). */
  post: boolean;
  /** Soft screen vignette overlay. */
  vignette: boolean;
}

export const TIERS: Record<Tier, TierSpec> = {
  high: {
    maxPixelRatio: 2, antialias: true, shadowMapSize: 2048, shadowArea: 25, propShadows: true, cameraFar: 300,
    chunkScale: 1, natureRadius: 1, natureDensity: 1, crowdRadius: 1, crowdSim: 1, particleKeep: 1, fireLite: false, post: true, vignette: true,
  },
  medium: {
    maxPixelRatio: 1.5, antialias: true, shadowMapSize: 1536, shadowArea: 20, propShadows: true, cameraFar: 220,
    chunkScale: 0.88, natureRadius: 0.8, natureDensity: 0.7, crowdRadius: 0.8, crowdSim: 0.7, particleKeep: 0.7, fireLite: true, post: false, vignette: true,
  },
  low: {
    maxPixelRatio: 1.25, antialias: false, shadowMapSize: 1024, shadowArea: 15, propShadows: false, cameraFar: 150,
    chunkScale: 0.76, natureRadius: 0.6, natureDensity: 0.45, crowdRadius: 0.6, crowdSim: 0.5, particleKeep: 0.45, fireLite: true, post: false, vignette: false,
  },
};

const STORE_KEY = 'superglen.quality.v1';

export function isMode(v: unknown): v is QualityMode {
  return v === 'auto' || v === 'high' || v === 'medium' || v === 'low';
}

export function readStoredMode(): QualityMode {
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    return isMode(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** True when the player (or Settings) already chose a quality mode on this device. */
export function hasStoredMode(): boolean {
  try {
    return isMode(window.localStorage.getItem(STORE_KEY));
  } catch {
    return false;
  }
}

export function storeMode(mode: QualityMode): void {
  try {
    window.localStorage.setItem(STORE_KEY, mode);
  } catch {
    // Safari private mode / blocked storage: the choice just lasts for this session.
  }
}

/** URL override for tests: `?quality=low|medium|high` (fixed tier) or `auto`. Null = no override. */
export function urlMode(): QualityMode | null {
  const v = new URLSearchParams(window.location.search).get('quality');
  return isMode(v) ? v : null;
}

export interface DeviceHints {
  cores: number;
  memoryGb: number;
  gpu: string;
  isTouch: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isTvBox: boolean;
  dpr: number;
  screenW: number;
  screenH: number;
}

const GPU_LOW = /SwiftShader|llvmpipe|Software|Mali-4|Mali-T|Mali-G(31|51|52)\b|Adreno[^0-9]*(2|3|4|50|51|52|53)\d\b|PowerVR|VideoCore|Vivante|GMA|Intel.*HD Graphics [2-5]\d{2}\b/i;
const GPU_HIGH = /RTX|GTX|Radeon (RX|Pro|\d{4})|Apple M\d|Apple GPU|Adreno[^0-9]*(6[5-9]|7|8)\d\d|Mali-G(7\d|9\d)|Intel.*(Iris Xe|Arc)/i;

function gpuString(): string {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return s;
  } catch {
    return '';
  }
}

export function readHints(): DeviceHints {
  const ua = navigator.userAgent;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  const isAndroid = /Android/i.test(ua);
  const dpr = window.devicePixelRatio || 1;
  return {
    cores: navigator.hardwareConcurrency || 0,
    memoryGb: nav.deviceMemory ?? 0,
    gpu: gpuString(),
    isTouch: false, // filled by the caller (Quality.ts owns touch detection)
    isIOS,
    isAndroid,
    isTvBox: /Android.*(TV|AFT|BRAVIA|MiBox|SHIELD)|SmartTV|GoogleTV|Tizen|Web0S|VIDAA|Hisense|HbbTV/i.test(ua),
    dpr,
    screenW: window.screen?.width || window.innerWidth,
    screenH: window.screen?.height || window.innerHeight,
  };
}

/** First guess of the tier. Cheap devices are recognised early; unknown devices get a middle-of-the-road answer. */
export function guessTier(h: DeviceHints): Tier {
  let score = 2; // 2 = high, 1 = medium, 0 = low
  const cores = h.cores;
  const mem = h.memoryGb;
  const mobile = h.isTouch || h.isIOS || h.isAndroid;
  if (GPU_LOW.test(h.gpu)) score = 0;
  else if (h.isTvBox) score = 0;
  else if ((mem > 0 && mem <= 2) || (cores > 0 && cores <= 2)) score = 0;
  else {
    if (mem > 0 && mem <= 4) score = Math.min(score, 1);
    if (cores > 0 && cores <= 4 && !h.isIOS) score = Math.min(score, 1);
    if (h.isIOS && cores > 0 && cores <= 4) score = Math.min(score, 1);
    if (h.isAndroid && !GPU_HIGH.test(h.gpu)) score = Math.min(score, 1); // Android GPUs vary a lot: prove it first
    if (!mobile && !GPU_HIGH.test(h.gpu) && /Intel/i.test(h.gpu) && !/Iris Xe|Arc/i.test(h.gpu)) score = Math.min(score, 1);
    // A huge canvas on a device that is not known to be strong: one step down.
    if (!GPU_HIGH.test(h.gpu) && h.screenW * h.screenH * h.dpr * h.dpr > 5_000_000 && mobile) score = Math.max(0, score - 1);
  }
  return TIER_ORDER[2 - score];
}

export const GovernorConfig = {
  /** Length of one measuring window (s). */
  window: 3,
  /** A window below this average fps is "slow"; this many slow windows in a row step the tier down. */
  slowFps: 45,
  slowWindows: 2,
  /** A window above this is "fast"; this many in a row (and a long quiet time) step up. */
  fastFps: 58,
  fastWindows: 10,
  /** Seconds after any change before another step down / up is allowed. */
  downCooldown: 12,
  upCooldown: 60,
  /** A tier that failed once is retried only after this many seconds; a second failure bans it for the session. */
  retryAfter: 180,
  /** Windows with fewer frames than this (tab switch, loading) are ignored. */
  minFrames: 40,
  /** Single frames longer than this (s) are hitches, not a trend. */
  maxDt: 0.25,
} as const;

/** Frame-rate governor: feed it every frame's dt; it returns the tier to switch to (or null). No allocation per frame. */
export class QualityGovernor {
  private time = 0;
  private frames = 0;
  private slow = 0;
  private fast = 0;
  private sinceChange = 1e9;
  private readonly fails: Record<Tier, number> = { high: 0, medium: 0, low: 0 };
  private readonly failedAt: Record<Tier, number> = { high: -1e9, medium: -1e9, low: -1e9 };
  private clock = 0;
  /** Last window's average fps (diagnostics). */
  lastFps = 0;

  /** Forget the window (after a level load / a manual change). */
  reset(): void {
    this.time = 0;
    this.frames = 0;
    this.slow = 0;
    this.fast = 0;
  }

  observe(dt: number, current: Tier): Tier | null {
    const C = GovernorConfig;
    if (dt <= 0 || dt > C.maxDt) return null;
    this.clock += dt;
    this.sinceChange += dt;
    this.time += dt;
    this.frames++;
    if (this.time < C.window) return null;
    const fps = this.frames / this.time;
    const enough = this.frames >= C.minFrames;
    this.time = 0;
    this.frames = 0;
    if (!enough) return null;
    this.lastFps = fps;
    const i = TIER_ORDER.indexOf(current);
    if (fps < C.slowFps) {
      this.fast = 0;
      this.slow++;
      if (this.slow >= C.slowWindows && i < TIER_ORDER.length - 1 && this.sinceChange >= C.downCooldown) return this.change(current, TIER_ORDER[i + 1], true);
    } else if (fps > C.fastFps) {
      this.slow = 0;
      this.fast++;
      if (this.fast >= C.fastWindows && i > 0 && this.sinceChange >= C.upCooldown) {
        const up = TIER_ORDER[i - 1];
        const f = this.fails[up];
        if (f === 0 || (f === 1 && this.clock - this.failedAt[up] >= C.retryAfter)) return this.change(current, up, false);
        this.fast = 0;
      }
    } else {
      this.slow = 0;
      this.fast = 0;
    }
    return null;
  }

  private change(from: Tier, to: Tier, down: boolean): Tier {
    if (down) {
      this.fails[from]++;
      this.failedAt[from] = this.clock;
    }
    this.sinceChange = 0;
    this.reset();
    return to;
  }
}
