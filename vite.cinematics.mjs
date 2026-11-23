import fs from 'node:fs';

/**
 * Ids of the cinematics that exist as public/cinematics/cin_<id>.mp4. Injected as `__CINEMATICS__` so the game never asks for a
 * missing film (a 404 would show up as a console error): a missing one is skipped gracefully. Read when the dev server or the
 * build starts (restart the dev server after adding a file).
 */
export function cinematicIds() {
  try {
    return fs.readdirSync('public/cinematics').map((f) => /^cin_(.+)\.mp4$/.exec(f)?.[1] ?? '').filter(Boolean);
  } catch {
    return [];
  }
}
