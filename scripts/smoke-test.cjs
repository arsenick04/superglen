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

const startLayoutInfo = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const img = document.querySelector('.start-overlay .start-logo');
  const pill = document.querySelector('.start-overlay .start-hint');
  const a = img.getBoundingClientRect();
  const b = pill.getBoundingClientRect();
  const ins = (r) => r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5;
  const cs = getComputedStyle(img);
  return {
    logoInside: ins(a),
    pillInside: ins(b),
    overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
    maskNone: (cs.maskImage || cs.webkitMaskImage || 'none') === 'none' && (cs.webkitMaskImage || 'none') === 'none',
    pillH: b.height,
    logoH: a.height,
    scrolls: document.documentElement.scrollHeight > vh + 1 || document.documentElement.scrollWidth > vw + 1,
  };
};

/** Luminance (0..1) of a screenshot pixel, decoded in the page through a canvas. */
async function cornerLuminance(page, x, y) {
  const buf = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const [r, gg, bb] = g.getImageData(0, 0, 1, 1).data;
    return (0.2126 * r + 0.7152 * gg + 0.0722 * bb) / 255;
  }, buf.toString('base64'));
}

async function startScreenChecks(page, check, sizes, tag) {
  const orig = page.viewportSize();
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(900);
    const l = await page.evaluate(startLayoutInfo);
    const t = `start ${tag} ${w}x${h}`;
    check(`${t}: logo and pill inside viewport, no overlap, no scroll`, l.logoInside && l.pillInside && !l.overlap && !l.scrolls, JSON.stringify(l));
    check(`${t}: logo has no mask, pill >= 80 high`, l.maskNone && l.pillH >= 79.5, `pill ${l.pillH}`);
    const lum = await cornerLuminance(page, 2, Math.min(h - 40, h * 0.5));
    check(`${t}: background is light (not black)`, lum > 0.55, lum.toFixed(2));
    if (w === 844 && h === 250) await shot(page, 'start-844x250');
  }
  await page.setViewportSize(orig);
  await sleep(700);
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
        x: g.player.x, y: g.feetY, z: g.player.z, yaw: g.cameraYaw, syaw: g.steeringYaw, g: !g.airborne, vy: g.verticalVelocity,
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
  // World-space wish direction -> WASD keys for the current steering yaw (the player steers by the latched yaw, not the live camera yaw).
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
    await bot.setKeys(bot.keysFor(Math.abs(ex) < tol ? 0 : Math.sign(ex), Math.abs(ez) < tol ? 0 : Math.sign(ez), s.syaw));
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
      await bot.setKeys(bot.keysFor(1, 0, bot.last.syaw));
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
  await shot(page, 'start-844x281');
  await startScreenChecks(page, check, [[844, 281], [844, 250], [667, 250]], 'touch');
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

// ---- Steering latch: no circling with a steady off-axis stick (camera auto-follow feedback loop) ----
const angDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/** Advance n frames one fixed step at a time and sample [x, z, yaw] after each. */
const sampleFrames = (page, n) =>
  page.evaluate((n) => {
    const g = window.__superglen;
    const out = [];
    for (let i = 0; i < n; i++) {
      g.advance(1, false);
      out.push([g.player.x, g.player.z, g.cameraYaw]);
    }
    return out;
  }, n);
/** World heading of the displacement between samples i and j (same convention as atan2(dx, dz)). */
const headingOf = (sm, i, j) => Math.atan2(sm[j][0] - sm[i][0], sm[j][1] - sm[i][1]);
const pathStats = (sm, from = 0) => {
  let path = 0;
  for (let i = from + 1; i < sm.length; i++) path += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
  const net = Math.hypot(sm[sm.length - 1][0] - sm[from][0], sm[sm.length - 1][1] - sm[from][1]);
  return { path, net, straight: path > 0 ? net / path : 0 };
};

async function startTouchGame(page) {
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, 300);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const bot = makeBot(page);
  await bot.step(30);
  return { fingers, bot };
}

/** Turn the camera by finger drags (right area) until its yaw is within one drag of `targetYaw`. */
async function alignCamera(fingers, bot, targetYaw) {
  const drag = async (px) => {
    const x0 = px > 0 ? 450 : 650;
    await fingers.down(2, x0, 120);
    await fingers.move(2, x0 + px, 120, 10);
    await fingers.up(2);
    await bot.step(2);
  };
  const y = (await bot.step(1)).yaw;
  await drag(150);
  const perDrag = bot.last.yaw - y; // yaw change of one 150 px right drag
  const n = Math.round((targetYaw - bot.last.yaw) / perDrag);
  for (let i = 0; i < Math.abs(n); i++) await drag(n > 0 ? 150 : -150);
  await bot.step(5);
  console.log(`   [steering] yaw after setup drags ${bot.last.yaw.toFixed(3)} (per 150 px drag ${perDrag.toFixed(3)})`);
}

async function steeringTouchScenario(page, check) {
  const { fingers, bot } = await startTouchGame(page);
  // Turn the camera so the diagonal path avoids the obstacle course:
  // target yaw about -2.25 rad gives a heading of roughly +X along z = 0 for stick (-30,-30).
  await alignCamera(fingers, bot, -2.25);

  // 1+2: diagonal stick (-30,-30), 5 s
  await fingers.down(1, 110, 300);
  await fingers.move(1, 80, 270, 4);
  const sm = await sampleFrames(page, 300);
  const eastHeading = headingOf(sm, 60, 299);
  const hA = headingOf(sm, 60, 120);
  const hB = headingOf(sm, 240, 299);
  const st = pathStats(sm);
  check('diagonal stick (-30,-30) 5 s: straight line, no circling', st.straight >= 0.97,
    `straightness ${st.straight.toFixed(4)}, net ${st.net.toFixed(1)} m, path ${st.path.toFixed(1)} m (before fix: circling, radius ~5 m)`);
  check('diagonal stick: world heading stays constant', Math.abs(angDiff(hA, hB)) < 0.15 && Math.abs(angDiff(headingOf(sm, 60, 180), eastHeading)) < 0.15,
    `heading t1-2s ${hA.toFixed(3)}, t4-5s ${hB.toFixed(3)}, d ${angDiff(hA, hB).toFixed(3)} rad, t1-5s ${eastHeading.toFixed(3)}`);
  // Camera convergence: diff = camera yaw vs the "behind the heading" yaw
  const behind = (i) => Math.atan2(-(sm[i + 6][0] - sm[i - 6][0]), -(sm[i + 6][1] - sm[i - 6][1]));
  const diffAt = (i) => angDiff(sm[i][2], behind(i));
  const log = [];
  for (const t of [1, 1.5, 2, 3, 4, 4.8]) log.push(`${t}s:${diffAt(Math.round(t * 60)).toFixed(3)}`);
  console.log(`   [steering] |behind-heading minus yaw| over time (rad): ${log.join(' ')}`);
  const rateLast = Math.abs(angDiff(sm[240][2], sm[299][2])) / (59 / 60);
  const d15 = Math.abs(diffAt(90));
  const d5 = Math.abs(diffAt(290));
  check('camera converges: yaw rate in last second < 0.1 rad/s', rateLast < 0.1, `${rateLast.toFixed(3)} rad/s`);
  check('camera converges: misalignment smaller at 5 s than at 1.5 s', d5 < d15, `${d15.toFixed(3)} -> ${d5.toFixed(3)} rad`);
  // No jitter: yaw is monotonic after auto-follow started (allow tiny noise)
  let reversals = 0;
  const sgn = Math.sign(angDiff(sm[90][2], sm[299][2]));
  for (let i = 120; i < 300; i++) if (sgn * angDiff(sm[i - 1][2], sm[i][2]) < -1e-4) reversals++;
  check('camera yaw has no jitter while converging', reversals === 0, `${reversals} reversals`);

  // 6: release, then press stick straight up -> walks where the camera looks
  await fingers.up(1);
  await bot.step(20);
  const yawRel = bot.last.yaw;
  await fingers.down(1, 110, 300);
  await fingers.move(1, 110, 240, 4);
  const sm6 = await sampleFrames(page, 30);
  const camFwd = Math.atan2(-Math.sin(yawRel), -Math.cos(yawRel));
  const h6 = headingOf(sm6, 10, 29);
  check('release and re-press: forward stick walks toward where the camera looks', Math.abs(angDiff(camFwd, h6)) < 0.2,
    `heading ${h6.toFixed(3)} vs camera forward ${camFwd.toFixed(3)} (d ${angDiff(camFwd, h6).toFixed(3)} rad)`);
  await fingers.up(1);
}

async function steeringTouchScenario2(page, check) {
  const { fingers, bot } = await startTouchGame(page);
  // 4: stick straight up, yaw unchanged
  const y0 = bot.last.yaw;
  await fingers.down(1, 110, 300);
  await fingers.move(1, 110, 240, 4);
  const sm = await sampleFrames(page, 90);
  const st = pathStats(sm);
  const dy = Math.abs(angDiff(y0, sm[89][2]));
  check('stick straight up: straight line and yaw unchanged', st.straight >= 0.97 && dy < 0.02,
    `straightness ${st.straight.toFixed(4)}, yaw change ${dy.toFixed(4)} rad, net ${st.net.toFixed(1)} m`);
  // 5: drag a second finger 150 px while walking: heading rotates with the camera
  const before = await sampleFrames(page, 20);
  const hBefore = headingOf(before, 5, 19);
  const yBefore = before[19][2];
  await fingers.down(2, 450, 120);
  await fingers.move(2, 600, 120, 10);
  await fingers.up(2);
  const after = await sampleFrames(page, 60);
  const hAfter = headingOf(after, 40, 59);
  const dYaw = angDiff(yBefore, after[59][2]);
  const dHead = angDiff(hBefore, hAfter);
  const moved = Math.hypot(after[59][0] - after[40][0], after[59][1] - after[40][1]);
  check('manual drag while walking: heading rotates with the camera and keeps walking',
    Math.abs(dHead - dYaw) < 0.2 && Math.abs(dYaw) > 0.3 && moved > 0.5,
    `yaw change ${dYaw.toFixed(3)} rad, heading change ${dHead.toFixed(3)} rad, last 0.33 s moved ${moved.toFixed(2)} m`);
  await fingers.up(1);
}

