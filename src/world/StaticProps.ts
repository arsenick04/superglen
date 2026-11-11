import * as THREE from 'three';
import type { Physics, StaticBodyHandle } from '../core/Physics';

/**
 * Helpers for static level geometry: one call = matching visual mesh + fixed collider.
 *
 * Positions are the CENTER of the shape (a 1 m tall box standing on the ground has y = 0.5).
 * Rotations are Euler angles in radians [x, y, z] (order XYZ), e.g. a ramp: rotation [-0.3, 0, 0].
 *
 * Example (in a world builder):
 *   const props = new StaticProps(scene, physics);
 *   props.box({ size: [2, 1, 2], position: [4, 0.5, -6], color: 0xffc94d });
 *   props.cylinder({ radius: 0.3, height: 3, position: [-5, 1.5, -8], color: 0xe85d75 });
 */

export type Vec3Tuple = readonly [number, number, number];

export interface BoxProp {
  size: Vec3Tuple; // full width (x), height (y), depth (z)
  position: Vec3Tuple;
  rotation?: Vec3Tuple;
  color?: THREE.ColorRepresentation;
  /** Defaults: castShadow true, receiveShadow true. */
  castShadow?: boolean;
}

export interface CylinderProp {
  radius: number;
  height: number;
  position: Vec3Tuple;
  rotation?: Vec3Tuple;
  color?: THREE.ColorRepresentation;
  castShadow?: boolean;
}

export interface StaticProp extends StaticBodyHandle {
  mesh: THREE.Mesh;
}

export class StaticProps {
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1); // scaled per prop
  private readonly cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 24); // scaled per prop
  private readonly euler = new THREE.Euler();
  private readonly quat = new THREE.Quaternion();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
  ) {}

  /** Shared material per colour (keeps draw-state changes and memory low). */
  material(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
    const key = new THREE.Color(color).getHexString();
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 });
      this.materials.set(key, m);
    }
    return m;
  }

  box(p: BoxProp): StaticProp {
    const [w, h, d] = p.size;
    const mesh = new THREE.Mesh(this.boxGeometry, this.material(p.color ?? 0xffffff));
    mesh.scale.set(w, h, d);
    const rot = this.place(mesh, p.position, p.rotation, p.castShadow);
    const handle = this.physics.addFixedCuboid(
      { x: w / 2, y: h / 2, z: d / 2 },
      { x: p.position[0], y: p.position[1], z: p.position[2] },
      rot,
    );
    return { mesh, ...handle };
  }

  cylinder(p: CylinderProp): StaticProp {
    const mesh = new THREE.Mesh(this.cylinderGeometry, this.material(p.color ?? 0xffffff));
    mesh.scale.set(p.radius, p.height, p.radius);
    const rot = this.place(mesh, p.position, p.rotation, p.castShadow);
    const handle = this.physics.addFixedCylinder(
      p.height / 2,
      p.radius,
      { x: p.position[0], y: p.position[1], z: p.position[2] },
      rot,
    );
    return { mesh, ...handle };
  }

  private place(
    mesh: THREE.Mesh,
    position: Vec3Tuple,
    rotation: Vec3Tuple | undefined,
    castShadow = true,
  ): { x: number; y: number; z: number; w: number } | undefined {
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    let rot: { x: number; y: number; z: number; w: number } | undefined;
    if (rotation) {
      this.euler.set(rotation[0], rotation[1], rotation[2]);
      this.quat.setFromEuler(this.euler);
      mesh.quaternion.copy(this.quat);
      rot = { x: this.quat.x, y: this.quat.y, z: this.quat.z, w: this.quat.w };
    }
    // Static: compute the matrix once and stop per-frame matrix updates.
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    return rot;
  }
}
