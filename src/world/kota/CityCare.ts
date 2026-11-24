import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { Combat } from '../../config/combat';
import { HealLines } from '../../gameplay/healLines';
import { HEART } from '../../gameplay/Health';
import { MenuIcons } from '../../ui/MenuIcons';
import { QuizIcons } from '../../ui/QuizIcons';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cone, cyl, merge, sph, type Part } from './ColorMesh';
import { personGeo } from './CityPeople';
import { Clip, type Crowd, type PoseState, crowdColor, drawPose, newPose, packLook, stepPose } from './Crowd';
import { CITY_LAYOUT } from './CityData';

type CareKind = 'stall' | 'rs';

const make = (tag: string, cls: string, html = ''): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
};

/** A red heart in the stall's sign and on the map. */
function heartParts(x: number, y: number, z: number, k: number): Part[] {
  return [
    { g: sph(0.2 * k, 7, 5), c: 0xff4d6d, p: [x - 0.17 * k, y + 0.08 * k, z] },
    { g: sph(0.2 * k, 7, 5), c: 0xff4d6d, p: [x + 0.17 * k, y + 0.08 * k, z] },
    { g: cone(0.34 * k, 0.5 * k, 6), c: 0xff4d6d, p: [x, y - 0.18 * k, z], r: [0, 0, Math.PI] },
  ];
}

/** `withDoctor`: the old low-poly doctor is part of the mesh (only when the animated models did not load). */
function careGeo(withDoctor: boolean): THREE.BufferGeometry {
  const C = CITY_LAYOUT.places.care;
  const out: THREE.BufferGeometry[] = [];
  const place = (g: THREE.BufferGeometry, x: number, z: number, yaw: number): void => {
    g.rotateY(yaw);
    g.translate(x, 0, z);
    out.push(g);
  };
  // The food stall: a wooden counter, a striped awning on two poles, buns and fruit, a big heart on top.
  const stripes: Part[] = [];
  for (let i = 0; i < 6; i++) stripes.push({ g: box(0.4, 0.07, 1.5), c: i % 2 ? 0xffffff : 0xff6b6b, p: [-1 + i * 0.4 + 0.2, 2.35 - 0.0, 0.05], r: [0.18, 0, 0] });
  place(
    merge([
      { g: box(2.4, 0.95, 0.9), c: 0xb98a55, p: [0, 0.475, 0] },
      { g: box(2.5, 0.08, 1.0), c: 0xd7a96b, p: [0, 0.97, 0] },
      { g: cyl(0.05, 0.05, 2.3, 6), c: 0x8a5a33, p: [-1.15, 1.15, -0.4] },
      { g: cyl(0.05, 0.05, 2.3, 6), c: 0x8a5a33, p: [1.15, 1.15, -0.4] },
      ...stripes,
      { g: sph(0.17, 7, 5), c: 0xfff2d8, p: [-0.7, 1.15, 0.05], s: [1, 0.8, 1] },
      { g: sph(0.17, 7, 5), c: 0xfff2d8, p: [-0.35, 1.15, 0.05], s: [1, 0.8, 1] },
      { g: sph(0.16, 7, 5), c: 0xff8a3d, p: [0.15, 1.14, 0.05] },
      { g: sph(0.16, 7, 5), c: 0xe8453c, p: [0.5, 1.14, 0.05] },
      { g: sph(0.16, 7, 5), c: 0x7bc96f, p: [0.85, 1.14, 0.05] },
      ...heartParts(0, 2.95, -0.05, 1.3),
    ]),
    C.stall.x,
    C.stall.z,
    C.stall.yaw,
  );
  // The doctor in white with a little red-cross stand.
  if (withDoctor) place(personGeo(0xffffff, 0x3a2a22), C.doctor.x, C.doctor.z, C.doctor.yaw);
  place(
    merge([
      { g: cyl(0.04, 0.04, 1.3, 6), c: 0xdfe6f2, p: [0, 0.65, 0] },
      { g: box(0.8, 0.8, 0.07), c: 0xffffff, p: [0, 1.5, 0] },
      { g: box(0.5, 0.15, 0.09), c: 0xe53935, p: [0, 1.5, 0] },
      { g: box(0.15, 0.5, 0.09), c: 0xe53935, p: [0, 1.5, 0] },
    ]),
    C.doctor.x + Math.cos(C.doctor.yaw) * 1.2,
    C.doctor.z - Math.sin(C.doctor.yaw) * 1.2,
    C.doctor.yaw,
  );
  const m = mergeAll(out);
  return m;
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!m) throw new Error('CityCare: merge failed');
  m.computeBoundingSphere();
  return m;
}

