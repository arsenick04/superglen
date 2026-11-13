/**
 * File-based audio of the game: voice lines, sound effects and the music lane. Everything is generated once during
 * development and shipped as files; the game never calls an external service (it only fetches its own files).
 *
 *   voice  public/audio/{id}.mp3   dialog lines (`bab1_nino_halo`), quiz prompts (`quiz_<questionId>`), spoken foreign
 *                                  words (`speak_audio_id`). One clip at a time; a new one stops the old one.
 *   sfx    public/audio/{id}.mp3   short effects (`sfx_hewan_kucing`). May overlap (a few at once).
 *   music  public/audio/music/*    owner's soundtrack, one looping track per scene, mapping in music/tracks.json.
 *
 * Availability: at startup `audio/index.json` (a plain array of ids, written by the Vite plugin from the files on disk)
 * says which files exist, so the game never requests a file that is not there. An id that is not listed resolves to
 * `{ played: false }` at once, is logged ONCE as info, and the game just shows the text. Missing files never throw.
 *
 * iOS: the AudioContext is the one DrumSynth creates inside the first tap (`startGate.onStart`); `unlock()` builds the gain
 * graph on it. Before that every call is a quiet no-op (preload ids and the wanted music scene are remembered).
 *
 * Nothing here runs per frame: ducking and crossfades are AudioParam ramps scheduled when something starts or ends.
 */

export const AudioConfig = {
  /** Linear gains of the lanes (master multiplies all of them). */
  volumes: { master: 1, voice: 1, sfx: 0.9, music: 0.55 },
  /** Music level while a voice clip plays (fraction of the normal level) and the smoothing time constants (s). */
  duckFactor: 0.3,
  duckDownTime: 0.1,
  duckUpTime: 0.4,
  /** Crossfade between two music scenes (s). */
  crossfade: 1.0,
  /** Decoded voice / sfx clips are kept up to this many seconds in total (oldest used goes first). */
  cacheSeconds: 120,
  /** Decoded music tracks kept (each is large: PCM of a whole song). */
  musicCache: 2,
  /** Sfx that may sound at the same time. */
  maxSfx: 4,
  /** A dialog bubble stays this long after the clip ends (s). */
  tail: 0.35,
} as const;

export type MusicScene = 'awal' | 'jelajah' | 'berubah' | 'latihan' | 'pertarungan';
export const MUSIC_SCENES: readonly MusicScene[] = ['awal', 'jelajah', 'berubah', 'latihan', 'pertarungan'];
/** `berubah` (the transformation) is a one-shot sting; the rest loop. */
const SCENE_LOOPS: Record<MusicScene, boolean> = { awal: true, jelajah: true, berubah: false, latihan: true, pertarungan: true };

export interface VoiceResult {
  played: boolean;
  /** Clip length in seconds (0 when not played). */
  duration: number;
  /** Resolves when the clip has ended or was stopped (at once when not played). */
  ended: Promise<void>;
}

const DONE: Promise<void> = Promise.resolve();
const NOT_PLAYED: VoiceResult = { played: false, duration: 0, ended: DONE };

export interface AudioOptions {
  /** The shared AudioContext (null before the first tap or without Web Audio). */
  getContext: () => AudioContext | null;
  /** settings.sound: off silences every lane. */
  soundOn: () => boolean;
  /** settings.music: off silences the music lane only. */
  musicOn: () => boolean;
  /** URL ?mute=1 */
  muteUrl: boolean;
}

