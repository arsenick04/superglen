import type { Level, LevelContext } from '../Level';
import { GorillaArena } from '../arena/GorillaArena';
import { backToTraining } from '../progress';

/**
 * Gorilla practice: the real GorillaArena, run through a thin wrapper so it behaves as a first visit and changes nothing in the
 * save. The wrapper only swaps the pieces of the context the arena uses for story progress:
 *   - save: "forest-gorilla" never reads as done, chapters/where are not written;
 *   - dialog: the story lines (accusation, apology) are skipped, the fight starts at once;
 *   - game: the cinematic is skipped and the story's next level ("forest-firefight") becomes the training room.
 */
/** Property of the real object; functions stay bound to it (the proxies are only views). */
function pass(t: object, k: string | symbol): unknown {
  const v = Reflect.get(t, k, t);
  return typeof v === 'function' ? v.bind(t) : v;
}

export class PracticeGorilla implements Level {
  readonly id = 'practice-gorilla';
  private readonly inner = new GorillaArena();
  readonly spawn = this.inner.spawn;

  build(ctx: LevelContext): void {
    const save = new Proxy(ctx.save, {
      get: (t, k) => {
        if (k === 'isChapterDone') return () => false;
        if (k === 'markChapterDone' || k === 'setWhere') return () => undefined;
        return pass(t, k);
      },
    });
    const dialog = new Proxy(ctx.dialog, {
      get: (t, k) => {
        if (k === 'say') {
          return (line: unknown, ...rest: unknown[]) =>
            typeof line === 'object' && line !== null && (line as { id?: string }).id?.startsWith('forest_')
              ? Promise.resolve()
              : (t.say as (...a: unknown[]) => Promise<void>).call(t, line, ...rest);
        }
        return pass(t, k);
      },
    });
    const game = new Proxy(ctx.game, {
      get: (t, k) => {
        if (k === 'playCinematic') return () => Promise.resolve();
        if (k === 'loadLevel') return () => { ctx.save.addCoins(10); ctx.quiz.coinsChanged(); return backToTraining(t); };
        return pass(t, k);
      },
    });
    const view = new Proxy(ctx, {
      get: (t, k) => (k === 'save' ? save : k === 'dialog' ? dialog : k === 'game' ? game : pass(t, k)),
    });
    this.inner.build(view as LevelContext);
    const exit = document.createElement('button');
    exit.className = 'arena-return';
    exit.textContent = 'Kembali ke ruang latihan';
    exit.addEventListener('click', () => { void backToTraining(ctx.game); });
    ctx.ui.appendChild(exit);
    ctx.onDispose(() => exit.remove());
  }

  fixedUpdate(dt: number): void { this.inner.fixedUpdate(dt); }
  update(dt: number): void { this.inner.update(dt); }
  dispose(): void { this.inner.dispose(); }
}
