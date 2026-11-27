import type { SaveStore } from '../core/Save';
import type { Dialog } from './Dialog';
import type { Action } from '../input/Input';
import { TIPS, TIP_BY_ID, TIP_DEFAULT_LEVELS, TipConfig, tipLineId, type TipCtx, type TipDef, type TipIconName } from '../config/tips';
import { TipCard } from '../ui/TipsUi';

export interface TipsDeps {
  ui: HTMLElement;
  save: SaveStore;
  dialog: Dialog;
  /** Pulse (or stop pulsing) the real touch button of an action. */
  pulse: (action: Action, on: boolean) => void;
  /** The game is calm: no fight, cinematic, dialog, quiz, menu, fade or level load. */
  calm: () => boolean;
  /** What the game looks like now (read about four times a second). */
  ctx: () => TipCtx;
  /** Close the pause menu (a replay starts after it). */
  closeMenu: () => void;
}

export interface TipListItem {
  id: string;
  title: string;
  icon: TipIconName;
}

/** How often the triggers are looked at (s). */
const POLL = 0.25;

/**
 * Tips (Petunjuk). Each tip of config/tips.ts is shown once per save slot by Nino (or Aara) when its trigger is true and the game
 * is calm for a moment; tips never interrupt fights, cinematics or story lines, they wait in line. While one is up, a card with
 * pictures (the button of the current input type, pulsing) shows under the bubble and the real touch button pulses. The pause menu
 * lists every seen tip so the child can replay it.
 */
export class Tips {
  private readonly card: TipCard;
  private acc = 0;
  private calmFor = 0;
  private levelId = '';
  private levelTime = 0;
  private gap = 0;
  private showing: TipDef | null = null;
  private showFor = 0;
  private sawBubble = false;
  private pulsed: Action[] = [];
  private replayId = '';
  private lastCtx: TipCtx | null = null;
  /** Counters for the tests. */
  shown = 0;
  replays = 0;
  /** Test switch: the polling skips the level / gap / calm waiting (the tips still need their trigger). */
  fast = false;

  constructor(private readonly deps: TipsDeps) {
    this.card = new TipCard(deps.ui);
  }

  isSeen(id: string): boolean {
    const t = TIP_BY_ID.get(id);
    if (!t) return false;
    const { save } = this.deps;
    return save.data.tips.includes(id) || (t.seenFlag !== undefined && save.isChapterDone(t.seenFlag));
  }

  /** The tips the child has seen (the Petunjuk list), in table order. */
  seenList(): TipListItem[] {
    return TIPS.filter((t) => this.isSeen(t.id)).map((t) => ({ id: t.id, title: t.title, icon: t.icon }));
  }

  get activeId(): string {
    return this.showing?.id ?? '';
  }

  /** Replay a tip from the list: the menu closes, the tip shows as soon as the game is calm again (it ignores the gap and the level). */
  replay(id: string): void {
    if (!TIP_BY_ID.has(id)) return;
    this.replayId = id;
    this.deps.closeMenu();
  }

  /** Once per fixed step (game time, so it follows pause and the test stepping). */
  update(dt: number): void {
    if (this.showing) {
      this.tickShowing(dt);
      return;
    }
    this.acc += dt;
    if (this.acc < POLL) return;
    const step = this.acc;
    this.acc = 0;
    this.gap = Math.max(0, this.gap - step);
    const c = this.deps.ctx();
    this.lastCtx = c;
    if (c.level !== this.levelId) {
      this.levelId = c.level;
      this.levelTime = 0;
      this.calmFor = 0;
    }
    this.levelTime += step;
    if (this.deps.calm()) this.calmFor += step;
    else this.calmFor = 0;
    if (this.replayId) {
      if (this.calmFor >= 0.5) {
        const id = this.replayId;
        this.replayId = '';
        this.replays++;
        this.start(TIP_BY_ID.get(id) as TipDef, false);
      }
      return;
    }
    if (!this.fast && (this.calmFor < TipConfig.calmSeconds || this.levelTime < TipConfig.levelWarmup || this.gap > 0)) return;
    if (this.fast && !this.deps.calm()) return;
    const next = this.pick(c);
    if (next) this.start(next, true);
  }

  private pick(c: TipCtx): TipDef | null {
    for (const t of TIPS) {
      if (!t.when || this.isSeen(t.id)) continue;
      if (!c.done(t.after ?? 'bab2')) continue;
      const levels = t.levels ?? TIP_DEFAULT_LEVELS;
      if (!levels.includes(c.level)) continue;
      try {
        if (t.when(c)) return t;
      } catch (err) {
        console.error('Tip trigger failed:', t.id, err);
      }
    }
    return null;
  }

  private start(t: TipDef, own: boolean): void {
    this.showing = t;
    this.showFor = 0;
    this.sawBubble = false;
    this.shown++;
    if (own) this.deps.save.markTipSeen(t.id);
    else if (!this.deps.save.data.tips.includes(t.id) && !this.isSeen(t.id)) this.deps.save.markTipSeen(t.id);
    this.card.show(t.visual);
    this.pulsed = [];
    for (const v of t.visual) {
      if (v.kind === 'button' && !this.pulsed.includes(v.action)) {
        this.pulsed.push(v.action);
        this.deps.pulse(v.action, true);
      }
    }
    t.lines.forEach((text, i) => {
      void this.deps.dialog.say({ speaker: t.speaker, text, id: tipLineId(t.id, i + 1) });
    });
  }

  private tickShowing(dt: number): void {
    this.showFor += dt;
    const talking = this.deps.dialog.active;
    if (talking) this.sawBubble = true;
    // Done when the lines have been shown (or the dialog was cleared by a level change) or after the failsafe.
    if ((this.sawBubble && !talking) || this.showFor > TipConfig.maxShowSeconds) this.finish();
  }

  private finish(): void {
    for (const a of this.pulsed) this.deps.pulse(a, false);
    this.pulsed = [];
    this.card.hide();
    this.showing = null;
    this.gap = TipConfig.gapSeconds;
    this.calmFor = 0;
  }

  debugHandle(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      get active() {
        return self.activeId;
      },
      get cardVisible() {
        return self.card.visible;
      },
      get seen() {
        return [...self.deps.save.data.tips];
      },
      get shown() {
        return self.shown;
      },
      get replays() {
        return self.replays;
      },
      get fast() {
        return self.fast;
      },
      set fast(v: boolean) {
        self.fast = v;
      },
      get ids() {
        return TIPS.map((t) => t.id);
      },
      list: () => self.seenList(),
      lines: (id: string) => TIP_BY_ID.get(id)?.lines ?? [],
      replay: (id: string) => self.replay(id),
      get last() {
        return self.lastCtx;
      },
    };
  }
}
