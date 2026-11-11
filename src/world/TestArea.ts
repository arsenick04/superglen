import * as THREE from 'three';
import type { Physics } from '../core/Physics';
import { Quality } from '../core/Quality';
import { StaticProps } from './StaticProps';

const SKY_COLOR = 0x8fd3ff; // cheerful morning sky
const GROUND_SIZE = 60;

/**
 * Flat test area: 60 x 60 m ground, morning lighting, sun shadows that follow the player.
 * Add obstacles in `buildProps()` using the StaticProps helper.
 */
export class TestArea {
  private sun!: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(12, 22, 8);

  build(scene: THREE.Scene, physics: Physics): void {
    scene.background = new THREE.Color(SKY_COLOR);
    scene.fog = new THREE.Fog(SKY_COLOR, Quality.cameraFar * 0.45, Quality.cameraFar * 0.95);

    this.buildLights(scene);
    this.buildGround(scene, physics);
    this.buildProps(new StaticProps(scene, physics));
  }

  /** Keep the shadow-casting sun centered on the player. Call once per frame. */
  update(focus: THREE.Vector3): void {
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);
  }

  private buildLights(scene: THREE.Scene): void {
    const hemi = new THREE.HemisphereLight(0xcfeeff, 0x6fae4f, 1.4);
    scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
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
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  private buildGround(scene: THREE.Scene, physics: Physics): void {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: makeCheckerTexture(GROUND_SIZE / 4), roughness: 0.95 });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    scene.add(ground);

    // Collider: thick slab whose top face is y = 0.
    physics.addFixedCuboid({ x: GROUND_SIZE / 2, y: 0.5, z: GROUND_SIZE / 2 }, { x: 0, y: -0.5, z: 0 });
  }

  /** Obstacles for the test area (boxes, poles, ramps) go here. */
  protected buildProps(_props: StaticProps): void {
    // Intentionally empty in A1 core; gameplay-dev adds the obstacle course.
  }
}

/** Soft two-tone grass checker (2 m tiles) so movement is easy to perceive on flat ground. */
function makeCheckerTexture(repeat: number): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#86d16a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#7bc75f';
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 4;
  return tex;
}
