import * as THREE from 'three';

/**
 * Stylized fire for many fire spots: five instanced draw calls in total (flames, smoke, embers, steam, ground glow).
 * Flames are camera-facing billboards with a procedural noise shader (no textures). Particle motion is computed in the shader
 * from time + per-instance seed, so nothing is allocated or simulated on the CPU per frame. A pool of two warm point lights
 * follows the fires nearest to the camera.
 */
export interface FireSpotDef {
  x: number;
  y: number;
  z: number;
  /** Size multiplier (1 = about 3 m tall flames). */
  scale?: number;
  /** Background fire: fades out when the camera comes within a few metres (never fills the screen). */
  ambient?: boolean;
}

const NOISE = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm2(vec2 p){return vn(p)*.62+vn(p*2.03+7.1)*.38;}
`;

// Shared billboard vertex shader. aBase = fire position, aOff = offset inside the fire, aSize = (w,h), aMisc = (seed, k, steam, lod flag).
const VERT = `
attribute vec3 aBase; attribute vec3 aOff; attribute vec2 aSize; attribute vec4 aMisc;
uniform float time; varying vec2 vUv; varying float vSeed; varying float vK; varying float vLife;
void main(){
  vUv=uv; vSeed=aMisc.x; vK=aMisc.y; vLife=0.;
  vec3 wp=aBase+aOff; vec2 size=aSize; float k=aMisc.y;
  #if defined(SMOKE)
    float life=fract(time*.16+aMisc.x); vLife=life;
    wp.y+=life*(4.5+size.y*.5)*(.5+k*.5)+size.y*.4; wp.x+=sin(aMisc.x*40.+life*3.)*life*1.2; wp.z+=cos(aMisc.x*31.+life*2.5)*life*.9;
    size*=(.5+life*1.2)*k;
  #elif defined(STEAM)
    float life=fract(time*.5+aMisc.x); vLife=life; k=aMisc.z;
    wp.y+=life*3.+.6; wp.x+=sin(aMisc.x*40.+life*4.)*life*.8; wp.z+=cos(aMisc.x*33.+life*3.)*life*.8;
    size*=(.4+life*1.1)*step(.01,k);
  #elif defined(EMBER)
    float life=fract(time*.33+aMisc.x); vLife=life;
    wp.y+=life*(5.5+aMisc.x*3.)*(.4+k*.6)+.6; wp.x+=sin(aMisc.x*50.+life*7.)*(.4+life*1.3); wp.z+=cos(aMisc.x*37.+life*6.)*(.4+life*1.)*.8;
    size*=k*(1.-life*.5);
  #elif defined(GLOW)
    size*=k;
  #else
    size*=k;
  #endif
  vec4 mv=modelViewMatrix*vec4(wp,1.);
  #if defined(GLOW)
    mv.xyz+=(viewMatrix*vec4(position.x*size.x,0.,position.y*size.x,0.)).xyz; // flat on the ground
  #else
    #if defined(FLAME)
      mv.xy+=vec2(position.x*size.x,(position.y+.5)*size.y);
    #else
      mv.xy+=position.xy*size;
    #endif
  #endif
  gl_Position=projectionMatrix*mv;
}`;

const FRAG_FLAME = `
uniform float time; varying vec2 vUv; varying float vSeed; varying float vK;
${NOISE}
void main(){
  float t=time*(1.+vSeed*.5); vec2 p=vUv; float y=p.y;
  // sway grows with height, noise scrolls upward in two octaves
  float sway=(vn(vec2(t*.9+vSeed*20.,y*1.5))-.5)*.34*y;
  float n=fbm2(vec2(p.x*3.2+vSeed*9.,y*2.6-t*2.2));
  float n2=fbm2(vec2(p.x*5.5-vSeed*5.,y*4.-t*3.6));
  float cx=(p.x-.5-sway)*2.;
  cx+=(n-.5)*.9*y;
  float w=pow(max(1.-y,0.),.6)*.95+.05;
  float body=1.-smoothstep(w*.35,w,abs(cx));
  // tongues: height cutoff modulated by noise
  float top=.62+n2*.42;
  body*=1.-smoothstep(top-.28,top,y);
  body*=smoothstep(0.,.08,y);
  float heat=(1.-smoothstep(0.,.95,abs(cx)/w))*(1.-y*.9)*(.5+n*.6)*step(.01,body);
  vec3 col=mix(vec3(.78,.06,.02),vec3(1.,.38,.03),smoothstep(.10,.38,heat));
  col=mix(col,vec3(1.,.74,.12),smoothstep(.38,.62,heat));
  col=mix(col,vec3(1.,.93,.55),smoothstep(.66,.9,heat));
  float a=smoothstep(.02,.45,body)*vK;
  gl_FragColor=vec4(col*a,a);
}`;
const FRAG_SMOKE = `
uniform float time; varying vec2 vUv; varying float vSeed; varying float vK; varying float vLife;
${NOISE}
void main(){
  vec2 c=vUv-.5; float r=length(c)*2.;
  float n=vn(c*3.+vSeed*30.+time*.2);
  float a=(1.-smoothstep(.25,1.,r+(n-.5)*.4))*sin(vLife*3.14159)*.42*vK;
  vec3 col=mix(vec3(.30,.26,.23),vec3(.50,.47,.45),vLife);
  gl_FragColor=vec4(col,a);
}`;
const FRAG_STEAM = `
varying vec2 vUv; varying float vSeed; varying float vLife;
${NOISE}
void main(){
  vec2 c=vUv-.5; float r=length(c)*2.; float n=vn(c*3.+vSeed*20.);
  float a=(1.-smoothstep(.2,1.,r+(n-.5)*.35))*sin(vLife*3.14159)*.65;
  gl_FragColor=vec4(vec3(.95,.97,1.),a);
}`;
const FRAG_EMBER = `
varying vec2 vUv; varying float vSeed; varying float vK; varying float vLife;
void main(){
  float r=length(vUv-.5)*2.; float a=(1.-smoothstep(.2,1.,r))*(1.-vLife*vLife)*smoothstep(0.,.05,vLife);
  vec3 col=mix(vec3(1.,.85,.35),vec3(1.,.3,.05),vLife);
  gl_FragColor=vec4(col*a*1.3,a);
}`;
const FRAG_GLOW = `
uniform float time; varying vec2 vUv; varying float vSeed; varying float vK;
void main(){
  float r=length(vUv-.5)*2.; float fl=.85+.15*sin(time*9.+vSeed*40.)*sin(time*5.3+vSeed*17.);
  float a=pow(1.-smoothstep(0.,1.,r),1.6)*.55*fl*vK;
  gl_FragColor=vec4(vec3(1.,.45,.12)*a,a);
}`;

interface Layer {
  mesh: THREE.Mesh;
  fire: number[];
  lod: number[];
  misc: THREE.InstancedBufferAttribute;
  seeds: number[];
}

export class FireSystem {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly spots: FireSpotDef[];
  private readonly intensity: Float32Array;
  private readonly steam: Float32Array;
  private readonly layers: Layer[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private lightGain = 1;
  /** Beyond this distance (m) from the camera only the main flame layer is drawn. */
  farDist = 42;
  /** Phone mode halves the smoke and ember counts. */
  constructor(root: THREE.Object3D, spots: FireSpotDef[], phone = false) {
    this.spots = spots;
    this.intensity = new Float32Array(spots.length).fill(1);
    this.steam = new Float32Array(spots.length);
    const lite = phone ? 0.6 : 1;
    // Flames: main body + two side tongues + hot core (core and tongues are dropped at a distance).
    this.addLayer('FLAME', THREE.CustomBlending, 'flame', [
      { off: [0, 0, 0], size: [2.3, 3.6], lod: 0 },
      { off: [-.55, 0, .2], size: [1.5, 2.6], lod: 1 },
      { off: [.55, 0, -.2], size: [1.4, 2.4], lod: 1 },
      { off: [0, 0, .1], size: [1.1, 2.1], lod: 1 },
    ]);
    const smoke: { off: number[]; size: number[]; lod: number }[] = [];
    for (let i = 0; i < Math.round(3 * lite); i++) smoke.push({ off: [(i - 1) * .4, 1.2, (i % 2) * .5 - .2], size: [3.2 + i * .6, 3.2 + i * .6], lod: i > 0 ? 1 : 0 });
    this.addLayer('SMOKE', THREE.NormalBlending, 'smoke', smoke);
    const embers: { off: number[]; size: number[]; lod: number }[] = [];
    for (let i = 0; i < Math.round(5 * lite); i++) embers.push({ off: [(i % 3 - 1) * .5, .3, (i % 2) * .6 - .3], size: [.16, .16], lod: i > 1 ? 1 : 0 });
    this.addLayer('EMBER', THREE.AdditiveBlending, 'ember', embers);
    const steam: { off: number[]; size: number[]; lod: number }[] = [];
    for (let i = 0; i < Math.round(5 * lite); i++) steam.push({ off: [(i % 3 - 1) * .4, .5, (i % 2) * .5 - .25], size: [1.6, 1.6], lod: 0 });
    this.addLayer('STEAM', THREE.NormalBlending, 'steam', steam);
    this.addLayer('GLOW', THREE.AdditiveBlending, 'glow', [{ off: [0, .07, 0], size: [8, 8], lod: 0 }]);
    // Two pooled warm lights (always present so the shader programs never change).
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff8a30, 0, 24, 2);
      l.castShadow = false;
      this.group.add(l);
      this.lights.push(l);
    }
    root.add(this.group);
  }

  private addLayer(kind: string, blending: THREE.Blending, name: string, defs: { off: number[]; size: number[]; lod: number }[]): void {
    const n = this.spots.length * defs.length;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const base = new Float32Array(n * 3), off = new Float32Array(n * 3), size = new Float32Array(n * 2), misc = new Float32Array(n * 4);
    const fire: number[] = [], lod: number[] = [], seeds: number[] = [];
    let idx = 0;
    for (let f = 0; f < this.spots.length; f++) {
      const s = this.spots[f], sc = s.scale ?? 1;
      for (let d = 0; d < defs.length; d++, idx++) {
        base.set([s.x, s.y, s.z], idx * 3);
        off.set(defs[d].off.map((v) => v * sc), idx * 3);
        size.set(defs[d].size.map((v) => v * sc), idx * 2);
        const seed = ((f * 7 + d * 13 + 1) * 0.6180339) % 1;
        seeds.push(seed);
        misc[idx * 4] = seed;
        fire.push(f);
        lod.push(defs[d].lod);
      }
    }
    geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
    const miscAttr = new THREE.InstancedBufferAttribute(misc, 4);
    miscAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aMisc', miscAttr);
    geo.instanceCount = n;
    const frag = kind === 'FLAME' ? FRAG_FLAME : kind === 'SMOKE' ? FRAG_SMOKE : kind === 'STEAM' ? FRAG_STEAM : kind === 'EMBER' ? FRAG_EMBER : FRAG_GLOW;
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: this.time },
      defines: { [kind]: 1 },
      vertexShader: VERT, fragmentShader: frag,
      transparent: true, depthWrite: false, blending,
      polygonOffset: kind === 'GLOW', polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    if (blending === THREE.CustomBlending) { mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = `fire-${name}`;
    mesh.renderOrder = kind === 'GLOW' ? 1 : kind === 'FLAME' ? 3 : kind === 'EMBER' ? 4 : 2;
    this.group.add(mesh);
    this.disposables.push(geo, mat, quad);
    this.layers.push({ mesh, fire, lod, misc: miscAttr, seeds });
  }

  /** 0 = out, 1 = full fire. */
  setIntensity(i: number, k: number): void { this.intensity[i] = k < 0 ? 0 : k > 1 ? 1 : k; }
  getIntensity(i: number): number { return this.intensity[i]; }
  /** Steam puffs over a fire being sprayed (0..1). */
  setSteam(i: number, k: number): void { this.steam[i] = k; }
  /** Scales the light pool (0 = off). */
  setLightGain(k: number): void { this.lightGain = k; }
  get count(): number { return this.spots.length; }

  update(dt: number, camera: THREE.Camera): void {
    this.time.value += dt;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const far2 = this.farDist * this.farDist;
    const n = this.spots.length;
    // The two nearest lit fires get the lights.
    let b0 = -1, b1 = -1, d0 = Infinity, d1 = Infinity;
    for (let f = 0; f < n; f++) {
      if (this.intensity[f] < 0.05) continue;
      const s = this.spots[f];
      const d = (s.x - cx) ** 2 + (s.y - cy) ** 2 + (s.z - cz) ** 2;
      if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = f; } else if (d < d1) { d1 = d; b1 = f; }
    }
    const pick = [b0, b1];
    const t = this.time.value;
    for (let li = 0; li < 2; li++) {
      const l = this.lights[li], f = pick[li];
      if (f < 0) { l.intensity = 0; continue; }
      const s = this.spots[f], sc = s.scale ?? 1;
      l.position.set(s.x, s.y + 1.6 * sc, s.z);
      const fl = 0.85 + 0.15 * Math.sin(t * 11 + li * 2.1) * Math.sin(t * 6.3 + f);
      l.intensity = 22 * sc * this.intensity[f] * fl * this.lightGain;
      l.distance = 20 + 8 * sc;
    }
    for (const L of this.layers) {
      const arr = L.misc.array as Float32Array;
      for (let i = 0; i < L.fire.length; i++) {
        const f = L.fire[i], s = this.spots[f];
        let k = this.intensity[f];
        if (s.ambient) { const dx = s.x - cx, dz = s.z - cz; const d = Math.sqrt(dx * dx + dz * dz); k *= d < 6 ? 0 : d > 14 ? 1 : (d - 6) / 8; }
        if (L.lod[i] === 1) {
          const d = (s.x - cx) ** 2 + (s.z - cz) ** 2;
          if (d > far2) k = 0;
        }
        arr[i * 4 + 1] = k;
        arr[i * 4 + 2] = this.steam[f];
      }
      L.misc.needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    for (const l of this.lights) l.dispose();
  }
}
