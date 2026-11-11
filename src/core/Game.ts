import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Physics, FIXED_DT } from './Physics';
import { Input } from '../input/Input';
import { KeyboardMouseSource } from '../input/KeyboardMouseSource';
import { Player } from '../player/Player';
import { ThirdPersonCamera, CameraConfig } from '../camera/ThirdPersonCamera';
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
  private readonly hud: Hud | null = null;

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
  };

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.physics = new Physics();

    this.input = new Input();
    this.input.addSource(new KeyboardMouseSource(this.renderer.canvas, CameraConfig.mouseSensitivity));
    const ui = document.getElementById('ui');
    if (ui) this.input.addSource(new TouchSource(ui, () => touchMode.active));

    this.world = new TestArea();
    this.world.build(this.scene, this.physics);

    this.player = new Player(this.physics, this.input, this.scene);
    this.cameraRig = new ThirdPersonCamera(this.physics, this.input, this.player.collider);
    this.renderer.attachCamera(this.cameraRig.camera);

    // Settle the camera before the first frame.
    this.cameraRig.update(0, this.player.visualPosition);
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
    this.player.updateVisual(alpha);
    this.cameraRig.update(dt, this.player.visualPosition);
    this.world.update(this.player.visualPosition);

    this.renderer.render(this.scene, this.cameraRig.camera);
    this.updateDebug(dt);
  };

  private fixedStep(dt: number): void {
    this.player.fixedUpdate(dt, this.cameraRig.yaw);
    this.physics.step();
    this.player.postStep();
    this.input.endFixedStep();
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
    const p = this.player.visualPosition;
    this.debug.player.x = p.x;
    this.debug.player.y = p.y;
    this.debug.player.z = p.z;
    this.debug.grounded = this.player.grounded;
    this.debug.started = startGate.started;
    this.debug.touchUi = touchMode.active;
    this.debug.cameraYaw = this.cameraRig.yaw;
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
