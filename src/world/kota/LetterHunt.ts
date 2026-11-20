import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { CITY_LAYOUT } from './CityData';
import type { CityCoin } from './CityPlaces';

export const LETTER_WORD = 'SUPERGLEN';

/** Existing, reach-checked coin spots: five on the ground and four on rooftops. */
export const LETTER_COIN_IDS = [
  'Lv-1_0.3',
  'R:perumahan-house-51.0',
  'P0.0',
  'R:sekolah-school-27.0',
  'PL.4',
  'R:alun-ruko-9.0',
  'Ah50a.2',
  'R:bank-bank-125.0',
  'Lv1_1.2',
] as const;

export interface LetterSpot { index: number; letter: string; coin: CityCoin }

export function letterSpots(coins: readonly CityCoin[] = CITY_LAYOUT.places.coins): LetterSpot[] {
  const byId = new Map(coins.map((coin) => [coin.id, coin]));
  return LETTER_COIN_IDS.map((id, index) => {
    const coin = byId.get(id);
    if (!coin) throw new Error(`Missing letter anchor ${id}`);
    return { index, letter: LETTER_WORD[index], coin };
  });
}

/** Nine visible letters in the city; collection is independent of the ordinary coins at their feet. */
export class LetterHunt {
  private readonly spots = letterSpots();
  private readonly found: Set<number>;
  private readonly meshes: THREE.Mesh[] = [];
  private readonly pips: HTMLSpanElement[] = [];
  private readonly row: HTMLDivElement;
  private readonly tmp = new THREE.Vector3();
  private time = 0;
  private complete = false;

  constructor(private readonly ctx: LevelContext, private readonly setGoal: (goal: { x: number; z: number } | null) => void, private readonly onComplete: () => void) {
    this.found = new Set(ctx.save.data.city.letters);
    this.row = document.createElement('div');
    this.row.className = 'letters-progress';
    this.row.setAttribute('aria-label', `Huruf SUPERGLEN: ${this.found.size} dari 9`);
    for (const [index, letter] of [...LETTER_WORD].entries()) {
      const pip = document.createElement('span');
      pip.textContent = letter;
      if (this.found.has(index)) pip.classList.add('found');
      this.row.append(pip);
      this.pips.push(pip);
    }
    ctx.ui.append(this.row);
    ctx.onDispose(() => this.row.remove());

    const geo = new THREE.PlaneGeometry(1.55, 1.7);
    const mats = new Map<string, THREE.MeshBasicMaterial>();
    for (const spot of this.spots) {
      let mat = mats.get(spot.letter);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ map: this.letterTexture(spot.letter), transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false });
        mats.set(spot.letter, mat);
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(spot.coin.x, spot.coin.y + 0.95, spot.coin.z);
      mesh.visible = !this.found.has(spot.index);
      mesh.renderOrder = 3;
      ctx.root.add(mesh);
      this.meshes.push(mesh);
    }
    if (this.found.size === this.spots.length) this.finish();
    else this.markNext();
  }

  private letterTexture(letter: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    if (g) {
      g.fillStyle = '#a51d25';
      g.strokeStyle = '#ffd65a';
      g.lineWidth = 8;
      g.beginPath();
      g.arc(64, 64, 54, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#fff9dc';
      g.font = '900 76px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(letter, 64, 67);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  get count(): number { return this.found.size; }

  private markNext(): void {
    const next = this.spots.find((spot) => !this.found.has(spot.index));
    if (!next) return;
    this.setGoal(next.coin);
    this.ctx.objectives.set(this.tmp.set(next.coin.x, next.coin.y - 0.85, next.coin.z));
  }

  private finish(announce = false): void {
    if (this.complete) return;
    this.complete = true;
    this.ctx.save.setInterlude('rakus_lab');
    this.ctx.objectives.clear();
    this.setGoal(null);
    this.onComplete();
    if (announce) void this.ctx.dialog.say('rakus_nino_lab_invite');
  }

  fixedUpdate(): void {
    if (this.complete || !this.ctx.game.controlsEnabled || this.ctx.save.data.interlude !== 'rakus_letters') return;
    const p = this.ctx.player.position;
    const feet = p.y - 0.55;
    for (const spot of this.spots) {
      if (this.found.has(spot.index)) continue;
      const c = spot.coin;
      if (Math.abs(c.y + 0.95 - feet) > 2.2 || Math.hypot(c.x - p.x, c.z - p.z) > 1.3) continue;
      if (!this.ctx.save.takeCityLetter(spot.index)) continue;
      this.found.add(spot.index);
      this.meshes[spot.index].visible = false;
      this.pips[spot.index].classList.add('found');
      this.row.setAttribute('aria-label', `Huruf SUPERGLEN: ${this.found.size} dari 9`);
      this.ctx.fx.sparkles.burst(c.x, c.y + 0.9, c.z, 18, 2.5, 0xffd23f, { gravity: 1.3 });
      this.ctx.sfx.coinDone();
      if (this.found.size === this.spots.length) this.finish(true);
      else this.markNext();
    }
  }

  update(dt: number): void {
    if (this.complete) return;
    this.time += dt;
    const rotation = this.ctx.cameraRig.camera.quaternion;
    for (let index = 0; index < this.meshes.length; index++) {
      const mesh = this.meshes[index];
      if (!mesh.visible) continue;
      mesh.quaternion.copy(rotation);
      mesh.position.y = this.spots[index].coin.y + 0.95 + Math.sin(this.time * 2 + index) * 0.12;
    }
  }
}
