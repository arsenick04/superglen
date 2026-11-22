import * as THREE from 'three';
import { Combat } from '../../config/combat';
import { Parkour } from '../../config/parkour';
import { startGate } from '../../core/StartGate';
import type { Level, LevelContext } from '../Level';
import type { Target } from '../../gameplay/Targets';
import { Kit } from '../bab1/Kit';
import { makeMaterials } from '../bab1/Batch';
import { enemyModels } from '../kota/EnemyModels';
import { buildForestScenery } from './ForestScenery';
import { ForestFireEffects } from './ForestFireEffects';
import { ForestRescueSound } from './ForestRescueSound';
import { poseGorillaArms } from './GorillaPose';

const C = Combat.gorilla, P = Parkour.gorillaCanopy;
type Phase = 'wait' | 'wind' | 'leap' | 'retreat' | 'recover' | 'open' | 'done';

/** Telegraphed leap -> dodge/shield twice -> one clear laser opening. */
export class GorillaArena implements Level {
  readonly id = 'battle-gorilla';
  readonly spawn = { x: 0, y: P.heights[0], z: P.spacing, yaw: Math.PI };
  private ctx!: LevelContext;
  private readonly boss = new THREE.Group();
  private readonly aim = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly landing = new THREE.Vector3();
  private readonly feet = new THREE.Vector3();
  private readonly perches: THREE.Vector3[] = [];
  private target!: Target;
  private alert!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private armDrop = { value: 1.05, forward: { value: 0 } };
  private impact = 0;
  private attackIndex = 0;
  private leapDuration: number = C.leapTime;
  private visualTime = 0;
  private hud!: HTMLDivElement;
  private fire!: ForestFireEffects;
  private sound!: ForestRescueSound;
  private phase: Phase = 'wait';
  private timer = 0;
  private misses = 0;
  private stars: number = C.stars;
  private maxStars: number = C.stars;
  private started = false;
  private lastExhaustions = 0;
  private safe = new THREE.Vector3();
  private modelReady = false;

