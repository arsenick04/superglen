import { envModels } from './EnvModels';
import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { CITY, CITY_LAYOUT, districtAt, FACE_VEC } from './CityData';
import { box, cyl, merge, sph, type Part } from './ColorMesh';

/**
 * PACKAGE D6 L14: a living Kota Botanica. Ambient, NON-interactive people and traffic: pedestrians on the sidewalks, children
 * playing in the parks and school fields (chasing, kicking a ball, hopping), bicycles, motorbikes and cars in the lanes of the road
 * network of `CITY_LAYOUT.roads`.
 *
 *  - Nothing has a collider and nothing ever pushes the player: vehicles and walkers only brake and wait (a car stops about 3 m
 *    before Glen when he stands in its lane, e.g. while crossing the street).
 *  - Cheap: ONE InstancedMesh per kind (5 draw calls in all, no shadow casting), per-instance colour, walkers posed in the vertex
 *    shader. Only agents within `simRadius` of the player are simulated (at most `maxSim`), the rest stay frozen where they are;
 *    only those within `showRadius` and inside the camera frustum are written to the instance buffers.
 *  - No per-frame allocation: all state lives in plain preallocated objects and typed arrays.
 * Placement is derived from the city layout with the seeded generator (same crowd on every run).
 */
export const LifeConfig = {
  /** Agents closer than this to the player are simulated (m); the others are frozen. */
  simRadius: 70,
  /** Hard cap of simulated agents per frame. */
  maxSim: 120,
  /** Agents closer than this (and in view) are drawn (m). */
  showRadius: 48,
  cars: 56,
  motos: 30,
  bikes: 30,
  walkers: 250,
  /** People standing about (shop fronts, plaza). */
  idlers: 50,
  /** A vehicle stops this far in front of Glen (m), and starts braking `brakeDist` further out. */
  carStopGap: 3.2,
  brakeDist: 9,
  /** Lateral half width (m) of Glen's "in my lane" box. */
  laneHalf: 2.1,
  /** Walkers wait when Glen is within this distance ahead (m). */
  walkerGap: 1.5,
  /** Gap kept to the vehicle in front (m). */
  followGap: 4.5,
  carSpeed: [5.5, 7.5],
  motoSpeed: [7, 9],
  bikeSpeed: [2.8, 3.8],
  walkSpeed: [1.0, 1.6],
} as const;

const MAX_PED = 200;
const SIDE = { main: { off: 2.5, walk: 6.5 }, local: { off: 1.75, walk: 4.75 } } as const;

// ---- Data -------------------------------------------------------------------------------------------------------------------

/** A straight lane along one axis: `ax` x means it runs along x at z = `c`. */
interface Lane {
  ax: 'x' | 'z';
  /** Fixed world coordinate of the lane centre line (already including the side offset). */
  c: number;
  a0: number;
  a1: number;
  dir: 1 | -1;
  main: boolean;
}

interface Agent {
  /** 0 car, 1 moto, 2 bike, 3 walker, 4 kid. */
  kind: number;
  lane: Lane | null;
  /** Position along the lane axis (vehicles, walkers). */
  s: number;
  v: number;
  cruise: number;
  /** Index of the vehicle ahead in the same lane (or -1). */
  leader: number;
  /** World x, z, yaw, hop height, anim phase / amplitude (written by `place`). */
  x: number;
  z: number;
  yaw: number;
  y: number;
  phase: number;
  amp: number;
  color: number;
  /** Scale (x, y, z). */
  sx: number;
  sy: number;
  sz: number;
  /** Walker: lateral jitter. Kid: play mode data. */
  jit: number;
  mode: number;
  cx: number;
  cz: number;
  r: number;
  w: number;
  a0: number;
  /** Kid ball game: index of the ball (or -1). */
  ball: number;
}

interface Ball {
  x: number;
  z: number;
  y: number;
}

