import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, transformMesh } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const name of ['NormalTree_1', 'NormalTree_1_city', 'PineTree_2', 'PineTree_2_city', 'Bush', 'Rock_1']) {
  const doc = await io.read(`public/env/quaternius/${name}.glb`);
  await doc.transform(flatten());
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    transformMesh(node.getMesh(), node.getWorldMatrix());
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  await io.write(`public/env/quaternius/${name}_upright.glb`, doc);
}
