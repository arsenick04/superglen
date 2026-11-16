// Rebuilds public/models/*.glb from art/models/source/*.glb
// Heroes: quality-first (source triangles and textures kept, gentle quantization, Meshopt). Enemies: same, plus a `_lo` for the Curut crowd.
// Usage: npm run models
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { prune, dedup, resample, quantize, textureCompress, weld, reorder, getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';
import { statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'art/models/source');
const OUT = path.join(root, 'public/models');
// Heroes are built quality-first (owner decision, native-app target): the source triangle count, the source textures byte for byte
// (1024 px JPEG base colour + normal, PNG metal-rough: no re-encoding loss), normals/UVs kept, and only gentle 16-bit quantization
// plus Meshopt. One file per hero for every platform (no `_lo`).
// original (Mixamo) clip name -> game clip name
export const CLIP_MAP = {
  'idle.001': 'idle',
  'walk.001': 'walk',
  'run.001': 'run',
  'fall.001': 'fall',
  'landing from jumping.001': 'land',
  'front flip mid-air 360.001': 'jump',
  'floating in the air.001': 'fly',
  'riding a bike.001': 'ride',
  'shoot.001': 'shoot',
  'blocking using holographic shield.001': 'shield',
  'hit_to_body_01.001': 'hit',
  'cheer.001': 'cheer',
  'wave_goodbye_02.001': 'wave',
  'talking.001': 'talk',
  'jump_rope_01.001': 'skip',
};

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const HEROES = ['glen', 'superglen', 'nino', 'aara'];
for (const name of HEROES) {
  const suffix = '';
  if (only.length && !only.includes(name)) continue;
  const doc = await io.read(path.join(SRC, `${name}.glb`));
  const r = doc.getRoot();
  for (const a of r.listAnimations()) {
    const n = CLIP_MAP[a.getName()];
    if (!n) console.warn(`  ! unmapped clip ${a.getName()}`);
    else a.setName(n);
  }
  // Make clips in-place: lock Hips X/Z to the first frame (Mixamo exported with root motion).
  for (const a of r.listAnimations()) {
    for (const ch of a.listChannels()) {
      if (ch.getTargetPath() !== 'translation' || ch.getTargetNode().getName() !== 'mixamorig:Hips') continue;
      const out = ch.getSampler().getOutput();
      const first = out.getElement(0, []);
      for (let i = 0; i < out.getCount(); i++) {
        const e = out.getElement(i, []);
        out.setElement(i, [first[0], e[1], first[2]]);
      }
    }
  }
  const count = () => r.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((q, p) => q + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  const before = count();
  await doc.transform(
    resample({ tolerance: 0.0005 }),
    dedup(),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 16, quantizeColor: 8, quantizeWeight: 12, quantizeGeneric: 12 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const out = path.join(OUT, `${name}${suffix}.glb`);
  await io.write(out, doc);
  const src = statSync(path.join(SRC, `${name}.glb`)).size;
  const dst = statSync(out).size;
  console.log(`${name}${suffix}: ${(src / 1e6).toFixed(2)} MB -> ${(dst / 1e6).toFixed(2)} MB, tris ${Math.round(before)} -> ${Math.round(count())}`);
}

// ---- Enemies (static, unrigged models from the owner: art/models/source/enemies/<id>.glb -> public/models/enemies/<id>.glb) ----
// Quality-first like the heroes: full triangle count and source textures (base colour + normal map; metal-rough dropped, the game uses
// plain roughness). Only `curut_cemberut` also gets `_lo` (the crowd of up to ~11 rats: ~6k tris, 512 px WebP, base colour only).
// Rebuild one: `npm run models -- curut_cemberut`.
const ENEMIES = ['curut_cemberut', 'ular_melar', 'tikus_rakus', 'elang_belang', 'gorilla_gembira'];
const LO_ENEMIES = { curut_cemberut: 6000 };
const ENEMY_OUT = path.join(OUT, 'enemies');
mkdirSync(ENEMY_OUT, { recursive: true });
for (const id of ENEMIES) {
  if (only.length && !only.includes(id)) continue;
  for (const suffix of LO_ENEMIES[id] ? ['', '_lo'] : ['']) {
    const target = LO_ENEMIES[id];
    const doc = await io.read(path.join(SRC, 'enemies', `${id}.glb`));
    const r = doc.getRoot();
    for (const mat of r.listMaterials()) {
      mat.setMetallicRoughnessTexture(null);
      mat.setMetallicFactor(0);
      mat.setRoughnessFactor(0.85);
      if (suffix) mat.setNormalTexture(null);
    }
    const count = () => r.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((q, p) => q + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
    const before = count();
    if (suffix) {
      await doc.transform(weld(), prune());
      // UV-aware simplification (keeps the painted texture from smearing), then a permissive pass if still above target.
      const run = (flags) => {
        for (const mesh of r.listMeshes()) {
          for (const prim of mesh.listPrimitives()) {
            const idx = prim.getIndices();
            const [out] = MeshoptSimplifier.simplifyWithAttributes(
              new Uint32Array(idx.getArray()),
              new Float32Array(prim.getAttribute('POSITION').getArray()),
              3,
              new Float32Array(prim.getAttribute('TEXCOORD_0').getArray()),
              2,
              [60, 60],
              null,
              Math.round(target * 3),
              0.5,
              flags,
            );
            idx.setArray(out);
          }
        }
      };
      for (let pass = 0; pass < 3 && count() > target * 1.05; pass++) run(['Sparse']);
      if (count() > target * 1.05) run(['Permissive', 'Sparse']);
      await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }));
    }
    await doc.transform(
      dedup(),
      prune(),
      reorder({ encoder: MeshoptEncoder }),
      quantize({ quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 16, quantizeColor: 8, quantizeGeneric: 12 }),
    );
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    const out = path.join(ENEMY_OUT, `${id}${suffix}.glb`);
    await io.write(out, doc);
    const src = statSync(path.join(SRC, 'enemies', `${id}.glb`)).size;
    const b = getBounds(r.getDefaultScene() ?? r.listScenes()[0]);
    const f = (a) => a.map((x) => x.toFixed(2)).join(',');
    console.log(`enemies/${id}${suffix}: ${(src / 1e6).toFixed(2)} MB -> ${(statSync(out).size / 1e6).toFixed(2)} MB, tris ${Math.round(before)} -> ${Math.round(count())}, bbox min(${f(b.min)}) max(${f(b.max)})`);
  }
}
