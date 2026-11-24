import * as THREE from 'three';
import type { LevelContext } from '../Level';
import type { BikeSystem } from './Bike';
import type { CityMission, CityResident, ItemIcon, MissionItem } from './CityPlaces';
import { box, cone, cyl, merge, sph, type Part } from './ColorMesh';
import { Clip, type Crowd, type PoseState, bottomColorIndex, crowdColor, drawPose, newPose, packLook, skinColorIndex, stepPose } from './Crowd';

const SKIN = 0xf1c9a0;
const FEET = 0.55;

/** Numbers of the people and the missions in one place. */
export const PeopleConfig = {
  /** Talk reach (m). */
  talkRadius: 2.6,
  /** Residents farther than this are hidden (m); closer than `faceRadius` they turn to the player. */
  showRadius: 90,
  faceRadius: 9,
  /** A mission item is taken inside this horizontal radius and from `below` under to `above` over the player's feet (m). */
  takeRadius: 1.3,
  below: 2.0,
  above: 0.7,
  /** Arrival radius of the bike race target (m). */
  rideRadius: 3.2,
  /** The Ya / Tidak choice ignores input for this long after it opens (s). */
  choiceGuard: 0.35,
} as const;

// ---- Models (merged coloured primitives: one mesh each) ---------------------------------------------------------------------

export function personGeo(color: number, hair: number): THREE.BufferGeometry {
  return merge([
    { g: new THREE.CapsuleGeometry(0.26, 0.27, 4, 12), c: color, p: [0, 0.56, 0], s: [1, 1, 0.72] },
    { g: sph(0.255, 16, 10), c: SKIN, p: [0, 1.22, 0] },
    { g: new THREE.SphereGeometry(0.271, 16, 6, 0, Math.PI * 2, 0, 1.62), c: hair, p: [0, 1.225, -0.04] },
    { g: sph(0.045, 8, 5), c: SKIN, p: [0, 1.19, 0.241], s: [0.8, 0.8, 1] },
    { g: sph(0.046, 8, 5), c: 0xa45546, p: [0, 1.127, 0.23], s: [1, 0.45, 0.4] },
    ...[-1, 1].flatMap((side): Part[] => [
      { g: sph(0.092, 8, 5), c: 0x343b50, p: [side * 0.115, 0.075, 0.045], s: [1, 0.8, 1.5] },
      { g: new THREE.CapsuleGeometry(0.075, 0.28, 2, 8), c: color, p: [side * 0.29, 0.66, 0], r: [0, 0, side * 0.34] },
      { g: sph(0.072, 8, 5), c: SKIN, p: [side * 0.353, 0.47, 0] },
      { g: sph(0.056, 8, 5), c: SKIN, p: [side * 0.246, 1.199, 0] },
      { g: sph(0.042, 8, 6), c: 0xfffaf1, p: [side * 0.092, 1.248, 0.225], s: [1, 1.14, 0.55] },
      { g: sph(0.025, 8, 5), c: 0x33221e, p: [side * 0.092, 1.248, 0.245], s: [1, 1.15, 0.5] },
      { g: sph(0.008, 6, 4), c: 0xffffff, p: [side * 0.092 - 0.008, 1.257, 0.255] },
    ]),
  ]);
}

const BALLOON = [0xff5a5f, 0x4dabf7, 0xffc94d];

