// Rebuilds public/models/*.glb from art/models/source/*.glb
// Steps: rename clips, simplify mesh (>20k tris), resize textures + WebP, resample/quantize animation, Meshopt.
// Usage: npm run models
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { prune, dedup, resample, quantize, textureCompress, weld, simplify, dequantize, reorder, getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';
import { statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'art/models/source');
const OUT = path.join(root, 'public/models');
const MAX_TRIS = 20000;
const TARGET_TRIS = 16000;
const TEX_SIZE = 512;

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
for (const name of ['glen', 'superglen', 'nino', 'aara']) {
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
  await doc.transform(weld());
  if (before > MAX_TRIS) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_TRIS / before, error: 0.02, lockBorder: false }));
  }
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX_SIZE, TEX_SIZE], quality: 85 }),
    resample({ tolerance: 0.0005 }),
    dedup(),
    prune(),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 12 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const out = path.join(OUT, `${name}.glb`);
  await io.write(out, doc);
  const src = statSync(path.join(SRC, `${name}.glb`)).size;
  const dst = statSync(out).size;
  console.log(`${name}: ${(src / 1e6).toFixed(2)} MB -> ${(dst / 1e6).toFixed(2)} MB, tris ${Math.round(before)} -> ${Math.round(count())}`);
}
