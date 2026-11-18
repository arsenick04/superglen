import type { Level, LevelContext } from '../Level';
import { makeMaterials } from './Batch';
import { Kit } from './Kit';
import * as THREE from 'three';
import { Z, LAB, LAB_FLOOR, HALL_HALF } from './Layout';
import { buildStreet } from './Street';
import { RoofList } from '../kits/Roofs';
import { BuildingExterior } from './Building';
import { Hall } from './Hall';
import { Lab } from './Lab';
import { JumpTutorial } from './JumpTutorial';
import { Sparkles } from './Fx';
import { Atmosphere, Flashlight, type Zone } from './Lighting';
import { FunnyFx } from './FunnyFx';
import { LabDoor } from './LabDoor';
import { Story } from './Story';
import { LabVisit } from './LabVisit';
import { StreetFx } from './StreetFx';
import { NinoTerminal } from '../../gameplay/props/NinoTerminal';
import { STREET_REACH, STREET_BUILDINGS, BODY, SCHOOL, streetRoutes } from './StreetData';
import { flow, takeArrival, travel, LAB_EXIT_TARGET } from '../progress';
import { DOOR_HALF } from './Layout';

/** Where Nino's quiz terminal stands in the lab (left of the entrance path). */
export const TERMINAL_LAB = { x: -2.8, z: -64.6 } as const;

/** Lab mode: where the player stands just inside the front door, and the walk-out zone in the doorway. */
const ENTRY = { x: 0, z: Z.facade - 2.5 } as const;
const EXIT_Z = Z.facade + 1.2;

/**
 * Bab 1: Komputer Kuno Barongsai, inside the old Barongsai building. Two modes:
 *
 *   'lab'     (level id `lab`, the story): the dim hall, the panel, the laboratory, Nino and the costume. The street part of
 *             Chapter 1 happens in the city (kota/Chapter1Walk.ts); the front doorway is bright daylight, walking out of it
 *             fades to the city at the hill door. Returning players start in the finished lab (or at the door / the
 *             hangar door, depending on how they came in: progress.ts `Arrival`).
 *   'street'  (level id `bab1street`, debug only: `?level=bab1street`): the old standalone chapter along -Z (street with the
 *             jump lesson, the building outside, then the same hall and lab). Kept for the street parkour tests.
 *
 * Story script: Story.ts. Layout constants: Layout.ts.
 */
export class Bab1Level implements Level {
  readonly id: string;
  spawn: { x: number; y: number; z: number; yaw?: number } = { x: 0, y: 0, z: 0, yaw: Math.PI };

  constructor(private readonly mode: 'lab' | 'street' = 'lab') {
    this.id = mode === 'lab' ? 'lab' : 'bab1street';
  }

  private ctx!: LevelContext;
  private atmosphere!: Atmosphere;
  private flashlight!: Flashlight;
  private sparkles!: Sparkles;
  private exterior!: BuildingExterior;
  private hall!: Hall;
  private lab!: Lab;
  private jump: JumpTutorial | null = null;
  private funny!: FunnyFx;
  private door!: LabDoor;
  private story!: Story;
  private streetFx: StreetFx | null = null;
  private leaving = false;
  private terminal!: NinoTerminal;
  /** Chapter 5: Aara meets Nino here (null otherwise). */
  private visit: LabVisit | null = null;
  private done = false;
  /** Sample points of every walkable roof / top (published to the smoke test only). */
  private readonly roofs = new RoofList();

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    const { root, physics, scene } = ctx;
    this.done = ctx.save.isChapterDone('bab1');
    const lab = this.mode === 'lab';
    const arrival = takeArrival(this.id);
    if (lab && !flow.sandbox) ctx.save.setWhere('lab');
    // Voice files of the chapter (if any) load in the background; the music starts with the first tap.
    ctx.audio.preload(ctx.dialog.idsWithPrefix('bab1_'));
    ctx.audio.music.setScene('jelajah');
    // First visit: no powers yet. Afterwards the unlocked ones (from the save) stay on.
    if (!this.done) ctx.game.setSkills({ laser: false, shield: false, fly: false });
    // The star (touch) / Q (PC) back to Glen exists from the moment of the costume on (Story.transform) and for returning players.
    ctx.game.setTransformAllowed(this.done);
    // The lab is small: flying is harmless (low ceiling, a flight box around the whole walkable area).
    ctx.player.flight.maxFlyHeight = 4.5;
    ctx.player.flight.bounds = { minX: -13, maxX: 13, minZ: Z.labBack + 0.8, maxZ: lab ? Z.facade + 2 : 8 };

    this.atmosphere = new Atmosphere(scene, root);
    this.sparkles = new Sparkles(root);
    this.flashlight = new Flashlight(root);

