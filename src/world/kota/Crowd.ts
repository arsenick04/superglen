import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Animated people for the city (Quaternius "Animated Men / Women Characters", CC0; scripts/build-residents.mjs builds
 * public/models/residents/residents.glb). Pedestrians, children and the named residents all use this renderer.
 *
 * Why not one AnimationMixer per person: a phone cannot run 100+ mixers and skeleton updates every frame. Instead the clips (idle,
 * walk, run, wave) are baked ONCE at load time into a float "bone matrix texture" (one row per frame, three texels per bone), and
 * the vertex shader skins every instance by looking up the row it is in. Per frame the CPU only writes the row number of each
 * visible person (plus a second row for a short cross-fade): no mixers, no bone updates, no per-frame allocation. One draw call
 * per body variant (8), one shared material per gender.
 *
 * Instances are packed every frame (`begin()`, `add()` ..., `end()`), so several owners (CityLife, CityPeople, CityCare) can share
 * one `Crowd` as long as they all call `add()` between the level's `begin()` and `end()`.
 */
export const CrowdConfig = {
  /** Most people drawn per body variant, and in all (the rest are simply skipped: the city is dense, nobody notices). */
  perVariant: 56,
  maxShown: 150,
  /** Cross-fade time between two clips (s). */
  fade: 0.2,
} as const;

export const Clip = { idle: 0, walk: 1, run: 2, wave: 3 } as const;
const CLIP_NAMES = ['idle', 'walk', 'run', 'wave'] as const;

/** Body variants in the order of the GLB (`gender` 0 = male skeleton, 1 = female skeleton). */
export const VARIANTS = [
  { name: 'male_casual', gender: 0 },
  { name: 'male_shirt', gender: 0 },
  { name: 'male_long', gender: 0 },
  { name: 'male_suit', gender: 0 },
  { name: 'female_casual', gender: 1 },
  { name: 'female_dress', gender: 1 },
  { name: 'female_tank', gender: 1 },
  { name: 'female_alt', gender: 1 },
] as const;
export const VARIANT_COUNT = VARIANTS.length;

// ---- Palette (linear RGB triples; the zone tint of a person is four indices into it) ------------------------------------------

const SKIN = [0xf1c9a0, 0xe0ac7c, 0xc98f5e, 0xa8714a, 0x8a5a3a, 0xf6d8b8];
const TOP = [0xff6b6b, 0x4dabf7, 0xffd23f, 0x51cf66, 0xff9f43, 0xb197fc, 0xf783ac, 0x38d9a9, 0xf4f1ea, 0x74c0fc];
const BOTTOM = [0x3b5b92, 0x4a4f63, 0x6b4f3a, 0x2f7d6d, 0x7a5ab0, 0xc0562f, 0x5a6b8a];
const HAIR = [0x2a1c16, 0x4d352c, 0x1b1b1f, 0x8a5a2b, 0xc9a35a, 0x6b3a2a];
export const PaletteBase = { skin: 0, top: SKIN.length, bottom: SKIN.length + TOP.length, hair: SKIN.length + TOP.length + BOTTOM.length } as const;
const FIXED = SKIN.length + TOP.length + BOTTOM.length + HAIR.length;
const PAL_SIZE = 64;
/** Shared by every material (one uniform array). */
const palette = new Float32Array(PAL_SIZE * 3);
const customColors = new Map<number, number>();
let paletteUsed = FIXED;
{
  const c = new THREE.Color();
  [...SKIN, ...TOP, ...BOTTOM, ...HAIR].forEach((hex, i) => c.setHex(hex).toArray(palette, i * 3));
}

/** Palette index of an exact colour (a named resident's own shirt or hair); the same colour always gets the same slot. */
export function crowdColor(hex: number): number {
  const have = customColors.get(hex);
  if (have !== undefined) return have;
  if (paletteUsed >= PAL_SIZE) return PaletteBase.top;
  new THREE.Color().setHex(hex).toArray(palette, paletteUsed * 3);
  customColors.set(hex, paletteUsed);
  return paletteUsed++;
}