  build(ctx: LevelContext): void {
    this.ctx = ctx;ctx.save.setWhere(this.id);
    ctx.scene.background = new THREE.Color(0xc7a388);ctx.scene.fog = new THREE.Fog(0xba9b84,40,100);
    ctx.root.add(new THREE.HemisphereLight(0xffe4c6,0x516445,1.7));
    const sun = new THREE.DirectionalLight(0xffcc92,2);sun.position.set(-12,25,10);ctx.root.add(sun);
    const kit = new Kit(ctx.physics,makeMaterials());kit.solid([100,.4,100],[0,-.2,0],0x443b30);
    for(let row=0;row<3;row++)for(let column=0;column<3;column++) {
      const x=(column-1)*P.spacing,z=(row-1)*P.spacing,top=P.heights[2-row];
      this.perches.push(new THREE.Vector3(x,top,z));
      kit.solidCyl(.35,top,[x,top/2,z],0x8a603f);
      ctx.physics.addFixedCylinder(.16,P.radius,{x,y:top-.16,z});
      for(let side=-1;side<=1;side++)kit.lit.sph(1.8,[x+side*.9,top-.45,z],side?0x548941:0x7aae4f,[1,.3,1],1);
    }
    kit.build(ctx.root);buildForestScenery(ctx,true);
    this.fire=new ForestFireEffects(ctx);this.sound=new ForestRescueSound(ctx);
    ctx.root.add(this.boss);this.installModel();
    this.alert=new THREE.Mesh(new THREE.CircleGeometry(C.hitRadius,48),new THREE.MeshBasicMaterial({color:0xff2525,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2}));
    this.alert.rotation.x=-Math.PI/2;this.alert.visible=false;this.alert.renderOrder=3;ctx.root.add(this.alert);
    this.maxStars=ctx.save.data.settings.easyFight?C.starsEasy:C.stars;this.stars=this.maxStars;
    this.target=ctx.targets.add({id:'gorilla',position:()=>this.aim,radius:C.targetRadius,enabled:false,onHit:()=>this.hit()});
    ctx.game.setPlayerMode('superglen',false);ctx.game.setTransformAllowed(false);
    ctx.game.setSkills({fly:false,laser:true,shield:true});ctx.player.preferAirJump=true;ctx.player.levelSpeedScale=.76;
    const bounds={minX:-C.arenaRadius,maxX:C.arenaRadius,minZ:-C.arenaRadius,maxZ:C.arenaRadius};
    ctx.player.flight.bounds=bounds;ctx.player.flight.groundBounds=bounds;
    ctx.health.setShown(true);this.lastExhaustions=ctx.health.exhaustions;
    this.hud=document.createElement('div');this.hud.className='gorilla-hint';
    ctx.ui.append(this.hud);ctx.onDispose(()=>{this.hud.remove();ctx.health.setShown(false);});
    this.safe.set(this.spawn.x,this.spawn.y,this.spawn.z);
    this.reset();
    ctx.seq.run(async()=>{
      await ctx.seq.waitUntil(()=>startGate.started);
      if(ctx.save.isChapterDone('forest-gorilla')){this.phase='done';this.hud.textContent='Gorilla sudah tenang — berikutnya padamkan api';return;}
      await ctx.dialog.say({id:'forest_gorilla_accuse',speaker:'gorila',text:'Kamu manusia yang membakar hutanku? Pergi dari sini!'},{lockControls:true});
      await ctx.dialog.say({id:'forest_glen_explain',speaker:'glen',text:'Bukan aku! Kami datang menolong monyet-monyet. Tenang dulu, Gorilla!'},{lockControls:true});
      await ctx.dialog.say({id:'forest_nino_gorilla_pattern',speaker:'nino',text:'Hindari lompatan Gorilla atau pakai perisai. Setelah dua serangannya gagal, tembak saat dia beristirahat. Alat terbangmu masih rusak, jadi tetap di atas pohon!'},{lockControls:true});
      this.started=true;this.enterBattle();
    });
  }
  private installModel(): void {
    const geometry=enemyModels.geometry('gorilla_gembira',C.height);
    if(!geometry) {
      if(!this.boss.children.length)this.boss.add(new THREE.Mesh(new THREE.CapsuleGeometry(.8,1,4,10),new THREE.MeshStandardMaterial({color:0x665044})));
      return;
    }
    for(const child of this.boss.children)if(child instanceof THREE.Mesh)child.geometry.dispose();
    const material=enemyModels.material('gorilla_gembira')!.clone();
    this.armDrop=poseGorillaArms(geometry,material,C.height);
    this.boss.clear();this.boss.add(new THREE.Mesh(geometry,material));this.modelReady=true;
  }
  private reset(): void {
    this.boss.position.copy(this.perches[1]);this.phase='wait';this.timer=C.cooldown;
    this.misses=0;this.stars=this.maxStars;this.target.enabled=false;this.alert.visible=false;
    this.impact=0;this.attackIndex=0;
  }
  private enterBattle(): void {
    this.ctx.battle.enter({id:'gorila',name:'Gorilla Gembira',focus:()=>this.aim,
      arena:{x:0,z:0,r:C.arenaRadius},stars:()=>({left:this.stars,max:this.maxStars}),ownBar:true,aura:0xffb86c});
  }
  private lockLanding(): void {
    let closest=this.perches[0],best=Infinity;const player=this.ctx.player.position;
    for(const perch of this.perches){const d=Math.hypot(player.x-perch.x,player.z-perch.z);if(d<best){best=d;closest=perch;}}
    const dx=player.x-closest.x,dz=player.z-closest.z,d=Math.hypot(dx,dz),k=d>0?Math.min(1,(P.radius-.5)/d):0;
    this.landing.set(closest.x+dx*k,closest.y,closest.z+dz*k);
    this.alert.position.copy(this.landing);this.alert.position.y+=.13;
  }
  private retreat(): void {
    let farthest=this.perches[0],best=-1;const player=this.ctx.player.position;
    for(const perch of this.perches){const d=Math.hypot(player.x-perch.x,player.z-perch.z);if(d>best){best=d;farthest=perch;}}
    this.from.copy(this.boss.position);this.landing.copy(farthest);this.phase='retreat';this.timer=C.retreatTime;
  }
  fixedUpdate(dt: number): void {
    const ctx=this.ctx;
    if(this.phase==='done'||!this.started||!ctx.game.controlsEnabled||ctx.health.resting)return;
    if(ctx.health.exhaustions!==this.lastExhaustions){this.lastExhaustions=ctx.health.exhaustions;this.reset();this.enterBattle();return;}
    if(ctx.battle.entering)return;
    ctx.player.getFeetPosition(this.feet);
    if(this.feet.y<P.resetFeetHeight){
      // A fall costs one heart and puts Glen back on the last safe canopy; the Gorilla's stars and chain stay.
      ctx.health.fall();
      ctx.player.placeAt(this.safe.x,this.safe.y,this.safe.z,Math.PI);ctx.cameraRig.snapBehind(Math.PI);return;
    }
    if(ctx.player.grounded)for(const perch of this.perches){
      if(Math.abs(this.feet.y-perch.y)<.3&&Math.hypot(this.feet.x-perch.x,this.feet.z-perch.z)<P.radius-.4){this.safe.copy(perch);break;}
    }
    const forced=ctx.game.debugInfo.gorillaForceStars;// test hook: set the energy once
    if(typeof forced==='number'){this.stars=forced;delete ctx.game.debugInfo.gorillaForceStars;}
    this.timer-=dt;
    if(this.phase==='retreat'){
      const t=Math.min(1,1-this.timer/C.retreatTime);this.boss.position.lerpVectors(this.from,this.landing,t);this.boss.position.y+=Math.sin(t*Math.PI)*C.leapArc*.6;
      if(this.timer<=0){this.boss.position.copy(this.landing);this.phase='wait';this.timer=C.cooldown;}
      return;
    }
    if(this.phase==='wait'&&this.timer<=0){this.lockLanding();this.attackIndex++;this.phase='wind';this.timer=C.windup*(this.stars<=this.maxStars/2?C.enrageWindScale:1);this.alert.visible=true;}
    else if(this.phase==='wind'&&this.timer<=0){this.from.copy(this.boss.position);this.phase='leap';this.leapDuration=this.attackIndex%2===0?C.fastLeapTime:C.leapTime;this.timer=this.leapDuration;}
    else if(this.phase==='leap') {
      const t=Math.min(1,1-this.timer/this.leapDuration);this.boss.position.lerpVectors(this.from,this.landing,t);this.boss.position.y+=Math.sin(t*Math.PI)*C.leapArc*(this.attackIndex%2===0?C.slamArcScale:1);
      if(this.timer<=0){
        this.boss.position.copy(this.landing);this.alert.visible=false;
        const near=Math.hypot(this.feet.x-this.landing.x,this.feet.z-this.landing.z)<C.hitRadius&&Math.abs(this.feet.y-this.landing.y)<C.hitHeight;
        const result=near?ctx.health.hurt(this.from.x,this.from.z):'miss';
        if(result==='miss'||result==='blocked')this.misses++;else if(result==='hit')this.misses=0;
        this.impact=C.impactTime;
        ctx.fx.sparkles.burst(this.landing.x,this.landing.y+.1,this.landing.z,32,3,0xc9af86,{life:.8,up:.8,gravity:1.5});
        ctx.fx.sparkles.burst(this.landing.x,this.landing.y+.3,this.landing.z,20,4,0x77a44c,{life:1,up:2,gravity:3});
        ctx.synth.drum(0,true);
        if(!ctx.save.data.settings.reduceShake)ctx.cameraRig.shake(.22,.3);
        this.phase='recover';this.timer=C.recover;
      }
    } else if(this.phase==='recover'&&this.timer<=0){
      if(this.misses>=C.missesToOpen){this.phase='open';this.timer=C.vulnerable;this.target.enabled=true;}else this.retreat();
    } else if(this.phase==='open'&&this.timer<=0){this.target.enabled=false;this.misses=0;this.retreat();}
    ctx.game.debugInfo.gorillaPhase=this.phase;ctx.game.debugInfo.gorillaMisses=this.misses;ctx.game.debugInfo.gorillaStars=this.stars;
  }
  private hit(): void {
    if(this.phase!=='open')return;
    this.stars--;this.target.enabled=false;this.misses=0;
    this.ctx.fx.sparkles.burst(this.aim.x,this.aim.y,this.aim.z,24,3,0xffdb65,{life:.8});
    if(this.stars<=0){this.phase='done';this.win();}else this.retreat();
  }
  private win(): void {
    const ctx=this.ctx;ctx.battle.exit(true);ctx.audio.music.setScene('jelajah');ctx.save.markChapterDone('forest-gorilla');
    ctx.seq.run(async()=>{
      await ctx.dialog.say({id:'forest_gorilla_sorry',speaker:'gorila',text:'Maaf, {nama}. Aku salah paham. Ternyata kamu datang untuk menolong kami.'},{lockControls:true});
      await ctx.dialog.say({id:'forest_glen_help_fire',speaker:'glen',text:'Tidak apa-apa, Gorilla. Ayo kita selamatkan hutan ini bersama!'},{lockControls:true});
      this.hud.textContent='Gorilla sudah tenang — berikutnya padamkan api';
    });
  }
  update(dt: number): void {
    if(!this.modelReady)this.installModel();this.fire.update(dt);this.sound.update(dt,false);
    this.visualTime+=dt;
    this.impact=Math.max(0,this.impact-dt);
    const airborne=this.phase==='leap',striking=this.impact>0;
    const drop=airborne?1.2:this.phase==='retreat'?.65:1.1;
    this.armDrop.value=THREE.MathUtils.lerp(this.armDrop.value,drop,Math.min(1,dt*12));
    const forward=airborne?2.5:this.phase==='wind'?1.3:striking?.12:0;
    this.armDrop.forward.value=THREE.MathUtils.lerp(this.armDrop.forward.value,forward,Math.min(1,dt*(striking?30:10)));
    const squash=this.impact/C.impactTime;
    this.boss.scale.set(1+squash*.08,1-squash*.2,1+squash*.08);
    this.boss.rotation.x=striking?.3:this.phase==='wind'?.12:this.phase==='open'?.07:0;
    if(this.alert.visible)this.alert.material.opacity=.28+.58*(.5+.5*Math.sin(this.visualTime*16));
    this.aim.copy(this.boss.position);this.aim.y+=C.height*.6;
    this.boss.rotation.y=Math.atan2(this.ctx.player.position.x-this.boss.position.x,this.ctx.player.position.z-this.boss.position.z);
    if(this.phase!=='done'){const t=this.phase==='open'?'Sekarang tembak!':`Hindari atau tangkis: ${this.misses}/${C.missesToOpen}`;if(this.hud.textContent!==t)this.hud.textContent=t;}
  }
  dispose(): void {}
}
