/**
 * "Start" gate: becomes open on the first user gesture (tap on touch, click on PC).
 * Other systems hook in with `onStart` - e.g. the audio manager (package B4) unlocks the iOS
 * AudioContext inside this callback, because it runs synchronously from the user's tap.
 */
type StartCallback = () => void;

class StartGate {
  private _started = false;
  private readonly callbacks: StartCallback[] = [];

  get started(): boolean {
    return this._started;
  }

  /** Runs `cb` when play starts (immediately if it already has). Callbacks run once. */
  onStart(cb: StartCallback): void {
    if (this._started) {
      cb();
      return;
    }
    this.callbacks.push(cb);
  }

  /** Open the gate. Call from inside a user-gesture event handler. */
  start(): void {
    if (this._started) return;
    this._started = true;
    document.documentElement.classList.add('game-started');
    for (const cb of this.callbacks.splice(0)) {
      try {
        cb();
      } catch (err) {
        console.error('StartGate callback failed:', err);
      }
    }
  }
}

export const startGate = new StartGate();
