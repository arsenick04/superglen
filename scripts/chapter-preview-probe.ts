import assert from 'node:assert/strict';
import { SAVE_KEY, SaveStore, previewChapterFor } from '../src/core/Save';
import { startPlanFor } from '../src/world/progress';

let reads = 0;
let writes = 0;
let removes = 0;
const realSave = JSON.stringify({ chaptersDone: ['bab1'], where: 'lab', quiz: { coins: 37 } });
let stored: string | null = realSave;
const fakeWindow = {
  location: { search: '' },
  localStorage: {
    getItem(key: string) { assert.equal(key, SAVE_KEY); reads++; return stored; },
    setItem(key: string, value: string) { assert.equal(key, SAVE_KEY); writes++; stored = value; },
    removeItem(key: string) { assert.equal(key, SAVE_KEY); removes++; stored = null; },
  },
};
Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

for (let chapter = 1; chapter <= 7; chapter++) {
  fakeWindow.location.search = `?chapter=${chapter}&level=lab&free=1&reset=1`;
  const save = new SaveStore();
  const seed = structuredClone(save.data);
  assert.equal(save.previewChapter, chapter);
  assert.deepEqual(seed.chaptersDone, Array.from({ length: chapter - 1 }, (_, i) => `bab${i + 1}`));
  assert.equal(startPlanFor(save).level, chapter === 2 ? 'bab2' : chapter === 7 ? 'lab' : 'kota');
  if (chapter === 7) {
    assert.equal(seed.interlude, 'elang_bank');
    assert.equal(startPlanFor(save).arrival, 'labFromHangar');
  }
  assert.equal(seed.discovered.lab, chapter >= 2);
  assert.deepEqual(seed.skills, { laser: chapter >= 3, shield: chapter >= 3, fly: chapter >= 3 });
  assert.deepEqual([seed.bab3.step, seed.bab4.step, seed.bab5.step, seed.bab6.step], ['', '', '', '']);
  save.markChapterDone(`bab${chapter}`);
  save.takeCityCoin('preview-coin');
  save.setBab3('chase', [0]);
  save.persist();
  save.reload();
  assert.deepEqual(save.data, seed, 'reload starts this chapter fresh');
  save.reset();
  assert.deepEqual(save.data, seed);
  save.setMusic(false);
  save.resetProgress();
  assert.equal(save.data.settings.music, false, 'resetProgress retains session settings');
  save.data.settings.music = true;
  assert.deepEqual(save.data, seed);
  assert.deepEqual([reads, writes, removes], [0, 0, 0], 'preview never accesses real storage');
  assert.equal(stored, realSave);
}

fakeWindow.location.search = '?chapter=3&battle=1';
const arena = new SaveStore();
assert.equal(startPlanFor(arena).level, 'battle-curut');
assert.equal(arena.data.bab3.step, 'chase');
assert.deepEqual([reads, writes, removes], [0, 0, 0]);

const normalQueries = ['', '?chapter=0', '?chapter=8', '?chapter=03', '?chapter=3x', '?chapter=3.0', '?chapter=3%0A', '?chapter=', '?chapter=3%0A', '?chapter=3&chapter=4'];
for (const query of normalQueries) {
  fakeWindow.location.search = query;
  assert.equal(previewChapterFor(new URLSearchParams(query)), null);
  const normal = new SaveStore();
  assert.equal(normal.previewChapter, null);
  assert.equal(normal.data.quiz.coins, 37, 'normal and invalid queries still load the real save');
}
assert.equal(reads, normalQueries.length);
const normal = new SaveStore();
normal.persist();
assert.equal(writes, 1);
normal.reset();
assert.equal(removes, 1, 'normal reset still removes the real save');
console.log('Chapter preview probe passed: seven seeds, reset/reload isolation, arena entry, and normal/invalid queries.');
