import * as THREE from 'three';
import { enemyModels } from './EnemyModels';
import { addRimFlash, type RimFlash } from './BossLook';

/** One visual for the Bank sighting and the night battle. The simple figure covers a slow or missing GLB. */
export class EagleVisual {
  readonly group = new THREE.Group();
  private readonly leftWing = new THREE.Group();
  private readonly rightWing = new THREE.Group();
  private readonly blueLight = new THREE.PointLight(0x58b8ff, 0, 5);
  private readonly redLight = new THREE.PointLight(0xff6e4a, 0, 5);

  private readonly flap = { value: 0 };
  /** Hit flash (0..1, decays in `update`); the cool rim light is always on. */
  rim: RimFlash | null = null;
  private body: THREE.Object3D | null = null;
  private hit = 0;
  private lastT = 0;

  constructor() {
    const model = enemyModels.geometry('elang_belang', 3.4, true);
    const mat = enemyModels.material('elang_belang');
    if (model && mat) {
      // The supplied GLB is unrigged. Bend only its outer wing vertices on the GPU;
      // keep the textured body stable without rebuilding geometry each frame.
      const animated = mat.clone();
      const width = model.boundingBox!.max.x;
      animated.onBeforeCompile = (shader) => {
        shader.uniforms.eagleFlap = this.flap;
        shader.vertexShader = 'uniform float eagleFlap;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float wingWeight = smoothstep(${(width * 0.27).toFixed(4)}, ${(width * 0.85).toFixed(4)}, abs(position.x));
          transformed.y += eagleFlap * wingWeight * abs(position.x);
        `);
      };
      animated.customProgramCacheKey = () => 'eagle-wing-flap-v1';
      this.rim = addRimFlash(animated, 0x9ad8ff, 0.7);
      const mesh = new THREE.Mesh(model, animated);
      mesh.frustumCulled = false;
      this.body = mesh;
      this.group.add(mesh);
    }
    else {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf7d671 }));
      body.scale.set(0.8, 1.25, 0.7);
      this.group.add(body);
      const wing = new THREE.ConeGeometry(0.6, 2.8, 4);
      this.leftWing.add(new THREE.Mesh(wing, new THREE.MeshStandardMaterial({ color: 0x4dabf7, side: THREE.DoubleSide })));
      this.rightWing.add(new THREE.Mesh(wing, new THREE.MeshStandardMaterial({ color: 0xff644e, side: THREE.DoubleSide })));
      this.leftWing.position.x = -0.6;
      this.rightWing.position.x = 0.6;
      this.leftWing.rotation.z = Math.PI / 2;
      this.rightWing.rotation.z = -Math.PI / 2;
      this.group.add(this.leftWing, this.rightWing);
    }
    this.blueLight.position.set(-1.3, 0.2, 0);
    this.redLight.position.set(1.3, 0.2, 0);
    this.group.add(this.blueLight, this.redLight);
  }

  /** A small squash and flash (a laser touch): no violence, just a bonk. */
  bonk(): void {
    this.hit = 1;
  }

  update(t: number, warning: 'ice' | 'fire' | null, heading = Math.sin(t * 0.65) * 0.35, bank = 0): void {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    this.hit = Math.max(0, this.hit - dt * 3.2);
    if (this.rim) this.rim.flash.value = this.hit;
    if (this.body) {
      // Idle polish: a gentle float, a slow breathing swell and a small squash after a hit.
      const sq = this.hit * this.hit;
      this.body.position.y = Math.sin(t * 2.3) * 0.14;
      this.body.rotation.x = Math.sin(t * 1.7) * 0.05;
      this.body.scale.set(1 + sq * 0.14 + Math.sin(t * 2.3) * 0.012, 1 - sq * 0.16 + Math.sin(t * 2.3 + 1) * 0.015, 1 + sq * 0.14);
    }
    this.group.rotation.y = heading;
    this.group.rotation.z = bank;
    this.flap.value = Math.sin(t * 6) * 0.28;
    this.leftWing.rotation.x = Math.sin(t * 5) * 0.35;
    this.rightWing.rotation.x = -Math.sin(t * 5) * 0.35;
    this.blueLight.intensity = warning === 'ice' ? 2.2 + Math.sin(t * 18) * 0.8 : 0;
    this.redLight.intensity = warning === 'fire' ? 2.2 + Math.sin(t * 18) * 0.8 : 0;
  }
}
