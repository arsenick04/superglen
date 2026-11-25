import type { MapSource } from '../MapSource';
import { CITY, CITY_LAYOUT, DISTRICTS, type DistrictId } from './CityData';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Landmark kinds that get an icon (the old Barongsai building is separate: only after it was found). */
type Glyph = 'tower' | 'school' | 'bank' | 'hospital' | 'gudang' | 'home' | 'secret' | 'pasar';
/** One big emoji per landmark: a child recognises a picture long before a symbol. */
const EMOJI: Record<Glyph, string> = { tower: '\u{1F5FC}', school: '\u{1F3EB}', bank: '\u{1F3E6}', hospital: '\u{1F3E5}', gudang: '\u{1F4E6}', home: '\u{1F3E0}', secret: '\u{1F3EF}', pasar: '\u{1F6D2}' };
/** Landmarks the child needs on the small map; towers and the warehouse only show on the big one. */
const MINI_GLYPHS: ReadonlySet<Glyph> = new Set<Glyph>(['school', 'bank', 'hospital', 'home', 'secret', 'pasar']);
/** Landmarks that get a name label on the big map. */
const LABELLED: ReadonlySet<Glyph> = new Set<Glyph>(['school', 'bank', 'hospital', 'home', 'secret', 'pasar', 'gudang']);
/** Where each district name goes on the big map (world x, z). */
const NAME_AT: Record<DistrictId, readonly [number, number]> = { perumahan: [-100, 126], sekolah: [-80, -136], alun: [0, -38], pasar: [108, 22], bank: [0, 140], bukit: [100, -138] };
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
    const glyph: Glyph | null = b.kind === 'tower' ? 'tower' : b.kind === 'school' ? 'school' : b.kind === 'bank' ? 'bank' : b.kind === 'hospital' ? 'hospital' : b.kind === 'gudang' ? 'gudang' : b.kind === 'pasar' ? 'pasar' : null;
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

  /** D3: residents with a mission to give (both maps) and parked bikes (full map only). Null: nothing of that yet. */
  d3: { residents(): { x: number; z: number }[]; bikes(): { x: number; z: number }[]; care?(): { x: number; z: number; kind: 'stall' | 'rs' }[] } | null = null;

  /** Objective star (set by the level); undefined = follow the objective beam. */
  goal: (() => { x: number; z: number } | null) | undefined = undefined;

  constructor(private readonly found: () => boolean) {}

  /** The hidden building was just found: the views redraw the static layer. */
  invalidate(): void {
    this.version++;
  }

  shownSecret(): { x: number; z: number } | null {
    return this.found() ? this.secretPos : null;
  }

  draw(g: CanvasRenderingContext2D, px: number, big: boolean, viewportPx = px): void {
    const L = CITY_LAYOUT;
    const k = px / (CITY.half * 2);
    const X = (x: number): number => (x + CITY.half) * k;
    const Z = (z: number): number => (z + CITY.half) * k;
    g.clearRect(0, 0, px, px);

    // Soft ground (parchment on the big map, pale meadow on the small one), then each district in its own pastel.
    g.fillStyle = big ? '#fbf1d3' : '#eaf3d2';
    g.fillRect(0, 0, px, px);
    for (const d of DISTRICTS) {
      g.fillStyle = hex(d.color);
      g.globalAlpha = big ? 0.34 : 0.4;
      for (const [ci, cj] of d.cells) {
        const x0 = ci === -1 ? -CITY.half : ci * 100 - 50;
        const x1 = ci === 1 ? CITY.half : ci * 100 + 50;
        const z0 = cj === -1 ? -CITY.half : cj * 100 - 50;
        const z1 = cj === 1 ? CITY.half : cj * 100 + 50;
        g.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
      }
    }
    g.globalAlpha = 1;
    // Dashed district borders.
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = Math.max(1.5, px / 200);
    g.setLineDash([px / 60, px / 90]);
    for (const v of [-50, 50]) {
      g.beginPath();
      g.moveTo(X(v), 0);
      g.lineTo(X(v), px);
      g.moveTo(0, Z(v));
      g.lineTo(px, Z(v));
      g.stroke();
    }
    g.setLineDash([]);

    // Hills (the old building sits on one), plazas, fields, sand and ponds.
    for (const h of L.hills) {
      g.beginPath();
      g.arc(X(h.x), Z(h.z), h.rBottom * k, 0, Math.PI * 2);
      g.fillStyle = 'rgba(120,190,100,0.55)';
      g.fill();
      g.beginPath();
      g.arc(X(h.x), Z(h.z), h.rTop * k, 0, Math.PI * 2);
      g.fillStyle = 'rgba(95,170,85,0.6)';
      g.fill();
    }
    for (const r of L.ground) {
      if (r.kind !== 'plaza' && r.kind !== 'field' && r.kind !== 'sand') continue;
      g.fillStyle = r.kind === 'plaza' ? '#fff0c8' : r.kind === 'sand' ? '#f6e0a8' : '#b9e88f';
      g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    }
    g.fillStyle = '#7fcdf5';
    for (const p of L.ponds) {
      g.beginPath();
      g.arc(X(p.x), Z(p.z), Math.max(1.5, p.r * k), 0, Math.PI * 2);
      g.fill();
    }

    // Roads as light ribbons with a soft edge (two passes: edge, then the ribbon).
    const edge = Math.max(1.5, px / 160);
    g.fillStyle = 'rgba(150,130,100,0.55)';
    for (const r of L.roads) g.fillRect(X(r.x0) - edge, Z(r.z0) - edge, Math.max(1, (r.x1 - r.x0) * k) + edge * 2, Math.max(1, (r.z1 - r.z0) * k) + edge * 2);
    for (const r of L.roads) {
      g.fillStyle = r.main ? '#fffdf5' : '#f4eedd';
      g.fillRect(X(r.x0), Z(r.z0), Math.max(1, (r.x1 - r.x0) * k), Math.max(1, (r.z1 - r.z0) * k));
    }

    // Landmark icons (and names on the big map).
    const R = viewportPx * (big ? 0.036 : 0.105);
    const sec = this.shownSecret();
    if (big) for (const b of this.d3?.bikes() ?? []) this.bikeGlyph(g, X(b.x), Z(b.z), R * 0.6);
    for (const m of this.marks) if (big || MINI_GLYPHS.has(m.glyph)) this.glyph(g, X(m.x), Z(m.z), big && m.glyph === 'tower' ? R * 0.75 : R, m.glyph, m.color);
    if (sec) this.glyph(g, X(sec.x), Z(sec.z), R * 1.1, 'secret', 0xffc928);

    if (this.d3) {
      for (const q of this.d3.residents()) this.questGlyph(g, X(q.x), Z(q.z), R * (big ? 0.6 : 0.5));
      for (const c of this.d3.care?.() ?? []) this.careGlyph(g, X(c.x), Z(c.z), R * (big ? 0.7 : 0.55), c.kind);
    }

    if (big) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const small = Math.round(px * 0.03);
      g.font = `800 ${small}px system-ui, sans-serif`;
      g.lineJoin = 'round';
      g.lineWidth = small * 0.3;
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.fillStyle = '#3b2f22';
      const label = (t: string, x: number, y: number): void => {
        g.strokeText(t, x, y);
        g.fillText(t, x, y);
      };
      for (const m of this.marks) if (m.name && LABELLED.has(m.glyph)) label(m.glyph === 'school' ? 'Sekolah Glen' : m.name, X(m.x), Z(m.z) + R * 1.65);
      if (sec) label('Gedung Tua', X(sec.x), Z(sec.z) + R * 1.8);
      // District names at fixed spots away from the landmarks; long ones shrink to fit.
      g.fillStyle = '#6b4a2a';
      g.lineJoin = 'round';
      for (const d of DISTRICTS) {
        const at = NAME_AT[d.id];
        const text = d.id === 'bank' ? 'Bank & RS' : d.name;
        let size = Math.round(px * 0.042);
        g.font = `900 ${size}px system-ui, sans-serif`;
        const maxW = px * 0.27;
        const w = g.measureText(text).width;
        if (w > maxW) {
          size = Math.floor((size * maxW) / w);
          g.font = `900 ${size}px system-ui, sans-serif`;
        }
        g.lineWidth = size * 0.28;
        label(text, X(at[0]), Z(at[1]));
      }
    }
  }

  /** A resident with a mission: an orange disc with a white "!" (no words needed). */
  private questGlyph(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#ff9f1c';
    g.fill();
    g.lineWidth = Math.max(1.5, r * 0.3);
    g.strokeStyle = '#fff';
    g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(x - r * 0.13, y - r * 0.6, r * 0.26, r * 0.7);
    g.beginPath();
    g.arc(x, y + r * 0.5, r * 0.17, 0, Math.PI * 2);
    g.fill();
  }

  /** Healing places: a white disc with a red heart (food stall: orange ring; Rumah Sakit: red ring and a small cross). */
  private careGlyph(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: 'stall' | 'rs'): void {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = Math.max(1.5, r * 0.3);
    g.strokeStyle = kind === 'stall' ? '#ff9f1c' : '#e53935';
    g.stroke();
    g.fillStyle = '#ff4d6d';
    g.beginPath();
    g.moveTo(x, y + r * 0.55);
    g.bezierCurveTo(x - r * 0.9, y - r * 0.05, x - r * 0.5, y - r * 0.7, x, y - r * 0.2);
    g.bezierCurveTo(x + r * 0.5, y - r * 0.7, x + r * 0.9, y - r * 0.05, x, y + r * 0.55);
    g.fill();
  }

  /** A parked bike: a white disc with a teal ring and a tiny two-wheeler. */
  private bikeGlyph(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = Math.max(1.5, r * 0.28);
    g.strokeStyle = '#2ec4b6';
    g.stroke();
    g.strokeStyle = '#3a3a48';
    g.lineWidth = Math.max(1, r * 0.16);
    const w = r * 0.42;
    for (const dx of [-w, w]) {
      g.beginPath();
      g.arc(x + dx, y + r * 0.22, r * 0.26, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(x - w, y + r * 0.22);
    g.lineTo(x - r * 0.05, y - r * 0.25);
    g.lineTo(x + w, y + r * 0.22);
    g.stroke();
  }

  /** One landmark icon: a white disc with a coloured ring and a big emoji. (x, y) is the centre, r the radius. */
  private glyph(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: Glyph, color: number): void {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = Math.max(2, r * 0.22);
    g.strokeStyle = hex(color);
    g.stroke();
    g.font = `${Math.round(r * 1.35)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.fillText(EMOJI[kind], x, y + r * 0.06);
  }
}