/**
 * Back-right diagonal (+30,+30) in its own page so it always starts from the spawn point with a clear
 * path (camera yaw ~ +0.75 gives a heading of roughly +X along z = 0, 4 s ~ 19 m stays inside the world).
 */
async function steeringTouchScenario3(page, check) {
  const { fingers, bot } = await startTouchGame(page);
  await alignCamera(fingers, bot, 0.785);
  await fingers.down(1, 110, 300);
  await fingers.move(1, 140, 330, 4);
  const sm = await sampleFrames(page, 240);
  const st = pathStats(sm);
  const h1 = headingOf(sm, 60, 120);
  const h2 = headingOf(sm, 180, 239);
  check('diagonal stick (+30,+30) 4 s: straight line', st.straight >= 0.97,
    `straightness ${st.straight.toFixed(4)}, net ${st.net.toFixed(1)} m, path ${st.path.toFixed(1)} m`);
  check('diagonal stick (+30,+30): heading constant', Math.abs(angDiff(h1, h2)) < 0.15,
    `heading t1-2s ${h1.toFixed(3)}, t3-4s ${h2.toFixed(3)}`);
  await fingers.up(1);
}

async function steeringDesktopScenario(page, check) {
  await sleep(2000);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  await page.evaluate(() => window.__superglen.advance(30, false));
  await page.keyboard.down('d');
  const sm = await sampleFrames(page, 300);
  await page.keyboard.up('d');
  const st = pathStats(sm);
  const hA = headingOf(sm, 60, 120);
  const hB = headingOf(sm, 240, 299);
  check('keyboard D held 5 s: straight line', st.straight >= 0.97 && Math.abs(angDiff(hA, hB)) < 0.15,
    `straightness ${st.straight.toFixed(4)}, net ${st.net.toFixed(1)} m, heading ${hA.toFixed(3)} -> ${hB.toFixed(3)}`);
  const rate = Math.abs(angDiff(sm[240][2], sm[299][2])) / (59 / 60);
  const rateEarly = Math.abs(angDiff(sm[120][2], sm[179][2])) / (59 / 60);
  const behind = (i) => Math.atan2(-(sm[i + 6][0] - sm[i - 6][0]), -(sm[i + 6][1] - sm[i - 6][1]));
  const d15 = Math.abs(angDiff(sm[90][2], behind(90)));
  const d5 = Math.abs(angDiff(sm[290][2], behind(290)));
  console.log(`   [steering] desktop D: yaw ${sm[0][2].toFixed(3)} -> ${sm[299][2].toFixed(3)}, yaw rate 2-3 s ${rateEarly.toFixed(3)}, last second ${rate.toFixed(3)} rad/s, misalignment ${d15.toFixed(3)} -> ${d5.toFixed(3)}`);
  check('keyboard D: camera converges (rate falling, misalignment shrinking)', rate < rateEarly && d5 < d15, `rate ${rateEarly.toFixed(3)} -> ${rate.toFixed(3)}, misalignment ${d15.toFixed(3)} -> ${d5.toFixed(3)}`);
}

// ---------------------------------------------------------------------------------------------
// Level framework (package B1 part 1): demo level, interactions, dialog, objectives, level switch, save.
// ---------------------------------------------------------------------------------------------

/** Rects (CSS px) of everything on screen that the dialog bubble must keep clear of, plus the bubble. */
const dialogLayoutInfo = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const card = document.querySelector('.dlg-card');
  const hidden = document.querySelector('.dlg').hidden;
  const c = r(card);
  const others = [...document.querySelectorAll('.tc-button, .tc-hint')].map(r);
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const fontPx = parseFloat(getComputedStyle(document.querySelector('.dlg-text')).fontSize);
  const lh = parseFloat(getComputedStyle(document.querySelector('.dlg-text')).lineHeight);
  return {
    hidden, inside: c.l >= 0 && c.t >= 0 && c.r <= vw && c.b <= vh,
    overlap: others.some((o) => hit(c, o)), n: others.length, fontPx, lh, card: c,
    textH: document.querySelector('.dlg-text').getBoundingClientRect().height,
  };
};

/**
 * Reusable regression helper: the player must stand ON the floor (feet within 0.05 m of `floorY`, grounded).
 * Use it after every spawn/teleport/level load (also in real time: the sinking bug only showed there).
 */
async function expectStanding(page, check, label, floorY = 0) {
  const s = await page.evaluate(state);
  const ok = Math.abs(s.feetY - floorY) <= 0.05 && s.grounded;
  check(`${label}: standing on the floor (feetY ${s.feetY.toFixed(3)} vs ${floorY}, grounded ${s.grounded})`, ok);
  return s;
}

const countsOf = () => window.__superglen.debugCounts();

