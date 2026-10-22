import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

THREE.Cache.enabled = true;

const TERRAIN_URL = '/artwork/models/ilha_texturizada.web.glb';
const TECNOMAGO_HOUSE_URL = '/artwork/models/casanovatecnomago.web.glb';
const ARCHITECTURE_HOUSE_URL = '/artwork/models/architecture_landmark.web.glb';
const APPS_BASILICA_URL = '/artwork/models/basilica_texturizada.web.glb';
const TREE_URL = '/artwork/models/arvore.runtime.web.glb';
const TEMPLE_URL = '/artwork/models/templo.web.glb';
const SETTLEMENT_HOUSE_URL = '/artwork/models/casasite.web.glb';
const BACKGROUND_CASTLE_URL = '/artwork/models/fantastic_castle.web.glb';
const RIGGED_GOAT_URL = '/artwork/models/bode_rigged.web.glb';
const WIZARD_NPC_URL = '/artwork/models/free_battlemage_wizard.web.glb';
const COAST_DATA_URL = '/artwork/data/coastline.web.json';
const TARGET_HORIZONTAL_SIZE = 150;

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const glbDownloads = new Map();
const gltfRequests = new Map();

function getMetrics() {
  const metrics = window.__tamarindMetrics ?? (window.__tamarindMetrics = {
    startedAt: performance.now(),
  });
  metrics.assets ??= [];
  return metrics;
}

function primeGlbDownload(url, label, phase = 'secondary') {
  if (!glbDownloads.has(url)) {
    const metric = {
      asset: label,
      url,
      phase,
      startedAtMs: performance.now() - getMetrics().startedAt,
      bytes: 0,
      downloadMs: 0,
      parseMs: 0,
      totalMs: 0,
    };
    getMetrics().assets.push(metric);
    const startedAt = performance.now();
    const request = fetch(url, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        metric.downloadMs = performance.now() - startedAt;
        metric.bytes = buffer.byteLength;
        return { buffer, metric };
      })
      .catch((error) => {
        glbDownloads.delete(url);
        metric.error = error.message;
        throw error;
      });
    glbDownloads.set(url, request);
  }
  return glbDownloads.get(url);
}

function loadGlbOnce(url, label, phase = 'secondary') {
  if (!gltfRequests.has(url)) {
    const timerLabel = `[Tamarind] GLB ${label}`;
    console.time(timerLabel);
    const request = primeGlbDownload(url, label, phase)
      .then(async ({ buffer, metric }) => {
        const parseStartedAt = performance.now();
        const resourcePath = url.slice(0, url.lastIndexOf('/') + 1);
        const gltf = await gltfLoader.parseAsync(buffer, resourcePath);
        metric.parseMs = performance.now() - parseStartedAt;
        metric.totalMs = performance.now() - (getMetrics().startedAt + metric.startedAtMs);
        console.info('[Tamarind] Asset carregado.', {
          asset: label,
          phase,
          sizeMB: (metric.bytes / 1024 / 1024).toFixed(2),
          downloadMs: Math.round(metric.downloadMs),
          parseMs: Math.round(metric.parseMs),
          totalMs: Math.round(metric.totalMs),
        });
        return gltf;
      })
      .finally(() => console.timeEnd(timerLabel))
      .catch((error) => {
        gltfRequests.delete(url);
        throw error;
      });
    gltfRequests.set(url, request);
  }
  return gltfRequests.get(url);
}

function runWhenIdle(task) {
  return new Promise((resolve, reject) => {
    const run = () => Promise.resolve().then(task).then(resolve, reject);
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 250 });
    } else {
      window.setTimeout(run, 0);
    }
  });
}

function createTerrainSurfaceSampler(terrain, cellSize = 3) {
  const meshes = [];
  let maximumTriangleCount = 0;
  const buckets = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  terrain.updateMatrixWorld(true);

  terrain.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const { geometry } = object;
    meshes.push(object);
    maximumTriangleCount += geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;
  });

  const triangleStride = 13;
  const triangleData = new Float32Array(maximumTriangleCount * triangleStride);
  let triangleRecordCount = 0;

  const bucketKey = (cellX, cellZ) => `${cellX}:${cellZ}`;
  for (const object of meshes) {
    const { geometry } = object;
    const position = geometry.attributes.position;
    const index = geometry.index;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const ia = index ? index.getX(triangleIndex * 3) : triangleIndex * 3;
      const ib = index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1;
      const ic = index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(object.matrixWorld);
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-8) continue;

      normal.copy(ab.subVectors(b, a)).cross(ac.subVectors(c, a)).normalize();
      if (normal.y < 0) normal.multiplyScalar(-1);
      const recordIndex = triangleRecordCount;
      const recordOffset = recordIndex * triangleStride;
      triangleData.set([
        a.x, a.y, a.z,
        b.x, b.y, b.z,
        c.x, c.y, c.z,
        denominator,
        normal.x, normal.y, normal.z,
      ], recordOffset);
      triangleRecordCount += 1;
      const minCellX = Math.floor(Math.min(a.x, b.x, c.x) / cellSize);
      const maxCellX = Math.floor(Math.max(a.x, b.x, c.x) / cellSize);
      const minCellZ = Math.floor(Math.min(a.z, b.z, c.z) / cellSize);
      const maxCellZ = Math.floor(Math.max(a.z, b.z, c.z) / cellSize);
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const key = bucketKey(cellX, cellZ);
          const bucket = buckets.get(key);
          if (bucket) bucket.push(recordIndex);
          else buckets.set(key, [recordIndex]);
        }
      }
    }
  }

  return {
    triangleCount: triangleRecordCount,
    bucketCount: buckets.size,
    sample(x, z) {
      const candidates = buckets.get(bucketKey(Math.floor(x / cellSize), Math.floor(z / cellSize)));
      if (!candidates) return null;
      let best = null;
      for (const recordIndex of candidates) {
        const offset = recordIndex * triangleStride;
        const ax = triangleData[offset];
        const ay = triangleData[offset + 1];
        const az = triangleData[offset + 2];
        const bx = triangleData[offset + 3];
        const by = triangleData[offset + 4];
        const bz = triangleData[offset + 5];
        const cx = triangleData[offset + 6];
        const cy = triangleData[offset + 7];
        const cz = triangleData[offset + 8];
        const denominator = triangleData[offset + 9];
        const weightA = ((bz - cz) * (x - cx)
          + (cx - bx) * (z - cz)) / denominator;
        const weightB = ((cz - az) * (x - cx)
          + (ax - cx) * (z - cz)) / denominator;
        const weightC = 1 - weightA - weightB;
        if (weightA < -1e-5 || weightB < -1e-5 || weightC < -1e-5) continue;
        const y = weightA * ay + weightB * by + weightC * cy;
        if (!best || y > best.point.y) {
          best = {
            point: new THREE.Vector3(x, y, z),
            normal: new THREE.Vector3(
              triangleData[offset + 10],
              triangleData[offset + 11],
              triangleData[offset + 12],
            ),
          };
        }
      }
      return best;
    },
  };
}

async function loadMasterTerrain() {
  const gltf = await loadGlbOnce(TERRAIN_URL, 'ilha/base', 'critical');
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const sourceBounds = new THREE.Box3().setFromObject(source);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const horizontalSize = Math.max(sourceSize.x, sourceSize.z);
  const uniformScale = TARGET_HORIZONTAL_SIZE / Math.max(horizontalSize, 0.0001);

  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'TamarindMasterTerrain';
  terrainGroup.scale.setScalar(uniformScale);
  terrainGroup.position.set(
    -sourceCenter.x * uniformScale,
    -sourceBounds.min.y * uniformScale,
    -sourceCenter.z * uniformScale,
  );
  terrainGroup.add(source);

  source.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });

  terrainGroup.updateMatrixWorld(true);
  const worldBounds = new THREE.Box3().setFromObject(terrainGroup);
  const worldSize = worldBounds.getSize(new THREE.Vector3());
  console.info('[Tamarind] Master terrain carregado.', {
    size: worldSize.toArray(),
    scale: uniformScale,
    meshes: 1,
    materials: 1,
    textures: 2,
    triangles: 266236,
  });

  return { terrainGroup, worldBounds, worldSize };
}

function terrainHeightAt(terrain, x, z) {
  const indexedSurface = terrain.userData.surfaceSampler?.sample(x, z);
  if (indexedSurface) return indexedSurface.point.y;
  terrain.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, 120, z),
    new THREE.Vector3(0, -1, 0),
    0,
    240,
  );
  const hit = raycaster.intersectObject(terrain, true)[0];
  return hit?.point.y ?? 0;
}

function terrainSurfaceAt(terrain, x, z) {
  const indexedSurface = terrain.userData.surfaceSampler?.sample(x, z);
  if (indexedSurface) return indexedSurface;
  terrain.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, 120, z),
    new THREE.Vector3(0, -1, 0),
    0,
    240,
  );
  const hit = raycaster.intersectObject(terrain, true)[0];
  if (!hit?.face) return null;
  const normal = hit.face.normal
    .clone()
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
    .normalize();
  return { point: hit.point.clone(), normal };
}

