import { touchMode } from '../core/TouchMode';
import { Quality } from '../core/Quality';
import type { MapSource } from '../world/MapSource';
import { MenuIcons } from './MenuIcons';

/** Backing resolution of the mini map is this many canvas px per CSS px (capped: it is a small picture). */
const MINI_DPR = 2;
/** Width of the local view in world metres. */
const MINI_SPAN = 100;
/** The marker (arrow) size as a fraction of the map. */
const ARROW = 0.075;
/** Moving markers redraw at most this often (ms); a jump of more than JUMP metres redraws at once. */
const MIN_DT = 70;
const JUMP = 1.5;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/** Player arrow with a white rim and a soft halo, pointing along `heading` (body yaw, 0 = +Z). No allocation: only canvas state calls. */
function drawArrow(g: CanvasRenderingContext2D, x: number, y: number, size: number, heading: number): void {
  g.beginPath();
  g.arc(x, y, size * 1.5, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fill();
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI - heading); // north-up map: facing -Z points up
  g.beginPath();
  g.moveTo(0, -size * 1.25);
  g.lineTo(size * 0.95, size);
  g.lineTo(0, size * 0.45);
  g.lineTo(-size * 0.95, size);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2.5, size * 0.34);
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#e8453c';
  g.fill();
  g.restore();
}

/** The objective star (gold with a white rim): where the guidance points. */
function drawGoal(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  g.save();
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.45;
    if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size * 0.32);
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#ffb800';
  g.fill();
  g.restore();
}

/** Gold arrow head on the rim of the round map, pointing at an objective that is off the map. */
function drawEdgeArrow(g: CanvasRenderingContext2D, cx: number, cy: number, rim: number, ang: number, size: number): void {
  g.save();
  g.translate(cx + Math.cos(ang) * rim, cy + Math.sin(ang) * rim);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(size * 0.9, 0);
  g.lineTo(-size * 0.6, size * 0.8);
  g.lineTo(-size * 0.25, 0);
  g.lineTo(-size * 0.6, -size * 0.8);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size * 0.3);
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#ffb800';
  g.fill();
  g.restore();
}

/** Legend rows of the big map: [picture, words]. */
const LEGEND: readonly (readonly [string, string])[] = [
  ['\u{1F53A}', 'Kamu'],
  ['\u2B50', 'Tujuan'],
  ['\u{1F3EB}', 'Sekolah'],
  ['\u{1F6D2}', 'Pasar'],
  ['\u{1F3E5}', 'Rumah Sakit'],
  ['\u{1F3E6}', 'Bank'],
  ['\u{1F3E0}', 'Rumah Glen'],
  ['\u{1F6B2}', 'Sepeda'],
  ['\u{1F381}', 'Toko Mainan'],
];

/** Round north-up local map centred on Glen (cached city layer, throttled markers) and a separate illustrated full map. */
export class MapView {
  private readonly mini: HTMLButtonElement;
  private readonly miniBase: HTMLCanvasElement;
  private readonly miniMark: HTMLCanvasElement;
  private readonly miniCache = document.createElement('canvas');
  private readonly miniBaseG: CanvasRenderingContext2D | null;
  private readonly miniCacheG = this.miniCache.getContext('2d');
  private readonly miniMarkG: CanvasRenderingContext2D | null;
  private readonly full: HTMLDivElement;
  private readonly fullBase: HTMLCanvasElement;
  private readonly fullMark: HTMLCanvasElement;
  private fullBox!: HTMLDivElement;
  private lastDraw = -1e9;
  private drawX = 1e9;
  private drawZ = 1e9;
  private source: MapSource | null = null;
  private miniVersion = -1;
  private fullVersion = -1;
  private fullPx = 0;
  private miniPx = 0;
  private shown = false;
  private fullOpen = false;
  private mx = -1;
  private my = -1;
  private mh = 1e9;
  private lastX = 0;
  private lastZ = 0;
  private lastHeading = 0;
  private goal: { x: number; z: number } | null = null;
  private goalDirty = false;
  /** Called when the full map closes (the settings panel comes back). */
  onMiniOpen: (() => void) | null = null;
  onFullClose: (() => void) | null = null;
  /** Counters for tests. */
  staticDraws = 0;
  markerDraws = 0;

