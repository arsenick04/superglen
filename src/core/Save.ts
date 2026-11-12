import type { PlayerMode } from '../player/PlayerConfig';

/**
 * Progress storage. One versioned JSON blob in localStorage under `superglen.save.v1`.
 *
 * Every storage access is wrapped in try/catch (Safari private mode and blocked storage throw);
 * the in-memory copy is always the source of truth, so the game works the same without storage.
 *
 *   save.markChapterDone('bab1');
 *   if (save.data.skills.fly) ...
 *   save.unlockSkill('laser');
 */
export const SAVE_KEY = 'superglen.save.v1';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  chaptersDone: string[];
  skills: { laser: boolean; shield: boolean; fly: boolean };
  /** Mode the player was in last (restored by levels that want it). */
  lastMode: PlayerMode;
}

export type SkillName = keyof SaveData['skills'];

function defaults(): SaveData {
  return { version: SAVE_VERSION, chaptersDone: [], skills: { laser: false, shield: false, fly: false }, lastMode: 'glen' };
}

/** Merge untrusted parsed JSON into a valid SaveData (unknown or malformed fields fall back to defaults). */
function sanitize(raw: unknown): SaveData {
  const out = defaults();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.chaptersDone)) out.chaptersDone = r.chaptersDone.filter((x): x is string => typeof x === 'string');
  if (typeof r.skills === 'object' && r.skills !== null) {
    const s = r.skills as Record<string, unknown>;
    out.skills.laser = s.laser === true;
    out.skills.shield = s.shield === true;
    out.skills.fly = s.fly === true;
  }
  if (r.lastMode === 'glen' || r.lastMode === 'superglen') out.lastMode = r.lastMode;
  return out;
}

export class SaveStore {
  data: SaveData = defaults();

  constructor() {
    if (new URLSearchParams(window.location.search).get('reset') === '1') this.reset();
    else this.reload();
  }

  /** Re-read from storage (or keep the in-memory data when storage is unavailable or corrupt). */
  reload(): void {
    try {
      const txt = window.localStorage.getItem(SAVE_KEY);
      if (txt) this.data = sanitize(JSON.parse(txt));
    } catch {
      // Storage blocked or JSON corrupt: keep what we have in memory.
    }
  }

  /** Write to storage. Failure is silent: progress stays in memory for this session. */
  persist(): void {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Safari private mode / quota: ignore.
    }
  }

  /** Forget everything (also used by `?reset=1`). */
  reset(): void {
    this.data = defaults();
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }

  isChapterDone(id: string): boolean {
    return this.data.chaptersDone.includes(id);
  }

  markChapterDone(id: string): void {
    if (!this.data.chaptersDone.includes(id)) this.data.chaptersDone.push(id);
    this.persist();
  }

  unlockSkill(name: SkillName): void {
    this.data.skills[name] = true;
    this.persist();
  }

  setLastMode(mode: PlayerMode): void {
    if (this.data.lastMode === mode) return;
    this.data.lastMode = mode;
    this.persist();
  }
}
