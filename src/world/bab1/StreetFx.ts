import * as THREE from 'three';
import { Parkour } from '../../config/parkour';
import type { LevelContext } from '../Level';
import { makeStarGeometry, Reward } from '../arena/Reward';
import type { Sparkles } from './Fx';
import { STREET_REACH } from './StreetData';

const GOLD = 0xffc400;
const COIN_R = 0.3;
/** A coin is taken inside this horizontal radius and from feet - 0.3 m to feet + 1.7 m. */
const TAKE_R = 0.95;

/**
 * The gold guide coins and the two big stars of the street (school roof, Barongsai tower), all taken from
 * `StreetData` (coins are only where the checker proved they can be reached).
 *
 *  - all coins are ONE InstancedMesh (one draw call). They spin together and bob a little: the per-frame work writes the
 *    matrices of the coins that are still there straight into the instance buffer (no objects created)
 *  - taking a coin pops a few sparkles and plays the next pentatonic drum note of the streak (a streak ends 1.5 s after the last one)
 *  - the stars are the arena's `Reward`: the tower star is big, with the fanfare
 */
export class StreetFx {
  /** Coins taken so far (tests read it). */
  taken = 0;
  readonly total: number;
  private readonly mesh: THREE.InstancedMesh;
  private readonly geo: THREE.CylinderGeometry;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly gone: Uint8Array;
  private readonly ids: string[] = [];
  private t = 0;
  /** Ids of the coins taken so far (tests). */
  private readonly takenIds: string[] = [];
  private published = 0;
  private streak = 0;
  private streakT = 0;
  private readonly rewards: Reward[] = [];
  private readonly starGeo = makeStarGeometry();
  private readonly starMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa300, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.2 });
  private readonly fanfare: { t: number; level: number }[] = [];
  private readonly feet = new THREE.Vector3();
  /** Route (building / landmark prefix of the coin id) of each coin, and how many coins of each route are still lying there. */
  private readonly route: Int32Array;
  private readonly left: Int32Array;

  constructor(
    private readonly ctx: LevelContext,
    private readonly sparkles: Sparkles,
  ) {
    const coins = STREET_REACH.coins.filter((c) => !c.id.endsWith(':star'));
    this.total = coins.length;
    this.px = new Float32Array(coins.length);
    this.py = new Float32Array(coins.length);
    this.pz = new Float32Array(coins.length);
    this.gone = new Uint8Array(coins.length);
    this.geo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.08, 14);
    this.geo.rotateX(Math.PI / 2); // a standing disc (faces +z), spun about the vertical axis
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa300, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.3 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, coins.length));
    this.mesh.frustumCulled = false; // the instances lie all over the street
    this.mesh.castShadow = false;
    this.route = new Int32Array(coins.length);
    const routeIds: string[] = [];
    coins.forEach((c, i) => {
      const key = c.id.split(':')[0];
      let r = routeIds.indexOf(key);
      if (r < 0) r = routeIds.push(key) - 1;
      this.route[i] = r;
      this.px[i] = c.pos[0];
      this.py[i] = c.pos[1];
      this.pz[i] = c.pos[2];
      this.ids.push(c.id);
    });
    this.left = new Int32Array(routeIds.length);
    for (let i = 0; i < coins.length; i++) this.left[this.route[i]]++;
    ctx.root.add(this.mesh);
    this.writeMatrices();

    // Stars: school roof (small) and the Barongsai tower (big).
    for (const c of STREET_REACH.coins.filter((q) => q.id.endsWith(':star'))) {
      const big = c.id === 'lm:star';
      const size = big ? 1.0 : 0.55;
      const id = big ? 'landmark' : 'school';
      const r = new Reward(ctx.root, this.starGeo, this.starMat, id, c.pos[0], c.pos[1] - 0.3, c.pos[2], size, (rw) => this.onReward(rw));
      this.rewards.push(r);
      sparkles.addEmitter(c.pos[0], r.y, c.pos[2], size * 1.2, 6, 0xffd23f);
    }
    ctx.onDispose(() => {
      this.geo.dispose();
      this.mat.dispose();
      this.mesh.dispose();
      this.starGeo.dispose();
      this.starMat.dispose();
    });
  }

  /** Ids of the coins (the smoke test finds the ones on a route by prefix). */
  coinIds(): readonly string[] {
    return this.ids;
  }

  /** Positions of the coins still lying there, as `id x y z` (tests). */
  coinPositions(): { id: string; x: number; y: number; z: number; gone: boolean }[] {
    return this.ids.map((id, i) => ({ id, x: this.px[i], y: this.py[i], z: this.pz[i], gone: this.gone[i] === 1 }));
  }

  private onReward(r: Reward): void {
    const big = r.size > 0.8;
    this.sparkles.burst(r.x, r.y, r.z, big ? 60 : 24, big ? 5 : 3.5, -1, { gravity: 2, life: 1.4, up: 0.6 });
    this.ctx.fx.rings.spawn(r.x, r.baseY, r.z, big ? 3.5 : 2, 0.7, GOLD, 0.9);
    const notes = big ? [0, 1, 2, 3, 4, 4] : [0, 2, 4];
    notes.forEach((lv, i) => this.fanfare.push({ t: i * 0.11, level: lv }));
  }

  private writeMatrices(): void {
    const a = this.mesh.instanceMatrix.array as Float32Array;
    const c = Math.cos(this.t * 2.6);
    const s = Math.sin(this.t * 2.6);
    for (let i = 0; i < this.px.length; i++) {
      const o = i * 16;
      if (this.gone[i]) {
        a[o] = a[o + 2] = a[o + 8] = a[o + 10] = 0; // zero scale: invisible
        a[o + 5] = 0;
      } else {
        a[o] = c;
        a[o + 2] = -s;
        a[o + 5] = 1;
        a[o + 8] = s;
        a[o + 10] = c;
      }
      a[o + 1] = a[o + 3] = a[o + 4] = a[o + 6] = a[o + 7] = a[o + 9] = a[o + 11] = 0;
      a[o + 12] = this.px[i];
      a[o + 13] = this.py[i] + Math.sin(this.t * 3 + i * 0.7) * 0.06;
      a[o + 14] = this.pz[i];
      a[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Per rendered frame: take coins and stars near the player, spin, play the star fanfare. */
  update(dt: number): void {
    this.t += dt;
    this.ctx.player.getFeetPosition(this.feet);
    const fx = this.feet.x;
    const fy = this.feet.y;
    const fz = this.feet.z;
    this.streakT -= dt;
    if (this.streakT <= 0) this.streak = 0;
    for (let i = 0; i < this.px.length; i++) {
      if (this.gone[i]) continue;
      const dy = this.py[i] - fy;
      if (dy < -0.3 || dy > 1.7) continue;
      const dx = this.px[i] - fx;
      const dz = this.pz[i] - fz;
      if (dx * dx + dz * dz > TAKE_R * TAKE_R) continue;
      this.gone[i] = 1;
      this.taken++;
      this.takenIds.push(this.ids[i]);
      this.sparkles.burst(this.px[i], this.py[i], this.pz[i], 8, 2.4, 0xffd23f, { gravity: 2, life: 0.6, up: 0.8 });
      this.ctx.synth.drum(Math.min(4, this.streak), false);
      this.ctx.sfx.coin();
      if (--this.left[this.route[i]] === 0) this.ctx.sfx.coinDone(); // the last coin of a route: a sparkly flourish
      this.streak++;
      this.streakT = 1.5;
    }
    this.writeMatrices();

    const W = Parkour.world;
    for (const r of this.rewards) {
      r.tick(fx, fy, fz, W.rewardRadius * Math.max(1, r.size), W.rewardWindow);
      r.animate(dt);
    }
    for (let i = this.fanfare.length - 1; i >= 0; i--) {
      const f = this.fanfare[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.ctx.synth.drum(f.level, true);
        this.fanfare.splice(i, 1);
      }
    }
    const info = this.ctx.game.debugInfo;
    info.streetCoins = this.taken;
    if (this.takenIds.length !== this.published) {
      this.published = this.takenIds.length;
      info.streetTaken = this.takenIds.join(',');
    }
    for (const r of this.rewards) info[`reward_${r.id}`] = r.count;
  }
}
