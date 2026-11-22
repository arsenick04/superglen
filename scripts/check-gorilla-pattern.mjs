// Headless state-machine probe; no renderer or browser gameplay is needed.
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.window = { location: { search: '' }, matchMedia: () => ({ matches: false }) };
const { GorillaArena } = await import('../src/world/arena/GorillaArena.ts');
const { Combat } = await import('../src/config/combat.ts');
const arena = new GorillaArena();
let result = 'blocked';
const feet = new THREE.Vector3(0, 4.5, 0);
arena.ctx = {
  player: { position: feet, getFeetPosition: (out) => out.copy(feet) },
  health: { exhaustions: 0, resting: false, hurt: () => result },
  game: { controlsEnabled: true, debugInfo: {} }, battle: { entering: false },
  fx: { sparkles: { burst() {} } },
};
arena.perches.push(new THREE.Vector3(0,4.5,0), new THREE.Vector3(5,5,0));
arena.alert = { visible: false, position: new THREE.Vector3() };
arena.target = { enabled: false };
arena.started = true;arena.timer = 0;
const until = (phase) => {
  for(let i=0;i<3000&&arena.phase!==phase;i++) arena.fixedUpdate(1/60);
  assert.equal(arena.phase, phase);
};
until('recover');assert.equal(arena.misses,1);assert.equal(arena.target.enabled,false);
until('wind');until('recover');assert.equal(arena.misses,2);
until('open');assert.equal(arena.target.enabled,true);
const stars=arena.stars;arena.hit();assert.equal(arena.stars,stars-1);assert.equal(arena.target.enabled,false);
arena.hit();assert.equal(arena.stars,stars-1,'laser must not count outside the opening');
arena.phase='wait';arena.timer=0;arena.misses=1;result='hit';
until('recover');assert.equal(arena.misses,0,'a successful charge breaks the dodge chain');
console.log(`PASS: two failed charges open the target; one laser per opening; hit resets the chain (${Combat.gorilla.missesToOpen} required).`);
