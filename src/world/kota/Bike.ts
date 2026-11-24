import * as THREE from 'three';
import type { LevelContext } from '../Level';
import type { StaticBodyHandle } from '../../core/Physics';
import type { CityBike } from './CityPlaces';
import { box, cyl, merge, sph, type Part } from './ColorMesh';
import { BikeVisual, loadBikeTemplate } from './BikeModel';

/**
 * Bike tuning, in ONE place. Glen only (Superglen flies; the bike dismounts when he transforms or lifts off).
 *
 *  - `ride`: what `Player.ride` uses while riding. Faster than walking (Glen runs 5.0 m/s), a gentle start and stop (about a
 *    second to full speed), a wide smooth turn (the body turns at about 160 degrees a second, so it is hard to spin around).
 *  - There is NO jump on the bike: the big (jump) button rings the bell. Curbs of up to 0.3 m are still stepped over; the bike
 *    cannot climb (no jump, no mantle) and cannot fall over.
 */
export const BikeConfig = {
  ride: { runSpeed: 8.5, accel: 8, decel: 12, turnSpeed: 2.8 },
  /**
   * Visual lift of the rider (m). The pose itself (hips on the saddle, feet on the pedals, hands on the grips) comes from RideLayer;
   * this only has to be above 0.01 (that marks "riding" for the animation state).
   */
  lift: 0.02,
  /** Reach for the "get on" prompt (m). */
  mountRadius: 2.4,
  /** After getting off, the prompt of the parked bike waits this long (s), so one press cannot mount again at once. */
  remountCooldown: 0.5,
  /** A bike parked by hand is placed this far to the side of the player (m). */
  parkSide: 1.1,
  /** Parked bikes farther than this are hidden (m). */
  showRadius: 70,
  wheelRadius: 0.32,
  colors: [0xe8453c, 0x2ec4b6, 0xff9f43, 0xffd23f, 0x9b6bff, 0x4dabf7],
} as const;

const SKIN = 0.55; // capsule centre to feet (PlayerConfig.height / 2)

/** Parked bikes of this browser session (a level reload, the lab and back keep them where they were left). */
let SESSION: { x: number; y: number; z: number; yaw: number }[] | null = null;

function frameGeo(color: number): THREE.BufferGeometry {
  const R = BikeConfig.wheelRadius;
  const dark = 0x3a3a48;
  const side = Math.PI / 2;
  const wheel = (z: number): Part[] => [
    { g: cyl(R, R, 0.09, 12), c: 0x2d2a26, p: [0, R, z], r: [0, 0, side] },
    { g: cyl(R * 0.62, R * 0.62, 0.1, 10), c: 0xcfd6e4, p: [0, R, z], r: [0, 0, side] },
    { g: box(0.11, R * 1.2, 0.04), c: 0x6b7280, p: [0, R, z] },
    { g: box(0.11, 0.04, R * 1.2), c: 0x6b7280, p: [0, R, z] },
  ];
  return merge([
    ...wheel(0.57),
    ...wheel(-0.57),
    { g: box(0.07, 0.07, 0.95), c: color, p: [0, 0.52, 0.0], r: [0.12, 0, 0] },
    { g: box(0.06, 0.06, 0.6), c: color, p: [0, 0.36, -0.2], r: [-0.55, 0, 0] },
    { g: box(0.06, 0.3, 0.06), c: dark, p: [0, 0.6, -0.34], r: [0.15, 0, 0] },
    { g: box(0.16, 0.06, 0.34), c: 0x2d2a26, p: [0, 0.78, -0.38] },
    { g: box(0.06, 0.62, 0.06), c: color, p: [0, 0.6, 0.52], r: [-0.25, 0, 0] },
    { g: box(0.58, 0.05, 0.05), c: dark, p: [0, 0.9, 0.46] },
    { g: cyl(0.04, 0.04, 0.14, 6), c: 0xffffff, p: [0.31, 0.9, 0.46], r: [0, 0, Math.PI / 2] },
    { g: cyl(0.04, 0.04, 0.14, 6), c: 0xffffff, p: [-0.31, 0.9, 0.46], r: [0, 0, Math.PI / 2] },
    { g: sph(0.07, 8, 5), c: 0xffc94d, p: [0.12, 0.97, 0.46] },
    { g: box(0.05, R * 1.5, 0.05), c: dark, p: [0.1, R, 0.57] },
    { g: box(0.05, R * 1.5, 0.05), c: dark, p: [-0.1, R, 0.57] },
  ]);
}



