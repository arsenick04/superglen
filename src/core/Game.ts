import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Physics, FIXED_DT } from './Physics';
import { Input } from '../input/Input';
import { KeyboardMouseSource } from '../input/KeyboardMouseSource';
import { Player } from '../player/Player';
import { ThirdPersonCamera, CameraConfig } from '../camera/ThirdPersonCamera';
import { GroundRings } from '../fx/GroundRings';
import { ModeController } from '../player/ModeController';
import type { PlayerMode } from '../player/PlayerConfig';
import { GLEN_BUTTONS, SUPERGLEN_BUTTONS } from '../ui/TouchControls';
import { TestArea } from '../world/TestArea';
import { Hud } from '../ui/Hud';
import { TouchSource } from '../input/TouchSource';
import { startGate } from './StartGate';
import { touchMode } from './TouchMode';

/** Max frame delta fed into the accumulator (s): avoids a "spiral of death" after a hitch. */
const MAX_FRAME_DT = 0.1;
/** Max physics steps per rendered frame. Leftover time is dropped. */
const MAX_SUBSTEPS = 5;

/** Read-only debug data for automated smoke tests and the browser console. */
export interface DebugHandle {
  fps: number;
  player: { x: number; y: number; z: number };
  grounded: boolean;
  started: boolean;
  touchUi: boolean;
  cameraYaw: number;
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
  readonly world: TestArea;
  readonly rings: GroundRings;
  readonly modeController: ModeController;
  private readonly touch: TouchSource | null = null;
  private readonly hud: Hud | null = null;
  private paused = false;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  private fpsFrames = 0;
  private fpsTime = 0;
  private readonly debug: DebugHandle = { fps: 0, player: { x: 0, y: 0, z: 0 }, grounded: false,
    started: false,
    touchUi: false,
    cameraYaw: 0,
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

    this.world = new TestArea();
    this.world.build(this.scene, this.physics);

    this.player = new Player(this.physics, this.input, this.scene);
    this.rings = new GroundRings(this.scene);
    this.modeController = new ModeController(this.player, this.input, (m) => this.onModeChange(m));
    this.player.onStomp((e) => {
      this.rings.spawn(e.x, e.y, e.z, e.radius, 0.4, 0xffc400);
      this.cameraRig.bump();
    });
    this.cameraRig = new ThirdPersonCamera(this.physics, this.input, this.player.collider);
    this.renderer.attachCamera(this.cameraRig.camera);

    // Settle the camera before the first frame.
    this.cameraRig.update(0, this.player.visualPosition, this.player);
    this.world.update(this.player.visualPosition);

    if (ui) this.hud = new Hud(ui, this.renderer.canvas);

    window.__superglen = this.debug;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
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

    const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0), MAX_FRAME_DT);
    this.lastTime = now;
    if (this.paused) return;

    this.input.update();
    this.cameraRig.handleInput();

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.fixedStep(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS && this.accumulator >= FIXED_DT) this.accumulator = 0;

    const alpha = this.accumulator / FIXED_DT;
    this.player.updateVisual(alpha, dt);
    this.cameraRig.update(dt, this.player.visualPosition, this.player);
    this.rings.update(dt);
    this.world.update(this.player.visualPosition);

    this.renderer.render(this.scene, this.cameraRig.camera);
    this.updateDebug(dt);
  };

  private fixedStep(dt: number): void {
    this.modeController.fixedUpdate();
    this.player.fixedUpdate(dt, this.cameraRig.yaw);
    this.physics.step();
    this.player.postStep();
    this.input.endFixedStep();
  }

  /** Mode switch side effects: touch layout and a quick golden flash ring. */
  private onModeChange(mode: PlayerMode): void {
    this.touch?.setLayout(mode === 'superglen' ? SUPERGLEN_BUTTONS : GLEN_BUTTONS);
    const f = this.player.getFeetPosition(this.feet);
    this.rings.spawn(f.x, f.y, f.z, 1.6, 0.35, 0xfff2a8, 1);
  }

  private readonly feet = new THREE.Vector3();

  private setPaused(on: boolean): void {
    this.paused = on;
    if (!on) this.accumulator = 0;
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
    this.world.update(this.player.visualPosition);
    if (render) this.renderer.render(this.scene, this.cameraRig.camera);
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
    this.debug.cameraYaw = this.cameraRig.yaw;
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
