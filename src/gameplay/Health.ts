import * as THREE from 'three';
import { Combat } from '../config/combat';
import type { SaveStore } from '../core/Save';
import type { Player } from '../player/Player';
import type { DizzyStars } from '../fx/DizzyStars';
import type { Sparkles } from '../world/bab1/Fx';
import type { DrumSynth } from '../audio/DrumSynth';
import type { Sfx } from '../audio/Sfx';

export type HurtResult = 'hit' | 'blocked' | 'ignored';

export const HEART =
  '<svg viewBox="0 0 32 30" aria-hidden="true"><path d="M16 28C5 20 2 14 2 9.5 2 5 5.5 2 9.5 2 12.4 2 14.9 3.6 16 6 17.1 3.6 19.6 2 22.5 2 26.5 2 30 5 30 9.5 30 14 27 20 16 28Z" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>';

/**
 * Glen's energy: 5 hearts shown at the top of the screen (a hit costs one: stars, "boing", a small push, 1.5 s of being safe
 * while he blinks). The shield blocks. At zero he is only tired ("kelelahan"): `onExhausted` runs (the Game fades and rests him
 * at the Rumah Sakit with full hearts; nothing is lost). Hearts are saved. Owned by the Game, shared with the levels.
 */
export class Health {
  /** Where the Rumah Sakit rest spot is (set by the city level). Null elsewhere. */
  hospital: { x: number; z: number; yaw: number } | null = null;
  /** Set by the Game: the soft fade, the rest and Nino's words. */
  onExhausted: (() => void) | null = null;
  /** Counters for the tests. */
  hits = 0;
  blocks = 0;
  exhaustions = 0;
  private invuln = 0;
  private exhaustTimer = -1;
  private blinkHidden = false;
  private readonly root: HTMLDivElement;
  private readonly icons: HTMLElement[] = [];
  private shown = false;
  private readonly at = new THREE.Vector3();

  constructor(
    ui: HTMLElement,
    private readonly save: SaveStore,
    private readonly player: Player,
    private readonly fx: { stars: DizzyStars; sparkles: Sparkles },
    private readonly synth: DrumSynth,
    private readonly sfx: Sfx,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hearts';
    this.root.hidden = true;
    for (let i = 0; i < Combat.hearts.max; i++) {
      const h = document.createElement('span');
      h.className = 'heart';
      h.innerHTML = HEART;
      this.root.appendChild(h);
      this.icons.push(h);
    }
    ui.appendChild(this.root);
    this.paint();
  }

  get hearts(): number {
    return this.save.data.hearts;
  }

  get max(): number {
    return Combat.hearts.max;
  }

  get isInvulnerable(): boolean {
    return this.invuln > 0;
  }

  get resting(): boolean {
    return this.exhaustTimer >= 0;
  }

  /** The hearts are drawn (the city after Chapter 1). */
  setShown(on: boolean): void {
    this.shown = on;
    this.root.hidden = !on;
  }

  get visible(): boolean {
    return this.shown;
  }

