import assert from 'node:assert/strict';
import { SAVE_KEY, SaveStore } from '../src/core/Save';
import { CITY_LAYOUT, districtAt } from '../src/world/kota/CityData';
import { LETTER_WORD, letterSpots } from '../src/world/kota/LetterHunt';
import { startPlanFor } from '../src/world/progress';

const spots = letterSpots();
const reachIds = new Set(CITY_LAYOUT.places.reachCoins.map((coin) => coin.id));
assert.equal(LETTER_WORD, 'SUPERGLEN');
assert.equal(spots.length, 9);
assert.equal(spots.filter(({ coin }) => coin.kind === 'roof').length, 4);
assert.equal(spots.filter(({ coin }) => coin.kind !== 'roof').length, 5);
assert.equal(new Set(spots.map(({ coin }) => districtAt(coin.x, coin.z).id)).size, 5);
for (const spot of spots) assert.ok(reachIds.has(spot.coin.id), `${spot.letter} has a checked route`);

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
save.setInterlude('rakus_letters');
assert.deepEqual(startPlanFor(save), { level: 'kota', arrival: 'homeMorning' });
assert.equal(save.takeCityLetter(3), true);
assert.equal(save.takeCityLetter(7), true, 'the second E is a separate pickup');
assert.equal(save.takeCityLetter(3), false, 'one letter cannot be taken twice');
assert.equal(save.takeCityLetter(9), false, 'unknown letters are ignored');
const reloaded = new SaveStore();
assert.deepEqual(reloaded.data.city.letters, [3, 7]);
for (let index = 0; index < 9; index++) reloaded.takeCityLetter(index);
assert.equal(reloaded.data.city.letters.length, 9);
reloaded.setInterlude('rakus_lab');
reloaded.setWhere('lab');
assert.deepEqual(startPlanFor(new SaveStore()), { level: 'lab' }, 'completed hunt resumes at the Lab');

console.log('Letter hunt probe passed: nine reachable spots, five districts, save/reload, and Lab goal.');
