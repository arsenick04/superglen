import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Physics, FIXED_DT } from './Physics';
import { Input, type Action, type InputSource, type Vec2 } from '../input/Input';
import { KeyboardMouseSource } from '../input/KeyboardMouseSource';
import { Player } from '../player/Player';
import { ThirdPersonCamera, CameraConfig } from '../camera/ThirdPersonCamera';
import { GroundRings } from '../fx/GroundRings';
import type { PlayerMode } from '../player/PlayerConfig';
import { getLayout, type ControlProfile, type TouchButtonDef } from '../ui/TouchControls';
import { Hud } from '../ui/Hud';
import { DialogBubble } from '../ui/DialogBubble';
import { Fade } from '../ui/Fade';
import { Dialog } from '../gameplay/Dialog';
import { Interactions } from '../gameplay/Interactions';
import { Objectives } from '../gameplay/Objectives';
import { LevelManager } from '../world/LevelManager';
import type { LevelGame } from '../world/Level';
import { DEFAULT_LEVEL, LEVELS } from '../world/levels';
import { SaveStore } from './Save';
import { TouchSource } from '../input/TouchSource';
import { startGate } from './StartGate';
import { touchMode } from './TouchMode';
import { FrameClock } from './FrameClock';
import { ShadowFollower } from './ShadowSnap';
import { PerfOverlay, type PerfStats } from '../ui/PerfOverlay';

/** Max frame delta fed into the accumulator (s): avoids a "spiral of death" after a hitch. */
const MAX_FRAME_DT = 0.1;
/** Max physics steps per rendered frame. Leftover whole steps are dropped (the sub-step phase is kept). */
const MAX_SUBSTEPS = 5;

/** Read-only debug data for automated smoke tests and the browser console. */
export interface DebugHandle {
  fps: number;
  player: { x: number; y: number; z: number };
  grounded: boolean;
  started: boolean;
  touchUi: boolean;
  cameraYaw: number;
  /** Yaw the player steers by (latched while move input is held). */
  steeringYaw: number;
  /** 'glen' | 'superglen' */
  mode: PlayerMode;
  pixelRatio: number;
  airborne: boolean;
  /** Feet height above the ground below (m). */
  airHeight: number;
  feetY: number;
  /** Highest feet Y since the last first-jump takeoff. */
  peakFeetY: number;
  verticalVelocity: number;
  /** Counters since page load. */
  jumps: number;
  doubleJumps: number;
  stomps: number;
  landings: number;
  /** Test helpers: freeze the real-time loop, then step virtual 1/60 s frames deterministically. */
  pause: (on: boolean) => void;
  advance: (frames: number, render?: boolean) => void;
  /**
   * Like `advance`, but lets promise continuations (story scripts awaiting dialog/wait) run between
   * frames, so a script sees every step. Use this when a sequence is running.
   */
  advanceAsync: (frames: number, render?: boolean) => Promise<void>;