async function loadRiggedGoat(terrain, { treePlacements = [], avoidObjects = [] } = {}) {
  const gltf = await loadGlbOnce(RIGGED_GOAT_URL, 'bode');
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const sourceBounds = new THREE.Box3().setFromObject(source);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const goat = new THREE.Group();
  goat.name = 'RiggedGoat';
  goat.rotation.y = -0.42;
  goat.scale.setScalar(1.65 / Math.max(sourceSize.y, 0.0001));

  source.position.set(-sourceCenter.x, -sourceBounds.min.y, -sourceCenter.z);
  goat.add(source);

  const bones = [];
  const bonesByName = new Map();
  const materials = new Set();
  const textures = new Set();
  let meshCount = 0;
  let skinnedMeshes = 0;
  goat.traverse((object) => {
    if (object.isBone) {
      bones.push(object.name || '(sem nome)');
      bonesByName.set(object.name, object);
      console.log('[GOAT BONE]', object.name || '(sem nome)');
    }
    if (!object.isMesh) return;
    meshCount += 1;
    if (object.isSkinnedMesh) skinnedMeshes += 1;
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = true;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });

  const placementCandidates = [
    [-12, 15], [-7, 18], [16, 14], [20, 8], [-15, 10],
  ];
  const placement = placementCandidates
    .map(([x, z]) => ({ x, z, surface: terrainSurfaceAt(terrain, x, z) }))
    .find((candidate) => candidate.surface && candidate.surface.normal.y >= 0.82);
  if (!placement) throw new Error('Nenhuma superfície plana foi encontrada para o bode.');

  goat.position.set(placement.x, placement.surface.point.y + 0.025, placement.z);
  goat.updateMatrixWorld(true);
  const settledBounds = new THREE.Box3().setFromObject(goat);
  goat.position.y += placement.surface.point.y - settledBounds.min.y + 0.015;
  goat.updateMatrixWorld(true);

  const findBone = (name) => bonesByName.get(name) ?? bonesByName.get(name.replaceAll('.', ''));
  const walkBones = {
    rearLeftUpper: findBone('DEF-thigh.L'),
    rearLeftLower: findBone('DEF-shin.L'),
    rearRightUpper: findBone('DEF-thigh.R'),
    rearRightLower: findBone('DEF-shin.R'),
    frontLeftUpper: findBone('DEF-front_thigh.L'),
    frontLeftLower: findBone('DEF-front_shin.L'),
    frontRightUpper: findBone('DEF-front_thigh.R'),
    frontRightLower: findBone('DEF-front_shin.R'),
    hips: findBone('hips'),
    chest: findBone('chest'),
    neck: findBone('neck'),
    head: findBone('head'),
    tail: findBone('MCH-ROT-tail'),
  };
  const missingWalkBones = Object.entries(walkBones)
    .filter(([, bone]) => !bone)
    .map(([name]) => name);
  if (missingWalkBones.length) {
    console.warn('[GOAT WALK] Bones não encontrados:', missingWalkBones.join(', '));
  }

  const baseRotations = new Map();
  Object.values(walkBones).filter(Boolean).forEach((bone) => {
    baseRotations.set(bone, bone.rotation.clone());
  });

  const obstacleBoxes = avoidObjects.map((object) => new THREE.Box3().setFromObject(object));
  const isPointFree = (x, z, clearance = 3.2) => {
    const clearOfTrees = treePlacements.every((tree) => (
      ((tree.x - x) ** 2 + (tree.z - z) ** 2) >= clearance ** 2
    ));
    if (!clearOfTrees) return false;
    return obstacleBoxes.every((box) => (
      x < box.min.x - clearance || x > box.max.x + clearance
      || z < box.min.z - clearance || z > box.max.z + clearance
    ));
  };
  const segmentIsSafe = (from, to) => {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const samples = Math.max(3, Math.ceil(distance / 1.4));
    for (let index = 1; index <= samples; index += 1) {
      const t = index / samples;
      const x = THREE.MathUtils.lerp(from.x, to.x, t);
      const z = THREE.MathUtils.lerp(from.z, to.z, t);
      const surface = terrainSurfaceAt(terrain, x, z);
      if (!surface || surface.point.y < 1.2 || surface.normal.y < 0.66 || !isPointFree(x, z, 2.7)) return false;
    }
    return true;
  };
  const waypointCandidates = [
    [-5.5, 16.5], [2, 18], [7, 11], [4, 4], [-5, 5], [-15, 6],
    [-21, 13], [-19, 21], [-12, 24], [-4, 24], [5, 23], [9, 16],
    [-8, 20], [-17, 17], [-14, 10], [-5, 10], [1, 13],
  ];
  const waypoints = [];
  let routeAnchor = placement;
  for (const [x, z] of waypointCandidates) {
    if (waypoints.length >= 8) break;
    const surface = terrainSurfaceAt(terrain, x, z);
    const candidate = { x, z, surface };
    if (!surface || surface.point.y < 1.2 || surface.normal.y < 0.76) continue;
    if (!isPointFree(x, z) || !segmentIsSafe(routeAnchor, candidate)) continue;
    waypoints.push(candidate);
    routeAnchor = candidate;
  }
  if (waypoints.length < 5) {
    throw new Error(`A rota segura do bode encontrou apenas ${waypoints.length} waypoints.`);
  }

  const groundClearance = goat.position.y - placement.surface.point.y;
  const targetPosition = new THREE.Vector3(waypoints[0].x, 0, waypoints[0].z);
  const toTarget = new THREE.Vector3();
  const walkDirection = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const targetQuaternion = new THREE.Quaternion();
  const walkRayOrigin = new THREE.Vector3();
  const walkRayDirection = new THREE.Vector3(0, -1, 0);
  const walkRaycaster = new THREE.Raycaster(undefined, undefined, 0, 240);
  const walkRayHits = [];
  const headPosition = new THREE.Vector3();
  const hipsPosition = new THREE.Vector3();
  const localForward = new THREE.Vector3(0, 0, 1);
  if (walkBones.head && walkBones.hips) {
    walkBones.head.getWorldPosition(headPosition);
    walkBones.hips.getWorldPosition(hipsPosition);
    goat.worldToLocal(headPosition);
    goat.worldToLocal(hipsPosition);
    localForward.subVectors(headPosition, hipsPosition);
    localForward.y = 0;
    if (localForward.lengthSq() > 0.0001) localForward.normalize();
    else localForward.set(0, 0, 1);
  }
  const modelForwardYaw = Math.atan2(localForward.x, localForward.z);
  const walkFrequency = 5;
  const walkSpeed = 1.25;
  let sequenceStartedAt = null;
  let walkWeight = 0;
  let idleWeight = 0;
  let movementState = 'pause';
  let pauseEndsAt = 1;
  let waypointIndex = 0;
  let currentWalkSpeed = walkSpeed;

  const applyRotationOffset = (bone, x = 0, y = 0, z = 0) => {
    if (!bone) return;
    const base = baseRotations.get(bone);
    bone.rotation.set(
      base.x + x * walkWeight,
      base.y + y * walkWeight,
      base.z + z * walkWeight,
    );
  };

  function updateGoatWalk(elapsedTime, deltaTime) {
    if (sequenceStartedAt === null) sequenceStartedAt = elapsedTime;
    const sequenceTime = elapsedTime - sequenceStartedAt;
    if (movementState === 'pause' && sequenceTime >= pauseEndsAt) {
      movementState = 'walk';
      currentWalkSpeed = walkSpeed * (0.9 + Math.random() * 0.2);
      console.info(`[GOAT ROUTE] Caminhando para waypoint ${waypointIndex + 1}/${waypoints.length}.`);
    }
    const shouldWalk = movementState === 'walk';
    walkWeight = THREE.MathUtils.damp(walkWeight, shouldWalk ? 1 : 0, shouldWalk ? 7 : 5, deltaTime);
    idleWeight = THREE.MathUtils.damp(idleWeight, shouldWalk ? 0 : 1, 4, deltaTime);

    if (shouldWalk) {
      toTarget.set(targetPosition.x - goat.position.x, 0, targetPosition.z - goat.position.z);
      const distance = toTarget.length();
      if (distance <= 0.08) {
        waypointIndex = (waypointIndex + 1) % waypoints.length;
        const nextWaypoint = waypoints[waypointIndex];
        targetPosition.set(nextWaypoint.x, 0, nextWaypoint.z);
        if (Math.random() < 0.68) {
          movementState = 'pause';
          const pauseDuration = 2 + Math.random() * 3;
          pauseEndsAt = sequenceTime + pauseDuration;
          console.info(`[GOAT ROUTE] Pausa Idle de ${pauseDuration.toFixed(1)}s; próximo waypoint ${waypointIndex + 1}/${waypoints.length}.`);
        } else {
          currentWalkSpeed = walkSpeed * (0.9 + Math.random() * 0.2);
          console.info(`[GOAT ROUTE] Seguindo sem pausa para waypoint ${waypointIndex + 1}/${waypoints.length}.`);
        }
      } else {
        walkDirection.copy(toTarget).multiplyScalar(1 / distance);
        goat.position.addScaledVector(walkDirection, Math.min(currentWalkSpeed * deltaTime, distance));
        walkRayOrigin.set(goat.position.x, 120, goat.position.z);
        walkRaycaster.set(walkRayOrigin, walkRayDirection);
        walkRayHits.length = 0;
        walkRaycaster.intersectObject(terrain, true, walkRayHits);
        if (walkRayHits[0]) goat.position.y = walkRayHits[0].point.y + groundClearance;
        const targetYaw = Math.atan2(walkDirection.x, walkDirection.z) - modelForwardYaw;
        targetQuaternion.setFromAxisAngle(upAxis, targetYaw);
        goat.quaternion.slerp(targetQuaternion, 1 - Math.exp(-deltaTime * 4.5));
      }
    }

    const phase = Math.max(0, sequenceTime - 1) * walkFrequency;
    const pairA = Math.sin(phase);
    const pairB = Math.sin(phase + Math.PI);
    const flexA = Math.max(0, Math.sin(phase + Math.PI * 0.45));
    const flexB = Math.max(0, Math.sin(phase + Math.PI * 1.45));

    applyRotationOffset(walkBones.frontLeftUpper, pairA * 0.24);
    applyRotationOffset(walkBones.rearRightUpper, pairA * 0.24);
    applyRotationOffset(walkBones.frontRightUpper, pairB * 0.24);
    applyRotationOffset(walkBones.rearLeftUpper, pairB * 0.24);
    applyRotationOffset(walkBones.frontLeftLower, flexA * 0.14);
    applyRotationOffset(walkBones.rearRightLower, flexA * 0.13);
    applyRotationOffset(walkBones.frontRightLower, flexB * 0.14);
    applyRotationOffset(walkBones.rearLeftLower, flexB * 0.13);
    applyRotationOffset(walkBones.hips, Math.sin(phase * 2) * 0.012, 0, Math.sin(phase) * 0.014);
    applyRotationOffset(walkBones.chest, 0, Math.sin(phase) * 0.014, Math.sin(phase * 2 + 0.4) * 0.01);
    applyRotationOffset(walkBones.neck, -Math.sin(phase * 2 + 0.4) * 0.012);
    applyRotationOffset(walkBones.head, Math.sin(phase * 2 + 0.4) * 0.007);
    applyRotationOffset(walkBones.tail, 0, Math.sin(elapsedTime * 2) * 0.065);

    if (walkBones.head) {
      walkBones.head.rotation.x += Math.sin(elapsedTime * 0.85) * 0.018 * idleWeight;
      walkBones.head.rotation.y += Math.sin(elapsedTime * 0.52 + 0.7) * 0.026 * idleWeight;
    }
    if (walkBones.neck) {
      walkBones.neck.rotation.x += Math.sin(elapsedTime * 0.62 + 0.3) * 0.012 * idleWeight;
      walkBones.neck.rotation.y += Math.sin(elapsedTime * 0.44) * 0.01 * idleWeight;
    }
    if (walkBones.chest) {
      walkBones.chest.rotation.y += Math.sin(elapsedTime * 0.72) * 0.006 * idleWeight;
      walkBones.chest.rotation.z += Math.sin(elapsedTime * 0.58 + 0.5) * 0.004 * idleWeight;
    }
    if (walkBones.tail) {
      walkBones.tail.rotation.y += Math.sin(elapsedTime * 1.15 + 1.2) * 0.085 * idleWeight;
    }
  }

  const diagnostics = {
    position: goat.position.toArray(),
    uniformScale: goat.scale.x,
    meshes: meshCount,
    skinnedMeshes,
    materials: [...materials].map((material) => material.name || '(sem nome)'),
    textures: textures.size,
    bones: bones.length,
    animationsPreserved: gltf.animations.map((clip) => clip.name || '(sem nome)'),
    waypoints: waypoints.map((waypoint) => [waypoint.x, waypoint.surface.point.y, waypoint.z]),
    modelForwardYaw,
  };
  console.info('[GOAT] GLB carregado e assentado.', JSON.stringify(diagnostics));

  return { goat, updateGoatWalk };
}

async function loadWizardNpc(terrain, tecnomagoHouse) {
  const gltf = await loadGlbOnce(WIZARD_NPC_URL, 'mago NPC');
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const sourceBounds = new THREE.Box3().setFromObject(source);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const targetHeight = 2.7;
  const uniformScale = targetHeight / Math.max(sourceSize.y, 0.0001);

  const wizard = new THREE.Group();
  wizard.name = 'TecnomagoWizardNpc';
  wizard.scale.setScalar(uniformScale);
  const visual = new THREE.Group();
  visual.name = 'TecnomagoWizardNpcVisual';
  source.position.set(-sourceCenter.x, -sourceBounds.min.y, -sourceCenter.z);
  visual.add(source);
  wizard.add(visual);

  let meshCount = 0;
  const materials = new Set();
  source.traverse((object) => {
    if (!object.isMesh) return;
    meshCount += 1;
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = true;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.filter(Boolean).forEach((material) => materials.add(material));
  });

  const houseBounds = new THREE.Box3().setFromObject(tecnomagoHouse);
  const houseSize = houseBounds.getSize(new THREE.Vector3());
  const houseCenter = houseBounds.getCenter(new THREE.Vector3());
  const entranceDirection = new THREE.Vector2(
    Math.cos(tecnomagoHouse.rotation.y),
    -Math.sin(tecnomagoHouse.rotation.y),
  ).normalize();
  const lateralDirection = new THREE.Vector2(-entranceDirection.y, entranceDirection.x);
  const frontDistance = Math.max(houseSize.x, houseSize.z) * 0.58 + 1.2;
  const routeCenter = new THREE.Vector2(
    houseCenter.x + entranceDirection.x * frontDistance,
    houseCenter.z + entranceDirection.y * frontDistance,
  );
  const supportOffsets = [[0, 0], [-0.65, 0], [0.65, 0], [0, -0.65], [0, 0.65]];
  const safeSurfaceAt = (x, z) => {
    const samples = supportOffsets
      .map(([dx, dz]) => terrainSurfaceAt(terrain, x + dx, z + dz))
      .filter(Boolean);
    if (samples.length !== supportOffsets.length) return null;
    if (samples.some((surface) => surface.normal.y < 0.72)) return null;
    const heights = samples.map((surface) => surface.point.y);
    if (Math.max(...heights) - Math.min(...heights) > 0.75) return null;
    return samples[0];
  };
  const waypointSpecs = [
    [-3.1, -0.55], [-0.5, 0.7], [2.8, -0.25],
    [1.65, -1.15], [-1.75, -1.05], [0.8, -1.55],
  ];
  const waypoints = waypointSpecs.map(([lateral, forward]) => {
    const x = routeCenter.x + lateralDirection.x * lateral + entranceDirection.x * forward;
    const z = routeCenter.y + lateralDirection.y * lateral + entranceDirection.y * forward;
    return { x, z, surface: safeSurfaceAt(x, z) };
  }).filter((waypoint) => waypoint.surface).slice(0, 3);
  if (waypoints.length < 2) {
    throw new Error('Não foi possível encontrar um percurso seguro para o mago em frente à Casa do Tecnomago.');
  }

  wizard.position.set(
    waypoints[0].x,
    waypoints[0].surface.point.y + 0.018,
    waypoints[0].z,
  );
  wizard.updateMatrixWorld(true);
  const settledBounds = new THREE.Box3().setFromObject(wizard);
  wizard.position.y += waypoints[0].surface.point.y - settledBounds.min.y + 0.018;
  const groundClearance = wizard.position.y - waypoints[0].surface.point.y;

  const toTarget = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const baseSpeed = 0.38;
  let sequenceStartedAt = null;
  let movementState = 'pause';
  let pauseEndsAt = 1.4;
  let waypointIndex = 1;
  let routeDirection = 1;
  let currentSpeed = baseSpeed;
  let movementWeight = 0;

  function updateWizardNpc(elapsedTime, deltaTime) {
    if (sequenceStartedAt === null) sequenceStartedAt = elapsedTime;
    const sequenceTime = elapsedTime - sequenceStartedAt;
    if (movementState === 'pause' && sequenceTime >= pauseEndsAt) {
      movementState = 'move';
      currentSpeed = baseSpeed * (0.9 + Math.random() * 0.16);
    }

    const isMoving = movementState === 'move';
    movementWeight = THREE.MathUtils.damp(movementWeight, isMoving ? 1 : 0, 3.2, deltaTime);
    if (isMoving) {
      const target = waypoints[waypointIndex];
      toTarget.set(target.x - wizard.position.x, 0, target.z - wizard.position.z);
      const distance = toTarget.length();
      if (distance <= 0.06) {
        if (waypointIndex === waypoints.length - 1) routeDirection = -1;
        if (waypointIndex === 0) routeDirection = 1;
        waypointIndex += routeDirection;
        movementState = 'pause';
        pauseEndsAt = sequenceTime + 2.2 + Math.random() * 2.4;
      } else {
        direction.copy(toTarget).multiplyScalar(1 / distance);
        const rhythm = 0.97 + Math.sin(elapsedTime * 0.43 + waypointIndex) * 0.03;
        wizard.position.addScaledVector(
          direction,
          Math.min(currentSpeed * rhythm * deltaTime, distance),
        );
        const surface = terrainSurfaceAt(terrain, wizard.position.x, wizard.position.z);
        if (surface) wizard.position.y = surface.point.y + groundClearance;
        const targetYaw = Math.atan2(direction.x, direction.z);
        targetQuaternion.setFromAxisAngle(upAxis, targetYaw);
        wizard.quaternion.slerp(targetQuaternion, 1 - Math.exp(-deltaTime * 2.8));
      }
    }

    visual.position.y = (Math.sin(elapsedTime * 2.05) + 1) * 0.009 * movementWeight;
    visual.rotation.z = Math.sin(elapsedTime * 1.42 + 0.5) * 0.009 * movementWeight;
    visual.rotation.x = Math.sin(elapsedTime * 1.08) * 0.004 * movementWeight;
  }

  console.info('[WIZARD NPC] GLB carregado sem rig/animações.', {
    position: wizard.position.toArray(),
    scale: uniformScale,
    meshes: meshCount,
    materials: [...materials].map((material) => material.name || '(sem nome)'),
    animations: gltf.animations.length,
    waypoints: waypoints.map((waypoint) => [waypoint.x, waypoint.surface.point.y, waypoint.z]),
  });

  return { wizard, updateWizardNpc };
}

