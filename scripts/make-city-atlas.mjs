// Generates the city texture atlas (public/textures/city-atlas.webp) and its rect table (src/world/kota/CityAtlas.ts).
// Procedural tiles (plaster, roofs, brick, asphalt, paving, grass, wood, awning stripes) + hand-drawn SVG decals (windows, doors,
// shop signs). Run: node scripts/make-city-atlas.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = 512; // atlas size (px)
const G = 4; // gutter (px): wrapped content (tiles) or clamped edge (decals), so bilinear + 2 mips never bleed
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (t) => t * t * (3 - 2 * t);

// ---- periodic value noise ---------------------------------------------------------------------------------------------------------
function hash(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Value noise over u, v in [0,1) with `cu` x `cv` lattice cells, periodic. */
function vn(u, v, cu, cv, seed) {
  const x = u * cu;
  const y = v * cv;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = sstep(x - x0);
  const fy = sstep(y - y0);
  const g = (i, j) => hash(((i % cu) + cu) % cu, ((j % cv) + cv) % cv, seed);
  return lerp(lerp(g(x0, y0), g(x0 + 1, y0), fx), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), fx), fy);
}
function fbm(u, v, cu, cv, oct, seed) {
  let a = 0.5;
  let s = 0;
  let n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vn(u, v, cu << o, cv << o, seed + o * 17);
    n += a;
    a *= 0.5;
  }
  return s / n;
}

// ---- tile painters: fn(u, v) -> [r, g, b] in 0..1 sRGB (u right, v UP in the final texture) ---------------------------------------
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((c) => c / 255);
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const grey = (g) => [g, g, g];