  // ---- Level framework ----
  /** Id of the loaded level ('' while none). */
  level: string;
  /** True from the start of a fade-out until the fade-in has finished. */
  loading: boolean;
  controlsEnabled: boolean;
  dialog: { open: boolean; text: string; speaker: string; id: string };
  /** The in-world prompt icon of the nearest interactable. */
  prompt: { visible: boolean; icon: string; inRange: boolean };
  /** The objective marker (x, z = where it points). */
  objective: { active: boolean; offscreen: boolean; arrow: boolean; x: number; z: number };
  /** Values the current level publishes for tests (see LevelGame.debugInfo). */
  levelInfo: Record<string, number | string | boolean>;
  /**
   * Test helper: steer the player to (x, z) through the normal input path (a synthetic stick, not a teleport).
   * `walking` is true until it arrives (within 0.2 m) or `cancelWalk` is called.
   */
  walkTo: (x: number, z: number) => void;
  cancelWalk: () => void;
  walking: boolean;
  /** Test helper: drop the player far below the world, to exercise the safe-spot respawn. */
  testFall: () => void;
  /** Live save store (tests round-trip it). */
  save: SaveStore;
  /** The level-control API levels get (setPlayerMode, setSkillButtons, ...), for tests. */
  game: LevelGame;
  /** Test helpers. */
  loadLevel: (id: string) => Promise<void>;
  setCameraYaw: (yaw: number) => void;
  /** Camera world position (updated every frame). */
  camera: { x: number; y: number; z: number };
  /** Fixed steps run by the most recent frame. */
  lastSteps: number;
  /**
   * Perf-test hooks. `simFrame` runs one complete frame as if requestAnimationFrame had delivered `nowMs`
   * (works while paused; `render` false skips the WebGL draw). `smoothing` switches the dt filter,
   * `resetTiming` forgets the clock, `adaptFrame` feeds the adaptive-resolution logic without drawing.
   */
  simFrame: (nowMs: number, render: boolean) => number;
  smoothing: (on: boolean) => void;
  resetTiming: () => void;
  adaptFrame: (nowMs: number, moving: boolean) => void;
  /** Test helper: put the player on the floor at (x, z). */
  placePlayer: (x: number, z: number) => void;
  /**
   * Fractional shadow-map texel position (0..1, x and y) of a fixed world point, or null without a shadow light.
   * While the player walks this must stay constant (snapped shadow camera); a drifting value = swimming shadows.
   */
  shadowPhase: () => number[] | null;
  /** Switch the shadow-camera texel snapping on/off (test comparison). */
  shadowSnap: (on: boolean) => void;
  /** Test helper: reset the adaptive-resolution logic to full resolution. */
  adaptReset: () => void;
  /** Adaptive resolution state: step index and number of ratio changes so far. */
  adaptive: () => { step: number; changes: number; ratio: number };
  /** Resource counts: geometries/textures from three, colliders/bodies from Rapier. */
  debugCounts: () => {
    geometries: number;
    textures: number;
    colliders: number;
    bodies: number;
    sceneChildren: number;
    calls: number;
    triangles: number;
    programs: number;
  };
}

declare global {
  interface Window {
    __superglen?: DebugHandle;
  }
}

/**
 * Owns all systems and runs the loop:
 *   per frame: input.update -> camera look -> N fixed steps (60 Hz) -> interpolate -> camera -> render
 *   per fixed step: player.fixedUpdate -> physics.step -> player.postStep -> input.endFixedStep
 */
export class Game {
  readonly scene = new THREE.Scene();
  readonly renderer: Renderer;
  readonly physics: Physics;
  readonly input: Input;
  readonly player: Player;
  readonly cameraRig: ThirdPersonCamera;
  readonly rings: GroundRings;
  readonly save: SaveStore;
  readonly dialog: Dialog;
  readonly interactions: Interactions;
  readonly objectives: Objectives;
  readonly levels: LevelManager;
  private readonly touch: TouchSource | null = null;
  private readonly hud: Hud | null = null;
  private readonly walker: WalkSource;
  private paused = false;

  // ---- Controls gating and the touch button profile (see the level context API) ----
  private levelControls = true;
  private fading = false;
  private dialogLocked = false;
  private readonly profile: ControlProfile = { legacyTest: false, transform: false, laser: false, shield: false };
  private currentLayout: readonly TouchButtonDef[] | null = null;
  /** What levels call (LevelContext.game). */
  private readonly api: LevelGame;

  private accumulator = 0;
  private rafId = 0;
  private running = false;
  private readonly clock = new FrameClock();
  private readonly perfPanel: PerfOverlay | null = null;
  private lastSteps = 0;

