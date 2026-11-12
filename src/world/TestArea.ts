import { ShadowFollower } from '../core/ShadowSnap';
import * as THREE from 'three';
import { Quality } from '../core/Quality';
import { ModeController } from '../player/ModeController';
import { PlayerConfig } from '../player/PlayerConfig';
import type { Level, LevelContext } from './Level';
import type { Player } from '../player/Player';
import type { StaticProps } from './StaticProps';
import type { Physics } from '../core/Physics';
import { PracticeTarget } from '../gameplay/props/PracticeTarget';
import { FlyRing } from '../gameplay/props/FlyRing';
import { BallThrower } from '../gameplay/props/BallThrower';

const SKY_COLOR = 0x8fd3ff; // cheerful morning sky
const GROUND_SIZE = 60;

/**
 * Flat test area: 60 x 60 m ground, morning lighting, sun shadows that follow the player.
 * Obstacle course is built in `buildProps()`.
 */
export class TestArea implements Level {
  readonly id = 'test';
  readonly spawn = { x: PlayerConfig.spawn.x, y: PlayerConfig.spawn.y, z: PlayerConfig.spawn.z };

  private sun!: THREE.DirectionalLight;
  private follower!: ShadowFollower;
  private readonly sunOffset = new THREE.Vector3(12, 22, 8);
  private player!: Player;
  private modeController!: ModeController;
  private readonly practice: PracticeTarget[] = [];
  private readonly rings: FlyRing[] = [];
  private thrower: BallThrower | null = null;
  private info: Record<string, number | string | boolean> | null = null;

  build(ctx: LevelContext): void {
    const { scene, root, physics } = ctx;
    this.player = ctx.player;
    scene.background = new THREE.Color(SKY_COLOR);
    scene.fog = new THREE.Fog(SKY_COLOR, Quality.cameraFar * 0.45, Quality.cameraFar * 0.95);

    this.buildLights(root);
    this.buildGround(root, physics);
    this.buildProps(ctx.props);
    this.buildSkillsCorner(ctx);
    this.info = ctx.game.debugInfo;

    // The test area owns the TEMPORARY Glen <-> Superglen toggle (E / star) and the full button sets.
    ctx.game.setLegacyTestControls(true);
    this.modeController = new ModeController(ctx.player, ctx.input, (m) => ctx.game.setPlayerMode(m));

    // Superglen's skills are all unlocked here (not saved), and flights stay inside the 60 x 60 m field.
    ctx.game.setSkills({ laser: true, shield: true, fly: true });
    ctx.player.flight.maxFlyHeight = 12;
    ctx.player.flight.bounds = { minX: -28.5, maxX: 28.5, minZ: -28.5, maxZ: 28.5 };
  }

  fixedUpdate(dt: number): void {
    this.modeController.fixedUpdate();
    let hits = 0;
    let down = 0;
    for (const t of this.practice) {
      t.tick(dt);
      hits += t.hits;
      if (t.isDown) down++;
    }
    for (const r of this.rings) r.tick(dt);
    this.thrower?.tick(dt);
    const info = this.info;
    if (info) {
      info.practiceHits = hits;
      info.practiceDown = down;
      info.throwerThrown = this.thrower ? this.thrower.thrown : 0;
      info.throwerReturned = this.thrower ? this.thrower.returned : 0;
    }
  }

  /** Keep the shadow-casting sun centered on the player. Call once per frame. */
  update(): void {
    this.follower.follow(this.player.visualPosition);
  }

  dispose(): void {
    // Everything lives under ctx.root / in StaticProps: the LevelManager cleans it up.
  }

  private buildLights(scene: THREE.Object3D): void {
    const hemi = new THREE.HemisphereLight(0xcfeeff, 0x6fae4f, 1.4);
    scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = Quality.shadows;
    if (Quality.shadows) {
      const s = this.sun.shadow;
      s.mapSize.set(Quality.shadowMapSize, Quality.shadowMapSize);
      const a = Quality.shadowArea;
      s.camera.left = -a;
      s.camera.right = a;
      s.camera.top = a;
      s.camera.bottom = -a;
      s.camera.near = 1;
      s.camera.far = 80;
      s.bias = -0.0005;
      s.normalBias = 0.03;
    }
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.follower = new ShadowFollower(this.sun, this.sunOffset, Quality.shadowArea, Quality.shadowMapSize);
  }

