import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cyl, merge, sph, type Part } from './ColorMesh';
import { personGeo } from './CityPeople';
import { Clip, type Crowd, type PoseState, crowdColor, drawPose, newPose, packLook, stepPose } from './Crowd';
import { CITY_LAYOUT } from './CityData';
import { getShopPanel } from '../../ui/ShopPanel';
import { QuizIcons } from '../../ui/QuizIcons';

const STRIPES = [0xff5a5f, 0xffc94d, 0x4dabf7, 0x34c759];
const KEEPER_VARIANT = 3;

/** The shop front (local frame: +z away from the facade, x along it, origin on the facade line at street level). */
function shopGeo(): THREE.BufferGeometry {
  const S = CITY_LAYOUT.places.shop;
  const parts: Part[] = [];
  // Colourful awning: eight stripes sloping down away from the wall.
  for (let i = 0; i < 8; i++) parts.push({ g: box(0.76, 0.07, 1.7), c: STRIPES[i % 4], p: [-2.66 + i * 0.76, 2.55, 0.95], r: [0.3, 0, 0] });
  for (let i = 0; i < 8; i++) parts.push({ g: sph(0.2, 6, 4), c: STRIPES[i % 4], p: [-2.66 + i * 0.76, 2.1, 1.75], s: [1.1, 0.7, 0.7] });
  // Display table with toys: ball, blocks, a teddy.
  parts.push({ g: box(1.5, 0.08, 0.7), c: 0xb98a55, p: [-2.1, 0.8, 2.0] });
  for (const dx of [-0.65, 0.65]) for (const dz of [-0.25, 0.25]) parts.push({ g: box(0.08, 0.8, 0.08), c: 0x8a5a33, p: [-2.1 + dx, 0.4, 2.0 + dz] });
  parts.push({ g: sph(0.17, 8, 6), c: 0xe8453c, p: [-2.6, 1.0, 2.0] });
  parts.push({ g: box(0.24, 0.24, 0.24), c: 0x4dabf7, p: [-2.2, 0.96, 1.9] });
  parts.push({ g: box(0.24, 0.24, 0.24), c: 0xffc94d, p: [-2.2, 1.2, 1.9], r: [0, 0.5, 0] });
  parts.push({ g: sph(0.2, 8, 6), c: 0xa86b3c, p: [-1.65, 1.0, 2.05] });
  parts.push({ g: sph(0.14, 8, 6), c: 0xa86b3c, p: [-1.65, 1.27, 2.05] });
  parts.push({ g: sph(0.05, 6, 4), c: 0xa86b3c, p: [-1.77, 1.4, 2.05] }, { g: sph(0.05, 6, 4), c: 0xa86b3c, p: [-1.53, 1.4, 2.05] });
  // Balloons at the right end.
  parts.push({ g: cyl(0.012, 0.012, 1.8, 4), c: 0xffffff, p: [3.0, 0.9, 1.0] });
  parts.push({ g: sph(0.3, 8, 6), c: 0xff5a5f, p: [3.0, 2.0, 1.0], s: [1, 1.2, 1] }, { g: sph(0.3, 8, 6), c: 0x4dabf7, p: [3.3, 1.8, 1.0], s: [1, 1.2, 1] }, { g: sph(0.3, 8, 6), c: 0xffc94d, p: [2.75, 1.75, 1.15], s: [1, 1.2, 1] });
  const g = merge(parts);
  g.rotateY(S.yaw);
  g.translate(S.facade.x, 0, S.facade.z);
  return g;
}

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, 512, 128);
    g.lineWidth = 10;
    g.strokeStyle = '#e8453c';
    g.strokeRect(5, 5, 502, 118);
    g.font = '900 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#fff';
    g.fillStyle = '#2a7de1';
    g.strokeText('TOKO MAINAN', 256, 66);
    g.fillText('TOKO MAINAN', 256, 66);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Toko Mainan: one ruko of the plaza (the north row, nearest to the clock tower) is the toy shop: a sign, a striped awning,
 * toys on a table, balloons and a friendly keeper. The hand button opens the shop panel (src/ui/ShopPanel.ts). Pure decoration
 * (no colliders), so the building's routes and check:reach are unchanged.
 */
