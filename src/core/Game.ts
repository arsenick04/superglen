import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Physics, FIXED_DT } from './Physics';
import { Input, type Action, type InputSource, type Vec2 } from '../input/Input';
import { KeyboardMouseSource } from '../input/KeyboardMouseSource';
import { Player } from '../player/Player';
import { ModeController } from '../player/ModeController';
import { ThirdPersonCamera, CameraConfig } from '../camera/ThirdPersonCamera';
import { GroundRings } from '../fx/GroundRings';
import { BillboardRings } from '../fx/BillboardRings';
import { DizzyStars } from '../fx/DizzyStars';
import { RhythmFx } from '../fx/RhythmFx';
import { DrumSynth } from '../audio/DrumSynth';
import { MAX_LEVEL } from '../config/parkour';
import { DrumIcons } from '../ui/DrumIcons';
import { Sparkles } from '../world/bab1/Fx';
import { Targets } from '../gameplay/Targets';
import { Projectiles } from '../gameplay/Projectiles';
import { Laser } from '../player/skills/Laser';
import { Shield } from '../player/skills/Shield';
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
import { LEVELS } from '../world/levels';
import { startLevelFor } from '../world/progress';
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
  /** Test-only: put the camera at (x, y, z) looking at (tx, ty, tz); `null` hands it back to the follow camera. */
  lookFrom: (pose: [number, number, number, number, number, number] | null) => void;
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
  /** Test helper: put the player's FEET at (x, y, z) in mid-air (it falls from there). */
  teleportFeet: (x: number, y: number, z: number) => void;
  /**
   * Test helper: add a fixed box (centre, half extents) to the level (removed on unload). `bounce` registers it as
   * a bounce drum (Rhythm.registerBounce), `kick` as a kickable wall (Rhythm.registerKick).
   */
  testBox: (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, bounce?: boolean, kick?: boolean) => void;
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
  /** Skill state and test helpers (flight, laser, shield, projectiles). */
  skills: {
    flying: boolean;
    jets: boolean;
    /** Feet height above the ground below (m). */
    flyHeight: number;
    maxFlyHeight: number;
    shieldUp: boolean;
    laserShots: number;
    laserHits: number;
    laserMisses: number;
    shieldBlocks: number;
    ballHits: number;
    ringsPassed: number;
    flights: number;
    /** Id of the target the next laser press would hit ('' = none). */
    aimTarget: string;
    /** Live projectiles and the total spawned. */
    projectiles: number;
    projectilesSpawned: number;
    speedScale: number;
    unlocked: { laser: boolean; shield: boolean; fly: boolean };
    /** Hits per test target id. */
    testHits: Record<string, number>;
    /** Register a laser target at a point; returns its id. Removed on level unload. */
    addTestTarget: (x: number, y: number, z: number, radius?: number, id?: string) => string;
    removeTestTargets: () => void;
    /** Throw a ball from a point at the player's chest. */
    throwBall: (x: number, y: number, z: number, speed?: number) => void;
    fireLaser: () => boolean;
    /** Body yaw (0 = +Z). */
    facing: number;
    setMaxFlyHeight: (h: number) => void;
    autoLaunch: (h: number) => void;
  };
  /** Lompat Irama Barongsai state and test helpers (see player/Rhythm.ts, config/parkour.ts). */
  rhythm: {
    level: number;
    easy: boolean;
    lastQuality: string;
    perfect: number;
    good: number;
    misses: number;
    autos: number;
    bounces: number;
    normals: number;
    /** Predicted seconds until touchdown (Infinity when not falling toward ground). */
    landEta: number;
    mantles: number;
    mantling: boolean;
    /** Wall kicks so far, kicks in this airtime, and whether the kick hint shows right now. */
    wallKicks: number;
    kickChain: number;
    kickHint: boolean;
    /** Test-only: false switches the wall kick off. */
    setWallKick: (on: boolean) => void;
    /** A held jump button keeps bouncing (no jets) because of a timed bounce chain. */
    chain: boolean;
    /** Lit drum icons / icon strip shown / DOM updates so far. */
    lit: number;
    drumsVisible: boolean;
    drumWrites: number;
    /** Sounds the synth started, and whether it has an AudioContext. */
    sounds: number;
    audio: boolean;
    muted: boolean;
    setLevel: (n: number) => void;
    /** Test-only: highest level the rhythm can reach (default 4). Also clamps the current level. */
    setCap: (n: number) => void;
    setEasy: (on: boolean) => void;
    /** Force a bounce through the scripted hook. */
    bounce: (launch?: boolean) => void;
  };
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
  readonly sparkles: Sparkles;
  readonly flashes: BillboardRings;
  readonly stars: DizzyStars;
  readonly targets = new Targets();
  readonly projectiles: Projectiles;
  readonly laser: Laser;
  readonly shield: Shield;
  private jetsShown = false;
  readonly synth: DrumSynth;
  private readonly rhythmFx: RhythmFx;
  private drumIcons: DrumIcons | null = null;
  private readonly muteUrl: boolean;
  private readonly testTargets: { remove(): void }[] = [];

  // ---- Controls gating and the touch button profile (see the level context API) ----
  private levelControls = true;
  private fading = false;
  private dialogLocked = false;
  private readonly profile: ControlProfile = { legacyTest: false, transform: false, laser: false, shield: false };
  /** The level lets the child switch Glen <-> Superglen (the star button / Q); the button also needs live controls. */
  private transformAllowed = false;
  private readonly modeCtl: ModeController;
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
    rhythm: undefined as unknown as DebugHandle['rhythm'],
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
    skills: undefined as unknown as DebugHandle['skills'],
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
    lookFrom: (pose) => {
      this.cameraRig.testPose = pose;
    },
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
    teleportFeet: (x: number, y: number, z: number) => {
      this.player.teleport(x, y + 0.55, z);
      this.player.updateVisual(1, 0);
    },
    testBox: (cx, cy, cz, hx, hy, hz, bounce = false, kick = false) => {
      const h = this.physics.addFixedCuboid({ x: hx, y: hy, z: hz }, { x: cx, y: cy, z: cz });
      if (bounce) this.player.rhythm.registerBounce(h.collider);
      if (kick) this.player.rhythm.registerKick(h.collider);
      this.physics.refreshQueries();
    },
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
    // Story levels: star button / Q (E stays 'talk'). The test level has its own controller that also takes E.
    this.modeCtl = new ModeController(this.player, this.input, (m) => this.setPlayerMode(m), false, () => this.transformUsable);
    {
      // Easy jump mode: saved setting (default on), the URL ?easy=0|1 overrides it for this session.
      const q = new URLSearchParams(window.location.search);
      const easy = q.get('easy');
      this.player.rhythm.easyMode = easy === '0' ? false : easy === '1' ? true : this.save.data.settings.easyJump;
      this.muteUrl = q.get('mute') === '1';
    }
    this.synth = new DrumSynth(() => this.muteUrl || !this.save.data.settings.sound);
    // The AudioContext may only be created inside the first tap (iOS): StartGate runs this from the gesture.
    startGate.onStart(() => this.synth.unlock());
    this.rings = new GroundRings(this.scene);
    this.player.onStomp((e) => {
      this.rings.spawn(e.x, e.y, e.z, e.radius, 0.4, 0xffc400);
      this.cameraRig.bump();
    });
    this.cameraRig = new ThirdPersonCamera(this.physics, this.input, this.player.collider);
    this.renderer.attachCamera(this.cameraRig.camera);

    // ---- Skills: shared effects and systems (they live for the whole session; levels register targets) ----
    this.sparkles = new Sparkles(this.scene, 256);
    this.flashes = new BillboardRings(this.scene, this.cameraRig.camera, 8);
    this.stars = new DizzyStars(this.scene, this.cameraRig.camera, 3);
    this.player.flight.sparkles = this.sparkles;
    this.rhythmFx = new RhythmFx(this.scene, this.player, this.sparkles, this.rings, this.flashes, () => this.cameraRig.bump(), this.synth, this.cameraRig.camera);
    this.projectiles = new Projectiles(this.scene, this.physics.world, this.player, {
      sparkles: this.sparkles,
      flashes: this.flashes,
      stars: this.stars,
    });
    this.shield = new Shield(this.scene, this.player, this.input, () => this.projectiles);
    this.laser = new Laser(this.scene, this.player, this.input, this.physics, this.cameraRig, this.targets, {
      sparkles: this.sparkles,
      flashes: this.flashes,
    });
    this.debug.skills = this.makeSkillsDebug();

    const uiRoot = ui ?? document.body;
    if (ui) this.hud = new Hud(ui, this.renderer.canvas);
    this.drumIcons = new DrumIcons(uiRoot);
    this.debug.rhythm = this.makeRhythmDebug();
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
      setPlayerMode: (mode, persist = true) => this.setPlayerMode(mode, persist),
      setTransformAllowed: (on) => {
        this.transformAllowed = on;
        this.hud?.setTransformHelp(on);
        this.refreshTransform();
      },
      setSkills: (sk, persist) => this.setSkills(sk, persist),
      setSkillButtons: (sk) => this.setSkills({ laser: sk.laser, shield: sk.shield }),
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
        fx: { rings: this.rings, sparkles: this.sparkles, flashes: this.flashes, stars: this.stars },
        targets: this.targets,
        projectiles: this.projectiles,
        save: this.save,
        ui: uiRoot,
        game: this.api,
        synth: this.synth,
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
        this.transformAllowed = false;
        this.hud?.setTransformHelp(false);
        this.profile.transform = false;
        this.player.flight.resetLevelSettings();
        this.player.rhythm.cap = MAX_LEVEL;
        this.player.rhythm.reset();
        this.player.skills.shield.up = false;
        this.player.speedScale = 1;
        this.setSkills({ ...this.save.data.skills });
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
      onBeforeUnload: () => {
        // Targets, balls, rings and subscribers belong to the level that is going away.
        this.targets.clear();
        this.projectiles.clear();
        this.laser.clear();
        this.flashes.clear();
        this.stars.clear();
        this.player.skills.clearListeners();
        this.player.rhythm.clearBounce();
        for (const t of this.testTargets) t.remove();
        this.testTargets.length = 0;
      },
      onAfterBuild: () => {
        this.hud?.setStoryHelp(this.levels.currentId !== 'test');
        this.applyLayout();
        this.syncDebug();
        // Show every skill effect once so its shader program is compiled now, not in the middle of play.
        this.warmSkillFx(true);
        this.renderer.prewarm(this.scene, this.cameraRig.camera);
        this.warmSkillFx(false);
      },
    });
    for (const [id, factory] of Object.entries(LEVELS)) this.levels.register(id, factory);
    const wanted = new URLSearchParams(window.location.search).get('level');
    this.levels.loadInstant(wanted && this.levels.has(wanted) ? wanted : startLevelFor(this.save));

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
    this.skillFrame(dt);
    this.levels.update(dt);
    this.interactions.update();
    this.objectives.update(dt);
  }

  private fixedStep(dt: number): void {
    this.levels.fixedUpdate(dt); // sequences first, then the level (e.g. the test area's mode toggle)
    this.modeCtl.fixedUpdate();
    this.dialog.fixedUpdate(dt);
    this.interactions.fixedUpdate();
    this.objectives.fixedUpdate();
    this.shield.fixedUpdate(dt); // before the player: it sets the speed scale
    this.laser.fixedUpdate(dt);
    this.player.fixedUpdate(dt, this.cameraRig.steeringYaw);
    this.physics.step();
    this.player.postStep();
    this.projectiles.fixedUpdate(dt);
    this.input.endFixedStep();
  }

  /** Per rendered frame: skill visuals (particles, rings, balls, beams, dome) and the touch "jets" button state. */
  private skillFrame(dt: number): void {
    this.sparkles.update(dt);
    this.flashes.update(dt);
    this.stars.update(dt);
    this.projectiles.update(dt);
    this.laser.update(dt);
    this.shield.update(dt);
    this.rhythmFx.update(dt);
    this.drumIcons?.update(this.player.mode === 'superglen', this.player.rhythm.level);
    const jets = this.player.flight.jetsOn;
    if (jets !== this.jetsShown) {
      this.jetsShown = jets;
      this.touch?.controls.setJets(jets);
    }
  }

  private warmSkillFx(on: boolean): void {
    this.player.flight.warm(on);
    this.player.warmFx(on);
    this.rhythmFx.warm(on);
    this.flashes.warm(on);
    this.stars.warm(on);
    this.projectiles.warm(on);
    this.laser.warm(on);
    this.shield.warm(on);
  }

  /** Unlock / lock skills (omitted keys unchanged): touch buttons, PC help card and the skill systems follow. */
  private setSkills(sk: { laser?: boolean; shield?: boolean; fly?: boolean }, persist = false): void {
    const u = this.player.skills.unlocked;
    if (sk.laser !== undefined) u.laser = sk.laser;
    if (sk.shield !== undefined) u.shield = sk.shield;
    if (sk.fly !== undefined) u.fly = sk.fly;
    if (persist) {
      if (u.laser) this.save.unlockSkill('laser');
      if (u.shield) this.save.unlockSkill('shield');
      if (u.fly) this.save.unlockSkill('fly');
    }
    this.profile.laser = u.laser;
    this.profile.shield = u.shield;
    this.hud?.setSkillHelp(u);
    this.applyLayout();
  }

  /** Parents' page hook: easy jump mode on/off (saved). */
  setEasyJump(on: boolean): void {
    this.player.rhythm.easyMode = on;
    this.save.setEasyJump(on);
  }

  /** Parents' page hook: synthesized sound on/off (saved). */
  setSound(on: boolean): void {
    this.save.setSound(on);
  }

  private makeRhythmDebug(): DebugHandle['rhythm'] {
    return {
      level: 0,
      easy: true,
      lastQuality: '',
      perfect: 0,
      good: 0,
      misses: 0,
      autos: 0,
      bounces: 0,
      normals: 0,
      landEta: Infinity,
      mantles: 0,
      mantling: false,
      wallKicks: 0,
      kickChain: 0,
      kickHint: false,
      setWallKick: (on) => {
        this.player.wallKickEnabled = on;
      },
      chain: false,
      lit: 0,
      drumsVisible: false,
      drumWrites: 0,
      sounds: 0,
      audio: false,
      muted: false,
      setLevel: (n) => this.player.rhythm.setLevel(n),
      setCap: (n) => {
        this.player.rhythm.cap = Math.max(0, Math.min(MAX_LEVEL, Math.round(n)));
        this.player.rhythm.setLevel(this.player.rhythm.level);
      },
      setEasy: (on) => {
        this.player.rhythm.easyMode = on;
      },
      bounce: (launch) => this.player.rhythm.bounce(launch),
    };
  }

  private makeSkillsDebug(): DebugHandle['skills'] {
    const hits: Record<string, number> = {};
    const v = new THREE.Vector3();
    const aim = new THREE.Vector3();
    let counter = 0;
    return {
      flying: false,
      jets: false,
      flyHeight: 0,
      maxFlyHeight: 0,
      shieldUp: false,
      laserShots: 0,
      laserHits: 0,
      laserMisses: 0,
      shieldBlocks: 0,
      ballHits: 0,
      ringsPassed: 0,
      flights: 0,
      aimTarget: '',
      projectiles: 0,
      projectilesSpawned: 0,
      speedScale: 1,
      unlocked: { laser: false, shield: false, fly: false },
      testHits: hits,
      addTestTarget: (x, y, z, radius = 0.6, id = `test${++counter}`) => {
        const pos = new THREE.Vector3(x, y, z);
        hits[id] = 0;
        this.testTargets.push(
          this.targets.add({
            id,
            position: () => pos,
            radius,
            onHit: () => {
              hits[id]++;
            },
          }),
        );
        return id;
      },
      removeTestTargets: () => {
        for (const t of this.testTargets) t.remove();
        this.testTargets.length = 0;
      },
      throwBall: (x, y, z, speed = 7) => {
        v.set(x, y, z);
        aim.copy(this.player.position);
        this.projectiles.spawn({ from: v, to: aim, speed, gravity: 0, color: 0xff5a4f, radius: 0.26 });
      },
      fireLaser: () => this.laser.fire(),
      facing: 0,
      setMaxFlyHeight: (h) => {
        this.player.flight.maxFlyHeight = h;
      },
      autoLaunch: (h) => this.player.flight.autoLaunch(h),
    };
  }

  /** Glen <-> Superglen: player look/tuning, touch buttons and a quick golden flash ring. */
  private setPlayerMode(mode: PlayerMode, persist = true): void {
    const changed = mode !== this.player.mode;
    this.player.setMode(mode);
    if (persist) this.save.setLastMode(mode);
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
    this.refreshTransform();
  }

  /** Is the star / Q switch usable right now (the story allows it and no sequence, dialog or fade holds the controls)? */
  private get transformUsable(): boolean {
    return this.transformAllowed && this.controlsEnabled && !this.profile.legacyTest;
  }

  private refreshTransform(): void {
    this.profile.transform = this.transformAllowed && this.controlsEnabled;
    this.applyLayout();
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
    const rh = this.debug.rhythm;
    const R = pl.rhythm;
    rh.level = R.level;
    rh.easy = R.easyMode;
    rh.lastQuality = R.lastQuality;
    rh.perfect = R.stats.perfect;
    rh.good = R.stats.good;
    rh.misses = R.stats.misses;
    rh.autos = R.stats.autos;
    rh.bounces = R.stats.bounces;
    rh.normals = R.stats.normals;
    rh.landEta = pl.landEta;
    rh.mantles = pl.mantles;
    rh.mantling = pl.mantling;
    rh.wallKicks = pl.wallKicks;
    rh.kickChain = pl.kickChain;
    rh.kickHint = pl.kickHint;
    rh.chain = pl.bounceChain;
    rh.lit = this.drumIcons ? this.drumIcons.lit : 0;
    rh.drumsVisible = this.drumIcons ? this.drumIcons.visible : false;
    rh.drumWrites = this.drumIcons ? this.drumIcons.writes : 0;
    rh.sounds = this.synth.played;
    rh.audio = !!this.synth.audioContext;
    rh.muted = this.muteUrl || !this.save.data.settings.sound;
    const sk = this.debug.skills;
    const st = pl.skills.stats;
    sk.flying = pl.flight.isFlying;
    sk.jets = pl.flight.jetsOn;
    sk.flyHeight = pl.airHeight;
    sk.maxFlyHeight = pl.flight.maxFlyHeight;
    sk.shieldUp = pl.skills.shield.up;
    sk.laserShots = st.laserShots;
    sk.laserHits = st.laserHits;
    sk.laserMisses = st.laserMisses;
    sk.shieldBlocks = st.shieldBlocks;
    sk.ballHits = st.ballHits;
    sk.ringsPassed = st.ringsPassed;
    sk.flights = st.flights;
    sk.aimTarget = this.laser.aimTarget ? this.laser.aimTarget.id : '';
    sk.projectiles = this.projectiles.liveCount;
    sk.projectilesSpawned = this.projectiles.spawned;
    sk.speedScale = pl.speedScale;
    sk.facing = pl.facing;
    sk.unlocked.laser = pl.skills.unlocked.laser;
    sk.unlocked.shield = pl.skills.unlocked.shield;
    sk.unlocked.fly = pl.skills.unlocked.fly;

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