interface MusicPlay {
  scene: MusicScene;
  file: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

type ParamLike = {
  value: number;
  setTargetAtTime?: (v: number, t: number, tc: number) => unknown;
  cancelScheduledValues?: (t: number) => unknown;
  setValueAtTime?: (v: number, t: number) => unknown;
  linearRampToValueAtTime?: (v: number, t: number) => unknown;
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // ---- Availability ----
  private readonly available = new Set<string>();
  private readonly ready: Promise<void>;
  private readonly missing = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly base = import.meta.env.BASE_URL;

  // ---- Decoded clips ----
  private readonly cache = new Map<string, AudioBuffer>();
  private cacheSecs = 0;
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  /** Buffers made by the test hook (never evicted, count as available). */
  private readonly injected = new Map<string, AudioBuffer>();
  private readonly preloadQueue: string[] = [];
  private pumping = false;

  // ---- Voice ----
  private voiceToken = 0;
  private voiceSrc: AudioBufferSourceNode | null = null;
  private voiceId = '';
  private voiceResolve: (() => void) | null = null;
  lastVoiceId = '';
  voicesPlayed = 0;
  /** The last voice ids that started (tests). */
  private readonly voiceLog: string[] = [];

  // ---- Sfx ----
  private readonly sfxSrcs = new Set<AudioBufferSourceNode>();
  lastSfxId = '';
  sfxPlayed = 0;

  // ---- Music ----
  private tracks: Record<string, string> = {};
  private tracksLoaded: Promise<void> | null = null;
  private wanted: MusicScene | null = null;
  private current: MusicPlay | null = null;
  private readonly fading = new Set<AudioBufferSourceNode>();
  private readonly musicBufs = new Map<string, AudioBuffer>();
  private sceneToken = 0;
  crossfades = 0;

  // ---- State ----
  private hidden = false;
  private gamePaused = false;
  /** Tests: false keeps the clock running while the game loop is paused for deterministic stepping. */
  followPause = true;
  private voiceActive = false;
  private readonly lane = { voice: 0, sfx: 0, music: 0 };

  constructor(private readonly opts: AudioOptions) {
    this.ready = this.loadIndex();
    try {
      this.hidden = document.hidden;
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.hidden;
        this.syncRunning();
      });
      // iOS may leave the context 'suspended' / 'interrupted' after a call or a lock: the next touch wakes it.
      document.addEventListener(
        'pointerdown',
        () => {
          if (this.ctx && this.ctx.state !== 'running') this.syncRunning();
        },
        { capture: true, passive: true },
      );
    } catch {
      // no document (never in the browser)
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Unlock, state
  // ---------------------------------------------------------------------------------------------------------------

  /** Build the gain graph on the shared context. Call inside the first tap, after DrumSynth.unlock(). Never throws. */
  unlock(): void {
    try {
      const ctx = this.opts.getContext();
      if (!ctx) return;
      if (!this.ctx) {
        this.ctx = ctx;
        const master = ctx.createGain();
        const voice = ctx.createGain();
        const sfx = ctx.createGain();
        const music = ctx.createGain();
        voice.connect(master);
        sfx.connect(master);
        music.connect(master);
        master.connect(ctx.destination);
        this.master = master;
        this.voiceGain = voice;
        this.sfxGain = sfx;
        this.musicGain = music;
        // iOS: let sound play even with the silent switch on (Safari 16.4+; ignored elsewhere).
        try {
          const nav = navigator as unknown as { audioSession?: { type: string } };
          if (nav.audioSession) nav.audioSession.type = 'playback';
        } catch {
          // ignore
        }
        this.applyGains(true);
      }
      this.syncRunning();
      void this.pump();
      // The first tap starts the music: the level's scene when it asked for one, else the title music.
      if (this.wanted === null) this.wanted = 'awal';
      this.applyScene();
    } catch {
      // Audio must never break the game.
    }
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.master !== null;
  }

  /** ?mute=1 or settings.sound off. */
  get silent(): boolean {
    return this.opts.muteUrl || !this.opts.soundOn();
  }

  private get musicSilent(): boolean {
    return this.silent || !this.opts.musicOn();
  }

  /** The settings changed (parents page): update gains, stop what must not sound, start what may. */
  refresh(): void {
    if (this.silent) {
      this.stopVoice();
      this.stopSfx();
    }
    this.applyGains(false);
    this.applyScene();
  }

  /** The game loop was paused / resumed (tests only today; there is no pause button for the child). */
  setGamePaused(on: boolean): void {
    this.gamePaused = on;
    this.syncRunning();
  }

  private syncRunning(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const want = !(this.hidden || (this.gamePaused && this.followPause));
      if (want && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      else if (!want && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    } catch {
      // ignore
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Manifest
  // ---------------------------------------------------------------------------------------------------------------

  private async loadIndex(): Promise<void> {
    try {
      const res = await fetch(`${this.base}audio/index.json`, { cache: 'no-cache' });
      if (!res.ok) return;
      const list = (await res.json()) as unknown;
      if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') this.available.add(id);
    } catch {
      // No manifest (e.g. another server): behave as if there were no audio files.
    }
  }

  /** Is there a file (or a test clip) for this voice / sfx id? False until the manifest has loaded. */
  hasFile(id: string): boolean {
    return this.injected.has(id) || this.available.has(id);
  }

  private noteMissing(id: string): void {
    if (this.missing.has(id)) return;
    this.missing.add(id);
    console.info(`[audio] no file for "${id}" (text only)`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Loading and the clip cache
  // ---------------------------------------------------------------------------------------------------------------

  private async load(id: string, logMissing: boolean): Promise<AudioBuffer | null> {
    const inj = this.injected.get(id);
    if (inj) return inj;
    const hit = this.cache.get(id);
    if (hit) {
      this.cache.delete(id); // LRU: most recently used goes last
      this.cache.set(id, hit);
      return hit;
    }
    await this.ready;
    const inj2 = this.injected.get(id);
    if (inj2) return inj2;
    if (!this.available.has(id)) {
      if (logMissing) this.noteMissing(id);
      return null;
    }
    if (this.failed.has(id)) return null;
    let p = this.loading.get(id);
    if (!p) {
      p = this.fetchDecode(`${this.base}audio/${id}.mp3`, id).finally(() => this.loading.delete(id));
      this.loading.set(id, p);
    }
    return p;
  }

  private async fetchDecode(url: string, id: string): Promise<AudioBuffer | null> {
    try {
      const ctx = this.ctx;
      if (!ctx) return null;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      this.cache.set(id, buf);
      this.cacheSecs += buf.duration;
      this.evict();
      return buf;
    } catch (err) {
      this.failed.add(id);
      console.warn(`[audio] could not load "${id}":`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /** Drop the least recently used clips while over the cap (never the one that is playing). */
  private evict(): void {
    for (const [id, buf] of this.cache) {
      if (this.cacheSecs <= AudioConfig.cacheSeconds) break;
      if (id === this.voiceId) continue;
      this.cache.delete(id);
      this.cacheSecs -= buf.duration;
    }
    if (this.cacheSecs < 0) this.cacheSecs = 0;
  }

  /**
   * Load these ids in the background (one at a time, only files that exist) so the first play has no delay. Before the
   * first tap the ids are queued. Stops by itself when the cache is nearly full.
   */
  preload(ids: readonly string[]): void {
    for (const id of ids) {
      if (!id || this.cache.has(id) || this.injected.has(id) || this.preloadQueue.includes(id)) continue;
      this.preloadQueue.push(id);
    }
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping || !this.ctx) return;
    this.pumping = true;
    try {
      await this.ready;
      while (this.preloadQueue.length > 0 && this.ctx) {
        if (this.cacheSecs >= AudioConfig.cacheSeconds * 0.9) {
          this.preloadQueue.length = 0;
          break;
        }
        const id = this.preloadQueue.shift() as string;
        if (this.available.has(id) && !this.cache.has(id)) await this.load(id, false);
      }
    } catch {
      // ignore
    } finally {
      this.pumping = false;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Voice
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Play `audio/{id}.mp3` on the voice lane: stops the clip that was playing, ducks the music while it sounds. Resolves
   * as soon as the clip has started (`duration` is its length) or with `played: false` when there is nothing to play
   * (before the first tap, muted, no file, superseded by a newer call). `ended` resolves when the clip is over.
   */
  async playVoice(id: string): Promise<VoiceResult> {
    const token = ++this.voiceToken;
    this.endVoiceSource();
    if (!id || !this.ctx || !this.voiceGain || this.silent) return NOT_PLAYED;
    try {
      const buf = await this.load(id, true);
      // Stopped or replaced while loading: do not play late.
      if (token !== this.voiceToken || !buf || !this.ctx || !this.voiceGain || this.silent) return NOT_PLAYED;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.voiceGain);
      const ended = new Promise<void>((resolve) => {
        this.voiceResolve = resolve;
      });
      this.voiceSrc = src;
      this.voiceId = id;
      this.lastVoiceId = id;
      this.voicesPlayed++;
      this.voiceLog.push(id);
      if (this.voiceLog.length > 12) this.voiceLog.shift();
      src.onended = (): void => {
        if (this.voiceSrc !== src) return;
        this.endVoiceSource();
        this.applyGains(false);
      };
      src.start();
      this.voiceActive = true;
      this.applyGains(false);
      return { played: true, duration: buf.duration, ended };
    } catch {
      return NOT_PLAYED;
    }
  }

  /** Stop the voice clip now and cancel a clip that is still loading. */
  stopVoice(): void {
    this.voiceToken++;
    this.endVoiceSource();
    this.applyGains(false);
  }

  private endVoiceSource(): void {
    const src = this.voiceSrc;
    const done = this.voiceResolve;
    this.voiceSrc = null;
    this.voiceResolve = null;
    this.voiceId = '';
    this.voiceActive = false;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
      try {
        src.disconnect();
      } catch {
        // ignore
      }
    }
    done?.();
  }

  get voicePlaying(): boolean {
    return this.voiceSrc !== null;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Sfx
  // ---------------------------------------------------------------------------------------------------------------

  /** Play a file-based effect (`sfx_hewan_kucing`) on the sfx lane. Same result shape as playVoice. */
  async playSfx(id: string): Promise<VoiceResult> {
    if (!id || !this.ctx || !this.sfxGain || this.silent) return NOT_PLAYED;
    try {
      const buf = await this.load(id, true);
      if (!buf || !this.ctx || !this.sfxGain || this.silent) return NOT_PLAYED;
      if (this.sfxSrcs.size >= AudioConfig.maxSfx) return NOT_PLAYED;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfxGain);
      const ended = new Promise<void>((resolve) => {
        src.onended = (): void => {
          this.sfxSrcs.delete(src);
          try {
            src.disconnect();
          } catch {
            // ignore
          }
          resolve();
        };
      });
      this.sfxSrcs.add(src);
      this.lastSfxId = id;
      this.sfxPlayed++;
      src.start();
      return { played: true, duration: buf.duration, ended };
    } catch {
      return NOT_PLAYED;
    }
  }

  private stopSfx(): void {
    for (const s of [...this.sfxSrcs]) {
      try {
        s.stop();
      } catch {
        // ignore
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Gains
  // ---------------------------------------------------------------------------------------------------------------

  private setParam(p: AudioParam, v: number, tc: number): void {
    const ctx = this.ctx;
    const q = p as unknown as ParamLike;
    try {
      if (ctx && typeof q.setTargetAtTime === 'function') q.setTargetAtTime(v, ctx.currentTime, tc);
      else q.value = v;
    } catch {
      // ignore
    }
  }

  /** The lane targets follow the settings and the duck state. */
  private applyGains(instant: boolean): void {
    const V = AudioConfig.volumes;
    const silent = this.silent;
    this.lane.voice = silent ? 0 : V.voice;
    this.lane.sfx = silent ? 0 : V.sfx;
    this.lane.music = this.musicSilent ? 0 : V.music * (this.voiceActive ? AudioConfig.duckFactor : 1);
    if (!this.master || !this.voiceGain || !this.sfxGain || !this.musicGain) return;
    const fast = 0.02;
    this.setParam(this.master.gain, V.master, fast);
    this.setParam(this.voiceGain.gain, this.lane.voice, fast);
    this.setParam(this.sfxGain.gain, this.lane.sfx, fast);
    const down = this.voiceActive;
    this.setParam(this.musicGain.gain, this.lane.music, instant ? 0.001 : down ? AudioConfig.duckDownTime : AudioConfig.duckUpTime);
  }

  /** The music is quieter right now because a voice clip plays. */
  get ducked(): boolean {
    return this.voiceActive && !this.musicSilent;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Music
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Choose the music for the current scene (null = none). Levels call this at build. The track comes from
   * `audio/music/tracks.json` (scene -> file name; empty = silence); changing scene crossfades. Before the first tap the
   * scene is remembered and starts with the tap.
   */
  setScene(scene: MusicScene | null): void {
    this.wanted = scene;
    this.applyScene();
  }

  /** `audio.music.setScene('latihan')`: the music lane as a small facade. */
  readonly music = {
    setScene: (scene: MusicScene | null): void => this.setScene(scene),
  };

  get musicScene(): string {
    return this.wanted ?? '';
  }

  get musicPlaying(): boolean {
    return this.current !== null;
  }

  private applyScene(): void {
    if (!this.ctx || !this.musicGain) return;
    const scene = this.wanted;
    const token = ++this.sceneToken; // any switch still loading is out of date now
    if (this.musicSilent || scene === null) {
      if (this.current) this.fadeOutCurrent(this.musicSilent ? 0.15 : AudioConfig.crossfade);
      return;
    }
    if (this.current && this.current.scene === scene) return;
    void this.switchTo(scene, token);
  }

  private async switchTo(scene: MusicScene, token: number): Promise<void> {
    try {
      await this.ready;
      await this.loadTracks();
      if (token !== this.sceneToken) return;
      const file = this.tracks[scene] ?? '';
      const key = `music/${file}`;
      if (this.current) this.fadeOutCurrent(AudioConfig.crossfade);
      if (!file) return; // silence for this scene
      let buf: AudioBuffer | null = this.injected.get(key) ?? this.musicBufs.get(key) ?? null;
      if (!buf) {
        if (!this.available.has(key)) {
          this.noteMissing(key);
          return;
        }
        buf = await this.fetchMusic(key);
        if (token !== this.sceneToken || !buf) return;
      }
      const ctx = this.ctx;
      const dest = this.musicGain;
      if (!ctx || !dest) return;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      src.loop = SCENE_LOOPS[scene];
      src.connect(gain);
      gain.connect(dest);
      const play: MusicPlay = { scene, file: key, src, gain };
      src.onended = (): void => {
        if (this.current === play) this.current = null;
        try {
          src.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
      this.setRamp(gain, 0, 0);
      src.start();
      this.setRamp(gain, 1, AudioConfig.crossfade);
      this.current = play;
    } catch {
      // never break the game for music
    }
  }

  private async loadTracks(): Promise<void> {
    if (!this.tracksLoaded) {
      this.tracksLoaded = (async () => {
        if (!this.available.has('music/tracks.json')) return;
        try {
          const res = await fetch(`${this.base}audio/music/tracks.json`, { cache: 'no-cache' });
          if (!res.ok) return;
          const j = (await res.json()) as Record<string, unknown>;
          for (const s of MUSIC_SCENES) if (typeof j[s] === 'string') this.tracks[s] = j[s] as string;
        } catch {
          // silence
        }
      })();
    }
    await this.tracksLoaded;
  }

  private async fetchMusic(key: string): Promise<AudioBuffer | null> {
    if (this.failed.has(key)) return null;
    try {
      const ctx = this.ctx;
      if (!ctx) return null;
      const res = await fetch(`${this.base}audio/${key}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      this.musicBufs.set(key, buf);
      while (this.musicBufs.size > AudioConfig.musicCache) {
        const old = this.musicBufs.keys().next().value as string;
        if (old === key) break;
        this.musicBufs.delete(old);
      }
      return buf;
    } catch (err) {
      this.failed.add(key);
      console.warn(`[audio] could not load "${key}":`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  private setRamp(g: GainNode, to: number, seconds: number): void {
    const ctx = this.ctx;
    const p = g.gain as unknown as ParamLike;
    try {
      if (!ctx) return;
      const t = ctx.currentTime;
      p.cancelScheduledValues?.(t);
      if (seconds <= 0 || typeof p.linearRampToValueAtTime !== 'function') {
        if (typeof p.setValueAtTime === 'function') p.setValueAtTime(to, t);
        else p.value = to;
        return;
      }
      p.setValueAtTime?.(p.value, t);
      p.linearRampToValueAtTime(to, t + seconds);
    } catch {
      // ignore
    }
  }

  private fadeOutCurrent(seconds: number): void {
    const cur = this.current;
    const ctx = this.ctx;
    if (!cur || !ctx) return;
    this.current = null;
    this.crossfades++;
    this.setRamp(cur.gain, 0, seconds);
    this.fading.add(cur.src);
    cur.src.onended = (): void => {
      this.fading.delete(cur.src);
      try {
        cur.src.disconnect();
        cur.gain.disconnect();
      } catch {
        // ignore
      }
    };
    try {
      cur.src.stop(ctx.currentTime + seconds + 0.05);
    } catch {
      // ignore
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Test handle
  // ---------------------------------------------------------------------------------------------------------------

  /** Live values for `window.__superglen.audio` (getters: nothing is computed per frame). */
  debugHandle(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      get unlocked() {
        return self.unlocked;
      },
      get voicePlaying() {
        return self.voicePlaying;
      },
      get lastVoiceId() {
        return self.lastVoiceId;
      },
      get missing() {
        return [...self.missing];
      },
      get musicScene() {
        return self.musicScene;
      },
      get musicPlaying() {
        return self.musicPlaying;
      },
      get musicFile() {
        return self.current ? self.current.file : '';
      },
      get fading() {
        return self.fading.size;
      },
      get crossfades() {
        return self.crossfades;
      },
      get ducked() {
        return self.ducked;
      },
      get available() {
        return self.available.size;
      },
      get voiceLog() {
        return [...self.voiceLog];
      },
      get voicesPlayed() {
        return self.voicesPlayed;
      },
      get sfxPlayed() {
        return self.sfxPlayed;
      },
      get lastSfxId() {
        return self.lastSfxId;
      },
      get sfxPlaying() {
        return self.sfxSrcs.size;
      },
      /** Target gains of the lanes (0 = silent). */
      get lanes() {
        return { ...self.lane };
      },
      get cacheSeconds() {
        return Math.round(self.cacheSecs * 100) / 100;
      },
      get followPause() {
        return self.followPause;
      },
      set followPause(v: boolean) {
        self.followPause = v;
        self.syncRunning();
      },
      get state() {
        return self.ctx ? self.ctx.state : 'none';
      },
      /** Make a clip of `seconds` (a soft beep or silence) available under `id` ("music/<file>" for a music track). */
      inject(id: string, seconds: number, beep = false): boolean {
        const ctx = self.ctx;
        if (!ctx) return false;
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, Math.max(1, Math.round(sr * seconds)), sr);
        if (beep) {
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = 0.05 * Math.sin((2 * Math.PI * 440 * i) / sr);
        }
        self.injected.set(id, buf);
        return true;
      },
      /** Pretend this file does not exist (drops it from the manifest, the clips and the cache). */
      hide(id: string): void {
        self.available.delete(id);
        self.injected.delete(id);
        const buf = self.cache.get(id);
        if (buf) {
          self.cache.delete(id);
          self.cacheSecs -= buf.duration;
        }
      },
      /** What a level does at build: choose the music scene ('' = none). */
      setScene(scene: string): void {
        self.setScene((MUSIC_SCENES as readonly string[]).includes(scene) ? (scene as MusicScene) : null);
      },
      /** Replace the scene -> file map (as if tracks.json said so) and re-apply the current scene. */
      setTracks(map: Record<string, string>): void {
        self.tracks = { ...map };
        self.tracksLoaded = Promise.resolve();
        if (self.current) self.fadeOutCurrent(0.05);
        self.applyScene();
      },
    };
  }
}
