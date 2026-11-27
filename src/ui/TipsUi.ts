import type { Action } from '../input/Input';
import type { TipIconName, TipVisual } from '../config/tips';
import { getLayout, type ControlProfile } from './TouchControls';
import { padGlyph, type GlyphName } from './PadGlyphs';
import { QuizIcons } from './QuizIcons';
import { MenuIcons } from './MenuIcons';
import './tips.css';

const svg = (inner: string): string => `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
const SW = 'stroke-linecap="round" stroke-linejoin="round"';

const DRUM_PATH =
  '<path d="M6 17 V33 A18 8 0 0 0 42 33 V17 Z" fill="#c4572a"/><ellipse cx="24" cy="17" rx="18" ry="8" fill="#ffe0a3" stroke="#8a3b18" stroke-width="2.5"/>';

/** Drawn pictures of the hint card and of the Petunjuk list (no text: the child recognises them). */
export const TipIcons: Readonly<Record<TipIconName, string>> = {
  drums: `<svg viewBox="0 0 250 48" aria-hidden="true" class="tip-drums">${[0, 1, 2, 3, 4].map((i) => `<g class="tip-drum" style="animation-delay:${(i * 0.45).toFixed(2)}s" transform="translate(${i * 50} 0)">${DRUM_PATH}</g>`).join('')}</svg>`,
  heart: svg('<path d="M32 56C10 40 4 29 4 19 4 10 11 4 19 4 25 4 30 7 32 12 34 7 39 4 45 4 53 4 60 10 60 19 60 29 54 40 32 56Z" fill="#ff4d6d" stroke="#fff" stroke-width="4"/>'),
  coin: QuizIcons.coin,
  shop: svg(`<path d="M8 24 L14 8 H50 L56 24 Z" fill="#ff6b6b" stroke="#fff" stroke-width="3" ${SW}/><path d="M12 24 V56 H52 V24" fill="#ffe3a8" stroke="#fff" stroke-width="3" ${SW}/><rect x="25" y="36" width="14" height="20" rx="2" fill="#8a5a33"/><circle cx="32" cy="29" r="0.1"/>`),
  wardrobe: MenuIcons.wardrobe,
  skateboard: svg(`<rect x="6" y="28" width="52" height="10" rx="5" fill="#ff9f43" stroke="#fff" stroke-width="3"/><circle cx="18" cy="46" r="6" fill="#4dabf7" stroke="#fff" stroke-width="3"/><circle cx="46" cy="46" r="6" fill="#4dabf7" stroke="#fff" stroke-width="3"/>`),
  bike: svg(`<circle cx="14" cy="42" r="11" fill="none" stroke="#fff" stroke-width="5"/><circle cx="50" cy="42" r="11" fill="none" stroke="#fff" stroke-width="5"/><path d="M14 42 L26 22 H42 L50 42 M26 22 L32 42 H14 M42 22 L38 14 H46" fill="none" stroke="#2ec4b6" stroke-width="5" ${SW}/>`),
  star: svg('<path d="M32 5 L39.5 23 L59 24.5 L44 37 L48.8 56 L32 45.5 L15.2 56 L20 37 L5 24.5 L24.5 23 Z" fill="#ffe066" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>'),
  map: MenuIcons.map,
  arrow: svg(`<path d="M32 6 L56 40 H40 V58 H24 V40 H8 Z" fill="#ffd23f" stroke="#fff" stroke-width="4" ${SW}/>`),
  save: MenuIcons.save,
  quiz: svg(`<circle cx="32" cy="32" r="28" fill="#7c5cff" stroke="#fff" stroke-width="4"/><path d="M22 25 Q22 14 32 14 Q42 14 42 24 Q42 30 34 34 V38" fill="none" stroke="#fff" stroke-width="6" ${SW}/><circle cx="34" cy="48" r="4" fill="#fff"/>`),
  training: svg(`<path d="M32 8 L40 24 H24 Z" fill="#7fe3ff"/><ellipse cx="32" cy="50" rx="22" ry="7" fill="#26c6da" stroke="#fff" stroke-width="3"/><path d="M32 24 V44" stroke="#7fe3ff" stroke-width="8" ${SW} opacity="0.7"/>`),
  gear: QuizIcons.gear,
  food: svg(`<path d="M8 30 H56 Q54 52 32 54 Q10 52 8 30 Z" fill="#ffb347" stroke="#fff" stroke-width="3" ${SW}/><circle cx="22" cy="22" r="8" fill="#e8453c"/><circle cx="36" cy="20" r="8" fill="#7bc96f"/><circle cx="46" cy="25" r="6" fill="#ff8a3d"/>`),
  hospital: svg(`<rect x="8" y="8" width="48" height="48" rx="10" fill="#fff" stroke="#e53935" stroke-width="4"/><path d="M32 18 V46 M18 32 H46" stroke="#e53935" stroke-width="10" ${SW}/>`),
};

const KEY_NAME: Readonly<Record<Action, string>> = {
  jump: 'Spasi',
  interact: 'E',
  transform: 'Q',
  laser: 'J',
  shield: 'K',
  flight: 'F',
};

/** Pad: the four face buttons are drawn; the shoulders are small badges. */
const PAD_GLYPH: Readonly<Partial<Record<Action, GlyphName>>> = { jump: 'cross', interact: 'square', transform: 'triangle', laser: 'circle' };
const PAD_TEXT: Readonly<Partial<Record<Action, string>>> = { shield: 'L1', flight: 'R1' };

const ALL_ON: ControlProfile = { legacyTest: false, transform: true, laser: true, shield: true, flight: true, bike: false };

/** Colour and picture of the real touch button of `action` (so the card looks like the button on the screen). */
function touchLook(action: Action, set: 'glen' | 'superglen' | 'bike'): { icon: string; color: string } {
  const mode = set === 'superglen' ? 'superglen' : 'glen';
  const profile: ControlProfile = set === 'bike' ? { ...ALL_ON, bike: true } : ALL_ON;
  const def = getLayout(mode, profile).find((d) => d.action === action) ?? getLayout('superglen', ALL_ON).find((d) => d.action === action) ?? getLayout('glen', ALL_ON)[0];
  return { icon: def.icon, color: def.color };
}

function el(tag: string, cls: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/**
 * One button hint with all four looks; CSS shows the one that matches the device (html.touch-ui / pad-ui / tv-ui, else the
 * keyboard): a round coloured touch button, a key cap, a controller glyph, the remote's OK.
 */
export function buttonHint(action: Action, set: 'glen' | 'superglen' | 'bike'): HTMLElement {
  const root = el('div', 'tip-btn');
  root.dataset.action = action;
  const look = touchLook(action, set);
  const touch = el('span', 'tk tk-touch', look.icon);
  touch.style.background = look.color;
  const kbd = el('span', 'tk tk-kbd', KEY_NAME[action]);
  const glyph = PAD_GLYPH[action];
  const pad = el('span', 'tk tk-pad', glyph ? padGlyph(glyph) : `<b class="tk-badge">${PAD_TEXT[action] ?? ''}</b>`);
  const tv = el('span', 'tk tk-tv', action === 'jump' || action === 'interact' ? '<b class="tk-badge">OK</b>' : look.icon);
  if (!(action === 'jump' || action === 'interact')) tv.style.background = look.color;
  root.append(touch, kbd, pad, tv);
  return root;
}

/** The pause menu: the gear (touch / mouse), Esc on a keyboard, Options on a controller, Back on a remote. */
function pauseHint(): HTMLElement {
  const root = el('div', 'tip-btn tip-pause');
  root.append(
    el('span', 'tk tk-touch', QuizIcons.gear),
    el('span', 'tk tk-kbd', 'Esc'),
    el('span', 'tk tk-pad', '<b class="tk-badge">OPT</b>'),
    el('span', 'tk tk-tv', '<b class="tk-badge">Back</b>'),
  );
  (root.querySelector('.tk-touch') as HTMLElement).style.background = '#5c6bc0';
  return root;
}

export function visualEl(v: TipVisual): HTMLElement {
  if (v.kind === 'button') return buttonHint(v.action, v.set ?? 'glen');
  if (v.kind === 'pause') return pauseHint();
  return el('div', `tip-pic tip-pic-${v.icon}`, TipIcons[v.icon]);
}

/**
 * The hint card: the pictures of the current tip in a row, pulsing, under the dialog bubble. It never takes a tap
 * (pointer-events none) and hides itself when the tip ends.
 */
export class TipCard {
  readonly element: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.element = el('div', 'tip-card') as HTMLDivElement;
    this.element.hidden = true;
    root.appendChild(this.element);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  show(visuals: readonly TipVisual[]): void {
    const items: HTMLElement[] = [];
    visuals.forEach((v, i) => {
      if (i > 0) items.push(el('span', 'tip-plus', '+'));
      items.push(visualEl(v));
    });
    this.element.replaceChildren(...items);
    this.element.hidden = false;
    // restart the pop-in animation
    this.element.classList.remove('in');
    void this.element.offsetWidth;
    this.element.classList.add('in');
  }

  hide(): void {
    this.element.hidden = true;
    this.element.replaceChildren();
  }
}

/** A tile of the Petunjuk list (the settings panel puts these in its own view). */
export function tipTile(icon: TipIconName, title: string): HTMLElement {
  const tile = el('div', 'tip-tile');
  tile.append(el('span', 'tip-tile-pic', TipIcons[icon]), el('span', 'tip-tile-title', title));
  return tile;
}

export const TIP_BULB =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 Q14 6 14 24 Q14 34 22 40 V48 H42 V40 Q50 34 50 24 Q50 6 32 6 Z" fill="#fff" fill-opacity="0.3" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M24 56 H40" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M28 28 L32 34 L36 28" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
