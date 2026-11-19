export type CinematicId = 'open' | 'hill' | 'transform' | 'curut' | 'rakus-appears' | 'snake-defeat' | 'rakus-warehouse';

/** Small, skippable cinematic layer with a black 16:9 stage. */
export class CinematicPlayer {
  private readonly layer: HTMLDivElement;
  private readonly video: HTMLVideoElement;
  private readonly skip: HTMLButtonElement;
  private readonly played = new Set<CinematicId>();
  private readonly prepared = new Map<CinematicId, Promise<string>>();
  private running = false;

  constructor(root: HTMLElement, private readonly lock: (locked: boolean) => void) {
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

  /** Fetch during exploration so the encounter does not wait on the network. */
  preload(id: CinematicId): void {
    if (this.prepared.has(id)) return;
    const url = `${import.meta.env.BASE_URL}cinematics/cin_${id}.mp4`;
    this.prepared.set(id, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Cinematic ${id}: ${response.status}`);
      return response.blob();
    }).then((blob) => URL.createObjectURL(blob)).catch(() => url));
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
      const finish = (): void => {
        this.video.removeEventListener('ended', finish);
        this.video.removeEventListener('error', finish);
        this.layer.hidden = true;
        this.layer.style.visibility = '';
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
        const prepared = this.prepared.get(id);
        if (prepared) void prepared.then((url) => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
        this.prepared.delete(id);
        this.running = false;
        this.lock(false);
        resolve();
      };
      this.video.addEventListener('ended', finish, { once: true });
      this.video.addEventListener('error', finish, { once: true });
      // Safari allows inline muted autoplay when audible autoplay is blocked.
      // Never advance the story merely because a play request was rejected.
      const start = async (): Promise<void> => {
        const url = await (this.prepared.get(id) ?? Promise.resolve(`${import.meta.env.BASE_URL}cinematics/cin_${id}.mp4`));
        if (!this.running) return;
        this.video.src = url;
        this.video.currentTime = 0;
        try {
          await this.video.play();
        } catch {
          if (!this.running) return;
          this.video.muted = true;
          try { await this.video.play(); } catch { /* Keep Lewati available. */ }
        }
        if (this.running) this.layer.style.visibility = '';
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
