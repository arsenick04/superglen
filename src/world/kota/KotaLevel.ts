import * as THREE from 'three';
import { CityDressing } from './CityDressing';
import { applySky } from './Sky';
import type { Level, LevelContext } from '../Level';
import { makeMaterials } from '../bab1/Batch';
import { makeCityMaterial } from './CityMaterial';
import { Quality } from '../../core/Quality';
import { ShadowFollower } from '../../core/ShadowSnap';
import { CITY, CITY_LAYOUT, FACE_VEC, KOTA_REACH, districtAt } from './CityData';
import { buildCity, type BuiltCity } from './CityBuilder';
import { ChunkStreamer, STREAM } from './ChunkStreamer';
import { CityHud } from './CityHud';
import { CityMap } from './CityMap';
import type { MapSource } from '../MapSource';
import { Chapter1Walk } from './Chapter1Walk';
import { sandboxActive, HILL_DOOR_SPOT, marketBattleSpawn, setArrival, takeArrival, travel } from '../progress';
import { CityD3 } from './CityD3';
import { CityLife } from './CityLife';
import { Chapter3 } from './Chapter3';
import { MARKET } from './Bab3Data';
import { Chapter4 } from './Chapter4';
import { Chapter5 } from './Chapter5';
import { Chapter6 } from './Chapter6';
import { Kit } from '../bab1/Kit';
import { JumpTutorial } from '../bab1/JumpTutorial';

/** Recipes are CPU-only and identical on every visit: built once per page. */
let BUILT: BuiltCity | null = null;

/**
 * KOTA BOTANICA (`?level=kota`): the open city for free roaming as Glen or Superglen. Data: CityData.ts (layout, routes,
 * colliders), visuals: CityBuilder.ts, streaming: ChunkStreamer.ts.
 *
 * The world edge is soft: walking or flying toward it eases the child back (Flight.groundBounds / bounds), behind that a forest
 * and a ring of steep hills; the ground goes on under all of it, and a fall still returns to the last safe spot.
 *
 * STORY (world/progress.ts has the flow):
 *   Chapter 1 not done: Glen only (no powers, no switch), start at the school, Chapter1Walk guides to the hill.
 *   Chapter 1 done:     the save's powers, the switch allowed; Chapter 2 done: every power.
 *   The door of the old building (`CITY_LAYOUT.lab.door`): reaching it discovers the building (map) and fires
 *   `onLabEntrance`; pressing at it fades into the lab (`enterLab`). Coming out of the lab arrives at `HILL_DOOR_SPOT`.
 *   `?level=kota` (debug, `flow.sandbox`): free roam as before (unless the save says Chapter 3 waits: then the story; `&free=1` forces it), every power, plaza spawn, no Chapter 1 walk.
 *
 * EXTENSION POINTS for D3 (coins, bike, people, missions, signposts): build them in `build()` after the streamer (chunk
 * colliders near the spawn are ready then), tick them in `fixedUpdate` / `update`; put static placement data into
 * CityData.ts (a Solid for anything with a collider, then `npm run check:reach`); guide with `ctx.objectives` (the map star
 * follows `map.goal()` -> `this.goal`, set it with `setGoal`). `this.story` is non-null only during Chapter 1.
 */
export class KotaLevel implements Level {
  readonly id = 'kota';
  spawn: { x: number; y: number; z: number; yaw: number } = { ...CITY_LAYOUT.spawn };
  /** "Kembali ke tengah kota": the plaza, whatever the spawn was. */
  readonly home = { ...CITY_LAYOUT.spawn };
  /** Story hook: the player reached the door of the hidden old Barongsai building (discovery). */
  onLabEntrance: (() => void) | null = null;
  /** Chapter 1's walk (null when Chapter 1 is done or in the debug free roam). */
  story: Chapter1Walk | null = null;
  /** Map star override (null: the star follows the objective beam). */
  private goalOverride: { x: number; z: number } | null = null;
  private storyLight = false;
  /** Show the beam on the door once the player is this far from it (between Chapter 1 and 2). */
  private doorBeam = false;
  /** Mini map and full map data (the old building shows only after it was found). */
  map: MapSource | undefined;
  private cityMap!: CityMap;
  /** Package D3 (coins, bikes, people, signposts): null during the Chapter 1 walk. */
  d3: CityD3 | null = null;
  /** D6 L14: ambient pedestrians, children and traffic (always, also during the Chapter 1 walk). */
  life: CityLife | null = null;
  /** Package D4: Chapter 3 (the market) while it is on: Chapter 2 done, Chapter 3 not (null otherwise). */
  ch3: Chapter3 | null = null;
  /** Package D5: Chapter 4 (Aara, the park clues, the figure) while it is on: Chapter 3 done, Chapter 4 not (null otherwise). */
  ch4: Chapter4 | null = null;
  /** Package L11b: Chapter 5 (Aara to the Lab, Ular Melar) while it is on: Chapter 4 done, Chapter 5 not (null otherwise). */
  ch5: Chapter5 | null = null;
  /** Chapter 6 (Gudang Pasar, Tikus Rakus) while it is on: Chapter 5 done, Chapter 6 not (null otherwise). */
  ch6: Chapter6 | null = null;

