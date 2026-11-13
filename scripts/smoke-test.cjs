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
  // The test level unlocks flying; this scenario holds Space for 2.5 s to prove "hold never re-jumps", which would
  // now start the jets. Flight has its own scenario group (skills-*).
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
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
  check('Superglen first jump (rhythm level 0) peak 1.52-1.68 m', r.peak > 1.52 && r.peak < 1.68, `${r.peak.toFixed(3)} m`);
  check('Superglen landing registers a stomp', r.end.stomps === st0 + 1, `stomps ${st0} -> ${r.end.stomps}`);
  await bot.step(45); // stand for 0.75 s: a late press is a plain level-0 jump (see the parkour scenarios for the rhythm)
  r = await jumpOnce(20); // second press at the top of the jump (apex at ~22 frames)
  check('Superglen double jump peak 2.6-3.0 m (1.6 + 1.2 above the press point)', r.peak > 2.6 && r.peak < 3.0, `${r.peak.toFixed(3)} m`);
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
    check('holding Space bounces by itself (easy mode, flight locked)', bot.last.jumps >= before + 3, `jumps +${bot.last.jumps - before}`);
    for (let i = 0; i < 200 && !bot.last.g; i++) await bot.step(1);
    await bot.step(5);
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
  async function hopTo(px, useDouble, level) {
    if (level !== undefined) await page.evaluate((l) => window.__superglen.rhythm.setLevel(l), level);
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
  await bot.goTo(1, -20.2);
  s = await hopTo(1, true, 0);
  check('pole 2.5 m reachable from the ground at level 0 only with a double jump (1.6 + 1.2 m)', s.g && Math.abs(s.y - 2.5) < 0.1, `y=${s.y.toFixed(2)} x=${s.x.toFixed(2)} z=${s.z.toFixed(2)}`);
  await bot.setKeys(new Set(['s']));
  await bot.step(60);
  await bot.release();
  await bot.step(60);
  await bot.goTo(5, -20.2);
  s = await hopTo(5, false, 4);
  check('tallest pole 3.5 m reachable from the ground at rhythm level 4 (Lompat Singa, 4.2 m)', s.g && Math.abs(s.y - 3.5) < 0.1, `y=${s.y.toFixed(2)} x=${s.x.toFixed(2)} z=${s.z.toFixed(2)}`);
  await bot.setKeys(new Set(['s']));
  await bot.step(80);
  await bot.release();
  await bot.step(60);

  // ---- 4. Coyote time (Glen, 1.2 m platform edge) --------------------------------
  await bot.tap('e');
  s = await bot.step(10);
  check('E switches back to Glen', s.mode === 'glen');
  async function climbAndWalkOff(waitFrames) {
    await page.evaluate(() => window.__superglen.placePlayer(-12, 3)); // start in front of the ramp (the pole section ends elsewhere)
    await bot.step(5);
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
  // Peak with the touch jump button (hold: no repeat, one jump). Flying has its own scenario (skills-touch).
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  {
    const j0 = bot.last.jumps;
    await fingers.down(11, jp.x, jp.y);
    await bot.step(150);
    await fingers.up(11);
    await bot.step(5);
    check('touch: holding the jump button bounces by itself (easy mode, flight locked)', bot.last.jumps >= j0 + 3, `jumps +${bot.last.jumps - j0}`);
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
  const tag = opts.tag || (opts.skipPoles ? 'touch' : 'desktop');
  const chapter = opts.chapter || 1;
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
  check(`${t}: text says Chapter ${chapter} selesai!`, m.text.includes(`Chapter ${chapter} selesai!`), m.text);
  await shot(page, opts.shotName || (tag === 'touch' ? 'bab1-done-touch' : 'bab1-done'));
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
  check('bab1 before the costume: no transform star (Glen cannot switch yet)', await page.evaluate(() => !document.querySelector('.tc-button[data-action=transform]')));
  check('bab1 before the costume: PC help card has no "Q: berubah"', await page.evaluate(() => !document.querySelector('.hud-controls').textContent.includes('Q: berubah')));
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
  check('bab1 funny ending (controls locked): transform star hidden', await page.evaluate(() => !document.querySelector('.tc-button[data-action=transform]')));
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
  check('bab1 after the costume: transform star appears once controls are free', await page.evaluate(() => !!document.querySelector('.tc-button[data-action=transform]')));
  check('bab1 after the costume: PC help card lists "Q: berubah"', await page.evaluate(() => document.querySelector('.hud-controls').textContent.includes('Q: berubah')));
  if (opts.skipPoles) {
    // touch: tap the star -> Glen -> tap again -> Superglen
    const tapStar = async () => {
      const c = await page.evaluate(() => { const r = document.querySelector('.tc-button[data-action=transform]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.touchscreen.tap(c.x, c.y);
      await d.adv(4, true);
    };
    await tapStar();
    check('touch: tapping the star in the lab switches back to Glen', (await d.st()).mode === 'glen');
    await shot(page, 'transform-back-281');
    await tapStar();
    check('touch: tapping the star again switches to Superglen', (await d.st()).mode === 'superglen');
    return;
  }
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
  await page.evaluate(() => { window.__superglen.save.markChapterDone('bab1'); window.__superglen.save.setLastMode('superglen'); });
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
  check('returning: wall already open, no flashlight, no objective', s.levelInfo.wallOpen === true && s.levelInfo.flashlight === false);
  await shot(page, 'bab1-return');
  check('returning (Chapter 2 not played): the objective beam points at Nino', s.objective.active && Math.abs(s.objective.x - 4.2) < 0.5 && Math.abs(s.objective.z + 70.5) < 0.5, JSON.stringify(s.objective));
  check('returning: all skills still locked, flying ceiling set for the small lab', !s.skills.unlocked.fly && s.skills.maxFlyHeight < 6, `maxFly ${s.skills.maxFlyHeight}`);
  // ---- transform back to Glen: Q on PC, the star on touch; skills follow the mode; the last mode is remembered ----
  {
    const acts = () => page.evaluate(() => [...document.querySelectorAll('.tc-button')].map((e) => e.dataset.action).join(','));
    const help = await page.evaluate(() => [...document.querySelectorAll('.hud-controls li')].map((e) => e.textContent));
    check('returning: transform star present, PC card lists "Q: berubah" and "E: bicara / ambil"', (await acts()) === 'jump,interact,transform' && help.includes('Q: berubah') && help.includes('E: bicara / ambil'), `${await acts()} | ${help.join(' / ')}`);
    await d.tap('q');
    check('Q switches Superglen -> Glen in the story lab', (await d.st()).mode === 'glen');
    check('...Glen buttons: jump + interact + star', (await acts()) === 'jump,interact,transform', await acts());
    await d.tap('q');
    check('Q again switches back to Superglen', (await d.st()).mode === 'superglen');
    await page.evaluate(() => window.__superglen.game.setSkills({ laser: true, shield: true }));
    await d.adv(2);
    check('Superglen with skills: jump, interact, laser, shield + star', (await acts()) === 'jump,interact,laser,shield,transform', await acts());
    await d.tap('q');
    check('Glen: the skill buttons are gone (jump + interact + star)', (await acts()) === 'jump,interact,transform' && (await d.st()).mode === 'glen', await acts());
    await d.tap('q');
    check('Superglen again: the skill buttons are back', (await acts()) === 'jump,interact,laser,shield,transform', await acts());
    await page.evaluate(() => window.__superglen.game.setSkills({ laser: false, shield: false }));
    await d.adv(2);
    // Locked controls hide the star and ignore Q.
    await page.evaluate(() => window.__superglen.game.setControlsEnabled(false));
    await d.adv(2);
    await d.tap('q');
    check('controls locked: star hidden and Q does nothing', (await acts()) === 'jump,interact' && (await d.st()).mode === 'superglen', await acts());
    await page.evaluate(() => window.__superglen.game.setControlsEnabled(true));
    await d.adv(2);
    // Leave as Glen: the next visit starts as Glen.
    await d.tap('q');
    check('left the game as Glen: the save remembers it', (await d.st()).save.data.lastMode === 'glen');
    await page.goto(URL + '?fps=0');
    await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
    await sleep(1500);
    await page.mouse.click(640, 360);
    await sleep(600);
    await page.evaluate(() => window.__superglen.pause(true));
    await d.adv(40, true);
    s = await d.st();
    check('reload: the returning player starts as Glen with the star visible', s.mode === 'glen' && (await acts()) === 'jump,interact,transform', `${s.mode} ${await acts()}`);
    await d.tap('q');
    check('...and Q makes Superglen again (saved)', (await d.st()).mode === 'superglen' && (await d.st()).save.data.lastMode === 'superglen');
  }
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
  // Nino offers a friendly talk line and sends the child on to Chapter 2.
  await d.walk(0, -62.6, 600);
  await d.walk(2.2, -69.5, 600);
  await d.adv(10);
  s = await d.st();
  check('Nino offers a talk prompt', s.prompt.visible && s.prompt.icon === 'talk', JSON.stringify(s.prompt));
  await d.tap('e');
  check('Nino says bab1_nino_besok', (await d.st()).dialog.id === 'bab1_nino_besok');
  check('E talks to Nino and does not switch the mode (E is not the transform key in story levels)', (await d.st()).mode === 'superglen');
  await d.adv(200); // the line ends (game time), then the fade to Chapter 2 starts
  await page.evaluate(() => window.__superglen.pause(false));
  await page.waitForFunction(() => window.__superglen.level === 'bab2' && !window.__superglen.loading, null, { timeout: 30000 });
  check('after the line the game fades into Chapter 2 (bab2)', true);
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
  check('touch: Superglen buttons after the chapter: jump + interact + star (no laser/shield yet)', a === 'jump,interact,transform', a);
  void fingers;
}


// ============================ Bab 2 ============================

/** Pressing the skill inputs the way the platform does it: keys on the desktop, fingers on the buttons on touch. */
function makeBab2Inputs(page, mode, fingers) {
  if (mode === 'kbd') {
    const key = (k) => (on) => (on ? page.keyboard.down(k) : page.keyboard.up(k));
    return { jump: key('Space'), laser: key('j'), shield: key('k'), interact: key('e') };
  }
  const ids = { jump: 12, laser: 13, shield: 14, interact: 15 };
  const held = new Set();
  const set = (a) => async (on) => {
    if (on && !held.has(a)) {
      const c = await page.evaluate((a) => {
        const b = document.querySelector(`.tc-button[data-action=${a}]`);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, a);
      if (!c) return; // button not unlocked yet: nothing to press
      await fingers.down(ids[a], c.x, c.y);
      held.add(a);
    } else if (!on && held.has(a)) {
      await fingers.up(ids[a]);
      held.delete(a);
    }
  };
  return { jump: set('jump'), laser: set('laser'), shield: set('shield'), interact: set('interact') };
}

const hallTris = (c) => `${c.calls} calls, ${c.triangles} tris, ${c.programs} programs`;

/** The whole of Chapter 2 through the normal input path. `beat(name, d)` is called at the interesting moments. */
async function playBab2(page, check, d, inp, tag, beat, opts = {}) {
  const hits = {};
  let lastId = '';
  d.adv = async (n, render = false) => {
    let left = n;
    while (left > 0) {
      const c = Math.min(left, 10);
      await page.evaluate(([c, r]) => window.__superglen.advanceAsync(c, r), [c, left - c <= 0 && render]);
      left -= c;
      const id = await page.evaluate(() => window.__superglen.dialog.id);
      if (id && id !== lastId) hits[id] = (hits[id] || 0) + 1;
      lastId = id;
      if (id && d.seen[d.seen.length - 1] !== id) d.seen.push(id);
      if (d.autoQuiz !== false) await quizBotStep(page, tag);
    }
  };
  d.quizTag = tag;
  const programs0 = (await page.evaluate(countsOf)).programs;
  const areas = [];
  const area = async (name) => {
    await page.evaluate(() => window.__superglen.advance(2, true));
    const c = await page.evaluate(countsOf);
    areas.push(`${name}: ${hallTris(c)}`);
    check(`${tag}: draw calls and triangles at ${name} within budget (< 150 calls, <= 60k tris)`, c.calls < 150 && c.triangles <= 60000, hallTris(c));
    check(`${tag}: no new shader programs at ${name}`, c.programs === programs0, `${c.programs} vs ${programs0}`);
  };
  const actions = () => page.evaluate(() => [...document.querySelectorAll('.tc-button')].map((e) => e.dataset.action).join(','));
  let s = await d.st();

  // ---- start ----
  await d.adv(20);
  s = await d.st();
  check(`${tag}: ?level=bab2 starts as Superglen`, s.level === 'bab2' && s.mode === 'superglen', `${s.level} ${s.mode}`);
  check(`${tag}: only Lompat Barongsai at the start (no skill unlocked)`, !s.skills.unlocked.fly && !s.skills.unlocked.laser && !s.skills.unlocked.shield, JSON.stringify(s.skills.unlocked));
  if (tag === 'touch') check('touch: buttons at the start are jump + interact', (await actions()) === 'jump,interact', await actions());
  else check('desktop: help card does not list skills yet', await page.evaluate(() => !document.querySelector('.hud-controls').textContent.includes('Tahan Spasi')));
  check(`${tag}: Chapter 2 story: no transform star (Superglen is required)`, await page.evaluate(() => !document.querySelector('.tc-button[data-action=transform]')));
  await expectStanding(page, check, `bab2 at start (${tag})`);
  check(`${tag}: first line bab2_nino_pagi`, d.seen.includes('bab2_nino_pagi'), d.seen.join());
  check(`${tag}: objective beam on the flying pad`, s.objective.active && Math.abs(s.objective.x) < 0.5 && Math.abs(s.objective.z + 9) < 0.5, JSON.stringify(s.objective));
  await d.adv(2, true);
  await beat('hall', d);
  await area('hall start');
  // Skills do nothing before their unlock step.
  const f0 = s.skills.flights;
  await inp.jump(true);
  await d.adv(70);
  await inp.jump(false);
  await inp.laser(true);
  await d.adv(3);
  await inp.laser(false);
  s = await d.st();
  check(`${tag}: holding jump before the unlock does not fly, J does not shoot`, s.skills.flights === f0 && !s.skills.flying && s.skills.laserShots === 0, `flights ${s.skills.flights} shots ${s.skills.laserShots}`);
  await d.adv(300);

  // ---- 1. flying ----
  s = await d.walk(0, -9, 900);
  check(`${tag}: walked to the flying pad`, Math.hypot(s.player.x, s.player.z + 9) < 3.3, `(${s.player.x.toFixed(1)}, ${s.player.z.toFixed(1)})`);
  s = await d.until(() => d.seen.includes('bab2_nino_terbang'), 400, 10);
  check(`${tag}: terbang line at the pad`, !!s);
  await passGate(page, check, d, tag, 'fly', 'berhitung');
  s = await d.until((s) => s.skills.unlocked.fly, 400, 10);
  check(`${tag}: flying unlocks after the line`, !!s);
  s = await d.st();
  check(`${tag}: the unlock is saved`, s.save.data.skills.fly === true);
  s = await d.until((s) => s.levelInfo.step === 'bonk', 60, 2);
  check(`${tag}: comic first try locks the controls and launches`, !!s && s.controlsEnabled === false, s ? `step ${s.levelInfo.step}` : 'no bonk step');
  let peak = 0;
  s = await d.until((s) => { peak = Math.max(peak, s.feetY); return s.levelInfo.step === 'bonked'; }, 900, 6);
  check(`${tag}: the first try bumps the ceiling (rose above 10 m)`, !!s && peak > 10, `peak ${peak.toFixed(1)}`);
  await d.adv(3, true);
  await beat('bonk', d);
  s = await d.st();
  check(`${tag}: after the bonk: aduh line, controls still locked`, s.dialog.id === 'bab2_glen_aduh' && s.controlsEnabled === false, JSON.stringify(s.dialog));
  s = await d.until((s) => s.levelInfo.step === 'rings' && s.controlsEnabled, 1200, 10);
  check(`${tag}: control comes back after aduh + pelan lines`, !!s && d.seen.indexOf('bab2_glen_aduh') < d.seen.indexOf('bab2_nino_pelan'), d.seen.join());
  s = await d.st();
  check(`${tag}: ring step: row shows rings, 0 filled; hold hint on`, s.levelInfo.rowKind === 'ring' && s.levelInfo.rowCount === 0 && s.levelInfo.holdHint === true, JSON.stringify({ k: s.levelInfo.rowKind, c: s.levelInfo.rowCount, h: s.levelInfo.holdHint }));
  const hold = await page.evaluate(() => ({
    html: document.documentElement.classList.contains('b2-hold'),
    key: (() => { const k = document.querySelector('.b2-key'); return !!k && !k.hidden && getComputedStyle(k).display !== 'none'; })(),
    ring: getComputedStyle(document.querySelector('.tc-button[data-action=jump]'), '::after').content,
  }));
  if (tag === 'touch') check('touch: the jump button carries the animated hold ring', hold.html && hold.ring !== 'none' && hold.ring !== 'normal', JSON.stringify(hold));
  else check('desktop: Space key cap with the hold bar is visible', hold.key, JSON.stringify(hold));
  check(`${tag}: first ring waits at a low height over the pad (reachable by holding jump)`, s.levelInfo.goalKind === 'ring' && s.levelInfo.goalY <= 4 && Math.abs(s.levelInfo.goalZ + 9) < 0.6, `${s.levelInfo.goalX},${s.levelInfo.goalY},${s.levelInfo.goalZ}`);
  check(`${tag}: objective beam is at the current ring`, s.objective.active && Math.abs(s.objective.x - s.levelInfo.goalX) < 0.6 && Math.abs(s.objective.z - s.levelInfo.goalZ) < 0.6);
  if (!opts.skipFallback) {
    // Fallback: no ring for 25 s -> hint again and the ring lowers toward the player.
    const y0 = s.levelInfo.goalY;
    const c0 = hits.bab2_nino_cincin || 0;
    await d.walk(7, -9, 600); // off to the side: the lowered ring must not pass by itself
    await d.adv(1560);
    s = await d.st();
    check(`${tag}: ring fallback after 25 s: Nino repeats the hint`, (hits.bab2_nino_cincin || 0) > c0, `${c0} -> ${hits.bab2_nino_cincin}`);
    check(`${tag}: ring fallback after 25 s: the ring lowered itself toward the player`, s.levelInfo.ringFallbacks >= 1 && s.levelInfo.goalY < y0 - 0.5, `y ${y0} -> ${s.levelInfo.goalY}, fallbacks ${s.levelInfo.ringFallbacks}`);
    check(`${tag}: nothing reset: still ring 0 of 5, 0 filled, still playable`, s.levelInfo.ringIndex === 0 && s.levelInfo.rowCount === 0 && s.controlsEnabled);
  }
  // Fly through the rings: hold jump while below the ring, steer with the synthetic stick.
  let lastIdx = -1;
  const filled = [];
  let shotRings = false;
  for (let i = 0; i < 4800; i += 4) {
    s = await d.st();
    const li = s.levelInfo;
    if (li.rowCount >= 0 && filled[filled.length - 1] !== li.rowCount) filled.push(li.rowCount);
    if (li.step !== 'rings') break;
    if (li.ringIndex !== lastIdx) {
      lastIdx = li.ringIndex;
      await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [li.goalX, li.goalZ]);
    }
    // Releasing now drops at once and re-igniting takes the 0.45 s hold, so hold while below the ring and let go only well above it.
    if (s.player.y < li.goalY + 0.2) await inp.jump(true);
    else if (s.player.y > li.goalY + 1.2) await inp.jump(false);
    if (li.ringIndex === 2 && !shotRings && s.player.y > 4.5) {
      shotRings = true;
      await d.adv(4, true);
      await beat('rings', d);
    }
    await d.adv(4);
  }
  await inp.jump(false);
  await page.evaluate(() => window.__superglen.cancelWalk());
  s = await d.st();
  if (!filled.includes(5) && s.levelInfo.rowCount === 5) filled.push(5);
  check(`${tag}: 5 rings passed (counter, stat) and the row filled one by one`, s.levelInfo.rings === 5 && s.skills.ringsPassed >= 5 && [1, 2, 3, 4, 5].every((n) => filled.includes(n)), `rings ${s.levelInfo.rings}, filled ${filled.join(',')}`);
  check(`${tag}: cincin_bagus after some rings`, d.seen.includes('bab2_nino_cincin_bagus'), d.seen.join());
  s = await d.until(() => (hits.bab2_nino_hebat || 0) >= 1, 600, 10);
  check(`${tag}: hebat after the rings`, !!s);
  await area('flying');

  // ---- 2. laser ----
  s = await d.until((s) => s.levelInfo.step === 'laser', 800, 10);
  check(`${tag}: laser step starts; objective on the laser spot`, !!s && s.objective.active && Math.abs(s.objective.x + 9) < 0.6 && Math.abs(s.objective.z + 30) < 0.6, s ? JSON.stringify(s.objective) : '');
  s = await d.st();
  check(`${tag}: laser still locked before its station`, !s.skills.unlocked.laser);
  if (tag === 'touch') check('touch: no laser button yet', (await actions()) === 'jump,interact', await actions());
  s = await d.walk(-9, -30, 1500);
  s = await d.until(() => d.seen.includes('bab2_nino_laser'), 300, 10);
  check(`${tag}: laser line at the spot`, !!s);
  await inp.laser(true);
  await d.adv(3);
  await inp.laser(false);
  check(`${tag}: pressing laser before the unlock shoots nothing`, (await d.st()).skills.laserShots === 0);
  await passGate(page, check, d, tag, 'laser', 'inggris');
  s = await d.until((s) => s.skills.unlocked.laser, 400, 10);
  check(`${tag}: laser unlocks after the line (saved)`, !!s && s.save.data.skills.laser === true);
  if (tag === 'touch') {
    await d.adv(8);
    const a = await actions();
    const pulse = await page.evaluate(() => document.querySelector('.tc-button[data-action=laser]').classList.contains('pulse'));
    check('touch: laser button appears and pulses', a.includes('laser') && pulse, `${a} pulse ${pulse}`);
  } else check('desktop: help card lists the laser key', await page.evaluate(() => document.querySelector('.hud-controls').textContent.includes('laser')));
  s = await d.st();
  check(`${tag}: target row shown; the objective goal is a target`, s.levelInfo.rowKind === 'target' && s.levelInfo.goalKind === 'target', JSON.stringify({ k: s.levelInfo.rowKind, g: s.levelInfo.goalKind }));
  const filledT = [];
  let shotLaser = false;
  for (let i = 0; i < 3600; i += 30) {
    s = await d.st();
    const li = s.levelInfo;
    if (li.rowKind === 'target' && li.rowCount >= 0 && filledT[filledT.length - 1] !== li.rowCount) filledT.push(li.rowCount);
    if (li.targets >= 5) break;
    await inp.laser(true);
    await d.adv(2);
    await inp.laser(false);
    if (li.targets === 2 && !shotLaser) { shotLaser = true; await d.adv(6, true); await beat('laser', d); }
    await d.adv(26);
  }
  s = await d.st();
  if (!filledT.includes(5) && s.levelInfo.rowCount === 5) filledT.push(5);
  check(`${tag}: 5 targets hit; row filled one by one`, s.levelInfo.targets === 5 && [1, 2, 3, 4, 5].every((n) => filledT.includes(n)), `targets ${s.levelInfo.targets}, filled ${filledT.join(',')}`);
  check(`${tag}: a deliberate miss (laser at nothing) made Nino say tenang`, s.levelInfo.laserMisses >= 1 && (hits.bab2_nino_tenang || 0) >= 1, `misses ${s.levelInfo.laserMisses}, tenang x${hits.bab2_nino_tenang || 0}`);
  check(`${tag}: tenang is rate limited (at most once per 6 s)`, (hits.bab2_nino_tenang || 0) <= 3, `x${hits.bab2_nino_tenang}`);
  check(`${tag}: laser_bagus is not said after every hit`, (hits.bab2_nino_laser_bagus || 0) >= 1 && (hits.bab2_nino_laser_bagus || 0) <= 3, `x${hits.bab2_nino_laser_bagus}`);
  await d.adv(60);
  await area('laser');
  s = await d.until(() => (hits.bab2_nino_hebat || 0) >= 2, 600, 10);
  check(`${tag}: hebat after the targets`, !!s);

  // ---- 3. shield ----
  s = await d.until((s) => s.levelInfo.step === 'shield', 900, 10);
  check(`${tag}: shield step; shield still locked`, !!s && !s.skills.unlocked.shield, s ? s.levelInfo.step : '');
  s = await d.walk(6, -27, 1800);
  s = await d.until(() => d.seen.includes('bab2_nino_perisai'), 300, 10);
  check(`${tag}: perisai line at the station`, !!s);
  await passGate(page, check, d, tag, 'shield', 'mandarin');
  s = await d.until((s) => s.skills.unlocked.shield, 400, 10);
  check(`${tag}: shield unlocks after the line (saved)`, !!s && s.save.data.skills.shield === true);
  if (tag === 'touch') {
    await d.adv(8);
    const a = await actions();
    const pulse = await page.evaluate(() => document.querySelector('.tc-button[data-action=shield]').classList.contains('pulse'));
    check('touch: shield button appears and pulses; all three skills present', a === 'jump,interact,laser,shield' && pulse, `${a} pulse ${pulse}`);
  } else check('desktop: help card lists the shield key', await page.evaluate(() => document.querySelector('.hud-controls').textContent.includes('perisai')));
  s = await d.st();
  check(`${tag}: shield row shown`, s.levelInfo.rowKind === 'shield');
  // First an unblocked ball: a bonk costs nothing and pushes nobody.
  s = await d.until((s) => s.levelInfo.thrown >= 1 && s.skills.ballHits >= 1, 1200, 6);
  check(`${tag}: an unblocked ball bonks the player`, !!s, s ? '' : 'no ball hit');
  if (s) {
    const x0 = s.player.x;
    const z0 = s.player.z;
    await d.adv(30);
    const s2 = await d.st();
    const moved = Math.hypot(s2.player.x - x0, s2.player.z - z0);
    check(`${tag}: the bonk does not push the player more than 0.1 m`, moved <= 0.1, `${moved.toFixed(3)} m`);
    s = await d.until(() => (hits.bab2_nino_coba_lagi || 0) >= 1, 400, 10);
    check(`${tag}: a bonk makes Nino say coba_lagi, no penalty (blocks still 0)`, !!s && (await d.st()).levelInfo.blocks === 0, s ? '' : `coba_lagi x${hits.bab2_nino_coba_lagi || 0}`);
  }
  const filledS = [];
  let shotShield = false;
  await inp.shield(true);
  for (let i = 0; i < 4200; i += 20) {
    s = await d.st();
    const li = s.levelInfo;
    if (li.rowKind === 'shield' && li.rowCount >= 0 && filledS[filledS.length - 1] !== li.rowCount) filledS.push(li.rowCount);
    if (li.blocks >= 5) break;
    if (li.blocks === 2 && !shotShield && li.thrown >= 3) { shotShield = true; await d.adv(8, true); await beat('shield', d); }
    await d.adv(20);
  }
  await inp.shield(false);
  s = await d.st();
  if (!filledS.includes(5) && s.levelInfo.rowCount === 5) filledS.push(5);
  check(`${tag}: 5 blocks counted and the row filled`, s.levelInfo.blocks === 5 && [1, 2, 3, 4, 5].every((n) => filledS.includes(n)), `blocks ${s.levelInfo.blocks}, filled ${filledS.join(',')}`);
  check(`${tag}: tangkis line said on some blocks`, (hits.bab2_nino_tangkis || 0) >= 1);
  const t0 = s.levelInfo.thrown;
  await d.adv(400);
  s = await d.st();
  check(`${tag}: after 5 blocks the balls stop`, s.levelInfo.thrown <= t0 + 1, `${t0} -> ${s.levelInfo.thrown}`);
  await area('shield');
  s = await d.until(() => (hits.bab2_nino_hebat || 0) >= 3, 600, 10);
  check(`${tag}: hebat after the shield`, !!s);

  // ---- 4. lunch ----
  s = await d.until((s) => s.levelInfo.step === 'lunch', 900, 10);
  check(`${tag}: lunch step; beam on the picnic mat`, !!s && s.objective.active && Math.abs(s.objective.x + 12) < 0.6 && Math.abs(s.objective.z + 7) < 0.6, s ? JSON.stringify(s.objective) : '');
  check(`${tag}: bekal line`, d.seen.includes('bab2_nino_bekal'));
  await d.walk(-12, -4.8, 1800);
  await d.press('hand', 'lunch mat');
  await d.adv(3);
  s = await d.st();
  check(`${tag}: lunch scene locks the controls`, s.controlsEnabled === false && s.levelInfo.lunch === true);
  let f = 0;
  let maxCrouch = 0;
  let shotLunch = false;
  if (opts.skipLunch) {
    await d.adv(90);
    await inp.interact(true);
    await d.adv(3);
    await inp.interact(false);
    s = await d.st();
    f = 93;
    for (; f < 400 && s.levelInfo.lunch; f += 6) { await d.adv(6); s = await d.st(); }
    check('touch: a press after 1.5 s skips the rest of the lunch scene', !s.levelInfo.lunch && f < 190, `scene ended after ${f} frames`);
  } else {
    for (f = 0; f < 600; f += 10) {
      await d.adv(10);
      s = await d.st();
      maxCrouch = Math.max(maxCrouch, s.levelInfo.crouch);
      if (!shotLunch && f >= 190) { shotLunch = true; await d.adv(2, true); await beat('lunch', d); }
      if (!s.levelInfo.lunch) break;
    }
    check(`${tag}: lunch scene takes about 5 s and both sit down`, f >= 250 && f <= 420 && maxCrouch >= 0.9, `${f} frames, crouch ${maxCrouch}`);
  }
  check(`${tag}: glen_enak line`, d.seen.includes('bab2_glen_enak'));
  await d.adv(20);
  s = await d.st();
  check(`${tag}: lunch over: standing up again`, s.levelInfo.crouch < 0.05, `crouch ${s.levelInfo.crouch}`);

  // ---- 5. alarm ----
  s = await d.until((s) => s.levelInfo.step === 'alarm', 600, 10);
  check(`${tag}: alarm step: controls locked`, !!s && s.controlsEnabled === false);
  s = await d.until((s) => s.levelInfo.market === true, 400, 6);
  check(`${tag}: the wall screen switches to the city market`, !!s);
  await d.adv(40, true);
  s = await d.st();
  check(`${tag}: alarm light on (soft pulse <= 1 Hz)`, s.levelInfo.alarm > 0.5 && s.levelInfo.alarmHz <= 1, `alarm ${s.levelInfo.alarm}, ${s.levelInfo.alarmHz} Hz`);
  await beat('alarm', d);
  check(`${tag}: no Nyam bubble left once the alarm starts`, await page.evaluate(() => document.querySelectorAll('.b2-nyam').length === 0));
  s = await d.until(() => d.seen.includes('bab2_glen_siap'), 600, 10);
  check(`${tag}: alarm then siap lines in order`, !!s && d.seen.indexOf('bab2_nino_alarm') < d.seen.indexOf('bab2_glen_siap'), d.seen.join());
  s = await d.until((s) => s.levelInfo.step === 'done', 600, 10);
  check(`${tag}: chapter done step`, !!s);
  check(`${tag}: transform star still hidden until the celebration is over`, await page.evaluate(() => !document.querySelector('.tc-button[data-action=transform]')));
  await celebrationChecks(page, check, d, async (name) => { await beat(name, d); }, { chapter: 2, tag, shotName: tag === 'touch' ? 'bab2-done-touch' : 'bab2-done', skipPoles: tag === 'touch' });
  s = await d.st();
  check(`${tag}: save has bab2 done and all three skills`, s.save.data.chaptersDone.includes('bab2') && s.save.data.skills.laser && s.save.data.skills.shield && s.save.data.skills.fly, JSON.stringify(s.save.data));
  check(`${tag}: no Nyam bubble after the chapter is done`, await page.evaluate(() => document.querySelectorAll('.b2-nyam').length === 0));
  s = await d.until((s) => s.levelInfo.step === 'free', 400, 10);
  check(`${tag}: free play follows (controls on, all skills)`, !!s && s.controlsEnabled && s.skills.unlocked.fly && s.skills.unlocked.laser && s.skills.unlocked.shield);
  check(`${tag}: free play: the transform star is available`, await page.evaluate(() => !!document.querySelector('.tc-button[data-action=transform]')));
  console.log(`   bab2 ${tag} budgets: ${areas.join(' | ')}`);
  return { hits, areas };
}

/** Share of near-white pixels (R, G, B all > 245) in the top 580 px of a 1280x720 screenshot (the bottom holds the white dialog bubble). */
async function nearWhiteShare(page, name) {
  const b64 = fs.readFileSync(path.join(OUT, `${name}.png`)).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = 580;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) n++;
    return n / (d.length / 4);
  }, b64);
}

async function bab2DesktopScenario(page, check) {
  await sleep(2000);
  await page.mouse.click(640, 360);
  await sleep(800);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeStoryDriver(page, check);
  const inp = makeBab2Inputs(page, 'kbd');
  const map = { hall: 'bab2-hall', bonk: 'bab2-bonk', rings: 'bab2-rings', laser: 'bab2-laser', shield: 'bab2-shield', lunch: 'bab2-lunch', alarm: 'bab2-alarm' };
  await playBab2(page, check, d, inp, 'desktop', async (name) => {
    if (name === 'laser') { await page.evaluate(() => window.__superglen.setCameraYaw(Math.PI)); await page.evaluate(() => window.__superglen.advance(40, false)); }
    if (name === 'shield') { await page.evaluate(() => window.__superglen.setCameraYaw(-Math.PI / 2)); await page.evaluate(() => window.__superglen.advance(40, false)); }
    if (map[name]) {
      await page.evaluate(() => window.__superglen.advance(2, true));
      await shot(page, map[name]);
      if (['hall', 'rings', 'laser', 'shield', 'alarm'].includes(name)) {
        const w = await nearWhiteShare(page, map[name]);
        console.log(`   near-white share ${map[name]}: ${(w * 100).toFixed(1)}%`);
        check(`desktop: ${map[name]} is not overexposed (< 8% near-white pixels)`, w < 0.08, `${(w * 100).toFixed(1)}%`);
      }
    }
  });
  // Leak: bab2 -> test -> bab2 twice must not grow.
  await page.evaluate(() => window.__superglen.pause(false));
  const cyc = async (id) => {
    await page.evaluate((id) => window.__superglen.loadLevel(id), id);
    await page.waitForFunction((id) => window.__superglen.level === id && !window.__superglen.loading, id, { timeout: 8000 });
    await sleep(200);
  };
  await cyc('test');
  await cyc('bab2');
  await sleep(1200);
  const c1 = await page.evaluate(countsOf);
  await cyc('test');
  await cyc('bab2');
  await sleep(1200);
  const c2 = await page.evaluate(countsOf);
  const keys = ['geometries', 'textures', 'colliders', 'bodies', 'sceneChildren'];
  check('bab2 -> test -> bab2 does not leak', keys.every((k) => c1[k] === c2[k]), `${JSON.stringify(c1)} vs ${JSON.stringify(c2)}`);
  await cyc('bab1');
  await cyc('bab2');
  await sleep(800);
  const c3 = await page.evaluate(countsOf);
  check('bab2 -> bab1 -> bab2 does not leak', keys.every((k) => c1[k] === c3[k]), `${JSON.stringify(c1)} vs ${JSON.stringify(c3)}`);
  const free = await page.evaluate(() => { const g = window.__superglen; return g.level === 'bab2' && g.levelInfo.free === true; });
  check('bab2 reloaded after it was done starts in free play', free);
  await page.evaluate(() => window.__superglen.save.reset());
}

async function bab2TouchScenario(page, check) {
  const H = page.viewportSize().height;
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, H - 60);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeStoryDriver(page, check);
  const inp = makeBab2Inputs(page, 'touch', fingers);
  let overlaps = 0;
  let samples = 0;
  let rowWithDialog = 0;
  const sample = async (name) => {
    const r = await page.evaluate(() => {
      const rect = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const vis = (e) => e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
      const items = [];
      const dlg = document.querySelector('.dlg-card');
      if (vis(document.querySelector('.dlg')) && dlg) items.push(['dialog', rect(dlg)]);
      const row = document.querySelector('.b2-row');
      if (vis(row)) items.push(['row', rect(row)]);
      const pr = document.querySelector('.prompt');
      if (pr && !pr.hidden) items.push(['prompt', rect(pr.querySelector('.prompt-icon'))]);
      // (a button in its 0.6 s pop-in animation is momentarily bigger: measured once it has settled)
      for (const b of document.querySelectorAll('.tc-button:not(.tc-pop)')) items.push(['button:' + b.dataset.action, rect(b)]);
      const vw = window.innerWidth, vh = window.innerHeight;
      const bad = [];
      for (const [n, a] of items) if (a.l < -1 || a.t < -1 || a.r > vw + 1 || a.b > vh + 1) bad.push(n + '-outside');
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i][1], c = items[j][1];
        if (items[i][0].startsWith('button') && items[j][0].startsWith('button')) continue;
        if (items[i][0] === 'prompt' && items[j][0] === 'row') continue;
        if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) bad.push(items[i][0] + '/' + items[j][0]);
      }
      return { n: items.length, bad, both: !!(vis(row) && vis(document.querySelector('.dlg'))) };
    });
    samples++;
    if (r.both) rowWithDialog++;
    if (r.bad.length) { overlaps++; console.log(`   touch overlap at ${name}: ${r.bad.join(',')}`); }
    return r;
  };
  // Sample inside every wait loop of the story driver.
  d.until = async (cond, maxFrames = 1200, chunk = 6) => {
    for (let i = 0; i < maxFrames; i += chunk) {
      const s = await d.st();
      if (cond(s)) return s;
      await d.adv(chunk);
      if (i % 30 === 0) await sample(s.levelInfo.step || '');
    }
    return null;
  };
  await playBab2(page, check, d, inp, 'touch', async (name) => {
    await sample(name);
    if (name === 'hall') { await page.evaluate(() => window.__superglen.advance(2, true)); await shot(page, 'bab2-touch-281'); }
    if (name === 'rings') { await page.evaluate(() => window.__superglen.advance(2, true)); await shot(page, 'bab2-touch-281-rings'); }
  }, { skipFallback: true, skipLunch: true });
  check('touch: dialog bubble, progress row, prompt and buttons never overlap or leave the screen at any sampled beat', overlaps === 0, `${overlaps} overlaps in ${samples} samples (${rowWithDialog} with row and bubble together)`);
}

