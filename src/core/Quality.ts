import * as THREE from 'three';
import { compatibilityMode } from './Platform';
import { tvMode } from './TvMode';
import {
  TIERS, TIER_ORDER, GovernorConfig, QualityGovernor, guessTier, hasStoredMode, readHints, readStoredMode, storeMode, urlMode,
  type QualityMode, type Tier, type TierSpec,
} from '../config/quality';

export type QualityLevel = 'high' | 'low';
export type { QualityMode, Tier };

/**
 * The live quality settings. Every module reads this one object (the fields change when the tier changes at runtime, so read
 * them where they are used and do not cache them, unless the thing can only be built once: then it is a creation-time choice).
 * Tiers and the automatic governor live in `config/quality.ts`; `Quality.onChange` tells modules that can follow a change.
 */
export interface QualityPreset extends TierSpec {
  /** Legacy two-level view: 'high' only for a high tier on a non-touch device (post chain, a few lighting choices). */
  level: QualityLevel;
  tier: Tier;
  /** The player's choice. In 'auto' the governor moves `tier`. */
  mode: QualityMode;
  /** True when the primary input is touch (phones/tablets). */
  readonly isTouch: boolean;
  shadowMapType: THREE.ShadowMapType;
  /** Frame rate the adaptive resolution tries to hold. */
  targetFps: number;
  /** Bumped on every tier change (cheap "did it change" check without a callback). */
  version: number;
}

function detectTouch(): boolean {
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const fine =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
  // Coarse primary pointer, or a touch screen without any fine pointer (mouse/trackpad).
  return coarse || ((navigator.maxTouchPoints ?? 0) > 0 && !fine);
}

const isTouch = detectTouch();
const compat = compatibilityMode();
const fromUrl = urlMode();
/** A URL override is for tests: fixed tier (or 'auto'), never stored. */
// TV: a TV browser is slow, so the 'TV ringan' tier is the default (unless the player chose a mode in Settings). The governor
// can also step a TV that is still under 20 fps at 'low' down to it (see observeQualityFrame).
const initialMode: QualityMode = fromUrl ?? (compat ? 'low' : tvMode.active && !hasStoredMode() ? 'tv' : readStoredMode());

function initialTier(mode: QualityMode): Tier {
  if (mode !== 'auto') return mode;
  const hints = readHints();
  hints.isTouch = isTouch;
  return guessTier(hints);
}

const startTier = initialTier(initialMode);

/** Picked at startup, adjusted at runtime; every module reads this object. */
export const Quality: QualityPreset = {
  ...TIERS[startTier],
  level: 'low',
  tier: startTier,
  mode: initialMode,
  isTouch,
  shadowMapType: compat ? THREE.BasicShadowMap : THREE.PCFShadowMap, // PCFSoftShadowMap was removed in three r18x; PCF is soft-filtered now
  targetFps: compat ? 30 : 60,
  version: 0,
};
if (compat) {
  Quality.maxPixelRatio = 1;
  Quality.antialias = false;
  Quality.shadowMapSize = 1024;
  Quality.shadowArea = 18;
}
applyTvCaps();
Quality.level = Quality.tier === 'high' && !isTouch ? 'high' : 'low';
syncDom();

/** TV browsers: pixel ratio 1, a 1024 shadow map, smaller crowd and traffic. (Re-applied after every tier change.) */
function applyTvCaps(): void {
  if (!tvMode.active) return;
  Quality.maxPixelRatio = Math.min(Quality.maxPixelRatio, 1);
  Quality.renderScale = Math.min(Quality.renderScale, Quality.tier === 'low' ? 0.8 : 1);
  Quality.shadowMapSize = Math.min(Quality.shadowMapSize, 1024);
  Quality.crowdSim = Math.min(Quality.crowdSim, 0.5);
  Quality.crowdRadius = Math.min(Quality.crowdRadius, 0.6);
}

const governor = new QualityGovernor();
const listeners: ((q: QualityPreset) => void)[] = [];

/** Subscribe to tier changes. Returns the unsubscribe function (call it from the level's dispose). */
export function onQualityChange(cb: (q: QualityPreset) => void): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function syncDom(): void {
  document.documentElement.classList.toggle('q-low', !Quality.vignette);
  document.documentElement.dataset.quality = Quality.tier;
}

function applyTier(tier: Tier): void {
  if (tier === Quality.tier) return;
  Object.assign(Quality, TIERS[tier]);
  Quality.tier = tier;
  applyTvCaps();
  Quality.level = tier === 'high' && !isTouch ? 'high' : 'low';
  Quality.version++;
  syncDom();
  for (const cb of listeners.slice()) {
    try {
      cb(Quality);
    } catch (err) {
      console.warn('quality listener failed:', err);
    }
  }
}

/** Settings menu / tests: choose Otomatis or a fixed tier. Stored (unless the URL fixes it). */
export function setQualityMode(mode: QualityMode): void {
  Quality.mode = mode;
  if (!fromUrl) storeMode(mode);
  governor.reset();
  if (mode === 'auto') return; // the governor takes over from the current tier
  applyTier(mode);
}

/** True while the governor may move the tier (Otomatis). */
export function qualityIsAuto(): boolean {
  return Quality.mode === 'auto';
}

/** Feed one frame's dt (s). Cheap; steps the tier when the frame rate asks for it. */
export function observeQualityFrame(dt: number): void {
  if (Quality.mode !== 'auto') return;
  const next = governor.observe(dt, Quality.tier);
  if (next) applyTier(next);
  else if (tvMode.active && Quality.tier === 'low' && governor.verySlow >= GovernorConfig.tvWindows) {
    governor.reset();
    applyTier('tv');
  }
}

/** Debug / smoke test hook (window.__superglen.quality). Getters only: nothing is computed per frame. */
export function qualityDebugHandle(): { tier: Tier; mode: QualityMode; version: number; fps: number; set: (m: QualityMode) => void; order: readonly Tier[] } {
  return {
    get tier() { return Quality.tier; },
    get mode() { return Quality.mode; },
    get version() { return Quality.version; },
    get fps() { return governor.lastFps; },
    set: setQualityMode,
    order: TIER_ORDER,
  };
}