  private fpsFrames = 0;
  private fpsTime = 0;
  private readonly debug: DebugHandle = { fps: 0, player: { x: 0, y: 0, z: 0 }, grounded: false,
    started: false,
    touchUi: false,
    cameraYaw: 0,
    steeringYaw: 0,
    mode: 'glen',
    pixelRatio: 1,
    airborne: false,
    airHeight: 0,
    feetY: 0,
    peakFeetY: 0,
    verticalVelocity: 0,
    jumps: 0,
    doubleJumps: 0,
    stomps: 0,
    landings: 0,
    pause: (on: boolean) => this.setPaused(on),
    advance: (frames: number, render = true) => this.advance(frames, render),
    advanceAsync: (frames: number, render = true) => this.advanceAsync(frames, render),
    level: '',
    loading: false,
    controlsEnabled: true,
    dialog: { open: false, text: '', speaker: '', id: '' },
    prompt: { visible: false, icon: '', inRange: false },
    objective: { active: false, offscreen: false, arrow: false, x: 0, z: 0 },
    levelInfo: {},
    walkTo: (x: number, z: number) => this.walker.start(x, z),
    cancelWalk: () => this.walker.stop(),
    walking: false,
    testFall: () => {
      const p = this.player.visualPosition;
      this.player.teleport(p.x, -16, p.z);
    },
    save: undefined as unknown as SaveStore,
    game: undefined as unknown as LevelGame,
    loadLevel: (id: string) => this.levels.load(id),
    setCameraYaw: (yaw: number) => this.cameraRig.snapBehind(yaw - Math.PI),
    camera: { x: 0, y: 0, z: 0 },
    lastSteps: 0,
    simFrame: (nowMs: number, render: boolean) => this.simFrame(nowMs, render),
    smoothing: (on: boolean) => {
      this.clock.enabled = on;
    },
    resetTiming: () => {
      this.clock.reset();
      this.accumulator = 0;
    },
    adaptFrame: (nowMs: number, moving: boolean) => this.renderer.observeFrame(nowMs, moving),
    placePlayer: (x: number, z: number) => this.player.placeAt(x, 0, z),
    shadowPhase: () => this.shadowPhase(),
    shadowSnap: (on: boolean) => {
      ShadowFollower.snapEnabled = on;
    },
    adaptReset: () => this.renderer.resetAdaptive(),
    adaptive: () => ({ step: this.renderer.step, changes: this.renderer.ratioChanges, ratio: this.renderer.pixelRatio }),
    debugCounts: () => {
      const m = this.renderer.renderer.info.memory;
      return {
        geometries: m.geometries,
        textures: m.textures,
        colliders: this.physics.colliderCount,
        bodies: this.physics.bodyCount,
        sceneChildren: this.scene.children.length,
        calls: this.renderer.renderer.info.render.calls,
        triangles: this.renderer.renderer.info.render.triangles,
        programs: this.renderer.renderer.info.programs?.length ?? 0,
      };
    },
  };

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.physics = new Physics();

    this.input = new Input();
    this.input.addSource(new KeyboardMouseSource(this.renderer.canvas, CameraConfig.mouseSensitivity));
    const ui = document.getElementById('ui');
    if (ui) {
      this.touch = new TouchSource(ui, () => touchMode.active);
      this.input.addSource(this.touch);
    }

    this.walker = new WalkSource(
      () => this.player.visualPosition,
      () => this.cameraRig.steeringYaw,
    );
    this.input.addSource(this.walker);
    this.save = new SaveStore();
    this.debug.save = this.save;

    this.player = new Player(this.physics, this.input, this.scene);
    this.rings = new GroundRings(this.scene);
    this.player.onStomp((e) => {
      this.rings.spawn(e.x, e.y, e.z, e.radius, 0.4, 0xffc400);
      this.cameraRig.bump();
    });
    this.cameraRig = new ThirdPersonCamera(this.physics, this.input, this.player.collider);
    this.renderer.attachCamera(this.cameraRig.camera);

    const uiRoot = ui ?? document.body;
    if (ui) this.hud = new Hud(ui, this.renderer.canvas);
    if (new URLSearchParams(window.location.search).get('perf') === '1') {
      this.perfPanel = new PerfOverlay(uiRoot, (out) => this.collectPerfStats(out));
    }

