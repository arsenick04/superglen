import * as THREE from 'three';
import { startGate } from '../../core/StartGate';
import { NinoActor } from '../bab2/NinoActor';
import { makeMaterials } from '../bab1/Batch';
import { Kit } from '../bab1/Kit';
import { AaraActor } from '../kota/Aara';
import type { Level, LevelContext } from '../Level';
import type { MapSource } from '../MapSource';
import { travel } from '../progress';
import { buildForestScenery } from './ForestScenery';

interface TreeStep {
  readonly x: number;
  readonly z: number;
  readonly top: number;
  readonly radius: number;
}

interface TreeCourse {
  readonly name: 'mudah' | 'menengah' | 'sulit' | 'mahir' | 'juara';
  readonly start: { readonly x: number; readonly z: number };
  readonly color: number;
  readonly steps: readonly TreeStep[];
}

const COURSES: readonly TreeCourse[] = [
  {
    name: 'mudah', start: { x: -30, z: 18 }, color: 0x74c95d,
    steps: [
      { x: -30, z: 11, top: 1.2, radius: 2.1 }, { x: -27, z: 5, top: 1.8, radius: 2.0 },
      { x: -31, z: -1, top: 2.4, radius: 1.9 }, { x: -27, z: -7, top: 3.0, radius: 1.8 },
      { x: -30, z: -13, top: 3.5, radius: 1.8 },
    ],
  },
  {
    name: 'menengah', start: { x: 0, z: 18 }, color: 0xf2b632,
    steps: [
      { x: -1, z: 11, top: 1.4, radius: 1.75 }, { x: 2, z: 6, top: 2.1, radius: 1.65 },
      { x: -2, z: 1, top: 2.8, radius: 1.55 }, { x: 2, z: -4, top: 3.6, radius: 1.5 },
      { x: 0, z: -9, top: 4.3, radius: 1.45 },
    ],
  },
  {
    name: 'sulit', start: { x: 30, z: 18 }, color: 0xe76f51,
    // The long rises and gaps require Superglen's air jump; every landing remains generous enough for a child.
    steps: [
      { x: 30, z: 11, top: 1.6, radius: 1.45 }, { x: 27, z: 5, top: 4.1, radius: 1.4 },
      { x: 32, z: -1, top: 6.5, radius: 1.35 }, { x: 27, z: -7, top: 8.9, radius: 1.3 },
      { x: 32, z: -13, top: 10.3, radius: 1.3 },
    ],
  },
  {
    name: 'mahir', start: { x: -15, z: 18 }, color: 0x4dabf7,
    steps: [
      { x: -15, z: 11, top: 1.7, radius: 1.5 }, { x: -18, z: 5, top: 3.9, radius: 1.45 },
      { x: -13, z: -1, top: 6.2, radius: 1.4 }, { x: -18, z: -7, top: 8.5, radius: 1.35 },
      { x: -13, z: -13, top: 10.5, radius: 1.35 },
    ],
  },
  {
    name: 'juara', start: { x: 15, z: 18 }, color: 0xb26de0,
    steps: [
      { x: 15, z: 11, top: 1.8, radius: 1.45 }, { x: 18, z: 5, top: 4.4, radius: 1.4 },
      { x: 12, z: -1, top: 7.0, radius: 1.35 }, { x: 18, z: -7, top: 9.6, radius: 1.3 },
      { x: 12, z: -13, top: 12.0, radius: 1.25 }, { x: 16, z: -18, top: 13.2, radius: 1.25 },
    ],
  },
] as const;

const HALF = 58;

class ForestMap implements MapSource {
  readonly half = HALF;
  readonly version = 1;

