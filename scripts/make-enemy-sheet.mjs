// Renders contact sheets of the enemy GLBs (front, left, back, 3/4, top) to a folder: node scripts/make-enemy-sheet.mjs <outDir> [id...]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SHEET_PORT) || 4312;
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
// Extra: `face:<name>:<url>` renders head close-ups of any GLB url (e.g. face:glen_src:/art/models/source/glen.glb).
const ids = process.argv.slice(3).length ? process.argv.slice(3) : ['curut_cemberut', 'ular_melar', 'tikus_rakus', 'elang_belang', 'gorilla_gembira'];
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
try {
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  for (const id of ids) {
    const [kind, nm, url] = id.startsWith('face:') || id.startsWith('url:') ? id.split(':') : [];
    await page.goto(kind === 'url' ? `${base}/scripts/enemy-sheet.html?url=${url}` : kind ? `${base}/scripts/enemy-sheet.html?face=1&url=${url}` : `${base}/scripts/enemy-sheet.html?id=${id}`);
    await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
    const err = await page.evaluate('window.__error');
    if (err) throw new Error(`${id}: ${err}`);
    await page.locator('#c').screenshot({ path: path.join(out, `${kind ? 'face_' + nm : 'sheet_' + id}.png`) });
    console.log(id, JSON.stringify(await page.evaluate('window.__info')));
  }
  await browser.close();
} finally {
  server.kill();
}
