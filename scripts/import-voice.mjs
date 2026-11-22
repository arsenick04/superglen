#!/usr/bin/env node
/**
 * Import real recordings (any file names) and file each one under the right line id.
 *
 *   npm run audio:import -- --dir=<folder> [--speaker=glen] [--dry-run] [--out=<scratch root>]
 *
 * Per file: ffmpeg -> mono 44.1 kHz WAV, find speech by energy (adaptive threshold), split on silences >= --gap (0.8 s),
 * keep 80 ms margins, transcribe every segment with ElevenLabs Scribe (Indonesian; a few seconds of STT quota per file, no TTS credits),
 * match to the speaker's lines in audio/dialog.json (normalised Levenshtein + token overlap, threshold --threshold 0.8),
 * then loudness-normalise (-16 LUFS, mono, 96 kbps mp3) to public/audio/<id>.mp3 and mark "source": "recorded" in audio/manifest.json.
 * Report: audio/import-report.md. Transcripts are cached (audio/.import-cache.json), so a real run after a dry run costs nothing extra.
 * --by-number: a number in the file name ("glen 12.m4a") is the line number; the file becomes that line whatever the transcript says (score still reported).
 * --out=<dir> redirects every write (public/audio, audio/manifest.json, originals, report, cache) to a scratch root.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT, apiForm, readJson } from './_eleven.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const flag = (k) => args.includes(`--${k}`);
const SPEAKER = arg('speaker', 'glen');
const DIR = arg('dir');
const DRY = flag('dry-run');
const OUT = path.resolve(arg('out', ROOT));
const THRESH = parseFloat(arg('threshold', '0.8'));
const GAP = parseFloat(arg('gap', '0.8'));
const MARGIN = 0.08;
const NO_SPLIT = flag('no-split');
const BY_NUMBER = flag('by-number');
if (!DIR) { console.error('Usage: npm run audio:import -- --dir=<folder> [--speaker=glen] [--dry-run] [--out=<dir>] [--threshold=0.8] [--gap=0.8] [--no-split] [--by-number]'); process.exit(1); }

const AUDIO_EXT = /\.(m4a|mp3|wav|webm|ogg|oga|opus|aac|flac|caf|mp4|3gp|amr)$/i;
const P = {
  pub: path.join(OUT, 'public', 'audio'), manifest: path.join(OUT, 'audio', 'manifest.json'), originals: path.join(OUT, 'audio', 'recorded-originals', SPEAKER),
  report: path.join(OUT, 'audio', 'import-report.md'), cache: path.join(OUT, 'audio', '.import-cache.json'),
};
const dialog = readJson(path.join(ROOT, 'audio', 'dialog.json'), []).filter((d) => d.speaker === SPEAKER);
if (!dialog.length) { console.error(`No lines for speaker "${SPEAKER}" in audio/dialog.json`); process.exit(1); }
const manifest = readJson(P.manifest, readJson(path.join(ROOT, 'audio', 'manifest.json'), {}));
const cache = readJson(P.cache, {});

// ---- numbering (CSV for glen, else dialog order) ------------------------------------------------------------------------------
const numOf = new Map(dialog.map((d, i) => [d.id, i + 1]));
const csv = path.join(ROOT, 'audio', `${SPEAKER}-rekam.csv`);
if (fs.existsSync(csv)) for (const row of fs.readFileSync(csv, 'utf8').split(/\r?\n/).slice(1)) { const m = row.match(/^(\d+),([^,]+),/); if (m && numOf.has(m[2])) numOf.set(m[2], +m[1]); }

// ---- text normalisation & similarity ------------------------------------------------------------------------------------------
const UNITS = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function numWords(n) {
  if (n < 12) return UNITS[n];
  if (n < 20) return numWords(n - 10) + ' belas';
  if (n < 100) return UNITS[Math.floor(n / 10)] + ' puluh' + (n % 10 ? ' ' + UNITS[n % 10] : '');
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + numWords(n % 100) : '');
  if (n < 1000) return UNITS[Math.floor(n / 100)] + ' ratus' + (n % 100 ? ' ' + numWords(n % 100) : '');
  if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + numWords(n % 1000) : '');
  if (n < 1e6) return numWords(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + numWords(n % 1000) : '');
  return String(n).split('').map((c) => UNITS[+c]).join(' ');
}
function norm(t) {
  return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[-_]/g, ' ')
    .replace(/\d+/g, (m) => ' ' + numWords(parseInt(m, 10)) + ' ')
    .replace(/[^a-z\s]/g, ' ').replace(/\bsuper\s+glen\b/g, 'superglen').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
function similarity(a, b) {
  if (!a || !b) return 0;
  const levSim = 1 - lev(a, b) / Math.max(a.length, b.length);
  const ta = a.split(' '), tb = b.split(' '), cnt = new Map();
  for (const t of tb) cnt.set(t, (cnt.get(t) || 0) + 1);
  let hit = 0; for (const t of ta) if (cnt.get(t) > 0) { hit++; cnt.set(t, cnt.get(t) - 1); }
  const dice = (2 * hit) / (ta.length + tb.length);
  return 0.7 * levSim + 0.3 * dice;
}
const lineNorm = dialog.map((d) => ({ d, n: norm(d.text) }));
function bestMatches(text) {
  const n = norm(text);
  return lineNorm.map(({ d, n: ln }) => ({ id: d.id, score: similarity(n, ln) })).sort((x, y) => y.score - x.score);
}

// ---- audio helpers ------------------------------------------------------------------------------------------------------------
function ff(a, opt = {}) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...a], { encoding: opt.raw ? 'buffer' : 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-300)}`);
  return opt.raw ? r.stdout : r.stderr;
}
const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-import-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const SR = 44100;

/** Returns [{start,end}] in seconds (speech with margin applied), using an adaptive energy threshold. */
function findSegments(pcm) {
  const n = Math.floor(pcm.length / 2), hop = Math.round(SR * 0.01), frames = Math.floor(n / hop);
  const db = new Float64Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; for (let i = f * hop; i < (f + 1) * hop; i++) { const v = pcm.readInt16LE(i * 2) / 32768; s += v * v; } db[f] = 10 * Math.log10(s / hop + 1e-12); }
  const sorted = Array.from(db).sort((a, b) => a - b), q = (p) => sorted[Math.min(frames - 1, Math.floor(p * frames))];
  const floor = q(0.1), peak = q(0.95);
  const thr = Math.max(floor + 10, peak - 30);
  // smooth over 30 ms, mark speech
  const speech = new Uint8Array(frames);
  for (let f = 1; f < frames - 1; f++) speech[f] = Math.max(db[f - 1], db[f], db[f + 1]) > thr ? 1 : 0;
  const raw = []; let s = -1;
  for (let f = 0; f <= frames; f++) { const on = f < frames && speech[f]; if (on && s < 0) s = f; else if (!on && s >= 0) { raw.push([s, f]); s = -1; } }
  // merge gaps shorter than GAP (or everything with --no-split)
  const gapF = NO_SPLIT ? Infinity : Math.round(GAP / 0.01), merged = [];
  for (const r of raw) { const last = merged[merged.length - 1]; if (last && r[0] - last[1] < gapF) last[1] = r[1]; else merged.push([...r]); }
  const total = n / SR;
  return merged.filter((r) => (r[1] - r[0]) * 0.01 >= 0.25).map((r) => ({ start: Math.max(0, r[0] * 0.01 - MARGIN), end: Math.min(total, r[1] * 0.01 + MARGIN) }));
}

