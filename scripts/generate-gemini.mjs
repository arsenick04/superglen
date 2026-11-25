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
 *   --batch=N        BATCH mode: one request speaks N lines of the same kind+language (default 25 when given without
 *                    a value), split by silence. Needed for the free tier (10 requests/day/project/model).
 *                    A batch is only accepted if segment count == N and every duration is plausible for its text;
 *                    otherwise it is retried as two halves (never assigns audio to the wrong line).
 *   --max-requests=N stop after N API calls (protect the daily quota)
 *   --model=ID       default gemini-3.8-flash-tts (e.g. gemini-2.5-flash-preview-tts)
 *   --voice=NAME     default Puck
 *   --out-dir=DIR --manifest=FILE   override outputs (for experiments)
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
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodePcm, wavFromSamples, splitIntoN, mapSegments, cutSegment, encodeClip, probeClip } from './lib/gemini-split.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const flag = (n) => process.argv.includes(`--${n}`);
const DRY = flag('dry-run'), FORCE = flag('force');
const ONLY = arg('only') ? new RegExp(arg('only')) : null;
const LIMIT = arg('limit') ? parseInt(arg('limit'), 10) : Infinity;
const CONC = parseInt(arg('concurrency') || '3', 10);
const KEEP_RAW = arg('keep-raw');
const BATCH = flag('batch') ? 25 : arg('batch') ? parseInt(arg('batch'), 10) : 0;
const MAX_REQ = arg('max-requests') ? parseInt(arg('max-requests'), 10) : Infinity;
let reqCount = 0;
const RPM = parseFloat(arg('rpm') || '3'); // free tier allows 3 requests/minute; raise on a paid key
let nextSlot = 0;
const pace = async () => { const now = Date.now(); const t = Math.max(now, nextSlot); nextSlot = t + 60000 / RPM + 500; if (t > now) await new Promise((r) => setTimeout(r, t - now)); };

const MODEL = arg('model') || 'gemini-3.8-flash-tts', VOICE = arg('voice') || 'Puck', TEMP = 1.3;
const URL_ = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const OUT_DIR = arg('out-dir') ? path.resolve(arg('out-dir')) : path.join(ROOT, 'public', 'audio');
const MANIFEST = arg('manifest') ? path.resolve(arg('manifest')) : path.join(ROOT, 'audio', 'manifest.json');
// Short English style prefixes: a long Indonesian style prompt gets read aloud (18 s clips).
const STYLE = 'Say cheerfully, like an excited seven-year-old boy cartoon character: ';
const STYLE_EN = 'Say this English word clearly and cheerfully, like an excited seven-year-old boy cartoon character: ';
const styleZh = (zh, py) => `Say only this Mandarin Chinese word, clearly, with correct tones, like a cheerful seven-year-old boy (hanzi ${zh}, pinyin ${py}, do not say the pinyin): `;
// Batch headers (the style prefix is shared by every line of the batch).
const BATCH_NOTE = 'Read each numbered line below with a clear one-second pause between lines; do not read the numbers. ';
const batchHeader = (g) => g.kind === 'prompt' ? `Say cheerfully, like an excited seven-year-old boy cartoon character. ${BATCH_NOTE}\n`
  : g.lang === 'zh' ? `Say each Mandarin Chinese word clearly in Mandarin with correct tones, like a cheerful seven-year-old boy cartoon character. Say only the Chinese word on each line, never the pinyin in brackets. ${BATCH_NOTE}\n`
  : `Say each English word clearly and cheerfully, like an excited seven-year-old boy cartoon character. Say only the word on each line. ${BATCH_NOTE}\n`;