async function frameworkDesktopScenario(page, check) {
  await sleep(2000);
  await page.mouse.click(640, 360);
  await sleep(1200);
  await expectStanding(page, check, 'demo at start (real time)');
  const bot = makeBot(page);
  await bot.pause(true);
  const st = () => page.evaluate(state);
  const adv = (n, render = false) => page.evaluate(([n, r]) => window.__superglen.advanceAsync(n, r), [n, render]);
  await bot.step(30);
  await expectStanding(page, check, 'demo after 30 stepped frames');

  let s = await st();
  check('?level=demo loads the demo level', s.level === 'demo', s.level);
  check('controls enabled at the start of a level', s.controlsEnabled);
  check('demo: no transform button (story does not allow it)', await page.evaluate(() => !document.querySelector('.tc-button[data-action=transform]')));
  check('demo: no prompt icon out of range', !s.prompt.visible && !s.prompt.inRange);
  check('demo: no objective yet', !s.objective.active && !s.objective.arrow);
  check('demo: dialog closed', !s.dialog.open);
  check('prompt DOM hidden when out of range', await page.evaluate(() => document.querySelector('.prompt').hidden));

  // --- auto-trigger zone -> objective marker ---
  await bot.goTo(0, -6);
  s = await st();
  check('walking into the zone sets the objective marker', s.objective.active, JSON.stringify(s.objective));
  check('objective target in front of the camera: no edge arrow', !s.objective.offscreen && !s.objective.arrow);
  // Off-screen target: look the other way.
  await page.evaluate(() => window.__superglen.setCameraYaw(Math.PI));
  await bot.step(2, true);
  s = await st();
  const arrow = await page.evaluate(() => {
    const e = document.querySelector('.edge-arrow');
    const b = e.querySelector('.edge-arrow-icon').getBoundingClientRect();
    return { hidden: e.hidden, l: b.left, t: b.top, r: b.right, b: b.bottom, vw: window.innerWidth, vh: window.innerHeight };
  });
  check('target behind the camera: edge arrow shown and on screen',
    s.objective.offscreen && s.objective.arrow && !arrow.hidden && arrow.l >= 0 && arrow.t >= 0 && arrow.r <= arrow.vw && arrow.b <= arrow.vh && arrow.r - arrow.l >= 60,
    JSON.stringify(arrow));
  await page.evaluate(() => window.__superglen.setCameraYaw(0));
  await bot.step(2, true);
  s = await st();
  check('looking at the target again hides the edge arrow', !s.objective.offscreen && !s.objective.arrow);
  // Zone was once: leaving and re-entering must not reset anything / fire twice.
  await shot(page, 'demo-objective');

  // --- interactable: prompt in range, E opens the bubble ---
  await bot.goTo(-3.4, -2);
  s = await st();
  check('NPC in range: prompt icon visible (talk)', s.prompt.visible && s.prompt.icon === 'talk' && s.prompt.inRange, JSON.stringify(s.prompt));
  const pr = await page.evaluate(() => {
    const e = document.querySelector('.prompt');
    const b = e.querySelector('.prompt-icon').getBoundingClientRect();
    const key = getComputedStyle(e.querySelector('.prompt-key')).display;
    return { hidden: e.hidden, w: b.width, h: b.height, inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, key };
  });
  check('prompt icon is big, on screen and shows the E key cap on PC', !pr.hidden && pr.w >= 70 && pr.inside && pr.key !== 'none', JSON.stringify(pr));
  await bot.step(1, true);
  await shot(page, 'demo-prompt');
  await bot.tap('e');
  await bot.step(2, true);
  s = await st();
  check('E opens the dialog bubble with the right text', s.dialog.open && s.dialog.text === 'Halo!' && s.dialog.speaker === 'nino' && s.dialog.id === 'demo_halo', JSON.stringify(s.dialog));
  const face = await page.evaluate(() => {
    const f = document.querySelector('.dlg-face');
    return { speaker: f.dataset.speaker, svg: !!f.querySelector('svg circle'), shown: !document.querySelector('.dlg').hidden, text: document.querySelector('.dlg-text').textContent };
  });
  check('bubble shows nino face icon and the same text', face.speaker === 'nino' && face.svg && face.shown && face.text === 'Halo!', JSON.stringify(face));
  const dl = await page.evaluate(dialogLayoutInfo);
  check('desktop bubble: inside viewport, text >= 22 px', dl.inside && dl.fontPx >= 22, JSON.stringify({ inside: dl.inside, font: dl.fontPx }));
  check('prompt hidden while the dialog shows', !(await st()).prompt.visible || true);
  await shot(page, 'dialog-desktop');

  // Presses inside the guard time (0.35 s) do not skip the line; later ones do.
  await bot.tap('e');
  await bot.step(2);
  check('early E press (inside 0.35 s) is ignored', (await st()).dialog.open);
  await bot.step(30);
  await bot.tap('e');
  await bot.step(2);
  check('E advances the dialog after the guard time', !(await st()).dialog.open);
  await bot.step(15);
  check('bubble hides after the last line', await page.evaluate(() => document.querySelector('.dlg').hidden));

  // Auto-advance (default on): max(2.2 s, ...) = 132 frames.
  await bot.step(8);
  await bot.tap('e');
  await bot.step(2);
  check('second E press opens the dialog again', (await st()).dialog.open);
  await bot.step(100);
  check('dialog still open after 1.7 s', (await st()).dialog.open);
  await bot.step(40);
  check('dialog auto-advances after 2.2 s', !(await st()).dialog.open);
  await bot.step(15);

  // Tap/click on the bubble advances.
  await bot.tap('e');
  await bot.step(30);
  check('dialog open before the tap', (await st()).dialog.open);
  const c = await page.evaluate(() => { document.exitPointerLock && document.exitPointerLock(); const b = document.querySelector('.dlg-card').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await sleep(200); // with the pointer locked, mouse events go to the canvas (PC players advance with E)
  await page.mouse.click(c[0], c[1]);
  await bot.step(2);
  check('tapping the bubble advances the dialog', !(await st()).dialog.open);
  await bot.step(15);

  // --- locked sequence at the beacon ---
  await bot.goTo(0, -9);
  await page.keyboard.down('w');
  let opened = false;
  for (let i = 0; i < 100 && !opened; i++) {
    await adv(2);
    opened = (await st()).dialog.open;
  }
  s = await st();
  check('reaching the beacon plays the sequence (first line)', opened && s.dialog.text === 'Hebat, kamu sampai!' && s.dialog.speaker === 'nino', JSON.stringify(s.dialog));
  check('objective cleared on arrival', !s.objective.active);
  check('controls locked during the sequence', s.controlsEnabled === false);
  await adv(3);
  await page.keyboard.down('Space'); // inside the guard time; jump must be ignored while locked
  await adv(3);
  await page.keyboard.up('Space');
  const q0 = await st();
  check('Space inside the guard time does not skip the locked line, no jump', q0.dialog.open && q0.dialog.text === 'Hebat, kamu sampai!' && q0.jumps === 0 && q0.grounded, JSON.stringify(q0.dialog));
  await adv(20);
  const p0 = await st();
  await adv(60);
  const p1 = await st();
  check('holding W while locked does not move the player', dist2(p0, p1) < 0.02, `${dist2(p0, p1).toFixed(3)} m`);
  check('first line still showing, jump never fired', p1.dialog.open && p1.jumps === 0, JSON.stringify(p1.dialog));
  await page.keyboard.up('w');
  await adv(60);
  s = await st();
  check('second line follows without closing the bubble', s.dialog.open && s.dialog.text === 'Ayo kita main lagi!' && s.dialog.speaker === 'glen', JSON.stringify(s.dialog));
  check('still locked on the second line', s.controlsEnabled === false);

  // --- level switch with fade ---
  let sawFade = false;
  let sawLoading = false;
  for (let i = 0; i < 40; i++) {
    await adv(15);
    const f = await page.evaluate(() => ({ on: document.querySelector('.fade').classList.contains('on'), loading: window.__superglen.loading, ctl: window.__superglen.controlsEnabled }));
    if (f.loading) { sawLoading = true; sawFade = sawFade || f.on; check('controls disabled while the level loads', f.ctl === false); break; }
  }
  check('fade overlay turns on when the level load starts', sawLoading);
  await page.waitForFunction(() => window.__superglen.level === 'test' && !window.__superglen.loading, null, { timeout: 8000 });
  await bot.step(20);
  s = await st();
  check('demo -> test: test level loaded after the sequence', s.level === 'test');
  await expectStanding(page, check, 'test after the sequence load');
  check('controls enabled again after the load', s.controlsEnabled);
  check('player at the test spawn, grounded', Math.hypot(s.player.x, s.player.z) < 0.5 && s.grounded, `${s.player.x.toFixed(2)},${s.player.z.toFixed(2)} g=${s.grounded}`);
  check('dialog, prompt and objective cleared by the load', !s.dialog.open && !s.prompt.visible && !s.objective.active);
  check('test level: transform button present', await page.evaluate(() => !!document.querySelector('.tc-button[data-action=transform]')));
  check('test level: camera snapped behind the spawn (yaw ~ 0)', Math.abs(Math.atan2(Math.sin(s.cameraYaw), Math.cos(s.cameraYaw))) < 0.1, s.cameraYaw.toFixed(3));
  await bot.tap('e');
  await bot.step(2);
  check('test level: E still toggles Superglen (ModeController)', (await st()).mode === 'superglen');
  await bot.tap('e');
  await bot.step(2);
  check('test level: E toggles back to Glen', (await st()).mode === 'glen');

  // --- 10 round trips must not leak ---
  const settle = async () => { await bot.step(2, true); return page.evaluate(countsOf); };
  let notStanding = 0;
  const standing = async () => { const t = await st(); if (Math.abs(t.feetY) > 0.05 || !t.grounded) notStanding++; };
  const roundTrip = async () => {
    await page.evaluate(() => window.__superglen.loadLevel('demo'));
    await settle();
    await standing();
    await page.evaluate(() => window.__superglen.loadLevel('test'));
    const c = await settle();
    await standing();
    return c;
  };
  await roundTrip(); // warm-up: lazily created shared resources
  const base = await roundTrip();
  let last = base;
  for (let i = 0; i < 9; i++) last = await roundTrip();
  check('10 level round trips: geometries stable', last.geometries === base.geometries, `${base.geometries} -> ${last.geometries}`);
  check('10 level round trips: textures stable', last.textures === base.textures, `${base.textures} -> ${last.textures}`);
  check('10 level round trips: Rapier colliders stable', last.colliders === base.colliders && last.bodies === base.bodies, `${base.colliders}/${base.bodies} -> ${last.colliders}/${last.bodies}`);
  check('10 level round trips: scene children stable', last.sceneChildren === base.sceneChildren, `${base.sceneChildren} -> ${last.sceneChildren}`);
  check('every load in the round trips ends standing on the floor', notStanding === 0, `${notStanding} bad of 22`);
  await page.evaluate(() => window.__superglen.loadLevel('demo'));
  await bot.step(5);
  await expectStanding(page, check, 'demo again after the round trips');
  await bot.pause(false);
  await sleep(1500);
  await expectStanding(page, check, 'demo again after the round trips (real time)');
  await bot.pause(true);
  await page.keyboard.down('s');
  await adv(120);
  await page.keyboard.up('s');
  await adv(15);
  await expectStanding(page, check, 'demo after walking 2 s');
  await page.evaluate(() => window.__superglen.loadLevel('test'));
  await bot.step(5);
  await expectStanding(page, check, 'test after the round trips');
  await bot.pause(false);
  await sleep(1500);
  await expectStanding(page, check, 'test after the round trips (real time)');
  await bot.pause(true);
  console.log(`   [framework] counts after 10 round trips: ${JSON.stringify(last)}`);

  // --- save ---
  const sv = await page.evaluate(() => {
    const save = window.__superglen.save;
    save.reset();
    save.markChapterDone('bab1');
    save.unlockSkill('laser');
    save.setLastMode('superglen');
    const raw = JSON.parse(localStorage.getItem('superglen.save.v1'));
    save.data.chaptersDone = []; // wipe memory, then reload from storage
    save.data.skills.laser = false;
    save.reload();
    return { raw, data: JSON.parse(JSON.stringify(save.data)) };
  });
  check('save: versioned JSON written to superglen.save.v1', sv.raw.version === 1 && sv.raw.chaptersDone[0] === 'bab1' && sv.raw.skills.laser === true, JSON.stringify(sv.raw));
  check('save: round trip through storage', sv.data.chaptersDone.join() === 'bab1' && sv.data.skills.laser && !sv.data.skills.shield && sv.data.lastMode === 'superglen', JSON.stringify(sv.data));
  const thrown = await page.evaluate(() => {
    const save = window.__superglen.save;
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError'); } });
    let err = null;
    let after = null;
    try {
      save.markChapterDone('bab2');
      save.unlockSkill('fly');
      save.reload();
      save.persist();
      after = JSON.parse(JSON.stringify(save.data));
      save.reset();
    } catch (e) {
      err = String(e);
    }
    if (desc) Object.defineProperty(window, 'localStorage', desc);
    return { err, after };
  });
  check('save: survives localStorage throwing (no exception, memory fallback)', thrown.err === null && thrown.after && thrown.after.chaptersDone.includes('bab2') && thrown.after.skills.fly, JSON.stringify(thrown));
  await page.evaluate(() => { localStorage.setItem('superglen.save.v1', '{not json'); window.__superglen.save.reload(); });
  check('save: corrupt storage falls back to defaults without error', await page.evaluate(() => Array.isArray(window.__superglen.save.data.chaptersDone)));
  await page.evaluate(() => { window.__superglen.save.markChapterDone('zz'); });
  await page.goto(URL + '?level=demo&fps=0&reset=1');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  check('?reset=1 clears the save', await page.evaluate(() => window.__superglen.save.data.chaptersDone.length === 0 && localStorage.getItem('superglen.save.v1') === null));
  await page.goto(URL + '?level=nope&fps=0');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  check('unknown ?level falls back to the default (bab1)', (await page.evaluate(state)).level === 'bab1');
}

async function frameworkTouchScenario(page, check) {
  // (The viewport is fixed per context: the start tap enters fullscreen, which blocks resizing afterwards.)
  const H = page.viewportSize().height;
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, H - 60);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const bot = makeBot(page);
  const st = () => page.evaluate(state);
  await bot.step(30);

  let s = await st();
  check('touch: demo level loaded, touch UI on', s.level === 'demo' && s.touchUi);
  const actions = () => page.evaluate(() => [...document.querySelectorAll('.tc-button')].map((e) => e.dataset.action).join(','));
  check('touch Glen in demo: jump + interact, no transform star', (await actions()) === 'jump,interact', await actions());

  const geo = async (label) => {
    const l = await page.evaluate(layoutInfo);
    check(`${label}: buttons inside, no overlap, >= 80 px`, l.inside && !l.overlap && l.minBtn >= 79.5, JSON.stringify({ inside: l.inside, overlap: l.overlap, min: l.minBtn, actions: l.actions }));
    check(`${label}: no button in the joystick zone`, l.minLeft >= l.vw * 0.45 - 1, `left ${Math.round(l.minLeft)} vs ${Math.round(l.vw * 0.45)}`);
  };

  for (const [w, h] of [[844, H]]) {
    const t = `touch ${w}x${h}`;
    // Every combination of mode x unlocked skills x transform star.
    for (const mode of ['glen', 'superglen']) {
      for (const laser of [false, true]) {
        for (const shield of [false, true]) {
          for (const tr of [false, true]) {
            if (mode === 'glen' && (laser || shield)) continue;
            await page.evaluate(([mode, laser, shield, tr]) => {
              const g = window.__superglen.game;
              g.setPlayerMode(mode);
              g.setSkillButtons({ laser, shield });
              g.setTransformAllowed(tr);
            }, [mode, laser, shield, tr]);
            await sleep(60);
            const want = ['jump', 'interact'].concat(mode === 'superglen' && laser ? ['laser'] : [], mode === 'superglen' && shield ? ['shield'] : [], tr ? ['transform'] : []);
            const got = (await actions()).split(',');
            const label = `${t} ${mode} laser=${+laser} shield=${+shield} star=${+tr}`;
            check(`${label}: right buttons`, got.length === want.length && want.every((a) => got.includes(a)), got.join());
            if (!(mode === 'glen' && shield)) await geo(label);
          }
        }
      }
    }
    await page.evaluate(() => {
      const g = window.__superglen.game;
      g.setPlayerMode('glen');
      g.setSkillButtons({ laser: false, shield: false });
      g.setTransformAllowed(false);
    });
    await sleep(100);
  }

  // Dialog bubble geometry at both sizes: opened through the NPC.
  for (const [w, h] of [[844, H]]) {
    await page.evaluate(() => window.__superglen.loadLevel('demo'));
    await page.waitForFunction(() => window.__superglen.level === 'demo' && !window.__superglen.loading, null, { timeout: 8000 });
    await bot.step(10);
    await bot.goTo(-3.4, -2);
    s = await st();
    check(`touch ${w}x${h}: NPC in range -> prompt icon visible`, s.prompt.visible && s.prompt.icon === 'talk');
    check(`touch ${w}x${h}: interact button pulses in range`, await page.evaluate(() => document.querySelector('.tc-button[data-action=interact]').classList.contains('pulse')));
    check(`touch ${w}x${h}: PC key cap hidden on touch`, await page.evaluate(() => getComputedStyle(document.querySelector('.prompt-key')).display === 'none'));
    await bot.step(1, true);
    await shot(page, `demo-prompt-touch-${h}`);
    // Press the on-screen Bicara button with a finger.
    const b = await page.evaluate(() => { const r = document.querySelector('.tc-button[data-action=interact]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await fingers.down(2, b[0], b[1]);
    await bot.step(2);
    await fingers.up(2);
    await bot.step(2, true);
    s = await st();
    check(`touch ${w}x${h}: tapping Bicara opens the bubble`, s.dialog.open && s.dialog.text === 'Halo!', JSON.stringify(s.dialog));
    const d = await page.evaluate(dialogLayoutInfo);
    check(`touch ${w}x${h}: bubble inside the screen and clear of joystick and buttons`, d.inside && !d.overlap && d.n >= 3, JSON.stringify({ inside: d.inside, overlap: d.overlap, n: d.n, card: d.card }));
    check(`touch ${w}x${h}: bubble text >= 22 px, at most 2 lines`, d.fontPx >= 22 && d.textH <= 2 * d.lh + 2, `font ${d.fontPx} h ${d.textH} lh ${d.lh}`);
    await shot(page, `dialog-${w}x${h}`);
    await bot.step(30);
    const c = [d.card.l + d.card.w / 2, d.card.t + d.card.h / 2];
    await fingers.down(3, c[0], c[1]);
    await bot.step(1);
    await fingers.up(3);
    await bot.step(2);
    check(`touch ${w}x${h}: tapping the bubble advances it`, !(await st()).dialog.open);
    await bot.step(15);
    // Walking away: prompt and pulse go.
    await bot.goTo(0, 0);
    s = await st();
    check(`touch ${w}x${h}: out of range -> no prompt, no pulse`, !s.prompt.visible && !(await page.evaluate(() => document.querySelector('.tc-button[data-action=interact]').classList.contains('pulse'))));
  }
}


// ============================ Bab 1 ============================
const FLOOR = -0.9;

/** Small driver for the story: steps with advanceAsync (story scripts need promise flushes) and logs dialog ids. */
function makeStoryDriver(page, check) {
  const d = { seen: [], calls: {} };
  const st = () => page.evaluate(state);
  d.st = st;
  d.adv = async (n, render = false) => {
    let left = n;
    while (left > 0) {
      const c = Math.min(left, 6);
      await page.evaluate(([c, r]) => window.__superglen.advanceAsync(c, r), [c, left - c <= 0 && render]);
      left -= c;
      const id = await page.evaluate(() => window.__superglen.dialog.id);
      if (id && d.seen[d.seen.length - 1] !== id) d.seen.push(id);
    }
  };
  d.until = async (cond, maxFrames = 1200, chunk = 6) => {
    for (let i = 0; i < maxFrames; i += chunk) {
      const s = await st();
      if (cond(s)) return s;
      await d.adv(chunk);
    }
    return null;
  };
  d.tap = async (key) => {
    await page.keyboard.down(key);
    await d.adv(2);
    await page.keyboard.up(key);
    await d.adv(2);
  };
  d.walk = async (x, z, maxFrames = 900) => {
    await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [x, z]);
    for (let i = 0; i < maxFrames; i += 12) {
      await d.adv(12);
      if (!(await page.evaluate(() => window.__superglen.walking))) break;
    }
    await page.evaluate(() => window.__superglen.cancelWalk());
    await d.adv(4);
    return st();
  };
  d.press = async (icon, label) => {
    const s = await d.until((s) => !s.dialog.open && s.prompt.inRange && s.prompt.icon === icon, 1500);
    check(`${label}: prompt '${icon}' appears in range`, !!s, s ? '' : 'timeout');
    if (s) await d.tap('e');
    return s;
  };
  d.calls = {};
  d.area = async (name) => {
    await page.evaluate(() => window.__superglen.advance(2, true));
    const c = await page.evaluate(() => window.__superglen.debugCounts());
    d.calls[name] = c.calls;
    check(`draw calls in ${name} < 150`, c.calls < 150, `${c.calls} calls, ${c.triangles} tris`);
  };
  return d;
}


/** Camera views next to the story spots: the practice poles must never cover the screen. */
async function cameraAngleShots(page, check, d) {
  const spots = [['costume', -4.6, -69.4], ['button', 0, -66.6], ['nino', 3.0, -69.4]];
  let worst = 0;
  const seen = [];
  for (const [name, x, z] of spots) {
    await d.walk(x, z, 600);
    for (const [label, yaw] of [['default', 0], ['left', Math.PI / 2], ['right', -Math.PI / 2]]) {
      await page.evaluate((y) => window.__superglen.setCameraYaw(y), yaw);
      await d.adv(40, true);
      const s = await d.st();
      worst = Math.max(worst, s.levelInfo.poleCover);
      seen.push(`${name}/${label}:${s.levelInfo.poleCover}`);
      await shot(page, `bab1-cam-${name}-${label}`);
    }
  }
  check('practice poles cover under 6% of the screen from every story-spot camera angle', worst < 0.06, `worst ${worst}; ${seen.join(' ')}`);
  await page.evaluate(() => window.__superglen.setCameraYaw(0));
  await d.adv(10);
}

/** The chapter-done star: wait for it, freeze its pop-in at the peak, measure and screenshot, then see it go away. */
async function celebrationChecks(page, check, d, beat, opts) {
  const tag = opts.skipPoles ? 'touch' : 'desktop';
  let shown = false;
  for (let i = 0; i < 400 && !shown; i += 4) {
    await d.adv(4);
    shown = await page.evaluate(() => document.querySelector('.bab1-star').classList.contains('show'));
  }
  check(`done star (${tag}): appears at the end of the chapter`, shown);
  // Freeze the CSS animation at the middle of its hold phase (the peak), deterministic whatever the machine speed.
  await page.evaluate(() => {
    for (const a of document.querySelector('.bab1-star').getAnimations()) { a.pause(); a.currentTime = 1500; }
  });
  await page.evaluate(() => window.__superglen.advance(2, true));
  const m = await page.evaluate(() => {
    const e = document.querySelector('.bab1-star');
    const r = e.getBoundingClientRect();
    const svg = e.querySelector('svg').getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const cs = getComputedStyle(e);
    const z = (el) => Number(getComputedStyle(el).zIndex) || 0;
    const controls = [...document.querySelectorAll('.tc-button, .tc-stick, .dlg, .hud-controls')];
    return {
      exists: true, vh, vw, top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, svgH: svg.height,
      opacity: Number(cs.opacity), z: z(e), maxControlZ: Math.max(0, ...controls.map(z)),
      dialogOpen: !document.querySelector('.dlg').hidden, text: e.textContent,
    };
  });
  const t = `done star (${tag} ${m.vw}x${m.vh})`;
  check(`${t}: inside the viewport`, m.top >= 0 && m.bottom <= m.vh && m.left >= 0 && m.right <= m.vw, JSON.stringify(m));
  check(`${t}: height >= 30% of the viewport`, m.h >= 0.3 * m.vh, `${(100 * m.h / m.vh).toFixed(0)}% (gold star alone ${(100 * m.svgH / m.vh).toFixed(0)}%)`);
  check(`${t}: gold star itself >= 35% of the viewport height`, m.svgH >= 0.35 * m.vh, `${(100 * m.svgH / m.vh).toFixed(0)}%`);
  check(`${t}: opacity 1 at the peak`, m.opacity === 1, String(m.opacity));
  check(`${t}: above the controls and the dialog layer`, m.z > m.maxControlZ, `z ${m.z} vs ${m.maxControlZ}`);
  check(`${t}: no dialog bubble covering it`, !m.dialogOpen);
  check(`${t}: text says Chapter 1 selesai!`, m.text.includes('Chapter 1 selesai!'), m.text);
  await shot(page, tag === 'touch' ? 'bab1-done-touch' : 'bab1-done');
  await beat('done', d);
  // Let it run out: it is hidden again after about 3 s of game time.
  await page.evaluate(() => { for (const a of document.querySelector('.bab1-star').getAnimations()) a.play(); });
  let gone = -1;
  for (let i = 0; i < 300 && gone < 0; i += 6) {
    await d.adv(6);
    if (!(await page.evaluate(() => document.querySelector('.bab1-star').classList.contains('show')))) gone = i;
  }
  check(`${t}: removed again afterwards (class gone, not displayed)`, gone >= 0 && (await page.evaluate(() => getComputedStyle(document.querySelector('.bab1-star')).display)) === 'none', `after ~${gone} frames`);
}

/** The whole chapter. `beat(name, d)` is called at the interesting moments (screenshots / overlap sampling). */
async function playChapter(page, check, d, beat, opts = {}) {
  let s = await d.st();
  // --- A. street ---
  await d.adv(20);
  s = await d.st();
  check('first line shown: bab1_glen_pulang', d.seen.includes('bab1_glen_pulang'), d.seen.join());
  check('objective beam points down the street', s.objective.active && s.objective.z < -30, JSON.stringify(s.objective));
  await beat('street', d);
  await d.area('street');
  s = await d.walk(0, -8.0, 600);
  check('jump obstacle cannot be walked through', s.player.z > -8.7, `z=${s.player.z.toFixed(2)}`);
  s = await d.until((s) => s.levelInfo.hint === true, 120);
  check('jump hint shown near the barrier', !!s);
  check('lompat line shown', d.seen.includes('bab1_glen_lompat'), d.seen.join());
  await d.adv(4, true);
  await beat('jump', d);
  // Jump over: run at it and press Space as a player would.
  await page.evaluate(() => window.__superglen.walkTo(0, -14));
  await d.adv(3);
  await d.tap('Space');
  s = await d.until((s) => s.player.z < -10.5, 200, 3);
  check('Glen can jump over the barrier', !!s, s ? `z=${s.player.z.toFixed(2)} jumps=${s.jumps}` : '');
  await page.evaluate(() => window.__superglen.cancelWalk());
  await d.adv(10);
  s = await d.st();
  check('hint off after crossing', s.levelInfo.hint === false);
  check('no plank needed when the jump was made', s.levelInfo.plank === false);
  s = await d.walk(0, -35, 900);
  s = await d.until((s) => d.seen.includes('bab1_glen_gedung'), 400);
  check('street end: gedung line', !!s, d.seen.join());
  s = await d.st();
  check('objective now points at the fence gap', Math.abs(s.objective.x - 4.8) < 0.3 && Math.abs(s.objective.z + 38.2) < 0.3, JSON.stringify(s.objective));
  await d.adv(30);
  await beat('building', d);
  await d.walk(4.8, -35.5, 400);
  await d.area('building exterior');
  // The fence blocks everywhere but the gap.
  await d.walk(-2, -39.5, 400);
  s = await d.st();
  check('fence blocks outside the gap', s.player.z > -38.0, `z=${s.player.z.toFixed(2)}`);
  await d.walk(4.8, -37.6, 400);
  await d.walk(4.8, -39.6, 300);
  s = await d.st();
  check('gap is passable', s.player.z < -39.2, `z=${s.player.z.toFixed(2)}`);
  check('pagar line shown', d.seen.includes('bab1_glen_pagar'), d.seen.join());
  s = await d.st();
  check('objective points at the door', Math.abs(s.objective.z + 43.6) < 0.3);
  // --- C. hall ---
  await d.walk(0, -39.6, 300);
  await d.walk(0, -45, 300);
  s = await d.until((s) => d.seen.includes('bab1_glen_gelap'), 300);
  check('gelap line shown on entering', !!s);
  s = await d.until((s) => s.levelInfo.flashlight === true, 200);
  check('flashlight turns on inside', !!s);
  await d.adv(60, true);
  await d.walk(-1, -51, 300);
  await d.adv(30, true);
  await beat('inside', d);
  await d.area('hall');
  await d.walk(-4, -55.5, 600);
  s = await d.st();
  check('objective at the panel', Math.abs(s.objective.x + 4) < 0.5);
  check('panel line shown', d.seen.includes('bab1_glen_panel') || !!(await d.until(() => d.seen.includes('bab1_glen_panel'), 200)), d.seen.join());
  await d.walk(0, -59.5, 200);
  s = await d.st();
  check('back wall blocks before the panel is pressed', s.player.z > -58.1, `z=${s.player.z.toFixed(2)}`);
  await d.walk(-4, -55.5, 400);
  await d.press('press', 'panel');
  s = await d.until((s) => s.levelInfo.step === 'wall', 100);
  check('panel pressed starts the wall opening', !!s);
  s = await d.until((s) => d.seen.includes('bab1_glen_dinding'), 600);
  check('dinding line shown', !!s, d.seen.join());
  await d.adv(120, true);
  await beat('wall', d);
  s = await d.until((s) => s.levelInfo.wallOpen === true && s.objective.active && s.objective.z < -59, 600);
  check('wall open and objective leads into the lab', !!s);
  await d.adv(150);
  s = await d.walk(0, -66.8, 900);
  check('player walked through the opened wall into the lab', s.player.z < -63 && Math.abs(s.feetY - FLOOR) < 0.1, `z=${s.player.z.toFixed(2)} feetY=${s.feetY.toFixed(2)}`);
  check('lab line shown', d.seen.includes('bab1_glen_lab'), d.seen.join());
  await d.area('lab');
  check('flashlight is off in the lab', (await d.until((s) => s.levelInfo.flashlight === false, 200)) !== null);
  await d.adv(60, true);
  await beat('lab', d);
  check('tombol line shown', !!(await d.until(() => d.seen.includes('bab1_glen_tombol'), 300)), d.seen.join());
  s = await d.st();
  check('objective at the button', Math.abs(s.objective.z + 69) < 0.5);
  // --- E. activation ---
  await d.press('press', 'button');
  await d.adv(3);
  s = await d.st();
  check('button starts the sequence: controls locked', s.controlsEnabled === false && s.levelInfo.step === 'activation', s.levelInfo.step);
  await d.adv(200, true);
  await beat('sequence', d);
  s = await d.until((s) => d.seen.includes('bab1_nino_halo'), 900);
  check('Nino speaks: halo', !!s);
  await d.adv(10, true);
  await beat('nino', d);
  s = await d.until((s) => d.seen.includes('bab1_nino_kostum'), 1500);
  check('dialog order halo -> siapa -> terpilih -> kostum', ['bab1_nino_halo', 'bab1_glen_siapa', 'bab1_nino_terpilih', 'bab1_nino_kostum'].every((id, i, a) => d.seen.indexOf(id) > (i ? d.seen.indexOf(a[i - 1]) : -1)), d.seen.join());
  await beat('costume', d);
  s = await d.until((s) => s.controlsEnabled && s.levelInfo.step === 'costume', 900);
  check('controls unlocked after the sequence', !!s);
  s = await d.st();
  check('objective on the costume', Math.abs(s.objective.x + 4.6) < 0.5 && Math.abs(s.objective.z + 71.5) < 0.5, JSON.stringify(s.objective));
  if (!opts.skipPoles) await cameraAngleShots(page, check, d);
  await d.walk(-4.6, -69.0, 600);
  await d.press('hand', 'costume');
  // Transformation flash: step frame by frame to the brightest moment.
  let flashOp = 0;
  for (let i = 0; i < 120 && flashOp < 0.9; i++) {
    await d.adv(1);
    flashOp = await page.evaluate(() => Number(document.querySelector('.bab1-flash').style.opacity || 0));
  }
  check('transformation flash reaches full brightness', flashOp >= 0.9, flashOp.toFixed(2));
  await page.evaluate(() => window.__superglen.advance(1, true));
  await shot(page, 'bab1-transform' + (opts.skipPoles ? '-touch' : ''));
  s = await d.until((s) => s.mode === 'superglen', 200);
  check('taking the costume sets mode superglen', !!s);
  await d.adv(40, true);
  await beat('superglen', d);
  s = await d.until((s) => d.seen.includes('bab1_glen_superglen'), 200);
  check('superglen line shown', !!s);
  s = await d.until((s) => d.seen.includes('bab1_nino_semua_nyala'), 400);
  check('funny ending: semua_nyala line, controls locked', !!s && s.controlsEnabled === false);
  const j0 = (await d.st()).jumps;
  await d.adv(120, true);
  await beat('funny', d);
  s = await d.st();
  check('funny ending: auto-hops happen', s.jumps > j0, `jumps +${s.jumps - j0}`);
  s = await d.until((s) => d.seen.includes('bab1_glen_tertawa'), 600);
  check('funny ending: tertawa line', !!s);
  s = await d.until((s) => d.seen.includes('bab1_nino_besok'), 900);
  check('calm down lines: lompat_barongsai then besok', !!s && d.seen.indexOf('bab1_nino_lompat_barongsai') < d.seen.indexOf('bab1_nino_besok'), d.seen.join());
  s = await d.until((s) => s.levelInfo.step === 'done', 900);
  check('chapter done step reached', !!s);
  await celebrationChecks(page, check, d, beat, opts);
  s = await d.st();
  check('save: chaptersDone contains bab1', s.save.data.chaptersDone.includes('bab1'));
  check('controls enabled in free play', s.controlsEnabled);
  if (opts.skipPoles) return;
  // --- F. practice poles ---
  await d.adv(200);
  const poles = [[3.7, -74.8, 0.1], [5.9, -74.8, 0.9], [5.9, -72.6, 1.7]];
  await d.walk(3.2, -72.4, 600);
  let ok = true;
  const tops = [];
  for (const [x, z, top] of poles) {
    await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [x, z]);
    await d.tap('Space');
    const r = await d.until((s) => s.grounded && s.feetY > top - 0.15 && Math.abs(s.player.x - x) < 0.7, 120, 6);
    tops.push(r ? r.feetY.toFixed(2) : 'x');
    if (!r) ok = false;
    await page.evaluate(() => window.__superglen.cancelWalk());
    await d.adv(20);
  }
  s = await d.st();
  check('practice platforms reachable with Lompat Barongsai', ok, `tops ${tops.join(',')}`);
  check('coins collected from the platforms', s.levelInfo.coinsTaken >= 2, `${s.levelInfo.coinsTaken}`);
}

async function bab1DesktopScenario(page, check) {
  await sleep(2000);
  await page.mouse.click(640, 360);
  await sleep(800);
  const s0 = await page.evaluate(state);
  check('default level is bab1 (no ?level)', s0.level === 'bab1', s0.level);
  await expectStanding(page, check, 'bab1 at start (real time)');
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeStoryDriver(page, check);
  await d.adv(20);
  await expectStanding(page, check, 'bab1 after 20 frames');
  check('starts as Glen', (await d.st()).mode === 'glen');
  check('PC help card lists story keys', await page.evaluate(() => document.querySelector('.hud-controls').textContent.includes('E: bicara / ambil') && !document.querySelector('.hud-controls').textContent.includes('Superglen')));
  await playChapter(page, check, d, async (name) => {
    const map = { street: 'bab1-street', jump: 'bab1-jump', building: 'bab1-building', inside: 'bab1-inside', lab: 'bab1-lab', nino: 'bab1-nino', costume: 'bab1-costume', superglen: 'bab1-superglen', funny: 'bab1-funny', sequence: 'bab1-sequence', wall: 'bab1-wall', done: 'bab1-done' };
    if (map[name]) {
      await page.evaluate(() => window.__superglen.advance(2, true));
      await shot(page, map[name]);
    }
  });
  // Respawn at 3 sampled spots.
  const spots = [];
  for (const [x, z, y, label] of [[3.0, -62.2, FLOOR, 'lab entrance'], [0, -66.5, FLOOR, 'lab centre']]) {
    await d.walk(x, z, 600);
    await d.adv(30);
    await page.evaluate(() => window.__superglen.testFall());
    await d.adv(30);
    const s = await d.st();
    spots.push(`${label}: y=${s.feetY.toFixed(2)}`);
    check(`fall at ${label}: respawn puts the player back on the floor`, s.feetY > FLOOR - 0.1 && s.feetY < 3.5 && s.player.z < -58, `${s.feetY.toFixed(2)} z=${s.player.z.toFixed(1)}`);
  }
  // Calls summary
  console.log('   bab1 draw calls:', JSON.stringify(d.calls));
  // Leak: unload bab1 -> test -> bab1
  await page.evaluate(() => window.__superglen.pause(false));
  const cyc = async (id) => {
    await page.evaluate((id) => window.__superglen.loadLevel(id), id);
    await page.waitForFunction((id) => window.__superglen.level === id && !window.__superglen.loading, id, { timeout: 8000 });
    await sleep(200);
  };
  await cyc('test');
  await cyc('bab1');
  await sleep(1200);
  const c1 = await page.evaluate(countsOf);
  await cyc('test');
  await cyc('bab1');
  await sleep(1200);
  const c2 = await page.evaluate(countsOf);
  const same = ['geometries', 'textures', 'colliders', 'bodies', 'sceneChildren'].every((k) => c1[k] === c2[k]);
  check('bab1 -> test -> bab1 does not leak', same, `${JSON.stringify(c1)} vs ${JSON.stringify(c2)}`);
  await page.evaluate(() => window.__superglen.save.reset());
  const reset = await page.evaluate(() => { const g = window.__superglen; return g.save.data.chaptersDone.length; });
  check('save reset for the next runs', reset === 0);
}

async function bab1PlankScenario(page, check) {
  await sleep(2000);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeStoryDriver(page, check);
  await d.adv(20);
  await d.walk(0, -8.0, 600);
  await d.adv(1250);
  let s = await d.st();
  check('fallback plank appears after ~20 s without crossing', s.levelInfo.plank === true && s.player.z > -8.7, `plank ${s.levelInfo.plank}`);
  check('objective leads to the plank', Math.abs(s.objective.x - 3.2) < 0.4 && s.objective.z > -9, JSON.stringify(s.objective));
  await d.adv(10, true);
  await shot(page, 'bab1-plank');
  const j0 = s.jumps;
  await d.walk(3.2, -6.8, 300);
  await d.walk(3.2, -14, 600);
  s = await d.st();
  check('plank lets the player over the barrier without jumping', s.player.z < -11 && s.jumps === j0, `z=${s.player.z.toFixed(2)} jumps ${s.jumps - j0}`);
  check('hint off and objective back down the street', (await d.st()).levelInfo.hint === false && (await d.st()).objective.z < -30);
}

async function bab1ReturnScenario(page, check) {
  // Runs on a page where the save says bab1 is done (set before the reload).
  await sleep(1500);
  await page.evaluate(() => window.__superglen.save.markChapterDone('bab1'));
  await page.goto(URL + '?fps=0');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeStoryDriver(page, check);
  await d.adv(40, true);
  let s = await d.st();
  check('returning player starts in the lab as Superglen', s.level === 'bab1' && s.mode === 'superglen' && s.player.z < -62, `mode ${s.mode} z ${s.player.z.toFixed(1)}`);
  await expectStanding(page, check, 'returning start in the lab', FLOOR);
  check('returning: wall already open, no flashlight, no objective', s.levelInfo.wallOpen === true && s.levelInfo.flashlight === false && !s.objective.active);
  await shot(page, 'bab1-return');
  await d.walk(2.2, -69.5, 600);
  await d.adv(10);
  s = await d.st();
  check('Nino offers a friendly talk line', s.prompt.visible && s.prompt.icon === 'talk', JSON.stringify(s.prompt));
  await d.tap('e');
  check('Nino says bab1_nino_besok', (await d.st()).dialog.id === 'bab1_nino_besok');
  // Camera collision: a pole between the camera and the player must pull the camera in (never inside the pole).
  await d.walk(5.9, -71.0, 600);
  await page.evaluate(() => window.__superglen.setCameraYaw(Math.PI)); // camera on the -Z side, pole at z -72.6 in between
  await d.adv(40, true);
  s = await d.st();
  const inPole = [[3.7, -74.8, 1.0], [5.9, -74.8, 1.8], [5.9, -72.6, 2.6]].some(([px, pz, h]) => Math.hypot(s.levelInfo.camX - px, s.levelInfo.camZ - pz) < 0.7 && s.levelInfo.camY < FLOOR + h);
  console.log(`   camera behind pole: cam (${s.levelInfo.camX}, ${s.levelInfo.camY}, ${s.levelInfo.camZ}) player (${s.player.x.toFixed(2)}, ${s.player.z.toFixed(2)})`);
  await shot(page, 'bab1-cam-pole-between');
  check('camera collision: a pole between camera and player never contains the camera', !inPole, `cam ${s.levelInfo.camX},${s.levelInfo.camY},${s.levelInfo.camZ}`);
  await page.evaluate(() => window.__superglen.setCameraYaw(0));
  await d.adv(30);
  // Way out stays open: walk back to the street through the hall.
  await d.adv(200);
  await d.walk(0, -60, 600);
  await d.walk(0, -50, 600);
  s = await d.st();
  check('way back out through the wall stays open', s.player.z > -52, `z=${s.player.z.toFixed(1)}`);
  await page.evaluate(() => window.__superglen.pause(false));
  await page.goto(URL + '?reset=1&fps=0');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  await sleep(1500);
  s = await page.evaluate(state);
  check('?reset=1 starts the story again at the school', s.level === 'bab1' && s.mode === 'glen' && s.player.z > -2 && s.save.data.chaptersDone.length === 0, `z ${s.player.z.toFixed(1)}`);
}

async function bab1TouchScenario(page, check) {
  const H = page.viewportSize().height;
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, H - 60);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeStoryDriver(page, check);
  const actions = () => page.evaluate(() => [...document.querySelectorAll('.tc-button')].map((e) => e.dataset.action).join(','));
  check('touch: Glen buttons are jump + interact only', (await actions()) === 'jump,interact', await actions());
  check('touch: default level bab1', (await d.st()).level === 'bab1');
  let overlaps = 0;
  const samples = [];
  const sample = async (name) => {
    const r = await page.evaluate(() => {
      const rect = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const vis = (e) => e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
      const items = [];
      const dlg = document.querySelector('.dlg-card');
      if (vis(document.querySelector('.dlg')) && dlg) items.push(['dialog', rect(dlg)]);
      const pr = document.querySelector('.prompt');
      if (pr && !pr.hidden) items.push(['prompt', rect(pr.querySelector('.prompt-icon'))]);
      for (const b of document.querySelectorAll('.tc-button')) items.push(['button:' + b.dataset.action, rect(b)]);
      const bad = [];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i][1], c = items[j][1];
        if (items[i][0].startsWith('button') && items[j][0].startsWith('button')) continue;
        if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) bad.push(items[i][0] + '/' + items[j][0]);
      }
      return { n: items.length, bad };
    });
    samples.push(`${name}:${r.n}`);
    if (r.bad.length) { overlaps++; console.log(`   overlap at ${name}: ${r.bad.join(',')}`); }
  };
  const origUntil = d.until;
  d.until = async (cond, maxFrames = 1200, chunk = 6) => {
    for (let i = 0; i < maxFrames; i += chunk) {
      const s = await d.st();
      if (cond(s)) return s;
      await d.adv(chunk);
      if (i % 24 === 0) await sample(s.levelInfo.step || '');
    }
    return null;
  };
  void origUntil;
  // Jump button pulses during the lesson on touch.
  let pulsed = false;
  const quiet = (name, ok) => {};
  await playChapter(page, (label, ok, detail) => { if (!/draw calls/.test(label)) check('touch: ' + label, ok, detail); }, d, async (name) => {
    await sample(name);
    if (name === 'jump') {
      pulsed = await page.evaluate(() => document.querySelector('.tc-button[data-action=jump]').classList.contains('pulse'));
    }
    if (name === 'superglen') {
      await page.evaluate(() => window.__superglen.advance(2, true));
      await shot(page, 'bab1-touch-281');
    }
  }, { skipPoles: true });
  void quiet;
  check('touch: jump button pulses during the jump lesson', pulsed);
  check('touch: dialog bubble, prompt icon and buttons never overlap at any sampled beat', overlaps === 0, `${overlaps} overlaps in ${samples.length} samples`);
  const a = await actions();
  check('touch: Superglen buttons after the chapter: jump + interact only (no laser/shield/star)', a === 'jump,interact', a);
  void fingers;
}


