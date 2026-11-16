import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/Game';
import { versionGuard } from './core/VersionGuard';
import { characterModels } from './player/CharacterModels';
import { envModels } from './world/kota/EnvModels';

function showFatal(): void {
  const ui = document.getElementById('ui');
  if (!ui) return;
  const box = document.createElement('div');
  box.className = 'fatal-message';
  box.textContent = 'Maaf, game tidak bisa dimulai. Coba muat ulang halaman.';
  ui.replaceChildren(box);
}

async function boot(): Promise<void> {
  // The animated characters download while Rapier starts and the start screen shows (the low-poly figures stand in until then).
  void characterModels.load();
  // No top-level await (Safari iOS 16 build target): init Rapier inside an async function. The city's environment models
  // (about 45 KB) load alongside: the city is built from them right after (primitive fallback if they fail).
  await Promise.all([RAPIER.init(), envModels.load()]);
  const container = document.getElementById('game');
  if (!container) throw new Error('#game container missing');
  const game = new Game(container);
  if (!document.hidden) game.start();
  void versionGuard.check(); // on the start screen a newer build reloads right away
}

boot().catch((err: unknown) => {
  console.error('Superglen failed to start:', err);
  showFatal();
});
