// Generates PWA and Android launcher icons using Superglen's full-bleed half-face portrait
// (matching the in-game dialog box). Renders natively at 512x512 from scripts/portrait.html
// when Playwright is available, or falls back to public/portraits/superglen.webp.
//   NODE_PATH=$(npm root -g) node scripts/make-app-icons.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FALLBACK = path.join(ROOT, 'public', 'portraits', 'superglen.webp');
const OUT = path.join(ROOT, 'public', 'icons');
const PORT = Number(process.env.ICON_PORT) || 4313;

/** Sky-blue radial gradient matching `.dlg-face` in src/styles.css. */
function bgSvg(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="g" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#dff1ff"/>
          <stop offset="55%" stop-color="#a8d5f7"/>
          <stop offset="100%" stop-color="#76b5ed"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#g)"/>
    </svg>`,
  );
}

/** Render 512x512 RGBA PNGs directly from scripts/portrait.html?kind=superglen via Playwright. */
async function renderPortraits() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    const fb = await sharp(FALLBACK).resize(512, 512).png().toBuffer();
    return { full: fb, maskable: fb, adaptive: fb };
  }

  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  try {
    const base = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + '/')).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    const launch = {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    };
    const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
    if (exe) launch.executablePath = exe;
    const browser = await chromium.launch(launch);
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

    const shot = async (query) => {
      await page.goto(`${base}/scripts/portrait.html?kind=superglen${query}`);
      await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
      const err = await page.evaluate('window.__error');
      if (err) throw new Error(`portrait render failed: ${err}`);
      return page.locator('#c').screenshot({ omitBackground: true });
    };

    // Exact dialog-box crop: edge-to-edge Barongsai helmet + half-cropped cute face.
    const full = await shot('');
    // Maskable PWA icon (~80% circular safe zone): zoomed slightly out so horn + face stay inside the circle while the body extends cleanly to the bottom edge.
    const maskable = await shot('&zoom=0.80&shiftY=-0.02');
    // Android adaptive foreground (108dp with 66dp visible center): zoomed for Android launcher masks.
    const adaptive = await shot('&zoom=0.68&shiftY=-0.03');

    await browser.close();
    return { full, maskable, adaptive };
  } finally {
    server.kill();
  }
}

async function compositeIcon(fgPng, size, outPath) {
  const fg = await sharp(fgPng)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer();
  await sharp(bgSvg(size))
    .composite([{ input: fg, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { full, maskable, adaptive } = await renderPortraits();

  await compositeIcon(full, 512, path.join(OUT, 'icon-512.png'));
  await compositeIcon(full, 192, path.join(OUT, 'icon-192.png'));
  await compositeIcon(maskable, 512, path.join(OUT, 'icon-maskable-512.png'));
  await compositeIcon(full, 180, path.join(OUT, 'apple-touch-icon.png'));
  console.log('Generated Superglen half-face PWA icons in public/icons/');

  // If Capacitor Android project exists, also refresh its launcher mipmap icons.
  const resDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(resDir)) {
    const densities = [
      ['mipmap-mdpi', 48, 108],
      ['mipmap-hdpi', 72, 162],
      ['mipmap-xhdpi', 96, 216],
      ['mipmap-xxhdpi', 144, 324],
      ['mipmap-xxxhdpi', 192, 432],
    ];
    for (const [dir, legacySz, fgSz] of densities) {
      const target = path.join(resDir, dir);
      fs.mkdirSync(target, { recursive: true });
      await compositeIcon(full, legacySz, path.join(target, 'ic_launcher.png'));
      await compositeIcon(full, legacySz, path.join(target, 'ic_launcher_round.png'));
      await sharp(adaptive)
        .resize(fgSz, fgSz, { fit: 'cover' })
        .png({ compressionLevel: 9 })
        .toFile(path.join(target, 'ic_launcher_foreground.png'));
    }
    const bgXml = path.join(resDir, 'values', 'ic_launcher_background.xml');
    fs.mkdirSync(path.dirname(bgXml), { recursive: true });
    fs.writeFileSync(
      bgXml,
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#9FD1F7</color>\n</resources>\n',
    );
    console.log('Updated Android mipmap launcher icons');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
