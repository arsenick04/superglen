import { ACTIONS, type Action, type InputSource, type Vec2 } from './Input';

/** Keyboard codes (layout independent, KeyboardEvent.code) per action. */
const KEY_ACTIONS: Readonly<Record<Action, readonly string[]>> = {
  jump: ['Space'],
  laser: ['KeyJ'],
  shield: ['KeyK'],
  interact: ['KeyE', 'Enter', 'NumpadEnter'],
  transform: ['KeyQ'],
};

/** Mouse buttons (MouseEvent.button) per action. Only active while the pointer is locked. */
const MOUSE_ACTIONS: Readonly<Partial<Record<Action, number>>> = {
  laser: 0, // left
  shield: 2, // right
};

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

/** Keys whose browser default (page scroll) must be suppressed. */
/**
 * Chrome/Edge sometimes report one huge bogus movementX/Y right after pointer lock is gained
 * (the camera would spin ~90 degrees). Ignore the first events after locking and any single
 * event jumping further than this many pixels.
 */
const MAX_MOUSE_EVENT_DELTA = 250;
const SKIP_EVENTS_AFTER_LOCK = 2;

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * WASD/arrows + mouse. Mouse look only while pointer-locked (click the canvas to lock,
 * Esc releases it - browser default). Works without pointer lock support (keyboard only).
 */
export class KeyboardMouseSource implements InputSource {
  readonly move: Vec2 = { x: 0, y: 0 };

  private readonly keys = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private readonly pressedLatch = new Set<Action>();
  private lookX = 0;
  private lookY = 0;
  private skipMoves = 0;
  private readonly canLock: boolean;

  /**
   * @param canvas element that receives clicks / pointer lock
   * @param sensitivity radians of camera rotation per pixel of mouse movement
   */
  constructor(
    private readonly canvas: HTMLElement,
    private readonly sensitivity: number,
  ) {
    this.canLock = typeof canvas.requestPointerLock === 'function' && 'pointerLockElement' in document;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    if (this.canLock) document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  get pointerLocked(): boolean {
    return this.canLock && document.pointerLockElement === this.canvas;
  }

  update(): void {
    const x = (this.anyKey(RIGHT) ? 1 : 0) - (this.anyKey(LEFT) ? 1 : 0);
    const y = (this.anyKey(FORWARD) ? 1 : 0) - (this.anyKey(BACK) ? 1 : 0);
    // Diagonals normalized so they are not faster than straight movement.
    const inv = x !== 0 && y !== 0 ? Math.SQRT1_2 : 1;
    this.move.x = x * inv;
    this.move.y = y * inv;
  }

  drainLook(out: Vec2): void {
    out.x += this.lookX;
    out.y += this.lookY;
    this.lookX = 0;
    this.lookY = 0;
  }

  isDown(action: Action): boolean {
    const codes = KEY_ACTIONS[action];
    for (let i = 0; i < codes.length; i++) if (this.keys.has(codes[i])) return true;
    const btn = MOUSE_ACTIONS[action];
    return btn !== undefined && this.mouseButtons.has(btn);
  }

  drainPressed(action: Action): boolean {
    return this.pressedLatch.delete(action);
  }

  reset(): void {
    this.keys.clear();
    this.mouseButtons.clear();
    this.pressedLatch.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.move.x = 0;
    this.move.y = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    if (this.canLock) document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    if (this.pointerLocked) document.exitPointerLock();
  }

  private anyKey(codes: readonly string[]): boolean {
    for (let i = 0; i < codes.length; i++) if (this.keys.has(codes[i])) return true;
    return false;
  }

  private actionForKey(code: string): Action | null {
    for (const a of ACTIONS) if (KEY_ACTIONS[a].includes(code)) return a;
    return null;
  }

  private actionForButton(button: number): Action | null {
    for (const a of ACTIONS) if (MOUSE_ACTIONS[a] === button) return a;
    return null;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (!this.keys.has(e.code) && !e.repeat) {
      const action = this.actionForKey(e.code);
      if (action) this.pressedLatch.add(action);
    }
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => this.reset();

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (this.canLock && !this.pointerLocked) {
      // First click only captures the mouse; it does not fire an action.
      e.preventDefault();
      this.requestLock();
      return;
    }
    const action = this.actionForButton(e.button);
    if (action && !this.mouseButtons.has(e.button)) this.pressedLatch.add(action);
    this.mouseButtons.add(e.button);
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    this.mouseButtons.delete(e.button);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    if (this.skipMoves > 0) {
      this.skipMoves--;
      return;
    }
    if (Math.abs(dx) > MAX_MOUSE_EVENT_DELTA || Math.abs(dy) > MAX_MOUSE_EVENT_DELTA) return;
    this.lookX += dx * this.sensitivity;
    this.lookY += dy * this.sensitivity;
  };

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  private readonly onPointerLockChange = (): void => {
    // Losing the lock (Esc, alt-tab) must not leave keys "stuck".
    if (this.pointerLocked) this.skipMoves = SKIP_EVENTS_AFTER_LOCK;
    else this.reset();
  };

  private requestLock(): void {
    try {
      // Some browsers return a Promise (may reject), older ones return undefined.
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // Pointer lock unavailable (e.g. iframe sandbox): keyboard still works.
    }
  }
}
