// Generate the three animal sounds that have no free recording (anjing, sapi, bebek) with the
// ElevenLabs Sound Effects API. The other four (kucing, ayam, kuda, singa) are recordings: not handled here.
// Usage: npm run audio:sfx [-- --only=anjing] [--force] [--dry-run] [--takes=1]
// Each take is post-processed and saved as audio/voice-tests/sfx_<key>_take<n>.mp3; take 1 becomes
// public/audio/sfx_hewan_<key>.mp3. Pick another take by copying it over the final file.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, api, getSubscription, keySource } from './_eleven.mjs';

const SFX = {
  anjing: { prompt: 'A friendly medium-sized dog barking twice, clear, close microphone, no background noise', seconds: 2.5, influence: 0.6 },
  sapi: { prompt: 'A single cow mooing, clear, close, calm farm, no background noise', seconds: 2.5, influence: 0.6 },
  bebek: { prompt: 'A duck quacking three times, clear, close, no background noise', seconds: 2.5, influence: 0.6 },
};

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const only = opt('only');
const takes = Number(opt('takes') || 1);
const force = flag('force') || !!only;
const dry = flag('dry-run');
if (only && !SFX[only]) { console.error(`Unknown key "${only}". Known: ${Object.keys(SFX).join(', ')}`); process.exit(1); }

const outDir = path.join(ROOT, 'public/audio');
const altDir = path.join(ROOT, 'audio/voice-tests');
fs.mkdirSync(altDir, { recursive: true });
console.log(`key source: ${keySource}`);

const before = await getSubscription();
if (before.ok) console.log(`quota before: ${before.used}/${before.limit}`);

for (const [key, cfg] of Object.entries(SFX)) {
  if (only && only !== key) continue;
  const final = path.join(outDir, `sfx_hewan_${key}.mp3`);
  if (fs.existsSync(final) && !force) { console.log(`skip ${key} (exists; use --force or --only=${key})`); continue; }
  if (dry) { console.log(`[dry-run] ${key}: "${cfg.prompt}" ${cfg.seconds}s influence ${cfg.influence} x${takes}`); continue; }
  for (let t = 1; t <= takes; t++) {
    const r = await api('/v1/sound-generation', {
      method: 'POST', accept: 'audio/mpeg',
      body: { text: cfg.prompt, duration_seconds: cfg.seconds, prompt_influence: cfg.influence },
    });
    if (!r.ok) { console.error(`${key} take ${t}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); break; }
    const raw = path.join(altDir, `sfx_${key}_raw${t}.tmp.mp3`);
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    const take = path.join(altDir, `sfx_${key}_take${t}.mp3`);
    // mono 44.1k, trim leading silence, fades, ~-16 LUFS, 96 kbps
    const af = 'silenceremove=start_periods=1:start_threshold=-45dB,afade=t=in:d=0.02,loudnorm=I=-16:TP=-1.5:LRA=11';
    const p = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-ac', '1', '-ar', '44100', '-af', af, '-b:a', '96k', take]);
    fs.unlinkSync(raw);
    if (p.status !== 0) { console.error(`${key} take ${t}: ffmpeg failed`); break; }
    // 80 ms fade out needs the final duration
    const d = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', take]).stdout.toString());
    const tmp = take + '.tmp.mp3';
    spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', take, '-af', `afade=t=out:st=${Math.max(0, d - 0.08).toFixed(3)}:d=0.08`, '-ac', '1', '-ar', '44100', '-b:a', '96k', tmp]);
    fs.renameSync(tmp, take);
    if (t === 1) fs.copyFileSync(take, final);
    console.log(`${key} take ${t}: ${d.toFixed(2)} s`);
  }
}
const after = await getSubscription();
if (before.ok && after.ok) console.log(`quota after: ${after.used}/${after.limit} (used ${after.used - before.used})`);
