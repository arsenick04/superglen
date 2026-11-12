import * as THREE from 'three';
import type { Level, LevelContext } from './Level';

const SKY = 0xffe9b0;
const GROUND = 50;

/**
 * Tiny flat demo of the level framework (`?level=demo`), used by the smoke test:
 *  - a blue NPC capsule you can talk to (prompt icon + E / Bicara button),
 *  - an auto-trigger zone that puts the objective beacon 8 m further on,
 *  - reaching the beacon plays a locked two-line sequence and then loads the `test` level.
 * It is also the smallest example of how a chapter uses the context.
 */
export class DemoLevel implements Level {
  readonly id = 'demo';
  readonly spawn = { x: 0, y: 0, z: 0 };

  private readonly npcPos = new THREE.Vector3(-5, 0.55, -2);
  private readonly zoneCenter = new THREE.Vector3(0, 1, -6);
  private readonly beacon = new THREE.Vector3(0, 0, -14);
  private sun!: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(10, 18, 6);
  private ctx!: LevelContext;

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    const { scene, root, physics } = ctx;
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 40, 90);

    root.add(new THREE.HemisphereLight(0xfff4d6, 0x7fbf6a, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
    this.sun.position.copy(this.sunOffset);
    root.add(this.sun, this.sun.target);

    const geo = new THREE.PlaneGeometry(GROUND, GROUND);
    geo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9be37f, roughness: 0.95 }));
    ground.receiveShadow = true;
    root.add(ground);
    physics.addFixedCuboid({ x: GROUND / 2, y: 0.5, z: GROUND / 2 }, { x: 0, y: -0.5, z: 0 });

    // NPC: a blue capsule that is solid (so the player stops in front of it).
    const npcMat = new THREE.MeshStandardMaterial({ color: 0x4dabf7, roughness: 0.6 });
    const npc = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.4, 6, 16), npcMat);
    npc.position.copy(this.npcPos);
    npc.rotation.y = Math.atan2(-this.npcPos.x, -this.npcPos.z) + Math.PI; // face the spawn
    npc.castShadow = true;
    root.add(npc);
    physics.addFixedCylinder(0.55, 0.35, { x: this.npcPos.x, y: 0.55, z: this.npcPos.z });

    ctx.interactions.add({
      position: this.npcPos,
      radius: 2.2,
      icon: 'talk',
      promptHeight: 1.3,
      onInteract: () => {
        void ctx.dialog.say({ speaker: 'nino', text: 'Halo!', id: 'demo_halo' });
      },
    });

    // Walking into this zone (no button) starts the objective.
    ctx.interactions.addZone({
      shape: 'box',
      center: this.zoneCenter,
      half: new THREE.Vector3(2.5, 2, 1.5),
      once: true,
      onEnter: () => {
        ctx.objectives.set(this.beacon, { radius: 2, onReach: () => this.onBeaconReached() });
      },
    });
  }

  private onBeaconReached(): void {
    const { ctx } = this;
    ctx.fx.rings.spawn(this.beacon.x, this.beacon.y, this.beacon.z, 2.5, 0.6, 0xffd23f);
    ctx.seq.run(async () => {
      await ctx.dialog.sequence(
        [
          { speaker: 'nino', text: 'Hebat, kamu sampai!' },
          { speaker: 'glen', text: 'Ayo kita main lagi!' },
        ],
        { lockControls: true },
      );
      await ctx.seq.wait(0.3);
      await ctx.game.loadLevel('test');
    });
  }

  update(): void {
    const p = this.ctx.player.visualPosition;
    this.sun.position.copy(p).add(this.sunOffset);
    this.sun.target.position.copy(p);
  }

  dispose(): void {
    // Nothing outside ctx.root / physics / interactions.
  }
}
