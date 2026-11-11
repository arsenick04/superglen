import type { Input } from '../input/Input';
import type { Player } from './Player';
import type { PlayerMode } from './PlayerConfig';

/**
 * TEMPORARY test-area switch Glen <-> Superglen. Later the transformation happens in the lab
 * (story trigger); delete this file and its use in core/Game.ts then.
 * PC: E ('interact'). Touch: the star button ('transform'), or the Bicara/Ambil button in Glen mode.
 */
export class ModeController {
  constructor(
    private readonly player: Player,
    private readonly input: Input,
    private readonly onChange: (mode: PlayerMode) => void,
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
    this.player.setMode(mode);
    this.onChange(mode);
  }
}
