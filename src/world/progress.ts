import type { SaveStore, SlotSave } from '../core/Save';
import type { LevelGame } from './Level';
import { CITY_LAYOUT } from './kota/CityData';
import { Z } from './bab1/Layout';
import { Combat } from '../config/combat';
import { MARKET } from './kota/Bab3Data';

/**
 * The chapter flow in one place (single source of truth for "where does the game start", "where does a door lead" and
 * "where does Nino send me next"). Level ids of the story:
 *
 *   kota   Kota Botanica, the open city. Chapter 1 starts here (walk home from school, guided to the hidden hill).
 *   lab    Inside the old Barongsai building: dark hall, panel, laboratory, Nino, the costume (rest of Chapter 1).
 *   bab2   Nino's training hangar behind the lab (Chapter 2).
 *
 * Continue (`startPlanFor`), from the save:
 *   Chapter 1 not done   -> lab when the child was last inside it ("where" = lab), else the city at the school
 *   Chapter 1 done only  -> the city at the hill door when the child was last outside, else the lab (Nino starts Chapter 2)
 *   Chapter 2 done       -> the manual save slot when it is newer than the end of Chapter 2, else the city at the hill door
 *
 * Doors: city hill door <-> lab entrance (walk in / walk out), lab glowing door <-> hangar.
 */

/** Where a level should put the player when it was entered through a door (consumed by the level's build). */
export type Arrival =
  | 'marketBattle'
  | 'snakeVictory'
  | 'rakusVictory'
  | 'elangVictory'
  | 'bankApproach'
  /** City: outside Glen's house on the next morning. */
  | 'homeMorning'
  /** City: in front of the old building's door on the hill, facing away from it. */
  | 'hillDoor'
  /** Lab: just inside the old building's front door. */
  | 'labEntrance'
  /** Lab: next to the glowing hangar door (back from Chapter 2). */
  | 'labFromHangar';

let pending: { level: string; arrival: Arrival } | null = null;

/**
 * Debug free roam: the page was opened with an explicit `?level=<id>`. The city then plays as before D2 (every power, the
 * plaza spawn, no Chapter 1 walk), whatever the save says. Set once by the Game at startup.
 */
export const flow = { sandbox: false, /** `?free=1`: the debug free roam even when the save says Chapter 3 is waiting. */ free: false };

/** Chapter 3 (the market) is waiting: Chapter 2 is done, Chapter 3 is not. */
export function marketPending(save: SaveStore): boolean {
  return save.isChapterDone('bab2') && !save.isChapterDone('bab3');
}

/**
 * True when the story must run even though the page was opened with `?level=...`: a child whose save says "Chapter 2 done,
 * Chapter 3 not" must never land in a silent free roam (the market waits). `?free=1` keeps the pure free roam for tests.
 */
export function sandboxActive(save: SaveStore): boolean {
  return flow.sandbox && (flow.free || !marketPending(save));
}

/** Remember where the next build of `level` should put the player. */
export function setArrival(level: string, arrival: Arrival): void {
  pending = { level, arrival };
}

/** Called by a level's build: the arrival meant for it (once), or null. */
export function takeArrival(level: string): Arrival | null {
  if (!pending || pending.level !== level) return null;
  const a = pending.arrival;
  pending = null;
  return a;
}

/** Fade to a level and arrive at a door spot. */
export function travel(game: LevelGame, level: string, arrival: Arrival): Promise<void> {
  setArrival(level, arrival);
  return game.loadLevel(level);
}

/** Feet spot in the city in front of the old building's door (outside the door's walk-in zone), facing south (+z). */
export const HILL_DOOR_SPOT = { x: CITY_LAYOUT.lab.door.x, y: CITY_LAYOUT.lab.door.y, z: CITY_LAYOUT.lab.door.z + 4.6, yaw: 0 } as const;

/** Retreat outside Pasar while combat is pending; after victory return inside for the counting story. */
export function marketBattleSpawn(step: string): { x: number; y: number; z: number; yaw: number } {
  return step === 'chase' ? { ...Combat.rat.arena.returnSpot } : { x: MARKET.hub.x, y: 0, z: 12, yaw: Math.PI };
}

/** What the game loads on start. `slot`: teleport there after loading `level`. */
export interface StartPlan {
  level: string;
  arrival?: Arrival;
  slot?: SlotSave;
}