    const bubble = new DialogBubble(uiRoot, () => this.dialog.tap());
    bubble.faceFor = (sp) => (sp === 'glen' && this.player.mode === 'superglen' ? 'superglen' : sp);
    this.dialog = new Dialog(
      bubble,
      this.input,
      (locked) => {
        this.dialogLocked = locked;
        this.updateControls();
      },
    );
    this.interactions = new Interactions(
      uiRoot,
      this.player,
      this.input,
      this.dialog,
      this.cameraRig.camera,
      () => this.levelControls && !this.fading,
    );
    this.interactions.onNearChange((near) => this.touch?.controls.setPulse('interact', near));
    this.objectives = new Objectives(this.scene, uiRoot, this.cameraRig.camera, this.player);
    const fade = new Fade(uiRoot);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.api = {
      loadLevel: (id) => this.levels.load(id),
      pulseButton: (action, on) => this.touch?.controls.setPulse(action, on),
      debugInfo: this.debug.levelInfo,
      setControlsEnabled: (on) => {
        this.levelControls = on;
        this.updateControls();
      },
      get controlsEnabled() {
        return self.controlsEnabled;
      },
      setPlayerMode: (mode) => this.setPlayerMode(mode),
      setTransformAllowed: (on) => {
        this.profile.transform = on;
        this.applyLayout();
      },
      setSkillButtons: (sk) => {
        this.profile.laser = sk.laser;
        this.profile.shield = sk.shield;
        this.applyLayout();
      },
      setLegacyTestControls: (on) => {
        this.profile.legacyTest = on;
        this.applyLayout();
      },
    };
    this.debug.game = this.api;
    this.levels = new LevelManager(this.scene, {
      shared: {
        scene: this.scene,
        physics: this.physics,
        player: this.player,
        cameraRig: this.cameraRig,
        input: this.input,
        interactions: this.interactions,
        dialog: this.dialog,
        objectives: this.objectives,
        fx: { rings: this.rings },
        save: this.save,
        ui: uiRoot,
        game: this.api,
      },
      player: this.player,
      cameraRig: this.cameraRig,
      physics: this.physics,
      rings: this.rings,
      dialog: this.dialog,
      interactions: this.interactions,
      objectives: this.objectives,
      fade,
      onBeforeBuild: () => {
        this.levelControls = true;
        this.profile.legacyTest = false;
        this.profile.transform = false;
        this.profile.laser = false;
        this.profile.shield = false;
        for (const a of ['jump', 'laser', 'shield', 'transform'] as const) this.touch?.controls.setPulse(a, false);
        for (const k of Object.keys(this.debug.levelInfo)) delete this.debug.levelInfo[k];
        this.player.setMode('glen');
        this.updateControls();
        this.applyLayout();
      },
      onLoadingChange: (loading) => {
        this.fading = loading;
        this.updateControls();
      },
      onAfterBuild: () => {
        this.hud?.setStoryHelp(this.levels.currentId !== 'test');
        this.applyLayout();
        this.syncDebug();
        this.renderer.prewarm(this.scene, this.cameraRig.camera);
      },
    });
    for (const [id, factory] of Object.entries(LEVELS)) this.levels.register(id, factory);
    const wanted = new URLSearchParams(window.location.search).get('level');
    this.levels.loadInstant(wanted && this.levels.has(wanted) ? wanted : DEFAULT_LEVEL);

