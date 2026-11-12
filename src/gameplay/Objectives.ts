import * as THREE from 'three';
import type { Player } from '../player/Player';
import { EdgeArrow } from '../ui/EdgeArrow';
import { touchMode } from '../core/TouchMode';

/**
 * "Go there" marker without any text: a tall soft golden light beam (alpha-blended) with a bobbing arrow above it in the
 * world, plus a gold arrow on the screen edge that points toward the target while it is off-screen.
 *
 *   ctx.objectives.set(new Vector3(0, 0, -20));                  // show the marker
 *   ctx.objectives.set(pos, { radius: 2.5, onReach: () => ... }); // clear itself and call back on arrival
 *   await ctx.objectives.goTo(pos, 2.5);                          // resolves on arrival
 *   ctx.objectives.clear();
 *
 * Two meshes, no shadows. The marker is removed automatically when the level unloads
 * (a pending `goTo` then never resolves).
 */
export interface ObjectiveOptions {
  /** Arrive when the player is within this horizontal distance (m). Omit for a marker that never completes. */
  radius?: number;
  onReach?: () => void;
}

const BEAM_HEIGHT = 14;
const EDGE_MARGIN = 56;

export class Objectives {
  private readonly group = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private readonly arrow: THREE.Mesh;
  private readonly edge: EdgeArrow;
  private readonly target = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private options: ObjectiveOptions | null = null;
  private time = 0;
  private _active = false;
  private _offscreen = false;
  private readonly reducedMotion: boolean;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    root: HTMLElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly player: Player,
  ) {
    this.reducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Beam: open cylinder, vertex colours fade from gold (bottom) to black (top); additive blending makes black invisible.
    const geo = new THREE.CylinderGeometry(0.45, 0.8, BEAM_HEIGHT, 20, 1, true);
    geo.translate(0, BEAM_HEIGHT / 2, 0);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const k = 1 - pos.getY(i) / BEAM_HEIGHT; // 1 at the bottom, 0 at the top
      colors[i * 4] = 1;
      colors[i * 4 + 1] = 0.78;
      colors[i * 4 + 2] = 0.15;
      colors[i * 4 + 3] = 0.5 * k * k; // alpha fades out toward the top
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    // Normal alpha blending (additive washes out to white on bright skies).
    const beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    this.beam = new THREE.Mesh(geo, beamMat);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 3;

    // Arrow: a gold pyramid pointing down, floating above the ground at the target.
    const arrowGeo = new THREE.ConeGeometry(0.5, 1.0, 4);
    arrowGeo.rotateX(Math.PI);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false });
    this.arrow = new THREE.Mesh(arrowGeo, arrowMat);
    this.arrow.frustumCulled = false;
    this.arrow.renderOrder = 4;

    this.disposables.push(geo, beamMat, arrowGeo, arrowMat);
    this.group.add(this.beam, this.arrow);
    this.group.visible = false;
    scene.add(this.group);

    this.edge = new EdgeArrow(root);
  }

  get active(): boolean {
    return this._active;
  }

  /** True while the target is outside the screen (the edge arrow is shown). */
  get offscreen(): boolean {
    return this._offscreen;
  }

  get edgeArrowVisible(): boolean {
    return this.edge.visible;
  }

  get position(): Readonly<THREE.Vector3> {
    return this.target;
  }

  /** Show the marker at `target` (ground position; the vector is copied) or hide it with null. */
  set(target: THREE.Vector3 | null, opts?: ObjectiveOptions): void {
    if (!target) {
      this.clear();
      return;
    }
    this.target.copy(target);
    this.options = opts ?? null;
    this._active = true;
    this.group.visible = true;
    this.beam.position.copy(this.target);
    this.arrow.position.set(this.target.x, this.target.y + 3.4, this.target.z);
  }

  /** Show the marker and resolve when the player gets within `radius` metres (horizontal). */
  goTo(target: THREE.Vector3, radius = 2): Promise<void> {
    return new Promise<void>((resolve) => {
      this.set(target, { radius, onReach: resolve });
    });
  }

  clear(): void {
    this._active = false;
    this._offscreen = false;
    this.options = null;
    this.group.visible = false;
    this.edge.hide();
  }

  /** Once per fixed step: arrival check. */
  fixedUpdate(): void {
    if (!this._active || !this.options || this.options.radius === undefined) return;
    const p = this.player.visualPosition;
    const d = Math.hypot(p.x - this.target.x, p.z - this.target.z);
    if (d > this.options.radius) return;
    const cb = this.options.onReach;
    this.clear();
    if (cb) {
      try {
        cb();
      } catch (err) {
        console.error('Objective onReach failed:', err);
      }
    }
  }

  /** Once per rendered frame, after the camera moved. */
  update(dt: number): void {
    if (!this._active) return;
    this.time += dt;
    if (!this.reducedMotion) {
      this.arrow.position.y = this.target.y + 3.4 + Math.sin(this.time * 4) * 0.25;
      this.arrow.rotation.y += dt * 1.6;
      const s = 1 + Math.sin(this.time * 3) * 0.06;
      this.beam.scale.set(s, 1, s);
    }

    // Edge arrow: project the point above the target; camera space tells us if it is behind us.
    const cam = this.camera;
    this.tmp.set(this.target.x, this.target.y + 1.5, this.target.z).applyMatrix4(cam.matrixWorldInverse);
    const behind = this.tmp.z > -0.05;
    this.tmp.applyMatrix4(cam.projectionMatrix); // NDC (divides by w; mirrored when behind the camera)
    let nx = this.tmp.x;
    let ny = this.tmp.y;
    if (behind) {
      nx = -nx;
      ny = -ny;
    }
    const onScreen = !behind && Math.abs(nx) < 0.94 && Math.abs(ny) < 0.92;
    this._offscreen = !onScreen;
    if (onScreen) {
      this.edge.hide();
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const touch = touchMode.active;
    // On touch keep the arrow out of the lower part (joystick and buttons live there).
    const minX = EDGE_MARGIN;
    const maxX = w - EDGE_MARGIN;
    const minY = EDGE_MARGIN + (touch ? 24 : 0);
    const maxY = touch ? h * 0.6 : h - EDGE_MARGIN;
    const cx = w / 2;
    const cy = (minY + maxY) / 2;
    // Direction in pixels (y down). A target straight behind has nx ~ 0: send it to the bottom/side by default.
    let dx = nx * (w / 2);
    let dy = -ny * (h / 2);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
    const sx = dx === 0 ? Infinity : (dx > 0 ? maxX - cx : cx - minX) / Math.abs(dx);
    const sy = dy === 0 ? Infinity : (dy > 0 ? maxY - cy : cy - minY) / Math.abs(dy);
    const s = Math.min(sx, sy);
    dx *= s;
    dy *= s;
    // Clockwise angle from "up" of the direction (dx, dy) in screen space.
    this.edge.showAt(cx + dx, cy + dy, Math.atan2(dx, -dy));
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
  }
}
