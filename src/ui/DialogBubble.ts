/**
 * Speech bubble view: round portrait of the speaker (rendered from the GLB models / enemy reference art by
 * scripts/make-portraits.mjs, public/portraits) with a name tag, big friendly text that wraps to up to 3 lines
 * (never cut off), bouncing "next" triangle. Speakers without a portrait get a drawn face.
 * Pure view; gameplay/Dialog.ts owns timing and input.
 */

interface FaceStyle {
  bg: string;
  ring: string;
  /** Skin tone of the drawn face. */
  skin?: string;
  /** Hair / hat drawn BEHIND the face disc (top part) and in front of its top edge. */
  hair?: string;
  /** Extra SVG drawn on top of the face. */
  extra?: string;
}

/** Name tag and (when a render exists) portrait image of every speaker id; the rest get a drawn face. */
interface SpeakerInfo {
  name: string;
  /** File name in public/portraits (without .webp). */
  portrait?: string;
}

export const SPEAKERS: Readonly<Record<string, SpeakerInfo>> = {
  glen: { name: 'Glen', portrait: 'glen' },
  superglen: { name: 'Superglen', portrait: 'superglen' },
  nino: { name: 'Nino', portrait: 'nino' },
  aara: { name: 'Aara', portrait: 'aara' },
  rakus: { name: 'Tikus Rakus', portrait: 'tikus_rakus' },
  ular: { name: 'Ular Melar', portrait: 'ular_melar' },
  curut: { name: 'Curut Cemberut', portrait: 'curut_cemberut' },
  elang: { name: 'Elang Belang', portrait: 'elang_belang' },
  gorila: { name: 'Gorilla Gembira', portrait: 'gorilla_gembira' },
  lina: { name: 'Bu Lina' },
  penjual: { name: 'Penjual' },
  dokter: { name: 'Dokter' },
  warga: { name: 'Warga' },
  res_sari: { name: 'Bu Sari' },
  res_joko: { name: 'Pak Joko' },
  res_dimas: { name: 'Dimas' },
  res_guru: { name: 'Bu Guru' },
  res_lala: { name: 'Lala' },
  res_pos: { name: 'Pak Pos' },
  res_ani: { name: 'Dokter Ani' },
  res_bima: { name: 'Bima' },
};

const HAIR_TOP = 'M9 30 Q9 6 32 6 Q55 6 55 30 Q47 17 32 17 Q17 17 9 30 Z';
const FACES: Readonly<Record<string, FaceStyle>> = {
  // Residents and helpers (no 3D model): a skin tone, hair or a hat each, so they look different.
  lina: { bg: '#e95b7a', ring: '#ffffff', skin: '#f2c29b', hair: '#5a3a2a', extra: `<path d="${HAIR_TOP}" fill="#5a3a2a"/><circle cx="32" cy="5" r="6" fill="#5a3a2a"/>` },
  penjual: { bg: '#f2b632', ring: '#ffffff', skin: '#e8b48a', extra: '<path d="M8 22 Q32 -4 56 22 Z" fill="#fff"/><rect x="8" y="20" width="48" height="6" rx="3" fill="#e8453c"/>' },
  dokter: { bg: '#2ec4b6', ring: '#ffffff', skin: '#f2c29b', extra: `<path d="${HAIR_TOP}" fill="#2b2b3a"/><rect x="26" y="7" width="12" height="9" rx="2" fill="#fff"/><path d="M32 8 V15 M28.5 11.5 H35.5" stroke="#e8453c" stroke-width="2.4"/>` },
  warga: { bg: '#7bc96f', ring: '#ffffff', skin: '#e8b48a', extra: `<path d="${HAIR_TOP}" fill="#3b2a20"/>` },
  res_sari: { bg: '#ff8fb1', ring: '#ffffff', skin: '#f2c29b', extra: `<path d="${HAIR_TOP}" fill="#7a3b2a"/><circle cx="32" cy="6" r="6" fill="#7a3b2a"/>` },
  res_joko: { bg: '#4dabf7', ring: '#ffffff', skin: '#c98f66', extra: `<path d="${HAIR_TOP}" fill="#1f1a18"/>` },
  res_dimas: { bg: '#ffa94d', ring: '#ffffff', skin: '#e8b48a', extra: `<path d="${HAIR_TOP}" fill="#3b2a20"/><path d="M12 22 Q32 2 52 22 Z" fill="#4dabf7"/><rect x="10" y="20" width="44" height="5" rx="2.5" fill="#2f83c4"/>` },
  res_guru: { bg: '#9775fa', ring: '#ffffff', skin: '#f2c29b', extra: `<path d="${HAIR_TOP}" fill="#2b2b3a"/><circle cx="22" cy="31" r="8" fill="none" stroke="#2b2b3a" stroke-width="2"/><circle cx="42" cy="31" r="8" fill="none" stroke="#2b2b3a" stroke-width="2"/><path d="M30 31 H34" stroke="#2b2b3a" stroke-width="2"/>` },
  res_lala: { bg: '#f783ac', ring: '#ffffff', skin: '#e8b48a', extra: `<path d="${HAIR_TOP}" fill="#2b2b3a"/><circle cx="9" cy="24" r="7" fill="#2b2b3a"/><circle cx="55" cy="24" r="7" fill="#2b2b3a"/><circle cx="9" cy="24" r="3" fill="#ffd23f"/><circle cx="55" cy="24" r="3" fill="#ffd23f"/>` },
  res_pos: { bg: '#ff922b', ring: '#ffffff', skin: '#c98f66', extra: '<path d="M10 24 Q10 4 32 4 Q54 4 54 24 Z" fill="#ff922b"/><rect x="6" y="22" width="52" height="6" rx="3" fill="#e8590c"/>' },
  res_ani: { bg: '#2ec4b6', ring: '#ffffff', skin: '#f2c29b', extra: `<path d="${HAIR_TOP}" fill="#5a3a2a"/><rect x="26" y="7" width="12" height="9" rx="2" fill="#fff"/><path d="M32 8 V15 M28.5 11.5 H35.5" stroke="#e8453c" stroke-width="2.4"/>` },
  res_bima: { bg: '#69db7c', ring: '#ffffff', skin: '#d9a07a', extra: `<path d="${HAIR_TOP}" fill="#2b2b3a"/>` },
};
const DEFAULT_FACE: FaceStyle = { bg: '#7bc96f', ring: '#ffffff', skin: '#f2c29b' };