/** Four palette indices in one number (skin, top, bottom, hair; each < 64). */
export const packLook = (skin: number, top: number, bottom: number, hair: number): number => skin + top * 64 + bottom * 4096 + hair * 262144;

/** A random look from the cheerful palettes; `r` gives numbers in [0, 1). */
export function randomLook(r: () => number): number {
  const pick = (n: number): number => Math.min(n - 1, Math.floor(r() * n));
  return packLook(PaletteBase.skin + pick(SKIN.length), PaletteBase.top + pick(TOP.length), PaletteBase.bottom + pick(BOTTOM.length), PaletteBase.hair + pick(HAIR.length));
}

export function bottomColorIndex(i: number): number {
  return PaletteBase.bottom + (((i % BOTTOM.length) + BOTTOM.length) % BOTTOM.length);
}
export function skinColorIndex(i: number): number {
  return PaletteBase.skin + (((i % SKIN.length) + SKIN.length) % SKIN.length);
}

// ---- Assets (loaded once) -------------------------------------------------------------------------------------------------------

interface GenderBake {
  texture: THREE.DataTexture;
  material: THREE.MeshStandardMaterial;
  /** First texture row and frame count of every clip. */
  row0: number[];
  frames: number[];
  /** Duration (s) of one cycle of every clip. */
  dur: number[];
  /** Ground speed (m/s) of the walk and run clips at scale 1. */
  walkSpeed: number;
  runSpeed: number;
}

const GLSL_COMMON = `
attribute vec4 aJoints;
attribute vec4 aWeights;
attribute float aZone;
attribute vec4 aPose;
attribute vec4 aLook;
uniform sampler2D tBones;
uniform vec3 uPal[${PAL_SIZE}];
`;

const GLSL_SKIN = `
vec4 cr0 = vec4(0.0), cr1 = vec4(0.0), cr2 = vec4(0.0);
{
  int rowA = int(aPose.x + 0.5);
  int rowB = int(aPose.y + 0.5);
  bool fade = aPose.z > 0.004;
  for (int k = 0; k < 4; k++) {
    float w = aWeights[k];
    if (w <= 0.0) continue;
    int j = int(aJoints[k] + 0.5) * 3;
    vec4 a0 = texelFetch(tBones, ivec2(j, rowA), 0);
    vec4 a1 = texelFetch(tBones, ivec2(j + 1, rowA), 0);
    vec4 a2 = texelFetch(tBones, ivec2(j + 2, rowA), 0);
    if (fade) {
      a0 = mix(a0, texelFetch(tBones, ivec2(j, rowB), 0), aPose.z);
      a1 = mix(a1, texelFetch(tBones, ivec2(j + 1, rowB), 0), aPose.z);
      a2 = mix(a2, texelFetch(tBones, ivec2(j + 2, rowB), 0), aPose.z);
    }
    cr0 += a0 * w;
    cr1 += a1 * w;
    cr2 += a2 * w;
  }
}
objectNormal = vec3(dot(cr0.xyz, objectNormal), dot(cr1.xyz, objectNormal), dot(cr2.xyz, objectNormal));
`;

const GLSL_POS = `
{
  vec4 bp = vec4(position, 1.0);
  transformed = vec3(dot(cr0, bp), dot(cr1, bp), dot(cr2, bp));
}
`;

const GLSL_COLOR = `
vColor = vec4(color, 1.0);
{
  int zn = int(aZone + 0.5);
  if (zn > 0) {
    float pk = zn == 1 ? aLook.x : (zn == 2 ? aLook.y : (zn == 3 ? aLook.z : aLook.w));
    vColor.rgb *= uPal[int(pk + 0.5)];
  }
}
`;

