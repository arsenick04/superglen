import * as THREE from 'three';

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  radius: number;
  opacity: number;
  active: boolean;
}

/**
 * Pooled expanding flat rings on the ground (stomp shockwave, transform flash).
 * Fixed pool, shared geometry, no per-spawn allocation. The oldest ring is recycled when the pool is full.
 */
export class GroundRings {
  private readonly rings: Ring[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, count = 5) {
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd23f,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.rings.push({ mesh, mat, age: 0, duration: 1, radius: 1, opacity: 1, active: false });
    }
  }

  spawn(x: number, y: number, z: number, radius: number, duration: number, color: number, opacity = 0.9): void {
    const r = this.rings[this.next];
    this.next = (this.next + 1) % this.rings.length;
    r.active = true;
    r.age = 0;
    r.duration = duration;
    r.radius = radius;
    r.opacity = opacity;
    r.mat.color.setHex(color);
    r.mat.opacity = opacity;
    r.mesh.position.set(x, y + 0.04, z);
    r.mesh.scale.setScalar(0.05);
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / r.duration;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const ease = 1 - (1 - t) * (1 - t); // fast start, soft end
      r.mesh.scale.setScalar(Math.max(0.05, r.radius * ease));
      r.mat.opacity = r.opacity * (1 - t);
    }
  }
}
