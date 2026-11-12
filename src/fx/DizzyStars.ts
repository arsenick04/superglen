import * as THREE from 'three';

interface Slot {
  group: THREE.Group;
  stars: THREE.Mesh[];
  anchor: THREE.Vector3 | null;
  yOffset: number;
  radius: number;
  age: number;
  duration: number;
  active: boolean;
}

const STARS_PER_SLOT = 3;

function starShape(): THREE.Shape {
  const s = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/**
 * "Pusing berbintang": three small yellow stars orbit above a head for a moment. Pooled (a few slots), stars always
 * face the camera. Used for a tamed enemy and for the player when a ball bonks them. No allocation per show().
 *
 *   stars.show(player.visualPosition, 0.8);          // anchor = a live Vector3, offset above it
 */
export class DizzyStars {
  private readonly slots: Slot[] = [];
  private next = 0;
  private warming = false;
  private t = 0;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    slots = 3,
  ) {
    const geo = new THREE.ShapeGeometry(starShape());
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide, fog: false, depthTest: false });
    for (let i = 0; i < slots; i++) {
      const group = new THREE.Group();
      const stars: THREE.Mesh[] = [];
      for (let k = 0; k < STARS_PER_SLOT; k++) {
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 7;
        m.frustumCulled = false;
        group.add(m);
        stars.push(m);
      }
      group.visible = false;
      scene.add(group);
      this.slots.push({ group, stars, anchor: null, yOffset: 0, radius: 0.4, age: 0, duration: 1, active: false });
    }
  }

  /** Orbit three stars around `anchor` (kept by reference) at `yOffset` above it for `duration` s. */
  show(anchor: THREE.Vector3, yOffset: number, duration = 1.3, radius = 0.42): void {
    // Reuse the slot already showing this anchor, otherwise the next one in the ring.
    let s = this.slots.find((x) => x.active && x.anchor === anchor);
    if (!s) {
      s = this.slots[this.next];
      this.next = (this.next + 1) % this.slots.length;
    }
    s.anchor = anchor;
    s.yOffset = yOffset;
    s.radius = radius;
    s.duration = duration;
    s.age = 0;
    s.active = true;
    s.group.visible = true;
  }

  clear(): void {
    for (const s of this.slots) {
      s.active = false;
      s.anchor = null;
      s.group.visible = this.warming;
    }
  }

  warm(on: boolean): void {
    this.warming = on;
    for (const s of this.slots) s.group.visible = on || s.active;
  }

  update(dt: number): void {
    this.t += dt;
    for (const s of this.slots) {
      if (!s.active || !s.anchor) continue;
      s.age += dt;
      if (s.age >= s.duration) {
        s.active = false;
        s.group.visible = this.warming;
        continue;
      }
      const u = s.age / s.duration;
      // Pop in, stay, shrink away at the end.
      const sc = Math.min(1, u * 8) * Math.min(1, (1 - u) * 5) * 0.2;
      s.group.position.set(s.anchor.x, s.anchor.y + s.yOffset, s.anchor.z);
      for (let k = 0; k < s.stars.length; k++) {
        const a = this.t * 5.5 + (k / s.stars.length) * Math.PI * 2;
        const m = s.stars[k];
        m.position.set(Math.cos(a) * s.radius, Math.sin(a * 2) * 0.05, Math.sin(a) * s.radius);
        m.quaternion.copy(this.camera.quaternion);
        m.rotateZ(a);
        m.scale.setScalar(sc);
      }
    }
  }
}
