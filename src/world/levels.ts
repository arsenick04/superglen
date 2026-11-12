import type { LevelFactory } from './Level';
import { TestArea } from './TestArea';
import { DemoLevel } from './DemoLevel';

/**
 * Level that loads when the URL has no (valid) `?level=<id>`. Part 2 of package B1 switches this to Bab 1.
 */
export const DEFAULT_LEVEL = 'test';

/** All levels by id. Add a chapter here: `bab1: () => new Bab1Level()`. */
export const LEVELS: Readonly<Record<string, LevelFactory>> = {
  test: () => new TestArea(),
  demo: () => new DemoLevel(),
};
