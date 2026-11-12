import type { LevelContext } from './Level';
import type { Sparkles } from './bab1/Fx';

const STAR_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 L40 23 L60 24.5 L45 38 L49.5 58 L32 47.5 L14.5 58 L19 38 L4 24.5 L24 23 Z" fill="#ffd23f" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M32 14 L36 25 L32 33 L28 25 Z" fill="#fff6b8" opacity="0.8"/></svg>';

/**
 * "Chapter done" moment shared by every chapter: confetti bursts over the player, then a big gold star with
 * "Chapter N selesai!" for about 3 s (CSS class `bab1-star`, `.show` while visible).
 *
 *   const party = new Celebration(ctx, 'Chapter 2 selesai!', sparkles);
 *   await party.play();
 */
export class Celebration {
  readonly element: HTMLDivElement;

  constructor(
    private readonly ctx: LevelContext,
    text: string,
    private readonly sparkles: Sparkles,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'bab1-star chapter-star';
    this.element.innerHTML = `${STAR_SVG}<div class="bab1-star-text">${text}</div>`;
    ctx.ui.append(this.element);
    ctx.onDispose(() => this.element.remove());
  }

  async play(): Promise<void> {
    const { seq, player: pl } = this.ctx;
    const sparkles = this.sparkles;
    for (let i = 0; i < 4; i++) {
      const p = pl.visualPosition;
      sparkles.burst(p.x + (i - 1.5) * 1.2, p.y + 2.5, p.z - 1, 40, 5, -1, { gravity: 3, life: 1.6, up: 1 });
      await seq.wait(0.25);
    }
    this.element.classList.remove('show');
    void this.element.offsetWidth;
    this.element.classList.add('show');
    // More confetti while the star is up.
    seq.run(async () => {
      for (let i = 0; i < 4; i++) {
        const p = pl.visualPosition;
        sparkles.burst(p.x + (i % 2 ? 1.6 : -1.6), p.y + 2.2, p.z - 0.5, 36, 5, -1, { gravity: 3, life: 1.6, up: 1 });
        await seq.wait(0.6);
      }
    });
    await seq.wait(3.2);
    this.element.classList.remove('show');
  }
}
