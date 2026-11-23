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

/** Small, skippable cinematic layer that fills the available screen. */
export class CinematicPlayer {
  private readonly layer: HTMLDivElement;
  private readonly video: HTMLVideoElement;
  private readonly skip: HTMLButtonElement;
  private readonly played = new Set<CinematicId>();
  private readonly prepared = new Set<CinematicId>();
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
    this.layer.append(this.video, this.skip);
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

  /** Hint the browser to cache the URL before the encounter. Never gate playback on this. */
  preload(id: CinematicId): void {
    if (this.prepared.has(id) || !cinematicExists(id)) return;
    this.prepared.add(id);
    const url = `${import.meta.env.BASE_URL}cinematics/cin_${id}.mp4`;
    const hint = document.createElement('link');
    hint.rel = 'prefetch';
    hint.href = url;
    document.head.appendChild(hint);
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
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
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
        this.video.src = `${import.meta.env.BASE_URL}cinematics/cin_${id}.mp4`;
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
