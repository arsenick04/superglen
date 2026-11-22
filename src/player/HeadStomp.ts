/** Feet coordinates of a collision-resolved movement segment; callers reuse these objects. */
export interface FeetPoint { readonly x: number; readonly y: number; readonly z: number }

/** Only ordinary enemies register these; bosses keep their own combat rules. */
export interface HeadStompSurface {
  /** Earliest contact fraction in [0, 1], or Infinity. Must not deal damage yet. */
  contactTime(from: FeetPoint, to: FeetPoint): number;
  stomp(): void;
}

/** Downward crossing of a head plane, using horizontal position at impact (not at either endpoint). */
export function headContactTime(from: FeetPoint, to: FeetPoint, x: number, y: number, z: number, radius: number): number {
  if (to.y >= from.y || from.y < y || to.y > y) return Infinity;
  const t = (from.y - y) / (from.y - to.y);
  const dx = from.x + (to.x - from.x) * t - x;
  const dz = from.z + (to.z - from.z) * t - z;
  return dx * dx + dz * dz <= radius * radius ? t : Infinity;
}