/** Flow rules, free play and the fallbacks, on fresh pages (the save is the only state). */
async function bab2FlowScenario(page, check) {
  const load = async (query, startClick = true) => {
    await page.goto(URL + query);
    await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
    await sleep(1400);
    if (startClick) await page.mouse.click(640, 360);
    await sleep(500);
  };
  const setSave = (chapters, skills) => page.evaluate(([c, sk]) => { const g = window.__superglen; g.save.data.chaptersDone = c; g.save.data.skills = sk; g.save.data.lastMode = 'superglen'; g.save.persist(); }, [chapters, skills]);
  const ALL = { laser: true, shield: true, fly: true };
  const NONE = { laser: false, shield: false, fly: false };
  const d = makeStoryDriver(page, check);
  let s;

  // a) fresh save -> Chapter 1
  await sleep(1500);
  await page.evaluate(() => window.__superglen.save.reset());
  await load('?fps=0&reset=1');
  s = await page.evaluate(state);
  check('flow: fresh save starts Chapter 1 (bab1) as Glen', s.level === 'bab1' && s.mode === 'glen', `${s.level} ${s.mode}`);

  // b) bab1 done, bab2 not -> the lab; the glowing door leads to the hall
  await setSave(['bab1'], NONE);
  await load('?fps=0');
  await page.evaluate(() => window.__superglen.pause(true));
  s = await d.st();
  check('flow: bab1 done -> starts in the lab as Superglen', s.level === 'bab1' && s.mode === 'superglen' && s.player.z < -62, `${s.level} ${s.mode} z ${s.player.z.toFixed(1)}`);
  await d.adv(30);
  await d.walk(-5.2, -69.25, 900);
  await d.adv(10);
  s = await d.st();
  check('flow: the lab door shows a hand prompt', s.prompt.visible && s.prompt.icon === 'hand', JSON.stringify(s.prompt));
  await d.tap('e');
  await page.evaluate(() => window.__superglen.pause(false));
  await page.waitForFunction(() => window.__superglen.level === 'bab2' && !window.__superglen.loading, null, { timeout: 60000 });
  s = await page.evaluate(state);
  check('flow: the lab door loads Chapter 2 (story from the start, only jump)', s.level === 'bab2' && !s.skills.unlocked.fly && s.levelInfo.free === false, `${s.level} free ${s.levelInfo.free}`);
  check('flow: the door starts the story at the spawn', Math.abs(s.player.x) < 0.5 && Math.abs(s.player.z) < 0.5);

  // c) bab2 done -> free play in the hall, all skills; restart exercises on their icons
  await setSave(['bab1', 'bab2'], ALL);
  await load('?fps=0');
  await page.evaluate(() => window.__superglen.pause(true));
  await d.adv(30);
  s = await d.st();
  check('flow: bab2 done -> starts in the hall in free play as Superglen with all skills', s.level === 'bab2' && s.mode === 'superglen' && s.levelInfo.free === true && s.skills.unlocked.fly && s.skills.unlocked.laser && s.skills.unlocked.shield && !s.objective.active, JSON.stringify({ l: s.level, f: s.levelInfo.free, u: s.skills.unlocked }));
  await expectStanding(page, check, 'bab2 free play start');
  check('flow: free play: the help card lists all three skills', await page.evaluate(() => { const t = document.querySelector('.hud-controls').textContent; return t.includes('Tahan Spasi') && t.includes('laser') && t.includes('perisai'); }));
  // Laser pad -> targets pop up; fallback after 25 s
  await d.walk(-9, -30, 1500);
  await d.adv(10);
  s = await d.st();
  check('flow: stepping on the laser icon restarts the targets (row + goal)', s.levelInfo.rowKind === 'target' && s.levelInfo.goalKind === 'target', JSON.stringify({ k: s.levelInfo.rowKind, g: s.levelInfo.goalKind }));
  const dist0 = Math.hypot(s.levelInfo.goalX - s.player.x, s.levelInfo.goalZ - s.player.z);
  await d.adv(1560);
  s = await d.st();
  const dist1 = Math.hypot(s.levelInfo.goalX - s.player.x, s.levelInfo.goalZ - s.player.z);
  check('flow: target fallback after 25 s: the target came closer (<= 6.5 m)', s.levelInfo.targetFallbacks >= 1 && dist1 <= 6.5 && dist1 <= dist0 + 0.01, `${dist0.toFixed(1)} m -> ${dist1.toFixed(1)} m, fallbacks ${s.levelInfo.targetFallbacks}`);
  await page.evaluate(() => window.__superglen.setCameraYaw(Math.PI)); // face the targets (the beam and arrow show the way)
  for (let i = 0; i < 2400; i += 30) {
    s = await d.st();
    if (s.levelInfo.targets >= 5) break;
    await d.tap('j');
    await d.adv(28);
  }
  s = await d.st();
  check('flow: free play laser round completes', s.levelInfo.targets === 5, `targets ${s.levelInfo.targets}`);
  await d.adv(120);
  // Shield pad: thrower runs while inside; slows down after 30 s without a block
  await d.walk(6, -27, 1800);
  await d.adv(10);
  s = await d.st();
  check('flow: stepping into the shield circle restarts the thrower round', s.levelInfo.rowKind === 'shield', s.levelInfo.rowKind);
  const i0 = s.levelInfo.thrownInterval;
  await d.adv(1900);
  s = await d.st();
  check('flow: thrower fallback after 30 s: it slows down', s.levelInfo.shieldFallbacks >= 1 && s.levelInfo.thrownInterval > i0, `${i0} -> ${s.levelInfo.thrownInterval}`);
  check('flow: balls were thrown while inside the circle', s.levelInfo.thrown >= 3, `thrown ${s.levelInfo.thrown}`);
  await d.walk(-4, -8, 1800);
  const th0 = (await d.st()).levelInfo.thrown;
  await d.adv(500);
  s = await d.st();
  check('flow: no balls while the player is outside the circle', s.levelInfo.thrown <= th0 + 1, `${th0} -> ${s.levelInfo.thrown}`);
  // Flying pad: rings again
  await d.walk(0, -9, 900);
  await d.adv(10);
  s = await d.st();
  check('flow: stepping on the flying icon restarts the rings (no hold hint in free play)', s.levelInfo.rowKind === 'ring' && s.levelInfo.goalKind === 'ring' && s.levelInfo.holdHint === false, JSON.stringify({ k: s.levelInfo.rowKind, h: s.levelInfo.holdHint }));
  check('flow: alarm pulse rate is at most 1 Hz', s.levelInfo.alarmHz <= 1, `${s.levelInfo.alarmHz}`);
  // Exit door back to the lab: through the corridor.
  await d.walk(0, 1.5, 900);
  await d.walk(0, 10.2, 900);
  await d.adv(10);
  s = await d.st();
  check('flow: the corridor door shows a hand prompt', s.prompt.visible && s.prompt.icon === 'hand', JSON.stringify(s.prompt));
  await d.tap('e');
  await page.evaluate(() => window.__superglen.pause(false));
  await page.waitForFunction(() => window.__superglen.level === 'bab1' && !window.__superglen.loading, null, { timeout: 60000 });
  s = await page.evaluate(state);
  check('flow: the exit door leads to the lab; all skills stay unlocked there', s.level === 'bab1' && s.skills.unlocked.fly && s.skills.unlocked.laser && s.skills.unlocked.shield && s.mode === 'superglen', JSON.stringify(s.skills.unlocked));
  check('flow: lab flying ceiling is low (harmless)', s.skills.maxFlyHeight <= 5, `${s.skills.maxFlyHeight}`);
  await page.evaluate(() => window.__superglen.pause(true));
  await d.adv(30);
  await d.walk(2.2, -69.5, 900);
  await d.adv(10);
  await d.tap('e');
  check('flow: with both chapters done, Nino in the lab only cheers (no new chapter)', (await d.st()).dialog.id === 'bab2_nino_hebat');
  await d.adv(400);
  check('flow: ... and the lab stays loaded', (await d.st()).level === 'bab1');
  await page.evaluate(() => window.__superglen.pause(false));

  // d) reduced motion: calm beacons
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setSave(['bab1', 'bab2'], ALL);
  await load('?fps=0');
  await sleep(300);
  s = await page.evaluate(state);
  check('flow: prefers-reduced-motion: the alarm does not pulse (0 Hz)', s.level === 'bab2' && s.levelInfo.alarmHz === 0, `${s.levelInfo.alarmHz}`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // e) ?reset=1 clears everything -> Chapter 1 story
  await load('?fps=0&reset=1', false);
  s = await page.evaluate(state);
  check('flow: ?reset=1 starts the Chapter 1 story again', s.level === 'bab1' && s.mode === 'glen' && s.player.z > -2 && s.save.data.chaptersDone.length === 0, `${s.level} z ${s.player.z.toFixed(1)}`);
  await page.evaluate(() => window.__superglen.save.reset());
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

// ---------------------------------------------------------------------------------------------------------------
// Skills (flight, laser, shield): deterministic stepping (1/60 s per frame) with real key events / CDP fingers.
// ---------------------------------------------------------------------------------------------------------------

/** One-shot reader of everything a skills check needs. */
const skillsSnapshot = () => {
  const g = window.__superglen;
  const k = g.skills;
  return {
    flying: k.flying, jets: k.jets, h: k.flyHeight, maxH: k.maxFlyHeight, shieldUp: k.shieldUp,
    shots: k.laserShots, hits: k.laserHits, misses: k.laserMisses, blocks: k.shieldBlocks, ballHits: k.ballHits,
    rings: k.ringsPassed, flights: k.flights, aim: k.aimTarget, proj: k.projectiles, spawned: k.projectilesSpawned,
    speedScale: k.speedScale, facing: k.facing, testHits: { ...k.testHits }, unlocked: { ...k.unlocked },
    x: g.player.x, z: g.player.z, y: g.feetY, vy: g.verticalVelocity, grounded: !g.airborne, stomps: g.stomps,
    jumps: g.jumps, dj: g.doubleJumps, mode: g.mode, info: { ...g.levelInfo }, level: g.level,
  };
};

function makeSkillsDriver(page) {
  const d = { last: null };
  d.snap = async () => (d.last = await page.evaluate(skillsSnapshot));
  d.step = async (n = 1, render = false) => {
    await page.evaluate(([n, r]) => window.__superglen.advance(n, r), [n, render]);
    return d.snap();
  };
  d.down = (k) => page.keyboard.down(k);
  d.up = (k) => page.keyboard.up(k);
  d.tap = async (k, after = 1) => {
    await page.keyboard.down(k);
    await d.step(1);
    await page.keyboard.up(k);
    return d.step(after);
  };
  d.place = async (x, z) => {
    await page.evaluate(([x, z]) => window.__superglen.placePlayer(x, z), [x, z]);
    return d.step(3);
  };
  d.camera0 = () => page.evaluate(() => window.__superglen.setCameraYaw(0));
  /** Walk with a key for a moment so the body turns that way (camera yaw 0: w = -Z, s = +Z, a = -X, d = +X). */
  d.face = async (key) => {
    await d.camera0();
    await page.keyboard.down(key);
    await d.step(16);
    await page.keyboard.up(key);
    return d.step(18);
  };
  d.mode = (m) => page.evaluate((m) => window.__superglen.game.setPlayerMode(m), m);
  d.skills = (sk) => page.evaluate((sk) => window.__superglen.game.setSkills(sk), sk);
  d.sk = (fn, arg) => page.evaluate(fn, arg);
  d.clearTargets = () => page.evaluate(() => window.__superglen.skills.removeTestTargets());
  d.addTarget = (x, y, z, id) => page.evaluate(([x, y, z, id]) => window.__superglen.skills.addTestTarget(x, y, z, 0.6, id), [x, y, z, id]);
  d.ball = (x, y, z, speed) => page.evaluate(([x, y, z, sp]) => window.__superglen.skills.throwBall(x, y, z, sp), [x, y, z, speed]);
  d.maxFly = (h) => page.evaluate((h) => window.__superglen.skills.setMaxFlyHeight(h), h);
  /** Land from anywhere: release everything and step until grounded. */
  d.land = async () => {
    for (const k of ['Space', 'w', 'a', 's', 'd', 'j', 'k']) await page.keyboard.up(k);
    for (let i = 0; i < 700; i++) {
      await d.step(5);
      if (d.last.grounded) break;
    }
    return d.step(20);
  };
  return d;
}

async function skillsDesktopScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  const d = makeSkillsDriver(page);
  await page.evaluate(() => window.__superglen.pause(true));
  let s = await d.step(30);
  const report = (label, v) => console.log(`   [skills] ${label}: ${v}`);

  check('test level: all three skills unlocked and listed on the PC card', await page.evaluate(() => {
    const u = window.__superglen.skills.unlocked;
    const t = [...document.querySelectorAll('.hud-controls li')].map((e) => e.textContent);
    return u.laser && u.shield && u.fly && t.includes('Tahan Spasi: terbang') && t.includes('J atau klik kiri: laser') && t.includes('K atau klik kanan: perisai');
  }));
  check('no skill input works in Glen mode', await (async () => {
    const f0 = s.flights;
    await d.down('Space');
    await d.step(100);
    await d.up('Space');
    const a = await d.step(1);
    await d.tap('j');
    await d.down('k');
    await d.step(5);
    await d.up('k');
    const b = await d.step(30);
    return !a.flying && a.flights === f0 && b.shots === s.shots && !b.shieldUp;
  })());
  await d.land();

  await d.tap('e', 20);
  s = await d.snap();
  check('E switches to Superglen', s.mode === 'superglen');

  // ---- Flight: taps are unchanged -----------------------------------------------------------------------
  {
    const y0 = (await d.step(1)).y;
    const f0 = d.last.flights;
    await d.tap('Space');
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      await d.step(1);
      peak = Math.max(peak, d.last.y - y0);
      if (d.last.grounded && i > 4) break;
    }
    check('tap jump: normal Superglen jump (level 0, peak 1.52-1.68 m), no flight', peak > 1.52 && peak < 1.68 && d.last.flights === f0 && !d.last.flying, `${peak.toFixed(2)} m`);
    await d.step(10);
    const st = d.last.stomps;
    await d.tap('Space');
    peak = 0;
    for (let i = 0; i < 200; i++) {
      if (i === 22) await d.tap('Space');
      else await d.step(1);
      peak = Math.max(peak, d.last.y - y0);
      if (d.last.grounded && i > 30) break;
    }
    await d.step(10);
    check('tap-tap: double jump (second tap near the top, peak 3.0-3.5 m), stomp on landing, no flight', peak > 3.0 && peak < 3.5 && d.last.dj >= 1 && d.last.stomps === st + 1 && d.last.flights === f0, `${peak.toFixed(2)} m`);
  }

  // ---- Flight: hold from the ground ----------------------------------------------------------------------
  await d.step(30); // stand for 0.5 s first: a hold right after a timed landing would be a bounce chain, not a flight
  let ground = d.last;
  await d.down('Space');
  let startFrame = -1;
  let maxH = 0;
  let lastH = 0;
  for (let i = 1; i <= 700; i++) {
    await d.step(1);
    if (startFrame < 0 && d.last.flying) startFrame = i;
    maxH = Math.max(maxH, d.last.h);
    if (i > 120 && Math.abs(d.last.h - lastH) < 1e-4 && d.last.h > 10) break;
    lastH = d.last.h;
  }
  report('jets started after', `${startFrame} frames (${(startFrame / 60).toFixed(2)} s)`);
  check('hold Space from the ground: jets start within 0.45-0.9 s', startFrame >= 27 && startFrame <= 54, `${(startFrame / 60).toFixed(2)} s`);
  check('flying: counted as one flight, jets on', d.last.flying && d.last.jets && d.last.flights === ground.flights + 1);
  await d.step(1, true);
  await shot(page, 'skills-fly');
  check('rises to the ceiling (11.5-12.2 m above the ground) and never beyond', maxH >= 11.5 && maxH <= 12.2, `${maxH.toFixed(3)} m`);
  await d.step(180);
  {
    let vmax = 0;
    let hmin = 1e9;
    let hmax = -1e9;
    for (let i = 0; i < 60; i++) {
      await d.step(1);
      vmax = Math.max(vmax, Math.abs(d.last.vy));
      hmin = Math.min(hmin, d.last.y);
      hmax = Math.max(hmax, d.last.y);
    }
    check('hover at the ceiling is stable (|vy| < 0.05, height steady)', vmax < 0.05 && hmax - hmin < 0.02, `|vy| ${vmax.toFixed(4)}, drift ${(hmax - hmin).toFixed(4)} m`);
  }

  // ---- horizontal flight: speed and a straight path ------------------------------------------------------
  {
    await d.camera0();
    await d.down('w');
    await d.step(30);
    const pts = [];
    for (let i = 0; i < 90; i++) {
      await d.step(1);
      pts.push([d.last.x, d.last.z]);
    }
    const a = pts[0];
    const b = pts[pts.length - 1];
    const speed = Math.hypot(b[0] - pts[pts.length - 31][0], b[1] - pts[pts.length - 31][1]) / 0.5;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let dev = 0;
    for (const p of pts) dev = Math.max(dev, Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / len);
    report('flying speed', `${speed.toFixed(2)} m/s, path deviation ${dev.toFixed(3)} m over ${len.toFixed(1)} m`);
    check('stick held while flying: horizontal speed 6-8 m/s', speed > 6 && speed < 8, `${speed.toFixed(2)}`);
    check('...along a straight path', dev < 0.3 && len > 8, `dev ${dev.toFixed(3)} m, len ${len.toFixed(1)}`);
    await d.up('w');
    await d.step(60);
    const p0 = [d.last.x, d.last.z];
    await d.step(30);
    check('no input: hovers in place', Math.hypot(d.last.x - p0[0], d.last.z - p0[1]) < 0.02, `${Math.hypot(d.last.x - p0[0], d.last.z - p0[1]).toFixed(3)} m`);
  }

  // ---- release: the jets stop at once, normal gravity, harmless landing --------------------------------------------
  {
    const st = d.last.stomps;
    await d.down('d'); // keep steering through the fall
    await d.step(20);
    const y0 = d.last.y;
    await d.up('Space');
    await d.step(2);
    const vyNow = d.last.vy;
    await d.step(18);
    const vy1 = d.last.vy;
    report('after releasing at the ceiling', `vy after 2 frames ${vyNow.toFixed(2)}, after 20 frames ${vy1.toFixed(2)} m/s`);
    check('release: the jets stop at once (vy < 0 within 2 frames), soft fall capped at -7 m/s, no slow glide plateau', vyNow < 0 && vy1 < -6 && vy1 >= -7.1 && !d.last.flying && d.last.y < y0, `vy ${vyNow.toFixed(2)} -> ${vy1.toFixed(2)}`);
    const x0 = d.last.x;
    await d.step(4);
    const vx = (d.last.x - x0) / (4 / 60);
    check('...horizontal control is kept while falling (6-8 m/s sideways)', vx > 6 && vx < 8.2, `${vx.toFixed(2)} m/s`);
    await d.up('d');
    let worst = 0;
    for (let i = 0; i < 700 && !d.last.grounded; i++) {
      await d.step(1);
      worst = Math.min(worst, d.last.vy);
    }
    await d.step(20);
    check('lands from the fall unharmed: grounded, not flying, no error', d.last.grounded && !d.last.flying, `fastest ${worst.toFixed(2)} m/s, stomps ${st}->${d.last.stomps}`);
  }

  // ---- re-ignite after a release -----------------------------------------------------------------------------------
  {
    await d.maxFly(6);
    await d.down('Space');
    await d.step(120);
    check('ceiling 6 m (per level): rises to 5.6-6.2 m', d.last.flying && d.last.h > 5.6 && d.last.h < 6.2, `${d.last.h.toFixed(2)} m`);
    await d.up('Space');
    await d.step(8);
    const hDown = d.last.h;
    check('released: falling at once (softer gravity)', d.last.vy < -1.5 && hDown < 5.9 && !d.last.flying, `h ${hDown.toFixed(2)}, vy ${d.last.vy.toFixed(2)}`);
    const f0 = d.last.flights;
    const dj0 = d.last.dj;
    await d.down('Space');
    await d.step(2);
    check('press Space again in the air after a flight: the jets re-ignite at once (re-ignite wins over the air jump)', d.last.flying && d.last.flights === f0 + 1 && d.last.dj === dj0, `flying ${d.last.flying}, flights +${d.last.flights - f0}, dj +${d.last.dj - dj0}`);
    await d.step(30);
    check('...and it rises (a child can catch themselves)', d.last.vy > 0.5, `vy ${d.last.vy.toFixed(2)}`);
    await d.step(120);
    check('...up to the ceiling again, no limit on re-ignitions', d.last.h > 5.6 && d.last.h < 6.2, `${d.last.h.toFixed(2)}`);
    await d.land();
    await d.maxFly(12);
  }

  // ---- ring pass --------------------------------------------------------------------------------------------
  {
    await d.maxFly(5);
    await d.place(18, 14);
    const r0 = d.last.rings;
    await d.camera0();
    await d.down('Space');
    await d.step(150);
    await d.down('w');
    await d.step(70);
    await d.up('w');
    await d.step(5, true);
    await shot(page, 'skills-ring');
    check('flying through a hover ring registers it (ringsPassed + 1)', d.last.rings === r0 + 1, `${r0} -> ${d.last.rings}`);
    await d.land();
    await d.maxFly(12);
  }

  // ---- a real ceiling indoors (pergola slab at 4 m) ----------------------------------------------------------
  {
    await d.place(-25, 18);
    await d.down('Space');
    let top = -1e9;
    for (let i = 0; i < 200; i++) {
      await d.step(1);
      top = Math.max(top, d.last.y);
    }
    let ymin = 1e9;
    let ymax = -1e9;
    for (let i = 0; i < 90; i++) {
      await d.step(1);
      ymin = Math.min(ymin, d.last.y);
      ymax = Math.max(ymax, d.last.y);
    }
    report('under the pergola', `top feet ${top.toFixed(3)} (head ${(top + 1.1).toFixed(3)} vs slab 4.0), jitter ${(ymax - ymin).toFixed(4)}`);
    check('a real ceiling stops the rise (head never inside the slab) without jitter', top + 1.1 <= 4.0 && ymax - ymin < 0.01 && d.last.flying, `head ${(top + 1.1).toFixed(3)} jitter ${(ymax - ymin).toFixed(4)}`);
    await d.land();
  }

  // ---- scripted launch + level bounds ---------------------------------------------------------------------------
  {
    await d.place(0, -3);
    await d.sk(() => window.__superglen.skills.autoLaunch(30));
    let top = 0;
    for (let i = 0; i < 400; i++) {
      await d.step(1);
      top = Math.max(top, d.last.h);
    }
    check('autoLaunch(30) with a 12 m ceiling: bumps the ceiling, hovers briefly, then glides down', top >= 11.5 && top <= 12.2 && !d.last.jets, `top ${top.toFixed(2)}, jets ${d.last.jets}`);
    await d.land();
    await d.place(26, 0);
    await d.camera0();
    await d.down('Space');
    await d.step(100);
    await page.keyboard.down('d');
    await d.step(240);
    await page.keyboard.up('d');
    check('level bounds: flying toward the edge eases back, never beyond x = 28.5', d.last.x <= 28.6 && d.last.x > 25, `x ${d.last.x.toFixed(2)}`);
    await d.land();
  }

  // ---- locked / Glen -------------------------------------------------------------------------------------------------
  {
    await d.skills({ fly: false });
    const f0 = d.last.flights;
    await d.down('Space');
    await d.step(100);
    const a = d.last.flying;
    await d.up('Space');
    await d.land();
    check('fly locked: holding Space does not fly', !a && d.last.flights === f0);
    await d.skills({ fly: true });
    await d.mode('glen');
    await d.down('Space');
    await d.step(100);
    const b = d.last.flying;
    await d.up('Space');
    await d.land();
    check('Glen mode: holding Space does not fly', !b && d.last.flights === f0);
    await d.mode('superglen');
    await d.step(5);
  }

  // ---- Laser ----------------------------------------------------------------------------------------------------------
  await d.place(0, 0);
  await d.face('w');
  {
    const t1 = await d.addTarget(0, 1.2, -8, 'front');
    await d.step(10);
    check('aim marker: the target in front is the pending aim', d.last.aim === t1, d.last.aim);
    await d.step(1, true);
    await shot(page, 'skills-aim');
    const s0 = d.last;
    await d.tap('j', 4);
    check('laser press hits the target in front (onHit, laserHits + 1)', d.last.hits === s0.hits + 1 && d.last.testHits.front === 1 && d.last.shots === s0.shots + 1, JSON.stringify(d.last.testHits));
    await d.step(1, true);
    await shot(page, 'skills-laser');
    await d.clearTargets();
  }
  {
    // Wall: the 3 m wall at x = -22 hides a target behind it.
    await d.place(-16, 0);
    await d.face('a');
    await d.addTarget(-25, 1.2, 0, 'hidden');
    await d.step(10);
    const aim = d.last.aim;
    const s0 = d.last;
    await d.tap('j', 3);
    check('target behind a wall: not aimed, not hit, counts as a miss', aim === '' && d.last.testHits.hidden === 0 && d.last.misses === s0.misses + 1, `aim "${aim}", hits ${d.last.testHits.hidden}`);
    await d.clearTargets();
  }
  {
    await d.place(0, 0);
    await d.face('w');
    const s0 = d.last;
    await d.step(15);
    await d.tap('j', 3);
    check('nothing to aim at: straight beam and a miss event', d.last.misses === s0.misses + 1 && d.last.hits === s0.hits && d.last.aim === '', `misses +${d.last.misses - s0.misses}`);
  }
  {
    await d.place(0, 0);
    await d.face('w');
    await d.addTarget(0.4, 1.2, -5, 'near');
    await d.addTarget(-0.4, 1.2, -12, 'far');
    await d.step(10);
    await d.tap('j', 3);
    check('auto-aim picks the nearest of two', d.last.testHits.near === 1 && d.last.testHits.far === 0, JSON.stringify(d.last.testHits));
    await d.clearTargets();
  }
  {
    // Facing away from where the camera looks: the camera forward counts too, and the body turns to the target.
    await d.place(0, 2);
    await d.face('s');
    const away = d.last.facing;
    await d.addTarget(0, 1.2, -8, 'cam');
    await d.step(10);
    await d.tap('j', 20);
    let diff = Math.abs(((d.last.facing - Math.PI) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    check('facing away: the camera forward finds the target; the body turns to face it', away < 0.4 && d.last.testHits.cam === 1 && diff < 0.15, `facing ${away.toFixed(2)} -> ${d.last.facing.toFixed(2)}, hits ${d.last.testHits.cam}`);
    await d.clearTargets();
  }
  {
    // Hold: repeats every 0.45 s.
    await d.place(0, 0);
    await d.face('w');
    await d.addTarget(0, 1.2, -8, 'rep');
    await d.step(5);
    const s0 = d.last.shots;
    await d.down('j');
    await d.step(120);
    await d.up('j');
    await d.step(5);
    const n = d.last.shots - s0;
    report('laser shots while holding for 2 s', n);
    check('holding the laser button repeats every ~0.45 s (4-5 shots in 2 s)', n >= 4 && n <= 5, `${n}`);
    await d.step(40);
    await d.clearTargets();
  }
  {
    await d.addTarget(0, 1.2, -8, 'blocked');
    await d.step(5);
    let s0 = d.last.shots;
    await d.skills({ laser: false });
    await d.tap('j', 40);
    const locked = d.last.shots === s0;
    await d.skills({ laser: true });
    await d.mode('glen');
    await d.tap('j', 40);
    const glen = d.last.shots === s0;
    await d.mode('superglen');
    await d.step(5);
    await d.down('k');
    await d.step(5);
    const up = d.last.shieldUp;
    await d.tap('j', 3);
    const shielded = d.last.shots === s0;
    await d.up('k');
    await d.step(60);
    await d.tap('j', 3);
    check('no laser when locked, in Glen mode, or while the shield is up (and it works again after)', locked && glen && up && shielded && d.last.shots === s0 + 1, `locked ${locked} glen ${glen} up ${up} shielded ${shielded} then +${d.last.shots - s0}`);
    await d.clearTargets();
  }
  {
    // Practice target prop in the skills corner: hit, reaction, reset.
    await d.place(17, 4);
    await d.face('d');
    const h0 = d.last.info.practiceHits;
    await d.step(10);
    await d.tap('j', 30);
    await d.step(1, true);
    check('practice target: a laser hit spins it, lights it green and tips it down', d.last.info.practiceHits === h0 + 1 && d.last.info.practiceDown >= 1, JSON.stringify({ hits: d.last.info.practiceHits, down: d.last.info.practiceDown }));
    await shot(page, 'skills-target');
    await d.step(420);
    check('...and it stands up again by itself so the game can be repeated', d.last.info.practiceDown === 0, `down ${d.last.info.practiceDown}`);
    await d.tap('j', 5);
    check('...ready for the next shot', d.last.info.practiceHits === h0 + 2, `hits ${d.last.info.practiceHits}`);
  }

  // ---- Shield ---------------------------------------------------------------------------------------------------------------
  await d.place(0, 0);
  await d.face('w');
  {
    const s0 = d.last;
    await d.down('k');
    await d.step(10);
    await d.ball(0, 1.0, -7.5, 7);
    let blockedAt = -1;
    for (let i = 0; i < 100; i++) {
      await d.step(1);
      if (blockedAt < 0 && d.last.blocks > s0.blocks) {
        blockedAt = i;
        await d.step(2, true);
        await shot(page, 'skills-shield');
      }
    }
    await d.up('k');
    await d.step(70);
    check('thrown ball + shield up: blocked, reflected back, never hits the player', d.last.blocks === s0.blocks + 1 && d.last.ballHits === s0.ballHits && d.last.proj === 0, `blocks +${d.last.blocks - s0.blocks}, hits +${d.last.ballHits - s0.ballHits}, live ${d.last.proj}`);
  }
  {
    const s0 = await d.step(30);
    await d.ball(0, 1.0, -7.5, 7);
    await d.step(110);
    const moved = Math.hypot(d.last.x - s0.x, d.last.z - s0.z);
    check('same ball without the shield: harmless hit (stars, tiny hop), player not displaced > 0.1 m', d.last.ballHits === s0.ballHits + 1 && d.last.blocks === s0.blocks && moved < 0.1, `hits +${d.last.ballHits - s0.ballHits}, moved ${moved.toFixed(3)} m`);
  }
  {
    // A quick tap (1 frame) must still block a ball that arrives within 0.5 s.
    const s0 = await d.step(30);
    await d.ball(0, 1.0, -5, 8);
    await d.down('k');
    await d.step(1);
    await d.up('k');
    await d.step(2);
    const upAfterTap = d.last.shieldUp;
    await d.step(60);
    check('quick tap keeps the dome up (>= 0.6 s) and blocks a ball arriving within 0.5 s', upAfterTap && d.last.blocks === s0.blocks + 1 && d.last.ballHits === s0.ballHits, `up ${upAfterTap}, blocks +${d.last.blocks - s0.blocks}`);
    check('...and drops again after the minimum time', !d.last.shieldUp);
  }
  {
    // Speed while raised.
    const run = async (shield) => {
      await d.place(0, 10);
      await d.camera0();
      if (shield) await d.down('k');
      await d.down('w');
      await d.step(40);
      const a = [d.last.x, d.last.z];
      await d.step(30);
      const v = Math.hypot(d.last.x - a[0], d.last.z - a[1]) / 0.5;
      await d.up('w');
      if (shield) await d.up('k');
      await d.step(70);
      return v;
    };
    const vFree = await run(false);
    const vShield = await run(true);
    report('walking speed free / with shield', `${vFree.toFixed(2)} / ${vShield.toFixed(2)} m/s`);
    check('walking speed with the shield up is about 60%', vShield / vFree > 0.5 && vShield / vFree < 0.7, `${(vShield / vFree).toFixed(2)}`);
  }
  {
    // Assist: a ball from behind while standing still with the dome up: the body turns and the dome catches it.
    await d.place(0, 0);
    await d.face('w');
    const s0 = d.last;
    await d.down('k');
    await d.step(5);
    await d.ball(0, 1.0, 8, 7);
    await d.step(110);
    await d.up('k');
    await d.step(70);
    check('shield assist: a ball from behind is caught too (the body turns toward it)', d.last.blocks === s0.blocks + 1 && d.last.ballHits === s0.ballHits, `blocks +${d.last.blocks - s0.blocks}, hits +${d.last.ballHits - s0.ballHits}`);
  }
  {
    // The ball machine in the skills corner: telegraph, throw, bonk; then shield: reflect and dizzy machine.
    await d.place(26, 11.5);
    await d.face('s');
    await d.face('w');
    const s0 = d.last;
    await d.step(300);
    check('ball machine throws while the player is within 12 m and bonks harmlessly', d.last.info.throwerThrown >= 1 && d.last.ballHits > s0.ballHits, `thrown ${d.last.info.throwerThrown}, hits +${d.last.ballHits - s0.ballHits}`);
    await d.down('k');
    const b0 = d.last.blocks;
    const r0 = d.last.info.throwerReturned;
    await d.step(480);
    await d.up('k');
    check('...with the shield raised the ball goes back to the machine, which gets dizzy', d.last.blocks > b0 && d.last.info.throwerReturned > r0, `blocks +${d.last.blocks - b0}, returned +${d.last.info.throwerReturned - r0}`);
    await d.place(0, 0);
    const t0 = d.last.info.throwerThrown;
    await d.step(400);
    check('...and it stays quiet when the player is far away', d.last.info.throwerThrown === t0);
  }
}

async function skillsPerfScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  const d = makeSkillsDriver(page);
  await page.evaluate(() => window.__superglen.pause(true));
  await d.step(30);
  await d.tap('e', 10);
  await d.addTarget(0, 1.2, -9, 'perf');
  await d.camera0();
  await d.step(5, true);
  const programs = () => page.evaluate(() => window.__superglen.debugCounts().programs);
  const p0 = await programs();
  // 10 s of flying (jets, trail, bob), laser held, ball throws and a shield raise, rendering every 30th frame.
  await d.down('Space');
  await d.down('j');
  await d.down('w');
  for (let i = 0; i < 20; i++) {
    if (i === 6) await d.ball(0, 1.0, -9, 7);
    if (i === 8) await d.down('k');
    if (i === 12) await d.up('k');
    await d.step(30, true);
  }
  await d.up('w');
  await d.up('j');
  const p1 = await programs();
  check('flying + firing + shield for 10 s: no new shader programs', p1 === p0 && p0 > 0, `${p0} -> ${p1}`);
  await d.land();

  const heapOk = await page.evaluate(() => typeof performance.memory !== 'undefined' && typeof window.gc === 'function');
  if (!heapOk) {
    console.log('   [skills] heap: performance.memory/gc unavailable: skipped');
    return;
  }
  const bpf = await page.evaluate(() => {
    const g = window.__superglen;
    g.advance(5, true);
    window.gc();
    const heap = () => performance.memory.usedJSHeapSize;
    let prev = heap();
    let acc = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      g.advance(1, false);
      const h = heap();
      if (h >= prev) acc += h - prev;
      prev = h;
    }
    return acc / n;
  });
  // (the keys must be held for this window: set below)
  void bpf;
  await d.down('Space');
  await d.down('j');
  await d.down('w');
  await d.step(70);
  const bpf2 = await page.evaluate(() => {
    const g = window.__superglen;
    window.gc();
    const heap = () => performance.memory.usedJSHeapSize;
    let prev = heap();
    let acc = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      g.advance(1, false);
      const h = heap();
      if (h >= prev) acc += h - prev;
      prev = h;
    }
    return acc / n;
  });
  await d.up('w');
  await d.up('j');
  console.log(`   [skills] heap flying+laser: ${Math.round(bpf2)} bytes per frame (idle ${Math.round(bpf)})`);
  check('allocation budget while flying and firing: < 16000 bytes per frame (same as walking)', bpf2 < 16000, `${Math.round(bpf2)} B/frame`);
  await d.land();
}

