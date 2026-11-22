import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const name of ['NormalTree_1', 'PineTree_2', 'Bush', 'Rock_1']) {
  const path = `public/env/quaternius/${name}.glb`;
  const document = await io.read(path);
  await document.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }));
  await io.write(path, document);
}
