// Renders 3D store thumbnails once from the game's own GLB models and shaders (committed to public/img/shop/).
//   node scripts/make-shop-thumbs.mjs
// Optional: SHOP_SHEET=/tmp/shop-sheet.png writes a labelled contact sheet of all thumbnails for visual review.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'shop');
const PORT = Number(process.env.SHOP_THUMB_PORT) || 4312;
const SIZE = 256;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const rendered = [];
  try {
    const base = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/')).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
    const exe = process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    if (exe) launch.executablePath = exe;
    const browser = await chromium.launch(launch);
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
    page.on('pageerror', (e) => console.error('page error', e));
    page.on('console', (m) => {
      if (m.type() === 'error') console.error('console error:', m.text());
    });
    await page.goto(`${base}/scripts/shop-thumb.html`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const ids = await page.evaluate('window.__ids');
    for (const id of ids) {
      await page.evaluate((itemId) => window.__renderItem(itemId), id);
      const png = await page.locator('#c').screenshot({ omitBackground: true });
      const outPath = path.join(OUT, `${id}.webp`);
      await sharp(png).resize(SIZE, SIZE).webp({ quality: 88, alphaQuality: 92 }).toFile(outPath);
      rendered.push({ id, buf: await sharp(png).resize(160, 160).png().toBuffer() });
      console.log('shop thumb', id);
    }
    await browser.close();
  } finally {
    server.kill();
  }

  if (process.env.SHOP_SHEET && rendered.length > 0) {
    fs.mkdirSync(path.dirname(process.env.SHOP_SHEET), { recursive: true });
    const cols = 6;
    const cell = 176;
    const rows = Math.ceil(rendered.length / cols);
    const composites = rendered.map((r, i) => ({
      input: r.buf,
      left: (i % cols) * cell + 8,
      top: Math.floor(i / cols) * cell + 8,
    }));
    await sharp({
      create: { width: cols * cell, height: rows * cell, channels: 4, background: { r: 255, g: 244, b: 224, alpha: 1 } },
    })
      .composite(composites)
      .png()
      .toFile(process.env.SHOP_SHEET);
    console.log('sheet', process.env.SHOP_SHEET);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
