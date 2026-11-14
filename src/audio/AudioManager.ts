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

/** One streamed music track: an HTMLAudioElement (never decoded into memory) routed through its own gain node. */
interface MusicPlay {
  scene: MusicScene;
  file: string;
  el: HTMLAudioElement;
  /** null when createMediaElementSource is unavailable: the element's own volume does the ducking and fading. */
  node: MediaElementAudioSourceNode | null;
  gain: GainNode;
  /** Per-track volume from tracks.json (0..1). */
  vol: number;
  /** Fallback mode only: the fade level 0..1. */
  level: number;
  timer: ReturnType<typeof setTimeout> | null;
  ramp: ReturnType<typeof setInterval> | null;
  dead: boolean;
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
  /** Test hook: ids that must behave as missing even if the manifest lists them (survives a load still in flight). */
  private readonly hiddenIds = new Set<string>();
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
  private tracks: Record<string, { file: string; vol: number }> = {};
  /** Test hook: music keys that play from a blob URL instead of a file. */
  private readonly injectedMusic = new Map<string, string>();
  /** The looping scene to go back to when a one-shot scene (berubah) ends. */
  private returnScene: MusicScene | null = null;
  /** Longest AudioBuffer this manager ever created or decoded (tests: music must never be one). */
  maxBufferSeconds = 0;
  private tracksLoaded: Promise<void> | null = null;
  private wanted: MusicScene | null = null;
  private current: MusicPlay | null = null;
  private readonly fading = new Set<MusicPlay>();
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
          this.kickMusic(); // a play() the browser refused earlier succeeds inside a gesture
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

