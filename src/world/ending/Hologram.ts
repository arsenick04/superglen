import * as THREE from 'three';

/**
 * Cyan hologram look for a frozen opponent: see-through, brighter at the silhouette, moving scanlines and a soft flicker.
 * One material is shared by every hologram; `tick(t)` once per frame moves the lines. Nothing here allocates per frame.
 */
export const Holo = {
  color: 0x39e6ff,
  /** Scanlines: lines per metre, scroll speed (m/s). */
  lines: 38,
  scroll: 0.35,
  /** Flicker: depth (0..1) and speed (Hz). */
  flicker: 0.12,
  flickerHz: 23,
  /** Slow bob (m, rad/s) and sway (rad). */
  bob: 0.07,
  bobSpeed: 1.2,
  sway: 0.18,
} as const;

export function makeHologramMaterial(): THREE.ShaderMaterial {
  const c = new THREE.Color(Holo.color);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
      uLines: { value: Holo.lines },
      uScroll: { value: Holo.scroll },
      uFlicker: { value: Holo.flicker },
      uFlickerHz: { value: Holo.flickerHz },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vView;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uLines; uniform float uScroll; uniform float uFlicker; uniform float uFlickerHz;
      varying vec3 vWorld; varying vec3 vNormalW; varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vView))), 2.0);
        float scan = 0.55 + 0.45 * smoothstep(0.2, 0.8, 0.5 + 0.5 * sin((vWorld.y - uTime * uScroll) * uLines * 6.2831853 * 0.25));
        float band = smoothstep(0.96, 1.0, sin(vWorld.y * 1.3 - uTime * 0.9)) * 0.5;
        float fl = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * uFlickerHz) * sin(uTime * 7.3));
        float a = (0.26 + 0.6 * rim + band) * scan * fl;
        vec3 col = uColor * (0.8 + 0.9 * rim) + vec3(0.25, 0.35, 0.4) * band;
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
}
