import { qualityDebugHandle } from './Quality';
import * as THREE from 'three';
import { setSkyRenderer } from '../world/kota/Sky';
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
import { Sfx } from '../audio/Sfx';
import { wireSfx } from '../audio/SfxWiring';
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
import { setNameSources } from '../gameplay/PlayerName';
import { Health } from '../gameplay/Health';
import { HealLines } from '../gameplay/healLines';
import { Interactions } from '../gameplay/Interactions';
import { Objectives } from '../gameplay/Objectives';
import { LevelManager } from '../world/LevelManager';
import type { LevelGame } from '../world/Level';
import { LEVELS } from '../world/levels';
import { flow, migrateSave, practice, setArrival, startPlanFor } from '../world/progress';
import { SaveStore, setActiveSlot } from './Save';
import { skipTitleOnce } from '../ui/TitleMenu';
import { TouchSource } from '../input/TouchSource';
import { GamepadSource } from '../input/GamepadSource';
import { padHub, PadConfig } from '../input/GamepadHub';
import { PadUi } from '../input/PadUi';
import { tvPerf } from './TvPerf';
import { TvControls, type TvRadialItem } from '../input/TvControls';
import { MenuIcons } from '../ui/MenuIcons';
import { PadDebug } from '../ui/PadDebug';
import { startGate } from './StartGate';
import { versionGuard } from './VersionGuard';
import { touchMode } from './TouchMode';
import { FrameClock } from './FrameClock';
import { ShadowFollower } from './ShadowSnap';
import { PerfOverlay, type PerfStats } from '../ui/PerfOverlay';
import { QuizEngine } from '../quiz/QuizEngine';
import { AudioManager, AudioConfig } from '../audio/AudioManager';
import { wireQuizVoice } from '../audio/QuizVoice';
import { ParentsPage } from '../ui/ParentsPage';
import { SettingsMenu } from '../ui/SettingsMenu';
import { MapView } from '../ui/MapView';
import { BattleMode } from '../gameplay/BattleMode';
import { ZoomButtons } from '../ui/ZoomButtons';
import { CinematicPlayer, cinematicsForLevel } from '../ui/CinematicPlayer';
import type { SlotSave } from './Save';

/** Max frame delta fed into the accumulator (s): avoids a "spiral of death" after a hitch. */
const MAX_FRAME_DT = 0.1;
/** Max physics steps per rendered frame. Leftover whole steps are dropped (the sub-step phase is kept). */
const MAX_SUBSTEPS = 5;

/** Read-only debug data for automated smoke tests and the browser console. */
export interface DebugHandle {
  /** Graphics quality: current tier, mode (auto / fixed) and a setter (see core/Quality.ts). */
  quality?: ReturnType<typeof qualityDebugHandle>;
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
  /** Collider ground height under the player (world Y; NaN when nothing below). */
  groundY: number;
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
  /** Test helper: make dialog lines show as the small fight call-out (without a fight). */
  forceCompactDialog: (on: boolean) => void;
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
  /** Test-only: show a dialog line (a table id or literal text, optionally with an id). */
  say: (line: string | { speaker: string; text: string; id?: string }, opts?: { lockControls?: boolean }) => void;
  /** Controller state and test helpers (see input/GamepadHub.ts, input/PadUi.ts). */
  pad: { connected: boolean; active: boolean; table: string; mapping: string; id: string; focus: { scope: string; act: string; label: string; cls: string }; rumbles: number; presses: number; seq: number };
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
  /** Tantangan Pintar: live values and test helpers (see QuizEngine.debugHandle). */
  quiz: Record<string, unknown>;
  /** Voice / sfx / music state and the test hooks (see audio/AudioManager.ts). */
  audio: Record<string, unknown>;
  /** Procedural sound effects: log of what played, counters and test helpers (see audio/Sfx.ts). */
  sfx: Record<string, unknown>;
  /** The parents' page (long-press on the start logo). */
  parents: { open: boolean; show: () => void; close: () => void };
  /** Settings panel (gear): state and test helpers. `frames` counts rendered game frames, `frozen` = the loop is paused. */
  settings: Record<string, unknown>;
  /** Glen's hearts (gameplay/Health.ts): counts and test helpers. */
  health: Record<string, unknown>;
  /** Battle mode (gameplay/BattleMode.ts): state and test helpers. */
  battle: Record<string, unknown>;
  /** Camera zoom: shown / wanted / saved multiplier and test helpers. */
  zoom: Record<string, unknown>;
  /** Mini map / full map state (see ui/MapView.ts). */
  map: Record<string, unknown>;
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
  readonly health: Health;
  readonly battle: BattleMode;
  private fadeUi!: Fade;
  private resting = false;
  readonly interactions: Interactions;
  readonly objectives: Objectives;
  readonly levels: LevelManager;
  private readonly touch: TouchSource | null = null;
  private readonly hud: Hud | null = null;
  private readonly cinematics: CinematicPlayer;
  private openingPending = false;
  private readonly walker: WalkSource;
  private readonly padSource: GamepadSource;
  private readonly padUi: PadUi;
  private readonly padDebug: PadDebug | null = null;
  /** Virtual clock (ms) for the pad when a test steps frames by hand. */
  private padClock = 1e7;
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
  readonly audio: AudioManager;
  readonly sfx: Sfx;
  readonly quiz: QuizEngine;
  readonly parents: ParentsPage;
  readonly settings: SettingsMenu;
  readonly maps: MapView;
  /** The settings panel is open: the game loop is paused (audio keeps playing so a volume slider can be heard). */
  private menuOpen = false;
  private menuReleasedLock = false;
  private frameCount = 0;
  private readonly tmpFeet = { x: 0, y: 0, z: 0 };
  /** The quiz overlay is open: controls and interactions are locked. */
  private quizLocked = false;
  private quizReleasedLock = false;
  private readonly rhythmFx: RhythmFx;
  private drumIcons: DrumIcons | null = null;
  private readonly muteUrl: boolean;
  private readonly testTargets: { remove(): void }[] = [];

