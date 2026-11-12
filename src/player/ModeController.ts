import type { Input } from '../input/Input';
import type { Player } from './Player';
import type { PlayerMode } from './PlayerConfig';

/**
 * TEMPORARY test-area switch Glen <-> Superglen. Owned by the `test` level only (world/TestArea.ts);
 * story levels change the mode through the level context (`ctx.game.setPlayerMode`).
 * PC: E ('interact'). Touch: the star button ('transform'), or the Bicara/Ambil button in Glen mode.
 */
export class ModeController {
  constructor(
    private readonly player: Player,
    private readonly input: Input,
    /** Applies the mode (player, touch layout, flash ring): ctx.game.setPlayerMode. */
    private readonly setMode: (mode: PlayerMode) => void,
  ) {}

  /** Call once per fixed step, before the player update (reads the press edge). */
  fixedUpdate(): void {
    if (this.input.wasPressed('interact') || this.input.wasPressed('transform')) this.toggle();
  }

  toggle(): void {
    this.set(this.player.mode === 'glen' ? 'superglen' : 'glen');
  }

  set(mode: PlayerMode): void {
    if (mode === this.player.mode) return;
    this.setMode(mode);
  }
}