const painters = {
  plaster(u, v) {
    const m = fbm(u, v, 3, 3, 4, 1);
    const grain = vn(u, v, 48, 48, 5);
    // vertical rain streaks (stretched noise, only the strong ones) and a few hairline cracks
    const st = vn(u, v, 20, 2, 9);
    const streak = clamp01((st - 0.62) * 4) * (0.35 + 0.65 * vn(u, v, 4, 4, 11));
    const crack = Math.abs(vn(u, v, 6, 6, 21) - 0.5) < 0.006 ? 0.06 : 0;
    const g = 0.985 - 0.07 * m - 0.03 * grain - 0.06 * streak - crack;
    return [g, g * 0.995, g * 0.985];
  },
  roofTerra(u, v) {
    const rows = 6;
    const cols = 8;
    const r = Math.floor(v * rows);
    const fv = v * rows - r; // 0 bottom of the row .. 1 top
    const off = r % 2 ? 0.5 : 0;
    const cu = (u * cols + off) % 1;
    const c = Math.floor(u * cols + off);
    const rnd = hash(((c % cols) + cols) % cols, r, 3);
    const curve = Math.sin(cu * Math.PI); // round clay tile: bright crown, dark sides
    let g = 0.8 + 0.18 * curve - 0.07 * rnd;
    g *= 0.78 + 0.22 * sstep(clamp01(fv * 1.6)); // the lower lip of each row is in shadow of the next row
    if (fv > 0.94) g *= 0.74; // overlap line
    g *= 0.96 + 0.04 * vn(u, v, 32, 32, 8);
    return grey(clamp01(g));
  },
  roofZinc(u, v) {
    const ribs = 10;
    const cu = (u * ribs) % 1;
    const prof = Math.sin(cu * Math.PI * 2);
    let g = 0.88 + 0.1 * prof;
    const seam = Math.abs(((v * 2) % 1) - 0.5) > 0.485 ? 0.9 : 1;
    g *= seam * (0.97 + 0.03 * vn(u, v, 4, 16, 4));
    g -= 0.05 * clamp01(vn(u, v, 3, 3, 6) - 0.55) * 3;
    return grey(clamp01(g));
  },
  brick(u, v) {
    const rows = 8;
    const cols = 4;
    const r = Math.floor(v * rows);
    const off = r % 2 ? 0.5 : 0;
    const x = (u * cols + off) % 1;
    const y = (v * rows) % 1;
    const c = Math.floor(u * cols + off);
    const rnd = hash(((c % cols) + cols) % cols, r, 7);
    const mortar = x < 0.07 || x > 0.93 || y < 0.12 || y > 0.88;
    if (mortar) return mix3(hex(0xe6d8c2), hex(0xc9b9a0), vn(u, v, 24, 24, 2));
    const base = mix3(hex(0xc2694b), hex(0x9c4a3a), rnd);
    const n = 0.93 + 0.07 * vn(u, v, 24, 24, 3);
    return base.map((c2) => c2 * n);
  },
  /** One road across (u 0..1 = edge to edge), tiling along v. */
  asphalt(u, v) {
    const base = hex(0x6f7683);
    let k = 0.94 + 0.06 * fbm(u, v, 3, 6, 3, 4) + 0.03 * (vn(u, v, 40, 80, 6) - 0.5);
    // tyre-polished lanes
    for (const c of [0.27, 0.73]) {
      const d = Math.abs(u - c);
      k *= 1 - 0.1 * sstep(clamp01(1 - d / 0.07)) * (0.6 + 0.4 * vn(u, v, 2, 12, 13));
    }
    // sparse cracks and patches
    const patch = 1;
    let c = base.map((x) => x * k * patch);
    // faded white edge lines
    const edge = Math.min(u, 1 - u);
    const wear = 0.45 + 0.55 * vn(u, v, 3, 16, 51);
    if (edge > 0.045 && edge < 0.065) c = mix3(c, [0.93, 0.92, 0.86], 0.72 * wear);
    if (edge < 0.012) c = c.map((x) => x * 0.8); // gutter / curb shadow
    return c;
  },
  paving(u, v) {
    const n = 2;
    const x = (u * n) % 1;
    const y = (v * n) % 1;
    const sx = Math.floor(u * n);
    const sy = Math.floor(v * n);
    const rnd = hash(sx, sy, 5);
    const grout = Math.min(x, 1 - x, y, 1 - y) < 0.022;
    let g = 0.985 - 0.035 * rnd - 0.025 * fbm(u, v, 6, 6, 3, 8) - 0.02 * vn(u, v, 40, 40, 4);
    if (grout) g *= 0.84;
    else if (Math.min(x, y) < 0.05) g *= 1.0; // lit edge
    return grey(clamp01(g));
  },
  grass(u, v) {
    const m = fbm(u, v, 3, 3, 3, 12);
    const tuft = vn(u, v, 24, 24, 14);
    let g = 1.02 - 0.09 * m - 0.07 * clamp01((tuft - 0.55) * 3);
    const light = clamp01((vn(u, v, 12, 12, 16) - 0.66) * 4);
    g += 0.04 * light;
    return [clamp01(g * 0.99), clamp01(g), clamp01(g * 0.96)];
  },
  wood(u, v) {
    const planks = 6;
    const x = (u * planks) % 1;
    const p = Math.floor(u * planks);
    const rnd = hash(p, 0, 9);
    const grain = vn(u + rnd, v, 12, 3, 10) * 0.5 + vn(u, v, 40, 6, 11) * 0.5;
    let g = 0.92 + 0.08 * (1 - rnd) - 0.1 * grain;
    if (x < 0.06 || x > 0.94) g *= 0.7;
    return grey(clamp01(g));
  },
  stripe(color) {
    const c = hex(color);
    return (u, v) => {
      const k = 0.97 + 0.03 * vn(u, v, 8, 8, 2);
      return (u < 0.5 ? c : [0.99, 0.95, 0.86]).map((x) => x * k);
    };
  },
};

