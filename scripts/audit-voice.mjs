#!/usr/bin/env node
/**
 * Voice audit: finds every line the game can show (dialog bubbles, call-outs, quiz prompts, cinematic subtitles) and checks
 * that public/audio/<id>.mp3 exists and that audio/manifest.json has a matching hash. Static scan only: no network, no credits.
 *
 *   node scripts/audit-voice.mjs            -> writes audio/missing-report.md, prints totals
 *   node scripts/audit-voice.mjs --json=f   -> also writes the machine readable list to f
 *
 * Status: ok | missing-clip | stale-text | missing-in-dialog-json | no-id.
 * Lines spoken by a non-player character that address the player with the single name Glen/Superglen are marked `waiting-name`
 * (they will be voiced later as <id>_g / <id>_sg once the text uses the {nama} placeholder) and are NOT counted as to-generate.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f, fb) => (fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) : fb);
const JSON_OUT = process.argv.find((a) => a.startsWith('--json='))?.slice(7);

const dialog = rd('audio/dialog.json', []);
const manifest = rd('audio/manifest.json', {});
const voices = rd('audio/voices.json', {});
const rules = rd('audio/delivery.json', {});
const variasi = rd('content/nino_variasi.json', {});

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
const modelOf = (v) => v.model || 'eleven_v4';
function settingsOf(v) {
  const s = { stability: v.stability, similarity_boost: v.similarity_boost };
  if (/multilingual_v2|turbo_v2|flash_v2/.test(modelOf(v))) { if (v.style != null) s.style = v.style; if (v.use_speaker_boost != null) s.use_speaker_boost = v.use_speaker_boost; }
  return s;
}
const pitchOf = (v, j) => (typeof j.pitchSemitones === 'number' ? j.pitchSemitones : typeof rules._pitch?.[j.id] === 'number' ? rules._pitch[j.id] : v.pitchSemitones || 0);
function ttsText(j) {
  if (j.delivery) return j.delivery;
  if (typeof rules._ids?.[j.id] === 'string') return rules._ids[j.id];
  const rule = rules[j.category];
  if (!rule) return j.text;
  const variants = rule.variants || [rule.prefix || ''];
  return `${variants[parseInt(hash(j.id).slice(0, 6), 16) % variants.length]}${j.text}${rule.suffix || ''}`;
}
const sig = (j, v) => hash(JSON.stringify([ttsText(j), v?.voice_id, modelOf(v || {}), settingsOf(v || {}), pitchOf(v || {}, j)]));

function categoryOf(id) {
  return id.startsWith('bab1_') ? 'bab1' : id.startsWith('bab2_') ? 'bab2' : id.startsWith('quiz_nino') ? 'quiz_nino' : id.startsWith('bab') ? id.split('_')[0] : 'lainnya';
}
function priority(id, src) {
  if (/^(bab\d|rakus_|elang_|forest_(?!aara_quiz)|flight_|combat_|gorila_|finale|ending|intro)/.test(id)) return 1;
  if (/^(quiz_|nino_(pujian|coba|semangat)|aara_quiz|speak_|aara_quiz_)/.test(id) || /src\/data\/quiz/.test(src || '')) return 2;
  if (/^(kota_|heal_)/.test(id)) return 3;
  return 4;
}
// Direct address of the player by the single name Glen / Superglen, said by someone else.
const VOC = /(^|[.!?]\s+|,\s*)(Super)?glen\s*([,!.?]|$)/i;
const vocative = (speaker, text) => speaker !== 'glen' && VOC.test(text);

// ---- collect -----------------------------------------------------------------------------------------------------------------
/** id -> {id, speaker, text, src, lang} (first wins) */
const lines = new Map();
const noId = [];
const addLine = (l) => { if (!lines.has(l.id)) lines.set(l.id, l); else if (!lines.get(l.id).alt && lines.get(l.id).text !== l.text) lines.get(l.id).alt = l; };

const dialogById = new Map(dialog.map((d) => [d.id, d]));
for (const d of dialog) addLine({ id: d.id, speaker: d.speaker, text: d.text, src: 'audio/dialog.json', lang: d.lang || 'id', fromDialog: true });

// nino variasi
for (const [kind, arr] of Object.entries(variasi)) if (Array.isArray(arr)) for (const l of arr) addLine({ id: l.id, speaker: 'nino', text: l.text, src: `content/nino_variasi.json (${kind})`, lang: 'id', delivery: l.delivery, variasi: true });

