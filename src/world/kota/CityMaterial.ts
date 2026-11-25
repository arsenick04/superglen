import * as THREE from 'three';
import { ATLAS_PX, ATLAS_TILES } from './CityAtlas';
import { Quality } from '../../core/Quality';

/**
 * The lit material of the city: MeshStandardMaterial with vertex colours, multiplied by one shared texture atlas
 * (public/textures/city-atlas.webp, made by scripts/make-city-atlas.mjs). One material = no extra draw calls: every part picks
 * its tile with the `aTile` vertex attribute and its coordinates with `aUv` (see CityMesher.ts). Tile 0 is plain white (no texture).
 *
 * Tiles are sampled with textureLod and a manual level of detail clamped to 2 (every tile has a 4 px gutter, so bilinear and two
 * mip levels never bleed into the neighbour); wrapping tiles fade to their mean colour beyond that (no shimmer far away, and the
 * far skyline stays calm). Decals never fade. Until the image arrives (or if it fails) the placeholder is white: plain colours.
 */
export interface CityMaterial {
  material: THREE.MeshStandardMaterial;
  /** Bytes of the atlas file once loaded (report). */
  readonly loaded: boolean;
}

const LOD_MAX = 2;

let shared: THREE.Texture | null = null;
let loading = false;
const uniforms = {
  uAtlas: { value: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) as THREE.Texture },
  uRect: { value: ATLAS_TILES.map((t) => new THREE.Vector4(t.rect[0], t.rect[1], t.rect[2], t.rect[3])) },
  uAvg: { value: ATLAS_TILES.map((t) => new THREE.Vector3(t.avg[0], t.avg[1], t.avg[2])) },
  uWrap: { value: ATLAS_TILES.map((t) => t.wrap) },
};
(uniforms.uAtlas.value as THREE.DataTexture).needsUpdate = true;

function loadAtlas(): void {
  if (shared || loading) return;
  loading = true;
  new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}textures/city-atlas.webp`,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      shared = tex;
      uniforms.uAtlas.value = tex;
    },
    undefined,
    () => {
      loading = false; // stays plain white
    },
  );
}

const NT = ATLAS_TILES.length;

/**
 * `offset`: depth bias [factor, units] for layers that lie ON other surfaces (the chunk "deco" layer: door / window decals, awning trims,
 * crate straps ...). Negative = nearer. It is the safety net behind the real 2-3 cm separations of CityBuilder: slope-scaled, so it
 * also holds at grazing angles, and in depth-buffer units, so it grows with the distance like the depth resolution does.
 */
export function makeCityMaterial(offset?: readonly [number, number]): THREE.MeshStandardMaterial {
  loadAtlas();
  // 'TV ringan': Lambert (no PBR) with the same atlas injection (the shader chunks used below exist in both materials).
  const m = (Quality.cheapMaterials
    ? new THREE.MeshLambertMaterial({ vertexColors: true })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.65 })) as THREE.MeshStandardMaterial;
  if (offset) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = offset[0];
    m.polygonOffsetUnits = offset[1];
  }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlas = uniforms.uAtlas;
    shader.uniforms.uRect = uniforms.uRect;
    shader.uniforms.uAvg = uniforms.uAvg;
    shader.uniforms.uWrap = uniforms.uWrap;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUv;\nattribute float aTile;\nvarying vec2 vTuv;\nflat varying float vTile;\nvarying vec2 vAo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTuv = aUv;\nvTile = aTile;\nvAo = vec2((modelMatrix * vec4(transformed, 1.0)).y, abs(normal.y));');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uAtlas;
uniform vec4 uRect[${NT}];
uniform vec3 uAvg[${NT}];
uniform float uWrap[${NT}];
varying vec2 vTuv;
flat varying float vTile;
varying vec2 vAo;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  int ti = int(vTile + 0.5);
  vec4 cr = uRect[ti];
  float wr = uWrap[ti];
  vec2 uvt = wr > 0.5 ? fract(vTuv) : clamp(vTuv, 0.0, 1.0);
  vec2 d1 = dFdx(vTuv) * cr.zw * ${ATLAS_PX.toFixed(1)};
  vec2 d2 = dFdy(vTuv) * cr.zw * ${ATLAS_PX.toFixed(1)};
  float lod = 0.5 * log2(max(max(dot(d1, d1), dot(d2, d2)), 1e-8));
  // uAtlas uses an sRGB GPU format: sampling already decodes to the same linear space as vertex colours and uAvg.
  vec3 tx = textureLod(uAtlas, cr.xy + uvt * cr.zw, clamp(lod, 0.0, ${LOD_MAX.toFixed(1)})).rgb;
  tx = mix(tx, uAvg[ti], wr * smoothstep(2.0, 4.2, lod));
  diffuseColor.rgb *= tx;
  // Contact shadow: walls, trunks and poles darken softly in the last metre
  // above the street. Upward faces retain a little more sky light, which
  // separates roofs/foliage from vertical facades without another render pass.
  diffuseColor.rgb *= mix(0.93, 1.015, smoothstep(0.35, 0.8, vAo.y));
  diffuseColor.rgb *= mix(1.0, mix(0.79, 1.0, smoothstep(0.0, 1.45, vAo.x)), 1.0 - smoothstep(0.4, 0.7, vAo.y));
}`,
      );
  };
  m.customProgramCacheKey = () => (Quality.cheapMaterials ? 'city-atlas-v3-depth-lambert' : 'city-atlas-v3-depth');
  return m;
}
