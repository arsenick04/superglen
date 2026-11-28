import * as THREE from 'three';

/**
 * Animated 3D energy aura & crackling electric lightning arcs for special Superglen costumes.
 *   - 'sg-merahputih': Super Saiyan-style blazing crimson-red & golden-white ki flame aura,
 *     ground shockwave ring, crackling bio-electric lightning bolts, and rising energy sparks.
 *   - 'sg-holo': subtle futuristic cyan-violet cyber lightning & rising prism motes.
 *
 * Zero per-frame heap allocations: all geometries, materials, and typed arrays are created once
 * and mutated in-place during `update(dt)`.
 */

const FLAME_VERT = /* glsl */ `
uniform float uTime;
uniform float uSpike;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;

void main() {
  vUv = uv;
  vec3 pos = position;
  float angle = atan(pos.z, pos.x);
  // Upward-licking Super Saiyan ki flame displacement (tapers at base, flares into tongues toward top).
  float h = uv.y;
  float w1 = sin(angle * 6.0 - uTime * 7.5 + h * 7.0);
  float w2 = sin(angle * 11.0 + uTime * 10.5 - h * 11.0) * 0.5;
  float flare = smoothstep(0.05, 0.75, h) * (1.0 - smoothstep(0.82, 1.0, h) * 0.4);
  float radial = (w1 + w2) * uSpike * flare;
  pos.xz += normalize(pos.xz + vec2(1e-4)) * radial;
  pos.y += (w1 * 0.03 + 0.025) * h;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vViewPos = -mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColorInner;
uniform vec3 uColorOuter;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vNormalV;
varying vec3 vViewPos;

float flameWave(vec2 p) {
  float a = sin(p.x * 6.28318 * 3.0 + sin(p.y * 5.0 - uTime * 5.5) * 1.1);
  float b = sin(p.x * 6.28318 * 5.0 - p.y * 8.0 + uTime * 9.0) * 0.6;
  float c = sin(p.x * 6.28318 * 9.0 + p.y * 13.0 - uTime * 13.0) * 0.35;
  return (a + b + c) * 0.5 + 0.5;
}

void main() {
  float h = vUv.y;
  // Scroll flame tongues rapidly upward.
  float f = flameWave(vec2(vUv.x, h * 1.4 - uTime * 0.65));
  float f2 = flameWave(vec2(vUv.x + 0.37, h * 2.1 - uTime * 1.05));
  float flame = clamp(f * 0.65 + f2 * 0.55, 0.0, 1.0);

  // Carve sharp vertical flame tongues that dissolve near the top.
  float topCut = smoothstep(1.0, 0.22, h + (1.0 - flame) * 0.55);
  float botFade = smoothstep(0.0, 0.14, h);

  // Fresnel rim glow keeps Superglen's face super clear in the middle while blazing intensely around the silhouette!
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(vViewPos);
  float rim = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 1.25);
  float pulse = 0.88 + 0.12 * sin(uTime * 14.0);

  float alpha = topCut * botFade * (0.28 + 0.92 * rim) * smoothstep(0.22, 0.85, flame) * uIntensity * pulse;
  if (alpha < 0.01) discard;

  // White-gold hot inner core blending to fiery crimson/gold outer tongues.
  float hot = smoothstep(0.45, 0.95, flame * (1.0 - h * 0.55) + rim * 0.25);
  vec3 col = mix(uColorOuter, uColorInner, hot);
  gl_FragColor = vec4(col * (1.15 + hot * 0.5), clamp(alpha, 0.0, 0.92));
}
`;

const RING_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float wave = fract(r * 2.2 - uTime * 1.6);
  float ring = smoothstep(0.0, 0.18, wave) * smoothstep(0.75, 0.18, wave);
  float radialFade = smoothstep(0.35, 0.52, r) * smoothstep(1.0, 0.62, r);
  float a = (0.35 + 0.65 * ring) * radialFade * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * 1.4, a);
}
`;

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SPARK_VERT = /* glsl */ `
attribute float aPhase;
attribute float aRadius;
attribute float aAngle;
uniform float uTime;
uniform float uSize;
varying float vAlpha;
varying float vMix;

