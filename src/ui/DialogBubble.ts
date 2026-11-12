/**
 * Speech bubble view: round face icon on the left, big friendly text, bouncing "next" triangle.
 * Pure view; gameplay/Dialog.ts owns timing and input. Faces are placeholders keyed by speaker id,
 * so real portraits can replace `faceSvg` later without touching the dialog logic.
 */

interface FaceStyle {
  bg: string;
  ring: string;
  /** Extra SVG drawn on top of the face. */
  extra?: string;
}

const FACES: Readonly<Record<string, FaceStyle>> = {
  glen: { bg: '#ff9f43', ring: '#ffffff' },
  nino: { bg: '#4dabf7', ring: '#ffffff' },
  aara: { bg: '#ff8fb1', ring: '#ffffff' },
  // Red face, gold ring and a gold star on the forehead.
  superglen: {
    bg: '#e8453c',
    ring: '#ffc94d',
    extra: '<path d="M32 6 L34.4 11.6 L40.5 12.1 L35.9 16 L37.3 22 L32 18.8 L26.7 22 L28.1 16 L23.5 12.1 L29.6 11.6 Z" fill="#ffc94d"/>',
  },
};
const DEFAULT_FACE: FaceStyle = { bg: '#7bc96f', ring: '#ffffff' };

function faceSvg(speaker: string): string {
  const f = FACES[speaker] ?? DEFAULT_FACE;
  return (
    '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    `<circle cx="32" cy="32" r="29" fill="${f.bg}" stroke="${f.ring}" stroke-width="5"/>` +
    '<circle cx="22" cy="31" r="4" fill="#2b1a12"/><circle cx="42" cy="31" r="4" fill="#2b1a12"/>' +
    '<circle cx="23.4" cy="29.6" r="1.3" fill="#fff"/><circle cx="43.4" cy="29.6" r="1.3" fill="#fff"/>' +
    '<circle cx="15" cy="40" r="4" fill="#ff6f6f" opacity="0.35"/><circle cx="49" cy="40" r="4" fill="#ff6f6f" opacity="0.35"/>' +
    '<path d="M21 41 Q32 53 43 41" fill="none" stroke="#2b1a12" stroke-width="4" stroke-linecap="round"/>' +
    (f.extra ?? '') +
    '</svg>'
  );
}

function el(tag: string, className: string): HTMLDivElement {
  const e = document.createElement(tag) as HTMLDivElement;
  e.className = className;
  return e;
}

export class DialogBubble {
  readonly element: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly face: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private shown = false;
  private speaker = '';

  constructor(root: HTMLElement, onTap: () => void) {
    this.element = el('div', 'dlg');
    this.element.hidden = true;
    this.card = el('div', 'dlg-card');
    this.face = el('div', 'dlg-face');
    this.textEl = el('div', 'dlg-text');
    const next = el('div', 'dlg-next');
    next.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 8 H27 L16 26 Z" fill="#e8453c" stroke="#e8453c" stroke-width="3" stroke-linejoin="round"/></svg>';
    this.card.append(this.face, this.textEl, next);
    this.element.appendChild(this.card);
    // pointerdown works for finger, pen and mouse on iOS Safari (click is unreliable after touch preventDefault).
    this.card.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onTap();
    });
    root.appendChild(this.element);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Show a line. Re-showing while visible swaps the content without replaying the pop-in. */
  show(speaker: string, text: string): void {
    if (speaker !== this.speaker || !this.face.firstChild) {
      this.face.innerHTML = faceSvg(speaker);
      this.face.dataset.speaker = speaker;
      this.speaker = speaker;
    }
    this.textEl.textContent = text;
    if (!this.shown) {
      this.shown = true;
      this.element.hidden = false;
      // Restart the pop-in animation.
      this.card.classList.remove('pop');
      void this.card.offsetWidth;
      this.card.classList.add('pop');
    }
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.element.hidden = true;
    this.card.classList.remove('pop');
  }
}
