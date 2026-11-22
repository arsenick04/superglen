#!/usr/bin/env node
// Builds synthetic "phone recordings" from existing Glen clips to test scripts/import-voice.mjs.
//   node scripts/import-voice-testdata.mjs <out-dir> <id1> <id2> ... (see defaults below)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './_eleven.mjs';
const out = path.resolve(process.argv[2] || 'test-recordings');
fs.mkdirSync(out, { recursive: true });
const clip = (id) => path.join(ROOT, 'public', 'audio', `${id}.mp3`);
const ff = (a) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { encoding: 'utf8' }); if (r.status) throw new Error(r.stderr); };
/** ids: clips joined with `gap` s of silence; noise: amplitude of white noise mixed over everything; lead: leading silence */
function make(name, ids, { gap = 1, noise = 0, lead = 0, gain = 0 } = {}) {
  const inputs = ids.flatMap((id) => ['-i', clip(id)]);
  const sil = `anullsrc=r=44100:cl=mono:d=${gap}`;
  const parts = []; ids.forEach((_, i) => { parts.push(`[${i}:a]aresample=44100,aformat=channel_layouts=mono[a${i}]`); });
  const seq = ids.map((_, i) => `[a${i}]`).join(`[sil]`);
  let f = `${parts.join(';')};${sil}[sil];`;
  // concat with silence between: build list a0 sil a1 sil a2 ...
  const order = ids.flatMap((_, i) => (i ? ['[sil' + i + ']', `[a${i}]`] : [`[a${i}]`]));
  f = `${parts.join(';')};` + ids.slice(1).map((_, i) => `${sil}[sil${i + 1}]`).join(';') + (ids.length > 1 ? ';' : '') + `${order.join('')}concat=n=${order.length}:v=0:a=1[cat]`;
  let last = 'cat';
  if (lead) { f += `;[${last}]adelay=${Math.round(lead * 1000)}[ld]`; last = 'ld'; }
  f += `;[${last}]apad=pad_dur=1.2,volume=${gain}dB[sig]`;
  const args = [...inputs];
  if (noise) { args.push('-f', 'lavfi', '-i', `anoisesrc=a=${noise}:c=white:r=44100`); f += `;[sig][${ids.length}:a]amix=inputs=2:duration=first:normalize=0[o]`; } else f += ';[sig]anull[o]';
  const codec = /\.m4a$/.test(name) ? ['-c:a', 'aac', '-b:a', '64k'] : /\.webm$/.test(name) ? ['-c:a', 'libopus'] : /\.mp3$/.test(name) ? ['-c:a', 'libmp3lame'] : [];
  ff([...args, '-filter_complex', f, '-map', '[o]', '-ac', '1', ...codec, path.join(out, name)]);
}
make('Rekaman Baru 12.m4a', ['bab1_glen_lompat']);
make('New Recording 7.wav', ['bab1_glen_gelap', 'bab1_glen_gedung'], { gap: 1 });
make('Rekaman Baru 13.m4a', ['bab1_glen_pagar'], { noise: 0.01, lead: 0.7 });
make('Voice 003.mp3', ['bab1_glen_siapa', 'bab1_glen_lompat'], { gap: 1.2, noise: 0.01, gain: -8 });
make('WhatsApp Audio 2026-11-22 at 08.14.webm', ['bab1_glen_lompat'], { noise: 0.01, lead: 0.3 });
make('audio_final_v2.wav', ['bab1_glen_gedung'], { lead: 0.5, gain: -12 });
console.log(fs.readdirSync(out));