  private buildGround(scene: THREE.Object3D, physics: Physics): void {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: makeCheckerTexture(GROUND_SIZE / 4), roughness: 0.95 });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    scene.add(ground);

    // Collider: thick slab whose top face is y = 0.
    physics.addFixedCuboid({ x: GROUND_SIZE / 2, y: 0.5, z: GROUND_SIZE / 2 }, { x: 0, y: -0.5, z: 0 });
  }

  /**
   * Skills corner (east side, x 14..28, z 2..27: free of the obstacle course): five practice targets (one slowly moving,
   * one behind a wall for the line-of-sight test), a ball machine that throws every 3 s while the player is within 12 m,
   * and five hover rings in the air. Walk here from the spawn with D, then turn to W.
   */
  private buildSkillsCorner(ctx: LevelContext): void {
    const face = (x: number, z: number): number => Math.atan2(16 - x, 6 - z); // disc faces the entrance (16, 6)
    const add = (x: number, z: number, o: { height?: number; path?: [number, number][]; id: string }): void => {
      this.practice.push(
        new PracticeTarget(ctx, { x, z, yaw: face(x, z), height: o.height, path: o.path, speed: 1.2, resetAfter: 5, id: o.id }),
      );
    };
    add(20, 4, { id: 'near' });
    add(24.5, 9, { id: 'high', height: 2.6 });
    add(21, 13, { id: 'moving', path: [[17, 13], [26, 13]] });
    add(22, 20, { id: 'behindwall' });
    add(27, 5, { id: 'far' });
    // The wall hides the fourth target from the south (walk around it to shoot).
    ctx.props.box({ size: [6, 2.6, 0.4], position: [22, 1.3, 16.5], color: 0xff8fb1 });

    this.thrower = new BallThrower(ctx, { x: 26.5, z: 22, range: 12, interval: 3 });

    // A pergola on the west side: a real ceiling 4 m up to try the flight ceiling indoors (x -28..-22, z 15..21).
    for (const [px, pz] of [[-28, 15], [-22, 15], [-28, 21], [-22, 21]] as const) {
      ctx.props.box({ size: [0.3, 4, 0.3], position: [px, 2, pz], color: 0xffc94d });
    }
    ctx.props.box({ size: [6.6, 0.4, 6.6], position: [-25, 4.2, 18], color: 0xff8fb1 });

    const ringSpots: [number, number, number, number][] = [
      [18, 5, 9, 0],
      [22, 7, 13, Math.PI / 2],
      [26, 6.5, 9, 0],
      [21, 9, 22, Math.PI / 2],
      [16, 4.5, 21, 0],
    ];
    for (const [x, y, z, yaw] of ringSpots) {
      this.rings.push(
        new FlyRing(ctx, {
          x,
          y,
          z,
          yaw,
          onPass: () => {
            ctx.player.skills.stats.ringsPassed++;
          },
        }),
      );
    }
  }

  /**
   * Obstacle course (spawn is 0,0; w = -Z, d = +X). ~8 m around spawn stays clear.
   *  - Steps (x 0, z -10..-19): hold W from spawn.
   *  - 20 deg ramp + platform (x -12): hold A to x = -12, then W.
   *  - 55 deg ramp (x +12): hold D to x = +12, then W (must NOT be climbable).
   *  - Tall boxes + 1.5 m corridor (z +9..+16): walk backwards (S).
   *  - Poles (z -23), tall wall (x -22), border wall around the edge.
   */
  private buildProps(props: StaticProps): void {
    const RED = 0xff5a5f;
    const GOLD = 0xffc94d;
    const ORANGE = 0xff9f43;
    const TEAL = 0x2ec4b6;
    const BLUE = 0x4dabf7;
    const PINK = 0xff8fb1;

    // --- Low steps: autostep staircase (heights 0.15, 0.25, 0.30) ---
    props.box({ size: [3, 0.15, 3], position: [0, 0.075, -11.5], color: TEAL });
    props.box({ size: [3, 0.25, 3], position: [0, 0.125, -14.5], color: GOLD });
    props.box({ size: [3, 0.3, 3], position: [0, 0.15, -17.5], color: ORANGE });

    // --- Taller boxes (walk around, jump on later) ---
    // Narrow corridor: faces at x = -0.75 and +0.75 (1.5 m wide), z 12..16.
    props.box({ size: [2.5, 2, 4], position: [-2, 1, 14], color: RED });
    props.box({ size: [2.5, 1.2, 4], position: [2, 0.6, 14], color: BLUE });
    props.box({ size: [2, 2.5, 2], position: [10, 1.25, 10], color: GOLD });
    props.box({ size: [1.5, 1, 1.5], position: [-10, 0.5, 9], color: TEAL });
    props.box({ size: [2.5, 1.6, 2.5], position: [6, 0.8, 13], color: PINK });

    // --- 20 degree ramp up to a 1.2 m platform (5 x 5 m) ---
    this.buildRamp(props, { x: -12, platformFrontZ: -6, topY: 1.2, angleDeg: 20, width: 3, color: ORANGE });
    props.box({ size: [5, 1.2, 5], position: [-12, 0.6, -8.5], color: GOLD });

    // --- 55 degree ramp (too steep: player slides off) up to a 2 m block ---
    this.buildRamp(props, { x: 12, platformFrontZ: -9, topY: 2, angleDeg: 55, width: 3, color: RED });
    props.box({ size: [4, 2, 4], position: [12, 1, -11], color: BLUE });

    // --- Lion-dance poles: radius 0.3, heights 1 -> 3.5, 2 m apart ---
    const poleColors = [RED, GOLD, ORANGE, TEAL, BLUE, PINK];
    for (let i = 0; i < 6; i++) {
      const h = 1 + i * 0.5;
      props.cylinder({ radius: 0.3, height: h, position: [-5 + i * 2, h / 2, -23], color: poleColors[i] });
    }

    // --- 3 m tall wall, 10 m long, to test camera pull-in ---
    props.box({ size: [0.6, 3, 10], position: [-22, 1.5, 0], color: PINK });

    // --- Low border wall (0.6 m tall, 0.5 m thick) around the 60 x 60 edge ---
    const e = 29.75;
    props.box({ size: [60, 0.6, 0.5], position: [0, 0.3, -e], color: TEAL });
    props.box({ size: [60, 0.6, 0.5], position: [0, 0.3, e], color: TEAL });
    props.box({ size: [0.5, 0.6, 59], position: [-e, 0.3, 0], color: TEAL });
    props.box({ size: [0.5, 0.6, 59], position: [e, 0.3, 0], color: TEAL });
  }

  /**
   * Ramp rising toward -Z. Its top surface ends exactly at (x, topY, platformFrontZ) and its
   * lower end touches the ground (y = 0), so there is no lip at either end.
   */
  private buildRamp(
    props: StaticProps,
    o: { x: number; platformFrontZ: number; topY: number; angleDeg: number; width: number; color: number },
  ): void {
    const th = (o.angleDeg * Math.PI) / 180;
    const thickness = 0.4;
    const length = o.topY / Math.sin(th);
    const s = Math.sin(th);
    const c = Math.cos(th);
    // Centre of the top surface, then pushed down along the normal by half the thickness.
    const midY = o.topY - (length / 2) * s;
    const midZ = o.platformFrontZ + (length / 2) * c;
    props.box({
      size: [o.width, thickness, length],
      position: [o.x, midY - (thickness / 2) * c, midZ - (thickness / 2) * s],
      rotation: [th, 0, 0],
      color: o.color,
    });
  }
}

/** Soft two-tone grass checker (2 m tiles) so movement is easy to perceive on flat ground. */
function makeCheckerTexture(repeat: number): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#86d16a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#7bc75f';
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 4;
  return tex;
}
