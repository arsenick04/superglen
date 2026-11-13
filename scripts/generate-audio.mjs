#!/usr/bin/env node
/**
 * Generates speech MP3s with ElevenLabs: `npm run audio -- [options]`.
 *
 *   --dry-run            print the plan (counts, characters, quota share) without calling TTS
 *   --sample             one line per category (the shortest); bab* gives one per speaker
 *   --limit=N            at most N files this run
 *   --category=a,b       bab1|bab2|quiz_nino|quiz_hitung|quiz_inggris|quiz_mandarin|quiz_hewan|quiz_baca|speak_en|speak_zh
 *                        (bab* categories give one glen and one nino line)
 *   --only=id,id         only these ids (regenerates even if the file exists)
 *   --force              regenerate even if up to date
 *
 * Sources: audio/dialog.json and src/data/quiz/*.json. Output: public/audio/{id}.mp3, audio/manifest.json,
 * audio/lines.generated.json. Never overwrites lines marked "source": "recorded" or MP3s not in the manifest (unless --force).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, api, getSubscription, keySource, sleep, readJson } from './_eleven.mjs';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const flag = (n) => process.argv.includes(`--${n}`);
const DRY = flag('dry-run'), FORCE = flag('force'), SAMPLE = flag('sample');
const LIMIT = arg('limit') ? parseInt(arg('limit'), 10) : Infinity;
const CATS = arg('category')?.split(',');
const ONLY = arg('only')?.split(',');

const AUDIO_DIR = path.join(ROOT, 'audio');
const OUT_DIR = path.join(ROOT, 'public', 'audio');
const MANIFEST = path.join(AUDIO_DIR, 'manifest.json');
const VOICES = path.join(AUDIO_DIR, 'voices.json');
const MODEL = 'eleven_multilingual_v2';

const CAT_OF_QUIZ = { hitung: 'quiz_hitung', inggris: 'quiz_inggris', mandarin: 'quiz_mandarin', hewan: 'quiz_hewan', baca: 'quiz_baca' };
const QUIZ_FILES = ['berhitung', 'inggris', 'mandarin', 'hewan', 'membaca'];

function collect() {
  const jobs = new Map();
  const add = (j) => { if (j.id && j.text && !jobs.has(j.id)) jobs.set(j.id, j); };
  const dialog = readJson(path.join(AUDIO_DIR, 'dialog.json'), []);
  for (const d of dialog) {
    const cat = d.id.startsWith('bab1_') ? 'bab1' : d.id.startsWith('bab2_') ? 'bab2' : d.id.startsWith('quiz_nino') ? 'quiz_nino'
      : d.id.startsWith('bab') ? d.id.split('_')[0] : 'lainnya';
    add({ id: d.id, speaker: d.speaker, lang: d.lang || 'id', text: d.text, source: 'audio/dialog.json', category: cat, recorded: d.source === 'recorded' });
  }
  for (const name of QUIZ_FILES) {
    const f = path.join(ROOT, 'src', 'data', 'quiz', `${name}.json`);
    const qs = readJson(f, []);
    for (const q of qs) {
      const src = `src/data/quiz/${name}.json`;
      const cat = CAT_OF_QUIZ[q.id.split('_')[0]] || 'quiz_nino';
      if (q.audio_id && q.prompt) add({ id: q.audio_id, speaker: 'nino', lang: 'id', text: q.prompt, source: src, category: cat, recorded: q.source === 'recorded' });
      const d = q.display;
      if (d?.kind === 'speak' && d.speak_audio_id && d.text) {
        const zh = d.lang === 'zh';
        add({ id: d.speak_audio_id, speaker: zh ? 'mandarin' : 'nino', lang: d.lang, text: d.text, source: src, category: zh ? 'speak_zh' : 'speak_en', recorded: false });
      }
    }
  }
  return [...jobs.values()];
}

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
const manifest = readJson(MANIFEST, {});
const voices = readJson(VOICES, {});
const mp3 = (id) => path.join(OUT_DIR, `${id}.mp3`);
const saveManifest = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
const voiceOf = (j) => voices[j.speaker];
const voiceReady = (v) => v && v.voice_id && !v.voice_id.startsWith('ISI_');

function status(j) {
  const m = manifest[j.id];
  if (j.recorded || m?.source === 'recorded') return 'recorded';
  const exists = fs.existsSync(mp3(j.id));
  if (exists && !m) return 'handmade';
  if (!exists) return 'new';
  const v = voiceOf(j);
  if (m.hash !== hash(j.text) || m.voice_id !== v?.voice_id) return 'changed';
  return 'current';
}

async function tts(job, v) {
  const settings = { stability: v.stability, similarity_boost: v.similarity_boost, style: v.style };
  const body = { text: job.text, model_id: MODEL, language_code: job.lang, voice_settings: settings };
  for (let attempt = 0; attempt < 4; attempt++) {
    let r = await api(`/v1/text-to-speech/${v.voice_id}?output_format=mp3_44100_128`, { method: 'POST', body, accept: 'audio/mpeg' });
    if (r.status === 400 || r.status === 422) {
      const t = await r.text();
      if (/language/i.test(t) && body.language_code) { // model/voice rejects language_code: retry without it
        delete body.language_code;
        r = await api(`/v1/text-to-speech/${v.voice_id}?output_format=mp3_44100_128`, { method: 'POST', body, accept: 'audio/mpeg' });
      } else throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
    }
    if (r.status === 429 && attempt < 3) { await sleep(2000 * 2 ** attempt); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error('rate limited');
}

async function main() {
  const all = collect();
  fs.writeFileSync(path.join(AUDIO_DIR, 'lines.generated.json'),
    JSON.stringify(all.map(({ id, speaker, lang, text, source, category }) => ({ id, speaker, lang, text, source, category })), null, 2) + '\n');

  let jobs = all;
  if (ONLY) jobs = jobs.filter((j) => ONLY.includes(j.id));
  if (CATS) jobs = jobs.filter((j) => CATS.includes(j.category));
  if (SAMPLE) {
    const best = new Map();
    // story categories (bab*) get one line per speaker (glen and nino), others one per category
    const key = (j) => (j.category.startsWith('bab') ? `${j.category}:${j.speaker}` : j.category);
    for (const j of jobs) if (!best.has(key(j)) || j.text.length < best.get(key(j)).text.length) best.set(key(j), j);
    jobs = [...best.values()];
  }
  const force = FORCE || !!ONLY;
  const skipped = { recorded: 0, handmade: 0, current: 0 };
  let todo = [];
  for (const j of jobs) {
    const s = status(j);
    if (s === 'recorded') { skipped.recorded++; continue; }
    if (s === 'handmade' && !FORCE) { skipped.handmade++; continue; }
    if (s === 'current' && !force) { skipped.current++; continue; }
    todo.push(j);
  }
  if (Number.isFinite(LIMIT)) todo = todo.slice(0, LIMIT);

  const chars = (a) => a.reduce((n, j) => n + j.text.length, 0);
  const sub = await getSubscription();
  console.log(`Key: ${keySource}`);
  console.log(sub.ok ? `Quota: ${sub.used}/${sub.limit} used (${sub.tier}), ${sub.remaining} remaining`
    : `Quota: unavailable (${sub.status} ${sub.text})`);
  console.log(`\nPlan: ${todo.length} to generate of ${jobs.length} selected (${all.length} lines total). Skipped: ${skipped.current} current, ${skipped.recorded} recorded, ${skipped.handmade} hand-made.`);
  const by = {};
  for (const j of todo) (by[j.category] ||= { n: 0, c: 0 }), by[j.category].n++, by[j.category].c += j.text.length;
  for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(15)} ${String(v.n).padStart(4)} lines ${String(v.c).padStart(6)} chars`);
  const total = chars(todo);
  console.log(`  ${'TOTAL'.padEnd(15)} ${String(todo.length).padStart(4)} lines ${String(total).padStart(6)} chars` +
    (sub.ok ? `  (${((total / sub.limit) * 100).toFixed(1)}% of quota limit, ${((total / Math.max(sub.remaining, 1)) * 100).toFixed(1)}% of remaining)` : ''));
  const missing = [...new Set(todo.filter((j) => !voiceReady(voiceOf(j))).map((j) => j.speaker))];
  if (missing.length) console.log(`\nVoices not set in audio/voices.json for: ${missing.join(', ')} (run npm run audio:voices)`);
  if (DRY) return console.log('\n--dry-run: nothing generated.');
  if (!sub.ok) { console.error('\nCannot reach ElevenLabs / credentials refused. Nothing generated.'); process.exit(2); }
  if (missing.length) todo = todo.filter((j) => voiceReady(voiceOf(j)));

  let budget = sub.remaining, done = 0, failed = 0, used = 0;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const j of todo) {
    if (j.text.length > budget) { console.log(`Quota exhausted: stopping before ${j.id}.`); break; }
    const v = voiceOf(j);
    try {
      const buf = await tts(j, v);
      fs.writeFileSync(mp3(j.id), buf);
      manifest[j.id] = { id: j.id, speaker: j.speaker, voice_id: v.voice_id, lang: j.lang, hash: hash(j.text), chars: j.text.length, bytes: buf.length, generated_at: new Date().toISOString() };
      saveManifest();
      budget -= j.text.length; used += j.text.length; done++;
      console.log(`ok   ${j.id} (${j.text.length} chars, ${buf.length} bytes)`);
    } catch (e) { failed++; console.error(`FAIL ${j.id}: ${e.message}`); }
    await sleep(300);
  }
  console.log(`\nSummary: generated ${done}, skipped ${skipped.current + skipped.recorded + skipped.handmade}, failed ${failed}, characters used ${used}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
