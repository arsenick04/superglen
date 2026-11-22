import * as THREE from 'three';
import { enemyModels } from './EnemyModels';

/** One visual for the Bank sighting and the night battle. The simple figure covers a slow or missing GLB. */
export class EagleVisual {
  readonly group = new THREE.Group();
  private readonly leftWing = new THREE.Group();
  private readonly rightWing = new THREE.Group();
  private readonly blueLight = new THREE.PointLight(0x58b8ff, 0, 5);
  private readonly redLight = new THREE.PointLight(0xff6e4a, 0, 5);

  private readonly flap = { value: 0 };

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
      const mesh = new THREE.Mesh(model, animated);
      mesh.frustumCulled = false;
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

  update(t: number, warning: 'ice' | 'fire' | null, heading = Math.sin(t * 0.65) * 0.35, bank = 0): void {
    this.group.rotation.y = heading;
    this.group.rotation.z = bank;
    this.flap.value = Math.sin(t * 6) * 0.28;
    this.leftWing.rotation.x = Math.sin(t * 5) * 0.35;
    this.rightWing.rotation.x = -Math.sin(t * 5) * 0.35;
    this.blueLight.intensity = warning === 'ice' ? 2.2 + Math.sin(t * 18) * 0.8 : 0;
    this.redLight.intensity = warning === 'fire' ? 2.2 + Math.sin(t * 18) * 0.8 : 0;
  }
}
