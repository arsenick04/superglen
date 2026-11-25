import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/Game';
import { versionGuard } from './core/VersionGuard';
import { characterModels } from './player/CharacterModels';
import { crowdModels } from './world/kota/Crowd';
import { envModels } from './world/kota/EnvModels';
import { cityModels } from './world/kota/CityModels';
import { preloadSky } from './world/kota/Sky';
import { enemyModels } from './world/kota/EnemyModels';
import { loadBikeTemplate } from './world/kota/BikeModel';
import { preloadCityNature } from './world/kota/CityNature';
import { TitleMenu, shouldShowTitle } from './ui/TitleMenu';
import { compatibilityMode, isPlayStationBrowser } from './core/Platform';

function showFatal(err: unknown): void {
  const ui = document.getElementById('ui');
  if (!ui) return;
  const box = document.createElement('div');
  box.className = 'fatal-message';
  const canvas = document.createElement('canvas');
  let webgl2 = false;
  try { webgl2 = !!canvas.getContext('webgl2'); } catch { /* diagnostics only */ }
  const reason = !webgl2
    ? 'Browser ini belum menyediakan WebGL 2.'
    : typeof WebAssembly === 'undefined'
      ? 'Browser ini belum menyediakan WebAssembly.'
      : 'Memori browser tidak cukup atau komponen 3D gagal dimuat.';
  box.textContent = `Maaf, game tidak bisa dimulai. ${reason}${isPlayStationBrowser() ? ' Mode PS5 sudah aktif.' : ''} Coba muat ulang halaman.`;
  box.dataset.error = err instanceof Error ? err.name : 'boot';
  ui.replaceChildren(box);
}

async function loadAssets(compat: boolean): Promise<void> {
  await RAPIER.init();
  if (compat) {
    await envModels.load();
    await enemyModels.load();
    await cityModels.load();
    await preloadSky();
  } else {
    await Promise.all([envModels.load(), enemyModels.load(), cityModels.load(), preloadSky()]);
  }
  // Do not reveal procedural/blocky character placeholders on the first playable frame.
  // If a GLB genuinely fails, Avatar still keeps its safe fallback instead of blocking startup forever.
  await characterModels.load();
  await crowdModels.load();
  await preloadCityNature();
  await loadBikeTemplate(); // never rejects; the bike visual then builds during the level build, before the shader prewarm
}

async function boot(): Promise<void> {
  const compat = compatibilityMode();
  // No top-level await (Safari iOS 16 build target): init Rapier inside an async function. The city's environment models
  // (about 45 KB) load alongside: the city is built from them right after (primitive fallback if they fail).
  // The owner's enemy models (about 2.5 MB for the chapters that exist) load alongside; each enemy keeps its procedural figure if they fail.
  // L18: the Kenney city kit and the owner's buildings (about 6 MB) as well; each building keeps its procedural look if they fail.
  // Initialise the large WASM module alone. Decoding every GLB/HDR at the same time caused a high peak-memory failure in the
  // PlayStation browser. Console compatibility mode loads the optional libraries sequentially; all have procedural fallbacks.
  // The title menu does not wait for the assets: they load while it is on screen (the pick waits for them if still running).
  const assets = loadAssets(compat);
  let assetsReady = false;
  void assets.then(() => {
    assetsReady = true;
  });
  const container = document.getElementById('game');
  if (!container) throw new Error('#game container missing');
  const ui = document.getElementById('ui');
  const launch = (mode: 'plain' | 'new' | 'continue' | 'parents'): Game => {
    const game = new Game(container);
    if (!document.hidden) game.start();
    void versionGuard.check(); // on the start screen a newer build reloads right away
    if (mode === 'new' || mode === 'continue') game.startFromMenu();
    else if (mode === 'parents') game.openParents();
    return game;
  };
  if (ui && shouldShowTitle()) {
    // Title menu first (Main Baru / Lanjutkan / Pengaturan). The pick creates the Game inside the tap, so audio can unlock.
    const title: { menu: TitleMenu | null } = { menu: null };
    let picked = false;
    title.menu = new TitleMenu(ui, (choice) => {
      if (assetsReady) {
        // Synchronous path keeps the tap gesture alive for the audio unlock.
        title.menu?.remove();
        launch(choice.mode);
      } else if (!picked) {
        picked = true;
        void assets.then(() => {
          title.menu?.remove();
          launch(choice.mode);
        }).catch((err: unknown) => showFatal(err));
      }
    });
    (window as unknown as { __sgTitleMenu?: unknown }).__sgTitleMenu = title.menu.debugHandle();
    (window as unknown as { __sgBooted?: boolean }).__sgBooted = true; // silences the index.html boot guard
  } else {
    await assets;
    launch('plain');
    (window as unknown as { __sgBooted?: boolean }).__sgBooted = true;
  }
}

boot().catch((err: unknown) => {
  console.error('Superglen failed to start:', err);
  showFatal(err);
});
