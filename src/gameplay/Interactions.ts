import * as THREE from 'three';
import type { Input } from '../input/Input';
import type { Player } from '../player/Player';
import type { Dialog } from './Dialog';
import { PromptIcon, type PromptKind } from '../ui/PromptIcon';

/**
 * Things the player can talk to / take / press, plus invisible auto-trigger zones.
 *
 *   const npc = ctx.interactions.add({
 *     position: () => npcMesh.position,   // or a fixed Vector3
 *     radius: 2.2,
 *     icon: 'talk',                       // 'talk' | 'hand' | 'press'
 *     onInteract: () => ctx.dialog.say('bab1_nino_halo'),
 *   });
 *   npc.enabled = false;                  // hide the prompt for a while
 *   npc.remove();
 *
 *   ctx.interactions.addZone({ shape: 'box', center: new Vector3(0, 0, -8), half: new Vector3(3, 2, 3),
 *     onEnter: () => ..., once: true });
 *   ctx.interactions.addZone({ shape: 'sphere', center, radius: 4, onEnter, onExit, once: false });
 *
 * Each fixed step the nearest enabled interactable within `radius` (horizontal; the player must also be
 * within 2.5 m in height) is "in range": its prompt icon floats above it, the touch Bicara/Ambil button
 * pulses and the `interact` action triggers it. Aiming is not needed. Interactables and zones are all
 * removed automatically when the level unloads.
 */

export interface InteractableDef {
  /** World position (a function is re-read every step, for things that move). */
  position: THREE.Vector3 | (() => THREE.Vector3);
  /** Horizontal reach in metres. */
  radius: number;
  icon?: PromptKind;
  /** Initial state (default true). Change later with `handle.enabled`. A function is re-evaluated every step. */
  enabled?: boolean | (() => boolean);
  onInteract: () => void;
  /** Disable it after the first use. */
  once?: boolean;
  /** Height of the prompt above `position` in metres (default 1.7). */
  promptHeight?: number;
}

export interface Interactable {
  enabled: boolean;
  remove(): void;
}

export interface ZoneDef {
  center: THREE.Vector3;
  /** Called on the step the player's position enters the region. */
  onEnter: () => void;
  onExit?: () => void;
  /** Fire onEnter only the first time. Default false (fires on every new entry). */
  once?: boolean;
  /** Box (axis aligned): half extents. Sphere: radius. */
  shape: 'box' | 'sphere';
  half?: THREE.Vector3;
  radius?: number;
}

export interface ZoneHandle {
  remove(): void;
}

interface Entry {
  def: InteractableDef;
  handle: Interactable;
  fn: (() => boolean) | null;
  removed: boolean;
}

interface ZoneEntry {
  def: ZoneDef;
  inside: boolean;
  fired: boolean;
  removed: boolean;
}

/** Vertical reach: the player's capsule centre must be within this of the interactable's position. */
const VERTICAL_REACH = 2.5;

export class Interactions {
  private readonly entries: Entry[] = [];
  private readonly zones: ZoneEntry[] = [];
  private readonly prompt: PromptIcon;
  private nearest: Entry | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly ndc = new THREE.Vector3();
  private changeCb: ((near: boolean) => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly player: Player,
    private readonly input: Input,
    private readonly dialog: Dialog,
    private readonly camera: THREE.PerspectiveCamera,
    /** Extra gate (controls disabled by a fade etc.). */
    private readonly canInteract: () => boolean,
  ) {
    this.prompt = new PromptIcon(root);
  }

  /** The game uses this to pulse the touch interact button. */
  onNearChange(cb: (near: boolean) => void): void {
    this.changeCb = cb;
  }

  /** True while an interactable is in range and could be triggered. */
  get inRange(): boolean {
    return this.nearest !== null;
  }

  get promptVisible(): boolean {
    return this.prompt.visible;
  }

  get promptIcon(): string {
    return this.prompt.icon;
  }

  /** Screen position of the prompt (for tests). */
  get promptElement(): HTMLElement {
    return this.prompt.element;
  }