async function transcribe(wavFile) {
  const buf = fs.readFileSync(wavFile), key = sha(buf);
  if (cache[key] != null) return cache[key];
  const form = new FormData();
  form.append('model_id', 'scribe_v1'); form.append('language_code', 'ind'); form.append('tag_audio_events', 'false');
  form.append('file', new Blob([buf], { type: 'audio/wav' }), 'seg.wav');
  const r = await apiForm('/v1/speech-to-text', form);
  if (!r.ok) throw new Error(`Scribe HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const text = (await r.json()).text || '';
  cache[key] = text;
  { fs.mkdirSync(path.dirname(P.cache), { recursive: true }); fs.writeFileSync(P.cache, JSON.stringify(cache, null, 1)); }
  return text;
}

function cut(wav, a, b, out) { ff(['-i', wav, '-ss', a.toFixed(3), '-to', b.toFixed(3), '-c:a', 'pcm_s16le', out]); }
function measure(f, af = 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json') { const e = ff(['-i', f, '-af', af, '-f', 'null', '-']); return JSON.parse(e.slice(e.lastIndexOf('{'), e.lastIndexOf('}') + 1)); }
/** same standard as generate-audio.mjs: gain to -16 LUFS, limiter, mono 44.1 kHz 96k mp3 */
function encodeClip(segWav, outMp3) {
  const mid = path.join(tmp, 'mid.wav');
  ff(['-i', segWav, '-af', 'highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=1', '-ac', '1', '-ar', '44100', mid]);
  const pre = measure(mid), gain = -16 - parseFloat(pre.input_i);
  ff(['-i', mid, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:level=disabled:attack=2:release=40,afade=t=in:d=0.01`, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', outMp3]);
  const q = measure(outMp3);
  const dur = parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outMp3], { encoding: 'utf8' }).stdout);
  return { lufs: +parseFloat(q.input_i).toFixed(1), peak: +parseFloat(q.input_tp).toFixed(1), dur: +dur.toFixed(2), pre_lufs: +parseFloat(pre.input_i).toFixed(1), pre_peak: +parseFloat(pre.input_tp).toFixed(1) };
}

