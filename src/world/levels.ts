import type { LevelFactory } from './Level';
import { TestArea } from './TestArea';
import { DemoLevel } from './DemoLevel';
import { Bab1Level } from './bab1/Bab1Level';
import { Bab2Level } from './bab2/Bab2Level';

/**
 * Level that loads when the URL has no (valid) `?level=<id>` and nothing is saved yet. Returning players start where
 * `progress.ts` says (`startLevelFor`).
 */
export const DEFAULT_LEVEL = 'bab1';

/** All levels by id. Add a chapter here: `bab1: () => new Bab1Level()`. */
export const LEVELS: Readonly<Record<string, LevelFactory>> = {
  test: () => new TestArea(),
  demo: () => new DemoLevel(),
  bab1: () => new Bab1Level(),
  bab2: () => new Bab2Level(),
};