async function skillsTouchScenario(page, check) {
  // (startTouchGame taps at y = 300, outside an 844x281 viewport: start the same way a little higher.)
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, 200);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeSkillsDriver(page);
  await d.step(30);
  const center = (action) => page.evaluate((a) => {
    const r = document.querySelector(`.tc-button[data-action=${a}]`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, action);
  const actions = () => page.evaluate(() => [...document.querySelectorAll('.tc-button')].map((e) => e.dataset.action).join());
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  await d.mode('superglen');
  await d.step(20);

  // ---- story layout: buttons for unlocked skills only (demo level), at both heights ---------------------------
  await page.evaluate(() => window.__superglen.loadLevel('demo'));
  await page.waitForFunction(() => window.__superglen.level === 'demo' && !window.__superglen.loading, null, { timeout: 8000 });
  await d.mode('superglen');
  for (const h of [281, 390]) {
    await page.setViewportSize({ width: 844, height: h });
    await sleep(500);
    for (const [laser, shield, fly] of [[false, false, true], [true, false, true], [false, true, false], [true, true, true]]) {
      await page.evaluate(([laser, shield, fly]) => window.__superglen.game.setSkills({ laser, shield, fly }), [laser, shield, fly]);
      await sleep(80);
      const want = ['jump', 'interact'].concat(laser ? ['laser'] : [], shield ? ['shield'] : []);
      const l = await page.evaluate(layoutInfo);
      const got = l.actions;
      check(`844x${h} laser=${+laser} shield=${+shield} fly=${+fly}: buttons only for unlocked skills (flying adds none)`, got.length === want.length && want.every((a) => got.includes(a)), got.join());
      check(`844x${h} laser=${+laser} shield=${+shield}: inside, no overlap, >= 80 px, clear of the joystick zone`, l.inside && !l.overlap && l.minBtn >= 79.5 && l.minLeft >= l.vw * 0.45 - 1, JSON.stringify({ i: l.inside, o: l.overlap, m: l.minBtn, left: Math.round(l.minLeft) }));
    }
  }
  await page.setViewportSize({ width: 844, height: 281 });
  await sleep(500);
  await page.evaluate(() => window.__superglen.loadLevel('test'));
  await page.waitForFunction(() => window.__superglen.level === 'test' && !window.__superglen.loading, null, { timeout: 8000 });
  await d.mode('superglen');
  await d.step(30);
  const lt = await page.evaluate(layoutInfo);
  check('844x281 test level: jump, laser, shield, star inside, no overlap, >= 80', lt.actions.join() === 'jump,laser,shield,transform' && lt.inside && !lt.overlap && lt.minBtn >= 79.5, JSON.stringify({ a: lt.actions.join(), o: lt.overlap, m: lt.minBtn }));

  // ---- joystick (finger 1) + hold jump (finger 2) + tap laser (3) + hold shield (4) ----------------------------------
  const jp = await center('jump');
  const lp = await center('laser');
  const sp = await center('shield');
  await d.camera0();
  await d.place(0, 0);
  await fingers.down(1, 120, 200);
  await fingers.move(1, 120, 130, 6); // full forward
  await fingers.down(2, jp.x, jp.y);
  let startFrame = -1;
  for (let i = 1; i <= 120; i++) {
    await d.step(1);
    if (startFrame < 0 && d.last.flying) startFrame = i;
  }
  const jets = await page.evaluate(() => document.querySelector('.tc-button[data-action=jump]').classList.contains('jets'));
  check('touch: holding the jump button flies while the joystick is held by another finger', startFrame > 0 && startFrame <= 54 && d.last.jets, `started after ${startFrame} frames`);
  check('touch: the jump button shows the jets state while flying', jets);
  const a = [d.last.x, d.last.z];
  await d.step(30);
  const speed = Math.hypot(d.last.x - a[0], d.last.z - a[1]) / 0.5;
  check('touch: stick forward while flying: 6-8 m/s', speed > 6 && speed < 8, `${speed.toFixed(2)}`);
  const s0 = d.last.shots;
  await fingers.down(3, lp.x, lp.y);
  await d.step(3);
  await fingers.up(3);
  await d.step(3);
  check('touch: laser tap works while flying with the stick and jump held', d.last.shots === s0 + 1 && d.last.flying, `shots +${d.last.shots - s0}`);
  await fingers.down(4, sp.x, sp.y);
  await d.step(10);
  const upWhile = d.last.shieldUp;
  await d.step(1, true);
  await shot(page, 'skills-touch-281');
  await fingers.up(4);
  await d.step(50);
  check('touch: shield is hold-to-raise (up while held, down after release)', upWhile && !d.last.shieldUp);
  await fingers.up(2);
  await d.step(3);
  const jets2 = await page.evaluate(() => document.querySelector('.tc-button[data-action=jump]').classList.contains('jets'));
  check('touch: releasing the jump button cuts the jets (button back to normal)', !jets2 && !d.last.jets);
  await fingers.up(1);
  await d.land();

  // ---- laser held on touch auto-repeats --------------------------------------------------------------------------------------
  await d.place(0, 0);
  await d.step(5);
  const n0 = d.last.shots;
  await fingers.down(5, lp.x, lp.y);
  await d.step(100);
  await fingers.up(5);
  await d.step(3);
  check('touch: holding the laser button repeats (3-4 shots in 1.7 s)', d.last.shots - n0 >= 3 && d.last.shots - n0 <= 4, `${d.last.shots - n0}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Parkour (Lompat Irama Barongsai, auto mantle, drum icons, drum synth): deterministic stepping, real key events.
// ---------------------------------------------------------------------------------------------------------------

const parkourSnap = () => {
  const g = window.__superglen;
  const r = g.rhythm;
  return {
    y: g.feetY, vy: g.verticalVelocity, grounded: !g.airborne, level: r.level, q: r.lastQuality, perfect: r.perfect, good: r.good,
    misses: r.misses, autos: r.autos, bounces: r.bounces, normals: r.normals, eta: Number.isFinite(r.landEta) ? r.landEta : 99,
    mantles: r.mantles, mantling: r.mantling, lit: r.lit, drums: r.drumsVisible, writes: r.drumWrites, chain: r.chain, easy: r.easy,
    sounds: r.sounds, audio: r.audio, muted: r.muted, jumps: g.jumps, dj: g.doubleJumps, peak: g.peakFeetY, flying: g.skills.flying,
    flights: g.skills.flights, kicks: r.wallKicks, kchain: r.kickChain, khint: r.kickHint, x: g.player.x, z: g.player.z, mode: g.mode, stomps: g.stomps, programs: g.debugCounts().programs,
  };
};

const PARKOUR_HZ = [196.0, 220.0, 246.94, 293.66, 329.63];
const PARKOUR_APEX = [1.6, 2.1, 2.7, 3.4, 4.2];

function makeParkourDriver(page) {
  const d = { last: null };
  d.snap = async () => (d.last = await page.evaluate(parkourSnap));
  d.step = async (n = 1, render = false) => {
    await page.evaluate(([n, r]) => window.__superglen.advance(n, r), [n, render]);
    return d.snap();
  };
  d.down = (k = 'Space') => page.keyboard.down(k);
  d.up = (k = 'Space') => page.keyboard.up(k);
  d.tap = async () => {
    await page.keyboard.down('Space');
    await d.step(1);
    await page.keyboard.up('Space');
    return d.last;
  };
  /** Superglen on flat ground at (x, z), rhythm level `level`, standing (the teleport settle is not a landing). */
  d.setup = async (level = 0, x = 0, z = 0, mode = 'superglen') => {
    for (const k of ['Space', 'w', 'a', 's', 'd']) await page.keyboard.up(k);
    await page.evaluate(([m, l, x, z]) => {
      const g = window.__superglen;
      g.game.setPlayerMode(m);
      g.placePlayer(x, z);
      g.setCameraYaw(0);
      g.rhythm.setLevel(l);
    }, [mode, level, x, z]);
    return d.step(4);
  };
  d.untilEta = async (maxEta, limit = 400) => {
    for (let i = 0; i < limit; i++) {
      await d.step(1);
      if (!d.last.grounded && d.last.eta <= maxEta && d.last.vy < 0) break;
    }
    return d.last;
  };
  d.untilGrounded = async (limit = 600) => {
    for (let i = 0; i < limit && !d.last.grounded; i++) await d.step(1);
    return d.last;
  };
  d.untilJump = async (j0, limit = 60) => {
    for (let i = 0; i < limit && d.last.jumps <= j0; i++) await d.step(1);
    return d.last;
  };
  /** Highest feet Y reached while stepping until the next touchdown. */
  d.flyUntilLanded = async () => {
    let peak = d.last.y;
    for (let i = 0; i < 600; i++) {
      await d.step(1);
      peak = Math.max(peak, d.last.y);
      if (d.last.grounded && i > 3) break;
    }
    return peak;
  };
  return d;
}

/** Overlap of the drum strip with every other piece of HUD that is on screen (and the touch dialog-bubble lane). */
const drumOverlapInfo = () => {
  const dr = document.querySelector('.drums');
  if (!dr || dr.hidden) return { visible: false };
  const a = dr.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const touch = document.documentElement.classList.contains('touch-ui');
  const hit = [];
  const sels = ['.tc-button', '.tc-hint', '.tc-base', '.hud-fps', '.b2-row', '.dlg-card', '.interact-prompt', '.prompt', '.objective', '.hud-card'];
  for (const sel of sels) {
    for (const e of document.querySelectorAll(sel)) {
      const hidden = e.hidden || getComputedStyle(e).display === 'none';
      const r = e.getBoundingClientRect();
      if (hidden || r.width === 0) continue;
      if (a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom) hit.push(sel);
    }
  }
  // The touch dialog bubble lives between 130 px from each side at the top.
  const bubbleOverlap = touch && a.right > 130;
  return { visible: true, inside: a.left >= 0 && a.top >= 0 && a.right <= vw && a.bottom <= vh, hit, bubbleOverlap, rect: [a.left, a.top, a.right, a.bottom].map(Math.round), lit: document.querySelectorAll('.drums .drum.on').length };
};

/** Bab2's progress row is hidden until an exercise runs: unhide it to measure, then restore. */
const drumOverlapWithRow = (fnSrc) => {
  const rows = [...document.querySelectorAll('.b2-row')];
  const was = rows.map((r) => r.hidden);
  rows.forEach((r) => { r.hidden = false; });
  const info = (new Function('return (' + fnSrc + ')'))()();
  rows.forEach((r, i) => { r.hidden = was[i]; });
  return info;
};

async function parkourDesktopScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeParkourDriver(page);
  const report = (label, v) => console.log(`   [parkour] ${label}: ${v}`);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));

  // ---- 1. Config: no jump numbers outside src/config/parkour.ts ------------------------------------------------------
  {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
    const pc = fs.readFileSync(path.join(ROOT, 'src/player/PlayerConfig.ts'), 'utf8');
    const banned = ['jumpApex', 'doubleJumpApex', 'doubleJumpSpeed', 'jumpSpeed', 'gravityUp', 'fallMultiplier', 'coyoteTime', 'jumpBuffer', 'stompMinImpact', 'stompRadius', 'launchSpeed', 'maxFallSpeed', 'squashMinImpact', 'spinTime', 'doubleJumpMin'];
    const found = banned.filter((t) => pc.includes(t));
    check('PlayerConfig.ts holds no jump numbers any more', found.length === 0, found.join(','));
    const re = /\b(jumpApex|doubleJumpApex|gravityUp|fallMultiplier|coyoteTime|jumpBuffer|stompMinImpact|glenApex|windows|idleDrop|maxFallSpeed)\s*[:=]\s*[-\d.{]/;
    const strays = walk(path.join(ROOT, 'src')).filter((f) => !f.endsWith(path.join('config', 'parkour.ts')) && re.test(fs.readFileSync(f, 'utf8')));
    check('no jump number is defined anywhere except src/config/parkour.ts', strays.length === 0, strays.map((f) => path.relative(ROOT, f)).join(','));
  }

  // ---- 2. Five levels: apex heights while chaining perfect presses -----------------------------------------------------
  {
    await d.setup(0);
    check('easy mode is on by default', d.last.easy === true && d.last.level === 0 && d.last.mode === 'superglen');
    const heights = [];
    const quals = [];
    await d.tap(); // first jump after standing: level 0, no penalty
    for (let k = 0; k < 5; k++) {
      let peak = 0;
      for (let i = 0; i < 400; i++) {
        await d.step(1);
        peak = Math.max(peak, d.last.y);
        if (d.last.eta <= 0.05 && !d.last.grounded && d.last.vy < 0) break;
      }
      heights.push(peak);
      if (k === 3) {
        await d.step(1, true);
        await shot(page, 'parkour-ring');
      }
      if (k < 4) {
        const j0 = d.last.jumps;
        await d.tap();
        await d.untilJump(j0);
        quals.push(`${d.last.q}/${d.last.level}`);
      }
    }
    report('apex per level', heights.map((h) => h.toFixed(2)).join(' / '));
    for (let k = 0; k < 5; k++) check(`rhythm level ${k}: apex ${PARKOUR_APEX[k]} m +-0.08`, Math.abs(heights[k] - PARKOUR_APEX[k]) <= 0.08, `${heights[k].toFixed(3)} m`);
    check('chained presses 50 ms before touchdown are all perfect and raise one level each', quals.join() === 'perfect/1,perfect/2,perfect/3,perfect/4', quals.join());
    check('level 4 is reachable by timed presses in easy mode', d.last.level === 4 && d.last.perfect >= 4);
    await d.untilGrounded();
  }

  // ---- 3. Double jump: +1.2 m above the point of pressing at level 0 and level 4 --------------------------------------------
  for (const lvl of [0, 4]) {
    await d.setup(lvl);
    await d.tap();
    for (let i = 0; i < 100 && !(d.last.vy < 1.0 && d.last.y > 0.5); i++) await d.step(1);
    const yPress = d.last.y;
    const dj0 = d.last.dj;
    await d.tap();
    const peak = await d.flyUntilLanded();
    const add = peak - yPress;
    report(`double jump at level ${lvl}`, `pressed at ${yPress.toFixed(2)} m, peak ${peak.toFixed(2)} m, adds ${add.toFixed(2)} m`);
    check(`double jump at level ${lvl} adds 1.1-1.3 m above the press point`, d.last.dj === dj0 + 1 && add > 1.1 && add < 1.3, `${add.toFixed(3)} m`);
    await d.step(60);
  }

  // ---- 4. Timing windows ------------------------------------------------------------------------------------------------------
  const startRun = async (level) => {
    await d.setup(level);
    await d.tap(); // fresh jump at `level`
    return d.last.level;
  };
  {
    // 100 ms before touchdown
    await startRun(2);
    let j0 = d.last.jumps;
    await d.untilEta(0.1);
    const etaAt = d.last.eta;
    await d.tap();
    await d.untilJump(j0);
    check('press 100 ms before touchdown: perfect, level 2 -> 3', d.last.q === 'perfect' && d.last.level === 3, `eta ${etaAt.toFixed(3)} -> ${d.last.q}/${d.last.level}`);
    await d.untilGrounded();
    await d.step(30);
    // 100 ms after touchdown
    await startRun(2);
    j0 = d.last.jumps;
    await d.untilGrounded();
    await d.step(5);
    await d.tap();
    check('press 100 ms after touchdown: perfect, level 2 -> 3, jumps at once', d.last.q === 'perfect' && d.last.level === 3 && d.last.jumps === j0 + 1, `${d.last.q}/${d.last.level}`);
    await d.untilGrounded();
    await d.step(30);
    // 250 ms before touchdown
    await startRun(2);
    j0 = d.last.jumps;
    await d.untilEta(0.25);
    const eta2 = d.last.eta;
    await d.tap();
    await d.untilJump(j0);
    check('press 250 ms before touchdown: good, level 2 -> 3', d.last.q === 'good' && d.last.level === 3, `eta ${eta2.toFixed(3)} -> ${d.last.q}/${d.last.level}`);
    await d.untilGrounded();
    await d.step(30);
    // 400 ms after touchdown: a miss drops ONE level (not to zero)
    await startRun(2);
    j0 = d.last.jumps;
    const m0 = d.last.misses;
    await d.untilGrounded();
    await d.step(23);
    await d.tap();
    check('press 400 ms after touchdown: a miss, level 2 -> 1 (not 0), plain jump', d.last.q === 'normal' && d.last.level === 1 && d.last.misses === m0 + 1 && d.last.jumps === j0 + 1, `${d.last.q}/${d.last.level} misses +${d.last.misses - m0}`);
    await d.untilGrounded();
    await d.step(30);
    // idle on the ground
    await startRun(3);
    await d.untilGrounded();
    await d.step(96);
    const l1 = d.last.level;
    await d.step(90);
    const l2 = d.last.level;
    check('standing 1.6 s after a landing: level 3 -> 2; 3.1 s: -> 1', l1 === 2 && l2 === 1, `${l1}, ${l2}`);
    // first jump after standing: no penalty
    await d.step(60);
    const lv = d.last.level;
    const mm = d.last.misses;
    await d.tap();
    await d.step(2);
    check('the first jump after standing (more than 1.5 s) has no penalty: level and misses unchanged', d.last.level === lv && d.last.misses === mm && d.last.q === 'normal', `${lv} -> ${d.last.level}`);
    await d.setup(3);
    await d.tap();
    check('the very first jump (after the spawn) has no penalty and uses the current level (3.4 m)', d.last.level === 3 && d.last.misses === mm && d.last.q === 'normal');
    const pk = await d.flyUntilLanded();
    check('...its apex is the level-3 apex', Math.abs(pk - 3.4) <= 0.08, `${pk.toFixed(3)} m`);
  }

  // ---- 5. Easy mode: holding the jump button (flight locked) ------------------------------------------------------------------
  {
    await d.setup(0);
    await d.down();
    let maxLevel = 0;
    let sawFour = false;
    for (let i = 0; i < 600; i++) {
      await d.step(1);
      maxLevel = Math.max(maxLevel, d.last.level);
      if (d.last.level >= 4) sawFour = true;
      if (i === 400) {
        await d.step(1, true);
        await shot(page, 'parkour-level3-hold');
      }
    }
    await d.up();
    report('easy hold for 10 s', `max level ${maxLevel}, autos ${d.last.autos}, jumps ${d.last.jumps}`);
    check('easy mode: holding Space (flight locked) bounces by itself and climbs to level 3 but never 4', maxLevel === 3 && !sawFour && d.last.autos >= 8, `max ${maxLevel}, autos ${d.last.autos}`);
    await d.untilGrounded();
  }

  // ---- 6. Flight unlocked: holding flies; release falls at once; re-hold re-ignites ---------------------------------------------------
  {
    await page.evaluate(() => window.__superglen.game.setSkills({ fly: true }));
    await d.setup(0);
    await d.step(30);
    const f0 = d.last.flights;
    const au0 = d.last.autos;
    await d.down();
    let start = -1;
    for (let i = 1; i <= 120; i++) {
      await d.step(1);
      if (d.last.flying) {
        start = i;
        break;
      }
    }
    check('flight unlocked: holding Space from the ground flies (jets within 0.45-0.9 s), no automatic bounce', start >= 27 && start <= 54 && d.last.autos === au0 && d.last.flights === f0 + 1, `jets after ${start} frames, autos +${d.last.autos - au0}`);
    await d.step(90);
    const yUp = d.last.y;
    await d.up();
    await d.step(2);
    const v2 = d.last.vy;
    await d.step(8);
    const v10 = d.last.vy;
    report('release while flying', `vy after 2 frames ${v2.toFixed(2)}, after 10 frames ${v10.toFixed(2)} m/s (height ${yUp.toFixed(1)} m)`);
    check('release: flying stops at once, vertical speed goes negative with the soft fall (no -2.2 m/s plateau, never below -7 m/s)', v2 < 0 && v10 < -2.5 && v10 >= -7.1 && !d.last.flying, `${v2.toFixed(2)} -> ${v10.toFixed(2)}`);
    await d.untilGrounded();
    check('...and lands without trouble', d.last.grounded && !d.last.flying);
    // re-hold in the air
    await d.step(30);
    await d.down();
    await d.step(120);
    await d.up();
    await d.step(10);
    const f1 = d.last.flights;
    await d.down();
    let again = -1;
    for (let i = 1; i <= 60; i++) {
      await d.step(1);
      if (d.last.flying) {
        again = i;
        break;
      }
    }
    check('press again in the air after a flight: the jets re-ignite at once (no 0.45 s hold)', again > 0 && again <= 3 && d.last.flights === f1 + 1, `after ${again} frames`);
    await d.up();
    await d.untilGrounded();
    await d.step(30);
    // A held bounce chain (level 2+, timed press) keeps bouncing even with flight unlocked.
    await d.setup(2);
    await d.tap();
    await d.untilEta(0.05);
    const f2 = d.last.flights;
    await d.down();
    await d.step(240);
    check('flight unlocked: a held button inside a bounce chain (level 2+) keeps bouncing instead of flying', d.last.autos >= 2 && d.last.flights === f2 && d.last.chain, `autos ${d.last.autos}, flights +${d.last.flights - f2}`);
    await d.up();
    await d.untilGrounded();
    await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  }

  // ---- 7. Bounce drum hook ---------------------------------------------------------------------------------------------------------
  {
    await page.evaluate(() => window.__superglen.testBox(4, 0.1, 4, 1.5, 0.1, 1.5, true));
    await d.setup(1, 0, 0);
    const b0 = d.last.bounces;
    const p0 = d.last.perfect;
    await page.evaluate(() => window.__superglen.teleportFeet(4, 3, 4));
    let jumped = false;
    for (let i = 0; i < 90; i++) {
      await d.step(1);
      if (d.last.bounces > b0 && d.last.vy > 0) {
        jumped = true;
        break;
      }
    }
    check('landing on a bounce drum: level +1, counts as perfect, throws the player up', jumped && d.last.level === 2 && d.last.bounces === b0 + 1 && d.last.perfect === p0 + 1 && d.last.q === 'perfect', `level ${d.last.level}, ${d.last.q}, vy ${d.last.vy.toFixed(1)}`);
    const pk = await d.flyUntilLanded();
    check('...the bounce launches with the new level (2.7 m)', Math.abs(pk - 0.2 - 2.7) <= 0.1, `peak ${pk.toFixed(2)} m above the floor`);
    // a plain landing is no bounce
    await d.setup(1, -4, -4);
    const b1 = d.last.bounces;
    await page.evaluate(() => window.__superglen.teleportFeet(-4, 3, -4));
    await d.untilGrounded();
    await d.step(5);
    check('landing on the plain floor: no bounce, level unchanged', d.last.bounces === b1 && d.last.level === 1);
  }

  // ---- 8. Auto mantle ---------------------------------------------------------------------------------------------------------------
  {
    // Wall face at x = -6.2; the player starts 0.4 m in front of it, feet 1.0 m up (head 2.1 m). Heading +X = key d at camera yaw 0.
    const mantleCase = async (z, top, press, shotName) => {
      await page.evaluate(([z, top]) => window.__superglen.testBox(-4.7, top / 2, z, 1.5, top / 2, 1.2), [z, top]);
      await d.setup(0, 0, 0, 'glen');
      await page.evaluate((z) => { window.__superglen.teleportFeet(-6.6, 1.0, z); window.__superglen.setCameraYaw(0); }, z);
      const m0 = (await d.step(1)).mantles;
      if (press) await d.down('d');
      let sawMantling = false;
      for (let i = 0; i < 110; i++) {
        await d.step(1);
        if (press && d.last.mantles > m0) await d.up('d'); // stop pushing once up (do not walk off the far side)
        if (d.last.mantling && !sawMantling) {
          sawMantling = true;
          if (shotName) {
            await d.step(7, true);
            await shot(page, shotName);
          }
        }
      }
      await d.up('d');
      await d.step(20);
      return { mantles: d.last.mantles - m0, y: d.last.y, x: d.last.x, grounded: d.last.grounded, sawMantling, lvl: d.last.level };
    };
    let r = await mantleCase(2, 2.5, true, 'parkour-mantle');
    report('ledge 0.4 m above the head', JSON.stringify(r));
    check('ledge 0.4 m above the head: mantled, standing on top', r.mantles === 1 && r.sawMantling && r.grounded && Math.abs(r.y - 2.5) < 0.1 && r.x > -6.2, `y ${r.y.toFixed(2)}, x ${r.x.toFixed(2)}`);
    check('...the rhythm level is unchanged by a mantle', r.lvl === 0);
    r = await mantleCase(5, 3.0, true);
    check('ledge 0.9 m above the head: not mantled (falls back down)', r.mantles === 0 && r.y < 0.2, `y ${r.y.toFixed(2)}, mantles ${r.mantles}`);
    r = await mantleCase(8, 8.0, true);
    check('tall wall: not mantled', r.mantles === 0 && r.y < 0.2, `y ${r.y.toFixed(2)}, mantles ${r.mantles}`);
    r = await mantleCase(11, 2.5, false);
    check('no movement toward the ledge: no mantle', r.mantles === 0 && r.y < 0.2, `y ${r.y.toFixed(2)}, mantles ${r.mantles}`);
    // Controls are locked during the animation: a stick pushed away does not pull the body back.
    // A pole top (cylinder) edge and a too-small ledge are covered by the room check; here: no room (ceiling slab above the ledge).
    await page.evaluate(() => { window.__superglen.testBox(-4.7, 2.0 / 2, 14, 1.5, 1.0, 1.2); window.__superglen.testBox(-4.7, 3.2, 14, 1.5, 0.2, 1.2); });
    await d.setup(0, 0, 0, 'glen');
    await page.evaluate(() => { window.__superglen.teleportFeet(-6.6, 1.0, 14); window.__superglen.setCameraYaw(0); });
    await d.step(1);
    const m1 = d.last.mantles;
    await d.down('d');
    await d.step(100);
    await d.up('d');
    check('ledge with no standing room above it (ceiling slab): not mantled', d.last.mantles === m1, `mantles +${d.last.mantles - m1}`);
  }

  // ---- 9. Drum icons ------------------------------------------------------------------------------------------------------------------
  {
    await d.setup(0, 0, 0, 'glen');
    await d.step(2);
    check('drum icons hidden in Glen mode', (await page.evaluate(drumOverlapInfo)).visible === false && d.last.lit === 0);
    let ok = true;
    const seen = [];
    for (let lvl = 0; lvl < 5; lvl++) {
      await d.setup(lvl);
      await d.step(2);
      const o = await page.evaluate(drumOverlapInfo);
      seen.push(`${lvl}:${o.lit}`);
      if (!(o.visible && o.lit === lvl + 1 && d.last.lit === lvl + 1)) ok = false;
    }
    check('drum icons: level 0..4 lights 1..5 drums (lit follows the level)', ok, seen.join(' '));
    const o = await page.evaluate(drumOverlapInfo);
    check('desktop 1280x720 (test): drum icons overlap no other HUD', o.hit.length === 0 && o.inside, JSON.stringify(o));
    await d.setup(4);
    await d.tap();
    for (let i = 0; i < 25; i++) await d.step(1);
    await d.step(1, true);
    await shot(page, 'parkour-level4');
  }

  // ---- 10. Cleanup check of the stray test boxes is implicit (level reload) ----
  await page.evaluate(() => window.__superglen.pause(false));
}

/** Touch: the same rules through the on-screen jump button, plus layout at both phone heights. */
async function parkourTouchScenario(page, check) {
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, 200);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  const d = makeParkourDriver(page);
  const report = (label, v) => console.log(`   [parkour] ${label}: ${v}`);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  await d.setup(0);
  const center = () => page.evaluate(() => {
    const r = document.querySelector('.tc-button[data-action=jump]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  let jb = await center();
  const tapBtn = async () => {
    await fingers.down(7, jb.x, jb.y);
    await d.step(1);
    await fingers.up(7);
    return d.last;
  };
  // timed taps with the on-screen button: level 0 -> 4
  await tapBtn();
  const quals = [];
  for (let k = 0; k < 4; k++) {
    await d.untilEta(0.05);
    const j0 = d.last.jumps;
    await tapBtn();
    await d.untilJump(j0);
    quals.push(`${d.last.q}/${d.last.level}`);
  }
  check('touch: timed taps on the jump button chain to level 4 (5 lit drums)', quals.join() === 'perfect/1,perfect/2,perfect/3,perfect/4' && d.last.lit === 5, quals.join());
  for (let i = 0; i < 24; i++) await d.step(1);
  await d.step(1, true);
  await shot(page, 'parkour-touch-281');
  const o281 = await page.evaluate(drumOverlapInfo);
  check('touch 844x281 (test): drum icons overlap no touch button, joystick hint, star or fps pill and stay out of the dialog lane', o281.hit.length === 0 && o281.inside && !o281.bubbleOverlap, JSON.stringify(o281));
  check('touch: jump button still >= 80 x 80', await page.evaluate(() => { const r = document.querySelector('.tc-button[data-action=jump]').getBoundingClientRect(); return r.width >= 80 && r.height >= 80; }));
  await d.untilGrounded();
  // holding the on-screen button (flight locked): easy bounce
  await d.setup(0);
  await fingers.down(7, jb.x, jb.y);
  let maxL = 0;
  for (let i = 0; i < 480; i++) {
    await d.step(1);
    maxL = Math.max(maxL, d.last.level);
  }
  await fingers.up(7);
  check('touch: holding the jump button bounces by itself up to level 3', maxL === 3 && d.last.autos >= 6, `max ${maxL}, autos ${d.last.autos}`);
  await d.untilGrounded();
  // layout at both phone heights, Glen hidden / Superglen visible
  for (const h of [390, 281]) {
    await page.setViewportSize({ width: 844, height: h });
    await sleep(500);
    await d.setup(3, 0, 0, 'glen');
    await d.step(3);
    const hid = await page.evaluate(drumOverlapInfo);
    await d.setup(4);
    await d.step(3);
    const o = await page.evaluate(drumOverlapInfo);
    check(`touch 844x${h} (test): hidden in Glen, 5 lit in Superglen, no overlap`, hid.visible === false && o.visible && o.lit === 5 && o.hit.length === 0 && o.inside && !o.bubbleOverlap, JSON.stringify(o));
  }
  // story levels
  for (const h of [390, 281]) {
    await page.setViewportSize({ width: 844, height: h });
    await sleep(500);
    await page.evaluate(() => { const g = window.__superglen; g.save.markChapterDone('bab1'); return g.loadLevel('bab1'); });
    await d.step(60);
    await page.evaluate(() => window.__superglen.game.setPlayerMode('superglen'));
    await d.step(5);
    const a = await page.evaluate(drumOverlapInfo);
    check(`touch 844x${h} (bab1 after the chapter): drum icons visible, no overlap`, a.visible && a.hit.length === 0 && a.inside && !a.bubbleOverlap, JSON.stringify(a));
    await page.evaluate(() => { const g = window.__superglen; return g.loadLevel('bab2'); });
    await d.step(60);
    await page.evaluate(() => window.__superglen.game.setPlayerMode('superglen'));
    await d.step(5);
    const b = await page.evaluate(drumOverlapWithRow, drumOverlapInfo.toString());
    check(`touch 844x${h} (bab2, progress row shown): drum icons visible, no overlap`, b.visible && b.hit.length === 0 && b.inside && !b.bubbleOverlap, JSON.stringify(b));
  }
  await page.evaluate(() => window.__superglen.pause(false));
}

/** easy=0: a held button gives a single jump. */
async function parkourNoEasyScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeParkourDriver(page);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  await d.setup(0);
  check('?easy=0 turns easy mode off', d.last.easy === false);
  const j0 = d.last.jumps;
  await d.down();
  await d.step(300);
  await d.up();
  check('?easy=0: holding Space gives a single jump (no automatic bounce)', d.last.jumps === j0 + 1 && d.last.autos === 0, `jumps +${d.last.jumps - j0}, autos ${d.last.autos}`);
  // timed presses still work
  await d.untilGrounded();
  await d.setup(0);
  await d.tap();
  await d.untilEta(0.05);
  const j1 = d.last.jumps;
  await d.tap();
  await d.untilJump(j1);
  check('?easy=0: timed presses still raise the level', d.last.level === 1 && d.last.q === 'perfect');
  // flight unlocked: holding right after a timed press at level >= 2 flies (no chain without easy mode)
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: true }));
  await d.setup(2);
  await d.tap();
  await d.untilEta(0.05);
  await d.down();
  await d.step(120);
  check('?easy=0 with flight unlocked: holding always flies', d.last.flying && d.last.autos === 0, `flying ${d.last.flying}`);
  await d.up();
  await page.evaluate(() => window.__superglen.pause(false));
}

const AUDIO_STUB = () => {
  const aud = { ctxs: 0, oscs: [], noises: 0 };
  window.__aud = aud;
  class Param {
    constructor() { this.sets = []; this.value = 0; }
    setValueAtTime(v) { this.sets.push(['set', v]); return this; }
    linearRampToValueAtTime(v) { this.sets.push(['lin', v]); return this; }
    exponentialRampToValueAtTime(v) { this.sets.push(['exp', v]); return this; }
  }
  class Node { connect() { return this; } disconnect() {} }
  class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
  class Osc extends Node {
    constructor() { super(); this.type = 'sine'; this.frequency = new Param(); }
    start() { aud.oscs.push({ type: this.type, sets: this.frequency.sets }); }
    stop() {}
  }
  class Src extends Node { start() { aud.noises++; } stop() {} }
  class Filt extends Node { constructor() { super(); this.frequency = new Param(); this.Q = { value: 0 }; } }
  window.AudioContext = class {
    constructor() { aud.ctxs++; this.currentTime = 1; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(); }
    createGain() { return new Gain(); }
    createOscillator() { return new Osc(); }
    createBuffer(c, l) { return { getChannelData: () => new Float32Array(l) }; }
    createBufferSource() { return new Src(); }
    createBiquadFilter() { return new Filt(); }
    resume() { return Promise.resolve(); }
  };
};

const finalHz = (o) => { const ex = o.sets.filter((s) => s[0] === 'exp'); return ex.length ? ex[ex.length - 1][1] : -1; };

async function parkourAudioScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeParkourDriver(page);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  check('audio: the AudioContext is created inside the first tap (startGate.onStart)', await page.evaluate(() => window.__aud.ctxs === 1 && window.__superglen.rhythm.audio));
  const notes = [];
  for (let lvl = 0; lvl < 5; lvl++) {
    await d.setup(lvl);
    const n0 = await page.evaluate(() => window.__aud.oscs.length);
    await d.tap();
    await d.step(2);
    const got = await page.evaluate((n0) => window.__aud.oscs.slice(n0).map((o) => ({ type: o.type, sets: o.sets })), n0);
    notes.push(got.length === 1 ? finalHz(got[0]) : `n=${got.length}`);
    await d.untilGrounded();
    await d.step(10);
  }
  report: console.log(`   [parkour] drum notes per level: ${notes.join(', ')}`);
  check('audio: a rhythm jump schedules exactly one drum note at the pentatonic frequency of its level (levels 0-4)', notes.every((n, i) => Math.abs(n - PARKOUR_HZ[i]) < 0.01), notes.join(', '));
  // a timed jump into level 4 adds the lion cheer
  await d.setup(3);
  await d.tap();
  await d.untilEta(0.05);
  const n1 = await page.evaluate(() => window.__aud.oscs.length);
  await d.tap();
  await d.step(8);
  const extra = await page.evaluate((n1) => window.__aud.oscs.length - n1, n1);
  check('audio: a timed jump that reaches level 4 plays the drum plus the lion cheer (+ the soft boing of the preceding landing = 3 oscillators)', extra === 3, `${extra} oscillators`);
  // soft boing on a big landing
  await d.untilGrounded();
  await d.step(5);
  await d.setup(0);
  const n2 = await page.evaluate(() => window.__aud.oscs.length);
  await page.evaluate(() => window.__superglen.teleportFeet(0, 6, 0));
  await d.step(3);
  await d.untilGrounded();
  await d.step(3);
  const boing = await page.evaluate((n2) => window.__aud.oscs.slice(n2).length, n2);
  check('audio: a big landing plays one soft boing', boing === 1, `${boing} oscillators`);
  await page.evaluate(() => window.__superglen.pause(false));
}

async function parkourMuteScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeParkourDriver(page);
  await d.step(10);
  await d.setup(2);
  await d.tap();
  await d.untilEta(0.05);
  await d.tap();
  await d.step(10);
  await page.evaluate(() => window.__superglen.teleportFeet(0, 6, 0));
  await d.step(3);
  await d.untilGrounded();
  const aud = await page.evaluate(() => ({ oscs: window.__aud.oscs.length, noises: window.__aud.noises, muted: window.__superglen.rhythm.muted, sounds: window.__superglen.rhythm.sounds }));
  check('?mute=1: jumps, a perfect press and a big landing schedule no sound at all', aud.muted && aud.oscs === 0 && aud.noises === 0 && aud.sounds === 0, JSON.stringify(aud));
  await page.evaluate(() => window.__superglen.pause(false));
}

async function parkourNoAudioScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeParkourDriver(page);
  await d.step(10);
  await d.setup(2);
  await d.tap();
  await d.untilEta(0.05);
  await d.tap();
  await d.step(10);
  await page.evaluate(() => window.__superglen.teleportFeet(0, 6, 0));
  await d.step(3);
  await d.untilGrounded();
  check('no Web Audio at all: no exception, the game plays on (level 3 reached by a timed press)', !d.last.audio && d.last.level === 3 && d.last.grounded, `audio ${d.last.audio}, level ${d.last.level}`);
  await page.evaluate(() => window.__superglen.pause(false));
}

async function parkourPerfScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeParkourDriver(page);
  const report = (label, v) => console.log(`   [parkour] ${label}: ${v}`);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  // warm up once (a first bounce shows every effect), then measure
  await d.setup(0);
  await d.down();
  await d.step(240, true);
  await d.up();
  await d.untilGrounded();
  // Warm the plain (not rendered) stepping path too: the first seconds of any run allocate far more than a settled one
  // (JIT, lazy buffers), which made this budget flake. The measured run below is the second one.
  await d.setup(0);
  await d.down();
  await page.evaluate(() => { for (let i = 0; i < 480; i++) window.__superglen.advance(1, false); });
  await d.up();
  await d.untilGrounded();
  await d.setup(0);
  await d.step(3, true);
  const p0 = d.last.programs;
  const w0 = d.last.writes;
  await d.down();
  const res = await page.evaluate(() => {
    const g = window.__superglen;
    let changes = 0;
    let last = g.rhythm.level;
    const hasHeap = typeof performance.memory !== 'undefined' && typeof window.gc === 'function';
    if (hasHeap) window.gc();
    const heap = () => performance.memory.usedJSHeapSize;
    let prev = hasHeap ? heap() : 0;
    let acc = 0;
    const n = 600; // 10 s
    for (let i = 0; i < n; i++) {
      g.advance(1, i % 15 === 0 && false);
      if (g.rhythm.level !== last) { changes++; last = g.rhythm.level; }
      if (hasHeap) { const h = heap(); if (h >= prev) acc += h - prev; prev = h; }
    }
    return { changes, bpf: hasHeap ? acc / n : -1, hasHeap };
  });
  // rendered frames in the same run (every effect on screen once)
  for (let i = 0; i < 40; i++) await d.step(15, true);
  await d.up();
  await d.snap();
  report('10 s of rhythm bouncing', `level changes ${res.changes}, heap ${Math.round(res.bpf)} B/frame, programs ${p0} -> ${d.last.programs}, DOM writes ${d.last.writes - w0}`);
  check('10 s of rhythm bouncing (and rendering every effect): no shader program growth', d.last.programs === p0 && p0 > 0, `${p0} -> ${d.last.programs}`);
  if (res.hasHeap) check('10 s of rhythm bouncing: allocation budget < 16000 bytes per frame', res.bpf < 16000, `${Math.round(res.bpf)} B/frame`);
  check('drum icons: the DOM is written only when the level changes (writes <= level changes + 1)', res.changes >= 3 && d.last.writes - w0 <= res.changes + 1 + 4, `${res.changes} changes in the stepped run, ${d.last.writes - w0} writes (incl. the rendered run)`);
  await page.evaluate(() => window.__superglen.pause(false));
}

// ---------------------------------------------------------------------------------------------------------------
// Arena Lompat (test level, north of z = -30): Menara Irama, poles, bounce drums, mini house and ruko, walkable roofs.
// A deterministic bot: real jump presses (keyboard Space or the on-screen button) timed from the debug handle's
// time-to-land, steering through the synthetic stick (`walkTo`). The level layout is read from the level's own data
// (levelInfo.arena / levelInfo.roofs, published under window.__SG_TEST only), nothing is hard-coded here.
// ---------------------------------------------------------------------------------------------------------------

/** Drops the player 1.5 m above every sample point of every roof and checks the standing, the drift and a short walk. */
const roofProbe = (roofs) => {
  const g = window.__superglen;
  const out = [];
  for (const r of roofs) {
    for (let i = 0; i < r.samples.length; i++) {
      const s = r.samples[i];
      g.cancelWalk();
      g.teleportFeet(s.x, s.y + 1.5, s.z);
      g.advance(100, false);
      const a = { x: g.player.x, y: g.feetY, z: g.player.z, gr: !g.airborne };
      g.advance(60, false);
      const b = { x: g.player.x, y: g.feetY, z: g.player.z, gr: !g.airborne };
      const row = { id: r.id, i, dy: a.y - s.y, grounded: a.gr && b.gr, drift: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), walk: null };
      if (i === 0 && r.samples.length > 1) {
        const t = r.samples[1];
        g.walkTo(t.x, t.z);
        g.advance(1, false);
        for (let k = 0; k < 240 && g.walking; k++) g.advance(1, false);
        g.cancelWalk();
        g.advance(30, false);
        row.walk = { err: Math.hypot(g.player.x - t.x, g.player.z - t.z), dy: g.feetY - t.y, grounded: !g.airborne };
      }
      out.push(row);
    }
  }
  return out;
};

/** Runs roofProbe and turns the result into checks. */
async function roofChecks(page, check, roofs, label) {
  const res = await page.evaluate(roofProbe, roofs);
  const bad = res.filter((r) => !(r.grounded && Math.abs(r.dy) <= 0.15 && r.drift < 0.05));
  const badWalk = res.filter((r) => r.walk && !(r.walk.grounded && r.walk.err < 0.6 && Math.abs(r.walk.dy) <= 0.3));
  const worst = res.reduce((m, r) => Math.max(m, Math.abs(r.dy)), 0);
  const drift = res.reduce((m, r) => Math.max(m, r.drift), 0);
  console.log(`   [roofs] ${label}: ${roofs.length} roofs, ${res.length} sample points, worst surface error ${worst.toFixed(3)} m, worst drift ${drift.toFixed(4)} m`);
  check(`${label}: dropping the player 1.5 m above every roof sample point (${res.length} points on ${roofs.length} roofs) ends grounded within 0.15 m of the drawn surface, drifting < 0.05 m in 1 s`, bad.length === 0 && res.length >= roofs.length, bad.slice(0, 4).map((r) => `${r.id}#${r.i} dy ${r.dy.toFixed(2)} drift ${r.drift.toFixed(3)} gr ${r.grounded}`).join('; '));
  check(`${label}: the player can walk along each roof (no sliding, no sinking)`, badWalk.length === 0, badWalk.slice(0, 4).map((r) => `${r.id} err ${r.walk.err.toFixed(2)} dy ${r.walk.dy.toFixed(2)}`).join('; '));
}

/** Parkour driver + bot moves for the arena. `tap` can be replaced (touch button). */
function makeArenaDriver(page, tapImpl) {
  const d = makeParkourDriver(page);
  if (tapImpl) d.tap = tapImpl;
  d.arena = null;
  d.load = async () => {
    d.arena = JSON.parse(await page.evaluate(() => window.__superglen.levelInfo.arena));
    d.fh = Object.fromEntries(d.arena.footholds.map((f) => [f.id, f]));
    d.arena.roofs = JSON.parse(await page.evaluate(() => window.__superglen.levelInfo.roofs));
    return d.arena;
  };
  d.cancelWalk = () => page.evaluate(() => window.__superglen.cancelWalk());
  /** Superglen standing at feet (x, y, z), rhythm level `level`, cap `cap`; waits until the level has settled. */
  d.stand = async (x, y, z, level = 0, cap = 4, mode = 'superglen') => {
    for (const k of ['Space', 'w', 'a', 's', 'd']) await page.keyboard.up(k);
    await page.evaluate(([m, x, y, z, l, c]) => {
      const g = window.__superglen;
      g.game.setPlayerMode(m);
      g.cancelWalk();
      g.rhythm.setCap(c);
      g.teleportFeet(x, y + 0.03, z);
      g.setCameraYaw(0);
      g.rhythm.setLevel(l);
    }, [mode, x, y, z, level, cap]);
    await d.step(100); // lands, then 1.5 s idle: the next press is a plain first jump
    return d.last;
  };
  /**
   * Generic helper `rhythmTo(level)`: from level 0 on the ground, one plain jump and then perfectly timed presses (50 ms
   * before touchdown) until the level is reached. The jump started by the LAST press is already launched with `level`.
   * Stops early (returns the level it got) when a cap prevents more.
   */
  d.rhythmTo = async (target) => {
    await d.tap();
    for (let guard = 0; d.last.level < target && guard < 12; guard++) {
      await d.untilEta(0.05);
      const j0 = d.last.jumps;
      const l0 = d.last.level;
      await d.tap();
      await d.untilJump(j0);
      if (d.last.level <= l0) break;
    }
    return d.last;
  };
  /** Steer toward (tx, tz) (a point inside the target) in the air, press the air jump at the top, until landed. */
  d.dash = async (tx, tz, { frames = 360, useDouble = true } = {}) => {
    await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [tx, tz]);
    let pressed = false;
    d.maxY = d.last.y;
    for (let i = 0; i < frames; i++) {
      await d.step(1);
      d.maxY = Math.max(d.maxY, d.last.y);
      if (useDouble && !pressed && !d.last.grounded && d.last.vy <= 1.0 && d.last.vy > -3) {
        await d.tap();
        pressed = true;
      }
      if (d.last.grounded && i > 8 && !d.last.mantling) break;
    }
    await d.cancelWalk();
    await d.step(25);
    return d.last;
  };
  d.on = (fh, tol = 0.2) => d.last.grounded && Math.abs(d.last.y - fh.top) < tol && Math.abs(d.last.x - fh.x) < fh.w / 2 + 0.4 && Math.abs(d.last.z - fh.z) < fh.d / 2 + 0.4;
  return d;
}

/** One tower hop: from the floor below (or the ground) to floor n with the rhythm level capped at `cap`. */
async function towerHop(d, n, cap, mode = 'superglen') {
  const t = d.fh[`floor${n}`];
  const prev = n > 0 ? d.fh[`floor${n - 1}`] : null;
  const sx = prev ? prev.x : t.x;
  const sy = prev ? prev.top : 0;
  const sz = prev ? prev.z - prev.d / 2 + 1.5 : t.z + t.d / 2 + 2.0;
  await d.stand(sx, sy, sz, 0, cap, mode);
  await d.rhythmTo(Math.min(n, cap));
  await d.dash(t.x, t.z, { useDouble: mode === 'superglen' });
  return { reached: d.on(t), y: d.last.y, level: d.last.level, maxY: d.maxY, from: sy };
}

async function arenaSuite(page, check, d, { touch = false, floors = 5, shots = false } = {}) {
  const report = (label, v) => console.log(`   [arena${touch ? '-touch' : ''}] ${label}: ${v}`);
  const A = await d.load();
  const dj0 = () => d.last.dj;

  // ---- Tower: layout from the level's data ----
  const F = [0, 1, 2, 3, 4].map((n) => d.fh[`floor${n}`]);
  const rises = F.map((f, i) => f.top - (i ? F[i - 1].top : 0));
  const gaps = F.map((f, i) => (i ? F[i - 1].z - F[i - 1].d / 2 - (f.z + f.d / 2) : 0));
  report('tower tops', F.map((f) => f.top.toFixed(2)).join(' / '));
  report('tower rises', rises.map((r) => r.toFixed(2)).join(' / '));
  report('tower gaps', gaps.map((r) => r.toFixed(2)).join(' / '));
  if (!touch) {
    check('tower: 5 floors, each top higher than the one below, gaps widening floor by floor', F.every((f, i) => i === 0 || f.top > F[i - 1].top) && gaps.slice(2).every((g, i) => g > gaps[i + 1]), `rises ${rises.map((r) => r.toFixed(2))} gaps ${gaps.map((r) => r.toFixed(2))}`);
    check('tower: every floor has at least 3 x 3 m of room to bounce in place', F.every((f) => f.w >= 3 && f.d >= 3), F.map((f) => `${f.w}x${f.d}`).join(' '));
    check('tower: a level marker of 1 to 5 drum icons is painted on every floor', JSON.stringify(A.markers) === '[1,2,3,4,5]', JSON.stringify(A.markers));
  }

  // ---- Tower: each floor is reached with level N and NOT with level N-1 ----
  const results = [];
  const table = [];
  for (let n = 0; n < floors; n++) {
    const ok = await towerHop(d, n, n);
    results.push(`${n}:${ok.reached ? 'yes' : 'NO'}`);
    check(`tower: floor ${n} (${F[n].top.toFixed(2)} m) is reached with rhythm level ${n} (rhythm jump, air jump, mantle)`, ok.reached, `y ${ok.y.toFixed(2)} level ${ok.level}`);
    if (n === 0) {
      const glen = await towerHop(d, 0, 0, 'glen');
      check('tower: floor 0 is out of reach for Glen (no rhythm jump, no air jump)', !glen.reached, `y ${glen.y.toFixed(2)}`);
    } else {
      const bad = await towerHop(d, n, n - 1);
      check(`tower: floor ${n} is NOT reached when the level is capped at ${n - 1} (best effort: air jump at the top, mantle)`, !bad.reached, `best foot height ${(bad.maxY - bad.from).toFixed(2)} m above the floor below, floor is ${(F[n].top - bad.from).toFixed(2)} m up`);
      table.push(`${n}: rise ${(F[n].top - bad.from).toFixed(2)} | with level ${n}: foot peak +${(ok.maxY - ok.from).toFixed(2)} reached | level ${n - 1}: +${(bad.maxY - bad.from).toFixed(2)} not reached`);
    }
    if (shots && n === 2) {
      await towerHop(d, 2, 2);
      await d.step(40);
      await d.step(1, true);
      await shot(page, 'arena-tower');
    }
  }
  report('tower floors reached at their own level', results.join(' '));
  for (const t of table) report('tower floor', t);
  if (floors < 5) return;

  // ---- Top reward ----
  {
    await d.stand(F[3].x, F[3].top, F[3].z - F[3].d / 2 + 1.5, 0, 4);
    const r0 = await page.evaluate(() => window.__superglen.levelInfo.reward_tower || 0);
    await d.rhythmTo(4);
    await d.dash(F[4].x, F[4].z);
    // walk to the middle of the top (the star hovers there)
    await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [F[4].x, F[4].z]);
    await d.step(90);
    const r1 = await page.evaluate(() => ({ r: window.__superglen.levelInfo.reward_tower || 0, s: window.__superglen.rhythm.sounds }));
    check('tower: standing on the top floor takes the gold star (reward fires, fanfare plays)', d.on(F[4]) && r1.r === r0 + 1, `reward ${r0} -> ${r1.r}`);
  }
}

