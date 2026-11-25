import * as THREE from 'three';

/**
 * BATTLE FX: the shared "juice" of every fight (hit stars, cartoon impact rings, squash and stretch, shield bounce, laser beam,
 * tamed poof with hearts, pickup sparkle, landing dust, soft drop shadows). Pixar-ish and gentle: nothing here is violent.
 *
 * Everything is pooled and drawn with a few shared materials, no allocation per call or per frame:
 *  - ONE Points draw call for all particles (stars, hearts, soft sparks, dust puffs; a 4-cell texture atlas, per-particle size, spin, fade),
 *  - a pool of camera-facing decals (cartoon ring / glow disc),
 *  - a pool of laser beams (glowing core + soft outer glow + muzzle flash + splash),
 *  - one InstancedMesh of blob shadows,
 *  - a tiny squash and stretch tracker.
 *
 * Owned by `BattleMode` (`ctx.battle.fx`); a fight calls e.g. `ctx.battle.fx.hit(x, y, z)`. Positions are world metres.
 */
export const BattleFxConfig = {
  particles: 320,
  decals: 10,
  beams: 3,
  shadows: 16,
} as const;

const CELL_STAR = 0;
const CELL_HEART = 1;
const CELL_SPARK = 2;
const CELL_PUFF = 3;

const GOLD = 0xffd23f;
const WARM = 0xffa14a;
const PINK = 0xff8fb1;
const SKY = 0x7fd8ff;

