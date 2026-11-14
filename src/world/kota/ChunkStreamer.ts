import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../../core/Physics';
import { Quality } from '../../core/Quality';
import { bakeStatic, Slot, type Recipe } from './CityMesher';
import type { BuiltCity, ChunkRecipes } from './CityBuilder';
import type { Solid } from './CityData';

/**
 * Streaming of the open city around the player, with hysteresis and per-frame budgets.
 *
 * VISUALS: chunk details are expanded into preallocated GPU slots (CityMesher.Slot): `slots` per layer, sized for the
 * largest chunk. A chunk starts loading when the player comes within `visIn` m of its square and is dropped beyond `visOut`.
 * At most `vertsPerFrame` vertices are expanded per frame (spread over frames: no hitch); a chunk shows when all three of its
 * layers are done. The far layer (skyline) and the flat ground are baked once and always drawn.
 *
 * COLLIDERS: a chunk's Rapier bodies are created when the player is within `colIn` m (at most `collidersPerFrame` a frame)
 * and removed beyond `colOut` (`removalsPerFrame` a frame). Safety net (`ensureNear`, every fixed step): a chunk closer than
 * `colSafe` m that is not complete is finished at once and the scene queries refreshed, so a teleport, a respawn or a very
 * fast flight never meets a missing floor or wall. Ground, hills and the boundary are global (always there).
 *
 * Steady state (no chunk changing) allocates nothing: distances are plain numbers in typed arrays.
 */
export const STREAM = {
  visIn: 40,
  visOut: 62,
  colIn: 24,
  colOut: 40,
  colSafe: 7,
  /** Slots per layer. The load set (within visIn < chunk size) is at most 3 x 3 chunks; the rest is hysteresis room. */
  slots: 12,
  vertsPerFrame: Quality.level === 'low' ? 7000 : 14000,
  collidersPerFrame: 40,
  removalsPerFrame: 80,
} as const;

const NONE = 0;
const LOADING = 1;
const SHOWN = 2;

export interface StreamStats {
  visLoaded: number;
  visLoading: number;
  colLoaded: number;
  colBodies: number;
  /** Totals since the level started. */
  visLoads: number;
  visUnloads: number;
  colLoads: number;
  colUnloads: number;
  syncLoads: number;
  maxVisLoaded: number;
  maxColBodies: number;
  /** Triangles of the shown chunk slots (before culling). */
  chunkTris: number;
}

export class ChunkStreamer {
  readonly stats: StreamStats = { visLoaded: 0, visLoading: 0, colLoaded: 0, colBodies: 0, visLoads: 0, visUnloads: 0, colLoads: 0, colUnloads: 0, syncLoads: 0, maxVisLoaded: 0, maxColBodies: 0, chunkTris: 0 };
  readonly farMeshes: THREE.Mesh[] = [];
  readonly flatMesh: THREE.Mesh | null;
  private readonly n: number;
  private readonly dist: Float32Array;
  private readonly vis: Uint8Array;
  /** Slot index per chunk and layer (-1 = none). */
  private readonly slotOf: Int16Array;
  private readonly layers: Slot[][];
  /** Colliders: number created so far per chunk, removal flag. */
  private readonly colMade: Int32Array;
  private readonly colRemoving: Uint8Array;
  /** Bodies per chunk, index-aligned with the chunk's solids (null: a hull Rapier could not build). */
  private readonly bodies: (RAPIER.RigidBody | null)[][];
  private readonly hulls = new Map<Solid, Float32Array>();

  constructor(
    private readonly city: BuiltCity,
    private readonly physics: Physics,
    root: THREE.Object3D,
    lit: THREE.Material,
    glow: THREE.Material,
  ) {
    const n = city.chunks.length;
    this.n = n;
    this.dist = new Float32Array(n).fill(1e9);
    this.vis = new Uint8Array(n);
    this.slotOf = new Int16Array(n * 3).fill(-1);
    this.colMade = new Int32Array(n);
    this.colRemoving = new Uint8Array(n);
    this.bodies = city.chunks.map(() => []);
    // Always-drawn layers.
    for (const r of city.far) {
      const m = bakeStatic(r, lit, Quality.shadows, true);
      if (m) {
        root.add(m);
        this.farMeshes.push(m);
      }
    }
    this.flatMesh = bakeStatic(city.flat, lit, false, true);
    if (this.flatMesh) root.add(this.flatMesh);
    // Slot pools sized for the biggest chunk of each layer.
    const pick = (c: ChunkRecipes, l: number): Recipe => (l === 0 ? c.lit : l === 1 ? c.deco : c.glow);
    this.layers = [0, 1, 2].map((l) => {
      let v = 0;
      let i = 0;
      for (const c of city.chunks) {
        v = Math.max(v, pick(c, l).verts);
        i = Math.max(i, pick(c, l).indices);
      }
      const out: Slot[] = [];
      for (let s = 0; s < STREAM.slots; s++) {
        const slot = new Slot(v, i, l === 2 ? glow : lit, l === 0 && Quality.shadows, l !== 2);
        root.add(slot.mesh);
        out.push(slot);
      }
      return out;
    });
    for (const c of city.chunks) for (const s of c.solids) if (s.shape === 'hull' && s.hull) this.hulls.set(s, new Float32Array(s.hull));
    for (const s of city.globalSolids) this.make(s);
  }

