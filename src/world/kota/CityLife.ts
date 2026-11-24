import RAPIER from '@dimforge/rapier3d-compat';
import { PlayerConfig } from '../../player/PlayerConfig';
import { envModels } from './EnvModels';
import { cityModels, paintMaterial } from './CityModels';
import * as THREE from 'three';
import type { LevelContext } from '../Level';
import { CITY, CITY_LAYOUT, districtAt, FACE_VEC } from './CityData';
import { box, cyl, merge, sph, type Part } from './ColorMesh';

/**
 * PACKAGE D6 L14: a living Kota Botanica. Ambient, NON-interactive people and traffic: pedestrians on the sidewalks, children
 * playing in the parks and school fields (chasing, kicking a ball, hopping), bicycles, motorbikes and cars in the lanes of the road
 * network of `CITY_LAYOUT.roads`.
 *
 *  - Nearby agents have kinematic colliders. Traffic and pedestrians brake and wait for Glen.
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
  /** Traffic lights on the main crossings (s): green and yellow time of one road, then everything red for a moment, then the other road. */
  lights: { green: 9, yellow: 1.6, allRed: 1.2, /** stop line before the crossing centre (m) = main road half width + this */ stopLine: 1.2, /** car brakes to rest this far before the line (m) */ margin: 0.4 },
  motoSpeed: [7, 9],
  bikeSpeed: [2.8, 3.8],
  walkSpeed: [1.0, 1.6],
} as const;

const MAX_PED = 200;

/**
 * Car models of public/env/cars/cars.glb (scripts/build-cars.mjs, Quaternius CC0): one InstancedMesh each. `weight` = share of the
 * cars on every lane; All cars drive on the main roads. A missing file keeps the single old car.
 */
const CAR_MODELS = [
  { name: 'car_n1', weight: 5, max: 40 },
  { name: 'car_n2', weight: 5, max: 40 },
  { name: 'car_suv', weight: 4, max: 40 },
  { name: 'car_sports', weight: 3, max: 30 },
  { name: 'car_taxi', weight: 3, max: 30 },
  { name: 'bus_city', weight: 1, max: 12 },
  { name: 'bus_school', weight: 1, max: 12 },
] as const;
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
  /** Signalised crossings on this lane: position along the lane axis and the junction index. */
  stops: { pos: number; ix: number }[];
}

interface Agent {
  /** 0 car, 1 moto, 2 bike, 3 walker, 4 kid. */
  kind: number;
  /** Cars: index into CAR_MODELS (which InstancedMesh draws it, whose box is its collider). */
  model: number;
  /** Distance rolled (m): turns the wheels. */
  roll: number;
  /** True while Glen rides on the roof (set by the collider sync): the car does not brake for him then. */
  carrying?: boolean;
  /** Half length (m) of a vehicle: followers and the stop in front of Glen keep this much more room for long buses. */
  half: number;
  body?: RAPIER.RigidBody;
  placed?: boolean;
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
  /** Battle reaction: 0 normal, 1 running away, 2 watching from a distance, 3 walking back. `ox`/`oz` is the offset from the usual place. */
  flee: number;
  ox: number;
  oz: number;
  /** Unit direction away from the fight (set when fleeing starts) and the stand-off distance wanted (m). */
  ux: number;
  uz: number;
  off: number;
}

/** What BattleMode tells the city (see `CityLife.battle`). */
export interface CityBattle {
  /** The fight's centre. */
  x: number;
  z: number;
  /** People closer than this to the centre run away (m); they stop `watchR` from it and watch. */
  fleeR: number;
  watchR: number;
  /** Vehicles closer than this stop (m). */
  stopR: number;
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

/** Rounded seated rider shared by bicycles and motorbikes. */
function riderParts(helmet: boolean): Part[] {
  return [
    { g: new THREE.CapsuleGeometry(0.14, 0.20, 2, 8), c: W, p: [0, 1.02, -0.16], r: [0.16, 0, 0], s: [1, 1, 0.8] },
    { g: sph(0.16, 10, 6), c: SKIN, p: [0, 1.36, -0.10] },
    { g: new THREE.SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, 1.55), c: helmet ? 0xffc652 : 0x49372f, p: [0, 1.38, -0.11] },
    ...[-1, 1].flatMap((side): Part[] => [
      { g: new THREE.CapsuleGeometry(0.045, 0.31, 2, 6), c: SKIN, p: [side * 0.18, 0.97, 0.08], r: [-0.9, 0, side * 0.12] },
      { g: new THREE.CapsuleGeometry(0.065, 0.26, 2, 6), c: 0x435879, p: [side * 0.13, 0.64, -0.08], r: [-0.45, 0, 0] },
      { g: sph(0.075, 6, 4), c: 0xf1e8d5, p: [side * 0.14, 0.43, 0.04], s: [1, 0.65, 1.5] },
      { g: sph(0.018, 5, 3), c: DARK, p: [side * 0.055, 1.38, 0.044] },
    ]),
  ];
}

