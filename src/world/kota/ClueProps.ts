import * as THREE from 'three';
import { box, cone, cyl, merge } from './ColorMesh';

/** The clue board: a wooden post, a cream board in a red frame with three "written" lines, a gold star on top (one merged mesh). */
function paperGeo(): THREE.BufferGeometry {
  return merge([
    { g: cyl(0.05, 0.06, 1.1, 6), c: 0x8a5a33, p: [0, 0.55, 0] },
    { g: box(1.0, 0.7, 0.06), c: 0xd9453b, p: [0, 1.28, -0.01] },
    { g: box(0.88, 0.58, 0.06), c: 0xfff6dc, p: [0, 1.28, 0.012] },
    { g: box(0.6, 0.07, 0.02), c: 0x6b5a45, p: [0, 1.42, 0.05] },
    { g: box(0.7, 0.07, 0.02), c: 0x6b5a45, p: [0, 1.28, 0.05] },
    { g: box(0.45, 0.07, 0.02), c: 0x6b5a45, p: [-0.12, 1.14, 0.05] },
    { g: cone(0.17, 0.12, 5), c: 0xffc94d, p: [0, 1.78, 0.02], r: [Math.PI / 2, 0, 0] },
  ]);
}

/**
 * The park's detective props: ONE clue board (it moves to the place of the next clue) that turns toward the child and bobs, and
 * ONE glowing column (the beacon) over the place the last clue named, with a few sparkles now and then. 2 draw calls in all.
 */
export class ClueProps {
  readonly paper: THREE.Mesh;
  readonly beacon: THREE.Mesh;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private t = 0;
  private spark = 0;
  /** The board's ground position (the mesh bobs a little above it). */
  readonly paperAt = new THREE.Vector3();

  constructor(lit: THREE.Material) {
    this.paper = new THREE.Mesh(paperGeo(), lit);
    this.paper.castShadow = false;
    this.paper.visible = false;
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 7, 14, 1, true), this.beaconMat);
    this.beacon.visible = false;
  }

  addTo(root: THREE.Object3D): void {
    root.add(this.paper, this.beacon);
  }

  showPaper(x: number, z: number): void {
    this.paperAt.set(x, 0, z);
    this.paper.position.set(x, 0, z);
    this.paper.visible = true;
  }

  hidePaper(): void {
    this.paper.visible = false;
  }

  showBeacon(x: number, z: number): void {
    this.beacon.position.set(x, 3.5, z);
    this.beacon.visible = true;
  }

  hideBeacon(): void {
    this.beacon.visible = false;
  }

  /** Per frame: bob, face the child, pulse the beacon. `sparkle` is called a few times a second while the beacon shines. */
  update(dt: number, px: number, pz: number, sparkle: (x: number, y: number, z: number) => void): void {
    this.t += dt;
    if (this.paper.visible) {
      this.paper.position.y = Math.sin(this.t * 2.4) * 0.05;
      this.paper.rotation.y = Math.atan2(px - this.paperAt.x, pz - this.paperAt.z);
    }
    if (this.beacon.visible) {
      this.beaconMat.opacity = 0.22 + 0.14 * Math.sin(this.t * 3);
      this.beacon.rotation.y += dt * 0.8;
      this.spark += dt;
      if (this.spark > 0.35) {
        this.spark = 0;
        sparkle(this.beacon.position.x, 0.4, this.beacon.position.z);
      }
    }
  }

  dispose(): void {
    this.paper.removeFromParent();
    this.beacon.removeFromParent();
    this.paper.geometry.dispose();
    this.beacon.geometry.dispose();
    this.beaconMat.dispose();
  }
}
