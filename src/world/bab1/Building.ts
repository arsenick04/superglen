import * as THREE from 'three';
import { Kit, C, basic } from './Kit';
import { Z, BOUNDARY, DOOR_HALF, FENCE_GAP, FENCE_GAP_X, HALL_HALF } from './Layout';
import type { Sparkles } from './Fx';
import { addHipRoof, addRoofBox } from '../kits/Roofs';
import { ParkourKit, EDGE_COLOR } from '../kits/ParkourKit';
import { LANDMARK } from './StreetData';

const WALL = 0xb5432f; // faded red
const WALL_H = 5;
const FACE_Z = Z.facade;

/** Animated pieces of the exterior (window glow flicker). */
export class BuildingExterior {
  private readonly flicker: THREE.MeshBasicMaterial;
  private readonly spill: THREE.MeshBasicMaterial;
  private t = 0;

  constructor(kit: Kit, root: THREE.Object3D, sparkles: Sparkles) {
    this.flicker = basic(0xffc766);
    this.spill = basic(0xffb55a, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, fog: false });

    const pk0 = new ParkourKit(kit);
    // --- Facade with the doorway ---
    const half = HALL_HALF + 0.6; // outer half width = 8
    const bw = half - DOOR_HALF;
    for (const s of [-1, 1]) {
      kit.solid([bw, WALL_H, 0.6], [s * (DOOR_HALF + bw / 2), WALL_H / 2, FACE_Z - 0.3], WALL);
      // Gold trim on the front.
      kit.lit.box([bw, 0.25, 0.1], [s * (DOOR_HALF + bw / 2), 0.9, FACE_Z + 0.03], C.GOLD);
      kit.lit.box([bw, 0.25, 0.1], [s * (DOOR_HALF + bw / 2), 4.3, FACE_Z + 0.03], C.GOLD);
      // Cream studs row (a faded-gold "gate" pattern).
      for (let i = 0; i < 6; i++) kit.deco.sph(0.1, [s * (DOOR_HALF + 0.5 + i * 0.95), 4.6, FACE_Z + 0.07], C.CREAM);
      // Wing walls out to the boundary.
      kit.solid([BOUNDARY + 0.5 - half, 5.2, 0.6], [s * (half + (BOUNDARY + 0.5 - half) / 2), 2.6, FACE_Z - 0.3], 0x9c3a2a);
      addRoofBox(kit, { id: `wingCap${s}`, size: [BOUNDARY + 0.5 - half, 0.3, 0.8], pos: [s * (half + (BOUNDARY + 0.5 - half) / 2), LANDMARK.wingTop - 0.15, FACE_Z - 0.3], color: C.GOLD });
      // Round pillars flanking the door.
      kit.lit.cyl(0.5, 4.6, [s * (DOOR_HALF + 0.55), 2.3, FACE_Z + 0.5], C.RED);
      kit.lit.cyl(0.62, 0.3, [s * (DOOR_HALF + 0.55), 0.15, FACE_Z + 0.5], C.GOLD);
      kit.lit.cyl(0.62, 0.3, [s * (DOOR_HALF + 0.55), 4.55, FACE_Z + 0.5], C.GOLD);
      kit.lit.cyl(0.6, 0.4, [s * (DOOR_HALF + 0.55), 5.2, FACE_Z + 0.5], C.GOLD);
      // The pillar is a round column topped by a gold ball: collider up to the top of the ball (5.4 m).
      kit.physics.addFixedCylinder(2.7, 0.55, { x: s * (DOOR_HALF + 0.55), y: 2.7, z: FACE_Z + 0.5 });
      kit.glow.cyl(0.5, 0.03, [s * (DOOR_HALF + 0.55), 5.43, FACE_Z + 0.5], EDGE_COLOR); // bright ring on the pillar top
      // Latticed windows with a flickering warm glow.
      for (const wx of [4.6, 6.6]) {
        const x = s * wx;
        kit.lit.box([1.5, 1.9, 0.12], [x, 2.6, FACE_Z + 0.06], C.GOLD);
        kit.lit.box([1.5, 0.06, 0.2], [x, 2.6, FACE_Z + 0.1], 0x6b2a20);
        kit.lit.box([0.06, 1.9, 0.2], [x, 2.6, FACE_Z + 0.1], 0x6b2a20);
        const w = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.65), this.flicker);
        w.position.set(x, 2.6, FACE_Z + 0.135);
        root.add(w);
      }
    }
    // Lintel over the doorway and a gold nameplate with a round "lion eye" emblem.
    kit.solid([DOOR_HALF * 2, WALL_H - 3.4, 0.6], [0, (WALL_H + 3.4) / 2, FACE_Z - 0.3], WALL);
    kit.lit.box([DOOR_HALF * 2 + 1.2, 0.5, 0.3], [0, 3.55, FACE_Z + 0.2], C.GOLD);
    kit.collider([DOOR_HALF * 2 + 1.4, 0.5, 0.5], [0, 3.55, FACE_Z + 0.2]); // the nameplate is a ledge above the door
    pk0.edge(0, FACE_Z + 0.2, DOOR_HALF * 2 + 1.2, 0.3, LANDMARK.nameplate.top);
    kit.lit.cyl(0.55, 0.14, [0, 4.35, FACE_Z + 0.12], C.GOLD, [Math.PI / 2, 0, 0]);
    kit.lit.cyl(0.4, 0.16, [0, 4.35, FACE_Z + 0.14], C.RED, [Math.PI / 2, 0, 0]);
    kit.lit.sph(0.16, [-0.2, 4.4, FACE_Z + 0.26], C.WHITE);
    kit.lit.sph(0.16, [0.2, 4.4, FACE_Z + 0.26], C.WHITE);
    kit.lit.sph(0.08, [-0.2, 4.4, FACE_Z + 0.37], 0x222222);
    kit.lit.sph(0.08, [0.2, 4.4, FACE_Z + 0.37], 0x222222);
    // Door frame glow strip along the open door (the "light from inside").
    kit.glow.box([0.14, 3.4, 0.1], [-DOOR_HALF + 0.04, 1.7, FACE_Z + 0.03], 0xffcf7a);
    kit.glow.box([0.14, 3.4, 0.1], [DOOR_HALF - 0.04, 1.7, FACE_Z + 0.03], 0xffcf7a);
    const spillMesh = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_HALF * 2 + 1.4, 2.4), this.spill);
    spillMesh.rotation.x = -Math.PI / 2;
    spillMesh.position.set(0, 0.07, FACE_Z + 1.2);
    root.add(spillMesh);

    // --- Roof: a flat gold-trimmed terrace on the hall (the launch pad), and the tower above it ---
    // Landmark class (PAKET_P1_PARKOUR.md 3.3): everything up to the terrace is easy (lion > name plate > pillar > terrace,
    // see StreetData.ts); the tower wall is 6.4 m above the terrace, one hop that needs rhythm level 4. The tower roof is a
    // walkable hip roof with the big gold star on it. No lower surface may be higher than the terrace, or the hop gets easier.
    const T = LANDMARK.terrace;
    const TW = LANDMARK.tower;
    const pk = new ParkourKit(kit);
    kit.lit.box([T.w - 0.3, 0.4, T.d - 0.3], [T.cx, 5.2, T.cz], 0x7a1f1a);
    kit.lit.box([T.w, 0.14, T.d], [T.cx, 5.42, T.cz], C.GOLD);
    kit.collider([T.w + 0.2, 0.49, T.d + 0.2], [T.cx, 5.245, T.cz]); // slab + trim top (5.49), 10 cm wider
    pk.edge(T.cx, T.cz, T.w - 0.4, T.d - 0.4, LANDMARK.terraceTop);
    kit.roofs?.add({
      id: 'barongsaiRoof1',
      kind: 'flat',
      samples: [{ x: 3, y: LANDMARK.terraceTop, z: -44 }, { x: 4, y: LANDMARK.terraceTop, z: -44 }, { x: -6, y: LANDMARK.terraceTop, z: -56 }, { x: 7, y: LANDMARK.terraceTop, z: -55 }],
    });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        kit.deco.add('cone', [sx * (T.w / 2 + 0.2), 5.95, T.cz + sz * (T.d / 2 + 0.2)], [0.22, 1.1, 0.22], C.GOLD, [sz * 0.7, 0, -sx * 0.7]);
        kit.deco.sph(0.2, [sx * (T.w / 2 + 0.55), 6.35, T.cz + sz * (T.d / 2 + 0.55)], C.CREAM);
      }
    // The tower.
    const th = TW.eave - LANDMARK.terraceTop;
    kit.solid([TW.w, th, TW.d], [TW.cx, LANDMARK.terraceTop + th / 2, TW.cz], 0xa83a2a);
    kit.lit.box([TW.w + 0.2, 0.25, TW.d + 0.2], [TW.cx, LANDMARK.terraceTop + 0.13, TW.cz], C.GOLD);
    kit.lit.box([TW.w + 0.2, 0.25, TW.d + 0.2], [TW.cx, TW.eave - 0.14, TW.cz], C.GOLD);
    const tf = TW.cz + TW.d / 2 + 0.05; // tower front face
    for (const wx of [-2.6, 0, 2.6]) {
      kit.lit.box([1.5, 1.9, 0.12], [wx, 8.6, tf], C.GOLD);
      kit.lit.box([1.5, 0.06, 0.2], [wx, 8.6, tf + 0.04], 0x6b2a20);
      kit.lit.box([0.06, 1.9, 0.2], [wx, 8.6, tf + 0.04], 0x6b2a20);
      kit.glow.box([1.2, 1.55, 0.05], [wx, 8.6, tf + 0.08], 0xffc766);
    }
    kit.lit.cyl(0.8, 0.14, [0, 10.4, tf + 0.1], C.GOLD, [Math.PI / 2, 0, 0]);
    kit.lit.cyl(0.58, 0.16, [0, 10.4, tf + 0.12], C.RED, [Math.PI / 2, 0, 0]);
    addHipRoof(kit, { id: 'barongsaiRoof2', cx: TW.cx, cz: TW.cz, baseY: TW.eave, w: TW.w, d: TW.d, h: TW.roofH, color: 0xb5382b });
    for (let i = -3; i <= 3; i++) kit.lit.box([0.12, 0.08, 3.0], [i * 1.15, TW.eave + 0.62, TW.cz + 3.2], C.GOLD, [0.42, 0, 0]);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) kit.deco.add('cone', [sx * (TW.w / 2 + 0.1), TW.eave + 0.5, TW.cz + sz * (TW.d / 2 + 0.1)], [0.22, 1.1, 0.22], C.GOLD, [sz * 0.7, 0, -sx * 0.7]);
    kit.deco.cyl(0.06, 1.6, [-3.5, TW.eave + 1.4, TW.cz - 3.5], C.GOLD); // small flag pole in the back corner (no collider)
    kit.deco.box([0.9, 0.5, 0.05], [-3.05, TW.eave + 2.0, TW.cz - 3.5], C.RED);

    // --- Two lion-ish guardians and two red lanterns in front of the door ---
    for (const s of [-1, 1]) {
      const x = s * 4.4;
      const z = FACE_Z + 1.0;
      kit.lit.cyl(0.55, 1.0, [x, 0.5, z], 0xe2cf9d);
      kit.physics.addFixedCylinder(1.05, 0.62, { x, y: 1.05, z }); // pedestal and lion together (top = the lion's head, 2.1 m)
      kit.lit.cyl(0.62, 0.15, [x, 0.08, z], C.GOLD);
      kit.lit.sph(0.62, [x, 1.5, z], C.RED, [1, 0.9, 0.9]);
      kit.lit.sph(0.62, [x, 1.5, z - 0.1], C.ORANGE, [1.25, 1.2, 0.5]); // mane
      kit.lit.sph(0.22, [x - 0.45, 2.05, z], C.RED);
      kit.lit.sph(0.22, [x + 0.45, 2.05, z], C.RED);
      kit.lit.sph(0.17, [x - 0.22, 1.62, z + 0.52], C.WHITE);
      kit.lit.sph(0.17, [x + 0.22, 1.62, z + 0.52], C.WHITE);
      kit.lit.sph(0.08, [x - 0.22, 1.62, z + 0.66], 0x222222);
      kit.lit.sph(0.08, [x + 0.22, 1.62, z + 0.66], 0x222222);
      kit.lit.sph(0.14, [x, 1.38, z + 0.58], C.GOLD);
      kit.lit.add('cone', [x, 2.3, z + 0.1], [0.14, 0.5, 0.14], C.GOLD);
      // Lantern hanging from the roof beam.
      const lx = s * 5.6;
      kit.deco.cyl(0.02, 1.2, [lx, 4.0, FACE_Z + 1.0], C.GOLD);
      kit.deco.cyl(0.25, 0.12, [lx, 3.35, FACE_Z + 1.0], C.GOLD);
      kit.glow.sph(0.5, [lx, 2.85, FACE_Z + 1.0], 0xff7a45, [1, 1.2, 1]);
      kit.deco.cyl(0.25, 0.12, [lx, 2.3, FACE_Z + 1.0], C.GOLD);
      kit.deco.add('cone', [lx, 2.0, FACE_Z + 1.0], [0.08, 0.5, 0.08], C.RED);
    }
    kit.lit.box([13.4, 0.18, 0.18], [0, 4.0, FACE_Z + 1.0], 0x6b2a20); // beam the lanterns hang from
    kit.lit.box([0.18, 0.18, 1.2], [-6.7, 4.0, FACE_Z + 0.5], 0x6b2a20);
    kit.lit.box([0.18, 0.18, 1.2], [6.7, 4.0, FACE_Z + 0.5], 0x6b2a20);

    // --- Fence across the courtyard with one obvious gap ---
    const fz = Z.fence;
    const bars = (x0: number, x1: number): void => {
      const cx = (x0 + x1) / 2;
      kit.solid([x1 - x0, 0.12, 0.14], [cx, 1.5, fz], 0x6c7a8c);
      kit.solid([x1 - x0, 0.12, 0.14], [cx, 0.25, fz], 0x6c7a8c);
      kit.collider([x1 - x0, 1.6, 0.2], [cx, 0.8, fz]);
      for (let x = x0 + 0.2; x < x1; x += 0.42) kit.deco.cyl(0.04, 1.6, [x, 0.8, fz], 0x8c9aae);
      for (let x = x0 + 0.2; x < x1; x += 0.42) kit.deco.sph(0.07, [x, 1.62, fz], C.GOLD);
    };
    bars(-BOUNDARY - 0.5, FENCE_GAP.x0);
    bars(FENCE_GAP.x1, BOUNDARY + 0.5);
    for (const px of [-12, -8, -4, 3.6, 6.0, 9, 12.5]) {
      kit.deco.cyl(0.12, 1.9, [px, 0.95, fz], 0x5b6878);
      kit.deco.sph(0.17, [px, 1.95, fz], C.GOLD);
    }
    // Bent bars at both edges of the gap, leaning outward.
    for (let i = 0; i < 3; i++) {
      kit.deco.cyl(0.04, 1.5, [FENCE_GAP.x0 - 0.2 - i * 0.2 - 0.25, 0.7, fz], 0xb5c2d6, [0, 0, 0.55 + i * 0.12]);
      kit.deco.cyl(0.04, 1.5, [FENCE_GAP.x1 + 0.2 + i * 0.2 + 0.25, 0.7, fz], 0xb5c2d6, [0, 0, -(0.55 + i * 0.12)]);
    }
    // A golden doormat arrow pointing through the gap (flat glow pieces).
    kit.glow.box([0.5, 0.03, 0.5], [FENCE_GAP_X, 0.08, fz + 0.9], 0xffe27a);
    sparkles.addEmitter(FENCE_GAP_X, 0.2, fz, 1.0, 9, 0xffe27a);
  }

  update(dt: number): void {
    this.t += dt;
    const f = 0.82 + 0.12 * Math.sin(this.t * 7.3) + 0.06 * Math.sin(this.t * 13.1 + 1.3);
    this.flicker.color.setRGB(1 * f, 0.78 * f, 0.4 * f);
    this.spill.opacity = 0.28 + 0.12 * f;
  }
}