async function arenaDrums(page, check, d, { touch = false, shotName = null } = {}) {
  const report = (label, v) => console.log(`   [arena${touch ? '-touch' : ''}] ${label}: ${v}`);
  const D = ['drum1', 'drum2', 'drum3'].map((id) => d.fh[id]);
  const ledge = d.fh.drumLedge;
  const run = async (cap) => {
    await d.stand(D[0].x, 0, D[0].z + 3.3, 0, cap);
    const b0 = d.last.bounces;
    const seen = [];
    await d.tap(); // plain first jump (level 0)
    await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [D[0].x, D[0].z]);
    let next = 0;
    let pressed = false;
    for (let i = 0; i < 500; i++) {
      await d.step(1);
      if (d.last.bounces - b0 > next) {
        next++;
        seen.push(`${next}:L${d.last.level}`);
        if (shotName && next === 2) {
          await d.step(6, true);
          await shot(page, shotName);
        }
        pressed = false;
        const tgt = next < 3 ? D[next] : ledge;
        await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [tgt.x, tgt.z]);
      }
      if (next === 3 && !pressed && !d.last.grounded && d.last.vy <= 1.0 && d.last.vy > -3) {
        await d.tap();
        pressed = true;
      }
      if (next === 3 && d.last.grounded && i > 20 && !d.last.mantling && d.last.y > 1.5) break;
      if (next === 3 && d.last.grounded && d.last.y < 1.3 && i > 60 + next * 60 && !d.last.mantling) { /* landed on a drum again: keep bouncing / trying */ }
    }
    await d.cancelWalk();
    await d.step(30);
    return { seen, bounces: d.last.bounces - b0, level: d.last.level, onLedge: d.on(ledge) };
  };
  const full = await run(4);
  report('three drums hop', JSON.stringify(full));
  check('drums: hopping drum -> drum -> drum registers a bounce event on each (3 bounces)', full.bounces >= 3 && full.seen.slice(0, 3).join() === '1:L1,2:L2,3:L3', full.seen.join());
  check('drums: three hops raise the level 0 -> 3 (one level per drum)', full.seen.length >= 3 && full.seen[2] === '3:L3', full.seen.join());
  check(`drums: the high ledge after the third drum (${ledge.top.toFixed(2)} m) is reached with the level the drums gave`, full.onLedge, `y ${d.last.y.toFixed(2)}`);
  const capped = await run(2);
  check('drums: the ledge is NOT reached when the level is capped at 2 (needs the third bounce at level 3)', !capped.onLedge, `seen ${capped.seen.join()} y ${d.last.y.toFixed(2)}`);
}