void main() {
  float t = fract(aPhase + uTime * 0.72);
  float ang = aAngle + uTime * 1.4 + t * 2.0;
  float rad = aRadius * (1.05 - t * 0.32);
  vec3 pos = vec3(cos(ang) * rad, 0.05 + t * 1.28, sin(ang) * rad);
  vAlpha = sin(t * 3.14159265);
  vMix = fract(aPhase * 7.31);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * (1.0 / max(0.8, -mv.z)), 3.0, 22.0);
}
`;

const SPARK_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vAlpha;
varying float vMix;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float core = pow(1.0 - d, 1.8);
  vec3 col = mix(uColorA, uColorB, vMix);
  gl_FragColor = vec4(col * 1.5, core * vAlpha * 0.95);
}
`;

const BOLT_COUNT = 6;
const BOLT_SEGS = 7;
const SPARK_COUNT = 28;

/** Fast deterministic pseudo-random in [-1, 1] without heap allocations. */
function hash11(x: number): number {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453123;
  return (s - Math.floor(s)) * 2 - 1;
}

export type AuraMode = 'none' | 'merahputih' | 'holo';

export class CostumeAura {
  readonly group = new THREE.Group();
  private mode: AuraMode = 'none';
  private time = 0;
  private boltStep = -1;

  private readonly outerMesh: THREE.Mesh;
  private readonly innerMesh: THREE.Mesh;
  private readonly ringMesh: THREE.Mesh;
  private readonly boltMesh: THREE.Mesh;
  private readonly boltPos: Float32Array;
  private readonly boltAttr: THREE.BufferAttribute;
  private readonly boltMat: THREE.MeshBasicMaterial;
  private readonly sparks: THREE.Points;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private readonly outerUniforms = {
    uTime: { value: 0 },
    uSpike: { value: 0.055 },
    uColorInner: { value: new THREE.Color(0xfff4c2) },
    uColorOuter: { value: new THREE.Color(0xff2430) },
    uIntensity: { value: 0.9 },
  };
  private readonly innerUniforms = {
    uTime: { value: 0 },
    uSpike: { value: 0.032 },
    uColorInner: { value: new THREE.Color(0xffffff) },
    uColorOuter: { value: new THREE.Color(0xffb82e) },
    uIntensity: { value: 0.78 },
  };
  private readonly ringUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xff4238) },
    uOpacity: { value: 0.82 },
  };
  private readonly sparkUniforms = {
    uTime: { value: 0 },
    uSize: { value: 26.0 },
    uColorA: { value: new THREE.Color(0xfff4b8) },
    uColorB: { value: new THREE.Color(0xff3838) },
  };

  constructor() {
    this.group.name = 'costume-aura';
    this.group.visible = false;

    // 1. Twin Super Saiyan flame shells (outer crimson-gold, inner blazing white-gold).
    const outerGeo = new THREE.CylinderGeometry(0.27, 0.44, 1.28, 28, 14, true);
    const outerMat = new THREE.ShaderMaterial({
      uniforms: this.outerUniforms,
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.outerMesh = new THREE.Mesh(outerGeo, outerMat);
    this.outerMesh.position.y = 0.62;
    this.outerMesh.renderOrder = 4;
    this.group.add(this.outerMesh);

    const innerGeo = new THREE.CylinderGeometry(0.18, 0.34, 1.14, 24, 12, true);
    const innerMat = new THREE.ShaderMaterial({
      uniforms: this.innerUniforms,
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.innerMesh = new THREE.Mesh(innerGeo, innerMat);
    this.innerMesh.position.y = 0.56;
    this.innerMesh.renderOrder = 5;
    this.group.add(this.innerMesh);

    // 2. Pulsing ki shockwave ring on the ground.
    const ringGeo = new THREE.PlaneGeometry(1.12, 1.12);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: this.ringUniforms,
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 0.03;
    this.ringMesh.renderOrder = 3;
    this.group.add(this.ringMesh);

    // 3. Crackling 3D electric lightning ribbon bolts (pre-allocated triangle buffer; visible thickness on all GPUs/iOS).
    // Each segment is 2 triangles = 6 vertices * 3 floats.
    this.boltPos = new Float32Array(BOLT_COUNT * BOLT_SEGS * 6 * 3);
    const boltGeo = new THREE.BufferGeometry();
    this.boltAttr = new THREE.BufferAttribute(this.boltPos, 3);
    this.boltAttr.setUsage(THREE.DynamicDrawUsage);
    boltGeo.setAttribute('position', this.boltAttr);
    this.boltMat = new THREE.MeshBasicMaterial({
      color: 0x8ef7ff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.boltMesh = new THREE.Mesh(boltGeo, this.boltMat);
    this.boltMesh.frustumCulled = false;
    this.boltMesh.renderOrder = 6;
    this.group.add(this.boltMesh);

    // 4. Rising glowing energy sparks.
    const sparkGeo = new THREE.BufferGeometry();
    const dummyPos = new Float32Array(SPARK_COUNT * 3);
    const phases = new Float32Array(SPARK_COUNT);
    const radii = new Float32Array(SPARK_COUNT);
    const angles = new Float32Array(SPARK_COUNT);
    for (let i = 0; i < SPARK_COUNT; i++) {
      phases[i] = i / SPARK_COUNT;
      radii[i] = 0.25 + ((i * 37) % 100) / 100 * 0.22;
      angles[i] = (i * 2.39996) % (Math.PI * 2);
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
    sparkGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    sparkGeo.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
    sparkGeo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    const sparkMat = new THREE.ShaderMaterial({
      uniforms: this.sparkUniforms,
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparks = new THREE.Points(sparkGeo, sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 6;
    this.group.add(this.sparks);

    this.geometries.push(outerGeo, innerGeo, ringGeo, boltGeo, sparkGeo);
    this.materials.push(outerMat, innerMat, ringMat, this.boltMat, sparkMat);
  }

  /** Activate the matching aura for the equipped costume id. */
  setLook(id: string): void {
    const next: AuraMode = id === 'sg-merahputih' ? 'merahputih' : id === 'sg-holo' ? 'holo' : 'none';
    if (next === this.mode) return;
    this.mode = next;
    this.group.visible = next !== 'none';
    if (next === 'merahputih') {
      this.outerMesh.visible = true;
      this.innerMesh.visible = true;
      this.ringMesh.visible = true;
      this.boltMesh.visible = true;
      this.sparks.visible = true;
      this.ringUniforms.uColor.value.setHex(0xff3b30);
      this.ringUniforms.uOpacity.value = 0.85;
      this.boltMat.color.setHex(0x88f5ff);
      this.boltMat.opacity = 0.94;
      this.sparkUniforms.uColorA.value.setHex(0xfff5c0);
      this.sparkUniforms.uColorB.value.setHex(0xff2e38);
      this.sparkUniforms.uSize.value = 28.0;
    } else if (next === 'holo') {
      this.outerMesh.visible = false;
      this.innerMesh.visible = false;
      this.ringMesh.visible = true;
      this.boltMesh.visible = true;
      this.sparks.visible = true;
      this.ringUniforms.uColor.value.setHex(0x4ae8ff);
      this.ringUniforms.uOpacity.value = 0.55;
      this.boltMat.color.setHex(0xc8a4ff);
      this.boltMat.opacity = 0.72;
      this.sparkUniforms.uColorA.value.setHex(0x52f2ff);
      this.sparkUniforms.uColorB.value.setHex(0xff66e0);
      this.sparkUniforms.uSize.value = 22.0;
    }
    this.boltStep = -1;
    if (next !== 'none') this.rebuildBolts(Math.floor(this.time * 15));
  }

  /** Advance aura animation (zero allocations). */
  update(dt: number): void {
    if (this.mode === 'none') return;
    this.time = (this.time + dt) % 1000;
    this.outerUniforms.uTime.value = this.time;
    this.innerUniforms.uTime.value = this.time;
    this.ringUniforms.uTime.value = this.time;
    this.sparkUniforms.uTime.value = this.time;

    // Snap lightning bolts ~14 times per second for crisp Dragon Ball SSJ2 crackling energy.
    const step = Math.floor(this.time * 14);
    if (step !== this.boltStep) {
      this.boltStep = step;
      this.rebuildBolts(step);
    }
  }

  private rebuildBolts(step: number): void {
    const arr = this.boltPos;
    const activeBolts = this.mode === 'merahputih' ? BOLT_COUNT : 3;
    const halfW = this.mode === 'merahputih' ? 0.014 : 0.010;
    let ptr = 0;
    for (let b = 0; b < BOLT_COUNT; b++) {
      const seed = step * 19.37 + b * 7.13;
      const on = b < activeBolts;
      // Place bolts cleanly on left, right, and rear arcs so they frame Superglen without crossing his face.
      const side = b % 2 === 0 ? 1 : -1;
      const baseAngle = side * (0.25 + (hash11(seed) * 0.5 + 0.5) * 0.95) + (b >= 4 ? Math.PI : 0);
      const sweep = side * (0.28 + Math.abs(hash11(seed + 1.1)) * 0.45);
      const y0 = 0.12 + (hash11(seed + 3.7) * 0.5 + 0.5) * 0.34;
      const y1 = Math.min(1.16, y0 + 0.40 + (hash11(seed + 4.9) * 0.5 + 0.5) * 0.38);
      const rBase = 0.34 + (hash11(seed + 5.5) * 0.5 + 0.5) * 0.13;

      let prevX = 0, prevY = 0, prevZ = 0, prevOx = 0, prevOz = 0;
      for (let s = 0; s <= BOLT_SEGS; s++) {
        const f = s / BOLT_SEGS;
        const jSeed = seed + s * 3.17;
        const jitter = s === 0 || s === BOLT_SEGS ? 0 : 0.095;
        const ang = baseAngle + sweep * f + hash11(jSeed) * jitter * 2.0;
        const r = rBase + hash11(jSeed + 0.7) * jitter;
        const y = y0 + (y1 - y0) * f + hash11(jSeed + 1.9) * jitter * 0.55;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const x = on ? ca * r : 0;
        const z = on ? sa * r : 0;
        const yy = on ? y : -99;
        // Taper ribbon width at tips so bolts look razor-sharp like anime lightning.
        const w = on ? halfW * (0.35 + 0.65 * Math.sin(f * Math.PI)) : 0;
        const ox = -sa * w, oz = ca * w;
        if (s > 0) {
          const ax = prevX - prevOx, az = prevZ - prevOz;
          const bx = prevX + prevOx, bz = prevZ + prevOz;
          const cx = x - ox, cz = z - oz;
          const dx = x + ox, dz = z + oz;
          // Triangle 1: A -> B -> C
          arr[ptr++] = ax; arr[ptr++] = prevY; arr[ptr++] = az;
          arr[ptr++] = bx; arr[ptr++] = prevY; arr[ptr++] = bz;
          arr[ptr++] = cx; arr[ptr++] = yy;    arr[ptr++] = cz;
          // Triangle 2: B -> D -> C
          arr[ptr++] = bx; arr[ptr++] = prevY; arr[ptr++] = bz;
          arr[ptr++] = dx; arr[ptr++] = yy;    arr[ptr++] = dz;
          arr[ptr++] = cx; arr[ptr++] = yy;    arr[ptr++] = cz;
        }
        prevX = x; prevY = yy; prevZ = z; prevOx = ox; prevOz = oz;
      }
    }
    this.boltAttr.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
