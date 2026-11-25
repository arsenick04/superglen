/**
 * Pure helpers for Gemini batch TTS: parse PCM/WAV, split by silence, map segments to lines, encode clips.
 * No network, no key handling. Used by scripts/generate-gemini.mjs and scripts/test-gemini-split.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Gemini TTS returns raw s16le 24 kHz mono (or a RIFF WAV). Returns { samples: Int16Array, rate }. */
export function decodePcm(buf, defaultRate = 24000) {
  if (buf.length > 44 && buf.slice(0, 4).toString() === 'RIFF') {
    let rate = defaultRate, pos = 12;
    while (pos + 8 <= buf.length) {
      const id = buf.slice(pos, pos + 4).toString(), size = buf.readUInt32LE(pos + 4);
      if (id === 'fmt ') rate = buf.readUInt32LE(pos + 12);
      if (id === 'data') { const end = Math.min(buf.length, pos + 8 + size); return { samples: toInt16(buf.subarray(pos + 8, end)), rate }; }
      pos += 8 + size + (size & 1);
    }
    return { samples: toInt16(buf.subarray(44)), rate };
  }
  return { samples: toInt16(buf), rate: defaultRate };
}
function toInt16(b) { const n = b.length >> 1, s = new Int16Array(n); for (let i = 0; i < n; i++) s[i] = b.readInt16LE(i * 2); return s; }

export function wavFromSamples(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(samples[i], 44 + i * 2);
  return b;
}

/**
 * RMS-based silence splitter. Frames of 10 ms are "active" when RMS > thresholdDb (dBFS). Gaps shorter than
 * minSilence merge into one segment; blips shorter than minSeg are dropped. Returns [{start,end,dur}] in seconds.
 */
export function findSegments(samples, rate, { minSilence = 0.55, thresholdDb = -40, frameMs = 10, minSeg = 0.08 } = {}) {
  const fl = Math.max(1, Math.round(rate * frameMs / 1000)), nf = Math.floor(samples.length / fl), thr = 32768 * 10 ** (thresholdDb / 20);
  const active = new Uint8Array(nf);
  for (let f = 0; f < nf; f++) { let s = 0; for (let i = f * fl, e = i + fl; i < e; i++) s += samples[i] * samples[i]; active[f] = Math.sqrt(s / fl) > thr ? 1 : 0; }
  const runs = []; let cur = null;
  const gapFrames = Math.round(minSilence * 1000 / frameMs);
  for (let f = 0; f < nf; f++) {
    if (!active[f]) continue;
    if (cur && f - cur.last - 1 < gapFrames) cur.last = f; else { cur = { first: f, last: f }; runs.push(cur); }
  }
  const t = (f) => f * fl / rate;
  return runs.map((r) => ({ start: t(r.first), end: t(r.last + 1) })).map((s) => ({ ...s, dur: s.end - s.start })).filter((s) => s.dur >= minSeg);
}

/** Try several min-silence values (long to short) until the segment count equals n. */
export function splitIntoN(samples, rate, n, opts = {}) {
  const tries = opts.minSilences || [0.8, 0.7, 0.6, 0.5, 0.45];
  let last = [];
  for (const ms of tries) {
    const segs = findSegments(samples, rate, { ...opts, minSilence: ms });
    last = segs;
    if (segs.length === n) return { ok: true, segments: segs, minSilence: ms };
  }
  return { ok: false, segments: last, reason: `segment count ${last.length} != ${n}` };
}

/** Plausible duration window (seconds) from the text; same rules as the single-clip sanity check. */
export function durationBounds(job) {
  const n = [...job.text].length;
  if (job.lang === 'zh') return [0.3, 3.0];
  if (job.kind === 'kata') return [0.25, 2.5];
  return [Math.max(0.5, n * 0.035), n * 0.16 + 2.0];
}

/** Map segments to jobs in order. Never returns a partial mapping: all lines must pass or the whole batch fails. */
export function mapSegments(segments, jobs, bounds = durationBounds) {
  if (segments.length !== jobs.length) return { ok: false, reason: `segment count ${segments.length} != ${jobs.length}` };
  const bad = [];
  segments.forEach((s, i) => { const [lo, hi] = bounds(jobs[i]); if (s.dur < lo || s.dur > hi) bad.push(`${jobs[i].id} ${s.dur.toFixed(2)}s not in [${lo.toFixed(2)},${hi.toFixed(2)}]`); });
  if (bad.length) return { ok: false, reason: 'implausible duration: ' + bad.join('; ') };
  return { ok: true, pairs: jobs.map((job, i) => ({ job, seg: segments[i] })) };
}

/** Cut a segment out of the PCM with a little padding (the encoder trims silence again). */
export function cutSegment(samples, rate, seg, pad = 0.05) {
  const a = Math.max(0, Math.floor((seg.start - pad) * rate)), b = Math.min(samples.length, Math.ceil((seg.end + pad) * rate));
  return samples.slice(a, b);
}

const ff = (args, opt = {}) => spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', ...opt });

/** Encode raw audio (WAV or s16le 24k) to mono 44.1k 96k mp3: trim silence, 10 ms fades, loudnorm -16 LUFS TP -1.5. */
export function encodeClip(raw, outFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gem-'));
  try {
    const inArgs = raw.slice(0, 4).toString() === 'RIFF' ? ['-i'] : ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i'];
    const src = path.join(tmp, 'in.bin'); fs.writeFileSync(src, raw);
    const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse';
    const fade = 'afade=t=in:d=0.01,areverse,afade=t=in:d=0.01,areverse';
    const pre = `highpass=f=60,${trim},${fade}`;
    const m = ff([...inArgs, src, '-af', `${pre},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
    const jm = m.stderr.match(/\{[\s\S]*"target_offset"[\s\S]*?\}/);
    let norm = 'loudnorm=I=-16:TP=-1.5:LRA=11';
    if (jm) { const s = JSON.parse(jm[0]); if (isFinite(+s.input_i)) norm += `:measured_I=${s.input_i}:measured_TP=${s.input_tp}:measured_LRA=${s.input_lra}:measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true`; }
    const r = ff(['-y', ...inArgs, src, '-af', `${pre},${norm}`, '-ar', '44100', '-ac', '1', '-b:a', '96k', outFile]);
    if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr.slice(-200));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export function probeClip(file) {
  const d = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const v = ff(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const mean = parseFloat(v.stderr.match(/mean_volume: ([-\d.]+) dB/)?.[1] ?? '-99');
  const peak = parseFloat(v.stderr.match(/max_volume: ([-\d.]+) dB/)?.[1] ?? '-99');
  return { duration: +parseFloat(d.stdout).toFixed(2), mean, peak };
}
