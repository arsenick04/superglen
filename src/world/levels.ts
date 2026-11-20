import type { LevelFactory } from './Level';
import { TestArea } from './TestArea';
import { DemoLevel } from './DemoLevel';
import { Bab1Level } from './bab1/Bab1Level';
import { Bab2Level } from './bab2/Bab2Level';
import { KotaLevel } from './kota/KotaLevel';
import { CurutArena } from './kota/CurutArena';
import { JumpTrainingLevel } from './arena/JumpTrainingLevel';
import { FlightTrainingLevel } from './arena/FlightTrainingLevel';
import { EagleArena } from './kota/EagleArena';

/**
 * Level that loads when the URL has no (valid) `?level=<id>` and nothing is saved yet (Chapter 1 starts in the city).
 * Returning players start where `progress.ts` says (`startPlanFor`).
 */
export const DEFAULT_LEVEL = 'kota';

/** All levels by id. Add a chapter here. An explicit `?level=<id>` is a debug start (the city then plays as free roam). */
export const LEVELS: Readonly<Record<string, LevelFactory>> = {
  test: () => new TestArea(),
  demo: () => new DemoLevel(),
  /** Kota Botanica, the open city: Chapter 1 begins here, free roam after it. */
  kota: () => new KotaLevel(),
  'battle-curut': () => new CurutArena(),
  'jump-training': () => new JumpTrainingLevel(),
  'flight-training': () => new FlightTrainingLevel(),
  'battle-elang': () => new EagleArena(),
  /** Inside the old Barongsai building: the rest of Chapter 1, Nino's lab. */
  lab: () => new Bab1Level('lab'),
  bab2: () => new Bab2Level(),
  /** Debug only: the old standalone Chapter 1 (street, building, lab in one level). */
  bab1street: () => new Bab1Level('street'),
};
