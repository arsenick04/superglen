import type { Level, LevelContext } from '../Level';
import { makeMaterials } from './Batch';
import { Kit } from './Kit';
import { Z, LAB_FLOOR } from './Layout';
import { buildStreet, slabBounds } from './Street';
import { BuildingExterior } from './Building';
import { Hall } from './Hall';
import { Lab } from './Lab';
import { JumpTutorial } from './JumpTutorial';
import { Sparkles } from './Fx';
import { Atmosphere, Flashlight, type Zone } from './Lighting';
import { FunnyFx } from './FunnyFx';
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
  private story!: Story;
  private done = false;

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    const { root, physics, scene } = ctx;
    this.done = ctx.save.isChapterDone('bab1');
    ctx.game.setSkillButtons({ laser: false, shield: false });
    ctx.game.setTransformAllowed(false);

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
    this.atmosphere.update(dt, p);
    this.flashlight.update(dt, this.ctx.player, this.atmosphere.hallAmount);
    this.sparkles.update(dt);
    this.exterior.update(dt);
    this.hall.update(dt);
    this.lab.update(dt);
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
  }

  dispose(): void {
    // Everything lives under ctx.root / physics / interactions; the story DOM is removed via onDispose.
  }
}
