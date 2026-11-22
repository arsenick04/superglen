import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const name of ['NormalTree_1', 'NormalTree_1_city', 'PineTree_2', 'PineTree_2_city', 'NormalTree_1_city_upright', 'PineTree_2_city_upright']) {
  const document = await io.read(`public/env/quaternius/${name}.glb`);
  const { min, max } = getBounds(document.getRoot().listScenes()[0]);
  const size = max.map((value, axis) => value - min[axis]);
  assert(size[1] > Math.max(size[0], size[2]), `${name}: trunk is not upright (+Y)`);
  assert(Math.abs(min[1]) < 0.1, `${name}: trunk base is not at ground level`);
  for (const material of document.getRoot().listMaterials()) {
    assert(material.getBaseColorTexture(), `${name}: missing texture for ${material.getName()}`);
  }
  if (name.endsWith('_upright')) {
    for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      if (!/Bark/.test(primitive.getMaterial().getName())) continue;
      const positions = primitive.getAttribute('POSITION');
      const low = positions.getMin([]), high = positions.getMax([]);
      assert(high[1] - low[1] > Math.max(high[0] - low[0], high[2] - low[2]), `${name}: bark vertices must stand upright without node rotation`);
    }
  }
  console.log(`${name}: upright, grounded, textured (${size.map((value) => value.toFixed(2)).join(' × ')} m)`);
}
