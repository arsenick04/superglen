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



const logoInfo = () => {
  const img = document.querySelector('.start-overlay .start-logo');
  const r = img && img.getBoundingClientRect();
  return { ok: !!img && img.complete && img.naturalWidth > 0 && r.width > 0 && r.height > 0 && getComputedStyle(img).display !== 'none' };
};

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
  const actions = [...document.querySelectorAll('.tc-button')].map((e) => e.dataset.action);
  const tr = document.querySelector('.tc-button[data-action=transform]');
  const trr = tr && tr.getBoundingClientRect();
  const transformOk = !!trr && trr.width >= 80 && trr.height >= 80 && trr.top >= 0 && trr.right <= vw && getComputedStyle(tr).display !== 'none';
  const minLeft = Math.min(...q('.tc-button').map((r) => r.left));
  return { vw, vh, minLeft, n: boxes.length, inside, overlap, minBtn, actions, transformOk };
};

/** Deterministic driver: real key events, but the game loop is paused and stepped in 1/60 s frames. */
function makeBot(page) {
  const held = new Set();
  const bot = { last: null, prev: null };
  bot.step = async (n = 1, render = false) => {
    bot.prev = bot.last;
    bot.last = await page.evaluate(([n, r]) => {
      const g = window.__superglen;
      g.advance(n, r);
      return {
        x: g.player.x, y: g.feetY, z: g.player.z, yaw: g.cameraYaw, g: !g.airborne, vy: g.verticalVelocity,
        peak: g.peakFeetY, mode: g.mode, h: g.airHeight, jumps: g.jumps, dj: g.doubleJumps, stomps: g.stomps,
        pr: g.pixelRatio,
      };
    }, [n, render]);
    return bot.last;
  };
  bot.pause = (on) => page.evaluate((on) => window.__superglen.pause(on), on);
  bot.setKeys = async (want) => {
    for (const k of ['w', 'a', 's', 'd']) {
      if (want.has(k) && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
      if (!want.has(k) && held.has(k)) { await page.keyboard.up(k); held.delete(k); }
    }
  };
  // World-space wish direction -> WASD keys for the current camera yaw (auto-follow may rotate it).
  bot.keysFor = (wx, wz, yaw) => {
    const out = new Set();
    const m = Math.hypot(wx, wz);
    if (m < 1e-6) return out;
    wx /= m; wz /= m;
    const mx = wx * Math.cos(yaw) - wz * Math.sin(yaw);
    const my = -wx * Math.sin(yaw) - wz * Math.cos(yaw);
    if (mx > 0.38) out.add('d');
    if (mx < -0.38) out.add('a');
    if (my > 0.38) out.add('w');
    if (my < -0.38) out.add('s');
    return out;
  };
  // Predictive bang-bang steering toward (tx, tz) using position deltas as velocity.
  bot.steer = async (tx, tz, accel, tol) => {
    const s = bot.last;
    const p = bot.prev;
    const vx = p ? (s.x - p.x) * 60 : 0;
    const vz = p ? (s.z - p.z) * 60 : 0;
    const ex = tx - (s.x + (vx * Math.abs(vx)) / (2 * accel));
    const ez = tz - (s.z + (vz * Math.abs(vz)) / (2 * accel));
    await bot.setKeys(bot.keysFor(Math.abs(ex) < tol ? 0 : Math.sign(ex), Math.abs(ez) < tol ? 0 : Math.sign(ez), s.yaw));
  };
  bot.goTo = async (tx, tz, maxFrames = 900) => {
    bot.prev = null;
    await bot.step(1);
    for (let i = 0; i < maxFrames; i++) {
      await bot.steer(tx, tz, 50, 0.05);
      await bot.step(1);
      const s = bot.last;
      const moved = Math.hypot(s.x - bot.prev.x, s.z - bot.prev.z);
      if (Math.hypot(tx - s.x, tz - s.z) < 0.1 && moved < 0.004) break;
    }
    await bot.setKeys(new Set());
    return bot.step(2);
  };
  bot.tap = async (key) => {
    await page.keyboard.down(key);
    await bot.step(1);
    await page.keyboard.up(key);
  };
  bot.release = () => bot.setKeys(new Set());
  return bot;
}

async function jumpScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  const bot = makeBot(page);
  await bot.pause(true);
  let s = await bot.step(30);

  /** Press jump, then run until landing; optional second press at frame `second`. Returns peak above takeoff. */
  async function jumpOnce(second, shotName) {
    const s0 = bot.last;
    await bot.tap('Space');
    let frames = 1;
    for (let i = 0; i < 200; i++) {
      if (shotName && i === 12) {
        await bot.step(1, true);
        await shot(page, shotName);
      }
      if (second !== undefined && i === second) await bot.tap('Space');
      else await bot.step(1);
      frames++;
      if (bot.last.g && i > 4) break;
    }
    await bot.step(10);
    return { peak: bot.last.peak - s0.y, frames, end: bot.last };
  }

  // ---- 1. Glen ------------------------------------------------------------
  check('starts in Glen mode', s.mode === 'glen');
  let r = await jumpOnce(undefined, 'glen-jump-desktop');
  check('Glen jump peak 0.6-1.2 m', r.peak > 0.6 && r.peak < 1.2, `${r.peak.toFixed(3)} m`);
  check('Glen lands grounded', r.end.g && Math.abs(r.end.y) < 0.05, `y=${r.end.y.toFixed(3)}`);
  check('Glen landing is no stomp', r.end.stomps === 0);
  const j1 = r.end.jumps;
  r = await jumpOnce(14);
  check('Glen: second press in the air does nothing', r.peak < 1.2 && r.end.jumps === j1 + 1 && r.end.dj === 0,
    `peak ${r.peak.toFixed(3)}, jumps +${r.end.jumps - j1}, double ${r.end.dj}`);
  // Jump buffer (Glen): press while still falling, just above the ground -> jumps again on landing.
  {
    const before = bot.last.jumps;
    await bot.tap('Space');
    let pressed = false;
    for (let i = 0; i < 120; i++) {
      await bot.step(1);
      if (!pressed && bot.last.vy < 0 && bot.last.h < 0.3 && !bot.last.g) {
        await bot.tap('Space');
        pressed = true;
      }
      if (pressed && bot.last.jumps > before + 1) break;
    }
    check('Glen jump buffer: press just before landing still jumps', pressed && bot.last.jumps === before + 2, `jumps +${bot.last.jumps - before}`);
    for (let i = 0; i < 150 && !bot.last.g; i++) await bot.step(1);
    await bot.step(20);
  }

  // ---- 2. Superglen ---------------------------------------------------------
  await bot.tap('e');
  s = await bot.step(20);
  check('E switches to Superglen', s.mode === 'superglen');
  const st0 = s.stomps;
  r = await jumpOnce();
  check('Superglen jump peak 2.0-2.9 m', r.peak > 2.0 && r.peak < 2.9, `${r.peak.toFixed(3)} m`);
  check('Superglen landing registers a stomp', r.end.stomps === st0 + 1, `stomps ${st0} -> ${r.end.stomps}`);
  r = await jumpOnce(26); // second press close to the apex (apex at ~26 frames)
  check('Superglen double jump peak 3.6-4.8 m', r.peak > 3.6 && r.peak < 4.8, `${r.peak.toFixed(3)} m`);
  check('double jump counted and stomp again', r.end.dj === 1 && r.end.stomps === st0 + 2, `dj ${r.end.dj}, stomps ${r.end.stomps}`);
  // A step down is not a stomp: nothing to test without a ledge here; a tiny hop must not stomp.
  // Hold Space: no auto repeat (also emulate OS key repeat with a second keydown).
  {
    const before = bot.last.jumps;
    await page.keyboard.down('Space');
    await bot.step(1);
    for (let i = 0; i < 150; i++) {
      if (i % 10 === 0) await page.keyboard.down('Space'); // repeat=true
      await bot.step(1);
    }
    await page.keyboard.up('Space');
    await bot.step(5);
    check('holding Space does not re-jump on landing', bot.last.jumps === before + 1 && bot.last.g, `jumps +${bot.last.jumps - before}`);
  }
  // Jump buffer (Superglen): a press near the ground while falling is a buffered ground jump, not the air jump.
  {
    const before = bot.last.jumps;
    const djBefore = bot.last.dj;
    await bot.tap('Space');
    let pressed = false;
    for (let i = 0; i < 200; i++) {
      await bot.step(1);
      if (!pressed && bot.last.vy < 0 && bot.last.h < 1.2 && bot.last.h > 0.3 && !bot.last.g) {
        await bot.tap('Space');
        pressed = true;
      }
      if (pressed && bot.last.jumps > before + 1) break;
    }
    check('Superglen jump buffer: press just before landing jumps again (no air jump used)',
      pressed && bot.last.jumps === before + 2 && bot.last.dj === djBefore, `jumps +${bot.last.jumps - before}, double +${bot.last.dj - djBefore}`);
    for (let i = 0; i < 200 && !bot.last.g; i++) await bot.step(1);
    await bot.step(20);
  }

  // ---- 3. Poles (Superglen) -----------------------------------------------------
  const poles = [[-5, 1], [-3, 1.5], [-1, 2], [1, 2.5], [3, 3], [5, 3.5]];
  async function hopTo(px, useDouble) {
    const dj0 = bot.last.dj;
    await bot.tap('Space');
    bot.prev = null;
    for (let i = 0; i < 160; i++) {
      const c = bot.last;
      if (useDouble && c.dj === dj0 && c.vy < 1 && c.vy > -3 && c.y > 1.5) await bot.tap('Space');
      await bot.steer(px, -23, 37, 0.03);
      await bot.step(1);
      if (bot.last.g && i > 5) break;
    }
    await bot.release();
    return bot.step(10);
  }
  await bot.goTo(-5, -21.4);
  const hopResults = [];
  s = await hopTo(-5, false);
  hopResults.push(s);
  check('pole 1.0 m: standing on top (single jump from the ground)', s.g && Math.abs(s.y - 1.0) < 0.1 && Math.abs(s.x + 5) < 0.4, `y=${s.y.toFixed(2)} x=${s.x.toFixed(2)} z=${s.z.toFixed(2)}`);
  s = await hopTo(-3, false);
  check('pole 1.5 m: hopped from the 1.0 m pole', s.g && Math.abs(s.y - 1.5) < 0.1 && Math.abs(s.x + 3) < 0.4, `y=${s.y.toFixed(2)} x=${s.x.toFixed(2)}`);
  let chainOk = true;
  const chainLog = [];
  for (let k = 2; k < 6; k++) {
    s = await hopTo(poles[k][0], false);
    chainLog.push(s.y.toFixed(2));
    if (!(s.g && Math.abs(s.y - poles[k][1]) < 0.1)) chainOk = false;
  }
  check('pole-to-pole hopping up the whole row to 3.5 m', chainOk, `tops ${chainLog.join(', ')}`);
  // Down again, then the tallest pole straight from the ground with a double jump.
  await bot.setKeys(new Set(['s']));
  await bot.step(60);
  await bot.release();
  await bot.step(60);
  await bot.goTo(5, -20.2);
  s = await hopTo(5, true);
  check('tallest pole 3.5 m reachable from the ground with a double jump', s.g && Math.abs(s.y - 3.5) < 0.1, `y=${s.y.toFixed(2)} x=${s.x.toFixed(2)} z=${s.z.toFixed(2)}`);
  await bot.setKeys(new Set(['s']));
  await bot.step(80);
  await bot.release();
  await bot.step(60);

  // ---- 4. Coyote time (Glen, 1.2 m platform edge) --------------------------------
  await bot.tap('e');
  s = await bot.step(10);
  check('E switches back to Glen', s.mode === 'glen');
  async function climbAndWalkOff(waitFrames) {
    await bot.goTo(-12, -1);
    await bot.goTo(-12, -8.5); // up the 20 deg ramp onto the platform (top 1.2 m)
    const onTop = bot.last.y > 1.1;
    bot.prev = null;
    for (let i = 0; i < 200; i++) {
      await bot.setKeys(bot.keysFor(1, 0, bot.last.yaw));
      await bot.step(1);
      if (!bot.last.g) break; // first airborne frame = left the edge
    }
    const left = !bot.last.g;
    await bot.step(waitFrames - 1);
    const hBefore = bot.last.h;
    const stillAirborne = !bot.last.g;
    await bot.tap('Space'); // the press is processed in this step
    // Rising right after the press = a coyote jump. (A press that only buffers fires after landing.)
    const out = { onTop, left, airbornePress: stillAirborne && hBefore > 0.1, jumped: bot.last.vy > 0, vy: bot.last.vy, hBefore };
    await bot.release();
    for (let i = 0; i < 200 && !bot.last.g; i++) await bot.step(1);
    await bot.step(10);
    return out;
  }
  let c = await climbAndWalkOff(6); // ~0.1 s after leaving the edge
  check('coyote: jump 0.1 s after walking off the platform edge still jumps', c.onTop && c.left && c.airbornePress && c.jumped, `onTop ${c.onTop}, left ${c.left}, h ${c.hBefore.toFixed(2)}, vy ${c.vy.toFixed(1)}`);
  c = await climbAndWalkOff(11); // 0.18 s after: too late for coyote (the press only buffers for the landing)
  check('coyote: jump 0.18 s after walking off does not jump in mid-air (Glen has no air jump)', c.onTop && c.left && c.airbornePress && !c.jumped, `h ${c.hBefore.toFixed(2)}, vy ${c.vy.toFixed(1)}`);

  await bot.pause(false);
}