    // Live getters (a load finishes in real time even while the loop is paused for tests).
    Object.defineProperties(this.debug, {
      level: { get: () => this.levels.currentId, enumerable: true },
      loading: { get: () => this.levels.loading, enumerable: true },
      controlsEnabled: { get: () => this.controlsEnabled, enumerable: true },
    });
    window.__superglen = this.debug;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.reset();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    if (this.paused) return;
    const panel = this.perfPanel;
    const t0 = panel ? performance.now() : 0;
    const steps = this.runFrame(now, true);
    if (panel) panel.frame(now, performance.now() - t0, steps);
  };

  /** Tests: one whole frame at a made-up timestamp, even while the real loop is paused. */
  private simFrame(nowMs: number, render: boolean): number {
    const steps = this.runFrame(nowMs, render);
    this.syncDebug();
    return steps;
  }

  /**
   * One rendered frame: input -> camera look -> fixed 60 Hz steps (exact accumulator) -> interpolate -> camera ->
   * level -> render. `now` = rAF timestamp in ms. Returns the number of fixed steps that ran.
   */
  private runFrame(now: number, render: boolean): number {
    const dt = Math.min(this.clock.tick(now), MAX_FRAME_DT);

    this.input.update();
    this.cameraRig.handleInput();

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.fixedStep(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    // Too far behind (a long hitch): drop the whole steps we cannot catch up, keep the sub-step phase so the
    // interpolation does not jump.
    if (this.accumulator >= FIXED_DT) this.accumulator %= FIXED_DT;

    const alpha = this.accumulator / FIXED_DT;
    this.player.updateVisual(alpha, dt);
    this.cameraRig.update(dt, this.player.visualPosition, this.player);
    this.rings.update(dt);
    this.frameUpdate(dt);

    if (render) this.renderer.render(this.scene, this.cameraRig.camera, now, this.playerMoving());
    this.lastSteps = steps;
    this.updateDebug(dt);
    return steps;
  }

  private shadowPhase(): number[] | null {
    let light: THREE.DirectionalLight | null = null;
    this.scene.traverse((o) => {
      const d = o as THREE.DirectionalLight;
      if (d.isDirectionalLight && d.castShadow) light = d;
    });
    if (!light) return null;
    const l = light as THREE.DirectionalLight;
    l.updateMatrixWorld();
    l.target.updateMatrixWorld();
    l.shadow.updateMatrices(l);
    const cam = l.shadow.camera;
    const v = new THREE.Vector3(3.3, 0.2, -7.7).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
    const size = l.shadow.mapSize.x;
    const f = (n: number): number => n - Math.floor(n);
    return [f((v.x * 0.5 + 0.5) * size), f((v.y * 0.5 + 0.5) * size)];
  }

  private playerMoving(): boolean {
    const v = this.player.velocity;
    return v.x * v.x + v.z * v.z > 0.25;
  }

  private collectPerfStats(out: PerfStats): void {
    const info = this.renderer.renderer.info;
    out.pixelRatio = this.renderer.pixelRatio;
    out.ratioChanges = this.renderer.ratioChanges;
    out.calls = info.render.calls;
    out.triangles = info.render.triangles;
    out.programs = info.programs ? info.programs.length : 0;
  }

  /** Per rendered frame, after the camera moved: level visuals, prompt icon and objective marker. */
  private frameUpdate(dt: number): void {
    this.cameraRig.camera.updateMatrixWorld(); // projections below must use this frame's camera, not last render's
    this.levels.update(dt);
    this.interactions.update();
    this.objectives.update(dt);
  }

  private fixedStep(dt: number): void {
    this.levels.fixedUpdate(dt); // sequences first, then the level (e.g. the test area's mode toggle)
    this.dialog.fixedUpdate(dt);
    this.interactions.fixedUpdate();
    this.objectives.fixedUpdate();
    this.player.fixedUpdate(dt, this.cameraRig.steeringYaw);
    this.physics.step();
    this.player.postStep();
    this.input.endFixedStep();
  }

  /** Glen <-> Superglen: player look/tuning, touch buttons and a quick golden flash ring. */
  private setPlayerMode(mode: PlayerMode): void {
    const changed = mode !== this.player.mode;
    this.player.setMode(mode);
    this.save.setLastMode(mode);
    this.applyLayout();
    if (changed) {
      const f = this.player.getFeetPosition(this.feet);
      this.rings.spawn(f.x, f.y, f.z, 1.6, 0.35, 0xfff2a8, 1);
    }
  }

  /** Swap the touch button set when mode or profile changed (cached arrays: identity compare). */
  private applyLayout(): void {
    const defs = getLayout(this.player.mode, this.profile);
    if (defs === this.currentLayout) return;
    this.currentLayout = defs;
    this.touch?.setLayout(defs);
  }

  /** Controls are live unless a level, a fade or a locked dialog says otherwise. */
  get controlsEnabled(): boolean {
    return this.levelControls && !this.fading && !this.dialogLocked;
  }

  private updateControls(): void {
    this.player.inputEnabled = this.controlsEnabled;
  }

  private readonly feet = new THREE.Vector3();

  private setPaused(on: boolean): void {
    this.paused = on;
    if (!on) {
      this.accumulator = 0;
      this.clock.reset();
    }
  }

  /** Test helper: run `frames` virtual frames of exactly one fixed step each, then render once (unless `render` is false). */
  private advance(frames: number, render: boolean): void {
    for (let i = 0; i < frames; i++) {
      this.input.update();
      this.cameraRig.handleInput();
      this.fixedStep(FIXED_DT);
      this.player.updateVisual(1, FIXED_DT);
      this.cameraRig.update(FIXED_DT, this.player.visualPosition, this.player);
      this.rings.update(FIXED_DT);
    }
    this.frameUpdate(frames * FIXED_DT);
    if (render) this.renderer.renderer.render(this.scene, this.cameraRig.camera);
    this.syncDebug();
  }

  /** Test helper: `advance` one frame at a time, flushing promise continuations in between. */
  private async advanceAsync(frames: number, render: boolean): Promise<void> {
    for (let i = 0; i < frames; i++) {
      this.advance(1, false);
      for (let k = 0; k < 8; k++) await Promise.resolve();
    }
    if (render) this.renderer.renderer.render(this.scene, this.cameraRig.camera);
    this.syncDebug();
  }

  private updateDebug(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.debug.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.hud?.setFps(this.debug.fps);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.syncDebug();
  }

  private syncDebug(): void {
    const p = this.player.visualPosition;
    this.debug.player.x = p.x;
    this.debug.player.y = p.y;
    this.debug.player.z = p.z;
    this.debug.grounded = this.player.grounded;
    this.debug.started = startGate.started;
    this.debug.touchUi = touchMode.active;
    const cp = this.cameraRig.camera.position;
    this.debug.camera.x = cp.x;
    this.debug.camera.y = cp.y;
    this.debug.camera.z = cp.z;
    this.debug.lastSteps = this.lastSteps;
    this.debug.cameraYaw = this.cameraRig.yaw;
    this.debug.steeringYaw = this.cameraRig.steeringYaw;
    const pl = this.player;
    this.debug.mode = pl.mode;
    this.debug.pixelRatio = this.renderer.pixelRatio;
    this.debug.airborne = !pl.grounded;
    this.debug.airHeight = pl.airHeight;
    this.debug.feetY = p.y - 0.55;
    this.debug.peakFeetY = pl.peakFeetY;
    this.debug.verticalVelocity = pl.verticalVelocity;
    this.debug.jumps = pl.jumps;
    this.debug.doubleJumps = pl.doubleJumps;
    this.debug.stomps = pl.stomps;
    this.debug.landings = pl.landings;

    const d = this.debug;
    const line = this.dialog.currentLine;
    d.dialog.open = line !== null;
    d.dialog.text = line ? line.text : '';
    d.dialog.speaker = line ? line.speaker : '';
    d.dialog.id = line && line.id ? line.id : '';
    d.prompt.visible = this.interactions.promptVisible;
    d.prompt.icon = this.interactions.promptIcon;
    d.prompt.inRange = this.interactions.inRange;
    d.objective.active = this.objectives.active;
    d.objective.offscreen = this.objectives.offscreen;
    d.objective.arrow = this.objectives.edgeArrowVisible;
    d.objective.x = this.objectives.position.x;
    d.objective.z = this.objectives.position.z;
    d.walking = this.walker.walking;
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      this.stop();
      this.input.reset();
    } else {
      this.start();
    }
  };
}

