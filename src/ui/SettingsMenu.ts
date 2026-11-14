import type { SaveStore } from '../core/Save';
import { QuizIcons } from './QuizIcons';
import { MenuIcons } from './MenuIcons';

export interface SettingsDeps {
  ui: HTMLElement;
  save: SaveStore;
  /** The panel may open now (not during a quiz, a level fade or before the first tap). */
  canOpen: () => boolean;
  /** The panel opened / closed: the game pauses / resumes. */
  onOpenChange: (open: boolean) => void;
  /** A slider moved: apply the volumes (the save already holds the numbers). */
  onVolumes: () => void;
  /** The level has a map ("Lihat peta" is usable). */
  hasMap: () => boolean;
  openMap: () => void;
  closeMap: () => void;
  /** The level is the city (respawn button says "tengah kota"), else "tempat aman". */
  inCity: () => boolean;
  respawn: () => void;
  /** Write the manual slot. Returns false when it could not be made. */
  saveSlot: () => boolean;
  loadSlot: () => void;
  restart: () => void;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

interface Slider {
  row: HTMLElement;
  track: HTMLElement;
  set: (v: number) => void;
}

/**
 * The settings button (gear, top-left) and its panel: music and effects volume, the map, "back to the middle" / "safe place",
 * manual save and load, and a guarded restart of the level. Opening pauses the game (Game wires `onOpenChange`). Buttons and
 * sliders react to pointerdown (touch screens do not synthesise clicks here, see TouchSource) and work with the mouse too.
 */
export class SettingsMenu {
  readonly gear: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly music: Slider;
  private readonly sfx: Slider;
  private readonly btnMap: HTMLButtonElement;
  private readonly btnHome: HTMLButtonElement;
  private readonly btnHomeLabel: HTMLElement;
  private readonly btnSave: HTMLButtonElement;
  private readonly btnLoad: HTMLButtonElement;
  private readonly btnRestart: HTMLButtonElement;
  private readonly confirm: HTMLDivElement;
  private readonly btnNo: HTMLButtonElement;
  private isOpen = false;
  private confirming = false;
  private mapOpen = false;
  private toastTimer = 0;

  constructor(private readonly deps: SettingsDeps) {
    const { ui } = deps;
    const stop = (e: Event): void => e.stopPropagation();

    this.gear = make('button', 'set-gear', QuizIcons.gear);
    this.gear.setAttribute('aria-label', 'Pengaturan');
    this.gear.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.open();
    });
    ui.appendChild(this.gear);

    this.panel = make('div', 'settings');
    this.panel.hidden = true;
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart']) this.panel.addEventListener(ev, stop);
    const card = make('div', 'settings-card');
    const head = make('div', 'settings-head');
    head.append(make('h1', '', 'Pengaturan'));
    const x = this.button('menu-btn settings-close', MenuIcons.close, 'Tutup', () => this.close());
    head.append(x);

    this.music = this.slider('music', MenuIcons.music, 'Musik', deps.save.data.settings.musicVol, (v) => {
      deps.save.setVolumes(v, deps.save.data.settings.sfxVol);
      deps.onVolumes();
    });
    this.sfx = this.slider('sfx', MenuIcons.speaker, 'Suara efek', deps.save.data.settings.sfxVol, (v) => {
      deps.save.setVolumes(deps.save.data.settings.musicVol, v);
      deps.onVolumes();
    });
    const sliders = make('div', 'settings-sliders');
    sliders.append(this.music.row, this.sfx.row);

    const grid = make('div', 'settings-grid');
    this.btnMap = this.button('menu-btn set-map', MenuIcons.map, 'Lihat peta', () => {
      if (!deps.hasMap()) return;
      this.mapOpen = true;
      this.panel.hidden = true;
      deps.openMap();
    });
    this.btnMap.dataset.act = 'map';
    this.btnHome = this.button('menu-btn set-home', MenuIcons.home, 'Kembali ke tengah kota', () => {
      this.close();
      deps.respawn();
    });
    this.btnHome.dataset.act = 'home';
    this.btnHomeLabel = this.btnHome.querySelector('.menu-label') as HTMLElement;
    this.btnSave = this.button('menu-btn set-save', MenuIcons.save, 'Simpan', () => {
      this.toastText(deps.saveSlot() ? 'Tersimpan' : 'Gagal menyimpan');
      this.refresh();
    });
    this.btnSave.dataset.act = 'save';
    this.btnLoad = this.button('menu-btn set-load', MenuIcons.load, 'Muat', () => {
      if (!deps.save.data.slot) return;
      this.close();
      deps.loadSlot();
      this.toastText('Dimuat');
    });
    this.btnLoad.dataset.act = 'load';
    this.btnRestart = this.button('menu-btn set-restart warn', MenuIcons.restart, 'Ulang dari awal level', () => this.ask(true));
    this.btnRestart.dataset.act = 'restart';
    grid.append(this.btnMap, this.btnHome, this.btnRestart, this.btnSave, this.btnLoad);

    this.confirm = make('div', 'settings-confirm');
    this.confirm.hidden = true;
    const q = make('div', 'settings-confirm-box');
    q.append(make('div', 'settings-confirm-q', 'Ulang dari awal?'));
    const yes = this.button('menu-btn settings-yes', MenuIcons.yes, 'Ya', () => {
      this.confirming = false;
      this.close();
      deps.restart();
    });
    yes.dataset.act = 'yes';
    this.btnNo = this.button('menu-btn settings-no', MenuIcons.no, 'Tidak', () => this.ask(false));
    this.btnNo.dataset.act = 'no';
    const row = make('div', 'settings-confirm-row');
    row.append(yes, this.btnNo);
    q.append(row);
    this.confirm.append(q);