// ---- SVG decals ---------------------------------------------------------------------------------------------------------------------
const SIGN = (inner, bg = '#fff3d6', rim = '#8a5a3c') => (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 120 56">
<rect width="120" height="56" fill="${rim}"/><rect x="3" y="3" width="114" height="50" rx="6" fill="${bg}"/>
<rect x="3" y="3" width="114" height="50" rx="6" fill="none" stroke="#00000022" stroke-width="2"/>${inner}</svg>`;

const windowSvg = (variant) => (w, h) => {
  const frame = '#fffaf0';
  const glass = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd0f7"/><stop offset="1" stop-color="#d4f0ff"/></linearGradient></defs>`;
  if (variant === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 80 96">${glass}
<rect width="80" height="96" fill="#d9c9ac"/>
<rect x="3" y="3" width="74" height="78" rx="4" fill="#ffffff55"/>
<rect x="6" y="6" width="68" height="74" rx="3" fill="${frame}"/>
<rect x="12" y="12" width="56" height="62" rx="2" fill="url(#g)"/>
<polygon points="14,14 34,14 14,46" fill="#ffffff80"/><polygon points="40,14 50,14 14,70 14,60" fill="#ffffff40"/>
<rect x="38" y="12" width="4" height="62" fill="${frame}"/><rect x="12" y="40" width="56" height="4" fill="${frame}"/>
<rect x="12" y="12" width="56" height="62" rx="2" fill="none" stroke="#7a8a96" stroke-width="1.5"/>
<rect x="2" y="80" width="76" height="9" rx="2" fill="#f4ecdc"/><rect x="2" y="86" width="76" height="3" fill="#cdbfa6"/>
<rect x="6" y="89" width="68" height="7" fill="#00000030"/></svg>`;
  }
  if (variant === 1) {
    // Shutters (wide).
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 112 96">${glass}
<rect width="112" height="96" fill="#d9c9ac"/>
<rect x="2" y="4" width="26" height="78" rx="3" fill="#2f9a73"/><rect x="84" y="4" width="26" height="78" rx="3" fill="#2f9a73"/>
${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="5" y="${9 + i * 8}" width="20" height="3.5" fill="#1f7a59"/><rect x="87" y="${9 + i * 8}" width="20" height="3.5" fill="#1f7a59"/>`).join('')}
<rect x="30" y="8" width="52" height="74" rx="3" fill="${frame}"/>
<rect x="35" y="13" width="42" height="64" rx="2" fill="url(#g)"/>
<polygon points="37,15 55,15 37,44" fill="#ffffff80"/>
<rect x="54" y="13" width="4" height="64" fill="${frame}"/>
<rect x="35" y="13" width="42" height="64" rx="2" fill="none" stroke="#7a8a96" stroke-width="1.5"/>
<rect x="24" y="82" width="64" height="8" rx="2" fill="#f4ecdc"/><rect x="24" y="87" width="64" height="3" fill="#cdbfa6"/>
<rect x="28" y="90" width="56" height="6" fill="#00000030"/></svg>`;
  }
  if (variant === 3) {
    // Abandoned: dark glass, a crack, two boards.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 80 96">
<rect width="80" height="96" fill="#bfae92"/><rect x="6" y="6" width="68" height="74" rx="3" fill="#cdbfa6"/>
<rect x="12" y="12" width="56" height="62" rx="2" fill="#3b312b"/><polygon points="14,14 30,14 14,38" fill="#ffffff22"/>
<path d="M40 12 L36 30 L46 44 L40 60 L44 74" stroke="#7d6f62" stroke-width="1.5" fill="none"/>
<rect x="4" y="30" width="72" height="9" fill="#7a5a3a" transform="rotate(-8 40 34)"/><rect x="4" y="52" width="72" height="9" fill="#6b4a32" transform="rotate(6 40 56)"/>
<rect x="2" y="80" width="76" height="9" rx="2" fill="#b8a98d"/><rect x="6" y="89" width="68" height="7" fill="#00000030"/></svg>`;
  }
  // Curtains and a flower pot.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 80 96">${glass}
