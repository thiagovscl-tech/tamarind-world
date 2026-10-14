import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export async function loadBearCharacter(scene, { x = -6, z = 1, height = 5.8 } = {}) {
  const response = await fetch('/artwork/models/URSO_rigged.fbx');
  if (!response.ok) throw new Error(`FBX do Urso indisponível: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();

  // O Blender exporta a textura incorporada como Image_0, sem extensão.
  // O FBXLoader precisa da extensão PNG para reconhecer os bytes; a correção
  // ocorre apenas na cópia em memória e não altera o arquivo do modelo.
  const bytes = new Uint8Array(buffer);
  const encoder = new TextEncoder();
  const from = encoder.encode('URSO_rigged.fbm\\Image_0');
  const to = encoder.encode('URSO_rigged.fbm\\Img.png');
  let renamed = false;
  for (let offset = 0; offset <= bytes.length - from.length; offset += 1) {
    let match = true;
    for (let index = 0; index < from.length; index += 1) {
      if (bytes[offset + index] !== from[index]) { match = false; break; }
    }
    if (!match) continue;
    bytes.set(to, offset);
    renamed = true;
    offset += from.length - 1;
  }
  if (!renamed) throw new Error('Textura incorporada do Urso não encontrada no FBX.');

  const manager = new THREE.LoadingManager();
  const resourcesReady = new Promise((resolve, reject) => {
    manager.onLoad = resolve;
    manager.onError = (url) => reject(new Error(`Falha ao carregar textura do FBX: ${url}`));
  });
  const model = new FBXLoader(manager).parse(buffer, '/artwork/models/');
  model.name = 'BearRiggedFBX';
  const bones = new Map();
  const baseRotations = new Map();
  const textures = new Set();

  model.traverse((object) => {
    if (object.isBone) {
      bones.set(object.name, object);
      if (['neck', 'head', 'tail', 'FL_upper', 'FL_lower', 'FL_paw', 'FR_upper', 'FR_lower', 'FR_paw', 'RL_upper', 'RL_lower', 'RL_paw', 'RR_upper', 'RR_lower', 'RR_paw'].includes(object.name)) {
        baseRotations.set(object, object.rotation.clone());
      }
    }
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (material?.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        textures.add(material.map);
      }
      if ('metalness' in (material ?? {})) material.metalness = 0;
      if ('roughness' in (material ?? {})) material.roughness = 1;
    }
  });

  await resourcesReady;
  if (!textures.size) throw new Error('O FBX do Urso não contém textura carregável.');

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.y <= 0) throw new Error('O FBX do Urso não possui altura válida.');
  model.scale.setScalar(height / size.y);
  const scaledBounds = new THREE.Box3().setFromObject(model);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  model.position.set(x - center.x, -scaledBounds.min.y, z - center.z);
  model.userData.proceduralRig = { bones, baseRotations, look: { x: 0, y: 0 } };
  scene.add(model);

  console.info(`[Tamarind 3D] Urso carregado: ${bones.size} bones, ${textures.size} textura(s), ${model.animations?.length ?? 0} animações embutidas.`);
  return model;
}

export function updateBearProcedural(model, pointer, elapsed, delta) {
  const rig = model?.userData.proceduralRig;
  if (!rig) return;
  const easing = 1 - Math.exp(-delta * 4.5);
  rig.look.x += (pointer.x - rig.look.x) * easing;
  rig.look.y += (pointer.y - rig.look.y) * easing;
  for (const [bone, base] of rig.baseRotations) bone.rotation.copy(base);
  const rotate = (name, axis, amount) => {
    const bone = rig.bones.get(name);
    if (bone && rig.baseRotations.has(bone)) bone.rotation[axis] += amount;
  };
  rotate('neck', 'y', rig.look.x * 0.12 + Math.sin(elapsed * 0.55) * 0.008);
  rotate('head', 'y', rig.look.x * 0.10);
  rotate('head', 'x', -rig.look.y * 0.08);
  rotate('tail', 'y', Math.sin(elapsed * 1.2) * 0.1);
  rotate('tail', 'z', Math.sin(elapsed * 0.8) * 0.04);
  for (const [index, side] of ['FL', 'FR', 'RL', 'RR'].entries()) {
    const phase = elapsed * 1.35 + (index % 2) * Math.PI;
    rotate(`${side}_upper`, 'z', Math.sin(phase) * 0.018);
  }
}