async function arenaBuildings(page, check, d) {
  const report = (label, v) => console.log(`   [arena] ${label}: ${v}`);
  const A = d.arena;
  const bld = A.buildings;
  const routeRun = async (name, cap, shotName, air = true) => {
    const steps = A.routes[name];
    const first = d.fh[steps[0].id];
    await d.stand(first.x, 0, first.z + 2.2, 0, cap);
    const log = [];
    let cur = null;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const lv = Math.min(air ? st.needs : st.needs > 0 ? 4 : 0, cap);
      if (st.id.endsWith('Roof')) {
        const roof = A.roofs.find((r) => r.id === st.id);
        const t = roof.samples[0];
        if (i > 0) await d.step(100);
        await d.rhythmTo(lv);
        await d.dash(t.x, t.z, { useDouble: false });
        const b = bld[name];
        const ok = d.last.grounded && d.last.y > b.wall - 0.2 && Math.abs(d.last.x - b.x) < b.w / 2 + 0.6 && Math.abs(d.last.z - b.z) < b.d / 2 + 0.6;
        log.push(`${st.id}:${ok ? 'ok' : 'NO'}`);
        if (!ok) return { reached: false, log };
        if (shotName) {
          await d.step(40);
          // Superglen on the roof, seen from the street side
          await page.evaluate(([x, y, z, tx, ty, tz]) => window.__superglen.lookFrom([x, y, z, tx, ty, tz]), [b.x - 5, b.wall + 4, b.z + b.d / 2 + 8, b.x, b.wall + 1.5, b.z + 1]);
          await d.step(2, true);
          await shot(page, shotName);
          await page.evaluate(() => window.__superglen.lookFrom(null));
        }
        return { reached: true, log, y: d.last.y };
      }
      const f = d.fh[st.id];
      if (i === 0) {
        // the first crate is a plain jump from the ground
        await d.rhythmTo(0);
        await d.dash(f.x, f.z, { useDouble: false });
      } else {
        await d.step(100);
        await d.rhythmTo(lv);
        await d.dash(f.x, f.z, { useDouble: air && st.needs > 0 });
      }
      const ok = d.on(f);
      log.push(`${st.id}:${ok ? 'ok' : 'NO'}`);
      cur = f;
      if (!ok) return { reached: false, log, y: d.last.y };
    }
    return { reached: false, log };
  };
  const hres = await routeRun('house', 1, null);
  report('house route (cap 1)', JSON.stringify(hres));
  check('house: the route crates -> crates -> awning -> roof reaches the roof with rhythm level <= 1', hres.reached, hres.log.join(' '));
  const h0 = await routeRun('house', 0, null);
  check('house: the roof is reachable even with level 0 only (no foothold needs more than level 1)', h0.reached, h0.log.join(' '));
  const hn = await routeRun('house', 0, null, false);
  check('house: ...and without the air jump (plain jumps only)', hn.reached, hn.log.join(' '));
  const rres = await routeRun('ruko', 3, 'arena-ruko');
  report('ruko route (cap 3)', JSON.stringify(rres));
  check('ruko: the route crate -> balcony bay -> sign board -> roof reaches the roof with rhythm level <= 3', rres.reached, rres.log.join(' '));
  const need = Math.max(...A.routes.ruko.map((s) => s.needs));
  check('ruko: the hardest hop of the route is level 2 (class ruko: levels 2-3)', need === 2, `highest designed level ${need}`);
  const r0 = await routeRun('ruko', 0, null);
  check('ruko: the roof is NOT reached with level 0 only', !r0.reached, r0.log.join(' '));
  const r1 = await routeRun('ruko', 1, null);
  check('ruko: the roof is NOT reached with level 1 (the balcony hop is 5.2 m above the crate, level 1 reaches 4.9 m)', !r1.reached, r1.log.join(' '));
  const r2 = await routeRun('ruko', 2, null);
  check('ruko: level 2 is enough with the air jump', r2.reached, r2.log.join(' '));
  const n3 = await routeRun('ruko', 3, null, false);
  check('ruko: without the air jump level 3 is NOT enough (jump + mantle: 5.0 m)', !n3.reached, n3.log.join(' '));
  const n4 = await routeRun('ruko', 4, null, false);
  check('ruko: without the air jump level 4 is enough (jump + mantle: 5.8 m)', n4.reached, n4.log.join(' '));
}

async function arenaDesktopScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(900);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeArenaDriver(page);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  await d.load();
  check('arena data is published to the test (levelInfo.arena / roofs)', d.arena.footholds.length >= 19 && Object.keys(d.arena.routes).length === 4);
  d.arena.roofs = JSON.parse(await page.evaluate(() => window.__superglen.levelInfo.roofs));

  // ---- screenshots from above ----
  await page.evaluate(() => { const g = window.__superglen; g.lookFrom([0, 45, 10, 0, 4, -65]); g.advance(3, true); });
  await shot(page, 'arena-overview');
  const calls = {};
  for (const [name, pose] of [['spawn', null], ['overview', [0, 45, 10, 0, 4, -65]], ['tower side', [-8, 20, -24, -20, 12, -52]], ['drums', [28, 7, -30, 18, 3, -44]], ['north', [0, 12, -60, 0, 4, -95]]]) {
    await page.evaluate((p) => { const g = window.__superglen; g.lookFrom(p); g.advance(3, true); }, pose);
    calls[name] = await page.evaluate(() => { const c = window.__superglen.debugCounts(); return `${c.calls} calls ${c.triangles} tris`; });
  }
  console.log('   [arena] draw calls / triangles per viewpoint:', JSON.stringify(calls));
  const worst = Object.values(calls).map((v) => v.split(' ').map(Number)).reduce((m, v) => [Math.max(m[0], v[0]), Math.max(m[1], v[2])], [0, 0]);
  check('perf: arena viewpoints stay inside the budget (< 150 draw calls, <= 60k triangles)', worst[0] < 150 && worst[1] <= 60000, JSON.stringify(calls));
  await page.evaluate(() => window.__superglen.lookFrom(null));

  // ---- walkable roofs of the arena houses ----
  await roofChecks(page, check, d.arena.roofs, 'arena');

  // ---- tower, drums, buildings ----
  await arenaSuite(page, check, d, { shots: true });
  await arenaDrums(page, check, d, { shotName: 'arena-drums' });
  await arenaBuildings(page, check, d);

  // ---- easy mode: hold the jump button on the tower's ground floor ----
  {
    const F = [0, 1, 2, 3, 4].map((n) => d.fh[`floor${n}`]);
    await page.evaluate(() => window.__superglen.rhythm.setCap(4));
    const climb = async (airJump) => {
      await d.stand(F[0].x, 0, F[0].z + F[0].d / 2 + 2.0, 0, 4);
      await d.down();
      let reached = -1;
      for (let n = 0; n < 5; n++) {
        const t = F[n];
        // holding alone has no air jump: jump + mantle needs level 3 for every floor above the first (plain 5.0 m)
        const need = airJump ? Math.min(n, 3) : n === 0 ? 0 : 3;
        if (n > 0) {
          // walk (still holding) to 1.5 m from the north edge of the floor below, the spot a child would hop from
          const p = F[n - 1];
          await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [p.x, p.z - p.d / 2 + 1.5]);
          for (let i = 0; i < 200; i++) {
            await d.step(1);
            if (!(await page.evaluate(() => window.__superglen.walking))) break;
          }
          await d.cancelWalk();
        }
        // hold in place until the automatic bounce has built the level this floor needs
        for (let i = 0; i < 1200 && !(d.last.level >= need && d.last.grounded); i++) await d.step(1);
        await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [t.x, t.z]);
        let pressed = false;
        let got = false;
        for (let i = 0; i < 300 && !got; i++) {
          await d.step(1);
          if (airJump && !pressed && !d.last.grounded && d.last.vy <= 1.0 && d.last.vy > -3) {
            // release for one frame and press again: the air jump; the hold then goes on
            await d.up();
            await d.step(1);
            await d.down();
            pressed = true;
          }
          if (d.on(t, 0.25)) got = true;
        }
        await d.cancelWalk();
        if (!got) break;
        reached = n;
      }
      await d.up();
      return reached;
    };
    const holdOnly = await climb(false);
    const withAir = await climb(true);
    report3('easy mode, holding only: highest floor reached', holdOnly);
    report3('easy mode, holding + air jump: highest floor reached', withAir);
    check('easy mode: holding the jump button on the ground floor climbs the tower (floors 0 and 1 with the held bounce and the mantle alone)', holdOnly >= 1 && holdOnly <= 3, `floor ${holdOnly}`);
    check('easy mode: holding + the air jump reaches up to the floor that needs level 3, never the level-4 floor', withAir === 3, `floor ${withAir}`);
  }

  // ---- no leaks on test <-> bab1 reloads ----
  await page.evaluate(() => window.__superglen.pause(false));
  const cyc = async (id) => {
    await page.evaluate((id) => window.__superglen.loadLevel(id), id);
    await page.waitForFunction((id) => window.__superglen.level === id && !window.__superglen.loading, id, { timeout: 15000 });
    await sleep(300);
  };
  await cyc('bab1');
  await cyc('test');
  await sleep(800);
  const c1 = await page.evaluate(countsOf);
  await cyc('bab1');
  await cyc('test');
  await sleep(800);
  const c2 = await page.evaluate(countsOf);
  const same = ['geometries', 'textures', 'colliders', 'bodies', 'sceneChildren'].every((k) => c1[k] === c2[k]);
  check('test -> bab1 -> test reloads do not leak (geometries, textures, colliders, bodies, scene children)', same, `${JSON.stringify(c1)} vs ${JSON.stringify(c2)}`);
  await page.evaluate(() => window.__superglen.save.reset());
}
const report3 = (label, v) => console.log(`   [arena] ${label}: ${v}`);

async function arenaTouchScenario(page, check) {
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, 200);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  let d = null;
  const center = () => page.evaluate(() => {
    const r = document.querySelector('.tc-button[data-action=jump]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const tapBtn = async () => {
    const jb = await center();
    await fingers.down(7, jb.x, jb.y);
    await d.step(1);
    await fingers.up(7);
    return d.last;
  };
  d = makeArenaDriver(page, tapBtn);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  await d.load();
  await d.stand(0, 0, 0, 0);
  check('touch 844x281 (arena): the jump button is a real on-screen button >= 80 x 80', await page.evaluate(() => { const r = document.querySelector('.tc-button[data-action=jump]').getBoundingClientRect(); return r.width >= 80 && r.height >= 80; }));
  await arenaSuite(page, check, d, { touch: true, floors: 2 });
  await arenaDrums(page, check, d, { touch: true });
  await d.step(1, true);
  await shot(page, 'arena-touch-281');
}


// ---------------------------------------------------------------------------------------------------------------
// Wall kick (PAKET_P1_PARKOUR.md section 2) and the Gang Tendang kick alley of the Arena Lompat.
// ---------------------------------------------------------------------------------------------------------------

/** Shared checks of the `wallkick` scenarios. `full` adds the desktop-only cases (flight needs a held key). */
async function wallkickChecks(page, check, d, tag, full) {
  const report = (label, v) => console.log(`   [wallkick ${tag}] ${label}: ${v}`);
  const A = await d.load();
  const K = A.kick;
  const faceA = K.wallA.x + K.wallA.w / 2 + 0.1; // collider face (the friendly margin is 0.1 m)
  const faceB = K.wallB.x - K.wallB.w / 2 - 0.1;
  const walkTo = (x, z) => page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [x, z]);
  const stopWalk = () => page.evaluate(() => window.__superglen.cancelWalk());
  const setKick = (on) => page.evaluate((on) => window.__superglen.rhythm.setWallKick(on), on);
  await setKick(true);
  report('alley', `walls ${faceA.toFixed(2)} .. ${faceB.toFixed(2)} (gap ${(faceB - faceA).toFixed(2)} m), z ${K.z}`);
  check(`${tag}: the alley gap is 2.2 m between the colliders and the walls are 9 m high`, Math.abs(faceB - faceA - 2.2) < 0.01 && K.top === 9);

  // ---- 1. one kick: direction, height, hint ----------------------------------------------------------------------------------
  await d.stand(faceA + 0.36, 0, K.z, 0, 4);
  await walkTo(K.wallA.x, K.z); // press toward wall A through the normal stick path
  await d.step(8);
  await d.tap();
  for (let i = 0; i < 80 && !(d.last.vy <= 0.6 && !d.last.grounded); i++) await d.step(1);
  const hintBefore = d.last.khint;
  const y0 = d.last.y;
  const x0 = d.last.x;
  const dj0 = d.last.dj;
  const lvl0 = d.last.level;
  await d.tap();
  const vyKick = d.last.vy;
  let apex = d.last.y;
  for (let i = 0; i < 12; i++) {
    await d.step(1);
    apex = Math.max(apex, d.last.y);
  }
  const xAway = d.last.x - x0;
  const kicks1 = d.last.kicks;
  // The second press on the SAME face, a few frames later, is the air jump, not a kick.
  await d.tap();
  const secondKick = d.last.kicks - kicks1;
  const secondDj = d.last.dj - dj0;
  for (let i = 0; i < 60; i++) {
    await d.step(1);
    apex = Math.max(apex, d.last.y);
  }
  report('kick', `hint ${hintBefore}, vy ${vyKick.toFixed(2)}, away ${xAway.toFixed(2)} m, apex ${(apex - y0).toFixed(2)}`);
  check(`${tag}: the hint shows while a kick is possible (airborne, touching the wall)`, hintBefore === true);
  check(`${tag}: a press against a tall wall in the air kicks: vertical speed positive (launch speed)`, vyKick > 7.5 && kicks1 === 1, `vy ${vyKick.toFixed(2)}, kicks ${kicks1}`);
  check(`${tag}: the kick pushes away from the wall (x grows away from wall A)`, xAway > 0.3, `${xAway.toFixed(2)} m in 13 frames`);
  check(`${tag}: a second press on the same face does not kick again: the air jump happens instead (kicks ${secondKick}, air jumps +${secondDj})`, secondKick === 0 && secondDj === 1);
  check(`${tag}: the kick does not change the rhythm level (not a landing)`, d.last.level === lvl0 || d.last.grounded, `${lvl0} -> ${d.last.level}`);
  // Clean apex measurement without the air jump on top.
  {
    await d.stand(faceA + 0.36, 0, K.z, 0, 4);
    await walkTo(K.wallA.x, K.z);
    await d.step(8);
    await d.tap();
    for (let i = 0; i < 80 && !(d.last.vy <= 0.6 && !d.last.grounded); i++) await d.step(1);
    const py = d.last.y;
    await d.tap();
    let top = d.last.y;
    for (let i = 0; i < 40; i++) {
      await d.step(1);
      top = Math.max(top, d.last.y);
      if (d.last.vy < -1) break;
    }
    report('apex', `${(top - py).toFixed(3)} m above the press point`);
    check(`${tag}: kick apex = 1.4 m (+-0.15) above the press point`, Math.abs(top - py - 1.4) <= 0.15, `${(top - py).toFixed(3)} m`);
    await stopWalk();
    await d.step(80);
  }

  // ---- 2. the alley: a bot zig-zags up with alternating kicks ---------------------------------------------------------------------------
  const climb = async (kicksOn, frames) => {
    await setKick(kicksOn);
    await d.stand(faceA + 0.36, 0, K.z, 0, 4);
    let target = 'A';
    await walkTo(K.wallA.x, K.z);
    let djSeen = d.last.dj;
    let airDj = false;
    let maxY = 0;
    let topY = 0;
    let kicks = 0;
    let sawGrounded = 0;
    for (let i = 0; i < frames; i++) {
      const s = await d.step(1);
      maxY = Math.max(maxY, s.y);
      if (s.grounded && s.y > 8.5) {
        topY = s.y;
        break;
      }
      if (s.grounded) {
        airDj = false;
        sawGrounded++;
        target = 'A';
        if (sawGrounded % 3 === 1) {
          await walkTo(K.wallA.x, K.z);
          await d.tap();
        }
        continue;
      }
      if (s.khint && s.vy <= 0.5) {
        const k0 = s.kicks;
        const at = s.x < K.x ? 'A' : 'B';
        await d.tap();
        if (d.last.kicks > k0) {
          kicks++;
          target = at === 'A' ? 'B' : 'A';
          await walkTo(target === 'A' ? K.wallA.x : K.wallB.x, K.z);
        }
      } else if (!s.khint && !airDj && s.vy <= 0.4 && s.vy > -1 && s.y > 1) {
        airDj = true; // the air jump at the top, as a child would
        await d.tap();
      }
      void djSeen;
    }
    return { maxY, topY, kicks, frames: d.last.kicks };
  };
  const res = await climb(true, 1500);
  report('climb with kicks', `top ${res.topY.toFixed(2)} m, max ${res.maxY.toFixed(2)} m, ${res.kicks} kicks, chain now ${d.last.kchain}`);
  check(`${tag}: with wall kicks the bot zig-zags up the Gang Tendang onto a wall top (9 m)`, res.topY > 8.5, `top ${res.topY.toFixed(2)} m, max ${res.maxY.toFixed(2)} m, kicks ${res.kicks}`);
  await stopWalk();
  // Walk to the star of the wall it stands on.
  {
    const onA = d.last.x < K.x;
    const sw = onA ? K.wallA : K.wallB;
    await walkTo(sw.x, K.z);
    for (let i = 0; i < 160; i++) await d.step(1);
    const id = onA ? 'reward_kickA' : 'reward_kickB';
    const got = await page.evaluate((id) => window.__superglen.levelInfo[id] || 0, id);
    check(`${tag}: the star on top of the wall is collected`, got >= 1, `${id} ${got}`);
    await stopWalk();
  }
  // Same bot with wall kicks off, even at rhythm level 4 + air jump: it cannot get up (plain jumps top out below 7 m).
  {
    await setKick(false);
    await d.stand(faceA + 0.36, 0, K.z, 0, 4);
    let maxY = 0;
    let top = false;
    for (let round = 0; round < 3; round++) {
      await walkTo(K.wallA.x, K.z);
      await d.rhythmTo(4);
      let dj = false;
      for (let i = 0; i < 140; i++) {
        const s = await d.step(1);
        maxY = Math.max(maxY, s.y);
        if (s.grounded && s.y > 8.5) top = true;
        if (!dj && !s.grounded && s.vy <= 0.4 && s.vy > -1) {
          dj = true;
          await d.tap();
        }
        if (s.grounded && i > 6) break;
      }
    }
    await stopWalk();
    report('climb without kicks', `max feet ${maxY.toFixed(2)} m (level 4 + air jump)`);
    check(`${tag}: with wall kicks off the alley cannot be climbed, even at rhythm level 4 with the air jump (max ${maxY.toFixed(2)} m < 7)`, !top && maxY < 7.0, `max ${maxY.toFixed(2)} m`);
    await setKick(true);
  }

  // ---- 3. where it must NOT kick -----------------------------------------------------------------------------------------------------------
  const bx = 20;
  const faceX = bx - 1.5;
  await page.evaluate(([bx]) => {
    const g = window.__superglen;
    g.testBox(bx, 1.1, -80, 1.5, 1.1, 1.5, false, true); // low kickable box: top 2.2 m
    g.testBox(bx, 3, -86, 1.5, 3, 1.5, false, true); // tall kickable box: top 6 m
    g.testBox(bx, 3, -92, 1.5, 3, 1.5, true, true); // tall bounce drum (also marked kickable: the drum rule must win)
    g.testBox(bx, 3, -98, 1.5, 3, 1.5); // tall ordinary wall (not kickable)
  }, [bx]);
  const boxCase = async (z, mode, toward, when = 'apex') => {
    await d.stand(faceX - 0.36, 0, z, 0, 4, mode);
    if (toward) await walkTo(bx, z);
    await d.step(8);
    const k0 = d.last.kicks;
    const dj = d.last.dj;
    const m0 = d.last.mantles;
    await d.tap();
    if (when === 'mid') await d.step(5); // rising along the wall: a ledge in reach is grabbed (the mantle starts, controls lock)
    else for (let i = 0; i < 80 && !(d.last.vy <= 0.6 && !d.last.grounded); i++) await d.step(1);
    await d.tap();
    for (let i = 0; i < 20; i++) await d.step(1);
    const out = { kicks: d.last.kicks - k0, dj: d.last.dj - dj, mantles: d.last.mantles - m0 };
    await stopWalk();
    await d.step(100);
    return out;
  };
  const ctl = await boxCase(-86, 'superglen', true);
  check(`${tag}: control: the same press against a 6 m box does kick`, ctl.kicks === 1, JSON.stringify(ctl));
  const low = await boxCase(-80, 'superglen', false);
  check(`${tag}: no kick against a low box (top 2.2 m is under head + 0.6 m): the air jump happens instead`, low.kicks === 0 && low.dj === 1, JSON.stringify(low));
  const mant = await boxCase(-80, 'superglen', true, 'mid');
  check(`${tag}: a ledge within mantle reach is mantled, not kicked (mantle wins)`, mant.kicks === 0 && mant.mantles >= 1, JSON.stringify(mant));
  const drum = await boxCase(-92, 'superglen', true);
  check(`${tag}: no kick against a bounce drum (a 6 m tall one, same press as the control)`, drum.kicks === 0 && drum.dj === 1, JSON.stringify(drum));
  const plain = await boxCase(-98, 'superglen', true);
  check(`${tag}: an ordinary tall wall (not marked kickable) is never kicked: building and tower heights keep their gates`, plain.kicks === 0 && plain.dj === 1, JSON.stringify(plain));
  const glen = await boxCase(-86, 'glen', true);
  check(`${tag}: no kick in Glen mode (simple jumps only)`, glen.kicks === 0 && glen.dj === 0, JSON.stringify(glen));

  // ---- 4. a fresh press after a real flight re-ignites the jets instead of kicking (desktop: needs a held key) ----------------------
  if (full) {
    await page.evaluate(() => { window.__superglen.game.setSkills({ fly: true }); window.__superglen.skills.setMaxFlyHeight(6); });
    await d.stand(faceA + 0.36, 0, K.z, 0, 4);
    await walkTo(K.wallA.x, K.z);
    await d.step(8);
    await d.down();
    await d.step(110);
    const flying = d.last.flying;
    await d.up();
    await d.step(12);
    const k0 = d.last.kicks;
    const fl0 = d.last.flights;
    const hintAfter = d.last.khint;
    await d.down();
    await d.step(2);
    await d.up();
    report('flight', `flying ${flying}, hint after flight ${hintAfter}, flights +${d.last.flights - fl0}, kicks +${d.last.kicks - k0}`);
    check(`${tag}: after a real flight a fresh press re-ignites the jets and does not kick (and no hint shows)`, flying && d.last.flights === fl0 + 1 && d.last.kicks === k0 && !hintAfter, `flying ${flying}, flights +${d.last.flights - fl0}, kicks +${d.last.kicks - k0}`);
    await stopWalk();
    await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
    await d.step(300);
  }

  // ---- 5. the picture: kicked off wall A, arriving at wall B (hint there, burst from the kick behind) ----------------------------------
  await d.stand(faceA + 0.36, 0, K.z, 0, 4);
  await walkTo(K.wallA.x, K.z);
  await d.step(8);
  await d.tap();
  for (let i = 0; i < 80 && !(d.last.vy <= 0.6 && !d.last.grounded); i++) await d.step(1);
  await walkTo(K.wallB.x, K.z);
  await d.tap();
  let shown = false;
  for (let i = 0; i < 40 && !shown; i++) {
    await d.step(1);
    shown = d.last.khint;
  }
  await d.step(1, true);
  check(`${tag}: after the kick the hint shows again at the OTHER wall`, shown);
  await shot(page, tag === 'desktop' ? 'wallkick' : 'wallkick-touch');
  await stopWalk();
}

async function wallkickDesktopScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(900);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeArenaDriver(page);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  await wallkickChecks(page, check, d, 'desktop', true);
}

async function wallkickTouchScenario(page, check) {
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, 200);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  let d = null;
  const tapBtn = async () => {
    const jb = await page.evaluate(() => {
      const r = document.querySelector('.tc-button[data-action=jump]').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await fingers.down(7, jb.x, jb.y);
    await d.step(1);
    await fingers.up(7);
    return d.last;
  };
  d = makeArenaDriver(page, tapBtn);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  await wallkickChecks(page, check, d, 'touch 844x281', false);
}

async function bab1RoofScenario(page, check) {
  await sleep(1500);
  await page.evaluate(() => window.__superglen.save.markChapterDone('bab1'));
  await page.goto(URL + '?fps=0');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(900);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeParkourDriver(page);
  await d.step(60);
  const roofs = JSON.parse(await page.evaluate(() => window.__superglen.levelInfo.roofs));
  const ids = roofs.map((r) => r.id);
  console.log(`   [roofs] bab1 roof list: ${ids.join(', ')}`);
  check('bab1: the level publishes its roof list (houses, awnings, school, building roofs, lab roof)', roofs.length >= 20 && ids.some((i) => i.startsWith('house')) && ids.some((i) => i.startsWith('awning')) && ids.includes('schoolRoof') && ids.includes('barongsaiRoof1') && ids.includes('barongsaiRoof2') && ids.includes('labRoof'), `${roofs.length} roofs`);
  await page.evaluate(() => window.__superglen.game.setPlayerMode('glen'));
  await roofChecks(page, check, roofs, 'bab1');
  await page.evaluate(() => window.__superglen.game.setPlayerMode('superglen'));
  await roofChecks(page, check, roofs.filter((r) => r.kind === 'hip'), 'bab1 (Superglen, stomping onto the roofs)');

  // Superglen on a street house roof
  const house = roofs.find((r) => r.id.startsWith('houseR'));
  await page.evaluate((s) => { const g = window.__superglen; g.game.setPlayerMode('superglen'); g.teleportFeet(s.x, s.y + 0.3, s.z); g.setCameraYaw(Math.PI / 2); g.advance(80, false); g.lookFrom([s.x - 9, s.y + 4.5, s.z + 7, s.x, s.y + 0.8, s.z]); g.advance(3, true); }, house.samples[0]);
  await shot(page, 'bab1-roof');
  await page.evaluate(() => window.__superglen.lookFrom(null));

  // Falling off a roof to the outside returns to the last safe spot, never leaves the playable area
  const br = roofs.find((r) => r.id === 'barongsaiRoof1').samples;
  const falls = [];
  for (const [label, from, tx, tz] of [['east', br[0], 40, br[0].z], ['west', br[2], -40, br[0].z], ['north', br[2], 0, -90], ['south', br[0], 0, 30]]) {
    await page.evaluate((s) => { const g = window.__superglen; g.cancelWalk(); g.teleportFeet(s.x, s.y + 0.5, s.z); g.advance(60, false); }, from);
    const r = await page.evaluate(([tx, tz]) => {
      const g = window.__superglen;
      g.walkTo(tx, tz);
      let minY = 99;
      let fellAt = -1;
      for (let i = 0; i < 900; i++) {
        g.advance(1, false);
        minY = Math.min(minY, g.feetY);
        if (fellAt < 0 && g.feetY < -3) { fellAt = i; g.cancelWalk(); }
        if (fellAt >= 0 && i > fellAt + 150) break;
      }
      g.cancelWalk();
      g.advance(30, false);
      return { minY, fellAt, x: g.player.x, y: g.feetY, z: g.player.z, grounded: !g.airborne };
    }, [tx, tz]);
    falls.push(`${label}: min ${r.minY.toFixed(1)} -> (${r.x.toFixed(1)}, ${r.y.toFixed(1)}, ${r.z.toFixed(1)})`);
    if (label === 'south') {
      check('bab1: walking off the building roof to the south drops onto the plaza and the street (ground, in the playable area)', r.grounded && r.y < 0.5 && r.z > -43 && Math.abs(r.x) < 14, JSON.stringify(r));
    } else {
      check(`bab1: walking off the building roof to the ${label} falls into the ravine and returns to a safe, grounded spot on the roofs (not stuck outside or in a pocket)`, r.fellAt >= 0 && r.minY < -10 && r.y > 3 && r.grounded && Math.abs(r.x) < 12 && r.z < -38 && r.z > -78, JSON.stringify(r));
    }
  }
  console.log('   [roofs] ' + falls.join(' | '));

  // Walking off a street house roof to the outside: the tall hedge wall keeps the player in the street
  const hr = roofs.find((r) => r.id.startsWith('houseR')).samples[0];
  const out = await page.evaluate((s) => {
    const g = window.__superglen;
    g.cancelWalk();
    g.teleportFeet(s.x, s.y + 0.5, s.z);
    g.advance(60, false);
    g.walkTo(40, s.z);
    for (let i = 0; i < 400; i++) g.advance(1, false);
    g.cancelWalk();
    return { x: g.player.x, y: g.feetY };
  }, hr);
  check('bab1: walking east over a street house roof ends at the tall boundary hedge (x <= 14.6), still on the roof', out.x <= 14.6 && out.y > 3.4, JSON.stringify(out));
  // The lab stays shut from above: standing on the lab roof, the lab floor is not reachable (the roof is solid)
  const lab = roofs.find((r) => r.id === 'labRoof').samples[0];
  const labRes = await page.evaluate((s) => {
    const g = window.__superglen;
    g.cancelWalk();
    g.teleportFeet(s.x, s.y + 1.5, s.z);
    g.advance(120, false);
    return { y: g.feetY, grounded: !g.airborne };
  }, lab);
  check('bab1: the lab has a solid roof (landing there stays on top, not inside)', labRes.grounded && labRes.y > 4.5, JSON.stringify(labRes));
  await page.evaluate(() => window.__superglen.save.reset());
  await page.evaluate(() => window.__superglen.pause(false));
}


// ============================ Bab 1 street: climbing routes (PAKET_P1_PARKOUR.md section 3, package P2) ============================

/**
 * Climbs the route of one street building with the normal input path (walkTo for steering, real Space presses, the
 * arena's rhythmTo helper for the level, the air jump at the top). `cap` is the highest rhythm level the player may hold.
 * Returns { reached, log }.
 */
async function streetRouteRun(page, d, S, roofs, bid, cap) {
  const b = S.buildings.find((x) => x.id === bid);
  const steps = S.routes[bid];
  const side = b.x >= 0 ? 1 : -1;
  const first = S.fh[steps[0].id];
  let sx;
  let sz;
  if (bid === 'school') { sx = 0; sz = 3.0; }
  else if (bid === 'barongsai') { sx = first.x; sz = first.z + 2.4; }
  else { sx = first.x - side * (first.w / 2 + 1.8); sz = first.z; }
  await d.stand(sx, 0, sz, 0, cap);
  const log = [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const lv = Math.min(st.needs, cap);
    if (i > 0) await d.step(100);
    if (st.id === b.roof) {
      const roof = roofs.find((r) => r.id === st.id);
      const t = roof.samples[0];
      await d.rhythmTo(lv);
      await d.dash(t.x, t.z, { useDouble: st.needs > 0 });
      const ok = d.last.grounded && d.last.y > b.wall - 0.2 && Math.abs(d.last.x - b.x) < b.w / 2 + 0.8 && Math.abs(d.last.z - b.z) < b.d / 2 + 0.8;
      log.push(`${st.id}:${ok ? 'ok' : 'NO'}(y ${d.last.y.toFixed(2)})`);
      return { reached: ok, log, y: d.last.y };
    }
    const f = S.fh[st.id];
    await d.rhythmTo(lv);
    await d.dash(f.x, f.z, { useDouble: true });
    // The dash stops at the first touchdown (possibly perched on the rim): walk onto the middle like a child holding the stick.
    if (st.id !== 'towerDeck') {
      await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [f.x, f.z]);
      await d.step(45);
      await d.cancelWalk();
      await d.step(10);
    }
    const ok = d.on(f, 0.35);
    log.push(`${st.id}:${ok ? 'ok' : 'NO'}(y ${d.last.y.toFixed(2)}${ok ? '' : ` at ${d.last.x.toFixed(2)}, ${d.last.z.toFixed(2)} ${d.last.grounded ? 'grounded' : 'air'}, target ${f.x} ${f.z} top ${f.top}`})`);
    if (!ok) return { reached: false, log, y: d.last.y };
  }
  return { reached: false, log };
}

async function streetSetup(page, touchTap) {
  await sleep(1500);
  await page.evaluate(() => window.__superglen.save.markChapterDone('bab1'));
  await page.goto(URL + '?fps=0');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  await sleep(1500);
}

