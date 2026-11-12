import { perfMark, PerfMark } from '../core/PerfMarks';
import type { Input } from '../input/Input';
import type { DialogBubble } from '../ui/DialogBubble';
// Lines written by the content pipeline: [{ id, speaker, lang, text }]. Audio for line `id` will be
// public/audio/{id}.mp3 (package B4); the game works without it.
import dialogData from '../../audio/dialog.json';

export interface DialogLine {
  id: string;
  speaker: string;
  lang?: string;
  text: string;
}

/** A line id from the table, or a literal line (optionally with an id for the audio manager). */
export type LineRef = string | { speaker: string; text: string; id?: string };

export interface SayOptions {
  /** Player cannot move/jump while this line shows (camera look still works). Default false. */
  lockControls?: boolean;
  /** Advance by itself after `duration`. Default true (the player may not be able to read). */
  autoAdvance?: boolean;
  /** Seconds the line stays; default max(2.2, 0.09 * characters). Can be changed later with setLineDuration. */
  duration?: number;
}

export interface LineInfo {
  id: string | undefined;
  speaker: string;
  text: string;
}

export type LineStartListener = (id: string | undefined, speaker: string, text: string) => void;

/** Auto-advance time: long enough to listen to the voice, at least 2.2 s. */
export function defaultLineDuration(text: string): number {
  return Math.max(2.2, 0.09 * text.length);
}

/** A manual tap/press is ignored for this long after a line starts, so a double-tap cannot skip it unread. */
const ADVANCE_GUARD = 0.35;
/** The bubble stays up this long between two lines (a script awaiting `say` twice would otherwise flicker). */
const IDLE_HIDE = 0.15;
const FALLBACK_TEXT = '…';

interface Item {
  info: LineInfo;
  lock: boolean;
  auto: boolean;
  duration: number;
  /** Settle the promise returned to the caller (only the last line of a `sequence` has one). */
  done: (() => void) | null;
}

export class Dialog {
  private readonly table = new Map<string, DialogLine>();
  private readonly warned = new Set<string>();
  private readonly queue: Item[] = [];
  private current: Item | null = null;
  private elapsed = 0;
  private idle = 0;
  private lastLock = false;
  private tapPending = false;
  private locked = false;
  private readonly listeners: LineStartListener[] = [];
  /** True during the fixed step in which an `interact` press was used by the dialog (Interactions must skip it). */
  pressConsumed = false;

  constructor(
    private readonly bubble: DialogBubble,
    private readonly input: Input,
    private readonly onLockChange: (locked: boolean) => void,
  ) {
    this.register(dialogData as DialogLine[]);
  }

  /** Add or replace table lines (the JSON from audio/dialog.json is loaded automatically). */
  register(lines: readonly DialogLine[]): void {
    for (const l of lines) if (l.lang === undefined || l.lang === 'id') this.table.set(l.id, l);
  }

  /** The audio manager hooks in here: play public/audio/{id}.mp3 and, if it wants, call setLineDuration. */
  onLineStart(cb: LineStartListener): void {
    this.listeners.push(cb);
  }

  /** True while a line is showing or queued (and during the short gap between two lines). */
  get active(): boolean {
    return this.current !== null || this.queue.length > 0 || this.idle > 0;
  }

  /** The line on screen, or null. */
  get currentLine(): Readonly<LineInfo> | null {
    return this.current ? this.current.info : null;
  }

  /**
   * Show one line; the promise resolves when it has been advanced (tap, E / Enter, or auto).
   * Lines queue up: a second `say` waits for the first. Unknown ids show "…" and warn once.
   *   await dialog.say('bab1_glen_pulang');
   *   await dialog.say({ speaker: 'nino', text: 'Halo!' }, { lockControls: true });
   */
  say(line: LineRef, opts: SayOptions = {}): Promise<void> {
    return new Promise<void>((resolve) => {
      this.enqueue(line, opts, resolve);
    });
  }

