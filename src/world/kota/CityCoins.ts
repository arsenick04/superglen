import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { CITY, CHUNKS, chunkIndex } from './CityData';
import type { CityCoin } from './CityPlaces';

const COIN_R = 0.3;
/** A coin is taken inside this horizontal radius and from feet - 0.3 m to feet + 1.7 m (same as the street coins). */
const TAKE_R = 0.95;
const FEET = 0.55;

/**
 * The gold coins of Kota Botanica (about 200, see CityPlaces): same look, pickup and rising-pitch sound as the street coins of
 * Chapter 1 and the same coin counter on the screen (the quiz coins: one more coin per pickup).
 *
 * STREAMING: coins are bucketed by city chunk; only the coins of the 3 x 3 chunks around the player are in the ONE instanced mesh
 * (`mesh.count`), rewritten straight into the instance buffer each frame (no objects created). The visible list is rebuilt only
 * when the player changes chunk or takes a coin. Taken coins are saved (`save.data.city.coins`) and never come back.
 */
export class CityCoins {
  /** Coins taken in total (all sessions) and the number of coins in the city. */
  taken = 0;
  readonly total: number;
  /** Taken in this session (tests). */
  takenNow = 0;
  private readonly mesh: THREE.InstancedMesh;
  private readonly geo: THREE.CylinderGeometry;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly gone: Uint8Array;
  private readonly group: Int32Array;
  private readonly left: Int32Array;
  private readonly size: Int32Array;
  private readonly ids: string[];
  private readonly byChunk: Int32Array[];
  private readonly vis: Int32Array;
  private nVis = 0;
  private curChunk = -1;
  private t = 0;
  private streak = 0;
  private streakT = 0;

