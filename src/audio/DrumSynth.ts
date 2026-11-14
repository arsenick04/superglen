import { Parkour } from '../config/parkour';

/**
 * Tiny self-contained synthesizer for the jump rhythm (Web Audio, no files, no paid service):
 *   drum(level, perfect)  a short "DUNG": pitched thump with a fast pitch drop plus a noise tick, at the level's
 *                         pentatonic note (Parkour.levels[level].hz = the note it settles on)
 *   cheer()               a short lion-like roar flourish (level 4)
 *   boing()               a soft springy "boing" for big landings
 *
 * The AudioContext is created / resumed in `unlock()`, which the Game calls from `startGate.onStart` (iOS only allows
 * it inside the first tap). Everything fails silently when Web Audio is missing. Nodes are created per sound (a few,
 * never per frame) and drop away when the sound ends. The context is exposed as `audioContext` for the future
 * file-based AudioManager (package B4), which may share it; this class never owns any file audio.
 */
export class DrumSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Sounds started (tests). */
  played = 0;

  /** `isMuted` is asked on every sound (URL ?mute=1 or settings.sound off). */
  constructor(private readonly isMuted: () => boolean) {}

  /** Effects volume 0..1 (settings panel); the drums count as effects. */
  private vol = 1;
  setVolume(v: number): void {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = 0.5 * this.vol;
  }

  /** The shared AudioContext (null before the first tap or without Web Audio). */
  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  /** Create the context on first use and resume it. Call inside a user gesture. Never throws. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const Ctor = w.AudioContext ?? w.webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = 0.5 * this.vol;
        master.connect(ctx.destination);
        // One second-ish of white noise shared by every tick/roar.
        const len = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.ctx = ctx;
        this.master = master;
        this.noise = buf;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  private ready(): AudioContext | null {
    if (this.isMuted()) return null;
    if (!this.ctx || !this.master) return null;
    return this.ctx;
  }

  /** A drum note for rhythm `level` 0..4. `perfect` is a little brighter and louder. */
  drum(level: number, perfect: boolean): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    try {
      const L = Parkour.levels[Math.max(0, Math.min(Parkour.levels.length - 1, Math.round(level)))];
      const t = ctx.currentTime + 0.001;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = perfect ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(L.hz * (perfect ? 2.4 : 2.0), t);
      osc.frequency.exponentialRampToValueAtTime(L.hz, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(perfect ? 1 : 0.8, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.34);
      osc.onended = (): void => {
        osc.disconnect();
        g.disconnect();
      };
      this.tick(ctx, t, perfect ? 0.32 : 0.16, 0.035);
      this.played++;
    } catch {
      // Audio must never break the game.
    }
  }

  /** Lion cheer: a rising growl with a noisy roar on top, about half a second. */
  cheer(): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    try {
      const t = ctx.currentTime + 0.02;
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(330, t + 0.18);
      osc.frequency.exponentialRampToValueAtTime(240, t + 0.5);
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(500, t);
      filt.frequency.exponentialRampToValueAtTime(1300, t + 0.2);
      filt.Q.value = 1.4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(filt);
      filt.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.6);
      osc.onended = (): void => {
        osc.disconnect();
        filt.disconnect();
        g.disconnect();
      };
      this.tick(ctx, t, 0.22, 0.4);
      this.played++;
    } catch {
      // ignore
    }
  }

  /** Soft "boing" for a big landing (gentle: a falling child must not be startled). */
  boing(): void {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    try {
      const t = ctx.currentTime + 0.001;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(330, t + 0.07);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.36);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.44);
      osc.onended = (): void => {
        osc.disconnect();
        g.disconnect();
      };
      this.played++;
    } catch {
      // ignore
    }
  }

  /** A short burst of the shared noise buffer (the stick hitting the skin). */
  private tick(ctx: AudioContext, t: number, level: number, length: number): void {
    if (!this.noise || !this.master) return;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = this.noise;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + length + 0.02);
    src.onended = (): void => {
      src.disconnect();
      g.disconnect();
    };
  }
}