function sampleTerrainOutline(terrain, center, segments = 112) {
  terrain.updateMatrixWorld(true);
  const radii = new Float32Array(segments);
  const point = new THREE.Vector3();
  const tau = Math.PI * 2;

  terrain.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry?.attributes?.position;
    if (!positions) return;
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      const angle = (Math.atan2(dz, dx) + tau) % tau;
      const bin = Math.round((angle / tau) * segments) % segments;
      radii[bin] = Math.max(radii[bin], Math.hypot(dx, dz));
    }
  });

  for (let index = 0; index < segments; index += 1) {
    if (radii[index] > 0) continue;
    for (let distance = 1; distance < segments * 0.5; distance += 1) {
      const previous = radii[(index - distance + segments) % segments];
      const next = radii[(index + distance) % segments];
      if (previous || next) {
        radii[index] = previous || next;
        break;
      }
    }
  }

  const insetSmoothed = new Float32Array(segments);
  for (let index = 0; index < segments; index += 1) {
    const previous = radii[(index - 1 + segments) % segments];
    const current = radii[index];
    const following = radii[(index + 1) % segments];
    const localAverage = previous * 0.18 + current * 0.64 + following * 0.18;
    insetSmoothed[index] = Math.min(current, localAverage);
  }
  return insetSmoothed;
}