  // ---- Controls gating and the touch button profile (see the level context API) ----
  private levelControls = true;
  private fading = false;
  private dialogLocked = false;
  private readonly profile: ControlProfile = { legacyTest: false, transform: false, laser: false, shield: false, flight: false, bike: false };
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
    groundY: 0,
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
    quiz: {},
    audio: {},
    sfx: {},
    parents: undefined as unknown as DebugHandle['parents'],
    settings: {},
    health: {},
    battle: {},
    zoom: {},
    map: {},
    walkTo: (x: number, z: number) => this.walker.start(x, z),
    cancelWalk: () => this.walker.stop(),
    walking: false,
    forceCompactDialog: () => {},
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
    say: (line, opts) => {
      void this.dialog.say(line, opts);
    },
    pad: {
      connected: false,
      active: false,
      table: '',
      mapping: '',
      id: '',
      focus: { scope: '', act: '', label: '', cls: '' },
      rumbles: 0,
      presses: 0,
      seq: 0,
    },
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
    setSkyRenderer(this.renderer.renderer);
    this.physics = new Physics();

    this.input = new Input();
    this.input.addSource(new KeyboardMouseSource(this.renderer.canvas, CameraConfig.mouseSensitivity));
    const ui = document.getElementById('ui');
    if (ui) {
      this.touch = new TouchSource(ui, () => touchMode.active);
      this.input.addSource(this.touch);
    }

    this.padSource = new GamepadSource();
    this.input.addSource(this.padSource);

    this.walker = new WalkSource(
      () => this.player.visualPosition,
      () => this.cameraRig.steeringYaw,
    );
    this.input.addSource(this.walker);
    this.save = new SaveStore();
    if (migrateSave(this.save)) this.save.persist();
    // The opening is a one-time introduction, not a loading animation for every refresh.
    // A reset query deliberately clears the marker so the introduction can be replayed.
    try {
      const key = 'superglen.opening-seen.v1';
      if (new URLSearchParams(window.location.search).get('reset') === '1') localStorage.removeItem(key);
      this.openingPending = !this.save.previewChapter && localStorage.getItem(key) !== '1';
    } catch {
      this.openingPending = !this.save.previewChapter;
    }
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
    // The file-based audio shares that context: voice, sfx and music lanes (silent when files are missing).
    this.audio = new AudioManager({
      getContext: () => this.synth.audioContext,
      soundOn: () => this.save.data.settings.sound,
      musicOn: () => this.save.data.settings.music,
      muteUrl: this.muteUrl,
      musicVolume: () => this.save.data.settings.musicVol,
      sfxVolume: () => this.save.data.settings.sfxVol,
    });
    this.synth.setVolume(this.save.data.settings.sfxVol);
    startGate.onStart(() => this.audio.unlock());
    this.debug.audio = this.audio.debugHandle();
    // Procedural effects: same context, the sfx lane gain, silent when muted.
    this.sfx = new Sfx({ getContext: () => this.synth.audioContext, getOut: () => this.audio.sfxOut, isMuted: () => this.audio.silent });
    this.debug.sfx = this.sfx.debugHandle();
    wireSfx(this.sfx, this.player);
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
    this.shield = new Shield(this.scene, this.player, this.input);
    this.laser = new Laser(this.scene, this.player, this.input, this.physics, this.cameraRig, this.targets, {
      sparkles: this.sparkles,
      flashes: this.flashes,
    });
    this.debug.skills = this.makeSkillsDebug();

