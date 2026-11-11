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


const dist2 = (a, b) => Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z);

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** Multi-touch through CDP (Playwright's touchscreen can only tap). Each finger has an id. */
async function makeFingers(page) {
  const cdp = await page.context().newCDPSession(page);
  const pts = new Map();
  const send = (type, list) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: list.map(([id, p]) => ({ x: p.x, y: p.y, id })),
    });
  return {
    async down(id, x, y) {
      pts.set(id, { x, y });
      await send('touchStart', [...pts.entries()]);
    },
    async move(id, x, y, steps = 8) {
      const from = pts.get(id);
      for (let i = 1; i <= steps; i++) {
        pts.set(id, { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps });
        await send('touchMove', [...pts.entries()]);
        await sleep(16);
      }
    },
    async up(id) {
      const p = pts.get(id);
      pts.delete(id);
      await send('touchEnd', [[id, p]]);
    },
    async upAll() {
      pts.clear();
      await send('touchEnd', []);
    },
  };
}

const layoutInfo = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const q = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
  const boxes = [...q('.tc-button'), ...q('.tc-hint')].map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
  const inside = boxes.every((r) => r.l >= 0 && r.t >= 0 && r.r <= vw && r.b <= vh);
  let overlap = false;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const c = boxes[j];
      if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) overlap = true;
    }
  const minBtn = Math.min(...q('.tc-button').map((r) => Math.min(r.width, r.height)));
  return { vw, vh, n: boxes.length, inside, overlap, minBtn };
};

async function touchScenario(page, check) {
  await sleep(2500);
  const overlayVisible = () =>
    page.evaluate(() => {
      const o = document.querySelector('.start-overlay');
      return !!o && getComputedStyle(o).display !== 'none';
    });
  check('start overlay visible', await overlayVisible());
  check('touchUi true before start', (await page.evaluate(state)).touchUi);
  const fingers = await makeFingers(page);
  const s0 = await page.evaluate(state);
  // Input must be ignored while the overlay is up (finger held down: release would count as the start tap).
  await fingers.down(1, 120, 300);
  await fingers.move(1, 120, 240);
  await sleep(800);
  const s0b = await page.evaluate(state);
  check('player does not move before start', dist2(s0, s0b) < 0.05 && !s0b.started, `${dist2(s0, s0b).toFixed(3)} m`);
  await shot(page, 'start-overlay');
  await fingers.up(1);
  await sleep(500);
  const s1 = await page.evaluate(state);
  check('started after tap', s1.started);
  check('start overlay gone', !(await overlayVisible()));
  const ui = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const btns = [...document.querySelectorAll('.tc-button')].map((e) => e.getBoundingClientRect());
    const hint = document.querySelector('.tc-hint').getBoundingClientRect();
    const card = document.querySelector('.hud-card');
    return {
      n: btns.length,
      big: btns.every((r) => r.width >= 80 && r.height >= 80),
      inside: btns.every((r) => r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh),
      hintVisible: hint.width > 0 && getComputedStyle(document.querySelector('.tc-hint')).visibility === 'visible',
      card: !!card && getComputedStyle(card).display !== 'none',
      text: [...document.querySelectorAll('.tc-button')].every((e) => e.textContent.trim() === ''),
    };
  });
  check('2 buttons', ui.n === 2, `${ui.n}`);
  check('buttons >= 80x80', ui.big);
  check('buttons inside viewport', ui.inside);
  check('buttons have no text', ui.text);
  check('joystick hint visible', ui.hintVisible);
  check('no PC card', !ui.card);

  // Joystick
  const j0 = await page.evaluate(state);
  await fingers.down(1, 120, 300);
  await fingers.move(1, 120, 240);
  await sleep(1500);
  const j1 = await page.evaluate(state);
  check('joystick up 60 px moves >= 1 m', dist2(j0, j1) >= 1, `${dist2(j0, j1).toFixed(2)} m`);
  await fingers.up(1);
  await sleep(600);
  const j2 = await page.evaluate(state);
  await sleep(500);
  const j3 = await page.evaluate(state);
  check('player stops after release', dist2(j2, j3) < 0.03, `${dist2(j2, j3).toFixed(3)} m`);

  // Camera drag
  const y0 = (await page.evaluate(state)).cameraYaw;
  await fingers.down(2, 500, 120);
  await fingers.move(2, 650, 120, 10);
  await fingers.up(2);
  await sleep(200);
  const y1 = (await page.evaluate(state)).cameraYaw;
  check('camera drag changes yaw', Math.abs(y1 - y0) > 0.3, `${(y1 - y0).toFixed(3)} rad (expect ~0.75)`);

  // Multi-touch
  await fingers.down(1, 120, 300);
  await fingers.move(1, 120, 240);
  await sleep(300);
  const m0 = await page.evaluate(state);
  await fingers.down(2, 500, 120);
  await fingers.move(2, 650, 120, 10);
  const jb = await page.evaluate(() => {
    const r = document.querySelector('.tc-button').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await fingers.down(3, jb.x, jb.y);
  await sleep(100);
  const pressedClass = await page.evaluate(() => document.querySelector('.tc-button').classList.contains('pressed'));
  await sleep(600);
  await fingers.up(3);
  await sleep(100);
  const releasedClass = await page.evaluate(() => !document.querySelector('.tc-button').classList.contains('pressed'));
  const m1 = await page.evaluate(state);
  check('multi-touch: player keeps moving', dist2(m0, m1) >= 1, `${dist2(m0, m1).toFixed(2)} m`);
  check('multi-touch: yaw changes', Math.abs(m1.cameraYaw - m0.cameraYaw) > 0.3, `${(m1.cameraYaw - m0.cameraYaw).toFixed(3)} rad`);
  check('jump button shows pressed then released', pressedClass && releasedClass);
  await shot(page, 'playing-844x390');
  await fingers.up(2);
  await fingers.up(1);

  // Finger sliding off a button releases it
  await fingers.down(3, jb.x, jb.y);
  await sleep(80);
  await fingers.move(3, jb.x - 150, jb.y - 100, 6);
  const slid = await page.evaluate(() => !document.querySelector('.tc-button').classList.contains('pressed'));
  check('sliding off a button releases it', slid);
  await fingers.up(3);

  // Layout at other sizes (leave the fullscreen the start tap entered, or Chromium refuses to resize)
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  await sleep(500);
  for (const [w, h, name] of [
    [667, 375, 'layout-667x375'],
    [1024, 768, 'layout-1024x768'],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(500);
    const li = await page.evaluate(layoutInfo);
    check(`${w}x${h}: controls inside viewport`, li.inside && li.n === 3, `n=${li.n}`);
    check(`${w}x${h}: no overlap, buttons >= 80`, !li.overlap && li.minBtn >= 80, `min ${li.minBtn}`);
    await shot(page, name);
  }

  // Portrait
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(500);
  const rot = await page.evaluate(() => {
    const o = document.querySelector('.rotate-overlay');
    return { display: getComputedStyle(o).display, text: o.textContent };
  });
  check('portrait: rotate overlay visible', rot.display !== 'none' && rot.text.includes('Putar HP ke samping'));
  await shot(page, 'portrait-390x844');
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(500);
  const back = await page.evaluate(() => getComputedStyle(document.querySelector('.rotate-overlay')).display);
  check('landscape: rotate overlay hidden again', back === 'none');
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
        touchScenario,
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
