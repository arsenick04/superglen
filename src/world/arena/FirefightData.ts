import { Combat } from '../../config/combat';
import { Parkour } from '../../config/parkour';
import type { Coin, Foothold, LevelReachData } from '../kits/ParkourData';

/**
 * Pure layout of the fire hose level (no three.js): `FirefightLevel.ts` builds it, `scripts/reachability.ts` checks it.
 * Tree fires sit on top of 3 or 4 round canopy steps; step k has its top at k * rise. The thin collider disc is modelled as a
 * 0.16 m slab (a cantilever), so the mantle is not over-estimated.
 */
const T = Parkour.firefightTrees;
const F = Combat.firefight;

export interface FireSpot {
  x: number;
  z: number;
  /** Height of the platform the fire stands on (0 = ground). */
  y: number;
  /** Platform ids from the lowest step to the fire's own platform (empty for ground fires). */
  steps: string[];
}
export interface Step { id: string; x: number; z: number; top: number }

export function buildFirefightLayout(): { fires: FireSpot[]; steps: Step[] } {
  const fires: FireSpot[] = [];
  const steps: Step[] = [];
  F.fires.forEach((f, i) => {
    const n = f.steps ?? 0;
    const ids: string[] = [];
    const dir = f.dir ?? 0;
    for (let k = 1; k <= n; k++) {
      const back = (n - k) * T.spacing;
      const id = `tree${i}-${k}`;
      steps.push({ id, x: f.x + Math.sin(dir) * back, z: f.z + Math.cos(dir) * back, top: k * T.rise });
      ids.push(id);
    }
    fires.push({ x: f.x, z: f.z, y: n * T.rise, steps: ids });
  });
  return { fires, steps };
}

function computeReach(): LevelReachData {
  const { fires, steps } = buildFirefightLayout();
  const footholds: Foothold[] = steps.map((s) => ({
    id: s.id, kind: 'tree', group: 'canopy', center: [s.x, s.top - 0.08, s.z], size: [T.radius * 2, 0.16, T.radius * 2], round: true,
  }));
  const coins: Coin[] = fires.map((f, i) => ({
    id: `fire${i}`, pos: [f.x, f.y + 0.5, f.z], level: 0, on: f.steps.length ? f.steps[f.steps.length - 1] : 'ground',
  }));
  return { id: 'firefight', starts: ['ground'], footholds, buildings: [], coins, gates: [] };
}
export const FIREFIGHT_REACH: LevelReachData = computeReach();
