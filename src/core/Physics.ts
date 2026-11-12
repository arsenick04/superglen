import RAPIER from '@dimforge/rapier3d-compat';

/** Fixed physics step (s). The game loop always advances physics by exactly this much. */
export const FIXED_DT = 1 / 60;

/**
 * World gravity (m/s^2) for dynamic bodies (balls, props added later).
 * The player is kinematic and applies its own gravity (ModeTunings.gravityUp in player/PlayerConfig).
 */
export const WORLD_GRAVITY = -25;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuatLike extends Vec3Like {
  w: number;
}

export interface StaticBodyHandle {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

/** The Rapier world's internals that `Physics.step` hands to the pipeline directly. */
interface FastWorld {
  physicsPipeline: { step: (...args: unknown[]) => void };
  gravity: unknown;
  integrationParameters: unknown;
  islands: unknown;
  broadPhase: unknown;
  narrowPhase: unknown;
  bodies: unknown;
  colliders: unknown;
  softBodies: unknown;
  impulseJoints: unknown;
  multibodyJoints: unknown;
  ccdSolver: unknown;
}

/** Thin wrapper around the Rapier world. RAPIER.init() must have resolved before construction. */
export class Physics {
  readonly world: RAPIER.World;
  /** Bodies created for the current level (statics via addFixed*, anything passed to `track`). */
  private readonly levelBodies = new Set<RAPIER.RigidBody>();

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: WORLD_GRAVITY, z: 0 });
    this.world.timestep = FIXED_DT;
  }

  /**
   * One fixed step. `World.step()` also re-scans every body and collider in JavaScript after each step (to wrap
   * objects the engine created by itself, which only happens with soft bodies): about 25 bytes of garbage per body
   * and per collider per step, i.e. ~35 KB per frame in the story level and a steady stream of small garbage
   * collections. We create and remove everything through the world, so the wrappers are always up to date; call
   * the pipeline directly. Falls back to `world.step()` if this Rapier build looks different.
   */
  step(): void {
    const w = this.world as unknown as FastWorld;
    const p = w.physicsPipeline;
    if (this.fastStep && p && typeof p.step === 'function') {
      p.step(w.gravity, w.integrationParameters, w.islands, w.broadPhase, w.narrowPhase, w.bodies, w.colliders, w.softBodies, w.impulseJoints, w.multibodyJoints, w.ccdSolver);
    } else {
      this.world.step();
    }
  }

  private readonly fastStep = new URLSearchParams(window.location.search).get('faststep') !== '0';

  /** Fixed box. `half` = half extents, `center` = world center, `rotation` optional quaternion. */
  addFixedCuboid(half: Vec3Like, center: Vec3Like, rotation?: QuatLike): StaticBodyHandle {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z);
    if (rotation) desc.setRotation(rotation);
    const body = this.world.createRigidBody(desc);
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z), body);
    this.levelBodies.add(body);
    return { body, collider };
  }

  /** Fixed upright (Y-axis) cylinder. `center` = world center. */
  addFixedCylinder(halfHeight: number, radius: number, center: Vec3Like, rotation?: QuatLike): StaticBodyHandle {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z);
    if (rotation) desc.setRotation(rotation);
    const body = this.world.createRigidBody(desc);
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight, radius), body);
    this.levelBodies.add(body);
    return { body, collider };
  }

  /** Register a level-owned body (e.g. a dynamic ball) so `disposeLevelBodies` removes it. */
  track(body: RAPIER.RigidBody): void {
    this.levelBodies.add(body);
  }

  /** Remove every tracked body and its colliders. The player's own body is never tracked. */
  disposeLevelBodies(): void {
    for (const b of this.levelBodies) this.world.removeRigidBody(b);
    this.levelBodies.clear();
  }

  /**
   * Make freshly added colliders visible to scene queries (ray/shape casts, character controller):
   * Rapier updates its broad-phase only inside `step()`. Call after building a level, before placing the player.
   */
  refreshQueries(): void {
    this.world.step();
  }

  get colliderCount(): number {
    return this.world.colliders.len();
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }

  dispose(): void {
    this.world.free();
  }
}