export function startPlanFor(save: SaveStore): StartPlan {
  if (save.previewBattle) return { level: 'battle-curut' };
  if (save.previewChapter === 2) return { level: 'bab2' };
  if (save.previewFlightTraining) return { level: 'flight-training' };
  if (save.previewChapter === 7) return { level: 'kota', arrival: 'bankApproach' };
  if (save.previewChapter === 8 || save.data.interlude === 'forest_training') return { level: 'forest-training' };
  if (save.data.interlude === 'elang_met') return { level: 'battle-elang' };
  if (save.data.interlude === 'elang_home') return { level: 'kota', arrival: 'elangVictory' };
  const where = save.data.where;
  if (!save.isChapterDone('bab1')) return where === 'lab' ? { level: 'lab' } : { level: 'kota' };
  if (!save.isChapterDone('bab2') && save.data.interlude === 'costume_home') return { level: where === 'lab' ? 'lab' : 'kota' };
  if (!save.isChapterDone('bab2') && save.data.interlude === 'costume_return') return where === 'lab' ? { level: 'lab' } : { level: 'kota', arrival: 'homeMorning' };
  if (!save.isChapterDone('bab2')) return where === 'kota' ? { level: 'kota', arrival: 'hillDoor' } : { level: 'lab' };
  if (save.data.interlude === 'snake_lab') return where === 'lab' ? { level: 'lab' } : { level: 'kota', arrival: 'snakeVictory' };
  if (save.data.interlude === 'snake_home') return where === 'lab' ? { level: 'lab' } : { level: 'kota' };
  if (save.data.interlude === 'snake_return') return where === 'lab' ? { level: 'lab' } : { level: 'kota', arrival: 'homeMorning' };
  if (save.data.interlude === 'rakus_home' || save.data.interlude === 'rakus_letters' || save.data.interlude === 'rakus_lab') {
    const slot = save.data.slot;
    if (save.data.interlude === 'rakus_lab' && where === 'lab') return { level: 'lab' };
    if (slot?.level === 'kota' && slot.t >= (save.data.doneAt.bab6 ?? Infinity)) return { level: 'kota', slot: { ...slot } };
    return { level: 'kota', arrival: save.data.interlude === 'rakus_home' ? 'rakusVictory' : 'homeMorning' };
  }
  if (save.data.interlude === 'elang_bank') {
    if (where === 'lab') return { level: 'lab' };
    const slot = save.data.slot;
    if (slot?.level === 'kota' && slot.t >= (save.data.doneAt.bab6 ?? Infinity)) return { level: 'kota', slot: { ...slot } };
    return { level: 'kota', arrival: 'hillDoor' };
  }
  const slot = save.data.slot;
  // An encounter slot is valid only while that encounter's story step is
  // still active. This also protects old saves made just before a delayed
  // victory return completed.
  const validSlot = slot?.level !== 'battle-curut' || save.data.bab3.step === 'chase';
  if (slot && validSlot && slot.t > 0 && slot.t >= (save.data.doneAt.bab2 ?? 0)) return { level: slot.level, slot: { ...slot } };
  return { level: 'kota', arrival: 'hillDoor' };
}

/** Level id the game starts with (see `startPlanFor`). */
export function startLevelFor(save: SaveStore): string {
  return startPlanFor(save).level;
}

/**
 * Bring a save of an older version onto the current flow (idempotent; never touches chaptersDone, skills or the quiz).
 *   - The old standalone Chapter 1 level 'bab1' (street + building + lab) is gone: a manual slot there moves into the
 *     'lab' (same coordinates for the hall and the lab) or, when it was on the street, to the city at the hill door.
 *   - "where" was the Chapter 1 level: inside the lab now.
 *   - Whoever finished Chapter 1 has found the old building: it shows on the city map.
 * Returns true when something changed (the caller persists).
 */
export function migrateSave(save: SaveStore): boolean {
  const d = save.data;
  let changed = false;
  const sl = d.slot;
  if (sl && sl.level === 'bab1') {
    if (sl.z > Z.facade - 0.6) d.slot = { ...sl, level: 'kota', x: HILL_DOOR_SPOT.x, y: HILL_DOOR_SPOT.y, z: HILL_DOOR_SPOT.z, yaw: HILL_DOOR_SPOT.yaw };
    else d.slot = { ...sl, level: 'lab' };
    changed = true;
  }
  if (d.where === 'bab1') {
    d.where = 'lab';
    changed = true;
  }
  if (save.isChapterDone('bab1') && !d.discovered.lab) {
    d.discovered.lab = true;
    changed = true;
  }
  return changed;
}

/** What talking to Nino in the lab does: the line to say and the level to fade to afterwards (null = stay). */
export function labNinoTalk(save: SaveStore): { line: string | null; next: string | null; clearInterlude?: boolean } {
  if (!save.isChapterDone('bab2') && save.data.interlude === 'costume_home') return { line: 'bab1_nino_pulang_dulu', next: null };
  if (!save.isChapterDone('bab2') && save.data.interlude === 'costume_return') return { line: null, next: 'bab2', clearInterlude: true };
  if (save.data.interlude === 'snake_return') return { line: 'bab5_nino_latihan_besok', next: 'jump-training' };
  if (save.data.interlude === 'rakus_lab') return { line: 'rakus_nino_lab_arrival', next: 'flight-training' };
  if (save.data.interlude === 'elang_bank' || save.data.interlude === 'elang_met') return { line: 'elang_nino_alarm', next: null };
  if (!save.isChapterDone('bab2')) return { line: 'bab1_nino_besok', next: 'bab2' };
  return { line: 'bab2_nino_hebat', next: null };
}

/** Where the glowing lab door leads (the training hall). */
export const LAB_DOOR_TARGET = 'bab2';
/** Where the hall's exit door leads (the lab, arriving next to the glowing door). */
export const HALL_DOOR_TARGET = 'lab';
/** Where the old building's front door leads from the inside (the city, at the hill door). */
export const LAB_EXIT_TARGET = 'kota';
