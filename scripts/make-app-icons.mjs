// Generates PWA and Android launcher icons from public/img/logo.webp using sharp.
//   node scripts/make-app-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(ROOT, 'public', 'img', 'logo.webp');
const OUT = path.join(ROOT, 'public', 'icons');

function bgSvg(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="g" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stop-color="#fff8d6"/>
          <stop offset="48%" stop-color="#7dd3fc"/>
          <stop offset="100%" stop-color="#1d8cf8"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#g)"/>
    </svg>`,
  );
}

async function renderIcon(size, padFrac, outPath) {
  const inner = Math.round(size * (1 - padFrac * 2));
  const fg = await sharp(LOGO)
    .trim()
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const off = Math.round((size - inner) / 2);
  await sharp(bgSvg(size))
    .composite([{ input: fg, left: off, top: off }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await renderIcon(512, 0.06, path.join(OUT, 'icon-512.png'));
  await renderIcon(192, 0.06, path.join(OUT, 'icon-192.png'));
  // Maskable icons need extra safe-zone padding (~16%) so Android circular/squircle masks never clip the logo.
  await renderIcon(512, 0.16, path.join(OUT, 'icon-maskable-512.png'));
  await renderIcon(180, 0.06, path.join(OUT, 'apple-touch-icon.png'));
  console.log('Generated PWA icons in public/icons/');

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
      await renderIcon(legacySz, 0.06, path.join(target, 'ic_launcher.png'));
      await renderIcon(legacySz, 0.06, path.join(target, 'ic_launcher_round.png'));
      // Adaptive foreground layer: transparent bg with logo centered in the inner 66% safe zone.
      const inner = Math.round(fgSz * 0.64);
      const logoBuf = await sharp(LOGO)
        .trim()
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const off = Math.round((fgSz - inner) / 2);
      await sharp({ create: { width: fgSz, height: fgSz, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: logoBuf, left: off, top: off }])
        .png({ compressionLevel: 9 })
        .toFile(path.join(target, 'ic_launcher_foreground.png'));
    }
    const bgXml = path.join(resDir, 'values', 'ic_launcher_background.xml');
    fs.mkdirSync(path.dirname(bgXml), { recursive: true });
    fs.writeFileSync(
      bgXml,
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#4FB6FA</color>\n</resources>\n',
    );
    console.log('Updated Android mipmap launcher icons');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
