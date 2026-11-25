export type CinematicId = 'open' | 'hill' | 'transform' | 'curut' | 'rakus-appears' | 'snake-defeat' | 'rakus-warehouse' | 'rakus-defeat' | 'elang' | 'elang-defeat' | 'elang-chaos' | 'aara-meet' | 'forest-fire' | 'gorilla-meet' | 'gorilla-win' | 'ending';

export interface CinematicOptions {
  /**
   * Keeps the layer up after the video (its last frame stays; a sky gradient when there is no video file) and runs this on top of it
   * (the credit roll). The layer closes when the promise resolves. `stage` is an empty full-screen element on top of the video.
   */
  hold?: (stage: HTMLDivElement) => Promise<void>;
}

/** Is there a file public/cinematics/cin_<id>.mp4? (Known at build time, so a missing one is never requested.) */
export function cinematicExists(id: CinematicId): boolean {
  return typeof __CINEMATICS__ === 'undefined' || __CINEMATICS__.includes(id);
}

/**
 * Which cinematics to download when a level starts (first = the one needed soonest). Kota depends on the chapters done so far.
 * Everything else is a fixed list. Kept short: the cache holds at most MAX_VIDEOS.
 */
export function cinematicsForLevel(levelId: string, done: readonly string[]): CinematicId[] {
  const has = (c: string): boolean => done.includes(c);
  switch (levelId) {
    case 'kota':
      if (!has('bab1')) return ['hill'];
      if (!has('bab3')) return ['curut', 'rakus-appears'];
      if (!has('bab4')) return ['aara-meet'];
      if (!has('bab5')) return ['snake-defeat'];
      if (!has('bab6')) return ['rakus-warehouse', 'rakus-defeat'];
      if (!has('bab7')) return ['elang', 'elang-defeat'];
      return [];
    case 'lab': case 'bab1street': return has('bab1') ? ['forest-fire', 'elang-chaos'] : ['transform'];
    case 'flight-training': return ['elang-chaos'];
    case 'battle-elang': return ['elang', 'elang-defeat'];
    case 'forest-rescue': return ['gorilla-meet', 'gorilla-win'];
    case 'battle-gorilla': return ['gorilla-win', 'ending'];
    case 'forest-firefight': case 'ending': return ['ending'];
    default: return [];
  }
}

const MAX_VIDEOS = 3;
const MAX_BYTES = 40 * 1024 * 1024;
/** How long play() waits for a download that is still running before it streams the file directly. */
const LOAD_WAIT_MS = 20000;

interface CacheEntry {
  state: 'loading' | 'ready' | 'failed';
  url: string;
  bytes: number;
  done: Promise<void>;
  abort: AbortController;
}

function dataSaver(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (!!c.saveData || c.effectiveType === '2g' || c.effectiveType === 'slow-2g');
}

/** Small, skippable cinematic layer that fills the available screen. */
export class CinematicPlayer {
  private readonly layer: HTMLDivElement;
  private readonly video: HTMLVideoElement;
  private readonly skip: HTMLButtonElement;
  private readonly played = new Set<CinematicId>();
  private readonly cache = new Map<CinematicId, CacheEntry>();
  private wanted: CinematicId[] = [];
  private queue: CinematicId[] = [];
  private pumping = false;
  private active: CinematicId | null = null;
  private readonly loader: HTMLDivElement;
  private running = false;