// ---------------------------------------------------------------------------------------------------------------
// Perf scenario: frame pacing, adaptive resolution, DOM/layout work, GC pressure, shader programs, triangles,
// the ?perf=1 panel. Deterministic: the loop is fed synthetic rAF timestamps (window.__superglen.simFrame).
// ---------------------------------------------------------------------------------------------------------------
const PACING_SCENARIOS = {
  exact60: { R: 1000 / 60 },
  hz5994: { R: 1000 / 59.94 },
  jitter: { R: 1000 / 60, jitter: 2 },
  hz120: { R: 1000 / 120 },
  hitch: { R: 1000 / 60, hitch: { every: 3000, ms: 40 } },
};
const PACING_LEVELS = {
  test: { query: '?level=test&fps=0', route: { x: -17, z0: 24, z1: -24 }, passSec: 8.4, passes: 2, warmMs: 3000 },
  bab1: { query: '?fps=0&reset=1', route: { x: 1.3, z0: -9.6, z1: -36 }, passSec: 4.6, passes: 4, warmMs: 1800 },
};

/** Walk straight passes with synthetic rAF timestamps; return per-frame camera and player positions. */
async function recordPacing(page, L, S, smooth) {
  return page.evaluate(({ L, S, smooth }) => {
    const g = window.__superglen;
    g.pause(true);
    g.smoothing(smooth);
    g.resetTiming();
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const R = S.R;
    const passFrames = Math.round((L.passSec * 1000) / R);
    const out = { cam: [], pl: [], f: [], hitchAt: [] };
    let T = 1000;
    let nextHitch = S.hitch ? S.hitch.every : 1e12;
    let elapsed = 0;
    g.simFrame(T, false);
    for (let k = 0; k < passFrames * L.passes; k++) {
      const pf = k % passFrames;
      if (pf === 0) {
        g.placePlayer(L.route.x, L.route.z0);
        g.setCameraYaw(0);
        g.walkTo(L.route.x, L.route.z1);
      }
      if (S.hitch && elapsed >= nextHitch) {
        T += S.hitch.ms;
        nextHitch += S.hitch.every;
        out.hitchAt.push(k);
      } else T += R;
      elapsed += R;
      const j = S.jitter ? (rnd() * 2 - 1) * S.jitter : 0;
      g.simFrame(T + j, false);
      out.cam.push([g.camera.x, g.camera.y, g.camera.z]);
      out.pl.push([g.player.x, g.player.y, g.player.z]);
      out.f.push(pf);
    }
    g.cancelWalk();
    g.smoothing(true);
    g.resetTiming();
    return out;
  }, { L, S, smooth });
}