const batchLine = (j, i) => `${i + 1}. ${j.kind === 'kata' && j.lang === 'zh' ? `${j.text} (${j.pinyin || ''})` : j.text}`;

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
        add({ id: d.speak_audio_id, text: d.text, pinyin: d.pinyin, lang: d.lang, kind: 'kata', recorded: false,
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
  // A local key (env GEMINI_API_KEY) goes in the query so a proxy-injected header cannot replace it.
  const url = process.env.GEMINI_API_KEY ? `${URL_}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}` : URL_;
  for (let attempt = 0; attempt < 6; attempt++) {
    let r, txt;
    if (reqCount >= MAX_REQ) throw new QuotaDone(`--max-requests=${MAX_REQ} reached`);
    await pace(); reqCount++;
    try { r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }); txt = await r.text(); }
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

const process_ = encodeClip, probe = probeClip;
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
const groupOf = (j) => `${j.kind}:${j.lang}`;
function makeBatches() {
  const groups = new Map();
  for (const j of todo) { const k = groupOf(j); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(j); }
  const out = [];
  for (const list of groups.values()) for (let i = 0; i < list.length; i += BATCH) out.push(list.slice(i, i + BATCH));
  return out;
}
if (DRY && BATCH) {
  const bs = makeBatches();
  console.log(`batch mode: N=${BATCH}; ${bs.length} request(s) needed (best case, no retries)`);
  for (const b of bs.slice(0, 3)) console.log(`--- ${groupOf(b[0])} x${b.length}\n${batchHeader(b[0])}${b.slice(0, 4).map(batchLine).join('\n')}\n...`);
  process.exit(0);
}
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
// ---- batch mode ----
const batchStats = { requests: 0, accepted: 0, rejected: 0, singles: 0 };
function writeManifest(j, out, p, extra) {
  manifest[j.id] = { id: j.id, speaker: j.kind === 'kata' ? (j.lang === 'zh' ? 'mandarin' : 'english') : 'nino', source: 'gemini', model: MODEL, voice: VOICE, temperature: TEMP, lang: j.lang,
    hash: sha(j.text), tts: j.prompt, text: j.text, chars: [...j.text].length, bytes: fs.statSync(out).size, duration: p.duration, mean_db: p.mean, peak_db: p.peak,
    generated_at: new Date().toISOString(), normalized: 'loudnorm -16 LUFS TP -1.5, silence trimmed, 10 ms fades, mono 44.1k 96k', ...extra };
}
async function runBatch(jobs, depth = 0) {
  jobs = jobs.filter((j) => manifest[j.id]?.source !== 'recorded');
  if (!jobs.length || stop) return;
  if (jobs.length === 1) { batchStats.singles++; await one(jobs[0]); done++; return; } // single line: normal short prompt
  const batchId = `b${Date.now().toString(36)}-${sha(jobs.map((j) => j.id).join(',')).slice(0, 6)}`;
  const prompt = batchHeader(jobs[0]) + jobs.map(batchLine).join('\n');
  const raw = await callApi(prompt); batchStats.requests++;
  if (KEEP_RAW) { fs.mkdirSync(KEEP_RAW, { recursive: true }); fs.writeFileSync(path.join(KEEP_RAW, `${batchId}.wav`), raw); }
  const { samples, rate } = decodePcm(raw);
  const sp = splitIntoN(samples, rate, jobs.length);
  const mp = sp.ok ? mapSegments(sp.segments, jobs) : sp;
  if (!mp.ok) {
    batchStats.rejected++;
    console.log(`  batch ${batchId} x${jobs.length} rejected (${mp.reason}); retrying as halves`);
    const h = jobs.length >> 1;
    await runBatch(jobs.slice(0, h), depth + 1); await runBatch(jobs.slice(h), depth + 1);
    return;
  }
  // Encode everything to temp files first; only then publish, so a failure never leaves a half-mapped batch.
  const staged = [];
  try {
    for (const [i, { job, seg }] of mp.pairs.entries()) {
      const out = path.join(OUT_DIR, `${job.id}.mp3`), tmp = out + '.tmp.mp3';
      process_(wavFromSamples(cutSegment(samples, rate, seg), rate), tmp);
      const p = probe(tmp), reason = p.mean < -40 ? 'silent' : sanity(job, p);
      if (reason) throw new Error(`${job.id}: ${reason}`);
      staged.push({ job, out, tmp, p, i });
    }
  } catch (e) {
    for (const x of staged) fs.rmSync(x.tmp, { force: true });
    batchStats.rejected++;
    console.log(`  batch ${batchId} x${jobs.length} rejected after encode (${e.message}); retrying as halves`);
    const h = jobs.length >> 1;
    await runBatch(jobs.slice(0, h), depth + 1); await runBatch(jobs.slice(h), depth + 1);
    return;
  }
  for (const { job, out, tmp, p, i } of staged) {
    fs.renameSync(tmp, out);
    writeManifest(job, out, p, { batch: batchId, batch_size: jobs.length, batch_index: i, tts: batchHeader(job).trim() });
    done++;
  }
  batchStats.accepted++;
  saveManifest();
  console.log(`  batch ${batchId} accepted: ${jobs.length} clips (${groupOf(jobs[0])}, minSilence ${sp.minSilence}s)`);
}
async function batchMain() {
  for (const b of makeBatches()) {
    if (stop) break;
    try { await runBatch(b); }
    catch (e) { if (e instanceof QuotaDone) { stop = true; quotaMsg = e.message; } else { failed.push(`batch ${b[0].id}..: ${e.message}`); console.log(`  FAIL batch: ${e.message}`); } }
  }
}
async function worker() {
  while (!stop) {
    const j = todo[idx++]; if (!j) return;
    try { await one(j); done++; if (done % 10 === 0) { saveManifest(); console.log(`  ${done}/${todo.length}`); } }
    catch (e) { if (e instanceof QuotaDone) { stop = true; quotaMsg = e.message; } else { failed.push(`${j.id}: ${e.message}`); console.log(`  FAIL ${j.id}: ${e.message}`); } }
  }
}
if (BATCH) await batchMain(); else await Promise.all(Array.from({ length: CONC }, worker));
if (BATCH) console.log(`batch stats: ${JSON.stringify(batchStats)}, api requests ${reqCount}`);
saveManifest();
const remaining = jobsAll.filter((j) => !j.recorded && !fs.existsSync(path.join(OUT_DIR, `${j.id}.mp3`))).length;
console.log(`generated ${done}; failed ${failed.length}; flagged ${flagged.length}; remaining without file: ${remaining}`);
if (stop) console.log(`DAILY QUOTA EXHAUSTED, stopped cleanly. Resume later with the same command. ${quotaMsg}`);
if (flagged.length) console.log('flagged:', flagged.join(', '));
if (failed.length) console.log('failed:', failed.join('\n'));
