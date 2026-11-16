/* Screenshots of the enemy models in the game (idle / attack / dizzy) for review: node scripts/enemy-shots.cjs <outDir> [snake|rakus|rats|all]
   Needs a fresh `npm run build`; serves dist/ with vite preview on SMOKE_PORT (default 4304). */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SMOKE_PORT) || 4304;
const URL = `http://localhost:${PORT}/`;
const OUT = process.argv[2];
const WHICH = process.argv[3] || 'all';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adv = (page, n) => page.evaluate((n) => window.__superglen.advanceAsync(n, false), n);
const SAVE = (done, extra) => ({ version: 1, where: 'kota', chaptersDone: done, skills: { laser: true, shield: true, fly: true }, lastMode: 'superglen', discovered: { lab: true }, doneAt: Object.fromEntries(done.map((d, i) => [d, Date.now() - 9000 + i * 1000])), ...extra });
async function open(page, data, touch) {
  await page.addInitScript((d) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('superglen.save.v1', JSON.stringify(d)); } }, data);
  await page.goto(URL + '?fps=0');
  await page.waitForFunction(() => !!window.__superglen && !window.__superglen.loading && window.__superglen.level === 'kota', null, { timeout: 60000 });
  await sleep(900);
  if (touch) await page.touchscreen.tap(422, 195);
  else await page.mouse.click(640, 360);
  await sleep(500);
  await page.evaluate(() => window.__superglen.pause(true));
  await adv(page, 30);
  console.log('open', JSON.stringify(await page.evaluate(() => ({ lvl: window.__superglen.level, ch5: !!window.__ch5, ch6: !!window.__ch6, save: (localStorage.getItem('superglen.save.v1') || '').slice(0, 160) }))));
}
const stand = (page, px, pz, tx, tz, back = 0) => page.evaluate(([px, pz, tx, tz]) => {
  const g = window.__superglen;
  g.placePlayer(px, pz);
  const y = Math.atan2(tx - px, tz - pz);
  g.health.face(y);
  g.setCameraYaw(y + Math.PI);
}, [px, pz, tx, tz]);
// Canvas grab right after a forced render (page.screenshot stalls for minutes with the software renderer on a heavy scene); HUD not included.
const shot = async (page, name) => {
  await adv(page, 2);
  const url = await page.evaluate(() => { window.__superglen.advance(1, true); return document.querySelector('canvas').toDataURL('image/png'); });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
};
async function until(page, fn, max, step) {
  for (let f = 0; f < max; f += step) { const b = await page.evaluate(fn); if (b) return true; await adv(page, step); }
  return false;
}
(async () => {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await sleep(300); }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const touch of process.env.MODES ? process.env.MODES.split(',').map((m) => m === 'touch') : [false, true]) {
      const tag = touch ? 'touch' : 'desk';
      const ctx = await browser.newContext(touch ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
      await ctx.addInitScript(() => { window.__SG_TEST = true; });
      const fresh = async () => {
        const pg = await ctx.newPage();
        pg.on('pageerror', (e) => console.log('PAGEERROR', e.message));
        pg.on('console', (m) => { if (m.type() === 'error' || /failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 160)); });
        return pg;
      };
      let page = await fresh();
      if (WHICH === 'all' || WHICH === 'snake') {
        await open(page, SAVE(['bab1', 'bab2', 'bab3', 'bab4'], { bab5: { step: 'city' } }), touch);
        console.log(tag, 'models', JSON.stringify(await page.evaluate(() => window.__enemyModels.info())));
        await page.evaluate(() => window.__ch5.mute(true));
        const B = { x: -72.5, z: -72.5 };
        const SP = JSON.parse(process.env.SPOTS || '[[-64.5,-72.5],[-72.5,-64.5],[-80.5,-72.5],[-72.5,-80.5]]');
        await stand(page, SP[0][0], SP[0][1], B.x, B.z);
        await page.evaluate(() => { window.__ch5.engage(); });
        await adv(page, 600);
        await page.evaluate(() => window.__ch5.mute(true));
        console.log(tag, 'boss', JSON.stringify(await page.evaluate(() => window.__ch5.boss())).slice(0, 300));
        for (let k = 0; k < SP.length; k++) {
          await stand(page, SP[k][0], SP[k][1], B.x, B.z);
          await adv(page, 12);
          await shot(page, `snake_idle_${tag}_${k}`);
        }
        // Lunge: wind-up, stretched (seen from the side), dizzy.
        await stand(page, -62, -72.5, B.x, B.z);
        await page.evaluate(() => window.__ch5.lunge());
        await until(page, () => window.__ch5.boss().phase === 'wind', 60, 2);
        await adv(page, 25);
        await shot(page, `snake_wind_${tag}`);
        await until(page, () => window.__ch5.boss().phase === 'lunge' && window.__ch5.boss().ext > 4, 400, 2);
        await stand(page, -60, -82, B.x + 4, B.z);
        await shot(page, `snake_stretch_${tag}`);
        await until(page, () => window.__ch5.boss().phase === 'dizzy', 400, 2);
        await adv(page, 30);
        await stand(page, -60, -82, B.x + 4, B.z);
        await shot(page, `snake_dizzy_${tag}`);
      }
      if (WHICH === 'all' || WHICH === 'rats') {
        await page.close();
        page = await fresh();
        await open(page, SAVE(['bab1', 'bab2'], { bab3: { step: 'chase', tamed: [] } }), touch);
        await adv(page, 700);
        await page.evaluate(() => { window.__ch3.mute(true); window.__ch3.setRng(0.99); });
        const look = async (i, name, dx = 0, dz = -2.2) => {
          const r = await page.evaluate((i) => window.__ch3.rats()[i], i);
          await stand(page, r.x + dx, r.z + dz, r.x, r.z);
          await adv(page, 2);
          await shot(page, `rat_${name}_${tag}`);
        };
        await look(0, 'calm');
        await page.evaluate(() => { window.__ch3.mute(false); window.__ch3.attack(0, 1); });
        await adv(page, 18);
        await look(0, 'wind');
        await adv(page, 40);
        await look(0, 'charge');
        await page.evaluate(() => { window.__ch3.mute(true); });
        await adv(page, 200);
        await page.evaluate(() => window.__ch3.hit(0));
        await adv(page, 6);
        await look(0, 'hit');
        await page.evaluate(() => window.__ch3.tame(1));
        await adv(page, 14);
        await look(1, 'tamed');
      }
      if (WHICH === 'all' || WHICH === 'rakus') {
        await page.close();
        page = await fresh();
        await open(page, SAVE(['bab1', 'bab2', 'bab3', 'bab4', 'bab5'], { bab6: { step: 'city' } }), touch);
        await page.evaluate(() => window.__ch6.mute(true));
        const info = await page.evaluate(() => window.__ch6.boss());
        console.log(tag, 'rakus boss', JSON.stringify(info).slice(0, 200));
        const bx = info.pos ? info.pos.x : info.x, bz = info.pos ? info.pos.z : info.z;
        const spots = [[bx + 7, bz], [bx, bz + 7], [bx - 7, bz]];
        for (let k = 0; k < spots.length; k++) {
          await stand(page, spots[k][0], spots[k][1], bx, bz);
          await adv(page, 20);
          await shot(page, `rakus_idle_${tag}_${k}`);
        }
        await page.evaluate(() => window.__ch6.engage());
        await adv(page, 700);
        await page.evaluate(() => window.__ch6.mute(true));
        for (const [name, fn] of [['wind', () => window.__ch6.slam()], ['eat', () => window.__ch6.cue(0)]]) {
          await page.evaluate(fn);
          await adv(page, 30);
          await stand(page, bx + 8, bz + 3, bx, bz);
          await shot(page, `rakus_${name}_${tag}`);
        }
        console.log(tag, 'rakus phase', JSON.stringify(await page.evaluate(() => window.__ch6.boss())).slice(0, 200));
      }
      await ctx.close();
    }
  } finally { await browser.close(); server.kill(); }
})();