function rngFor(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Straight stretches of road (centre line, along-range), clipped away from the hill corner and the edge of the play area. */
function roadLines(): { ax: 'x' | 'z'; c: number; a0: number; a1: number; main: boolean }[] {
  const out: { ax: 'x' | 'z'; c: number; a0: number; a1: number; main: boolean }[] = [];
  const lim = CITY.playHalf - 6;
  for (const r of CITY_LAYOUT.roads) {
    const alongX = r.x1 - r.x0 > r.z1 - r.z0;
    const c = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    let a0 = Math.max(-lim, alongX ? r.x0 : r.z0);
    let a1 = Math.min(lim, alongX ? r.x1 : r.z1);
    if (alongX && c < -42) a1 = Math.min(a1, 42);
    if (!alongX && c > 42) a0 = Math.max(a0, -42);
    if (a1 - a0 < 30) continue;
    out.push({ ax: alongX ? 'x' : 'z', c, a0, a1, main: r.main });
  }
  return out;
}

/** Palette of car / clothes colours (district colours first, then some plain ones). */
const PALETTE = [0xff8fb1, 0x4dabf7, 0xf2b632, 0xff9f43, 0x2ec4b6, 0xe8577e, 0x7bc96f, 0xf4f1ea, 0xd9432f, 0x8e7cc3];

// ---- Models (facing +Z, feet at y = 0; white vertex colour = tinted by the instance colour) -----------------------------------

const W = 0xffffff;
const DARK = 0x2b2a33;
const SKIN = 0xf1c9a0;

/** Pedestrian with swinging limbs: every vertex has (pivot xyz, part id): 0 body, 1/2 arms, 3/4 legs. About 84 triangles. */
function walkerGeo(): THREE.BufferGeometry {
  const tag = (parts: Part[], id: number, px: number, py: number): THREE.BufferGeometry => {
    const g = merge(parts);
    g.translate(px, py, 0);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      a[i * 4] = px;
      a[i * 4 + 1] = py;
      a[i * 4 + 2] = 0;
      a[i * 4 + 3] = id;
    }
    g.setAttribute('pivotPart', new THREE.BufferAttribute(a, 4));
    return g;
  };
  const body = tag(
    [
      { g: box(0.34, 0.4, 0.2), c: W, p: [0, 0.68, 0] },
      { g: box(0.22, 0.22, 0.22), c: SKIN, p: [0, 1.0, 0] },
      { g: box(0.24, 0.09, 0.24), c: DARK, p: [0, 1.13, -0.01] },
    ],
    0,
    0,
    0,
  );
  const arm = (x: number, id: number): THREE.BufferGeometry => tag([{ g: box(0.09, 0.34, 0.09), c: SKIN, p: [0, -0.15, 0] }], id, x, 0.84);
  const leg = (x: number, id: number): THREE.BufferGeometry => tag([{ g: box(0.13, 0.46, 0.13), c: 0x3d4a7a, p: [0, -0.23, 0] }], id, x, 0.46);
  const list = [body, arm(-0.23, 1), arm(0.23, 2), leg(-0.09, 3), leg(0.09, 4)];
  return finish(list);
}

