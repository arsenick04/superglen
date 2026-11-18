import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat } from '../src/config/combat';
import { startGate } from '../src/core/StartGate';
import { Targets } from '../src/gameplay/Targets';
import { MARKET } from '../src/world/kota/Bab3Data';
import { districtAt } from '../src/world/kota/CityData';
import { marketBattleSpawn } from '../src/world/progress';
import type { LevelContext } from '../src/world/Level';
import type { HeadStompSurface } from '../src/player/HeadStomp';
import type { StompEvent } from '../src/player/Player';

const noop = () => {};
Object.defineProperty(globalThis, 'document', { value: { documentElement: { classList: { add: noop } } }, configurable: true });
Object.defineProperty(globalThis, 'window', { value: { location: { search: '' } }, configurable: true });
const { Chapter3 } = await import('../src/world/kota/Chapter3');
const { Chapter5 } = await import('../src/world/kota/Chapter5');
const { Chapter6 } = await import('../src/world/kota/Chapter6');
const { MarketRats } = await import('../src/world/kota/MarketRats');
const { SnakeBoss } = await import('../src/world/kota/SnakeBoss');
const { RakusBoss } = await import('../src/world/kota/RakusBoss');
startGate.start();

// Real city-rat geometry/targets and hit callbacks, with render/audio/physics services stubbed out.
const groundStomps: ((e: StompEvent) => void)[] = [];
const heads: HeadStompSurface[] = [];
const cleanups: (() => void)[] = [];
const targets = new Targets();
const ctx = {
  root: new THREE.Group(), targets,
  save: { data: { settings: { easyFight: false } } },
  player: {
    position: new THREE.Vector3(MARKET.hub.x, 0.55, MARKET.hub.z),
    onStomp: (cb: (e: StompEvent) => void) => groundStomps.push(cb),
    registerHeadStomp: (surface: HeadStompSurface) => { heads.push(surface); return noop; },
  },
  cameraRig: { yaw: 0 }, game: { controlsEnabled: true },
  health: { resting: false }, dialog: { blocking: false },
  projectiles: { clearFrom: noop },
  synth: { boing: noop }, sfx: { pop: noop, blip: noop },
  fx: { stars: { show: noop }, sparkles: { burst: noop }, flashes: { spawn: noop } },
  onDispose: (cb: () => void) => cleanups.push(cb),
};
const rats = new MarketRats(ctx as unknown as LevelContext, { onTamed: noop, onCollect: noop }, []);
rats.setCombatEnabled(false);
const before = rats.list().map((r) => r.hp);
assert.ok(targets.list.every((t) => !t.enabled), 'city staging cannot be laser-targeted');
const target = targets.list[0];
target.onHit({ target, x: 0, y: 0, z: 0, dirX: 0, dirY: 0, dirZ: 1, distance: 0 });
rats.hit(0);
rats.tame(0);
rats.forceAttack(0, 0);
groundStomps[0]({ x: MARKET.hub.x, y: 0, z: 0, radius: 100, impact: 10 });
assert.equal(heads[0].contactTime({ x: 93, y: 10, z: 0 }, { x: 93, y: -1, z: 0 }), Infinity);
for (let i = 0; i < 180; i++) rats.fixedUpdate(1 / 60);
assert.deepEqual(rats.list().map((r) => r.hp), before, 'laser, direct hit, tame and stomp cannot change staging health');
assert.equal(rats.combatCounts().attacks, 0, 'staging rats never attack before the transition');
assert.equal(rats.stomps, 0);
rats.setCombatEnabled(true);
assert.ok(targets.list.every((t) => t.enabled), 'explicit city-mechanics override restores targets');
target.onHit({ target, x: 0, y: 0, z: 0, dirX: 0, dirY: 0, dirZ: 1, distance: 0 });
assert.equal(rats.list()[0].hp, before[0] - 1, 'city-mechanics override still exercises ordinary hits');
for (const cleanup of cleanups.reverse()) cleanup();

