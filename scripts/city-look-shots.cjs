const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const base = process.env.C2_URL || 'http://127.0.0.1:5173/';
const out = process.env.C2_OUT || '/tmp/c2-shots';
const phase = process.env.C2_PHASE || 'before';

const views = [
  ['plaza', 0, 22, [34, 21, 43, 0, 5, 0]],
  ['perumahan', -78, 20, [-48, 15, 42, -78, 4, 15]],
  ['pasar', 76, 76, [49, 17, 103, 76, 5, 76]],
  ['sekolah', 0, -75, [30, 18, -48, 0, 5, -82]],
  ['bank-hospital', 0, 76, [-30, 18, 48, 0, 5, 82]],
  ['bukit', 102, -89, [74, 19, -65, 102, 10, -104]],
  ['barongsai-close', 100.5, -94, [100.5, 9, -88, 100.5, 9.5, -102]],
  ['school-close', -24, -92, [-7, 9, -85, -24, 3.8, -106]],
  ['bank-close', -24, 56, [-8, 9, 45, -24, 3.8, 65]],
  ['hospital-close', 24, 56, [7, 9, 45, 24, 3.8, 65]],
  ['gudang-close', 113.5, 56, [97, 9, 45, 113.5, 3.8, 65]],
  ['pasar-close', 72.5, 95, [56, 9, 86, 72.5, 3.8, 106]],
  ['glen-close', -52, -12, [-45, 6, 2, -63, 2.4, -11.4]],
];

async function capture(browser, touch) {
  const tag = touch ? 'touch' : 'desktop';
  const context = await browser.newContext(touch
    ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
    : { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon.ico')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?level=kota&free=1&fps=0&reset=1&adaptive=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__superglen?.level === 'kota', null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  if (touch) await page.touchscreen.tap(422, 195); else await page.mouse.click(640, 360);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__superglen.pause(true));
  for (const [name, x, z, pose] of views) {
    await page.evaluate(([px, pz, camera]) => {
      const g = window.__superglen;
      g.placePlayer(px, pz);
      g.advance(90, false);
      g.lookFrom(camera);
      g.advance(3, true);
    }, [x, z, pose]);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, phase, `${name}-${tag}.png`) });
  }
  if (errors.length) console.error(`${tag}:`, errors);
  await context.close();
}

(async () => {
  fs.mkdirSync(path.join(out, phase), { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  await capture(browser, false);
  await capture(browser, true);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
