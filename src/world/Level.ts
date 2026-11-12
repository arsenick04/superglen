import type * as THREE from 'three';
import type { Physics } from '../core/Physics';
import type { SaveStore } from '../core/Save';
import type { Player } from '../player/Player';
import type { PlayerMode } from '../player/PlayerConfig';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { Action, Input } from '../input/Input';
import type { GroundRings } from '../fx/GroundRings';
import type { Interactions } from '../gameplay/Interactions';
import type { Dialog } from '../gameplay/Dialog';
import type { Objectives } from '../gameplay/Objectives';
import type { Sequence } from '../gameplay/Sequence';
import type { StaticProps } from './StaticProps';
import type { Targets } from '../gameplay/Targets';
import type { Projectiles } from '../gameplay/Projectiles';
import type { BillboardRings } from '../fx/BillboardRings';
import type { DizzyStars } from '../fx/DizzyStars';
import type { Sparkles } from './bab1/Fx';
import type { DrumSynth } from '../audio/DrumSynth';

/**
 * A level (story chapter or test area). The LevelManager owns its whole life cycle:
 *
 *   build(ctx)            once, when the level is loaded. Add everything to `ctx.root` / the physics world.
 *   fixedUpdate?(dt)      every 1/60 s step, before the player moves (read input, drive story state).
 *   update(dt)            every rendered frame (visual-only: moving suns, animations).
 *   dispose()             when another level loads. Only clean up what the framework cannot know about
 *                         (DOM you created, your own listeners; you can also use ctx.onDispose).
 *
 * After dispose() the manager removes `ctx.root` (disposing geometries, materials, textures and lights
 * below it), every Rapier body made through Physics/StaticProps (or `physics.track`), cancels all
 * sequences/dialogs/objectives/interactables, resets fog and background, and puts the player on the
 * next spawn. Do not keep timers: use `ctx.seq`.
 */
export interface Level {
  readonly id: string;
  /** Where the player appears: feet position and optional facing yaw (0 = +Z; default faces -Z). */
  readonly spawn: { x: number; y: number; z: number; yaw?: number };
  build(ctx: LevelContext): void;
  update(dt: number): void;
  fixedUpdate?(dt: number): void;
  dispose(): void;
}

/** Level-control functions of the game. */
export interface LevelGame {
  /** Fade out, swap the level, fade in. Resolves when the new level is playing. Ignored while another load runs. */
  loadLevel(id: string): Promise<void>;
  /** Stick and jump ignored while false (camera look still works). Reset to true on every level load. */
  setControlsEnabled(enabled: boolean): void;
  readonly controlsEnabled: boolean;
  /** Switch Glen <-> Superglen (colours, tuning, touch buttons, flash ring). */
  setPlayerMode(mode: PlayerMode): void;
  /** Show the "Berubah" star on touch. Reset to false on every level load. */
  setTransformAllowed(allowed: boolean): void;
  /**
   * Unlock / lock skills at runtime (omitted keys stay as they are). Updates the touch buttons (laser and shield; flying
   * is the jump button held), the PC help card and the skill systems. Every level load starts from `save.data.skills`.
   * `persist: true` also writes the unlocked ones into the save (use `ctx.save.unlockSkill` for story unlocks).
   */
  setSkills(skills: { laser?: boolean; shield?: boolean; fly?: boolean }, persist?: boolean): void;
  /** Older name: touch buttons for laser and shield (same as `setSkills({ laser, shield })`). */
  setSkillButtons(skills: { laser: boolean; shield: boolean }): void;
  /** Pulse a touch button ("press me now"). Cleared on every level load. No effect without touch UI. */
  pulseButton(action: Action, on: boolean): void;
  /** Free-form values a level publishes for the smoke test (`__superglen.levelInfo`). Emptied on every load. */
  readonly debugInfo: Record<string, number | string | boolean>;
  /** Used by the `test` level only: the old full button sets. */
  setLegacyTestControls(on: boolean): void;
}

export interface LevelContext {
  /** The real scene: set `background` / `fog` here (both are reset to null on unload). */
  readonly scene: THREE.Scene;
  /** Add all level meshes and lights here; it is removed and disposed on unload. */
  readonly root: THREE.Group;
  readonly physics: Physics;
  readonly player: Player;
  readonly cameraRig: ThirdPersonCamera;
  readonly input: Input;
  /** Box/cylinder helper bound to `root`. */
  readonly props: StaticProps;
  readonly interactions: Interactions;
  readonly dialog: Dialog;
  readonly objectives: Objectives;
  /** Game-time waits/tweens, cancelled when the level unloads. */
  readonly seq: Sequence;
  readonly fx: {
    readonly rings: GroundRings;
    /** Shared one-draw-call sparkles / confetti (game level, persists across levels). */
    readonly sparkles: Sparkles;
    /** Camera-facing expanding rings (hit flashes). */
    readonly flashes: BillboardRings;
    /** "Pusing berbintang" orbiting stars over a head. */
    readonly stars: DizzyStars;
  };
  /** Laser targets: register enemies and props (cleared on unload). */
  readonly targets: Targets;
  /** Pooled soft projectiles (balls): shield-reflectable, harmless to the player. */
  readonly projectiles: Projectiles;
  readonly save: SaveStore;
  /** The #ui overlay root: add level-specific HUD elements here (remove them in dispose or ctx.onDispose). */
  readonly ui: HTMLElement;
  readonly game: LevelGame;
  /** The drum / cheer / boing synthesizer (no files; silent until the first tap or when muted). */
  readonly synth: DrumSynth;
  /** Register a cleanup that runs when the level unloads (after Level.dispose, in reverse order). */
  onDispose(fn: () => void): void;
}

export type LevelFactory = () => Level;