function makeMaterial(texture: THREE.DataTexture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  m.customProgramCacheKey = () => 'crowd-skin';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tBones = { value: texture };
    sh.uniforms.uPal = { value: palette };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <color_vertex>', GLSL_COLOR)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + GLSL_SKIN)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GLSL_POS);
  };
  return m;
}

class CrowdModels {
  private loading: Promise<void> | null = null;
  ready = false;
  failed = false;
  bytes = 0;
  /** Geometry per variant (shared attributes; the Crowds add their own instance attributes on a wrapper geometry). */
  readonly sources: THREE.BufferGeometry[] = [];
  readonly gender: GenderBake[] = [];

  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.run().catch((err: unknown) => {
      this.failed = true;
      console.warn('Residents model failed to load; the city streets stay empty of animated people.', err);
    });
    return this.loading;
  }

  private async run(): Promise<void> {
    const base = import.meta.env.BASE_URL;
    const url = `${base}models/residents/residents.glb`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const buf = await res.arrayBuffer();
    this.bytes = buf.byteLength;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(buf, `${base}models/residents/`);
    const speeds = ((gltf.scene.userData as { clipSpeed?: Record<string, number> }).clipSpeed ?? (gltf.userData as { clipSpeed?: Record<string, number> }).clipSpeed ?? {}) as Record<string, number>;
    const meshes = new Map<string, THREE.SkinnedMesh>();
    gltf.scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.set(o.name, o as THREE.SkinnedMesh);
    });
    const bakes: GenderBake[] = [];
    for (let g = 0; g < 2; g++) {
      const first = meshes.get(VARIANTS.find((v) => v.gender === g)!.name);
      if (!first) throw new Error('residents.glb: missing variant');
      bakes.push(this.bake(gltf, first.skeleton, g === 0 ? 'm_' : 'f_', speeds));
    }
    for (const v of VARIANTS) {
      const mesh = meshes.get(v.name);
      if (!mesh) throw new Error(`residents.glb: missing ${v.name}`);
      const src = mesh.geometry;
      const g = new THREE.BufferGeometry();
      g.setIndex(src.index);
      g.setAttribute('position', src.getAttribute('position'));
      g.setAttribute('normal', src.getAttribute('normal'));
      g.setAttribute('color', src.getAttribute('color'));
      g.setAttribute('aJoints', src.getAttribute('skinIndex'));
      g.setAttribute('aWeights', src.getAttribute('skinWeight'));
      g.setAttribute('aZone', src.getAttribute('_zone'));
      this.sources.push(g);
    }
    this.gender.push(...bakes);
    this.ready = true;
  }

  /** Bake all clips of one skeleton: row = clip frame, three texels per bone (the first three rows of its skin matrix). */
  private bake(gltf: { animations: THREE.AnimationClip[]; scene: THREE.Group }, sk: THREE.Skeleton, pfx: string, speeds: Record<string, number>): GenderBake {
    const bones = sk.bones;
    const bindP = bones.map((b) => b.position.clone());
    const bindQ = bones.map((b) => b.quaternion.clone());
    const byName = new Map<string, number>();
    bones.forEach((b, i) => byName.set(b.name, i));
    const clips = CLIP_NAMES.map((n) => gltf.animations.find((a) => a.name === pfx + n));
    const frames: number[] = [];
    const row0: number[] = [];
    const dur: number[] = [];
    let rows = 0;
    clips.forEach((c, i) => {
      if (!c) throw new Error(`residents.glb: clip ${pfx}${CLIP_NAMES[i]} missing`);
      const n = c.tracks[0].times.length - 1;
      frames.push(n);
      row0.push(rows);
      dur.push(c.duration);
      rows += n;
    });
    const width = bones.length * 3;
    const data = new Float32Array(width * rows * 4);
    const scene = gltf.scene;
    clips.forEach((c, ci) => {
      if (!c) return;
      for (let f = 0; f < frames[ci]; f++) {
        for (let b = 0; b < bones.length; b++) {
          bones[b].position.copy(bindP[b]);
          bones[b].quaternion.copy(bindQ[b]);
        }
        for (const tr of c.tracks) {
          const dot = tr.name.lastIndexOf('.');
          const bi = byName.get(tr.name.slice(0, dot));
          if (bi === undefined) continue;
          const prop = tr.name.slice(dot + 1);
          const v = tr.values;
          if (prop === 'quaternion') bones[bi].quaternion.set(v[f * 4], v[f * 4 + 1], v[f * 4 + 2], v[f * 4 + 3]);
          else if (prop === 'position') bones[bi].position.set(v[f * 3], v[f * 3 + 1], v[f * 3 + 2]);
        }
        scene.updateMatrixWorld(true);
        const row = row0[ci] + f;
        const m = new THREE.Matrix4();
        for (let b = 0; b < bones.length; b++) {
          m.multiplyMatrices(bones[b].matrixWorld, sk.boneInverses[b]);
          const e = m.elements;
          for (let r = 0; r < 3; r++) {
            const o = (row * width + b * 3 + r) * 4;
            data[o] = e[r];
            data[o + 1] = e[4 + r];
            data[o + 2] = e[8 + r];
            data[o + 3] = e[12 + r];
          }
        }
      }
    });
    for (let b = 0; b < bones.length; b++) {
      bones[b].position.copy(bindP[b]);
      bones[b].quaternion.copy(bindQ[b]);
    }
    scene.updateMatrixWorld(true);
    const texture = new THREE.DataTexture(data, width, rows, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const gk = pfx === 'm_' ? 'm' : 'f';
    return { texture, material: makeMaterial(texture), row0, frames, dur, walkSpeed: speeds[`${gk}_walk`] || 1.4, runSpeed: speeds[`${gk}_run`] || 3 };
  }
}