// ---- main ---------------------------------------------------------------------------------------------------------------------
const files = fs.readdirSync(DIR, { withFileTypes: true }).filter((e) => e.isFile() && AUDIO_EXT.test(e.name) && !e.name.startsWith('.'))
  .map((e) => ({ name: e.name, full: path.join(DIR, e.name), t: fs.statSync(path.join(DIR, e.name)).mtimeMs }))
  .sort((a, b) => a.t - b.t || a.name.localeCompare(b.name, undefined, { numeric: true }));
if (!files.length) { console.error(`No audio files in ${DIR}`); process.exit(1); }

const takes = [];      // matched takes
const unmatched = [];  // {file, seg, text, best}
let fi = 0;
for (const f of files) {
  fi++;
  const wav = path.join(tmp, `f${fi}.wav`);
  try { ff(['-i', f.full, '-vn', '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_s16le', wav]); } catch (e) { unmatched.push({ file: f.name, seg: '-', text: `(cannot decode: ${e.message.slice(0, 80)})`, best: null }); continue; }
  const pcm = ff(['-i', wav, '-f', 's16le', '-ac', '1', '-ar', String(SR), '-'], { raw: true });
  const segs = findSegments(pcm);
  if (!segs.length) { unmatched.push({ file: f.name, seg: '-', text: '(no speech found)', best: null }); continue; }
  const texts = [];
  for (let i = 0; i < segs.length; i++) {
    const sf = path.join(tmp, `f${fi}_s${i}.wav`); cut(wav, segs[i].start, segs[i].end, sf);
    try { texts.push(await transcribe(sf)); } catch (e) { console.error(`  ${f.name} seg ${i + 1}: ${e.message}`); texts.push(null); }
  }
  const idByNum = new Map([...numOf].map(([id, n]) => [n, id]));
  const nums = BY_NUMBER ? [...f.name.replace(/\.[^.]+$/, '').matchAll(/\d+/g)].map((m) => +m[0]) : [];
  const forcedId = nums.length ? idByNum.get(nums[nums.length - 1]) : null;
  if (forcedId && !texts.includes(null)) {
    // separate sentences that clearly match different lines are kept apart; otherwise the whole file is one clip
    const each = texts.map((t) => bestMatches(t)[0]);
    const distinct = segs.length >= 2 && each.every((m) => m.score >= THRESH) && new Set(each.map((m) => m.id)).size === segs.length;
    if (!distinct) {
      const t = texts.join(' '), a = segs[0].start, b = segs[segs.length - 1].end;
      const sc = similarity(norm(t), lineNorm.find((x) => x.d.id === forcedId).n);
      takes.push({ id: forcedId, score: sc, dur: b - a, file: f.name, seg: 1, text: t, wav, a, b, fi, forced: true, merged: segs.length });
      continue;
    }
  }
  let prevIdx = -1;
  for (let i = 0; i < segs.length;) {
    if (texts[i] == null) { unmatched.push({ file: f.name, seg: i + 1, text: '(transcription failed)', best: null }); i++; continue; }
    // candidate spans: 1 segment, or 2-3 consecutive segments joined (a hesitation longer than the gap)
    let pick = null;
    for (let len = 1; len <= 3 && i + len <= segs.length; len++) {
      const t = texts.slice(i, i + len).join(' ');
      if (texts.slice(i, i + len).some((x) => x == null)) break;
      const ms = bestMatches(t), top = ms[0];
      // tie-break hint: among near-equal candidates prefer the line that follows the previous one in the same file
      const near = ms.filter((m) => m.score >= top.score - 0.03);
      const hinted = near.find((m) => numOf.get(m.id) > prevIdx) || near[0];
      const cand = { len, text: t, id: hinted.id, score: hinted.score, ms };
      if (!pick || (cand.score > pick.score + 0.02 && cand.score >= THRESH)) pick = cand;
      if (len === 1 && cand.score >= THRESH) break;
    }
    if (pick.score >= THRESH) {
      const a = segs[i].start, b = segs[i + pick.len - 1].end;
      takes.push({ id: pick.id, score: pick.score, dur: b - a, file: f.name, seg: i + 1, text: pick.text, wav, a, b, fi });
      prevIdx = numOf.get(pick.id); i += pick.len;
    } else {
      unmatched.push({ file: f.name, seg: i + 1, text: texts[i], best: pick.ms[0] });
      i++;
    }
  }
}