// quiz json
for (const name of ['berhitung', 'inggris', 'mandarin', 'hewan', 'membaca']) {
  const f = `src/data/quiz/${name}.json`;
  for (const q of rd(f, [])) {
    if (q.audio_id && q.prompt) addLine({ id: q.audio_id, speaker: 'nino', text: q.prompt, src: f, lang: 'id', quiz: true, cat: 'quiz_' + ({ berhitung: 'hitung', membaca: 'baca' }[name] || name) });
    if (q.set === 'forest' && q.audio_id && q.prompt) addLine({ id: `aara_${q.audio_id}`, speaker: 'aara', text: q.prompt, src: f, lang: 'id', quiz: true, cat: 'quiz_aara' });
    const d = q.display;
    if (d?.kind === 'speak' && d.speak_audio_id && d.text) { const zh = d.lang === 'zh'; addLine({ id: d.speak_audio_id, speaker: zh ? 'mandarin' : 'english', text: d.text, src: f, lang: d.lang, quiz: true, cat: zh ? 'speak_zh' : 'speak_en' }); }
  }
}

// source files
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const STR = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + '`(?:[^`\\\\]|\\\\.)*`)';
const unq = (s) => s.slice(1, -1).replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, ' ');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const referenced = new Map(); // id -> file:line (string ids passed to say/sequence)