async function touchScenario(page, check) {
  await sleep(2500);
  const overlayVisible = () => page.evaluate(() => !!document.querySelector('.start-overlay'));
  check('start overlay visible', await overlayVisible());
  check('logo loaded and visible (touch)', (await page.evaluate(logoInfo)).ok);
  check('touch start pill says Ketuk untuk mulai', await page.evaluate(() => {
    const t = document.querySelector('.start-text-touch');
    return getComputedStyle(t).display !== 'none' && t.textContent === 'Ketuk untuk mulai';
  }));
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
  check('Glen layout: jump + interact + transform buttons', ui.n === 3, `${ui.n}`);
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

  // ---- Superglen layout (deterministic stepping from here) ----
  const bot = makeBot(page);
  const centerOf = (action) => page.evaluate((a) => {
    const r = document.querySelector(`.tc-button[data-action=${a}]`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, action);
  const tapAction = async (action, id = 7) => {
    const p = await centerOf(action);
    await fingers.down(id, p.x, p.y);
    await bot.step(2);
    await fingers.up(id);
    await bot.step(3);
    await sleep(200); // let the button press/scale CSS transition finish before measuring layout
  };
  await bot.pause(true);
  await bot.step(30);
  let li = await page.evaluate(layoutInfo);
  check('Glen layout: transform button visible, >= 80 px', li.transformOk && li.actions.join() === 'jump,interact,transform', li.actions.join());
  await tapAction('transform');
  let sg = await bot.step(1);
  check('tapping the transform button switches to Superglen', sg.mode === 'superglen');
  li = await page.evaluate(layoutInfo);
  check('Superglen layout: 3 action buttons + transform', li.actions.join() === 'jump,laser,shield,transform', li.actions.join());
  check('844x390 Superglen: inside viewport, no overlap, >= 80', li.inside && !li.overlap && li.minBtn >= 80 && li.transformOk, `min ${li.minBtn}`);
  const jp = await centerOf('jump');
  const jumpsBefore = sg.jumps;
  await fingers.down(8, jp.x, jp.y);
  await bot.step(4);
  const air1 = await bot.step(1);
  check('jump button tap leaves the ground', !air1.g && air1.jumps === jumpsBefore + 1, `y=${air1.y.toFixed(2)}`);
  for (let i = 0; i < 40 && bot.last.h < 1.6; i++) await bot.step(1);
  await bot.step(1, true);
  await shot(page, 'superglen-touch');
  await fingers.up(8);
  for (let i = 0; i < 200 && !bot.last.g; i++) await bot.step(1);
  await bot.step(20);
  check('touch: laser/shield taps are harmless (do nothing yet)', await (async () => {
    await tapAction('laser', 9);
    await tapAction('shield', 10);
    return bot.last.g && bot.last.mode === 'superglen';
  })());
  // Peak with the touch jump button (hold: no repeat, one jump).
  {
    const j0 = bot.last.jumps;
    await fingers.down(11, jp.x, jp.y);
    await bot.step(150);
    await fingers.up(11);
    await bot.step(5);
    check('touch: holding the jump button does not re-jump', bot.last.jumps === j0 + 1, `jumps +${bot.last.jumps - j0}`);
  }

  // Layout at other sizes (leave the fullscreen the start tap entered, or Chromium refuses to resize)
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  await sleep(500);
  const MATRIX = [
    [844, 281], [844, 250], [844, 330], [667, 250], [568, 320], [932, 300], [1024, 768], [1366, 1024],
  ];
  for (const [w, h] of MATRIX) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(500);
    for (let pass = 0; pass < 2; pass++) {
      await bot.step(1);
      const mode = bot.last.mode;
      const tag = `${w}x${h} ${mode}`;
      const li2 = await page.evaluate(layoutInfo);
      const expect = mode === 'superglen' ? 'jump,laser,shield,transform' : 'jump,interact,transform';
      check(`${tag}: controls inside viewport/safe-area`, li2.inside && li2.actions.join() === expect, li2.actions.join());
      check(`${tag}: no overlap (incl. transform), buttons >= 80, transform visible`, !li2.overlap && li2.minBtn >= 80 && li2.transformOk, `min ${li2.minBtn}`);
      check(`${tag}: no button in the joystick zone`, li2.minLeft >= li2.vw * 0.45, `left ${li2.minLeft.toFixed(0)} vs ${(li2.vw * 0.45).toFixed(0)}`);
      if (w === 844 && (h === 281 || h === 250) && mode === 'superglen') await shot(page, `layout-${w}x${h}-superglen`);
      // Tap each action button in the middle: exactly that button reacts.
      for (const act of li2.actions.filter((a) => a !== 'transform')) {
        const p = await centerOf(act);
        await fingers.down(12, p.x, p.y);
        await sleep(40);
        const pressed = await page.evaluate(() => [...document.querySelectorAll('.tc-button.pressed')].map((e) => e.dataset.action).join());
        if (act === 'jump') {
          await bot.step(4);
          const air = await bot.step(1);
          check(`${tag}: jump tap leaves the ground`, !air.g && pressed === 'jump', `${pressed} y=${air.y.toFixed(2)}`);
        } else {
          check(`${tag}: tap ${act} presses only ${act}`, pressed === act, pressed);
        }
        await fingers.up(12);
        for (let i = 0; i < 300 && !bot.last.g; i++) await bot.step(1);
        await bot.step(10);
        await sleep(120);
        if (act === 'interact' && mode === 'glen') {
          // In Glen mode the interact button also toggles Superglen (test area): go back to Glen.
          check(`${tag}: interact tap switched mode`, bot.last.mode === 'superglen', bot.last.mode);
          await tapAction('transform');
          await bot.step(1);
        }
      }
      // Hit test: when two buttons' 10 px hit margins overlap, the nearest centre wins.
      if (mode === 'superglen' && w === 568) {
        const pt = await page.evaluate(() => {
          const laser = document.querySelector('.tc-button[data-action=laser]');
          const shield = document.querySelector('.tc-button[data-action=shield]');
          const vw = window.innerWidth;
          const sr0 = shield.getBoundingClientRect();
          const lr0 = laser.getBoundingClientRect();
          laser.style.right = `${vw - lr0.right + (lr0.left - sr0.right) - 4}px`; // gap of 4 px
          const sr = shield.getBoundingClientRect();
          return { x: sr.right + 1.5, y: sr.top + sr.height / 2 };
        });
        await fingers.down(13, pt.x, pt.y);
        await sleep(40);
        const pressed = await page.evaluate(() => [...document.querySelectorAll('.tc-button.pressed')].map((e) => e.dataset.action).join());
        check(`${tag}: overlapping hit margins pick the nearest button centre`, pressed === 'shield', pressed);
        await fingers.up(13);
      }
      await tapAction('transform');
    }
  }
  await bot.pause(false);

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
        check('logo loaded and visible (desktop)', (await page.evaluate(logoInfo)).ok);
        check('PC start pill says Klik untuk mulai', await page.evaluate(() => {
          const t = document.querySelector('.start-text-pc');
          return getComputedStyle(t).display !== 'none' && t.textContent === 'Klik untuk mulai';
        }));
        await shot(page, 'start-desktop');
        await page.mouse.click(640, 360);
        await sleep(600);
        check('desktop start overlay gone', await page.evaluate(() => !document.querySelector('.start-overlay')));
        // Deterministic stepping (real key events, loop stepped in 1/60 s frames): the headless
        // software renderer can stall for up to a second per frame, which made wall-clock
        // movement checks flaky.
        const adv = (n) => page.evaluate((n) => window.__superglen.advance(n, false), n);
        await page.evaluate(() => window.__superglen.pause(true));
        const a = await page.evaluate(state);
        await page.keyboard.down('w');
        await adv(90);
        await page.keyboard.up('w');
        await adv(12);
        const b = await page.evaluate(state);
        const dist = Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z);
        check('hold W 1.5 s moves >= 1 m', dist >= 1, `${dist.toFixed(2)} m`);
        check('grounded after walking', b.grounded, `y=${b.player.y.toFixed(3)}`);
        await page.keyboard.down('d');
        await adv(60);
        await page.keyboard.up('d');
        await adv(12);
        const c = await page.evaluate(state);
        await page.evaluate(() => window.__superglen.pause(false));
        const d2 = Math.hypot(c.player.x - b.player.x, c.player.z - b.player.z);
        check('hold D 1 s changes x/z', d2 > 0.5, `${d2.toFixed(2)} m`);
      }),
    );

    results.push(await runScenario(browser, 'desktop-jump', { viewport: { width: 1280, height: 720 } }, jumpScenario));

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