const atlas = (): THREE.CanvasTexture => {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  // 0: a chubby five point star with a darker outline (multiplied by the particle colour).
  g.save();
  g.translate(S * 0.5, S * 0.53);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = (i % 2 === 0 ? 0.44 : 0.2) * S;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = S * 0.1;
  g.strokeStyle = 'rgb(150,150,150)';
  g.stroke();
  g.fillStyle = '#fff';
  g.fill();
  g.restore();
  // 1: a heart.
  g.save();
  g.translate(S * 1.5, S * 0.5);
  g.beginPath();
  g.moveTo(0, S * 0.36);
  g.bezierCurveTo(-S * 0.62, -S * 0.02, -S * 0.3, -S * 0.5, 0, -S * 0.18);
  g.bezierCurveTo(S * 0.3, -S * 0.5, S * 0.62, -S * 0.02, 0, S * 0.36);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = S * 0.09;
  g.strokeStyle = 'rgb(150,150,150)';
  g.stroke();
  g.fillStyle = '#fff';
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.0)';
  g.restore();
  // 2: soft glow dot.
  let gr = g.createRadialGradient(S * 2.5, S * 0.5, 0, S * 2.5, S * 0.5, S * 0.5);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(S * 2, 0, S, S);
  // 3: a puff of cloud (three overlapping soft blobs).
  const blobs = [[0.5, 0.52, 0.34], [0.34, 0.6, 0.24], [0.66, 0.6, 0.24], [0.5, 0.36, 0.22]];
  for (const [bx, by, br] of blobs) {
    gr = g.createRadialGradient(S * (3 + bx), S * by, 0, S * (3 + bx), S * by, S * br);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.65, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(S * 3, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const ringTexture = (): THREE.CanvasTexture => {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 16;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
  g.stroke();
  // Comic "pow" ticks.
  g.lineCap = 'round';
  g.lineWidth = 7;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(S / 2 + Math.cos(a) * S * 0.455, S / 2 + Math.sin(a) * S * 0.455);
    g.lineTo(S / 2 + Math.cos(a) * S * 0.495, S / 2 + Math.sin(a) * S * 0.495);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const discTexture = (): THREE.CanvasTexture => {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const POINT_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute float aCell;
attribute float aRot;
uniform float uK;
varying vec3 vCol;
varying float vA;
varying float vCell;
varying float vRot;
void main() {
  vCol = color;
  vA = aAlpha;
  vCell = aCell;
  vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aAlpha > 0.003 ? max(1.0, aSize * uK / max(0.2, -mv.z)) : 0.0;
}`;
const POINT_FRAG = `
uniform sampler2D uMap;
varying vec3 vCol;
varying float vA;
varying float vCell;
varying float vRot;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  vec4 t = texture2D(uMap, vec2((p.x + vCell) * 0.25, 1.0 - p.y));
  float a = t.a * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol * t.rgb, a);
}`;

interface Decal {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  dur: number;
  r0: number;
  r1: number;
  op: number;
  active: boolean;
}

interface Beam {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  halo: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
  age: number;
  dur: number;
  len: number;
  width: number;
  muzzle: Decal | null;
  active: boolean;
}

interface Squash {
  obj: THREE.Object3D;
  bx: number;
  by: number;
  bz: number;
  age: number;
  dur: number;
  power: number;
  active: boolean;
}

/** A shadow source: ground contact point, radius in metres, strength 0..1; null hides it this frame. */
export interface ShadowSource {
  x: number;
  y: number;
  z: number;
  r: number;
  a: number;
}

interface ShadowEntry {
  src: () => ShadowSource | null;
}

export class BattleFx {
  readonly root = new THREE.Group();
  private readonly n = BattleFxConfig.particles;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly cell: Float32Array;
  private readonly rot: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly spin: Float32Array;
  private readonly baseA: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly points: THREE.Points;
  private readonly pointMat: THREE.ShaderMaterial;
  private next = 0;
  private alive = 0;
  private readonly c = new THREE.Color();
  private readonly decals: Decal[] = [];
  private nextDecal = 0;
  private readonly ringTex = ringTexture();
  private readonly discTex = discTexture();
  private readonly beams: Beam[] = [];
  private nextBeam = 0;
  private readonly squashes: Squash[] = [];
  private readonly blobs: THREE.InstancedMesh;
  private readonly blobMat: THREE.MeshBasicMaterial;
  private readonly shadowList: ShadowEntry[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly sz = new THREE.Vector2();
  private reduced = false;

  constructor(
    scene: THREE.Object3D,
    private readonly camera: THREE.Camera,
  ) {
    const n = this.n;
    this.pos = new Float32Array(n * 3).fill(-1000);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.cell = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.baseA = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aCell', new THREE.BufferAttribute(this.cell, 1));
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1));
    this.pointMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas() }, uK: { value: 600 } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geo, this.pointMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const target = renderer.getRenderTarget();
      const h = target ? target.height : renderer.getDrawingBufferSize(this.sz).y;
      this.pointMat.uniforms.uK.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    };
    this.root.add(this.points);

    const plane = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < BattleFxConfig.decals; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: this.ringTex, color: GOLD, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(plane, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      this.root.add(mesh);
      this.decals.push({ mesh, mat, age: 0, dur: 1, r0: 0.1, r1: 1, op: 1, active: false });
    }

    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    cyl.rotateX(Math.PI / 2);
    cyl.translate(0, 0, 0.5);
    const mk = (color: number, op: number): [THREE.Mesh, THREE.MeshBasicMaterial] => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(cyl, mat);
      mesh.frustumCulled = false;
      return [mesh, mat];
    };
    for (let i = 0; i < BattleFxConfig.beams; i++) {
      const [halo, haloMat] = mk(0xff9a3d, 0.22);
      const [glow, glowMat] = mk(0xffc24a, 0.5);
      const [core, coreMat] = mk(0xffffff, 1);
      halo.renderOrder = 8;
      glow.renderOrder = 9;
      core.renderOrder = 10;
      const group = new THREE.Group();
      group.add(halo, glow, core);
      group.visible = false;
      this.root.add(group);
      this.beams.push({ group, core, glow, halo, coreMat, glowMat, haloMat, age: 0, dur: 0.2, len: 1, width: 0.1, muzzle: null, active: false });
    }

    for (let i = 0; i < 8; i++) this.squashes.push({ obj: this.root, bx: 1, by: 1, bz: 1, age: 0, dur: 1, power: 0, active: false });

    const blobGeo = new THREE.CircleGeometry(1, 20);
    blobGeo.rotateX(-Math.PI / 2);
    this.blobMat = new THREE.MeshBasicMaterial({ map: this.discTex, color: 0x1a1020, transparent: true, opacity: 0.38, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.blobs = new THREE.InstancedMesh(blobGeo, this.blobMat, BattleFxConfig.shadows);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.root.add(this.blobs);

    scene.add(this.root);
  }

  /** "Kurangi guncangan": fewer particles, no squash. */
  setReduced(on: boolean): void {
    this.reduced = on;
  }

  // ---- particles ---------------------------------------------------------------------------------------------------

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, cell: number, color: number, life: number, s0: number, s1: number, grav = 0, drag = 0, spin = 0, a = 1): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    if (this.life[i] <= 0) this.alive++;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.c.setHex(color);
    this.col[i3] = this.c.r;
    this.col[i3 + 1] = this.c.g;
    this.col[i3 + 2] = this.c.b;
    this.cell[i] = cell;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.size[i] = s0;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.spin[i] = spin;
    this.rot[i] = Math.random() * 6.283;
    this.baseA[i] = a;
    this.alpha[i] = a;
  }

  /** Cartoon hit: a burst of chubby stars and sparks plus a pop ring. `scale` ~1 for a laser hit. */
  hit(x: number, y: number, z: number, scale = 1, color = GOLD): void {
    const k = this.reduced ? 0.6 : 1;
    const ns = Math.round(7 * scale * k) + 1;
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * 6.283 + Math.random() * 0.6;
      const up = 0.3 + Math.random() * 0.8;
      const sp = (2.4 + Math.random() * 2.2) * scale;
      this.emit(x, y, z, Math.cos(a) * sp, up * sp * 0.8, Math.sin(a) * sp, CELL_STAR, i % 3 === 0 ? 0xffffff : color, 0.55 + Math.random() * 0.3, 0.2 * scale, 0.5 * scale, 4, 2.2, (Math.random() - 0.5) * 9);
    }
    const nd = Math.round(8 * k);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * 6.283;
      const sp = (3 + Math.random() * 3) * scale;
      this.emit(x, y, z, Math.cos(a) * sp, (Math.random() - 0.2) * sp, Math.sin(a) * sp, CELL_SPARK, i % 2 ? WARM : 0xfff2b0, 0.35 + Math.random() * 0.25, 0.3 * scale, 0.08, 2, 3);
    }
    this.ring(x, y, z, 0.9 * scale, 0.32, color);
    this.glow(x, y, z, 1.1 * scale, 0.16, 0xfff2b0);
  }

  /** A camera-facing cartoon ring that pops outwards ("pow"). */
  ring(x: number, y: number, z: number, radius: number, dur = 0.35, color = GOLD, opacity = 0.95): void {
    this.decal(x, y, z, this.ringTex, radius * 0.25, radius, dur, color, opacity);
  }

  /** A soft glow flash at a point. */
  glow(x: number, y: number, z: number, radius: number, dur = 0.2, color = 0xffffff, opacity = 0.9): void {
    this.decal(x, y, z, this.discTex, radius * 0.5, radius, dur, color, opacity);
  }

  private decal(x: number, y: number, z: number, map: THREE.Texture, r0: number, r1: number, dur: number, color: number, op: number): Decal {
    const d = this.decals[this.nextDecal];
    this.nextDecal = (this.nextDecal + 1) % this.decals.length;
    d.active = true;
    d.age = 0;
    d.dur = dur;
    d.r0 = r0;
    d.r1 = r1;
    d.op = op;
    d.mat.map = map;
    d.mat.color.setHex(color);
    d.mat.opacity = op;
    d.mesh.position.set(x, y, z);
    d.mesh.quaternion.copy(this.camera.quaternion);
    d.mesh.scale.setScalar(r0);
    d.mesh.visible = true;
    return d;
  }

  /** The shield threw something back: a blue-white flash with a ring and little stars. */
  shield(x: number, y: number, z: number, scale = 1): void {
    this.glow(x, y, z, 1.5 * scale, 0.22, SKY);
    this.ring(x, y, z, 1.3 * scale, 0.35, 0xffffff);
    const n = this.reduced ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + Math.random() * 0.5;
      this.emit(x, y, z, Math.cos(a) * 2.4 * scale, 1 + Math.random(), Math.sin(a) * 2.4 * scale, i % 2 ? CELL_STAR : CELL_SPARK, i % 2 ? SKY : 0xffffff, 0.5, 0.18 * scale, 0.42 * scale, 1, 2, (Math.random() - 0.5) * 6);
    }
  }

  /** The enemy is tamed: a happy "poof" of cloud puffs, sparkly stars and floating hearts. No violence, just giggles. */
  poof(x: number, y: number, z: number, scale = 1): void {
    const k = this.reduced ? 0.6 : 1;
    const np = Math.round(9 * k);
    for (let i = 0; i < np; i++) {
      const a = (i / np) * 6.283 + Math.random() * 0.4;
      const sp = (1.5 + Math.random() * 1.2) * scale;
      this.emit(x, y, z, Math.cos(a) * sp, 0.4 + Math.random() * 0.9, Math.sin(a) * sp, CELL_PUFF, i % 2 ? 0xffffff : 0xffe6f1, 0.9 + Math.random() * 0.4, 0.6 * scale, 1.9 * scale, -0.3, 2.2, (Math.random() - 0.5) * 2, 0.9);
    }
    const nh = Math.round(7 * k);
    for (let i = 0; i < nh; i++) {
      const a = Math.random() * 6.283;
      const sp = (0.8 + Math.random() * 1.4) * scale;
      this.emit(x, y + 0.2, z, Math.cos(a) * sp, 2 + Math.random() * 1.8, Math.sin(a) * sp, CELL_HEART, i % 2 ? PINK : 0xff5d8f, 1.3 + Math.random() * 0.5, 0.15 * scale, 0.55 * scale, -0.5, 1.5, (Math.random() - 0.5) * 2);
    }
    const ns = Math.round(8 * k);
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * 6.283;
      const sp = (2.5 + Math.random() * 2.5) * scale;
      this.emit(x, y, z, Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp, i % 2 ? CELL_STAR : CELL_SPARK, i % 3 === 0 ? 0xffffff : i % 3 === 1 ? GOLD : 0x8fe3ff, 0.9 + Math.random() * 0.4, 0.25 * scale, 0.45 * scale, 2.5, 1.2, (Math.random() - 0.5) * 8);
    }
    this.ring(x, y, z, 2.2 * scale, 0.55, 0xffffff, 0.8);
    this.glow(x, y, z, 2.4 * scale, 0.3, 0xfff0c0);
  }

  /** A coin or a heart is picked up: a twinkle that floats up. */
  pickup(x: number, y: number, z: number, kind: 'coin' | 'heart' = 'coin'): void {
    const heart = kind === 'heart';
    this.ring(x, y, z, 0.7, 0.3, heart ? PINK : GOLD, 0.9);
    this.glow(x, y, z, 0.8, 0.2, heart ? 0xffd0e0 : 0xfff2b0);
    const n = this.reduced ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283;
      this.emit(x, y, z, Math.cos(a) * 1.3, 1.6 + Math.random() * 1.2, Math.sin(a) * 1.3, heart && i % 2 === 0 ? CELL_HEART : CELL_STAR, heart ? PINK : GOLD, 0.7 + Math.random() * 0.3, 0.12, 0.34, -0.6, 1.5, (Math.random() - 0.5) * 6);
    }
  }

  /** Landing dust: soft cloud puffs spreading along the ground. `power` 0..1+. */
  dust(x: number, y: number, z: number, power = 1, color = 0xe8dcc0): void {
    const n = Math.round((this.reduced ? 4 : 7) * Math.min(1.5, 0.5 + power * 0.7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + Math.random() * 0.5;
      const sp = (1.2 + Math.random() * 1.2) * (0.6 + power * 0.5);
      this.emit(x + Math.cos(a) * 0.3, y + 0.12, z + Math.sin(a) * 0.3, Math.cos(a) * sp, 0.25 + Math.random() * 0.4, Math.sin(a) * sp, CELL_PUFF, color, 0.55 + Math.random() * 0.25, 0.3, 0.9 + power * 0.5, -0.4, 3, (Math.random() - 0.5) * 2, 0.8);
    }
  }

  /** A little star dizzy-puff at a point (cheap pop used for steps and small hits). */
  puff(x: number, y: number, z: number, scale = 1, color = 0xffffff): void {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 6.283;
      this.emit(x, y, z, Math.cos(a) * scale, 0.5 + Math.random(), Math.sin(a) * scale, CELL_PUFF, color, 0.6, 0.3 * scale, 0.8 * scale, -0.3, 2, 0, 0.8);
    }
  }

  // ---- laser -------------------------------------------------------------------------------------------------------

  /**
   * A cartoon laser beam from `from` to `to`: a hot white core, a golden glow and a soft outer halo, a muzzle flash at the start
   * and a small splash at the end. `time` seconds (it fades and thins while it lives).
   */
  beam(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, time = 0.22, width = 0.11, splash = true): void {
    const b = this.beams[this.nextBeam];
    this.nextBeam = (this.nextBeam + 1) % this.beams.length;
    b.active = true;
    b.age = 0;
    b.dur = time;
    b.width = width;
    this.v1.set(tx - fx, ty - fy, tz - fz);
    b.len = Math.max(0.01, this.v1.length());
    b.group.position.set(fx, fy, fz);
    b.group.lookAt(tx, ty, tz);
    b.group.visible = true;
    this.glow(fx, fy, fz, 0.7, time * 0.9, 0xfff2b0, 1);
    if (splash) {
      this.glow(tx, ty, tz, 0.9, time * 1.1, 0xffe08a, 0.9);
      this.ring(tx, ty, tz, 0.8, time * 1.4, GOLD, 0.9);
      const n = this.reduced ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283;
        const sp = 2 + Math.random() * 2.5;
        this.emit(tx, ty, tz, Math.cos(a) * sp, Math.random() * sp * 0.7, Math.sin(a) * sp, CELL_SPARK, i % 2 ? WARM : 0xfff2b0, 0.3 + Math.random() * 0.2, 0.26, 0.06, 2, 3);
      }
    }
  }

  // ---- squash and stretch ------------------------------------------------------------------------------------------

  /**
   * A springy squash and stretch of `obj` (hit: it squashes flat, then wobbles back). Only for objects whose `scale` is not
   * rewritten every frame. `power` ~0.25 is gentle, 0.5 is big.
   */
  squash(obj: THREE.Object3D, power = 0.3, dur = 0.5): void {
    if (this.reduced) power *= 0.5;
    let s = this.squashes.find((e) => e.active && e.obj === obj);
    if (!s) {
      s = this.squashes.find((e) => !e.active);
      if (!s) return;
      s.bx = obj.scale.x;
      s.by = obj.scale.y;
      s.bz = obj.scale.z;
    }
    s.obj = obj;
    s.active = true;
    s.age = 0;
    s.dur = dur;
    s.power = power;
  }

  // ---- drop shadows ------------------------------------------------------------------------------------------------

  /** A soft blob shadow under something that moves; `src` is read every frame. Returns the remover. */
  addShadow(src: () => ShadowSource | null): () => void {
    const e: ShadowEntry = { src };
    if (this.shadowList.length < BattleFxConfig.shadows) this.shadowList.push(e);
    return () => {
      const i = this.shadowList.indexOf(e);
      if (i >= 0) this.shadowList.splice(i, 1);
    };
  }

  /** Forget the blob shadows only (a poof may still be playing). */
  clearShadows(): void {
    this.shadowList.length = 0;
    this.blobs.count = 0;
  }

  /** Forget shadows and cut running effects (end of a fight or a level). */
  clear(): void {
    this.shadowList.length = 0;
    this.blobs.count = 0;
    for (const d of this.decals) {
      d.active = false;
      d.mesh.visible = false;
    }
    for (const b of this.beams) {
      b.active = false;
      b.group.visible = false;
    }
    for (const s of this.squashes) {
      if (s.active) s.obj.scale.set(s.bx, s.by, s.bz);
      s.active = false;
    }
    this.life.fill(0);
    this.pos.fill(-1000);
    this.alpha.fill(0);
    this.alive = 0;
    this.touch();
  }

  private touch(): void {
    for (const name of ['position', 'color', 'aSize', 'aAlpha', 'aCell', 'aRot']) this.geo.getAttribute(name).needsUpdate = true;
  }

  // ---- per frame ---------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.alive > 0) {
      let alive = 0;
      for (let i = 0; i < this.n; i++) {
        const l = this.life[i];
        if (l <= 0) continue;
        const nl = l - dt;
        const i3 = i * 3;
        if (nl <= 0) {
          this.life[i] = 0;
          this.alpha[i] = 0;
          this.pos[i3 + 1] = -1000;
          continue;
        }
        this.life[i] = nl;
        alive++;
        const damp = Math.max(0, 1 - this.drag[i] * dt);
        this.vel[i3] *= damp;
        this.vel[i3 + 1] = this.vel[i3 + 1] * damp - this.grav[i] * dt;
        this.vel[i3 + 2] *= damp;
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        this.rot[i] += this.spin[i] * dt;
        const u = 1 - nl / this.maxLife[i];
        // Ease-out growth with a little overshoot at the start (pop), fade in the last 40 percent.
        const e = 1 - (1 - u) * (1 - u);
        this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
        this.alpha[i] = this.baseA[i] * Math.min(1, (1 - u) / 0.4);
      }
      this.alive = alive;
      this.touch();
    }

    for (const d of this.decals) {
      if (!d.active) continue;
      d.age += dt;
      const u = d.age / d.dur;
      if (u >= 1) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      d.mesh.scale.setScalar(d.r0 + (d.r1 - d.r0) * e);
      d.mesh.quaternion.copy(this.camera.quaternion);
      d.mat.opacity = d.op * (1 - u * u);
    }

    for (const b of this.beams) {
      if (!b.active) continue;
      b.age += dt;
      const u = b.age / b.dur;
      if (u >= 1) {
        b.active = false;
        b.group.visible = false;
        continue;
      }
      const w = b.width * (1 - u * 0.7) * (1 + 0.12 * Math.sin(b.age * 90));
      b.core.scale.set(w * 0.45, w * 0.45, b.len);
      b.glow.scale.set(w * 1.3, w * 1.3, b.len);
      b.halo.scale.set(w * 2.8, w * 2.8, b.len);
      const f = 1 - u * u;
      b.coreMat.opacity = f;
      b.glowMat.opacity = 0.5 * f;
      b.haloMat.opacity = 0.22 * f;
    }

    for (const s of this.squashes) {
      if (!s.active) continue;
      s.age += dt;
      const u = s.age / s.dur;
      if (u >= 1) {
        s.obj.scale.set(s.bx, s.by, s.bz);
        s.active = false;
        continue;
      }
      // Damped spring: starts squashed (negative), rebounds taller, settles.
      const k = -Math.exp(-5.5 * u) * Math.cos(u * 17) * s.power;
      const sy = 1 + k;
      const sxz = 1 - k * 0.55;
      s.obj.scale.set(s.bx * sxz, s.by * sy, s.bz * sxz);
    }

    // Blob shadows.
    let cnt = 0;
    for (const e of this.shadowList) {
      const s = e.src();
      if (!s || s.a <= 0.01) continue;
      this.m4.compose(this.v2.set(s.x, s.y + 0.03, s.z), this.q.identity(), this.v1.set(s.r, 1, s.r));
      this.blobs.setMatrixAt(cnt++, this.m4);
    }
    this.blobs.count = cnt;
    if (cnt > 0) this.blobs.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
    this.geo.dispose();
    this.pointMat.uniforms.uMap.value.dispose();
    this.pointMat.dispose();
    this.ringTex.dispose();
    this.discTex.dispose();
    for (const d of this.decals) d.mat.dispose();
    for (const b of this.beams) {
      b.coreMat.dispose();
      b.glowMat.dispose();
      b.haloMat.dispose();
    }
    this.blobs.geometry.dispose();
    this.blobMat.dispose();
  }
}
