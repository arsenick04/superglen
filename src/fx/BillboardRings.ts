import * as THREE from 'three';

interface Flash {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  radius: number;
  opacity: number;
  active: boolean;
}

/**
 * Pooled expanding rings that always face the camera (laser hit, shield reflect, ring pass, tamed enemy).
 * Fixed pool, shared geometry, no allocation per spawn. The oldest ring is recycled when the pool is full.
 * Idle rings are parked far below the world and hidden.
 */
export class BillboardRings {
  private readonly flashes: Flash[] = [];
  private next = 0;
  private warming = false;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    count = 8,
  ) {
    const geo = new THREE.RingGeometry(0.76, 1, 40);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd23f,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.flashes.push({ mesh, mat, age: 0, duration: 1, radius: 1, opacity: 1, active: false });
    }
  }

  spawn(x: number, y: number, z: number, radius: number, duration: number, color: number, opacity = 0.95): void {
    const f = this.flashes[this.next];
    this.next = (this.next + 1) % this.flashes.length;
    f.active = true;
    f.age = 0;
    f.duration = duration;
    f.radius = radius;
    f.opacity = opacity;
    f.mat.color.setHex(color);
    f.mat.opacity = opacity;
    f.mesh.position.set(x, y, z);
    f.mesh.scale.setScalar(0.05);
    f.mesh.quaternion.copy(this.camera.quaternion);
    f.mesh.visible = true;
  }

  clear(): void {
    for (const f of this.flashes) {
      f.active = false;
      f.mesh.visible = false;
    }
  }

  /** Show every ring for one shader pre-warm frame. */
  warm(on: boolean): void {
    this.warming = on;
    for (const f of this.flashes) f.mesh.visible = on || f.active;
  }

  update(dt: number): void {
    for (const f of this.flashes) {
      if (!f.active) continue;
      f.age += dt;
      const t = f.age / f.duration;
      if (t >= 1) {
        f.active = false;
        f.mesh.visible = this.warming;
        continue;
      }
      const ease = 1 - (1 - t) * (1 - t);
      f.mesh.scale.setScalar(Math.max(0.05, f.radius * ease));
      f.mat.opacity = f.opacity * (1 - t * t);
      f.mesh.quaternion.copy(this.camera.quaternion);
    }
  }
}