  /** Capacity of one slot per layer (vertices), for the report. */
  get slotCapacity(): number[] {
    return this.layers.map((l) => l[0].capVerts);
  }

  private recipe(c: number, l: number): Recipe {
    const ch = this.city.chunks[c];
    return l === 0 ? ch.lit : l === 1 ? ch.deco : ch.glow;
  }

  private measure(px: number, pz: number): void {
    const ch = this.city.chunks;
    for (let i = 0; i < this.n; i++) {
      const r = ch[i].rect;
      const dx = Math.max(r[0] - px, 0, px - r[1]);
      const dz = Math.max(r[2] - pz, 0, pz - r[3]);
      this.dist[i] = Math.sqrt(dx * dx + dz * dz);
    }
  }

  /** Per rendered frame. */
  update(px: number, pz: number): void {
    this.measure(px, pz);
    this.updateVisuals();
    this.updateColliders();
  }

  // ---- Visuals ------------------------------------------------------------------------------------------------------------

  private freeSlot(l: number): number {
    const s = this.layers[l];
    for (let k = 0; k < s.length; k++) if (s[k].owner < 0) return k;
    return -1;
  }

  private dropVisual(c: number): void {
    for (let l = 0; l < 3; l++) {
      const k = this.slotOf[c * 3 + l];
      if (k >= 0) this.layers[l][k].release();
      this.slotOf[c * 3 + l] = -1;
    }
    if (this.vis[c] === SHOWN) this.stats.visUnloads++;
    this.vis[c] = NONE;
  }

  private updateVisuals(): void {
    const d = this.dist;
    for (let c = 0; c < this.n; c++) if (this.vis[c] !== NONE && d[c] > STREAM.visOut) this.dropVisual(c);
    // Start the nearest wanted chunk (one new start per frame).
    let want = -1;
    for (let c = 0; c < this.n; c++) if (this.vis[c] === NONE && d[c] < STREAM.visIn && (want < 0 || d[c] < d[want])) want = c;
    if (want >= 0) {
      if (this.freeSlot(0) < 0 || this.freeSlot(1) < 0 || this.freeSlot(2) < 0) {
        // Pool full: evict the farthest chunk outside the load radius (there always is one: the load set is <= 9 chunks).
        let far = -1;
        for (let c = 0; c < this.n; c++) if (this.vis[c] !== NONE && d[c] >= STREAM.visIn && (far < 0 || d[c] > d[far])) far = c;
        if (far >= 0) this.dropVisual(far);
      }
      if (this.freeSlot(0) >= 0 && this.freeSlot(1) >= 0 && this.freeSlot(2) >= 0) {
        for (let l = 0; l < 3; l++) {
          const k = this.freeSlot(l);
          this.layers[l][k].begin(this.recipe(want, l), want);
          this.slotOf[want * 3 + l] = k;
        }
        this.vis[want] = LOADING;
      }
    }
    // Expand: nearest loading chunk first, within the vertex budget.
    let budget: number = STREAM.vertsPerFrame;
    while (budget > 0) {
      let c = -1;
      for (let i = 0; i < this.n; i++) if (this.vis[i] === LOADING && (c < 0 || d[i] < d[c])) c = i;
      if (c < 0) break;
      let done = true;
      for (let l = 0; l < 3 && budget > 0; l++) {
        const slot = this.layers[l][this.slotOf[c * 3 + l]];
        if (!slot.done) budget -= slot.step(budget);
        if (!slot.done) done = false;
      }
      if (done) {
        this.vis[c] = SHOWN;
        this.stats.visLoads++;
      } else break;
    }
    let loaded = 0;
    let loading = 0;
    let tris = 0;
    for (let c = 0; c < this.n; c++) {
      if (this.vis[c] === SHOWN) {
        loaded++;
        for (let l = 0; l < 3; l++) tris += this.recipe(c, l).indices / 3;
      } else if (this.vis[c] === LOADING) loading++;
    }
    this.stats.visLoaded = loaded;
    this.stats.visLoading = loading;
    this.stats.chunkTris = tris;
    this.stats.maxVisLoaded = Math.max(this.stats.maxVisLoaded, loaded + loading);
  }

  /** Finish every visual job now (tests, first frame). */
  flushVisuals(px: number, pz: number): void {
    this.measure(px, pz);
    for (let guard = 0; guard < 64; guard++) {
      this.updateVisuals();
      let pending = false;
      for (let c = 0; c < this.n; c++) if (this.vis[c] === LOADING || (this.vis[c] === NONE && this.dist[c] < STREAM.visIn)) pending = true;
      if (!pending) break;
    }
  }

