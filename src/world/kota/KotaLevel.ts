import * as THREE from 'three';
import type { Level, LevelContext } from '../Level';
import { makeMaterials } from '../bab1/Batch';
import { Quality } from '../../core/Quality';
import { ShadowFollower } from '../../core/ShadowSnap';
import { CITY, CITY_LAYOUT, KOTA_REACH, districtAt } from './CityData';
import { buildCity, type BuiltCity } from './CityBuilder';
import { ChunkStreamer, STREAM } from './ChunkStreamer';
import { CityHud } from './CityHud';

/** Recipes are CPU-only and identical on every visit: built once per page. */
let BUILT: BuiltCity | null = null;

/**
 * KOTA BOTANICA (`?level=kota`): the open city for free roaming as Glen or Superglen. Data: CityData.ts (layout, routes,
 * colliders), visuals: CityBuilder.ts, streaming: ChunkStreamer.ts.
 *
 * The world edge is soft: walking or flying toward it eases the child back (Flight.groundBounds / bounds), behind that a forest
 * and a ring of steep hills; the ground goes on under all of it, and a fall still returns to the last safe spot.
 *
 * HOOK for the story (not wired yet): `onLabEntrance` fires when the player reaches the door of the old Barongsai building on
 * the hill (`CITY_LAYOUT.lab.door`).
 */
export class KotaLevel implements Level {
  readonly id = 'kota';
  readonly spawn = { ...CITY_LAYOUT.spawn };
  /** Story hook: the player stands at the door of the hidden old Barongsai building. */
  onLabEntrance: (() => void) | null = null;

  private ctx!: LevelContext;
  private streamer!: ChunkStreamer;
  private hud!: CityHud;
  private sun!: THREE.DirectionalLight;
  private follower: ShadowFollower | null = null;
  private readonly sunOffset = new THREE.Vector3(30, 45, 18);
  private glimmer!: THREE.Mesh;
  private glimmerMat!: THREE.MeshBasicMaterial;
  private t = 0;
  private labFound = false;
  private lastHud = '';
  private lastDistrict = '';

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    const { scene, root, physics, game } = ctx;
    ctx.audio.music.setScene('jelajah');
    // Free roam: every power on (not written to the save), the child may switch Glen <-> Superglen.
    game.setTransformAllowed(true);
    game.setPlayerMode(ctx.save.data.lastMode, false);
    game.setSkills({ laser: true, shield: true, fly: true });
    const P = CITY.playHalf;
    const box = { minX: -P, maxX: P, minZ: -P, maxZ: P, margin: CITY.boundsMargin, push: CITY.boundsPush };
    ctx.player.flight.maxFlyHeight = CITY.flyHeight;
    ctx.player.flight.bounds = box;
    ctx.player.flight.groundBounds = box;

    // Bright morning: sky, a long fog (the far layer is cheap), one shadow-casting sun that follows the player.
    const sky = 0x9fd8ff;
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(0xcfeaff, Quality.cameraFar * 0.35, Quality.cameraFar * 0.95);
    root.add(new THREE.HemisphereLight(0xdff2ff, 0x77b85a, 1.45));
    this.sun = new THREE.DirectionalLight(0xfff1d0, 2.4);
    this.sun.castShadow = Quality.shadows;
    if (Quality.shadows) {
      const s = this.sun.shadow;
      const a = Quality.shadowArea;
      s.mapSize.set(Quality.shadowMapSize, Quality.shadowMapSize);
      s.camera.left = -a;
      s.camera.right = a;
      s.camera.top = a;
      s.camera.bottom = -a;
      s.camera.near = 1;
      s.camera.far = 120;
      s.bias = -0.0005;
      s.normalBias = 0.03;
      this.follower = new ShadowFollower(this.sun, this.sunOffset, a, Quality.shadowMapSize);
    }
    root.add(this.sun, this.sun.target);

    BUILT ??= buildCity(CITY_LAYOUT);
    const mats = makeMaterials();
    this.streamer = new ChunkStreamer(BUILT, physics, root, mats.lit, mats.glow);
    // The spawn's neighbourhood is complete before the player is placed (LevelManager refreshes the queries after build).
    const sp = this.spawn;
    this.streamer.ensureNear(sp.x, sp.z, STREAM.colIn);
    this.streamer.flushVisuals(sp.x, sp.z);

