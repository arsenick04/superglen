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

/** Thin wrapper around the Rapier world. RAPIER.init() must have resolved before construction. */
export class Physics {
  readonly world: RAPIER.World;
  /** Bodies created for the current level (statics via addFixed*, anything passed to `track`). */
  private readonly levelBodies = new Set<RAPIER.RigidBody>();

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: WORLD_GRAVITY, z: 0 });
    this.world.timestep = FIXED_DT;
  }

  step(): void {
    this.world.step();
  }

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
