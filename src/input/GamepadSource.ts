import type { Action, InputSource, Vec2 } from './Input';
import { ACTIONS } from './Input';
import { padHub, PadBtn, PadConfig, PAD_BUTTONS } from './GamepadHub';
import { startGate } from '../core/StartGate';

/**
 * Pad buttons per action (the same actions the keyboard and the touch buttons drive; nothing new):
 * Cross = jump (held = same as Space: flight / rhythm jump), Square = talk / take, Triangle = Glen <-> Superglen,
 * R2 or Circle = laser, L2 or L1 = shield.
 */
const PAD_ACTIONS: Readonly<Record<Action, readonly number[]>> = {
  jump: [PadBtn.cross],
  interact: [PadBtn.square],
  transform: [PadBtn.triangle],
  laser: [PadBtn.r2, PadBtn.circle],
  shield: [PadBtn.l2, PadBtn.l1],
};

/**
 * Controller input (left stick / D-pad = move, right stick = camera, buttons above). The hub does the polling and the
 * mapping tables; this source only turns hub state into the InputSource contract. Before the first start press it stays
 * silent so the press that starts the game does not also jump.
 */
export class GamepadSource implements InputSource {
  readonly move: Vec2 = { x: 0, y: 0 };

  private readonly seen = new Uint32Array(PAD_BUTTONS);
  private readonly latch: Record<Action, boolean> = { jump: false, laser: false, shield: false, interact: false, transform: false };
  private readonly downNow: Record<Action, boolean> = { jump: false, laser: false, shield: false, interact: false, transform: false };
  private lookX = 0;
  private lookY = 0;
  private lastSeq = -1;

  update(): void {
    const h = padHub;
    if (!h.connected || !startGate.started) {
      this.move.x = 0;
      this.move.y = 0;
      for (const a of ACTIONS) this.downNow[a] = false;
      this.sync();
      return;
    }
    this.move.x = h.move.x;
    this.move.y = h.move.y;
    if (h.seq !== this.lastSeq) {
      // Look is a rate: apply once per hub poll.
      this.lastSeq = h.seq;
      this.lookX += h.look.x * PadConfig.lookYawRate * h.dt;
      this.lookY += h.look.y * PadConfig.lookPitchRate * h.dt;
    }
    for (let k = 0; k < ACTIONS.length; k++) {
      const a = ACTIONS[k];
      const btns = PAD_ACTIONS[a];
      let down = false;
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        const fresh = h.count[b] !== this.seen[b];
        this.seen[b] = h.count[b];
        if (h.swallowed[b]) continue;
        if (h.down[b]) down = true;
        if (fresh) this.latch[a] = true;
      }
      this.downNow[a] = down;
    }
  }

  drainLook(out: Vec2): void {
    out.x += this.lookX;
    out.y += this.lookY;
    this.lookX = 0;
    this.lookY = 0;
  }

  isDown(action: Action): boolean {
    return this.downNow[action];
  }

  drainPressed(action: Action): boolean {
    const v = this.latch[action];
    this.latch[action] = false;
    return v;
  }

  /** Mark every press so far as seen (while a menu or the pause had the game loop stopped). */
  sync(): void {
    for (let i = 0; i < PAD_BUTTONS; i++) this.seen[i] = padHub.count[i];
  }

  reset(): void {
    this.move.x = 0;
    this.move.y = 0;
    this.lookX = 0;
    this.lookY = 0;
    for (const a of ACTIONS) {
      this.latch[a] = false;
      this.downNow[a] = false;
    }
    this.sync();
  }

  dispose(): void {}
}