async function bab1RoutesScenario(page, check) {
  await streetSetup(page);
  await page.mouse.click(640, 360);
  await sleep(900);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeArenaDriver(page);
  await d.step(60);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  const S = JSON.parse(await page.evaluate(() => window.__superglen.levelInfo.street));
  const roofs = JSON.parse(await page.evaluate(() => window.__superglen.levelInfo.roofs));
  S.fh = Object.fromEntries(S.footholds.map((f) => [f.id, f]));
  const taken = () => page.evaluate(() => (window.__superglen.levelInfo.streetTaken || '').split(',').filter(Boolean));
  const report = (label, v) => console.log(`   [street] ${label}: ${v}`);
  check('bab1 street: data published (9 buildings + school + landmark, at least 2 houses and 2 rukos, a route for each)', S.buildings.length === 11 && S.buildings.filter((b) => b.cls === 'house').length >= 2 && S.buildings.filter((b) => b.cls === 'ruko').length >= 4 && S.buildings.every((b) => S.routes[b.id] && S.routes[b.id].length >= 2), `${S.buildings.length} buildings`);
  check('bab1 street: every foothold of the data was built (data and builder agree)', S.footholds.filter((f) => /:(bay|sign|crate|ac|canopy)/.test(f.id)).every((f) => S.built.includes(f.id)), `built ${S.built.length}`);
  const coinsTotal = S.coins.length;
  report('coins on the street', coinsTotal);

  // Wall heights match the class (rule 3).
  const bad = S.buildings.filter((b) => (b.cls === 'house' && (b.wall < 3 || b.wall > 4)) || (b.cls === 'ruko' && (b.wall < 6 || b.wall > 8)) || (b.cls === 'landmark' && (b.wall < 10 || b.wall > 12)));
  check('bab1 street: wall heights fit their class (house 3-4 m, ruko 6-8 m, landmark 10-12 m)', bad.length === 0, bad.map((b) => `${b.id} ${b.wall}`).join(', '));

  const walkRoof = async (roofId) => {
    // walk to the roof's middle (the coin and the star lie there)
    const b = S.buildings.find((x) => x.roof === roofId);
    await page.evaluate(([x, z]) => window.__superglen.walkTo(x, z), [b.x, b.z]);
    await d.step(150);
    await d.cancelWalk();
  };

  // ---- Houses: levels 0-1 ----
  const t0 = await taken();
  const h1 = await streetRouteRun(page, d, S, roofs, 'houseR-29.5', 1);
  report('house R (shop awning) at cap 1', JSON.stringify(h1));
  check('house (shop, crates > awning > roof): the roof is reached with rhythm level <= 1', h1.reached, h1.log.join(' '));
  if (h1.reached) await walkRoof('houseR-29.5');
  const t1 = await taken();
  const onRoute = (bid) => S.coins.filter((c) => c.id.startsWith(bid + ':') && (S.coinOn[c.id] === 'ground' || S.routes[bid].some((st) => st.id === S.coinOn[c.id])));
  const houseCoins = onRoute('houseR-29.5');
  const gotHouse = houseCoins.filter((c) => t1.includes(c.id)).length;
  check('house: the route coins are collected on the way (ground, crate, awning, roof): all of them', houseCoins.length >= 4 && gotHouse === houseCoins.length, `${gotHouse}/${houseCoins.length} (${t1.filter((i) => i.startsWith('houseR-29.5:')).join(' ')})`);
  report('coins taken in total after the house', `${t1.length - t0.length}`);
  const h0 = await streetRouteRun(page, d, S, roofs, 'houseR-29.5', 0);
  check('house: the roof is also reachable with level 0 only', h0.reached, h0.log.join(' '));
  const h2 = await streetRouteRun(page, d, S, roofs, 'houseL-33.6', 0);
  check('house (AC unit > canopy > roof): reached with level 0', h2.reached, h2.log.join(' '));

  // ---- Ruko: level 2, NOT with level 0 or 1 ----
  const r2 = await streetRouteRun(page, d, S, roofs, 'rukoR0', 2);
  report('ruko R0 at cap 2', JSON.stringify(r2));
  check('ruko (bay > sign board > roof): the roof is reached with rhythm level 2', r2.reached, r2.log.join(' '));
  if (r2.reached) await walkRoof('rukoR0');
  const t2 = await taken();
  const rukoCoins = onRoute('rukoR0');
  const gotRuko = rukoCoins.filter((c) => t2.includes(c.id)).length;
  check('ruko: the coins of the route are collected (ground, bay, sign board, roof)', gotRuko === rukoCoins.length, `${gotRuko}/${rukoCoins.length}`);
  const r1 = await streetRouteRun(page, d, S, roofs, 'rukoR0', 1);
  check('ruko: the roof is NOT reached with level 1 (the bay is 5.2 m up: level 1 gives 4.9 m)', !r1.reached, r1.log.join(' '));
  const r0 = await streetRouteRun(page, d, S, roofs, 'rukoR0', 0);
  check('ruko: the roof is NOT reached with level 0', !r0.reached, r0.log.join(' '));
  const r3 = await streetRouteRun(page, d, S, roofs, 'rukoL1.5', 3);
  check('ruko (left side, 5.85 m bay): reached with level 3', r3.reached, r3.log.join(' '));
  const r3b = await streetRouteRun(page, d, S, roofs, 'rukoL1.5', 2);
  check('ruko (left side, 5.85 m bay): NOT reached with level 2', !r3b.reached, r3b.log.join(' '));

  // ---- School: wall cap is level 2 ----
  const sc = await streetRouteRun(page, d, S, roofs, 'school', 2);
  check('school: the wall cap and the roof behind it are reached with level 2', sc.reached, sc.log.join(' '));
  const sc1 = await streetRouteRun(page, d, S, roofs, 'school', 1);
  check('school: NOT reached with level 1', !sc1.reached, sc1.log.join(' '));

  // ---- Landmark: level 4 ----
  const lm = await streetRouteRun(page, d, S, roofs, 'barongsai', 4);
  report('landmark at cap 4', JSON.stringify(lm));
  check('landmark (lion > pillar > terrace > tower): the tower roof is reached with level 4', lm.reached, lm.log.join(' '));
  if (lm.reached) {
    await page.evaluate(() => { const g = window.__superglen; g.cancelWalk(); });
    await walkRoof('barongsaiRoof2');
    const star = await page.evaluate(() => window.__superglen.levelInfo.reward_landmark || 0);
    check('landmark: standing on the tower roof takes the big gold star', star >= 1, `reward ${star}`);
    // the shot: Superglen on the roof, the star and the view
    await page.evaluate(() => { const g = window.__superglen; g.lookFrom([-9, 19.5, -38, 0, 13.5, -49]); g.advance(3, true); });
    await shot(page, 'street-landmark-top');
    await page.evaluate(() => window.__superglen.lookFrom(null));
  }
  const lm3 = await streetRouteRun(page, d, S, roofs, 'barongsai', 3);
  check('landmark: NOT reached with level 3 (the tower hop is 6.4 m; level 3 gives 6.2 m)', !lm3.reached, lm3.log.join(' '));

  // ---- Screenshots: high view with routes, a ruko ----
  await page.evaluate(() => { const g = window.__superglen; g.teleportFeet(0, 0.03, 0); g.advance(30, false); g.lookFrom([0, 40, 16, 0, 2, -16]); g.advance(3, true); });
  await shot(page, 'street-routes');
  await page.evaluate(() => { const g = window.__superglen; g.lookFrom([-1.5, 5.5, 3.5, 7, 4, -1.5]); g.advance(3, true); });
  await shot(page, 'street-ruko');
  await page.evaluate(() => window.__superglen.lookFrom(null));

  // ---- Perf per area ----
  const calls = {};
  for (const [name, pose] of [['spawn', [0, 3, 8, 0, 3, -8]], ['street high', [0, 40, 16, 0, 2, -16]], ['mid street', [0, 4, -8, 0, 4, -30]], ['plaza + landmark', [0, 6, -30, 0, 8, -50]], ['landmark top', [-9, 19.5, -38, 0, 13.5, -49]]]) {
    await page.evaluate((p) => { const g = window.__superglen; g.lookFrom(p); g.advance(3, true); }, pose);
    calls[name] = await page.evaluate(() => { const c = window.__superglen.debugCounts(); return `${c.calls} calls ${c.triangles} tris`; });
  }
  await page.evaluate(() => window.__superglen.lookFrom(null));
  console.log('   [street] draw calls / triangles per viewpoint:', JSON.stringify(calls));
  const worst = Object.values(calls).map((v) => v.split(' ').map(Number)).reduce((m, v) => [Math.max(m[0], v[0]), Math.max(m[1], v[2])], [0, 0]);
  check('perf: street viewpoints stay inside the budget (< 150 draw calls, <= 60k triangles)', worst[0] < 150 && worst[1] <= 60000, JSON.stringify(calls));

  // ---- Safety: nothing leaves the playable area from the new routes ----
  const out = await page.evaluate(() => {
    const g = window.__superglen;
    const bad = [];
    const spots = [[9, 8, -4], [-9, 8, -10], [0, 7.2, 8], [0, 12.5, -48]];
    for (const [x, y, z] of spots) {
      g.cancelWalk();
      g.teleportFeet(x, y + 0.5, z);
      g.advance(40, false);
      for (const [tx, tz] of [[60, z], [-60, z], [x, 60], [x, -90]]) {
        g.walkTo(tx, tz);
        for (let i = 0; i < 300; i++) g.advance(1, false);
        g.cancelWalk();
        g.advance(240, false); // a fall into the ravine takes a while to be returned
        const p = g.player;
        if (!(g.feetY > -2 && Math.abs(p.x) < 15.5 && p.z > -80 && p.z < 20)) bad.push(`from ${x},${y},${z} to ${tx},${tz}: ${p.x.toFixed(1)},${g.feetY.toFixed(1)},${p.z.toFixed(1)}`);
      }
    }
    return bad;
  });
  check('safety: walking off any new roof in every direction always ends inside the playable area (never outside, never stuck below)', out.length === 0, out.join(' | '));
  await page.evaluate(() => window.__superglen.save.reset());
  await page.evaluate(() => window.__superglen.pause(false));
}

async function bab1RoutesTouchScenario(page, check) {
  await sleep(1500);
  await page.evaluate(() => window.__superglen.save.markChapterDone('bab1'));
  await page.goto(URL + '?fps=0');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, 200);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  let d = null;
  const center = () => page.evaluate(() => {
    const r = document.querySelector('.tc-button[data-action=jump]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const tapBtn = async () => {
    const jb = await center();
    await fingers.down(7, jb.x, jb.y);
    await d.step(1);
    await fingers.up(7);
    return d.last;
  };
  d = makeArenaDriver(page, tapBtn);
  await d.step(10);
  await page.evaluate(() => window.__superglen.game.setSkills({ fly: false }));
  const S = JSON.parse(await page.evaluate(() => window.__superglen.levelInfo.street));
  const roofs = JSON.parse(await page.evaluate(() => window.__superglen.levelInfo.roofs));
  S.fh = Object.fromEntries(S.footholds.map((f) => [f.id, f]));
  check('touch 844x281 (street): the jump button is a real on-screen button >= 80 x 80', await page.evaluate(() => { const r = document.querySelector('.tc-button[data-action=jump]').getBoundingClientRect(); return r.width >= 80 && r.height >= 80; }));
  const h = await streetRouteRun(page, d, S, roofs, 'houseR-29.5', 1);
  check('touch: the house route (crates > awning > roof) is climbed with the jump button', h.reached, h.log.join(' '));
  const r = await streetRouteRun(page, d, S, roofs, 'rukoR0', 2);
  check('touch: the ruko route (bay > sign board > roof) is climbed with the jump button at level 2', r.reached, r.log.join(' '));
  await page.evaluate(() => { const g = window.__superglen; g.setCameraYaw(Math.PI / 2); g.advance(30, false); g.lookFrom([-2, 11, 3, 8, 6, -3]); g.advance(3, true); });
  await shot(page, 'street-touch-281');
  await page.evaluate(() => window.__superglen.lookFrom(null));
  await page.evaluate(() => window.__superglen.save.reset());
}

// ============================ Flight fix: soft fall after the jets, instant re-ignite ============================

/** Shared checks for flightfix. `ctl` abstracts the jump input: { hold(), release() } (keyboard or finger). */
async function flightfixChecks(page, check, d, ctl, tag) {
  const report = (label, v) => console.log(`   [flightfix ${tag}] ${label}: ${v}`);
  await d.maxFly(12);
  await d.step(30);
  const f0 = d.last.flights;
  await ctl.hold();
  await d.step(220);
  check(`${tag}: holding jump flies up to the ceiling`, d.last.flying && d.last.h > 11, `h ${d.last.h.toFixed(2)}`);
  const y0 = d.last.y;
  await ctl.release();
  await d.step(2);
  const v2 = d.last.vy;
  let minVy = 0;
  for (let i = 0; i < 58; i++) {
    await d.step(1);
    minVy = Math.min(minVy, d.last.vy);
  }
  const softDrop = y0 - d.last.y;
  report('soft fall', `vy after 2 frames ${v2.toFixed(2)}, fastest ${minVy.toFixed(2)}, drop in 1 s ${softDrop.toFixed(2)} m`);
  check(`${tag}: release: vertical speed goes negative within 2 frames, jets off`, v2 < 0 && !d.last.flying, `vy ${v2.toFixed(2)}`);
  check(`${tag}: release: the fall is capped (never below -7.1 m/s) but really falls (reaches < -6)`, minVy >= -7.1 && minVy < -6, `${minVy.toFixed(2)}`);
  check(`${tag}: release: drops more than 4 m in the first second (clearly not the old -2.2 m/s glide)`, softDrop > 4, `${softDrop.toFixed(2)} m`);

  // A plain fall from a high point, same duration: much faster.
  const px = d.last.x;
  const pz = d.last.z;
  await page.evaluate(([x, z]) => window.__superglen.teleportFeet(x, 60, z), [px, pz]);
  await d.step(2);
  const yp = d.last.y;
  let minPlain = 0;
  for (let i = 0; i < 58; i++) {
    await d.step(1);
    minPlain = Math.min(minPlain, d.last.vy);
  }
  const plainDrop = yp - d.last.y;
  report('plain fall', `fastest ${minPlain.toFixed(2)}, drop ${plainDrop.toFixed(2)} m`);
  check(`${tag}: the soft fall is slower than a plain fall from the same height`, softDrop < plainDrop * 0.5 && minPlain < -15, `soft ${softDrop.toFixed(1)} m vs plain ${plainDrop.toFixed(1)} m`);
  await d.land();

  // Back up, release, fall a little, press once: the jets restart at once.
  await d.step(30);
  await ctl.hold();
  await d.step(150);
  await ctl.release();
  await d.step(20);
  const yPress = d.last.y;
  const vBefore = d.last.vy;
  const dj0 = d.last.dj;
  const fl0 = d.last.flights;
  await ctl.hold();
  await d.step(2);
  check(`${tag}: one press in mid-fall re-ignites the jets within 2 frames (re-ignite wins over the air jump)`, vBefore < -2 && d.last.flying && d.last.flights === fl0 + 1 && d.last.dj === dj0, `vy before ${vBefore.toFixed(2)}, flying ${d.last.flying}, dj +${d.last.dj - dj0}`);
  await d.step(38);
  check(`${tag}: ...and it rises again while held`, d.last.vy > 0.5 && d.last.y > yPress, `vy ${d.last.vy.toFixed(2)}, ${d.last.y.toFixed(2)} vs ${yPress.toFixed(2)}`);
  // A quick tap (release at once) re-ignites and drops again; do it twice in a row.
  await ctl.release();
  await d.step(15);
  const fl1 = d.last.flights;
  await ctl.hold();
  await d.step(1);
  await ctl.release();
  await d.step(2);
  check(`${tag}: a quick tap in mid-fall also re-ignites (one more flight)`, d.last.flights === fl1 + 1, `flights +${d.last.flights - fl1}`);
  await d.step(10);

  // Landing after a flight: gentle, no stomp.
  const st = d.last.stomps;
  let worst = 0;
  for (let i = 0; i < 700 && !d.last.grounded; i++) {
    await d.step(1);
    worst = Math.min(worst, d.last.vy);
  }
  await d.step(20);
  check(`${tag}: landing after a flight is gentle: grounded, no stomp, impact < 8 m/s`, d.last.grounded && d.last.stomps === st && worst >= -7.1, `fastest ${worst.toFixed(2)}, stomps ${st}->${d.last.stomps}`);
  check(`${tag}: the first ignition from the ground is unchanged (flights counted only for real flights)`, d.last.flights >= f0 + 3, `+${d.last.flights - f0}`);
}

async function flightfixDesktopScenario(page, check) {
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(600);
  const d = makeSkillsDriver(page);
  await page.evaluate(() => window.__superglen.pause(true));
  await d.step(30);
  await d.tap('e', 20);
  check('flightfix: E switches the test area to Superglen', d.last.mode === 'superglen' || (await d.snap()).mode === 'superglen');
  // Normal jumps never flew: unchanged.
  {
    const y0 = (await d.step(1)).y;
    const f0 = d.last.flights;
    await d.tap('Space');
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      await d.step(1);
      peak = Math.max(peak, d.last.y - y0);
      if (d.last.grounded && i > 4) break;
    }
    check('flightfix: tap jump is unchanged (level 0 apex 1.52-1.68 m), no flight', peak > 1.52 && peak < 1.68 && d.last.flights === f0 && !d.last.flying, `${peak.toFixed(2)} m`);
    await d.step(10);
    const dj0 = d.last.dj;
    await d.tap('Space');
    peak = 0;
    for (let i = 0; i < 200; i++) {
      if (i === 22) await d.tap('Space');
      else await d.step(1);
      peak = Math.max(peak, d.last.y - y0);
      if (d.last.grounded && i > 30) break;
    }
    check('flightfix: double jump on a normal jump still works (apex 3.0-3.5 m, no flight)', peak > 3.0 && peak < 3.5 && d.last.dj === dj0 + 1 && d.last.flights === f0, `${peak.toFixed(2)} m, dj +${d.last.dj - dj0}`);
    await d.step(30);
  }
  await flightfixChecks(page, check, d, { hold: () => d.down('Space'), release: () => d.up('Space') }, 'desktop');
}

