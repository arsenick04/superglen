import type { MapSource } from '../MapSource';
import { CITY, CITY_LAYOUT, DISTRICTS, type DistrictId } from './CityData';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Landmark kinds that get an icon (the old Barongsai building is separate: only after it was found). */
type Glyph = 'tower' | 'school' | 'bank' | 'hospital' | 'gudang' | 'home' | 'secret';
interface Mark {
  x: number;
  z: number;
  glyph: Glyph;
  color: number;
  name: string;
}

function buildMarks(): Mark[] {
  const L = CITY_LAYOUT;
  const poiName = new Map(L.pois.map((p) => [p.id, p.name]));
  const color = (d: DistrictId): number => DISTRICTS.find((x) => x.id === d)?.color ?? 0xffffff;
  const out: Mark[] = [];
  for (const b of L.buildings) {
    if (b.kind === 'oldBarongsai') continue;
    const glyph: Glyph | null = b.kind === 'tower' ? 'tower' : b.kind === 'school' ? 'school' : b.kind === 'bank' ? 'bank' : b.kind === 'hospital' ? 'hospital' : b.kind === 'gudang' ? 'gudang' : null;
    if (!glyph) continue;
    out.push({ x: b.x, z: b.z, glyph, color: color(b.district), name: poiName.get(b.id) ?? '' });
  }
  const home = L.pois.find((p) => p.id === 'rumahGlen');
  if (home) out.push({ x: home.x, z: home.z, glyph: 'home', color: 0xff6b6b, name: home.name });
  return out;
}

/**
 * Kota Botanica as a map: ground, district colours, plazas, ponds, roads and the landmarks. The hidden old Barongsai building
 * only appears once the child has found it (`found()`); `invalidate()` makes the views redraw.
 */
export class CityMap implements MapSource {
  readonly half = CITY.half;
  version = 0;
  private readonly marks = buildMarks();
  private readonly secretPos = ((): { x: number; z: number } => {
    const b = CITY_LAYOUT.buildings.find((v) => v.kind === 'oldBarongsai');
    return b ? { x: b.x, z: b.z } : { x: CITY_LAYOUT.lab.door.x, z: CITY_LAYOUT.lab.door.z };
  })();

  constructor(private readonly found: () => boolean) {}

  /** The hidden building was just found: the views redraw the static layer. */
  invalidate(): void {
    this.version++;
  }

  shownSecret(): { x: number; z: number } | null {
    return this.found() ? this.secretPos : null;
  }

