import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, dedup, prune } from '@gltf-transform/functions';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const file = 'public/models/rescue/monkey.glb';
const doc = await io.read(file);
await doc.transform(dedup(), prune(), textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}));
await io.write(file,doc);
