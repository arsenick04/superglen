import assert from 'node:assert/strict';
import { SAVE_KEY, SaveStore } from '../src/core/Save';
import { startPlanFor } from '../src/world/progress';

let stored: string | null = null;
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    location: { search: '' },
    localStorage: {
      getItem(key: string) { assert.equal(key, SAVE_KEY); return stored; },
      setItem(key: string, value: string) { assert.equal(key, SAVE_KEY); stored = value; },
      removeItem(key: string) { assert.equal(key, SAVE_KEY); stored = null; },
    },
  },
});

const save = new SaveStore();
for (let chapter = 1; chapter <= 6; chapter++) save.markChapterDone(`bab${chapter}`);
save.setWhere('kota');
save.setSlot({ level: 'kota', x: 4, y: 0, z: 4, yaw: 0, mode: 'glen', t: (save.data.doneAt.bab6 ?? 0) - 1 });
save.setInterlude('rakus_home');
assert.deepEqual(startPlanFor(save), { level: 'kota', arrival: 'rakusVictory' }, 'an older manual slot cannot skip the walk home');

const reloaded = new SaveStore();
assert.equal(reloaded.data.interlude, 'rakus_home', 'homeward checkpoint survives reload');
assert.deepEqual(startPlanFor(reloaded), { level: 'kota', arrival: 'rakusVictory' });

const walkSlot = { level: 'kota', x: 30, y: 0, z: 40, yaw: 0.7, mode: 'glen' as const, t: (save.data.doneAt.bab6 ?? 0) + 1 };
reloaded.setSlot(walkSlot);
assert.deepEqual(startPlanFor(reloaded), { level: 'kota', slot: walkSlot }, 'saving during the walk resumes from that spot');

reloaded.setSlot(null);
reloaded.setInterlude('rakus_letters');
assert.deepEqual(startPlanFor(new SaveStore()), { level: 'kota', arrival: 'homeMorning' }, 'after reaching home, continue outside it on the next morning');

console.log('Rakus home probe passed: victory, walk, reload, manual slot, and next morning.');
