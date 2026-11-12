import * as THREE from 'three';
import type { Physics } from '../core/Physics';
import type { Player } from '../player/Player';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { GroundRings } from '../fx/GroundRings';
import type { Dialog } from '../gameplay/Dialog';
import type { Interactions } from '../gameplay/Interactions';
import type { Objectives } from '../gameplay/Objectives';
import { Sequence } from '../gameplay/Sequence';
import type { Fade } from '../ui/Fade';
import type { Level, LevelContext, LevelFactory } from './Level';
import { StaticProps } from './StaticProps';
import { perfMark, PerfMark } from '../core/PerfMarks';

/** Everything a level context shares with the game (the per-level parts are created here). */
export type SharedContext = Omit<LevelContext, 'root' | 'props' | 'seq' | 'onDispose'>;

export interface LevelManagerDeps {
  shared: SharedContext;
  player: Player;
  cameraRig: ThirdPersonCamera;
  physics: Physics;
  rings: GroundRings;
  dialog: Dialog;
  interactions: Interactions;
  objectives: Objectives;
  fade: Fade;
  /** Before a level is built: reset controls, mode, flags. */
  onBeforeBuild(): void;
  /** Controls are blocked (true) while a load is in progress. */
  onLoadingChange(loading: boolean): void;
  /** After the level is built and the player placed (before the fade-in). */
  onAfterBuild(): void;
}

function disposeMaterial(m: THREE.Material): void {
  for (const v of Object.values(m)) {
    if (v instanceof THREE.Texture) v.dispose();
  }
  m.dispose();
}

/** Dispose geometries, materials, textures and lights of everything below `root`, then detach it. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
    const light = o as THREE.Light;
    if (light.isLight) light.dispose?.();
  });
  root.removeFromParent();
}

/**
 * Registry + life cycle of levels: load (with fade), full unload, spawn placement.
 * See world/Level.ts for the contract a level follows.
 */
export class LevelManager {
  private readonly factories = new Map<string, LevelFactory>();
  private level: Level | null = null;
  private root: THREE.Group | null = null;
  private props: StaticProps | null = null;
  private seq: Sequence | null = null;
  private cleanups: (() => void)[] = [];
  private loadingPromise: Promise<void> | null = null;
  private _loading = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly deps: LevelManagerDeps,
  ) {}

  register(id: string, factory: LevelFactory): void {
    this.factories.set(id, factory);
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  get currentId(): string {
    return this.level ? this.level.id : '';
  }

  get current(): Level | null {
    return this.level;
  }

  get loading(): boolean {
    return this._loading;
  }

  /** Swap levels immediately (first load). */
  loadInstant(id: string): void {
    this.swap(id);
  }

  /**
   * Fade out, swap, fade in. A request made while another load runs is ignored (returns the running one).
   * Unknown ids are ignored with a warning.
   */
  load(id: string): Promise<void> {
    if (this.loadingPromise) return this.loadingPromise;
    if (!this.factories.has(id)) {
      console.warn(`LevelManager: unknown level "${id}"`);
      return Promise.resolve();
    }
    this._loading = true;
    this.deps.onLoadingChange(true);
    this.loadingPromise = (async () => {
      try {
        await this.deps.fade.out();
        this.swap(id);
        await this.deps.fade.in();
      } finally {
        this._loading = false;
        this.loadingPromise = null;
        this.deps.onLoadingChange(false);
      }
    })();
    return this.loadingPromise;
  }

  fixedUpdate(dt: number): void {
    if (!this.level) return;
    this.seq?.update(dt);
    this.level.fixedUpdate?.(dt);
  }

  update(dt: number): void {
    this.level?.update(dt);
  }

  // ---------------------------------------------------------------------------------------------

  private swap(id: string): void {
    const factory = this.factories.get(id);
    if (!factory) {
      console.warn(`LevelManager: unknown level "${id}"`);
      return;
    }
    perfMark(PerfMark.LOAD);
    this.unload();
    const d = this.deps;
    d.onBeforeBuild();

    const level = factory();
    const root = new THREE.Group();
    root.name = `level:${id}`;
    this.scene.add(root);
    const props = new StaticProps(root, d.physics);
    const seq = new Sequence();
    const cleanups: (() => void)[] = [];
    const ctx: LevelContext = {
      ...d.shared,
      root,
      props,
      seq,
      onDispose: (fn) => cleanups.push(fn),
    };
    this.level = level;
    this.root = root;
    this.props = props;
    this.seq = seq;
    this.cleanups = cleanups;
    level.build(ctx);
    d.physics.refreshQueries();

    // Player on the spawn: grounded start, zero velocity, new safe point, camera snapped behind.
    const sp = level.spawn;
    const yaw = sp.yaw ?? Math.PI;
    d.player.placeAt(sp.x, sp.y, sp.z, yaw);
    d.cameraRig.snapBehind(yaw);
    d.cameraRig.update(0, d.player.visualPosition, d.player);
    level.update(0);
    d.onAfterBuild();
  }

  private unload(): void {
    const d = this.deps;
    if (this.level) {
      try {
        this.level.dispose();
      } catch (err) {
        console.error('Level dispose failed:', err);
      }
    }
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        this.cleanups[i]();
      } catch (err) {
        console.error('Level cleanup failed:', err);
      }
    }
    this.cleanups = [];
    this.seq?.cancelAll();
    d.dialog.cancelAll();
    d.interactions.clear();
    d.objectives.clear();
    d.rings.clear();
    this.props?.dispose();
    if (this.root) disposeTree(this.root);
    d.physics.disposeLevelBodies();
    this.scene.background = null;
    this.scene.fog = null;
    this.level = null;
    this.root = null;
    this.props = null;
    this.seq = null;
  }
}