  /** Show lines one after the other without the bubble blinking in between. Resolves after the last. */
  sequence(lines: readonly LineRef[], opts: SayOptions = {}): Promise<void> {
    return new Promise<void>((resolve) => {
      if (lines.length === 0) {
        resolve();
        return;
      }
      lines.forEach((l, i) => this.enqueue(l, opts, i === lines.length - 1 ? resolve : null));
    });
  }

  /** Change how long the current line stays (e.g. to the voice clip length). Restarts nothing. */
  setLineDuration(seconds: number): void {
    if (this.current) this.current.duration = seconds;
  }

  /** Advance the current line now (same as a tap). */
  skip(): void {
    this.tapPending = true;
  }

  /** Called by the bubble when it is tapped. */
  tap(): void {
    this.tapPending = true;
  }

  /** Drop everything on screen and in the queue; pending promises never settle. Used on level unload. */
  cancelAll(): void {
    this.queue.length = 0;
    this.current = null;
    this.idle = 0;
    this.tapPending = false;
    this.pressConsumed = false;
    this.bubble.hide();
    this.setLocked(false);
  }

  /** Once per fixed step, before Interactions. Game time, so it follows pause/advance stepping. */
  fixedUpdate(dt: number): void {
    this.pressConsumed = false;
    const cur = this.current;
    if (cur) {
      this.elapsed += dt;
      const interact = this.input.wasPressed('interact');
      // Space (jump) advances only when it is not needed for jumping.
      const jump = cur.lock && this.input.wasPressed('jump');
      if (interact) this.pressConsumed = true;
      let advance = false;
      if (interact || jump || this.tapPending) advance = this.elapsed >= ADVANCE_GUARD;
      if (cur.auto && this.elapsed >= cur.duration) advance = true;
      this.tapPending = false;
      if (advance) this.finishCurrent();
    } else {
      this.tapPending = false;
      if (this.idle > 0) {
        this.idle -= dt;
        if (this.idle <= 0) {
          this.idle = 0;
          this.bubble.hide();
          this.setLocked(false);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------

  private enqueue(line: LineRef, opts: SayOptions, done: (() => void) | null): void {
    const info = this.resolve(line);
    const item: Item = {
      info,
      lock: opts.lockControls === true,
      auto: opts.autoAdvance !== false,
      duration: opts.duration ?? defaultLineDuration(info.text),
      done,
    };
    if (this.current) this.queue.push(item);
    else this.start(item);
  }

  private resolve(line: LineRef): LineInfo {
    if (typeof line !== 'string') return { id: line.id, speaker: line.speaker, text: line.text };
    const row = this.table.get(line);
    if (row) return { id: row.id, speaker: row.speaker, text: row.text };
    if (!this.warned.has(line)) {
      this.warned.add(line);
      console.warn(`Dialog: unknown line id "${line}"`);
    }
    return { id: line, speaker: 'glen', text: FALLBACK_TEXT };
  }

  private start(item: Item): void {
    perfMark(PerfMark.DIALOG);
    this.current = item;
    this.elapsed = 0;
    this.idle = 0;
    this.tapPending = false;
    this.lastLock = item.lock;
    this.bubble.show(item.info.speaker, item.info.text);
    this.setLocked(item.lock);
    for (const l of this.listeners) {
      try {
        l(item.info.id, item.info.speaker, item.info.text);
      } catch (err) {
        console.error('Dialog onLineStart listener failed:', err);
      }
    }
  }

  private finishCurrent(): void {
    const item = this.current;
    this.current = null;
    if (this.queue.length > 0) {
      this.start(this.queue.shift() as Item);
    } else {
      // Keep the bubble (and a control lock) for a moment: a script may say the next line right away.
      this.idle = IDLE_HIDE;
      this.setLocked(this.lastLock);
    }
    // Settle last so a continuation sees the already-advanced state.
    item?.done?.();
  }

  private setLocked(on: boolean): void {
    if (on === this.locked) return;
    this.locked = on;
    this.onLockChange(on);
  }
}
