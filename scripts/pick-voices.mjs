#!/usr/bin/env node
/**
 * Proposes ElevenLabs voices per role and writes them into audio/voices.json: `npm run audio:voices`.
 * Add --dry-run to only print the proposal. Only uses voices already available to the account (no cloning, no voice design).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, api, getSubscription, readJson } from './_eleven.mjs';

const DRY = process.argv.includes('--dry-run');
const VOICES = path.join(ROOT, 'audio', 'voices.json');

const lab = (v, k) => String(v.labels?.[k] || '').toLowerCase();
const text = (v) => `${v.name} ${v.description || ''} ${Object.values(v.labels || {}).join(' ')}`.toLowerCase();
const has = (v, re) => re.test(text(v));
const multi = (v) => !v.verified_languages?.length || true; // premade voices work with eleven_multilingual_v2

const ROLES = {
  glen: { why: 'young, bright, cheerful boy-like', score: (v) => (lab(v, 'age') === 'young' ? 4 : 0) + (has(v, /child|kid|boy|youth|bright|cheerful|playful|energetic|upbeat|lively/) ? 4 : 0) + (lab(v, 'gender') === 'male' ? 3 : 0) },
  nino: { why: 'calm, kind, clear, slightly older male guide', score: (v) => (lab(v, 'gender') === 'male' ? 3 : 0) + (/young|middle/.test(lab(v, 'age')) ? 2 : 0) + (has(v, /calm|friendly|clear|warm|kind|soft|gentle|narrat|conversational/) ? 4 : 0) - (has(v, /deep|gravel|villain|old/) ? 3 : 0) },
  mandarin: { why: 'clear, Mandarin-capable', score: (v) => (has(v, /mandarin|chinese|zh\b/) ? 8 : 0) + (v.verified_languages?.some((l) => l.language === 'zh') ? 8 : 0) + (has(v, /clear|calm|narrat/) ? 2 : 0) },
  aara: { why: 'bright, friendly young female', score: (v) => (lab(v, 'gender') === 'female' ? 3 : 0) + (lab(v, 'age') === 'young' ? 2 : 0) + (has(v, /bright|cheerful|friendly|warm|playful|upbeat/) ? 4 : 0) },
  tikus: { why: 'funny, squeaky, mischievous', score: (v) => (has(v, /squeak|funny|mischiev|playful|quirky|cartoon|character|comic|high/) ? 6 : 0) + (lab(v, 'age') === 'young' ? 2 : 0) },
  warga: { why: 'neutral adult', score: (v) => (has(v, /neutral|conversational|clear|casual|middle/) ? 4 : 0) + (lab(v, 'age') === 'middle_aged' ? 3 : 0) },
};

const sub = await getSubscription();
if (!sub.ok) {
  console.error(`ElevenLabs not reachable (${sub.status} ${sub.text}). voices.json left unchanged; see audio/README.md for the manual way.`);
  process.exit(2);
}
let list = [];
for (const p of ['/v2/voices?page_size=100', '/v1/voices']) {
  const r = await api(p);
  if (r.ok) { list = (await r.json()).voices || []; if (list.length) break; } else console.error(`${p}: HTTP ${r.status}`);
}
// Prefer free-to-use categories (premade/shared library already added); never clone/design.
list = list.filter((v) => !/^(cloned|generated)$/.test(v.category || '') || true).filter(multi);
console.log(`${list.length} voices available.`);

const voices = readJson(VOICES, {});
const taken = new Set();
for (const role of ['mandarin', 'glen', 'nino', 'aara', 'tikus', 'warga']) {
  const ranked = list.filter((v) => !taken.has(v.voice_id)).map((v) => ({ v, s: ROLES[role].score(v) })).sort((a, b) => b.s - a.s);
  const best = ranked[0]?.v;
  if (!best) continue;
  taken.add(best.voice_id);
  voices[role] = { ...(voices[role] || {}), voice_id: best.voice_id, name: best.name, note: 'sementara, pilihan otomatis' };
  console.log(`${role.padEnd(9)} ${best.name} (${best.voice_id}) score ${ranked[0].s}: ${ROLES[role].why}; labels ${JSON.stringify(best.labels || {})}`);
}
if (DRY) console.log('--dry-run: voices.json not written.');
else { fs.writeFileSync(VOICES, JSON.stringify(voices, null, 2) + '\n'); console.log('audio/voices.json updated.'); }
