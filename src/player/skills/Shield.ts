import * as THREE from 'three';
import type { Input } from '../../input/Input';
import type { Projectiles } from '../../gameplay/Projectiles';
import type { Player } from '../Player';

export const ShieldConfig = {
  /** A quick tap by a small child still blocks: the dome stays up at least this long (s). */
  minUp: 0.6,
  /** Walking/flying speed while the dome is up. */
  speedScale: 0.6,
  /** Shell radius (m) and how far in front of the capsule centre the dome is centred. */
  radius: 1.25,
  forward: 0.15,
  /** Shield assist: with no stick input the body turns toward a ball coming from this far (m). */
  assistRange: 12,
  /** ...if the ball is outside this many degrees of the facing. */
  assistArcDeg: 50,
  popIn: 0.2,
  popOut: 0.12,
} as const;

/** Golden half-dome shell: vertex alpha is strongest at the rim and softly see-through in the middle. */
function buildDomeGeometry(): THREE.BufferGeometry {
  // Front half of a sphere (phi 0..PI covers +Z), full height.
  const geo = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI, 0.12, Math.PI - 0.12);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i); // 0 at the rim, 1 at the centre of the bulge
    const rim = Math.pow(1 - Math.abs(z), 1.6);
    const y = pos.getY(i);
    const sheen = Math.max(0, y) * 0.12;
    const a = 0.3 + 0.55 * rim + sheen;
    col[i * 4] = 1.0;
    col[i * 4 + 1] = 0.62 + 0.25 * rim;
    col[i * 4 + 2] = 0.05 + 0.3 * rim;
    col[i * 4 + 3] = Math.min(0.92, a);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return geo;
}

/**
 * Perisai cahaya: hold the shield button to raise a golden dome in front of Superglen (K / right click / the shield
 * button). While raised: 60% speed, no laser, and projectiles that meet the front arc bounce back (see Projectiles).
 * A tap keeps it up for at least 0.6 s. No cooldown, no energy.
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
  private readonly reflectCos = Math.cos((ShieldConfig.assistArcDeg * Math.PI) / 180);

  constructor(
    scene: THREE.Scene,
    private readonly player: Player,
    private readonly input: Input,
    private readonly projectiles: () => Projectiles | null,
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
    const want = can && (this.input.isDown('shield') || this.input.wasPressed('shield'));
    if (!st.up) {
      if (want) {
        st.up = true;
        this.upTime = 0;
        hub.emit('shieldUp', undefined);
      }
    } else {
      this.upTime += dt;
      if (!can || (!want && this.upTime >= ShieldConfig.minUp)) {
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

    // Assist: standing still with the dome up, turn toward the ball that is coming.
    if (st.up) {
      const input = this.input.move;
      if (input.x * input.x + input.y * input.y < 0.01) {
        const ball = this.projectiles()?.nearestIncoming(p.x, p.z, ShieldConfig.assistRange);
        if (ball) {
          const dx = ball.pos.x - p.x;
          const dz = ball.pos.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.1 && (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d < this.reflectCos) this.player.turnTo(Math.atan2(dx, dz));
        }
      }
    }
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
