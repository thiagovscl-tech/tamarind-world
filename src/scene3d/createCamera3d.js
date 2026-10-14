import * as THREE from 'three';

export function createCamera3d(aspect, target = [0, 4.5, -5]) {
  const camera = new THREE.PerspectiveCamera(44, aspect, 0.1, 520);
  camera.position.set(0, 76, 135);
  camera.userData.baseTarget = new THREE.Vector3(...target);
  camera.lookAt(camera.userData.baseTarget);
  return camera;
}

export function resizeCamera3d(camera, aspect) {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
