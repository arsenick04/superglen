import type { Input } from '../input/Input';
import type { Player } from './Player';
import type { PlayerMode } from './PlayerConfig';

/**
 * The one Glen <-> Superglen switch. Touch: the star button ('transform'). PC: Q ('transform').
 * `interactToggles` additionally makes E ('interact') toggle: only the `test` level does that (story levels use E to talk).
 * `canToggle` lets the owner veto a press (locked controls, levels where Superglen is required).
 * Owned by the Game (story levels) and by the test area (which keeps its legacy E toggle).
 */
export class ModeController {
  constructor(
    private readonly player: Player,
    private readonly input: Input,
    /** Applies the mode (player, touch layout, flash ring): ctx.game.setPlayerMode. */
    private readonly setMode: (mode: PlayerMode) => void,
    private readonly interactToggles = false,
    private readonly canToggle: () => boolean = () => true,
  ) {}

  /** Call once per fixed step, before the player update (reads the press edge). */
  fixedUpdate(): void {
    const pressed = this.input.wasPressed('transform') || (this.interactToggles && this.input.wasPressed('interact'));
    if (pressed && this.canToggle()) this.toggle();
  }

  toggle(): void {
    this.set(this.player.mode === 'glen' ? 'superglen' : 'glen');
  }

  set(mode: PlayerMode): void {
    if (mode === this.player.mode) return;
    this.setMode(mode);
  }
}