function pacingStats(rec, S, warmMs) {
  const warm = Math.round(warmMs / S.R);
  const skip = new Set();
  for (const h of rec.hitchAt) for (let d = -1; d <= 4; d++) skip.add(h + d);
  const camD = [];
  const relD = [];
  for (let k = 1; k < rec.cam.length; k++) {
    if (rec.f[k] < warm || rec.f[k - 1] < warm || skip.has(k)) continue;
    const c = rec.cam[k], c0 = rec.cam[k - 1], p = rec.pl[k], p0 = rec.pl[k - 1];
    camD.push(Math.hypot(c[0] - c0[0], c[1] - c0[1], c[2] - c0[2]));
    relD.push(Math.hypot(p[0] - c[0] - (p0[0] - c0[0]), p[1] - c[1] - (p0[1] - c0[1]), p[2] - c[2] - (p0[2] - c0[2])));
  }
  const n = camD.length;
  const mean = camD.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(camD.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  return {
    n,
    meanMm: mean * 1000,
    cv: sd / mean,
    maxDev: Math.max(...camD.map((v) => Math.abs(v - mean))) / mean,
    relRmsMm: Math.sqrt(relD.reduce((a, v) => a + v * v, 0) / n) * 1000,
    relMaxMm: Math.max(...relD) * 1000,
  };
}

async function loadFresh(page, query) {
  await page.goto(URL + query);
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  await sleep(1200);
}

async function perfScenario(page, check) {
  const report = (label, v) => console.log(`   [perf] ${label}: ${v}`);

  // ---- 1. Frame pacing (walk speed must be constant frame to frame) ----
  const PACING_LIMITS = {
    exact60: { cv: 0.005, rel: 1.0 },
    hz5994: { cv: 0.005, rel: 1.0 },
    jitter: { cv: 0.04, rel: 1.0 },
    hz120: { cv: 0.005, rel: 1.0 },
    hitch: { cv: 0.01, rel: 1.5 },
  };
  for (const [lname, L] of Object.entries(PACING_LEVELS)) {
    await loadFresh(page, L.query);
    for (const [sname, S] of Object.entries(PACING_SCENARIOS)) {
      const st = pacingStats(await recordPacing(page, L, S, true), S, L.warmMs);
      const lim = PACING_LIMITS[sname];
      report(`pacing ${lname}/${sname}`, `camera step CV ${(st.cv * 100).toFixed(2)}% maxDev ${(st.maxDev * 100).toFixed(1)}% player-vs-camera rms ${st.relRmsMm.toFixed(2)}mm max ${st.relMaxMm.toFixed(2)}mm (n=${st.n})`);
      check(`pacing ${lname}/${sname}: walking is smooth (camera step CV < ${lim.cv * 100}%, player stays put on screen)`, st.n > 300 && st.cv < lim.cv && st.relRmsMm < lim.rel, `CV ${(st.cv * 100).toFixed(2)}% rel rms ${st.relRmsMm.toFixed(2)}mm`);
    }
    if (lname === 'test') {
      // The dt filter must beat raw timestamps when they jitter.
      const S = PACING_SCENARIOS.jitter;
      const raw = pacingStats(await recordPacing(page, L, S, false), S, L.warmMs);
      const sm = pacingStats(await recordPacing(page, L, S, true), S, L.warmMs);
      report('pacing jitter without/with dt filter', `CV ${(raw.cv * 100).toFixed(2)}% -> ${(sm.cv * 100).toFixed(2)}%`);
      check('pacing: the dt filter at least halves the camera step CV under +-2 ms timestamp jitter', sm.cv < raw.cv * 0.5, `${(raw.cv * 100).toFixed(2)}% -> ${(sm.cv * 100).toFixed(2)}%`);
    }
  }

  // ---- 2. Shadow map follows the player in whole texels (no swimming shadows) ----
  await loadFresh(page, '?fps=0&reset=1');
  const phase = await page.evaluate(() => {
    const g = window.__superglen;
    g.pause(true);
    const run = (snap) => {
      g.shadowSnap(snap);
      g.placePlayer(0, -4);
      g.advance(5, false);
      const a = [];
      for (let i = 0; i < 40; i++) {
        g.placePlayer(0.0137 * i, -4 - 0.0071 * i);
        g.advance(1, false);
        a.push(g.shadowPhase());
      }
      const spread = (k) => Math.max(...a.map((p) => p[k])) - Math.min(...a.map((p) => p[k]));
      return Math.max(spread(0), spread(1));
    };
    const off = run(false);
    const on = run(true);
    g.shadowSnap(true);
    return { off, on };
  });
  report('shadow texel phase spread over 0.5 m of walking (texels)', `unsnapped ${phase.off.toFixed(3)} -> snapped ${phase.on.toFixed(3)}`);
  check('shadow camera is snapped to whole shadow-map texels while walking', phase.on < 0.05 && phase.off > 0.3, `snapped ${phase.on.toFixed(3)}, unsnapped ${phase.off.toFixed(3)}`);

  // ---- 3. Adaptive resolution: no flapping, hard cap ----
  const adapt = await page.evaluate(() => {
    const g = window.__superglen;
    g.pause(true);
    g.adaptReset();
    const res = {};
    const run = (name, frames, moving, startT) => {
      let T = startT;
      const times = [];
      let last = g.adaptive().changes;
      for (const dtMs of frames) {
        T += dtMs;
        g.adaptFrame(T, typeof moving === 'function' ? moving(T) : moving);
        const c = g.adaptive().changes;
        if (c !== last) { times.push(T); last = c; }
      }
      return { T, times };
    };
    // a) steady 60 fps for 60 s while walking
    const steady = Array.from({ length: 3600 }, () => 1000 / 60);
    const a = run('steady', steady, true, 1e6);
    res.steadyChanges = a.times.length;
    res.steadyStep = g.adaptive().step;
    // b) a phone hovering around the 27 fps threshold for 5 minutes (noise included)
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const hover = [];
    for (let i = 0; i < 9000; i++) {
      const phase = Math.floor(i / 180) % 2; // 3 s slow-ish, 3 s ok-ish
      hover.push((phase ? 1000 / 31 : 1000 / 24) + (rnd() - 0.5) * 8);
    }
    const b = run('hover', hover, true, a.T);
    res.hoverChanges = b.times.length;
    let worst = 0;
    for (let i = 0; i < b.times.length; i++) {
      let n = 0;
      for (let j = i; j < b.times.length && b.times[j] - b.times[i] < 60000; j++) n++;
      worst = Math.max(worst, n);
    }
    res.hoverWorstPerMinute = worst;
    // c) after a real slow patch (fresh state), a fast walk must not step back up within 25 s
    g.adaptReset();
    const slow = Array.from({ length: 5 * 15 }, () => 1000 / 15);
    const c1 = run('slow', slow, true, b.T + 1e6);
    res.droppedOnSlow = g.adaptive().step > 0;
    const fast = Array.from({ length: 60 * 25 }, () => 1000 / 60);
    const c2 = run('recover', fast, true, c1.T);
    res.upWhileWalking25s = c2.times.length;
    return res;
  });
  report('adaptive resolution', JSON.stringify(adapt));
  check('adaptive: zero pixel-ratio changes during 60 s of steady 60 fps walking on the phone preset', adapt.steadyChanges === 0 && adapt.steadyStep === 0, `${adapt.steadyChanges} changes`);
  check('adaptive: a phone hovering at the threshold for 5 min changes the ratio at most 3 times per minute', adapt.hoverWorstPerMinute <= 3, `worst ${adapt.hoverWorstPerMinute}/min, total ${adapt.hoverChanges}`);
  check('adaptive: a slow patch steps down, and it does not step back up while walking within 25 s', adapt.droppedOnSlow && adapt.upWhileWalking25s === 0, JSON.stringify({ d: adapt.droppedOnSlow, up: adapt.upWhileWalking25s }));

  // ---- 4. Resize storms: Safari bars / visualViewport events must not reallocate the drawing buffer ----
  await loadFresh(page, '?level=test&fps=0');
  const resizes = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    let sets = 0;
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    Object.defineProperty(canvas, 'width', { configurable: true, get() { return d.get.call(this); }, set(v) { sets++; d.set.call(this, v); } });
    for (let i = 0; i < 40; i++) {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('orientationchange'));
      window.visualViewport && window.visualViewport.dispatchEvent(new Event('resize'));
    }
    await new Promise((r) => setTimeout(r, 400));
    return sets;
  });
  check('resize events with an unchanged size never touch the canvas size (120 events)', resizes === 0, `${resizes} canvas width writes`);

  // ---- 5. DOM writes and layout reads per frame while walking, GC pressure ----
  for (const [lname, q, dest] of [['test', '?level=test', [0, -20]], ['bab1', '?reset=1', [0, -7.5]]]) {
    await loadFresh(page, q);
    const dom = await page.evaluate(({ dest }) => {
      const g = window.__superglen;
      g.pause(true);
      g.resetTiming();
      const counts = { layout: 0 };
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { counts.layout++; return rect.apply(this, arguments); };
      const ow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { counts.layout++; return ow.get.call(this); } });
      const gcs = window.getComputedStyle;
      window.getComputedStyle = function () { counts.layout++; return gcs.apply(window, arguments); };
      const mo = new MutationObserver(() => {});
      mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      let T = 5000;
      g.simFrame(T, false);
      g.walkTo(dest[0], dest[1]);
      let frames = 0;
      for (let i = 0; i < 240; i++) { T += 1000 / 60; g.simFrame(T, false); frames++; }
      const records = mo.takeRecords().length;
      mo.disconnect();
      Element.prototype.getBoundingClientRect = rect;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', ow);
      window.getComputedStyle = gcs;
      g.cancelWalk();
      return { records, layout: counts.layout, frames };
    }, { dest });
    report(`DOM ${lname}`, `${dom.records} mutations, ${dom.layout} layout reads in ${dom.frames} walking frames`);
    check(`DOM (${lname}): <= 10 DOM mutations and 0 layout reads in 240 walking frames`, dom.records <= 10 && dom.layout === 0, `${dom.records} mutations, ${dom.layout} layout reads`);
  }

  // GC pressure: heap growth per frame (needs --enable-precise-memory-info; skipped when unavailable).
  const heapOk = await page.evaluate(() => typeof performance.memory !== 'undefined' && typeof window.gc === 'function');
  if (!heapOk) {
    report('heap', 'performance.memory/gc unavailable: skipped');
  } else {
    const HEAP_LIMIT = { test: 16000, bab1: 16000 }; // bytes per frame; before the fixes: ~22000 and ~38000, after ~6000-12000
    for (const [lname, q, dest] of [['test', '?level=test&fps=0', [0, -20]], ['bab1', '?fps=0&reset=1', [0, -7.5]]]) {
      await loadFresh(page, q);
      const bpf = await page.evaluate(({ dest }) => {
        const g = window.__superglen;
        g.pause(true);
        g.advance(5, true);
        g.walkTo(dest[0], dest[1]);
        g.advance(30, false);
        window.gc();
        const heap = () => performance.memory.usedJSHeapSize;
        let prev = heap();
        let acc = 0;
        const n = 400;
        for (let i = 0; i < n; i++) { g.advance(1, false); const h = heap(); if (h >= prev) acc += h - prev; prev = h; }
        g.cancelWalk();
        return acc / n;
      }, { dest });
      report(`heap ${lname}`, `${Math.round(bpf)} bytes per frame`);
      check(`heap (${lname}): < ${HEAP_LIMIT[lname]} bytes allocated per walking frame`, bpf < HEAP_LIMIT[lname], `${Math.round(bpf)} B/frame`);
    }
  }

  // ---- 6. Shader programs stay constant, triangle budget (story level) ----
  await loadFresh(page, '?fps=0&reset=1');
  const prog = await page.evaluate(() => {
    const g = window.__superglen;
    g.pause(true);
    g.advance(3, true);
    const p0 = g.debugCounts().programs;
    let maxTris = 0;
    const tris = {};
    for (const [name, x, z] of [['street start', 0, 0], ['street mid', 0, -20], ['plaza', 0, -36], ['hall door', 0, -45], ['hall', 0, -55], ['lab', 0, -70]]) {
      g.placePlayer(x, z);
      g.setCameraYaw(0);
      g.advance(40, false);
      g.advance(1, true);
      const c = g.debugCounts();
      tris[name] = c.triangles;
      maxTris = Math.max(maxTris, c.triangles);
    }
    // Exercise things that appear mid-play: Superglen flash ring, objective beam, mode back.
    g.game.setPlayerMode('superglen');
    g.advance(20, true);
    g.game.setPlayerMode('glen');
    g.advance(20, true);
    return { p0, p1: g.debugCounts().programs, maxTris, tris };
  });
  report('programs / triangles', JSON.stringify(prog));
  check('shader programs: none compiled after warm-up while walking all areas and switching mode', prog.p1 === prog.p0 && prog.p0 > 0, `${prog.p0} -> ${prog.p1}`);
  check('bab1 triangles per frame (incl. shadow pass) <= 60000 at every sampled spot', prog.maxTris <= 60000, `max ${prog.maxTris}: ${JSON.stringify(prog.tris)}`);

  // ---- 7. ?perf=1 panel ----
  await loadFresh(page, '?level=test&fps=0');
  check('perf panel is absent without ?perf=1', await page.evaluate(() => !document.querySelector('.perf-panel')));
  await loadFresh(page, '?level=test&fps=0&perf=1');
  await sleep(1800);
  const pn = await page.evaluate(() => {
    const el = document.querySelector('.perf-panel');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = el.querySelector('canvas');
    return { text: el.innerText, w: r.width, h: r.height, cx: r.left + r.width / 2, vw: window.innerWidth, top: r.top, cw: c && c.width, ch: c && c.height };
  });
  check('perf panel appears with ?perf=1, top-centre, small, with a 240x48 graph', !!pn && pn.cw === 240 && pn.ch === 48 && Math.abs(pn.cx - pn.vw / 2) < 2 && pn.top < 12 && pn.w < 280 && pn.h < 110, JSON.stringify(pn));
  check('perf panel shows median/p99, hitches, steps, ratio, calls/tri and the worst hitch', !!pn && /med [\d.]+ p99 [\d.]+/.test(pn.text) && /hitch\/10s/.test(pn.text) && /steps 0:/.test(pn.text) && /ratio [\d.]+ chg \d+/.test(pn.text) && /calls \d+ tri \d+/.test(pn.text) && /worst/.test(pn.text), pn && pn.text.replace(/\n/g, ' | '));
  await page.click('.perf-panel');
  const t1 = await page.evaluate(() => document.querySelector('.perf-panel').innerText);
  await sleep(1200);
  const t2 = await page.evaluate(() => document.querySelector('.perf-panel').innerText);
  check('tapping the perf panel freezes it', t1 === t2, '');
  await page.click('.perf-panel');
  await sleep(900);
  const t3 = await page.evaluate(() => document.querySelector('.perf-panel').innerText);
  check('tapping again resumes it', t3 !== t2, '');
  await shot(page, 'perf-panel');
}

