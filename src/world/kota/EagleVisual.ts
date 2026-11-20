import * as THREE from 'three';
import { enemyModels } from './EnemyModels';

/** One visual for the Bank sighting and the night battle. The simple figure covers a slow or missing GLB. */
export class EagleVisual {
  readonly group = new THREE.Group();
  private readonly leftWing = new THREE.Group();
  private readonly rightWing = new THREE.Group();
  private readonly blueLight = new THREE.PointLight(0x58b8ff, 0, 5);
  private readonly redLight = new THREE.PointLight(0xff6e4a, 0, 5);

  constructor() {
    const model = enemyModels.geometry('elang_belang', 3.4, true);
    const mat = enemyModels.material('elang_belang');
    if (model && mat) this.group.add(new THREE.Mesh(model, mat));
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

  update(t: number, warning: 'ice' | 'fire' | null): void {
    this.group.rotation.y = Math.sin(t * 0.65) * 0.35;
    this.leftWing.rotation.x = Math.sin(t * 5) * 0.35;
    this.rightWing.rotation.x = -Math.sin(t * 5) * 0.35;
    this.blueLight.intensity = warning === 'ice' ? 2.2 + Math.sin(t * 18) * 0.8 : 0;
    this.redLight.intensity = warning === 'fire' ? 2.2 + Math.sin(t * 18) * 0.8 : 0;
  }
}