function resampleClosedSeries(values, multiplier = 3) {
  const sourceLength = values.length;
  const result = new Float32Array(sourceLength * multiplier);
  for (let index = 0; index < result.length; index += 1) {
    const sourcePosition = index / multiplier;
    const sourceIndex = Math.floor(sourcePosition);
    const t = sourcePosition - sourceIndex;
    const p0 = values[(sourceIndex - 1 + sourceLength) % sourceLength];
    const p1 = values[sourceIndex % sourceLength];
    const p2 = values[(sourceIndex + 1) % sourceLength];
    const p3 = values[(sourceIndex + 2) % sourceLength];
    const t2 = t * t;
    const t3 = t2 * t;
    result[index] = 0.5 * (
      (2 * p1)
      + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }
  return result;
}

function createFlatCoastRibbon(name, center, radii, oceanY, widths, material) {
  const segments = radii.length;
  const positions = [];
  const uvs = [];
  const coastStrengths = [];
  const indices = [];
  const tau = Math.PI * 2;
  for (let index = 0; index <= segments; index += 1) {
    const sourceIndex = index % segments;
    const angle = (sourceIndex / segments) * tau;
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    const noise = Math.sin(angle * 5 + 0.7) * 0.45 + Math.sin(angle * 11 - 0.4) * 0.22;
    const innerWidth = ArrayBuffer.isView(widths.inner) ? widths.inner[sourceIndex] : widths.inner;
    const outerWidth = ArrayBuffer.isView(widths.outer) ? widths.outer[sourceIndex] : widths.outer;
    const innerRadius = radii[sourceIndex] + innerWidth + noise * 0.1;
    const outerRadius = radii[sourceIndex] + outerWidth + noise * widths.noise;
    positions.push(
      center.x + directionX * innerRadius, oceanY, center.z + directionZ * innerRadius,
      center.x + directionX * outerRadius, oceanY, center.z + directionZ * outerRadius,
    );
    const coastStrength = ArrayBuffer.isView(widths.strength) ? widths.strength[sourceIndex] : 1;
    coastStrengths.push(coastStrength, coastStrength);
    const u = index / segments;
    uvs.push(u, 0, u, 1);
    if (index < segments) {
      const offset = index * 2;
      indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('coastStrength', new THREE.Float32BufferAttribute(coastStrengths, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = 2;
  return mesh;
}

function createTerrainCoastRibbon(name, terrain, center, radii, offsets, predicate, material) {
  const segments = radii.length;
  const samples = [];
  const tau = Math.PI * 2;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * tau;
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    const outerRadius = radii[index] - offsets.outer;
    const innerRadius = radii[index] - offsets.inner;
    const outer = terrainSurfaceAt(
      terrain,
      center.x + directionX * outerRadius,
      center.z + directionZ * outerRadius,
    );
    const inner = terrainSurfaceAt(
      terrain,
      center.x + directionX * innerRadius,
      center.z + directionZ * innerRadius,
    );
    const rise = outer && inner ? Math.abs(inner.point.y - outer.point.y) : Infinity;
    const slope = outer && inner ? Math.min(outer.normal.y, inner.normal.y) : 0;
    samples.push({ outer, inner, allowed: Boolean(outer && inner && predicate(slope, rise)) });
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const nextIndex = (index + 1) % segments;
    const current = samples[index];
    const next = samples[nextIndex];
    if (!current.allowed || !next.allowed) continue;
    const base = positions.length / 3;
    positions.push(
      current.outer.point.x, current.outer.point.y + 0.055, current.outer.point.z,
      current.inner.point.x, current.inner.point.y + 0.055, current.inner.point.z,
      next.outer.point.x, next.outer.point.y + 0.055, next.outer.point.z,
      next.inner.point.x, next.inner.point.y + 0.055, next.inner.point.z,
    );
    const u0 = index / segments;
    const u1 = (index + 1) / segments;
    uvs.push(u0, 0, u0, 1, u1, 0, u1, 1);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

function sampleTerrainFootprint(terrain, center, halfX, halfZ, yaw) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const samples = [
    [0, 0],
    [halfX, 0], [-halfX, 0],
    [0, halfZ], [0, -halfZ],
    [halfX, halfZ], [halfX, -halfZ],
    [-halfX, halfZ], [-halfX, -halfZ],
    [halfX * 0.5, halfZ * 0.5],
    [halfX * 0.5, -halfZ * 0.5],
    [-halfX * 0.5, halfZ * 0.5],
    [-halfX * 0.5, -halfZ * 0.5],
  ];
  const heights = samples.map(([localX, localZ]) => terrainHeightAt(
    terrain,
    center.x + localX * cosYaw + localZ * sinYaw,
    center.z - localX * sinYaw + localZ * cosYaw,
  )).sort((a, b) => a - b);
  return {
    heights,
    supportY: heights[Math.floor(heights.length * 0.5)],
  };
}

function createPrecomputedTerrainRibbon(name, data, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

async function createCoastalTransition(terrain, worldBounds, oceanY) {
  const coast = new THREE.Group();
  coast.name = 'TamarindPainterlyCoast';
  let precomputed = null;
  try {
    const response = await fetch(COAST_DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    precomputed = await response.json();
  } catch (error) {
    console.warn('[Tamarind] Dados costeiros pré-calculados indisponíveis; usando fallback.', error);
  }
  const center = precomputed
    ? new THREE.Vector3().fromArray(precomputed.center)
    : worldBounds.getCenter(new THREE.Vector3());
  center.y = oceanY;
  const radii = precomputed ? Float32Array.from(precomputed.radii) : sampleTerrainOutline(terrain, center);
  const foamInnerWidths = new Float32Array(radii.length);
  const foamOuterWidths = new Float32Array(radii.length);
  const foamStrengths = new Float32Array(radii.length);
  const shallowInnerWidths = new Float32Array(radii.length);
  const shallowOuterWidths = new Float32Array(radii.length);
  if (precomputed) {
    foamInnerWidths.set(precomputed.foamInner);
    foamOuterWidths.set(precomputed.foamOuter);
    foamStrengths.set(precomputed.foamStrength);
    shallowInnerWidths.set(precomputed.shallowInner);
    shallowOuterWidths.set(precomputed.shallowOuter);
  } else for (let index = 0; index < radii.length; index += 1) {
    const angle = (index / radii.length) * Math.PI * 2;
    const sampleRadius = radii[index] - 2.2;
    const surface = terrainSurfaceAt(
      terrain,
      center.x + Math.cos(angle) * sampleRadius,
      center.z + Math.sin(angle) * sampleRadius,
    );
    const slope = surface?.normal.y ?? 0;
    if (slope > 0.72) {
      foamInnerWidths[index] = -1.3;
      foamOuterWidths[index] = 0.12;
      foamStrengths[index] = 1;
      shallowInnerWidths[index] = -1.25;
      shallowOuterWidths[index] = 5.2;
    } else if (slope > 0.5) {
      foamInnerWidths[index] = -0.85;
      foamOuterWidths[index] = 0.05;
      foamStrengths[index] = 0.48;
      shallowInnerWidths[index] = -0.8;
      shallowOuterWidths[index] = 3.55;
    } else {
      foamInnerWidths[index] = -0.46;
      foamOuterWidths[index] = -0.03;
      foamStrengths[index] = 0.14;
      shallowInnerWidths[index] = -0.35;
      shallowOuterWidths[index] = 1.35;
    }
    shallowOuterWidths[index] += Math.sin(index * 1.73) * 0.22 + Math.sin(index * 0.47 + 1.2) * 0.16;
  }

  const shallowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float coastFade = pow(max(1.0 - vUv.y, 0.0), 1.65);
        float outerDissolve = 1.0 - smoothstep(0.62, 1.0, vUv.y);
        float variation = 0.94
          + sin(vUv.x * 73.0 + uTime * 0.08) * 0.025
          + sin(vUv.x * 31.0 - uTime * 0.055) * 0.018;
        float alpha = coastFade * outerDissolve * variation * 0.34;
        vec3 shallowColor = mix(vec3(0.21, 0.55, 0.60), vec3(0.30, 0.70, 0.68), coastFade);
        gl_FragColor = vec4(shallowColor, alpha);
      }
    `,
  });
  const smoothShallowRadii = resampleClosedSeries(radii);
  const smoothShallowInner = resampleClosedSeries(shallowInnerWidths);
  const smoothShallowOuter = resampleClosedSeries(shallowOuterWidths);
  const shallow = createFlatCoastRibbon(
    'TamarindShallowWater', center, smoothShallowRadii, oceanY + 0.07,
    { inner: smoothShallowInner, outer: smoothShallowOuter, noise: 0.08 }, shallowMaterial,
  );
  coast.add(shallow);

  const foamMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.62 } },
    vertexShader: `
      attribute float coastStrength;
      varying vec2 vUv;
      varying float vCoastStrength;
      void main() {
        vUv = uv;
        vCoastStrength = coastStrength;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vCoastStrength;
      void main() {
        float edge = sin(vUv.y * 3.14159265);
        float breakup = sin(vUv.x * 255.0 + vUv.y * 17.0 + uTime * 0.31) * 0.38
          + sin(vUv.x * 119.0 - uTime * 0.19) * 0.31
          + sin(vUv.x * 47.0 - vUv.y * 29.0 + 1.7) * 0.18;
        float irregular = 0.36 + 0.64 * smoothstep(-0.18, 0.42, breakup);
        float softEdge = smoothstep(0.0, 0.32, edge);
        float alpha = softEdge * irregular * uOpacity * vCoastStrength;
        gl_FragColor = vec4(0.88, 0.95, 0.93, alpha);
      }
    `,
  });
  const foam = createFlatCoastRibbon(
    'TamarindIrregularCoastalFoam', center, radii, oceanY + 0.135,
    { inner: foamInnerWidths, outer: foamOuterWidths, strength: foamStrengths, noise: 0.07 }, foamMaterial,
  );
  foam.renderOrder = 3;
  coast.add(foam);

  const beachMaterial = new THREE.MeshStandardMaterial({
    color: '#c99d69', roughness: 0.92, metalness: 0, transparent: true, opacity: 0.72,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const beach = precomputed
    ? createPrecomputedTerrainRibbon('TamarindGentleBeach', precomputed.beach, beachMaterial)
    : createTerrainCoastRibbon(
      'TamarindGentleBeach', terrain, center, radii, { outer: 1.05, inner: 3.5 },
      (slope, rise) => slope > 0.72 && rise < 2.6,
      beachMaterial,
    );
  coast.add(beach);

  const wetShoreMaterial = new THREE.MeshStandardMaterial({
    color: '#604b43', roughness: 0.68, metalness: 0.02, transparent: true, opacity: 0.58,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const wetShore = precomputed
    ? createPrecomputedTerrainRibbon('TamarindWetShore', precomputed.wetShore, wetShoreMaterial)
    : createTerrainCoastRibbon(
      'TamarindWetShore', terrain, center, radii, { outer: 0.25, inner: 1.2 },
      (slope, rise) => slope > 0.52 && rise < 3.8,
      wetShoreMaterial,
    );
  coast.add(wetShore);

  coast.userData.update = (elapsed) => {
    shallowMaterial.uniforms.uTime.value = elapsed;
    foamMaterial.uniforms.uTime.value = elapsed;
    foamMaterial.uniforms.uOpacity.value = 0.39 + Math.sin(elapsed * 0.44) * 0.035;
  };
  return coast;
}

async function loadTecnomagoHouse(terrain) {
  const gltf = await loadGlbOnce(TECNOMAGO_HOUSE_URL, 'Casa do Tecnomago');
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const targetWidth = 19.490625;
  const uniformScale = targetWidth / Math.max(size.x, size.z, 0.0001);
  const target = new THREE.Vector3(-38.5, 0, 4);
  const yaw = -1.00;
  const footprintX = size.x * uniformScale * 0.42;
  const footprintZ = size.z * uniformScale * 0.42;
  const footprintSupport = sampleTerrainFootprint(
    terrain,
    target,
    footprintX,
    footprintZ,
    yaw,
  );
  target.y = footprintSupport.supportY;

  const scaledCenter = center.clone().multiplyScalar(uniformScale);
  scaledCenter.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);

  const houseGroup = new THREE.Group();
  houseGroup.name = 'TecnomagoHouse';
  houseGroup.scale.setScalar(uniformScale);
  houseGroup.rotation.y = yaw;
  houseGroup.position.set(
    target.x - scaledCenter.x,
    target.y - bounds.min.y * uniformScale + 0.02,
    target.z - scaledCenter.z,
  );
  houseGroup.add(source);

  source.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });

  const accessGroup = new THREE.Group();
  accessGroup.name = 'TecnomagoEntranceAccess';
  const entranceDirection = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
  const accessYaw = Math.atan2(entranceDirection.x, entranceDirection.y);
  const stepGeometry = new THREE.BoxGeometry(1.75, 0.16, 0.82);
  const stepMaterial = new THREE.MeshStandardMaterial({
    color: '#755b45',
    roughness: 0.96,
    metalness: 0,
  });
  for (let index = 0; index < 4; index += 1) {
    const distance = 10.4 + index * 1.25;
    const x = target.x + entranceDirection.x * distance;
    const z = target.z + entranceDirection.y * distance;
    const surface = terrainSurfaceAt(terrain, x, z);
    if (!surface) continue;
    const step = new THREE.Mesh(stepGeometry, stepMaterial);
    step.name = `TecnomagoEntranceStep_${index + 1}`;
    step.position.set(x, surface.point.y + 0.03, z);
    step.rotation.y = accessYaw;
    step.castShadow = false;
    step.receiveShadow = true;
    accessGroup.add(step);
  }
  houseGroup.userData.entranceAccess = accessGroup;

  console.info('[Tamarind] Casa do Tecnomago carregada.', JSON.stringify({
    position: houseGroup.position.toArray(),
    rotationY: yaw,
    scale: uniformScale,
    terrainSupportY: target.y,
    supportHeights: footprintSupport.heights,
    triangles: 639968,
  }));
  return houseGroup;
}

async function loadArchitectureHouse(terrain) {
  const gltf = await loadGlbOnce(ARCHITECTURE_HOUSE_URL, 'Coliseu 3D/Arquitetura');
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const targetWidth = 15.5;
  const uniformScale = targetWidth / Math.max(size.x, size.z, 0.0001);
  const target = new THREE.Vector3(10, 0, 33.5);
  const yaw = -1.05;
  const halfBaseX = size.x * uniformScale * 0.47;
  const halfBaseZ = size.z * uniformScale * 0.47;
  const localFootprintSamples = [
    [0, 0],
    [0, -halfBaseZ],
    [0, halfBaseZ],
    [-halfBaseX, 0],
    [halfBaseX, 0],
    [-halfBaseX, -halfBaseZ],
    [halfBaseX, -halfBaseZ],
    [-halfBaseX, halfBaseZ],
    [halfBaseX, halfBaseZ],
  ];
  const footprintSamples = localFootprintSamples.map(([x, z]) => {
    const offset = new THREE.Vector3(x, 0, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    return [offset.x, offset.z];
  });
  const supportHeights = footprintSamples
    .map(([dx, dz]) => terrainHeightAt(terrain, target.x + dx, target.z + dz))
    .sort((a, b) => a - b);
  target.y = supportHeights[2];

  const scaledCenter = center.clone().multiplyScalar(uniformScale);
  scaledCenter.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);

  const architectureGroup = new THREE.Group();
  architectureGroup.name = 'Architecture3DHouse';
  architectureGroup.scale.setScalar(uniformScale);
  architectureGroup.rotation.y = yaw;
  architectureGroup.position.set(
    target.x - scaledCenter.x,
    target.y - bounds.min.y * uniformScale - 0.5,
    target.z - scaledCenter.z,
  );
  architectureGroup.add(source);

  source.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });

  console.info('[Tamarind] Casa 3D/Arquitetura carregada.', {
    position: architectureGroup.position.toArray(),
    rotationY: yaw,
    scale: uniformScale,
    supportHeights,
    triangles: 498604,
  });
  return architectureGroup;
}

async function loadAppsBasilica(terrain) {
  const gltf = await loadGlbOnce(APPS_BASILICA_URL, 'Basílica Apps');
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const targetWidth = 27;
  const uniformScale = targetWidth / Math.max(size.x, size.z, 0.0001);
  const target = new THREE.Vector3(25, 0, 2);
  const yaw = 0.05;
  const halfBaseX = size.x * uniformScale * 0.46;
  const halfBaseZ = size.z * uniformScale * 0.46;
  const localFootprintSamples = [
    [0, 0],
    [0, -halfBaseZ],
    [0, halfBaseZ],
    [-halfBaseX, 0],
    [halfBaseX, 0],
    [-halfBaseX, -halfBaseZ],
    [halfBaseX, -halfBaseZ],
    [-halfBaseX, halfBaseZ],
    [halfBaseX, halfBaseZ],
  ];
  const footprintSamples = localFootprintSamples.map(([x, z]) => {
    const offset = new THREE.Vector3(x, 0, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    return [offset.x, offset.z];
  });
  const supportHeights = footprintSamples
    .map(([dx, dz]) => terrainHeightAt(terrain, target.x + dx, target.z + dz))
    .sort((a, b) => a - b);
  target.y = supportHeights[2];

  const scaledCenter = center.clone().multiplyScalar(uniformScale);
  scaledCenter.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);

  const basilicaGroup = new THREE.Group();
  basilicaGroup.name = 'AppsBasilica';
  basilicaGroup.scale.setScalar(uniformScale);
  basilicaGroup.rotation.y = yaw;
  basilicaGroup.position.set(
    target.x - scaledCenter.x,
    target.y - bounds.min.y * uniformScale - 0.24,
    target.z - scaledCenter.z,
  );
  basilicaGroup.add(source);

  source.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });

  console.info('[Tamarind] Basílica Apps carregada.', {
    position: basilicaGroup.position.toArray(),
    rotationY: yaw,
    scale: uniformScale,
    supportHeights,
  });
  return basilicaGroup;
}

async function loadOrientalPagoda(terrain) {
  const gltf = await loadGlbOnce(TEMPLE_URL, 'templo oriental');
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const targetWidth = 12;
  const uniformScale = targetWidth / Math.max(size.x, size.z, 0.0001);
  const target = new THREE.Vector3(-18, 0, 52);
  const yaw = 0;
  const halfBaseX = size.x * uniformScale * 0.47;
  const halfBaseZ = size.z * uniformScale * 0.47;
  const localFootprintSamples = [
    [0, 0], [0, -halfBaseZ], [0, halfBaseZ],
    [-halfBaseX, 0], [halfBaseX, 0],
    [-halfBaseX, -halfBaseZ], [halfBaseX, -halfBaseZ],
    [-halfBaseX, halfBaseZ], [halfBaseX, halfBaseZ],
  ];
  const footprintSamples = localFootprintSamples.map(([x, z]) => {
    const offset = new THREE.Vector3(x, 0, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    return [offset.x, offset.z];
  });
  const supportHeights = footprintSamples
    .map(([dx, dz]) => terrainHeightAt(terrain, target.x + dx, target.z + dz))
    .sort((a, b) => a - b);
  target.y = supportHeights[4];

  const scaledCenter = center.clone().multiplyScalar(uniformScale);
  scaledCenter.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);

  const templeGroup = new THREE.Group();
  templeGroup.name = 'OrientalPagoda';
  templeGroup.scale.setScalar(uniformScale);
  templeGroup.rotation.y = yaw;
  templeGroup.position.set(
    target.x - scaledCenter.x,
    target.y - bounds.min.y * uniformScale - 0.12,
    target.z - scaledCenter.z,
  );
  templeGroup.add(source);

  source.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });

  console.info('[Tamarind] Pagode oriental carregado.', {
    position: templeGroup.position.toArray(),
    rotationY: yaw,
    scale: uniformScale,
    supportHeights,
  });
  return templeGroup;
}

async function loadInstancedTrees(terrain, backgroundPlacements = []) {
  const gltf = await loadGlbOnce(TREE_URL, 'árvores');
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const sourceBounds = new THREE.Box3().setFromObject(source);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const targetHeight = 7.2;
  const baseScale = targetHeight / Math.max(sourceSize.y, 0.0001);
  const requestedPlacements = [
    { x: -58, z: -14, yaw: 0.35, scale: 1.08 },
    { x: -27, z: 0, yaw: 2.05, scale: 0.92 },
    { x: -35, z: -22, yaw: 4.7, scale: 0.84 },
    { x: -35, z: 20, yaw: 1.2, scale: 1.0 },
    { x: -10, z: 12, yaw: 5.55, scale: 0.88 },
    { x: 8, z: -15, yaw: 3.3, scale: 0.96 },
    { x: 49, z: -3, yaw: 0.8, scale: 1.12 },
    { x: 43, z: -23, yaw: 5.05, scale: 0.82 },
    { x: 22, z: 19, yaw: 2.7, scale: 1.05 },
    { x: -5, z: 31, yaw: 4.15, scale: 0.9 },
    { x: 31, z: 39, yaw: 1.75, scale: 1.16 },
    { x: -28, z: 57, yaw: 3.85, scale: 0.98 },
    { x: -37, z: 47, yaw: 0.15, scale: 0.86 },
    ...backgroundPlacements,
  ];
  const searchOffsets = [
    [0, 0], [2, 0], [-2, 0], [0, 2], [0, -2],
    [3, 3], [-3, 3], [3, -3], [-3, -3],
    [6, 0], [-6, 0], [0, 6], [0, -6],
  ];
  const placements = requestedPlacements.flatMap((requested) => {
    for (const [dx, dz] of searchOffsets) {
      const x = requested.x + dx;
      const z = requested.z + dz;
      const surface = terrainSurfaceAt(terrain, x, z);
      if (!surface || surface.point.y < 1.2 || surface.normal.y < 0.74) continue;
      return [{
        x,
        y: surface.point.y + 0.025,
        z,
        yaw: requested.yaw,
        scale: baseScale * requested.scale,
      }];
    }
    if (requested.optional) return [];
    throw new Error(`Sem superfície segura para a árvore em ${requested.x}, ${requested.z}.`);
  });

  const vegetation = new THREE.Group();
  vegetation.name = 'InstancedIslandTrees';
  const normalize = new THREE.Matrix4().makeTranslation(
    -sourceCenter.x,
    -sourceBounds.min.y,
    -sourceCenter.z,
  );
  const dummy = new THREE.Object3D();
  source.traverse((object) => {
    if (!object.isMesh || placements.length === 0) return;
    // The source GLB contains LOD0 and LOD1 in the same scene. Instancing both
    // stacked the foliage versions and repeated the boxy rose-bush ground
    // clusters at every tree placement. Keep the complete detailed tree only.
    if (!object.name.includes('LOD0')) return;
    const geometry = object.geometry.clone();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const visibleGroups = geometry.groups.filter((group) => (
      materials[group.materialIndex]?.name !== 'Rose Bush Leaves'
    ));
    if (geometry.groups.length > 0) {
      geometry.clearGroups();
      visibleGroups.forEach((group) => {
        geometry.addGroup(group.start, group.count, group.materialIndex);
      });
    }
    geometry.applyMatrix4(object.matrixWorld);
    geometry.applyMatrix4(normalize);
    const instanced = new THREE.InstancedMesh(geometry, object.material, placements.length);
    instanced.name = `IslandTrees_${object.name || 'Mesh'}`;
    instanced.castShadow = false;
    instanced.receiveShadow = true;
    instanced.frustumCulled = true;
    placements.forEach((tree, index) => {
      dummy.position.set(tree.x, tree.y, tree.z);
      dummy.rotation.set(0, tree.yaw, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(index, dummy.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    vegetation.add(instanced);
  });

  console.info('[Tamarind] Vegetação instanciada carregada.', {
    instances: placements.length,
    sourceMeshes: vegetation.children.length,
    removedArtificialPatches: 'LOD1 + Rose Bush Leaves',
    targetHeight,
  });
  vegetation.userData.placements = placements.map(({ x, z }) => ({ x, z }));
  return vegetation;
}

function createHarborHut(materials, x, y, z, scale = 1) {
  const hut = new THREE.Group();
  hut.position.set(x, y, z);
  hut.scale.setScalar(scale);

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.45, 4.6), materials.stone);
  foundation.position.y = 0.22;
  hut.add(foundation);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.8, 4), materials.plaster);
  walls.position.y = 1.78;
  hut.add(walls);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.65, 2.25, 4), materials.roof);
  roof.position.y = 4.25;
  roof.rotation.y = Math.PI * 0.25;
  hut.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.85, 0.16), materials.darkWood);
  door.position.set(0, 1.35, 2.08);
  hut.add(door);

  const window = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.14), materials.window);
  window.position.set(1.25, 2.1, 2.1);
  hut.add(window);

  hut.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return hut;
}

function createProceduralFishingBoat(oceanY, deckY, pierStartZ) {
  const boat = new THREE.Group();
  boat.name = 'ProceduralFishingBoat';
  const hullMaterial = new THREE.MeshStandardMaterial({ color: '#4d2f23', roughness: 0.88, metalness: 0.02 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: '#8b6240', roughness: 0.9 });
  const paintedWood = new THREE.MeshStandardMaterial({ color: '#a79a7b', roughness: 0.86 });
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: '#9b7a50', roughness: 1 });
  const buoyMaterial = new THREE.MeshStandardMaterial({ color: '#b95d37', roughness: 0.82 });
  const lampMaterial = new THREE.MeshStandardMaterial({
    name: 'Boat lamp',
    color: '#ffc274',
    emissive: '#5a210b',
    emissiveIntensity: 0.32,
    roughness: 0.48,
  });

  const sections = [
    { z: -3.2, top: 0.98, bottom: 0.48, topY: 0.52, bottomY: -0.5 },
    { z: 0, top: 1.36, bottom: 0.68, topY: 0.58, bottomY: -0.62 },
    { z: 3.65, top: 0.08, bottom: 0.02, topY: 0.48, bottomY: -0.3 },
  ];
  const positions = [];
  sections.forEach((section) => {
    positions.push(
      -section.top, section.topY, section.z,
      section.top, section.topY, section.z,
      -section.bottom, section.bottomY, section.z,
      section.bottom, section.bottomY, section.z,
    );
  });
  const indices = [];
  for (let section = 0; section < sections.length - 1; section += 1) {
    const a = section * 4;
    const b = (section + 1) * 4;
    indices.push(
      a, b, b + 1, a, b + 1, a + 1,
      a + 2, a + 3, b + 3, a + 2, b + 3, b + 2,
      a, a + 2, b + 2, a, b + 2, b,
      a + 1, b + 1, b + 3, a + 1, b + 3, a + 3,
    );
  }
  indices.push(0, 1, 3, 0, 3, 2, 8, 10, 11, 8, 11, 9);
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hullGeometry.setIndex(indices);
  hullGeometry.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeometry, hullMaterial);
  hull.name = 'FishingBoatHull';
  hull.castShadow = true;
  hull.receiveShadow = true;
  boat.add(hull);

  const innerDeck = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 4.6), trimMaterial);
  innerDeck.position.set(0, 0.53, -0.2);
  innerDeck.receiveShadow = true;
  boat.add(innerDeck);
  for (const x of [-1.13, 1.13]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 5.1), trimMaterial);
    rail.position.set(x, 0.68, -0.15);
    boat.add(rail);
  }

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.9, 1.35), paintedWood);
  cabin.position.set(0, 1.02, -1.35);
  cabin.castShadow = true;
  boat.add(cabin);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.16, 1.62), hullMaterial);
  cabinRoof.position.set(0, 1.55, -1.35);
  cabinRoof.rotation.z = 0.025;
  boat.add(cabinRoof);
  const cabinWindow = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.06), lampMaterial);
  cabinWindow.position.set(0, 1.12, -0.645);
  boat.add(cabinWindow);

  for (const z of [0.35, 1.25]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.16, 0.45), trimMaterial);
    bench.position.set(0, 0.78, z);
    boat.add(bench);
  }
  for (const [x, z, scale] of [[-0.48, -2.3, 0.56], [0.42, -2.15, 0.48]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.7, 0.82), trimMaterial);
    crate.position.set(x, 0.9, z);
    crate.scale.setScalar(scale / 0.56);
    crate.rotation.y = x * 0.3;
    boat.add(crate);
  }
  for (const [z, y] of [[0.25, 0.2], [1.55, 0.1], [-0.9, -0.05]]) {
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), buoyMaterial);
    buoy.position.set(-1.34, 0.3 + y, z);
    buoy.scale.set(0.8, 1.15, 0.8);
    boat.add(buoy);
  }
  const ropeCoil = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.045, 5, 12), ropeMaterial);
  ropeCoil.rotation.x = Math.PI / 2;
  ropeCoil.position.set(0.48, 0.7, 2.05);
  boat.add(ropeCoil);

  const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.35, 6), hullMaterial);
  lampPost.position.set(0.52, 1.22, -2.55);
  boat.add(lampPost);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lampMaterial);
  lamp.position.set(0.52, 1.88, -2.55);
  boat.add(lamp);

  const boatX = 8.55;
  const boatZ = pierStartZ + 13.7;
  boat.position.set(boatX, oceanY + 0.18, boatZ);
  boat.rotation.set(0.025, -0.075, 0.04);

  const mooringCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(6.52, deckY + 0.18, pierStartZ + 14.7),
    new THREE.Vector3(7.15, oceanY + 0.72, pierStartZ + 14.45),
    new THREE.Vector3(7.55, oceanY + 0.78, pierStartZ + 14.15),
  ]);
  const mooringRope = new THREE.Mesh(new THREE.TubeGeometry(mooringCurve, 8, 0.035, 4, false), ropeMaterial);
  mooringRope.name = 'FishingBoatMooringRope';

  return { boat, mooringRope };
}

function createHarbor(terrain, oceanY) {
  const harbor = new THREE.Group();
  harbor.name = 'CompactMedievalHarbor';
  const materials = {
    wood: new THREE.MeshStandardMaterial({ color: '#765033', roughness: 0.9 }),
    darkWood: new THREE.MeshStandardMaterial({ color: '#3f2a20', roughness: 0.94 }),
    stone: new THREE.MeshStandardMaterial({ color: '#786d66', roughness: 0.96 }),
    plaster: new THREE.MeshStandardMaterial({ color: '#b8a68a', roughness: 0.92 }),
    roof: new THREE.MeshStandardMaterial({ color: '#713b32', roughness: 0.88 }),
    window: new THREE.MeshStandardMaterial({ color: '#e4a458', emissive: '#6b2f14', emissiveIntensity: 0.55 }),
    path: new THREE.MeshStandardMaterial({ color: '#84715d', roughness: 1 }),
    sack: new THREE.MeshStandardMaterial({ color: '#a88c62', roughness: 1 }),
  };

  const harborX = 0;
  const supportedCoast = [];
  for (let z = 34; z <= 68; z += 1) {
    const surface = terrainSurfaceAt(terrain, harborX, z);
    if (surface && surface.point.y > oceanY + 1.3) supportedCoast.push({ z, surface });
  }
  const coast = supportedCoast.at(-1) ?? { z: 44, surface: terrainSurfaceAt(terrain, harborX, 44) };
  const coastZ = coast.z;
  const deckY = oceanY + 1.05;
  const pierStartZ = coastZ + 2.5;
  const pierLength = 17;
  const plankGeometry = new THREE.BoxGeometry(3.8, 0.28, 0.72);
  const postGeometry = new THREE.CylinderGeometry(0.16, 0.2, 3.2, 8);

  for (let z = pierStartZ; z <= pierStartZ + pierLength; z += 0.72) {
    const plank = new THREE.Mesh(plankGeometry, materials.wood);
    plank.position.set(harborX, deckY, z);
    plank.rotation.y = ((Math.round(z * 10) % 3) - 1) * 0.012;
    plank.receiveShadow = true;
    harbor.add(plank);
  }
  for (let z = pierStartZ + 1; z <= pierStartZ + pierLength; z += 4.2) {
    for (const x of [-1.62, 1.62]) {
      const post = new THREE.Mesh(postGeometry, materials.darkWood);
      post.position.set(x, deckY - 1.4, z);
      post.castShadow = true;
      harbor.add(post);
    }
  }

  const deckGeometry = new THREE.BoxGeometry(6.4, 0.32, 5.2);
  const sideDeckA = new THREE.Mesh(deckGeometry, materials.wood);
  sideDeckA.position.set(-4.3, deckY, pierStartZ + 9.2);
  sideDeckA.receiveShadow = true;
  harbor.add(sideDeckA);
  const sideDeckB = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.32, 4.4), materials.wood);
  sideDeckB.position.set(4, deckY, pierStartZ + 14.2);
  sideDeckB.receiveShadow = true;
  harbor.add(sideDeckB);

  const stairTop = terrainHeightAt(terrain, harborX, coastZ - 3.5);
  const stairCount = 9;
  for (let i = 0; i < stairCount; i += 1) {
    const t = i / (stairCount - 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.38, 1.05), materials.stone);
    step.position.set(
      harborX,
      THREE.MathUtils.lerp(stairTop, deckY + 0.08, t) - 0.18,
      THREE.MathUtils.lerp(coastZ - 3.5, pierStartZ, t),
    );
    step.receiveShadow = true;
    harbor.add(step);
  }

  const hutPlacements = [
    { x: -8.5, z: coastZ - 7.5, scale: 0.92, yaw: 0.12 },
    { x: -2.5, z: coastZ - 11.5, scale: 0.72, yaw: 0.2 },
  ];
  for (const item of hutPlacements) {
    const surface = terrainSurfaceAt(terrain, item.x, item.z);
    if (!surface || surface.normal.y < 0.68) continue;
    const hut = createHarborHut(materials, item.x, surface.point.y - 0.2, item.z, item.scale);
    hut.rotation.y = item.yaw;
    harbor.add(hut);
  }

  const pathPoints = [
    [-3, coastZ - 10], [-5, coastZ - 15], [-7, coastZ - 20], [-5, coastZ - 25],
  ];
  for (let segment = 0; segment < pathPoints.length - 1; segment += 1) {
    const [ax, az] = pathPoints[segment];
    const [bx, bz] = pathPoints[segment + 1];
    for (let i = 0; i < 4; i += 1) {
      const t = i / 4;
      const x = THREE.MathUtils.lerp(ax, bx, t);
      const z = THREE.MathUtils.lerp(az, bz, t);
      const surface = terrainSurfaceAt(terrain, x, z);
      if (!surface || surface.normal.y < 0.66) continue;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 1.35), materials.path);
      slab.position.set(x, surface.point.y + 0.02, z);
      slab.rotation.y = Math.atan2(bx - ax, bz - az);
      slab.receiveShadow = true;
      harbor.add(slab);
    }
  }

  const crateGeometry = new THREE.BoxGeometry(0.82, 0.82, 0.82);
  const barrelGeometry = new THREE.CylinderGeometry(0.42, 0.48, 0.92, 10);
  const propPositions = [
    [-1.2, pierStartZ + 7, 'crate'], [1.2, pierStartZ + 8.2, 'barrel'],
    [-4.7, pierStartZ + 9.6, 'barrel'], [-3.6, pierStartZ + 8.3, 'crate'],
    [3.5, pierStartZ + 13.2, 'crate'], [4.7, pierStartZ + 14.5, 'barrel'],
  ];
  for (const [x, z, type] of propPositions) {
    const prop = new THREE.Mesh(type === 'barrel' ? barrelGeometry : crateGeometry, type === 'barrel' ? materials.darkWood : materials.wood);
    prop.position.set(x, deckY + 0.55, z);
    prop.rotation.y = (x + z) * 0.37;
    prop.castShadow = true;
    harbor.add(prop);
  }
  for (const [x, z] of [[-2.2, pierStartZ + 5.5], [2.1, pierStartZ + 11.2], [-4.8, pierStartZ + 10.8]]) {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 6), materials.sack);
    sack.scale.set(1, 0.68, 0.82);
    sack.position.set(x, deckY + 0.4, z);
    sack.castShadow = true;
    harbor.add(sack);
  }

  const lanternPositions = [
    [-1.65, pierStartZ + 2], [1.65, pierStartZ + 8], [-1.65, pierStartZ + 15],
  ];
  for (const [x, z] of lanternPositions) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.5, 8), materials.darkWood);
    post.position.set(x, deckY + 1.25, z);
    harbor.add(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), materials.window);
    lamp.position.set(x, deckY + 2.48, z);
    harbor.add(lamp);
  }

  const { boat, mooringRope } = createProceduralFishingBoat(oceanY, deckY, pierStartZ);
  harbor.add(boat, mooringRope);

  console.info('[Tamarind] Porto medieval compacto criado.', {
    coastZ,
    deckY,
    fishingBoat: boat.position.toArray(),
  });
  return harbor;
}

function createSettlementHouse(template, x, y, z, yaw, scale) {
  const uniformScale = template.baseScale * scale;
  const scaledCenter = template.center.clone().multiplyScalar(uniformScale);
  scaledCenter.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  const house = new THREE.Group();
  house.name = 'DetailedSettlementHouse';
  house.position.set(
    x - scaledCenter.x,
    y - template.bounds.min.y * uniformScale - 0.1,
    z - scaledCenter.z,
  );
  house.rotation.y = yaw;
  house.scale.setScalar(uniformScale);
  house.add(template.source.clone(true));
  house.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });
  return house;
}

async function createMedievalSettlement(terrain, oceanY) {
  const settlement = new THREE.Group();
  settlement.name = 'LightMedievalSettlement';
  const houseSource = (await loadGlbOnce(SETTLEMENT_HOUSE_URL, 'casas da vila')).scene;
  houseSource.updateMatrixWorld(true);
  const houseBounds = new THREE.Box3().setFromObject(houseSource);
  const houseSize = houseBounds.getSize(new THREE.Vector3());
  const houseTemplate = {
    source: houseSource,
    bounds: houseBounds,
    center: houseBounds.getCenter(new THREE.Vector3()),
    baseScale: 5.2 / Math.max(houseSize.x, houseSize.z, 0.0001),
  };
  const materials = {
    stone: new THREE.MeshStandardMaterial({ color: '#756c64', roughness: 0.98 }),
    plaster: new THREE.MeshStandardMaterial({ color: '#b8a68b', roughness: 0.94 }),
    wood: new THREE.MeshStandardMaterial({ color: '#765033', roughness: 0.94 }),
    darkWood: new THREE.MeshStandardMaterial({ color: '#3e2a21', roughness: 0.96 }),
    roof: new THREE.MeshStandardMaterial({ color: '#7b4234', roughness: 0.9 }),
    canvas: new THREE.MeshStandardMaterial({ color: '#c58a52', roughness: 0.9, side: THREE.DoubleSide }),
    canvasRed: new THREE.MeshStandardMaterial({ color: '#8f4c3d', roughness: 0.9, side: THREE.DoubleSide }),
    window: new THREE.MeshStandardMaterial({ color: '#e1a15c', emissive: '#59280f', emissiveIntensity: 0.45 }),
    path: new THREE.MeshStandardMaterial({ color: '#7f705d', roughness: 1 }),
  };

  const houses = [
    { x: -27, z: -8, yaw: 0.62, scale: 0.76 },
    { x: -22, z: -2, yaw: 0.18, scale: 0.7 },
    { x: -27, z: 5, yaw: -0.42, scale: 0.73 },
    { x: 14, z: -11, yaw: 2.7, scale: 0.68 },
  ];
  const houseSearchOffsets = [
    [0, 0], [2, 0], [-2, 0], [0, 2], [0, -2],
    [3, 3], [-3, 3], [3, -3], [-3, -3],
  ];
  for (const item of houses) {
    let placement = null;
    for (const [dx, dz] of houseSearchOffsets) {
      const surface = terrainSurfaceAt(terrain, item.x + dx, item.z + dz);
      if (!surface || surface.normal.y < 0.72) continue;
      placement = { x: item.x + dx, z: item.z + dz, surface };
      break;
    }
    if (!placement) continue;
    settlement.add(createSettlementHouse(
      houseTemplate,
      placement.x,
      placement.surface.point.y,
      placement.z,
      item.yaw,
      item.scale,
    ));
  }

  const squareCenter = new THREE.Vector3(0, terrainHeightAt(terrain, 0, 4), 4);
  const well = new THREE.Group();
  well.position.copy(squareCenter);
  const wellRing = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.75, 12, 1, true), materials.stone);
  wellRing.position.y = 0.38;
  well.add(wellRing);
  const wellWater = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), new THREE.MeshStandardMaterial({ color: '#385f69', roughness: 0.55 }));
  wellWater.rotation.x = -Math.PI / 2;
  wellWater.position.y = 0.56;
  well.add(wellWater);
  settlement.add(well);

  const pathLines = [
    [[-6, 4], [-20, 1], [-32, -1]],
    [[5, 3], [12, 2], [18, 2]],
    [[4, 10], [7, 20], [9, 26]],
    [[-4, 11], [-9, 25], [-14, 40]],
    [[1, 12], [1, 27], [0, 42]],
  ];
  const pathStoneBatches = [[], [], []];
  const pathVariation = (index, salt) => {
    const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  let pathStoneIndex = 0;
  for (const line of pathLines) {
    const pathCurve = new THREE.CatmullRomCurve3(
      line.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      'centripetal',
    );
    const pieces = Math.max(3, Math.ceil(pathCurve.getLength() / 1.7));
    for (let i = 0; i < pieces; i += 1) {
      const stoneIndex = pathStoneIndex;
      pathStoneIndex += 1;
      if (pathVariation(stoneIndex, 1) < 0.12) continue;
      const t = THREE.MathUtils.clamp(
        (i + 0.5 + (pathVariation(stoneIndex, 2) - 0.5) * 0.42) / pieces,
        0.04,
        0.96,
      );
      const point = pathCurve.getPoint(t);
      const tangent = pathCurve.getTangent(t);
      const lateralOffset = (pathVariation(stoneIndex, 3) - 0.5) * 0.72;
      const x = point.x - tangent.z * lateralOffset;
      const z = point.z + tangent.x * lateralOffset;
      if (x < -35 || x > 26 || z < -16 || z > 31) continue;
      if (Math.hypot(x - 10, z - 33.5) < 13) continue;
      const surface = terrainSurfaceAt(terrain, x, z);
      if (!surface || surface.normal.y < 0.72) continue;
      const variant = stoneIndex % pathStoneBatches.length;
      pathStoneBatches[variant].push({
        x,
        y: surface.point.y + 0.035,
        z,
        yaw: Math.atan2(tangent.x, tangent.z) + (pathVariation(stoneIndex, 4) - 0.5) * 0.48,
        scaleX: 0.82 + pathVariation(stoneIndex, 5) * 0.42,
        scaleY: 0.72 + pathVariation(stoneIndex, 6) * 0.34,
        scaleZ: 0.58 + pathVariation(stoneIndex, 7) * 0.38,
      });
    }
  }
  const pathStoneGeometries = [
    new THREE.CylinderGeometry(0.72, 0.78, 0.14, 6),
    new THREE.CylinderGeometry(0.68, 0.76, 0.12, 7),
    new THREE.CylinderGeometry(0.76, 0.7, 0.16, 8),
  ];
  const pathStoneMaterials = ['#756c60', '#82735f', '#665f58'].map((color) => (
    new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 })
  ));
  const pathDummy = new THREE.Object3D();
  pathStoneBatches.forEach((batch, variant) => {
    const pathMesh = new THREE.InstancedMesh(
      pathStoneGeometries[variant],
      pathStoneMaterials[variant],
      batch.length,
    );
    pathMesh.name = `CentralIrregularStonePath_${variant}`;
    batch.forEach((item, index) => {
      pathDummy.position.set(item.x, item.y, item.z);
      pathDummy.rotation.set(0, item.yaw, 0);
      pathDummy.scale.set(item.scaleX, item.scaleY, item.scaleZ);
      pathDummy.updateMatrix();
      pathMesh.setMatrixAt(index, pathDummy.matrix);
    });
    pathMesh.instanceMatrix.needsUpdate = true;
    pathMesh.receiveShadow = true;
    pathMesh.frustumCulled = true;
    settlement.add(pathMesh);
  });
  const pathStoneCount = pathStoneBatches.reduce((total, batch) => total + batch.length, 0);

  const supportedCoast = [];
  for (let z = 34; z <= 68; z += 1) {
    const surface = terrainSurfaceAt(terrain, 0, z);
    if (surface && surface.point.y > oceanY + 1.3) supportedCoast.push({ z, surface });
  }
  const coastZ = supportedCoast.at(-1)?.z ?? 44;
  const warehouseSurface = terrainSurfaceAt(terrain, -12, coastZ - 12);
  if (warehouseSurface?.normal.y > 0.68) {
    const warehouse = createSettlementHouse(houseTemplate, -12, warehouseSurface.point.y, coastZ - 12, 0.18, 0.9);
    settlement.add(warehouse);
  }
  const rackSurface = terrainSurfaceAt(terrain, 5, coastZ - 3);
  if (rackSurface) {
    const rack = new THREE.Group();
    rack.position.set(5, rackSurface.point.y, coastZ - 3);
    for (const x of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), materials.darkWood);
      post.position.set(x, 0.95, 0);
      rack.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 0.14), materials.darkWood);
    beam.position.y = 1.8;
    rack.add(beam);
    settlement.add(rack);
  }

  const stakeTransforms = [];
  for (const [ax, az, bx, bz] of [[-1, -29, -7, -27], [7, -29, 12, -26]]) {
    for (let i = 0; i < 5; i += 1) {
      const t = i / 4;
      const x = THREE.MathUtils.lerp(ax, bx, t);
      const z = THREE.MathUtils.lerp(az, bz, t);
      const surface = terrainSurfaceAt(terrain, x, z);
      if (!surface || surface.normal.y < 0.62) continue;
      stakeTransforms.push({ x, y: surface.point.y + 1, z });
    }
  }
  const stakes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 2.2, 6), materials.darkWood, stakeTransforms.length);
  stakeTransforms.forEach((item, index) => {
    pathDummy.position.set(item.x, item.y, item.z);
    pathDummy.rotation.set(0, 0, 0);
    pathDummy.updateMatrix();
    stakes.setMatrixAt(index, pathDummy.matrix);
  });
  stakes.instanceMatrix.needsUpdate = true;
  settlement.add(stakes);

  console.info('[Tamarind] Camada medieval leve criada.', {
    houses: houses.length,
    houseMeshes: houseSource.children.length,
    pathInstances: pathStoneCount,
    palisadeStakes: stakeTransforms.length,
  });
  return settlement;
}

function findBackgroundCastleSite(terrain) {
  let best = null;
  for (let z = -48; z <= -32; z += 4) {
    for (let x = -4; x <= 28; x += 4) {
      const center = terrainSurfaceAt(terrain, x, z);
      if (!center || center.normal.y < 0.66 || center.point.y < 5) continue;
      const supportOffsets = [[-6, -3.5], [6, -3.5], [-6, 3.5], [6, 3.5], [0, 0]];
      const supports = supportOffsets
        .map(([dx, dz]) => terrainSurfaceAt(terrain, x + dx, z + dz))
        .filter(Boolean);
      if (supports.length < supportOffsets.length) continue;
      const heights = supports.map((surface) => surface.point.y);
      const heightRange = Math.max(...heights) - Math.min(...heights);
      const minimumNormal = Math.min(...supports.map((surface) => surface.normal.y));
      if (heightRange > 5.2 || minimumNormal < 0.5) continue;
      const score = center.point.y * 0.64 + (-z) * 0.22 - Math.abs(x - 10) * 0.08 - heightRange * 0.45;
      if (!best || score > best.score) {
        best = { x, z, y: heights.sort((a, b) => a - b)[1], score };
      }
    }
  }
  if (best) return best;
  const fallback = terrainSurfaceAt(terrain, 10, -38);
  return { x: 10, z: -38, y: fallback?.point.y ?? terrainHeightAt(terrain, 10, -38), score: 0 };
}

async function loadBackgroundCastle(terrain) {
  const site = findBackgroundCastleSite(terrain);
  const source = (await loadGlbOnce(BACKGROUND_CASTLE_URL, 'castelo de fundo')).scene;
  source.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const targetWidth = 20;
  const uniformScale = targetWidth / Math.max(size.x, size.z, 0.0001);
  const yaw = 0.06;
  const halfBaseX = size.x * uniformScale * 0.42;
  const halfBaseZ = size.z * uniformScale * 0.42;
  const baseOffsets = [
    [0, 0],
    [-halfBaseX, 0], [halfBaseX, 0],
    [0, -halfBaseZ], [0, halfBaseZ],
    [-halfBaseX, -halfBaseZ], [halfBaseX, -halfBaseZ],
    [-halfBaseX, halfBaseZ], [halfBaseX, halfBaseZ],
  ];
  const footprintSamples = baseOffsets.map(([x, z]) => {
    const offset = new THREE.Vector3(x, 0, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    return terrainSurfaceAt(terrain, site.x + offset.x, site.z + offset.z);
  }).filter(Boolean);
  const supportHeights = footprintSamples.map((surface) => surface.point.y).sort((a, b) => a - b);
  const supportIndex = Math.min(supportHeights.length - 1, Math.floor(supportHeights.length * 0.65));
  const supportY = supportHeights[supportIndex] ?? site.y;

  const scaledCenter = center.clone().multiplyScalar(uniformScale);
  scaledCenter.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);

  const castle = new THREE.Group();
  castle.name = 'DistantHillCastleGLB';
  castle.scale.setScalar(uniformScale);
  castle.rotation.y = yaw;
  castle.position.set(
    site.x - scaledCenter.x,
    supportY - bounds.min.y * uniformScale - 0.22,
    site.z - scaledCenter.z,
  );
  castle.add(source);

  source.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });

  const treePlacements = [
    [-10.5, -1.5, 0.45, 0.72], [9.5, -2.8, 2.2, 0.8], [-8.5, 6.2, 4.5, 0.66],
    [10.8, 6.8, 1.25, 0.75], [-12.5, 9.5, 3.4, 0.62], [12.8, 10.5, 5.2, 0.7],
    [2.5, -9.5, 0.1, 0.68],
  ].map(([dx, dz, treeYaw, treeScale]) => ({
    x: site.x + dx,
    z: site.z + dz,
    yaw: treeYaw,
    scale: treeScale,
    optional: true,
  }));

  console.info('[Tamarind] Castelo GLB de fundo carregado.', {
    site,
    position: castle.position.toArray(),
    rotationY: yaw,
    scale: uniformScale,
    supportHeights,
  });
  return { castle, treePlacements };
}

function createWindmillModel() {
  const mill = new THREE.Group();
  mill.name = 'MedievalWindmillModel';
  const stone = new THREE.MeshStandardMaterial({ color: '#867970', roughness: 0.96 });
  const timber = new THREE.MeshStandardMaterial({ color: '#5a3827', roughness: 0.94 });
  const darkTimber = new THREE.MeshStandardMaterial({ color: '#38241d', roughness: 0.96 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: '#754234', roughness: 0.9 });
  const sailMaterial = new THREE.MeshStandardMaterial({
    color: '#d2c2a5',
    roughness: 0.92,
    side: THREE.DoubleSide,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.75, 3.25, 10), stone);
  base.position.y = 1.62;
  mill.add(base);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.35, 2.4, 10), timber);
  upper.position.y = 4.42;
  mill.add(upper);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.22, 12), darkTimber);
  gallery.position.y = 3.25;
  mill.add(gallery);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.55, 10), roofMaterial);
  roof.position.y = 6.38;
  mill.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.35, 0.13), darkTimber);
  door.position.set(0, 0.92, 1.42);
  mill.add(door);
  const window = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.12), darkTimber);
  window.position.set(0, 4.45, 1.16);
  mill.add(window);

  const sails = new THREE.Group();
  sails.name = 'WindmillSails';
  sails.position.set(0, 5.22, 1.42);
  for (let index = 0; index < 4; index += 1) {
    const arm = new THREE.Group();
    arm.rotation.z = index * Math.PI * 0.5 + Math.PI * 0.25;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 3.6, 0.13), darkTimber);
    spar.position.y = 1.8;
    arm.add(spar);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.5, 0.08), sailMaterial);
    blade.position.set(0.28, 2.35, 0.02);
    arm.add(blade);
    sails.add(arm);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.42, 10), darkTimber);
  hub.rotation.x = Math.PI / 2;
  sails.add(hub);
  mill.add(sails);

  mill.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return mill;
}

function createWindmillPair(terrain) {
  const windmills = new THREE.Group();
  windmills.name = 'HighlandWindmillPair';
  const model = createWindmillModel();
  const requested = [
    { x: -30, z: -28, yaw: 0.18, scale: 0.88 },
    { x: -18, z: -30, yaw: 0.08, scale: 0.88 },
  ];
  const offsets = [
    [0, 0], [2, 0], [-2, 0], [0, 2], [0, -2],
    [3, 3], [-3, 3], [3, -3], [-3, -3],
  ];

  for (const item of requested) {
    let placement = null;
    for (const [dx, dz] of offsets) {
      const surface = terrainSurfaceAt(terrain, item.x + dx, item.z + dz);
      if (!surface || surface.normal.y < 0.68) continue;
      placement = { x: item.x + dx, z: item.z + dz, surface };
      break;
    }
    if (!placement) continue;
    const instance = model.clone(true);
    instance.position.set(placement.x, placement.surface.point.y - 0.12, placement.z);
    instance.rotation.y = item.yaw;
    instance.scale.setScalar(item.scale);
    windmills.add(instance);
  }

  console.info('[Tamarind] Par de moinhos criado.', { instances: windmills.children.length });
  return windmills;
}

function createProceduralMillPond(terrain) {
  const pond = new THREE.Group();
  pond.name = 'ProceduralMillPond';
  const center = new THREE.Vector2(-24, -17);
  const yaw = -0.22;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const contour = [
    [-12.8, -1.0], [-11.4, -3.8], [-8.6, -5.8], [-5.2, -6.4],
    [-2.7, -5.6], [-0.2, -7.0], [3.0, -6.2], [4.8, -4.4],
    [8.8, -4.0], [11.5, -1.8], [12.2, 0.8], [9.0, 2.1],
    [10.5, 4.3], [6.8, 5.8], [3.6, 5.0], [1.8, 7.3],
    [-1.8, 6.6], [-3.8, 4.8], [-7.6, 5.7], [-10.8, 3.8],
    [-9.4, 1.8], [-12.4, 1.0],
  ];
  const worldPoint = ([localX, localZ], factor = 1) => ({
    x: center.x + localX * factor * cosYaw + localZ * factor * sinYaw,
    z: center.y - localX * factor * sinYaw + localZ * factor * cosYaw,
  });
  const createFanGeometry = (factor, lift) => {
    const positions = [center.x, terrainHeightAt(terrain, center.x, center.y) + lift, center.y];
    const indices = [];
    contour.forEach((point) => {
      const world = worldPoint(point, factor);
      positions.push(world.x, terrainHeightAt(terrain, world.x, world.z) + lift, world.z);
    });
    for (let index = 0; index < contour.length; index += 1) {
      indices.push(0, index + 1, ((index + 1) % contour.length) + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };

  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: '#3d7b70',
    roughness: 0.64,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.72,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  waterMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uPondTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPondTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += (
          sin(position.x * 1.35 + uPondTime * 0.48)
          + cos(position.z * 1.12 - uPondTime * 0.37)
        ) * 0.014;`);
    waterMaterial.userData.shader = shader;
  };
  const water = new THREE.Mesh(createFanGeometry(0.95, 0.052), waterMaterial);
  water.name = 'MillPondShallowWater';
  water.renderOrder = 2;
  pond.add(water);

  const deepWater = new THREE.Mesh(
    createFanGeometry(0.61, 0.061),
    new THREE.MeshStandardMaterial({
      color: '#173f46',
      roughness: 0.76,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  deepWater.name = 'MillPondDeepCenter';
  deepWater.renderOrder = 3;
  pond.add(deepWater);

  const marginPositions = [];
  const marginIndices = [];
  contour.forEach((point, index) => {
    const widthVariation = 0.05 + ((index * 5) % 7) * 0.018;
    for (const factor of [0.9 - widthVariation * 0.28, 1.14 + widthVariation]) {
      const world = worldPoint(point, factor);
      marginPositions.push(world.x, terrainHeightAt(terrain, world.x, world.z) + 0.022, world.z);
    }
  });
  for (let index = 0; index < contour.length; index += 1) {
    const next = (index + 1) % contour.length;
    const inner = index * 2;
    const outer = inner + 1;
    const nextInner = next * 2;
    const nextOuter = nextInner + 1;
    marginIndices.push(inner, outer, nextInner, nextInner, outer, nextOuter);
  }
  const marginGeometry = new THREE.BufferGeometry();
  marginGeometry.setAttribute('position', new THREE.Float32BufferAttribute(marginPositions, 3));
  marginGeometry.setIndex(marginIndices);
  marginGeometry.computeVertexNormals();
  const margin = new THREE.Mesh(
    marginGeometry,
    new THREE.MeshStandardMaterial({
      color: '#3f382d',
      roughness: 1,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  margin.name = 'MillPondWetMargin';
  margin.renderOrder = 1;
  pond.add(margin);

  const detailDummy = new THREE.Object3D();
  const mudPatchCount = 22;
  const mudPatches = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.82, 9),
    new THREE.MeshStandardMaterial({
      color: '#342f27',
      roughness: 1,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    mudPatchCount,
  );
  mudPatches.name = 'MillPondIrregularMudPatches';
  for (let index = 0; index < mudPatchCount; index += 1) {
    const contourIndex = (index * 7 + 3) % contour.length;
    const nextIndex = (contourIndex + 1) % contour.length;
    const mix = ((index * 37) % 100) / 100;
    const localPoint = [
      THREE.MathUtils.lerp(contour[contourIndex][0], contour[nextIndex][0], mix),
      THREE.MathUtils.lerp(contour[contourIndex][1], contour[nextIndex][1], mix),
    ];
    const world = worldPoint(localPoint, 1.01 + (index % 5) * 0.035);
    detailDummy.position.set(world.x, terrainHeightAt(terrain, world.x, world.z) + 0.026, world.z);
    detailDummy.rotation.set(-Math.PI / 2, 0, index * 1.91);
    detailDummy.scale.set(0.8 + (index % 6) * 0.22, 0.7 + (index % 4) * 0.13, 1);
    detailDummy.updateMatrix();
    mudPatches.setMatrixAt(index, detailDummy.matrix);
  }
  mudPatches.instanceMatrix.needsUpdate = true;
  mudPatches.renderOrder = 1;
  pond.add(mudPatches);

  const islandPoints = [
    [-3.8, -0.9, 1.5, 0.85],
    [3.3, 1.8, 1.15, 0.7],
    [6.5, -1.5, 0.82, 0.56],
    [-7.2, 2.0, 0.92, 0.62],
  ];
  const dryIslands = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1.08, 0.12, 9),
    new THREE.MeshStandardMaterial({ color: '#57503a', roughness: 1 }),
    islandPoints.length,
  );
  dryIslands.name = 'MillPondDryIslands';
  islandPoints.forEach(([localX, localZ, scaleX, scaleZ], index) => {
    const world = worldPoint([localX, localZ]);
    detailDummy.position.set(world.x, terrainHeightAt(terrain, world.x, world.z) + 0.07, world.z);
    detailDummy.rotation.set(0, index * 1.37, 0);
    detailDummy.scale.set(scaleX, 1, scaleZ);
    detailDummy.updateMatrix();
    dryIslands.setMatrixAt(index, detailDummy.matrix);
  });
  dryIslands.instanceMatrix.needsUpdate = true;
  dryIslands.receiveShadow = true;
  pond.add(dryIslands);

  const reedCount = 156;
  const reedGeometry = new THREE.CylinderGeometry(0.035, 0.055, 1, 5);
  const reedMaterial = new THREE.MeshStandardMaterial({ color: '#58663b', roughness: 1 });
  const reeds = new THREE.InstancedMesh(reedGeometry, reedMaterial, reedCount);
  reeds.name = 'MillPondReeds';
  const reedDummy = new THREE.Object3D();
  for (let index = 0; index < reedCount; index += 1) {
    const cluster = Math.floor(index / 6);
    const contourIndex = (cluster * 5 + (index % 3)) % contour.length;
    const nextIndex = (contourIndex + 1) % contour.length;
    const mix = (index * 0.381966) % 1;
    const localPoint = [
      THREE.MathUtils.lerp(contour[contourIndex][0], contour[nextIndex][0], mix),
      THREE.MathUtils.lerp(contour[contourIndex][1], contour[nextIndex][1], mix),
    ];
    const factor = 0.87 + ((cluster * 7 + index) % 15) * 0.022;
    const world = worldPoint(localPoint, factor);
    const height = 0.52 + ((index * 11) % 10) * 0.07;
    reedDummy.position.set(
      world.x + Math.sin(index * 2.31) * (0.28 + (index % 4) * 0.11),
      terrainHeightAt(terrain, world.x, world.z) + height * 0.46,
      world.z + Math.cos(index * 1.77) * (0.25 + (index % 5) * 0.09),
    );
    reedDummy.rotation.set(Math.sin(index) * 0.05, index * 1.43, Math.cos(index * 0.7) * 0.045);
    reedDummy.scale.set(0.82 + (index % 3) * 0.11, height, 0.82 + ((index + 1) % 3) * 0.1);
    reedDummy.updateMatrix();
    reeds.setMatrixAt(index, reedDummy.matrix);
  }
  reeds.instanceMatrix.needsUpdate = true;
  reeds.castShadow = false;
  reeds.receiveShadow = true;
  pond.add(reeds);

  const grassCount = 78;
  const marshGrass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.16, 0.72, 5),
    new THREE.MeshStandardMaterial({ color: '#46553a', roughness: 1 }),
    grassCount,
  );
  marshGrass.name = 'MillPondLowGrass';
  for (let index = 0; index < grassCount; index += 1) {
    const contourIndex = (Math.floor(index / 4) * 5 + index) % contour.length;
    const nextIndex = (contourIndex + 1) % contour.length;
    const mix = ((index * 29) % 100) / 100;
    const localPoint = [
      THREE.MathUtils.lerp(contour[contourIndex][0], contour[nextIndex][0], mix),
      THREE.MathUtils.lerp(contour[contourIndex][1], contour[nextIndex][1], mix),
    ];
    const world = worldPoint(localPoint, 1.02 + (index % 7) * 0.025);
    const height = 0.38 + (index % 6) * 0.08;
    detailDummy.position.set(
      world.x + Math.sin(index * 1.7) * 0.34,
      terrainHeightAt(terrain, world.x, world.z) + height * 0.47,
      world.z + Math.cos(index * 2.1) * 0.3,
    );
    detailDummy.rotation.set(Math.sin(index) * 0.08, index * 1.13, Math.cos(index) * 0.07);
    detailDummy.scale.set(0.72 + (index % 4) * 0.12, height, 0.72 + ((index + 2) % 4) * 0.1);
    detailDummy.updateMatrix();
    marshGrass.setMatrixAt(index, detailDummy.matrix);
  }
  marshGrass.instanceMatrix.needsUpdate = true;
  marshGrass.castShadow = false;
  marshGrass.receiveShadow = true;
  pond.add(marshGrass);

  const stoneCount = 54;
  const stones = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.32, 0),
    new THREE.MeshStandardMaterial({ color: '#524e45', roughness: 1 }),
    stoneCount,
  );
  stones.name = 'MillPondMarginStones';
  for (let index = 0; index < stoneCount; index += 1) {
    const contourIndex = (index * 5 + 2) % contour.length;
    const factor = 1.01 + ((index * 3) % 7) * 0.022;
    const world = worldPoint(contour[contourIndex], factor);
    reedDummy.position.set(world.x, terrainHeightAt(terrain, world.x, world.z) + 0.12, world.z);
    reedDummy.rotation.set(index * 0.17, index * 1.21, index * 0.09);
    reedDummy.scale.set(0.75 + (index % 4) * 0.13, 0.45 + (index % 3) * 0.1, 0.8 + ((index + 2) % 4) * 0.11);
    reedDummy.updateMatrix();
    stones.setMatrixAt(index, reedDummy.matrix);
  }
  stones.instanceMatrix.needsUpdate = true;
  stones.castShadow = false;
  stones.receiveShadow = true;
  pond.add(stones);

  const leafCount = 36;
  const floatingLeaves = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.24, 8),
    new THREE.MeshStandardMaterial({ color: '#4d693f', roughness: 0.9, side: THREE.DoubleSide }),
    leafCount,
  );
  floatingLeaves.name = 'MillPondFloatingLeaves';
  for (let index = 0; index < leafCount; index += 1) {
    const point = contour[(index * 3) % contour.length];
    const factor = 0.18 + ((index * 5) % 13) * 0.052;
    const world = worldPoint(point, factor);
    reedDummy.position.set(world.x, terrainHeightAt(terrain, world.x, world.z) + 0.078, world.z);
    reedDummy.rotation.set(-Math.PI / 2, 0, index * 1.17);
    reedDummy.scale.setScalar(0.7 + (index % 5) * 0.12);
    reedDummy.updateMatrix();
    floatingLeaves.setMatrixAt(index, reedDummy.matrix);
  }
  floatingLeaves.instanceMatrix.needsUpdate = true;
  floatingLeaves.castShadow = false;
  floatingLeaves.receiveShadow = true;
  pond.add(floatingLeaves);

  const branchCount = 13;
  const branches = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.055, 0.075, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: '#49382b', roughness: 1 }),
    branchCount,
  );
  branches.name = 'MillPondDriftwood';
  for (let index = 0; index < branchCount; index += 1) {
    const point = contour[(index * 4 + 1) % contour.length];
    const world = worldPoint(point, 0.5 + (index % 7) * 0.065);
    reedDummy.position.set(world.x, terrainHeightAt(terrain, world.x, world.z) + 0.09, world.z);
    reedDummy.rotation.set(0, index * 1.31, Math.PI / 2 + Math.sin(index) * 0.08);
    reedDummy.scale.set(0.7 + index * 0.08, 0.72 + (index % 2) * 0.22, 0.7);
    reedDummy.updateMatrix();
    branches.setMatrixAt(index, reedDummy.matrix);
  }
  branches.instanceMatrix.needsUpdate = true;
  branches.castShadow = false;
  branches.receiveShadow = true;
  pond.add(branches);

  pond.userData.update = (elapsed) => {
    waterMaterial.opacity = 0.81 + Math.sin(elapsed * 0.42) * 0.018;
    const shader = waterMaterial.userData.shader;
    if (shader?.uniforms?.uPondTime) shader.uniforms.uPondTime.value = elapsed;
  };
  console.info('[Tamarind] Brejo procedural leve criado.', {
    center: center.toArray(),
    waterTriangles: contour.length * 2,
    marginTriangles: contour.length * 2,
    reedInstances: reedCount,
    lowGrassInstances: grassCount,
    stoneInstances: stoneCount,
    floatingLeaves: leafCount,
    driftwood: branchCount,
    mudPatches: mudPatchCount,
    dryIslands: islandPoints.length,
  });
  return pond;
}

