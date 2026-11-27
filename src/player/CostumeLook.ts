import * as THREE from 'three';

/**
 * Toko Mainan: colours for the Glen / Superglen models WITHOUT new textures. The models are one skinned mesh with one atlas
 * texture, so the recolour happens in the fragment shader: texels that are "costume coloured" (Superglen: the red cloth; Glen:
 * the orange shirt and shorts) get another hue; everything else (skin, hair, eyes, gold trim, blue accents) is untouched, and
 * a few rectangles of the atlas (the face islands) are protected. Mode 4 (`sg-holo`) turns the entire costume outside the
 * face islands into an animated iridescent cyan-violet hologram with scanlines and soft emissive glow.
 * One program per kind, the look is only a uniform, so changing clothes never recompiles a shader.
 */
export type LookKind = 'glen' | 'superglen';

/** x = mode (0 off, 1 flat hue, 2 Merah Putih: red above, white below, 3 stripes, 4 Hologram), y = hue 0..1, z = saturation scale, w = value scale. */
export interface LookParams {
  mode: number;
  hue: number;
  sat: number;
  val: number;
}

const OFF: LookParams = { mode: 0, hue: 0, sat: 1, val: 1 };

const LOOKS: Record<string, LookParams> = {
  'sg-red': OFF,
  'sg-blue': { mode: 1, hue: 0.6, sat: 1, val: 1 },
  'sg-green': { mode: 1, hue: 0.37, sat: 0.95, val: 0.9 },
  'sg-purple': { mode: 1, hue: 0.76, sat: 0.95, val: 1 },
  'sg-gold': { mode: 1, hue: 0.118, sat: 0.92, val: 1.12 },
  'sg-merahputih': { mode: 2, hue: 0, sat: 1, val: 1 },
  'sg-holo': { mode: 4, hue: 0.53, sat: 1, val: 1.18 },
  'glen-orange': OFF,
  'glen-blue': { mode: 1, hue: 0.6, sat: 0.95, val: 0.95 },
  'glen-green': { mode: 1, hue: 0.36, sat: 0.9, val: 0.85 },
  'glen-yellow': { mode: 1, hue: 0.135, sat: 1, val: 1.06 },
  'glen-red': { mode: 1, hue: 0.0, sat: 1, val: 0.9 },
  'glen-striped': { mode: 3, hue: 0.6, sat: 0.95, val: 0.95 },
};

/** Shared animation clock for hologram costumes (updated once per frame from Game.ts; zero per-frame allocations). */
const holoTime = { value: 0 };

export function tickCostumeLook(dt: number): void {
  holoTime.value = (holoTime.value + dt) % 1000;
}

export function setCostumeLookTime(t: number): void {
  holoTime.value = t;
}

export function lookParams(id: string): LookParams {
  return LOOKS[id] ?? OFF;
}

const GLSL_COMMON = /* glsl */ `
varying float vSgY;
uniform vec4 uSgLook;
uniform float uSgTime;
vec3 sgRgb2Hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 sgHsv2Rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
bool sgIn(vec2 uv, vec4 r) { return uv.x > r.x && uv.x < r.z && uv.y > r.y && uv.y < r.w; }
`;

/** Atlas rectangles (u0, v0, u1, v1; glTF uv, origin top-left) of the face islands that must keep their colours. */
const FACE_GLEN = ['vec4(0.12, 0.76, 0.40, 0.95)', 'vec4(0.04, 0.86, 0.13, 0.93)'];
const FACE_SUPER = ['vec4(0.435, 0.385, 0.555, 0.47)', 'vec4(0.47, 0.465, 0.55, 0.54)'];