  draw(g: CanvasRenderingContext2D, px: number, big: boolean): void {
    const L = CITY_LAYOUT;
    const k = px / (CITY.half * 2);
    const X = (x: number): number => (x + CITY.half) * k;
    const Z = (z: number): number => (z + CITY.half) * k;
    g.clearRect(0, 0, px, px);

    // Ground, then each district's cells tinted in its colour.
    g.fillStyle = '#9fd98a';
    g.fillRect(0, 0, px, px);
    for (const d of DISTRICTS) {
      g.fillStyle = hex(d.color);
      g.globalAlpha = 0.5;
      for (const [ci, cj] of d.cells) {
        const x0 = ci === -1 ? -CITY.half : ci * 100 - 50;
        const x1 = ci === 1 ? CITY.half : ci * 100 + 50;
        const z0 = cj === -1 ? -CITY.half : cj * 100 - 50;
        const z1 = cj === 1 ? CITY.half : cj * 100 + 50;
        g.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
      }
    }
    g.globalAlpha = 1;
    // Cell borders (thin white lines) so the districts read as areas.
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = Math.max(1, px / 160);
    for (const v of [-50, 50]) {
      g.beginPath();
      g.moveTo(X(v), 0);
      g.lineTo(X(v), px);
      g.moveTo(0, Z(v));
      g.lineTo(px, Z(v));
      g.stroke();
    }

    // Plazas, fields, sand and ponds.
    for (const r of L.ground) {
      if (r.kind !== 'plaza' && r.kind !== 'field' && r.kind !== 'sand') continue;
      g.fillStyle = r.kind === 'plaza' ? '#f3e1b6' : r.kind === 'sand' ? '#f1d9a0' : '#c6ee9a';
      g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    }
    g.fillStyle = '#6ec6ff';
    for (const p of L.ponds) {
      g.beginPath();
      g.arc(X(p.x), Z(p.z), Math.max(1.5, p.r * k), 0, Math.PI * 2);
      g.fill();
    }

    // Roads: asphalt-grey, avenues a bit wider and lighter edges.
    for (const r of L.roads) {
      g.fillStyle = r.main ? '#7c7f8c' : '#9a9da8';
      g.fillRect(X(r.x0), Z(r.z0), Math.max(1, (r.x1 - r.x0) * k), Math.max(1, (r.z1 - r.z0) * k));
    }

    // Landmark icons (and names on the big map).
    const R = px * (big ? 0.016 : 0.03);
    for (const m of this.marks) this.glyph(g, X(m.x), Z(m.z), R, m.glyph, m.color);
    const sec = this.shownSecret();
    if (sec) this.glyph(g, X(sec.x), Z(sec.z), R * 1.1, 'secret', 0xffc928);

    if (big) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const small = Math.round(px * 0.022);
      g.font = `700 ${small}px system-ui, sans-serif`;
      g.lineJoin = 'round';
      g.lineWidth = small * 0.28;
      g.strokeStyle = 'rgba(255,255,255,0.92)';
      g.fillStyle = '#2d2a26';
      const label = (t: string, x: number, y: number): void => {
        g.strokeText(t, x, y);
        g.fillText(t, x, y);
      };
      for (const m of this.marks) if (m.name) label(m.name, X(m.x), Z(m.z) + R * 1.9);
      if (sec) label('Gedung Barongsai Tua', X(sec.x), Z(sec.z) + R * 2.1);
      const big2 = Math.round(px * 0.034);
      g.font = `800 ${big2}px system-ui, sans-serif`;
      g.lineWidth = big2 * 0.3;
      for (const d of DISTRICTS) {
        let cx = 0;
        let cz = 0;
        for (const [ci, cj] of d.cells) {
          cx += ci * 100;
          cz += cj * 100;
        }
        cx /= d.cells.length;
        cz /= d.cells.length;
        // Lift the name off the landmark in the middle of a cell.
        label(d.name, X(cx), Z(cz + (d.id === 'bank' ? 36 : d.cells.length === 1 ? -36 : -30)));
      }
    }
    g.strokeStyle = 'rgba(40,40,40,0.5)';
    g.lineWidth = Math.max(2, px / 100);
    g.strokeRect(0, 0, px, px);
  }

  /** One landmark icon: a white disc with a coloured ring and a tiny picture. (x, y) is the centre, r the radius. */
  private glyph(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: Glyph, color: number): void {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = Math.max(1.5, r * 0.28);
    g.strokeStyle = hex(color);
    g.stroke();
    g.fillStyle = kind === 'hospital' ? '#e53935' : '#3a3a48';
    const s = r * 0.55;
    switch (kind) {
      case 'tower':
        g.fillRect(x - s * 0.35, y - s, s * 0.7, s * 2);
        g.beginPath();
        g.moveTo(x - s * 0.7, y - s);
        g.lineTo(x, y - s * 1.5);
        g.lineTo(x + s * 0.7, y - s);
        g.fill();
        break;
      case 'school':
        g.fillRect(x - s * 0.1, y - s, s * 0.2, s * 2);
        g.fillStyle = '#4dabf7';
        g.fillRect(x, y - s, s, s * 0.9);
        break;
      case 'bank':
        g.fillStyle = '#e0a020';
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.fill();
        break;
      case 'hospital':
        g.fillRect(x - s * 0.3, y - s, s * 0.6, s * 2);
        g.fillRect(x - s, y - s * 0.3, s * 2, s * 0.6);
        break;
      case 'gudang':
        g.fillRect(x - s, y - s * 0.6, s * 2, s * 1.2);
        break;
      case 'home':
        g.fillStyle = '#e8453c';
        g.beginPath();
        g.moveTo(x - s * 1.1, y);
        g.lineTo(x, y - s * 1.1);
        g.lineTo(x + s * 1.1, y);
        g.fill();
        g.fillStyle = '#3a3a48';
        g.fillRect(x - s * 0.7, y, s * 1.4, s * 0.9);
        break;
      case 'secret':
        g.fillStyle = '#e8a000';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const rr = i % 2 === 0 ? s * 1.25 : s * 0.55;
          if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
        break;
    }
  }
}
