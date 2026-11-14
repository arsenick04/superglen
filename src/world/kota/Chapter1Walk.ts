import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { startGate } from '../../core/StartGate';
import { makeMaterials } from '../bab1/Batch';
import { Kit } from '../bab1/Kit';
import { JumpTutorial } from '../bab1/JumpTutorial';
import { CITY_LAYOUT, hillY, isEdgeHill } from './CityData';

const C1 = CITY_LAYOUT.chapter1;
/** Arrive at a waypoint within this distance (m); any later waypoint counts too (the child may take a shortcut). */
const REACH = 6;
/** Glimmer trail: number of sparkles and their spacing along the route (m). */
const TRAIL_N = 9;
const TRAIL_STEP = 2.6;

/** Ground height of the city at (x, z): 0, or the slope / plateau of a hill (the old building's hill). */
export function cityGroundY(x: number, z: number): number {
  let y = 0;
  for (const h of CITY_LAYOUT.hills) if (!isEdgeHill(h)) y = Math.max(y, hillY(h, Math.hypot(x - h.x, z - h.z)));
  return y;
}

/**
 * CHAPTER 1, OUTSIDE: Glen walks home from school and the light on the hill draws him to the old Barongsai building.
 * Soft guidance only, nothing blocks the way: the objective beam (and the gold screen-edge arrow) on the next waypoint, a
 * glimmer trail on the ground leading along the route, the goal star on the map. The child may wander anywhere; the guidance
 * waits and resumes from wherever they come back (reaching any later waypoint skips ahead). Lines (existing voice clips):
 *   start            bab1_glen_pulang     "Hore, pulang sekolah!"
 *   seeIndex         bab1_glen_gedung     the building on the hill comes into view
 *   at the bar       bab1_glen_lompat     jump lesson (icon above the bar, pulsing jump button; a plank after 20 s)
 *   fenceIndex       bab1_glen_pagar      top of the fenced old path
 * The door itself is KotaLevel's (walk up, press: fade into the lab).
 */
