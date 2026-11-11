import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/Game';

function showFatal(): void {
  const ui = document.getElementById('ui');
  if (!ui) return;
  const box = document.createElement('div');
  box.className = 'fatal-message';
  box.textContent = 'Maaf, game tidak bisa dimulai. Coba muat ulang halaman.';
  ui.replaceChildren(box);
}

async function boot(): Promise<void> {
  // No top-level await (Safari iOS 16 build target): init Rapier inside an async function.
  await RAPIER.init();
  const container = document.getElementById('game');
  if (!container) throw new Error('#game container missing');
  const game = new Game(container);
  if (!document.hidden) game.start();
}

boot().catch((err: unknown) => {
  console.error('Superglen failed to start:', err);
  showFatal();
});
