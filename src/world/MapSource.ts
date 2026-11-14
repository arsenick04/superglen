/**
 * What a level hands the map views (mini map and full map). The picture is north-up: world -z is the top of the map,
 * +x the right. The static layer is drawn once into an offscreen canvas; only the player marker moves per frame.
 */
export interface MapSource {
  /** Half extent (m) of the square shown: x and z from -half to +half. */
  readonly half: number;
  /** Bumps when the static picture changes (a hidden place was found): the views redraw it once. */
  readonly version: number;
  /** Draw the whole static map into a `px` x `px` context. `big` (the full map) adds district and place names. */
  draw(g: CanvasRenderingContext2D, px: number, big: boolean): void;
  /** Test helper: world position of the hidden place while the map shows it, else null. */
  shownSecret?(): { x: number; z: number } | null;
}
