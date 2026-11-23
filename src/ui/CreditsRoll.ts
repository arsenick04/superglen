import type { AudioManager } from '../audio/AudioManager';
import { Ending } from '../config/ending';

/**
 * The movie-style credit roll: one centred white line at a time fades in below the middle, rises slowly through it and fades out.
 * Each line plays its voice-over clip when it starts (when the clip exists); it stays until the clip ends (plus a tail) or for a
 * fallback time, never shorter than `Ending.minLineSeconds`. A tap skips the roll once the first line is done.
 * Runs in real time (requestAnimationFrame), independent of the game loop. Resolves when it is over or skipped.
 */
export function runCredits(stage: HTMLElement, audio: AudioManager | null): Promise<void> {
  return new Promise<void>((resolve) => {
    let skipOk = false;
    let done = false;
    let raf = 0;
    let timer = 0;
    const finish = (): void => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      audio?.stopVoice();
      stage.removeEventListener('pointerup', onTap);
      stage.style.transition = 'opacity .8s';
      stage.style.opacity = '0';
      window.setTimeout(resolve, 800);
    };
    const onTap = (): void => { if (skipOk) finish(); };
    stage.addEventListener('pointerup', onTap);

    const wait = (s: number): Promise<void> => new Promise((r) => { timer = window.setTimeout(r, s * 1000); });

    const showLine = (text: string, seconds: number): Promise<void> => new Promise((r) => {
      const el = document.createElement('p');
      el.className = 'credit-line';
      el.textContent = text;
      stage.appendChild(el);
      const t0 = performance.now();
      const fade = Math.min(Ending.fadeSeconds, seconds / 3);
      const tick = (now: number): void => {
        if (done) { el.remove(); r(); return; }
        const t = (now - t0) / 1000;
        const u = Math.min(1, t / seconds);
        const op = Math.min(1, t / fade, (seconds - t) / fade);
        // From a little below the middle to a little above it; the element's own height is centred by the -50%.
        const y = (0.5 - u) * Ending.riseFraction * 2 * stage.clientHeight;
        el.style.opacity = String(Math.max(0, op));
        el.style.transform = `translate(-50%, calc(-50% + ${y.toFixed(1)}px))`;
        if (t >= seconds) { el.remove(); r(); return; }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    void (async () => {
      for (let i = 0; i < Ending.lines.length && !done; i++) {
        const line = Ending.lines[i];
        let seconds = Math.max(Ending.minLineSeconds, Ending.fallbackLineSeconds, line.text.length * Ending.secondsPerChar + 2);
        if (audio) {
          try {
            const v = await audio.playVoice(line.id);
            if (v.played) seconds = Math.max(Ending.minLineSeconds, v.duration + Ending.voiceTailSeconds);
          } catch { /* no clip: the fallback time */ }
        }
        await showLine(line.text, seconds);
        if (i + 1 >= Ending.skipAfterLine) skipOk = true;
        if (done) return;
        await wait(i + 1 < Ending.lines.length ? Ending.gapSeconds : Ending.endHoldSeconds);
      }
      finish();
    })();
  });
}
