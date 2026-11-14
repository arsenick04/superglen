import { touchMode } from '../../core/TouchMode';
import type { LevelContext } from '../Level';
import type { Action } from '../../input/Input';
import { padHub } from '../../input/GamepadHub';
import { padGlyph } from '../../ui/PadGlyphs';

/**
 * Picture-only hints for the powers: "press and HOLD the jump button" (touch: a ring that closes onto the button;
 * PC: a Space key cap with a filling bar) and a pop on a freshly unlocked touch button.
 */
export class HoldHint {
  private readonly key: HTMLDivElement;
  private on = false;

  constructor(ctx: LevelContext) {
    this.key = document.createElement('div');
    this.key.className = 'b2-key';
    this.key.hidden = true;
    this.key.innerHTML = `<div class="b2-cap">Spasi</div><div class="b2-cap-pad">${padGlyph('cross')}</div><div class="b2-bar"><i></i></div>`;
    ctx.ui.appendChild(this.key);
    const sync = (): void => {
      this.key.hidden = !this.on || (touchMode.active && !padHub.deviceActive);
    };
    padHub.onActiveChange(sync);
    ctx.onDispose(() => {
      this.key.remove();
      document.documentElement.classList.remove('b2-hold');
    });
  }

  get shown(): boolean {
    return this.on;
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.key.hidden = !on || (touchMode.active && !padHub.deviceActive);
    document.documentElement.classList.toggle('b2-hold', on);
  }
}

/** Play a short grow-and-settle animation on a touch button (no effect without touch UI). */
export function popButton(action: Action): void {
  const b = document.querySelector<HTMLElement>(`.tc-button[data-action="${action}"]`);
  if (!b) return;
  b.classList.remove('tc-pop');
  void b.offsetWidth;
  b.classList.add('tc-pop');
  window.setTimeout(() => b.classList.remove('tc-pop'), 700);
}
