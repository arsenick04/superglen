import * as THREE from 'three';
import type { LevelContext } from '../Level';

/** Three instanced particle layers: turbulent flame, rising smoke and embers. */
export class ForestFireEffects {
  private readonly time = { value: 0 };
  constructor(ctx: LevelContext) {
    const vertexShader = `varying vec2 uvFire; varying float seed; uniform float time;
      void main(){uvFire=uv;seed=instanceMatrix[3].x*0.17+instanceMatrix[3].z;
      vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      float rise=mod(time*.55+seed,1.);
      #ifdef SMOKE
      center.y+=rise*7.;center.x+=sin(seed+rise*3.)*rise*1.5;
      #endif
      center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      gl_Position=projectionMatrix*center;}`;
    const fragmentShader = `varying vec2 uvFire;varying float seed;uniform float time;
      void main(){vec2 p=uvFire;float wave=sin(p.y*17.-time*7.+seed)*.07+sin(p.y*31.+time*4.+seed)*.035;
      float gust=sin(p.x*29.+p.y*13.+time*8.+seed)*sin(p.y*19.-time*5.+seed);
      float width=(1.-p.y)*.40+.025;float flame=1.-smoothstep(width*.40,width,abs(p.x-.5+wave*p.y+gust*.025));
      float alpha=flame*smoothstep(0.,.08,p.y)*(1.-smoothstep(.70,1.,p.y));
      vec3 color=mix(vec3(1.,.12,.015),vec3(1.,.84,.27),flame*(1.-p.y));
      #ifdef SMOKE
      float rise=mod(time*.55+seed,1.);alpha=(1.-smoothstep(.10,.5,length(p-.5)))*sin(rise*3.14159)*.38;
      color=mix(vec3(.12,.10,.09),vec3(.38,.34,.29),rise);
      #endif
      #ifdef EMBER
      alpha=1.-smoothstep(.10,.48,length(p-.5));color=vec3(1.,.55,.12);
      #endif
      gl_FragColor=vec4(color,alpha);}`;
    for (let layer = 0; layer < 3; layer++) {
      const material = new THREE.ShaderMaterial({
        uniforms: { time: this.time }, vertexShader, fragmentShader,
        defines: layer === 1 ? { SMOKE: 1 } : layer === 2 ? { EMBER: 1, SMOKE: 1 } : {},
        transparent: true, depthWrite: false, blending: layer === 1 ? THREE.NormalBlending : THREE.AdditiveBlending,
      });
      const count = layer === 2 ? 90 : layer === 0 ? 72 : 36;
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, count);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const cluster = layer === 0 ? Math.floor(i / 3) : i;
        const angle = cluster * 2.399;
        const radius = 17 + cluster % 5 * 2.3;
        dummy.position.set(Math.cos(angle) * radius, layer === 0 ? 1.7 : 2.8, 18 + Math.sin(angle) * radius);
        if(layer===0){dummy.position.x+=(i%3-1)*.7;dummy.position.y+=(i%3)*.45;}
        dummy.scale.set(layer === 0 ? 2.8 : layer === 1 ? 6 : .12, layer === 0 ? 4.8 : layer === 1 ? 7 : .2, 1);
        if(layer===0)dummy.scale.multiplyScalar(.75+(i%4)*.18);
        dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.frustumCulled = false;ctx.root.add(mesh);
    }
    const light = new THREE.PointLight(0xff8b36, 16, 45, 2);light.position.set(0,3,18);ctx.root.add(light);
  }
  update(dt: number): void { this.time.value += dt; }
}