/** Mission item models, centred on their own origin (the item's y). `variant` picks a colour. */
function itemGeo(icon: ItemIcon, variant: number): THREE.BufferGeometry {
  switch (icon) {
    case 'ball':
      return merge([
        { g: sph(0.27, 10, 7), c: 0xe8453c },
        { g: cyl(0.275, 0.275, 0.07, 10), c: 0xffffff },
        { g: cyl(0.275, 0.275, 0.07, 10), c: 0xffffff, r: [Math.PI / 2, 0, 0] },
      ]);
    case 'apple':
      return merge([
        { g: sph(0.22, 8, 6), c: 0xe53935 },
        { g: cyl(0.02, 0.02, 0.1, 5), c: 0x6b4a2b, p: [0, 0.24, 0] },
        { g: sph(0.07, 6, 4), c: 0x4caf50, p: [0.07, 0.25, 0], s: [1.5, 0.4, 0.8] },
      ]);
    case 'balloon':
      return merge([
        { g: sph(0.38, 10, 8), c: BALLOON[variant % BALLOON.length], s: [1, 1.2, 1], p: [0, 0.3, 0] },
        { g: cone(0.07, 0.12, 6), c: BALLOON[variant % BALLOON.length], p: [0, -0.2, 0], r: [Math.PI, 0, 0] },
        { g: box(0.015, 0.85, 0.015), c: 0xdddddd, p: [0, -0.65, 0] },
      ]);
    case 'cat':
      return merge([
        { g: sph(0.25, 8, 6), c: 0xf2a65a, s: [0.9, 0.8, 1.35], p: [0, 0.22, 0] },
        { g: sph(0.19, 8, 6), c: 0xf2a65a, p: [0, 0.4, 0.3] },
        { g: cone(0.07, 0.14, 4), c: 0xf2a65a, p: [-0.1, 0.57, 0.3] },
        { g: cone(0.07, 0.14, 4), c: 0xf2a65a, p: [0.1, 0.57, 0.3] },
        { g: sph(0.025, 5, 4), c: 0x2b1a12, p: [-0.07, 0.43, 0.46] },
        { g: sph(0.025, 5, 4), c: 0x2b1a12, p: [0.07, 0.43, 0.46] },
        { g: cyl(0.04, 0.03, 0.5, 5), c: 0xf2a65a, p: [0, 0.4, -0.42], r: [-0.8, 0, 0] },
      ]);
    case 'bell':
      return merge([
        { g: cyl(0.12, 0.34, 0.5, 10), c: 0xffc94d, p: [0, 0.05, 0] },
        { g: sph(0.07, 6, 4), c: 0xc98a12, p: [0, -0.24, 0] },
        { g: sph(0.06, 6, 4), c: 0xffc94d, p: [0, 0.33, 0] },
        { g: box(0.7, 0.07, 0.07), c: 0x7a5230, p: [0, 0.4, 0] },
        { g: box(0.07, 0.9, 0.07), c: 0x7a5230, p: [-0.35, 0, 0] },
        { g: box(0.07, 0.9, 0.07), c: 0x7a5230, p: [0.35, 0, 0] },
      ]);
    case 'flower':
      return merge([
        { g: cyl(0.025, 0.03, 0.5, 5), c: 0x4caf50, p: [0, -0.1, 0] },
        ...[0, 1, 2, 3, 4].map((k) => ({ g: sph(0.1, 6, 4), c: 0xff7eb6, p: [Math.cos((k * Math.PI * 2) / 5) * 0.14, 0.2, Math.sin((k * Math.PI * 2) / 5) * 0.14] as const })),
        { g: sph(0.08, 6, 4), c: 0xffd23f, p: [0, 0.2, 0] },
      ]);
    case 'letter':
      return merge([
        { g: box(0.46, 0.05, 0.32), c: 0xffffff },
        { g: box(0.1, 0.06, 0.1), c: 0xe8453c, p: [0, 0.01, 0] },
      ]);
    default:
      return merge([{ g: sph(0.2, 6, 4), c: 0xffc94d }]);
  }
}

// ---- Ya / Tidak ----------------------------------------------------------------------------------------------------------------

const YES_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 34 L27 47 L51 18" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NO_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 16 L48 48 M48 16 L16 48" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/></svg>';

/**
 * A two-button question (big green tick "Ya", big red cross "Tidak"). Answer by tapping or clicking a button, or with the
 * stick / keys left-right and the talk or jump button. "Tidak" is selected first (the safe answer). Controls are locked while
 * it is open.
 */
class YesNo {
  private readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly btn: [HTMLButtonElement, HTMLButtonElement];
  private sel = 1;
  private latched = false;
  private age = 0;
  private resolve: ((yes: boolean) => void) | null = null;