// Exercise actual chapter methods without constructing their unrelated story/DOM services.
let cityTicks = 0;
let loads = 0;
const entryCtx = {
  player: { position: new THREE.Vector3(49.99, 0.55, 100) },
  health: { resting: false },
  game: { controlsEnabled: true, loadLevel: (id: string) => { assert.equal(id, 'battle-curut'); loads++; entryCtx.game.controlsEnabled = false; return Promise.resolve(); } },
};
const ch3 = Object.assign(Object.create(Chapter3.prototype), {
  ctx: entryCtx, over: false, disposed: false, step: 'chase', arrived: false,
  arenaEnabled: true, arenaLoading: false, rats: { fixedUpdate: () => cityTicks++ },
});
ch3.fixedUpdate();
assert.equal(loads, 0, 'outside the visible Pasar district stays in the city');
entryCtx.player.position.x = 50;
ch3.fixedUpdate();
assert.equal(loads, 1, 'the boundary triggers even before arrived or any rat proximity check');
assert.equal(cityTicks, 1, 'transition begins before ticking city rats');
assert.equal(entryCtx.game.controlsEnabled, false, 'load locks controls before later laser/player phases');
ch3.fixedUpdate();
assert.equal(loads, 1, 'pending entry cannot load twice');
const retreat = marketBattleSpawn('chase');
assert.notEqual(districtAt(retreat.x, retreat.z).id, 'pasar', 'retreat spawns outside the district to prevent a return loop');
entryCtx.player.position.set(retreat.x, retreat.y + 0.55, retreat.z);
entryCtx.game.controlsEnabled = true;
ch3.arenaLoading = false;
ch3.fixedUpdate();
assert.equal(loads, 1, 'retreat does not immediately start the fight again');
const won = marketBattleSpawn('count');
assert.equal(districtAt(won.x, won.z).id, 'pasar', 'victory returns inside Pasar for the food-counting story');
entryCtx.player.position.set(won.x, won.y + 0.55, won.z);
ch3.step = 'count';
ch3.arrived = true;
ch3.fixedUpdate();
assert.equal(loads, 1, 'the completed chase never reenters battle during counting');

for (const [Chapter, config] of [[Chapter5, Combat.snake], [Chapter6, Combat.rakus]] as const) {
  let entries = 0;
  let storyQueued = false;
  const boss = { x: 0, z: 0, cx: 0, cz: 0, enabled: false, setEnabled(on: boolean) { this.enabled = on; }, showHud: noop, fixedUpdate: noop };
  const helpers = { enabled: false, fixedUpdate: noop, clear: noop };
  const context = {
    player: { position: new THREE.Vector3(config.areaEntryRadius, 0.55, 0), mode: 'superglen' },
    health: { resting: false, exhaustions: 0 },
    game: { controlsEnabled: true, debugInfo: {}, setTransformAllowed: noop, setControlsEnabled(on: boolean) { this.controlsEnabled = on; } },
    objectives: { clear: noop },
    dialog: { say: noop },
    battle: { entering: true, active: false, enter() { assert.equal(boss.enabled, false); entries++; this.active = true; }, exit() { this.active = false; } },
    seq: { run: () => { storyQueued = true; } },
  };
  const chapter = Object.assign(Object.create(Chapter.prototype), {
    ctx: context, over: false, disposed: false, step: 'city', clock: 0, lastExh: 0,
    boss, helpers, beamTick: 0, engaged: false, introScene: false, tamedScene: false,
  });
  chapter.fixedUpdate();
  assert.equal(entries, 1);
  assert.equal(context.battle.active, true, 'battle is visible before the story task/dialogue starts');
  assert.equal(storyQueued, true);
  assert.equal(boss.enabled, false, 'story intro cannot expose attack targets');
  chapter.step = 'fight';
  chapter.introScene = false;
  context.game.controlsEnabled = true;
  chapter.fixedUpdate();
  assert.equal(boss.enabled, false, 'finishing dialogue cannot bypass the remaining visual entrance');
  context.battle.entering = false;
  chapter.fixedUpdate();
  assert.equal(boss.enabled, true, 'combat activates only after both entrance and story');
  context.player.position.x = config.areaExitRadius + 1;
  chapter.fixedUpdate();
  assert.equal(boss.enabled, false);
  context.player.position.x = config.areaEntryRadius;
  context.battle.entering = true;
  chapter.fixedUpdate();
  assert.equal(entries, 2);
  assert.equal(boss.enabled, false, 'reentry repeats the visual entrance gate');
}

// A paused existing attack must not advance to a hit while its battle entrance runs.
const snake = Object.assign(Object.create(SnakeBoss.prototype), {
  disposed: false, enabled: false, phase: 'lunge', t: 0, squash: 0, timer: 0,
  ctx: { player: { position: new THREE.Vector3() } },
});
snake.fixedUpdate(1);
assert.equal(snake.timer, 0);
snake.laserHit({}); // disabled direct callbacks also cannot damage or emit a hint
const rakus = Object.assign(Object.create(RakusBoss.prototype), {
  disposed: false, enabled: false, phase: 'hop', t: 0, squash: 0, timer: 0, level: 0, lvlVis: 0,
  C: Combat.rakus, alive: [], waveT: 0, ctx: { player: { position: new THREE.Vector3() } },
});
rakus.fixedUpdate(1);
assert.equal(rakus.timer, 0);
assert.equal(rakus.waveT, 0);
rakus.popPile(0, 'stomp');
rakus.laserHit({});
console.log('Battle entry probe passed: city staging is harmless, area entry precedes combat, bosses wait through story/entrance/reentry.');