/**
 * Test-only input source: a synthetic stick that walks the player to a point. It is merged by Input like
 * the keyboard and the touch stick, so the player code path is exactly the real one. Idle (zero move) unless started.
 */
class WalkSource implements InputSource {
  readonly move: Vec2 = { x: 0, y: 0 };
  walking = false;
  private tx = 0;
  private tz = 0;

  constructor(
    private readonly pos: () => THREE.Vector3,
    private readonly yaw: () => number,
  ) {}

  start(x: number, z: number): void {
    this.tx = x;
    this.tz = z;
    this.walking = true;
  }

  stop(): void {
    this.walking = false;
    this.move.x = 0;
    this.move.y = 0;
  }

  update(): void {
    if (!this.walking) return;
    const p = this.pos();
    const dx = this.tx - p.x;
    const dz = this.tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      this.stop();
      return;
    }
    // Inverse of the player's mapping: world wish direction -> stick (see Player.fixedUpdate).
    const wx = dx / d;
    const wz = dz / d;
    const y = this.yaw();
    const mag = Math.min(1, 0.35 + d * 0.5);
    this.move.x = (wx * Math.cos(y) - wz * Math.sin(y)) * mag;
    this.move.y = (-wx * Math.sin(y) - wz * Math.cos(y)) * mag;
  }

  drainLook(): void {}
  isDown(_a: Action): boolean {
    return false;
  }
  drainPressed(_a: Action): boolean {
    return false;
  }
  reset(): void {
    this.stop();
  }
  dispose(): void {}
}
