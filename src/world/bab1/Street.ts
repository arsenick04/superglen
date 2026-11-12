import { Kit, C } from './Kit';
import { Z, STREET_HALF, BOUNDARY } from './Layout';
import { addHipRoof, addRoofBox } from '../kits/Roofs';

type V3 = readonly [number, number, number];

/** Houses on both sides: [centre z, wall colour, roof colour, height, shop?]. Left faces +X, right faces -X. */
const LEFT: readonly [number, number, number, number, boolean][] = [
  [1.5, C.PEACH, C.RED, 5.2, false],
  [-5.5, C.SKY, C.DEEP_RED, 5.8, true],
  [-12.5, C.YELLOW, C.TEAL, 5.0, false],
  [-26.5, C.MINT, C.RED, 5.6, true],
  [-33.0, C.LILAC, C.DEEP_RED, 5.2, false],
];
const RIGHT: readonly [number, number, number, number, boolean][] = [
  [0.0, C.MINT, C.DEEP_RED, 5.4, false],
  [-7.0, C.PINK, C.TEAL, 5.0, true],
  [-14.0, C.SKY, C.RED, 5.8, false],
  [-28.5, C.YELLOW, C.DEEP_RED, 5.2, true],
];

function house(kit: Kit, side: -1 | 1, zc: number, wall: number, roof: number, h: number, shop: boolean): void {
  const x = side * (STREET_HALF + 3);
  const face = side * STREET_HALF;
  kit.solid([6, h, 7.2], [x, h / 2, zc], wall);
  // Walkable hip roof (collider = the drawn pyramid, +10 cm at the eaves; slopes 25-28 degrees: no sliding).
  addHipRoof(kit, { id: `house${side > 0 ? 'R' : 'L'}${zc}`, cx: x, cz: zc, baseY: h, w: 7.4, d: 8.4, h: 2.0, color: roof });
  kit.deco.box([0.5, 0.2, 7.6], [face - side * 0.1, h + 0.05, zc], C.CREAM); // eave trim
  // Door and two windows on the street face.
  const fx = face - side * 0.04;
  kit.deco.box([0.1, 2.1, 1.2], [fx, 1.05, zc], shop ? C.RED : C.BROWN);
  kit.glow.box([0.06, 0.5, 0.5], [fx - side * 0.02, 1.5, zc + 0.0], 0xfff1b0);
  for (const dz of [-2.2, 2.2]) {
    kit.deco.box([0.1, 1.3, 1.3], [fx, 2.1, zc + dz], C.WHITE);
    kit.glow.box([0.05, 1.05, 1.05], [fx - side * 0.04, 2.1, zc + dz], 0x9fdcff);
    // flower box
    kit.deco.box([0.45, 0.28, 1.2], [fx - side * 0.2, 1.35, zc + dz], C.BROWN);
    for (let i = -1; i <= 1; i++) kit.deco.sph(0.17, [fx - side * 0.2, 1.6, zc + dz + i * 0.38], i === 0 ? C.PINK : C.ORANGE);
    kit.collider([0.65, 0.28, 1.4], [fx - side * 0.2, 1.35, zc + dz]); // the window box is solid (a foothold at 1.5 m)
  }
  // Upper windows.
  for (const dz of [-2.0, 0, 2.0]) {
    kit.deco.box([0.1, 1.1, 1.0], [fx, 3.6, zc + dz], C.WHITE);
    kit.glow.box([0.05, 0.85, 0.8], [fx - side * 0.04, 3.6, zc + dz], 0x9fdcff);
  }
  if (shop) {
    // Striped awning over the door.
    for (let i = 0; i < 6; i++) {
      kit.deco.box([1.1, 0.14, 0.62], [face - side * 0.55, 2.55 - 0.0, zc - 1.55 + i * 0.62], i % 2 === 0 ? C.RED : C.CREAM, [0, 0, side * 0.25]);
    }
    // One collider for the whole striped awning (14 degrees: walkable, no sliding), drawn above.
    addRoofBox(kit, { id: `awning${side > 0 ? 'R' : 'L'}${zc}`, size: [1.1, 0.14, 3.72], pos: [face - side * 0.55, 2.55, zc], rot: [0, 0, side * 0.25] });
    kit.deco.box([0.1, 0.7, 2.6], [fx, 2.95, zc], C.GOLD); // sign
  }
}

