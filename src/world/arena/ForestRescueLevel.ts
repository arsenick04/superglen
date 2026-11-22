import * as THREE from 'three';
import type { Level, LevelContext } from '../Level';
import { Kit } from '../bab1/Kit';
import { makeMaterials } from '../bab1/Batch';
import { buildForestScenery } from './ForestScenery';
import { Parkour } from '../../config/parkour';
import { startGate } from '../../core/StartGate';
import { ForestFireEffects } from './ForestFireEffects';
import { ForestRescueSound } from './ForestRescueSound';
import { RescueMonkey } from './RescueMonkey';

/** First forest emergency: ten friendly monkeys wait on accessible tree platforms. */
export class ForestRescueLevel implements Level {
  readonly id = 'forest-rescue';
  readonly spawn = { x: -Parkour.forestRescue.spacing * 2, y: Parkour.forestRescue.canopyHeight, z: 24, yaw: Math.PI };
  private ctx!: LevelContext;
  private readonly monkeys: { group: THREE.Group; point: THREE.Vector3; saved: boolean; avatar: RescueMonkey }[] = [];
  private fire!: ForestFireEffects;
  private sound!: ForestRescueSound;
  private readonly feet = new THREE.Vector3();
  private resetCooldown = 1;
  private hud!: HTMLDivElement;
  private time = 0;
  private busy = false;

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    ctx.save.setWhere(this.id);
    ctx.scene.background = new THREE.Color(0xd9a77a);
    ctx.scene.fog = new THREE.Fog(0xc0a38b, 45, 110);
    ctx.root.add(new THREE.HemisphereLight(0xffe5c7, 0x596747, 1.6));
    const sun = new THREE.DirectionalLight(0xffc684, 2);
    sun.position.set(-12, 25, 10);
    ctx.root.add(sun);
    const kit = new Kit(ctx.physics, makeMaterials());
    kit.solid([110, 0.4, 110], [0, -0.2, 0], 0x453a2c);
    const landing = (x: number, z: number, top: number): void => {
      kit.solidCyl(.3, top, [x, top/2, z], 0x895e40);
      ctx.physics.addFixedCylinder(.16, Parkour.forestRescue.landingRadius, {x,y:top-.16,z});
      for(let side=-1;side<=1;side++)kit.lit.sph(1.8,[x+side*.95,top-.45,z+(side%2)*.35],side===0?0x6fad47:0x497e37,[1,.3,1],1);
    };
    landing(this.spawn.x,this.spawn.z,this.spawn.y);
    const brown = new THREE.MeshStandardMaterial({ color: 0x98613c, roughness: 0.9 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xffdbab });
    const eye = new THREE.MeshStandardMaterial({ color: 0x292526 });
    for (let i = 0; i < 10; i++) {
      const column = i < 5 ? i : 9-i;
      const x = (column-2)*Parkour.forestRescue.spacing;
      const z = 24-(Math.floor(i/5)+1)*Parkour.forestRescue.spacing;
      const top = Parkour.forestRescue.canopyHeight + Parkour.forestRescue.heightOffsets[i];
      landing(x,z,top);
      const group = new THREE.Group();
      const part = (r: number, material: THREE.Material, x: number, y: number, z: number): void => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), material);
        mesh.position.set(x, y, z);group.add(mesh);
      };
      part(0.28, brown, 0, 0.35, 0);part(0.29, brown, 0, 0.76, 0);
      part(0.21, cream, 0, 0.73, 0.18);
      for (const side of [-1, 1]) {
        part(0.12, brown, side * 0.29, 0.8, 0);part(0.035, eye, side * 0.08, 0.8, 0.37);
        part(0.09, brown, side * 0.22, 0.12, 0.12);
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.055,.32,2,6),brown);
        arm.position.set(side*.3,.6,0);arm.rotation.z=side*.65;arm.name='panic-arm';group.add(arm);
      }
      group.position.set(x, top, z);
      const saved = ctx.save.isChapterDone(`forest-monkey-${i}`);
      group.visible = !saved;ctx.root.add(group);
      const monkey = { group, point: new THREE.Vector3(x, top + 0.4, z), saved, avatar: new RescueMonkey(group,ctx) };
      this.monkeys.push(monkey);
      ctx.interactions.add({ position: monkey.point, radius: 2, icon: 'hand', promptHeight: 1.5,
        enabled: () => !monkey.saved && !this.busy,
        onInteract: () => {
          monkey.saved = true;group.visible = false;ctx.save.markChapterDone(`forest-monkey-${i}`);
          ctx.fx.sparkles.burst(x, top + 0.7, z, 18, 2, 0xffdc70, { life: 0.7 });
          this.refresh();
          if (this.monkeys.every(m => m.saved)) this.finish();
        },
      });
    }
    kit.build(ctx.root);buildForestScenery(ctx,true);
    this.fire = new ForestFireEffects(ctx);this.sound = new ForestRescueSound(ctx);
    ctx.audio.music.setScene('pertarungan');
    ctx.game.setPlayerMode('superglen', false);ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({ laser: false, shield: true, fly: false });
    ctx.player.preferAirJump=true;ctx.player.levelSpeedScale=.76;
    const bounds = { minX: -45, maxX: 45, minZ: -38, maxZ: 40 };
    ctx.player.flight.bounds = bounds;ctx.player.flight.groundBounds = bounds;
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:absolute;top:24%;left:50%;transform:translateX(-50%);background:#fff9;padding:8px 14px;border-radius:18px;color:#513b29;font-weight:bold;pointer-events:none';
    ctx.ui.append(this.hud);ctx.onDispose(() => this.hud.remove());
    this.refresh();
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (!ctx.save.isChapterDone('forest-rescue-canopy-intro')) {
        await ctx.dialog.say({ id: 'forest_glen_flight_broken', speaker: 'glen', text: 'Oh tidak, alat terbangku rusak! Aku harus melompat untuk menolong monyet-monyet itu!' }, { lockControls: true });
        await ctx.dialog.say({ id: 'forest_nino_rescue_ten', speaker: 'nino', text: 'Selamatkan sepuluh monyet dari atas pohon. Dekati mereka, lalu tekan tangan. Jangan menyentuh tanah! Kalau jatuh, penyelamatan diulang dari awal.' }, { lockControls: true });
        ctx.save.markChapterDone('forest-rescue-canopy-intro');
      }
    });
  }
  private refresh(): void {
    const remaining = this.monkeys.filter(m => !m.saved);
    this.hud.textContent = `Monyet diselamatkan: ${10 - remaining.length}/10`;
    let nearest = remaining[0], best = Infinity;
    for (const m of remaining) { const d = m.point.distanceToSquared(this.ctx.player.position);if (d < best) { best = d;nearest = m; } }
    if (nearest) this.ctx.objectives.set(nearest.point);else this.ctx.objectives.clear();
    if (!remaining.length) this.hud.textContent = '10/10 monyet aman — misi penyelamatan selesai!';
  }
  private finish(): void {
    this.busy = true;this.ctx.save.markChapterDone('forest-rescue');
    this.ctx.seq.run(async () => {
      await this.ctx.dialog.say({ id: 'forest_glen_monkeys_safe', speaker: 'glen', text: 'Semua monyet sudah aman! Sekarang kita harus mencari sumber api.' }, { lockControls: true });
      this.ctx.save.setWhere('battle-gorilla');
      await this.ctx.game.loadLevel('battle-gorilla');
    });
  }
  update(dt: number): void {
    this.time += dt;
    this.fire.update(dt);
    this.sound.update(dt,startGate.started&&!this.monkeys.every(m=>m.saved));
    for(let i=0;i<this.monkeys.length;i++) {
      const m=this.monkeys[i];if(m.saved)continue;
      m.avatar.update(dt);
      m.group.position.y=m.point.y-.4+Math.abs(Math.sin(this.time*4+i*1.7))*.45;
      m.group.rotation.y=Math.sin(this.time*2+i)*.4;
      for(const part of m.group.children)if(part.name==='panic-arm')part.rotation.z=Math.sin(this.time*9+i)*.7;
    }
  }
  fixedUpdate(dt: number): void {
    if(!this.ctx.game.controlsEnabled||!startGate.started||this.ctx.save.isChapterDone('forest-rescue'))return;
    this.resetCooldown=Math.max(0,this.resetCooldown-dt);
    this.ctx.player.getFeetPosition(this.feet);
    if(this.resetCooldown>0||this.feet.y>Parkour.forestRescue.resetFeetHeight)return;
    this.ctx.save.data.chaptersDone=this.ctx.save.data.chaptersDone.filter(id=>!/^forest-monkey-\d+$/.test(id));
    for(const m of this.monkeys){m.saved=false;m.group.visible=true;}
    this.ctx.save.persist();
    this.ctx.player.rhythm.reset();this.ctx.player.placeAt(this.spawn.x,this.spawn.y,this.spawn.z,Math.PI);
    this.ctx.cameraRig.snapBehind(Math.PI);this.resetCooldown=1;this.refresh();
    this.hud.textContent='Jatuh! Kembali ke pohon awal — 0/10';
  }
  dispose(): void {}
}