/** Round toy-like pedestrian. Every vertex has a pivot/part id; one instanced draw still animates the entire crowd. */
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
  // Large expressive head, soft hair cap, shirt sleeves, rounded hands and shoes share the heroes' friendly proportions.
  const body = tag(
    [
      { g: new THREE.CapsuleGeometry(0.19, 0.21, 1, 8), c: W, p: [0, 0.73, 0], s: [1, 1, 0.76] },
      { g: sph(0.2, 12, 8), c: SKIN, p: [0, 1.12, 0] },
      { g: new THREE.SphereGeometry(0.21, 12, 5, 0, Math.PI * 2, 0, 1.38), c: 0x4d352c, p: [0, 1.135, -0.015] },
      { g: sph(0.033, 6, 4), c: SKIN, p: [0, 1.105, 0.192], s: [0.92, 0.86, 1.15] },
      ...[-1, 1].flatMap((s): Part[] => [
        { g: sph(0.045, 6, 3), c: SKIN, p: [s * 0.196, 1.105, 0] },
        { g: sph(0.036, 6, 3), c: 0xfffdf6, p: [s * 0.073, 1.14, 0.179], s: [1, 1.2, 0.45] },
        { g: sph(0.021, 5, 3), c: DARK, p: [s * 0.073, 1.137, 0.196], s: [1, 1.15, 0.5] },
        { g: sph(0.007, 5, 2), c: 0xfffdf6, p: [s * 0.073 - 0.006, 1.146, 0.206] },
      ]),
      { g: new THREE.TorusGeometry(0.046, 0.009, 3, 6, Math.PI), c: 0x9c5146, p: [0, 1.065, 0.19], r: [0, 0, Math.PI] },
    ],
    0,
    0,
    0,
  );
  const arm = (x: number, id: number): THREE.BufferGeometry => tag([
    { g: new THREE.CapsuleGeometry(0.055, 0.21, 1, 6), c: SKIN, p: [0, -0.17, 0] },
    { g: sph(0.084, 6, 3), c: W, p: [0, -0.015, 0], s: [1, 1.3, 1] },
    { g: sph(0.063, 6, 3), c: SKIN, p: [0, -0.32, 0] },
  ], id, x, 0.87);
  const leg = (x: number, id: number): THREE.BufferGeometry => tag([
    { g: new THREE.CapsuleGeometry(0.065, 0.28, 1, 6), c: 0x47619b, p: [0, -0.19, 0] },
    { g: sph(0.085, 6, 3), c: 0xf6efdc, p: [0, -0.4, 0.035], s: [1, 0.65, 1.45] },
  ], id, x, 0.47);
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
  // Clothes alone inherit the instance palette. Skin, eyes, hair and shoes keep their authored colour.
  const cloth = new Float32Array(verts);
  for (let i = 0; i < verts; i++) cloth[i] = col[i * 3] > 0.99 && col[i * 3 + 1] > 0.99 && col[i * 3 + 2] > 0.99 ? 1 : 0;
  out.setAttribute('aCloth', new THREE.BufferAttribute(cloth, 1));
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
    { g: cyl(0.28, 0.28, 0.16, 12), c: DARK, p: [0, 0.28, 0.6], r: [0, 0, Math.PI / 2] },
    { g: cyl(0.28, 0.28, 0.16, 12), c: DARK, p: [0, 0.28, -0.6], r: [0, 0, Math.PI / 2] },
    { g: sph(0.4, 10, 6), c: W, p: [0, 0.6, 0.05], s: [0.55, 0.65, 1.45] },
    { g: box(0.34, 0.1, 0.5), c: DARK, p: [0, 0.82, -0.25] },
    { g: box(0.5, 0.06, 0.06), c: DARK, p: [0, 1.02, 0.5] },
    { g: sph(0.075, 8, 5), c: 0xfff2cb, p: [0, 0.78, 0.58] },
    ...riderParts(true),
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
    ...riderParts(false),
  ]);
}

