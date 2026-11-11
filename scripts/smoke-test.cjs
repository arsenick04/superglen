/* Smoke test: serves dist/ with vite preview and drives the game with Playwright (Chromium). */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
const OUT = path.join(ROOT, 'test-results');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ping() {
  return new Promise((resolve) => {
    const req = http.get(URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await ping()) return;
    await sleep(300);
  }
  throw new Error('vite preview did not respond in time');
}

const state = () => window.__superglen && JSON.parse(JSON.stringify(window.__superglen));

async function sampleFps(page, n = 6) {
  const vals = [];
  for (let i = 0; i < n; i++) {
    const s = await page.evaluate(state);
    vals.push(s.fps);
    await sleep(550);
  }
  return { min: Math.min(...vals), avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) };
}

async function runScenario(browser, name, ctxOpts, body) {
  const result = { name, checks: [], errors: [], fps: { min: 0, avg: 0 } };
  const check = (label, ok, detail) => result.checks.push({ label, ok: !!ok, detail });
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') result.errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => result.errors.push(`pageerror: ${e.message}`));
  try {
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
    await body(page, check);
    result.fps = await sampleFps(page);
  } catch (e) {
    check('scenario ran without exception', false, e.message);
  }
  fs.mkdirSync(OUT, { recursive: true });
  try {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  } catch (e) {
    result.errors.push(`screenshot: ${e.message}`);
  }
  await ctx.close();
  return result;
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  const killServer = () => {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch (_) {
      /* already gone */
    }
  };
  process.on('exit', killServer);

  let results = [];
  let browser;
  try {
    await waitForServer(30000);
    browser = await chromium.launch({
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });

    results.push(
      await runScenario(browser, 'desktop', { viewport: { width: 1280, height: 720 } }, async (page, check) => {
        await sleep(2000);
        await page.mouse.click(640, 360);
        await sleep(300);
        const a = await page.evaluate(state);
        await page.keyboard.down('w');
        await sleep(1500);
        await page.keyboard.up('w');
        await sleep(200);
        const b = await page.evaluate(state);
        const dist = Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z);
        check('hold W 1.5 s moves >= 1 m', dist >= 1, `${dist.toFixed(2)} m`);
        check('grounded after walking', b.grounded, `y=${b.player.y.toFixed(3)}`);
        await page.keyboard.down('d');
        await sleep(1000);
        await page.keyboard.up('d');
        await sleep(200);
        const c = await page.evaluate(state);
        const d2 = Math.hypot(c.player.x - b.player.x, c.player.z - b.player.z);
        check('hold D 1 s changes x/z', d2 > 0.5, `${d2.toFixed(2)} m`);
      }),
    );

    results.push(
      await runScenario(
        browser,
        'iphone-landscape',
        { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
        async (page, check) => {
          await sleep(3000);
          const info = await page.evaluate(() => {
            const c = document.querySelector('#game canvas');
            const r = c.getBoundingClientRect();
            const card = document.querySelector('.hud-card');
            return {
              w: r.width,
              h: r.height,
              iw: window.innerWidth,
              ih: window.innerHeight,
              card: !!card && getComputedStyle(card).display !== 'none',
              state: JSON.parse(JSON.stringify(window.__superglen)),
            };
          });
          check(
            'canvas fills viewport',
            Math.abs(info.w - info.iw) <= 1 && Math.abs(info.h - info.ih) <= 1,
            `${info.w}x${info.h} vs ${info.iw}x${info.ih}`,
          );
          check('PC start card not visible', !info.card);
          check('player grounded', info.state.grounded, `y=${info.state.player.y.toFixed(3)}`);
        },
      ),
    );
  } catch (e) {
    results.push({ name: 'setup', checks: [{ label: 'setup', ok: false, detail: e.message }], errors: [], fps: { min: 0, avg: 0 } });
  } finally {
    if (browser) await browser.close().catch(() => {});
    killServer();
  }

  let failed = false;
  console.log('\nSMOKE TEST SUMMARY');
  console.log('scenario'.padEnd(18) + 'fps min/avg'.padEnd(14) + 'errors  checks');
  for (const r of results) {
    const bad = r.checks.filter((c) => !c.ok).length + r.errors.length;
    if (bad) failed = true;
    console.log(
      r.name.padEnd(18) + `${r.fps.min}/${r.fps.avg}`.padEnd(14) + String(r.errors.length).padEnd(8) +
        `${r.checks.filter((c) => c.ok).length}/${r.checks.length} ok`,
    );
    for (const c of r.checks) console.log(`   ${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.detail ? ` (${c.detail})` : ''}`);
    for (const e of r.errors) console.log(`   ERROR ${e}`);
  }
  console.log('\nNote: headless fps uses a software renderer (SwiftShader) and is only indicative.');
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