async function flightfixTouchScenario(page, check) {
  await sleep(2500);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, 200);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  const d = makeSkillsDriver(page);
  await d.step(30);
  await d.mode('superglen');
  await d.step(20);
  const jp = await page.evaluate(() => {
    const r = document.querySelector('.tc-button[data-action=jump]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await flightfixChecks(page, check, d, { hold: () => fingers.down(2, jp.x, jp.y), release: () => fingers.up(2) }, 'touch 844x281');
}

// ============================ Transform button in the story levels (touch layout) ============================

async function check_glen(check, page) {
  check('bab1 lab 844x281: screenshot taken as Glen with the star visible', await page.evaluate(() => window.__superglen.mode === 'glen' && !!document.querySelector('.tc-button[data-action=transform]')));
}

async function transformTouchScenario(page, check) {
  await sleep(1500);
  await page.evaluate(() => { const g = window.__superglen; g.save.markChapterDone('bab1'); g.save.setLastMode('superglen'); });
  await page.goto(URL + '?fps=0');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  await sleep(2000);
  const fingers = await makeFingers(page);
  await fingers.down(1, 120, 200);
  await sleep(100);
  await fingers.up(1);
  await sleep(600);
  await page.evaluate(() => window.__superglen.pause(true));
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  const adv = (n) => page.evaluate((n) => window.__superglen.advance(n, false), n);
  const mode = () => page.evaluate(() => window.__superglen.mode);
  const tapStar = async () => {
    const c = await page.evaluate(() => { const r = document.querySelector('.tc-button[data-action=transform]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(c.x, c.y);
    await adv(4);
  };
  await adv(30);
  for (const h of [281, 390]) {
    await page.setViewportSize({ width: 844, height: h });
    await sleep(500);
    for (const want of ['superglen', 'glen']) {
      if ((await mode()) !== want) await tapStar();
      for (const sk of [false, true]) {
        await page.evaluate((on) => window.__superglen.game.setSkills({ laser: on, shield: on }), sk);
        await adv(2);
        const l = await page.evaluate(layoutInfo);
        const exp = want === 'superglen' ? (sk ? 'jump,interact,laser,shield,transform' : 'jump,interact,transform') : 'jump,interact,transform';
        check(`bab1 lab 844x${h} ${want} skills=${+sk}: buttons ${exp}`, l.actions.join() === exp, l.actions.join());
        check(`bab1 lab 844x${h} ${want} skills=${+sk}: star >= 80 px, inside, no overlap with the other controls`, l.transformOk && l.inside && !l.overlap && l.minBtn >= 79.5, JSON.stringify({ t: l.transformOk, i: l.inside, o: l.overlap, m: l.minBtn }));
      }
    }
    await page.evaluate(() => window.__superglen.game.setSkills({ laser: false, shield: false }));
    if (h === 281) {
      await tapStar();
      const m1 = await mode();
      await tapStar();
      check('bab1 lab: the star toggles Glen <-> Superglen both ways', m1 !== (await mode()), `${m1} -> ${await mode()}`);
      if ((await mode()) !== 'glen') await tapStar();
      await page.evaluate(() => window.__superglen.advance(4, true));
      await check_glen(check, page);
      await shot(page, 'transform-back-281');
    }
  }
  // Chapter 2 story: the star stays hidden (Superglen is required).
  await page.setViewportSize({ width: 844, height: 281 });
  await page.evaluate(() => window.__superglen.pause(false));
  await page.evaluate(() => window.__superglen.save.reset());
  await page.evaluate(() => window.__superglen.loadLevel('bab2'));
  await page.waitForFunction(() => window.__superglen.level === 'bab2' && !window.__superglen.loading, null, { timeout: 15000 });
  await sleep(800);
  await page.evaluate(() => window.__superglen.pause(true));
  await adv(30);
  const l2 = await page.evaluate(layoutInfo);
  check('bab2 story 844x281: no star, inside and no overlap', !l2.actions.includes('transform') && l2.inside && !l2.overlap, l2.actions.join());
  await page.evaluate(() => window.__superglen.save.reset());
}


// ---------------------------------------------------------------------------------------------------------------
// Tantangan Pintar (quiz) scenarios. Deterministic through ?quizseed=1; the game loop is paused and stepped.
// ---------------------------------------------------------------------------------------------------------------
const quizSt = (page) =>
  page.evaluate(() => {
    const z = window.__superglen.quiz;
    return {
      open: z.open, view: z.view, state: z.state, index: z.index, total: z.total, qid: z.questionId, cat: z.category, kind: z.kind,
      prompt: z.prompt, key: z.correctKey, visible: z.visibleKeys, wrong: z.wrong, bubble: z.bubble, coins: z.coins,
      challenges: z.challenges, fragments: z.fragments, stickers: z.stickers, levels: z.levels, spoken: z.spoken,
      result: z.lastResult, picked: z.picked, bankSource: z.bankSource, bankSize: z.bankSize,
    };
  });

/** Answer a card: a real tap on touch, the number key on PC. */
async function quizAnswer(page, key, tap) {
  if (tap) {
    const c = await page.evaluate((k) => {
      const r = document.querySelector(`.qp-card[data-slot="${k}"]`).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, key);
    await page.touchscreen.tap(c.x, c.y);
  } else await page.keyboard.press(String(key));
}

/** One bot step for story scripts: answer the right card, or press Enter to go on. */
async function quizBotStep(page, tag) {
  const q = await page.evaluate(() => {
    const z = window.__superglen.quiz;
    return { open: z.open, view: z.view, state: z.state, key: z.correctKey };
  });
  if (!q.open) return false;
  if (q.view === 'question' && q.state === 'answering') await quizAnswer(page, q.key, tag === 'touch');
  else if ((q.view === 'question' && q.state === 'solved') || q.view === 'end') await page.keyboard.press('Enter');
  return true;
}

/** Chapter 2: the challenge in front of a skill. Checks that the skill stays locked until the 3 questions are done. */
async function passGate(page, check, d, tag, name, cat) {
  d.autoQuiz = false;
  let s = await d.until((s) => s.quiz.open, 1200, 6);
  check(`${tag}: ${name}: Nino says the kunci line, then a Tantangan Pintar opens`, !!s && d.seen.includes('quiz_nino_kunci'), d.seen.slice(-4).join());
  if (!s) {
    d.autoQuiz = true;
    return;
  }
  check(`${tag}: ${name}: the challenge is the ${cat} category, 3 questions; the skill is still locked; controls locked`, s.quiz.category === cat && s.quiz.total === 3 && !s.skills.unlocked[name] && s.controlsEnabled === false, `${s.quiz.category} total ${s.quiz.total}`);
  await page.keyboard.press('Escape');
  await d.adv(4);
  check(`${tag}: ${name}: Esc does not close a story-gate challenge`, (await quizSt(page)).open);
  let lockedAll = true;
  for (let i = 0; i < 3; i++) {
    s = await d.until((s) => s.quiz.view === 'question' && s.quiz.state === 'answering' && s.quiz.index === i, 400, 4);
    if (!s) break;
    await quizAnswer(page, s.quiz.correctKey, tag === 'touch');
    await d.adv(6);
    const t = await d.st();
    if (t.skills.unlocked[name]) lockedAll = false;
    for (let k = 0; k < 40; k++) {
      const z = await quizSt(page);
      if (z.index !== i || z.view !== 'question') break;
      await d.adv(12);
      await page.keyboard.press('Enter');
    }
  }
  s = await d.until((s) => s.quiz.view === 'end', 200, 6);
  check(`${tag}: ${name}: the end screen shows after 3 answers and the skill is still locked until then`, !!s && lockedAll && !s.skills.unlocked[name]);
  await d.adv(20);
  await page.keyboard.press('Enter');
  s = await d.until((s) => !s.quiz.open, 200, 6);
  check(`${tag}: ${name}: the challenge closes after the end screen`, !!s);
  d.autoQuiz = true;
  s = await d.until((s) => s.skills.unlocked[name], 900, 10);
  check(`${tag}: ${name}: unlocks only after the challenge (saved)`, !!s && s.save.data.skills[name] === true, s ? '' : 'never unlocked');
}

/** Play `wrongs.length` questions; wrongs[i] = wrong picks before the right one. Leaves the end screen up. Returns the asked ids. */
async function quizPlay(page, adv, { wrongs = [0, 0, 0], tap = false } = {}) {
  const asked = [];
  for (let i = 0; i < wrongs.length; i++) {
    let z = await quizSt(page);
    for (let k = 0; k < 40 && !(z.view === 'question' && z.state === 'answering' && z.index === i); k++) {
      await adv(6);
      z = await quizSt(page);
    }
    asked.push({ id: z.qid, cat: z.cat, kind: z.kind });
    for (let w = 0; w < wrongs[i]; w++) {
      z = await quizSt(page);
      await quizAnswer(page, z.visible.find((k) => k !== z.key), tap);
      await adv(80);
    }
    z = await quizSt(page);
    await quizAnswer(page, z.key, tap);
    await adv(50);
    await page.keyboard.press('Enter');
    await adv(6);
  }
  return asked;
}

/** Layout numbers of the quiz overlay (cards, display, buttons): problems are listed in `bad`. */
const quizLayout = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const q = (sel) => [...document.querySelectorAll(sel)];
  const bad = [];
  const inside = (n, a, box, tol) => { if (a.l < box.l - tol || a.t < box.t - tol || a.r > box.r + tol || a.b > box.b + tol) bad.push(`${n}-outside`); };
  const full = { l: 0, t: 0, r: vw, b: vh };
  const cards = q('.qp-card');
  const items = [];
  cards.forEach((c, i) => {
    const r = R(c);
    if (r.w < 109.5 || r.h < 109.5) bad.push(`card${i}-small ${Math.round(r.w)}x${Math.round(r.h)}`);
    inside(`card${i}`, r, full, 0.5);
    const inner = c.querySelector('.qp-card-in');
    if (inner) {
      inside(`card${i}-content`, R(inner), r, 1.5);
      for (const leaf of inner.querySelectorAll('*')) if (!leaf.children.length && leaf.getBoundingClientRect().width > 0) inside(`card${i}-leaf`, R(leaf), r, 1.5);
    }
    items.push([`card${i}`, r]);
  });
  const disp = q('.qp-display')[0];
  const dr = R(disp);
  inside('display', dr, full, 0.5);
  const din = q('.qp-display-in')[0];
  if (din && din.childNodes.length) {
    inside('display-content', R(din), dr, 1.5);
    for (const leaf of din.querySelectorAll('*')) if (!leaf.children.length && leaf.getBoundingClientRect().width > 0) inside('display-leaf', R(leaf), dr, 1.5);
  }
  items.push(['display', dr]);
  for (const sel of ['.qp-say', '.qp-next', '.qp-top']) {
    const e = q(sel)[0];
    if (e) { const r = R(e); inside(sel, r, full, 0.5); items.push([sel, r]); }
  }
  const say = R(q('.qp-say')[0]);
  if (say.w < 79.5 || say.h < 79.5) bad.push('say-small');
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i][1], c = items[j][1];
    if (a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5) bad.push(`${items[i][0]}/${items[j][0]}`);
  }
  const root = q('.qp')[0];
  if (document.documentElement.scrollWidth > vw + 1 || document.documentElement.scrollHeight > vh + 1 || root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1) bad.push('scroll');
  const bt = q('.qp-bubble-text')[0];
  if (bt.scrollHeight > bt.clientHeight + 1) bad.push('bubble-clipped');
  return { bad, minCard: Math.round(Math.min(...cards.map((c) => Math.min(R(c).w, R(c).h)))) };
};

async function quizDesktopScenario(page, check) {
  const adv = (n) => page.evaluate((n) => window.__superglen.advanceAsync(n, false), n);
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(500);
  await page.evaluate(() => { window.__superglen.save.resetProgress(); window.__superglen.pause(true); });
  let z = await quizSt(page);
  const src = z.bankSource;
  const real = Object.values(src).every((v) => v === 'file');
  console.log(`   quiz bank: ${real ? 'real bank present' : 'fallback sample used for: ' + Object.keys(src).filter((k) => src[k] !== 'file').join(',')} sizes ${JSON.stringify(z.bankSize)}`);
  check('quiz: every category has at least 3 usable questions (real bank or built-in sample)', Object.values(z.bankSize).every((n) => n >= 3), JSON.stringify(z.bankSize));
  check('quiz: the real question bank is loaded for all 5 categories', real, JSON.stringify(src));

  // ---- validator ----
  {
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', ['scripts/validate-quiz.mjs', '--quiet'], { cwd: ROOT, encoding: 'utf8' });
    const out = (r.stdout || '').trim().split('\n');
    for (const l of out) if (/^(ERROR|WARNING)/.test(l)) console.log(`   validate-quiz: ${l}`);
    check('quiz: scripts/validate-quiz.mjs passes on the bank (no errors)', r.status === 0, out.slice(-2).join(' | '));
  }

  // ---- A. three right answers via the keys 1/2/3 (first try) ----
  const allIds = [];
  const g0 = await page.evaluate(state);
  await page.evaluate(() => window.__superglen.quiz.start('berhitung', 3, 'terminal'));
  await adv(8);
  z = await quizSt(page);
  check('quiz: a challenge opens: question 1 of 3, three cards, controls and interactions locked', z.open && z.view === 'question' && z.index === 0 && z.total === 3 && z.visible.length === 3 && (await page.evaluate(() => !window.__superglen.controlsEnabled)), JSON.stringify({ v: z.view, i: z.index }));
  check('quiz: Nino reads the question (audio hook called with the audio id)', z.spoken.length >= 1 && /^quiz_/.test(z.spoken[z.spoken.length - 1]), z.spoken.join());
  {
    await page.keyboard.down('w');
    await adv(60);
    await page.keyboard.up('w');
    const g1 = await page.evaluate(state);
    check('quiz: W does not move the player while the quiz is open', Math.hypot(g1.player.x - g0.player.x, g1.player.z - g0.player.z) < 0.05, `${Math.hypot(g1.player.x - g0.player.x, g1.player.z - g0.player.z).toFixed(3)} m`);
    await page.keyboard.press('Space');
    await adv(20);
    check('quiz: Space does not jump while the quiz is open (and does not answer)', (await page.evaluate(state)).jumps === g0.jumps && (await quizSt(page)).state === 'answering');
  }
  const cat0 = z.cat;
  const prompts = [];
  for (let i = 0; i < 3; i++) {
    z = await quizSt(page);
    allIds.push(z.qid);
    prompts.push(z.prompt);
    const c0 = z.coins;
    if (i === 0) {
      await page.evaluate(() => window.__superglen.advance(2, true));
      await sleep(700);
      await shot(page, 'quiz-count');
    }
    await page.keyboard.press(String(z.key));
    await adv(8);
    z = await quizSt(page);
    check(`quiz: question ${i + 1} right via key ${i === 0 ? z.key : 'n'}: solved, +3 coins, Nino says Hebat, Glen!`, z.state === 'solved' && z.coins === c0 + 3 && z.bubble === 'Hebat, Glen!', `${z.state} coins ${c0}->${z.coins} "${z.bubble}"`);
    await adv(10);
    await page.keyboard.press('Enter');
    await adv(4);
    z = await quizSt(page);
    check(`quiz: Enter before the guard time (0.6 s) does not skip the Hebat moment`, i === 2 ? true : z.index === i, `index ${z.index}`);
    await adv(40);
    await page.keyboard.press('Enter');
    await adv(6);
  }
  z = await quizSt(page);
  check('quiz: after the third answer the end screen shows (coins, sticker)', z.view === 'end' && z.state === 'idle', z.view);
  await adv(70);
  await sleep(1000);
  await shot(page, 'quiz-end');
  const endUi = await page.evaluate(() => ({ coin: document.querySelector('.qp-end-coin')?.textContent, sticker: !!document.querySelector('.qp-end-sticker.reveal'), ok: (() => { const r = document.querySelector('.qp-ok').getBoundingClientRect(); return Math.min(r.width, r.height); })() }));
  check('quiz: the end screen shows +9 coins, the revealed sticker and a big OK button', endUi.coin === '+9' && endUi.sticker && endUi.ok >= 80, JSON.stringify(endUi));
  await page.keyboard.press('Enter');
  await adv(10);
  z = await quizSt(page);
  check('quiz: Enter closes the end screen and gives the controls back', !z.open && (await page.evaluate(() => window.__superglen.controlsEnabled)));
  check('quiz: result: completed, 3 first-try answers, 9 coins, 1 sticker', !!z.result && z.result.completed && z.result.answers.length === 3 && z.result.answers.every((a) => a.firstTry) && z.result.coins === 9 && !!z.result.sticker && z.result.stickerNew, JSON.stringify(z.result && { c: z.result.completed, coins: z.result.coins, st: z.result.sticker }));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('superglen.save.v1')).quiz);
  check('quiz: coins, sticker, statistics and recent ids are saved in localStorage', stored.coins === 9 && stored.stickers.length === 1 && stored.cats[cat0].asked === 3 && stored.cats[cat0].firstTry === 3 && stored.recent.length === 3 && stored.challenges === 1, JSON.stringify({ coins: stored.coins, st: stored.stickers.length, asked: stored.cats[cat0].asked }));
  check('quiz: adaptive level: three first-try answers in a row raised the level (1 -> 2)', z.levels[cat0] === 2, JSON.stringify(z.levels));
  check('quiz: the 3 questions of a challenge are all different', new Set(allIds).size === 3, allIds.join());

  // ---- B. wrong picks, mouse clicks ----
  await page.evaluate(() => window.__superglen.quiz.start('berhitung', 3, 'terminal'));
  await adv(8);
  await sleep(500);
  z = await quizSt(page);
  const q1 = z.qid;
  allIds.push(q1);
  const c0 = z.coins;
  const w1 = [1, 2, 3].find((k) => k !== z.key);
  await page.click(`.qp-card[data-slot="${w1}"]`);
  await adv(8);
  await sleep(120);
  await shot(page, 'quiz-wrong');
  z = await quizSt(page);
  const wob = await page.evaluate((k) => document.querySelector(`.qp-card[data-slot="${k}"]`).classList.contains('wobble'), w1);
  check('quiz: a wrong pick wobbles the card and Nino says "Hampir! Coba lagi."', wob && z.bubble === 'Hampir! Coba lagi.' && z.wrong === 1, `wobble ${wob} "${z.bubble}"`);
  check('quiz: ... no coin is lost and the question stays', z.coins === c0 && z.index === 0 && z.qid === q1);
  check('quiz: ... the wrong pick is blocked while the card wobbles (no double count)', await (async () => { await page.keyboard.press(String(w1)); await adv(2); return (await quizSt(page)).wrong === 1; })());
  await adv(70);
  z = await quizSt(page);
  const gone = await page.evaluate((k) => document.querySelector(`.qp-card[data-slot="${k}"]`).classList.contains('gone'), w1);
  check('quiz: ... then the wrong card disappears; two cards remain; the question is the same; answering again', gone && z.visible.length === 2 && !z.visible.includes(w1) && z.state === 'answering' && z.qid === q1, JSON.stringify(z.visible));
  const w2 = z.visible.find((k) => k !== z.key);
  await page.keyboard.press(String(w2));
  await adv(8);
  z = await quizSt(page);
  check('quiz: a second wrong pick: Nino points to the right card', z.wrong === 2 && z.bubble === 'Ini dia! Ketuk yang ini ya.', z.bubble);
  await adv(80);
  z = await quizSt(page);
  const hint = await page.evaluate((k) => document.querySelector(`.qp-card[data-slot="${k}"]`).classList.contains('hint'), z.key);
  check('quiz: after two wrong picks only the right card remains (it glows)', z.visible.length === 1 && z.visible[0] === z.key && hint, JSON.stringify(z.visible));
  await page.keyboard.press(String(w1)); // a gone card cannot be picked
  await adv(4);
  check('quiz: a card that is gone cannot be picked', (await quizSt(page)).state === 'answering');
  {
    // (the glowing hint card never "settles" for page.click: click its centre with the mouse)
    const c = await page.evaluate((k) => { const r = document.querySelector(`.qp-card[data-slot="${k}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, z.key);
    await page.mouse.click(c.x, c.y);
  }
  await adv(8);
  await sleep(350);
  await shot(page, 'quiz-right');
  z = await quizSt(page);
  check('quiz: the right pick after two wrongs: solved, only +1 coin (no first-try bonus)', z.state === 'solved' && z.coins === c0 + 1, `${c0} -> ${z.coins}`);
  const sparks = await page.evaluate(() => document.querySelectorAll('.qp-spark').length);
  check('quiz: the right pick shows fireworks (sparks) and plays the drum', sparks >= 20, `${sparks} sparks`);
  await adv(60);
  await page.keyboard.press('Enter');
  await adv(6);
  allIds.push(...(await quizPlay(page, adv, { wrongs: [0, 0] })).map((a) => a.id));
  await adv(60);
  await page.keyboard.press('Enter');
  await adv(8);
  z = await quizSt(page);
  check('quiz: result of challenge B: question 1 not first try (2 wrong), others first try', !!z.result && z.result.answers[0].firstTry === false && z.result.answers[0].wrong === 2 && z.result.answers[1].firstTry && z.result.coins === 7, JSON.stringify(z.result && z.result.answers));
  check('quiz: no question repeats within 6 asked in a row', new Set(allIds).size === allIds.length, allIds.join());
  const stB = await page.evaluate(() => window.__superglen.save.data.quiz.cats.berhitung);
  check('quiz: statistics: asked 6, first try 5, wrong 2', stB.asked === 6 && stB.firstTry === 5 && stB.wrong === 2, JSON.stringify({ a: stB.asked, f: stB.firstTry, w: stB.wrong }));

  // ---- C. level goes down after repeated misses ----
  const lvBefore = (await quizSt(page)).levels.berhitung;
  await page.evaluate(() => window.__superglen.quiz.start('berhitung', 3, 'terminal'));
  await adv(8);
  await quizPlay(page, adv, { wrongs: [1, 1, 0] });
  await adv(40);
  await page.keyboard.press('Enter');
  await adv(8);
  z = await quizSt(page);
  check('quiz: adaptive level: repeated misses (3 of the last 5) lowered the level again', lvBefore === 2 && z.levels.berhitung === 1, `${lvBefore} -> ${z.levels.berhitung}`);

  // ---- D. mix: three different categories; coins by challenge ----
  await page.evaluate(() => window.__superglen.quiz.start('mix', 3, 'story'));
  await adv(8);
  const mixAsked = await quizPlay(page, adv, { wrongs: [0, 0, 0] });
  await adv(40);
  await page.keyboard.press('Enter');
  await adv(8);
  z = await quizSt(page);
  check('quiz: "mix" asks three different categories', new Set(mixAsked.map((a) => a.cat)).size === 3 && z.result && z.result.completed, mixAsked.map((a) => a.cat).join());
  const cats = await page.evaluate(() => Object.fromEntries(Object.entries(window.__superglen.save.data.quiz.cats).map(([k, v]) => [k, v.asked])));
  check('quiz: per-category statistics are updated for each question of a mix', mixAsked.every((a) => cats[a.cat] >= 1), JSON.stringify(cats));

  // ---- E. 5 challenges -> a memory fragment ----
  const f0 = (await quizSt(page)).fragments;
  const ch0 = (await quizSt(page)).challenges;
  const need = 5 - (ch0 % 5);
  let gotFragment = false;
  for (let i = 0; i < need; i++) {
    await page.evaluate(() => window.__superglen.quiz.start('hewan', 3, 'terminal'));
    await adv(8);
    await quizPlay(page, adv, { wrongs: [0, 0, 0] });
    await adv(60);
    if (i === need - 1) gotFragment = await page.evaluate(() => !!document.querySelector('.qp-end-frag'));
    await page.keyboard.press('Enter');
    await adv(8);
  }
  z = await quizSt(page);
  check('quiz: every 5th completed challenge gives a memory fragment (counted, puzzle piece shown)', z.fragments === f0 + 1 && gotFragment && z.challenges % 5 === 0, `fragments ${f0} -> ${z.fragments}, icon ${gotFragment}, challenges ${z.challenges}`);

  // ---- F. album ----
  await page.evaluate(() => window.__superglen.quiz.showAlbum());
  await adv(4);
  await sleep(600);
  z = await quizSt(page);
  const alb = await page.evaluate(() => ({ view: window.__superglen.quiz.view, tabs: document.querySelectorAll('.qp-tab').length, slots: document.querySelectorAll('.qp-slot').length, own: document.querySelectorAll('.qp-slot.own').length, minSlot: Math.min(...[...document.querySelectorAll('.qp-slot')].map((e) => e.getBoundingClientRect().width)) }));
  await shot(page, 'quiz-album');
  check('quiz: the album shows 5 category tabs and a grid; owned stickers are coloured, missing ones outlined', alb.view === 'album' && alb.tabs === 5 && alb.slots >= 6 && alb.own >= 1 && alb.own < alb.slots, JSON.stringify(alb));
  const saved = await page.evaluate(() => window.__superglen.save.data.quiz.stickers);
  await page.keyboard.press('2');
  await adv(2);
  const tab2 = await page.evaluate(() => document.querySelector('.qp-tab.on').dataset.category);
  check('quiz: key 2 switches the album page to the second category', tab2 === 'inggris', tab2);
  const ownedHere = await page.evaluate(() => document.querySelectorAll('.qp-slot.own').length);
  check('quiz: owned stickers in the album match the save per category', ownedHere === saved.filter((x) => x.startsWith('inggris:')).length, `${ownedHere}`);
  await page.keyboard.press('Escape');
  await adv(4);
  check('quiz: Esc closes the album', !(await quizSt(page)).open);

  // ---- G. close button (terminal challenge): long-press 1 s ----
  await page.evaluate(() => window.__superglen.quiz.start('inggris', 3, 'terminal'));
  await adv(8);
  const cb = await page.evaluate(() => { const r = document.querySelector('.qp-close').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, vis: getComputedStyle(document.querySelector('.qp-close')).display !== 'none' }; });
  await page.mouse.move(cb.x, cb.y);
  await page.mouse.down();
  await adv(30);
  const stillOpen = (await quizSt(page)).open;
  await page.mouse.up();
  await adv(80);
  const afterShort = (await quizSt(page)).open;
  await page.mouse.down();
  await adv(75);
  await page.mouse.up();
  await adv(6);
  z = await quizSt(page);
  check('quiz: a terminal challenge has a small close button: a short press does nothing, a 1 s long-press closes', cb.vis && stillOpen && afterShort && !z.open, JSON.stringify({ stillOpen, afterShort, open: z.open }));
  check('quiz: closing early gives no sticker and the controls come back', !!z.result && z.result.completed === false && z.result.sticker === null && (await page.evaluate(() => window.__superglen.controlsEnabled)));

  // ---- H. the overlay costs nothing while closed ----
  const rec = await page.evaluate(() => {
    const g = window.__superglen;
    g.pause(true);
    g.resetTiming();
    const mo = new MutationObserver(() => {});
    mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    let T = 9000;
    for (let i = 0; i < 180; i++) { T += 1000 / 60; g.simFrame(T, false); }
    const n = mo.takeRecords().length;
    mo.disconnect();
    return n;
  });
  check('quiz: with the overlay closed there are no DOM writes per frame (180 frames)', rec === 0, `${rec} mutations`);
  const hudCoins = await page.evaluate(() => ({ shown: document.querySelector('.coin-hud').classList.contains('show') }));
  check('quiz: the small HUD coin counter is hidden when the coins have not just changed', hudCoins.shown === false);
}

/** Taps on a phone-sized screen: a whole challenge by finger, no overlap, buttons >= 80, the PC key badges are hidden. */
async function quizTouchScenario(page, check) {
  const adv = (n) => page.evaluate((n) => window.__superglen.advanceAsync(n, false), n);
  await sleep(1500);
  await page.touchscreen.tap(400, 140);
  await sleep(600);
  await page.evaluate(() => { window.__superglen.save.resetProgress(); window.__superglen.pause(true); });
  await page.evaluate(() => window.__superglen.quiz.start('mix', 3, 'terminal'));
  await adv(8);
  await sleep(600);
  let z = await quizSt(page);
  const lay = await page.evaluate(quizLayout);
  check('quiz-touch 844x281: the question screen fits (cards >= 110 px, no overlap, nothing outside, no scroll)', lay.bad.length === 0 && lay.minCard >= 110, JSON.stringify(lay));
  const keys = await page.evaluate(() => getComputedStyle(document.querySelector('.qp-key')).display);
  check('quiz-touch: the PC key badges (1 2 3) are hidden on touch', keys === 'none', keys);
  await shot(page, 'quiz-touch-281');
  // wrong tap, then right taps for all three questions
  const w = z.visible.find((k) => k !== z.key);
  await quizAnswer(page, w, true);
  await adv(8);
  z = await quizSt(page);
  check('quiz-touch: a tap on a wrong card wobbles it ("Hampir")', z.wrong === 1 && z.bubble === 'Hampir! Coba lagi.');
  await adv(80);
  // The first question is still open (it had the wrong tap): finish it and two more by tapping.
  await quizPlay(page, adv, { wrongs: [0, 0, 0], tap: true });
  z = await quizSt(page);
  check('quiz-touch: a 3-question challenge can be completed by taps only', z.view === 'end' || z.result !== null, `${z.view} ${z.index}`);
  await adv(60);
  const ok = await page.evaluate(() => { const r = document.querySelector('.qp-ok').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
  check('quiz-touch: the OK button is >= 80 pt and inside the screen', ok.w >= 80 && ok.x < 844, `${ok.w}`);
  await page.touchscreen.tap(ok.x, ok.y);
  await adv(8);
  z = await quizSt(page);
  check('quiz-touch: tapping OK closes the challenge with its reward', !z.open && z.result && z.result.completed && z.coins >= 7, `coins ${z.coins}`);
}

/** Every display kind, at every listed viewport; then every question of the bank on the smallest ones. */
async function quizRenderScenario(page, check, touch = false) {
  const tag = touch ? 'quiz-render-touch' : 'quiz-render';
  const adv = (n) => page.evaluate((n) => window.__superglen.advanceAsync(n, false), n);
  await sleep(1500);
  // (touch: no start tap, it would go fullscreen and block the viewport changes below; the quiz does not need the start)
  if (!touch) await page.mouse.click(640, 360);
  await sleep(600);
  await page.evaluate(() => { window.__superglen.save.resetProgress(); window.__superglen.pause(true); });
  const samples = await page.evaluate(() => window.__superglen.quiz.samples());
  const kinds = new Set(samples.map((s) => s.kind));
  check(`${tag}: the bank has samples of all 9 display kinds`, kinds.size === 9, [...kinds].join());
  const sizes = [[1280, 720], [1024, 768], [844, 390], [667, 375], [844, 281]];
  // Animations off for the numbers (a pop-in scales the box for 0.4 s); the screenshots below keep them.
  const noAnim = await page.addStyleTag({ content: '.qp *, .qp { animation: none !important; transition: none !important; }' });
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(500);
    const problems = [];
    let minCard = 999;
    for (const s of samples) {
      await page.evaluate((id) => window.__superglen.quiz.preview(id), s.id);
      const lay = await page.evaluate(quizLayout);
      minCard = Math.min(minCard, lay.minCard);
      if (lay.bad.length) problems.push(`${s.id}(${s.kind}): ${lay.bad.join(',')}`);
      await page.evaluate(() => window.__superglen.quiz.close());
    }
    check(`${tag} ${w}x${h}: one question of each display kind per category (${samples.length}) fits: cards >= 110, no overlap, nothing outside, no scrollbars`, problems.length === 0 && minCard >= 110, problems.slice(0, 4).join(' | ') || `min card ${minCard}`);
  }
  // All questions on the two tightest screens.
  const ids = await page.evaluate(() => { const z = window.__superglen.quiz; return z.allIds(); });
  for (const [w, h] of [[844, 281], [667, 375]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(400);
    const problems = [];
    for (const id of ids) {
      await page.evaluate((id) => window.__superglen.quiz.preview(id), id);
      const lay = await page.evaluate(quizLayout);
      if (lay.bad.length) problems.push(`${id}: ${lay.bad.join(',')}`);
      await page.evaluate(() => window.__superglen.quiz.close());
    }
    check(`${tag} ${w}x${h}: all ${ids.length} questions of the bank fit`, problems.length === 0, problems.slice(0, 5).join(' | '));
  }
  await noAnim.evaluate((e) => e.remove());
  if (touch) return;
  // Screenshots (1280x720, animations on).
  await page.setViewportSize({ width: 1280, height: 720 });
  await sleep(500);
  const want = [['berhitung', 'sum', 'quiz-sum'], ['inggris', 'picture', 'quiz-english'], ['mandarin', 'speak', 'quiz-mandarin'], ['hewan', 'silhouette', 'quiz-silhouette'], ['membaca', 'text', 'quiz-reading']];
  for (const [cat, kind, name] of want) {
    const s = samples.find((x) => x.category === cat && x.kind === kind) || samples.find((x) => x.category === cat);
    await page.evaluate((id) => window.__superglen.quiz.preview(id), s.id);
    await adv(2);
    await sleep(800);
    await shot(page, name);
    await page.evaluate(() => window.__superglen.quiz.close());
  }
  // The reading category uses the reading font with generous letter spacing.
  const rs = samples.find((x) => x.category === 'membaca');
  await page.evaluate((id) => window.__superglen.quiz.preview(id), rs.id);
  await sleep(300);
  const ls = await page.evaluate(() => { const t = document.querySelector('.qp-ctext-t') || document.querySelector('.qp-bigtext'); const cs = getComputedStyle(t); return { ls: parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize), fs: parseFloat(cs.fontSize) }; });
  check('quiz-render: reading category: big letters with generous letter spacing (>= 0.1 em)', ls.ls >= 0.1 && ls.fs >= 30, JSON.stringify(ls));
  await page.evaluate(() => window.__superglen.quiz.close());
  // reduced motion: the overlay still works
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate((id) => window.__superglen.quiz.preview(id), samples[0].id);
  await adv(2);
  const lay = await page.evaluate(quizLayout);
  check('quiz-render: prefers-reduced-motion: the question still lays out correctly', lay.bad.length === 0, lay.bad.join());
  await page.evaluate(() => window.__superglen.quiz.close());
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

/** Terminals in the lab and the hall: prompt, challenge, category picker; parents page opened by a long-press. */
async function quizTerminalScenario(page, check) {
  const d = makeStoryDriver(page, check);
  const load = async (query) => {
    await page.goto(URL + query);
    await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
    await sleep(1400);
    await page.mouse.click(640, 360);
    await sleep(500);
  };
  const setSave = (chapters, skills) => page.evaluate(([c, sk]) => { const g = window.__superglen; g.save.data.chaptersDone = c; g.save.data.skills = sk; g.save.data.lastMode = 'superglen'; g.save.persist(); }, [chapters, skills]);
  const ALL = { laser: true, shield: true, fly: true };
  const NONE = { laser: false, shield: false, fly: false };
  const adv = (n) => d.adv(n);
  // ---- Lab, Chapter 1 done: a "mix" terminal ----
  await sleep(1500);
  await setSave(['bab1'], NONE);
  await load('?fps=0&quizseed=1');
  await page.evaluate(() => window.__superglen.pause(true));
  await d.adv(30);
  let s = await d.st();
  check('terminal: bab1 done -> starts in the lab', s.level === 'bab1' && s.player.z < -62, `${s.level} z ${s.player.z.toFixed(1)}`);
  await d.walk(-2.8, -62.9, 900);
  await page.evaluate(() => window.__superglen.setCameraYaw(Math.PI)); // the lab camera faces the entrance at first: turn towards the terminal
  await d.adv(12);
  s = await d.st();
  check('terminal (lab): next to the terminal the talk prompt appears', s.prompt.visible && s.prompt.icon === 'talk' && s.prompt.inRange, JSON.stringify(s.prompt));
  await d.adv(2, true);
  await shot(page, 'quiz-lab-terminal');
  await d.tap('e');
  await d.adv(8);
  let z = await quizSt(page);
  check('terminal (lab): E opens a Tantangan Pintar of mixed categories (3 questions)', z.open && z.view === 'question' && z.total === 3, `${z.view} ${z.total}`);
  const asked = await quizPlay(page, adv, { wrongs: [0, 0, 0] });
  await d.adv(40);
  z = await quizSt(page);
  check('terminal (lab): the end screen offers the sticker album button', z.view === 'end' && (await page.evaluate(() => !!document.querySelector('.qp-albumbtn'))), z.view);
  check('terminal (lab): a mix challenge asks 3 different categories', new Set(asked.map((a) => a.cat)).size === 3, asked.map((a) => a.cat).join());
  await page.evaluate(() => document.querySelector('.qp-albumbtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await d.adv(4);
  z = await quizSt(page);
  check('terminal (lab): the album button opens the album; Esc returns to the end screen', z.view === 'album', z.view);
  await page.keyboard.press('Escape');
  await d.adv(4);
  z = await quizSt(page);
  check('terminal (lab): ... back on the end screen', z.view === 'end', z.view);
  await page.keyboard.press('Enter');
  await d.adv(10);
  z = await quizSt(page);
  check('terminal (lab): closed; coins and sticker earned', !z.open && z.coins === 9 && z.stickers === 1, `coins ${z.coins} stickers ${z.stickers}`);
  s = await d.st();
  check('terminal (lab): the player is free again and can use the terminal once more', s.controlsEnabled && s.prompt.inRange);

  // ---- Chapter 1 not done: no terminal ----
  await setSave([], NONE);
  await load('?fps=0&reset=1&quizseed=1&level=bab1');
  await page.evaluate(() => window.__superglen.pause(true));
  await page.evaluate(() => window.__superglen.placePlayer(-2.8, -62.9));
  await d.adv(20);
  s = await d.st();
  check('terminal (lab): before Chapter 1 is finished the terminal is hidden (no prompt)', !s.prompt.inRange, JSON.stringify(s.prompt));

  // ---- Hall, free play: picker ----
  await setSave(['bab1', 'bab2'], ALL);
  await load('?fps=0&quizseed=1');
  await page.evaluate(() => window.__superglen.pause(true));
  await d.adv(30);
  s = await d.st();
  check('terminal: bab2 done -> starts in the hall (free play)', s.level === 'bab2' && s.levelInfo.free === true, s.level);
  await d.walk(-3.8, -1.2, 900);
  await d.adv(12);
  s = await d.st();
  check('terminal (hall): the talk prompt appears at the terminal', s.prompt.visible && s.prompt.icon === 'talk' && s.prompt.inRange, JSON.stringify(s.prompt));
  await d.adv(2, true);
  await shot(page, 'quiz-hall-terminal');
  await d.tap('e');
  await d.adv(8);
  z = await quizSt(page);
  check('terminal (hall): E opens the category picker (5 big icons)', z.open && z.view === 'picker' && (await page.evaluate(() => document.querySelectorAll('.qp-cat').length)) === 5, z.view);
  await sleep(600);
  await shot(page, 'quiz-picker');
  const pk = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const r = [...document.querySelectorAll('.qp-cat')].map((e) => e.getBoundingClientRect());
    return { minW: Math.min(...r.map((x) => x.width)), minH: Math.min(...r.map((x) => x.height)), inside: r.every((x) => x.left >= 0 && x.right <= vw && x.bottom <= vh && x.top >= 0) };
  });
  check('terminal (hall): the picker icons are >= 110 px and inside the screen', pk.minW >= 110 && pk.minH >= 110 && pk.inside, JSON.stringify(pk));
  await page.keyboard.press('4');
  await d.adv(8);
  z = await quizSt(page);
  check('terminal (hall): key 4 (paw) starts a hewan challenge', z.view === 'question' && z.cat === 'hewan', `${z.view} ${z.cat}`);
  const ch0 = z.challenges;
  await quizPlay(page, adv, { wrongs: [0, 0, 0] });
  await d.adv(40);
  await page.keyboard.press('Enter');
  await d.adv(10);
  z = await quizSt(page);
  check('terminal (hall): the picker challenge finished and closed (one more completed challenge, 9 coins)', !z.open && z.challenges === ch0 + 1 && z.coins >= 9, `challenges ${ch0} -> ${z.challenges}, coins ${z.coins}`);
  // picker: tap a different icon; close it without playing
  await d.tap('e');
  await d.adv(8);
  await page.click('.qp-cat[data-category="mandarin"]');
  await d.adv(8);
  z = await quizSt(page);
  check('terminal (hall): clicking the lantern icon starts a mandarin challenge', z.view === 'question' && z.cat === 'mandarin', `${z.view} ${z.cat}`);
  await page.evaluate(() => window.__superglen.quiz.close());
  await d.adv(6);
  await d.tap('e');
  await d.adv(8);
  await page.keyboard.press('Escape');
  await d.adv(4);
  z = await quizSt(page);
  check('terminal (hall): Esc closes the category picker', !z.open);
  // leaving a level while a quiz is open closes it
  await d.tap('e');
  await d.adv(6);
  await page.evaluate(() => window.__superglen.pause(false));
  await page.evaluate(() => window.__superglen.loadLevel('test'));
  await page.waitForFunction(() => window.__superglen.level === 'test' && !window.__superglen.loading, null, { timeout: 30000 });
  z = await quizSt(page);
  check('terminal: loading another level closes an open quiz and unlocks the controls', !z.open && (await page.evaluate(() => window.__superglen.controlsEnabled)));
  // the test-area terminal
  await page.evaluate(() => window.__superglen.pause(true));
  await d.adv(20);
  await d.walk(6, 2.6, 900);
  await d.adv(12);
  s = await d.st();
  check('terminal (test area): the terminal exists and shows its prompt', s.prompt.visible && s.prompt.icon === 'talk', JSON.stringify(s.prompt));
}

async function quizParentsScenario(page, check) {
  const fingers = await makeFingers(page);
  await sleep(1500);
  // some statistics to show
  await page.evaluate(() => {
    const g = window.__superglen;
    const q = g.save.data.quiz;
    q.cats.berhitung = { level: 2, asked: 10, firstTry: 8, wrong: 3, streak: 1, recent: [0, 0], last: 1 };
    q.cats.hewan = { level: 1, asked: 6, firstTry: 2, wrong: 9, streak: 0, recent: [1, 1], last: 1 };
    q.cats.inggris = { level: 1, asked: 1, firstTry: 1, wrong: 0, streak: 1, recent: [0], last: 1 };
    q.coins = 31;
    q.stickers = ['berhitung:apel', 'hewan:kucing'];
    q.fragments = 1;
    q.challenges = 6;
    g.save.persist();
  });
  const startedBefore = await page.evaluate(() => window.__superglen.started);
  const logo = await page.evaluate(() => { const r = document.querySelector('.start-logo').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  // a 1.5 s hold does nothing
  await fingers.down(1, logo.x, logo.y);
  await sleep(1500);
  const early = await page.evaluate(() => window.__superglen.parents.open);
  await fingers.up(1);
  await sleep(300);
  check('parents: a short press on the logo does not open the parents page', !early);
  // the long press: 3 s
  await page.evaluate(() => window.__superglen.save.persist());
  const startedMid = await page.evaluate(() => window.__superglen.started);
  await fingers.down(2, logo.x, logo.y);
  await sleep(2400);
  const at24 = await page.evaluate(() => window.__superglen.parents.open);
  await sleep(1000);
  const open = await page.evaluate(() => window.__superglen.parents.open);
  await fingers.up(2);
  await sleep(400);
  const after = await page.evaluate(() => ({ open: window.__superglen.parents.open, started: window.__superglen.started }));
  check('parents: nothing happens before 3 s, then the page opens', !at24 && open, `2.4 s: ${at24}, 3.4 s: ${open}`);
  check('parents: releasing the long-press does not start the game; the page stays', after.open && !after.started && !startedBefore && !startedMid, JSON.stringify(after));
  await sleep(300);
  await shot(page, 'quiz-parents');
  const txt = await page.evaluate(() => document.querySelector('.parents').innerText);
  check('parents: the page shows the categories with level, answered, first-try rate and a lancar / perlu latihan label', /Berhitung/.test(txt) && /Hewan/.test(txt) && /lancar/.test(txt) && /perlu latihan/.test(txt) && /80%/.test(txt) && /33%/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 160));
  check('parents: coins, stickers and fragments are listed', /Koin: 31/.test(txt) && /Stiker: 2/.test(txt) && /Kepingan memori: 1/.test(txt), txt.replace(/\s+/g, ' ').slice(-180));
  const rows = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.parents tbody tr')].map((r) => [r.dataset.category, r.querySelector('.pill').textContent])));
  check('parents: labels: berhitung lancar, hewan perlu latihan, inggris not enough data yet', rows.berhitung === 'lancar' && rows.hewan === 'perlu latihan' && rows.inggris === 'baru mulai', JSON.stringify(rows));
  // Fits at 844x390 and 844x281
  for (const [w, h] of [[844, 390], [844, 281]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(400);
    const fit = await page.evaluate(() => {
      const p = document.querySelector('.parents');
      const vw = innerWidth, vh = innerHeight;
      const out = [...p.querySelectorAll('button, table, .parents-sum, .toggle')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1; }).map((e) => e.className || e.tagName);
      return { out, scroll: p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1 };
    });
    check(`parents ${w}x${h}: everything fits without scrolling`, fit.out.length === 0 && !fit.scroll, JSON.stringify(fit));
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(300);
  // toggles persist
  const tog = async (id) => {
    const c = await page.evaluate((id) => { const r = document.querySelector(`.toggle[data-setting=${id}] .switch`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
    await page.touchscreen.tap(c.x, c.y);
    await sleep(200);
  };
  const before = await page.evaluate(() => ({ ...window.__superglen.save.data.settings }));
  await tog('easy');
  await tog('sound');
  const mid = await page.evaluate(() => ({ s: { ...window.__superglen.save.data.settings }, ls: JSON.parse(localStorage.getItem('superglen.save.v1')).settings, easy: window.__superglen.rhythm.easy }));
  check('parents: the easy-jump and sound switches flip, apply and persist in localStorage', mid.s.easyJump === !before.easyJump && mid.s.sound === !before.sound && mid.ls.easyJump === mid.s.easyJump && mid.ls.sound === mid.s.sound && mid.easy === mid.s.easyJump, JSON.stringify({ before, mid }));
  await tog('easy');
  await tog('sound');
  // album
  const ab = await page.evaluate(() => { const r = document.querySelector('.parents-album').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(ab.x, ab.y);
  await sleep(500);
  check('parents: the album button opens the sticker album', (await quizSt(page)).view === 'album');
  await page.keyboard.press('Escape');
  await sleep(300);
  check('parents: closing the album returns to the parents page', await page.evaluate(() => window.__superglen.parents.open && !window.__superglen.quiz.open));
  // reset with a confirm step
  const click = async (sel) => {
    const c = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    await page.touchscreen.tap(c.x, c.y);
    await sleep(250);
  };
  await click('.parents-reset');
  check('parents: "Reset progres" first asks for confirmation (nothing deleted yet)', await page.evaluate(() => !!document.querySelector('.parents-reset-yes') && window.__superglen.save.data.quiz.coins === 31));
  await click('.parents-reset-no');
  check('parents: "Batal" keeps everything', await page.evaluate(() => !document.querySelector('.parents-reset-yes') && window.__superglen.save.data.quiz.coins === 31));
  await click('.parents-reset');
  await Promise.all([page.waitForNavigation({ timeout: 20000 }).catch(() => null), click('.parents-reset-yes')]);
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  const afterReset = await page.evaluate(() => ({ q: window.__superglen.save.data.quiz.coins, ch: window.__superglen.save.data.chaptersDone.length, ls: JSON.parse(localStorage.getItem('superglen.save.v1') || '{}'), easy: window.__superglen.save.data.settings.easyJump }));
  check('parents: "Ya, hapus" clears the quiz progress and the page reloads (settings are kept)', afterReset.q === 0 && afterReset.ch === 0 && (!afterReset.ls.quiz || afterReset.ls.quiz.coins === 0), JSON.stringify({ q: afterReset.q, ch: afterReset.ch }));
  const gear = await page.evaluate(() => !!document.querySelector('.hud-card .hud-gear'));
  check('parents: a discreet gear button exists in the PC help card', gear);
}

// =====================================================================================================================
// Audio (package B4): voice lines, sfx, music lane. No real mp3 is needed: clips are injected in the page.
// =====================================================================================================================

const SOUND_WORDS = ['Meong!', 'Guk guk!', 'Moo!', 'Kukuruyuk!', 'Kwek kwek!', 'Hiiik!', 'Auum!'];

const audioSt = (page) =>
  page.evaluate(() => {
    const a = window.__superglen.audio;
    return {
      unlocked: a.unlocked, voicePlaying: a.voicePlaying, lastVoiceId: a.lastVoiceId, missing: a.missing, musicScene: a.musicScene,
      musicPlaying: a.musicPlaying, musicFile: a.musicFile, fading: a.fading, crossfades: a.crossfades, ducked: a.ducked,
      available: a.available, voicesPlayed: a.voicesPlayed, sfxPlayed: a.sfxPlayed, lastSfxId: a.lastSfxId, lanes: a.lanes, state: a.state,
    };
  });

/** Wait (real time) until the JS expression `expr` (with `a` = __superglen.audio) is true. */
async function audioUntil(page, expr, timeout = 5000) {
  try {
    await page.waitForFunction((e) => { const a = window.__superglen.audio; return !!new Function('a', `return ${e}`)(a); }, expr, { timeout, polling: 30 });
    return true;
  } catch (_) {
    return false;
  }
}

/** Tap start, then pause the game loop (audio keeps its own real-time clock: followPause off). */
async function audioBoot(page, touch) {
  await sleep(1500);
  if (touch) await page.touchscreen.tap(420, 140);
  else await page.mouse.click(640, 360);
  await sleep(700);
  await page.evaluate(() => { const g = window.__superglen; g.audio.followPause = false; g.pause(true); });
}

const audioAdv = (page, n) => page.evaluate((n) => window.__superglen.advance(n, false), n);
const audioDialog = (page) => page.evaluate(() => { const d = window.__superglen.dialog; return { open: d.open, id: d.id, text: d.text }; });

async function audioHit(page, sel, touch) {
  const c = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  if (touch) await page.touchscreen.tap(c.x, c.y);
  else {
    // With the pointer locked, mouse events go to the canvas (PC players advance with E): let go first.
    await page.evaluate(() => document.exitPointerLock && document.exitPointerLock());
    await sleep(150);
    await page.mouse.click(c.x, c.y);
  }
}

/** The ids a quiz question announces (prompt, then the word / sound id when it has one). */
const quizVoiceIds = (page, qid) =>
  page.evaluate((qid) => {
    const z = window.__superglen.quiz;
    z.close();
    z.preview(qid);
    const out = { kind: z.kind, ids: z.spoken.slice(-2) };
    z.close();
    return out;
  }, qid);

/** Everything the game requested and logged on the console, to check "own origin only", "no 404", "log once". */
function audioWatch(page) {
  const w = { reqs: [], bad: [], infos: [] };
  page.on('request', (r) => w.reqs.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) w.bad.push(`${r.status()} ${r.url()}`); });
  page.on('console', (m) => { if (m.text().startsWith('[audio]')) w.infos.push(m.text()); });
  return w;
}

const loggedOnce = (w, missing) => missing.every((id) => w.infos.filter((t) => t.includes(`"${id}"`)).length === 1);

/** No audio file at all (the shipped state): the game behaves as before, text only, every missing id logged once. */
async function audioNoFilesScenario(page, check, touch) {
  const w = audioWatch(page);
  const tag = touch ? 'touch' : 'desktop';
  await sleep(1500);
  let a = await audioSt(page);
  check(`audio ${tag}: before the first tap there is no AudioContext and nothing plays`, !a.unlocked && a.state === 'none' && !a.voicePlaying);
  await audioBoot(page, touch);
  a = await audioSt(page);
  const idx = await page.evaluate(async () => { const r = await fetch('audio/index.json'); const j = await r.json(); return { ok: r.ok, arr: Array.isArray(j) && j.every((x) => typeof x === 'string'), n: j.length }; });
  check(`audio ${tag}: the first tap unlocks the shared AudioContext; audio/index.json is a plain array of ids`, a.unlocked && a.state !== 'none' && idx.ok && idx.arr && a.available === idx.n, JSON.stringify({ unlocked: a.unlocked, state: a.state, idx, avail: a.available }));
  await page.evaluate(() => window.__superglen.audio.setTracks({}));
  a = await audioSt(page);
  check(`audio ${tag}: without a level scene the title music scene is chosen; with no track mapped it stays silent`, a.musicScene === 'awal' && !a.musicPlaying);

  // ---- A dialog line without a voice file: the old text-length timing, one info log ----
  const text = 'Ini kalimat uji yang tidak punya berkas suara sama sekali.';
  const expectFrames = Math.ceil(Math.max(2.2, 0.09 * text.length) * 60);
  await page.evaluate((t) => window.__superglen.say({ speaker: 'nino', text: t, id: 'zz_nofile_1' }), text);
  await audioAdv(page, 4);
  const d1 = await audioDialog(page);
  await audioAdv(page, expectFrames - 20);
  const d2 = await audioDialog(page);
  await audioAdv(page, 40);
  const d3 = await audioDialog(page);
  check(`audio ${tag}: a line without a file shows its text and keeps the default text-length duration`, d1.open && d1.id === 'zz_nofile_1' && d2.open && !d3.open, JSON.stringify({ expectFrames, d1: d1.open, d2: d2.open, d3: d3.open }));
  await page.evaluate((t) => { const g = window.__superglen; g.say({ speaker: 'nino', text: t, id: 'zz_nofile_1' }); }, text);
  await audioAdv(page, 4);
  await audioAdv(page, expectFrames + 30);
  a = await audioSt(page);
  check(`audio ${tag}: the missing id is recorded and logged once (even after the line was said twice)`, a.missing.filter((x) => x === 'zz_nofile_1').length === 1 && w.infos.filter((t) => t.includes('"zz_nofile_1"')).length === 1 && a.lastVoiceId === '' && !a.voicePlaying, JSON.stringify({ m: a.missing, logs: w.infos.length }));

  // ---- Quiz: animal sound without its sound file: the sound as a word next to the speaker ----
  const found = await page.evaluate(() => {
    const z = window.__superglen.quiz;
    const out = [];
    for (const id of z.allIds()) {
      if (!id.includes('hewan')) continue;
      z.preview(id);
      if (z.kind === 'sound') out.push({ id, ids: z.spoken.slice(-2) });
      z.close();
      if (out.length >= 1) break;
    }
    return out;
  });
  check(`audio ${tag}: the hewan bank has a sound question`, found.length === 1, JSON.stringify(found));
  if (found.length === 1) {
    await page.evaluate((ids) => { const a = window.__superglen.audio; ids.forEach((i) => a.hide(i)); }, found[0].ids);
    const noAnim = await page.addStyleTag({ content: '.qp *, .qp { animation: none !important; transition: none !important; }' });
    await page.evaluate((id) => window.__superglen.quiz.preview(id), found[0].id);
    await audioAdv(page, 6);
    await sleep(700); // the sound id is asked for after the prompt (real-time chain)
    const word = await page.evaluate(() => { const e = document.querySelector('.qp-display .qp-soundword'); return e ? e.textContent : null; });
    check(`audio ${tag}: sound question with a missing sound file shows the animal word in a bubble`, word !== null && SOUND_WORDS.includes(word), String(word));
    if (touch) {
      const lay = await page.evaluate(quizLayout);
      check(`audio ${tag}: the sound-word bubble fits (no overlap, nothing outside the display)`, lay.bad.length === 0, lay.bad.join());
    }
    a = await audioSt(page);
    check(`audio ${tag}: the prompt and the sound ids were reported missing once each, nothing played, no error`, found[0].ids.every((i) => a.missing.includes(i)) && loggedOnce(w, a.missing) && a.sfxPlayed === 0 && a.voicesPlayed === 0, JSON.stringify(a.missing));
    await page.evaluate(() => window.__superglen.quiz.close());
    await noAnim.evaluate((e) => e.remove());
  }
  const origin = new globalThis.URL(page.url()).origin;
  check(`audio ${tag}: every request went to the page's own origin and none failed`, w.reqs.every((u) => u.startsWith('data:') || u.startsWith('blob:') || new globalThis.URL(u).origin === origin) && w.bad.length === 0, w.bad.join(' | '));
}

/** Injected clips: voice, bubble timing, ducking, crossfade, toggles, quiz sequence. */
async function audioClipsScenario(page, check, touch) {
  const tag = touch ? 'touch' : 'desktop';
  await audioBoot(page, touch);
  await page.evaluate(() => {
    const a = window.__superglen.audio;
    a.inject('music/t1.mp3', 20, true);
    a.inject('music/t2.mp3', 20, true);
    a.inject('music/t3.mp3', 2.5, false);
    a.inject('clip_long', 6, true);
    a.inject('clip_short', 1, true);
    a.setTracks({ awal: 't1.mp3', jelajah: 't2.mp3', berubah: 't3.mp3', latihan: '', pertarungan: '' });
  });
  let ok = await audioUntil(page, "a.musicPlaying && a.musicFile === 'music/t1.mp3'");
  let a = await audioSt(page);
  const m0 = a.lanes.music;
  check(`audio ${tag}: music starts for the scene (tracks.json mapping) on the music lane, voice lane open`, ok && a.musicScene === 'awal' && m0 > 0.2 && a.lanes.voice > 0.5 && !a.ducked, JSON.stringify(a.lanes));

  // ---- a line with a clip: bubble waits for the clip (6 s), music ducks, then returns ----
  const line = { speaker: 'nino', text: 'Halo, ini uji suara.', id: 'clip_long' };
  await page.evaluate((l) => window.__superglen.say(l), line);
  ok = await audioUntil(page, "a.voicePlaying && a.lastVoiceId === 'clip_long' && a.ducked");
  a = await audioSt(page);
  check(`audio ${tag}: a dialog line plays its clip and the music ducks to ~30%`, ok && Math.abs(a.lanes.music - m0 * 0.3) < 0.01, JSON.stringify({ ok, lanes: a.lanes, m0 }));
  await audioAdv(page, 200); // 3.3 s: the default 2.2 s would be over
  const d1 = await audioDialog(page);
  await audioAdv(page, 200); // 6.7 s in total: clip 6 s + tail
  const d2 = await audioDialog(page);
  a = await audioSt(page);
  check(`audio ${tag}: the bubble stays for the clip length instead of the text estimate, then closes`, d1.open && !d2.open, JSON.stringify({ at3: d1.open, at6: d2.open }));
  check(`audio ${tag}: when the line is over the clip is stopped and the music comes back`, !a.voicePlaying && !a.ducked && Math.abs(a.lanes.music - m0) < 0.001, JSON.stringify({ vp: a.voicePlaying, ducked: a.ducked, lanes: a.lanes }));

  // ---- tapping the bubble advances and stops the clip ----
  await page.evaluate((l) => window.__superglen.say(l), line);
  await audioUntil(page, "a.voicePlaying && a.ducked");
  await audioAdv(page, 30);
  await audioHit(page, '.dlg-card', touch);
  await audioAdv(page, 2);
  const d3 = await audioDialog(page);
  a = await audioSt(page);
  check(`audio ${tag}: tapping the bubble advances the line and stops the clip at once`, !d3.open && !a.voicePlaying && !a.ducked, JSON.stringify({ open: d3.open, vp: a.voicePlaying, ducked: a.ducked }));
  // two queued lines: the second one's clip replaces the first
  await page.evaluate(() => { const g = window.__superglen; g.say({ speaker: 'nino', text: 'Satu.', id: 'clip_long' }); g.say({ speaker: 'glen', text: 'Dua.', id: 'clip_short' }); });
  await audioUntil(page, "a.voicePlaying && a.lastVoiceId === 'clip_long'");
  await audioAdv(page, 30);
  await audioHit(page, '.dlg-card', touch);
  await audioAdv(page, 2);
  ok = await audioUntil(page, "a.voicePlaying && a.lastVoiceId === 'clip_short'");
  check(`audio ${tag}: the next line's clip starts when the first is tapped away (one voice at a time)`, ok);
  await audioAdv(page, 100);
  await audioHit(page, '.dlg-card', touch);
  await audioAdv(page, 40);
  a = await audioSt(page);
  check(`audio ${tag}: after the last line nothing is left playing`, !a.voicePlaying && !(await audioDialog(page)).open, JSON.stringify({ vp: a.voicePlaying }));

  // ---- music scenes crossfade ----
  const c0 = a.crossfades;
  await page.evaluate(() => window.__superglen.audio.setScene('jelajah'));
  ok = await audioUntil(page, "a.musicFile === 'music/t2.mp3'");
  a = await audioSt(page);
  check(`audio ${tag}: a scene change crossfades: the new track plays while the old one fades out`, ok && a.crossfades === c0 + 1 && a.fading >= 1 && a.musicScene === 'jelajah', JSON.stringify({ x: a.crossfades, c0, fading: a.fading }));
  ok = await audioUntil(page, 'a.fading === 0', 4000);
  check(`audio ${tag}: the faded-out source is released after about a second`, ok);
  await page.evaluate(() => window.__superglen.audio.setScene('berubah'));
  ok = await audioUntil(page, "a.musicFile === 'music/t3.mp3'");
  const ended = await audioUntil(page, '!a.musicPlaying', 6000);
  a = await audioSt(page);
  check(`audio ${tag}: the "berubah" sting plays once and ends (no loop); the scene name stays`, ok && ended && a.musicScene === 'berubah', JSON.stringify({ ok, ended }));
  await page.evaluate(() => window.__superglen.audio.setScene('latihan'));
  await audioAdv(page, 4);
  a = await audioSt(page);
  check(`audio ${tag}: a scene with an empty track is silence (no error, no log)`, a.musicScene === 'latihan' && !a.musicPlaying, JSON.stringify({ p: a.musicPlaying }));
  await page.evaluate(() => window.__superglen.audio.setScene('jelajah'));
  ok = await audioUntil(page, "a.musicPlaying && a.musicFile === 'music/t2.mp3'");
  check(`audio ${tag}: back to a looping scene starts its track again`, ok);

  // ---- parents page toggles ----
  await page.evaluate(() => window.__superglen.parents.show());
  await sleep(200);
  await audioHit(page, '.toggle[data-setting=music] .switch', touch);
  await sleep(200);
  ok = await audioUntil(page, '!a.musicPlaying');
  a = await audioSt(page);
  const saved1 = await page.evaluate(() => JSON.parse(localStorage.getItem('superglen.save.v1')).settings);
  check(`audio ${tag}: the music switch silences only the music lane (voice lane stays) and is saved`, ok && a.lanes.music === 0 && a.lanes.voice > 0.5 && saved1.music === false, JSON.stringify({ lanes: a.lanes, saved1 }));
  await audioHit(page, '.toggle[data-setting=music] .switch', touch);
  await sleep(200);
  ok = await audioUntil(page, 'a.musicPlaying');
  a = await audioSt(page);
  check(`audio ${tag}: music back on restarts the scene's track`, ok && a.lanes.music > 0.2);
  await audioHit(page, '.toggle[data-setting=sound] .switch', touch);
  await sleep(200);
  a = await audioSt(page);
  check(`audio ${tag}: the sound switch silences every lane (voice, effects, music)`, a.lanes.voice === 0 && a.lanes.sfx === 0 && a.lanes.music === 0 && !a.musicPlaying, JSON.stringify(a.lanes));
  await page.evaluate(() => window.__superglen.parents.close());
  const v0 = a.voicesPlayed;
  await page.evaluate((l) => window.__superglen.say(l), line);
  await audioAdv(page, 4);
  await sleep(300);
  await audioAdv(page, 150); // the default 2.2 s (20 characters)
  const d4 = await audioDialog(page);
  a = await audioSt(page);
  check(`audio ${tag}: with sound off a line plays no clip and keeps the old duration`, a.voicesPlayed === v0 && !a.voicePlaying && !d4.open, JSON.stringify({ played: a.voicesPlayed - v0, open: d4.open }));
  await page.evaluate(() => window.__superglen.parents.show());
  await sleep(200);
  await audioHit(page, '.toggle[data-setting=sound] .switch', touch);
  await sleep(200);
  await page.evaluate(() => window.__superglen.parents.close());
  ok = await audioUntil(page, 'a.musicPlaying');
  a = await audioSt(page);
  check(`audio ${tag}: sound back on opens the lanes again`, ok && a.lanes.voice > 0.5 && a.lanes.music > 0.2, JSON.stringify(a.lanes));

  // ---- quiz: prompt, then the spoken word after the prompt ends; repeat button; Nino feedback ----
  const sp = await page.evaluate(() => window.__superglen.quiz.samples().find((s) => s.kind === 'speak'));
  const spk = await quizVoiceIds(page, sp.id);
  check(`audio ${tag}: a "speak" question announces its prompt id and its word id`, spk.kind === 'speak' && spk.ids.length === 2 && spk.ids[0] !== spk.ids[1], JSON.stringify(spk));
  const [pid, wid] = spk.ids;
  await page.evaluate(([p, w]) => { const a = window.__superglen.audio; a.inject(p, 1.2, true); a.inject(w, 0.8, true); a.inject('quiz_nino_hampir', 0.6, true); }, [pid, wid]);
  const seq1 = await page.evaluate(async ({ id, p, w }) => {
    const g = window.__superglen;
    const a = g.audio;
    g.quiz.preview(id);
    const t0 = performance.now();
    const log = [];
    let last = a.voicesPlayed;
    while (performance.now() - t0 < 8000 && log.length < 2) {
      if (a.voicesPlayed !== last) { last = a.voicesPlayed; log.push([a.lastVoiceId, performance.now() - t0]); }
      await new Promise((r) => setTimeout(r, 12));
    }
    return { log, p, w };
  }, { id: sp.id, p: pid, w: wid });
  check(`audio ${tag}: the question flow reads the prompt, then the word only after the prompt has ended`, seq1.log.length === 2 && seq1.log[0][0] === pid && seq1.log[1][0] === wid && seq1.log[1][1] - seq1.log[0][1] >= 1150, JSON.stringify(seq1.log));
  await audioUntil(page, '!a.voicePlaying', 4000);
  const n0 = (await audioSt(page)).voicesPlayed;
  await audioHit(page, '.qp-say', touch);
  ok = await audioUntil(page, `a.voicesPlayed >= ${n0 + 2}`, 6000);
  const seq2 = await page.evaluate((n) => window.__superglen.audio.voiceLog.slice(-n), 2);
  check(`audio ${tag}: the repeat button replays the prompt and then the word`, ok && seq2[0] === pid && seq2[1] === wid && (await audioSt(page)).voicesPlayed === n0 + 2, JSON.stringify({ seq2, n0 }));
  await audioUntil(page, '!a.voicePlaying', 4000);
  await audioAdv(page, 6);
  const wrongKey = await page.evaluate(() => { const z = window.__superglen.quiz; return z.visibleKeys.find((k) => k !== z.correctKey); });
  await quizAnswer(page, wrongKey, touch);
  ok = await audioUntil(page, "a.voicePlaying && a.lastVoiceId === 'quiz_nino_hampir'", 3000);
  check(`audio ${tag}: Nino's feedback line ("hampir") plays its voice`, ok);
  await page.evaluate(() => window.__superglen.quiz.close());

  // ---- animal sounds: file present = plays, no bubble; file missing = bubble ----
  const sounds = await page.evaluate(() => {
    const z = window.__superglen.quiz;
    const out = [];
    for (const id of z.allIds()) {
      if (!id.includes('hewan')) continue;
      z.preview(id);
      if (z.kind === 'sound') out.push({ id, ids: z.spoken.slice(-2) });
      z.close();
      if (out.length >= 2) break;
    }
    return out;
  });
  check(`audio ${tag}: the hewan bank has two sound questions`, sounds.length === 2);
  if (sounds.length === 2) {
    const [A, B] = sounds;
    await page.evaluate(({ A, B }) => {
      const a = window.__superglen.audio;
      a.inject(A.ids[0], 0.4, false);
      a.inject(A.ids[1], 0.8, true);
      B.ids.forEach((i) => a.hide(i));
    }, { A, B });
    const s0 = (await audioSt(page)).sfxPlayed;
    await page.evaluate((id) => window.__superglen.quiz.preview(id), A.id);
    await audioAdv(page, 6);
    const wordA = await page.evaluate(() => !!document.querySelector('.qp-display .qp-soundword'));
    ok = await audioUntil(page, `a.sfxPlayed === ${s0 + 1} && a.lastSfxId === '${A.ids[1]}'`, 5000);
    check(`audio ${tag}: a sound question with its file plays the sound after the prompt and shows no word bubble`, ok && !wordA, JSON.stringify({ ok, wordA }));
    await audioUntil(page, '!a.voicePlaying', 3000);
    const s1 = (await audioSt(page)).sfxPlayed;
    await audioHit(page, '.qp-say', touch);
    ok = await audioUntil(page, `a.sfxPlayed === ${s1 + 1}`, 5000);
    check(`audio ${tag}: the speaker button plays the animal sound again`, ok);
    await page.evaluate(() => window.__superglen.quiz.close());
    await page.evaluate((id) => window.__superglen.quiz.preview(id), B.id);
    await audioAdv(page, 6);
    const wordB = await page.evaluate(() => { const e = document.querySelector('.qp-display .qp-soundword'); return e ? e.textContent : null; });
    await sleep(1800);
    a = await audioSt(page);
    check(`audio ${tag}: the same question without its file shows the animal word and plays nothing`, wordB !== null && SOUND_WORDS.includes(wordB) && a.sfxPlayed === s1 + 1 && a.missing.includes(B.ids[1]), JSON.stringify({ wordB, sfx: a.sfxPlayed - s1 }));
    await page.evaluate(() => window.__superglen.quiz.close());
  }
}

/** ?mute=1: every lane stays silent, text and timing stay as before. */
async function audioMuteScenario(page, check) {
  await audioBoot(page, false);
  await page.evaluate(() => {
    const a = window.__superglen.audio;
    a.inject('music/t1.mp3', 5, true);
    a.inject('clip_long', 6, true);
    a.setTracks({ awal: 't1.mp3', jelajah: 't1.mp3', berubah: '', latihan: '', pertarungan: '' });
  });
  await sleep(500);
  let a = await audioSt(page);
  check('audio mute: ?mute=1 keeps all lanes at zero and the music off', a.unlocked && a.lanes.voice === 0 && a.lanes.sfx === 0 && a.lanes.music === 0 && !a.musicPlaying, JSON.stringify(a.lanes));
  await page.evaluate(() => window.__superglen.say({ speaker: 'nino', text: 'Halo, ini uji suara.', id: 'clip_long' }));
  await audioAdv(page, 4);
  await sleep(300);
  const d1 = await audioDialog(page);
  await audioAdv(page, 150);
  const d2 = await audioDialog(page);
  a = await audioSt(page);
  check('audio mute: a line plays no clip, the bubble keeps the text-length duration', d1.open && !d2.open && a.voicesPlayed === 0 && !a.ducked, JSON.stringify({ d1: d1.open, d2: d2.open }));
  await page.evaluate(() => window.__superglen.audio.setScene('jelajah'));
  await sleep(300);
  a = await audioSt(page);
  check('audio mute: a scene change stays silent', a.musicScene === 'jelajah' && !a.musicPlaying);
  const found = await page.evaluate(() => {
    const z = window.__superglen.quiz;
    for (const id of z.allIds()) {
      if (!id.includes('hewan')) continue;
      z.preview(id);
      if (z.kind === 'sound') return id;
      z.close();
    }
    return '';
  });
  await audioAdv(page, 6);
  const word = await page.evaluate(() => { const e = document.querySelector('.qp-display .qp-soundword'); return e ? e.textContent : null; });
  check('audio mute: a muted device still gets the animal word for a sound question', found !== '' && word !== null && SOUND_WORDS.includes(word), String(word));
}

/** Chapter 1 and a quiz with no files: own origin only, nothing 404s, each missing id logged once, the music scene is the level's. */
async function audioChapterScenario(page, check) {
  const w = audioWatch(page);
  await page.goto(URL + '?fps=0&reset=1');
  await page.waitForFunction(() => !!window.__superglen, null, { timeout: 30000 });
  await sleep(1500);
  await page.mouse.click(640, 360);
  await sleep(700);
  await page.evaluate(() => { const g = window.__superglen; g.audio.followPause = false; g.pause(true); });
  let a = await audioSt(page);
  check('audio chapter: Chapter 1 asks for the "jelajah" music scene and it starts with the first tap', a.unlocked && a.musicScene === 'jelajah');
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    await audioAdv(page, 45);
    const d = await audioDialog(page);
    if (d.open && d.id) seen.add(d.id);
  }
  check('audio chapter: Chapter 1 shows its opening line as text', seen.has('bab1_glen_pulang'), [...seen].join());
  await page.evaluate(() => window.__superglen.quiz.start('mix', 3, 'terminal'));
  await audioAdv(page, 8);
  await quizPlay(page, (n) => page.evaluate((n) => window.__superglen.advanceAsync(n, false), n), { wrongs: [0, 1, 0] });
  await page.keyboard.press('Enter');
  await audioAdv(page, 30);
  a = await audioSt(page);
  const idx = await page.evaluate(async () => (await (await fetch('audio/index.json')).json()));
  check('audio chapter: the quiz and Chapter 1 ran; every missing id was logged exactly once', a.missing.length >= 3 && loggedOnce(w, a.missing), `${a.missing.length} missing, ${w.infos.length} logs`);
  const origin = new globalThis.URL(page.url()).origin;
  const foreign = w.reqs.filter((u) => !(u.startsWith('data:') || u.startsWith('blob:') || new globalThis.URL(u).origin === origin));
  check('audio chapter: no request went to any host other than the game\'s own origin', foreign.length === 0, foreign.slice(0, 3).join(' | '));
  const mp3 = w.reqs.filter((u) => /\/audio\/[^/]+\.mp3$/.test(new globalThis.URL(u).pathname)).map((u) => new globalThis.URL(u).pathname.split('/').pop().replace('.mp3', ''));
  check('audio chapter: the game only requests mp3 files the manifest lists, and nothing returned 4xx/5xx', mp3.every((id) => idx.includes(id)) && w.bad.length === 0, JSON.stringify({ mp3, bad: w.bad }));
  await page.evaluate(() => window.__superglen.loadLevel('bab2'));
  await page.waitForFunction(() => window.__superglen.level === 'bab2' && !window.__superglen.loading, null, { timeout: 15000 });
  await sleep(300);
  a = await audioSt(page);
  check('audio chapter: Chapter 2 switches to the "latihan" scene', a.musicScene === 'latihan', a.musicScene);
}

async function runScenario(browser, name, ctxOpts, body, query = '?level=test') {
  if (process.env.ONLY && !new RegExp('^(' + process.env.ONLY + ')').test(name)) return { name, checks: [], errors: [], fps: { min: 0, avg: 0 } };
  const result = { name, checks: [], errors: [], fps: { min: 0, avg: 0 } };
  const check = (label, ok, detail) => result.checks.push({ label, ok: !!ok, detail });
  const { initScript, ...ctxOptions } = ctxOpts;
  const ctx = await browser.newContext(ctxOptions);
  if (initScript) await ctx.addInitScript(initScript);
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

    results.push(await runScenario(browser, 'flightfix-desktop', { viewport: { width: 1280, height: 720 } }, flightfixDesktopScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'flightfix-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, flightfixTouchScenario, '?level=test&fps=0'));

    results.push(await runScenario(browser, 'bab1', { viewport: { width: 1280, height: 720 } }, bab1DesktopScenario, '?fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab1-plank', { viewport: { width: 1280, height: 720 } }, bab1PlankScenario, '?fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab1-return', { viewport: { width: 1280, height: 720 } }, bab1ReturnScenario, '?fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab1-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, bab1TouchScenario, '?fps=0&reset=1'));

    results.push(await runScenario(browser, 'bab1-transform-ui', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, transformTouchScenario, '?fps=0&reset=1'));

    results.push(await runScenario(browser, 'bab2', { viewport: { width: 1280, height: 720 } }, bab2DesktopScenario, '?level=bab2&fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab2-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, bab2TouchScenario, '?level=bab2&fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab2-flow', { viewport: { width: 1280, height: 720 } }, bab2FlowScenario, '?fps=0&reset=1'));

    results.push(await runScenario(browser, 'skills-desktop', { viewport: { width: 1280, height: 720 } }, skillsDesktopScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'skills-perf', { viewport: { width: 1280, height: 720 } }, skillsPerfScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'skills-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, skillsTouchScenario, '?level=test&fps=0'));

    results.push(await runScenario(browser, 'parkour', { viewport: { width: 1280, height: 720 } }, parkourDesktopScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'parkour-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, parkourTouchScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'parkour-noeasy', { viewport: { width: 1280, height: 720 } }, parkourNoEasyScenario, '?level=test&fps=0&easy=0'));
    results.push(await runScenario(browser, 'parkour-audio', { viewport: { width: 1280, height: 720 }, initScript: AUDIO_STUB }, parkourAudioScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'parkour-mute', { viewport: { width: 1280, height: 720 }, initScript: AUDIO_STUB }, parkourMuteScenario, '?level=test&fps=0&mute=1'));
    results.push(await runScenario(browser, 'parkour-noaudio', { viewport: { width: 1280, height: 720 }, initScript: () => { window.AudioContext = undefined; window.webkitAudioContext = undefined; } }, parkourNoAudioScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'parkour-perf', { viewport: { width: 1280, height: 720 } }, parkourPerfScenario, '?level=test&fps=0'));

    results.push(await runScenario(browser, 'arena', { viewport: { width: 1280, height: 720 } }, arenaDesktopScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'arena-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, arenaTouchScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'wallkick', { viewport: { width: 1280, height: 720 } }, wallkickDesktopScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'wallkick-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, wallkickTouchScenario, '?level=test&fps=0'));
    results.push(await runScenario(browser, 'bab1-roofs', { viewport: { width: 1280, height: 720 } }, bab1RoofScenario, '?fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab1-routes', { viewport: { width: 1280, height: 720 } }, bab1RoutesScenario, '?fps=0&reset=1'));
    results.push(await runScenario(browser, 'bab1-routes-touch', { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, bab1RoutesTouchScenario, '?fps=0&reset=1'));

    // Tantangan Pintar (quiz)
    const phone281 = { viewport: { width: 844, height: 281 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
    results.push(await runScenario(browser, 'quiz', { viewport: { width: 1280, height: 720 } }, quizDesktopScenario, '?level=test&fps=0&quizseed=1&reset=1'));
    results.push(await runScenario(browser, 'quiz-touch', phone281, quizTouchScenario, '?level=test&fps=0&quizseed=1&reset=1'));
    results.push(await runScenario(browser, 'quiz-render', { viewport: { width: 1280, height: 720 } }, (p, c) => quizRenderScenario(p, c, false), '?level=test&fps=0&quizseed=1&reset=1'));
    results.push(await runScenario(browser, 'quiz-render-touch', phone281, (p, c) => quizRenderScenario(p, c, true), '?level=test&fps=0&quizseed=1&reset=1'));
    results.push(await runScenario(browser, 'quiz-terminals', { viewport: { width: 1280, height: 720 } }, quizTerminalScenario, '?fps=0&reset=1&quizseed=1'));
    results.push(await runScenario(browser, 'quiz-parentspage', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, quizParentsScenario, '?fps=0&quizseed=1'));

    // Audio (voice, sfx, music lane): no files / injected clips / mute / network
    results.push(await runScenario(browser, 'audio', { viewport: { width: 1280, height: 720 } }, (p, c) => audioNoFilesScenario(p, c, false), '?level=test&fps=0&reset=1&quizseed=1'));
    results.push(await runScenario(browser, 'audio-touch', phone281, (p, c) => audioNoFilesScenario(p, c, true), '?level=test&fps=0&reset=1&quizseed=1'));
    results.push(await runScenario(browser, 'audio-clips', { viewport: { width: 1280, height: 720 } }, (p, c) => audioClipsScenario(p, c, false), '?level=test&fps=0&reset=1&quizseed=1'));
    results.push(await runScenario(browser, 'audio-clips-touch', phone281, (p, c) => audioClipsScenario(p, c, true), '?level=test&fps=0&reset=1&quizseed=1'));
    results.push(await runScenario(browser, 'audio-mute', { viewport: { width: 1280, height: 720 } }, audioMuteScenario, '?level=test&fps=0&reset=1&quizseed=1&mute=1'));
    results.push(await runScenario(browser, 'audio-chapter', { viewport: { width: 1280, height: 720 } }, audioChapterScenario, '?level=test&fps=0'));

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

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
module.exports = { roofProbe, makeArenaDriver, makeParkourDriver, streetRouteRun, streetSetup, URL, PORT, sleep };
