/**
 * Procedural sound effects (Web Audio, no files, no paid service): coin pings, laser, jet whoosh, shield, jumps,
 * rings, UI blips and the quiz twinkles. Everything is bright, toy-like and gentle; nothing sounds like an explosion.
 *
 * Wiring:
 *  - shares the AudioContext DrumSynth creates inside the first tap and connects to the AudioManager's `sfx` lane gain,
 *    so the Sound switch and `?mute=1` (lane gain 0, and nothing is started at all while muted) apply here too
 *  - one-shot sounds make a few nodes each (never per frame). At most `SfxConfig.maxVoices` sound at once (the oldest is
 *    faded out and stolen), each sound has its own cooldown and at most `maxPer100ms` sounds start per 100 ms
 *  - the jet loop is ONE persistent node graph (filters and gains are made once; only its two sources are re-created per
 *    flight). `jetUpdate` writes AudioParam values per frame and allocates nothing
 *  - time for cooldowns and the coin streak is the game's fixed-step clock (`tick`), so stepped tests are deterministic
 *
 * The events are connected in `SfxWiring.ts`. All numbers live in `SfxConfig`.
 */

export type SfxId =
  | 'coin'
  | 'coinDone'
  | 'laserFire'
  | 'laserHit'
  | 'laserMiss'
  | 'targetFlip'
  | 'jetStart'
  | 'shieldUp'
  | 'shieldDown'
  | 'shieldBlock'
  | 'ballHit'
  | 'jump'
  | 'jumpSuper'
  | 'doubleJump'
  | 'land'
  | 'wallKick'
  | 'mantle'
  | 'ringPass'
  | 'pop'
  | 'quizTap'
  | 'blip'
  | 'bling'
  | 'transformUp'
  | 'transformDown'
  | 'fanfare'
  | 'quizWrong'
  | 'quizRight'
  | 'sparkle';

export const SFX_IDS: readonly SfxId[] = [
  'coin', 'coinDone', 'laserFire', 'laserHit', 'laserMiss', 'targetFlip', 'jetStart', 'shieldUp', 'shieldDown', 'shieldBlock',
  'ballHit', 'jump', 'jumpSuper', 'doubleJump', 'land', 'wallKick', 'mantle', 'ringPass', 'pop', 'quizTap', 'blip', 'bling',
  'transformUp', 'transformDown', 'fanfare', 'quizWrong', 'quizRight', 'sparkle',
];

/** Every tuning number of the effects. Seconds, Hz and linear gains. */
export const SfxConfig = {
  /** Overall level of the effects (inside the lane gain of AudioConfig.volumes.sfx; speech is 1, drum notes about 0.5). */
  level: 0.85,
  /** Sounds that may play at once; the oldest is faded out and stolen. */
  maxVoices: 8,
  /** At most this many sounds may START within 100 ms (rapid events must not stack into noise). */
  maxPer100ms: 4,
  /** Per sound: minimum time between two plays of the same sound (game seconds). */
  cooldown: {
    coin: 0.05, coinDone: 0.5, laserFire: 0.1, laserHit: 0.08, laserMiss: 0.2, targetFlip: 0.15, jetStart: 0.25,
    shieldUp: 0.15, shieldDown: 0.15, shieldBlock: 0.1, ballHit: 0.2, jump: 0.08, jumpSuper: 0.08, doubleJump: 0.15,
    land: 0.12, wallKick: 0.1, mantle: 0.2, ringPass: 0.2, pop: 0.06, quizTap: 0.06, blip: 0.08, bling: 0.3,
    transformUp: 0.4, transformDown: 0.4, fanfare: 1, quizWrong: 0.2, quizRight: 0.2, sparkle: 0.5,
  } as Record<SfxId, number>,
  /** Per sound: trim on top of `level` (1 = as designed). */
  trim: {
    coin: 0.9, coinDone: 0.9, laserFire: 0.9, laserHit: 0.9, laserMiss: 0.8, targetFlip: 0.9, jetStart: 0.9,
    shieldUp: 0.9, shieldDown: 0.8, shieldBlock: 1, ballHit: 1, jump: 0.7, jumpSuper: 0.85, doubleJump: 0.9,
    land: 0.9, wallKick: 0.9, mantle: 0.8, ringPass: 1, pop: 0.8, quizTap: 0.8, blip: 0.7, bling: 0.8,
    transformUp: 1, transformDown: 0.9, fanfare: 1, quizWrong: 0.9, quizRight: 1, sparkle: 0.8,
  } as Record<SfxId, number>,
  /** C major pentatonic from C5: coins, rings and twinkles pick their notes from here (they fit the drum notes). */
  pentatonic: [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02] as readonly number[],
  coin: {
    /** Pickups closer together than this continue the rising streak. */
    streakWindow: 1.5,
    /** Index into `pentatonic` of the first coin, and how many steps the pitch may rise. */
    firstNote: 5,
    maxSteps: 7,
  },
  /** Landings softer than this (m/s) make no thud. */
  landMinImpact: 3,
  jet: {
    /** Rise speed (m/s) that counts as full power (Flight riseSpeed is 4). */
    fullRise: 4,
    /** Level of the whole loop; its two parts and how they follow the rise speed. */
    level: 0.5,
    noiseBase: 0.35,
    noiseRise: 0.4,
    rumbleBase: 0.22,
    rumbleRise: 0.12,
    filterBase: 650,
    filterRise: 900,
    rumbleHz: 52,
    rumbleHzRise: 18,
    /** Fade times (s) of the loop in and out, and the quick fade used when it is cut (pause, unload). */
    fadeIn: 0.12,
    fadeOut: 0.2,
    fadeCut: 0.04,
    /** How quickly the sound follows the rise speed (1/s). */
    follow: 8,
  },
  /** Log entries kept for the test hook. */
  logSize: 64,
};