interface Parked {
  group: THREE.Group;
  /** The blocky stand-in shown until bike.glb has loaded (or forever when it fails). */
  fallback: THREE.Mesh;
  visual: BikeVisual | null;
  parkedBody: StaticBodyHandle | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * The city's bikes. Parked ones stand where they were left; the hand icon (E / Square / the talk button) gets on (Glen only),
 * the same button gets off. On the bike the big button rings the bell. Everything is a few small meshes with the shared lit
 * material; nothing is created per frame.
 */
export class BikeSystem {
  private readonly bikes: Parked[] = [];
  private readonly promptPos = new THREE.Vector3();
  private readonly geos: THREE.BufferGeometry[] = [];
  private riding = -1;
  private cooldown = 0;
  /** Counters for tests. */
  mounts = 0;
  dismounts = 0;
  bells = 0;
  /** Called when a bike was taken or parked (the map redraws). */
  onChange: (() => void) | null = null;

  constructor(
    private readonly ctx: LevelContext,
    private readonly lit: THREE.Material,
    places: readonly CityBike[],
  ) {
    const spots = SESSION ?? places.map((b) => ({ x: b.x, y: b.y ?? 0, z: b.z, yaw: b.yaw }));
    SESSION = spots;
    spots.forEach((s, i) => {
      const body = new THREE.Mesh(frameGeo(BikeConfig.colors[i % BikeConfig.colors.length]), this.lit);
      this.geos.push(body.geometry);
      body.castShadow = false;
      const group = new THREE.Group();
      group.add(body);
      group.position.set(s.x, s.y, s.z);
      group.rotation.y = s.yaw;
      ctx.root.add(group);
      this.bikes.push({ group, fallback: body, visual: null, ...s, parkedBody: this.parkedBody(s) });
      ctx.interactions.add({
        position: () => this.position(i, this.promptPos),
        radius: BikeConfig.mountRadius,
        icon: 'hand',
        promptHeight: 1.3,
        enabled: () => this.riding < 0 && this.cooldown <= 0 && ctx.player.mode === 'glen' && this.bikes[i].group.parent === ctx.root,
        onInteract: () => this.mount(i),
      });
    });
    ctx.onDispose(() => this.dispose());
    void loadBikeTemplate().then((tpl) => {
      if (!tpl || this.disposed) return;
      this.bikes.forEach((b, i) => {
        const v = new BikeVisual(tpl, this.lit, BikeConfig.colors[i % BikeConfig.colors.length], ctx.player);
        this.geos.push(...v.geometries);
        b.group.remove(b.fallback);
        b.group.add(v.root);
        b.visual = v;
        if (this.riding === i) ctx.player.avatar.setRide(v);
        else v.rest();
      });
    });
  }

  private disposed = false;

  get isRiding(): boolean {
    return this.riding >= 0;
  }

  /** Parked bikes (x, z) for the map. */
  parked(): { x: number; z: number }[] {
    return this.bikes.filter((_, i) => i !== this.riding).map((b) => ({ x: b.x, z: b.z }));
  }

  /** All bikes as `id x z riding`, for tests. */
  list(): { x: number; z: number; riding: boolean }[] {
    return this.bikes.map((b, i) => ({ x: b.x, z: b.z, riding: i === this.riding }));
  }

  /** Per fixed step (before the player moves): get off, bell, automatic dismount. */
  fixedUpdate(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.riding < 0) return;
    const { player, input, game, dialog } = this.ctx;
    if (player.mode !== 'glen' || player.flight.isFlying) {
      this.dismount();
      return;
    }
    if (!game.controlsEnabled || dialog.active) return;
    if (input.wasPressed('interact')) this.dismount();
    else if (input.wasPressed('jump')) this.ring();
  }

  /** Per rendered frame: far parked bikes are hidden (one mesh per bike). */
  update(): void {
    const p = this.ctx.player.visualPosition;
    for (let i = 0; i < this.bikes.length; i++) {
      const b = this.bikes[i];
      if (i === this.riding) continue;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      b.group.visible = dx * dx + dz * dz < BikeConfig.showRadius * BikeConfig.showRadius;
    }
  }

