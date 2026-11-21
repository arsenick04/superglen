export type CinematicId = 'open' | 'hill' | 'transform' | 'curut' | 'rakus-appears' | 'snake-defeat' | 'rakus-warehouse' | 'rakus-defeat' | 'elang';

/** Small, skippable cinematic layer with a black 16:9 stage. */
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
    const top = document.createElement('div'); top.className = 'cinematic-bar cinematic-bar-top';
    const bottom = document.createElement('div'); bottom.className = 'cinematic-bar cinematic-bar-bottom';
    this.skip = document.createElement('button');
    this.skip.className = 'cinematic-skip';
    this.skip.type = 'button';
    this.skip.textContent = 'Lewati';
    this.layer.style.pointerEvents = 'auto';
    this.layer.append(this.video, top, bottom, this.skip);
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
    if (this.prepared.has(id)) return;
    this.prepared.add(id);
    const url = `${import.meta.env.BASE_URL}cinematics/cin_${id}.mp4`;
    const hint = document.createElement('link');
    hint.rel = 'prefetch';
    hint.href = url;
    document.head.appendChild(hint);
  }

  play(id: CinematicId): Promise<void> {
    if (this.played.has(id) || this.running) return Promise.resolve();
    this.played.add(id);
    this.running = true;
    this.lock(true);
    this.layer.hidden = false;
    this.layer.style.visibility = 'hidden';
    this.video.muted = false;
    return new Promise<void>((resolve) => {
      let started = false;
      let timeout = window.setTimeout(() => finish(), 12000);
      const onPlaying = (): void => {
        window.clearTimeout(timeout);
        if (started || !this.running) return;
        started = true;
        this.layer.style.visibility = '';
        this.onPlayback(true);
      };
      const onWaiting = (): void => {
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => finish(), 12000);
      };
      const finish = (): void => {
        window.clearTimeout(timeout);
        this.video.removeEventListener('playing', onPlaying);
        this.video.removeEventListener('waiting', onWaiting);
        this.video.removeEventListener('ended', finish);
        this.video.removeEventListener('error', finish);
        if (started) this.onPlayback(false);
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

  private finish(): void {
    if (!this.running) return;
    this.video.pause();
    this.video.dispatchEvent(new Event('ended'));
  }
}
