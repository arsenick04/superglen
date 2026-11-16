// Renders the speaker portraits once (committed to public/portraits/, so the game never needs this at run time).
//   node scripts/make-portraits.mjs
// Heroes: head-and-shoulders render of public/models/<kind>.glb (Playwright + Three.js, via a throwaway vite dev server).
// Enemies: the owner's reference images art/reference/enemies/*.jpg cropped to the face (see ENEMY_CROPS).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'portraits');
const PORT = Number(process.env.PORTRAIT_PORT) || 4311;
const SIZE = 256;
const HEROES = ['glen', 'superglen', 'nino', 'aara'];

// Face crop per enemy as fractions of the reference image: [left, top, width, height] (square after the fit).
const ENEMY_CROPS = {
  curut_cemberut: [0.27, 0.07, 0.5, 0.5],
  ular_melar: [0.36, 0.03, 0.28, 0.28],
  tikus_rakus: [0.3, 0.1, 0.4, 0.4],
  elang_belang: [0.35, 0.14, 0.3, 0.3],
  gorilla_gembira: [0.35, 0.1, 0.3, 0.3],
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  try {
    const base = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/')).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
    page.on('pageerror', (e) => console.error('page error', e));
    for (const kind of HEROES) {
      await page.goto(`${base}/scripts/portrait.html?kind=${kind}`);
      await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
      const err = await page.evaluate('window.__error');
      if (err) throw new Error(`${kind}: ${err}`);
      const png = await page.locator('#c').screenshot({ omitBackground: true });
      await sharp(png).resize(SIZE, SIZE).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(OUT, `${kind}.webp`));
      console.log('portrait', kind);
    }
    await browser.close();
  } finally {
    server.kill();
  }
  for (const [id, [l, t, w, h]] of Object.entries(ENEMY_CROPS)) {
    const src = path.join(ROOT, 'art', 'reference', 'enemies', `${id}.jpg`);
    const meta = await sharp(src).metadata();
    const side = Math.min(w * meta.width, h * meta.height);
    const left = Math.round(l * meta.width);
    const top = Math.round(t * meta.height);
    await sharp(src)
      .extract({ left, top, width: Math.round(Math.min(side, meta.width - left)), height: Math.round(Math.min(side, meta.height - top)) })
      .resize(SIZE, SIZE)
      .webp({ quality: 88 })
      .toFile(path.join(OUT, `${id}.webp`));
    console.log('portrait', id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
