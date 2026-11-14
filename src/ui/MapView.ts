import { touchMode } from '../core/TouchMode';
import type { MapSource } from '../world/MapSource';
import { MenuIcons } from './MenuIcons';

/** Backing resolution of the mini map is this many canvas px per CSS px (capped: it is a small picture). */
const MINI_DPR = 2;
/** The marker (arrow) size as a fraction of the map. */
const ARROW = 0.045;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/** Player arrow with a white rim, pointing along `heading` (body yaw, 0 = +Z). No allocation: only canvas state calls. */
function drawArrow(g: CanvasRenderingContext2D, x: number, y: number, size: number, heading: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI - heading); // north-up map: facing -Z points up
  g.beginPath();
  g.moveTo(0, -size * 1.25);
  g.lineTo(size * 0.85, size);
  g.lineTo(0, size * 0.45);
  g.lineTo(-size * 0.85, size);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size * 0.3);
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#e8453c';
  g.fill();
  g.restore();
}

/**
 * Mini map (a small corner picture during play) and the full map (an overlay from the settings panel). North is up and the
 * arrow turns with the player: a steady picture is easier for a child than a rotating one. The static layer is drawn once per
 * canvas (and again only when the source bumps its version); each frame only the arrow is redrawn, and only when its pixel
 * position or heading changed.
 */
export class MapView {
  private readonly mini: HTMLDivElement;
  private readonly miniBase: HTMLCanvasElement;
  private readonly miniMark: HTMLCanvasElement;
  private readonly miniBaseG: CanvasRenderingContext2D | null;
  private readonly miniMarkG: CanvasRenderingContext2D | null;
  private readonly full: HTMLDivElement;
  private readonly fullBase: HTMLCanvasElement;
  private readonly fullMark: HTMLCanvasElement;
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
  /** Called when the full map closes (the settings panel comes back). */
  onFullClose: (() => void) | null = null;
  /** Counters for tests. */
  staticDraws = 0;
  markerDraws = 0;

  constructor(root: HTMLElement) {
    this.mini = make('div', 'minimap');
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
    frame.append(this.fullBase, this.fullMark);
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
    const css = touchMode.active ? 120 : 180;
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
    if (!src || !this.miniBaseG) return;
    src.draw(this.miniBaseG, this.miniPx, false);
    this.miniVersion = src.version;
    this.staticDraws++;
  }

  /** Per frame. Cheap: an integer compare unless the arrow moved by a pixel or turned by ~3 degrees. */
  update(x: number, z: number, heading: number): void {
    this.lastX = x;
    this.lastZ = z;
    this.lastHeading = heading;
    const src = this.source;
    if (!src || !this.shown) return;
    if (src.version !== this.miniVersion) this.drawMiniBase();
    this.drawMini(x, z, heading, false);
  }

  private drawMini(x: number, z: number, heading: number, force: boolean): void {
    const src = this.source;
    const g = this.miniMarkG;
    if (!src || !g) return;
    const k = this.miniPx / (src.half * 2);
    const px = Math.round((x + src.half) * k);
    const py = Math.round((z + src.half) * k);
    if (!force && px === this.mx && py === this.my && Math.abs(heading - this.mh) < 0.05) return;
    const r = this.miniPx * ARROW * 1.6;
    if (this.mx >= 0) g.clearRect(this.mx - r, this.my - r, r * 2, r * 2);
    this.mx = px;
    this.my = py;
    this.mh = heading;
    drawArrow(g, px, py, this.miniPx * ARROW, heading);
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
    const cssPx = Math.floor(Math.min(vw - 24, vh - 24));
    const px = Math.round(cssPx * Math.min(2, window.devicePixelRatio || 1));
    this.full.hidden = false;
    this.fullOpen = true;
    for (const c of [this.fullBase, this.fullMark]) c.style.width = c.style.height = `${cssPx}px`;
    (this.fullBase.parentElement as HTMLElement).style.width = (this.fullBase.parentElement as HTMLElement).style.height = `${cssPx}px`;
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
    const gm = this.fullMark.getContext('2d');
    if (gm) {
      gm.clearRect(0, 0, px, px);
      const k = px / (src.half * 2);
      drawArrow(gm, (this.lastX + src.half) * k, (this.lastZ + src.half) * k, px * 0.022, this.lastHeading);
    }
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
        return self.mx;
      },
      get markerY() {
        return self.my;
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
    };
  }
}
