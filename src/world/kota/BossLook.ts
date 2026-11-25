import * as THREE from 'three';

/**
 * Small look helpers shared by the Tikus Rakus and Elang Belang fights (kept local: no dependency on other battle code).
 *   - PuffPool: one pooled Points draw call of soft glows, hearts, stars and crumbs (no per-frame allocation).
 *   - addRimFlash: a rim light plus a hit flash on an enemy material (one extra uniform pair, no extra lights).
 */

export type PuffShape = 'soft' | 'heart' | 'star' | 'crumb';
const SHAPE_ID: Record<PuffShape, number> = { soft: 0, heart: 1, star: 2, crumb: 3 };

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aShape;
uniform float uK;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vShape = aShape;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aAlpha > 0.003 ? max(1.0, aSize * uK / max(0.2, -mv.z)) : 0.0;
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (vShape < 0.5) {
    a = pow(max(0.0, 1.0 - dot(p, p)), 1.6);
  } else if (vShape < 1.5) {
    p.y = -p.y * 1.1 + 0.35;
    p.x *= 0.95;
    float h = pow(p.x * p.x + p.y * p.y - 0.55, 3.0) - p.x * p.x * p.y * p.y * p.y;
    a = 1.0 - smoothstep(-0.02, 0.02, h);
  } else if (vShape < 2.5) {
    float r = length(p);
    float ang = atan(p.y, p.x);
    float star = 0.42 + 0.5 * pow(abs(cos(ang * 2.0)), 6.0);
    a = 1.0 - smoothstep(star - 0.06, star, r);
  } else {
    a = 1.0 - smoothstep(0.7, 0.95, length(p));
  }
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

export class PuffPool {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly shape: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grav: Float32Array;
  private readonly size0: Float32Array;
  private readonly grow: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private readonly uK = { value: 400 };
  private readonly c = new THREE.Color();
  private cursor = 0;
  private live = 0;

  constructor(parent: THREE.Object3D, n = 96, additive = true) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.shape = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.grow = new Float32Array(n);
    const attr = (a: Float32Array, k: number): THREE.BufferAttribute => new THREE.BufferAttribute(a, k).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', attr(this.pos, 3));
    this.geo.setAttribute('aColor', attr(this.col, 3));
    this.geo.setAttribute('aSize', attr(this.size, 1));
    this.geo.setAttribute('aAlpha', attr(this.alpha, 1));
    this.geo.setAttribute('aShape', attr(this.shape, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uK: this.uK },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = false;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      this.uK.value = renderer.domElement.height * 0.5 * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
    };
    parent.add(this.points);
  }

  /** One particle. `grow` > 0 makes it swell (poof clouds), < 0 shrink. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, shape: PuffShape, gravity = 0, grow = 0): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    if (this.life[i] <= 0) this.live++;
    this.c.setHex(color);
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = this.c.r; this.col[i3 + 1] = this.c.g; this.col[i3 + 2] = this.c.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.shape[i] = SHAPE_ID[shape];
    this.grav[i] = gravity;
    this.grow[i] = grow;
    this.points.visible = true;
  }

  /** A radial burst. `speed` m/s, `up` extra upward speed. */
  burst(x: number, y: number, z: number, count: number, speed: number, colors: readonly number[], shape: PuffShape, size: number, life: number, gravity = 0, up = 0, grow = 0): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * 1.2;
      const s = speed * (0.45 + Math.random() * 0.75);
      const cs = Math.cos(e);
      this.emit(x, y, z, Math.cos(a) * cs * s, Math.sin(e) * s + up, Math.sin(a) * cs * s, life * (0.7 + Math.random() * 0.5), size * (0.7 + Math.random() * 0.6), colors[k % colors.length], shape, gravity, grow);
    }
  }

  /** Tamed 'poof': a soft cloud with sparkles and hearts floating up (no violence). */
  poof(x: number, y: number, z: number, scale = 1): void {
    this.burst(x, y, z, 8, 1.6 * scale, [0xffffff, 0xffe9f2], 'soft', 1.1 * scale, 0.9, 0, 0.3, 1.2);
    this.burst(x, y, z, 6, 2.4 * scale, [0xffd23f, 0xfff2a8, 0xffffff], 'star', 0.34 * scale, 1.1, 0.4, 0.8);
    this.burst(x, y, z, 5, 1.3 * scale, [0xff7fa8, 0xffa6c4, 0xff5c8a], 'heart', 0.42 * scale, 1.6, -0.5, 1.5);
  }

  update(dt: number): void {
    if (this.live <= 0) return;
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i];
      if (l <= 0) continue;
      const nl = l - dt;
      this.life[i] = nl;
      if (nl <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * dt * 6;
      const drag = 1 - Math.min(1, dt * 1.4);
      this.vel[i3] *= drag; this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const u = 1 - nl / this.maxLife[i];
      this.alpha[i] = Math.min(1, (1 - u) * 2.2) * Math.min(1, u * 14 + 0.25);
      this.size[i] = this.size0[i] * (1 + this.grow[i] * u);
    }
    this.live = alive;
    const g = this.geo;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aShape') as THREE.BufferAttribute).needsUpdate = true;
    if (alive === 0) this.points.visible = false;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

export interface RimFlash {
  /** 0..1 white-warm flash, decay it yourself. */
  flash: { value: number };
}

/**
 * Adds a soft rim light and a hit flash to a (cloned) lit material. Chains any onBeforeCompile already set on it.
 * The rim is a fresnel term added as emissive, so it costs nothing per light.
 */
export function addRimFlash(mat: THREE.Material, rim: number, strength = 0.55, flashColor = 0xfff2d0): RimFlash {
  const uniforms = {
    flash: { value: 0 },
    rimColor: { value: new THREE.Color(rim) },
    rimStrength: { value: strength },
    flashColor: { value: new THREE.Color(flashColor) },
  };
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.uniforms.rimFlash = uniforms.flash;
    shader.uniforms.rimColor = uniforms.rimColor;
    shader.uniforms.rimStrength = uniforms.rimStrength;
    shader.uniforms.flashColor = uniforms.flashColor;
    shader.fragmentShader = 'uniform float rimFlash;\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform vec3 flashColor;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       {
         float rimK = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.6);
         totalEmissiveRadiance += rimColor * rimK * rimStrength + flashColor * rimFlash * 0.6;
       }`,
    );
  };
  mat.customProgramCacheKey = () => prevKey() + '|rimflash';
  mat.needsUpdate = true;
  return { flash: uniforms.flash };
}