for (const f of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, f);
  if (/src\/(gameplay\/Dialog\.ts|ui\/|core\/Game\.ts)/.test(rel)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const seenRegions = new Set();
  for (const m of src.matchAll(/\bspeaker\s*:\s*['"](\w+)['"]/g)) {
    // enclosing braces
    let a = m.index, depth = 0;
    for (; a >= 0; a--) { const c = src[a]; if (c === '}') depth++; else if (c === '{') { if (depth === 0 && src[a - 1] !== '$') break; depth--; } }
    let b = m.index, d2 = 0;
    for (; b < src.length; b++) { const c = src[b]; if (c === '{') d2++; else if (c === '}') { if (d2 === 0) break; d2--; } }
    if (a < 0 || seenRegions.has(a)) continue;
    seenRegions.add(a);
    const body = src.slice(a, b + 1);
    const tm = body.match(new RegExp(String.raw`\btext\s*:\s*` + STR));
    if (!tm) continue;
    const im = body.match(/\bid\s*:\s*['"]([\w]+)['"]/);
    const text = unq(tm[1]);
    const speaker = m[1];
    const ln = lineOf(src, a + body.indexOf(tm[0]));
    const dynamic = tm[1].startsWith('`') && text.includes('${');
    if (im && !dynamic) addLine({ id: im[1], speaker, text, src: `${rel}:${ln}`, lang: 'id' });
    else noId.push({ file: rel, line: ln, speaker, text, why: dynamic ? 'dynamic-template' : 'no-id' });
  }
  // QuizLines helper: line('id', 'text')
  if (/quiz\/lines\.ts$/.test(rel)) for (const m of src.matchAll(new RegExp(String.raw`\bline\(\s*'([\w]+)'\s*,\s*` + STR + String.raw`\s*\)`, 'g'))) addLine({ id: m[1], speaker: 'nino', text: unq(m[2]), src: `${rel}:${lineOf(src, m.index)}`, lang: 'id' });
  // string ids passed straight to say()/sequence()
  for (const m of src.matchAll(/\b(?:say|sequence)\(\s*(\[[^\]]*\]|'[\w]+')/g)) for (const s of m[1].matchAll(/'([a-z][a-z0-9]*_[\w]+)'/g)) if (!referenced.has(s[1])) referenced.set(s[1], `${rel}:${lineOf(src, m.index)}`);
  // CityPeople shout bubbles
  for (const m of src.matchAll(/onShout\?\.\([^,]+,[^,]+,[^,]+,\s*'([^']+)'\)/g)) noId.push({ file: rel, line: lineOf(src, m.index), speaker: '(shout)', text: m[1], why: 'shout-bubble' });
}

// City missions (CityPlaces.ts) -> kota_<mission>_{offer,remind,done}; greetings from CityPeople.ts
{
  const rel = 'src/world/kota/CityPlaces.ts';
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const giverVoice = (g) => `res_${g}`;
  const givers = new Set();
  for (const m of src.matchAll(/missions\.push\(\{\s*id:\s*'(\w+)',\s*giver:\s*'(\w+)'[\s\S]*?offer:\s*'((?:[^'\\]|\\.)*)',\s*remind:\s*'((?:[^'\\]|\\.)*)',\s*done:\s*'((?:[^'\\]|\\.)*)'/g)) {
    givers.add(m[2]);
    const ln = lineOf(src, m.index);
    for (const [k, t] of [['offer', m[3]], ['remind', m[4]], ['done', m[5]]]) {
      // the 'surat' mission is finished by the doctor
      const sp = k === 'done' && m[1] === 'surat' ? 'res_ani' : giverVoice(m[2]);
      addLine({ id: `kota_${m[1]}_${k}`, speaker: sp, text: t.replace(/\\'/g, "'"), src: `${rel}:${ln}`, lang: 'id' });
    }
  }
  const cp = 'src/world/kota/CityPeople.ts';
  for (const g of new Set([...givers, 'ani', 'bima'])) {
    addLine({ id: `kota_${g}_halo`, speaker: giverVoice(g), text: 'Halo, Glen!', src: `${cp}:369`, lang: 'id' });
    addLine({ id: `kota_${g}_terima`, speaker: giverVoice(g), text: 'Terima kasih, Glen!', src: `${cp}:369`, lang: 'id' });
  }
  addLine({ id: 'kota_glen_ketemu', speaker: 'glen', text: 'Ketemu! Ayo antar pulang.', src: `${cp}:486`, lang: 'id' });
  addLine({ id: 'kota_glen_semua', speaker: 'glen', text: 'Sudah semua! Ayo kembali.', src: `${cp}:486`, lang: 'id' });
}

// ---- evaluate ----------------------------------------------------------------------------------------------------------------
const rows = [];
const voiceMissing = new Map();
for (const l of lines.values()) {
  const dj = dialogById.get(l.id);
  const mp3 = fs.existsSync(path.join(ROOT, 'public/audio', `${l.id}.mp3`));
  const m = manifest[l.id];
  const recorded = dj?.source === 'recorded' || m?.source === 'recorded';
  let status;
  const job = { id: l.id, speaker: dj?.speaker || l.speaker, text: dj?.text ?? l.text, delivery: dj?.delivery ?? l.delivery, pitchSemitones: dj?.pitchSemitones, category: l.cat || (l.fromDialog || dj ? categoryOf(l.id) : categoryOf(l.id)) };
  if (l.quiz) job.category = l.cat;
  if (l.variasi) job.category = 'quiz_nino';
  const inJobs = l.fromDialog || l.quiz || l.variasi || dj;
  if (!inJobs) status = 'missing-in-dialog-json';
  else if (recorded && mp3) status = 'ok';
  else if (!mp3) status = 'missing-clip';
  else if (!m) status = 'ok'; // handmade clip
  else if (m.source === 'gemini') status = m.hash === hash(job.text) ? 'ok' : 'stale-text'; // scripts/generate-gemini.mjs
  else {
    const v = voices[job.speaker];
    const srcTextDiffers = !l.fromDialog && !l.quiz && !l.variasi && dj && dj.text !== l.text;
    status = m.hash !== sig(job, v) || srcTextDiffers ? 'stale-text' : 'ok';
  }
  // src text different from dialog.json text for src-defined lines
  if (status === 'ok' && dj && !l.fromDialog && dj.text !== l.text) status = 'stale-text';
  const text = l.fromDialog || !dj ? l.text : l.text;
  const speaker = job.speaker;
  const spk = voices[speaker];
  if (!spk || !spk.voice_id || /^ISI_/.test(spk.voice_id)) { if (!voiceMissing.has(speaker)) voiceMissing.set(speaker, []); voiceMissing.get(speaker).push(l.id); }
  const waiting = vocative(speaker, text);
  const tts = ttsText({ ...job, text });
  rows.push({ id: l.id, speaker, text, status, src: l.src, prio: priority(l.id, l.src), waiting, chars: status === 'ok' ? 0 : tts.length, ttsPreview: tts, hasDialogEntry: !!dj });
}
for (const [id, where] of referenced) if (!lines.has(id)) rows.push({ id, speaker: '?', text: '(id referenced in code, no text anywhere)', status: 'missing-in-dialog-json', src: where, prio: priority(id), waiting: false, chars: 0 });

const count = (f) => rows.filter(f).length;
const todo = rows.filter((r) => r.status !== 'ok' && !r.waiting && r.status !== 'missing-in-dialog-json');
const waitingRows = rows.filter((r) => r.waiting && r.status !== 'ok');
const esc = (s) => String(s).replace(/\|/g, '\\|');
const order = { 'missing-in-dialog-json': 0, 'missing-clip': 1, 'stale-text': 2, ok: 3 };
const table = (rs) => ['| id | speaker | text | status | chars | src |', '|---|---|---|---|---|---|', ...rs.map((r) => `| ${r.id} | ${r.speaker} | ${esc(r.text)} | ${r.status}${r.waiting ? ' (waiting name)' : ''} | ${r.chars} | ${r.src} |`)].join('\n');

const sum = (rs) => rs.reduce((a, r) => a + r.chars, 0);
const out = [];
out.push('# Laporan audit suara (otomatis: `npm run audio:audit`)', '');
out.push(`Diaudit: ${rows.length} kalimat beride, ${noId.length} kalimat tanpa id.`);
out.push(`- ok: ${count((r) => r.status === 'ok')}`);
out.push(`- missing-clip: ${count((r) => r.status === 'missing-clip')}`);
out.push(`- stale-text: ${count((r) => r.status === 'stale-text')}`);
out.push(`- missing-in-dialog-json: ${count((r) => r.status === 'missing-in-dialog-json')}`);
out.push(`- menunggu varian nama (tidak dibuat sekarang): ${waitingRows.length}`);
out.push(`- perlu dibuat sekarang: ${todo.length} kalimat, sekitar ${sum(todo)} karakter`);
out.push('');
out.push('## Perlu dibuat (urut prioritas)', '');
for (const p of [1, 2, 3, 4]) {
  const rs = todo.filter((r) => r.prio === p).sort((a, b) => a.id.localeCompare(b.id));
  out.push(`### Prioritas ${p} (${rs.length} kalimat, ${sum(rs)} karakter)`, '', rs.length ? table(rs) : '(kosong)', '');
}
out.push('## missing-in-dialog-json (id dipakai di kode, belum ada di audio/dialog.json)', '');
const mj = rows.filter((r) => r.status === 'missing-in-dialog-json' && !r.waiting);
out.push(mj.length ? table(mj) : '(kosong)', '');
out.push('## Menunggu varian nama (sapaan Glen/Superglen oleh tokoh lain)', '');
out.push(waitingRows.length ? table(waitingRows.sort((a, b) => a.id.localeCompare(b.id))) : '(kosong)', '');
out.push('## Tanpa id (belum bisa disuarakan; kode perlu memberi id)', '');
out.push('| file:line | speaker | text | catatan |', '|---|---|---|---|', ...noId.map((n) => `| ${n.file}:${n.line} | ${n.speaker} | ${esc(n.text)} | ${n.why} |`), '');
out.push('## Pembicara tanpa suara di audio/voices.json', '');
out.push(voiceMissing.size ? [...voiceMissing].map(([s, ids]) => `- ${s}: ${ids.length} kalimat (${ids.slice(0, 6).join(', ')}${ids.length > 6 ? ', ...' : ''})`).join('\n') : '(semua ada)', '');
const okRows = rows.filter((r) => r.status === 'ok');
out.push(`## ok (${okRows.length})`, '', 'Tidak dirinci; jalankan audit untuk daftar penuh dengan --json=file.', '');
const notes = path.join(ROOT, 'audio/missing-report.notes.md');
if (fs.existsSync(notes)) out.push(fs.readFileSync(notes, 'utf8'));
fs.writeFileSync(path.join(ROOT, 'audio/missing-report.md'), out.join('\n'));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ rows, noId, voiceMissing: [...voiceMissing] }, null, 2));

console.log(`audited ${rows.length} | ok ${okRows.length} | missing-clip ${count((r) => r.status === 'missing-clip')} | stale-text ${count((r) => r.status === 'stale-text')} | missing-in-dialog-json ${mj.length} | waiting-name ${waitingRows.length} | no-id ${noId.length}`);
console.log(`to generate now: ${todo.length} lines, ~${sum(todo)} chars`);
console.log('speakers without voice:', [...voiceMissing.keys()].join(', ') || '(none)');
