#!/usr/bin/env node
// Offline test for the batch splitter: `node scripts/test-gemini-split.mjs`
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePcm, wavFromSamples, findSegments, splitIntoN, mapSegments, cutSegment, encodeClip, probeClip } from './lib/gemini-split.mjs';

const RATE = 24000;
// Build PCM: bursts = [{dur, gaps?:[[at,len]]}], separated by `sep` seconds of near-silence (tiny noise).
function synth(bursts, sep = 1.0) {
  const parts = []; let seed = 1;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return ((seed / 0x7fffffff) - 0.5) * 20; }; // ~ -64 dBFS
  const silence = (s) => { const a = new Int16Array(Math.round(s * RATE)); for (let i = 0; i < a.length; i++) a[i] = noise(); return a; };
  parts.push(silence(0.3));
  bursts.forEach((b, k) => {
    const n = Math.round(b.dur * RATE), a = new Int16Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.round(9000 * Math.sin(2 * Math.PI * (300 + 60 * k) * i / RATE) * (0.6 + 0.4 * Math.sin(i / 900)));
    for (const [at, len] of b.gaps || []) a.fill(0, Math.round(at * RATE), Math.round((at + len) * RATE)); // short internal pause
    parts.push(a); parts.push(silence(k === bursts.length - 1 ? 0.4 : sep));
  });
  const total = parts.reduce((s, p) => s + p.length, 0), out = new Int16Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const near = (a, b, tol = 0.06) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const mk = (id, text, extra = {}) => ({ id, text, lang: 'id', kind: 'prompt', ...extra });

// 1) happy path, 5 bursts of different lengths, one with a 0.25 s internal pause (must stay one segment)
const durs = [1.2, 0.8, 2.0, 1.5, 0.6];
const pcm = synth(durs.map((d, i) => ({ dur: d, gaps: i === 2 ? [[0.9, 0.25]] : [] })));
const r = splitIntoN(pcm, RATE, 5);
assert.ok(r.ok, r.reason);
r.segments.forEach((s, i) => near(s.dur, durs[i]));
console.log('ok 1: 5 bursts split, internal 0.25 s pause kept inside segment 3, minSilence', r.minSilence);

// 2) mapping with plausible texts; order preserved
const jobs = ['Halo apa kabar kamu', 'Satu dua', 'Ini adalah kalimat yang agak panjang ya', 'Berapa jumlahnya ya', 'Kucing'].map((t, i) => mk('q' + i, t));
const m = mapSegments(r.segments, jobs, () => [0.3, 3]);
assert.ok(m.ok); m.pairs.forEach((p, i) => { assert.equal(p.job.id, 'q' + i); near(p.seg.dur, durs[i]); });
console.log('ok 2: segments mapped to lines in order');

// 3) mismatch: only 4 bursts for 5 lines -> not ok, never a mapping
const r4 = splitIntoN(synth(durs.slice(0, 4).map((d) => ({ dur: d }))), RATE, 5);
assert.equal(r4.ok, false); assert.equal(mapSegments(r4.segments, jobs).ok, false);
// 3b) extra burst (6 for 5)
assert.equal(splitIntoN(synth([...durs, 1].map((d) => ({ dur: d }))), RATE, 5).ok, false);
// 3c) lines merged because pause too short (0.3 s separator)
assert.equal(splitIntoN(synth(durs.map((d) => ({ dur: d })), 0.3), RATE, 5).ok, false);
console.log('ok 3: count mismatch (fewer, more, merged) rejected');

// 4) implausible duration rejects the whole batch (long text got a 0.8 s clip)
const bad = mapSegments(r.segments, [mk('a', 'x'.repeat(200)), ...jobs.slice(1)]);
assert.equal(bad.ok, false); assert.match(bad.reason, /implausible/);
console.log('ok 4: implausible duration rejects batch');

// 5) WAV round trip + cut + encode to mp3 (needs ffmpeg)
const wav = wavFromSamples(pcm, RATE), dec = decodePcm(wav);
assert.equal(dec.rate, RATE); assert.equal(dec.samples.length, pcm.length);
assert.equal(decodePcm(Buffer.from(pcm.buffer)).samples.length, pcm.length);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsplit-')), out = path.join(dir, 'c.mp3');
try {
  encodeClip(wavFromSamples(cutSegment(pcm, RATE, r.segments[1]), RATE), out);
  const p = probeClip(out); near(p.duration, durs[1], 0.15);
  console.log('ok 5: wav parse, cut and mp3 encode (duration', p.duration + ' s)');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('all tests passed');