/** Test hook entry: what played, its main pitch (coins) and the time. */
export interface SfxLogEntry {
  id: string;
  hz: number;
  t: number;
}

export interface SfxOptions {
  getContext: () => AudioContext | null;
  /** The sfx lane gain of the AudioManager. */
  getOut: () => AudioNode | null;
  /** ?mute=1 or Sound off. */
  isMuted: () => boolean;
}

interface Voice {
  id: SfxId;
  out: GainNode;
  /** Start time (audio clock) and the time the last source ends. */
  t: number;
  end: number;
  pending: number;
  srcs: AudioScheduledSourceNode[];
  dead: boolean;
}

type ParamX = AudioParam & {
  cancelScheduledValues?: (t: number) => unknown;
  setTargetAtTime?: (v: number, t: number, tc: number) => unknown;
};

interface JetGraph {
  noiseGain: GainNode;
  band: BiquadFilterNode;
  low: BiquadFilterNode;
  rumbleGain: GainNode;
  master: GainNode;
  src: AudioBufferSourceNode | null;
  osc: OscillatorNode | null;
}

export class Sfx {
  // ---- Test / debug counters (plain numbers: nothing allocates when they change) ----
  played = 0;
  stolen = 0;
  peakVoices = 0;
  readonly blocked = { cooldown: 0, rate: 0, mute: 0, noContext: 0, suspended: 0 };
  readonly counts: Record<string, number> = {};
  /** Live source nodes of the jet loop (0 after it was stopped and the nodes ended). */
  jetSrcLive = 0;
  jetUpdates = 0;

  private clock = 0;
  private readonly last: Record<string, number> = {};
  private readonly recent: Float64Array;
  private recentI = 0;
  private readonly voices: Voice[] = [];
  private noise: AudioBuffer | null = null;
  private noiseCtx: AudioContext | null = null;
  private forced = false;
  private noCtx = false;

  private coinStreak = 0;
  private coinLast = -1e9;

  private jet: JetGraph | null = null;
  private jetCtx: AudioContext | null = null;
  private jetOn = false;
  private jetR = 0;

  // The log is a ring of reusable entries.
  private readonly logRing: SfxLogEntry[] = [];
  private logN = 0;