/** Keep the rider's skin, helmet, tyres and face independent of vehicle paint. */
function riderMaterial(geometry: THREE.BufferGeometry): THREE.MeshStandardMaterial {
  const colors = geometry.getAttribute('color');
  const tint = new Float32Array(colors.count);
  for (let i = 0; i < colors.count; i++) tint[i] = colors.getX(i) > 0.99 && colors.getY(i) > 0.99 && colors.getZ(i) > 0.99 ? 1 : 0;
  geometry.setAttribute('aPaint', new THREE.BufferAttribute(tint, 1));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  material.customProgramCacheKey = () => 'city-rider-paint';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPaint;')
      .replace('#include <color_vertex>', `vColor = vec4(color, 1.0);
#ifdef USE_INSTANCING_COLOR
if (aPaint > 0.5) vColor.rgb *= instanceColor;
#endif`);
  };
  return material;
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
      .replace('#include <common>', '#include <common>\nattribute float aCloth;\n' + GLSL)
      .replace('#include <color_vertex>', `vColor = vec4(color, 1.0);
#ifdef USE_INSTANCING_COLOR
if (aCloth > 0.5) vColor.rgb *= instanceColor;
#endif`)
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
  /** Bounding box of every car model (index = Agent.model); the first one is the old single car. */
  private readonly carBoxes: THREE.Box3[] = [];
  /** Main crossings with traffic lights, and one light per approach (position, yaw, the junction and the axis of the traffic it serves). */
  private readonly junctions: { x: number; z: number }[] = [];
  private readonly lightDefs: { x: number; z: number; yaw: number; ix: number; ax: 'x' | 'z' }[] = [];
  private lampState: THREE.InstancedBufferAttribute | null = null;
  /** Test hook: every signal shows green (other tests of the traffic should not wait at a red light). */
  private testGreen = false;
  /** Rolled-distance attribute per car mesh (same index as `meshes`); null where the mesh has no spinning wheels. */
  private readonly rollOf: (THREE.InstancedBufferAttribute | null)[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly tc = new THREE.Color();
  private t = 0;
  /** A boss arena: nobody of the city life is drawn inside this circle (they carry no colliders, so they would drive through the fight). */
  clearZone: { x: number; z: number; r: number } | null = null;
  /**
   * A fight is on (BattleMode): pedestrians, children and bystanders nearby run away (a cheerful "Awas!"), then watch from a distance
   * and cheer when a star breaks; vehicles near it stop. Null: normal life; everyone walks back.
   */
  battle: CityBattle | null = null;
  setBattle(b: CityBattle | null): void {
    this.battle = b;
    this.shouts = 0;
  }
  /** Shout bubbles ("Awas!", "Hore!") are handed to the UI: world position and the word. */
  onShout: ((x: number, y: number, z: number, text: string) => void) | null = null;
  private cheerLeft = 0;
  private shoutGap = 0;
  private shouts = 0;
  /** Counters for tests. */
  fleeing = 0;
  watching = 0;
  simulated = 0;
  shown = 0;
  stopped = 0;
  readonly counts: number[] = [0, 0, 0, 0, 0];

  constructor(private readonly ctx: LevelContext) {
    const rnd = rngFor(CITY.seed ^ 0x11fe);
    const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
    const range = (r: readonly [number, number]): number => r[0] + rnd() * (r[1] - r[0]);
    const lines = roadLines();
    // Car models from cars.glb (all or nothing: a half set would change the traffic mix).
    const carGeos = CAR_MODELS.map((m) => cityModels.get(m.name)?.geo ?? null);
    const useModels = carGeos.every((g) => g !== null);
    const modelRnd = rngFor(CITY.seed ^ 0xca75);
    const totalWeight = CAR_MODELS.reduce((t, m) => t + m.weight, 0);

    // Vehicle lanes (left-hand traffic): both directions of every road line.
    const lanes: Lane[] = [];
    for (const l of lines) {
      const off = l.main ? SIDE.main.off : SIDE.local.off;
      for (const dir of [1, -1] as const) lanes.push({ ax: l.ax, c: l.ax === 'x' ? l.c - dir * off : l.c + dir * off, a0: l.a0, a1: l.a1, dir, main: l.main, stops: [] });
    }
    this.lanes.push(...lanes);
    // Signalised crossings: every main x line meets every main z line (within both ranges).
    const mainLines = lines.filter((l) => l.main);
    for (const xl of mainLines.filter((l) => l.ax === 'x')) {
      for (const zl of mainLines.filter((l) => l.ax === 'z')) {
        if (zl.c > xl.a0 && zl.c < xl.a1 && xl.c > zl.a0 && xl.c < zl.a1) this.junctions.push({ x: zl.c, z: xl.c });
      }
    }
    const roadHalf = CITY.main.road;
    this.junctions.forEach((j, ix) => {
      for (const l of lanes) {
        if (!l.main) continue;
        const lineC = l.ax === 'x' ? l.c + l.dir * SIDE.main.off : l.c - l.dir * SIDE.main.off;
        if (l.ax === 'x' && Math.abs(j.z - lineC) < 0.5) l.stops.push({ pos: j.x, ix });
        if (l.ax === 'z' && Math.abs(j.x - lineC) < 0.5) l.stops.push({ pos: j.z, ix });
      }
      for (const dir of [1, -1] as const) {
        // A light on the kerb of each approach, before the crossing, its lamps facing the oncoming traffic.
        this.lightDefs.push({ x: j.x - dir * (roadHalf + 0.9), z: j.z - dir * (roadHalf + 0.7), yaw: -dir * Math.PI / 2, ix, ax: 'x' });
        this.lightDefs.push({ x: j.x + dir * (roadHalf + 0.7), z: j.z - dir * (roadHalf + 0.9), yaw: dir > 0 ? Math.PI : 0, ix, ax: 'z' });
      }
    });
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
      if (kind === 0 && useModels) {
        // A model by weight; own random stream so the rest of the city keeps its layout. Buses are a little slower.
        let r = modelRnd() * totalWeight;
        let m = 0;
        while (m < CAR_MODELS.length - 1 && r >= CAR_MODELS[m].weight) r -= CAR_MODELS[m++].weight;
        a.model = m;
        a.sx = a.sy = a.sz = m >= 5 ? 1 : 0.96 + modelRnd() * 0.08;
        if (m >= 5) a.cruise *= 0.85;
        a.v = a.cruise;
        a.half = (cityModels.get(CAR_MODELS[m].name)!.max.z - cityModels.get(CAR_MODELS[m].name)!.min.z) * a.sz / 2;
      } else if (kind === 0 && rnd() < 0.4) {
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
      for (const side of [-1, 1] as const) sideLanes.push({ ax: l.ax, c: l.c + side * w, a0: l.a0 + 4, a1: l.a1 - 4, dir: side > 0 ? 1 : -1, main: l.main, stops: [] });
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
      m.receiveShadow = true;
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
    // Prefer the rounded toy car from the local env library.
    const envCar = envModels.geometry('car');
    const kCar = envCar ? null : cityModels.carGeometry();
    const rolls: Map<THREE.BufferGeometry, THREE.InstancedBufferAttribute> = new Map();
    const withRoll = (g: THREE.BufferGeometry, max: number): THREE.BufferGeometry => {
      const r = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
      r.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aRoll', r);
      rolls.set(g, r);
      return g;
    };
    const paint = useModels ? paintMaterial(true) : null;
    this.cars = paint
      ? mk(withRoll((carGeos[0] as THREE.BufferGeometry).clone(), CAR_MODELS[0].max), paint, CAR_MODELS[0].max)
      : envCar ? mk(envCar.clone(), carMat, 70) : kCar ? mk(kCar, paintMaterial(), 70) : mk(carGeo(), carMat, 70);
    const moto = motoGeo();
    const bike = bikeGeo();
    this.motos = mk(moto, riderMaterial(moto), 40);
    this.bikes = mk(bike, riderMaterial(bike), 40);
    this.ballMesh = mk(sph(0.16, 6, 4), new THREE.MeshStandardMaterial({ roughness: 0.5 }), Math.max(1, this.balls.length));
    for (let i = 0; i < this.balls.length; i++) this.ballMesh.setColorAt(i, this.tc.setHex(0xff7a59));
    this.meshes = [this.cars, this.motos, this.bikes, this.peds, this.ballMesh];
    // Other car models: meshes 5.. (index 4 + Agent.model); all share one paint material (one program).
    if (paint) for (let i = 1; i < CAR_MODELS.length; i++) this.meshes.push(mk(withRoll((carGeos[i] as THREE.BufferGeometry).clone(), CAR_MODELS[i].max), paint, CAR_MODELS[i].max));
    for (const m of this.meshes) {
      m.geometry.computeBoundingBox();
      this.rollOf.push(rolls.get(m.geometry) ?? null);
    }
    this.carBoxes.push(this.cars.geometry.boundingBox as THREE.Box3);
    for (let i = 1; paint && i < CAR_MODELS.length; i++) this.carBoxes.push(this.meshes[4 + i].geometry.boundingBox as THREE.Box3);
    // Traffic lights: one instanced mesh for the poles, one for the lamps (the lit lamp is chosen per instance in the shader).
    const poleGeo = cityModels.get('light_pole')?.geo;
    const lampGeo = cityModels.get('light_lamp')?.geo;
    if (poleGeo && lampGeo && this.lightDefs.length > 0) {
      const n = this.lightDefs.length;
      const poles = new THREE.InstancedMesh(poleGeo.clone(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), n);
      const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      lampMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLamp;\nattribute float aState;').replace(
          '#include <color_vertex>',
          '#include <color_vertex>\nvColor.rgb *= abs(aLamp - aState) < 0.5 ? 1.0 : 0.14;',
        );
      };
      lampMat.customProgramCacheKey = () => 'sg-light-lamp';
      const lampGeoI = lampGeo.clone();
      this.lampState = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      this.lampState.setUsage(THREE.DynamicDrawUsage);
      lampGeoI.setAttribute('aState', this.lampState);
      const lamps = new THREE.InstancedMesh(lampGeoI, lampMat, n);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const one = new THREE.Vector3(1, 1, 1);
      this.lightDefs.forEach((d, i) => {
        m4.compose(new THREE.Vector3(d.x, 0, d.z), q.setFromAxisAngle(up, d.yaw), one);
        poles.setMatrixAt(i, m4);
        lamps.setMatrixAt(i, m4);
      });
      for (const m of [poles, lamps]) {
        m.frustumCulled = false;
        m.castShadow = false;
        m.receiveShadow = false;
        ctx.root.add(m);
        m.instanceMatrix.needsUpdate = true;
      }
      this.updateLights();
      ctx.onDispose(() => {
        for (const m of [poles, lamps]) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
          m.dispose();
        }
      });
    }
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
        vehicles: () => this.agents.filter((a) => a.kind < 3).map((a, i) => ({ i, kind: a.kind, model: a.model, ax: a.lane?.ax, c: a.lane?.c, dir: a.lane?.dir, main: a.lane?.main, s: a.s, v: a.v, x: a.x, z: a.z })),
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
        signal: (ix: number, ax: 'x' | 'z') => this.signal(ix, ax),
        forceGreen: (on: boolean) => {
          this.testGreen = on;
        },
        stopLineOf: () => CITY.main.road + LifeConfig.lights.stopLine,
        half: (i: number) => this.agents[i].half,
        junctions: () => this.junctions.slice(),
        lights: () => this.lightDefs.map((d, i) => ({ ...d, lamp: this.lampState ? (this.lampState.array as Float32Array)[i] : -1 })),
        /** Roof of car `i`: centre x, z, the roof height and half sizes (smoke test of the moving platform). */
        carTop: (i: number) => {
          const a = this.agents[i];
          const b = this.carBoxes[a.model];
          return { x: a.x, y: a.y + b.max.y * a.sy, z: a.z, halfX: (b.max.x - b.min.x) * a.sx / 2, halfZ: (b.max.z - b.min.z) * a.sz / 2, yaw: a.yaw, v: a.v };
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
    return { kind, roll: 0, model: 0, half: 1.75, lane: null, s: 0, v: 0, cruise: 0, leader: -1, x: 0, z: 0, yaw: 0, y: 0, phase: 0, amp: 0, color: 0xffffff, sx: 1, sy: 1, sz: 1, jit: 0, mode: 0, cx: 0, cz: 0, r: 0, w: 0, a0: 0, ball: -1, flee: 0, ox: 0, oz: 0, ux: 0, uz: 0, off: 0 };
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

  fixedUpdate(d: number): void {
    this.t += d;
    this.updateLights();
    const p = this.ctx.player.position;
    const onGround = p.y < 2.3;
    const sim2 = LifeConfig.simRadius * LifeConfig.simRadius;
    this.cheerLeft = Math.max(0, this.cheerLeft - d);
    this.shoutGap = Math.max(0, this.shoutGap - d);
    this.fleeing = 0;
    this.watching = 0;
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
      if ((d2 > sim2 + 400 || sim >= LifeConfig.maxSim) && !a.body) {
        a.placed = false;
        continue;
      }
      const wasPlaced = a.placed === true;
      const oldX = a.x;
      const oldY = a.y;
      const oldZ = a.z;
      const oldS = a.s;
      sim++;
      if (a.kind < 3) this.vehicle(a, d, p.x, p.z, onGround);
      else if (a.kind === 3) {
        if (a.flee !== 0) this.lanePlace(a);
        else this.walker(a, d, p.x, p.z, onGround);
      } else this.kid(a);
      if (a.kind >= 3) this.react(a, d, p.x, p.z);
      this.syncCollider(a, p, wasPlaced, oldX, oldY, oldZ, oldS);
      a.placed = true;
      if (a.v < 0.15 && a.kind < 4) stopped++;
      if (a.kind === 4 && a.mode === 1 && a.a0 === 0 && a.ball >= 0) this.ballStep(a);
    }
    this.simulated = sim;
    this.stopped = stopped;
  }

  private readonly colliderPosition = { x: 0, y: 0, z: 0 };
  private readonly colliderRotation = { x: 0, y: 0, z: 0, w: 1 };

  private syncCollider(a: Agent, p: THREE.Vector3, placed: boolean, oldX: number, oldY: number, oldZ: number, oldS: number): void {
    a.carrying = false;
    const limit = a.body ? 18 : 14;
    if ((a.x - p.x) ** 2 + (a.z - p.z) ** 2 > limit ** 2) {
      if (a.body) this.ctx.physics.removeBody(a.body);
      a.body = undefined;
      return;
    }
    const scale = a.kind === 0 ? this.carBoxes[a.model] : this.meshes[Math.min(3, a.kind)].geometry.boundingBox!;
    const halfX = (scale.max.x - scale.min.x) * a.sx / 2;
    const halfZ = (scale.max.z - scale.min.z) * a.sz / 2;
    const halfY = scale.max.y * a.sy / 2;
    const sin = Math.sin(a.yaw);
    const cos = Math.cos(a.yaw);
    const dx = p.x - a.x;
    const dz = p.z - a.z;
    const feet = p.y - PlayerConfig.height / 2;
    const radius = PlayerConfig.radius;
    const overlaps = Math.abs(dx * cos - dz * sin) < halfX + radius
      && Math.abs(dx * sin + dz * cos) < halfZ + radius
      && feet < a.y + halfY * 2 - 0.04 && p.y + PlayerConfig.height / 2 > a.y;
    if (overlaps && placed && a.body) {
      a.x = oldX;
      a.y = oldY;
      a.z = oldZ;
      a.s = oldS;
      a.v = a.amp = 0;
    }

    // Moving platform: Glen standing on the roof is carried along with the car (the move is added to his next step, so his body and
    // the car body move together; a wall or post in the way cancels the carry).
    if (a.kind === 0 && a.body && placed && !overlaps) {
      const roof = a.y + halfY * 2;
      const lat = Math.abs(dx * cos - dz * sin);
      const lon = Math.abs(dx * sin + dz * cos);
      if (this.ctx.player.grounded && lat < halfX && lon < halfZ && feet > roof - 0.12 && feet < roof + 0.12) {
        a.carrying = true;
        const mx = a.x - oldX;
        const mz = a.z - oldZ;
        const dist = Math.hypot(mx, mz);
        if (dist > 1e-5 && dist < 1.5 && !this.carryBlocked(a, p, mx / dist, mz / dist, dist)) this.ctx.player.carry(mx, mz);
      }
    }

    const zone = this.clearZone;
    const hidden = zone && (a.x - zone.x) ** 2 + (a.z - zone.z) ** 2 < zone.r ** 2;
    if (hidden) {
      if (a.body) this.ctx.physics.removeBody(a.body);
      a.body = undefined;
      return;
    }

    // A teleport or lane wrap can place the player inside the footprint. Wait until clear before adding a body.
    if (!a.body && overlaps) return;
    const position = this.colliderPosition;
    position.x = a.x;
    position.y = a.y + halfY;
    position.z = a.z;
    const rotation = this.colliderRotation;
    rotation.y = Math.sin(a.yaw / 2);
    rotation.w = Math.cos(a.yaw / 2);
    if (a.body) {
      a.body.setNextKinematicTranslation(position);
      a.body.setNextKinematicRotation(rotation);
    } else {
      a.body = this.ctx.physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z).setRotation(rotation),
      );
      this.ctx.physics.track(a.body);
      const desc = a.kind < 3 ? RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ) : RAPIER.ColliderDesc.cylinder(halfY, Math.max(halfX, halfZ));
      this.ctx.physics.world.createCollider(desc, a.body);
    }
  }

  /** Signal of junction `ix` for traffic along `ax`: 0 green, 1 yellow, 2 red. Two phases, offset per junction (deterministic). */
  signal(ix: number, ax: 'x' | 'z'): 0 | 1 | 2 {
    if (this.testGreen) return 0;
    const c = LifeConfig.lights;
    const half = c.green + c.yellow + c.allRed;
    let u = (this.t + (ix * half * 0.5) / Math.max(1, this.junctions.length / 2)) % (2 * half);
    if (ax === 'z') u = (u + half) % (2 * half);
    if (u < c.green) return 0;
    if (u < c.green + c.yellow) return 1;
    return 2;
  }

  /** Light the lamp that matches the signal (0 red, 1 yellow, 2 green): only written when it changes. */
  private updateLights(): void {
    if (!this.lampState) return;
    const arr = this.lampState.array as Float32Array;
    let changed = false;
    for (let i = 0; i < this.lightDefs.length; i++) {
      const d = this.lightDefs[i];
      const lamp = 2 - this.signal(d.ix, d.ax);
      if (arr[i] !== lamp) {
        arr[i] = lamp;
        changed = true;
      }
    }
    if (changed) this.lampState.needsUpdate = true;
  }

  private readonly carryRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  /** A solid thing (not this car) right ahead of Glen in the carry direction: skip the carry so it never pushes him through it. */
  private carryBlocked(a: Agent, p: THREE.Vector3, ux: number, uz: number, dist: number): boolean {
    const o = this.carryRay.origin;
    o.x = p.x;
    o.y = p.y;
    o.z = p.z;
    const dir = this.carryRay.dir;
    dir.x = ux;
    dir.y = 0;
    dir.z = uz;
    const hit = this.ctx.physics.world.castRay(this.carryRay, dist + PlayerConfig.radius + 0.05, true, undefined, undefined, this.ctx.player.collider, a.body);
    return hit !== null;
  }

  update(): void {
    const p = this.ctx.player.visualPosition;
    const show2 = LifeConfig.showRadius * LifeConfig.showRadius;
    const cam = this.ctx.cameraRig.camera;
    this.frustum.setFromProjectionMatrix(this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const n = this.counts;
    while (n.length < this.meshes.length) n.push(0);
    n.fill(0);

    const ag = this.agents;
    for (const a of ag) {
      if (!a.placed) continue;
      // Draw: near and in view.
      const ex = a.x - p.x;
      const ez = a.z - p.z;
      if (ex * ex + ez * ez > show2) continue;
      const cz0 = this.clearZone;
      if (cz0 && (a.x - cz0.x) * (a.x - cz0.x) + (a.z - cz0.z) * (a.z - cz0.z) < cz0.r * cz0.r) continue;
      this.sphere.center.set(a.x, 0.8, a.z);
      this.sphere.radius = 2.2;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      const k = a.kind === 4 ? 3 : a.kind === 0 && a.model > 0 ? 4 + a.model : a.kind;
      const idx = n[k];
      if (k === 3 && idx >= MAX_PED) continue;
      if (idx >= (this.meshes[k].instanceMatrix.count)) continue;
      const c = Math.cos(a.yaw);
      const s = Math.sin(a.yaw);
      const o = idx * 16;
      const m = this.meshes[k].instanceMatrix.array as Float32Array;
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
      const roll = this.rollOf[k];
      if (roll) roll.array[idx] = a.roll;
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
    for (let k = 0; k < this.meshes.length; k++) {
      const mesh = this.meshes[k];
      mesh.count = n[k];
      mesh.visible = n[k] > 0;
      if (n[k] > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        const rl = this.rollOf[k];
        if (rl) rl.needsUpdate = true;
        if (mesh.instanceColor && k !== 4) mesh.instanceColor.needsUpdate = true;
      }
    }
    if (n[3] > 0) this.anim.needsUpdate = true;
    this.shown = 0;
    for (let k = 0; k < this.meshes.length; k++) this.shown += n[k];
    const info = this.ctx.game.debugInfo;
    info.lifeAgents = ag.length;
    info.lifeSim = this.simulated;
    info.lifeShown = this.shown;
    info.lifeStopped = this.stopped;
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
      const stop = LifeConfig.carStopGap + Math.max(0, a.half - 1.75);
      if (!a.carrying && ahead > -1.5 && ahead < LifeConfig.brakeDist + stop && side < LifeConfig.laneHalf) {
        const k = Math.max(0, Math.min(1, (ahead - stop) / LifeConfig.brakeDist));
        target = Math.min(target, a.cruise * k * k);
        if (ahead < stop + 0.2) target = 0;
      }
    }
    // Traffic lights: brake for a red (or a yellow that can still be stopped for) before the stop line, never after passing it.
    for (const st of l.stops) {
      const d = (st.pos - l.dir * (CITY.main.road + LifeConfig.lights.stopLine) - a.s) * l.dir - a.half;
      if (d < -0.3 || d > 70) continue;
      const state = this.signal(st.ix, l.ax);
      if (state === 0) continue;
      if (state === 1 && d < a.v * a.v / 8 + 0.5) continue;
      const k = Math.max(0, Math.min(1, (d - LifeConfig.lights.margin) / LifeConfig.brakeDist));
      target = Math.min(target, a.cruise * k * k);
      if (d < LifeConfig.lights.margin + 0.15) target = 0;
    }
    const bt = this.battle;
    if (bt && (a.x - bt.x) * (a.x - bt.x) + (a.z - bt.z) * (a.z - bt.z) < bt.stopR * bt.stopR) target = 0;
    if (a.leader >= 0) {
      const o = this.agents[a.leader];
      const len = l.a1 - l.a0;
      let gap = ((o.s - a.s) * l.dir) % len;
      if (gap < 0) gap += len;
      // Keep followGap for two 3.5 m cars; long buses ask for more room.
      const follow = LifeConfig.followGap + Math.max(0, a.half + o.half - 3.5);
      if (gap < follow + 6) target = Math.min(target, o.v + Math.max(0, gap - follow) * 0.8);
      if (gap < follow) target = 0;
    }
    const acc = target > a.v ? 3.5 : 9;
    a.v += Math.max(-acc * dt, Math.min(acc * dt, target - a.v));
    a.s += l.dir * a.v * dt;
    a.roll += a.v * dt;
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

  /** Battle reaction of a walker, child or bystander (after its normal place was computed): run away, watch, cheer, walk back. */
  private react(a: Agent, dt: number, px: number, pz: number): void {
    const b = this.battle;
    if (b) {
      if (a.flee === 0 || a.flee === 3) {
        const dx = a.x + a.ox - b.x;
        const dz = a.z + a.oz - b.z;
        const d = Math.hypot(dx, dz);
        if (d < b.fleeR) {
          a.flee = 1;
          const inv = d > 0.01 ? 1 / d : 0;
          a.ux = d > 0.01 ? dx * inv : Math.cos(a.a0 * 2.1);
          a.uz = d > 0.01 ? dz * inv : Math.sin(a.a0 * 2.1);
          // Stand-off: spread between the watch ring and a little further (no two stand on the same spot).
          a.off = Math.max(0, b.watchR + ((a.jit * 7 + a.a0 * 3 + a.x * 0.37) % 1 + 1) % 1 * 5 - d);
          if (this.shoutGap <= 0 && this.shouts < 8 && (a.x - px) ** 2 + (a.z - pz) ** 2 < 55 * 55) {
            this.shoutGap = 0.28;
            this.shouts++;
            this.onShout?.(a.x, 1.9, a.z, 'Awas!');
          }
        }
      }
    } else if (a.flee === 1 || a.flee === 2) a.flee = 3;
    if (a.flee === 0) return;
    // Offset moves: away (running) / back (walking).
    let tx = a.ux * a.off;
    let tz = a.uz * a.off;
    let sp = 5.2;
    if (a.flee === 3) {
      tx = 0;
      tz = 0;
      sp = 2.4;
    }
    const mx = tx - a.ox;
    const mz = tz - a.oz;
    const md = Math.hypot(mx, mz);
    const step = sp * dt;
    if (md <= step) {
      a.ox = tx;
      a.oz = tz;
      if (a.flee === 3) {
        a.flee = 0;
        a.ox = a.oz = 0;
        return;
      }
      a.flee = 2;
    } else {
      a.ox += (mx / md) * step;
      a.oz += (mz / md) * step;
    }
    a.x += a.ox;
    a.z += a.oz;
    if (a.flee === 2) {
      this.watching++;
      // Face the fight; hop and wave when a star just broke.
      a.yaw = Math.atan2(-a.ux, -a.uz);
      const cheer = this.cheerLeft > 0;
      a.y = cheer ? Math.abs(Math.sin(this.t * 9 + a.a0 * 5)) * 0.4 : 0;
      a.amp = cheer ? 0.9 : 0.1;
      a.phase = this.t * (cheer ? 12 : 1.5) + a.a0;
      a.v = 1;
    } else {
      this.fleeing++;
      a.yaw = Math.atan2(mx / (md || 1), mz / (md || 1));
      a.y = 0;
      a.amp = 1;
      a.phase += dt * (a.flee === 1 ? 15 : 7);
      a.v = 1;
    }
  }

  /** A star broke: the watchers jump for joy ("Hore!"). */
  cheer(px: number, pz: number): void {
    this.cheerLeft = 1.8;
    let n = 0;
    for (const a of this.agents) {
      if (a.flee !== 2 || (a.x - px) ** 2 + (a.z - pz) ** 2 > 40 * 40) continue;
      this.onShout?.(a.x, 1.9, a.z, 'Hore!');
      if (++n >= 2) break;
    }
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