    card.append(head, sliders, grid, this.confirm);
    this.panel.append(card);
    ui.appendChild(this.panel);

    this.toast = make('div', 'set-toast');
    ui.appendChild(this.toast);

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.key !== 'Escape') return;
      e.preventDefault();
      if (this.mapOpen) this.deps.closeMap();
      else if (this.confirming) this.ask(false);
      else this.close();
    });
  }

  get opened(): boolean {
    return this.isOpen;
  }

  get confirmOpen(): boolean {
    return this.confirming;
  }

  open(): void {
    if (this.isOpen || !this.deps.canOpen()) return;
    this.isOpen = true;
    this.confirming = false;
    this.mapOpen = false;
    this.refresh();
    this.panel.hidden = false;
    this.deps.onOpenChange(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.confirming = false;
    this.mapOpen = false;
    this.panel.hidden = true;
    this.confirm.hidden = true;
    this.deps.onOpenChange(false);
  }

  /** The full map closed: the panel comes back. */
  mapClosed(): void {
    if (!this.isOpen) return;
    this.mapOpen = false;
    this.panel.hidden = false;
  }

  /** Re-read the state shown (sliders, which buttons apply). Call when the level changed. */
  refresh(): void {
    const { save } = this.deps;
    this.music.set(save.data.settings.musicVol);
    this.sfx.set(save.data.settings.sfxVol);
    const city = this.deps.inCity();
    this.btnHomeLabel.textContent = city ? 'Kembali ke tengah kota' : 'Kembali ke tempat aman';
    const ico = this.btnHome.querySelector('.menu-ico');
    if (ico) ico.innerHTML = city ? MenuIcons.home : MenuIcons.safe;
    this.btnHome.setAttribute('aria-label', city ? 'Kembali ke tengah kota' : 'Kembali ke tempat aman');
    const map = this.deps.hasMap();
    this.btnMap.hidden = !map;
    this.btnMap.disabled = !map;
    const has = save.data.slot !== null;
    this.btnLoad.disabled = !has;
    this.btnLoad.classList.toggle('off', !has);
  }

  private ask(on: boolean): void {
    this.confirming = on;
    this.confirm.hidden = !on;
    if (on) this.btnNo.focus();
  }

  private toastText(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 1600);
  }

  showToast(text: string): void {
    this.toastText(text);
  }

  private button(cls: string, icon: string, label: string, fn: () => void): HTMLButtonElement {
    const b = make('button', cls);
    b.type = 'button';
    const ic = make('span', 'menu-ico', icon);
    b.append(ic, make('span', 'menu-label', label));
    b.setAttribute('aria-label', label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (b.disabled) return;
      fn();
    });
    // Keyboard (Tab to a button, Enter / Space): the same action. A mouse click is already handled by pointerdown.
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      if (!b.disabled) fn();
    });
    return b;
  }

  /** Drag or tap a track: value 0..1. Keys: left/right in steps of 5 %. */
  private slider(id: string, icon: string, label: string, initial: number, change: (v: number) => void): Slider {
    const row = make('div', 'set-slider');
    row.dataset.slider = id;
    const ico = make('span', 'set-slider-ico', icon);
    const track = make('div', 'set-track');
    track.tabIndex = 0;
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', label);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const fill = make('div', 'set-fill');
    const thumb = make('div', 'set-thumb');
    track.append(fill, thumb);
    const val = make('span', 'set-value');
    row.append(ico, track, val);
    const cap = make('div', 'set-slider-name', label);
    row.append(cap);

    let v = initial;
    const paint = (): void => {
      const pct = Math.round(v * 100);
      fill.style.width = `${pct}%`;
      thumb.style.left = `${pct}%`;
      val.textContent = `${pct}%`;
      track.setAttribute('aria-valuenow', String(pct));
    };
    const apply = (nv: number): void => {
      nv = Math.max(0, Math.min(1, Math.round(nv * 100) / 100));
      if (nv === v) return;
      v = nv;
      paint();
      change(v);
    };
    const fromX = (clientX: number): void => {
      const r = track.getBoundingClientRect();
      if (r.width <= 0) return;
      apply((clientX - r.left) / r.width);
    };
    let dragging = -1;
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = e.pointerId;
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointer ids may not be capturable: the move events still reach the track while over it
      }
      fromX(e.clientX);
    });
    track.addEventListener('pointermove', (e) => {
      if (dragging === e.pointerId) fromX(e.clientX);
    });
    const end = (e: PointerEvent): void => {
      if (dragging !== e.pointerId) return;
      dragging = -1;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : 0;
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      apply(v + step);
    });
    paint();
    return {
      row,
      track,
      set: (nv: number) => {
        v = Math.max(0, Math.min(1, nv));
        paint();
      },
    };
  }

  /** Test hooks. */
  debugHandle(): Record<string, unknown> {
    const self = this;
    return {
      get open() {
        return self.isOpen;
      },
      get confirming() {
        return self.confirming;
      },
      get toast() {
        return self.toast.classList.contains('show') ? (self.toast.textContent ?? '') : '';
      },
      get homeLabel() {
        return self.btnHomeLabel.textContent ?? '';
      },
      show: () => self.open(),
      hide: () => self.close(),
    };
  }
}
