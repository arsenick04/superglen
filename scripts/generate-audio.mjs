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
 *   --say=glen --text="..." [--delivery="[excited] ..."] --out=path.mp3   one-off test clip (no manifest, no category rules)
 *
 * Model/settings/pitch come from audio/voices.json per role (default model eleven_v4). The spoken text is the line's
 * `delivery` (audio/dialog.json) or the category rule in audio/delivery.json (audio tags such as [excited]); the displayed
 * text is never changed. After download every clip is pitch-shifted (voice.pitchSemitones, ffmpeg rubberband), silence-trimmed,
 * loudness-normalised to -16 LUFS and encoded mono 96 kbps.
 *
 * Sources: audio/dialog.json and src/data/quiz/*.json. Output: public/audio/{id}.mp3, audio/manifest.json,
 * audio/lines.generated.json. Never overwrites lines marked "source": "recorded" or MP3s not in the manifest (unless --force).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT, api, getSubscription, keySource, sleep, readJson } from './_eleven.mjs';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const flag = (n) => process.argv.includes(`--${n}`);
const DRY = flag('dry-run'), FORCE = flag('force'), SAMPLE = flag('sample');
const LIMIT = arg('limit') ? parseInt(arg('limit'), 10) : Infinity;
const CATS = arg('category')?.split(',');
const ONLY = arg('only')?.split(',');
const SAY = arg('say'), OUT_ARG = arg('out');

const AUDIO_DIR = path.join(ROOT, 'audio');
const OUT_DIR = path.join(ROOT, 'public', 'audio');
const MANIFEST = path.join(AUDIO_DIR, 'manifest.json');
const VOICES = path.join(AUDIO_DIR, 'voices.json');
const DEFAULT_MODEL = 'eleven_v4';
const TARGET_LUFS = -16;

const CAT_OF_QUIZ = { hitung: 'quiz_hitung', inggris: 'quiz_inggris', mandarin: 'quiz_mandarin', hewan: 'quiz_hewan', baca: 'quiz_baca' };
const QUIZ_FILES = ['berhitung', 'inggris', 'mandarin', 'hewan', 'membaca'];

function collect() {
  const jobs = new Map();
  const add = (j) => { if (j.id && j.text && !jobs.has(j.id)) jobs.set(j.id, j); };
  const dialog = readJson(path.join(AUDIO_DIR, 'dialog.json'), []);
  for (const d of dialog) {
    const cat = d.id.startsWith('bab1_') ? 'bab1' : d.id.startsWith('bab2_') ? 'bab2' : d.id.startsWith('quiz_nino') ? 'quiz_nino'
      : d.id.startsWith('bab') ? d.id.split('_')[0] : 'lainnya';
    add({ id: d.id, speaker: d.speaker, lang: d.lang || 'id', text: d.text, delivery: d.delivery, source: 'audio/dialog.json', category: cat, recorded: d.source === 'recorded' });
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
        add({ id: d.speak_audio_id, speaker: zh ? 'mandarin' : 'english', lang: d.lang, text: d.text, source: src, category: zh ? 'speak_zh' : 'speak_en', recorded: false });
      }
    }
  }
  return [...jobs.values()];
}

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
const manifest = readJson(MANIFEST, {});
const voices = readJson(VOICES, {});
const deliveryRules = readJson(path.join(AUDIO_DIR, 'delivery.json'), {});
const modelOf = (v) => v.model || DEFAULT_MODEL;
// Settings actually sent to ElevenLabs. eleven_v4/v3 ignore style and speaker boost, so they are only sent for v2 models.
function settingsOf(v) {
  const s = { stability: v.stability, similarity_boost: v.similarity_boost };
  if (/multilingual_v2|turbo_v2|flash_v2/.test(modelOf(v))) { if (v.style != null) s.style = v.style; if (v.use_speaker_boost != null) s.use_speaker_boost = v.use_speaker_boost; }
  return s;
}
const pitchOf = (v) => v.pitchSemitones || 0;
// Text sent to TTS: per-line `delivery`, else the category rule (prefix tag variants picked by id hash), else the plain text.
function ttsText(j) {
  if (j.delivery) return j.delivery;
  if (typeof deliveryRules._ids?.[j.id] === 'string') return deliveryRules._ids[j.id];
  const rule = deliveryRules[j.category];
  if (!rule) return j.text;
  const variants = rule.variants || [rule.prefix || ''];
  const pick = variants[parseInt(hash(j.id).slice(0, 6), 16) % variants.length];
  return `${pick}${j.text}${rule.suffix || ''}`;
}
// What must match for a clip to count as up to date: spoken text, voice, model, settings and pitch.
const sig = (j, v) => hash(JSON.stringify([ttsText(j), v?.voice_id, modelOf(v || {}), settingsOf(v || {}), pitchOf(v || {})]));
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
  if (m.hash !== sig(j, v)) return 'changed';
  return 'current';
}

async function tts(job, v) {
  const body = { text: job.tts, model_id: modelOf(v), language_code: job.lang, voice_settings: settingsOf(v) };
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

// Post-process: pitch shift (rubberband, formants follow pitch so it sounds like a smaller speaker), trim leading/trailing
// silence, two-pass loudnorm to TARGET_LUFS, mono 44.1 kHz 96 kbps MP3. Returns { buf, lufs, peak, dur }.
function ff(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').slice(-300)}`);
  return r.stderr;
}
function postprocess(raw, v) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-audio-'));
  try {
    const inp = path.join(dir, 'in.mp3'), mid = path.join(dir, 'mid.wav'), out = path.join(dir, 'out.mp3');
    fs.writeFileSync(inp, raw);
    const pitch = pitchOf(v);
    const trim = 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse';
    // gentle compression keeps expressive peaks from limiting the loudness; then a plain gain to the target and a true-peak limiter
    const chain = [pitch ? `rubberband=pitch=${Math.pow(2, pitch / 12).toFixed(5)}:formant=shifted:pitchq=quality` : null, 'highpass=f=70', trim,
      'acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=1'].filter(Boolean).join(',');
    ff(['-i', inp, '-af', chain, '-ac', '1', '-ar', '44100', mid]);
    const measure = (f) => { const err = ff(['-i', f, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']); return JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1)); };
    const m = measure(mid);
    const gain = TARGET_LUFS - parseFloat(m.input_i);
    ff(['-i', mid, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:level=disabled:attack=2:release=40,afade=t=in:d=0.01,apad=pad_dur=0.08`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', out]);
    const q = measure(out);
    const dur = parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout);
    return { buf: fs.readFileSync(out), lufs: +parseFloat(q.input_i).toFixed(1), peak: +parseFloat(q.input_tp).toFixed(1), dur };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function say() {
  const v = voices[SAY];
  if (!voiceReady(v)) throw new Error(`voice "${SAY}" not set in audio/voices.json`);
  const text = arg('text'), job = { id: 'say', speaker: SAY, lang: arg('lang') || 'id', text, tts: arg('delivery') || text };
  if (!text || !OUT_ARG) throw new Error('--say needs --text and --out');
  const raw = await tts(job, v);
  if (flag('raw')) fs.writeFileSync(OUT_ARG, raw);
  else { const p = postprocess(raw, v); fs.writeFileSync(OUT_ARG, p.buf); console.log(`pitch ${pitchOf(v)} st, ${p.lufs} LUFS, peak ${p.peak} dBTP, ${p.dur}s`); }
  console.log(`ok ${OUT_ARG} (${job.tts.length} chars billed, model ${modelOf(v)})`);
}

async function main() {
  if (SAY) return say();
  const all = collect();
  for (const j of all) j.tts = ttsText(j);
  fs.writeFileSync(path.join(AUDIO_DIR, 'lines.generated.json'),
    JSON.stringify(all.map(({ id, speaker, lang, text, tts, source, category }) => ({ id, speaker, lang, text, tts, source, category })), null, 2) + '\n');

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

  const chars = (a) => a.reduce((n, j) => n + j.tts.length, 0);
  const sub = await getSubscription();
  console.log(`Key: ${keySource}`);
  console.log(sub.ok ? `Quota: ${sub.used}/${sub.limit} used (${sub.tier}), ${sub.remaining} remaining`
    : `Quota: unavailable (${sub.status} ${sub.text})`);
  console.log(`\nPlan: ${todo.length} to generate of ${jobs.length} selected (${all.length} lines total). Skipped: ${skipped.current} current, ${skipped.recorded} recorded, ${skipped.handmade} hand-made.`);
  const by = {};
  for (const j of todo) (by[j.category] ||= { n: 0, c: 0 }), by[j.category].n++, by[j.category].c += j.tts.length;
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
    if (j.tts.length > budget) { console.log(`Quota exhausted: stopping before ${j.id}.`); break; }
    const v = voiceOf(j);
    try {
      const raw = await tts(j, v);
      used += j.tts.length; budget -= j.tts.length; // billed even if post-processing fails
      const p = postprocess(raw, v);
      fs.writeFileSync(mp3(j.id), p.buf);
      manifest[j.id] = { id: j.id, speaker: j.speaker, voice_id: v.voice_id, voice: v.name, model: modelOf(v), settings: settingsOf(v), pitchSemitones: pitchOf(v), lang: j.lang,
        hash: sig(j, v), tts: j.tts, chars: j.tts.length, bytes: p.buf.length, duration: +p.dur.toFixed(2), lufs: p.lufs, peak_dbtp: p.peak, generated_at: new Date().toISOString(),
        normalized: `loudnorm ${TARGET_LUFS} LUFS, silence trimmed, mono 96k${pitchOf(v) ? `, pitch +${pitchOf(v)} st (rubberband)` : ''}` };
      saveManifest();
      done++;
      console.log(`ok   ${j.id} (${j.tts.length} chars, ${p.buf.length} bytes, ${p.dur.toFixed(2)}s, ${p.lufs} LUFS)`);
    } catch (e) { failed++; console.error(`FAIL ${j.id}: ${e.message}`); }
    await sleep(300);
  }
  console.log(`\nSummary: generated ${done}, skipped ${skipped.current + skipped.recorded + skipped.handmade}, failed ${failed}, characters used ${used}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