export class CityShop {
  private readonly mesh: THREE.Mesh;
  private readonly sign: THREE.Mesh;
  private readonly hint: HTMLElement;
  private readonly pose: PoseState = newPose(0.6);
  private readonly look = packLook(0, crowdColor(0x8e4fd8), crowdColor(0x3b5b92), crowdColor(0x4a2a1a));
  private near = false;
  /** Test counter. */
  opens = 0;

  constructor(private readonly ctx: LevelContext, lit: THREE.Material, private readonly crowd: Crowd) {
    const S = CITY_LAYOUT.places.shop;
    const out: THREE.BufferGeometry[] = [shopGeo()];
    if (!crowd.ready) {
      const p = personGeo(0x8e4fd8, 0x4a2a1a);
      p.rotateY(S.yaw);
      p.translate(S.keeper.x, 0, S.keeper.z);
      out.push(p);
    }
    const geo = mergeGeometries(out, false);
    for (const g of out) g.dispose();
    if (!geo) throw new Error('CityShop: merge failed');
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, lit);
    this.mesh.castShadow = false;
    ctx.root.add(this.mesh);

    const tex = signTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const plane = new THREE.PlaneGeometry(4.6, 1.15);
    this.sign = new THREE.Mesh(plane, mat);
    const [fx, fz] = [Math.sin(S.yaw), Math.cos(S.yaw)];
    this.sign.position.set(S.facade.x + fx * 0.14, 3.95, S.facade.z + fz * 0.14);
    this.sign.rotation.y = S.yaw;
    ctx.root.add(this.sign);

    this.hint = document.createElement('div');
    this.hint.className = 'shop-hint';
    this.hint.hidden = true;
    this.hint.innerHTML = `<span class="shop-hint-ico">${QuizIcons.coin}</span><b>Belanja</b>`;
    ctx.ui.appendChild(this.hint);

    ctx.onDispose(() => {
      geo.dispose();
      plane.dispose();
      mat.dispose();
      tex.dispose();
      this.hint.remove();
    });

    const pos = new THREE.Vector3(S.keeper.x, 0.9, S.keeper.z);
    ctx.interactions.add({
      position: () => pos,
      radius: 3.4,
      icon: 'hand',
      promptHeight: 2.1,
      onInteract: () => this.open(),
    });
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __shopPlace?: unknown };
      w.__shopPlace = { spot: () => S, open: () => this.open(), opens: () => this.opens };
      ctx.onDispose(() => {
        delete w.__shopPlace;
      });
    }
  }

  private open(): void {
    const panel = getShopPanel();
    if (!panel || panel.opened || this.ctx.health.resting) return;
    this.opens++;
    panel.open('shop');
  }

  update(dt: number): void {
    const S = CITY_LAYOUT.places.shop;
    const p = this.ctx.player.visualPosition;
    const d2 = (p.x - S.keeper.x) ** 2 + (p.z - S.keeper.z) ** 2;
    const near = d2 < 3.4 * 3.4;
    if (near !== this.near) {
      this.near = near;
      this.hint.hidden = !near;
    }
    if (!this.crowd.ready || d2 > 90 * 90) return;
    stepPose(this.crowd, KEEPER_VARIANT, this.pose, d2 < 49 ? Clip.wave : Clip.idle, dt);
    drawPose(this.crowd, KEEPER_VARIANT, this.look, S.keeper.x, 0, S.keeper.z, S.yaw, 0.98, this.pose);
  }

  /** Where the shop is (map icon). */
  spot(): { x: number; z: number } {
    const S = CITY_LAYOUT.places.shop;
    return { x: S.x, z: S.z + 2 };
  }
}
