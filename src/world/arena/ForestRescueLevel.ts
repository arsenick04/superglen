import * as THREE from 'three';
import type { Level, LevelContext } from '../Level';
import { Kit } from '../bab1/Kit';
import { makeMaterials } from '../bab1/Batch';
import { buildForestScenery } from './ForestScenery';
import { Parkour } from '../../config/parkour';
import { startGate } from '../../core/StartGate';

/** First forest emergency: ten friendly monkeys wait on accessible tree platforms. */
export class ForestRescueLevel implements Level {
  readonly id = 'forest-rescue';
  readonly spawn = { x: 0, y: 0, z: 24, yaw: Math.PI };
  private ctx!: LevelContext;
  private readonly monkeys: { group: THREE.Group; point: THREE.Vector3; saved: boolean }[] = [];
  private readonly flames: THREE.Mesh[] = [];
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
    kit.solid([110, 0.4, 110], [0, -0.2, 0], 0x729657);
    const brown = new THREE.MeshStandardMaterial({ color: 0x98613c, roughness: 0.9 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xffdbab });
    const eye = new THREE.MeshStandardMaterial({ color: 0x292526 });
    for (let i = 0; i < 10; i++) {
      const x = (i % 5 - 2) * 9;
      const z = 9 - Math.floor(i / 5) * 22;
      const top = Parkour.glenApex * (i % 3 + 1) * 0.55;
      // Wide steps ascend beside the trunk; each rise is below Glen's first jump.
      for (let j = 0; j <= i % 3; j++) {
        const y = Parkour.glenApex * (j + 1) * 0.55;
        kit.solidCyl(1.7, 0.28, [x + (i % 3 - j) * 2.7, y - 0.14, z], 0x5e9d46);
      }
      kit.solidCyl(0.25, top, [x, top / 2, z], 0x895e40);
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
      }
      group.position.set(x, top, z);
      const saved = ctx.save.isChapterDone(`forest-monkey-${i}`);
      group.visible = !saved;ctx.root.add(group);
      const monkey = { group, point: new THREE.Vector3(x, top + 0.4, z), saved };
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
    for (let i = 0; i < 16; i++) {
      const x = (i % 2 ? -1 : 1) * (24 + i % 4 * 3), z = 22 - i * 3;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.2, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff9143 : 0xffc259 }));
      flame.position.set(x, 1.1, z);ctx.root.add(flame);this.flames.push(flame);
    }
    kit.build(ctx.root);buildForestScenery(ctx);
    ctx.game.setPlayerMode('superglen', false);ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({ laser: false, shield: true, fly: false });
    const bounds = { minX: -45, maxX: 45, minZ: -38, maxZ: 40 };
    ctx.player.flight.bounds = bounds;ctx.player.flight.groundBounds = bounds;
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:absolute;top:24%;left:50%;transform:translateX(-50%);background:#fff9;padding:8px 14px;border-radius:18px;color:#513b29;font-weight:bold;pointer-events:none';
    ctx.ui.append(this.hud);ctx.onDispose(() => this.hud.remove());
    this.refresh();
    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      if (!ctx.save.isChapterDone('forest-rescue-intro')) {
        await ctx.dialog.say({ id: 'forest_glen_flight_broken', speaker: 'glen', text: 'Oh tidak, alat terbangku rusak! Aku harus melompat untuk menolong monyet-monyet itu!' }, { lockControls: true });
        await ctx.dialog.say({ id: 'forest_nino_rescue_ten', speaker: 'nino', text: 'Ada sepuluh monyet yang perlu ditolong. Naiki pijakan, dekati mereka, lalu tekan tombol tangan. Kamu pasti bisa, Glen!' }, { lockControls: true });
        ctx.save.markChapterDone('forest-rescue-intro');
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
      this.busy = false;
    });
  }
  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.flames.length; i++) this.flames[i].scale.y = 0.85 + Math.sin(this.time * 4 + i) * 0.16;
  }
  dispose(): void {}
}