    const uiRoot = ui ?? document.body;
    this.cinematics = new CinematicPlayer(uiRoot, (locked) => {
      this.levelControls = !locked;
      this.updateControls();
    }, (playing) => {
      this.audio.setCinematicMuted(playing);
      this.synth.setCinematicMuted(playing);
      if (!playing) {
        // iOS may suspend Web Audio while an HTML video owns the audio session.
        this.synth.unlock();
        this.audio.unlock();
      }
    });
    window.addEventListener('pointerdown', () => {
      if (this.synth.audioContext?.state === 'suspended') {
        this.synth.unlock();
        this.audio.unlock();
      }
    }, { capture: true, passive: true });
    if (ui) this.hud = new Hud(ui, this.renderer.canvas);
    this.quiz = new QuizEngine({
      save: this.save,
      synth: this.synth,
      sfx: this.sfx,
      audio: this.audio,
      ui: uiRoot,
      onOpenChange: (open) => {
        this.quizLocked = open;
        this.updateControls();
        // The mouse must be free to click the cards; it is captured again when the quiz closes (a key press / click is the gesture).
        if (open) {
          this.quizReleasedLock = !!document.pointerLockElement && typeof document.exitPointerLock === 'function';
          if (this.quizReleasedLock) document.exitPointerLock();
        } else if (this.quizReleasedLock) {
          this.quizReleasedLock = false;
          try {
            const r = this.renderer.canvas.requestPointerLock() as unknown;
            if (r instanceof Promise) r.catch(() => undefined);
          } catch {
            // no gesture / unsupported: the next click captures the mouse
          }
        }
      },
    });
    this.parents = new ParentsPage(uiRoot, {
      save: this.save,
      quiz: this.quiz,
      setEasyJump: (on) => this.setEasyJump(on),
      setEasyFight: (on) => this.save.setEasyFight(on),
      setReduceShake: (on) => this.save.setReduceShake(on),
      setSound: (on) => this.setSound(on),
      setMusic: (on) => this.setMusic(on),
      afterReset: () => {
        try {
          window.location.reload();
        } catch {
          // ignore
        }
      },
    });
    if (this.hud) {
      this.hud.onParents = () => this.parents.show();
      this.hud.onBeforeStart = () => {
        // Unlock audio while still inside the user's gesture. The cinematic itself is
        // asynchronous, so waiting until it ends would be rejected by mobile Safari.
        this.synth.unlock();
        this.audio.unlock();
        if (!this.openingPending) return Promise.resolve();
        this.openingPending = false;
        try { localStorage.setItem('superglen.opening-seen.v1', '1'); } catch { /* storage may be blocked */ }
        return this.cinematics.play('open');
      };
    }
    this.debug.quiz = this.quiz.debugHandle();
    const parentsPage = this.parents;
    this.debug.parents = {
      get open() {
        return parentsPage.open;
      },
      show: () => parentsPage.show(),
      close: () => parentsPage.close(),
    };
    this.maps = new MapView(uiRoot);
    this.maps.onMiniOpen = () => this.settings.toggleMap();
    this.maps.onFullClose = () => this.settings.mapClosed();
    this.settings = new SettingsMenu({
      ui: uiRoot,
      save: this.save,
      canOpen: () => startGate.started && !this.quizLocked && !this.fading && !this.parents.open,
      onOpenChange: (open) => this.setMenuOpen(open),
      onVolumes: () => {
        this.audio.applyVolumes();
        this.synth.setVolume(this.save.data.settings.sfxVol);
      },
      hasMap: () => this.maps.hasMap,
      openMap: () => this.maps.openFull(),
      closeMap: () => this.maps.closeFull(),
      inCity: () => this.levels.currentId === 'kota',
      respawn: () => this.respawnHome(),
      saveSlot: (n) => this.saveSlot(n),
      loadSlot: () => this.loadSlot(),
      loadFromSlot: (n) => this.reloadOnSlot(n),
      toMainMenu: () => this.toMainMenu(),
      restart: () => {
        void this.levels.load(this.levels.currentId);
      },
      resetZoom: () => this.resetZoom(),
    });
    startGate.onStart(() => this.maps.setShown(true));
    this.padUi = new PadUi({
      settings: this.settings,
      maps: this.maps,
      quizOpen: () => this.quizLocked,
      resumeAudio: () => {
        // A pad press may not count as a user gesture: keep asking quietly until the context runs.
        const c = this.synth.audioContext;
        if (!c || c.state === 'suspended') this.synth.unlock();
      },
    });
    Object.defineProperty(this.debug.pad, 'focus', { get: () => this.padUi.focusInfo, enumerable: true });
    // TV mode: remote-only play, radial action menu, panel navigation (see input/TvControls.ts; inert unless tvMode.active).
    const tv = new TvControls({
      input: this.input,
      settings: this.settings,
      padUi: this.padUi,
      canPlay: () => startGate.started && this.controlsEnabled && !this.menuOpen && !this.quizLocked && !this.fading,
      radialItems: () => {
        const items: TvRadialItem[] = getLayout(this.player.mode, this.profile)
          .filter((d) => d.action !== 'jump' && d.action !== 'interact')
          .map((d) => ({ action: d.action, icon: d.icon, color: d.color }));
        if (this.maps.hasMap) items.push({ action: 'map', icon: MenuIcons.map, color: '#2a9d8f' });
        return items;
      },
      toggleMap: () => this.settings.toggleMap(),
      start: () => this.hud?.startFromMenu(),
    });
    this.input.addSource(tv);
    (window as unknown as { __sgTv?: TvControls }).__sgTv = tv;
    (window as unknown as { __sgPause?: () => void }).__sgPause = () => { if (startGate.started) this.settings.open(); };
    padHub.rumbleAllowed = () => !this.muteUrl && this.save.data.settings.sound && this.save.data.settings.sfxVol > 0;
    this.player.events.on('land', (e) => {
      if (e.impact > PadConfig.rumbleLandImpact) this.rumble(0.45, 0.25, 110);
    });
    if (new URLSearchParams(window.location.search).get('pad') === 'debug') {
      this.padDebug = new PadDebug(uiRoot, this.renderer.renderer.getContext());
    }
    {
      const menu = this.settings;
      const maps = this.maps;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const g = this;
      this.debug.settings = Object.defineProperties(menu.debugHandle(), {
        frames: { get: () => g.frameCount, enumerable: true },
        frozen: { get: () => g.paused || g.menuOpen, enumerable: true },
        slot: { get: () => (g.save.data.slot ? { ...g.save.data.slot } : null), enumerable: true },
        volumes: { get: () => ({ music: g.save.data.settings.musicVol, sfx: g.save.data.settings.sfxVol }), enumerable: true },
      });
      this.debug.map = maps.debugHandle();
    }
    this.drumIcons = new DrumIcons(uiRoot);
    this.debug.rhythm = this.makeRhythmDebug();
    if (new URLSearchParams(window.location.search).get('perf') === '1') {
      this.perfPanel = new PerfOverlay(uiRoot, (out) => this.collectPerfStats(out));
    }