<rect width="80" height="96" fill="#d9c9ac"/>
<rect x="6" y="6" width="68" height="74" rx="3" fill="#f6efe0"/>
<rect x="12" y="12" width="56" height="62" rx="2" fill="url(#g)"/>
<path d="M12 12 H34 Q28 40 22 74 H12Z" fill="#ffc94d"/><path d="M68 12 H46 Q52 40 58 74 H68Z" fill="#ffc94d"/>
<path d="M12 12 H34 Q28 40 22 74" fill="none" stroke="#e5a21f" stroke-width="2"/><path d="M68 12 H46 Q52 40 58 74" fill="none" stroke="#e5a21f" stroke-width="2"/>
<rect x="12" y="12" width="56" height="62" rx="2" fill="none" stroke="#7a8a96" stroke-width="1.5"/>
<rect x="2" y="80" width="76" height="9" rx="2" fill="#f4ecdc"/><rect x="6" y="89" width="68" height="7" fill="#00000030"/>
<path d="M30 80 h20 l-3 -10 h-14z" fill="#d9632f"/><circle cx="34" cy="64" r="6" fill="#4f9f3a"/><circle cx="46" cy="63" r="7" fill="#5fb347"/><circle cx="40" cy="58" r="4" fill="#ff7aa8"/><circle cx="48" cy="57" r="3" fill="#ffd23f"/></svg>`;
};

const doorSvg = (variant) => (w, h) =>
  variant === 0
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 56 104">
<rect width="56" height="104" fill="#fffaf0"/><rect x="5" y="5" width="46" height="99" fill="#8a5a3c"/>
<rect x="9" y="9" width="38" height="46" rx="3" fill="#a56d45"/><rect x="9" y="60" width="38" height="40" rx="3" fill="#a56d45"/>
<rect x="14" y="14" width="28" height="30" rx="2" fill="#9fdcff"/><polygon points="16,16 26,16 16,32" fill="#ffffff80"/>
<rect x="9" y="9" width="38" height="46" rx="3" fill="none" stroke="#6b4328" stroke-width="2"/><rect x="9" y="60" width="38" height="40" rx="3" fill="none" stroke="#6b4328" stroke-width="2"/>
<circle cx="42" cy="58" r="3.2" fill="#e8b83a"/><rect x="0" y="100" width="56" height="4" fill="#cfc6b4"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 56 104">
<rect width="56" height="104" fill="#e9f1f5"/><rect x="4" y="4" width="48" height="100" fill="#555f6b"/>
<rect x="8" y="8" width="40" height="86" fill="#aee4ff"/><polygon points="10,10 30,10 10,50" fill="#ffffff90"/><polygon points="34,10 42,10 10,90 10,76" fill="#ffffff50"/>
<rect x="8" y="46" width="40" height="3" fill="#555f6b"/><rect x="36" y="56" width="3" height="18" rx="1.5" fill="#d8e0e8"/>
<rect x="0" y="100" width="56" height="4" fill="#bfc8d0"/></svg>`;