// ---- duplicates: best take per id ---------------------------------------------------------------------------------------------
const byId = new Map();
for (const t of takes) { if (!byId.has(t.id)) byId.set(t.id, []); byId.get(t.id).push(t); }
const chosen = [], dupes = [];
for (const [id, arr] of byId) {
  arr.sort((x, y) => y.score - x.score || y.dur - x.dur);
  chosen.push(arr[0]);
  if (arr.length > 1) dupes.push({ id, keep: arr[0], alts: arr.slice(1) });
}

// ---- write files --------------------------------------------------------------------------------------------------------------
const results = [];
if (!DRY) {
  fs.mkdirSync(P.pub, { recursive: true }); fs.mkdirSync(path.join(P.originals, '_files'), { recursive: true }); fs.mkdirSync(path.join(P.originals, 'alt'), { recursive: true });
  for (const f of files) fs.copyFileSync(f.full, path.join(P.originals, '_files', f.name));
  for (const t of chosen) {
    const seg = path.join(tmp, `take_${t.id}.wav`); cut(t.wav, t.a, t.b, seg);
    const outMp3 = path.join(P.pub, `${t.id}.mp3`), q = encodeClip(seg, outMp3);
    ff(['-i', seg, '-c:a', 'flac', path.join(P.originals, `${t.id}.flac`)]);
    manifest[t.id] = { id: t.id, speaker: SPEAKER, source: 'recorded', original_file: t.file, transcript: t.text, match_score: +t.score.toFixed(3),
      bytes: fs.statSync(outMp3).size, duration: q.dur, lufs: q.lufs, peak_dbtp: q.peak, imported_at: new Date().toISOString(),
      normalized: 'loudnorm -16 LUFS, mono 44.1k 96k, highpass 70 Hz, light compression' };
    results.push({ id: t.id, ...q }); t.q = q;
  }
  for (const d of dupes) d.alts.forEach((t, k) => { const seg = path.join(tmp, `alt_${d.id}_${k}.wav`); cut(t.wav, t.a, t.b, seg); ff(['-i', seg, '-c:a', 'flac', path.join(P.originals, 'alt', `${d.id}.alt${k + 1}.flac`)]); });
  fs.mkdirSync(path.dirname(P.manifest), { recursive: true });
  fs.writeFileSync(P.manifest, JSON.stringify(manifest, null, 2) + '\n');
}