  private ctx!: LevelContext;
  /** The city's shared lit material (small story models use it: no new shader). */
  private lit!: THREE.Material;
  private cityLit!: THREE.Material;
  private streamer!: ChunkStreamer;
  private hud!: CityHud;
  private sun!: THREE.DirectionalLight;
  private dressing!: CityDressing;
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
    this.cityMap = new CityMap(() => ctx.save.data.discovered.lab);
    this.cityMap.goal = () => this.goalOverride ?? (ctx.objectives.active ? ctx.objectives.position : null);
    this.map = this.cityMap;
    ctx.audio.music.setScene('jelajah');
    const sandbox = sandboxActive(ctx.save);
    const bab1 = ctx.save.isChapterDone('bab1');
    const arrival = takeArrival('kota');
    {
      // Glen's hearts show in the city once Chapter 1 is behind him. The Rumah Sakit rest spot: on the pavement in front of it.
      const hb = CITY_LAYOUT.buildings.find((b) => b.kind === 'hospital');
      if (hb) {
        const [fx, fz] = FACE_VEC[hb.face];
        const half = hb.face < 2 ? hb.d / 2 : hb.w / 2;
        ctx.health.hospital = { x: hb.x + fx * (half + 3.2), z: hb.z + fz * (half + 3.2), yaw: Math.atan2(fx, fz) };
      }
      ctx.health.setShown(sandbox || bab1);
      ctx.onDispose(() => {
        ctx.health.hospital = null;
        ctx.health.setShown(false);
      });
    }
    if (!sandbox) ctx.save.setWhere('kota');
    if (sandbox || ctx.save.isChapterDone('bab2')) {
      // Free roam: every power on (not written to the save), the child may switch Glen <-> Superglen.
      game.setTransformAllowed(true);
      game.setPlayerMode(ctx.save.data.lastMode, false);
      game.setSkills({ laser: true, shield: true, fly: true });
    } else if (bab1) {
      // Between Chapter 1 and 2: the costume is his (the switch), the powers are what the save has unlocked.
      game.setTransformAllowed(true);
      game.setPlayerMode(ctx.save.data.lastMode, false);
    } else {
      // Chapter 1: Glen walking home from school, no powers yet.
      game.setTransformAllowed(false);
      game.setSkills({ laser: false, shield: false, fly: false });
      game.setPlayerMode('glen', false);
    }
    if (arrival === 'marketBattle') {
      this.spawn = marketBattleSpawn(ctx.save.data.bab3.step);
    } else if (arrival === 'homeMorning') {
      this.spawn = this.glenHomeSpot();
    } else if (arrival === 'hillDoor') {
      // Out of the old building: it is known now (the map shows it).
      this.spawn = { ...HILL_DOOR_SPOT };
      ctx.save.discoverLab();
    }
    else if (!sandbox && !bab1) this.spawn = { ...CITY_LAYOUT.chapter1.start };
    const P = CITY.playHalf;
    const box = { minX: -P, maxX: P, minZ: -P, maxZ: P, margin: CITY.boundsMargin, push: CITY.boundsPush };
    ctx.player.flight.maxFlyHeight = CITY.flyHeight;
    ctx.player.flight.bounds = box;
    ctx.player.flight.groundBounds = box;

