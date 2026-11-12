import type { Level, LevelContext } from '../Level';
import { makeMaterials } from './Batch';
import { Kit } from './Kit';
import * as THREE from 'three';
import { Z, LAB, LAB_FLOOR } from './Layout';
import { buildStreet, slabBounds } from './Street';
import { BuildingExterior } from './Building';
import { Hall } from './Hall';
import { Lab } from './Lab';
import { JumpTutorial } from './JumpTutorial';
import { Sparkles } from './Fx';
import { Atmosphere, Flashlight, type Zone } from './Lighting';
import { FunnyFx } from './FunnyFx';
import { LabDoor } from './LabDoor';
import { Story } from './Story';

/**
 * Bab 1: Komputer Kuno Barongsai. One continuous level along -Z: street, old Barongsai building, dim hall, laboratory.
 * Story script: Story.ts. Layout constants: Layout.ts. Returning players start in the finished lab.
 */
export class Bab1Level implements Level {
  readonly id = 'bab1';
  spawn: { x: number; y: number; z: number; yaw?: number } = { x: 0, y: 0, z: 0, yaw: Math.PI };

  private ctx!: LevelContext;
  private atmosphere!: Atmosphere;
  private flashlight!: Flashlight;
  private sparkles!: Sparkles;
  private exterior!: BuildingExterior;
  private hall!: Hall;
  private lab!: Lab;
  private jump!: JumpTutorial;
  private funny!: FunnyFx;
  private door!: LabDoor;
  private story!: Story;
  private done = false;

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    const { root, physics, scene } = ctx;
    this.done = ctx.save.isChapterDone('bab1');
    // First visit: no powers yet. Afterwards the unlocked ones (from the save) stay on.
    if (!this.done) ctx.game.setSkills({ laser: false, shield: false, fly: false });
    ctx.game.setTransformAllowed(false);
    // The lab is small: flying is harmless (low ceiling, a flight box around the whole walkable area).
    ctx.player.flight.maxFlyHeight = 4.5;
    ctx.player.flight.bounds = { minX: -13, maxX: 13, minZ: Z.labBack + 0.8, maxZ: 8 };

    this.atmosphere = new Atmosphere(scene, root);
    this.sparkles = new Sparkles(root);
    this.flashlight = new Flashlight(root);

    // Ground: one slab for street + hall, a lower one for the lab.
    const a = slabBounds(Z.hallBack - 0.6);
    physics.addFixedCuboid({ x: a.size[0] / 2, y: a.size[1] / 2, z: a.size[2] / 2 }, { x: a.pos[0], y: a.pos[1], z: a.pos[2] });
    const labLen = 24;
    physics.addFixedCuboid({ x: 20, y: 0.5, z: labLen / 2 }, { x: 0, y: LAB_FLOOR - 0.5, z: Z.hallBack - 0.6 - labLen / 2 });

    const mats = makeMaterials();
    const street = new Kit(physics, mats, true);
    const building = new Kit(physics, mats, true);
    const hallKit = new Kit(physics, mats, false);
    const labKit = new Kit(physics, mats, false);

    buildStreet(street);
    this.jump = new JumpTutorial(ctx, street, this.sparkles);
    this.exterior = new BuildingExterior(building, root, this.sparkles);
    this.hall = new Hall(ctx, hallKit, this.sparkles);
    this.lab = new Lab(ctx, labKit, this.sparkles);
    this.door = new LabDoor(ctx, labKit, this.sparkles);
    street.build(root);
    building.build(root);
    hallKit.build(root);
    labKit.build(root);

    this.funny = new FunnyFx(root, ctx.player, this.sparkles);
    this.story = new Story({
      ctx,
      lab: this.lab,
      hall: this.hall,
      jump: this.jump,
      sparkles: this.sparkles,
      atmosphere: this.atmosphere,
      flashlight: this.flashlight,
      funny: this.funny,
      door: this.door,
    });

    if (this.done) {
      this.spawn = { x: 0, y: LAB_FLOOR, z: -65, yaw: Math.PI };
      this.atmosphere.snap(2);
      this.story.setupReturning();
    } else {
      this.spawn = { x: 0, y: 0, z: 0, yaw: Math.PI };
      this.story.start();
    }
  }

  update(dt: number): void {
    const p = this.ctx.player.visualPosition;
    let zone: Zone = 0;
    if (p.z < Z.hallBack - 0.6) zone = 2;
    else if (p.z < Z.facade - 0.3) zone = 1;
    this.atmosphere.setZone(zone);
    this.atmosphere.update(dt, p, this.ctx.cameraRig.yaw);
    this.flashlight.update(dt, this.ctx.player, this.atmosphere.hallAmount);
    this.sparkles.update(dt);
    this.exterior.update(dt);
    this.hall.update(dt);
    this.lab.update(dt, zone >= 1);
    this.door.update(dt);
    this.jump.update(dt);
    this.funny.update(dt);
    const n = this.lab.collect(p.x, p.y, p.z);
    if (n > 0) this.story.onCoins(n);
    const info = this.ctx.game.debugInfo;
    info.step = this.story.step;
    info.flashlight = this.flashlight.on;
    info.wallOpen = this.hall.opened;
    info.plank = this.jump.plankShown;
    info.coinsTaken = this.story.coinsTaken;
    info.zone = zone;
    info.hint = this.jump.hinting;
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
