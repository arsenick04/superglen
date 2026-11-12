export type PromptKind = 'talk' | 'hand' | 'press';

const ICONS: Readonly<Record<PromptKind, string>> = {
  // Speech bubble with three dots.
  talk:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 10 H52 A8 8 0 0 1 60 18 V38 A8 8 0 0 1 52 46 H34 L20 58 V46 H12 A8 8 0 0 1 4 38 V18 A8 8 0 0 1 12 10 Z" fill="#fff"/><circle cx="20" cy="28" r="4.5" fill="#e8453c"/><circle cx="32" cy="28" r="4.5" fill="#e8453c"/><circle cx="44" cy="28" r="4.5" fill="#e8453c"/></svg>',
  // Open hand (take / pick up).
  hand:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#ffe0b5" stroke="#c9822b" stroke-width="3" stroke-linejoin="round"><rect x="14" y="14" width="8" height="26" rx="4"/><rect x="24" y="8" width="8" height="30" rx="4"/><rect x="34" y="10" width="8" height="28" rx="4"/><rect x="44" y="16" width="8" height="24" rx="4"/><path d="M12 34 Q12 24 22 36 L22 42 Q22 56 34 56 Q50 56 52 38 L52 30 L12 30 Z"/></g></svg>',
  // Finger pressing down on a round button.
  press:
    '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="52" rx="22" ry="7" fill="#e8453c"/><ellipse cx="32" cy="48" rx="18" ry="5" fill="#ff8a80"/><rect x="26" y="6" width="12" height="30" rx="6" fill="#ffe0b5" stroke="#c9822b" stroke-width="3"/><path d="M32 46 L24 36 H40 Z" fill="#e8453c"/></svg>',
};

/**
 * One reusable world-anchored prompt (big bouncing icon; on PC also a small "E" key cap).
 * Positioned in screen pixels by Interactions every frame it is visible. No text.
 */
export class PromptIcon {
  readonly element: HTMLDivElement;
  private readonly iconEl: HTMLDivElement;
  private kind: PromptKind | '' = '';
  private shown = false;
  private lastX = -1e9;
  private lastY = -1e9;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'prompt';
    this.element.hidden = true;
    const bob = document.createElement('div');
    bob.className = 'prompt-bob';
    this.iconEl = document.createElement('div');
    this.iconEl.className = 'prompt-icon';
    const key = document.createElement('div');
    key.className = 'prompt-key';
    key.textContent = 'E';
    bob.append(this.iconEl, key);
    this.element.appendChild(bob);
    root.appendChild(this.element);
  }

  get visible(): boolean {
    return this.shown;
  }

  get icon(): string {
    return this.kind;
  }

  setIcon(kind: PromptKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.iconEl.innerHTML = ICONS[kind];
    this.element.dataset.icon = kind;
  }

  /** Show at screen position (CSS px, the centre of the icon's bottom edge). */
  showAt(x: number, y: number): void {
    if (!this.shown) {
      this.shown = true;
      this.element.hidden = false;
    }
    if (Math.abs(x - this.lastX) < 0.25 && Math.abs(y - this.lastY) < 0.25) return;
    this.lastX = x;
    this.lastY = y;
    this.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.element.hidden = true;
  }
}
