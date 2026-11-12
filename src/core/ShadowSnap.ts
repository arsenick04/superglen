import * as THREE from 'three';

/**
 * Keeps a shadow-casting directional light centred on the player WITHOUT shadow swimming.
 *
 * A sun that follows the player by arbitrary amounts re-renders the shadow map from a slightly different
 * sub-texel position every frame, so every shadow edge in the scene shimmers while you walk (reads as judder).
 * Here the focus is quantised in the light's own view plane to whole shadow-map texels: the map then shifts in
 * exact texel steps and the texels of static geometry stay the same, so the shadows do not crawl. Directional
 * light, so the tiny offset (< 1 texel) changes nothing visible. No allocations after construction.
 */
export class ShadowFollower {
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly snapped = new THREE.Vector3();
  /** Tests switch the snapping off to measure the shimmer it removes. */
  static snapEnabled = true;
  /** World size of one shadow-map texel (m). */
  readonly texel: number;

  constructor(
    private readonly light: THREE.DirectionalLight,
    private readonly offset: THREE.Vector3,
    halfSize: number,
    mapSize: number,
  ) {
    this.texel = (halfSize * 2) / mapSize;
    // The light camera looks from (target + offset) at the target with world up (0,1,0): x = up x dir, y = dir x x.
    const dir = offset.clone().normalize();
    this.right.set(0, 1, 0).cross(dir).normalize();
    this.up.crossVectors(dir, this.right);
  }

  /** Move the light (and its target) to follow `focus`, snapped to the shadow-map texel grid. */
  follow(focus: THREE.Vector3): void {
    const t = ShadowFollower.snapEnabled ? this.texel : 1e-9;
    const a = focus.dot(this.right);
    const b = focus.dot(this.up);
    const da = Math.round(a / t) * t - a;
    const db = Math.round(b / t) * t - b;
    this.snapped.copy(focus).addScaledVector(this.right, da).addScaledVector(this.up, db);
    this.light.target.position.copy(this.snapped);
    this.light.position.copy(this.snapped).add(this.offset);
  }
}