function finish(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeAll(list);
  g.computeBoundingSphere();
  return g;
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Same attribute set on every geometry (position, normal, uv, color, pivotPart): concatenate by hand to avoid another import.
  let verts = 0;
  let idx = 0;
  for (const g of list) {
    verts += g.getAttribute('position').count;
    idx += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  const pos = new Float32Array(verts * 3);
  const nrm = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const pp = new Float32Array(verts * 4);
  const ix = new Uint16Array(idx);
  let v = 0;
  let k = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    pos.set(p.array as Float32Array, v * 3);
    nrm.set(g.getAttribute('normal').array as Float32Array, v * 3);
    col.set(g.getAttribute('color').array as Float32Array, v * 3);
    pp.set(g.getAttribute('pivotPart').array as Float32Array, v * 4);
    if (g.index) for (let i = 0; i < g.index.count; i++) ix[k++] = g.index.getX(i) + v;
    else for (let i = 0; i < p.count; i++) ix[k++] = i + v;
    v += p.count;
    g.dispose();
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('pivotPart', new THREE.BufferAttribute(pp, 4));
  out.setIndex(new THREE.BufferAttribute(ix, 1));
  return out;
}

/** Car: tinted body and cabin, dark windows and wheels, light lamps. About 110 triangles. Stretched into a van by the instance scale. */
function carGeo(): THREE.BufferGeometry {
  return merge([
    { g: box(1.5, 0.5, 3.4), c: W, p: [0, 0.5, 0] },
    { g: box(1.34, 0.46, 1.8), c: W, p: [0, 0.98, -0.2] },
    { g: box(1.38, 0.3, 1.5), c: 0x9fd6f2, p: [0, 1.0, -0.2] },
    { g: box(1.36, 0.06, 1.9), c: W, p: [0, 1.24, -0.2] },
    { g: box(0.22, 0.5, 0.56), c: DARK, p: [0.78, 0.25, 1.0] },
    { g: box(0.22, 0.5, 0.56), c: DARK, p: [-0.78, 0.25, 1.0] },
    { g: box(0.22, 0.5, 0.56), c: DARK, p: [0.78, 0.25, -1.0] },
    { g: box(0.22, 0.5, 0.56), c: DARK, p: [-0.78, 0.25, -1.0] },
    { g: box(0.3, 0.14, 0.06), c: 0xfff2b0, p: [0.5, 0.58, 1.72] },
    { g: box(0.3, 0.14, 0.06), c: 0xfff2b0, p: [-0.5, 0.58, 1.72] },
    { g: box(0.3, 0.12, 0.06), c: 0xd9432f, p: [0.5, 0.58, -1.72] },
    { g: box(0.3, 0.12, 0.06), c: 0xd9432f, p: [-0.5, 0.58, -1.72] },
  ]);
}

/** Motorbike with a rider (the rider's shirt is tinted). About 90 triangles. */
function motoGeo(): THREE.BufferGeometry {
  return merge([
    { g: box(0.16, 0.56, 0.56), c: DARK, p: [0, 0.28, 0.6] },
    { g: box(0.16, 0.56, 0.56), c: DARK, p: [0, 0.28, -0.6] },
    { g: box(0.3, 0.3, 1.2), c: W, p: [0, 0.6, 0.0] },
    { g: box(0.34, 0.1, 0.5), c: DARK, p: [0, 0.82, -0.25] },
    { g: box(0.5, 0.06, 0.06), c: DARK, p: [0, 1.02, 0.5] },
    { g: box(0.3, 0.42, 0.22), c: W, p: [0, 1.1, -0.2] },
    { g: box(0.22, 0.22, 0.22), c: 0xf2b632, p: [0, 1.48, -0.18] },
    { g: box(0.16, 0.14, 0.4), c: 0x3d4a7a, p: [0.12, 0.85, 0.05] },
    { g: box(0.16, 0.14, 0.4), c: 0x3d4a7a, p: [-0.12, 0.85, 0.05] },
  ]);
}

/** Bicycle with a child rider. About 100 triangles. */
function bikeGeo(): THREE.BufferGeometry {
  return merge([
    { g: cyl(0.3, 0.3, 0.06, 7), c: DARK, p: [0, 0.3, 0.55], r: [0, 0, Math.PI / 2] },
    { g: cyl(0.3, 0.3, 0.06, 7), c: DARK, p: [0, 0.3, -0.55], r: [0, 0, Math.PI / 2] },
    { g: box(0.06, 0.06, 1.0), c: W, p: [0, 0.55, 0], r: [0.1, 0, 0] },
    { g: box(0.05, 0.5, 0.05), c: W, p: [0, 0.55, 0.5] },
    { g: box(0.4, 0.04, 0.05), c: DARK, p: [0, 0.85, 0.5] },
    { g: box(0.14, 0.04, 0.26), c: DARK, p: [0, 0.78, -0.35] },
    { g: box(0.26, 0.34, 0.18), c: W, p: [0, 1.0, -0.2], r: [0.25, 0, 0] },
    { g: box(0.2, 0.2, 0.2), c: SKIN, p: [0, 1.3, -0.1] },
    { g: box(0.22, 0.08, 0.22), c: DARK, p: [0, 1.42, -0.12] },
    { g: box(0.12, 0.4, 0.12), c: 0x3d4a7a, p: [0.1, 0.6, -0.1], r: [-0.4, 0, 0] },
    { g: box(0.12, 0.4, 0.12), c: 0x3d4a7a, p: [-0.1, 0.6, -0.1], r: [-0.4, 0, 0] },
  ]);
}

// ---- Walker material: limbs swing in the vertex shader (per-instance phase and amplitude) ----------------------------------------

const GLSL = `
attribute vec4 pivotPart;
attribute vec2 aAnim;
mat3 lifeR(float id) {
  float s = sin(aAnim.x) * aAnim.y;
  float ax = id < 0.5 ? 0.0 : (id < 1.5 ? -s * 0.8 : (id < 2.5 ? s * 0.8 : (id < 3.5 ? s : -s)));
  float az = id < 0.5 ? 0.0 : (id < 1.5 ? -0.08 : (id < 2.5 ? 0.08 : 0.0));
  float cx = cos(ax), sx = sin(ax), cz = cos(az), sz = sin(az);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
  return rx * rz;
}
`;

function walkerMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  m.customProgramCacheKey = () => 'city-life-walker';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = lifeR(pivotPart.w) * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = pivotPart.xyz + lifeR(pivotPart.w) * (position - pivotPart.xyz);');
  };
  return m;
}

// ---- The system -----------------------------------------------------------------------------------------------------------------