  draw(g: CanvasRenderingContext2D, px: number, big: boolean): void {
    g.clearRect(0, 0, px, px);
    g.fillStyle = '#76b85d';
    g.fillRect(0, 0, px, px);
    g.strokeStyle = '#d8b678';
    g.lineWidth = Math.max(3, px * 0.035);
    g.beginPath();
    g.moveTo(px * 0.5, px);
    g.lineTo(px * 0.5, px * 0.58);
    g.stroke();
    for (let i = 0; i < 34; i++) {
      const a = i * 2.399;
      const r = 0.2 + ((i * 37) % 31) / 55;
      const x = px * (0.5 + Math.cos(a) * r);
      const y = px * (0.5 + Math.sin(a) * r);
      g.fillStyle = i % 3 ? '#397d42' : '#27673a';
      g.beginPath();
      g.arc(x, y, Math.max(2, px * 0.012), 0, Math.PI * 2);
      g.fill();
    }
    if (big) {
      g.fillStyle = '#fff7d6';
      g.font = `bold ${Math.max(14, px * 0.045)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('Hutan Botanica', px * 0.5, px * 0.1);
      g.font = `bold ${Math.max(11, px * 0.028)}px sans-serif`;
      g.fillText('5 lintasan lompat pohon', px * 0.5, px * 0.72);
    }
  }
}

export const ForestTrainingLines = {
  introAara: { id: 'forest_aara_play', speaker: 'aara', text: 'Hutannya luas sekali! Ayo bermain lompat dari pohon ke pohon!' },
  introNino: { id: 'forest_nino_five', speaker: 'nino', text: 'Ada lima lintasan, dari mudah sampai juara. Selesaikan satu per satu, ya!' },
  nextMedium: { id: 'forest_nino_medium', speaker: 'nino', text: 'Lintasan mudah selesai! Sekarang pijakannya lebih kecil dan lebih berjauhan.' },
  nextHard: { id: 'forest_aara_hard', speaker: 'aara', text: 'Berikutnya lintasan sulit! Gunakan double jump untuk mencapai dahan yang tinggi.' },
  nextMaster: { id: 'forest_nino_master', speaker: 'nino', text: 'Tiga lintasan selesai! Sekarang tingkat mahir: jaga irama dan gunakan double jump.' },
  nextChampion: { id: 'forest_aara_champion', speaker: 'aara', text: 'Satu lagi, Glen! Lintasan juara punya tajuk tinggi, tetapi jaraknya tetap dekat.' },
  done: { id: 'forest_nino_done', speaker: 'nino', text: 'Lima tingkat selesai! Ayo kembali ke Lab dan beristirahat bersama.' },
} as const;

/** Chapter 8 opening: a newly unlocked forest and five tree-jumping courses with Nino and Aara. */
export class ForestTrainingLevel implements Level {
  readonly id = 'forest-training';
  readonly spawn = { x: -30, y: 0, z: 18, yaw: Math.PI };
  readonly map = new ForestMap();
  private ctx: LevelContext | null = null;
  private nino: NinoActor | null = null;
  private aara: AaraActor | null = null;
  private stage = 0;
  private courseStarted = false;
  private advancing = false;
  private resetCooldown = 0.8;
  private readonly feet = new THREE.Vector3();
  private windLeaves: THREE.InstancedMesh | null = null;
  private windTime = 0;
  private readonly windDummy = new THREE.Object3D();

  build(ctx: LevelContext): void {
    this.ctx = ctx;
    ctx.scene.background = new THREE.Color(0xa9dcff);
    ctx.scene.fog = new THREE.Fog(0xc7e4c4, 75, 155);
    ctx.root.add(new THREE.HemisphereLight(0xe8f7ff, 0x6d8e55, 1.55));
    const sun = new THREE.DirectionalLight(0xffe3ac, 2.1);
    sun.position.set(24, 38, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    ctx.root.add(sun);

    const mats = makeMaterials();
    const kit = new Kit(ctx.physics, mats, true);
    kit.solid([HALF * 2, 0.4, HALF * 2], [0, -0.2, 0], 0x78b95c);
    this.buildClearing(kit);
    for (const course of COURSES) this.buildCourse(kit, course);
    this.buildForest(kit);
    kit.build(ctx.root);
    buildForestScenery(ctx);
    this.buildWindLeaves(ctx);

    this.nino = new NinoActor(ctx, -4, 25);
    this.nino.sit = 1;
    this.aara = new AaraActor(mats.lit, ctx.dialog);
    this.aara.place(4, 25, Math.PI);
    this.aara.setLevel(3);
    ctx.root.add(this.aara.group);
    ctx.onDispose(() => this.aara?.dispose());

    ctx.game.setPlayerMode('superglen', false);
    ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({ laser: false, shield: false, fly: false });
    // Careful platform movement should feel controllable on a small touch stick.
    ctx.player.levelSpeedScale = 0.76;
    // A second tap is unambiguously the air jump in this lesson, even while descending near a branch.
    ctx.player.preferAirJump = true;
    const bounds = { minX: -HALF + 2, maxX: HALF - 2, minZ: -HALF + 2, maxZ: HALF - 2 };
    ctx.player.flight.bounds = bounds;
    ctx.player.flight.groundBounds = { ...bounds, margin: 4, push: 3 };
    ctx.audio.music.setScene('jelajah');
    ctx.game.debugInfo.forestTrainingStage = 1;
    ctx.game.debugInfo.forestTrainingCourse = COURSES[0].name;
    this.setGoal();

    ctx.seq.run(async () => {
      await ctx.seq.waitUntil(() => startGate.started);
      this.aara?.emote('wave');
      this.nino?.emote('wave');
      await ctx.dialog.say(ForestTrainingLines.introAara, { lockControls: true });
      await ctx.dialog.say(ForestTrainingLines.introNino, { lockControls: true });
    });
  }

  fixedUpdate(dt: number): void {
    const ctx = this.ctx;
    const course = COURSES[this.stage];
    const goal = course?.steps[course.steps.length - 1];
    if (!ctx || !course || !goal || this.advancing || !ctx.game.controlsEnabled) return;
    this.resetCooldown = Math.max(0, this.resetCooldown - dt);
    ctx.player.getFeetPosition(this.feet);
    if (this.feet.y > 0.5) this.courseStarted = true;
    if (this.courseStarted && this.resetCooldown <= 0 && this.feet.y < 0.16) {
      ctx.fx.sparkles.burst(this.feet.x, 0.2, this.feet.z, 18, 2.2, 0x8bd76c, { gravity: -0.4, life: 0.7, up: 1.2 });
      this.resetCourse();
      ctx.game.debugInfo.forestTrainingFalls = Number(ctx.game.debugInfo.forestTrainingFalls ?? 0) + 1;
      return;
    }
    if (Math.hypot(this.feet.x - goal.x, this.feet.z - goal.z) > goal.radius + 0.45 || Math.abs(this.feet.y - goal.top) > 0.75) return;
    this.advance(goal);
  }

  update(dt: number): void {
    this.nino?.update(dt);
    this.aara?.update(dt);
    this.updateWindLeaves(dt);
  }

  dispose(): void {
    this.ctx = null;
    this.nino = null;
    this.aara = null;
    this.windLeaves = null;
  }

  private buildClearing(kit: Kit): void {
    kit.lit.cyl(12, 0.06, [0, 0.03, 25], 0xa8cf72);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      kit.deco.sph(0.16, [Math.cos(a) * 9, 0.15, 25 + Math.sin(a) * 9], i % 2 ? 0xffd45c : 0xff8fba, [1, 0.65, 1], 0);
    }
  }

  private buildCourse(kit: Kit, course: TreeCourse): void {
    kit.glow.cyl(2.3, 0.04, [course.start.x, 0.04, course.start.z], course.color);
    for (const step of course.steps) {
      const trunkHeight = Math.max(2.2, step.top - 0.18);
      kit.solidCyl(0.48, trunkHeight, [step.x, trunkHeight / 2, step.z], 0x8a5a3c);
      // The collider is hidden just under the leaf surface. No yellow/flat platform is drawn: Glen visibly
      // plants his feet on the crown itself, while the broad cylinder keeps landings forgiving for children.
      kit.physics.addFixedCylinder(0.17, step.radius, { x: step.x, y: step.top - 0.17, z: step.z });
      const y = step.top - step.radius * 0.34;
      kit.deco.sph(step.radius * 0.9, [step.x - step.radius * 0.42, y, step.z], course.color, [1, 0.4, 1], 1);
      kit.deco.sph(step.radius * 0.86, [step.x + step.radius * 0.42, y, step.z + 0.16], course.color, [1, 0.42, 1], 1);
      kit.deco.sph(step.radius * 0.78, [step.x, y - 0.04, step.z - step.radius * 0.34], course.color, [1, 0.44, 1], 1);
    }
  }

  private buildForest(kit: Kit): void {
    for (let i = 0; i < 96; i++) {
      const a = i * 2.399;
      const r = 25 + (i % 10) * 3.2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r + 2;
      if (Math.abs(x) < 38 && z > -31 && z < 23) continue;
      const h = 3.8 + (i % 5) * 0.42;
      const crown = 1.5 + (i % 3) * 0.2;
      kit.solidCyl(0.38, h, [x, h / 2, z], 0x795039);
      const green = i % 4 === 0 ? 0x3f8f49 : i % 3 === 0 ? 0x55a84f : 0x4b9b45;
      kit.lit.sph(crown, [x, h + 0.5, z], green, [1, 0.85, 1], 1);
      kit.deco.sph(crown * 0.75, [x + crown * 0.7, h + 0.35, z], green, [1, 0.8, 1], 1);
    }
  }

  /** One cheap instanced draw call: drifting leaves make the forest feel alive. */
  private buildWindLeaves(ctx: LevelContext): void {
    const geometry = new THREE.PlaneGeometry(0.22, 0.11);
    const material = new THREE.MeshStandardMaterial({ color: 0x91c95a, roughness: 0.9, side: THREE.DoubleSide });
    const leaves = new THREE.InstancedMesh(geometry, material, 20);
    leaves.frustumCulled = false;
    leaves.castShadow = false;
    leaves.receiveShadow = false;
    this.windLeaves = leaves;
    ctx.root.add(leaves);
    ctx.onDispose(() => {
      geometry.dispose();
      material.dispose();
    });
    this.updateWindLeaves(0);
  }

  private updateWindLeaves(dt: number): void {
    const leaves = this.windLeaves;
    if (!leaves) return;
    this.windTime += dt;
    for (let i = 0; i < leaves.count; i++) {
      const phase = i * 1.73;
      const lane = (i % 5) - 2;
      const travel = (this.windTime * (0.7 + (i % 3) * 0.13) + i * 3.1) % 36;
      this.windDummy.position.set(-18 + travel, 2.4 + (i % 4) * 0.72 + Math.sin(this.windTime * 1.7 + phase) * 0.35, 18 + lane * 8 + Math.sin(phase) * 3);
      this.windDummy.rotation.set(Math.sin(this.windTime * 2.2 + phase) * 0.7, phase + this.windTime, Math.cos(this.windTime * 1.8 + phase) * 0.8);
      const scale = 0.75 + (i % 4) * 0.12;
      this.windDummy.scale.setScalar(scale);
      this.windDummy.updateMatrix();
      leaves.setMatrixAt(i, this.windDummy.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }

  private resetCourse(): void {
    const ctx = this.ctx;
    const course = COURSES[this.stage];
    if (!ctx || !course) return;
    ctx.player.rhythm.reset();
    ctx.player.placeAt(course.start.x, 0, course.start.z, Math.PI);
    ctx.cameraRig.snapBehind(Math.PI);
    this.courseStarted = false;
    this.resetCooldown = 0.8;
  }

  private advance(goal: TreeStep): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.advancing = true;
    ctx.seq.run(async () => {
      ctx.fx.sparkles.burst(goal.x, goal.top + 0.4, goal.z, 34, 3.6, 0xffd23f, { gravity: 1.5, life: 1, up: 1 });
      this.stage++;
      if (this.stage < COURSES.length) {
        const line = this.stage === 1 ? ForestTrainingLines.nextMedium
          : this.stage === 2 ? ForestTrainingLines.nextHard
            : this.stage === 3 ? ForestTrainingLines.nextMaster
              : ForestTrainingLines.nextChampion;
        await ctx.dialog.say(line, { lockControls: true });
        ctx.game.debugInfo.forestTrainingStage = this.stage + 1;
        ctx.game.debugInfo.forestTrainingCourse = COURSES[this.stage].name;
        this.resetCourse();
        this.setGoal();
        this.advancing = false;
        return;
      }
      ctx.objectives.clear();
      this.nino?.emote('cheer');
      this.aara?.emote('cheer');
      await ctx.dialog.say(ForestTrainingLines.done, { lockControls: true });
      ctx.save.markChapterDone('forest-training');
      ctx.save.setInterlude('forest_quiz');
      await travel(ctx.game, 'lab', 'labEntrance');
    });
  }

  private setGoal(): void {
    const course = COURSES[this.stage];
    const goal = course?.steps[course.steps.length - 1];
    if (goal && this.ctx) this.ctx.objectives.set(new THREE.Vector3(goal.x, goal.top, goal.z));
  }
}
