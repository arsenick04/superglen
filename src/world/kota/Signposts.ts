import * as THREE from 'three';
import type { LevelContext } from '../Level';
import type { CitySign, SignDest, SignIcon } from './CityPlaces';

const CELL_W = 256;
const CELL_H = 64;
const ATLAS = 512;
const ARM_LEN = 2.0;
const ARM_H = 0.42;
const ARM_STEP = 0.48;
const POLE_H = 3.5;
const THICK = 0.035;
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** A small pictogram inside a white disc at (cx, cy), radius r. */
function drawIcon(g: CanvasRenderingContext2D, kind: SignIcon, cx: number, cy: number, r: number): void {
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = '#fff';
  g.fill();
  g.translate(cx, cy);
  const s = r * 0.62;
  g.fillStyle = '#3a3a48';
  g.strokeStyle = '#3a3a48';
  g.lineWidth = r * 0.16;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (kind) {
    case 'home':
      g.fillStyle = '#e8453c';
      g.beginPath();
      g.moveTo(-s * 1.15, -s * 0.05);
      g.lineTo(0, -s * 1.1);
      g.lineTo(s * 1.15, -s * 0.05);
      g.fill();
      g.fillStyle = '#ffc36b';
      g.fillRect(-s * 0.75, -s * 0.05, s * 1.5, s * 1.0);
      g.fillStyle = '#6b4a2b';
      g.fillRect(-s * 0.2, s * 0.3, s * 0.4, s * 0.65);
      break;
    case 'school':
      g.fillRect(-s * 0.85, -s * 1.0, s * 0.18, s * 2.0);
      g.fillStyle = '#4dabf7';
      g.fillRect(-s * 0.67, -s * 1.0, s * 1.5, s * 1.0);
      break;
    case 'basket':
      g.fillStyle = '#e8902a';
      g.beginPath();
      g.moveTo(-s * 1.0, -s * 0.1);
      g.lineTo(s * 1.0, -s * 0.1);
      g.lineTo(s * 0.7, s * 0.95);
      g.lineTo(-s * 0.7, s * 0.95);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(0, -s * 0.1, s * 0.75, Math.PI, 0);
      g.stroke();
      g.fillStyle = '#e53935';
      g.beginPath();
      g.arc(-s * 0.3, -s * 0.2, s * 0.28, 0, Math.PI * 2);
      g.fill();
      break;
    case 'clock':
      g.beginPath();
      g.arc(0, 0, s * 0.95, 0, Math.PI * 2);
      g.fillStyle = '#fff3c4';
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -s * 0.65);
      g.moveTo(0, 0);
      g.lineTo(s * 0.45, s * 0.1);
      g.stroke();
      break;
    case 'coin':
      g.fillStyle = '#ffc94d';
      g.beginPath();
      g.arc(0, 0, s * 0.95, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#fff3b0';
      g.beginPath();
      g.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      g.fill();
      break;
    case 'cross':
      g.fillStyle = '#e53935';
      g.fillRect(-s * 0.35, -s * 1.0, s * 0.7, s * 2.0);
      g.fillRect(-s * 1.0, -s * 0.35, s * 2.0, s * 0.7);
      break;
  }
  g.restore();
}

/** One cell of the atlas: the board with its colour, icon, name and an arrow at the pointing end (right on the front, left on the back). */
function drawBoard(g: CanvasRenderingContext2D, x0: number, y0: number, d: SignDest, back: boolean): void {
  g.save();
  g.translate(x0, y0);
  g.fillStyle = hex(d.color);
  g.fillRect(0, 0, CELL_W, CELL_H);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, 0, CELL_W, 5);
  g.fillRect(0, CELL_H - 5, CELL_W, 5);
  const ir = 22;
  const arrowW = 34;
  // Layout: front [icon][name][>], back [<][icon][name].
  const iconX = back ? arrowW + ir + 6 : ir + 8;
  drawIcon(g, d.icon, iconX, CELL_H / 2, ir);
  const textX0 = iconX + ir + 8;
  const textX1 = back ? CELL_W - 8 : CELL_W - arrowW - 6;
  g.font = '800 26px system-ui, sans-serif';
  const w = g.measureText(d.name).width;
  const fit = Math.min(1, (textX1 - textX0) / w);
  g.save();
  g.translate(textX0, CELL_H / 2 + 1);
  g.scale(fit, 1);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(30,30,40,0.85)';
  g.strokeText(d.name, 0, 0);
  g.fillStyle = '#fff';
  g.fillText(d.name, 0, 0);
  g.restore();
  // Arrow.
  g.fillStyle = '#fff';
  g.strokeStyle = 'rgba(30,30,40,0.85)';
  g.lineWidth = 4;
  g.beginPath();
  if (back) {
    g.moveTo(6, CELL_H / 2);
    g.lineTo(6 + arrowW - 8, CELL_H / 2 - 16);
    g.lineTo(6 + arrowW - 8, CELL_H / 2 + 16);
  } else {
    g.moveTo(CELL_W - 6, CELL_H / 2);
    g.lineTo(CELL_W - arrowW + 2, CELL_H / 2 - 16);
    g.lineTo(CELL_W - arrowW + 2, CELL_H / 2 + 16);
  }
  g.closePath();
  g.stroke();
  g.fill();
  g.restore();
}