  constructor(
    private readonly ctx: LevelContext,
    coins: readonly CityCoin[],
  ) {
    const n = coins.length;
    this.total = n;
    this.ids = coins.map((c) => c.id);
    this.px = Float32Array.from(coins, (c) => c.x);
    this.py = Float32Array.from(coins, (c) => c.y);
    this.pz = Float32Array.from(coins, (c) => c.z);
    this.gone = new Uint8Array(n);
    const groups: string[] = [];
    this.group = new Int32Array(n);
    coins.forEach((c, i) => {
      const key = c.id.split('.')[0];
      let g = groups.indexOf(key);
      if (g < 0) g = groups.push(key) - 1;
      this.group[i] = g;
    });
    this.left = new Int32Array(groups.length);
    this.size = new Int32Array(groups.length);
    const saved = new Set(ctx.save.data.city.coins);
    for (let i = 0; i < n; i++) {
      this.size[this.group[i]]++;
      if (saved.has(this.ids[i])) {
        this.gone[i] = 1;
        this.taken++;
      } else this.left[this.group[i]]++;
    }
    const lists: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
    coins.forEach((c, i) => lists[c.chunk].push(i));
    this.byChunk = lists.map((l) => Int32Array.from(l));
    let cap = 1;
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x >= 0 && z >= 0 && x < CHUNKS && z < CHUNKS) sum += this.byChunk[z * CHUNKS + x].length;
        }
        cap = Math.max(cap, sum);
      }
    }
    this.vis = new Int32Array(cap);
    this.geo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.08, 8);
    this.geo.rotateX(Math.PI / 2);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa300, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.3 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = 1; // one instance at build time so the shader program is compiled with the level (then count follows the player)
    ctx.root.add(this.mesh);
    this.rebuild(ctx.player.position.x, ctx.player.position.z);
    ctx.onDispose(() => {
      this.geo.dispose();
      this.mat.dispose();
      this.mesh.dispose();
    });
  }

  /** Coins as `{ id, x, y, z, gone }` (tests). */
  list(): { id: string; x: number; y: number; z: number; gone: boolean }[] {
    return this.ids.map((id, i) => ({ id, x: this.px[i], y: this.py[i], z: this.pz[i], gone: this.gone[i] === 1 }));
  }

  /** The coins in view of the player's 3 x 3 chunks (visible count, tests). */
  get visible(): number {
    return this.nVis;
  }

  private rebuild(x: number, z: number): void {
    const cx = Math.max(0, Math.min(CHUNKS - 1, Math.floor((x + CITY.half) / CITY.chunk)));
    const cz = Math.max(0, Math.min(CHUNKS - 1, Math.floor((z + CITY.half) / CITY.chunk)));
    this.curChunk = chunkIndex(x, z);
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const a = cx + dx;
        const b = cz + dz;
        if (a < 0 || b < 0 || a >= CHUNKS || b >= CHUNKS) continue;
        const list = this.byChunk[b * CHUNKS + a];
        for (let k = 0; k < list.length; k++) if (!this.gone[list[k]]) this.vis[n++] = list[k];
      }
    }
    this.nVis = n;
  }

  /** Per fixed step: take the coins within reach and keep the visible set in step with the player's chunk. */
  fixedUpdate(dt: number): void {
    const p = this.ctx.player.position;
    this.streakT -= dt;
    if (this.streakT <= 0) this.streak = 0;
    if (chunkIndex(p.x, p.z) !== this.curChunk) this.rebuild(p.x, p.z);
    const fx = p.x;
    const fy = p.y - FEET;
    const fz = p.z;
    let took = false;
    for (let k = 0; k < this.nVis; k++) {
      const i = this.vis[k];
      const dy = this.py[i] - fy;
      if (dy < -0.3 || dy > 1.7) continue;
      const dx = this.px[i] - fx;
      const dz = this.pz[i] - fz;
      if (dx * dx + dz * dz > TAKE_R * TAKE_R) continue;
      this.take(i);
      took = true;
    }
    if (took) this.rebuild(p.x, p.z);
  }

  private take(i: number): void {
    const { ctx } = this;
    this.gone[i] = 1;
    this.taken++;
    this.takenNow++;
    ctx.save.takeCityCoin(this.ids[i]);
    ctx.quiz.coinsChanged();
    ctx.fx.sparkles.burst(this.px[i], this.py[i], this.pz[i], 8, 2.4, 0xffd23f, { gravity: 2, life: 0.6, up: 0.8 });
    ctx.synth.drum(Math.min(4, this.streak), false);
    ctx.sfx.coin();
    const g = this.group[i];
    if (--this.left[g] === 0 && this.size[g] > 1) ctx.sfx.coinDone(); // the last coin of a trail: a sparkly flourish
    this.streak++;
    this.streakT = 1.5;
  }

  /** Per rendered frame: spin and bob the coins in view (written straight into the instance buffer). */
  update(dt: number): void {
    this.t += dt;
    const a = this.mesh.instanceMatrix.array as Float32Array;
    const c = Math.cos(this.t * 2.6);
    const s = Math.sin(this.t * 2.6);
    const n = this.nVis;
    for (let k = 0; k < n; k++) {
      const i = this.vis[k];
      const o = k * 16;
      a[o] = c;
      a[o + 1] = 0;
      a[o + 2] = -s;
      a[o + 3] = 0;
      a[o + 4] = 0;
      a[o + 5] = 1;
      a[o + 6] = 0;
      a[o + 7] = 0;
      a[o + 8] = s;
      a[o + 9] = 0;
      a[o + 10] = c;
      a[o + 11] = 0;
      a[o + 12] = this.px[i];
      a[o + 13] = this.py[i] + Math.sin(this.t * 3 + i * 0.7) * 0.06;
      a[o + 14] = this.pz[i];
      a[o + 15] = 1;
    }
    this.mesh.count = Math.max(1, n); // never 0: three would still need the program compiled at level start
    if (n === 0) a.fill(0, 0, 16); // the one spare instance is a zero matrix: invisible
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