  constructor(private readonly ctx: LevelContext) {
    this.el = document.createElement('div');
    this.el.className = 'yn';
    this.el.hidden = true;
    const card = document.createElement('div');
    card.className = 'yn-card';
    this.title = document.createElement('div');
    this.title.className = 'yn-title';
    const row = document.createElement('div');
    row.className = 'yn-row';
    const mk = (cls: string, svg: string, label: string, yes: boolean): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = `yn-btn ${cls}`;
      b.innerHTML = `${svg}<span>${label}</span>`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.answer(yes);
      });
      return b;
    };
    this.btn = [mk('yes', YES_SVG, 'Ya', true), mk('no', NO_SVG, 'Tidak', false)];
    row.append(this.btn[0], this.btn[1]);
    card.append(this.title, row);
    this.el.appendChild(card);
    for (const ev of ['pointerup', 'mousedown', 'touchstart']) this.el.addEventListener(ev, (e) => e.stopPropagation());
    ctx.ui.appendChild(this.el);
    ctx.onDispose(() => this.el.remove());
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  ask(text: string): Promise<boolean> {
    this.title.textContent = text;
    this.el.hidden = false;
    this.sel = 1;
    this.age = 0;
    this.latched = true;
    this.paint();
    this.ctx.game.setControlsEnabled(false);
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
    });
  }

  private paint(): void {
    this.btn[0].classList.toggle('sel', this.sel === 0);
    this.btn[1].classList.toggle('sel', this.sel === 1);
  }

  private answer(yes: boolean): void {
    const r = this.resolve;
    if (!r) return;
    this.resolve = null;
    this.el.hidden = true;
    this.ctx.game.setControlsEnabled(true);
    this.ctx.sfx.pop();
    r(yes);
  }

  fixedUpdate(dt: number): void {
    if (!this.resolve) return;
    this.age += dt;
    const { input } = this.ctx;
    const mx = input.move.x;
    if (Math.abs(mx) < 0.3) this.latched = false;
    else if (Math.abs(mx) > 0.6 && !this.latched) {
      this.latched = true;
      this.sel = mx < 0 ? 0 : 1;
      this.paint();
    }
    if (this.age > PeopleConfig.choiceGuard && (input.wasPressed('interact') || input.wasPressed('jump'))) this.answer(this.sel === 0);
  }
}

// ---- Residents and missions ------------------------------------------------------------------------------------------------------

interface Person {
  data: CityResident;
  /** Old low-poly body: only when the animated models did not load. */
  mesh: THREE.Mesh | null;
  phase: number;
  yaw: number;
  variant: number;
  look: number;
  pose: PoseState;
  /** Drawn height scale. */
  scale: number;
}

/** Body variant of the named residents (see Crowd.VARIANTS: 0 male casual, 1 shirt, 2 long sleeve, 3 suit, 4 female casual, 5 dress, 6 tank top, 7 alternative). */
const BODY: Record<string, number> = { sari: 4, joko: 1, dimas: 0, guru: 3, lala: 5, pos: 2, ani: 7, bima: 1 };

interface Active {
  m: CityMission;
  taken: Uint8Array;
  got: number;
  ready: boolean;
  meshes: THREE.Mesh[];
}

const STAR_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 L40 23 L60 24.5 L45 38 L49.5 58 L32 47.5 L14.5 58 L19 38 L4 24.5 L24 23 Z" fill="#ffd23f" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';

/**
 * Friendly residents (8, with a gentle idle sway) and their tiny missions. One mission at a time; every
 * mission is optional and never blocks the story. Flow: talk -> a short line -> the beam and the map star show the first thing
 * to do -> do it -> small celebration, coins, saved as done. Talking to another giver while one mission runs asks Ya / Tidak.
 */
export class CityPeople {
  private readonly people: Person[] = [];
  private readonly missions = new Map<string, CityMission>();
  private readonly done: Set<string>;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly markerGeo = new THREE.OctahedronGeometry(0.2, 0);
  private readonly markerMat = new THREE.MeshBasicMaterial({ color: 0xffc928, toneMapped: false, fog: false });
  /** The golden "I have a mission" markers over the heads: ONE instanced mesh for all residents. */
  private readonly markers: THREE.InstancedMesh;
  private readonly mm = new THREE.Matrix4();
  private readonly mq = new THREE.Quaternion();
  private readonly mp = new THREE.Vector3();
  private readonly ms = new THREE.Vector3(1, 1, 1);
  private readonly my = new THREE.Vector3(0, 1, 0);
  private readonly yn: YesNo;
  private readonly toast: HTMLDivElement;
  private readonly toastNum: HTMLElement;
  private active: Active | null = null;
  private busy = false;
  private t = 0;
  private readonly tmp = new THREE.Vector3();
  /** Counters for tests. */
  finished = 0;
  dropped = 0;
  /** Called when the set of available missions changed (the map redraws). */
  onChange: (() => void) | null = null;