export const crowdModels = new CrowdModels();

// ---- Per level instances --------------------------------------------------------------------------------------------------------

export class Crowd {
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly poses: THREE.InstancedBufferAttribute[] = [];
  private readonly looks: THREE.InstancedBufferAttribute[] = [];
  private readonly count = new Int32Array(VARIANT_COUNT);
  private total = 0;
  /** Number of people written this frame (for the tests and the budget). */
  shown = 0;

  constructor(root: THREE.Object3D) {
    if (!crowdModels.ready) return;
    const cap = CrowdConfig.perVariant;
    for (let v = 0; v < VARIANT_COUNT; v++) {
      const src = crowdModels.sources[v];
      const g = new THREE.BufferGeometry();
      g.setIndex(src.index);
      for (const k of ['position', 'normal', 'color', 'aJoints', 'aWeights', 'aZone']) g.setAttribute(k, src.getAttribute(k));
      const pose = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      const look = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      pose.setUsage(THREE.DynamicDrawUsage);
      look.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aPose', pose);
      g.setAttribute('aLook', look);
      // Bind pose is a T-pose about 1.8 m across; people never leave the box below (used by nothing: culling is off).
      const mesh = new THREE.InstancedMesh(g, crowdModels.gender[VARIANTS[v].gender].material, cap);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.count = 0;
      mesh.visible = false;
      mesh.name = `crowd_${VARIANTS[v].name}`;
      root.add(mesh);
      this.meshes.push(mesh);
      this.poses.push(pose);
      this.looks.push(look);
    }
  }

  get ready(): boolean {
    return this.meshes.length > 0;
  }

  /** Texture row of clip `clip` at cycle fraction `ct` (0..1) for a body variant. */
  row(variant: number, clip: number, ct: number): number {
    const gb = crowdModels.gender[VARIANTS[variant].gender];
    const n = gb.frames[clip];
    const f = Math.floor(ct * n);
    return gb.row0[clip] + (f >= n ? n - 1 : f < 0 ? 0 : f);
  }

