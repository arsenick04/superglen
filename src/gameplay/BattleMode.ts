import * as THREE from 'three';
import '../battle.css';
import type { AudioManager } from '../audio/AudioManager';
import type { Sfx } from '../audio/Sfx';
import { CameraConfig, type ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { SaveStore } from '../core/Save';
import type { GroundRings } from '../fx/GroundRings';
import type { Player } from '../player/Player';
import type { Sparkles } from '../world/bab1/Fx';
import type { CityLife } from '../world/kota/CityLife';
import type { Health } from './Health';

/** Every number of the battle mode in one place. */
export const BattleConfig = {
  /** Entrance shot: seconds the camera orbits Glen and shows the enemy name (skippable). */
  introTime: 2,
  /** The player cannot be hurt during the entrance shot plus this much (s). */
  introGrace: 0.4,
  /** Slow motion when a star breaks: game speed and real seconds. */
  slowScale: 0.3,
  slowTime: 0.25,
  /** Zoom punch (degrees of field of view) and its length (s) when a star breaks. */
  starPunch: 6,
  starPunchTime: 0.45,
  /** Camera shake (m) and length (s): a hit on Glen, a slam / lunge of the enemy, a star breaking. */
  shakeHit: { amp: 0.16, time: 0.35 },
  shakeSlam: { amp: 0.22, time: 0.4 },
  shakeLunge: { amp: 0.1, time: 0.25 },
  shakeStar: { amp: 0.2, time: 0.45 },
  /** A low glowing boundary on the ground; the player boundary is logical, not a tall visual curtain. */
  ringHeight: 0.12,
  edgeMargin: 3.2,
  edgePush: 7,
  /** City people: run away from this far (m) from the fight's centre, stand `watch` m away, cars stop `stop` m away. */
  fleeExtra: 14,
  watchExtra: 9,
  stopExtra: 16,
  /** Aura puffs around the enemy every this many seconds. */
  auraEvery: 0.45,
  /** Seconds the food counter stays visible after it changed. */
  counterShow: 3,
} as const;

/** What a fight tells the battle mode when it starts (see `BattleMode.enter`). */
export interface BattleSpec {
  /** Portrait file name (`public/portraits/<id>.webp`, used if present) and test id. */
  id: string;
  /** Banner text, Indonesian. */
  name: string;
  /** The enemy's body centre in the world, kept up to date by the fight (null: none to frame right now). */
  focus: () => { x: number; y: number; z: number } | null;
  /** The round arena (ring + soft wall); omit for a free-roaming fight (the market rats). */
  arena?: { x: number; z: number; r: number };
  /** Centre and radius of what the city people react to (default: the arena, or the enemy's place). */
  city?: { x: number; z: number; r: number };
  /** Stars left of the enemy (the fight owns its own bar when `ownBar` is false). Used to notice a broken star. */
  stars: () => { left: number; max: number };
  /** The battle banner draws its own star bar (fights that have no star bar of their own). */
  ownBar?: boolean;
  /** Entrance shot with the big name (default true). */
  intro?: boolean;
  /** Slow motion and zoom punch when a star breaks (default true; off for the many small rats). */
  punchy?: boolean;
  /** Aura colour (default red-orange). */
  aura?: number;
}

const RING_VERT = `
varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RING_FRAG = `
uniform float uTime;
uniform float uNear;
uniform float uH;
uniform vec3 uColor;
varying vec3 vP;
void main() {
  float h = clamp((vP.y + uH * 0.5) / uH, 0.0, 1.0);
  float a = pow(1.0 - h, 2.2);
  float band = smoothstep(0.0, 0.04, h) * (1.0 - smoothstep(0.04, 0.12, h));
  float ang = atan(vP.z, vP.x);
  float dash = 0.55 + 0.45 * sin(ang * 36.0 + uTime * 2.0);
  float alpha = (a * (0.20 + 0.5 * uNear) * dash + band * 0.75) * (0.8 + 0.2 * sin(uTime * 3.0));
  gl_FragColor = vec4(uColor * (0.8 + 0.6 * band), alpha);
}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

const STAR_SVG =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5l4.1 8.6 9.4 1.2-6.9 6.5 1.8 9.3L16 23.4l-8.4 4.7 1.8-9.3L2.5 12.3l9.4-1.2z" fill="#ffd23f" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>';

/**
 * BATTLE MODE: every fight (the market rats once they fight back, Ular Melar, Tikus Rakus, later bosses) calls `enter(spec)` when it
 * starts and `exit()` when it ends. The fight must feel like a different scene from the open city:
 *
 *  - HUD (battle.css, `html.battle`): minimap, gear (a small pause icon stays), place pill, coins, bakpao counter (flashes when it
 *    changes), mission arrows and Talk are hidden; hearts, boss banner (portrait slot) and star bar are the fight HUD; buttons see-through.
 *  - Camera: lock-on that frames Glen and the enemy (ThirdPersonCamera.setBattle), entrance sweep with the name, shake on slams and
 *    hits (off with "kurangi guncangan"), slow motion plus zoom punch when a star breaks.
 *  - Atmosphere: a glowing arena ring Glen cannot leave (soft wall, `Flight.arena`), vignette and warm tint, dust on slams, an aura
 *    around the enemy, city people run away ("Awas!"), watch and cheer ("Hore!"), traffic stops.
 *  - Music: `pertarungan` scene and back (crossfade), a short start sting.
 *
 * Owned by the Game, shared with every level (`ctx.battle`). The level that built a city passes its CityLife with `setCity`.
 */
export class BattleMode {
  private spec: BattleSpec | null = null;
  private readonly fx: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly portrait: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly barStars: HTMLElement[] = [];
  private readonly shoutEls: { el: HTMLDivElement; x: number; y: number; z: number; t: number }[] = [];
  private portraitId = '';
  private ring: THREE.Mesh | null = null;
  private ringMat: THREE.ShaderMaterial | null = null;
  private readonly focusPos = new THREE.Vector3();
  private life: CityLife | null = null;
  private prevClear: { x: number; z: number; r: number } | null = null;
  private clearSet = false;
  private prevScene = 'jelajah';
  private t = 0;
  private introLeft = 0;
  private introStage = 0;
  private slowLeft = 0;
  private lastStars = -1;
  private lastHits = 0;
  private lastCounter = '';
  private counterLeft = 0;
  private auraGap = 0;
  private hitFlash = 0;
  private skipHandlers = false;
  /** The soft wall only holds once Glen is inside the ring (the fight may wake him from farther away). */
  private armed = false;
  private readonly tmp = new THREE.Vector3();
  /** Counters for the tests. */
  entered = 0;
  exited = 0;
  starsBroken = 0;
  shakes = 0;
  skipped = 0;

  constructor(
    private readonly deps: {
      ui: HTMLElement;
      scene: THREE.Scene;
      cameraRig: ThirdPersonCamera;
      player: Player;
      audio: AudioManager;
      sfx: Sfx;
      save: SaveStore;
      health: Health;
      sparkles: Sparkles;
      rings: GroundRings;
    },
  ) {
    const { ui } = deps;
    this.fx = el('div', 'battle-fx', ui);
    this.banner = el('div', 'battle-banner', ui);
    this.portrait = el('div', 'bb-portrait', this.banner);
    this.nameEl = el('div', 'bb-name', this.banner);
    this.bar = el('div', 'bb-bar', this.banner);
    this.banner.hidden = true;
    for (let i = 0; i < 4; i++) {
      const s = el('div', 'battle-shout', ui);
      s.hidden = true;
      this.shoutEls.push({ el: s, x: 0, y: 0, z: 0, t: 0 });
    }
  }

  get active(): boolean {
    return this.spec !== null;
  }

  /** Combat waits until the entrance sweep has finished or the child skipped it. */
  get entering(): boolean {
    return this.introLeft > 0;
  }

  get id(): string {
    return this.spec?.id ?? '';
  }

  /** The game speed (1 normally; a little less for a moment when a star breaks). Applied by the Game loop. */
  get timeScale(): number {
    return this.slowLeft > 0 ? BattleConfig.slowScale : 1;
  }

  /** The level that has a city gives its life here (null when the level goes). */
  setCity(life: CityLife | null): void {
    if (!life && this.life) this.endCity();
    this.life = life;
    if (life) life.onShout = (x, y, z, text) => this.shout(x, y, z, text);
    if (life && this.spec) this.startCity();
  }

  private get reduce(): boolean {
    return this.deps.save.data.settings.reduceShake;
  }

  /** A fight starts. Calling it again while a fight runs only replaces the spec's details (no second entrance). */
  enter(spec: BattleSpec): void {
    const { deps } = this;
    const again = this.spec !== null;
    this.spec = spec;
    if (again) return;
    this.entered++;
    document.documentElement.classList.add('battle');
    this.nameEl.textContent = spec.name;
    this.setPortrait(spec.id);
    this.bar.hidden = !spec.ownBar;
    this.syncBar(true);
    this.banner.hidden = false;
    this.lastStars = spec.stars().left;
    this.lastHits = deps.health.hits;
    this.lastCounter = '';
    this.counterLeft = 0;
    this.prevScene = deps.audio.musicScene || 'jelajah';
    if (this.prevScene === 'pertarungan') this.prevScene = 'jelajah';
    deps.audio.music.setScene('pertarungan');
    deps.sfx.battleStart();
    this.updateFocus();
    deps.cameraRig.setBattle(this.focusPos);
    if (spec.arena) this.buildRing(spec.arena);
    this.startCity();
    this.introStage = 0;
    if (spec.intro !== false) {
      this.introLeft = BattleConfig.introTime;
      this.banner.classList.add('intro');
      deps.health.grace(BattleConfig.introTime + BattleConfig.introGrace);
      this.addSkip();
      this.introShot(0);
    } else this.introLeft = 0;
  }

  /** The fight is over (tamed, left, rested at the hospital, level change). `tamed`: a short victory flourish first. */
  exit(tamed = false): void {
    const spec = this.spec;
    if (!spec) return;
    const { deps } = this;
    this.spec = null;
    this.exited++;
    if (tamed) {
      const f = this.focusPos;
      deps.sparkles.burst(f.x, f.y + 0.8, f.z, 40, 5, -1, { up: 0.8, life: 1.4, gravity: 2 });
      deps.rings.spawn(f.x, f.y - 1, f.z, 6, 0.9, 0xffd23f);
      deps.sfx.fanfare();
      this.life?.cheer(deps.player.position.x, deps.player.position.z);
    }
    document.documentElement.classList.remove('battle');
    this.banner.hidden = true;
    this.banner.classList.remove('intro');
    this.introLeft = 0;
    this.removeSkip();
    this.slowLeft = 0;
    deps.cameraRig.setBattle(null);
    deps.cameraRig.setFraming(null);
    deps.audio.music.setScene(this.prevScene as 'jelajah');
    deps.player.flight.arena = null;
    this.armed = false;
    this.removeRing();
    this.endCity();
    this.hitFlash = 0;
    this.fx.classList.remove('hit');
    for (const s of this.shoutEls) s.el.hidden = true;
    document.querySelectorAll('.battle-flash').forEach((e) => e.classList.remove('battle-flash'));
  }

  /** The level goes away: leave any fight without any flourish. */
  reset(): void {
    this.exit(false);
    this.life = null;
  }

  // ---- impacts -------------------------------------------------------------------------------------------------

  /** A slam, lunge or landing of the enemy at (x, z): dust, a shake. `power` 0..1+. */
  impact(x: number, z: number, power = 1, kind: 'slam' | 'lunge' = 'slam'): void {
    if (!this.spec) return;
    const { sparkles } = this.deps;
    const y = this.deps.player.position.y - 0.45;
    sparkles.burst(x, y + 0.15, z, Math.round(10 + 10 * Math.min(1.5, power)), 2.2 + power * 1.8, 0xd9c7a0, { up: 0.35, life: 0.8, gravity: 1.2 });
    const c = kind === 'slam' ? BattleConfig.shakeSlam : BattleConfig.shakeLunge;
    this.shake(c.amp * Math.min(1.6, 0.6 + power * 0.6), c.time);
  }

  /** Camera shake (respects "kurangi guncangan"). */
  shake(amp: number, time: number): void {
    if (this.reduce) return;
    this.shakes++;
    this.deps.cameraRig.shake(amp, time);
  }

  /** A star broke (noticed from `spec.stars()`, or called by a fight): slow motion, zoom punch, cheers. */
  starBroken(): void {
    const spec = this.spec;
    if (!spec) return;
    this.starsBroken++;
    const f = this.focusPos;
    const { sparkles } = this.deps;
    sparkles.burst(f.x, f.y + 0.9, f.z, 26, 4.2, 0xffd23f, { up: 0.7, life: 1.1, gravity: 1.5 });
    this.life?.cheer(this.deps.player.position.x, this.deps.player.position.z);
    this.hitFlash = 0.18;
    this.fx.classList.add('star');
    if (spec.punchy !== false && !this.reduce) {
      this.slowLeft = BattleConfig.slowTime;
      this.deps.cameraRig.punch(BattleConfig.starPunch, BattleConfig.starPunchTime);
      this.shake(BattleConfig.shakeStar.amp, BattleConfig.shakeStar.time);
    }
  }

  // ---- per frame -----------------------------------------------------------------------------------------------

  /** Fixed step: the soft arena wall (the Player reads `flight.arena`). */
  fixedUpdate(): void {
    // nothing per step: the wall is a velocity limiter inside the Player
  }

  update(dt: number): void {
    const spec = this.spec;
    this.t += dt;
    if (this.slowLeft > 0) this.slowLeft = Math.max(0, this.slowLeft - dt);
    this.updateShouts(dt);
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) this.fx.classList.remove('hit', 'star');
    }
    if (!spec) return;
    const { deps } = this;
    this.updateFocus();

    // Entrance shot: a sweep around Glen, then back to the lock-on.
    if (this.introLeft > 0) {
      this.introLeft -= dt;
      const k = 1 - this.introLeft / BattleConfig.introTime;
      if (k > 0.45 && this.introStage === 0) {
        this.introStage = 1;
        this.introShot(1);
      }
      if (this.introLeft <= 0) this.endIntro();
    }

    // Stars: a drop is a broken star.
    const st = spec.stars();
    if (st.left < this.lastStars) this.starBroken();
    this.lastStars = st.left;
    if (spec.ownBar) this.syncBar(false);

    // Hits on Glen: shake and a red flash.
    const h = deps.health.hits;
    if (h > this.lastHits) {
      this.lastHits = h;
      this.shake(BattleConfig.shakeHit.amp, BattleConfig.shakeHit.time);
      this.hitFlash = 0.22;
      this.fx.classList.add('hit');
    }

    // The food counter shows only when it changes.
    const counter = document.querySelector('.ch3-count');
    if (counter) {
      const txt = counter.textContent ?? '';
      if (txt !== this.lastCounter) {
        this.lastCounter = txt;
        this.counterLeft = BattleConfig.counterShow;
      }
      this.counterLeft = Math.max(0, this.counterLeft - dt);
      counter.classList.toggle('battle-flash', this.counterLeft > 0);
    }

    // Aura: soft red puffs and a ring on the ground around the enemy.
    this.auraGap -= dt;
    if (this.auraGap <= 0 && spec.focus()) {
      this.auraGap = BattleConfig.auraEvery;
      const f = this.focusPos;
      const col = spec.aura ?? 0xff6a3d;
      deps.sparkles.burst(f.x + (Math.random() - 0.5) * 1.4, f.y - 0.3, f.z + (Math.random() - 0.5) * 1.4, 2, 0.9, col, { up: 1.6, life: 0.9, gravity: -0.6 });
    }

    // Arena ring + soft wall.
    if (spec.arena && this.ringMat) {
      const a = spec.arena;
      const p = deps.player.visualPosition;
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (!this.armed && d < a.r - 1.2) {
        this.armed = true;
        deps.player.flight.arena = { x: a.x, z: a.z, r: a.r, margin: BattleConfig.edgeMargin, push: BattleConfig.edgePush };
      }
      this.ringMat.uniforms.uTime.value = this.t;
      const near = THREE.MathUtils.clamp((d - (a.r - 7)) / 7, 0, 1);
      const u = this.ringMat.uniforms.uNear;
      u.value += (near - (u.value as number)) * Math.min(1, dt * 6);
    }
  }

  // ---- entrance ------------------------------------------------------------------------------------------------

  private introShot(stage: 0 | 1): void {
    const { cameraRig, player } = this.deps;
    const p = player.position;
    const f = this.focusPos;
    // The yaw of "behind Glen on the line to the enemy", then swung to one side and back.
    const base = Math.atan2(p.x - f.x, p.z - f.z);
    const yaw = base + (stage === 0 ? 0.95 : -0.35);
    // Keep Glen at the center even during the entrance sweep. The enemy
    // supplies only the orbit direction; framing adds distance and pitch.
    cameraRig.setFraming(this.tmp.copy(p), { weight: 0, yaw, distance: stage === 0 ? 2.5 : 3.5, pitch: 0.2 });
  }

  private endIntro(): void {
    this.introLeft = 0;
    this.banner.classList.remove('intro');
    this.deps.cameraRig.setFraming(null);
    this.removeSkip();
  }

  private readonly skip = (): void => {
    if (this.introLeft > 0.3) {
      this.skipped++;
      this.endIntro();
    }
  };

  private addSkip(): void {
    if (this.skipHandlers) return;
    this.skipHandlers = true;
    window.addEventListener('pointerdown', this.skip, true);
    window.addEventListener('keydown', this.skip, true);
  }

  private removeSkip(): void {
    if (!this.skipHandlers) return;
    this.skipHandlers = false;
    window.removeEventListener('pointerdown', this.skip, true);
    window.removeEventListener('keydown', this.skip, true);
  }

  // ---- banner --------------------------------------------------------------------------------------------------

  private setPortrait(id: string): void {
    if (id === this.portraitId) return;
    this.portraitId = id;
    this.portrait.textContent = '';
    this.portrait.classList.remove('has-img');
    const img = new Image();
    img.alt = '';
    img.onload = () => {
      if (this.portraitId !== id) return;
      this.portrait.textContent = '';
      this.portrait.appendChild(img);
      this.portrait.classList.add('has-img');
    };
    img.onerror = () => {
      // No portrait file yet: the plain badge stays.
    };
    img.src = `${import.meta.env.BASE_URL}portraits/${id}.webp`;
  }

  private syncBar(rebuild: boolean): void {
    const spec = this.spec;
    if (!spec || !spec.ownBar) return;
    const st = spec.stars();
    if (rebuild || this.barStars.length !== st.max) {
      this.bar.textContent = '';
      this.barStars.length = 0;
      for (let i = 0; i < st.max; i++) {
        const s = el('span', 'bb-star', this.bar);
        s.innerHTML = STAR_SVG;
        this.barStars.push(s);
      }
    }
    this.barStars.forEach((s, i) => s.classList.toggle('lost', i >= st.left));
    this.bar.dataset.left = String(st.left);
  }

  // ---- focus, ring, city -----------------------------------------------------------------------------------------

  private updateFocus(): void {
    const spec = this.spec;
    if (!spec) return;
    const f = spec.focus();
    if (f) this.focusPos.set(f.x, f.y, f.z);
    else if (spec.arena) this.focusPos.set(spec.arena.x, this.focusPos.y || 1, spec.arena.z);
  }

  private buildRing(a: { x: number; z: number; r: number }): void {
    this.removeRing();
    const H = BattleConfig.ringHeight;
    const geo = new THREE.CylinderGeometry(a.r, a.r, H, 72, 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uNear: { value: 0 }, uH: { value: H }, uColor: { value: new THREE.Color(0xff8a4d) } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Both faces still render. Additive blending is order-independent and the ring writes no depth,
      // so a single two-sided draw preserves its glow without Three's separate back/front passes.
      forceSinglePass: true,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const feet = this.deps.player.position.y - 0.55;
    mesh.position.set(a.x, feet + H * 0.5 - 0.1, a.z);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.deps.scene.add(mesh);
    this.ring = mesh;
    this.ringMat = mat;
    this.armed = false;
  }

  private removeRing(): void {
    if (this.ring) {
      this.deps.scene.remove(this.ring);
      this.ring.geometry.dispose();
      this.ringMat?.dispose();
    }
    this.ring = null;
    this.ringMat = null;
  }

  private startCity(): void {
    const life = this.life;
    const spec = this.spec;
    if (!life || !spec) return;
    const c = spec.city ?? spec.arena ?? (() => {
      const f = spec.focus();
      return { x: f ? f.x : 0, z: f ? f.z : 0, r: 10 };
    })();
    life.setBattle({ x: c.x, z: c.z, fleeR: c.r + BattleConfig.fleeExtra, watchR: c.r + BattleConfig.watchExtra, stopR: c.r + BattleConfig.stopExtra });
    if (!this.clearSet) {
      this.clearSet = true;
      this.prevClear = life.clearZone;
    }
    life.clearZone = { x: c.x, z: c.z, r: Math.max(c.r * 0.9, this.prevClear?.r ?? 0) };
  }

  private endCity(): void {
    const life = this.life;
    if (!life) return;
    life.setBattle(null);
    if (this.clearSet) life.clearZone = this.prevClear;
    this.clearSet = false;
    this.prevClear = null;
  }

  // ---- shout bubbles ("Awas!", "Hore!") ---------------------------------------------------------------------------

  private shout(x: number, y: number, z: number, text: string): void {
    let s = this.shoutEls.find((e) => e.t <= 0);
    if (!s) s = this.shoutEls.reduce((a, b) => (a.t < b.t ? a : b));
    s.x = x;
    s.y = y;
    s.z = z;
    s.t = 1.3;
    s.el.textContent = text;
    s.el.classList.toggle('cheer', text === 'Hore!');
    s.el.hidden = false;
  }

  private updateShouts(dt: number): void {
    const cam = this.deps.cameraRig.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const s of this.shoutEls) {
      if (s.t <= 0) continue;
      s.t -= dt;
      if (s.t <= 0) {
        s.el.hidden = true;
        continue;
      }
      this.tmp.set(s.x, s.y + (1.3 - s.t) * 0.9, s.z).project(cam);
      const on = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1;
      s.el.style.visibility = on ? 'visible' : 'hidden';
      s.el.style.opacity = String(Math.min(1, s.t * 2.5));
      s.el.style.transform = `translate(${((this.tmp.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this.tmp.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  // ---- tests -----------------------------------------------------------------------------------------------------

  debugHandle(): Record<string, unknown> {
    const self = this;
    return {
      get active() {
        return self.active;
      },
      get id() {
        return self.id;
      },
      get entered() {
        return self.entered;
      },
      get exited() {
        return self.exited;
      },
      get starsBroken() {
        return self.starsBroken;
      },
      get shakes() {
        return self.shakes;
      },
      get skipped() {
        return self.skipped;
      },
      get intro() {
        return self.introLeft > 0;
      },
      get timeScale() {
        return self.timeScale;
      },
      get ring() {
        return self.ring !== null;
      },
      get armed() {
        return self.armed;
      },
      get camWeight() {
        return self.deps.cameraRig.battleWeight;
      },
      get fleeing() {
        return self.life?.fleeing ?? 0;
      },
      get watching() {
        return self.life?.watching ?? 0;
      },
      get shouts() {
        return self.shoutEls.filter((e) => e.t > 0).length;
      },
      /** Glen's look target must stay at the center throughout battle. */
      get glenNdc() {
        const v = self.deps.player.visualPosition.clone();
        v.y += CameraConfig.targetHeight;
        v.project(self.deps.cameraRig.camera);
        return { x: v.x, y: v.y, z: v.z };
      },
      /** The enemy's projected position: NDC x, y and whether it is in front of the camera. */
      get focusNdc() {
        const v = new THREE.Vector3(self.focusPos.x, self.focusPos.y, self.focusPos.z).project(self.deps.cameraRig.camera);
        return { x: v.x, y: v.y, z: v.z };
      },
      get focus() {
        return { x: self.focusPos.x, y: self.focusPos.y, z: self.focusPos.z };
      },
      skip: () => self.skip(),
      starBroken: () => self.starBroken(),
      impact: (x: number, z: number, p = 1) => self.impact(x, z, p),
    };
  }
}