// ---- report -------------------------------------------------------------------------------------------------------------------
const recordedNow = new Set(chosen.map((t) => t.id));
const isRec = (id) => recordedNow.has(id) || manifest[id]?.source === 'recorded';
const missing = dialog.filter((d) => !isRec(d.id)).sort((a, b) => numOf.get(a.id) - numOf.get(b.id));
const pct = (x) => (x * 100).toFixed(0) + '%';
const L = [];
L.push(`# Laporan impor suara: ${SPEAKER}${DRY ? ' (DRY RUN, tidak ada file ditulis)' : ''}`, '');
L.push(`Folder: \`${DIR}\` | file audio: ${files.length} | segmen cocok: ${takes.length} | baris unik cocok: ${chosen.length} dari ${dialog.length} | ambang: ${THRESH}`, '');
L.push('## Cocok', '', '| No | Id | Skor | File | Transkrip |', '|---|---|---|---|---|');
for (const t of [...chosen].sort((a, b) => numOf.get(a.id) - numOf.get(b.id))) L.push(`| ${numOf.get(t.id)} | ${t.id} | ${pct(t.score)} | ${t.file} #${t.seg} | ${t.text.replace(/\|/g, '/')} |`);
L.push('', '## Tabel lengkap (semua kalimat)', '', '| No | Id | Teks yang diharapkan | Terdengar | Skor | Durasi (s) | LUFS asli -> akhir | Puncak akhir | Catatan |', '|---|---|---|---|---|---|---|---|---|');
for (const d of [...dialog].sort((a, b) => numOf.get(a.id) - numOf.get(b.id))) {
  const t = chosen.find((x) => x.id === d.id), mm = manifest[d.id];
  if (!t && !(mm?.source === 'recorded')) { L.push(`| ${numOf.get(d.id)} | ${d.id} | ${d.text} | - | - | - | - | - | BELUM DIREKAM |`); continue; }
  const sc = t ? t.score : mm.match_score, dur = t ? (t.q?.dur ?? t.dur) : mm.duration, heard = t ? t.text : mm.transcript, q = t?.q;
  const fl = [];
  if (sc < THRESH) fl.push(`SKOR RENDAH (< ${THRESH}): putuskan pakai teks baru atau rekam ulang`);
  if (dur < 0.6) fl.push('TERLALU PENDEK (< 0,6 s)');
  if (dur > 12) fl.push('TERLALU PANJANG (> 12 s)');
  if (q && q.pre_peak >= -0.5) fl.push('KEMUNGKINAN CLIPPING');
  if (q && q.pre_lufs < -35) fl.push('SANGAT PELAN (dikuatkan ' + (-16 - q.pre_lufs).toFixed(0) + ' dB)');
  if (t?.merged > 1) fl.push(`${t.merged} potongan digabung`);
  L.push(`| ${numOf.get(d.id)} | ${d.id} | ${d.text.replace(/\|/g, '/')} | ${String(heard).replace(/\|/g, '/')} | ${pct(sc)} | ${(+dur).toFixed(2)} | ${q ? q.pre_lufs + ' -> ' + q.lufs : (mm?.lufs ?? '-')} | ${q ? q.peak : (mm?.peak_dbtp ?? '-')} | ${fl.join('; ')} |`);
}
L.push('', '## Rekaman ganda (dipakai yang terbaik)', '');
if (!dupes.length) L.push('Tidak ada.');
for (const d of dupes) L.push(`- ${numOf.get(d.id)} ${d.id}: dipakai ${d.keep.file} #${d.keep.seg} (${pct(d.keep.score)}, ${d.keep.dur.toFixed(1)} s); cadangan: ${d.alts.map((t) => `${t.file} #${t.seg} (${pct(t.score)}, ${t.dur.toFixed(1)} s)`).join(', ')}${DRY ? '' : ' (disimpan di recorded-originals/' + SPEAKER + '/alt/)'}`);
L.push('', '## Tidak cocok', '');
if (!unmatched.length) L.push('Tidak ada.');
for (const u of unmatched) L.push(`- ${u.file}${u.seg !== '-' ? ' #' + u.seg : ''}: "${u.text}"${u.best ? ` (paling mirip: ${numOf.get(u.best.id)} ${u.best.id}, ${pct(u.best.score)})` : ''}`);
L.push('', '## Kalimat yang masih belum direkam', '');
if (!missing.length) L.push('Semua kalimat sudah ada.');
for (const d of missing) L.push(`- ${numOf.get(d.id)}. ${d.id}: ${d.text}`);
L.push('');
fs.mkdirSync(path.dirname(P.report), { recursive: true });
fs.writeFileSync(P.report, L.join('\n'));
console.log(`${DRY ? '[dry-run] ' : ''}files ${files.length} | matched takes ${takes.length} | unique lines ${chosen.length}/${dialog.length} | duplicates ${dupes.length} | unmatched ${unmatched.length} | missing ${missing.length}`);
console.log(`report: ${path.relative(process.cwd(), P.report)}`);