  /** Cycles per second that put the feet on the ground at ground speed `v` (m/s) for a person drawn at `scale`. */
  cps(variant: number, clip: number, v: number, scale: number): number {
    const gb = crowdModels.gender[VARIANTS[variant].gender];
    const sp = clip === Clip.run ? gb.runSpeed : gb.walkSpeed;
    return v / (sp * scale * gb.dur[clip]);
  }

  /** Cycles per second of a clip played at its natural speed. */
  natural(variant: number, clip: number): number {
    return 1 / crowdModels.gender[VARIANTS[variant].gender].dur[clip];
  }

  begin(): void {
    this.count.fill(0);
    this.total = 0;
  }

  /**
   * Draw one person: `rowA` is the pose row (see `row`), `rowB` the row of the clip it fades from and `blend` the share of `rowB`
   * (0 = no fade). Returns false when the person did not fit (caps) or the model is missing.
   */
  add(variant: number, look: number, x: number, y: number, z: number, yaw: number, scale: number, rowA: number, rowB: number, blend: number): boolean {
    if (this.meshes.length === 0 || this.total >= CrowdConfig.maxShown) return false;
    const i = this.count[variant];
    if (i >= CrowdConfig.perVariant) return false;
    this.count[variant] = i + 1;
    this.total++;
    const m = this.meshes[variant].instanceMatrix.array as Float32Array;
    const c = Math.cos(yaw) * scale;
    const s = Math.sin(yaw) * scale;
    const o = i * 16;
    m[o] = c;
    m[o + 1] = 0;
    m[o + 2] = -s;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = scale;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = s;
    m[o + 9] = 0;
    m[o + 10] = c;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    const p = this.poses[variant].array as Float32Array;
    p[i * 4] = rowA;
    p[i * 4 + 1] = rowB;
    p[i * 4 + 2] = blend;
    const l = this.looks[variant].array as Float32Array;
    l[i * 4] = look % 64;
    l[i * 4 + 1] = Math.floor(look / 64) % 64;
    l[i * 4 + 2] = Math.floor(look / 4096) % 64;
    l[i * 4 + 3] = Math.floor(look / 262144) % 64;
    return true;
  }

  end(): void {
    let n = 0;
    for (let v = 0; v < this.meshes.length; v++) {
      const k = this.count[v];
      const mesh = this.meshes[v];
      mesh.count = k;
      mesh.visible = k > 0;
      n += k;
      if (k > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        this.poses[v].needsUpdate = true;
        this.looks[v].needsUpdate = true;
      }
    }
    this.shown = n;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
      m.dispose();
    }
    this.meshes.length = 0;
  }
}

// ---- Pose helper for people with a fixed place (residents, the doctor, the vendor) --------------------------------------------------

/** Which clip a standing person plays, its cycle fraction, and the clip it fades out of. */
export interface PoseState {
  clip: number;
  ct: number;
  pclip: number;
  pct: number;
  bl: number;
}

export const newPose = (ct = 0): PoseState => ({ clip: Clip.idle, ct, pclip: Clip.idle, pct: 0, bl: 0 });

/** Advance a standing person (idle or wave) by `dt` seconds towards clip `want`. */
export function stepPose(crowd: Crowd, variant: number, st: PoseState, want: number, dt: number): void {
  if (st.clip !== want) {
    st.pclip = st.clip;
    st.pct = st.ct;
    st.bl = 1;
    st.ct = 0;
    st.clip = want;
  }
  st.ct += crowd.natural(variant, want) * dt;
  if (st.ct >= 1) st.ct -= Math.floor(st.ct);
  if (st.bl > 0) st.bl = Math.max(0, st.bl - dt / CrowdConfig.fade);
}

/** Draw a standing person in its current pose. */
export function drawPose(crowd: Crowd, variant: number, look: number, x: number, y: number, z: number, yaw: number, scale: number, st: PoseState): boolean {
  return crowd.add(variant, look, x, y, z, yaw, scale, crowd.row(variant, st.clip, st.ct), st.bl > 0 ? crowd.row(variant, st.pclip, st.pct) : 0, st.bl);
}
