import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { CITY_LAYOUT, FACE_VEC } from './CityData';

/**
 * Purely ornamental parked Mint-Green Wuling Air EV outside Glen's house in Kota Botanica.
 * Built from lightweight procedural Three.js geometry (satin mint body, gloss black two-tone cabin & roof,
 * signature full-width LED horizon light bar flowing into the side mirrors, low-mounted square headlights,
 * crisp front W emblem, charcoal lower bumper, 4-petal futuristic aero wheels, and a neat driveway pad)
 * plus a single static Rapier box collider. Not drivable or interactable; zero per-frame work.
 */

const CAR_W = 1.52;
const CAR_L = 2.86;
const CAR_H = 1.66;

/** Build the mint-green micro-EV visual centred at (0, 0, 0), wheels resting on y = 0, front facing +Z. */
function buildAirEv(): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'glen-home-car';
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => { geos.push(g); return g; };
  const trackMat = <T extends THREE.Material>(m: T): T => { mats.push(m); return m; };

  const matMint = trackMat(new THREE.MeshStandardMaterial({ color: 0xb6f2d8, roughness: 0.28, metalness: 0.08 }));
  const matBlackGloss = trackMat(new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.18, metalness: 0.25 }));
  const matBumper = trackMat(new THREE.MeshStandardMaterial({ color: 0x262b32, roughness: 0.58, metalness: 0.08 }));
  const matGlass = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b5870, roughness: 0.14, metalness: 0.35 }));
  const matSilver = trackMat(new THREE.MeshStandardMaterial({ color: 0xdbe2eb, roughness: 0.24, metalness: 0.65 }));
  const matTire = trackMat(new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.85, metalness: 0.05 }));
  const matLedWhite = trackMat(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf8ff, emissiveIntensity: 0.75, roughness: 0.15 }));
  const matLedRed = trackMat(new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2828, emissiveIntensity: 0.55, roughness: 0.2 }));
  const matPad = trackMat(new THREE.MeshStandardMaterial({ color: 0xd8d3c5, roughness: 0.9, metalness: 0 }));

  const add = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(trackGeo(g), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ---- 0. Neat concrete driveway/carport pad under the car ----
  const padGeo = trackGeo(new THREE.PlaneGeometry(CAR_W + 0.52, CAR_L + 0.56));
  const pad = new THREE.Mesh(padGeo, matPad);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.012;
  pad.receiveShadow = true;
  group.add(pad);

  // ---- 1. Mint-green sculpted lower body (extruded side profile along X, front at +Z) ----
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-1.32, 0.26);
  bodyShape.lineTo(1.30, 0.26);
  bodyShape.quadraticCurveTo(1.42, 0.28, 1.42, 0.44);
  bodyShape.lineTo(1.38, 0.72);
  bodyShape.quadraticCurveTo(1.34, 0.86, 1.18, 0.89);
  bodyShape.lineTo(0.88, 0.90);
  bodyShape.lineTo(-0.46, 0.96);
  bodyShape.lineTo(-1.12, 0.99);
  bodyShape.quadraticCurveTo(-1.38, 0.99, -1.40, 0.82);
  bodyShape.lineTo(-1.40, 0.42);
  bodyShape.quadraticCurveTo(-1.40, 0.26, -1.32, 0.26);

  const bodyGeo = trackGeo(new THREE.ExtrudeGeometry(bodyShape, {
    depth: CAR_W - 0.10,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  }));
  bodyGeo.translate(0, 0, -(CAR_W - 0.10) / 2);
  bodyGeo.rotateY(-Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, matMint);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Dark chassis underside
  add(new THREE.BoxGeometry(CAR_W - 0.20, 0.12, CAR_L - 0.40), matBumper, 0, 0.25, 0);

  // ---- 2. Gloss-black two-tone upper cabin & roof ----
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.34, 0.90);
  cabinShape.lineTo(1.14, 0.87);
  cabinShape.lineTo(0.46, 1.59);
  cabinShape.quadraticCurveTo(0.36, 1.65, 0.20, 1.65);
  cabinShape.lineTo(-1.14, 1.65);
  cabinShape.quadraticCurveTo(-1.34, 1.64, -1.36, 1.46);
  cabinShape.lineTo(-1.36, 0.94);
  cabinShape.closePath();

  const cabinGeo = trackGeo(new THREE.ExtrudeGeometry(cabinShape, {
    depth: CAR_W - 0.24,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.035,
    bevelSegments: 3,
  }));
  cabinGeo.translate(0, 0, -(CAR_W - 0.24) / 2);
  cabinGeo.rotateY(-Math.PI / 2);
  const cabinMesh = new THREE.Mesh(cabinGeo, matBlackGloss);
  cabinMesh.castShadow = true;
  cabinMesh.receiveShadow = true;
  group.add(cabinMesh);

  // ---- 3. Flush reflective tinted windows (panoramic windshield, sloped side windows, vertical rear quarter glass) ----
  // Front panoramic windshield (flush along the A-pillar slope)
  add(new THREE.BoxGeometry(CAR_W - 0.28, 0.86, 0.03), matGlass, 0, 1.25, 0.82, -0.76, 0, 0);
  // Windshield wipers resting at base
  add(new THREE.BoxGeometry(0.44, 0.024, 0.024), matBumper, -0.25, 0.94, 1.09, 0, 0, 0.05);
  add(new THREE.BoxGeometry(0.42, 0.024, 0.024), matBumper, 0.27, 0.94, 1.09, 0, 0, 0.04);

  // Sloped front side-window trapezoid matching the A-pillar cleanly (zero overhang!)
  const sideWinShape = new THREE.Shape();
  sideWinShape.moveTo(-0.24, 1.01);
  sideWinShape.lineTo(0.82, 0.96);
  sideWinShape.lineTo(0.34, 1.54);
  sideWinShape.lineTo(-0.24, 1.54);
  sideWinShape.closePath();
  const sideWinGeo = trackGeo(new THREE.ExtrudeGeometry(sideWinShape, { depth: CAR_W - 0.13, bevelEnabled: false }));
  sideWinGeo.translate(0, 0, -(CAR_W - 0.13) / 2);
  sideWinGeo.rotateY(-Math.PI / 2);
  group.add(new THREE.Mesh(sideWinGeo, matGlass));

  // Rear vertical quarter window (distinctive Air EV tall rectangular rear window)
  add(new THREE.BoxGeometry(CAR_W - 0.13, 0.54, 0.62), matGlass, 0, 1.27, -0.76);

  for (const sx of [-1, 1]) {
    // Tall gloss-black lower window accent tab behind the door handle
    add(new THREE.BoxGeometry(0.03, 0.20, 0.34), matBlackGloss, sx * (CAR_W / 2 - 0.028), 0.95, -0.46);
    // Vertical silver flush door handle
    add(new THREE.BoxGeometry(0.025, 0.14, 0.045), matSilver, sx * (CAR_W / 2 - 0.008), 0.90, -0.28);
  }
  // Rear hatch window
  add(new THREE.BoxGeometry(CAR_W - 0.34, 0.54, 0.035), matGlass, 0, 1.29, -1.39);

  // ---- 4. Signature full-width black trim + glowing white LED horizon strip flowing into the side mirrors ----
  add(new THREE.BoxGeometry(CAR_W - 0.06, 0.085, 0.12), matBlackGloss, 0, 0.85, 1.32);
  add(new THREE.BoxGeometry(CAR_W - 0.10, 0.028, 0.04), matLedWhite, 0, 0.86, 1.38);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.04, 0.065, 0.82), matBlackGloss, sx * (CAR_W / 2 - 0.015), 0.87, 0.96, -0.06, 0, 0);
    add(new THREE.BoxGeometry(0.14, 0.045, 0.06), matBlackGloss, sx * (CAR_W / 2 + 0.04), 0.93, 0.56, 0, 0, sx * 0.22);
    add(new THREE.BoxGeometry(0.15, 0.095, 0.12), matBlackGloss, sx * (CAR_W / 2 + 0.11), 0.96, 0.54);
  }

  // ---- 5. Front Fascia: crisp Wuling "W" wing emblem, low square headlights, dark lower bumper & license plate ----
  add(new THREE.BoxGeometry(0.026, 0.11, 0.02), matBlackGloss, -0.072, 0.70, 1.44, 0, 0, 0.32);
  add(new THREE.BoxGeometry(0.026, 0.09, 0.02), matBlackGloss, -0.024, 0.69, 1.44, 0, 0, -0.34);
  add(new THREE.BoxGeometry(0.026, 0.09, 0.02), matBlackGloss, 0.024, 0.69, 1.44, 0, 0, 0.34);
  add(new THREE.BoxGeometry(0.026, 0.11, 0.02), matBlackGloss, 0.072, 0.70, 1.44, 0, 0, -0.32);

  // Twin low-mounted big square headlights
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.26, 0.20, 0.10), matBlackGloss, sx * 0.56, 0.53, 1.38);
    add(new THREE.BoxGeometry(0.21, 0.15, 0.04), matLedWhite, sx * 0.56, 0.53, 1.43);
    add(new THREE.BoxGeometry(0.16, 0.032, 0.03), matSilver, sx * 0.52, 0.35, 1.45);
  }

  // Charcoal lower front bumper + lower mint chin lip + sleek black license plate
  add(new THREE.BoxGeometry(CAR_W - 0.08, 0.22, 0.14), matBumper, 0, 0.35, 1.38);
  add(new THREE.BoxGeometry(0.92, 0.075, 0.06), matMint, 0, 0.25, 1.43);
  add(new THREE.BoxGeometry(0.42, 0.13, 0.035), matBlackGloss, 0, 0.43, 1.455);
  add(new THREE.BoxGeometry(0.36, 0.08, 0.02), matSilver, 0, 0.43, 1.468);

  // ---- 6. Rear Fascia: full-width LED tail light bar, lower rear lamps & rear bumper ----
  add(new THREE.BoxGeometry(CAR_W - 0.10, 0.08, 0.08), matBlackGloss, 0, 0.90, -1.40);
  add(new THREE.BoxGeometry(CAR_W - 0.16, 0.028, 0.03), matLedRed, 0, 0.90, -1.44);
  add(new THREE.BoxGeometry(CAR_W - 0.08, 0.20, 0.10), matBumper, 0, 0.34, -1.40);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.22, 0.10, 0.04), matLedRed, sx * 0.52, 0.45, -1.44);
  }
  add(new THREE.BoxGeometry(0.40, 0.12, 0.03), matBlackGloss, 0, 0.58, -1.44);

  // ---- 7. Four wheels with iconic 4-petal silver/black futuristic aero hubcaps ----
  const wheelR = 0.26;
  const wheelW = 0.18;
  const wheelSpots: [number, number][] = [
    [-CAR_W / 2 + 0.08, 0.90],
    [CAR_W / 2 - 0.08, 0.90],
    [-CAR_W / 2 + 0.08, -0.92],
    [CAR_W / 2 - 0.08, -0.92],
  ];
  for (const [wx, wz] of wheelSpots) {
    const sx = wx < 0 ? -1 : 1;
    add(new THREE.CylinderGeometry(wheelR + 0.03, wheelR + 0.03, wheelW + 0.06, 16), matBumper, wx - sx * 0.04, wheelR + 0.02, wz, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20), matTire, wx, wheelR, wz, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(wheelR * 0.70, wheelR * 0.70, wheelW + 0.014, 18), matBlackGloss, wx, wheelR, wz, 0, 0, Math.PI / 2);
    // 4-petal silver aero blades (rounded outer ring + 4 sculpted spokes)
    add(new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, 0.012, 18), matSilver, wx + sx * (wheelW / 2 + 0.005), wheelR, wz, 0, 0, Math.PI / 2);
    add(new THREE.BoxGeometry(0.022, wheelR * 1.18, wheelR * 0.26), matBlackGloss, wx + sx * (wheelW / 2 + 0.009), wheelR, wz, 0.785, 0, 0);
    add(new THREE.BoxGeometry(0.022, wheelR * 0.26, wheelR * 1.18), matBlackGloss, wx + sx * (wheelW / 2 + 0.009), wheelR, wz, 0.785, 0, 0);
    add(new THREE.CylinderGeometry(0.048, 0.048, 0.026, 12), matBlackGloss, wx + sx * (wheelW / 2 + 0.012), wheelR, wz, 0, 0, Math.PI / 2);
  }

  // ---- 8. Soft ground contact shadow under the car ----
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(CAR_W + 0.36, CAR_L + 0.38));
  const shadowMat = trackMat(new THREE.MeshBasicMaterial({
    color: 0x0b1620,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  }));
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  group.add(shadow);

  return {
    group,
    dispose: () => {
      group.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** Place the parked Mint-Green Wuling Air EV right beside Glen's house with a static collider. */
export function mountGlenHomeCar(ctx: LevelContext): void {
  const b = CITY_LAYOUT.buildings.find((x) => x.glen);
  if (!b) return;
  const [fx, fz] = FACE_VEC[b.face];
  // Side axis matching CityData.ts (+u is the crate-stair side; -u is the open north driveway side).
  const ux = -fz;
  const uz = fx;
  const halfFwd = (b.face < 2 ? b.d : b.w) / 2;
  const halfSide = (b.face < 2 ? b.w : b.d) / 2;

  // Parked neatly on the concrete driveway pad right beside Glen's house, nose facing the street (+fx, +fz).
  const cx = b.x + fx * (halfFwd + 0.30) - ux * (halfSide + 1.05);
  const cz = b.z + fz * (halfFwd + 0.30) - uz * (halfSide + 1.05);
  const cy = b.base;
  const yaw = Math.atan2(fx, fz);

  const car = buildAirEv();
  car.group.position.set(cx, cy, cz);
  car.group.rotation.y = yaw;
  ctx.root.add(car.group);

  // Static collider matching the car's world orientation so Glen walks around (or hops onto) it cleanly.
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  ctx.physics.addFixedCuboid(
    { x: CAR_W / 2, y: CAR_H / 2, z: CAR_L / 2 },
    { x: cx, y: cy + CAR_H / 2, z: cz },
    { x: q.x, y: q.y, z: q.z, w: q.w },
  );

  ctx.onDispose(() => car.dispose());
}
