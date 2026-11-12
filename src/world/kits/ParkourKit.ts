import { Parkour } from '../../config/parkour';
import { Kit, C } from '../bab1/Kit';

/**
 * Parkour kit: the usable footholds of a building (spec: PAKET_P1_PARKOUR.md, section 3) as boxes and poles that go
 * into the level's merged `Kit` batches (a few draw calls for any number of pieces).
 *
 *  - every piece is a box whose collider is `Parkour.world.friendly` (10 cm) wider than what is drawn, same top height
 *  - every piece gets a thin bright strip along the top edge (an unlit glow batch) so a child sees what may be stood on
 *  - every piece is recorded in `footholds` (id, group, position, top height) so the reachability test (package P2) and the
 *    smoke test can read the layout from data instead of guessing
 *
 * A "foothold" that is a cantilever (AC unit, ledge, balcony, sign) is a slab of `thickness`; a "pier" or crate stack
 * goes down to the ground. Mantle only grabs a face that is at least as tall as the slab is thick plus 0.55 m (the
 * probe height), so thicker pieces are easier to climb onto: see the reach notes in `arena/ArenaLompat.ts`.
 */

export interface Foothold {
  id: string;
  /** Which structure it belongs to ('tower', 'house', 'ruko', 'poles', 'drums'). */
  group: string;
  kind: string;
  x: number;
  z: number;
  /** Size along x and z of the drawn top. */
  w: number;
  d: number;
  /** Height of the standable top above the ground (m). */
  top: number;
}

export interface BlockOptions {
  id: string;
  group: string;
  kind: string;
  /** Centre of the footprint. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Top height; the block reaches down to `top - thickness` (default: down to the ground). */
  top: number;
  thickness?: number;
  color: number;
  /** Colour of the top cap (default: lighter than the body). */
  capColor?: number;
  /** Draw the bright edge strip (default true). */
  edge?: boolean;
}

export const EDGE_COLOR = 0xfff3a0;

export class ParkourKit {
  readonly footholds: Foothold[] = [];

  constructor(readonly kit: Kit) {}

  /** A box foothold. */
  block(o: BlockOptions): Foothold {
    const t = o.thickness ?? o.top;
    const bottom = o.top - t;
    const f = Parkour.world.friendly;
    const capH = Math.min(0.16, t * 0.3);
    // Body (casts shadows) and a lighter cap on top.
    this.kit.lit.box([o.w, t - capH, o.d], [o.x, bottom + (t - capH) / 2, o.z], o.color);
    this.kit.lit.box([o.w + 0.04, capH, o.d + 0.04], [o.x, o.top - capH / 2, o.z], o.capColor ?? lighten(o.color));
    // Friendly collider: 10 cm wider on every side, same top.
    this.kit.collider([o.w + 2 * f, t, o.d + 2 * f], [o.x, bottom + t / 2, o.z]);
    if (o.edge !== false) this.edge(o.x, o.z, o.w, o.d, o.top);
    const fh: Foothold = { id: o.id, group: o.group, kind: o.kind, x: o.x, z: o.z, w: o.w, d: o.d, top: o.top };
    this.footholds.push(fh);
    return fh;
  }

  /** The bright strip along the top edge of a foothold (unlit, so it also reads in shade). */
  edge(x: number, z: number, w: number, d: number, top: number): void {
    const e = Parkour.world.edgeWidth;
    const y = top + 0.02;
    const g = this.kit.glow;
    g.box([w + 0.04, 0.04, e], [x, y, z - d / 2 + e / 2 - 0.02], EDGE_COLOR);
    g.box([w + 0.04, 0.04, e], [x, y, z + d / 2 - e / 2 + 0.02], EDGE_COLOR);
    g.box([e, 0.04, d - 2 * e], [x - w / 2 + e / 2 - 0.02, y, z], EDGE_COLOR);
    g.box([e, 0.04, d - 2 * e], [x + w / 2 - e / 2 + 0.02, y, z], EDGE_COLOR);
  }

  /** A stack of `n` wooden crates (each `size` high), solid down to the ground. */
  crateStack(id: string, group: string, x: number, z: number, n: number, size = 0.9, wide = 1.2): Foothold {
    const top = n * size;
    for (let i = 0; i < n; i++) {
      // Slats: a darker frame around each crate.
      this.kit.deco.box([wide + 0.06, 0.07, wide + 0.06], [x, i * size + 0.04, z], 0x8a5a2c);
      this.kit.deco.box([wide + 0.06, 0.07, wide + 0.06], [x, (i + 1) * size - 0.04, z], 0x8a5a2c);
    }
    return this.block({ id, group, kind: 'crate', x, z, w: wide, d: wide, top, color: 0xd9a05b, capColor: 0xe8bb7a });
  }