  /** The sfx lane's gain node: the procedural effects of `Sfx` connect here (null before the first tap). */
  get sfxOut(): GainNode | null {
    return this.sfxGain;
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
      // The streamed music element follows (iOS pauses media in the background; it does not resume by itself).
      if (want) this.kickMusic();
      else {
        this.current?.el.pause();
        for (const f of this.fading) f.el.pause();
      }
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
    return this.injected.has(id) || (this.available.has(id) && !this.hiddenIds.has(id));
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
    if (this.hiddenIds.has(id)) {
      if (logMissing) this.noteMissing(id);
      return null;
    }
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
      // 'no-cache' = always revalidate: clip file names stay the same when a voice is re-recorded, so a cached copy would
      // keep playing the old voice.
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      this.maxBufferSeconds = Math.max(this.maxBufferSeconds, buf.duration);
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
    if (this.current && !this.current.node) this.fallbackVolume(this.current);
    for (const f of this.fading) if (!f.node) this.fallbackVolume(f);
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
    // Remember the looping scene a one-shot (berubah) interrupts, to return to it when the sting ends.
    if (scene !== null && !SCENE_LOOPS[scene] && this.wanted !== null && SCENE_LOOPS[this.wanted]) this.returnScene = this.wanted;
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
    const c = this.current;
    return c !== null && !c.el.paused && !c.el.ended;
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
      const entry = this.tracks[scene];
      const key = entry && entry.file ? `music/${entry.file}` : '';
      if (this.current) this.fadeOutCurrent(AudioConfig.crossfade);
      if (!key || !entry) return; // silence for this scene
      let url = this.injectedMusic.get(key) ?? '';
      if (!url) {
        if (this.failed.has(key)) return;
        if (!this.available.has(key)) {
          this.noteMissing(key);
          return;
        }
        url = `${this.base}audio/${key}`;
      }
      this.startMusic(scene, key, url, entry.vol);
    } catch {
      // never break the game for music
    }
  }

  /** Start streaming one track. The file is never decoded: the browser streams it through the element. */
  private startMusic(scene: MusicScene, key: string, url: string, vol: number): void {
    const ctx = this.ctx;
    const dest = this.musicGain;
    if (!ctx || !dest) return;
    const el = new Audio();
    el.preload = 'auto';
    el.loop = SCENE_LOOPS[scene];
    el.setAttribute('playsinline', '');
    (el as unknown as { playsInline: boolean }).playsInline = true;
    const gain = ctx.createGain();
    let node: MediaElementAudioSourceNode | null = null;
    try {
      node = ctx.createMediaElementSource(el);
      node.connect(gain);
      gain.connect(dest);
    } catch {
      node = null; // fall back to element.volume
    }
    const play: MusicPlay = { scene, file: key, el, node, gain, vol, level: 0, timer: null, ramp: null, dead: false };
    el.addEventListener('ended', () => {
      if (play.dead || this.current !== play) return;
      this.current = null;
      this.releaseMusic(play);
      // A one-shot (berubah) is over: go back to the scene it interrupted.
      if (!SCENE_LOOPS[scene] && this.wanted === scene) this.setScene(this.returnScene);
    });
    el.addEventListener('error', () => {
      if (play.dead) return;
      this.failed.add(key);
      console.warn(`[audio] could not play "${key}"`);
      if (this.current === play) this.current = null;
      this.releaseMusic(play);
    });
    this.current = play;
    el.src = url;
    this.rampMusic(play, vol, 0, 0);
    this.rampMusic(play, vol, 1, AudioConfig.crossfade);
    this.kickMusic();
  }

  /** (Re)try play() on the current track. iOS refuses it outside a gesture: the next tap retries. */
  private kickMusic(): void {
    const c = this.current;
    if (!c || c.dead || c.el.ended || !c.el.paused) return;
    if (this.hidden || (this.gamePaused && this.followPause)) return;
    try {
      const p = c.el.play();
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      // retried on the next tap
    }
  }

  /** Fade a track's level to `to` (0..1) over `seconds`, through its gain node, or through element.volume in fallback mode. */
  private rampMusic(play: MusicPlay, vol: number, to: number, seconds: number): void {
    if (play.node) {
      this.setRamp(play.gain, to * vol, seconds);
      return;
    }
    if (play.ramp) clearInterval(play.ramp);
    play.ramp = null;
    const from = play.level;
    if (seconds <= 0) {
      play.level = to;
      this.fallbackVolume(play);
      return;
    }
    const t0 = performance.now();
    play.ramp = setInterval(() => {
      const f = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      play.level = from + (to - from) * f;
      this.fallbackVolume(play);
      if (f >= 1 && play.ramp) {
        clearInterval(play.ramp);
        play.ramp = null;
      }
    }, 50);
  }

  private fallbackVolume(play: MusicPlay): void {
    try {
      play.el.volume = Math.max(0, Math.min(1, this.lane.music * play.vol * play.level));
    } catch {
      // ignore
    }
  }

  /** Pause, drop the source and free the element (an element that kept its src would keep streaming / buffering). */
  private releaseMusic(play: MusicPlay): void {
    play.dead = true;
    if (play.timer) clearTimeout(play.timer);
    if (play.ramp) clearInterval(play.ramp);
    play.timer = null;
    play.ramp = null;
    this.fading.delete(play);
    try {
      play.el.pause();
      play.el.removeAttribute('src');
      play.el.load();
    } catch {
      // ignore
    }
    try {
      play.node?.disconnect();
      play.gain.disconnect();
    } catch {
      // ignore
    }
  }

  private async loadTracks(): Promise<void> {
    if (!this.tracksLoaded) {
      this.tracksLoaded = (async () => {
        if (!this.available.has('music/tracks.json')) return;
        try {
          const res = await fetch(`${this.base}audio/music/tracks.json`, { cache: 'no-cache' });
          if (!res.ok) return;
          this.setTrackMap((await res.json()) as Record<string, unknown>);
        } catch {
          // silence
        }
      })();
    }
    await this.tracksLoaded;
  }

  /** An entry is a file name, or `{ file, volume? }` (volume 0..1). Empty = silence. */
  private setTrackMap(j: Record<string, unknown>): void {
    this.tracks = {};
    for (const sc of MUSIC_SCENES) {
      const e = j[sc];
      if (typeof e === 'string') this.tracks[sc] = { file: e, vol: 1 };
      else if (e && typeof e === 'object' && typeof (e as { file?: unknown }).file === 'string') {
        const v = (e as { volume?: unknown }).volume;
        this.tracks[sc] = { file: (e as { file: string }).file, vol: typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 1 };
      }
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
    if (!cur) return;
    this.current = null;
    this.crossfades++;
    // At most 2 elements alive (the new one and this one): an older fade is cut short.
    for (const f of [...this.fading]) this.releaseMusic(f);
    this.rampMusic(cur, cur.vol, 0, seconds);
    this.fading.add(cur);
    cur.timer = setTimeout(() => this.releaseMusic(cur), seconds * 1000 + 100);
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
        if (id.startsWith('music/')) {
          // Music is streamed: a tiny generated WAV (8 kHz, 16 bit) behind a blob URL.
          const sr = 8000;
          const n = Math.max(1, Math.round(sr * seconds));
          const buf = new ArrayBuffer(44 + n * 2);
          const v = new DataView(buf);
          const str = (o: number, t: string): void => {
            for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
          };
          str(0, 'RIFF');
          v.setUint32(4, 36 + n * 2, true);
          str(8, 'WAVEfmt ');
          v.setUint32(16, 16, true);
          v.setUint16(20, 1, true);
          v.setUint16(22, 1, true);
          v.setUint32(24, sr, true);
          v.setUint32(28, sr * 2, true);
          v.setUint16(32, 2, true);
          v.setUint16(34, 16, true);
          str(36, 'data');
          v.setUint32(40, n * 2, true);
          if (beep) for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(1600 * Math.sin((2 * Math.PI * 440 * i) / sr)), true);
          self.injectedMusic.set(id, URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
          self.hiddenIds.delete(id);
          return true;
        }
        const sr = ctx.sampleRate;
        const buf = ctx.createBuffer(1, Math.max(1, Math.round(sr * seconds)), sr);
        self.maxBufferSeconds = Math.max(self.maxBufferSeconds, buf.duration);
        if (beep) {
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = 0.05 * Math.sin((2 * Math.PI * 440 * i) / sr);
        }
        self.hiddenIds.delete(id);
        self.injected.set(id, buf);
        return true;
      },
      /** Fallback mode (no MediaElementSource): the element's own volume. */
      get musicElVolume() {
        return self.current ? self.current.el.volume : -1;
      },
      get musicFallback() {
        return !!self.current && !self.current.node;
      },
      get maxBufferSeconds() {
        return self.maxBufferSeconds;
      },
      /** Pretend this file does not exist (drops it from the manifest, the clips and the cache). */
      hide(id: string): void {
        self.hiddenIds.add(id);
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
      setTracks(map: Record<string, unknown>): void {
        self.setTrackMap(map);
        self.tracksLoaded = Promise.resolve();
        if (self.current) self.fadeOutCurrent(0.05);
        self.applyScene();
      },
    };
  }
}