    // Bright morning: sky, a long fog (the far layer is cheap), one shadow-casting sun that follows the player.
    scene.userData.cityDaylight = true;
    ctx.onDispose(() => { delete scene.userData.cityDaylight; });
    const sky = 0x9fd8ff;
    scene.background = new THREE.Color(sky);
    // Physical fog distances keep the same colour on touch and desktop; draw distance can still follow the preset.
    scene.fog = new THREE.Fog(0xc6e6fa, 140, 300);
    const hemi = new THREE.HemisphereLight(0xe1f3ff, 0xd3d9b5, 1.15);
    root.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffe2b4, 2.5); // warm morning sun
    // L18: HDRI sky + image-based light (Sky.ts). The hemisphere fill steps back (the sky light does its job), the sun warms up,
    // the fog takes the horizon colour of the picture.
    applySky(scene, () => {
      hemi.intensity = 1.0;
      hemi.groundColor.setHex(0xd3d9b5);
      this.sun.intensity = 2.15;
      this.sun.color.setHex(0xfff1d8);
      (scene.fog as THREE.Fog).color.setHex(0xc6e6fa);
    });
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
    this.lit = mats.lit;
    this.cityLit = makeCityMaterial();
    this.streamer = new ChunkStreamer(BUILT, physics, root, this.cityLit, mats.glow);
    // L18: buildings dressed with Kenney / owner models (one batched draw call + the custom buildings).
    this.dressing = new CityDressing(CITY_LAYOUT, root);
    ctx.onDispose(() => this.dressing.dispose());
    this.dressing.update(this.spawn.x, this.spawn.z, true);
    // The spawn's neighbourhood is complete before the player is placed (LevelManager refreshes the queries after build).
    const sp = this.spawn;
    this.streamer.ensureNear(sp.x, sp.z, STREAM.colIn);
    this.streamer.flushVisuals(sp.x, sp.z);
    // CityData keeps the jump-bar collider after Chapter 1. Keep its striped
    // visual too, otherwise returning players trip over an invisible bar.
    if (sandbox || bab1) {
      const b = CITY_LAYOUT.chapter1.bar;
      const kit = new Kit(ctx.physics, mats, true);
      new JumpTutorial(ctx, kit, ctx.fx.sparkles, { x: b.x, z: b.z, half: b.w / 2, h: b.h, plankDx: 1.6, collider: false, y: 0 });
      kit.build(root);
    }

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
        if (!ctx.save.data.discovered.lab) {
          ctx.save.discoverLab();
          this.cityMap.invalidate();
        }
        this.hud.show('Gedung Barongsai Tua', 0xc9a46f, true);
        ctx.game.debugInfo.labFound = true;
        this.onLabEntrance?.();
      },
    });
    // Going in: press at the door (hand icon). Works whenever the building is known (it is, once the zone above was reached).
    ctx.interactions.add({
      position: new THREE.Vector3(door.x, door.y + 0.2, door.z + 0.9),
      radius: 2.4,
      icon: 'hand',
      promptHeight: 1.9,
      enabled: () => ctx.save.data.discovered.lab || this.labFound,
      onInteract: () => this.enterLab(),
    });

    // D3: the city fills up once Chapter 1 is done (and in the free roam). Never during the Chapter 1 walk.
    if (sandbox || bab1) this.d3 = new CityD3(ctx, mats.lit, this.cityMap, () => ctx.save.data.interlude === '' && !this.doorBeam && !(this.ch3?.active ?? false) && !(this.ch4?.active ?? false) && !(this.ch5?.active ?? false) && !(this.ch6?.active ?? false));

    this.life = new CityLife(ctx);
    ctx.battle.setCity(this.life);
    ctx.onDispose(() => ctx.battle.setCity(null));
    this.hud = new CityHud(ctx.ui, CITY_LAYOUT.pois);
    ctx.onDispose(() => this.hud.dispose());
    this.hud.prime(sp.x, sp.z);
    this.hud.show('Kota Botanica', 0xf2b632, true);
    this.setupCostumeInterlude(arrival);

    if (!sandbox && !bab1) {
      // Chapter 1: guided walk from the school to the hill; the light in the old building shows from far away.
      this.story = new Chapter1Walk(ctx);
      this.storyLight = true;
      this.story.start();
      // The map star: the old building itself (the destination), not the next waypoint.
      const d = CITY_LAYOUT.lab.door;
      this.goalOverride = { x: d.x, z: d.z };
      ctx.onDispose(() => this.story?.dispose());
    } else if (!sandbox && arrival === 'hillDoor' && !ctx.save.isChapterDone('bab2') && ctx.save.data.interlude === '') {
      // Out of the lab between the chapters: the beam shows the way back in (Nino waits with Chapter 2), once the player
      // has walked a bit away (right at the door the camera would stand inside the beam).
      this.doorBeam = true;
      this.goalOverride = { x: door.x, z: door.z };
    }

    // D4: Chapter 3 (the market) follows Chapter 2. Never in the debug free roam.
    if (!sandbox && ctx.save.isChapterDone('bab2') && !ctx.save.isChapterDone('bab3')) {
      try {
        if ((window as unknown as { __SG_BREAK_CH3?: boolean }).__SG_BREAK_CH3 === true) throw new Error('test: Chapter 3 broken on purpose');
        this.ch3 = new Chapter3(ctx, {
          setGoal: (g) => this.setGoal(g),
          dropMission: () => this.d3?.people.drop(),
          finished: () => this.d3?.people.onChange?.(),
          placePlayer: (x, z, yaw) => this.placePlayer(x, z, yaw),
          afterParty: () => this.startCh4(),
        });
        this.ch3.start();
      } catch (err) {
        // Safety net: whatever goes wrong inside the chapter, the city still finishes building and the child is pointed to the market.
        const planned = (window as unknown as { __SG_BREAK_CH3?: boolean }).__SG_BREAK_CH3 === true;
        (planned ? console.warn : console.error)('Chapter 3 failed to start:', err);
        this.ch3 = null;
        this.setGoal({ x: MARKET.hub.x, z: MARKET.hub.z });
        ctx.objectives.set(new THREE.Vector3(MARKET.hub.x, 0, MARKET.hub.z));
        ctx.game.debugInfo.ch3Fallback = true;
      }
    } else if (!sandbox && ctx.save.isChapterDone('bab3') && !ctx.save.isChapterDone('bab4')) {
      this.startCh4();
    } else if (!sandbox && ctx.save.isChapterDone('bab4') && !ctx.save.isChapterDone('bab5')) {
      this.startCh5();
    } else if (!sandbox && ctx.save.isChapterDone('bab5') && !ctx.save.isChapterDone('bab6')) {
      this.startCh6();
    }

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

  /** Outside Glen's front door, clear of the house collider. */
  private glenHomeSpot(): { x: number; y: number; z: number; yaw: number } {
    const b = CITY_LAYOUT.buildings.find((x) => x.glen);
    if (!b) return { ...CITY_LAYOUT.spawn };
    const [fx, fz] = FACE_VEC[b.face];
    const half = b.face < 2 ? b.d / 2 : b.w / 2;
    return { x: b.x + fx * (half + 2.8), y: b.base, z: b.z + fz * (half + 2.8), yaw: Math.atan2(-fx, -fz) };
  }

  /** Chapter 1 ends at home; only the following morning may training begin. */
  private setupCostumeInterlude(arrival: ReturnType<typeof takeArrival>): void {
    const { ctx } = this;
    const state = ctx.save.data.interlude;
    if (state !== 'costume_home' && state !== 'costume_return') return;
    if (arrival === 'homeMorning') this.hud.show('Keesokan pagi', 0xf2b632, true);
    if (state === 'costume_return') {
      const d = CITY_LAYOUT.lab.door;
      this.setGoal({ x: d.x, z: d.z });
      ctx.objectives.set(new THREE.Vector3(d.x, d.y, d.z + 0.9));
      return;
    }
    const home = this.glenHomeSpot();
    this.setGoal({ x: home.x, z: home.z });
    ctx.objectives.set(new THREE.Vector3(home.x, home.y, home.z));
    ctx.interactions.add({
      position: new THREE.Vector3(home.x, home.y + 0.8, home.z),
      radius: 3,
      icon: 'hand',
      promptHeight: 1.7,
      enabled: () => ctx.save.data.interlude === 'costume_home',
      onInteract: () => {
        ctx.save.setInterlude('costume_return');
        setArrival('kota', 'homeMorning');
        void ctx.game.loadLevel('kota');
      },
    });
  }

  /** D5: Chapter 4 follows Chapter 3 (also when it was finished in an earlier session). */
  private startCh4(): void {
    if (this.ch4 || this.ctx.save.isChapterDone('bab4')) return;
    this.ch4 = new Chapter4(this.ctx, {
      setGoal: (g) => this.setGoal(g),
      dropMission: () => this.d3?.people.drop(),
      placePlayer: (x, z, yaw) => this.placePlayer(x, z, yaw),
      onDone: () => {
        this.setGoal(null);
        this.startCh5();
      },
    }, this.lit);
    this.ch4.start();
  }

  /** L11b: Chapter 5 follows Chapter 4 (also when it was finished in an earlier session). */
  private startCh5(): void {
    if (this.ch5 || this.ctx.save.isChapterDone('bab5')) return;
    this.ch5 = new Chapter5(this.ctx, {
      setGoal: (g) => this.setGoal(g),
      dropMission: () => this.d3?.people.drop(),
      onDone: () => {
        this.setGoal(null);
        this.d3?.people.onChange?.();
        this.startCh6();
      },
    }, this.lit);
    this.ch5.start();
  }

  /** Chapter 6 follows Chapter 5 (also when it was finished in an earlier session). */
  private startCh6(): void {
    if (this.ch6 || this.ctx.save.isChapterDone('bab6')) return;
    this.ch6 = new Chapter6(this.ctx, {
      setGoal: (g) => this.setGoal(g),
      dropMission: () => this.d3?.people.drop(),
      clearZone: (z) => {
        if (this.life) this.life.clearZone = z;
      },
      onDone: () => {
        this.setGoal(null);
        this.d3?.people.onChange?.();
      },
    });
    this.ch6.start();
  }

  /** Through the old building's door into the lab (fade). */
  enterLab(): void {
    if (!this.ctx.game.controlsEnabled) return;
    void travel(this.ctx.game, 'lab', 'labEntrance');
  }

  /** Map star (null: follow the objective beam). */
  setGoal(goal: { x: number; z: number } | null): void {
    this.goalOverride = goal;
  }

  /** Story helper: stand the player on the ground at (x, z) (colliders ready first) and swing the camera behind. */
  placePlayer(x: number, z: number, yaw: number): void {
    this.prepareTeleport(x, z);
    this.ctx.physics.refreshQueries();
    this.ctx.player.placeAt(x, 0, z, yaw);
    this.ctx.cameraRig.snapBehind(yaw);
  }

  prepareTeleport(x: number, z: number): void {
    this.streamer.ensureNear(x, z, STREAM.colIn);
    this.streamer.flushVisuals(x, z);
    this.dressing.update(x, z, true);
  }

  fixedUpdate(dt = 1 / 60): void {
    this.story?.fixedUpdate();
    this.ch3?.fixedUpdate(dt);
    this.ch4?.fixedUpdate(dt);
    this.ch5?.fixedUpdate(dt);
    this.ch6?.fixedUpdate(dt);
    this.d3?.fixedUpdate(dt);
    const p = this.ctx.player.position;
    if (this.doorBeam) {
      const d = CITY_LAYOUT.lab.door;
      const far = Math.hypot(p.x - d.x, p.z - d.z) > 12;
      if (far && !this.ctx.objectives.active) this.ctx.objectives.set(new THREE.Vector3(d.x, d.y, d.z + 0.9));
      else if (!far && this.ctx.objectives.active && Math.hypot(p.x - d.x, p.z - d.z) < 8) this.ctx.objectives.clear();
    }
    // Safety net: nothing near the player may be missing its colliders (teleports, respawns, very fast moves).
    if (this.streamer.ensureNear(p.x, p.z)) this.ctx.physics.refreshQueries();
  }

  update(dt: number): void {
    const p = this.ctx.player.visualPosition;
    this.t += dt;
    this.streamer.update(p.x, p.z);
    this.dressing.update(p.x, p.z);
    if (this.follower) this.follower.follow(p);
    else {
      this.sun.position.copy(p).add(this.sunOffset);
      this.sun.target.position.copy(p);
    }
    this.hud.update(dt, p.x, p.z);
    this.d3?.update(dt);
    this.life?.update(dt);
    this.ch3?.update(dt);
    this.ch4?.update(dt);
    this.ch5?.update(dt);
    this.ch6?.update(dt);
    const info = this.ctx.game.debugInfo;
    // Door glimmer: only near the old building (one tiny additive sphere).
    const door = CITY_LAYOUT.lab.door;
    // During Chapter 1 it is "the light in the old building" that calls Glen: bigger and seen from across the town.
    const far = this.storyLight ? 160 : 45;
    const near = Math.abs(p.x - door.x) < far && Math.abs(p.z - door.z) < far;
    this.glimmer.visible = near;
    if (near) {
      const k = 0.5 + 0.5 * Math.sin(this.t * 2.2);
      this.glimmerMat.opacity = 0.18 + 0.3 * k;
      const d = this.storyLight ? Math.max(1, Math.hypot(p.x - door.x, p.z - door.z) / 25) : 1;
      this.glimmer.scale.setScalar((0.8 + 0.35 * k) * Math.min(4, d));
    }
    if (this.story) {
      this.story.update(dt);
      info.storyStep = this.story.step;
      info.routeNext = this.story.next;
      info.routeLen = this.story.route.length;
      info.trail = this.story.trailCount;
      info.jumpDone = this.story.jumpDone;
      info.jumpHint = this.story.jump.hinting;
      info.plank = this.story.jump.plankShown;
      info.atDoor = this.story.atDoor;
    }

    const s = this.streamer.stats;
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