  /** Outdoor AC unit hanging on a wall: a slab `thick` thick. */
  acUnit(id: string, group: string, x: number, z: number, top: number, w = 1.2, d = 0.9, thick = 0.8): Foothold {
    const fh = this.block({ id, group, kind: 'ac', x, z, w, d, top, thickness: thick, color: 0xd8e0ea, capColor: 0xf3f6fa });
    this.kit.deco.box([w * 0.8, thick * 0.5, 0.04], [x, top - thick / 2, z + d / 2 + 0.02], 0x6f8296); // grille facing +z
    return fh;
  }

  /** A window ledge / sill: a long slab. */
  windowLedge(id: string, group: string, x: number, z: number, top: number, w = 2.4, d = 0.7, thick = 0.5): Foothold {
    return this.block({ id, group, kind: 'ledge', x, z, w, d, top, thickness: thick, color: 0xfff1d6, capColor: C.CREAM });
  }

  /**
   * A balcony on a solid bay: the shop-front bay carries the balcony all the way down to the ground, so pressing toward
   * it always meets a wall to climb (a cantilever slab can be run under, bonking the head: not for a 5-year-old). Painted
   * like a balcony: a red band under a gold edge and a row of rail posts (decoration only).
   */
  balcony(id: string, group: string, x: number, z: number, top: number, w = 2.4, d = 1.8): Foothold {
    const fh = this.block({ id, group, kind: 'balcony', x, z, w, d, top, color: 0xffb4a2, capColor: C.GOLD });
    this.kit.deco.box([w + 0.04, 0.5, d + 0.04], [x, top - 0.45, z], C.RED);
    for (let i = 0; i < 6; i++) this.kit.deco.cyl(0.04, 0.5, [x - w / 2 + 0.2 + i * ((w - 0.4) / 5), top + 0.27, z + d / 2 - 0.1], C.GOLD);
    return fh;
  }

  /** A shop sign board (a gold slab with a red front). */
  signBoard(id: string, group: string, x: number, z: number, top: number, w = 1.0, d = 0.9, thick = 0.5): Foothold {
    return this.block({ id, group, kind: 'sign', x, z, w, d, top, thickness: thick, color: C.GOLD, capColor: C.CREAM });
  }

  /** A shop awning: a flat slab with a striped front. */
  awning(id: string, group: string, x: number, z: number, top: number, w = 2.4, d = 1.4, thick = 0.25): Foothold {
    const fh = this.block({ id, group, kind: 'awning', x, z, w, d, top, thickness: thick, color: C.RED, capColor: C.CREAM });
    for (let i = 0; i < 6; i++) this.kit.deco.box([w / 6, thick * 0.8, 0.06], [x - w / 2 + (i + 0.5) * (w / 6), top - thick * 0.5, z + d / 2 + 0.03], i % 2 ? C.RED : C.CREAM);
    return fh;
  }

  /** A round pole (lion-dance pole) with a wide painted top. The collider is a cylinder 10 cm wider. */
  pole(id: string, group: string, x: number, z: number, h: number, radius: number, color: number): Foothold {
    const f = Parkour.world.friendly;
    this.kit.lit.cyl(radius, h - 0.1, [x, (h - 0.1) / 2, z], color);
    this.kit.lit.cyl(radius + 0.04, 0.1, [x, h - 0.05, z], C.GOLD);
    this.kit.deco.cyl(radius - 0.12, 0.04, [x, h + 0.02, z], C.CREAM);
    this.kit.glow.cyl(radius + 0.02, 0.03, [x, h + 0.005, z], EDGE_COLOR);
    this.kit.glow.cyl(radius - 0.1, 0.03, [x, h + 0.01, z], C.CREAM);
    this.kit.physics.addFixedCylinder(h / 2, radius + f, { x, y: h / 2, z });
    const fh: Foothold = { id, group, kind: 'pole', x, z, w: radius * 2, d: radius * 2, top: h };
    this.footholds.push(fh);
    return fh;
  }
}

/** A lighter version of a colour (for caps). */
function lighten(c: number): number {
  const r = Math.min(255, ((c >> 16) & 255) + 50);
  const g = Math.min(255, ((c >> 8) & 255) + 50);
  const b = Math.min(255, (c & 255) + 50);
  return (r << 16) | (g << 8) | b;
}