/** UV rectangle of atlas cell (col, row), row counted from the top of the canvas. */
function cellUv(col: number, row: number): [number, number, number, number] {
  const u0 = (col * CELL_W) / ATLAS;
  const u1 = ((col + 1) * CELL_W) / ATLAS;
  const v1 = 1 - (row * CELL_H) / ATLAS;
  const v0 = 1 - ((row + 1) * CELL_H) / ATLAS;
  return [u0, v0, u1, v1];
}

class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  /** World offset of the post being built. */
  ox = 0;
  oz = 0;

  /** A quad with corners bl, br, tr, tl (counter-clockwise seen from the side the normal points to). */
  quad(bl: THREE.Vector3, br: THREE.Vector3, tr: THREE.Vector3, tl: THREE.Vector3, n: THREE.Vector3, uvr: [number, number, number, number]): void {
    const o = this.pos.length / 3;
    for (const p of [bl, br, tr, tl]) {
      this.pos.push(p.x + this.ox, p.y, p.z + this.oz);
      this.nor.push(n.x, n.y, n.z);
    }
    const [u0, v0, u1, v1] = uvr;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  /** An axis-aligned box in one atlas swatch. */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, uvr: [number, number, number, number]): void {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y0 = cy - h / 2;
    const y1 = cy + h / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
    this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), V(0, 0, 1), uvr);
    this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), V(0, 0, -1), uvr);
    this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), V(1, 0, 0), uvr);
    this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), V(-1, 0, 0), uvr);
    this.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), V(0, 1, 0), uvr);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Direction signposts: a wooden post with one board per place, each board turned toward its place and showing the place's
 * colour, a pictogram and its short name (front and back both read left to right, the arrow at the pointing end). All posts in one small
 * mesh (about 150 triangles each), one shared canvas atlas, no colliders: they are decoration. The hidden old building
 * has no board anywhere.
 */
export class Signposts {
  private readonly mesh: THREE.Mesh;
  private n = 0;
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.MeshStandardMaterial;

  constructor(ctx: LevelContext, signs: readonly CitySign[], dests: readonly SignDest[]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ATLAS;
    const g = canvas.getContext('2d');
    if (g) {
      dests.forEach((d, i) => {
        drawBoard(g, 0, i * CELL_H, d, false);
        drawBoard(g, CELL_W, i * CELL_H, d, true);
      });
      g.fillStyle = '#7a5230';
      g.fillRect(0, 7 * CELL_H, CELL_W, CELL_H);
    }
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 2;
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.85, metalness: 0 });
    const wood = cellUv(0, 7);
    const midWood: [number, number, number, number] = [(wood[0] + wood[2]) / 2, (wood[1] + wood[3]) / 2, (wood[0] + wood[2]) / 2, (wood[1] + wood[3]) / 2];

    const m = new Mesher();
    for (const s of signs) {
      this.n++;
      m.ox = s.x;
      m.oz = s.z;
      m.box(0, POLE_H / 2, 0, 0.16, POLE_H, 0.16, midWood);
      m.box(0, POLE_H + 0.06, 0, 0.26, 0.12, 0.26, midWood);
      s.arms.forEach((di, k) => {
        const d = dests[di];
        let dx = d.x - s.x;
        let dz = d.z - s.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const y = POLE_H - 0.5 - k * ARM_STEP;
        const D = new THREE.Vector3(dx, 0, dz);
        const N = new THREE.Vector3(-dz, 0, dx);
        const U = new THREE.Vector3(0, 1, 0);
        const C = new THREE.Vector3(dx * (ARM_LEN / 2 + 0.08), y, dz * (ARM_LEN / 2 + 0.08));
        const at = (a: number, b: number, c: number): THREE.Vector3 => C.clone().addScaledVector(D, a).addScaledVector(U, b).addScaledVector(N, c);
        const hl = ARM_LEN / 2;
        const hh = ARM_H / 2;
        // Front (viewer on the +N side sees the pointing end on the right), back (mirrored layout).
        m.quad(at(-hl, -hh, THICK), at(hl, -hh, THICK), at(hl, hh, THICK), at(-hl, hh, THICK), N.clone(), cellUv(0, di));
        const Nb = N.clone().negate();
        m.quad(at(hl, -hh, -THICK), at(-hl, -hh, -THICK), at(-hl, hh, -THICK), at(hl, hh, -THICK), Nb, cellUv(1, di));
        // Core and edges (a thin wooden slab between the two faces).
        // Top, bottom and the two ends as quads.
        m.quad(at(-hl, hh, -THICK), at(hl, hh, -THICK), at(hl, hh, THICK), at(-hl, hh, THICK), U.clone(), midWood);
        m.quad(at(-hl, -hh, THICK), at(hl, -hh, THICK), at(hl, -hh, -THICK), at(-hl, -hh, -THICK), U.clone().negate(), midWood);
        m.quad(at(hl, -hh, THICK), at(hl, -hh, -THICK), at(hl, hh, -THICK), at(hl, hh, THICK), D.clone(), midWood);
        m.quad(at(-hl, -hh, -THICK), at(-hl, -hh, THICK), at(-hl, hh, THICK), at(-hl, hh, -THICK), D.clone().negate(), midWood);
      });
    }
    this.mesh = new THREE.Mesh(m.geometry(), this.mat);
    this.mesh.castShadow = false;
    ctx.root.add(this.mesh);
    ctx.onDispose(() => {
      this.mesh.geometry.dispose();
      this.mat.dispose();
      this.tex.dispose();
    });
  }

  get count(): number {
    return this.n;
  }
}
