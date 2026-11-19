export type CinematicId = 'open' | 'hill' | 'transform' | 'curut';

/** Small, skippable cinematic layer with a black 16:9 stage. */
export class CinematicPlayer {
  private readonly layer: HTMLDivElement;
  private readonly video: HTMLVideoElement;
  private readonly skip: HTMLButtonElement;
  private readonly start: HTMLButtonElement;
  private readonly played = new Set<CinematicId>();
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
    this.start = document.createElement('button');
    this.start.className = 'cinematic-start';
    this.start.type = 'button';
    this.start.textContent = '▶ Putar video';
    this.start.hidden = true;
    this.layer.append(this.video, top, bottom, this.start, this.skip);
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
    const resume = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      // iOS permits media with sound here because this call is made directly
      // from the child's tap. Keep the cinematic open if it still refuses.
      void this.video.play().then(() => { this.start.hidden = true; }).catch(() => { this.start.hidden = false; });
    };
    this.start.addEventListener('click', resume);
    this.start.addEventListener('pointerup', resume);
    this.start.addEventListener('touchend', resume, { passive: false });
  }

  play(id: CinematicId): Promise<void> {
    if (this.played.has(id) || this.running) return Promise.resolve();
    this.played.add(id);
    this.running = true;
    this.lock(true);
    this.layer.hidden = false;
    this.start.hidden = true;
    this.video.src = `${import.meta.env.BASE_URL}cinematics/cin_${id}.mp4`;
    this.video.currentTime = 0;
    return new Promise<void>((resolve) => {
      const finish = (): void => {
        this.video.removeEventListener('ended', finish);
        this.video.removeEventListener('error', finish);
        this.layer.hidden = true;
        this.start.hidden = true;
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.load();
        this.running = false;
        this.lock(false);
        resolve();
      };
      this.video.addEventListener('ended', finish, { once: true });
      this.video.addEventListener('error', finish, { once: true });
      // A later story cinematic is not always considered part of a user
      // gesture by mobile Safari. Do not silently skip it when autoplay is
      // rejected: offer one explicit tap that can legally start sound.
      void this.video.play().catch(() => { this.start.hidden = false; });
    });
  }

  private finish(): void {
    if (!this.running) return;
    this.video.pause();
    this.video.dispatchEvent(new Event('ended'));
  }
}
