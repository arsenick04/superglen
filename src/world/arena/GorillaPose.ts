import * as THREE from 'three';

/** Soft shoulder weights for the owner's unrigged T-pose mesh. */
export function poseGorillaArms(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, height: number): { value: number } {
  geometry.computeBoundingBox();
  const width = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
  const positions = geometry.getAttribute('position');
  const arms = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), side = Math.sign(x);
    const weight = THREE.MathUtils.smoothstep(Math.abs(x), width * .17, width * .30)
      * THREE.MathUtils.smoothstep(y, height * .28, height * .48);
    arms.set([side * width * .17, height * .69, side, weight], i * 4);
  }
  geometry.setAttribute('gorillaArm', new THREE.BufferAttribute(arms, 4));
  const drop = { value: 1.05 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.gorillaDrop = drop;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 gorillaArm;
uniform float gorillaDrop;
mat3 gorillaArmRotation() {
 float angle=-gorillaArm.z*gorillaDrop*gorillaArm.w;
 float c=cos(angle),s=sin(angle);
 return mat3(c,s,0.,-s,c,0.,0.,0.,1.);
}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal=gorillaArmRotation()*objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 shoulder=vec3(gorillaArm.xy,0.);\ntransformed=shoulder+gorillaArmRotation()*(transformed-shoulder);');
  };
  material.customProgramCacheKey = () => 'gorilla-soft-shoulders-v1';
  return drop;
}