export function faceSvg(speaker: string): string {
  const f = FACES[speaker] ?? DEFAULT_FACE;
  return (
    '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    `<circle cx="32" cy="32" r="29" fill="${f.bg}" stroke="${f.ring}" stroke-width="5"/>` +
    `<circle cx="32" cy="34" r="22" fill="${f.skin ?? '#f2c29b'}"/>` +
    '<circle cx="23" cy="33" r="3.6" fill="#2b1a12"/><circle cx="41" cy="33" r="3.6" fill="#2b1a12"/>' +
    '<circle cx="24.2" cy="31.8" r="1.2" fill="#fff"/><circle cx="42.2" cy="31.8" r="1.2" fill="#fff"/>' +
    '<circle cx="17" cy="41" r="3.6" fill="#ff6f6f" opacity="0.35"/><circle cx="47" cy="41" r="3.6" fill="#ff6f6f" opacity="0.35"/>' +
    '<path d="M24 42 Q32 52 40 42" fill="none" stroke="#2b1a12" stroke-width="3.4" stroke-linecap="round"/>' +
    (f.extra ?? '') +
    '</svg>'
  );
}

/** Name tag for a speaker id ('' for no speaker). */
export function speakerName(speaker: string): string {
  return SPEAKERS[speaker]?.name ?? '';
}

function portraitUrl(id: string): string {
  return `${import.meta.env.BASE_URL}portraits/${id}.webp`;
}

/** Fetch every portrait once (they are tiny) so a face never pops in late. */
export function preloadPortraits(): void {
  for (const info of Object.values(SPEAKERS)) {
    if (info.portrait) new Image().src = portraitUrl(info.portrait);
  }
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
  private readonly nameEl: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private shown = false;
  private speaker = '';
  /** Optional remap of the speaker id to a face id (e.g. Glen shows the Superglen face in Superglen mode). */
  faceFor: ((speaker: string) => string) | null = null;

  constructor(root: HTMLElement, onTap: () => void) {
    this.element = el('div', 'dlg');
    this.element.hidden = true;
    this.card = el('div', 'dlg-card');
    this.face = el('div', 'dlg-face');
    this.nameEl = el('div', 'dlg-name');
    const who = el('div', 'dlg-who');
    who.append(this.face, this.nameEl);
    this.textEl = el('div', 'dlg-text');
    const next = el('div', 'dlg-next');
    next.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 8 H27 L16 26 Z" fill="#e8453c" stroke="#e8453c" stroke-width="3" stroke-linejoin="round"/></svg>';
    this.card.append(who, this.textEl, next);
    this.element.appendChild(this.card);
    // pointerdown works for finger, pen and mouse on iOS Safari (click is unreliable after touch preventDefault).
    this.card.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onTap();
    });
    root.appendChild(this.element);
    // The touch HUD rows under the bubble (hearts, stars, counter) follow the bubble's real height via --dlg-bottom.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.syncBottom()).observe(this.card);
    }
    preloadPortraits();
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Show a line. Re-showing while visible swaps the content without replaying the pop-in. */
  show(speakerId: string, text: string, compact = false): void {
    this.element.classList.toggle('compact', compact);
    const speaker = this.faceFor ? this.faceFor(speakerId) : speakerId;
    if (speaker !== this.speaker || !this.face.firstChild) {
      this.setFace(speaker);
      this.face.dataset.speaker = speaker;
      this.speaker = speaker;
    }
    this.textEl.textContent = text;
    this.syncBottom();
    if (!this.shown) {
      this.shown = true;
      this.element.hidden = false;
      // Restart the pop-in animation.
      this.card.classList.remove('pop');
      void this.card.offsetWidth;
      this.card.classList.add('pop');
    }
    this.syncBottom();
  }

  /** Portrait image when the speaker has one (and it loads), else the drawn face. */
  private setFace(speaker: string): void {
    const info = SPEAKERS[speaker];
    this.nameEl.textContent = info?.name ?? '';
    this.nameEl.hidden = !info;
    this.face.innerHTML = '';
    if (info?.portrait) {
      const img = document.createElement('img');
      img.className = 'dlg-portrait';
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      img.onerror = () => {
        if (this.face.dataset.speaker === speaker) this.face.innerHTML = faceSvg(speaker);
      };
      img.src = portraitUrl(info.portrait);
      this.face.appendChild(img);
    } else {
      this.face.innerHTML = faceSvg(speaker);
    }
  }

  private syncBottom(): void {
    const root = document.documentElement.style;
    if (!this.shown || this.element.classList.contains('compact')) root.removeProperty('--dlg-bottom');
    else root.setProperty('--dlg-bottom', `${Math.ceil(this.element.getBoundingClientRect().bottom)}px`);
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.element.hidden = true;
    this.card.classList.remove('pop');
    this.syncBottom();
  }
}