function tree(kit: Kit, x: number, z: number, s = 1): void {
  kit.solidCyl(0.2 * s, 1.5 * s, [x, 0.75 * s, z], C.BROWN);
  kit.lit.sph(1.0 * s, [x, 2.2 * s, z], C.GREEN);
  kit.lit.sph(0.8 * s, [x + 0.45 * s, 2.9 * s, z + 0.2 * s], C.DARK_GREEN);
  kit.lit.sph(0.7 * s, [x - 0.4 * s, 2.7 * s, z - 0.3 * s], C.GREEN);
}

function lamp(kit: Kit, x: number, z: number): void {
  kit.solidCyl(0.07, 3.2, [x, 1.6, z], C.GREY);
  kit.deco.sph(0.28, [x, 3.35, z], 0xfff1c1);
  kit.glow.sph(0.2, [x, 3.35, z], 0xffe9a0);
  kit.physics.addFixedCylinder(0.28, 0.3, { x, y: 3.35, z }); // the lantern is a flat 60 cm top at the height it is drawn
}

function hedge(kit: Kit, size: V3, pos: V3): void {
  kit.solid(size, pos, C.DARK_GREEN);
  kit.lit.sph(Math.min(size[1] * 0.6, 0.9), [pos[0], pos[1] + size[1] / 2 - 0.2, pos[2]], C.GREEN, [Math.max(1, size[0] / 1.3), 0.35, Math.max(1, size[2] / 1.3)]); // flat cap: the top is where the collider is
}

function bike(kit: Kit, x: number, z: number, color: number): void {
  for (const dz of [-0.45, 0.45]) {
    kit.deco.add('sph', [x, 0.33, z + dz], [0.06, 0.33, 0.33], 0x333a47); // wheel (flattened sphere)
  }
  kit.deco.box([0.06, 0.06, 0.95], [x, 0.55, z], color, [0.25, 0, 0]);
  kit.deco.box([0.4, 0.05, 0.05], [x, 0.9, z - 0.4], 0x333a47);
}

/**
 * Part A: the street from the school wall (z +5.5) to the plaza (z -36). Boundary walls, houses, side-street
 * mouths blocked by hedges and planters, trees, lamps. All static.
 */
