import { Kit, C } from './Kit';
import { STREET_HALF, BOUNDARY } from './Layout';
import { addHipRoof, addRoofBox } from '../kits/Roofs';
import { ParkourKit } from '../kits/ParkourKit';
import { STREET_BUILDINGS, TREES, LAMPS, SIDE_STREETS, PLAZA_HEDGE, LOW, SCHOOL, shopAwning, BODY, type StreetBuilding } from './StreetData';

type V3 = readonly [number, number, number];

/**
 * One house or ruko: body, walkable hip roof, windows and door (decoration, no colliders) and the climbing pieces that
 * StreetData.ts describes (crates, AC unit, window ledge, shop-front bay with balcony, sign board, shop awning).
 * Positions and heights of everything climbable come from the data; nothing about reach is decided here.
 */
function building(kit: Kit, pk: ParkourKit, b: StreetBuilding): void {
  const side = b.side;
  const zc = b.z;
  const h = b.wall;
  const x = side * (STREET_HALF + 3);
  const face = side * STREET_HALF;
  const dims = BODY[b.cls];
  const wallC = C[b.wallColor];
  kit.solid([dims.w, h, dims.d], [x, h / 2, zc], wallC);
  // Walkable hip roof (collider = the drawn pyramid, +10 cm at the eaves; slopes 22-33 degrees: no sliding).
  const r = b.roof;
  addHipRoof(kit, { id: r.id, cx: r.cx, cz: r.cz, baseY: h, w: r.w, d: r.d, h: r.h, color: C[b.roofColor] });
  kit.deco.box([0.5, 0.2, dims.d + 0.4], [face - side * 0.1, h + 0.05, zc], C.CREAM); // eave trim
  const fx = face - side * 0.04;
  const win = (dz: number, y: number, w: number, hh: number): void => {
    kit.deco.box([0.1, hh, w], [fx, y, zc + dz], C.WHITE);
    kit.glow.box([0.05, hh - 0.25, w - 0.25], [fx - side * 0.04, y, zc + dz], 0x9fdcff);
  };

  if (b.cls === 'house') {
    // Door and two windows with flower boxes (decoration only: the child may walk through them).
    kit.deco.box([0.1, 2.1, 1.2], [fx, 1.05, zc], b.shop ? C.RED : C.BROWN);
    kit.glow.box([0.06, 0.5, 0.5], [fx - side * 0.02, 1.5, zc], 0xfff1b0);
    for (const dz of [-1.9, 1.9]) {
      win(dz, 2.1, 1.3, 1.3);
      kit.deco.box([0.45, 0.28, 1.2], [fx - side * 0.2, 1.35, zc + dz], C.BROWN);
      for (let i = -1; i <= 1; i++) kit.deco.sph(0.17, [fx - side * 0.2, 1.6, zc + dz + i * 0.38], i === 0 ? C.PINK : C.ORANGE);
    }
    if (b.shop) {
      const a = shopAwning(b);
      const n = 5;
      const step = a.d / n;
      for (let i = 0; i < n; i++) {
        kit.deco.box([1.1, 0.14, step], [face - side * 0.55, 2.55, zc - a.d / 2 + (i + 0.5) * step], i % 2 === 0 ? C.RED : C.CREAM, [0, 0, side * 0.25]);
      }
      // One collider for the whole striped awning (14 degrees: walkable, no sliding), drawn above.
      addRoofBox(kit, { id: a.id, size: [1.1, 0.14, a.d], pos: [face - side * 0.55, 2.55, zc], rot: [0, 0, side * 0.25] });
      kit.deco.box([0.1, 0.6, 2.2], [fx, 2.95, zc], C.GOLD); // sign
    }
  } else {
    // Ruko: floors with windows, bands between them; the door and a window sit on the shop-front bay.
    const fh = h / b.floors;
    for (let f = 1; f < b.floors; f++) kit.deco.box([0.16, 0.18, dims.d + 0.3], [face - side * 0.08, f * fh, zc], C.CREAM);
    for (let f = 0; f < b.floors; f++) {
      const y = f * fh + fh * 0.55;
      win(-2.7, y, 1.1, 1.3);
      win(3.0, y, 1.1, 1.3);
    }
    const bay = b.pieces.find((p) => p.type === 'bay');
    if (bay) {
      // Shop door and window painted on the bay's outer face.
      const bx = bay.x - side * (bay.w / 2 + 0.04);
      kit.deco.box([0.1, 2.1, 1.1], [bx, 1.05, bay.z - 0.4], b.shop ? C.RED : C.BROWN);
      kit.glow.box([0.06, 0.5, 0.5], [bx - side * 0.02, 1.5, bay.z - 0.4], 0xfff1b0);
      kit.deco.box([0.1, 1.2, 1.5], [bx, 3.2, bay.z], C.WHITE);
      kit.glow.box([0.05, 0.95, 1.25], [bx - side * 0.04, 3.2, bay.z], 0x9fdcff);
    }
    kit.deco.box([0.1, 0.6, 1.9], [fx, 2.6, zc - 2.25], C.GOLD); // shop sign on the wall beside the bay
  }

  // The climbing pieces (bright edge on every top, friendly colliders, recorded as footholds).
  for (const p of b.pieces) {
    switch (p.type) {
      case 'crate':
        pk.crateStack(p.id, b.id, p.x, p.z, p.n ?? 1);
        break;
      case 'ac':
        pk.acUnit(p.id, b.id, p.x, p.z, p.top, p.w, p.d, p.thick ?? 0.8, p.face);
        break;
      case 'ledge':
        pk.windowLedge(p.id, b.id, p.x, p.z, p.top, p.w, p.d, p.thick ?? 0.5);
        break;
      case 'bay':
        pk.balcony(p.id, b.id, p.x, p.z, p.top, p.w, p.d, p.face, C[b.wallColor === 'PEACH' ? 'PINK' : 'PEACH']);
        break;
      case 'sign':
        pk.signBoard(p.id, b.id, p.x, p.z, p.top, p.w, p.d, p.thick ?? 0.5);
        break;
      case 'awning':
        pk.awning(p.id, b.id, p.x, p.z, p.top, p.w, p.d, p.thick ?? 0.25, p.face);
        break;
      case 'tank':
        pk.tank(p.id, b.id, p.x, p.z, p.top - 1.2, 1.2, p.w / 2);
        break;
    }
  }
}

