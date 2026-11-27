import type { SaveStore } from '../core/Save';
import { equip, getInventory, isOwned, own } from '../core/Save';
import { FREE_IDS, ITEM_BY_ID, SHOP_ITEMS, SHOP_TABS, ShopLines, fill, type ShopItem, type ShopTab } from '../config/shop';
import { MenuIcons } from './MenuIcons';
import { QuizIcons } from './QuizIcons';
import { attachScroll, bindTap, type ScrollHandle } from './Scrollable';
import './shop.css';

export type ShopMode = 'shop' | 'wardrobe';

export interface ShopDeps {
  ui: HTMLElement;
  save: SaveStore;
  /** The panel opened / closed: the game pauses / resumes. */
  onOpenChange: (open: boolean) => void;
  /** The coin total changed (refresh the HUD counter). */
  coinsChanged: () => void;
  /** Small sounds (all optional, silent when muted). */
  sfx: { coin: () => void; bling: () => void; pop: () => void };
  /** True once Glen has unlocked the Superglen costume (hides Superglen tab in Lemari before Chapter 1 finishes). */
  hasSuperglen?: () => boolean;
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ---- Preview art (3D model renders in public/img/shop/<id>.webp, with flat SVG fallback) --------------------------------------

let gradId = 0;
function fillFor(colors: string[], defs: string[]): string {
  if (colors.length === 1) return colors[0];
  const id = `sg${gradId++}`;
  const n = colors.length;
  // Hard stops from top to bottom: horizontal bands (striped shirt, red over white, ...).
  const stops = colors.map((c, i) => `<stop offset="${(i / n) * 100}%" stop-color="${c}"/><stop offset="${((i + 1) / n) * 100}%" stop-color="${c}"/>`).join('');
  defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>`);
  return `url(#${id})`;
}

export function itemArt(item: ShopItem): string {
  const defs: string[] = [];
  const f = fillFor(item.colors, defs);
  const ink = '#3b2f22';
  let body = '';
  if (item.art === 'costume') {
    body = `<path d="M18 22 L8 58 L56 58 L46 22 Z" fill="#ffc94d" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M22 24 Q32 20 42 24 L46 52 L18 52 Z" fill="${f}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="32" cy="13" r="8.5" fill="#f4c7a1" stroke="${ink}" stroke-width="2.5"/>
      <path d="M23.5 11 Q32 3 40.5 11 Q32 8 23.5 11Z" fill="#3a2a22"/>
      <path d="M27 35 L32 30 L37 35 L35 41 L29 41 Z" fill="#fff6c8" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>`;
  } else if (item.art === 'shirt') {
    body = `<path d="M20 10 L8 20 L14 30 L20 26 L20 56 L44 56 L44 26 L50 30 L56 20 L44 10 Q32 18 20 10 Z" fill="${f}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`;
  } else if (item.art === 'skateboard') {
    body = `<path d="M6 30 Q6 24 12 24 H52 Q58 24 58 30 Q58 36 52 36 H12 Q6 36 6 30Z" fill="${f}" stroke="${ink}" stroke-width="2.5"/>
      <circle cx="18" cy="43" r="5" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="46" cy="43" r="5" fill="#fff" stroke="${ink}" stroke-width="2.5"/>`;
  } else {
    const racer = item.art === 'racer';
    body = `<circle cx="14" cy="42" r="10" fill="none" stroke="${ink}" stroke-width="3.5"/><circle cx="50" cy="42" r="10" fill="none" stroke="${ink}" stroke-width="3.5"/>
      <path d="M14 42 L28 24 L42 42 L32 42 L26 24 M42 42 L38 20 M33 20 L45 20 M25 24 H31" fill="none" stroke="${f}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14 42 L28 24 L42 42 L32 42 L26 24 M42 42 L38 20" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>
      ${racer ? `<path d="M20 30 L36 30" stroke="#e8302a" stroke-width="3" stroke-linecap="round"/><path d="M30 8 L33 14 L39 14 L34 18 L36 24 L30 20 L24 24 L26 18 L21 14 L27 14Z" fill="#ffc94d" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>` : ''}
      ${item.paint === 'sparkle' ? '<path d="M52 8 L54 14 L60 16 L54 18 L52 24 L50 18 L44 16 L50 14Z" fill="#ffe27a" stroke="#e39b16" stroke-width="1.5"/>' : ''}`;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs>${defs.join('')}</defs>${body}</svg>`;
}

/** 3D render of the real in-game model (`public/img/shop/<id>.webp`); falls back to the SVG icon if offline / missing. */
function itemThumb(item: ShopItem): HTMLElement {
  const img = document.createElement('img');
  img.className = 'shop-thumb';
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.src = `${import.meta.env.BASE_URL}img/shop/${item.id}.webp`;
  img.addEventListener(
    'error',
    () => {
      const wrap = make('span', 'shop-thumb-fallback', itemArt(item));
      img.replaceWith(wrap);
    },
    { once: true },
  );
  return img;
}

const owned = (it: ShopItem): boolean => it.price === 0 || FREE_IDS.includes(it.id) || isOwned(it.id);
const worn = (it: ShopItem): boolean => {
  const e = getInventory().equipped;
  return it.slot === 'ride' ? e.ride === it.value : e[it.slot] === it.id;
};

/**
 * Toko Mainan and the wardrobe ("Lemari" in the pause menu): a full-screen panel with big item cards. One tap on a card buys
 * (after a Ya / Tidak question; too few coins gives a friendly line and nothing is charged) or, for an owned item, wears it.
 * Every control reacts to pointerdown (mouse, pad Cross, TV OK) or, for a finger, to a tap that did not scroll the list.
 * Controller focus: see input/PadUi.ts (scope `.shop`, or `.shop-confirm` while the question is up).
 */
export class ShopPanel {
  private readonly root: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private readonly coins: HTMLElement;
  private readonly tabsEl: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly listScroll: ScrollHandle;
  private readonly confirmEl: HTMLDivElement;
  private readonly confirmArt: HTMLElement;
  private readonly confirmQ: HTMLElement;
  private readonly confirmPrice: HTMLElement;
  private readonly noBtn: HTMLButtonElement;
  private mode: ShopMode = 'shop';
  private tab: ShopTab = 'superglen';
  private isOpen = false;
  private asking: ShopItem | null = null;
  private lineKey = '';
  /** Test counters. */
  bought = 0;
  refused = 0;

  constructor(private readonly deps: ShopDeps) {
    const root = make('div', 'shop');
    root.hidden = true;
    for (const ev of ['pointerup', 'mousedown', 'touchstart', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation());
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root = root;

    const top = make('div', 'shop-top');
    const close = this.button('shop-close', MenuIcons.close, 'Tutup', () => this.close());
    close.dataset.act = 'shop-close';
    this.tabsEl = make('div', 'shop-tabs');
    this.tabsEl.dataset.scrollable = 'x';
    for (const t of SHOP_TABS) {
      const b = make('button', 'shop-tab');
      b.type = 'button';
      b.dataset.tab = t.id;
      b.dataset.act = `tab-${t.id}`;
      b.setAttribute('aria-label', t.label);
      const iconItem = t.id === 'ride' ? SHOP_ITEMS.find((i) => i.id === 'skateboard') : SHOP_ITEMS.find((i) => i.tab === t.id);
      const ico = make('span', 'shop-tab-ico');
      if (iconItem) ico.append(itemThumb(iconItem));
      b.append(ico, make('span', 'shop-tab-name', t.label));
      this.tap(b, () => this.setTab(t.id));
      this.tabsEl.append(b);
    }
    const coinBox = make('div', 'shop-coins');
    coinBox.append(make('span', 'shop-coin-ico', QuizIcons.coin));
    this.coins = make('b', 'shop-coin-n', '0');
    coinBox.append(this.coins);
    top.append(close, this.tabsEl, coinBox);

    this.line = make('div', 'shop-line');
    const shelf = make('div', 'shop-shelf');
    this.list = make('div', 'shop-list');
    shelf.append(this.list);
    this.listScroll = attachScroll(this.list, 'x', shelf);

    this.confirmEl = make('div', 'shop-confirm');
    this.confirmEl.hidden = true;
    const box = make('div', 'shop-confirm-box');
    this.confirmArt = make('div', 'shop-confirm-art');
    this.confirmQ = make('div', 'shop-confirm-q');
    this.confirmPrice = make('div', 'shop-confirm-price');
    const yes = this.button('shop-yes', MenuIcons.yes, 'Ya', () => this.confirmYes());
    yes.dataset.act = 'yes';
    this.noBtn = this.button('shop-no', MenuIcons.no, 'Tidak', () => this.closeAsk());
    this.noBtn.dataset.act = 'no';
    this.noBtn.dataset.padDefault = '1';
    const row = make('div', 'shop-confirm-row');
    row.append(yes, this.noBtn);
    const mid = make('div', 'shop-confirm-mid');
    mid.append(this.confirmQ, this.confirmPrice);
    box.append(this.confirmArt, mid, row);
    this.confirmEl.append(box);

    root.append(top, this.line, shelf, this.confirmEl);
    deps.ui.appendChild(root);

    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) (window as unknown as { __shop?: unknown }).__shop = this.debugHandle();

    // Escape / pad Circle: close the question first, then the panel. Capture + stop: the pause menu underneath must not also react.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen || e.key !== 'Escape') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (this.asking) this.closeAsk();
        else this.close();
      },
      true,
    );
  }

  get opened(): boolean {
    return this.isOpen;
  }
  get confirmOpen(): boolean {
    return this.asking !== null;
  }

  private showSuperglen(): boolean {
    return this.mode !== 'wardrobe' || (this.deps.hasSuperglen ? this.deps.hasSuperglen() : this.deps.save.isChapterDone('bab1'));
  }

  /** Show the panel. `shop`: buy and wear; `wardrobe`: only owned items, wear them. */
  open(mode: ShopMode): void {
    if (this.isOpen) return;
    this.mode = mode;
    this.isOpen = true;
    this.asking = null;
    this.confirmEl.hidden = true;
    this.root.classList.toggle('wardrobe', mode === 'wardrobe');
    this.tab = this.showSuperglen() ? 'superglen' : 'glen';
    this.say(mode === 'shop' ? 'hello' : 'wardrobe');
    this.render();
    this.root.hidden = false;
    this.list.scrollLeft = 0;
    requestAnimationFrame(() => this.listScroll.refresh());
    this.deps.onOpenChange(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.asking = null;
    this.root.hidden = true;
    this.confirmEl.hidden = true;
    if (this.mode === 'shop') this.deps.sfx.pop();
    this.deps.onOpenChange(false);
  }

  /** Test hook: the same as tapping a card. */
  pick(id: string): void {
    const it = ITEM_BY_ID.get(id);
    if (!it || !this.isOpen) return;
    if (it.tab === 'superglen' && !this.showSuperglen()) return;
    this.choose(it);
  }
  confirmYesNow(): void {
    this.confirmYes();
  }

  private say(key: keyof typeof ShopLines, vars: { n?: number; item?: string } = {}, tone: '' | 'short' = ''): void {
    this.lineKey = ShopLines[key].id;
    this.line.textContent = fill(ShopLines[key].text, vars);
    this.line.classList.toggle('short', tone === 'short');
    this.line.dataset.line = this.lineKey;
  }

  private setTab(t: ShopTab): void {
    if (t === 'superglen' && !this.showSuperglen()) return;
    this.tab = t;
    this.list.scrollLeft = 0;
    this.render();
  }

  private render(): void {
    this.coins.textContent = String(this.deps.save.data.quiz.coins);
    const allowSuperglen = this.showSuperglen();
    if (!allowSuperglen && this.tab === 'superglen') this.tab = 'glen';
    for (const b of Array.from(this.tabsEl.children) as HTMLElement[]) {
      const hide = b.dataset.tab === 'superglen' && !allowSuperglen;
      b.hidden = hide;
      const on = !hide && b.dataset.tab === this.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    this.list.replaceChildren();
    const items = SHOP_ITEMS.filter((i) => i.tab === this.tab && (this.mode === 'shop' || owned(i)));
    const wornIdx = items.findIndex((x) => owned(x) && worn(x));
    const defIdx = wornIdx >= 0 ? wornIdx : 0;
    items.forEach((it, idx) => {
      const have = owned(it);
      const on = have && worn(it);
      const card = make('button', `shop-card${have ? ' have' : ''}${on ? ' on' : ''}`);
      card.type = 'button';
      card.dataset.item = it.id;
      card.dataset.act = `item-${it.id}`;
      card.setAttribute('aria-label', it.name);
      if (idx === defIdx) card.dataset.padDefault = '1';
      const art = make('div', 'shop-card-art');
      art.append(itemThumb(it));
      card.append(art, make('div', 'shop-card-name', it.name));
      const foot = make('div', 'shop-card-foot');
      if (on) foot.innerHTML = `<span class="shop-badge">${MenuIcons.yes}</span><span>Dipakai</span>`;
      else if (have) foot.innerHTML = '<span>Pakai</span>';
      else foot.innerHTML = `<span class="shop-price-ico">${QuizIcons.coin}</span><b>${it.price}</b>`;
      card.append(foot);
      this.tap(card, () => this.choose(it));
      this.list.append(card);
    });
    if (items.length === 0) this.list.append(make('div', 'shop-empty', fill(ShopLines.empty.text, {})));
    this.listScroll.refresh();
    requestAnimationFrame(() => this.listScroll.refresh());
  }

  private choose(it: ShopItem): void {
    const { save, sfx } = this.deps;
    if (owned(it)) {
      if (equip(it.slot, it.value)) {
        sfx.bling();
        this.say('equipped', { item: it.name });
        this.render();
      }
      return;
    }
    if (this.mode !== 'shop') return;
    const have = save.data.quiz.coins;
    if (have < it.price) {
      this.refused++;
      sfx.pop();
      this.say('short', { n: it.price - have }, 'short');
      return;
    }
    this.asking = it;
    this.confirmArt.replaceChildren(itemThumb(it));
    this.confirmQ.textContent = `Beli ${it.name}?`;
    this.confirmPrice.innerHTML = `<span class="shop-price-ico">${QuizIcons.coin}</span><b>${it.price}</b>`;
    this.say('ask', { item: it.name });
    this.confirmEl.hidden = false;
    sfx.bling();
  }

  private closeAsk(): void {
    this.asking = null;
    this.confirmEl.hidden = true;
  }

  private confirmYes(): void {
    const it = this.asking;
    if (!it) return;
    const { save, sfx } = this.deps;
    this.closeAsk();
    if (!save.spendCoins(it.price)) {
      this.refused++;
      this.say('short', { n: it.price - save.data.quiz.coins }, 'short');
      return;
    }
    own(it.id);
    equip(it.slot, it.value);
    this.bought++;
    this.deps.coinsChanged();
    sfx.coin();
    sfx.bling();
    this.say('bought', { item: it.name });
    this.render();
  }

  /** A control that reacts to a mouse / pad press at once and to a finger only when it was a tap (so the card list can scroll). */
  private tap(el: HTMLElement, fn: () => void): void {
    bindTap(el, fn);
  }

  private button(cls: string, icon: string, label: string, fn: () => void): HTMLButtonElement {
    const b = make('button', cls);
    b.type = 'button';
    b.append(make('span', 'menu-ico', icon));
    b.setAttribute('aria-label', label);
    this.tap(b, fn);
    return b;
  }

  /** Test hooks. */
  debugHandle(): Record<string, unknown> {
    const self = this;
    return {
      get open() {
        return self.isOpen;
      },
      get confirming() {
        return self.asking?.id ?? '';
      },
      get line() {
        return self.line.textContent ?? '';
      },
      get lineId() {
        return self.lineKey;
      },
      get counts() {
        return { bought: self.bought, refused: self.refused };
      },
      open_: (m: ShopMode) => self.open(m),
      close: () => self.close(),
      pick: (id: string) => self.pick(id),
      yes: () => self.confirmYesNow(),
      tab: (t: ShopTab) => self.setTab(t),
    };
  }
}

let shared: ShopPanel | null = null;
/** The game creates the one panel; the city shop and the pause menu open it. */
export function initShopPanel(deps: ShopDeps): ShopPanel {
  shared = new ShopPanel(deps);
  return shared;
}
export function getShopPanel(): ShopPanel | null {
  return shared;
}
