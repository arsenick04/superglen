/**
 * TV diagnostics overlay (`?tvdebug=1`, or a long press on "Kualitas grafis" in Settings). Meant to be photographed from the TV:
 * FPS, frame ms (update / render), draw calls and triangles, internal resolution, quality tier, whether the Gamepad API sees a
 * controller (id, mapping, pressed buttons, axes) and the last raw key / pointer events (so we learn whether the TV browser exposes
 * the pad or turns it into keys / a cursor). The event recorder is always on (a tiny ring buffer) and registered first, before any
 * handler can stop an event; the overlay itself only exists while it is switched on.
 */
import type * as THREE from 'three';

interface KeyRec {
  t: number;
  type: string;
  key: string;
  code: string;
  keyCode: number;
  trusted: boolean;
}

const MAX_KEYS = 6;

class TvDebug {
  enabled = false;
  private el: HTMLPreElement | null = null;
  private readonly keys: KeyRec[] = [];
  private moves = 0;
  private lastPointer = '-';
  private padEvents = 0;
  private lastText = -1e9;
  private lastNow = 0;
  private fps = 0;
  private updMs = 0;
  private renMs = 0;
  private frames = 0;
  private winStart = 0;
  private gl: THREE.WebGLRenderer | null = null;
  private stats: () => { ratio: number; tier: string; mode: string; scale: number } = () => ({ ratio: 1, tier: '?', mode: '?', scale: 1 });

  constructor() {
    try {
      this.enabled = new URLSearchParams(window.location.search).get('tvdebug') === '1';
    } catch {
      // ignore
    }
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    window.addEventListener('mousedown', this.onPointer, true);
    window.addEventListener('mouseup', this.onPointer, true);
    window.addEventListener('mousemove', this.onPointer, { capture: true, passive: true });
    window.addEventListener('gamepadconnected', () => this.padEvents++);
    window.addEventListener('gamepaddisconnected', () => this.padEvents++);
  }

  /** The game gives the renderer once (for renderer.info and the buffer size). */
  attach(renderer: THREE.WebGLRenderer, stats: () => { ratio: number; tier: string; mode: string; scale: number }): void {
    this.gl = renderer;
    this.stats = stats;
  }

  /** The gamepad hub registers its diagnostic lines here (avoids an import cycle through TvMode). */
  hubInfo: (() => string[]) | null = null;

  toggle(): void {
    this.enabled = !this.enabled;
    if (!this.enabled && this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  /** Once per rendered frame while enabled. */
  frame(now: number, updateMs: number, renderMs: number): void {
    const a = 0.1;
    this.updMs += (updateMs - this.updMs) * a;
    this.renMs += (renderMs - this.renMs) * a;
    this.frames++;
    if (this.winStart === 0) this.winStart = now;
    if (now - this.winStart >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.winStart);
      this.frames = 0;
      this.winStart = now;
    }
    if (now - this.lastText < 250) return;
    this.lastText = now;
    this.lastNow = now;
    this.draw();
  }

  private draw(): void {
    if (!this.el) {
      this.el = document.createElement('pre');
      this.el.className = 'tv-debug';
      document.body.appendChild(this.el);
    }
    const L: string[] = [];
    const q = this.stats();
    const info = this.gl?.info;
    const cv = this.gl?.domElement;
    L.push(`FPS ${this.fps.toFixed(1)}  tier ${q.tier} (mode ${q.mode})  scale ${q.scale}`);
    L.push(`ms update ${this.updMs.toFixed(1)}  render(cpu) ${this.renMs.toFixed(1)}`);
    if (info && cv) {
      L.push(`calls ${info.render.calls}  tris ${info.render.triangles}  geo ${info.memory.geometries}  tex ${info.memory.textures}  prog ${info.programs?.length ?? 0}`);
      L.push(`canvas ${cv.width}x${cv.height}  css ${cv.clientWidth}x${cv.clientHeight}  ratio ${q.ratio.toFixed(2)}  win ${window.innerWidth}x${window.innerHeight} dpr ${window.devicePixelRatio}`);
    }
    L.push(`fullscreen ${document.fullscreenElement ? 'yes' : 'no'}  lock ${document.pointerLockElement ? 'yes' : 'no'}`);
    // Gamepad API
    const sup = typeof navigator.getGamepads === 'function';
    let pads: (Gamepad | null)[] = [];
    try {
      pads = sup ? Array.from(navigator.getGamepads() ?? []) : [];
    } catch {
      // ignore
    }
    const live = pads.filter((p): p is Gamepad => !!p && p.connected);
    L.push(`gamepad api ${sup ? 'yes' : 'NO'}  pads ${live.length}  events ${this.padEvents}`);
    for (const p of live) {
      const pressed: number[] = [];
      for (let i = 0; i < p.buttons.length; i++) if (p.buttons[i].pressed) pressed.push(i);
      L.push(` ${p.index}: ${p.id.slice(0, 60)} map "${p.mapping}" b${p.buttons.length} a${p.axes.length}`);
      L.push(`   pressed ${pressed.length ? pressed.join(' ') : '-'}  axes ${Array.from(p.axes, (v) => v.toFixed(1)).join(' ')}`);
    }
    if (this.hubInfo) for (const ln of this.hubInfo()) L.push(ln);
    L.push(`pointer: moves ${this.moves}  last ${this.lastPointer}`);
    L.push('keys (newest last):');
    for (const k of this.keys) {
      L.push(` ${(((this.lastNow || performance.now()) - k.t) / 1000).toFixed(1)}s ${k.type === 'keydown' ? 'v' : '^'} key="${k.key}" code="${k.code}" kc=${k.keyCode}${k.trusted ? '' : ' (synthetic)'}`);
    }
    if (this.keys.length === 0) L.push(' (none yet)');
    this.el.textContent = L.join('\n');
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    const now = performance.now();
    this.keys.push({ t: now, type: e.type, key: e.key, code: e.code, keyCode: e.keyCode, trusted: e.isTrusted });
    if (this.keys.length > MAX_KEYS) this.keys.shift();
  };

  private readonly onPointer = (e: MouseEvent): void => {
    if (e.type === 'mousemove') {
      this.moves++;
      return;
    }
    this.lastPointer = `${e.type} btn ${e.button}${e.isTrusted ? '' : ' (synthetic)'}`;
  };
}

export const tvDebug = new TvDebug();
