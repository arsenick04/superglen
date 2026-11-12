import type { SaveStore } from '../core/Save';

/**
 * The chapter flow in one place (single source of truth for "where does the game start" and "where does Nino
 * send me next"). Pure functions of the save, no side effects.
 *
 *   fresh save                    -> bab1 (story)
 *   bab1 done, bab2 not           -> bab1 lab (Nino there starts Chapter 2, so does the glowing door)
 *   bab2 done                     -> bab2 training hall, free play
 */
export function startLevelFor(save: SaveStore): string {
  if (!save.isChapterDone('bab1')) return 'bab1';
  if (save.isChapterDone('bab2')) return 'bab2';
  return 'bab1';
}

/** What talking to Nino in the lab does: the line to say and the level to fade to afterwards (null = stay). */
export function labNinoTalk(save: SaveStore): { line: string; next: string | null } {
  if (!save.isChapterDone('bab2')) return { line: 'bab1_nino_besok', next: 'bab2' };
  return { line: 'bab2_nino_hebat', next: null };
}

/** Where the glowing lab door leads (the training hall). */
export const LAB_DOOR_TARGET = 'bab2';
/** Where the hall's exit door leads (the finished lab). */
export const HALL_DOOR_TARGET = 'bab1';