function fragment(kind: LookKind): string {
  const faces = (kind === 'glen' ? FACE_GLEN : FACE_SUPER).map((r) => `sgIn(vMapUv, ${r})`).join(' || ');
  const mask =
    kind === 'glen'
      ? 'hsv.y > 0.7 && hsv.x > 0.035 && hsv.x < 0.115 && hsv.z > 0.35'
      : 'hsv.z > 0.12 && ((hsv.y > 0.5 && (hsv.x < 0.035 || hsv.x > 0.94)) || (hsv.y > 0.8 && hsv.x >= 0.035 && hsv.x < 0.052))';
  return /* glsl */ `
#include <map_fragment>
vec3 sgHoloGlow = vec3(0.0);
if (uSgLook.x > 0.5) {
  vec3 sgS = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.4545));
  vec3 sgH = sgRgb2Hsv(sgS);
  vec3 hsv = sgH;
  if (uSgLook.x > 3.5) {
    float holoPhase = 0.5 + 0.5 * sin(vSgY * 3.1 - uSgTime * 2.0);
    float holoH = mix(0.50, 0.88, holoPhase);
    float scan = 0.84 + 0.16 * sin(vSgY * 72.0 - uSgTime * 7.0);
    float band = smoothstep(0.78, 1.0, sin(vSgY * 8.0 - uSgTime * 3.2));
    if ((${mask}) && !(${faces})) {
      // Iridescent hologram suit: cyan -> electric blue -> violet -> magenta prism with animated scanlines & emissive glow.
      float lum = dot(sgS, vec3(0.299, 0.587, 0.114));
      float holoS = mix(0.86, 0.32, band);
      float holoV = clamp((0.46 + lum * 0.68) * scan + band * 0.24, 0.0, 1.0);
      vec3 holoSrgb = sgHsv2Rgb(vec3(holoH, holoS, holoV));
      vec3 holoLin = pow(holoSrgb, vec3(2.2));
      diffuseColor.rgb = holoLin;
      sgHoloGlow = holoLin * (0.42 + band * 0.58);
    } else if (!(${faces}) && hsv.x >= 0.085 && hsv.x <= 0.165 && hsv.y >= 0.16 && hsv.y <= 0.72 && hsv.z > 0.62) {
      // Subtle pearlescent silver-cyan shimmer on the Barongsai gold trim & cream fur (never touches peach skin or eyes).
      vec3 pearlSrgb = mix(sgS, sgHsv2Rgb(vec3(holoH, 0.28, min(1.0, hsv.z * 1.08))), 0.32 + band * 0.28);
      vec3 pearlLin = pow(pearlSrgb, vec3(2.2));
      diffuseColor.rgb = pearlLin;
      sgHoloGlow = pearlLin * (0.08 + band * 0.20);
    }
  } else if ((${mask}) && !(${faces})) {
    float h = uSgLook.y;
    float s = hsv.y * uSgLook.z;
    float v = hsv.z * uSgLook.w;
    if (uSgLook.x > 2.5) {
      if (fract(vSgY * 6.0) > 0.5) { s = 0.06; v = min(1.0, hsv.z * 1.1 + 0.1); }
    } else if (uSgLook.x > 1.5) {
      if (vSgY < 0.52) { s = 0.05; v = min(1.0, hsv.z * 1.15 + 0.18); }
      else { s = hsv.y; v = hsv.z; }
    }
    diffuseColor.rgb = pow(sgHsv2Rgb(vec3(h, clamp(s, 0.0, 1.0), clamp(v, 0.0, 1.0))), vec3(2.2));
  }
}
`;
}

/** What a rig keeps to change the look later. */
export interface LookHandle {
  set(id: string): void;
  readonly params: LookParams;
}

/** Patch an own (cloned) rig material so it can be recoloured. Safe on any MeshStandardMaterial with a map. */
export function patchLookMaterial(mat: THREE.MeshStandardMaterial, kind: LookKind): LookHandle {
  const uniform = { value: new THREE.Vector4(0, 0, 1, 1) };
  const handle: LookHandle = {
    params: { ...OFF },
    set(id: string): void {
      const p = lookParams(id);
      (handle as { params: LookParams }).params = p;
      uniform.value.set(p.mode, p.hue, p.sat, p.val);
    },
  };
  mat.onBeforeCompile = (shader): void => {
    shader.uniforms.uSgLook = uniform;
    shader.uniforms.uSgTime = holoTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSgY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSgY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}`)
      .replace('#include <map_fragment>', fragment(kind))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sgHoloGlow;');
  };
  mat.customProgramCacheKey = (): string => `sgLook-${kind}`;
  return handle;
}