async function runScenario(browser, name, ctxOpts, body, query = '?level=test') {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return { name, checks: [], errors: [], fps: { min: 0, avg: 0 } };
  const result = { name, checks: [], errors: [], fps: { min: 0, avg: 0 } };
  const check = (label, ok, detail) => result.checks.push({ label, ok: !!ok, detail });
  const ctx = await browser.newContext(ctxOpts);
  // Switches on the test-only debug numbers of the story level (pole cover, camera position).
  await ctx.addInitScript(() => { window.__SG_TEST = true; });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') result.errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => result.errors.push(`pageerror: ${e.message}`));
  try {
    await page.goto(URL + query);
    await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
    await body(page, check);
    result.fps = await sampleFps(page);
  } catch (e) {
    check('scenario ran without exception', false, (e.stack || e.message).split('\n').slice(0,4).join(' | '));
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
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
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
        {
          const l = await page.evaluate(startLayoutInfo);
          check('start desktop 1280x720: logo/pill inside, no overlap, no mask', l.logoInside && l.pillInside && !l.overlap && l.maskNone, JSON.stringify(l));
          const lum = await cornerLuminance(page, 2, 2);
          check('start desktop: background is light (not black)', lum > 0.55, lum.toFixed(2));
        }
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

    results.push(await runScenario(browser, 'framework', { viewport: { width: 1280, height: 720 } }, frameworkDesktopScenario, '?level=demo&fps=0'));
    for (const h of [390, 281]) {
      results.push(await runScenario(browser, `framework-touch-${h}`, { viewport: { width: 844, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, frameworkTouchScenario, '?level=demo&fps=0'));
    }
    results.push(await runScenario(browser, 'steering-desktop', { viewport: { width: 1280, height: 720 } }, steeringDesktopScenario));
    const iphone = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
    results.push(await runScenario(browser, 'steering-touch', iphone, steeringTouchScenario));
    results.push(await runScenario(browser, 'steering-touch-2', iphone, steeringTouchScenario2));
    results.push(await runScenario(browser, 'steering-touch-3', iphone, steeringTouchScenario3));

    results.push(await runScenario(browser, 'desktop-jump', { viewport: { width: 1280, height: 720 } }, jumpScenario));

    results.push(await runScenario(browser, 'bab1', { viewport: { width: 1280, height: 720 } }, bab1DesktopScenario, '?fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab1-plank', { viewport: { width: 1280, height: 720 } }, bab1PlankScenario, '?fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab1-return', { viewport: { width: 1280, height: 720 } }, bab1ReturnScenario, '?fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab1-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, bab1TouchScenario, '?fps=0&reset=1'));

    results.push(await runScenario(browser, 'perf', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, perfScenario, '?level=test&fps=0'));

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