/** `solid` false: soft scenery next to a ruko (no collider: a footing there would lower the ruko's hop, see StreetData.ts). */
function tree(kit: Kit, x: number, z: number, s = 1, solid = true): void {
  if (solid) kit.solidCyl(0.2 * s, 1.5 * s, [x, 0.75 * s, z], C.BROWN);
  else kit.lit.cyl(0.2 * s, 1.5 * s, [x, 0.75 * s, z], C.BROWN);
  kit.lit.sph(1.0 * s, [x, 2.2 * s, z], C.GREEN);
  kit.lit.sph(0.8 * s, [x + 0.45 * s, 2.9 * s, z + 0.2 * s], C.DARK_GREEN);
  kit.lit.sph(0.7 * s, [x - 0.4 * s, 2.7 * s, z - 0.3 * s], C.GREEN);
}

function lamp(kit: Kit, x: number, z: number, solid = true): void {
  if (solid) kit.solidCyl(0.07, 3.2, [x, 1.6, z], C.GREY);
  else kit.deco.cyl(0.07, 3.2, [x, 1.6, z], C.GREY);
  kit.deco.sph(0.28, [x, 3.35, z], 0xfff1c1);
  kit.glow.sph(0.2, [x, 3.35, z], 0xffe9a0);
  if (solid) kit.physics.addFixedCylinder(0.28, 0.3, { x, y: 3.35, z }); // the lantern is a flat 60 cm top at the height it is drawn
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
export function buildStreet(kit: Kit): ParkourKit {
  const pk = new ParkourKit(kit);
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
  // The school is a ruko-class building (7 m): its way up is the wall cap (5.15 m, a level-2 hop, bright edge) and then the
  // flat roof. Nothing low stands against the wall (no gate-leaf or arch collider: a footing there would make the cap too easy).
  const sz = SCHOOL.wallZ;
  kit.solid([BOUNDARY * 2, SCHOOL.wallTop, 0.6], [0, SCHOOL.wallTop / 2, sz + 0.3], 0xffd9a8);
  addRoofBox(kit, { id: 'schoolWallCap', size: [BOUNDARY * 2, 0.5, 0.8], pos: [0, SCHOOL.wallTop + 0.1, sz + 0.3], color: C.RED, noSamples: true });
  kit.roofs?.add({ id: 'schoolWallCap', kind: 'flat', samples: [{ x: -6, y: SCHOOL.capTop, z: sz + 0.3 }, { x: -5, y: SCHOOL.capTop, z: sz + 0.3 }] });
  pk.edge(0, sz + 0.3, BOUNDARY * 2, 0.8, SCHOOL.capTop);
  kit.lit.box([BOUNDARY * 2, 0.3, 0.7], [0, 0.15, sz - 0.02], C.CREAM);
  kit.lit.box([5.2, 2.6, 0.5], [0, 1.3, sz - 0.05], C.TEAL); // gate leaves (painted on, no collider)
  for (let i = -8; i <= 8; i++) kit.deco.cyl(0.05, 2.5, [i * 0.3, 1.3, sz - 0.4], C.YELLOW);
  kit.deco.box([5.4, 0.12, 0.2], [0, 2.1, sz - 0.4], C.GOLD);
  kit.deco.box([5.4, 0.12, 0.2], [0, 0.5, sz - 0.4], C.GOLD);
  kit.lit.box([7, 0.8, 0.5], [0, 3.55, sz - 0.1], C.RED); // arch sign
  kit.glow.add('pyr', [0, 3.55, sz - 0.4], [0.7, 0.55, 0.12], 0xffd23f, [Math.PI / 2, 0, 0]); // star-ish marker
  kit.deco.cyl(0.07, 4.4, [3.9, 2.2, sz - 0.5], C.GREY); // flag pole
  kit.deco.box([1.4, 0.8, 0.05], [4.65, 4.0, sz - 0.5], C.RED);
  kit.deco.box([0.45, 0.8, 0.06], [4.0, 4.0, sz - 0.5], C.GOLD);
  kit.deco.sph(0.15, [3.9, 4.5, sz - 0.5], C.GOLD);
  // The school itself, behind the wall: a real flat-roofed building as wide as the walled street (no pockets behind
  // the wall), walkable on top. Beyond its back edge there is only the ravine: a fall returns you to the last safe spot.
  addRoofBox(kit, { id: 'schoolRoof', size: [SCHOOL.roofW, SCHOOL.roofTop, SCHOOL.roofD], pos: [0, SCHOOL.roofTop / 2, SCHOOL.roofZ], color: 0xfff0c4, noSamples: true });
  kit.roofs?.add({ id: 'schoolRoof', kind: 'flat', samples: [{ x: -5, y: SCHOOL.roofTop, z: sz + 8 }, { x: -3.5, y: SCHOOL.roofTop, z: sz + 8 }, { x: 8, y: SCHOOL.roofTop, z: sz + 10 }] });
  pk.edge(0, SCHOOL.roofZ, SCHOOL.roofW - 1, SCHOOL.roofD - 0.4, SCHOOL.roofTop);
  for (let i = -3; i <= 3; i++) kit.deco.box([1.4, 1.2, 0.1], [i * 2.6, 3.2, sz + 0.78], C.SKY);

  // --- Houses and rukos (data: StreetData.ts) ---
  for (const b of STREET_BUILDINGS) building(kit, pk, b);

  // --- Side streets: blocked by low hedges, planters and garden walls (knee-high: hopped over, never a trap); behind them a short dead-end pocket ---
  const SS = SIDE_STREETS;
  hedge(kit, [SS.hedgeL.w, LOW, SS.hedgeL.d], [SS.hedgeL.x, LOW / 2, SS.hedgeL.z]);
  for (const w of SS.pocketL) kit.solid([w.w, LOW, w.d], [w.x, LOW / 2, w.z], 0xffd0a8);
  bike(kit, -6.3, -17.6, C.RED);
  bike(kit, -6.3, -18.9, C.BLUE);
  bike(kit, -6.3, -20.2, C.GOLD);
  kit.deco.box([0.1, 0.5, 3.4], [-6.6, 0.25, -18.9], C.GREY); // rack
  kit.solid([SS.planterR.w, LOW, SS.planterR.d], [SS.planterR.x, LOW / 2, SS.planterR.z], C.BROWN); // big planter row
  for (let z = -18; z > -26; z -= 0.9) {
    kit.deco.sph(0.38, [SS.planterR.x, LOW + 0.1, z], (z * 3) % 2 > 1 ? C.PINK : C.ORANGE);
    kit.deco.sph(0.3, [SS.planterR.x - 0.2, LOW + 0.3, z - 0.4], C.YELLOW);
  }
  for (const w of SS.pocketR) kit.solid([w.w, LOW, w.d], [w.x, LOW / 2, w.z], 0xc9e4ff);

  // --- Dressing: trees and lamps along both sidewalks (next to the rukos they are soft: no collider) ---
  for (const [x, z, sc, solid] of TREES.slice(0, 7)) tree(kit, x, z, sc, solid);
  for (const [x, z, solid] of LAMPS) lamp(kit, x, z, solid);
  // Bunting-free benches near the plaza.
  for (const s of [-1, 1]) {
    kit.deco.box([1.8, 0.1, 0.5], [s * 9, 0.45, -37.3], C.BROWN);
    kit.deco.box([1.8, 0.5, 0.08], [s * 9, 0.75, -37.5], C.BROWN);
    kit.collider([1.8, 0.5, 0.5], [s * 9, 0.25, -37.3]); // seat (a 0.5 m step)
    kit.collider([1.8, 1.0, 0.1], [s * 9, 0.5, -37.5]); // backrest
  }
  for (const [x, z, sc, solid] of TREES.slice(7)) tree(kit, x, z, sc, solid);

  // The street's closing: low houses end at z -36.3 so the plaza opens. A soft hedge row hides the join.
  hedge(kit, [PLAZA_HEDGE.w, PLAZA_HEDGE.top, PLAZA_HEDGE.d], [PLAZA_HEDGE.x, PLAZA_HEDGE.top / 2, PLAZA_HEDGE.z]);
  return pk;
}

/** The big ground slab (collider) of the outdoor part and the hall: top face y = 0, z from +9 to the hall's back wall. */
export function slabBounds(zBack: number): { size: V3; pos: V3 } {
  const z0 = 9;
  return { size: [40, 1, z0 - zBack], pos: [0, -0.5, (z0 + zBack) / 2] };
}