    // The hidden old Barongsai building: a faint golden glimmer at its door and the hook zone.
    const door = CITY_LAYOUT.lab.door;
    this.glimmerMat = new THREE.MeshBasicMaterial({ color: 0xffd87a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.glimmer = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), this.glimmerMat);
    this.glimmer.position.set(door.x, door.y + 1.1, door.z + 0.2);
    root.add(this.glimmer);
    ctx.interactions.addZone({
      shape: 'sphere',
      center: new THREE.Vector3(door.x, door.y + 0.6, door.z + 0.8),
      radius: 2.6,
      once: false,
      onEnter: () => {
        this.labFound = true;
        this.hud.show('Gedung Barongsai Tua', 0xc9a46f, true);
        ctx.game.debugInfo.labFound = true;
        this.onLabEntrance?.();
      },
    });

    this.hud = new CityHud(ctx.ui, CITY_LAYOUT.pois);
    ctx.onDispose(() => this.hud.dispose());
    this.hud.prime(sp.x, sp.z);
    this.hud.show('Kota Botanica', 0xf2b632, true);

    const info = game.debugInfo;
    info.buildings = CITY_LAYOUT.buildings.length;
    info.footholds = KOTA_REACH.footholds.length;
    info.chunks = BUILT.chunks.length;
    info.chunkSize = CITY.chunk;
    info.playHalf = CITY.playHalf;
    info.labX = door.x;
    info.labY = door.y;
    info.labZ = door.z;
    info.labDist = Math.round(Math.hypot(door.x, door.z) * 10) / 10;
    info.labFound = false;
    info.farTris = Math.round((BUILT.far.reduce((a, r) => a + r.indices, 0) + BUILT.flat.indices) / 3);
    info.slotVerts = this.streamer.slotCapacity.join(',');
    let maxChunkTris = 0;
    for (const c of BUILT.chunks) maxChunkTris = Math.max(maxChunkTris, (c.lit.indices + c.deco.indices + c.glow.indices) / 3);
    info.maxChunkTris = Math.round(maxChunkTris);
    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      // Test-only: a few roofs per class (x, z, top) the smoke test drops the player onto.
      const pick = (cls: string): { id: string; x: number; z: number; top: number }[] =>
        CITY_LAYOUT.buildings
          .filter((b) => b.cls === cls)
          .filter((_, i) => i % 9 === 0)
          .map((b) => ({ id: b.id, x: b.x, z: b.z, top: b.base + b.wall }));
      info.roofSamples = JSON.stringify([...pick('house'), ...pick('ruko'), ...pick('landmark')]);
    }
  }

  fixedUpdate(): void {
    const p = this.ctx.player.position;
    // Safety net: nothing near the player may be missing its colliders (teleports, respawns, very fast moves).
    if (this.streamer.ensureNear(p.x, p.z)) this.ctx.physics.refreshQueries();
  }

  update(dt: number): void {
    const p = this.ctx.player.visualPosition;
    this.t += dt;
    this.streamer.update(p.x, p.z);
    if (this.follower) this.follower.follow(p);
    else {
      this.sun.position.copy(p).add(this.sunOffset);
      this.sun.target.position.copy(p);
    }
    this.hud.update(dt, p.x, p.z);
    // Door glimmer: only near the old building (one tiny additive sphere).
    const door = CITY_LAYOUT.lab.door;
    const near = Math.abs(p.x - door.x) < 45 && Math.abs(p.z - door.z) < 45;
    this.glimmer.visible = near;
    if (near) {
      const k = 0.5 + 0.5 * Math.sin(this.t * 2.2);
      this.glimmerMat.opacity = 0.18 + 0.3 * k;
      this.glimmer.scale.setScalar(0.8 + 0.35 * k);
    }

    const s = this.streamer.stats;
    const info = this.ctx.game.debugInfo;
    info.visLoaded = s.visLoaded;
    info.visLoading = s.visLoading;
    info.colChunks = s.colLoaded;
    info.colBodies = s.colBodies;
    info.visLoads = s.visLoads;
    info.visUnloads = s.visUnloads;
    info.colLoads = s.colLoads;
    info.colUnloads = s.colUnloads;
    info.syncLoads = s.syncLoads;
    info.maxVisLoaded = s.maxVisLoaded;
    info.maxColBodies = s.maxColBodies;
    info.chunkTris = s.chunkTris;
    const hud = this.hud.text;
    if (hud !== this.lastHud) info.hud = this.lastHud = hud;
    const d = districtAt(p.x, p.z).id;
    if (d !== this.lastDistrict) info.district = this.lastDistrict = d;
    info.labFound = this.labFound;
  }

  dispose(): void {
    // Meshes, slots and every collider live under ctx.root / the level's physics bodies: the LevelManager frees them.
  }
}
