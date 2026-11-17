const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const base = process.env.C2_URL || 'http://127.0.0.1:5173/';
const out = process.env.C2_OUT || '/tmp/c2-shots';
const phase = process.env.C2_PHASE || 'before';
const viewFilter = process.env.C2_VIEWS ? new RegExp(process.env.C2_VIEWS) : null;

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
  ['main-road-ground', -20, 50, [-6, 2.5, 50, -27, 0.3, 50]],
  ['local-road-ground', -80, 0, [-65, 2.5, 0, -87, 0.3, 0]],
];
for (const [name, x, z, w, d, wall, face] of [
  ['school', -24, -106.7, 22, 11, 6.65, 0],
  ['hospital', 24, 65.7, 22, 11, 6.65, 1],
  ['glen', -63, -11.4, 5.6, 6, 3.4, 2],
]) {
  const f = [[0, 1], [0, -1], [1, 0], [-1, 0]][face];
  const px = x + f[0] * (w / 2 + 4);
  const pz = z + f[1] * (d / 2 + 4);
  const gap = name === 'glen' ? 8 : 12;
  for (const [side, dx, dz] of [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]]) {
    const y = name === 'glen' && side === 'north' ? 9.5 : wall * 0.95 + 1;
    views.push([`${name}-side-${side}`, px, pz, [x + dx * (w / 2 + gap), y, z + dz * (d / 2 + gap), x, wall * 0.52, z]]);
  }
}

async function capture(browser, touch) {
  const tag = touch ? 'touch' : 'desktop';
  const context = await browser.newContext(touch
    ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
    : { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  const states = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon.ico')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?level=kota&free=1&fps=0&reset=1&adaptive=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__superglen?.level === 'kota', null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  if (touch) await page.touchscreen.tap(422, 195); else await page.mouse.click(640, 360);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__superglen.pause(true));
  for (const [name, x, z, pose] of views) {
    if (viewFilter && !viewFilter.test(name)) continue;
    await page.evaluate(([px, pz, camera, groundY]) => {
      const g = window.__superglen;
      g.placePlayer(px, pz);
      if (groundY !== null) g.teleportFeet(px, groundY + 0.05, pz);
      g.advance(90, false);
      g.lookFrom(camera);
    }, [x, z, pose, name === 'bukit' || name.startsWith('barongsai') ? 6 : null]);
    let state;
    let lastLoaded = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.waitForTimeout(50);
      state = await page.evaluate(() => {
        const g = window.__superglen;
        g.advance(15, false);
        return { player: { ...g.player }, feetY: g.feetY, loaded: g.levelInfo.visLoaded, loading: g.levelInfo.visLoading };
      });
      if (state.loading === 0 && state.loaded === lastLoaded) break;
      lastLoaded = state.loaded;
    }
    if (Math.hypot(state.player.x - x, state.player.z - z) > 1.5 || (name.startsWith('barongsai') && state.feetY < 5.8)) throw new Error(`Invalid capture placement ${name}: ${JSON.stringify(state)}`);
    states.push({ name, ...state });
    await page.evaluate(() => window.__superglen.advance(3, true));
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(out, phase, `${name}-${tag}.png`) });
  }
  fs.writeFileSync(path.join(out, phase, `${tag}-state.json`), JSON.stringify(states, null, 2));
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