    // Ground: one slab for the street and plaza, one exactly under the hall, a lower one exactly under the lab. There is
    // NO floor beside the buildings: someone who reaches the roofs and jumps off outside falls into the ravine and is
    // returned to the last safe spot (an outside yard would be a place to get stuck).
    const zFacade = Z.facade - 0.6;
    const zHall = Z.hallBack - 0.6;
    const zLab = Z.labBack - 1;
    // Lab mode: only a porch outside the door (the walk-out zone is on it); street mode: the whole street and plaza.
    const zFront = lab ? Z.facade + 3 : 9;
    physics.addFixedCuboid({ x: lab ? HALL_HALF + 0.6 : 20, y: 0.5, z: (zFront - zFacade) / 2 }, { x: 0, y: -0.5, z: (zFront + zFacade) / 2 });
    physics.addFixedCuboid({ x: HALL_HALF + 0.6, y: 0.5, z: (zFacade - zHall) / 2 }, { x: 0, y: -0.5, z: (zFacade + zHall) / 2 });
    physics.addFixedCuboid({ x: 7.6, y: 0.5, z: (zHall - zLab) / 2 }, { x: 0, y: LAB_FLOOR - 0.5, z: (zHall + zLab) / 2 });

    const mats = makeMaterials();
    const street = new Kit(physics, mats, true);
    const building = new Kit(physics, mats, true);
    const hallKit = new Kit(physics, mats, false);
    const labKit = new Kit(physics, mats, false);
    for (const k of [street, building, hallKit, labKit]) k.roofs = this.roofs;

    const pk = lab ? null : buildStreet(street);
    if (!lab) this.jump = new JumpTutorial(ctx, street, this.sparkles);
    this.exterior = new BuildingExterior(building, root, this.sparkles);
    this.hall = new Hall(ctx, hallKit, this.sparkles);
    this.lab = new Lab(ctx, labKit, this.sparkles);
    if (this.testInfo) (window as unknown as { __lab?: Lab }).__lab = this.lab;
    this.door = new LabDoor(ctx, labKit, this.sparkles);
    if (!lab) this.streetFx = new StreetFx(ctx, this.sparkles);
    if (lab) this.buildExit(ctx);
    if (this.testInfo && pk && this.streetFx) {
      ctx.game.debugInfo.roofs = this.roofs.json();
      // Layout data for the smoke test: the climbable footholds (drawn size, top), the route of each building, the coins.
      ctx.game.debugInfo.street = JSON.stringify({
        footholds: STREET_REACH.footholds.map((f) => ({ id: f.id, x: f.center[0], z: f.center[2], w: f.size[0], d: f.size[2], top: f.center[1] + f.size[1] / 2 })),
        built: pk.footholds.map((f) => f.id),
        routes: streetRoutes(),
        buildings: [
          ...STREET_BUILDINGS.map((b) => ({ id: b.id, cls: b.cls, level: b.level, wall: b.wall, x: b.roof.cx, z: b.z, w: BODY[b.cls].w, d: BODY[b.cls].d, roof: b.roof.id })),
          { id: 'school', cls: 'ruko', level: 2, wall: SCHOOL.roofTop, x: 0, z: SCHOOL.roofZ, w: SCHOOL.roofW, d: SCHOOL.roofD, roof: 'schoolRoof' },
          { id: 'barongsai', cls: 'landmark', level: 4, wall: 11.9, x: 0, z: -49, w: 9, d: 9, roof: 'barongsaiRoof2' },
        ],
        coins: this.streetFx.coinPositions(),
        coinOn: Object.fromEntries(STREET_REACH.coins.map((c) => [c.id, c.on])),
      });
    }
    street.build(root);
    building.build(root);
    hallKit.build(root);
    labKit.build(root);

    // Nino's terminal in the lab: appears once Chapter 1 is done ("mix" of all categories).
    this.terminal = new NinoTerminal(ctx, { x: TERMINAL_LAB.x, y: LAB_FLOOR, z: TERMINAL_LAB.z, category: 'mix', enabled: () => ctx.save.isChapterDone('bab1') });
    this.funny = new FunnyFx(root, ctx.player, this.sparkles);
    this.story = new Story({
      ctx,
      lab: this.lab,
      hall: this.hall,
      jump: this.jump,
      sparkles: this.sparkles,
      exit: lab ? { x: 0, z: Z.facade + 0.8 } : null,
      atmosphere: this.atmosphere,
      flashlight: this.flashlight,
      funny: this.funny,
      door: this.door,
    });

