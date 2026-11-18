import assert from 'node:assert/strict';
import { SAVE_KEY, SaveStore } from '../src/core/Save';
import { labNinoTalk, startPlanFor } from '../src/world/progress';

let stored: string | null = null;
const fakeWindow = {
  location: { search: '' },
  localStorage: {
    getItem(key: string) { assert.equal(key, SAVE_KEY); return stored; },
    setItem(key: string, value: string) { assert.equal(key, SAVE_KEY); stored = value; },
    removeItem(key: string) { assert.equal(key, SAVE_KEY); stored = null; },
  },
};
Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

const fresh = new SaveStore();
fresh.markChapterDone('bab1');
fresh.setWhere('lab');
fresh.setInterlude('costume_home');
assert.deepEqual(startPlanFor(fresh), { level: 'lab' });
assert.deepEqual(labNinoTalk(fresh), { line: 'bab1_nino_pulang_dulu', next: null });

fresh.setWhere('kota');
assert.deepEqual(startPlanFor(fresh), { level: 'kota' });
fresh.setInterlude('costume_return');
assert.deepEqual(startPlanFor(fresh), { level: 'kota', arrival: 'homeMorning' });
fresh.setWhere('lab');
assert.deepEqual(startPlanFor(fresh), { level: 'lab' });
assert.deepEqual(labNinoTalk(fresh), { line: null, next: 'bab2', clearInterlude: true });

const reloaded = new SaveStore();
assert.equal(reloaded.data.interlude, 'costume_return', 'interlude survives reload');
reloaded.setInterlude('');
assert.deepEqual(labNinoTalk(reloaded), { line: 'bab1_nino_besok', next: 'bab2' }, 'legacy route remains available');

stored = JSON.stringify({ chaptersDone: ['bab1'], where: 'lab' });
const legacy = new SaveStore();
assert.equal(legacy.data.interlude, '', 'old saves are not forced backwards');
assert.deepEqual(startPlanFor(legacy), { level: 'lab' });

fakeWindow.location.search = '?chapter=2';
const preview = new SaveStore();
assert.equal(preview.data.interlude, '');
assert.deepEqual(startPlanFor(preview), { level: 'bab2' }, 'direct chapter preview stays direct');

fakeWindow.location.search = '';
const snake = new SaveStore();
snake.markChapterDone('bab1');
snake.markChapterDone('bab2');
snake.markChapterDone('bab3');
snake.markChapterDone('bab4');
snake.markChapterDone('bab5');
snake.setInterlude('snake_lab');
snake.setWhere('kota');
assert.deepEqual(startPlanFor(snake), { level: 'lab' });
snake.setInterlude('snake_home');
assert.deepEqual(startPlanFor(snake), { level: 'kota' });
snake.setInterlude('snake_return');
assert.deepEqual(startPlanFor(snake), { level: 'kota', arrival: 'homeMorning' });
snake.setWhere('lab');
assert.deepEqual(startPlanFor(snake), { level: 'lab' });

console.log('Costume day probe passed: home gate, next morning, reload, legacy save, and Chapter 2 preview.');
