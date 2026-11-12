import * as THREE from 'three';
import { Quality } from '../../core/Quality';
import type { Player } from '../../player/Player';

interface Preset {
  bg: THREE.Color;
  sky: THREE.Color;
  ground: THREE.Color;
  hemi: number;
  sun: number;
  fogNear: number;
  fogFar: number;
}

const mk = (bg: number, sky: number, ground: number, hemi: number, sun: number, fogNear: number, fogFar: number): Preset => ({
  bg: new THREE.Color(bg),
  sky: new THREE.Color(sky),
  ground: new THREE.Color(ground),
  hemi,
  sun,
  fogNear,
  fogFar,
});

/** 0 = daylight street, 1 = dim blue hall, 2 = bright laboratory. */
export type Zone = 0 | 1 | 2;

/**
 * Lights and sky of the chapter: one hemisphere light + one sun (the only shadow caster) + the flashlight.
 * The mood follows the player's zone with a smooth blend (about 0.6 s); nothing is ever pitch black.
 */
export class Atmosphere {
  readonly hemi = new THREE.HemisphereLight(0xcfeeff, 0x6fae4f, 1.4);
  readonly sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
  private readonly sunOffset = new THREE.Vector3(12, 22, 8);
  private readonly w = [1, 0, 0];
  private zone: Zone = 0;
  private readonly presets: Preset[];
  private readonly bg = new THREE.Color();
  private readonly fog: THREE.Fog;
  private readonly tmp = new THREE.Color();
  /** 0..1 how much of the dim hall mood is active (the flashlight scales with it). */
  hallAmount = 0;

  constructor(
    private readonly scene: THREE.Scene,
    root: THREE.Object3D,
  ) {
    this.presets = [
      mk(0x8fd3ff, 0xcfeeff, 0x6fae4f, 1.4, 2.6, Quality.cameraFar * 0.45, Quality.cameraFar * 0.95),
      mk(0x1a2147, 0x8da0ff, 0x4a4678, 0.95, 0, 6, 34),
      mk(0x2a4a78, 0xeaf4ff, 0xb9c9ea, 1.9, 0, 30, 90),
    ];
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = Quality.shadows;
    if (Quality.shadows) {
      const s = this.sun.shadow;
      s.mapSize.set(Quality.shadowMapSize, Quality.shadowMapSize);
      const a = Quality.shadowArea;
      s.camera.left = -a;
      s.camera.right = a;
      s.camera.top = a;
      s.camera.bottom = -a;
      s.camera.near = 1;
      s.camera.far = 80;
      s.bias = -0.0005;
      s.normalBias = 0.03;
    }
    root.add(this.hemi, this.sun, this.sun.target);
    this.fog = new THREE.Fog(0x8fd3ff, this.presets[0].fogNear, this.presets[0].fogFar);
    scene.background = this.bg.copy(this.presets[0].bg);
    scene.fog = this.fog;
  }

  setZone(z: Zone): void {
    this.zone = z;
  }

  get currentZone(): Zone {
    return this.zone;
  }

  /** Snap the mood without blending (level start in the lab). */
  snap(z: Zone): void {
    this.zone = z;
    for (let i = 0; i < 3; i++) this.w[i] = i === z ? 1 : 0;
    this.apply();
  }

  update(dt: number, focus: THREE.Vector3): void {
    const k = 1 - Math.exp(-4 * dt);
    for (let i = 0; i < 3; i++) this.w[i] += ((i === this.zone ? 1 : 0) - this.w[i]) * k;
    this.apply();
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);
  }

  private apply(): void {
    const P = this.presets;
    const w = this.w;
    this.bg.setRGB(0, 0, 0);
    this.hemi.color.setRGB(0, 0, 0);
    this.hemi.groundColor.setRGB(0, 0, 0);
    let hemi = 0;
    let sun = 0;
    let near = 0;
    let far = 0;
    for (let i = 0; i < 3; i++) {
      const p = P[i];
      const wi = w[i];
      this.bg.add(this.tmp.copy(p.bg).multiplyScalar(wi));
      this.hemi.color.add(this.tmp.copy(p.sky).multiplyScalar(wi));
      this.hemi.groundColor.add(this.tmp.copy(p.ground).multiplyScalar(wi));
      hemi += p.hemi * wi;
      sun += p.sun * wi;
      near += p.fogNear * wi;
      far += p.fogFar * wi;
    }
    this.hemi.intensity = hemi;
    this.sun.intensity = sun;
    this.fog.color.copy(this.bg);
    this.fog.near = near;
    this.fog.far = far;
    (this.scene.background as THREE.Color).copy(this.bg);
    this.hallAmount = w[1];
  }
}

/**
 * Phone flashlight: a warm point light (no shadow) in front of the player plus an additive cone mesh
 * (the beam). The light always exists (adding/removing lights would recompile every material); only its
 * intensity changes. On the low preset the cone is slimmer and the light has a shorter reach.
 */
export class Flashlight {
  readonly group = new THREE.Group();
  private readonly light: THREE.PointLight;
  private readonly cone: THREE.Mesh;
  private readonly coneMat: THREE.MeshBasicMaterial;
  private amount = 0;
  enabled = false;

  constructor(root: THREE.Object3D) {
    const len = 6;
    const geo = new THREE.ConeGeometry(Quality.level === 'low' ? 1.5 : 1.9, len, 20, 1, true);
    geo.rotateX(-Math.PI / 2); // apex at -Z ...
    geo.translate(0, 0, len / 2); // ... moved to the origin, opening toward +Z
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getZ(i) / len; // 0 at the lamp, 1 at the far end
      const f = 0.5 * (1 - t) * (1 - t) + (t < 0.02 ? 0.1 : 0);
      colors[i * 3] = 1 * f;
      colors[i * 3 + 1] = 0.82 * f;
      colors[i * 3 + 2] = 0.45 * f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.coneMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
      opacity: 0,
    });
    this.cone = new THREE.Mesh(geo, this.coneMat);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 4;
    this.cone.visible = false;
    this.light = new THREE.PointLight(0xffd9a0, 0, Quality.level === 'low' ? 7 : 9, 1.6);
    this.light.position.set(0, 0.1, 2.1);
    this.group.add(this.cone, this.light);
    root.add(this.group);
  }

  get on(): boolean {
    return this.amount > 0.5;
  }

  /** `scale` 0..1 lets the caller dim it outside the hall. */
  update(dt: number, player: Player, scale: number): void {
    const want = this.enabled ? scale : 0;
    this.amount += (want - this.amount) * (1 - Math.exp(-5 * dt));
    const a = this.amount;
    this.cone.visible = a > 0.02;
    this.coneMat.opacity = a;
    this.light.intensity = a * 14;
    const p = player.visualPosition;
    const yaw = player.object.rotation.y;
    this.group.position.set(p.x + Math.sin(yaw) * 0.3, p.y - 0.05, p.z + Math.cos(yaw) * 0.3);
    this.group.rotation.set(0.1, yaw, 0, 'YXZ');
  }
}