    setNameSources(() => this.player.mode === 'superglen', (clip) => this.audio.hasFile(clip));
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
    // Voice lines: the clip starts with the line and the bubble waits for it; advancing a line stops it.
    this.dialog.onLineStart((id, speaker, lineText) => {
      this.sfx.blip();
      if (!id) return;
      const voiceId = this.dialog.currentLine?.voiceId ?? id;
      void this.audio.playVoice(voiceId).then((r) => {
        if (this.dialog.currentLine?.id !== id) return;
        // The clip has just started: keep the bubble for its whole length (plus a tail) from now.
        if (r.played) this.dialog.setLineDuration(this.dialog.lineElapsed + r.duration + AudioConfig.tail);
        else if (!this.muteUrl && this.save.data.settings.sound && !document.hidden && 'speechSynthesis' in window) {
          // Keep every story line audible when its packaged MP3 is missing or cannot play.
          window.speechSynthesis.cancel();
          const spoken = new SpeechSynthesisUtterance(lineText);
          spoken.lang = 'id-ID';
          spoken.rate = 0.95;
          spoken.pitch = speaker === 'glen' ? 1.25 : speaker === 'aara' ? 1.12 : 1;
          const indonesian = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('id'));
          if (indonesian) spoken.voice = indonesian;
          this.dialog.setLineDuration(this.dialog.lineElapsed + Math.max(3, lineText.length / 12));
          this.audio.setExternalVoiceActive(true);
          window.speechSynthesis.speak(spoken);
        }
      });
    });
    this.dialog.onLineEnd(() => {
      this.audio.stopVoice();
      this.audio.setExternalVoiceActive(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    });
    let forceCompact = false;
    this.dialog.addCompactRule(() => forceCompact);
    this.debug.forceCompactDialog = (on) => {
      forceCompact = on;
    };
    wireQuizVoice(this.quiz, this.audio);
    this.interactions = new Interactions(
      uiRoot,
      this.player,
      this.input,
      this.dialog,
      this.cameraRig.camera,
      () => this.levelControls && !this.fading && !this.quizLocked,
    );
    this.interactions.onNearChange((near) => {
      this.touch?.controls.setPulse('interact', near);
      if (near) this.sfx.bling();
    });
    if (this.touch) this.touch.onButtonPress = (a) => (a === 'jump' ? undefined : this.sfx.pop());
    this.objectives = new Objectives(this.scene, uiRoot, this.cameraRig.camera, this.player);
    const fade = new Fade(uiRoot);
    this.fadeUi = fade;
    this.health = new Health(uiRoot, this.save, this.player, { stars: this.stars, sparkles: this.sparkles }, this.synth, this.sfx);
    this.health.onExhausted = () => void this.rest();
    this.debug.health = this.health.debugHandle();
    // Camera zoom: the saved multiplier, saved again (debounced) when the child changes it; two buttons on touch.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self0 = this;
    this.cameraRig.setZoom(this.save.data.settings.zoom, true, false);
    this.cameraRig.onZoomChange = (z) => this.save.setZoom(z);
    new ZoomButtons(uiRoot, this.input);
    this.debug.zoom = {
      get value() { return self0.cameraRig.zoomNow; },
      get target() { return self0.cameraRig.zoomTarget; },
      get saved() { return self0.save.data.settings.zoom; },
      set: (z: number, instant = true) => self0.cameraRig.setZoom(z, instant),
      reset: () => self0.resetZoom(),
    };
    this.battle = new BattleMode({ ui: uiRoot, scene: this.scene, cameraRig: this.cameraRig, player: this.player, audio: this.audio, sfx: this.sfx, save: this.save, health: this.health, sparkles: this.sparkles, rings: this.rings });
    this.debug.battle = this.battle.debugHandle();

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
      playCinematic: (id, opts) => this.cinematics.play(id, opts),
      preloadCinematic: (id) => this.cinematics.preload(id),
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
      setLaserSuppressed: (on) => { this.laser.suppressed = on; },
      setHoseIcon: (on) => {
        this.profile.hose = on;
        this.applyLayout();
      },
      setRiding: (on) => {
        this.profile.bike = on;
        this.applyLayout();
      },
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
        sfx: this.sfx,
        audio: this.audio,
        quiz: this.quiz,
        health: this.health,
        battle: this.battle,
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
        this.profile.bike = false;
        this.profile.hose = false;
        this.player.ride = null;
        this.player.rideLift = 0;
        this.player.flight.resetLevelSettings();
        this.player.flight.toggleEnabled = this.save.isChapterDone('flight-training-unlocked')
          || ['elang_bank', 'elang_met', 'elang_home'].includes(this.save.data.interlude)
          || this.save.isChapterDone('bab7');
        this.player.rhythm.cap = MAX_LEVEL;
        this.player.rhythm.reset();
        this.player.skills.shield.up = false;
        this.player.speedScale = 1;
        this.player.levelSpeedScale = 1;
        this.player.preferAirJump = false;
        this.laser.suppressed = false;
        this.setSkills({ ...this.save.data.skills });
        for (const a of ['jump', 'flight', 'laser', 'shield', 'transform'] as const) this.touch?.controls.setPulse(a, false);
        for (const k of Object.keys(this.debug.levelInfo)) delete this.debug.levelInfo[k];
        this.player.setMode('glen');
        this.updateControls();
        this.applyLayout();
      },
      onLoadingChange: (loading) => {
        this.fading = loading;
        if (loading) versionGuard.applyIfPending(); // a level change is a safe moment for a stale-build reload
        this.updateControls();
      },
      onBeforeUnload: () => {
        this.battle.reset();
        this.quiz.cancel();
        this.sfx.stopAll(); // the jet loop and any voice belong to the level that is going away
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
        // A practice fight lasts only while its own level (or the training room) is loaded.
        if (practice.level && this.levels.currentId !== practice.level && this.levels.currentId !== 'training-room') practice.level = '';
        this.hud?.setStoryHelp(this.levels.currentId !== 'test');
        // Chapter videos download in the background now (the opening right after the title), not just before they play.
        this.cinematics.enterLevel([...(this.openingPending ? (['open'] as const) : []), ...cinematicsForLevel(this.levels.currentId, this.save.data.chaptersDone)]);
        this.maps.setSource(this.levels.current?.map ?? null);
        this.settings.refresh();
        this.applyLayout();
        this.syncDebug();
        // Show every skill effect once so its shader program is compiled now, not in the middle of play.
        this.warmSkillFx(true);
        this.renderer.prewarm(this.scene, this.cameraRig.camera);
        this.warmSkillFx(false);
      },
    });
    for (const [id, factory] of Object.entries(LEVELS)) this.levels.register(id, factory);
    const query = new URLSearchParams(window.location.search);
    // Debug shortcuts: ?ending=1 (the credits), ?training=1 (the Lab hologram training room), ?lab=1 (the Lab; add &done=1 for the finished story).
    const wanted = this.save.previewChapter ? null : query.get('level') ?? (query.get('ending') === '1' ? 'ending' : query.get('training') === '1' ? 'training-room' : query.get('lab') === '1' ? 'lab' : null);
    flow.sandbox = false;
    flow.free = false;
    if (wanted && this.levels.has(wanted)) {
      // Debug URL: that level, and the city as free roam (see progress.ts `flow.sandbox`).
      flow.sandbox = true;
      flow.free = new URLSearchParams(window.location.search).get('free') === '1';
      this.levels.loadInstant(wanted);
    } else {
      const plan = startPlanFor(this.save);
      if (plan.arrival) setArrival(plan.level, plan.arrival);
      this.levels.loadInstant(plan.level);
      const sl = plan.slot;
      if (sl && this.levels.currentId === sl.level) {
        this.levels.teleport(sl.x, sl.y + 0.3, sl.z, sl.yaw);
        if (this.transformAllowed) this.setPlayerMode(sl.mode);
      }
    }

    // Live getters (a load finishes in real time even while the loop is paused for tests).
    Object.defineProperties(this.debug, {
      level: { get: () => this.levels.currentId, enumerable: true },
      loading: { get: () => this.levels.loading, enumerable: true },
      controlsEnabled: { get: () => this.controlsEnabled, enumerable: true },
    });
    this.debug.quality = qualityDebugHandle();
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
    this.pollPad(now);
    if (this.menuOpen) {
      this.padSource.sync(); // presses made inside the panel are not game presses
      return;
    }
    if (tvPerf.shouldSkip(now)) return; // TV 30 fps cap: physics catches up with two fixed steps next frame
    const panel = this.perfPanel;
    const t0 = panel ? performance.now() : 0;
    const steps = this.runFrame(now, true);
    if (panel) panel.frame(now, performance.now() - t0, steps);
  };

  /** Tests: one whole frame at a made-up timestamp, even while the real loop is paused. */
  private simFrame(nowMs: number, render: boolean): number {
    this.pollPad(nowMs);
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
    this.frameCount++;

    this.input.update();
    this.cameraRig.handleInput();

    this.accumulator += dt * this.battle.timeScale;
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

  /** Read the controller (once per frame, before input.update) and run its menu navigation. */
  private pollPad(nowMs: number): void {
    const h = padHub;
    h.poll(nowMs);
    if (!h.connected) {
      if (this.debug.pad.connected) this.debug.pad.connected = false;
      this.padDebug?.update(nowMs);
      return;
    }
    this.padUi.update();
    this.padDebug?.update(nowMs);
    const d = this.debug.pad;
    d.connected = true;
    d.active = h.deviceActive;
    d.table = h.table;
    d.mapping = h.mapping;
    d.id = h.id;
    d.presses = h.count[0] + h.count[1] + h.count[2] + h.count[3];
    d.seq = h.seq;
  }

  private rumble(strong: number, weak: number, ms: number): void {
    this.debug.pad.rumbles++;
    padHub.rumble(strong, weak, ms);
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
    if (startGate.started) this.save.tickPlay(dt);
    this.skillFrame(dt);
    this.battle.update(dt);
    this.levels.update(dt);
    {
      const mp = this.player.visualPosition;
      // Objective star: the level's own goal when it has one, else where the objective beam stands.
      const src = this.levels.current?.map;
      if (src) this.maps.setGoal(src.goal ? src.goal() : this.objectives.active ? this.objectives.position : null);
      this.maps.update(mp.x, mp.z, this.player.facing);
    }
    this.interactions.update();
    this.objectives.update(dt);
  }

  private fixedStep(dt: number): void {
    this.sfx.tick(dt);
    this.quiz.tick(dt); // quiz overlay timers (free while closed)
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
    this.health.fixedUpdate(dt);
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
    // Jet loop: follows the rise speed; cut if the jets are off but it still runs (a missed event, a level swap).
    if (this.sfx.jetRunning) {
      if (jets) this.sfx.jetUpdate(dt, this.player.flight.vy);
      else this.sfx.jetStop();
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
    this.profile.flight = u.fly && this.player.flight.toggleEnabled;
    this.hud?.setSkillHelp(u, this.player.flight.toggleEnabled);
    this.applyLayout();
  }

  /** Settings: back to the default camera distance (saved). */
  resetZoom(): void {
    this.cameraRig.setZoom(1);
  }

  /** Parents' page hook: easy jump mode on/off (saved). */
  setEasyJump(on: boolean): void {
    this.player.rhythm.easyMode = on;
    this.save.setEasyJump(on);
  }

  /** Parents' page hook: sound on/off (saved). Off silences voice, effects, drum and music. */
  setSound(on: boolean): void {
    this.save.setSound(on);
    this.audio.refresh();
    this.sfx.refresh();
    if (!on) {
      this.audio.setExternalVoiceActive(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  }

  /** Parents' page hook: background music on/off (saved). */
  setMusic(on: boolean): void {
    this.save.setMusic(on);
    this.audio.refresh();
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
      this.sfx.transform(mode === 'superglen');
      this.rumble(0.25, 0.55, 140);
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
    return this.levelControls && !this.fading && !this.dialogLocked && !this.quizLocked;
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

  // ---- Settings panel actions ----

  /** The panel opened / closed: pause the game loop, free the mouse, drop held input. */
  private setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    if (open) {
      versionGuard.applyIfPending();
      this.sfx.stopAll();
      this.input.reset();
      this.menuReleasedLock = !!document.pointerLockElement && typeof document.exitPointerLock === 'function';
      if (this.menuReleasedLock) document.exitPointerLock();
    } else {
      if (this.player.flight.jetsOn) this.sfx.jetStart(false);
      this.accumulator = 0;
      this.clock.reset();
      if (this.menuReleasedLock) {
        this.menuReleasedLock = false;
        try {
          const r = this.renderer.canvas.requestPointerLock() as unknown;
          if (r instanceof Promise) r.catch(() => undefined);
        } catch {
          // no gesture / unsupported: the next click captures the mouse
        }
      }
    }
  }

  /**
   * Zero hearts: Glen is only tired. Soft fade, rest at the Rumah Sakit (the city) or the last safe ground, hearts full, Nino
   * encourages. Nothing is lost (coins, chapters and tamed rats stay).
   */
  private async rest(): Promise<void> {
    if (this.resting) return;
    this.resting = true;
    const wasControls = this.levelControls;
    this.levelControls = false;
    this.updateControls();
    this.input.reset();
    this.sfx.stopAll();
    this.battle.exit(); // he is resting: the fight is over for now (the chapter resets it)
    try {
      await this.fadeUi.out();
      // A dedicated encounter ends when Glen needs a rest; return to the
      // city's hospital rather than respawning inside an inactive battle HUD.
      if (this.levels.currentId === 'battle-curut') await this.levels.load(practice.level === 'battle-curut' ? 'training-room' : 'kota');
      const spot = this.health.hospital;
      if (spot && this.levels.currentId === 'kota') {
        this.player.velocity.set(0, 0, 0);
        this.levels.teleport(spot.x, 0, spot.z, spot.yaw);
      } else {
        this.player.respawn();
        this.cameraRig.snapBehind(this.player.facing);
      }
      this.health.fill();
      await this.fadeUi.in();
    } finally {
      this.levelControls = wasControls || this.levelControls;
      this.resting = false;
      this.updateControls();
    }
    await this.dialog.say(HealLines.semangat);
  }

  /** "Kembali ke tengah kota" (the city) or "Kembali ke tempat aman" (every other level). */
  private respawnHome(): void {
    const lv = this.levels.current;
    if (!lv) return;
    if (lv.id === 'kota') {
      const sp = lv.home ?? lv.spawn;
      this.levels.teleport(sp.x, sp.y, sp.z, sp.yaw ?? Math.PI);
    } else {
      this.player.respawn();
      this.cameraRig.snapBehind(this.player.facing);
      this.cameraRig.update(0, this.player.visualPosition, this.player);
    }
  }

  /** "Simpan": level, safe ground under the player, facing and mode go into the manual slot. */
  private saveSlot(slot: number): boolean {
    const lv = this.levels.current;
    if (!lv || this.levels.loading) return false;
    this.player.getSafeFeet(this.tmpFeet);
    const f = this.tmpFeet;
    this.save.setSlot({ level: lv.id, x: f.x, y: f.y, z: f.z, yaw: this.player.facing, mode: this.player.mode, t: Date.now() });
    return slot === this.save.activeSlot || this.save.previewChapter !== null ? true : this.save.saveToSlot(slot);
  }

  /** "Muat" of another slot: that slot becomes the active one and the page restarts on it (the start screen asks for one tap). */
  private reloadOnSlot(slot: number): void {
    this.save.persist();
    setActiveSlot(slot);
    skipTitleOnce();
    this.leaveFullscreen();
    window.location.reload();
  }

  private leaveFullscreen(): void {
    try {
      if (document.fullscreenElement) void document.exitFullscreen?.()?.catch?.(() => undefined);
    } catch {
      // ignore
    }
  }

  /** "Kembali ke Menu Utama": progress is saved, the page restarts on the title menu. */
  private toMainMenu(): void {
    this.save.persist();
    this.leaveFullscreen();
    window.location.assign(`${window.location.pathname}?menu=1`);
  }

  /** The title menu picked a game: start it inside that tap (audio unlock, pointer lock, fullscreen on touch). */
  startFromMenu(): void {
    document.documentElement.classList.add('from-title');
    this.hud?.startFromMenu();
  }

  /** The title menu's long-press on the logo: the parents' page. */
  openParents(): void {
    this.parents.show();
  }

  /** "Muat": back to the saved level and spot (the level is loaded first when it is another one). */
  private loadSlot(): void {
    const s = this.save.data.slot;
    if (!s || !this.levels.has(s.level)) return;
    void this.applySlot({ ...s });
  }

  private async applySlot(s: SlotSave): Promise<void> {
    if (this.levels.currentId !== s.level) await this.levels.load(s.level);
    if (this.levels.currentId !== s.level) return;
    this.levels.teleport(s.x, s.y + 0.3, s.z, s.yaw);
    if (this.transformAllowed) this.setPlayerMode(s.mode);
  }

  private setPaused(on: boolean): void {
    this.paused = on;
    this.audio.setGamePaused(on);
    if (on) this.sfx.stopAll();
    else if (this.player.flight.jetsOn) this.sfx.jetStart(false);
    if (!on) {
      this.accumulator = 0;
      this.clock.reset();
    }
  }

  /** Test helper: run `frames` virtual frames of exactly one fixed step each, then render once (unless `render` is false). */
  private advance(frames: number, render: boolean): void {
    for (let i = 0; i < frames; i++) {
      this.padClock += FIXED_DT * 1000;
      this.pollPad(this.padClock);
      this.input.update();
      this.cameraRig.handleInput();
      this.fixedStep(FIXED_DT);
      this.player.updateVisual(1, FIXED_DT);
      this.cameraRig.update(FIXED_DT, this.player.visualPosition, this.player);
      this.rings.update(FIXED_DT);
    }
    this.frameUpdate(frames * FIXED_DT);
    if (render) this.renderer.renderFrame(this.scene, this.cameraRig.camera);
    this.syncDebug();
  }

  /** Test helper: `advance` one frame at a time, flushing promise continuations in between. */
  private async advanceAsync(frames: number, render: boolean): Promise<void> {
    for (let i = 0; i < frames; i++) {
      this.advance(1, false);
      for (let k = 0; k < 8; k++) await Promise.resolve();
    }
    if (render) this.renderer.renderFrame(this.scene, this.cameraRig.camera);
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
    this.debug.groundY = pl.hasGroundBelow ? pl.groundBelowY : Number.NaN;
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