/**
 * L5: healing with coins. A food stall in the Pasar (1 heart for 5 coins) and the doctor at the Rumah Sakit (all hearts for
 * 15 coins). Walk up, press the hand button: a small panel with big icons (hearts, coins) and a big yes / no. Pressing the
 * hand button again also says yes. Not enough coins: a friendly line, nothing is charged. Hearts already full: a line, no charge.
 */
export class CityCare {
  private readonly mesh: THREE.Mesh;
  private readonly panel: HTMLElement;
  private readonly plus: HTMLElement;
  private readonly cost: HTMLElement;
  private kind: CareKind | null = null;
  private busy = false;
  /** Test counters. */
  purchases = 0;
  refused = 0;

  private readonly doctorPose: PoseState = newPose(0.3);
  private readonly doctorLook = packLook(0, crowdColor(0xffffff), crowdColor(0x3b5b92), crowdColor(0x3a2a22));

  constructor(private readonly ctx: LevelContext, lit: THREE.Material, private readonly crowd: Crowd) {
    const geo = careGeo(!crowd.ready);
    this.mesh = new THREE.Mesh(geo, lit);
    this.mesh.castShadow = false;
    ctx.root.add(this.mesh);
    ctx.onDispose(() => {
      geo.dispose();
      this.panel.remove();
    });
    // The panel: [heart +N] [coin cost] [yes] [no].
    const p = make('div', 'care-panel');
    p.hidden = true;
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart']) p.addEventListener(ev, (e) => e.stopPropagation());
    const info = make('div', 'care-info');
    const heart = make('span', 'care-heart', HEART);
    heart.querySelector('path')?.setAttribute('fill', '#ff4d6d');
    this.plus = make('b', 'care-plus', '+1');
    const coin = make('span', 'care-coin', QuizIcons.coin);
    this.cost = make('b', 'care-cost', '5');
    info.append(heart, this.plus, coin, this.cost);
    const row = make('div', 'care-btns');
    const yes = make('button', 'care-btn care-yes', MenuIcons.yes) as HTMLButtonElement;
    const no = make('button', 'care-btn care-no', MenuIcons.no) as HTMLButtonElement;
    yes.type = no.type = 'button';
    yes.setAttribute('aria-label', 'Ya');
    no.setAttribute('aria-label', 'Tidak');
    yes.dataset.act = 'yes';
    no.dataset.act = 'no';
    yes.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.confirm();
    });
    no.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });
    row.append(yes, no);
    p.append(info, row);
    ctx.ui.appendChild(p);
    this.panel = p;

    const C = CITY_LAYOUT.places.care;
    for (const [kind, at] of [['stall', C.stall], ['rs', C.doctor]] as const) {
      const pos = new THREE.Vector3(at.x, 0.9, at.z);
      ctx.interactions.add({
        position: () => pos,
        radius: kind === 'stall' ? 3.4 : 3.2,
        icon: 'hand',
        promptHeight: 2.1,
        onInteract: () => (this.kind === kind ? this.confirm() : this.open(kind)),
      });
    }
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __care?: unknown };
      w.__care = {
        spots: () => C,
        open: (k: CareKind) => this.open(k),
        confirm: () => this.confirm(),
        close: () => this.close(),
        panel: () => ({ open: !this.panel.hidden, kind: this.kind, plus: this.plus.textContent, cost: this.cost.textContent }),
        counts: () => ({ purchases: this.purchases, refused: this.refused }),
      };
      ctx.onDispose(() => {
        delete w.__care;
      });
    }
  }

  private spot(kind: CareKind): { x: number; z: number } {
    const C = CITY_LAYOUT.places.care;
    return kind === 'stall' ? C.stall : C.doctor;
  }

  private costOf(kind: CareKind): number {
    return kind === 'stall' ? Combat.heal.stallCost : Combat.heal.hospitalCost;
  }

  private open(kind: CareKind): void {
    const { ctx } = this;
    if (this.busy || ctx.health.resting) return;
    const missing = ctx.health.max - ctx.health.hearts;
    if (missing <= 0) {
      void ctx.dialog.say(kind === 'stall' ? HealLines.kiosPenuh : HealLines.rsPenuh);
      return;
    }
    this.kind = kind;
    const n = kind === 'stall' ? Math.min(missing, Combat.heal.stallHearts) : missing;
    this.plus.textContent = `+${n}`;
    this.cost.textContent = String(this.costOf(kind));
    this.panel.hidden = false;
    ctx.sfx.bling();
  }

  private close(): void {
    this.kind = null;
    this.panel.hidden = true;
  }

  private confirm(): void {
    const { ctx } = this;
    const kind = this.kind;
    if (!kind || this.busy) return;
    const cost = this.costOf(kind);
    const missing = ctx.health.max - ctx.health.hearts;
    if (missing <= 0) {
      this.close();
      return;
    }
    if (ctx.save.data.quiz.coins < cost) {
      // Friendly refusal: nothing is charged.
      this.refused++;
      this.close();
      ctx.sfx.pop();
      void ctx.dialog.say(kind === 'stall' ? HealLines.kiosKurang : HealLines.rsKurang);
      return;
    }
    ctx.save.spendCoins(cost);
    const n = kind === 'stall' ? Math.min(missing, Combat.heal.stallHearts) : missing;
    ctx.health.heal(n);
    ctx.quiz.coinsChanged();
    this.purchases++;
    this.close();
    ctx.sfx.coin();
    ctx.sfx.bling();
    const h = ctx.health.head();
    ctx.fx.sparkles.burst(h.x, h.y, h.z, 18, 3, 0xff6b8b, { gravity: -0.5, life: 1, up: 1.2 });
    ctx.fx.flashes.spawn(h.x, h.y, h.z, 1.4, 0.5, 0xff8fb1);
    void ctx.dialog.say(kind === 'stall' ? HealLines.kiosTerima : HealLines.rsSehat);
  }

  /** The doctor (animated): waves when Glen is near, idles otherwise. */
  update(dt: number): void {
    if (!this.crowd.ready) return;
    const C = CITY_LAYOUT.places.care.doctor;
    const p = this.ctx.player.visualPosition;
    const d2 = (p.x - C.x) ** 2 + (p.z - C.z) ** 2;
    if (d2 > 90 * 90) return;
    stepPose(this.crowd, 7, this.doctorPose, d2 < 36 ? Clip.wave : Clip.idle, dt);
    drawPose(this.crowd, 7, this.doctorLook, C.x, 0, C.z, C.yaw, 0.98, this.doctorPose);
  }

  fixedUpdate(): void {
    if (!this.kind) return;
    const s = this.spot(this.kind);
    const p = this.ctx.player.position;
    if (Math.hypot(p.x - s.x, p.z - s.z) > 6) this.close(); // walked away
  }

  /** Where the care places are (map icons). */
  spots(): { x: number; z: number; kind: CareKind }[] {
    const C = CITY_LAYOUT.places.care;
    return [
      { x: C.stall.x, z: C.stall.z, kind: 'stall' },
      { x: C.doctor.x, z: C.doctor.z, kind: 'rs' },
    ];
  }
}