  /** Test handle: the riding animation of the bike being ridden (null when not riding or the model is missing). */
  rideInfo(): { wheel: number; crank: number; steer: number; lean: number; stand: number; footDown: number; miss: number[]; w: number; feetNearPedals: boolean } | null {
    const v = this.riding >= 0 ? this.bikes[this.riding].visual : null;
    if (!v) return null;
    const rl = this.ctx.player.avatar.rig?.rideLayer;
    return {
      wheel: v.wheelAngle,
      crank: v.phase,
      steer: v.steerAngle,
      lean: v.lean,
      stand: v.stand,
      footDown: v.footDown,
      miss: rl ? Array.from(rl.miss) : [],
      w: rl?.w ?? 0,
      feetNearPedals: !!rl && rl.miss[0] < 0.05 && rl.miss[1] < 0.05,
    };
  }

  ring(): void {
    this.bells++;
    this.ctx.sfx.bell();
    const p = this.ctx.player.visualPosition;
    this.ctx.fx.sparkles.burst(p.x, p.y + 0.9, p.z, 5, 1.6, 0xffe27a, { gravity: 0, life: 0.5, up: 0.4 });
  }

  private parkedBody(b: Pick<Parked, 'x' | 'y' | 'z' | 'yaw'>): StaticBodyHandle {
    return this.ctx.physics.addFixedCuboid(
      { x: 0.31, y: 0.42, z: 0.89 },
      { x: b.x, y: b.y + 0.42, z: b.z },
      { x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) },
    );
  }

  private mount(i: number): void {
    if (this.riding >= 0 || this.ctx.player.mode !== 'glen' || !this.ctx.game.controlsEnabled) return;
    const { player, game } = this.ctx;
    const b = this.bikes[i];
    if (b.parkedBody) this.ctx.physics.removeBody(b.parkedBody.body);
    b.parkedBody = null;
    this.riding = i;
    this.mounts++;
    b.group.removeFromParent();
    b.group.position.set(0, -SKIN, 0);
    b.group.rotation.set(0, 0, 0);
    b.group.visible = true;
    player.object.add(b.group);
    player.ride = BikeConfig.ride;
    player.rideLift = BikeConfig.lift;
    if (b.visual) {
      b.visual.rest();
      b.visual.footDown = 0;
      player.avatar.setRide(b.visual);
    }
    game.setRiding(true);
    this.ctx.sfx.pop();
    this.ctx.fx.sparkles.burst(b.x, player.visualPosition.y - SKIN + 0.3, b.z, 6, 1.8, 0xffffff, { gravity: 1, life: 0.5, up: 0.5 });
    this.onChange?.();
  }

  /** Get off: the bike stays beside the player, where it is now. */
  private dismount(): void {
    if (this.riding < 0) return;
    const { player, game } = this.ctx;
    const i = this.riding;
    const b = this.bikes[i];
    const f = player.facing;
    const feetY = player.visualPosition.y - SKIN;
    b.x = player.visualPosition.x - Math.cos(f) * BikeConfig.parkSide;
    b.z = player.visualPosition.z + Math.sin(f) * BikeConfig.parkSide;
    b.y = Math.max(0, feetY);
    b.yaw = f;
    b.group.removeFromParent();
    b.group.position.set(b.x, b.y, b.z);
    b.group.rotation.set(0, b.yaw, 0);
    this.ctx.root.add(b.group);
    b.parkedBody = this.parkedBody(b);
    this.riding = -1;
    player.avatar.setRide(null);
    b.visual?.rest();
    this.cooldown = BikeConfig.remountCooldown;
    this.dismounts++;
    player.ride = null;
    player.rideLift = 0;
    game.setRiding(false);
    if (SESSION) SESSION[i] = { x: b.x, y: b.y, z: b.z, yaw: b.yaw };
    this.ctx.sfx.pop();
    this.onChange?.();
  }

  /** Where the prompt of bike `i` stands (it follows the bike). */
  position(i: number, out: THREE.Vector3): THREE.Vector3 {
    const b = this.bikes[i];
    return out.set(b.x, b.y + 0.5, b.z);
  }

  private dispose(): void {
    if (this.riding >= 0 && SESSION) {
      // Left the city on the bike (door, restart): park it where the player was.
      const p = this.ctx.player.visualPosition;
      SESSION[this.riding] = { x: p.x, y: 0, z: p.z, yaw: this.ctx.player.facing };
    }
    this.disposed = true;
    this.ctx.player.avatar.setRide(null);
    this.ctx.player.ride = null;
    this.ctx.player.rideLift = 0;
    for (const g of this.geos) g.dispose();
  }
}