  add(def: InteractableDef): Interactable {
    const isFn = typeof def.enabled === 'function';
    const entry: Entry = {
      def,
      fn: isFn ? (def.enabled as () => boolean) : null,
      removed: false,
      handle: {
        enabled: isFn ? true : def.enabled !== false,
        remove: () => {
          entry.removed = true;
        },
      },
    };
    this.entries.push(entry);
    return entry.handle;
  }

  addZone(def: ZoneDef): ZoneHandle {
    const z: ZoneEntry = { def, inside: false, fired: false, removed: false };
    this.zones.push(z);
    return {
      remove: () => {
        z.removed = true;
      },
    };
  }

  /** Remove everything (level unload). */
  clear(): void {
    this.entries.length = 0;
    this.zones.length = 0;
    this.setNearest(null);
    this.prompt.hide();
  }

  /** Once per fixed step, after Dialog.fixedUpdate. */
  fixedUpdate(): void {
    const p = this.player.visualPosition;
    const blocked = !this.canInteract() || this.dialog.active;

    // ---- Zones (also run while a dialog shows: story beats keep flowing) ----
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.removed) {
        this.zones.splice(i, 1);
        continue;
      }
      const inside = this.insideZone(z.def, p);
      if (inside && !z.inside) {
        z.inside = true;
        if (!(z.def.once && z.fired)) {
          z.fired = true;
          this.safely(z.def.onEnter);
          if (z.def.once) z.removed = true;
        }
      } else if (!inside && z.inside) {
        z.inside = false;
        if (z.def.onExit) this.safely(z.def.onExit);
      }
    }

    // ---- Interactables ----
    let best: Entry | null = null;
    let bestD = Infinity;
    if (!blocked) {
      for (let i = this.entries.length - 1; i >= 0; i--) {
        const e = this.entries[i];
        if (e.removed) {
          this.entries.splice(i, 1);
          continue;
        }
        if (!e.handle.enabled || (e.fn && !e.fn())) continue;
        const pos = this.positionOf(e.def);
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > e.def.radius || Math.abs(pos.y - p.y) > VERTICAL_REACH) continue;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
    this.setNearest(best);

    if (best && !this.dialog.pressConsumed && this.input.wasPressed('interact')) {
      const entry = best;
      if (entry.def.once) {
        entry.handle.enabled = false;
        entry.removed = true;
        this.setNearest(null);
      }
      this.safely(entry.def.onInteract);
    }
  }

  /** Once per rendered frame, after the camera moved: places the prompt icon on screen. */
  update(): void {
    const e = this.nearest;
    if (!e) {
      this.prompt.hide();
      return;
    }
    const pos = this.positionOf(e.def);
    this.tmp.set(pos.x, pos.y + (e.def.promptHeight ?? 1.7), pos.z);
    const cam = this.camera;
    // Camera space first: z > 0 means behind the camera.
    this.ndc.copy(this.tmp).applyMatrix4(cam.matrixWorldInverse);
    if (this.ndc.z > -0.1) {
      this.prompt.hide();
      return;
    }
    this.ndc.applyMatrix4(cam.projectionMatrix);
    const x = (this.ndc.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.ndc.y * 0.5 + 0.5) * window.innerHeight;
    const m = 50;
    if (x < m || x > window.innerWidth - m || y < m || y > window.innerHeight - m) {
      this.prompt.hide();
      return;
    }
    this.prompt.setIcon(e.def.icon ?? 'talk');
    this.prompt.showAt(x, y);
  }

  private positionOf(def: InteractableDef): THREE.Vector3 {
    return typeof def.position === 'function' ? def.position() : def.position;
  }

  private setNearest(e: Entry | null): void {
    if (e === this.nearest) return;
    const was = this.nearest !== null;
    this.nearest = e;
    if (e) this.prompt.setIcon(e.def.icon ?? 'talk');
    if ((e !== null) !== was) this.changeCb?.(e !== null);
  }

  private insideZone(z: ZoneDef, p: THREE.Vector3): boolean {
    const dx = p.x - z.center.x;
    const dy = p.y - z.center.y;
    const dz = p.z - z.center.z;
    if (z.shape === 'box') {
      const h = z.half;
      return h !== undefined && Math.abs(dx) <= h.x && Math.abs(dy) <= h.y && Math.abs(dz) <= h.z;
    }
    const r = z.radius ?? 1;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error('Interaction callback failed:', err);
    }
  }
}