  constructor(
    private readonly ctx: LevelContext,
    private readonly lit: THREE.Material,
    residents: readonly CityResident[],
    missions: readonly CityMission[],
    private readonly bike: BikeSystem,
    /** False between Chapter 1 and 2 (the story's own beam is on): residents only wave. */
    private readonly canOffer: () => boolean,
    private readonly crowd: Crowd,
  ) {
    for (const m of missions) this.missions.set(m.id, m);
    this.done = new Set(ctx.save.data.city.missions);
    this.yn = new YesNo(ctx);
    this.toast = document.createElement('div');
    this.toast.className = 'city-star';
    this.toast.innerHTML = `${STAR_SVG}<b>+<span>0</span></b>`;
    this.toastNum = this.toast.querySelector('span') as HTMLElement;
    ctx.ui.appendChild(this.toast);
    ctx.onDispose(() => this.toast.remove());

    this.markers = new THREE.InstancedMesh(this.markerGeo, this.markerMat, Math.max(1, residents.length));
    this.markers.frustumCulled = false;
    this.markers.castShadow = false;
    this.markers.count = 1;
    ctx.root.add(this.markers);
    residents.forEach((r, i) => {
      let mesh: THREE.Mesh | null = null;
      if (!crowd.ready) {
        const g = personGeo(r.color, r.hair);
        this.geos.push(g);
        mesh = new THREE.Mesh(g, this.lit);
        mesh.position.set(r.x, 0, r.z);
        mesh.rotation.y = r.yaw;
        mesh.castShadow = false;
        ctx.root.add(mesh);
      }
      ctx.physics.addFixedCylinder(0.75, 0.4, { x: r.x, y: 0.75, z: r.z });
      const h = [...r.id].reduce((t, c) => (t * 31 + c.charCodeAt(0)) >>> 0, 7);
      const variant = BODY[r.id] ?? h % 8;
      const look = packLook(skinColorIndex(h >> 3), crowdColor(r.color), bottomColorIndex(h >> 5), crowdColor(r.hair));
      this.people.push({ data: r, mesh, phase: i * 1.7, yaw: r.yaw, variant, look, pose: newPose((i * 0.37) % 1), scale: r.id === 'guru' ? 1.04 : 0.98 });
      ctx.interactions.add({
        position: new THREE.Vector3(r.x, 0.8, r.z),
        radius: PeopleConfig.talkRadius,
        icon: 'talk',
        promptHeight: 1.9,
        enabled: () => !this.bike.isRiding && !this.busy && !this.yn.open,
        onInteract: () => this.talk(i),
      });
    });
    this.refreshMarkers();
    ctx.onDispose(() => {
      for (const g of this.geos) g.dispose();
      this.clearItems();
      this.markers.dispose();
      this.markerGeo.dispose();
      this.markerMat.dispose();
    });
  }

  get activeId(): string {
    return this.active ? this.active.m.id : '';
  }

  /** Residents with a mission to give right now (for the map). */
  availableSpots(): { x: number; z: number }[] {
    return this.people.filter((p) => this.isAvailable(p.data.mission)).map((p) => ({ x: p.data.x, z: p.data.z }));
  }

  /** Test helper: `id mission x z available`. */
  list(): { id: string; mission: string; x: number; z: number; available: boolean }[] {
    return this.people.map((p) => ({ id: p.data.id, mission: p.data.mission, x: p.data.x, z: p.data.z, available: this.isAvailable(p.data.mission) }));
  }

  private isAvailable(id: string): boolean {
    return !this.done.has(id) && this.active?.m.id !== id && this.canOffer();
  }

  private refreshMarkers(): void {
    this.onChange?.();
  }

  // ---- Talking -------------------------------------------------------------------------------------------------------------------

  /** `id` is the voice clip id (`public/audio/<id>.mp3`, written by `npm run audio` from audio/dialog.json). */
  private say(speaker: string, text: string, id: string, lock = true): Promise<void> {
    return this.ctx.dialog.say({ speaker, text, id }, { lockControls: lock });
  }

  private talk(i: number): void {
    const r = this.people[i].data;
    const m = this.missions.get(r.mission) as CityMission;
    const act = this.active;
    const { seq } = this.ctx;
    if (act && act.m.kind === 'deliver' && act.m.deliverTo === r.id) {
      seq.run(async () => {
        this.busy = true;
        await this.say(r.id, act.m.done, `kota_${act.m.id}_done`);
        this.finish(act.m);
        this.busy = false;
      });
      return;
    }
    if (act && act.m.id === m.id) {
      if (act.ready) {
        seq.run(async () => {
          this.busy = true;
          await this.say(r.id, m.done, `kota_${m.id}_done`);
          this.finish(m);
          this.busy = false;
        });
      } else {
        seq.run(async () => {
          this.busy = true;
          await this.say(r.id, m.remind, `kota_${m.id}_remind`);
          this.busy = false;
        });
      }
      return;
    }
    if (this.done.has(m.id) || !this.canOffer()) {
      seq.run(async () => {
        this.busy = true;
        await this.say(r.id, this.done.has(m.id) ? 'Terima kasih, {nama}!' : 'Halo, {nama}!', `kota_${r.id}_${this.done.has(m.id) ? 'terima' : 'halo'}`, false);
        this.busy = false;
      });
      return;
    }
    seq.run(async () => {
      this.busy = true;
      if (this.active) {
        const yes = await this.yn.ask('Ganti tugas?');
        if (!yes) {
          this.busy = false;
          return;
        }
        this.drop();
      }
      await this.say(r.id, m.offer, `kota_${m.id}_offer`);
      this.activate(m);
      this.busy = false;
    });
  }

