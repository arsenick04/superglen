import * as THREE from 'three';
import { compatibilityMode } from './Platform';

export type QualityLevel = 'high' | 'low';

export interface QualityPreset {
  readonly level: QualityLevel;
  /** True when the primary input is touch (phones/tablets). */
  readonly isTouch: boolean;
  readonly maxPixelRatio: number;
  readonly antialias: boolean;
  readonly shadows: boolean;
  readonly shadowMapType: THREE.ShadowMapType;
  readonly shadowMapSize: number;
  /** Half-size (m) of the directional light's orthographic shadow frustum around the player. */
  readonly shadowArea: number;
  readonly cameraFar: number;
  /** Frame rate the adaptive resolution tries to hold. */
  readonly targetFps: number;
}

function detectTouch(): boolean {
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const fine =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
  // Coarse primary pointer, or a touch screen without any fine pointer (mouse/trackpad).
  return coarse || ((navigator.maxTouchPoints ?? 0) > 0 && !fine);
}

function pickPreset(): QualityPreset {
  const isTouch = detectTouch();
  // Manual override for testing: ?quality=low or ?quality=high
  const forced = new URLSearchParams(window.location.search).get('quality');
  if (compatibilityMode() && forced !== 'high') {
    return {
      level: 'low',
      isTouch,
      maxPixelRatio: 1,
      antialias: false,
      shadows: true,
      shadowMapType: THREE.BasicShadowMap,
      shadowMapSize: 1024,
      shadowArea: 18,
      cameraFar: 150,
      targetFps: 30,
    };
  }
  const level: QualityLevel = forced === 'low' || forced === 'high' ? forced : isTouch ? 'low' : 'high';

  if (level === 'high') {
    return {
      level,
      isTouch,
      maxPixelRatio: 2,
      antialias: true,
      shadows: true,
      shadowMapType: THREE.PCFShadowMap, // PCFSoftShadowMap was removed in three r18x; PCF is soft-filtered now
      shadowMapSize: 2048,
      shadowArea: 25,
      cameraFar: 300,
      targetFps: 60,
    };
  }
  return {
    level,
    isTouch,
    // Native-app target: phones (60 fps measured) render at the full device pixel ratio (up to 3) with MSAA; the adaptive scaler
    // in Renderer.ts only steps down when fps really drops.
    maxPixelRatio: 3,
    antialias: true,
    shadows: true,
    shadowMapType: THREE.PCFShadowMap,
    shadowMapSize: 2048,
    shadowArea: 18,
    cameraFar: 150,
    targetFps: 60,
  };
}

/** Picked once at startup; every module reads this object. */
export const Quality: QualityPreset = pickPreset();
