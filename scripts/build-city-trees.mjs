import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const name of ['NormalTree_1', 'PineTree_2']) {
  const document = await io.read(`public/env/quaternius/${name}.glb`);
  await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.01 }), prune());
  await io.write(`public/env/quaternius/${name}_city.glb`, document);
}
