import * as THREE from 'three';
import type { Input } from '../../input/Input';
import type { Player } from '../Player';

export const ShieldConfig = {
  /** One press gives a child time to move through an entire attack pattern. */
  duration: 3,
  /** Walking/flying speed while the dome is up. */
  speedScale: 0.6,
  /** Shell radius (m) and how far in front of the capsule centre the dome is centred. */
  radius: 1.25,
  forward: 0,
  popIn: 0.2,
  popOut: 0.12,
} as const;

/** Full translucent sphere, brightest along its silhouette. */
function buildDomeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 28, 16);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const rim = Math.pow(1 - Math.abs(z), 1.6);
    const y = pos.getY(i);
    const sheen = Math.max(0, y) * 0.12;
    const a = 0.3 + 0.55 * rim + sheen;
    col[i * 4] = 0.12 + 0.12 * rim;
    col[i * 4 + 1] = 0.52 + 0.25 * rim;
    col[i * 4 + 2] = 1;
    col[i * 4 + 3] = Math.min(0.72, a * 0.7);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return geo;
}

/**
 * Perisai cahaya: one press raises a blue sphere around Superglen for three seconds.
 * While raised: 60% speed, no laser, and incoming projectiles bounce back from every direction.
 *
 * Events: player.skills 'shieldUp' / 'shieldDown' / 'shieldBlock'. State: player.skills.shield.up.
 */
export class Shield {
  private readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private upTime = 0;
  /** Visual animation clocks: 0..1 pop progress. */
  private pop = 0;
  private flash = 0;
  private t = 0;
  private warming = false;
  private lastBlocks = 0;

  constructor(
    scene: THREE.Scene,
    private readonly player: Player,
    private readonly input: Input,
  ) {
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(buildDomeGeometry(), this.mat);
    this.dome.renderOrder = 4;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
    this.group.visible = false;
    scene.add(this.group);
    player.skills.shield.radius = ShieldConfig.radius;
  }

  get isUp(): boolean {
    return this.player.skills.shield.up;
  }

  private canRaise(): boolean {
    const p = this.player;
    return p.skills.unlocked.shield && p.mode === 'superglen' && p.inputEnabled;
  }

  /** Fixed step, BEFORE the player moves (it sets the speed scale). */
  fixedUpdate(dt: number): void {
    const hub = this.player.skills;
    const st = hub.shield;
    const can = this.canRaise();
    const want = can && this.input.wasPressed('shield');
    if (!st.up) {
      if (want) {
        st.up = true;
        this.upTime = 0;
        hub.emit('shieldUp', undefined);
      }
    } else {
      this.upTime += dt;
      if (!can || this.upTime >= ShieldConfig.duration) {
        st.up = false;
        hub.emit('shieldDown', undefined);
      }
    }
    this.player.speedScale = st.up ? ShieldConfig.speedScale : 1;

    // Dome follows the body (latest physics state).
    const p = this.player.position;
    const yaw = this.player.facing;
    st.yaw = yaw;
    st.x = p.x + Math.sin(yaw) * ShieldConfig.forward;
    st.y = p.y;
    st.z = p.z + Math.cos(yaw) * ShieldConfig.forward;

  }

  /** Per rendered frame: follow the interpolated body, pop-in/out animation, shimmer. */
  update(dt: number): void {
    const st = this.player.skills.shield;
    const blocks = this.player.skills.stats.shieldBlocks;
    if (blocks !== this.lastBlocks) {
      this.lastBlocks = blocks;
      this.flash = 1; // a ball just bounced: brighten the dome for a moment
    }
    const target = st.up ? 1 : 0;
    const rate = st.up ? 1 / ShieldConfig.popIn : 1 / ShieldConfig.popOut;
    this.pop += Math.sign(target - this.pop) * Math.min(Math.abs(target - this.pop), dt * rate);
    this.group.visible = this.warming || this.pop > 0.001;
    if (this.pop <= 0.001) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    const v = this.player.visualPosition;
    const yaw = this.player.object.rotation.y;
    this.group.position.set(v.x + Math.sin(yaw) * ShieldConfig.forward, v.y, v.z + Math.cos(yaw) * ShieldConfig.forward);
    this.group.rotation.y = yaw;
    // easeOutBack on the way in, plain shrink on the way out.
    const x = this.pop;
    const s = st.up ? 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2) : x;
    const r = ShieldConfig.radius;
    this.group.scale.set(r * s, r * s * 0.95, r * s);
    this.mat.opacity = Math.min(1, (0.88 + 0.12 * Math.sin(this.t * 9) + this.flash * 0.4) * Math.min(1, this.pop * 1.5));
  }

  warm(on: boolean): void {
    this.warming = on;
    this.group.visible = on || this.pop > 0.001;
  }
}