export async function createWorld3d() {
  getMetrics().sceneCreationStartedMs = performance.now() - getMetrics().startedAt;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aebdca');
  scene.fog = new THREE.Fog('#aebdca', 155, 285);

  const world = new THREE.Group();
  world.name = 'TamarindTerrainEvaluationWorld';
  scene.add(world);

  scene.add(new THREE.HemisphereLight('#9aa9c9', '#3c3044', 0.58));
  const key = new THREE.DirectionalLight('#ffd0a0', 2.85);
  key.name = 'NeutralTerrainKey';
  key.position.set(-70, 95, 65);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -78;
  key.shadow.camera.right = 78;
  key.shadow.camera.top = 72;
  key.shadow.camera.bottom = -72;
  key.shadow.camera.near = 18;
  key.shadow.camera.far = 205;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.22;
  scene.add(key);

  const coolFill = new THREE.DirectionalLight('#7184c7', 0.42);
  coolFill.name = 'CoolEnvironmentFill';
  coolFill.position.set(65, 42, -55);
  coolFill.castShadow = false;
  scene.add(coolFill);

  const { terrainGroup, worldBounds, worldSize } = await loadMasterTerrain();
  world.add(terrainGroup);
  const landmarks = {};

  const oceanMaterial = new THREE.MeshPhysicalMaterial({
    color: '#397f9c',
    roughness: 0.3,
    metalness: 0.04,
    clearcoat: 0.42,
    clearcoatRoughness: 0.24,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  oceanMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWaterTime;\nvarying vec2 vWaterUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWaterUv = uv;
        float waveA = sin(position.x * 0.075 + uWaterTime * 0.55) * 0.11;
        float waveB = cos(position.y * 0.09 - uWaterTime * 0.42) * 0.08;
        transformed.z += waveA + waveB;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWaterTime;\nvarying vec2 vWaterUv;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 waterRipple = vec2(
          sin(vWaterUv.x * 110.0 + uWaterTime * 0.9),
          cos(vWaterUv.y * 95.0 - uWaterTime * 0.72)
        ) * 0.055;
        normal = normalize(normal + vec3(waterRipple, 0.0));`);
    oceanMaterial.userData.shader = shader;
  };
  const ocean = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(worldSize.x, worldSize.z) * 1.75, 96),
    oceanMaterial,
  );
  ocean.name = 'TamarindOcean';
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = worldBounds.min.y - 1.1;
  ocean.receiveShadow = true;
  world.add(ocean);

  let secondaryLoadPromise = null;
  const startSecondaryLoad = ({ onAssetLoaded, onPhaseComplete } = {}) => {
    if (secondaryLoadPromise) return secondaryLoadPromise;

    secondaryLoadPromise = (async () => {
      const notify = (key, object) => onAssetLoaded?.({ key, object, landmarks });
      const addWorldAsset = (key, object) => {
        world.add(object);
        notify(key, object);
        return object;
      };

      const samplerStartedAt = performance.now();
      terrainGroup.userData.surfaceSampler = await runWhenIdle(() => (
        createTerrainSurfaceSampler(terrainGroup)
      ));
      getMetrics().terrainSamplerReadyMs = performance.now() - getMetrics().startedAt;
      getMetrics().terrainSamplerBuildMs = performance.now() - samplerStartedAt;
      console.info('[Tamarind] Índice espacial do terreno pronto.', {
        buildMs: Math.round(getMetrics().terrainSamplerBuildMs),
        triangles: terrainGroup.userData.surfaceSampler.triangleCount,
        buckets: terrainGroup.userData.surfaceSampler.bucketCount,
      });

      console.time('[Tamarind] fase 2 — landmarks principais');
      // Start only the three landmark downloads together. Parsing remains
      // incremental so large GLBs cannot monopolize the main thread at once.
      primeGlbDownload(TECNOMAGO_HOUSE_URL, 'Casa do Tecnomago', 'landmarks');
      primeGlbDownload(APPS_BASILICA_URL, 'Basílica Apps', 'landmarks');
      primeGlbDownload(ARCHITECTURE_HOUSE_URL, 'Coliseu 3D/Arquitetura', 'landmarks');
      const tecnomagoHouse = await runWhenIdle(() => loadTecnomagoHouse(terrainGroup));
      landmarks.tecnomago = tecnomagoHouse;
      addWorldAsset('tecnomago', tecnomagoHouse);
      if (tecnomagoHouse.userData.entranceAccess) {
        world.add(tecnomagoHouse.userData.entranceAccess);
      }

      const appsBasilica = await runWhenIdle(() => loadAppsBasilica(terrainGroup));
      landmarks.apps = appsBasilica;
      addWorldAsset('apps', appsBasilica);

      const architectureHouse = await runWhenIdle(() => loadArchitectureHouse(terrainGroup));
      landmarks.architecture = architectureHouse;
      addWorldAsset('architecture', architectureHouse);
      console.timeEnd('[Tamarind] fase 2 — landmarks principais');
      getMetrics().landmarksReadyMs = performance.now() - getMetrics().startedAt;
      onPhaseComplete?.('landmarks', getMetrics().landmarksReadyMs);

      console.time('[Tamarind] fase 3 — mundo habitado');
      // Network work overlaps inside this phase while each parse/integration is
      // yielded separately. Later phases never block the first rendered frame.
      primeGlbDownload(TEMPLE_URL, 'templo oriental', 'inhabited');
      primeGlbDownload(BACKGROUND_CASTLE_URL, 'castelo ao fundo', 'inhabited');
      primeGlbDownload(SETTLEMENT_HOUSE_URL, 'casas da vila', 'inhabited');
      primeGlbDownload(TREE_URL, 'árvores', 'inhabited');
      primeGlbDownload(RIGGED_GOAT_URL, 'bode', 'inhabited');
      primeGlbDownload(WIZARD_NPC_URL, 'mago NPC', 'inhabited');
      const pagoda = await runWhenIdle(() => loadOrientalPagoda(terrainGroup));
      addWorldAsset('pagoda', pagoda);

      const castleResult = await runWhenIdle(() => loadBackgroundCastle(terrainGroup));
      const backgroundCastle = addWorldAsset('castle', castleResult.castle);

      const settlement = await runWhenIdle(() => createMedievalSettlement(terrainGroup, ocean.position.y));
      addWorldAsset('settlement', settlement);

      const vegetation = await runWhenIdle(() => (
        loadInstancedTrees(terrainGroup, castleResult.treePlacements)
      ));
      addWorldAsset('vegetation', vegetation);

      const windmills = await runWhenIdle(() => createWindmillPair(terrainGroup));
      addWorldAsset('windmills', windmills);

      const millPond = await runWhenIdle(() => createProceduralMillPond(terrainGroup));
      addWorldAsset('millPond', millPond);

      const goatAvoidObjects = [
        tecnomagoHouse,
        architectureHouse,
        appsBasilica,
        pagoda,
        backgroundCastle,
        millPond,
      ];
      settlement.traverse((object) => {
        if (object.name === 'DetailedSettlementHouse') goatAvoidObjects.push(object);
      });
      windmills.traverse((object) => {
        if (object.name === 'MedievalWindmillModel') goatAvoidObjects.push(object);
      });
      const goatResult = await runWhenIdle(() => loadRiggedGoat(terrainGroup, {
        treePlacements: vegetation.userData.placements,
        avoidObjects: goatAvoidObjects,
      }));
      addWorldAsset('goat', goatResult.goat);
      const wizardResult = await runWhenIdle(() => loadWizardNpc(terrainGroup, tecnomagoHouse));
      addWorldAsset('wizard', wizardResult.wizard);
      console.timeEnd('[Tamarind] fase 3 — mundo habitado');
      getMetrics().inhabitedReadyMs = performance.now() - getMetrics().startedAt;
      onPhaseComplete?.('inhabited', getMetrics().inhabitedReadyMs);

      console.time('[Tamarind] fase 4 — acabamento costeiro');
      const harbor = await runWhenIdle(() => createHarbor(terrainGroup, ocean.position.y));
      addWorldAsset('harbor', harbor);
      const coast = await runWhenIdle(() => (
        createCoastalTransition(terrainGroup, worldBounds, ocean.position.y)
      ));
      addWorldAsset('coast', coast);
      console.timeEnd('[Tamarind] fase 4 — acabamento costeiro');
      getMetrics().decorReadyMs = performance.now() - getMetrics().startedAt;
      onPhaseComplete?.('decor', getMetrics().decorReadyMs);

      return {
        harbor,
        coast,
        millPond,
        windmills,
        settlement,
        vegetation,
        goat: goatResult.goat,
        updateGoatWalk: goatResult.updateGoatWalk,
        wizard: wizardResult.wizard,
        updateWizardNpc: wizardResult.updateWizardNpc,
        landmarks,
      };
    })();

    return secondaryLoadPromise;
  };

  return {
    scene,
    world,
    bear: null,
    water: ocean,
    coast: null,
    landmarks,
    startSecondaryLoad,
    cameraTarget: [0, worldSize.y * 0.2, 0],
    cameraPosition: [0, Math.max(82, worldSize.y * 3.8), 150],
  };
}