  // ---- Mission life ----------------------------------------------------------------------------------------------------------------

  private activate(m: CityMission): void {
    const taken = new Uint8Array(m.items.length);
    const meshes: THREE.Mesh[] = [];
    m.items.forEach((it, k) => {
      const g = itemGeo(m.icon, k);
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, this.lit);
      mesh.position.set(it.x, it.y, it.z);
      mesh.castShadow = false;
      this.ctx.root.add(mesh);
      meshes.push(mesh);
    });
    this.active = { m, taken, got: 0, ready: false, meshes };
    this.ctx.sfx.bling();
    this.pointToNext();
    this.refreshMarkers();
  }

  private clearItems(): void {
    const a = this.active;
    if (!a) return;
    for (const mesh of a.meshes) mesh.removeFromParent();
    a.meshes.length = 0;
  }

  /** Give up the running mission (items and beam go away; it can be asked for again). */
  drop(): void {
    if (!this.active) return;
    this.clearItems();
    this.ctx.objectives.clear();
    this.active = null;
    this.dropped++;
    this.refreshMarkers();
  }

  private giverOf(m: CityMission): CityResident {
    return (this.people.find((p) => p.data.id === m.giver) as Person).data;
  }

  /** Beam and map star to the next thing to do. */
  private pointToNext(): void {
    const a = this.active;
    if (!a) return;
    const { objectives, player } = this.ctx;
    const m = a.m;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    if (m.kind === 'ride' && m.target) {
      tx = m.target.x;
      tz = m.target.z;
    } else if (m.kind === 'deliver') {
      const to = (this.people.find((p) => p.data.id === m.deliverTo) as Person).data;
      tx = to.x;
      tz = to.z;
    } else if (a.ready) {
      const g = this.giverOf(m);
      tx = g.x;
      tz = g.z;
    } else {
      let best = Infinity;
      const p = player.position;
      m.items.forEach((it, k) => {
        if (a.taken[k]) return;
        const d = Math.hypot(it.x - p.x, it.z - p.z);
        if (d < best) {
          best = d;
          tx = it.x;
          tz = it.z;
          ty = it.y > 2 ? it.y - 1.1 : 0;
        }
      });
    }
    objectives.set(this.tmp.set(tx, ty, tz));
  }

  /** The player took item k (walked into it). */
  private takeItem(k: number, it: MissionItem): void {
    const a = this.active;
    if (!a) return;
    a.taken[k] = 1;
    a.got++;
    a.meshes[k].visible = false;
    const { sfx, fx } = this.ctx;
    fx.sparkles.burst(it.x, it.y, it.z, 12, 2.6, 0xffd23f, { gravity: 2, life: 0.7, up: 0.8 });
    if (a.m.icon === 'bell') sfx.bell();
    else sfx.coin();
    if (a.got < a.m.items.length) {
      this.pointToNext();
      return;
    }
    if (a.m.returns) {
      a.ready = true;
      this.pointToNext();
      void this.say('glen', a.m.icon === 'cat' ? 'Wah, ketemu! Ayo bawa pulang.' : 'Sudah semua! Ayo kembali.', a.m.icon === 'cat' ? 'kota_glen_ketemu' : 'kota_glen_semua', false);
    } else this.finish(a.m);
  }

  private finish(m: CityMission): void {
    if (this.done.has(m.id)) return;
    this.clearItems();
    this.ctx.objectives.clear();
    this.active = null;
    this.done.add(m.id);
    this.finished++;
    this.ctx.save.finishCityMission(m.id, m.reward);
    this.ctx.quiz.coinsChanged();
    this.celebrate(m);
    this.refreshMarkers();
  }

  private celebrate(m: CityMission): void {
    const { ctx } = this;
    const p = ctx.player.visualPosition;
    const { seq } = ctx;
    ctx.sfx.coinDone();
    ctx.fx.rings.spawn(p.x, p.y - FEET, p.z, 2.6, 0.7, 0xffc400, 0.9);
    seq.run(async () => {
      for (let i = 0; i < 3; i++) {
        const q = ctx.player.visualPosition;
        ctx.fx.sparkles.burst(q.x + (i - 1) * 0.9, q.y + 1.8, q.z, 22, 4, -1, { gravity: 3, life: 1.3, up: 1 });
        await seq.wait(0.2);
      }
    });
    this.toastNum.textContent = String(m.reward);
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    seq.run(async () => {
      await seq.wait(2.6);
      this.toast.classList.remove('show');
    });
  }

  // ---- Per step / frame -------------------------------------------------------------------------------------------------------------

  fixedUpdate(dt: number): void {
    this.yn.fixedUpdate(dt);
    const a = this.active;
    if (!a) return;
    const p = this.ctx.player.position;
    const feet = p.y - FEET;
    const m = a.m;
    if (m.kind === 'ride') {
      if (m.target && this.bike.isRiding && Math.hypot(p.x - m.target.x, p.z - m.target.z) < PeopleConfig.rideRadius) this.finish(m);
      return;
    }
    const R = PeopleConfig.takeRadius;
    for (let k = 0; k < m.items.length; k++) {
      if (a.taken[k]) continue;
      const it = m.items[k];
      const dy = feet - it.y;
      if (dy < -PeopleConfig.above || dy > PeopleConfig.below) continue;
      const dx = it.x - p.x;
      const dz = it.z - p.z;
      if (dx * dx + dz * dz > R * R) continue;
      this.takeItem(k, it);
      if (!this.active) return;
    }
  }

  update(dt: number): void {
    this.t += dt;
    const pv = this.ctx.player.visualPosition;
    const a = this.active;
    let nm = 0;
    const arr = this.markers.instanceMatrix.array as Float32Array;
    for (const p of this.people) {
      const dx = pv.x - p.data.x;
      const dz = pv.z - p.data.z;
      const d2 = dx * dx + dz * dz;
      const show = d2 < PeopleConfig.showRadius * PeopleConfig.showRadius;
      if (p.mesh) p.mesh.visible = show;
      if (!show) continue;
      if (p.mesh) {
        const s = Math.sin(this.t * 2.2 + p.phase);
        p.mesh.position.y = Math.abs(s) * 0.035;
        p.mesh.rotation.z = Math.sin(this.t * 1.3 + p.phase) * 0.04;
        p.mesh.scale.y = 1 + s * 0.012;
      }
      if (d2 < PeopleConfig.faceRadius * PeopleConfig.faceRadius) {
        const want = Math.atan2(dx, dz);
        let diff = (want - p.yaw) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        else if (diff < -Math.PI) diff += Math.PI * 2;
        p.yaw += diff * Math.min(1, dt * 4);
        if (p.mesh) p.mesh.rotation.y = p.yaw;
      }
      if (!p.mesh) {
        // Wave at Glen when he comes close (and while talking), stand with the idle breathing otherwise.
        const near = d2 < (PeopleConfig.talkRadius + 4) * (PeopleConfig.talkRadius + 4);
        stepPose(this.crowd, p.variant, p.pose, near ? Clip.wave : Clip.idle, dt);
        drawPose(this.crowd, p.variant, p.look, p.data.x, 0, p.data.z, p.yaw, p.scale, p.pose);
      }
      if (this.isAvailable(p.data.mission)) {
        this.mq.setFromAxisAngle(this.my, this.t * 2);
        this.mm.compose(this.mp.set(p.data.x, 2.15 + Math.sin(this.t * 3 + p.phase) * 0.1, p.data.z), this.mq, this.ms);
        this.mm.toArray(arr, nm * 16);
        nm++;
      }
    }
    if (nm === 0) arr.fill(0, 0, 16);
    this.markers.count = Math.max(1, nm);
    this.markers.instanceMatrix.needsUpdate = true;
    if (a) {
      for (let k = 0; k < a.meshes.length; k++) {
        const mesh = a.meshes[k];
        const it = a.m.items[k];
        mesh.position.y = it.y + Math.sin(this.t * 2.4 + k) * 0.08;
        if (a.m.icon !== 'balloon' && a.m.icon !== 'bell') mesh.rotation.y = this.t * 1.5;
      }
    }
  }
}
