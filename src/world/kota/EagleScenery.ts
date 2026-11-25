import * as THREE from 'three';
import { box, cyl, merge, sph, type Part } from './ColorMesh';

/**
 * Looks of the Elang Belang rooftop arena (twilight sky): a gradient sky dome with sun and faint stars, fluffy clouds in slowly
 * turning layers, wind streaks, flags and bunting that flap, a parapet with lamps, rooftop details and a painted landing circle.
 * Pure looks: no colliders. Static things are merged; the animated ones are one flag mesh (vertex wave), three cloud groups
 * (rotating) and one instanced wind mesh. Nothing allocates per frame.
 */
export const EAGLE_SKY = { fog: 0x9a84b8, top: 0x1c2a66, mid: 0x6d5aa6, low: 0xf0a38c, sun: 0xffd9a0 };

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

export class EagleScenery {
  readonly group = new THREE.Group();
  private readonly layers: THREE.Group[] = [];
  private readonly flagTime = { value: 0 };
  private readonly streaks: THREE.InstancedMesh;
  private readonly streakData: { x: number; y: number; z: number; v: number; len: number }[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly v3 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly texs: THREE.Texture[] = [];
  private t = 0;

  constructor(parent: THREE.Object3D) {
    const rnd = rng(7007);
    this.group.name = 'eagle-scenery';

    // ---- sky dome: vertex-coloured gradient (horizon peach, violet middle, deep blue top) ------------------------------
    const dome = new THREE.SphereGeometry(140, 28, 18);
    const pos = dome.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const cLow = new THREE.Color(EAGLE_SKY.low);
    const cMid = new THREE.Color(EAGLE_SKY.mid);
    const cTop = new THREE.Color(EAGLE_SKY.top);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(-0.1, pos.getY(i) / 140);
      if (h < 0.18) c.copy(cLow).lerp(cMid, Math.max(0, h + 0.1) / 0.28);
      else c.copy(cMid).lerp(cTop, Math.min(1, (h - 0.18) / 0.6));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    dome.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false });
    const domeMesh = new THREE.Mesh(dome, domeMat);
    domeMesh.renderOrder = -10;
    domeMesh.frustumCulled = false;
    this.group.add(domeMesh);
    this.geos.push(dome);
    this.mats.push(domeMat);

