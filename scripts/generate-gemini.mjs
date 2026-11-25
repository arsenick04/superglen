#!/usr/bin/env node
/**
 * Quiz audio with Google Gemini TTS: `NODE_USE_ENV_PROXY=1 node scripts/generate-gemini.mjs [options]`
 *
 *   --dry-run        list what would be generated (no API calls)
 *   --only=<regex>   only ids matching the regex
 *   --force          regenerate even if public/audio/{id}.mp3 exists (never touches "recorded" clips)
 *   --limit=N        at most N clips this run
 *   --concurrency=N  parallel requests (default 3)
 *   --rpm=N          requests per minute pacing (default 3 = Gemini free tier)
 *   --keep-raw=dir   keep raw WAV takes
 *
 * Scope: every audio_id (prompt) and display.speak_audio_id (word) in src/data/quiz/*.json.
 * Spoken text: prompt only for questions; the word only for *_kata (same rules as the ElevenLabs pipeline).
 * No API key lives here: the key is injected by the network proxy (header x-goog-api-key). Node's fetch needs
 * NODE_USE_ENV_PROXY=1 to use the proxy. A key in env GEMINI_API_KEY is optional and only for local use.
 * Output: public/audio/{id}.mp3 (mono 44.1 kHz 96 kbps, loudnorm -16 LUFS / TP -1.5, silence trimmed), audio/manifest.json
 * (source "gemini", hash = sha256(display text)[:16], so audit-voice treats them as ok).
 * On daily quota exhaustion the run stops cleanly and prints how many remain; just run again later.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const flag = (n) => process.argv.includes(`--${n}`);
const DRY = flag('dry-run'), FORCE = flag('force');
const ONLY = arg('only') ? new RegExp(arg('only')) : null;
const LIMIT = arg('limit') ? parseInt(arg('limit'), 10) : Infinity;
const CONC = parseInt(arg('concurrency') || '3', 10);
const KEEP_RAW = arg('keep-raw');
const RPM = parseFloat(arg('rpm') || '3'); // free tier allows 3 requests/minute; raise on a paid key
let nextSlot = 0;
const pace = async () => { const now = Date.now(); const t = Math.max(now, nextSlot); nextSlot = t + 60000 / RPM + 500; if (t > now) await new Promise((r) => setTimeout(r, t - now)); };

const MODEL = 'gemini-3.8-flash-tts', VOICE = 'Puck', TEMP = 1.3;
const URL_ = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const OUT_DIR = path.join(ROOT, 'public', 'audio');
const MANIFEST = path.join(ROOT, 'audio', 'manifest.json');
const STYLE = 'Ucapkan dengan suara anak laki-laki kecil berumur tujuh tahun yang SANGAT ekspresif seperti pengisi suara film kartun anak: nada naik turun, antusias, penuh rasa ingin tahu di pertanyaan, girang dan heboh di ajakan, logat Indonesia natural: ';
const STYLE_EN = 'Ucapkan dengan suara anak laki-laki kecil berumur tujuh tahun yang ekspresif dan ceria seperti pengisi suara film kartun anak. Ucapkan kata bahasa Inggris ini dengan jelas, dengan pelafalan bahasa Inggris yang natural, hanya kata itu saja: ';
const styleZh = (zh, py) => `Ucapkan dengan suara anak laki-laki kecil berumur tujuh tahun yang ekspresif dan ceria seperti pengisi suara film kartun anak. Ucapkan kata bahasa Mandarin ini dengan jelas dan benar dalam bahasa Mandarin (Putonghua) dengan nada (tone) yang tepat, bukan dalam bahasa Indonesia, hanya kata itu saja. Aksara: ${zh}, pinyin: ${py}. Ucapkan: `;

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, fb) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fb);

function collect() {
  const jobs = new Map();
  const add = (j) => { if (j.id && j.text && !jobs.has(j.id)) jobs.set(j.id, j); };
  for (const name of ['berhitung', 'inggris', 'mandarin', 'hewan', 'membaca']) {
    for (const q of readJson(path.join(ROOT, 'src/data/quiz', `${name}.json`), [])) {
      if (q.audio_id && q.prompt) add({ id: q.audio_id, text: q.prompt, lang: 'id', prompt: STYLE + q.prompt, kind: 'prompt', recorded: q.source === 'recorded' });
      const d = q.display;
      if (d?.kind === 'speak' && d.speak_audio_id && d.text) {
        const zh = d.lang === 'zh';
        add({ id: d.speak_audio_id, text: d.text, lang: d.lang, kind: 'kata', recorded: false,
          prompt: zh ? styleZh(d.text, d.pinyin || '') + d.text : STYLE_EN + d.text });
      }
    }
  }
  return [...jobs.values()];
}

class QuotaDone extends Error {}
async function callApi(prompt) {
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], temperature: TEMP, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  const headers = { 'content-type': 'application/json' };
  if (process.env.GEMINI_API_KEY) headers['x-goog-api-key'] = process.env.GEMINI_API_KEY;
  for (let attempt = 0; attempt < 6; attempt++) {
    let r, txt;
    await pace();
    try { r = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify(body) }); txt = await r.text(); }
    catch (e) { await sleep(2000 * 2 ** attempt); continue; }
    if (r.status === 429 || r.status >= 500) {
      if (r.status === 429 && /"quotaId":\s*"[^"]*PerDay/.test(txt)) throw new QuotaDone('daily quota (' + (txt.match(/"quotaValue":\s*"(\d+)/)?.[1] ?? '?') + ' requests/day on this key/tier)');
      const m = txt.match(/retry in ([\d.]+)s/i);
      await sleep(m ? Math.min(90000, parseFloat(m[1]) * 1000 + 500) : Math.min(60000, 2000 * 2 ** attempt) + Math.random() * 1000);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
    let j; try { j = JSON.parse(txt); } catch { await sleep(1500); continue; }
    const data = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!data?.data) { await sleep(1500 * (attempt + 1)); continue; } // sometimes 200 with no audio: retry
    return Buffer.from(data.data, 'base64');
  }
  throw new Error('no audio after retries');
}

const ff = (args, opt = {}) => spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', ...opt });
function process_(raw, outFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gem-'));
  try {
    const inArgs = raw.slice(0, 4).toString() === 'RIFF' ? ['-i'] : ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i'];
    const src = path.join(tmp, 'in.bin'); fs.writeFileSync(src, raw);
    const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse';
    const pre = `highpass=f=60,${trim}`;
    const m = ff([...inArgs, src, '-af', `${pre},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
    const jm = m.stderr.match(/\{[\s\S]*"target_offset"[\s\S]*?\}/);
    let norm = 'loudnorm=I=-16:TP=-1.5:LRA=11';
    if (jm) { const s = JSON.parse(jm[0]); if (isFinite(+s.input_i)) norm += `:measured_I=${s.input_i}:measured_TP=${s.input_tp}:measured_LRA=${s.input_lra}:measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true`; }
    const r = ff(['-y', ...inArgs, src, '-af', `${pre},${norm},apad=pad_dur=0.05,areverse,areverse`.replace(',apad=pad_dur=0.05,areverse,areverse', ''), '-ar', '44100', '-ac', '1', '-b:a', '96k', outFile]);
    if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr.slice(-200));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
function probe(file) {
  const d = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const v = ff(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const mean = parseFloat(v.stderr.match(/mean_volume: ([-\d.]+) dB/)?.[1] ?? '-99');
  const peak = parseFloat(v.stderr.match(/max_volume: ([-\d.]+) dB/)?.[1] ?? '-99');
  return { duration: +parseFloat(d.stdout).toFixed(2), mean, peak };
}
// Plausible duration window from text length (chars incl. spaces); words are short.
function sanity(j, p) {
  const n = [...j.text].length;
  const [lo, hi] = j.lang === 'zh' ? [0.3, 3.0] : j.kind === 'kata' ? [0.25, 2.5] : [Math.max(0.5, n * 0.035), n * 0.16 + 2.0];
  if (p.mean < -40) return 'silent';
  if (p.duration < lo) return `too-short ${p.duration}s`;
  if (p.duration > hi) return `too-long ${p.duration}s`;
  return null;
}

const jobsAll = collect();
const todo = jobsAll.filter((j) => !j.recorded && (!ONLY || ONLY.test(j.id)) && (FORCE || !fs.existsSync(path.join(OUT_DIR, `${j.id}.mp3`)))).slice(0, LIMIT);
console.log(`quiz clips in scope: ${jobsAll.length}; to generate: ${todo.length}${DRY ? ' (dry run)' : ''}`);
if (DRY) { for (const j of todo.slice(0, 15)) console.log(`  ${j.id}: ${j.prompt.slice(-80)}`); process.exit(0); }

const manifest = readJson(MANIFEST, {});
const saveManifest = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
let done = 0, stop = false, quotaMsg = '';
const flagged = [], failed = [];
let idx = 0;
async function one(j) {
  if (manifest[j.id]?.source === 'recorded') return;
  const out = path.join(OUT_DIR, `${j.id}.mp3`);
  const tmpOut = out + '.tmp.mp3';
  let reason = null, p = null;
  for (let take = 0; take < 3; take++) {
    const raw = await callApi(j.prompt);
    if (KEEP_RAW) { fs.mkdirSync(KEEP_RAW, { recursive: true }); fs.writeFileSync(path.join(KEEP_RAW, `${j.id}.wav`), raw); }
    process_(raw, tmpOut);
    p = probe(tmpOut);
    reason = sanity(j, p);
    if (!reason) break;
  }
  fs.renameSync(tmpOut, out);
  if (reason) flagged.push(`${j.id} (${reason})`);
  manifest[j.id] = { id: j.id, speaker: j.kind === 'kata' ? (j.lang === 'zh' ? 'mandarin' : 'english') : 'nino', source: 'gemini', model: MODEL, voice: VOICE, temperature: TEMP, lang: j.lang,
    hash: sha(j.text), tts: j.prompt, text: j.text, chars: [...j.text].length, bytes: fs.statSync(out).size, duration: p.duration, mean_db: p.mean, peak_db: p.peak,
    generated_at: new Date().toISOString(), normalized: 'loudnorm -16 LUFS TP -1.5, silence trimmed, mono 44.1k 96k' + (reason ? `; FLAG ${reason}` : '') };
}
async function worker() {
  while (!stop) {
    const j = todo[idx++]; if (!j) return;
    try { await one(j); done++; if (done % 10 === 0) { saveManifest(); console.log(`  ${done}/${todo.length}`); } }
    catch (e) { if (e instanceof QuotaDone) { stop = true; quotaMsg = e.message; } else { failed.push(`${j.id}: ${e.message}`); console.log(`  FAIL ${j.id}: ${e.message}`); } }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
saveManifest();
const remaining = jobsAll.filter((j) => !j.recorded && !fs.existsSync(path.join(OUT_DIR, `${j.id}.mp3`))).length;
console.log(`generated ${done}; failed ${failed.length}; flagged ${flagged.length}; remaining without file: ${remaining}`);
if (stop) console.log(`DAILY QUOTA EXHAUSTED, stopped cleanly. Resume later with the same command. ${quotaMsg}`);
if (flagged.length) console.log('flagged:', flagged.join(', '));
if (failed.length) console.log('failed:', failed.join('\n'));