    if (this.done) {
      if (arrival === 'labEntrance') {
        this.spawn = { x: ENTRY.x, y: 0, z: ENTRY.z, yaw: Math.PI };
        this.atmosphere.snap(1);
      } else {
        this.spawn = { x: 0, y: LAB_FLOOR, z: -65, yaw: Math.PI };
        this.atmosphere.snap(2);
      }
      this.story.setupReturning(arrival === 'labFromHangar');
      const b5 = ctx.save.data.bab5.step;
      if (lab && !flow.sandbox && ctx.save.data.interlude === 'snake_lab') {
        this.visit = new LabVisit(ctx, this.lab, mats.lit, { x: 0, z: Z.facade + 0.8 }, 'snakeCelebration');
        this.visit.start();
      } else if (lab && !flow.sandbox && ctx.save.isChapterDone('bab4') && !ctx.save.isChapterDone('bab5') && (b5 === 'lab' || b5 === 'walk')) {
        this.visit = new LabVisit(ctx, this.lab, mats.lit, { x: 0, z: Z.facade + 0.8 });
        this.visit.start();
      }
    } else if (lab) {
      this.spawn = { x: ENTRY.x, y: 0, z: ENTRY.z, yaw: Math.PI };
      this.atmosphere.snap(1);
      this.story.start('hall');
    } else {
      this.spawn = { x: 0, y: 0, z: 0, yaw: Math.PI };
      this.story.start('street');
    }
  }

  /** Lab mode: the front doorway glows with daylight; walking out through it fades to the city at the hill door. */
  private buildExit(ctx: LevelContext): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.92, toneMapped: false, fog: false, side: THREE.DoubleSide, depthWrite: false });
    const light = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_HALF * 2 + 0.2, 3.5), mat);
    light.position.set(0, 1.75, Z.facade + 0.15);
    light.renderOrder = 2;
    ctx.root.add(light);
    ctx.interactions.addZone({
      shape: 'box',
      center: new THREE.Vector3(0, 1, EXIT_Z),
      half: new THREE.Vector3(DOOR_HALF + 0.6, 1.6, 0.8),
      onEnter: () => this.leave(),
    });
  }

  /** Out of the front door: to the city, arriving at the hill door. */
  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    void travel(this.ctx.game, LAB_EXIT_TARGET, 'hillDoor').finally(() => {
      this.leaving = false;
    });
  }

  update(dt: number): void {
    const p = this.ctx.player.visualPosition;
    let zone: Zone = 0;
    if (p.z < Z.hallBack - 0.6) zone = 2;
    else if (p.z < Z.facade - 0.3) zone = 1;
    // On the roofs (above the hall and the lab) it is daylight again: the dim zones are only the rooms underneath.
    if (p.y > 5.6) zone = 0;
    this.atmosphere.setZone(zone);
    this.atmosphere.update(dt, p, this.ctx.cameraRig.yaw);
    this.flashlight.update(dt, this.ctx.player, this.atmosphere.hallAmount);
    this.sparkles.update(dt);
    this.exterior.update(dt);
    this.hall.update(dt);
    this.lab.update(dt, zone >= 1);
    this.door.update(dt);
    this.jump?.update(dt);
    this.funny.update(dt);
    this.streetFx?.update(dt);
    this.terminal.update(dt);
    this.visit?.update(dt);
    const n = this.lab.collect(p.x, p.y, p.z);
    if (n > 0) this.story.onCoins(n);
    const info = this.ctx.game.debugInfo;
    info.step = this.story.step;
    info.flashlight = this.flashlight.on;
    info.wallOpen = this.hall.opened;
    info.plank = this.jump ? this.jump.plankShown : false;
    info.coinsTaken = this.story.coinsTaken;
    info.zone = zone;
    info.hint = this.jump ? this.jump.hinting : false;
    if (this.testInfo) {
      // Camera/pole numbers for the automated tests only (the pole projection costs ~100 matrix maths a frame).
      info.poleCover = this.poleCover();
      const cp = this.ctx.cameraRig.camera.position;
      info.camX = Math.round(cp.x * 100) / 100;
      info.camY = Math.round(cp.y * 100) / 100;
      info.camZ = Math.round(cp.z * 100) / 100;
    }
  }

  /** True when the page was opened by the smoke test (it sets window.__SG_TEST before the game loads). */
  private readonly testInfo = (window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true;

  private readonly corner = new THREE.Vector3();

  /**
   * Debug number for the smoke test: the largest share of the screen (0..1) that the screen-space bounding box of
   * any practice pole covers right now (an upper bound: ignores that the player may be in front of it).
   */
  private poleCover(): number {
    const cam = this.ctx.cameraRig.camera;
    cam.updateMatrixWorld();
    let worst = 0;
    for (const p of LAB.poles) {
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      let n = 0;
      // Points on the pole surface (12 angles x top/middle/bottom); only those in front of the near plane count.
      for (let k = 0; k < 36; k++) {
        const a = ((k % 12) / 12) * Math.PI * 2;
        this.corner.set(p.x + Math.cos(a) * LAB.poleRadius, LAB_FLOOR + p.h * (k < 12 ? 0 : k < 24 ? 0.5 : 1), p.z + Math.sin(a) * LAB.poleRadius);
        this.corner.applyMatrix4(cam.matrixWorldInverse);
        if (this.corner.z > -cam.near) continue;
        this.corner.applyMatrix4(cam.projectionMatrix);
        n++;
        x0 = Math.min(x0, this.corner.x);
        x1 = Math.max(x1, this.corner.x);
        y0 = Math.min(y0, this.corner.y);
        y1 = Math.max(y1, this.corner.y);
      }
      if (n === 0) continue;
      const w = Math.max(0, Math.min(1, x1) - Math.max(-1, x0)) / 2;
      const h = Math.max(0, Math.min(1, y1) - Math.max(-1, y0)) / 2;
      worst = Math.max(worst, w * h);
    }
    return Math.round(worst * 1000) / 1000;
  }

  dispose(): void {
    // Everything lives under ctx.root / physics / interactions; the story DOM is removed via onDispose.
  }
}