  constructor(root: HTMLElement) {
    this.mini = make('button', 'minimap');
    this.mini.type = 'button';
    this.mini.setAttribute('aria-label', 'Buka peta kota');
    this.mini.addEventListener('click', () => this.onMiniOpen?.());
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart']) this.mini.addEventListener(ev, (e) => e.stopPropagation());
    this.mini.hidden = true;
    this.miniBase = make('canvas', 'minimap-base');
    this.miniMark = make('canvas', 'minimap-mark');
    this.mini.append(this.miniBase, this.miniMark);
    root.appendChild(this.mini);
    this.miniBaseG = this.miniBase.getContext('2d');
    this.miniMarkG = this.miniMark.getContext('2d');

    this.full = make('div', 'fullmap');
    this.full.hidden = true;
    const frame = make('div', 'fullmap-frame');
    this.fullBase = make('canvas', 'fullmap-base');
    this.fullMark = make('canvas', 'fullmap-mark');
    const mapBox = make('div', 'fullmap-box');
    mapBox.append(this.fullBase, this.fullMark);
    const side = make('div', 'fullmap-side');
    const title = make('div', 'fullmap-title');
    title.textContent = 'Peta Kota Botanica';
    side.appendChild(title);
    for (const [pic, words] of LEGEND) {
      const row = make('div', 'fullmap-row');
      const i = make('span', 'fullmap-pic');
      i.textContent = pic;
      if (pic === '\u{1F53A}') i.classList.add('me');
      const w = make('span', 'fullmap-words');
      w.textContent = words;
      row.append(i, w);
      side.appendChild(row);
    }
    frame.append(mapBox, side);
    this.fullBox = mapBox;
    const close = make('button', 'menu-btn fullmap-close');
    close.setAttribute('aria-label', 'Tutup peta');
    close.innerHTML = MenuIcons.close;
    close.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closeFull();
    });
    this.full.append(frame, close);
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart']) this.full.addEventListener(ev, (e) => e.stopPropagation());
    root.appendChild(this.full);
    touchMode.onChange(() => this.sizeMini());
  }

  /** The level's map (null = this level has no map: the mini map is hidden). */
  setSource(src: MapSource | null): void {
    this.source = src;
    this.miniVersion = -1;
    this.fullVersion = -1;
    this.mx = -1;
    if (this.fullOpen) this.closeFull();
    this.sizeMini();
    this.syncVisible();
    if (src) this.drawMiniBase();
  }

  get hasMap(): boolean {
    return this.source !== null;
  }

  /** Show the mini map (only once play has started and a map exists). */
  setShown(on: boolean): void {
    this.shown = on;
    this.syncVisible();
  }

  private syncVisible(): void {
    this.mini.hidden = !(this.shown && this.source);
  }

  private sizeMini(): void {
    const css = touchMode.active ? 96 : 180;
    const px = css * MINI_DPR;
    if (px === this.miniPx) return;
    this.miniPx = px;
    this.miniBase.width = this.miniBase.height = this.miniMark.width = this.miniMark.height = px;
    this.miniVersion = -1;
    this.mx = -1;
    if (this.source) {
      this.drawMiniBase();
      this.drawMini(this.lastX, this.lastZ, this.lastHeading, true);
    }
  }

  private drawMiniBase(): void {
    const src = this.source;
    if (!src || !this.miniCacheG) return;
    // Render at the local view's world-to-pixel scale, so roads stay crisp when cropped.
    const px = Math.round(this.miniPx * (src.half * 2) / MINI_SPAN);
    this.miniCache.width = this.miniCache.height = px;
    src.draw(this.miniCacheG, px, false, this.miniPx);
    this.mx = -1;
    this.miniVersion = src.version;
    this.staticDraws++;
  }

  /**
   * Objective star on both maps (null = none). Per frame is fine: only a change of more than half a metre redraws.
   */
  setGoal(goal: { x: number; z: number } | null): void {
    const g = this.goal;
    if (goal === null) {
      if (g === null) return;
      this.goal = null;
    } else {
      if (g && Math.abs(g.x - goal.x) < 0.5 && Math.abs(g.z - goal.z) < 0.5) return;
      this.goal = { x: goal.x, z: goal.z };
    }
    this.goalDirty = true;
    if (this.fullOpen) this.drawFullMarks();
  }

  /** Per frame. Cheap: moving markers redraw at most ~14 Hz (a jump redraws at once); a pulsing goal star animates at the same rate. */
  update(x: number, z: number, heading: number): void {
    this.lastX = x;
    this.lastZ = z;
    this.lastHeading = heading;
    const src = this.source;
    if (!src || !this.shown) return;
    if (src.version !== this.miniVersion) this.drawMiniBase();
    const now = performance.now();
    const far = Math.abs(x - this.drawX) > JUMP || Math.abs(z - this.drawZ) > JUMP;
    if (!far && now - this.lastDraw < Math.max(MIN_DT, Quality.mapMs)) return;
    this.lastDraw = now;
    this.drawX = x;
    this.drawZ = z;
    this.drawMini(x, z, heading, false);
  }

  private drawMini(x: number, z: number, heading: number, force: boolean): void {
    const src = this.source;
    const g = this.miniMarkG;
    if (!src || !g) return;
    const bg = this.miniBaseG;
    if (!bg) return;
    const px = this.miniPx;
    const mid = px / 2;
    const k = this.miniCache.width / (src.half * 2);
    const x0 = Math.round((x + src.half) * k);
    const z0 = Math.round((z + src.half) * k);
    const moved = x0 !== this.mx || z0 !== this.my;
    const pulsing = this.goal !== null;
    if (!force && !moved && !pulsing && !this.goalDirty && Math.abs(heading - this.mh) < 0.05) return;
    if (moved || force) {
      bg.fillStyle = '#cfe6f2';
      bg.fillRect(0, 0, px, px);
      bg.drawImage(this.miniCache, mid - x0, mid - z0);
    }
    g.clearRect(0, 0, px, px);
    if (this.goal) {
      const gx = (this.goal.x + src.half) * k - x0;
      const gz = (this.goal.z + src.half) * k - z0;
      const rim = mid - px * 0.14;
      const d = Math.hypot(gx, gz);
      const pulse = 1 + 0.18 * Math.sin(performance.now() * 0.008);
      if (d > rim) {
        const ang = Math.atan2(gz, gx);
        drawGoal(g, mid + Math.cos(ang) * (rim - px * 0.11), mid + Math.sin(ang) * (rim - px * 0.11), px * 0.075 * pulse);
        drawEdgeArrow(g, mid, mid, rim + px * 0.02, ang, px * 0.09);
      } else {
        drawGoal(g, mid + gx, mid + gz, px * 0.085 * pulse);
      }
    }
    this.goalDirty = false;
    this.mx = x0;
    this.my = z0;
    this.mh = heading;
    drawArrow(g, mid, mid, px * ARROW, heading);
    this.markerDraws++;
  }

  // ---- Full map ------------------------------------------------------------------------------------------------------------------

  get isFullOpen(): boolean {
    return this.fullOpen;
  }

  openFull(): void {
    const src = this.source;
    if (!src) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // The map is a square; on a wide screen the legend sits beside it, on a narrow one the map shrinks to leave room.
    const cssPx = Math.floor(Math.min(vw - 24 - (vw >= 560 ? 190 : 0), vh - 48));
    const px = Math.round(cssPx * Math.min(2, window.devicePixelRatio || 1));
    this.full.hidden = false;
    this.fullOpen = true;
    for (const c of [this.fullBase, this.fullMark]) c.style.width = c.style.height = `${cssPx}px`;
    this.fullBox.style.width = this.fullBox.style.height = `${cssPx}px`;
    this.full.classList.toggle('narrow', vw < 560);
    if (px !== this.fullPx) {
      this.fullPx = px;
      this.fullBase.width = this.fullBase.height = this.fullMark.width = this.fullMark.height = px;
      this.fullVersion = -1;
    }
    const gb = this.fullBase.getContext('2d');
    if (gb && this.fullVersion !== src.version) {
      src.draw(gb, px, true);
      this.fullVersion = src.version;
    }
    this.drawFullMarks();
  }

  private drawFullMarks(): void {
    const src = this.source;
    const gm = this.fullMark.getContext('2d');
    if (!src || !gm) return;
    const px = this.fullPx;
    gm.clearRect(0, 0, px, px);
    const k = px / (src.half * 2);
    if (this.goal) drawGoal(gm, (this.goal.x + src.half) * k, (this.goal.z + src.half) * k, px * 0.045);
    drawArrow(gm, (this.lastX + src.half) * k, (this.lastZ + src.half) * k, px * 0.034, this.lastHeading);
  }

  closeFull(): void {
    if (!this.fullOpen) return;
    this.fullOpen = false;
    this.full.hidden = true;
    this.onFullClose?.();
  }

  /** Test hooks. */
  debugHandle(): Record<string, unknown> {
    const self = this;
    return {
      get visible() {
        return !self.mini.hidden;
      },
      get hasMap() {
        return self.source !== null;
      },
      get fullOpen() {
        return self.fullOpen;
      },
      get markerX() {
        return self.miniPx / 2;
      },
      get markerY() {
        return self.miniPx / 2;
      },
      get centerX() {
        return self.mx;
      },
      get centerZ() {
        return self.my;
      },
      get cacheSize() {
        return self.miniCache.width;
      },
      get span() {
        return MINI_SPAN;
      },
      get size() {
        return self.miniPx;
      },
      get staticDraws() {
        return self.staticDraws;
      },
      get markerDraws() {
        return self.markerDraws;
      },
      get secret() {
        return self.source?.shownSecret?.() ?? null;
      },
      get half() {
        return self.source ? self.source.half : 0;
      },
      /** The objective star (world x / z) shown on the maps, or null. */
      get goal() {
        return self.goal ? { ...self.goal } : null;
      },
    };
  }
}