  /**
   * Something bumps Glen. Shield up and the thing coming from the front: blocked (nothing lost). Safe moments after a hit: ignored.
   * Otherwise one heart goes.
   */
  hurt(srcX: number, srcZ: number): HurtResult {
    if (this.invuln > 0 || this.exhaustTimer >= 0) return 'ignored';
    const p = this.player.position;
    const dx = srcX - p.x;
    const dz = srcZ - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const sh = this.player.skills;
    if (sh.shield.up) {
      const fy = this.player.facing;
      const cos = (dx * Math.sin(fy) + dz * Math.cos(fy)) / d;
      if (cos > Math.cos((Combat.hurt.shieldArcDeg * Math.PI) / 180)) {
        this.blocks++;
        this.invuln = Combat.hurt.blockGrace;
        sh.stats.shieldBlocks++;
        const x = p.x + (dx / d) * 1.1;
        const z = p.z + (dz / d) * 1.1;
        this.fx.sparkles.burst(x, p.y, z, 12, 3, 0xffd23f, { up: 0.3, life: 0.6, gravity: 1.5 });
        this.sfx.pop();
        sh.emit('shieldBlock', { x, y: p.y, z });
        return 'blocked';
      }
    }
    this.hits++;
    const left = this.hearts - 1;
    this.invuln = Combat.hurt.invuln;
    this.player.knock(-dx, -dz, Combat.hurt.knockSpeed, Combat.hurt.knockTime);
    this.fx.stars.show(this.player.visualPosition, 0.85, 1.3);
    this.fx.sparkles.burst(p.x, p.y, p.z, 10, 2.6, 0xffe14d, { up: 0.5, life: 0.6, gravity: 3 });
    this.synth.boing();
    this.sfx.pop();
    this.icons[Math.max(0, Math.min(this.icons.length - 1, this.hearts - 1))]?.classList.add('lost');
    if (left <= 0) {
      this.save.data.hearts = 0; // in memory only until the rest refills it (0 is never written)
      this.exhaustTimer = Combat.hurt.exhaustDelay;
    } else {
      this.save.setHearts(left);
    }
    this.paint();
    return 'hit';
  }

  /** Give hearts back (food, hospital). Returns how many were really added. */
  heal(n: number): number {
    const before = this.hearts;
    this.save.setHearts(Math.min(this.max, before + n));
    this.paint();
    return this.hearts - before;
  }

  fill(): void {
    this.exhaustTimer = -1;
    this.invuln = 0;
    this.save.data.hearts = this.max;
    this.save.persist();
    this.paint();
  }

  /** Fixed step. */
  fixedUpdate(dt: number): void {
    if (this.invuln > 0) {
      this.invuln = Math.max(0, this.invuln - dt);
      // Blinking while safe after a real hit.
      const hide = this.invuln > 0.2 && Math.floor(this.invuln * 10) % 2 === 0 && this.exhaustTimer < 0 && this.invuln > Combat.hurt.blockGrace;
      if (hide !== this.blinkHidden) {
        this.blinkHidden = hide;
        this.player.object.visible = !hide;
      }
    } else if (this.blinkHidden) {
      this.blinkHidden = false;
      this.player.object.visible = true;
    }
    if (this.exhaustTimer >= 0) {
      this.exhaustTimer -= dt;
      if (this.exhaustTimer < 0) {
        this.exhaustions++;
        this.exhaustTimer = Number.POSITIVE_INFINITY; // waits for fill()
        this.onExhausted?.();
      }
    }
  }

  /** A point just above Glen's head (stars, hearts that fly up). */
  head(): THREE.Vector3 {
    const v = this.player.visualPosition;
    return this.at.set(v.x, v.y + 0.9, v.z);
  }

  private paint(): void {
    const n = this.hearts;
    this.icons.forEach((h, i) => {
      const full = i < n;
      h.classList.toggle('full', full);
      if (full) h.classList.remove('lost');
      h.firstElementChild?.setAttribute('fill', full ? '#ff4d6d' : 'rgba(40,50,80,0.35)');
    });
    this.root.setAttribute('aria-label', `${n} hati`);
    this.root.dataset.hearts = String(n);
  }

  debugHandle(): Record<string, unknown> {
    const self = this;
    return {
      get hearts() {
        return self.hearts;
      },
      get invulnerable() {
        return self.isInvulnerable;
      },
      get visible() {
        return self.shown && !self.root.hidden;
      },
      get hits() {
        return self.hits;
      },
      get blocks() {
        return self.blocks;
      },
      get exhaustions() {
        return self.exhaustions;
      },
      get resting() {
        return self.resting;
      },
      get rect() {
        const r = self.root.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      },
      hurt: (x: number, z: number) => self.hurt(x, z),
      face: (yaw: number) => self.player.turnTo(yaw),
      heal: (n: number) => self.heal(n),
      fill: () => self.fill(),
      setHearts: (n: number) => {
        self.save.setHearts(n);
        self.paint();
      },
    };
  }
}
