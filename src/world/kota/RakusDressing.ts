import * as THREE from 'three';
import { box, cone, cyl, merge, sph, type Part } from './ColorMesh';
import { PuffPool } from './BossLook';

/**
 * The cosy-messy loading hall around the Tikus Rakus arena: a plank floor, rice sacks, crates, pallets, shelves, a big rolling door
 * with light shafts, beams with bunting and hanging lamps that pool warm light on the floor. Pure looks: no colliders, no lights,
 * no shadows. Everything static is merged into three meshes (solid, glowing, decals); dust motes are one pooled Points draw.
 * It sits OUTSIDE the fight space (r > 10.3 m) and only shows while the fight is on.
 */
const R = 11.8;
const BEAM_Y = 4.7;
const SIDES = 6;
/** The door is on the far side (-z): the child looks at it past the boss; the camera never sits inside it. */
const S = -1;

/** Tiny deterministic random (the layout is the same every time). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class RakusDressing {
  readonly group = new THREE.Group();
  private readonly dust: PuffPool;
  private readonly shafts: THREE.Mesh;
  private readonly lampGlow: THREE.Mesh[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly texs: THREE.Texture[] = [];
  private t = 0;
  private dustAcc = 0;
  private readonly cx: number;
  private readonly cz: number;
  private flicker: THREE.MeshBasicMaterial;

  constructor(parent: THREE.Object3D, cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.group.position.set(cx, 0, cz);
    this.group.visible = false;
    const rnd = rng(6606);
    const solid: Part[] = [];
    const glow: Part[] = [];

    // Place a local part list at (x, z) turned by `ry` (rotation about y only).
    const place = (list: Part[], local: Part[], x: number, z: number, ry: number, into: Part[] = solid, k = 1): void => {
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      for (const p of local) {
        const [px, py, pz] = p.p ?? [0, 0, 0];
        const [rx, rry, rz] = p.r ?? [0, 0, 0];
        const [ssx, ssy, ssz] = p.s ?? [1, 1, 1];
        into.push({ g: p.g.clone(), c: p.c, p: [x + (px * c + pz * s) * k, py * k, z + (pz * c - px * s) * k], r: [rx, rry + ry, rz], s: [ssx * k, ssy * k, ssz * k] });
      }
      for (const p of list) p.g.dispose();
    };
    const mk = (fn: () => Part[], x: number, z: number, ry: number, k = 1.3, into: Part[] = solid): void => {
      const local = fn();
      place(local, local, x, z, ry, into, k);
    };

    // ---- building blocks (local space, y up) ---------------------------------------------------------------------
    const SACK = [0xe9d8b0, 0xdcc190, 0xf0e3c6, 0xd9b88a];
    const sack = (x: number, y: number, z: number, ry: number, col: number): Part[] => [
      { g: sph(0.5, 9, 7), c: col, p: [x, y + 0.2, z], r: [0, ry, 0], s: [0.66, 0.4, 0.44] },
      { g: cyl(0.09, 0.15, 0.16, 7), c: col, p: [x, y + 0.42, z] },
      { g: cyl(0.115, 0.115, 0.035, 7), c: 0xc9553d, p: [x, y + 0.44, z] },
    ];
    const sackStack = (rows: number): Part[] => {
      const out: Part[] = [];
      for (let r = 0; r < rows; r++) {
        const n = rows - r;
        for (let i = 0; i < n; i++) out.push(...sack((i - (n - 1) / 2) * 0.95, r * 0.34, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.5, SACK[Math.floor(rnd() * SACK.length)]));
      }
      return out;
    };
    const crate = (x: number, y: number, z: number, ry: number, s = 0.9): Part[] => [
      { g: box(s, s, s), c: 0xbe8a52, p: [x, y + s / 2, z], r: [0, ry, 0] },
      ...[-1, 1].flatMap((k) => [
        { g: box(s + 0.05, 0.12, s + 0.05), c: 0x93602f, p: [x, y + s / 2 + k * s * 0.36, z] as const, r: [0, ry, 0] as const },
      ]),
      { g: box(s + 0.06, s + 0.02, 0.1), c: 0x93602f, p: [x, y + s / 2, z], r: [0, ry + 0.78, 0], s: [0.12, 1, 1] },
    ];
    const crateStack = (): Part[] => [...crate(0, 0, 0, 0.1), ...crate(1.0, 0, 0.1, -0.12, 0.8), ...crate(0.45, 0.9, 0.05, 0.3, 0.75)];
    const pallet = (x: number, y: number, z: number, ry: number): Part[] => {
      const out: Part[] = [];
      for (const dz of [-0.4, 0, 0.4]) out.push({ g: box(1.3, 0.1, 0.12), c: 0xc79b5c, p: [x, y + 0.12, z + dz], r: [0, ry, 0] });
      for (const dx of [-0.55, 0, 0.55]) out.push({ g: box(0.14, 0.12, 1.0), c: 0xa87b44, p: [x + dx, y + 0.05, z], r: [0, ry, 0] });
      return out;
    };
    const palletSacks = (): Part[] => [...pallet(0, 0, 0, 0), ...sackStack(2).map((p) => ({ ...p, p: [(p.p?.[0] ?? 0), (p.p?.[1] ?? 0) + 0.18, (p.p?.[2] ?? 0)] as const }))];
    const shelf = (w = 2.6): Part[] => {
      const out: Part[] = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ g: box(0.1, 2.5, 0.1), c: 0x7a4f2c, p: [sx * w / 2, 1.25, sz * 0.3] });
      const jars = [0xff9fb5, 0xffd36b, 0x8fd6a3, 0x8ec5ff, 0xf6a65a];
      for (let l = 0; l < 3; l++) {
        out.push({ g: box(w + 0.1, 0.07, 0.7), c: 0xa66b3a, p: [0, 0.45 + l * 0.8, 0] });
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * (w / 4);
          if ((i + l) % 2) out.push({ g: cyl(0.14, 0.14, 0.34, 8), c: jars[(i + l * 2) % jars.length], p: [x, 0.66 + l * 0.8, (rnd() - 0.5) * 0.2] });
          else out.push({ g: box(0.4, 0.3 + rnd() * 0.1, 0.35), c: [0xe9c88a, 0xd99a6c, 0xf2e2b6][(i + l) % 3], p: [x, 0.64 + l * 0.8, 0], r: [0, (rnd() - 0.5) * 0.3, 0] });
        }
      }
      return out;
    };
    const barrel = (): Part[] => [
      { g: cyl(0.42, 0.38, 0.9, 10), c: 0x9b6a3b, p: [0, 0.45, 0] },
      { g: cyl(0.435, 0.435, 0.07, 10), c: 0x5e4a3c, p: [0, 0.22, 0] },
      { g: cyl(0.44, 0.44, 0.07, 10), c: 0x5e4a3c, p: [0, 0.68, 0] },
    ];

    // ---- the hexagon of posts, beams, bunting, lamps --------------------------------------------------------------
    const corner: { x: number; z: number }[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = Math.PI / SIDES + (i / SIDES) * Math.PI * 2; // 30 deg off +z so the door side is an edge
      corner.push({ x: Math.sin(a) * R, z: Math.cos(a) * R });
    }
    const flag = [0xff7a70, 0xffd23f, 0x6fd0ff, 0x8fe08a, 0xff9fe0];
    const lamps: { x: number; z: number }[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = corner[i];
      const b = corner[(i + 1) % SIDES];
      solid.push({ g: cyl(0.16, 0.2, BEAM_Y + 0.2, 8), c: 0x6b4426, p: [a.x, (BEAM_Y + 0.2) / 2, a.z] });
      solid.push({ g: sph(0.26, 8, 6), c: 0x7d5030, p: [a.x, BEAM_Y + 0.15, a.z] });
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      solid.push({ g: box(0.22, 0.3, len), c: 0x7d5030, p: [mx, BEAM_Y + 0.3, mz], r: [0, yaw, 0] });
      // bunting: little triangles hanging from the beam (a sagging row)
      const n = 11;
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const x = a.x + (b.x - a.x) * u;
        const z = a.z + (b.z - a.z) * u;
        const sag = Math.sin(u * Math.PI) * 0.22;
        // pointing down: a 3-sided cone flattened
        glow.push({ g: cone(0.2, 0.42, 3), c: flag[(k + i) % flag.length], p: [x * 0.985, BEAM_Y - 0.1 - sag, z * 0.985], r: [Math.PI, yaw, 0], s: [1, 1, 0.25] });
      }
      if (i !== 2) lamps.push({ x: mx * 0.96, z: mz * 0.96 });
    }
    // Hanging lamps: cord, warm shade and bulb (glowing), plus a floor pool each.
    lamps.push({ x: 4.6, z: S * R * 0.82 }, { x: -4.6, z: S * R * 0.82 });
    const poolPos: { x: number; z: number }[] = [];
    for (const l of lamps) {
      solid.push({ g: cyl(0.02, 0.02, 1.0, 4), c: 0x3a2a20, p: [l.x, BEAM_Y - 0.4, l.z] });
      solid.push({ g: cone(0.5, 0.42, 12), c: 0xe0742e, p: [l.x, BEAM_Y - 1.05, l.z], s: [1, 1, 1] });
      glow.push({ g: sph(0.2, 8, 6), c: 0xfff0b0, p: [l.x, BEAM_Y - 1.2, l.z] });
      poolPos.push(l);
    }

    // ---- clutter ---------------------------------------------------------------------------------------------------
    // Door side (+z, angle 0): shelves each side of the rolling door.
    const dz = S * R * Math.cos(Math.PI / SIDES);
    mk(() => shelf(2.6), -4.9, dz - S * 0.5, 0);
    mk(() => shelf(2.6), 4.9, dz - S * 0.5, 0);
    // Around the other edges, pushed to the outer rim.
    // Tall things only on the far half (behind the boss, away from the camera); low things near the camera side.
    const tall: (() => Part[])[] = [() => sackStack(3), crateStack, palletSacks, barrel];
    const low: (() => Part[])[] = [() => sack(0, 0, 0, 0.4, SACK[0]), () => pallet(0, 0, 0, 0.2), () => crate(0, 0, 0, 0.3, 0.55), () => sackStack(1)];
    for (let i = 0; i < SIDES; i++) {
      if (i === 2) continue; // the door edge
      const a = corner[i];
      const b = corner[(i + 1) % SIDES];
      for (let k = 0; k < 2; k++) {
        const u = k === 0 ? 0.16 : 0.84;
        const x = (a.x + (b.x - a.x) * u) * 0.88;
        const z = (a.z + (b.z - a.z) * u) * 0.88;
        const face = Math.atan2(-x, -z);
        const isTall = i === 1 || i === 3;
        const list = isTall ? tall : low;
        mk(list[(i * 2 + k) % list.length], x, z, face + (rnd() - 0.5) * 0.3, isTall ? 1.3 : 1.0);
      }
    }
    // Messy extras near the rim: loose sacks, a tipped crate, little stacks.
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 9.6 + rnd() * 1.2;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (z < -8.5 && Math.abs(x) < 4.6) continue; // keep the door clear
      if (i % 3 === 0) mk(() => sack(0, 0, 0, rnd() * 3, SACK[i % SACK.length]), x, z, a, 1.0);
      else if (i % 3 === 1) mk(() => crate(0, 0, 0, rnd() * 3, 0.5), x, z, a, 1.0);
      else mk(() => pallet(0, 0, 0, a), x, z, a, 1.0);
    }
    // Crumbs and grains scattered on the floor (tiny, flat; merged).
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 3 + rnd() * 9;
      const col = [0xf2e2b6, 0xd9a35a, 0xffffff, 0xe6c07a, 0xc77f3c][Math.floor(rnd() * 5)];
      solid.push({ g: sph(0.05 + rnd() * 0.05, 5, 4), c: col, p: [Math.sin(a) * r, 0.07, Math.cos(a) * r], s: [1, 0.5, 1] });
    }

    // ---- the big rolling door ----------------------------------------------------------------------------------------
    const doorW = 7.2;
    const doorH = 4.0;
    // frame
    solid.push({ g: box(0.35, doorH + 0.3, 0.4), c: 0x6b4426, p: [-doorW / 2 - 0.2, doorH / 2, dz] });
    solid.push({ g: box(0.35, doorH + 0.3, 0.4), c: 0x6b4426, p: [doorW / 2 + 0.2, doorH / 2, dz] });
    solid.push({ g: box(doorW + 0.8, 0.45, 0.4), c: 0x6b4426, p: [0, doorH + 0.1, dz] });
    // rolled-up shutter slats near the top (corrugated: stacked ribs) and a roll drum
    for (let k = 0; k < 6; k++) solid.push({ g: box(doorW, 0.17, 0.12), c: k % 2 ? 0xc9d3dc : 0xaebbc6, p: [0, doorH - 0.2 - k * 0.2, dz - 0.05] });
    solid.push({ g: cyl(0.3, 0.3, doorW, 10), c: 0x8d99a6, p: [0, doorH + 0.05, dz - 0.2], r: [0, 0, Math.PI / 2] });
    // the warm glowing hall behind the opening
    glow.push({ g: box(doorW - 0.1, doorH - 1.5, 0.05), c: 0xffe3a0, p: [0, (doorH - 1.5) / 2, dz - S * 0.45] });

    const solidGeo = merge(solid);
    const glowGeo = merge(glow);
    this.geos.push(solidGeo, glowGeo);
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.flicker = glowMat;
    this.mats.push(solidMat, glowMat);
    const solidMesh = new THREE.Mesh(solidGeo, solidMat);
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    for (const m of [solidMesh, glowMesh]) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
      this.group.add(m);
    }

    // ---- plank floor ---------------------------------------------------------------------------------------------------
    const planks = canvasTex(
      512,
      512,
      (g) => {
        const r2 = rng(42);
        g.fillStyle = '#b98f5c';
        g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 16; i++) {
          const y = i * 32;
          const hue = 28 + r2() * 8;
          g.fillStyle = `hsl(${hue}, ${42 + r2() * 12}%, ${50 + r2() * 12}%)`;
          g.fillRect(0, y, 512, 30);
          g.fillStyle = 'rgba(80,45,20,0.18)';
          for (let k = 0; k < 5; k++) g.fillRect(r2() * 512, y + 4 + r2() * 20, 40 + r2() * 90, 2);
          g.fillStyle = 'rgba(60,32,14,0.55)';
          g.fillRect(0, y + 30, 512, 2);
          // butt joints and nails
          const jx = r2() * 512;
          g.fillRect(jx, y, 2, 32);
          g.fillStyle = 'rgba(70,50,40,0.7)';
          for (const nx of [jx + 8, jx - 8]) { g.beginPath(); g.arc((nx + 512) % 512, y + 15, 1.8, 0, 7); g.fill(); }
        }
      },
      true,
    );
    planks.repeat.set(4, 4);
    this.texs.push(planks);
    const floorGeo = new THREE.CircleGeometry(R + 1.3, 48);
    floorGeo.rotateX(-Math.PI / 2);
    this.geos.push(floorGeo);
    const floorMat = new THREE.MeshLambertMaterial({ map: planks, color: 0x8e857c });
    floorMat.polygonOffset = true;
    floorMat.polygonOffsetFactor = -3;
    floorMat.polygonOffsetUnits = -3;
    this.mats.push(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = 0.045;
    floor.receiveShadow = false;
    this.group.add(floor);

    // ---- warm light pools under the lamps + door spill (additive decals, lifted and offset: no z-fighting) --------------
    const poolTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,220,140,0.5)');
      gr.addColorStop(0.5, 'rgba(255,190,100,0.2)');
      gr.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    this.texs.push(poolTex);
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    poolMat.polygonOffset = true;
    poolMat.polygonOffsetFactor = -5;
    poolMat.polygonOffsetUnits = -5;
    this.mats.push(poolMat);
    const poolGeo = new THREE.PlaneGeometry(1, 1);
    poolGeo.rotateX(-Math.PI / 2);
    this.geos.push(poolGeo);
    const addPool = (x: number, z: number, size: number, y: number): void => {
      const m = new THREE.Mesh(poolGeo, poolMat);
      m.position.set(x, y, z);
      m.scale.set(size, 1, size);
      m.renderOrder = 2;
      m.frustumCulled = false;
      this.group.add(m);
      this.lampGlow.push(m);
    };
    for (const p of poolPos) addPool(p.x * 0.97, p.z * 0.97, 7.5, 0.055);
    addPool(0, dz - S * 3, 8.5, 0.058);

    // ---- light shafts from the door ------------------------------------------------------------------------------------
    const shaftTex = canvasTex(32, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(255,236,170,0.55)');
      gr.addColorStop(1, 'rgba(255,236,170,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 128);
      const hg = g.createLinearGradient(0, 0, 32, 0);
      hg.addColorStop(0, 'rgba(0,0,0,1)');
      hg.addColorStop(0.5, 'rgba(0,0,0,0)');
      hg.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = hg;
      g.fillRect(0, 0, 32, 128);
    });
    this.texs.push(shaftTex);
    const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.mats.push(shaftMat);
    const sg: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.PlaneGeometry(1.5 + k * 0.2, 8.4);
      // hang from the door top (y 4.2) down toward the floor in front of the door
      g.translate(0, -4.2, 0);
      g.rotateX(-S * 0.62);
      g.translate((k - 1.5) * 1.7, 4.4, dz + S * 0.3);
      sg.push(g);
    }
    // one merged shaft mesh
    const sgm = merge(sg.map((g) => ({ g, c: 0xffffff })));
    sgm.deleteAttribute('color');
    this.geos.push(sgm);
    this.shafts = new THREE.Mesh(sgm, shaftMat);
    this.shafts.renderOrder = 3;
    this.shafts.frustumCulled = false;
    this.group.add(this.shafts);

    // ---- dust motes (pooled, additive) -----------------------------------------------------------------------------------
    this.dust = new PuffPool(this.group, 56, true);
    parent.add(this.group);
  }

  show(on: boolean): void {
    this.group.visible = on;
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.t += dt;
    // lamps breathe a little
    const k = 0.92 + Math.sin(this.t * 2.1) * 0.05;
    for (let i = 0; i < this.lampGlow.length - 1; i++) this.lampGlow[i].scale.setScalar(7.5 * (k + (i % 2) * 0.03));
    // dust motes drifting in the light of the door
    this.dustAcc += dt * 7;
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      const x = (Math.random() - 0.5) * 11;
      const z = (Math.random() - 0.5) * 11;
      this.dust.emit(x, 0.6 + Math.random() * 3.6, z + 2, (Math.random() - 0.5) * 0.25, 0.05 + Math.random() * 0.12, (Math.random() - 0.5) * 0.25, 5 + Math.random() * 3, 0.1 + Math.random() * 0.08, 0xffe9b8, 'soft');
    }
    this.dust.update(dt);
    void this.flicker;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.dust.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }

  /** World position of the centre (for tests). */
  get at(): { x: number; z: number } {
    return { x: this.cx, z: this.cz };
  }
}