export class Chapter1Walk {
  /** Route as ground points: the school gate, then the waypoints. */
  private readonly pts: THREE.Vector3[];
  /** Index (into `pts`) of the waypoint the guidance points at. pts.length = at the door. */
  next = 1;
  step = 'walk';
  private said = new Set<string>();
  readonly jump: JumpTutorial;
  private crossed = false;
  private readonly trail: THREE.InstancedMesh;
  private readonly trailBase: THREE.Vector3[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly sc = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private lastTrailX = 1e9;
  private lastTrailZ = 1e9;
  private lastTrailNext = -1;
  private t = 0;
  /** Doors reached (the door's own guidance shows from here on). */
  atDoor = false;

  constructor(private readonly ctx: LevelContext) {
    this.pts = [[C1.start.x, C1.start.z] as [number, number], ...C1.route].map(([x, z]) => new THREE.Vector3(x, cityGroundY(x, z), z));
    // The jump-lesson bar: visuals here, collider from CityData (streamed with its chunk).
    const kit = new Kit(ctx.physics, makeMaterials(), true);
    const b = C1.bar;
    this.jump = new JumpTutorial(ctx, kit, ctx.fx.sparkles, { x: b.x, z: b.z, half: b.w / 2, h: b.h, plankDx: 1.6, collider: false, y: 0 });
    kit.build(ctx.root);

    const geo = new THREE.OctahedronGeometry(0.16, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.trail = new THREE.InstancedMesh(geo, mat, TRAIL_N);
    this.trail.frustumCulled = false;
    this.trail.count = 0;
    ctx.root.add(this.trail);
    for (let i = 0; i < TRAIL_N; i++) this.trailBase.push(new THREE.Vector3());
  }

  /** Waypoints (ground points) in order, for tests and the map. */
  get route(): readonly THREE.Vector3[] {
    return this.pts;
  }

  /** Where the guidance points now (the door once every waypoint is behind). */
  get goal(): THREE.Vector3 {
    return this.pts[Math.min(this.next, this.pts.length - 1)];
  }

  start(): void {
    const { seq, dialog } = this.ctx;
    this.setObjective();
    seq.run(async () => {
      await seq.waitUntil(() => startGate.started);
      void dialog.say('bab1_glen_pulang');
    });
    seq.run(() => this.jumpLesson());
  }

  private sayOnce(id: string): void {
    if (this.said.has(id)) return;
    this.said.add(id);
    void this.ctx.dialog.say(id);
  }

  private setObjective(): void {
    const g = this.goal;
    this.ctx.objectives.set(new THREE.Vector3(g.x, g.y, g.z));
  }

  private barCrossed(): boolean {
    const p = this.ctx.player.visualPosition;
    const b = C1.bar;
    // North of the bar on the path, or anywhere further along the route (the hill).
    return (p.z < b.z - 0.9 && Math.abs(p.x - b.x) < 12) || this.next > 6;
  }

  /** The jump lesson at the bar on the old path: line + hint near it; a plank appears after 20 s without crossing. */
  private async jumpLesson(): Promise<void> {
    const { ctx, jump } = this;
    const { seq } = ctx;
    const b = C1.bar;
    const near = (): boolean => {
      const p = ctx.player.visualPosition;
      return Math.abs(p.x - b.x) < b.w && p.z > b.z && p.z < b.z + 4.2;
    };
    await seq.waitUntil(() => near() || this.barCrossed());
    if (this.barCrossed()) {
      this.crossed = true;
      return;
    }
    this.step = 'jump';
    this.sayOnce('bab1_glen_lompat');
    jump.setHint(true);
    await Promise.race([seq.wait(20), seq.waitUntil(() => this.barCrossed())]);
    if (!this.barCrossed()) {
      jump.revealPlank();
      await seq.waitUntil(() => this.barCrossed());
    }
    jump.setHint(false);
    jump.quietPlank();
    this.crossed = true;
    this.step = 'walk';
    ctx.player.markSafe(b.x, 0, b.z - 2);
  }

  get trailCount(): number {
    return this.trail.count;
  }

  get jumpDone(): boolean {
    return this.crossed;
  }

  fixedUpdate(): void {
    const p = this.ctx.player.position;
    let n = this.next;
    for (let i = this.pts.length - 1; i >= this.next; i--) {
      const w = this.pts[i];
      if (Math.hypot(p.x - w.x, p.z - w.z) < REACH) {
        n = i + 1;
        break;
      }
    }
    if (n !== this.next) {
      const before = this.next;
      this.next = n;
      if (before <= C1.seeIndex + 1 && n > C1.seeIndex + 1) this.sayOnce('bab1_glen_gedung');
      if (n > C1.fenceIndex + 1) this.sayOnce('bab1_glen_pagar');
      if (n >= this.pts.length) this.atDoor = true;
      this.setObjective();
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.jump.update(dt);
    const p = this.ctx.player.visualPosition;
    if (this.next !== this.lastTrailNext || Math.abs(p.x - this.lastTrailX) + Math.abs(p.z - this.lastTrailZ) > 0.8) this.layTrail(p.x, p.z);
    // A soft wave running along the trail toward the goal.
    const n = this.trail.count;
    for (let i = 0; i < n; i++) {
      const k = 0.5 + 0.5 * Math.sin(this.t * 4 - i * 0.7);
      const b = this.trailBase[i];
      this.pos.set(b.x, b.y + 0.3 + 0.12 * k, b.z);
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.t * 1.5 + i);
      this.sc.setScalar(0.7 + 0.5 * k);
      this.m.compose(this.pos, this.q, this.sc);
      this.trail.setMatrixAt(i, this.m);
    }
    if (n > 0) this.trail.instanceMatrix.needsUpdate = true;
  }

  /** Put the sparkles along the route ahead: from the player's spot on the current leg toward the goal. */
  private layTrail(x: number, z: number): void {
    this.lastTrailX = x;
    this.lastTrailZ = z;
    this.lastTrailNext = this.next;
    const pts = this.pts;
    let i = Math.min(this.next, pts.length - 1);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    // Projection of the player on the current leg (clamped), a little ahead of the feet.
    const lx = b.x - a.x;
    const lz = b.z - a.z;
    const len2 = lx * lx + lz * lz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * lx + (z - a.z) * lz) / len2));
    let cx = a.x + lx * t;
    let cz = a.z + lz * t;
    // Far off the route (wandered away): no trail, the beam and the edge arrow still lead.
    if (Math.hypot(x - cx, z - cz) > 30) {
      this.trail.count = 0;
      return;
    }
    let left = 2.0;
    let k = 0;
    while (k < TRAIL_N && i < pts.length) {
      const tx = pts[i].x - cx;
      const tz = pts[i].z - cz;
      const d = Math.hypot(tx, tz);
      if (d >= left) {
        cx += (tx / d) * left;
        cz += (tz / d) * left;
        this.trailBase[k++].set(cx, cityGroundY(cx, cz), cz);
        left = TRAIL_STEP;
      } else {
        left -= d;
        cx = pts[i].x;
        cz = pts[i].z;
        i++;
      }
    }
    this.trail.count = k;
  }

  /** Stop guiding (the child went in). */
  dispose(): void {
    this.trail.count = 0;
  }
}