export function buildStreet(kit: Kit): void {
  // --- Ground, road, sidewalks, markings (visual only; the one big slab is added by the level) ---
  // The meadow ends where the floor collider ends (see Bab1Level): anything beyond is a deep ravine that returns you to the last safe spot.
  kit.deco.box([40, 0.2, 51.6], [0, -0.1, -16.8], 0x86d16a);
  kit.deco.box([400, 0.2, 400], [0, -14.4, -40], 0x4f9a4a);
  kit.deco.box([6.4, 0.04, 42], [0, 0.02, -15], 0x69707d);
  for (const s of [-1, 1]) {
    kit.deco.box([3.5, 0.06, 42], [s * 4.95, 0.03, -15], 0xeadcb9);
    kit.deco.box([0.2, 0.08, 42], [s * 3.2, 0.04, -15], 0xffffff);
  }
  for (let z = 3; z > -34; z -= 3) kit.deco.box([0.18, 0.05, 1.3], [0, 0.045, z], 0xfff3b0);
  for (let i = -4; i <= 4; i++) kit.deco.box([0.5, 0.05, 2.2], [i * 0.72, 0.045, -2.6], 0xffffff); // zebra crossing
  // Plaza in front of the Barongsai building.
  kit.deco.box([BOUNDARY * 2, 0.06, 6.5], [0, 0.03, -39.0], 0xe3c9a0);
  for (let i = -5; i <= 5; i++) kit.deco.box([0.1, 0.07, 6.5], [i * 2.4, 0.032, -39.0], 0xd2b182);

  // --- Boundary: tall walls/hedges all around (nothing can be left or fallen from) ---
  for (const s of [-1, 1]) {
    const x = s * (BOUNDARY + 0.5);
    // 10 m tall: higher than every roof of the street (7.8 m) plus a jump from it. Above it an invisible extension
    // (fair: it is the continuation of the same hedge wall) so nobody can hop over the top into the void.
    kit.solid([1.0, 10, 50], [x, 5, -17], C.DARK_GREEN);
    kit.collider([1.0, 30, 50], [x, 25, -17]);
    for (let z = 6; z > -42; z -= 3) kit.deco.sph(1.5, [x - s * 0.6, 9.4 + ((z * 7) % 3) * 0.1, z], C.GREEN, [1, 1, 1], 1);
  }

  // --- School wall with the closed gate behind the spawn ---
  const sz = Z.schoolWall;
  kit.solid([BOUNDARY * 2, 4.8, 0.6], [0, 2.4, sz + 0.3], 0xffd9a8);
  addRoofBox(kit, { id: 'schoolWallCap', size: [BOUNDARY * 2, 0.5, 0.8], pos: [0, 4.9, sz + 0.3], color: C.RED, noSamples: true });
  kit.roofs?.add({ id: 'schoolWallCap', kind: 'flat', samples: [{ x: -6, y: 5.15, z: sz + 0.3 }, { x: -5, y: 5.15, z: sz + 0.3 }] });
  kit.lit.box([BOUNDARY * 2, 0.3, 0.7], [0, 0.15, sz - 0.02], C.CREAM);
  kit.solid([5.2, 2.6, 0.5], [0, 1.3, sz - 0.05], C.TEAL); // gate leaves
  for (let i = -8; i <= 8; i++) kit.deco.cyl(0.05, 2.5, [i * 0.3, 1.3, sz - 0.4], C.YELLOW);
  kit.deco.box([5.4, 0.12, 0.2], [0, 2.1, sz - 0.4], C.GOLD);
  kit.deco.box([5.4, 0.12, 0.2], [0, 0.5, sz - 0.4], C.GOLD);
  kit.deco.box([7, 0.8, 0.5], [0, 3.55, sz - 0.1], C.RED); // arch sign
  kit.collider([7.2, 0.8, 0.7], [0, 3.55, sz - 0.1]); // a ledge you can stand on above the gate
  kit.glow.add('pyr', [0, 3.55, sz - 0.4], [0.7, 0.55, 0.12], 0xffd23f, [Math.PI / 2, 0, 0]); // star-ish marker
  kit.deco.cyl(0.07, 4.4, [3.9, 2.2, sz - 0.5], C.GREY); // flag pole
  kit.deco.box([1.4, 0.8, 0.05], [4.65, 4.0, sz - 0.5], C.RED);
  kit.deco.box([0.45, 0.8, 0.06], [4.0, 4.0, sz - 0.5], C.GOLD);
  kit.deco.sph(0.15, [3.9, 4.5, sz - 0.5], C.GOLD);
  // The school itself, behind the wall: a real flat-roofed building as wide as the walled street (no pockets behind
  // the wall), walkable on top. Beyond its back edge there is only the ravine: a fall returns you to the last safe spot.
  addRoofBox(kit, { id: 'schoolRoof', size: [BOUNDARY * 2 + 1, 7, 12.2], pos: [0, 3.5, sz + 6.6], color: 0xfff0c4, noSamples: true });
  kit.roofs?.add({ id: 'schoolRoof', kind: 'flat', samples: [{ x: -5, y: 7, z: sz + 8 }, { x: -3.5, y: 7, z: sz + 8 }, { x: 8, y: 7, z: sz + 10 }] });
  for (let i = -3; i <= 3; i++) kit.deco.box([1.4, 1.2, 0.1], [i * 2.6, 3.2, sz + 0.78], C.SKY);

  // --- Houses ---
  for (const [z, w, r, h, shop] of LEFT) house(kit, -1, z, w, r, h, shop);
  for (const [z, w, r, h, shop] of RIGHT) house(kit, 1, z, w, r, h, shop);

  // --- Side streets: blocked by hedges, planters and a bike rack; behind them a short dead-end pocket ---
  // Left mouth z -15.8 .. -23.2
  hedge(kit, [1.0, 1.5, 7.4], [-STREET_HALF - 0.5, 0.75, -19.5]);
  kit.solid([6, 5, 0.6], [-10, 2.5, -23.5], 0xffd0a8); // pocket sides/back
  kit.solid([0.6, 5, 7.6], [-13.2, 2.5, -19.5], 0xffd0a8);
  kit.solid([6, 5, 0.6], [-10, 2.5, -15.5], 0xffd0a8);
  bike(kit, -6.3, -17.6, C.RED);
  bike(kit, -6.3, -18.9, C.BLUE);
  bike(kit, -6.3, -20.2, C.GOLD);
  kit.deco.box([0.1, 0.5, 3.4], [-6.6, 0.25, -18.9], C.GREY); // rack
  // Right mouth z -17.3 .. -25.7
  kit.solid([1.0, 1.6, 8.4], [STREET_HALF + 0.5, 0.8, -21.5], C.BROWN); // big planter row
  for (let z = -18; z > -25.5; z -= 0.9) {
    kit.deco.sph(0.38, [STREET_HALF + 0.5, 1.7, z], (z * 3) % 2 > 1 ? C.PINK : C.ORANGE);
    kit.deco.sph(0.3, [STREET_HALF + 0.3, 1.9, z - 0.4], C.YELLOW);
  }
  kit.solid([6, 5, 0.6], [10, 2.5, -25.9], 0xc9e4ff);
  kit.solid([0.6, 5, 8.8], [13.2, 2.5, -21.5], 0xc9e4ff);
  kit.solid([6, 5, 0.6], [10, 2.5, -17.0], 0xc9e4ff);

  // --- Dressing: trees and lamps along both sidewalks ---
  for (const [x, z, s] of [[-5.9, -1, 1], [5.9, -3, 1.1], [-5.9, -9.8, 0.9], [5.9, -11, 1], [-5.9, -23, 1.1], [5.9, -27.5, 1], [-5.9, -30, 1]] as const) tree(kit, x, z, s);
  for (const [x, z] of [[-3.6, -4], [3.6, -6], [-3.6, -14], [3.6, -17], [-3.6, -26], [3.6, -23], [-3.6, -33], [3.6, -33]] as const) lamp(kit, x, z);
  // Bunting-free benches near the plaza.
  for (const s of [-1, 1]) {
    kit.deco.box([1.8, 0.1, 0.5], [s * 9, 0.45, -37.3], C.BROWN);
    kit.deco.box([1.8, 0.5, 0.08], [s * 9, 0.75, -37.5], C.BROWN);
    kit.collider([1.8, 0.5, 0.5], [s * 9, 0.25, -37.3]); // seat (a 0.5 m step)
    kit.collider([1.8, 1.0, 0.1], [s * 9, 0.5, -37.5]); // backrest
  }
  tree(kit, -10.5, -39.5, 1.2);
  tree(kit, 11, -40, 1.2);
  tree(kit, 9.2, -34.5, 1.0);

  // The street's closing: low houses end at z -36.3 so the plaza opens. A soft hedge row hides the join.
  hedge(kit, [5.6, 1.5, 0.9], [-10.5, 0.75, -36.6]);
}

/** The big ground slab (collider) of the outdoor part and the hall: top face y = 0, z from +9 to the hall's back wall. */
export function slabBounds(zBack: number): { size: V3; pos: V3 } {
  const z0 = 9;
  return { size: [40, 1, z0 - zBack], pos: [0, -0.5, (z0 + zBack) / 2] };
}