  constructor(root: HTMLElement, private readonly lock: (locked: boolean) => void, private readonly onPlayback: (playing: boolean) => void) {
    this.layer = document.createElement('div');
    this.layer.className = 'cinematic-layer';
    this.layer.hidden = true;
    this.video = document.createElement('video');
    this.video.className = 'cinematic-video';
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.setAttribute('aria-label', 'Cinematic Superglen');
    this.skip = document.createElement('button');
    this.skip.className = 'cinematic-skip';
    this.skip.type = 'button';
    this.skip.textContent = 'Lewati';
    this.layer.style.pointerEvents = 'auto';
    this.loader = document.createElement('div');
    this.loader.className = 'cinematic-loading';
    this.loader.hidden = true;
    const spin = document.createElement('div');
    spin.className = 'cinematic-spinner';
    const msg = document.createElement('div');
    msg.textContent = 'Sebentar ya...';
    this.loader.append(spin, msg);
    this.layer.append(this.video, this.loader, this.skip);
    root.appendChild(this.layer);
    this.skip.addEventListener('click', () => this.finish());
    this.skip.addEventListener('pointerup', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.finish();
    });
    this.skip.addEventListener('touchend', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.finish();
    }, { passive: false });
  }

  /** A level started: download its cinematics in the background (one at a time, low priority). Data saver: only the first one. */
  enterLevel(ids: readonly CinematicId[]): void {
    let list = ids.filter(cinematicExists).filter((i) => !this.played.has(i));
    if (dataSaver()) list = list.slice(0, 1);
    list = list.slice(0, MAX_VIDEOS);
    this.wanted = list;
    // Leaving a chapter: drop what is no longer wanted (never the one on screen).
    for (const id of [...this.cache.keys()]) if (!list.includes(id) && id !== this.active) this.release(id);
    this.queue = this.queue.filter((i) => list.includes(i));
    for (const id of list) this.enqueue(id);
  }

  /** The next video is likely needed soon (levels call this); never gates playback. */
  preload(id: CinematicId): void {
    if (!cinematicExists(id) || this.played.has(id)) return;
    if (!this.wanted.includes(id)) {
      if (this.wanted.length >= MAX_VIDEOS || dataSaver() && this.wanted.length >= 1) return;
      this.wanted.push(id);
    }
    this.enqueue(id);
  }

  private enqueue(id: CinematicId): void {
    if (this.cache.has(id) || this.queue.includes(id)) return;
    this.queue.push(id);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        if (this.cache.has(id) || !this.wanted.includes(id)) continue;
        await this.begin(id, true).done;
      }
    } finally {
      this.pumping = false;
    }
  }

  private begin(id: CinematicId, low: boolean): CacheEntry {
    const old = this.cache.get(id);
    if (old) return old;
    const abort = new AbortController();
    const entry: CacheEntry = { state: 'loading', url: '', bytes: 0, abort, done: Promise.resolve() };
    entry.done = (async () => {
      try {
        const init: RequestInit & { priority?: string } = { signal: abort.signal };
        if (low) init.priority = 'low';
        const res = await fetch(`${import.meta.env.BASE_URL}cinematics/cin_${id}.mp4`, init);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (abort.signal.aborted) return;
        entry.url = URL.createObjectURL(blob);
        entry.bytes = blob.size;
        entry.state = 'ready';
        this.trim(id);
      } catch {
        entry.state = 'failed';
      }
    })();
    this.cache.set(id, entry);
    return entry;
  }

  /** Keep memory small: drop the oldest ready videos that are not the newest one or on screen. */
  private trim(keep: CinematicId): void {
    const total = (): number => [...this.cache.values()].reduce((n, e) => n + e.bytes, 0);
    for (const id of [...this.cache.keys()]) {
      if (this.cache.size <= MAX_VIDEOS && total() <= MAX_BYTES) break;
      if (id !== keep && id !== this.active && this.cache.get(id)?.state === 'ready') this.release(id);
    }
  }

  private release(id: CinematicId): void {
    const e = this.cache.get(id);
    if (!e) return;
    e.abort.abort();
    if (e.url) URL.revokeObjectURL(e.url);
    this.cache.delete(id);
  }

  play(id: CinematicId, opts: CinematicOptions = {}): Promise<void> {
    if (this.played.has(id) || this.running) return Promise.resolve();
    this.played.add(id);
    // No file (yet): skip gracefully, or just show the sky gradient behind the held overlay.
    if (!cinematicExists(id)) return opts.hold ? this.holdOnly(opts.hold) : Promise.resolve();
    this.running = true;
    this.lock(true);
    this.layer.hidden = false;
    this.layer.style.visibility = 'hidden';
    this.video.muted = false;
    this.active = id;
    this.video.dataset.cin = id;
    const entry = this.begin(id, false);
    if (entry.state === 'loading') {
      // Not downloaded yet: show a friendly waiting state over the dark layer (skip stays available).
      this.layer.style.visibility = '';
      this.loader.hidden = false;
    }
    // Silence gameplay audio before buffering starts, so no VO/music leaks into the first video frames.
    this.onPlayback(true);
    return new Promise<void>((resolve) => {
      let started = false;
      let holding = false;
      let holdStarted = false;
      let timeout = window.setTimeout(() => finish(), 12000);
      const onPlaying = (): void => {
        window.clearTimeout(timeout);
        if (started || !this.running) return;
        started = true;
        this.loader.hidden = true;
        this.layer.style.visibility = '';
      };
      const onWaiting = (): void => {
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => finish(), 12000);
      };
      const finish = (): void => {
        window.clearTimeout(timeout);
        if (opts.hold && !holdStarted && this.running) {
          // Keep the last frame and run the overlay; the real finish comes when it is done.
          holdStarted = true;
          holding = true;
          this.video.removeEventListener('playing', onPlaying);
          this.video.removeEventListener('waiting', onWaiting);
          this.video.removeEventListener('ended', finish);
          this.video.removeEventListener('error', finish);
          this.video.pause();
          this.loader.hidden = true;
          this.layer.style.visibility = '';
          this.skip.hidden = true;
          if (!this.video.videoWidth) this.layer.classList.add('cinematic-sky'); // nothing decoded: gradient instead of a black screen
          this.onPlayback(false); // the voice-over plays on top
          const stage = this.makeStage();
          void opts.hold(stage).catch(() => undefined).then(() => { stage.remove(); holding = false; this.skip.hidden = false; this.layer.classList.remove('cinematic-sky'); finish(); });
          return;
        }
        if (holding) return;
        this.video.removeEventListener('playing', onPlaying);
        this.video.removeEventListener('waiting', onWaiting);
        this.video.removeEventListener('ended', finish);
        this.video.removeEventListener('error', finish);
        this.onPlayback(false);
        this.layer.hidden = true;
        this.layer.style.visibility = '';
        this.loader.hidden = true;
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
        delete this.video.dataset.cin;
        this.active = null;
        this.release(id); // played once: free the memory
        this.running = false;
        this.lock(false);
        resolve();
      };
      this.video.addEventListener('playing', onPlaying);
      this.video.addEventListener('waiting', onWaiting);
      this.video.addEventListener('ended', finish, { once: true });
      this.video.addEventListener('error', finish, { once: true });
      // Safari allows inline muted autoplay when audible autoplay is blocked.
      // Never advance the story merely because a play request was rejected.
      const start = async (): Promise<void> => {
        if (entry.state === 'loading') {
          let timer = 0;
          const timedOut = new Promise<void>((r) => { timer = window.setTimeout(r, LOAD_WAIT_MS); });
          await Promise.race([entry.done, timedOut]);
          window.clearTimeout(timer);
          if (!this.running) return; // skipped while waiting
        }
        if (entry.state === 'failed') { finish(); return; } // no download: the story just continues
        // Ready: the cached blob. Still loading after the wait: stream the file directly instead.
        this.video.src = entry.state === 'ready' ? entry.url : `${import.meta.env.BASE_URL}cinematics/cin_${id}.mp4`;
        try {
          await this.video.play();
        } catch {
          if (!this.running) return;
          this.video.muted = true;
          try { await this.video.play(); } catch { finish(); }
        }
      };
      void start();
    });
  }

  /** The hold overlay without any video: a sky gradient and the overlay on top. */
  private holdOnly(hold: (stage: HTMLDivElement) => Promise<void>): Promise<void> {
    this.running = true;
    this.lock(true);
    this.layer.hidden = false;
    this.layer.classList.add('cinematic-sky');
    this.skip.hidden = true;
    const stage = this.makeStage();
    return hold(stage).catch(() => undefined).then(() => {
      stage.remove();
      this.layer.classList.remove('cinematic-sky');
      this.layer.hidden = true;
      this.skip.hidden = false;
      this.running = false;
      this.lock(false);
    });
  }

  private makeStage(): HTMLDivElement {
    const stage = document.createElement('div');
    stage.className = 'cinematic-stage';
    this.layer.appendChild(stage);
    return stage;
  }

  private finish(): void {
    if (!this.running) return;
    // Skipping the video of a held cinematic jumps to its last frame (the overlay then starts on it).
    if (Number.isFinite(this.video.duration) && this.video.duration > 0) {
      try { this.video.currentTime = Math.max(0, this.video.duration - 0.04); } catch { /* not seekable yet */ }
    }
    this.video.pause();
    this.video.dispatchEvent(new Event('ended'));
  }
}