  constructor(private readonly opts: SfxOptions) {
    this.recent = new Float64Array(SfxConfig.maxPer100ms).fill(-1e9);
    for (const id of SFX_IDS) {
      this.last[id] = -1e9;
      this.counts[id] = 0;
    }
    for (let i = 0; i < SfxConfig.logSize; i++) this.logRing.push({ id: '', hz: 0, t: 0 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Clock, state
  // ---------------------------------------------------------------------------------------------------------------

  /** One fixed game step. */
  tick(dt: number): void {
    this.clock += dt;
  }

  get jetRunning(): boolean {
    return this.jetOn;
  }

  get voiceCount(): number {
    return this.voices.length;
  }

  /** Sound switch or mute changed: a muted loop is cut. */
  refresh(): void {
    if (this.opts.isMuted()) this.stopAll();
  }

  /** Level unload, pause, mode switch: cut the jet loop and fade every voice out quickly. */
  stopAll(): void {
    this.jetStop(true);
    for (const v of [...this.voices]) this.kill(v);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Voices
  // ---------------------------------------------------------------------------------------------------------------

  private ctx(): AudioContext | null {
    return this.noCtx ? null : this.opts.getContext();
  }

  /** Gate + allocate a voice for `id`. Null when it must not sound (no context, muted, cooldown, rate limit). */
  private open(id: SfxId, hz = 0): Voice | null {
    const ctx = this.ctx();
    const out = this.opts.getOut();
    if (!ctx || !out) {
      this.blocked.noContext++;
      return null;
    }
    if (this.opts.isMuted()) {
      this.blocked.mute++;
      return null;
    }
    if (ctx.state !== 'running') {
      this.blocked.suspended++;
      return null;
    }
    if (!this.forced) {
      if (this.clock - this.last[id] < SfxConfig.cooldown[id]) {
        this.blocked.cooldown++;
        return null;
      }
      if (this.clock - this.recent[this.recentI] < 0.1) {
        this.blocked.rate++;
        return null;
      }
    }
    try {
      const now = ctx.currentTime;
      // Drop what has ended, then steal the oldest while full.
      for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end < now - 0.05) this.release(this.voices[i]);
      while (this.voices.length >= SfxConfig.maxVoices) {
        this.stolen++;
        this.kill(this.voices[0]);
      }
      const g = ctx.createGain();
      g.gain.value = SfxConfig.level * SfxConfig.trim[id];
      g.connect(out);
      const t = now + 0.004;
      const v: Voice = { id, out: g, t, end: t, pending: 0, srcs: [], dead: false };
      this.voices.push(v);
      if (this.voices.length > this.peakVoices) this.peakVoices = this.voices.length;
      this.last[id] = this.clock;
      this.recent[this.recentI] = this.clock;
      this.recentI = (this.recentI + 1) % this.recent.length;
      this.played++;
      this.counts[id]++;
      const e = this.logRing[this.logN % this.logRing.length];
      e.id = id;
      e.hz = hz;
      e.t = this.clock;
      this.logN++;
      return v;
    } catch {
      return null;
    }
  }

  private release(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    try {
      v.out.disconnect();
    } catch {
      // already gone
    }
  }

  /** Fade a voice out in a few ms and stop its sources (no click). */
  private kill(v: Voice): void {
    if (v.dead) return;
    v.dead = true;
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    const ctx = this.ctx() ?? this.jetCtx;
    try {
      const now = ctx ? ctx.currentTime : 0;
      const p = v.out.gain as ParamX;
      if (typeof p.setTargetAtTime === 'function') p.setTargetAtTime(0, now, 0.006);
      else p.value = 0;
      for (const s of v.srcs) {
        try {
          s.stop(now + 0.03);
        } catch {
          // not started / already stopped
        }
      }
    } catch {
      // ignore
    }
  }

  private done(v: Voice): void {
    v.pending--;
    if (v.pending <= 0) this.release(v);
  }

  private track(v: Voice, s: AudioScheduledSourceNode, endAt: number): void {
    v.srcs.push(s);
    v.pending++;
    if (endAt > v.end) v.end = endAt;
    s.onended = (): void => {
      try {
        s.disconnect();
      } catch {
        // ignore
      }
      this.done(v);
    };
  }

  /** One oscillator note: `f0` -> `f1` over `glide` seconds, quick attack, exponential decay to silence at `dur`. */
  private tone(v: Voice, type: OscillatorType, f0: number, f1: number, at: number, dur: number, peak: number, glide = dur): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = v.t + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    (o as unknown as { sgSfx: boolean }).sgSfx = true; // lets the test stub tell effect nodes from drum nodes
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(v.out);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.track(v, o, t + dur + 0.02);
  }

  /** A multi-point wobble (boing): the frequencies are visited evenly over `dur`. */
  private wobble(v: Voice, type: OscillatorType, freqs: readonly number[], at: number, dur: number, peak: number): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = v.t + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    (o as unknown as { sgSfx: boolean }).sgSfx = true;
    o.type = type;
    o.frequency.setValueAtTime(freqs[0], t);
    for (let i = 1; i < freqs.length; i++) o.frequency.exponentialRampToValueAtTime(freqs[i], t + (dur * i) / (freqs.length - 1));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(v.out);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.track(v, o, t + dur + 0.02);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (this.noise && this.noiseCtx === ctx) return this.noise;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.noiseCtx = ctx;
      return buf;
    } catch {
      return null;
    }
  }

