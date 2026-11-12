import * as THREE from 'three';

/** Canvas painters for the hall's flat pictures: floor-station icons, the idle screen and the city-market picture. */

export const CELL = 384;
export const ICON = { fly: 0, laser: 1, shield: 2, lunch: 3, lab: 4 } as const;
const COLORS = ['#ff9f1c', '#e8453c', '#1fa8b8', '#ff8fb1', '#4dabf7'];

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  return g;
}

function paintIcon(g: CanvasRenderingContext2D, kind: number): void {
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  switch (kind) {
    case ICON.fly: {
      // Jet rocket: white body, blue window, red fins, orange flame.
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(-26, 70);
      g.lineTo(0, 140);
      g.lineTo(26, 70);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff6a00';
      g.beginPath();
      g.moveTo(-14, 70);
      g.lineTo(0, 108);
      g.lineTo(14, 70);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8453c';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 34, 10);
        g.lineTo(s * 84, 82);
        g.lineTo(s * 30, 70);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(0, -10, 46, 98, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4dabf7';
      g.beginPath();
      g.arc(0, -28, 20, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case ICON.laser: {
      g.beginPath();
      g.moveTo(26, -120);
      g.lineTo(-62, 20);
      g.lineTo(-6, 20);
      g.lineTo(-24, 120);
      g.lineTo(64, -22);
      g.lineTo(8, -22);
      g.closePath();
      g.lineWidth = 12;
      g.fill();
      g.stroke();
      break;
    }
    case ICON.shield: {
      g.beginPath();
      g.moveTo(0, -120);
      g.lineTo(92, -86);
      g.lineTo(92, 0);
      g.bezierCurveTo(92, 70, 52, 108, 0, 128);
      g.bezierCurveTo(-52, 108, -92, 70, -92, 0);
      g.lineTo(-92, -86);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(0, -76);
      g.lineTo(52, -56);
      g.lineTo(52, 0);
      g.bezierCurveTo(52, 40, 30, 62, 0, 76);
      g.closePath();
      g.fill();
      break;
    }
    case ICON.lunch: {
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect(-104, -52, 208, 60, 16);
      g.fill();
      g.fillStyle = '#ffe6ee';
      g.beginPath();
      g.roundRect(-92, 4, 184, 92, 18);
      g.fill();
      g.fillStyle = '#e8453c';
      g.fillRect(-14, -52, 28, 148);
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(0, -52, 20, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 14;
      g.beginPath();
      g.arc(0, -52, 52, Math.PI, 0);
      g.stroke();
      break;
    }
    default: {
      // Lab flask.
      g.beginPath();
      g.roundRect(-24, -124, 48, 14, 6);
      g.fill();
      g.fillRect(-18, -112, 36, 70);
      g.beginPath();
      g.moveTo(-18, -44);
      g.lineTo(-92, 88);
      g.quadraticCurveTo(-100, 118, -66, 118);
      g.lineTo(66, 118);
      g.quadraticCurveTo(100, 118, 92, 88);
      g.lineTo(18, -44);
      g.closePath();
      g.fill();
      g.fillStyle = '#2ec4b6';
      g.beginPath();
      g.moveTo(-50, 36);
      g.lineTo(50, 36);
      g.lineTo(84, 92);
      g.quadraticCurveTo(90, 106, 66, 106);
      g.lineTo(-66, 106);
      g.quadraticCurveTo(-90, 106, -84, 92);
      g.closePath();
      g.fill();
      g.fillStyle = '#fff';
      for (const [x, y, r] of [[-20, 70, 10], [14, 54, 7], [30, 84, 9]]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

/** 4 x 2 cells of icon discs (gold ring, coloured disc, white pictogram) on a transparent background. */
export function makeIconAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL * 4;
  c.height = CELL * 2;
  const g = ctx2d(c);
  for (let i = 0; i < COLORS.length; i++) {
    g.save();
    g.translate((i % 4) * CELL + CELL / 2, Math.floor(i / 4) * CELL + CELL / 2);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, CELL / 2 - 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2b632';
    g.beginPath();
    g.arc(0, 0, CELL / 2 - 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = COLORS[i];
    g.beginPath();
    g.arc(0, 0, CELL / 2 - 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(0, 0, CELL / 2 - 70, 0, Math.PI * 2);
    g.fill();
    paintIcon(g, i);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** UV rectangle of an icon cell: [u0, v0, u1, v1]. */
export function cellUV(i: number): [number, number, number, number] {
  const col = i % 4;
  const row = Math.floor(i / 4);
  return [col / 4, 1 - (row + 1) / 2, (col + 1) / 4, 1 - row / 2];
}

/** The wall screen while nothing is happening: deep blue, soft teal bars and a gold star. */
export function makeIdleScreen(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = ctx2d(c);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1b3d73');
  grad.addColorStop(1, '#0d2147');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 16; i++) {
    const h = 30 + ((i * 53) % 90);
    g.fillStyle = i % 2 ? 'rgba(46,196,182,0.35)' : 'rgba(255,201,77,0.3)';
    g.fillRect(24 + i * 30, 236 - h, 18, h);
  }
  g.fillStyle = '#ffd23f';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 62 : 26;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(256 + Math.cos(a) * r, 112 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A simple stylised picture of the city market: stalls with striped awnings, produce, bunting, a sunny sky. */
export function makeMarketPicture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = ctx2d(c);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#7fd0ff');
  sky.addColorStop(1, '#d9f2ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffe66d';
  g.beginPath();
  g.arc(900, 80, 46, 0, Math.PI * 2);
  g.fill();
  // Far buildings.
  const roofs = ['#d9432f', '#f2b632', '#4dabf7', '#ff8fb1', '#5fbf5a', '#cdb4db'];
  for (let i = 0; i < 9; i++) {
    const x = i * 120 - 20;
    const h = 120 + ((i * 47) % 70);
    g.fillStyle = '#f6e3c5';
    g.fillRect(x, H * 0.55 - h, 104, h);
    g.fillStyle = roofs[i % roofs.length];
    g.beginPath();
    g.moveTo(x - 6, H * 0.55 - h);
    g.lineTo(x + 52, H * 0.55 - h - 44);
    g.lineTo(x + 110, H * 0.55 - h);
    g.closePath();
    g.fill();
    g.fillStyle = '#8fc7ee';
    for (let k = 0; k < 2; k++) g.fillRect(x + 18 + k * 44, H * 0.55 - h + 24, 28, 30);
  }
  // Ground.
  g.fillStyle = '#e9c98e';
  g.fillRect(0, H * 0.55, W, H * 0.45);
  g.fillStyle = '#d7b377';
  for (let i = 0; i < 12; i++) g.fillRect(i * 90 + 10, H * 0.9, 50, 8);
  // Bunting.
  g.strokeStyle = '#8a5a3c';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 40);
  g.quadraticCurveTo(W / 2, 120, W, 40);
  g.stroke();
  const flags = ['#e8453c', '#ffd23f', '#2ec4b6', '#ff8fb1'];
  for (let i = 0; i < 18; i++) {
    const t = (i + 0.5) / 18;
    const x = t * W;
    const y = 40 + 80 * (1 - Math.pow(2 * t - 1, 2)) + 0;
    g.fillStyle = flags[i % 4];
    g.beginPath();
    g.moveTo(x - 14, y);
    g.lineTo(x + 14, y);
    g.lineTo(x, y + 30);
    g.closePath();
    g.fill();
  }
  // Stalls.
  const stallColors = [['#e8453c', '#fff'], ['#2ec4b6', '#fff'], ['#ffd23f', '#fff'], ['#4dabf7', '#fff'], ['#ff8fb1', '#fff']];
  const produce = ['#e8453c', '#ff9f43', '#5fbf5a', '#ffe66d', '#cdb4db'];
  for (let i = 0; i < 5; i++) {
    const w = 168;
    const x = 36 + i * 196;
    const top = 230;
    g.fillStyle = '#b07a4a';
    g.fillRect(x + 8, top + 40, 6, 150);
    g.fillRect(x + w - 14, top + 40, 6, 150);
    // Awning stripes.
    for (let s = 0; s < 6; s++) {
      g.fillStyle = s % 2 ? stallColors[i][1] : stallColors[i][0];
      g.beginPath();
      g.moveTo(x + (s * w) / 6, top);
      g.lineTo(x + ((s + 1) * w) / 6, top);
      g.lineTo(x + ((s + 1) * w) / 6 + 6, top + 44);
      g.lineTo(x + (s * w) / 6 - 6, top + 44);
      g.closePath();
      g.fill();
    }
    // Counter and produce.
    g.fillStyle = '#8a5a3c';
    g.fillRect(x, top + 120, w, 70);
    g.fillStyle = '#a9733f';
    g.fillRect(x, top + 120, w, 12);
    g.fillStyle = produce[i];
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(x + 24 + k * 30, top + 112 - (k % 2) * 10, 17, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Sign.
  g.fillStyle = '#d9432f';
  g.fillRect(W / 2 - 110, 150, 220, 52);
  g.fillStyle = '#ffd23f';
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('PASAR', W / 2, 177);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
