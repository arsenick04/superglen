import { padHub } from '../input/GamepadHub';

/**
 * `?pad=debug`: a tiny read-only overlay for finding out what a browser (e.g. the PS5 one) reports: Gamepad API presence,
 * pad id / mapping, axes, pressed buttons, and the WebGL version and renderer string. Updated ten times per second.
 */
export class PadDebug {
  private readonly el: HTMLPreElement;
  private lastMs = -1e9;
  private readonly gl: string;

  constructor(root: HTMLElement, gl: WebGLRenderingContext | WebGL2RenderingContext | null) {
    this.el = document.createElement('pre');
    this.el.className = 'pad-debug';
    root.appendChild(this.el);
    this.gl = describeGl(gl);
  }

  update(nowMs: number): void {
    if (nowMs - this.lastMs < 100) return;
    this.lastMs = nowMs;
    const h = padHub;
    const lines: string[] = [`webgl ${this.gl}`, `gamepad api: ${h.supported ? 'yes' : 'NO'}`];
    const pad = h.pad;
    if (!pad) {
      lines.push('pad: none (press a button)');
    } else {
      lines.push(`pad: ${pad.id}`, `index ${pad.index}  mapping "${pad.mapping}"  table ${h.table}`);
      lines.push('axes: ' + Array.from(pad.axes, (a) => a.toFixed(2)).join(' '));
      const pressed: number[] = [];
      for (let i = 0; i < pad.buttons.length; i++) if (pad.buttons[i].pressed) pressed.push(i);
      lines.push('buttons: ' + (pressed.length ? pressed.join(' ') : '-') + `  (of ${pad.buttons.length})`);
      lines.push(`active device: ${h.deviceActive ? 'pad' : 'other'}`);
    }
    this.el.textContent = lines.join('\n');
  }
}

function describeGl(gl: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  if (!gl) return 'none';
  try {
    const v = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 2 : 1;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    return `${v}  ${name}`;
  } catch {
    return '?';
  }
}
