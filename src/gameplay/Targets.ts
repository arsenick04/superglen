import * as THREE from 'three';

/** What a laser hit tells the target. Reused object: copy values, never keep the reference. */
export interface HitInfo {
  target: Target;
  /** Impact point (the target's aim point). */
  x: number;
  y: number;
  z: number;
  /** Unit direction of the beam. */
  dirX: number;
  dirY: number;
  dirZ: number;
  /** Distance from the wrist to the target (m). */
  distance: number;
}

export interface TargetSpec {
  /** Debug/test name. Defaults to `target<n>`. */
  id?: string;
  /** World aim point. Return a reused Vector3 (called often; do not allocate). */
  position: () => THREE.Vector3;
  /** Generous hit/aim radius (m). */
  radius: number;
  /** Start enabled (default true). */
  enabled?: boolean;
  /** Higher wins when two targets are about equally well placed (default 0). */
  priority?: number;
  /** Called when a laser shot hits. Never kills anything: react with stars, a spin, a tame, a run away. */
  onHit: (info: HitInfo) => void;
}

/** A registered targetable. Toggle `enabled` freely (a tamed enemy stops being a target); `remove()` to unregister. */
export class Target {
  removed = false;
  constructor(
    readonly id: string,
    readonly position: () => THREE.Vector3,
    public radius: number,
    public enabled: boolean,
    public priority: number,
    readonly onHit: (info: HitInfo) => void,
    private readonly owner: Targets,
  ) {}

  remove(): void {
    this.owner.remove(this);
  }
}

/** Auto-aim question: where from, which way the player and the camera look, how far and how wide. */
export interface AimQuery {
  x: number;
  y: number;
  z: number;
  /** Horizontal unit vectors of the player's facing and the camera's forward. */
  facingX: number;
  facingZ: number;
  cameraX: number;
  cameraZ: number;
  range: number;
  /** Half-angle of the aim cone (rad). */
  cone: number;
}

export interface Candidate {
  target: Target;
  score: number;
  dist: number;
}

const MAX_ELEVATION = (80 * Math.PI) / 180;

/**
 * Registry of things the laser can hit. Levels and enemies register themselves when built and the LevelManager
 * clears the list on unload.
 *
 *   const handle = ctx.targets.add({ position: () => this.aimPoint, radius: 0.6, onHit: (h) => this.getDizzy(h) });
 *   handle.enabled = false;   // e.g. once tamed
 */
export class Targets {
  readonly list: Target[] = [];
  private counter = 0;

  add(spec: TargetSpec): Target {
    const t = new Target(
      spec.id ?? `target${++this.counter}`,
      spec.position,
      spec.radius,
      spec.enabled ?? true,
      spec.priority ?? 0,
      spec.onHit,
      this,
    );
    this.list.push(t);
    return t;
  }

  remove(t: Target): void {
    t.removed = true;
    t.enabled = false;
    const i = this.list.indexOf(t);
    if (i >= 0) this.list.splice(i, 1);
  }

  clear(): void {
    for (const t of this.list) {
      t.removed = true;
      t.enabled = false;
    }
    this.list.length = 0;
  }

  get count(): number {
    return this.list.length;
  }

  /**
   * Fill `out` with the best enabled targets (lowest score first, at most out.length) inside the cone of the
   * player's facing OR the camera's forward (a child may face away from where they look). Angle counts more than
   * distance. Returns how many were written. Line of sight is the caller's job.
   */
  findCandidates(q: AimQuery, out: Candidate[]): number {
    let n = 0;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!t.enabled) continue;
      const p = t.position();
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const dz = p.z - q.z;
      const dh = Math.hypot(dx, dz);
      const dist = Math.hypot(dh, dy);
      if (dist < 0.05 || dist - t.radius > q.range) continue;
      if (Math.atan2(Math.abs(dy), dh) > MAX_ELEVATION) continue;
      // Angle to each reference direction, reduced by the angular size of the target.
      let angle = 0;
      if (dh > 0.05) {
        const slack = Math.atan2(t.radius, Math.max(dist, 0.5));
        const a1 = Math.acos(Math.max(-1, Math.min(1, (dx * q.facingX + dz * q.facingZ) / dh)));
        const a2 = Math.acos(Math.max(-1, Math.min(1, (dx * q.cameraX + dz * q.cameraZ) / dh)));
        angle = Math.max(0, Math.min(a1, a2) - slack);
      }
      if (angle > q.cone) continue;
      const score = 0.65 * (angle / q.cone) + 0.35 * (dist / q.range) - 0.12 * t.priority;
      // Insert into the sorted output.
      let k = n < out.length ? n : out.length - 1;
      if (n >= out.length && score >= out[k].score) continue;
      while (k > 0 && out[k - 1].score > score) {
        // Shift the previous entry down by swapping slots (the slot objects are preallocated and reused).
        const tmp = out[k];
        out[k] = out[k - 1];
        out[k - 1] = tmp;
        k--;
      }
      const c = out[k];
      c.target = t;
      c.score = score;
      c.dist = dist;
      if (n < out.length) n++;
    }
    return n;
  }
}

/** Preallocate candidate slots for `Targets.findCandidates`. */
export function makeCandidates(n: number): Candidate[] {
  const origin = new THREE.Vector3();
  const filler = new Targets().add({ id: '', position: () => origin, radius: 0, enabled: false, onHit: () => undefined });
  const out: Candidate[] = [];
  for (let i = 0; i < n; i++) out.push({ target: filler, score: 0, dist: 0 });
  return out;
}