const ICONS = {
  apple: `<circle cx="52" cy="30" r="14" fill="#e8402f"/><circle cx="68" cy="30" r="14" fill="#e8402f"/><circle cx="60" cy="34" r="14" fill="#f0553f"/><path d="M60 18 q2 -8 8 -9" stroke="#6b4328" stroke-width="3" fill="none"/><ellipse cx="68" cy="12" rx="6" ry="3.5" fill="#4f9f3a" transform="rotate(-20 68 12)"/><ellipse cx="52" cy="26" rx="3" ry="5" fill="#ffffff66"/>`,
  bread: `<ellipse cx="60" cy="31" rx="30" ry="15" fill="#d9903f"/><ellipse cx="60" cy="27" rx="28" ry="12" fill="#eeae58"/><path d="M42 24 l6 8 M54 21 l6 9 M66 21 l6 9 M78 24 l5 7" stroke="#b86f26" stroke-width="3" stroke-linecap="round"/>`,
  coin: `<circle cx="60" cy="28" r="19" fill="#e8a91d"/><circle cx="60" cy="28" r="15" fill="#ffd23f"/><path d="M60 17 l3.5 7.5 8 1 -6 5.5 1.6 8 -7.1 -4 -7.1 4 1.6 -8 -6 -5.5 8 -1z" fill="#e8a91d"/>`,
  heart: `<rect x="53" y="12" width="14" height="32" rx="3" fill="#ff5c8a"/><rect x="44" y="21" width="32" height="14" rx="3" fill="#ff5c8a"/><rect x="55" y="14" width="3" height="28" fill="#ffffff55"/>`,
  book: `<path d="M60 18 q-14 -6 -28 -2 v28 q14 -4 28 2z" fill="#4dabf7"/><path d="M60 18 q14 -6 28 -2 v28 q-14 -4 -28 2z" fill="#74c0fc"/><path d="M60 18 v28" stroke="#1c6fb8" stroke-width="2"/><path d="M38 24 q8 -2 16 1 M38 31 q8 -2 16 1 M66 25 q8 -3 16 -1 M66 32 q8 -3 16 -1" stroke="#fff" stroke-width="2" fill="none"/>`,
  bag: `<path d="M44 22 h32 l4 24 h-40z" fill="#ff7a45"/><path d="M52 22 q0 -12 8 -12 t8 12" fill="none" stroke="#c9501c" stroke-width="3.5"/><circle cx="52" cy="30" r="2" fill="#fff"/><circle cx="68" cy="30" r="2" fill="#fff"/>`,
  cup: `<path d="M46 18 h28 l-3 24 q-1 4 -5 4 h-12 q-4 0 -5 -4z" fill="#fff"/><path d="M46 18 h28 l-1 8 h-26z" fill="#8a5a3c"/><path d="M74 22 q10 0 8 8 t-10 6" fill="none" stroke="#fff" stroke-width="4"/><path d="M54 12 q-3 -4 0 -8 M62 12 q-3 -4 0 -8" stroke="#b9b2a4" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  bowl: `<path d="M38 26 h44 q0 20 -22 20 t-22 -20z" fill="#e8402f"/><path d="M38 26 h44" stroke="#fff3d6" stroke-width="3"/><circle cx="52" cy="22" r="6" fill="#f3d38a"/><circle cx="64" cy="21" r="6" fill="#f3d38a"/><circle cx="72" cy="23" r="5" fill="#d9903f"/><path d="M80 8 l-14 22" stroke="#8a5a3c" stroke-width="2.5"/>`,
};

// ---- packing -------------------------------------------------------------------------------------------------------------------------
const tiles = []; // {name, w, h, wrap, mode, meters, aspect, pixels (RGB bytes w*h*3)}
const WRAP = 96;

function bake(fn, w, h) {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn((x + 0.5) / w, 1 - (y + 0.5) / h); // v up
      const o = (y * w + x) * 3;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(clamp01(c[k]) * 255);
    }
  }
  return px;
}
async function svg(markup, w, h) {
  return sharp(Buffer.from(markup)).resize(w, h).removeAlpha().raw().toBuffer();
}
function add(name, w, h, px, o) {
  tiles.push({ name, w, h, px, wrap: false, mode: 0, meters: 1, aspect: w / h, ...o });
}

add('white', 8, 8, Buffer.alloc(8 * 8 * 3, 255), { wrap: false, mode: 1, meters: 1 });
// mode 1: world projection (wrap, fades to its average with distance); mode 2: strip (u across the quad, v along, `meters` per repeat); mode 0: decal.
add('plaster', WRAP, WRAP, bake(painters.plaster, WRAP, WRAP), { wrap: true, mode: 1, meters: 3.2 });
add('roofTerra', WRAP, WRAP, bake(painters.roofTerra, WRAP, WRAP), { wrap: true, mode: 1, meters: 2.4 });
add('roofZinc', WRAP, WRAP, bake(painters.roofZinc, WRAP, WRAP), { wrap: true, mode: 1, meters: 2.0 });
add('brick', WRAP, WRAP, bake(painters.brick, WRAP, WRAP), { wrap: true, mode: 1, meters: 1.6 });
add('asphalt', WRAP, WRAP, bake(painters.asphalt, WRAP, WRAP), { wrap: true, mode: 2, meters: 8 });
add('paving', WRAP, WRAP, bake(painters.paving, WRAP, WRAP), { wrap: true, mode: 1, meters: 2.4 });
add('grass', WRAP, WRAP, bake(painters.grass, WRAP, WRAP), { wrap: true, mode: 1, meters: 9 });
add('wood', WRAP, WRAP, bake(painters.wood, WRAP, WRAP), { wrap: true, mode: 1, meters: 1.2 });
const STRIPES = [['stripeRed', 0xe8402f], ['stripeBlue', 0x2f8fe0], ['stripeGreen', 0x2fb06a], ['stripeOrange', 0xff8a2a], ['stripePink', 0xf0608f], ['stripeYellow', 0xf2b632]];
for (const [n, c] of STRIPES) add(n, 32, 32, bake(painters.stripe(c), 32, 32), { wrap: true, mode: 1, meters: 0.6 });
for (const [i, a] of [[0, 80], [1, 112], [2, 80], [3, 80]]) add(`window${i}`, a, 96, await svg(windowSvg(i)(a, 96), a, 96), {});
for (const i of [0, 1]) add(`door${i}`, 56, 104, await svg(doorSvg(i)(56, 104), 56, 104), {});
const SIGNS = [['signApple', 'apple'], ['signBread', 'bread'], ['signCoin', 'coin', '#e9f7f5', '#1e9e92'], ['signHeart', 'heart', '#ffffff', '#ff5c8a'], ['signBook', 'book', '#eaf4ff', '#2f7fd1'], ['signBag', 'bag'], ['signCup', 'cup', '#ffe8cc'], ['signBowl', 'bowl', '#fff3d6', '#c9501c']];
for (const [n, ic, bg, rim] of SIGNS) add(n, 120, 56, await svg(SIGN(ICONS[ic], bg, rim)(120, 56), 120, 56), {});

// Shelf packing (tallest first).
const order = tiles.map((t, i) => i).sort((a, b) => tiles[b].h - tiles[a].h || tiles[b].w - tiles[a].w);
let cx = 0;
let cy = 0;
let rowH = 0;
const atlas = Buffer.alloc(S * S * 3, 255);
const place = new Array(tiles.length);
for (const i of order) {
  const t = tiles[i];
  const W = t.w + 2 * G;
  const H = t.h + 2 * G;
  if (cx + W > S) {
    cx = 0;
    cy += rowH;
    rowH = 0;
  }
  if (cy + H > S) throw new Error('atlas full at ' + t.name);
  place[i] = [cx + G, cy + G];
  for (let y = -G; y < t.h + G; y++) {
    for (let x = -G; x < t.w + G; x++) {
      const sx = t.wrap ? (((x % t.w) + t.w) % t.w) : Math.max(0, Math.min(t.w - 1, x));
      const sy = t.wrap ? (((y % t.h) + t.h) % t.h) : Math.max(0, Math.min(t.h - 1, y));
      const so = (sy * t.w + sx) * 3;
      const d = ((cy + G + y) * S + (cx + G + x)) * 3;
      atlas[d] = t.px[so];
      atlas[d + 1] = t.px[so + 1];
      atlas[d + 2] = t.px[so + 2];
    }
  }
  cx += W;
  rowH = Math.max(rowH, H);
}
const used = cy + rowH;

const out = path.join(ROOT, 'public/textures/city-atlas.webp');
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(atlas, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 84, effort: 6 }).toFile(out);
if (process.env.PNG) await sharp(atlas, { raw: { width: S, height: S, channels: 3 } }).png().toFile(process.env.PNG);

const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lines = tiles.map((t, i) => {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let k = 0; k < t.w * t.h; k++) {
    r += srgb2lin(t.px[k * 3] / 255);
    g += srgb2lin(t.px[k * 3 + 1] / 255);
    b += srgb2lin(t.px[k * 3 + 2] / 255);
  }
  const n = t.w * t.h;
  const f = (x) => +x.toFixed(4);
  const [px, py] = place[i];
  return `  { name: '${t.name}', rect: [${f(px / S)}, ${f(1 - (py + t.h) / S)}, ${f(t.w / S)}, ${f(t.h / S)}], mode: ${t.mode}, wrap: ${t.wrap ? 1 : 0}, meters: ${t.meters}, aspect: ${f(t.aspect)}, avg: [${f(r / n)}, ${f(g / n)}, ${f(b / n)}] },`;
});
const names = tiles.map((t, i) => `  ${t.name}: ${i},`);
fs.writeFileSync(
  path.join(ROOT, 'src/world/kota/CityAtlas.ts'),
  `// GENERATED by scripts/make-city-atlas.mjs: do not edit by hand.
/** Atlas of the city (public/textures/city-atlas.webp): rect = [u0, v0, w, h] of the content (v up), mode 0 decal / 1 world projection / 2 strip. */
export const ATLAS_PX = ${S};
export interface AtlasTile {
  name: string;
  rect: [number, number, number, number];
  mode: 0 | 1 | 2;
  wrap: 0 | 1;
  meters: number;
  aspect: number;
  /** Mean colour (linear): wrap tiles fade to it in the distance. */
  avg: [number, number, number];
}
export const ATLAS_TILES: AtlasTile[] = [
${lines.join('\n')}
] as AtlasTile[];
export const T = {
${names.join('\n')}
} as const;
`,
);
console.log(`atlas ${S}x${S}, rows used ${used}px, ${tiles.length} tiles, ${fs.statSync(out).size} bytes`);
