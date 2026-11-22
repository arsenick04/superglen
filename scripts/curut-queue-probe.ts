import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MarketRats } from '../src/world/kota/MarketRats';
import { Targets } from '../src/gameplay/Targets';
import { Projectiles } from '../src/gameplay/Projectiles';
import { Combat } from '../src/config/combat';
import type { LevelContext } from '../src/world/Level';
import type { StompListener } from '../src/player/Player';
import type { HeadStompSurface } from '../src/player/HeadStomp';

const noop = () => {};
const targets = new Targets();
const root = new THREE.Group();
const tamed = [0, 2]; // deliberately noncontiguous saved progress
const canceled: THREE.Vector3[] = [];
const cleanups: (() => void)[] = [];
let stomp!: StompListener;
let head!: HeadStompSurface;
const ctx = {
  root, targets,
  player: { position: new THREE.Vector3(0, 0.55, 0), visualPosition: new THREE.Vector3(),
    onStomp: (fn: StompListener) => { stomp = fn; },
    registerHeadStomp: (surface: HeadStompSurface) => { head = surface; return noop; } },
  save: { data: { settings: { easyFight: false } } },
  game: { controlsEnabled: true }, dialog: { blocking: false }, health: { resting: false }, cameraRig: { yaw: 0 },
  synth: { boing: noop }, sfx: { pop: noop, blip: noop },
  fx: { stars: { show: noop }, sparkles: { burst: noop }, flashes: { spawn: noop } },
  projectiles: { clearFrom: (owner: THREE.Vector3) => canceled.push(owner) },
  onDispose: (fn: () => void) => cleanups.push(fn),
} as unknown as LevelContext;
const rats = new MarketRats(ctx, { onTamed: (i) => tamed.push(i), onCollect: noop }, tamed, undefined, true, true);
rats.muted = true;
assert.deepEqual(rats.list().filter((r) => r.active).map((r) => r.i), [1]);
assert.equal(targets.list.filter((t) => t.enabled).length, 1);
const queued = rats.list()[3];
rats.hit(3); rats.tame(3); rats.forceAttack(3, 0);
assert.deepEqual(rats.list()[3], queued, 'queued Curut cannot be damaged, tamed or forced to attack');
assert.equal(head.contactTime({ x: queued.x, y: 2, z: queued.z }, { x: queued.x, y: 0, z: queued.z }), Infinity);
const bodies = root.children[0] as THREE.InstancedMesh;
const foods = root.children[1] as THREE.InstancedMesh;
const matrix = new THREE.Matrix4();
for (const mesh of [bodies, foods]) {
  mesh.getMatrixAt(3, matrix);
  assert.equal(matrix.determinant(), 0, 'queued bodies and carried food have no visible geometry');
}
stomp({ x: 93, y: 0, z: 0, radius: 1000, impact: 10 });
assert.equal(rats.list()[1].hp, Combat.rat.hp - 1, 'area stomp still hits the active rat');
assert.equal(rats.list()[3].hp, Combat.rat.hp, 'area stomp cannot hit a queued rat');
for (const i of [1, 3, 4, 5, 6]) {
  assert.deepEqual(rats.list().filter((r) => r.active).map((r) => r.i), [i]);
  while (rats.list()[i].active) rats.hit(i);
  assert.equal(rats.list().filter((r) => r.active).length, 0, 'respite has no hostile rat');
  rats.fixedUpdate(Combat.rat.nextDelay / 2);
  assert.equal(targets.list.filter((t) => t.enabled).length, 0);
  rats.fixedUpdate(Combat.rat.nextDelay / 2);
  rats.update(0);
  bodies.getMatrixAt(i, matrix);
  assert.equal(matrix.determinant(), 0, 'old tamed rat leaves before its successor appears');
}
assert.equal(rats.allTamed, true);
assert.equal(rats.remaining, 0);
assert.deepEqual(tamed.sort(), [0, 1, 2, 3, 4, 5, 6]);
assert.equal(canceled.length, 5);
for (const cleanup of cleanups) cleanup();

// Exercise production cancellation without WebGL: pointer identity isolates the owner's pooled shots.
const owner = new THREE.Vector3();
const other = new THREE.Vector3();
const pool = [owner, owner, other].map((liveHome) => ({ active: true, liveHome }));
const canceledShots: object[] = [];
Projectiles.prototype.clearFrom.call({ pool, retire: (shot: typeof pool[number]) => { shot.active = false; canceledShots.push(shot); } } as unknown as Projectiles, owner);
assert.deepEqual(pool.map((p) => p.active), [false, false, true]);
assert.equal(canceledShots.length, 2);
assert.equal(Combat.rakus.helpers.max, 1);
assert.equal(Combat.rakus.helpers.perWave, 1);
console.log('Curut queue probe passed: saved identities, visibility, damage exclusion, handoff, completion, and scoped shot cancellation.');