  /** A short filtered puff of noise whose filter sweeps `f0` -> `f1`. */
  private puff(v: Voice, type: BiquadFilterType, f0: number, f1: number, q: number, at: number, dur: number, peak: number): void {
    const ctx = this.ctx();
    if (!ctx) return;
    const buf = this.noiseBuffer(ctx);
    if (!buf) return;
    const t = v.t + at;
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    (src as unknown as { sgSfx: boolean }).sgSfx = true;
    src.buffer = buf;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(v.out);
    src.start(t, 0.05 + ((this.played * 0.137) % 0.6));
    src.stop(t + dur + 0.02);
    this.track(v, src, t + dur + 0.02);
  }

  private note(i: number): number {
    const P = SfxConfig.pentatonic;
    return P[Math.max(0, Math.min(P.length - 1, i))];
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The sounds
  // ---------------------------------------------------------------------------------------------------------------

  /** A coin: a bright "ting"; pickups within 1.5 s climb the pentatonic scale, then it starts over. */
  coin(): void {
    const C = SfxConfig.coin;
    const step = this.clock - this.coinLast <= C.streakWindow ? Math.min(C.maxSteps, this.coinStreak + 1) : 0;
    const f = this.note(C.firstNote + step);
    const v = this.open('coin', f);
    if (!v) return;
    this.coinStreak = step;
    this.coinLast = this.clock;
    this.tone(v, 'triangle', f * 0.94, f, 0, 0.24, 0.42, 0.03);
    this.tone(v, 'sine', f * 2, f * 2, 0.055, 0.2, 0.26);
    this.tone(v, 'sine', f * 3, f * 3, 0.055, 0.08, 0.06);
  }

  /** The last coin of a route: a sparkly rising flourish. */
  coinDone(): void {
    const v = this.open('coinDone');
    if (!v) return;
    [5, 6, 7, 8, 9, 10, 12].forEach((n, i) => {
      const f = this.note(n);
      this.tone(v, 'triangle', f, f, i * 0.06, 0.28, 0.3);
      this.tone(v, 'sine', f * 2, f * 2, i * 0.06 + 0.02, 0.18, 0.12);
    });
  }

  /** "Pew": a quick downward sweep with a little air. */
  laserFire(): void {
    const v = this.open('laserFire');
    if (!v) return;
    this.tone(v, 'triangle', 2100, 380, 0, 0.16, 0.4, 0.13);
    this.tone(v, 'sine', 1050, 190, 0, 0.14, 0.2, 0.12);
    this.puff(v, 'bandpass', 3200, 900, 1.2, 0, 0.1, 0.12);
  }

  /** A soft ding on a hit. */
  laserHit(): void {
    const v = this.open('laserHit');
    if (!v) return;
    this.tone(v, 'sine', 1318.51, 1318.51, 0, 0.26, 0.4);
    this.tone(v, 'triangle', 660, 990, 0, 0.14, 0.28, 0.04);
  }

  /** A gentle "whoosh-plop" when the shot found nothing. */
  laserMiss(): void {
    const v = this.open('laserMiss');
    if (!v) return;
    this.puff(v, 'bandpass', 1900, 500, 0.8, 0, 0.22, 0.2);
    this.tone(v, 'sine', 430, 190, 0.18, 0.12, 0.3, 0.1);
  }

  /** The practice target flips over: a springy boing. */
  targetFlip(): void {
    const v = this.open('targetFlip');
    if (!v) return;
    this.wobble(v, 'sine', [190, 420, 150], 0.02, 0.36, 0.4);
    this.tone(v, 'triangle', 380, 840, 0.02, 0.1, 0.12, 0.06);
  }

  /** Jets ignite: a short soft puff (the loop itself is `jetStart`). */
  private ignitionPuff(): void {
    const v = this.open('jetStart');
    if (!v) return;
    this.puff(v, 'bandpass', 700, 2200, 0.7, 0, 0.22, 0.3);
    this.tone(v, 'sine', 150, 80, 0, 0.22, 0.3, 0.2);
  }

  /** "Vwoom": two slightly detuned rising tones with a high shimmer. */
  shieldUp(): void {
    const v = this.open('shieldUp');
    if (!v) return;
    this.tone(v, 'triangle', 260, 880, 0, 0.34, 0.3, 0.3);
    this.tone(v, 'triangle', 266, 900, 0, 0.34, 0.24, 0.3);
    this.tone(v, 'sine', 1760, 2349.32, 0.1, 0.28, 0.1, 0.25);
  }

  shieldDown(): void {
    const v = this.open('shieldDown');
    if (!v) return;
    this.tone(v, 'triangle', 740, 260, 0, 0.26, 0.26, 0.24);
    this.tone(v, 'sine', 1480, 520, 0, 0.2, 0.08, 0.18);
  }

  /** A ball bounces off the dome: a bright "clang" over a boing. */
  shieldBlock(): void {
    const v = this.open('shieldBlock');
    if (!v) return;
    this.tone(v, 'sine', 1567.98, 1567.98, 0, 0.34, 0.34);
    this.tone(v, 'triangle', 2349.32, 2349.32, 0, 0.2, 0.2);
    this.tone(v, 'sine', 3135.96, 3135.96, 0, 0.14, 0.08);
    this.wobble(v, 'sine', [170, 380, 140], 0.0, 0.3, 0.3);
  }

  /** A cartoon "bonk" (harmless). */
  ballHit(): void {
    const v = this.open('ballHit');
    if (!v) return;
    this.tone(v, 'sine', 330, 105, 0, 0.18, 0.46, 0.1);
    this.tone(v, 'triangle', 660, 260, 0, 0.1, 0.16, 0.08);
    this.puff(v, 'lowpass', 700, 300, 0.7, 0, 0.05, 0.14);
  }

  /** The "hup" of a jump: Glen is small and quick, Superglen deeper and bigger. */
  jump(big: boolean): void {
    const v = this.open(big ? 'jumpSuper' : 'jump');
    if (!v) return;
    if (big) {
      this.tone(v, 'sine', 300, 640, 0, 0.17, 0.34, 0.1);
      this.tone(v, 'triangle', 600, 1280, 0.01, 0.12, 0.12, 0.08);
    } else {
      this.tone(v, 'sine', 460, 820, 0, 0.11, 0.28, 0.07);
    }
  }

  /** The spinning "whirr" of the double jump. */
  doubleJump(): void {
    const v = this.open('doubleJump');
    if (!v) return;
    for (let i = 0; i < 3; i++) this.tone(v, 'triangle', 420 + i * 90, 950 + i * 160, i * 0.05, 0.11, 0.2, 0.1);
    this.puff(v, 'bandpass', 900, 3200, 1, 0, 0.2, 0.08);
  }

  /** A soft thud. */
  land(impact: number): void {
    if (impact < SfxConfig.landMinImpact) return;
    const v = this.open('land');
    if (!v) return;
    const k = Math.min(1, 0.45 + impact / 20);
    this.tone(v, 'sine', 150, 62, 0, 0.17, 0.4 * k, 0.12);
    this.puff(v, 'lowpass', 500, 220, 0.7, 0, 0.06, 0.12 * k);
  }

  /** A "tok" against the wall and an up-sweep. */
  wallKick(): void {
    const v = this.open('wallKick');
    if (!v) return;
    this.tone(v, 'triangle', 720, 380, 0, 0.07, 0.34, 0.05);
    this.puff(v, 'bandpass', 2000, 1200, 1, 0, 0.04, 0.12);
    this.tone(v, 'sine', 520, 1180, 0.04, 0.17, 0.28, 0.14);
  }

  /** A quick "hup-scramble" up onto a ledge. */
  mantle(): void {
    const v = this.open('mantle');
    if (!v) return;
    [400, 520, 660].forEach((f, i) => this.tone(v, 'triangle', f, f * 1.15, i * 0.06, 0.08, 0.22, 0.06));
    this.puff(v, 'bandpass', 1800, 2600, 1, 0, 0.17, 0.08);
  }

  /** A ring passed: a rising arpeggio. */
  ringPass(): void {
    const v = this.open('ringPass');
    if (!v) return;
    [0, 2, 3, 5].forEach((n, i) => {
      const f = this.note(n);
      this.tone(v, 'triangle', f, f, i * 0.07, 0.28, 0.3);
      this.tone(v, 'sine', f * 2, f * 2, i * 0.07, 0.18, 0.1);
    });
  }

  /** A touch button was pressed. */
  pop(): void {
    const v = this.open('pop');
    if (!v) return;
    this.tone(v, 'sine', 520, 840, 0, 0.09, 0.3, 0.04);
  }

  /** A quiz card was tapped. */
  quizTap(): void {
    const v = this.open('quizTap');
    if (!v) return;
    this.tone(v, 'sine', 600, 960, 0, 0.1, 0.3, 0.04);
  }

  /** A dialog line appeared / advanced. */
  blip(): void {
    const v = this.open('blip');
    if (!v) return;
    this.tone(v, 'triangle', 900, 1250, 0, 0.1, 0.2, 0.05);
  }

  /** The talk / take prompt appeared. */
  bling(): void {
    const v = this.open('bling');
    if (!v) return;
    this.tone(v, 'sine', 1567.98, 1567.98, 0, 0.26, 0.26);
    this.tone(v, 'sine', 2349.32, 2349.32, 0.05, 0.26, 0.16);
  }

  /** Glen <-> Superglen: a power-up sweep up (or a shorter one down). */
  transform(toSuper: boolean): void {
    const v = this.open(toSuper ? 'transformUp' : 'transformDown');
    if (!v) return;
    if (toSuper) {
      this.tone(v, 'triangle', 200, 1760, 0, 0.55, 0.32, 0.5);
      this.tone(v, 'sine', 400, 3520, 0, 0.5, 0.1, 0.45);
      [8, 9, 10, 12].forEach((n, i) => this.tone(v, 'sine', this.note(n), this.note(n), 0.4 + i * 0.05, 0.25, 0.16));
    } else {
      this.tone(v, 'triangle', 1400, 260, 0, 0.35, 0.26, 0.32);
      this.tone(v, 'sine', 2800, 520, 0, 0.3, 0.08, 0.28);
    }
  }

  /** Chapter done: a rising fanfare ending on a bright chord. */
  fanfare(): void {
    const v = this.open('fanfare');
    if (!v) return;
    [0, 2, 3].forEach((n, i) => this.tone(v, 'triangle', this.note(n), this.note(n), i * 0.13, 0.3, 0.3));
    [5, 7, 8].forEach((n) => {
      this.tone(v, 'triangle', this.note(n), this.note(n), 0.4, 0.8, 0.26);
      this.tone(v, 'sine', this.note(n) * 2, this.note(n) * 2, 0.4, 0.5, 0.08);
    });
  }

  /** A wrong quiz pick: a gentle wobbly boing (never a buzzer). */
  quizWrong(): void {
    const v = this.open('quizWrong');
    if (!v) return;
    this.wobble(v, 'sine', [400, 270, 340, 220], 0, 0.46, 0.34);
    this.tone(v, 'triangle', 200, 140, 0.04, 0.4, 0.1, 0.36);
  }

  /** A right quiz pick: a twinkle. */
  quizRight(): void {
    const v = this.open('quizRight');
    if (!v) return;
    [7, 8, 10, 12].forEach((n, i) => {
      this.tone(v, 'triangle', this.note(n), this.note(n), i * 0.07, 0.3, 0.22);
      this.tone(v, 'sine', this.note(n) * 2, this.note(n) * 2, i * 0.07 + 0.01, 0.16, 0.08);
    });
  }

  /** A sticker is revealed: a fast sparkle run. */
  sparkle(): void {
    const v = this.open('sparkle');
    if (!v) return;
    [6, 8, 7, 9, 8, 10, 9, 11, 12].forEach((n, i) => this.tone(v, 'sine', this.note(n), this.note(n), i * 0.045, 0.16, 0.16));
    this.tone(v, 'triangle', this.note(12), this.note(12), 0.42, 0.3, 0.16);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Jet loop (one persistent graph)
  // ---------------------------------------------------------------------------------------------------------------

  private buildJet(ctx: AudioContext, out: AudioNode): JetGraph {
    const J = SfxConfig.jet;
    const master = ctx.createGain();
    const noiseGain = ctx.createGain();
    const band = ctx.createBiquadFilter();
    const low = ctx.createBiquadFilter();
    const rumbleGain = ctx.createGain();
    master.gain.value = 0.0001;
    band.type = 'bandpass';
    band.Q.value = 0.7;
    band.frequency.value = J.filterBase;
    low.type = 'lowpass';
    low.frequency.value = 240;
    low.Q.value = 0.5;
    noiseGain.gain.value = J.noiseBase;
    rumbleGain.gain.value = J.rumbleBase;
    band.connect(noiseGain);
    noiseGain.connect(master);
    low.connect(rumbleGain);
    rumbleGain.connect(master);
    master.connect(out);
    return { noiseGain, band, low, rumbleGain, master, src: null, osc: null };
  }

  /** The jets burn: soft ignition puff, then a looping whoosh (filtered noise + low rumble). `puff` false = no ignition (resume). */
  jetStart(puff = true): void {
    if (this.jetOn) return;
    const ctx = this.ctx();
    const out = this.opts.getOut();
    if (!ctx || !out || this.opts.isMuted() || ctx.state !== 'running') return;
    try {
      if (puff) this.ignitionPuff();
      const J = SfxConfig.jet;
      if (!this.jet || this.jetCtx !== ctx) {
        this.jet = this.buildJet(ctx, out);
        this.jetCtx = ctx;
      }
      const g = this.jet;
      const buf = this.noiseBuffer(ctx);
      if (!buf) return;
      const t = ctx.currentTime + 0.002;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(g.band);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = J.rumbleHz;
      osc.connect(g.low);
      (src as unknown as { sgSfx: boolean }).sgSfx = true;
      (osc as unknown as { sgSfx: boolean }).sgSfx = true;
      const mp = g.master.gain as ParamX;
      mp.cancelScheduledValues?.(t);
      mp.setValueAtTime(0.0001, t);
      mp.linearRampToValueAtTime(J.level, t + J.fadeIn);
      this.jetSrcLive += 2;
      const ended = (n: AudioNode) => (): void => {
        this.jetSrcLive = Math.max(0, this.jetSrcLive - 1);
        try {
          n.disconnect();
        } catch {
          // ignore
        }
      };
      src.onended = ended(src);
      osc.onended = ended(osc);
      src.start(t);
      osc.start(t);
      g.src = src;
      g.osc = osc;
      this.jetOn = true;
      this.jetR = 0;
      this.played++;
      this.counts.jetLoop = (this.counts.jetLoop ?? 0) + 1;
      const e = this.logRing[this.logN % this.logRing.length];
      e.id = 'jetLoop';
      e.hz = 0;
      e.t = this.clock;
      this.logN++;
    } catch {
      this.jetOn = false;
    }
  }

  /** The jets are off (or must be cut): fade the loop out and stop its sources. `quick` = a few ms (pause, unload). */
  jetStop(quick = false): void {
    if (!this.jetOn) return;
    this.jetOn = false;
    const g = this.jet;
    const ctx = this.jetCtx;
    if (!g || !ctx) return;
    try {
      const J = SfxConfig.jet;
      const t = ctx.currentTime;
      const fade = quick ? J.fadeCut : J.fadeOut;
      const mp = g.master.gain as ParamX;
      mp.cancelScheduledValues?.(t);
      mp.setValueAtTime(mp.value, t);
      mp.linearRampToValueAtTime(0.0001, t + fade);
      g.src?.stop(t + fade + 0.02);
      g.osc?.stop(t + fade + 0.02);
    } catch {
      // ignore
    }
    g.src = null;
    g.osc = null;
    const e = this.logRing[this.logN % this.logRing.length];
    e.id = 'jetStop';
    e.hz = 0;
    e.t = this.clock;
    this.logN++;
  }

  /** Per rendered frame while the jets burn: follow the rise speed. Writes AudioParam values only (no allocation). */
  jetUpdate(dt: number, vy: number): void {
    const g = this.jet;
    if (!this.jetOn || !g) return;
    const J = SfxConfig.jet;
    const target = Math.max(0, Math.min(1, vy / J.fullRise));
    this.jetR += (target - this.jetR) * Math.min(1, dt * J.follow);
    const r = this.jetR;
    g.noiseGain.gain.value = J.noiseBase + J.noiseRise * r;
    g.band.frequency.value = J.filterBase + J.filterRise * r;
    g.rumbleGain.gain.value = J.rumbleBase + J.rumbleRise * r;
    if (g.osc) g.osc.frequency.value = J.rumbleHz + J.rumbleHzRise * r;
    this.jetUpdates++;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Test handle
  // ---------------------------------------------------------------------------------------------------------------

  debugHandle(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const table: Record<SfxId, (a: number) => void> = {
      coin: () => self.coin(),
      coinDone: () => self.coinDone(),
      laserFire: () => self.laserFire(),
      laserHit: () => self.laserHit(),
      laserMiss: () => self.laserMiss(),
      targetFlip: () => self.targetFlip(),
      jetStart: () => self.ignitionPuff(),
      shieldUp: () => self.shieldUp(),
      shieldDown: () => self.shieldDown(),
      shieldBlock: () => self.shieldBlock(),
      ballHit: () => self.ballHit(),
      jump: () => self.jump(false),
      jumpSuper: () => self.jump(true),
      doubleJump: () => self.doubleJump(),
      land: (a) => self.land(a || 8),
      wallKick: () => self.wallKick(),
      mantle: () => self.mantle(),
      ringPass: () => self.ringPass(),
      pop: () => self.pop(),
      quizTap: () => self.quizTap(),
      blip: () => self.blip(),
      bling: () => self.bling(),
      transformUp: () => self.transform(true),
      transformDown: () => self.transform(false),
      fanfare: () => self.fanfare(),
      quizWrong: () => self.quizWrong(),
      quizRight: () => self.quizRight(),
      sparkle: () => self.sparkle(),
    };
    return {
      /** The most recent sounds, oldest first: { id, hz, t } (t = game seconds). */
      get log(): SfxLogEntry[] {
        const n = Math.min(self.logN, self.logRing.length);
        const out: SfxLogEntry[] = [];
        for (let i = self.logN - n; i < self.logN; i++) {
          const e = self.logRing[i % self.logRing.length];
          out.push({ id: e.id, hz: e.hz, t: e.t });
        }
        return out;
      },
      get logCount() {
        return self.logN;
      },
      get played() {
        return self.played;
      },
      get counts() {
        return { ...self.counts };
      },
      get blocked() {
        return { ...self.blocked };
      },
      get voices() {
        return self.voices.length;
      },
      get peakVoices() {
        return self.peakVoices;
      },
      get stolen() {
        return self.stolen;
      },
      get clock() {
        return self.clock;
      },
      get jetRunning() {
        return self.jetOn;
      },
      get jetSrcLive() {
        return self.jetSrcLive;
      },
      get jetUpdates() {
        return self.jetUpdates;
      },
      get jetGain() {
        return self.jet ? self.jet.master.gain.value : -1;
      },
      get ids() {
        return [...SFX_IDS];
      },
      /** Play a sound by id; `force` skips the cooldown and rate limit (voice limit and mute still apply). */
      play(id: SfxId, force = false, arg = 0): void {
        self.forced = force;
        try {
          table[id]?.(arg);
        } finally {
          self.forced = false;
        }
      },
      /** Pretend there is no AudioContext (every call must stay silent and never throw). */
      set noContext(v: boolean) {
        self.noCtx = v;
      },
      get noContext() {
        return self.noCtx;
      },
      stopAll(): void {
        self.stopAll();
      },
      /** The per-frame jet update (tests measure its allocations). */
      jetUpdate(dt: number, vy: number): void {
        self.jetUpdate(dt, vy);
      },
      /** The coin streak restarts and cooldown memory is cleared (tests start from a clean state). */
      reset(): void {
        for (const id of SFX_IDS) self.last[id] = -1e9;
        self.recent.fill(-1e9);
        self.coinLast = -1e9;
        self.coinStreak = 0;
      },
    };
  }
}