export class CityLife {
  private readonly agents: Agent[] = [];
  private readonly lanes: Lane[] = [];
  private readonly balls: Ball[] = [];
  private readonly cars: THREE.InstancedMesh;
  private readonly motos: THREE.InstancedMesh;
  private readonly bikes: THREE.InstancedMesh;
  private readonly peds: THREE.InstancedMesh;
  private readonly ballMesh: THREE.InstancedMesh;
  private readonly anim: THREE.InstancedBufferAttribute;
  private readonly meshes: THREE.InstancedMesh[];
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly tc = new THREE.Color();
  private t = 0;
  /** A boss arena: nobody of the city life is drawn inside this circle (they carry no colliders, so they would drive through the fight). */
  clearZone: { x: number; z: number; r: number } | null = null;
  /** Counters for tests. */
  simulated = 0;
  shown = 0;
  stopped = 0;
  readonly counts = [0, 0, 0, 0, 0];

  constructor(private readonly ctx: LevelContext) {
    const rnd = rngFor(CITY.seed ^ 0x11fe);
    const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
    const range = (r: readonly [number, number]): number => r[0] + rnd() * (r[1] - r[0]);
    const lines = roadLines();

    // Vehicle lanes (left-hand traffic): both directions of every road line.
    const lanes: Lane[] = [];
    for (const l of lines) {
      const off = l.main ? SIDE.main.off : SIDE.local.off;
      for (const dir of [1, -1] as const) lanes.push({ ax: l.ax, c: l.ax === 'x' ? l.c - dir * off : l.c + dir * off, a0: l.a0, a1: l.a1, dir, main: l.main });
    }
    this.lanes.push(...lanes);
    const mainLanes = lanes.filter((l) => l.main);
    const byLane = new Map<Lane, number[]>();
    const addVehicle = (kind: number, lane: Lane): void => {
      const a = this.blank(kind);
      a.lane = lane;
      a.s = lane.a0 + 8 + rnd() * (lane.a1 - lane.a0 - 16);
      a.cruise = kind === 0 ? range(LifeConfig.carSpeed) : kind === 1 ? range(LifeConfig.motoSpeed) : range(LifeConfig.bikeSpeed);
      a.v = a.cruise;
      const mid = lane.ax === 'x' ? lane.c : lane.c;
      const cx = lane.ax === 'x' ? a.s : mid;
      const cz = lane.ax === 'x' ? mid : a.s;
      const dist = districtAt(cx, cz);
      a.color = rnd() < 0.55 ? pick([dist.color, ...dist.roofs, dist.walls[0]]) : pick(PALETTE);
      if (kind === 0 && rnd() < 0.4) {
        a.sx = 1.05;
        a.sy = 1.35;
        a.sz = 1.2;
      }
      const list = byLane.get(lane) ?? [];
      list.push(this.agents.length);
      byLane.set(lane, list);
      this.agents.push(a);
    };
    // Space vehicles of one lane at least `minGap` apart (retry the roll).
    const place = (kind: number, count: number, pool: Lane[]): void => {
      for (let i = 0; i < count; i++) {
        const lane = pool[(i * 7 + kind * 3) % pool.length];
        addVehicle(kind, lane);
        const list = byLane.get(lane) as number[];
        const me = this.agents[list[list.length - 1]];
        for (let tries = 0; tries < 12; tries++) {
          let ok = true;
          for (const j of list) {
            if (j !== list[list.length - 1] && Math.abs(this.agents[j].s - me.s) < 24) ok = false;
          }
          if (ok) break;
          me.s = lane.a0 + 8 + rnd() * (lane.a1 - lane.a0 - 16);
        }
      }
    };
    place(0, LifeConfig.cars, mainLanes);
    place(1, LifeConfig.motos, lanes);
    place(2, LifeConfig.bikes, lanes);
    // Leader of each vehicle = the next one ahead on its lane (wrapping), so followers keep their distance.
    for (const [lane, list] of byLane) {
      const sorted = list.slice().sort((p, q) => (this.agents[p].s - this.agents[q].s) * lane.dir);
      for (let i = 0; i < sorted.length; i++) this.agents[sorted[i]].leader = sorted.length > 1 ? sorted[(i + 1) % sorted.length] : -1;
    }

    // Walkers: on the sidewalks, both sides of every road line.
    const sideLanes: Lane[] = [];
    for (const l of lines) {
      const w = l.main ? SIDE.main.walk : SIDE.local.walk;
      for (const side of [-1, 1] as const) sideLanes.push({ ax: l.ax, c: l.c + side * w, a0: l.a0 + 4, a1: l.a1 - 4, dir: side > 0 ? 1 : -1, main: l.main });
    }
    for (let i = 0; i < LifeConfig.walkers; i++) {
      const a = this.blank(3);
      const lane = sideLanes[(i * 5 + 1) % sideLanes.length];
      a.lane = lane;
      a.s = lane.a0 + rnd() * (lane.a1 - lane.a0);
      a.cruise = range(LifeConfig.walkSpeed);
      a.v = a.cruise;
      a.jit = (rnd() - 0.5) * 1.0;
      a.color = pick(PALETTE);
      const g = 0.92 + rnd() * 0.2;
      a.sx = a.sz = g;
      a.sy = g;
      a.mode = rnd() < 0.5 ? 1 : -1;
      a.phase = rnd() * 6;
      this.agents.push(a);
    }

    // Children at the parks, the school fields and the plaza.
    const ponds = CITY_LAYOUT.ponds;
    const spots = CITY_LAYOUT.pois.filter((p) => p.name === 'Taman' || p.name === 'Lapangan');
    spots.push({ id: 'plaza', name: 'Alun-alun', x: -14, z: -16, radius: 10 });
    let si = 0;
    for (const sp of spots) {
      // A pond-free centre a few metres from the middle.
      let cx = sp.x;
      let cz = sp.z;
      for (const [dx, dz] of [[4, 4], [-4, 4], [4, -4], [-4, -4], [0, 6], [0, -6]]) {
        if (!ponds.some((p) => Math.hypot(sp.x + dx - p.x, sp.z + dz - p.z) < p.r + 5)) {
          cx = sp.x + dx;
          cz = sp.z + dz;
          break;
        }
      }
      const kid = (): Agent => {
        const a = this.blank(4);
        a.color = pick(PALETTE);
        a.sx = a.sy = a.sz = 0.72 + rnd() * 0.08;
        this.agents.push(a);
        return a;
      };
      si++;
      const game: number = 2;
      if (game === 0 || game === 2) {
        // Two children chasing each other round a spot.
        for (let k = 0; k < 2; k++) {
          const a = kid();
          a.mode = 0;
          a.cx = cx;
          a.cz = cz;
          a.r = 3.2;
          a.w = 1.1 * (game === 0 ? 1 : -1);
          a.a0 = k * Math.PI;
        }
      }
      if (game === 1 || game === 2) {
        // Kicking a ball to each other, plus one child hopping with joy.
        const ball = this.balls.length;
        this.balls.push({ x: 0, z: 0, y: 0 });
        for (let k = 0; k < 2; k++) {
          const a = kid();
          a.mode = 1;
          a.cx = cx + (game === 2 ? 7 : 0) + (k ? 3 : -3);
          a.cz = cz + (game === 2 ? 7 : 0);
          a.ball = ball;
          a.a0 = k;
        }
        const h = kid();
        h.mode = 2;
        h.cx = cx + (game === 2 ? 7 : 0);
        h.cz = cz + (game === 2 ? 7 : 0) + 3.5;
        h.a0 = rnd() * 6;
      }
    }

    // Idle people: round the plaza and in front of shops (they sway a little, facing the street or the shop).
    {
      const fronts: { x: number; z: number; yaw: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const an = (i / 10) * Math.PI * 2;
        fronts.push({ x: Math.cos(an) * 12, z: Math.sin(an) * 12, yaw: an + Math.PI * 0.5 });
      }
      const shops = CITY_LAYOUT.buildings.filter((b) => b.kind === 'kiosk' || b.kind === 'ruko');
      for (const b of shops) {
        const f = FACE_VEC[b.face];
        const half = b.face < 2 ? b.d / 2 : b.w / 2;
        fronts.push({ x: b.x + f[0] * (half + 3.3), z: b.z + f[1] * (half + 3.3), yaw: Math.atan2(-f[0], -f[1]) });
      }
      for (let i = 0; i < LifeConfig.idlers && fronts.length > 0; i++) {
        const f = fronts[Math.floor(rnd() * fronts.length)];
        const a = this.blank(4);
        a.mode = 3;
        a.cx = f.x + (rnd() - 0.5) * 1.6;
        a.cz = f.z + (rnd() - 0.5) * 1.6;
        a.yaw = f.yaw;
        a.a0 = rnd() * 6;
        a.color = pick(PALETTE);
        a.sx = a.sy = a.sz = 0.92 + rnd() * 0.2;
        this.agents.push(a);
      }
    }

    // Meshes.
    const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, max: number): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      m.setColorAt(0, this.tc.setHex(0xffffff));
      ctx.root.add(m);
      return m;
    };
    const pedGeo = walkerGeo();
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PED * 2), 2);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    pedGeo.setAttribute('aAnim', this.anim);
    this.peds = mk(pedGeo, walkerMaterial(), MAX_PED);
    // Soft rounded car from the env models (scripts/build-env-assets.mjs); the box car is the fallback.
    const envCar = envModels.geometry('car');
    this.cars = mk(envCar ? envCar.clone() : carGeo(), carMat, 70);
    this.motos = mk(motoGeo(), carMat, 40);
    this.bikes = mk(bikeGeo(), carMat, 40);
    this.ballMesh = mk(sph(0.16, 6, 4), new THREE.MeshStandardMaterial({ roughness: 0.5 }), Math.max(1, this.balls.length));
    for (let i = 0; i < this.balls.length; i++) this.ballMesh.setColorAt(i, this.tc.setHex(0xff7a59));
    this.meshes = [this.cars, this.motos, this.bikes, this.peds, this.ballMesh];
    ctx.onDispose(() => {
      for (const m of this.meshes) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        m.dispose();
      }
    });

    if ((window as unknown as { __SG_TEST?: boolean }).__SG_TEST === true) {
      const w = window as unknown as { __life?: unknown };
      w.__life = {
        total: () => this.agents.length,
        vehicles: () => this.agents.filter((a) => a.kind < 3).map((a, i) => ({ i, kind: a.kind, ax: a.lane?.ax, c: a.lane?.c, dir: a.lane?.dir, main: a.lane?.main, s: a.s, v: a.v, x: a.x, z: a.z })),
        agents: () => this.agents.map((a) => ({ kind: a.kind, x: a.x, z: a.z, v: a.v })),
        /** Put a car on the lane (axis, centre line near c) exactly `dist` m behind `along`, at cruise speed. */
        carOnLane: (ax: string, c: number, along: number, dist: number) => {
          let lane: Lane | null = null;
          for (const l of this.lanes) if (l.ax === ax && Math.abs(l.c - c) < 0.2 && (!lane || l.dir > 0)) lane = l;
          const car = this.agents.find((x) => x.kind === 0);
          if (!lane || !car) return null;
          car.lane = lane;
          car.leader = -1;
          car.s = along - lane.dir * dist;
          car.v = car.cruise;
          for (const o of this.agents) if (o.leader >= 0 && this.agents[o.leader] === car) o.leader = -1;
          return { dir: lane.dir, c: lane.c, s: car.s, index: this.agents.indexOf(car) };
        },
        agent: (i: number) => {
          const a = this.agents[i];
          return { s: a.s, v: a.v, x: a.x, z: a.z };
        },
      };
      ctx.onDispose(() => {
        delete w.__life;
      });
    }
  }

  private blank(kind: number): Agent {
    return { kind, lane: null, s: 0, v: 0, cruise: 0, leader: -1, x: 0, z: 0, yaw: 0, y: 0, phase: 0, amp: 0, color: 0xffffff, sx: 1, sy: 1, sz: 1, jit: 0, mode: 0, cx: 0, cz: 0, r: 0, w: 0, a0: 0, ball: -1 };
  }

  /** World position and yaw of a lane agent. */
  private lanePlace(a: Agent): void {
    const l = a.lane as Lane;
    if (l.ax === 'x') {
      a.x = a.s;
      a.z = l.c + (a.kind === 3 ? a.jit : 0);
      a.yaw = l.dir > 0 === (a.kind !== 3 || a.mode > 0) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      a.x = l.c + (a.kind === 3 ? a.jit : 0);
      a.z = a.s;
      a.yaw = l.dir > 0 === (a.kind !== 3 || a.mode > 0) ? 0 : Math.PI;
    }
  }

  update(dt: number): void {
    const d = Math.min(dt, 0.05);
    this.t += d;
    const p = this.ctx.player.visualPosition;
    const onGround = p.y < 2.3;
    const sim2 = LifeConfig.simRadius * LifeConfig.simRadius;
    const show2 = LifeConfig.showRadius * LifeConfig.showRadius;
    const cam = this.ctx.cameraRig.camera;
    this.frustum.setFromProjectionMatrix(this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const n = [0, 0, 0, 0, 0];
    const ped = this.peds.instanceMatrix.array as Float32Array;
    const marr = [this.cars.instanceMatrix.array as Float32Array, this.motos.instanceMatrix.array as Float32Array, this.bikes.instanceMatrix.array as Float32Array, ped];
    let sim = 0;
    let stopped = 0;
    const ag = this.agents;
    // Balls first (kids read them).
    for (let i = 0; i < ag.length; i++) {
      const a = ag[i];
      const ln = a.lane;
      const dx = (ln ? (ln.ax === 'x' ? a.s : ln.c) : a.cx) - p.x;
      const dz = (ln ? (ln.ax === 'x' ? ln.c : a.s) : a.cz) - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > sim2 + 400 || sim >= LifeConfig.maxSim) continue;
      sim++;
      if (a.kind < 3) this.vehicle(a, d, p.x, p.z, onGround);
      else if (a.kind === 3) this.walker(a, d, p.x, p.z, onGround);
      else this.kid(a);
      if (a.v < 0.15 && a.kind < 4) stopped++;
      if (a.kind === 4 && a.mode === 1 && a.a0 === 0 && a.ball >= 0) this.ballStep(a);
      // Draw: near and in view.
      const ex = a.x - p.x;
      const ez = a.z - p.z;
      if (ex * ex + ez * ez > show2) continue;
      const cz0 = this.clearZone;
      if (cz0 && (a.x - cz0.x) * (a.x - cz0.x) + (a.z - cz0.z) * (a.z - cz0.z) < cz0.r * cz0.r) continue;
      this.sphere.center.set(a.x, 0.8, a.z);
      this.sphere.radius = 2.2;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      const k = a.kind === 4 ? 3 : a.kind;
      const idx = n[k];
      if (k === 3 && idx >= MAX_PED) continue;
      if (idx >= (this.meshes[k].instanceMatrix.count)) continue;
      const c = Math.cos(a.yaw);
      const s = Math.sin(a.yaw);
      const o = idx * 16;
      const m = marr[k];
      m[o] = a.sx * c;
      m[o + 1] = 0;
      m[o + 2] = -a.sx * s;
      m[o + 3] = 0;
      m[o + 4] = 0;
      m[o + 5] = a.sy;
      m[o + 6] = 0;
      m[o + 7] = 0;
      m[o + 8] = a.sz * s;
      m[o + 9] = 0;
      m[o + 10] = a.sz * c;
      m[o + 11] = 0;
      m[o + 12] = a.x;
      m[o + 13] = a.y;
      m[o + 14] = a.z;
      m[o + 15] = 1;
      const mesh = this.meshes[k];
      mesh.setColorAt(idx, this.tc.setHex(a.color));
      if (k === 3) {
        this.anim.array[idx * 2] = a.phase;
        this.anim.array[idx * 2 + 1] = a.amp;
      }
      n[k]++;
    }
    // Balls.
    const bm = this.ballMesh.instanceMatrix.array as Float32Array;
    let nb = 0;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      const ex = b.x - p.x;
      const ez = b.z - p.z;
      if (ex * ex + ez * ez > show2 || (b.x === 0 && b.z === 0)) continue;
      const o = nb * 16;
      bm.fill(0, o, o + 16);
      bm[o] = bm[o + 5] = bm[o + 10] = bm[o + 15] = 1;
      bm[o + 12] = b.x;
      bm[o + 13] = b.y;
      bm[o + 14] = b.z;
      nb++;
    }
    n[4] = nb;
    for (let k = 0; k < 5; k++) {
      const mesh = this.meshes[k];
      mesh.count = n[k];
      mesh.visible = n[k] > 0;
      this.counts[k] = n[k];
      if (n[k] > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor && k < 4) mesh.instanceColor.needsUpdate = true;
      }
    }
    if (n[3] > 0) this.anim.needsUpdate = true;
    this.simulated = sim;
    this.shown = n[0] + n[1] + n[2] + n[3] + n[4];
    this.stopped = stopped;
    const info = this.ctx.game.debugInfo;
    info.lifeAgents = ag.length;
    info.lifeSim = sim;
    info.lifeShown = this.shown;
    info.lifeStopped = stopped;
  }

  /** Vehicle: cruise along the lane, brake for the vehicle ahead and for Glen standing (or crossing) in the lane. Never moves into Glen. */
  private vehicle(a: Agent, dt: number, px: number, pz: number, onGround: boolean): void {
    const l = a.lane as Lane;
    let target = a.cruise;
    // Glen in front of me?
    if (onGround) {
      const along = l.ax === 'x' ? px : pz;
      const across = l.ax === 'x' ? pz : px;
      const ahead = (along - a.s) * l.dir;
      const side = Math.abs(across - l.c);
      if (ahead > -1.5 && ahead < LifeConfig.brakeDist + LifeConfig.carStopGap && side < LifeConfig.laneHalf) {
        const k = Math.max(0, Math.min(1, (ahead - LifeConfig.carStopGap) / LifeConfig.brakeDist));
        target = Math.min(target, a.cruise * k * k);
        if (ahead < LifeConfig.carStopGap + 0.2) target = 0;
      }
    }
    if (a.leader >= 0) {
      const o = this.agents[a.leader];
      const len = l.a1 - l.a0;
      let gap = ((o.s - a.s) * l.dir) % len;
      if (gap < 0) gap += len;
      if (gap < LifeConfig.followGap + 6) target = Math.min(target, o.v + Math.max(0, gap - LifeConfig.followGap) * 0.8);
      if (gap < LifeConfig.followGap) target = 0;
    }
    const acc = target > a.v ? 3.5 : 9;
    a.v += Math.max(-acc * dt, Math.min(acc * dt, target - a.v));
    a.s += l.dir * a.v * dt;
    if (l.dir > 0 && a.s > l.a1) a.s = l.a0;
    else if (l.dir < 0 && a.s < l.a0) a.s = l.a1;
    this.lanePlace(a);
    a.y = a.kind === 2 ? 0 : 0.03;
    a.amp = 0;
  }

  /** Walker: strolls along the sidewalk and turns round at the ends; waits when Glen is right in front. */
  private walker(a: Agent, dt: number, px: number, pz: number, onGround: boolean): void {
    const l = a.lane as Lane;
    const dirW = l.dir * a.mode;
    let target = a.cruise;
    if (onGround) {
      const along = l.ax === 'x' ? px : pz;
      const across = l.ax === 'x' ? pz : px;
      const ahead = (along - a.s) * dirW;
      if (ahead > -0.3 && ahead < LifeConfig.walkerGap + 1.2 && Math.abs(across - l.c - a.jit) < 0.9) target = ahead < LifeConfig.walkerGap ? 0 : a.cruise * 0.4;
    }
    a.v += (target - a.v) * Math.min(1, dt * 5);
    a.s += dirW * a.v * dt;
    if (a.s > l.a1) {
      a.s = l.a1;
      a.mode = -a.mode;
    } else if (a.s < l.a0) {
      a.s = l.a0;
      a.mode = -a.mode;
    }
    // `lanePlace` reads `mode` as the facing: > 0 follows the lane direction.
    this.lanePlace(a);
    a.y = 0;
    a.phase += dt * (3 + a.v * 4);
    a.amp = Math.min(1, a.v / 1.1) * 0.7;
  }

  /** Child at play: 0 chase in a circle, 1 kicks a ball to a partner, 2 hops about. */
  private kid(a: Agent): void {
    const t = this.t;
    if (a.mode === 0) {
      const th = a.a0 + t * a.w;
      a.x = a.cx + Math.cos(th) * a.r;
      a.z = a.cz + Math.sin(th) * a.r;
      // Tangent direction (model faces +Z): velocity = (-sin, cos) * w.
      a.yaw = Math.atan2(-Math.sin(th) * Math.sign(a.w), Math.cos(th) * Math.sign(a.w));
      a.phase = t * 9 + a.a0;
      a.amp = 0.9;
      a.y = 0;
      a.v = 1;
    } else if (a.mode === 1) {
      // Two partners face each other 6 m apart and hop a little when the ball arrives.
      a.x = a.cx;
      a.z = a.cz;
      a.yaw = a.a0 === 0 ? Math.PI / 2 : -Math.PI / 2;
      const cyc = (t % 3.2) / 1.6;
      const mine = (cyc < 1) === (a.a0 === 0);
      a.y = mine && cyc % 1 < 0.2 ? 0.25 * Math.sin((cyc % 1) * Math.PI * 5) : 0;
      a.amp = mine ? 0.5 : 0.1;
      a.phase = t * 7;
      a.v = 1;
    } else if (a.mode === 3) {
      a.x = a.cx;
      a.z = a.cz;
      a.y = 0;
      a.amp = 0;
      a.phase = 0;
      a.v = 1;
    } else {
      a.x = a.cx;
      a.z = a.cz;
      a.yaw = Math.sin(t * 0.7 + a.a0) * 2;
      a.y = Math.abs(Math.sin(t * 5 + a.a0)) * 0.3;
      a.amp = 0.8;
      a.phase = t * 10 + a.a0;
      a.v = 1;
    }
  }

  /** The ball of a kicking pair (driven by the first partner): a low arc between the two. */
  private ballStep(a: Agent): void {
    const b = this.balls[a.ball];
    const cyc = (this.t % 3.2) / 1.6;
    const u = cyc % 1;
    const from = cyc < 1 ? a.cx : a.cx + 6;
    const to = cyc < 1 ? a.cx + 6 : a.cx;
    b.x = from + (to - from) * u;
    b.z = a.cz;
    b.y = 0.16 + 4 * u * (1 - u) * 0.9;
  }
}