  // ---- Colliders ---------------------------------------------------------------------------------------------------------------

  private make(s: Solid): RAPIER.RigidBody | null {
    const p = this.physics;
    const c = { x: s.c[0], y: s.c[1], z: s.c[2] };
    if (s.shape === 'box') return p.addFixedCuboid({ x: s.s[0] / 2, y: s.s[1] / 2, z: s.s[2] / 2 }, c).body;
    if (s.shape === 'cyl') return p.addFixedCylinder(s.s[1] / 2, s.s[0] / 2, c).body;
    const pts = this.hulls.get(s) ?? new Float32Array(s.hull ?? []);
    const h = p.addFixedConvexHull(pts);
    if (!h) console.warn(`kota: no hull collider for "${s.id}"`);
    return h ? h.body : null;
  }

  private colComplete(c: number): boolean {
    return this.colRemoving[c] === 0 && this.colMade[c] >= this.city.chunks[c].solids.length;
  }

  /** Create up to `max` colliders of chunk c. Returns how many were created. */
  private build(c: number, max: number): number {
    const list = this.city.chunks[c].solids;
    const bodies = this.bodies[c];
    if (this.colRemoving[c]) {
      // It was being removed: keep what is left and continue from there.
      this.colRemoving[c] = 0;
    }
    const wasEmpty = this.colMade[c] === 0;
    let made = 0;
    while (this.colMade[c] < list.length && made < max) {
      bodies.push(this.make(list[this.colMade[c]]));
      this.colMade[c]++;
      made++;
    }
    if (wasEmpty && made > 0) this.stats.colLoads++;
    return made;
  }

  private remove(c: number, max: number): number {
    const bodies = this.bodies[c];
    let n = 0;
    while (bodies.length && n < max) {
      const b = bodies.pop();
      if (b) this.physics.removeBody(b);
      n++;
    }
    this.colMade[c] = bodies.length;
    if (bodies.length === 0) {
      this.colRemoving[c] = 0;
      this.stats.colUnloads++;
    }
    return n;
  }

  private updateColliders(): void {
    const d = this.dist;
    // Removals first (frees the broad phase), farthest first.
    let removeBudget: number = STREAM.removalsPerFrame;
    for (let c = 0; c < this.n && removeBudget > 0; c++) {
      if (this.colMade[c] > 0 && d[c] > STREAM.colOut) {
        this.colRemoving[c] = 1;
        removeBudget -= this.remove(c, removeBudget);
      }
    }
    let budget: number = STREAM.collidersPerFrame;
    while (budget > 0) {
      let c = -1;
      for (let i = 0; i < this.n; i++) if (!this.colComplete(i) && d[i] < STREAM.colIn && (c < 0 || d[i] < d[c])) c = i;
      if (c < 0) break;
      budget -= this.build(c, budget);
    }
    this.countColliders();
  }

  private countColliders(): void {
    let loaded = 0;
    let bodies = 0;
    for (let c = 0; c < this.n; c++) {
      if (this.colMade[c] > 0) loaded++;
      bodies += this.colMade[c];
    }
    this.stats.colLoaded = loaded;
    this.stats.colBodies = bodies;
    this.stats.maxColBodies = Math.max(this.stats.maxColBodies, bodies);
  }

  /**
   * Safety net, every fixed step: chunks within `colSafe` m of (px, pz) get all their colliders NOW. Returns true when it
   * created any (the caller must refresh the scene queries before the player moves).
   */
  ensureNear(px: number, pz: number, radius: number = STREAM.colSafe): boolean {
    const ch = this.city.chunks;
    let made = 0;
    for (let c = 0; c < this.n; c++) {
      if (this.colComplete(c)) continue;
      const r = ch[c].rect;
      const dx = Math.max(r[0] - px, 0, px - r[1]);
      const dz = Math.max(r[2] - pz, 0, pz - r[3]);
      if (dx * dx + dz * dz > radius * radius) continue;
      made += this.build(c, 1 << 30);
    }
    if (made > 0) {
      this.stats.syncLoads++;
      this.countColliders();
    }
    return made > 0;
  }

  /** True when every chunk within `radius` of the point has all its colliders. */
  collidersReady(px: number, pz: number, radius: number): boolean {
    const ch = this.city.chunks;
    for (let c = 0; c < this.n; c++) {
      const r = ch[c].rect;
      const dx = Math.max(r[0] - px, 0, px - r[1]);
      const dz = Math.max(r[2] - pz, 0, pz - r[3]);
      if (dx * dx + dz * dz <= radius * radius && !this.colComplete(c)) return false;
    }
    return true;
  }

  /** Chunk state strings for tests: 'v' shown visual, 'l' loading, 'c' colliders, per chunk index. */
  chunkState(c: number): { vis: number; colliders: number; dist: number } {
    return { vis: this.vis[c], colliders: this.colMade[c], dist: this.dist[c] };
  }
}
