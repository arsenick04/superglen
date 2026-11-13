// Shared helpers for the ElevenLabs scripts. The API key is never printed or stored.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const API = 'https://api.elevenlabs.io';

// Make Node's fetch honour HTTPS_PROXY. Node 22.21+/24 supports NODE_USE_ENV_PROXY=1; if it is not set yet,
// re-run this same command once with it. No-op on a machine without a proxy.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

function readDotEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return {};
  const out = {};
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const own = process.env.ELEVENLABS_API_KEY || readDotEnv().ELEVENLABS_API_KEY;
// Without a key we send a dummy value: a network proxy (e.g. the agent sandbox) may inject the real one.
const KEY = own || 'proxy-injected';
export const keySource = own ? 'env/.env' : 'proxy-injected (dummy)';

export async function api(pathname, { method = 'GET', body, accept } = {}) {
  const headers = { 'xi-api-key': KEY };
  if (body) headers['Content-Type'] = 'application/json';
  if (accept) headers.Accept = accept;
  return fetch(API + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

export async function getSubscription() {
  try {
    const r = await api('/v1/user/subscription');
    if (!r.ok) return { ok: false, status: r.status, text: (await r.text()).slice(0, 200) };
    const j = await r.json();
    return { ok: true, used: j.character_count, limit: j.character_limit, tier: j.tier, remaining: j.character_limit - j.character_count };
  } catch (e) {
    return { ok: false, status: 0, text: String(e.cause?.message || e.message) };
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
