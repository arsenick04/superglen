import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { figureMaterial } from '../../player/Figure';
import { Avatar, type AvatarState } from '../../player/CharacterModels';
import { Easings } from '../../gameplay/Sequence';

/**
 * Nino for Chapter 2: walks on the floor and always turns to look at Glen.
 */
export class NinoActor {
  readonly group = new THREE.Group();
  /** Ground position (the visible group floats a little above it). */
  readonly pos = new THREE.Vector3();
  private readonly glow: THREE.Mesh;
  private readonly fig: Avatar;
  private readonly st: AvatarState = { speed: 0, airborne: false, vy: 0, flying: false, riding: false, talking: false };
  private t = 0;
  private yaw = 0;
  /** 0 = hovering, 1 = sitting on the ground. */
  sit = 0;
  /** Face this point instead of the player (e.g. while throwing balls); null = the player. */
  private readonly lookAt = new THREE.Vector3();
  private looking = false;
  private hopT = 9;
  private lastX = 0;
  private lastZ = 0;

  constructor(
    private readonly ctx: LevelContext,
    x: number,
    z: number,
  ) {
    this.fig = new Avatar('nino', figureMaterial(0x2a74c8, 0.08), false);
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.glow.position.y = 0.65;
    this.group.add(this.fig.root, this.glow);
    this.pos.set(x, 0, z);
    this.group.position.set(x, 0, z);
    this.lastX = x;
    this.lastZ = z;
    ctx.root.add(this.group);
    ctx.onDispose(() => this.fig.dispose());
  }

  /** Smooth glide to (x, z); resolves on arrival. */
  glideTo(x: number, z: number, duration = 1.6): Promise<void> {
    const sx = this.pos.x;
    const sz = this.pos.z;
    duration = Math.max(duration, Math.hypot(x - sx, z - sz) / 2.2);
    return this.ctx.seq.tween(
      duration,
      (u) => {
        this.pos.x = sx + (x - sx) * u;
        this.pos.z = sz + (z - sz) * u;
      },
      Easings.easeInOut,
    );
  }

  /** Jump to a spot without gliding. */
  placeAt(x: number, z: number): void {
    this.pos.x = x;
    this.pos.z = z;
  }

  /** A little hop (he "throws" a ball). */
  hop(): void {
    this.hopT = 0;
  }

  /** Wave or cheer for a moment. */
  emote(clip: 'cheer' | 'wave', secs = 2.5): void {
    this.fig.emote(clip, secs);
  }

  faceTowards(p: THREE.Vector3 | null): void {
    this.looking = p !== null;
    if (p) this.lookAt.copy(p);
  }

  update(dt: number): void {
    this.t += dt;
    const target = this.looking ? this.lookAt : this.ctx.player.visualPosition;
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let d = (want - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 6);
    this.group.rotation.y = this.yaw;
    let height = 0;
    if (this.hopT < 0.4) {
      this.hopT += dt;
      height += Math.sin(Math.min(1, this.hopT / 0.4) * Math.PI) * 0.4;
    }
    this.group.position.set(this.pos.x, height * (1 - this.sit), this.pos.z);
    this.glow.scale.setScalar(1 + 0.08 * Math.sin(this.t * 3));
    this.st.speed = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ) / Math.max(dt, 1 / 120);
    this.lastX = this.pos.x;
    this.lastZ = this.pos.z;
    this.st.airborne = height > 0.02;
    this.st.flying = false;
    this.st.talking = this.ctx.dialog.speaker === 'nino';
    this.st.vy = 0;
    this.fig.pose(dt, this.st);
  }
}