    // sun: a disc with a soft halo, low behind the skyline; faint stars up high
    const haloTex = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,244,214,1)');
      gr.addColorStop(0.22, 'rgba(255,236,190,1)');
      gr.addColorStop(0.27, 'rgba(255,214,150,0.5)');
      gr.addColorStop(1, 'rgba(255,170,120,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    this.texs.push(haloTex);
    const haloMat = new THREE.SpriteMaterial({ map: haloTex, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.mats.push(haloMat);
    const halo = new THREE.Sprite(haloMat);
    halo.position.set(-45, 20, -115);
    halo.scale.set(110, 110, 1);
    halo.renderOrder = -9;
    this.group.add(halo);
    const starPts: number[] = [];
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const h = 0.35 + rnd() * 0.6;
      const r = 135;
      starPts.push(Math.cos(a) * r * (1 - h * 0.4), h * r, Math.sin(a) * r * (1 - h * 0.4));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xfff4d8, size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7, depthWrite: false });
    this.geos.push(starGeo);
    this.mats.push(starMat);
    const stars = new THREE.Points(starGeo, starMat);
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    this.group.add(stars);

    // ---- fluffy clouds: three layers that turn slowly around the arena ----------------------------------------------
    const cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
    this.mats.push(cloudMat);
    const bump = (parts: Part[], x: number, y: number, z: number, r: number, tint: number): void => {
      parts.push({ g: sph(1, 10, 7), c: tint, p: [x, y, z], s: [r, r * 0.72, r * 0.9] });
    };
    const layerSpec = [
      { n: 9, r0: 50, r1: 85, y0: 4, y1: 26, speed: 0.006, scale: 1.0, tint: 0xfff0f2 },
      { n: 8, r0: 38, r1: 70, y0: -9, y1: -4, speed: -0.004, scale: 1.3, tint: 0xffe2e0 },
      { n: 7, r0: 70, r1: 105, y0: 24, y1: 46, speed: 0.003, scale: 1.9, tint: 0xe8dcf8 },
    ];
    for (const L of layerSpec) {
      const parts: Part[] = [];
      for (let k = 0; k < L.n; k++) {
        const a = (k / L.n) * Math.PI * 2 + rnd() * 0.5;
        const r = L.r0 + rnd() * (L.r1 - L.r0);
        const cx = Math.sin(a) * r;
        const cz = Math.cos(a) * r;
        const cy = L.y0 + rnd() * (L.y1 - L.y0);
        const yaw = a + Math.PI / 2;
        const blobs = 5 + Math.floor(rnd() * 3);
        for (let b = 0; b < blobs; b++) {
          const u = (b / (blobs - 1) - 0.5) * 2;
          const w = (5.5 - Math.abs(u) * 2.6 + rnd() * 1.5) * L.scale;
          const lx = u * 8 * L.scale;
          // lit top, pink-violet belly: pick the tint by height (flat per blob, the belly is a darker flat bump)
          bump(parts, cx + Math.cos(yaw) * lx, cy + (rnd() - 0.3) * 1.4 * L.scale, cz - Math.sin(yaw) * lx, w, L.tint);
        }
        bump(parts, cx, cy - 1.6 * L.scale, cz, 8 * L.scale, 0xd9b6d6); // belly
      }
      const geo = merge(parts);
      this.geos.push(geo);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, cloudMat));
      for (const m of g.children) m.frustumCulled = false;
      this.group.add(g);
      this.layers.push(g);
      g.userData.speed = L.speed;
    }

    // ---- rooftop: tiles, painted landing circle, parapet, lamps, vents ----------------------------------------------------
    const tileTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#9a9cc0';
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const l = 62 + ((x * 7 + y * 13) % 5) * 2.2;
        g.fillStyle = `hsl(245, 22%, ${l}%)`;
        g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
      }
    });
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    tileTex.repeat.set(7, 7);
    this.texs.push(tileTex);
    const tileMat = new THREE.MeshLambertMaterial({ map: tileTex });
    tileMat.polygonOffset = true;
    tileMat.polygonOffsetFactor = -2;
    tileMat.polygonOffsetUnits = -2;
    this.mats.push(tileMat);
    const tileGeo = new THREE.PlaneGeometry(42, 42);
    tileGeo.rotateX(-Math.PI / 2);
    this.geos.push(tileGeo);
    const tiles = new THREE.Mesh(tileGeo, tileMat);
    tiles.position.y = 0.012;
    this.group.add(tiles);

    const ringTex = canvasTex(512, 512, (g) => {
      g.translate(256, 256);
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 7;
      g.beginPath(); g.arc(0, 0, 246, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(255,214,120,0.9)';
      g.lineWidth = 10;
      g.setLineDash([26, 22]);
      g.beginPath(); g.arc(0, 0, 226, 0, 7); g.stroke();
      g.setLineDash([]);
      // a big soft star in the middle
      g.fillStyle = 'rgba(255,225,140,0.35)';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 70 : 150;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    });
    this.texs.push(ringTex);
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, toneMapped: false });
    ringMat.polygonOffset = true;
    ringMat.polygonOffsetFactor = -4;
    ringMat.polygonOffsetUnits = -4;
    this.mats.push(ringMat);
    const ringGeo = new THREE.PlaneGeometry(35, 35);
    ringGeo.rotateX(-Math.PI / 2);
    this.geos.push(ringGeo);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.03;
    ring.renderOrder = 1;
    this.group.add(ring);

    const solid: Part[] = [];
    const glow: Part[] = [];
    // parapet with a light cap
    for (const [x, z, w, d] of [[0, -20.7, 42, 0.6], [0, 20.7, 42, 0.6], [-20.7, 0, 0.6, 42], [20.7, 0, 0.6, 42]] as const) {
      solid.push({ g: box(w, 0.9, d), c: 0xb7aad6, p: [x, 0.45, z] });
      solid.push({ g: box(w + (w > d ? 0 : 0.2), 0.14, d + (w > d ? 0.2 : 0), ), c: 0xf0e6ff, p: [x, 0.95, z] });
    }
    // corner lamps and mid-edge lamps
    for (const [x, z] of [[-20, -20], [20, -20], [-20, 20], [20, 20], [0, -20], [0, 20], [-20, 0], [20, 0]] as const) {
      solid.push({ g: cyl(0.1, 0.13, 3.4, 6), c: 0x5a4f7a, p: [x, 1.7, z] });
      glow.push({ g: sph(0.34, 8, 6), c: 0xffe6a8, p: [x, 3.5, z] });
    }
    // rooftop clutter in the corners, outside the flight space: stairwell hut, water tank, vents, planters
    solid.push({ g: box(5, 3.2, 4), c: 0xcfc4e6, p: [-17.2, 1.6, -16.2] });
    solid.push({ g: box(1.2, 2.1, 0.12), c: 0xffb37a, p: [-14.6, 1.05, -16.2], s: [1, 1, 1] });
    solid.push({ g: cyl(1.7, 1.7, 2.2, 14), c: 0xd9a37a, p: [17, 1.9, -16.8] });
    solid.push({ g: cyl(1.8, 1.8, 0.2, 14), c: 0x8b6f5a, p: [17, 3.1, -16.8] });
    for (const lx of [-1.1, 1.1]) solid.push({ g: cyl(0.1, 0.1, 1.0, 5), c: 0x6a5a50, p: [17 + lx, 0.5, -16.8] });
    solid.push({ g: box(2.4, 1.3, 2.2), c: 0xb8c4d6, p: [-17, 0.65, 16.6] });
    solid.push({ g: cyl(0.5, 0.5, 0.3, 10), c: 0x7e8ea3, p: [-17, 1.45, 16.6] });
    for (let i = 0; i < 6; i++) {
      const x = 14 + (i % 3) * 1.9;
      const z = 16 + Math.floor(i / 3) * 1.8;
      solid.push({ g: box(1.4, 0.55, 0.9), c: 0xa9694f, p: [x, 0.28, z] });
      solid.push({ g: sph(0.55, 8, 6), c: [0x7ed08a, 0xff9fb5, 0xffd36b][i % 3], p: [x, 0.75, z], s: [1, 0.8, 0.8] });
    }
    // the BANK sign needs a frame
    solid.push({ g: box(9.8, 2.9, 0.16), c: 0x5a4f7a, p: [0, 2, -21.1] });
    const solidGeo = merge(solid);
    const glowGeo = merge(glow);
    this.geos.push(solidGeo, glowGeo);
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.mats.push(solidMat, glowMat);
    this.group.add(new THREE.Mesh(solidGeo, solidMat), new THREE.Mesh(glowGeo, glowMat));

    // ---- flags on poles and bunting between them (one animated mesh) --------------------------------------------------
    const flagParts: THREE.BufferGeometry[] = [];
    const poles: Part[] = [];
    const flagCols = [0xff7a70, 0xffd23f, 0x5fc8ff, 0x8fe08a, 0xff9fe0, 0xffa24a];
    const addFlag = (x: number, z: number, h: number, w: number, hh: number, color: number, yaw: number): void => {
      poles.push({ g: cyl(0.07, 0.09, h, 6), c: 0xf3ecff, p: [x, h / 2, z] });
      poles.push({ g: sph(0.14, 6, 4), c: 0xffd23f, p: [x, h + 0.05, z] });
      const g = new THREE.PlaneGeometry(w, hh, 10, 2);
      g.translate(w / 2 + 0.05, 0, 0);
      const p = g.getAttribute('position');
      const wave = new Float32Array(p.count);
      const colr = new Float32Array(p.count * 3);
      const cc = new THREE.Color(color);
      for (let i = 0; i < p.count; i++) {
        wave[i] = Math.max(0, p.getX(i) / w);
        const stripe = Math.abs(p.getY(i)) < hh * 0.18 ? 1.25 : 1;
        colr[i * 3] = cc.r * stripe; colr[i * 3 + 1] = cc.g * stripe; colr[i * 3 + 2] = cc.b * stripe;
      }
      g.setAttribute('aWave', new THREE.BufferAttribute(wave, 1));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.rotateY(yaw);
      g.translate(x, h - hh / 2 - 0.15, z);
      flagParts.push(g);
    };
    let fi = 0;
    for (const [x, z] of [[-20, -20], [20, -20]] as const) addFlag(x, z, 6.2, 2.6, 1.5, flagCols[fi++ % flagCols.length], Math.atan2(1, 0) * 0 + (x > 0 ? Math.PI : 0));
    for (const x of [-10, 10]) addFlag(x, -20.4, 5.0, 2.2, 1.3, flagCols[fi++ % flagCols.length], 0);
    // bunting strings along the back and the sides (small pennants)
    const pennant = (x: number, y: number, z: number, color: number, yaw: number): void => {
      const g = new THREE.PlaneGeometry(0.55, 0.7, 2, 2);
      g.translate(0, -0.35, 0);
      const p = g.getAttribute('position');
      const wave = new Float32Array(p.count);
      const colr = new Float32Array(p.count * 3);
      const cc = new THREE.Color(color);
      for (let i = 0; i < p.count; i++) {
        wave[i] = -p.getY(i) / 0.7 * 0.5;
        colr[i * 3] = cc.r; colr[i * 3 + 1] = cc.g; colr[i * 3 + 2] = cc.b;
      }
      g.setAttribute('aWave', new THREE.BufferAttribute(wave, 1));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.rotateY(yaw);
      g.translate(x, y, z);
      flagParts.push(g);
    };
    for (let k = 0; k < 14; k++) {
      const u = k / 13;
      const x = -20 + u * 40;
      pennant(x, 3.6 - Math.sin(u * Math.PI) * -0.0 - Math.sin(u * Math.PI) * 0.7, -20, flagCols[k % flagCols.length], 0);
    }
    for (let k = 0; k < 14; k++) {
      const u = k / 13;
      const z = -20 + u * 40;
      pennant(-20, 3.6 - Math.sin(u * Math.PI) * 0.7, z, flagCols[(k + 1) % flagCols.length], Math.PI / 2);
      pennant(20, 3.6 - Math.sin(u * Math.PI) * 0.7, z, flagCols[(k + 3) % flagCols.length], -Math.PI / 2);
    }
    const polesGeo = merge(poles);
    this.geos.push(polesGeo);
    this.group.add(new THREE.Mesh(polesGeo, solidMat));
    // string lines between the lamp posts (thin dark boxes, sagging in the middle)
    const strings: Part[] = [];
    for (let k = 0; k < 24; k++) {
      const u = k / 24;
      const sag = Math.sin((u + 0.5 / 24) * Math.PI) * 0.7;
      const x = -20 + (u + 0.5 / 24) * 40;
      strings.push({ g: box(40 / 24 + 0.05, 0.04, 0.04), c: 0x4a4068, p: [x, 3.6 - sag, -20] });
      strings.push({ g: box(0.04, 0.04, 40 / 24 + 0.05), c: 0x4a4068, p: [-20, 3.6 - sag, x] });
      strings.push({ g: box(0.04, 0.04, 40 / 24 + 0.05), c: 0x4a4068, p: [20, 3.6 - sag, x] });
    }
    const stringsGeo = merge(strings);
    this.geos.push(stringsGeo);
    this.group.add(new THREE.Mesh(stringsGeo, solidMat));
    const flagGeo = flagParts.length ? mergeFlat(flagParts) : null;
    if (flagGeo) {
      this.geos.push(flagGeo);
      const flagMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const timeU = this.flagTime;
      flagMat.onBeforeCompile = (shader) => {
        shader.uniforms.flagTime = timeU;
        shader.vertexShader = 'uniform float flagTime;\nattribute float aWave;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float ph = position.x * 1.7 + position.z * 1.7 + position.y * 2.3;
           transformed.y += sin(flagTime * 6.0 + ph * 3.0) * 0.12 * aWave;
           transformed.x += sin(flagTime * 5.0 + ph * 3.0 + 1.6) * 0.1 * aWave;
           transformed.z += sin(flagTime * 6.5 + ph * 2.6) * 0.1 * aWave;`,
        );
      };
      flagMat.customProgramCacheKey = () => 'eagle-flag-v1';
      this.mats.push(flagMat);
      const flags = new THREE.Mesh(flagGeo, flagMat);
      flags.frustumCulled = false;
      this.group.add(flags);
    }

    // ---- wind streaks (instanced, thin white ribbons racing past) -----------------------------------------------------------
    const streakTex = canvasTex(128, 8, (g) => {
      const gr = g.createLinearGradient(0, 0, 128, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.7)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 2, 128, 4);
    });
    this.texs.push(streakTex);
    const streakMat = new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: 0.55 });
    this.mats.push(streakMat);
    const a = new THREE.PlaneGeometry(1, 0.1);
    const b = new THREE.PlaneGeometry(1, 0.1);
    b.rotateX(Math.PI / 2);
    const streakGeo = merge([{ g: a, c: 0xffffff }, { g: b, c: 0xffffff }]);
    streakGeo.deleteAttribute('color');
    this.geos.push(streakGeo);
    const N = 14;
    this.streaks = new THREE.InstancedMesh(streakGeo, streakMat, N);
    this.streaks.frustumCulled = false;
    for (let i = 0; i < N; i++) this.streakData.push({ x: (rnd() - 0.5) * 120, y: rnd() * 26 - 2, z: (rnd() - 0.5) * 100, v: 26 + rnd() * 22, len: 5 + rnd() * 9 });
    this.group.add(this.streaks);
    this.writeStreaks();
    parent.add(this.group);
  }

  private writeStreaks(): void {
    for (let i = 0; i < this.streakData.length; i++) {
      const s = this.streakData[i];
      this.m4.compose(this.v3.set(s.x, s.y, s.z), this.q.identity(), this.s3.set(s.len, 1, 1));
      this.streaks.setMatrixAt(i, this.m4);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    this.flagTime.value = this.t;
    for (const l of this.layers) l.rotation.y += dt * (l.userData.speed as number);
    for (const s of this.streakData) {
      s.x += s.v * dt;
      if (s.x > 70) {
        s.x = -70;
        s.y = Math.random() * 26 - 2;
        s.z = (Math.random() - 0.5) * 100;
      }
    }
    this.writeStreaks();
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.streaks.dispose();
  }
}

/** Merge plain geometries that share the same attribute set (no colour re-bake). */
function mergeFlat(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  let total = 0;
  for (const g of list) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const wave = new Float32Array(total);
  const idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const c = g.getAttribute('color');
    const w = g.getAttribute('aWave');
    for (let i = 0; i < p.count; i++) {
      pos[(off + i) * 3] = p.getX(i); pos[(off + i) * 3 + 1] = p.getY(i); pos[(off + i) * 3 + 2] = p.getZ(i);
      col[(off + i) * 3] = c.getX(i); col[(off + i) * 3 + 1] = c.getY(i); col[(off + i) * 3 + 2] = c.getZ(i);
      wave[off + i] = w.getX(i);
    }
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(off + ix.getX(i));
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aWave', new THREE.BufferAttribute(wave, 1));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}
