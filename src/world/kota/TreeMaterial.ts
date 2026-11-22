import * as THREE from 'three';

/** Explicit cutout foliage pipeline; FBX exports use BLEND even for solid bark. */
export function treeMaterial(source: THREE.Material): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) return source;
  const foliage = /Leaves/i.test(source.name);
  const material = new THREE.MeshStandardMaterial({
    name: source.name,
    color: source.color,
    map: source.map,
    roughness: 0.85,
    metalness: 0,
    transparent: false,
    opacity: 1,
    // Preserve small leaf clusters after texture minification at normal camera distance.
    alphaTest: foliage ? 0.15 : 0,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
  });
  if (material.map) material.map.anisotropy = 4;
  return material;
}
