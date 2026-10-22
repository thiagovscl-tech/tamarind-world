import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {};
const TARGET_HORIZONTAL_SIZE = 150;
const SEGMENTS = 112;

async function loadTerrain() {
  const input = await fs.readFile(path.resolve('public/artwork/models/ilha_texturizada.glb'));
  const arrayBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const previousWarn = console.warn;
  const previousError = console.error;
  console.warn = () => {};
  console.error = () => {};
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer, '', resolve, reject));
  console.warn = previousWarn;
  console.error = previousError;
  const source = gltf.scene;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = TARGET_HORIZONTAL_SIZE / Math.max(size.x, size.z);
  const terrain = new THREE.Group();
  terrain.scale.setScalar(scale);
  terrain.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  terrain.add(source);
  terrain.updateMatrixWorld(true);
  return terrain;
}

function surfaceAt(terrain, x, z) {
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
  return { point: hit.point.toArray(), normal: normal.toArray() };
}

function sampleOutline(terrain, center) {
  const radii = new Float32Array(SEGMENTS);
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
      const bin = Math.round((angle / tau) * SEGMENTS) % SEGMENTS;
      radii[bin] = Math.max(radii[bin], Math.hypot(dx, dz));
    }
  });
  for (let index = 0; index < SEGMENTS; index += 1) {
    if (radii[index] > 0) continue;
    for (let distance = 1; distance < SEGMENTS * 0.5; distance += 1) {
      const previous = radii[(index - distance + SEGMENTS) % SEGMENTS];
      const next = radii[(index + distance) % SEGMENTS];
      if (previous || next) {
        radii[index] = previous || next;
        break;
      }
    }
  }
  return Array.from(radii, (current, index) => {
    const previous = radii[(index - 1 + SEGMENTS) % SEGMENTS];
    const following = radii[(index + 1) % SEGMENTS];
    return Math.min(current, previous * 0.18 + current * 0.64 + following * 0.18);
  });
}

function terrainRibbonData(terrain, center, radii, offsets, predicate) {
  const samples = [];
  const tau = Math.PI * 2;
  for (let index = 0; index < radii.length; index += 1) {
    const angle = (index / radii.length) * tau;
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    const outer = surfaceAt(terrain, center[0] + directionX * (radii[index] - offsets.outer), center[2] + directionZ * (radii[index] - offsets.outer));
    const inner = surfaceAt(terrain, center[0] + directionX * (radii[index] - offsets.inner), center[2] + directionZ * (radii[index] - offsets.inner));
    const rise = outer && inner ? Math.abs(inner.point[1] - outer.point[1]) : Infinity;
    const slope = outer && inner ? Math.min(outer.normal[1], inner.normal[1]) : 0;
    samples.push({ outer, inner, allowed: Boolean(outer && inner && predicate(slope, rise)) });
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index < radii.length; index += 1) {
    const nextIndex = (index + 1) % radii.length;
    const current = samples[index];
    const next = samples[nextIndex];
    if (!current.allowed || !next.allowed) continue;
    const base = positions.length / 3;
    positions.push(
      current.outer.point[0], current.outer.point[1] + 0.055, current.outer.point[2],
      current.inner.point[0], current.inner.point[1] + 0.055, current.inner.point[2],
      next.outer.point[0], next.outer.point[1] + 0.055, next.outer.point[2],
      next.inner.point[0], next.inner.point[1] + 0.055, next.inner.point[2],
    );
    const u0 = index / radii.length;
    const u1 = (index + 1) / radii.length;
    uvs.push(u0, 0, u0, 1, u1, 0, u1, 1);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  return { positions, uvs, indices };
}

const terrain = await loadTerrain();
const worldBounds = new THREE.Box3().setFromObject(terrain);
const centerVector = worldBounds.getCenter(new THREE.Vector3());
const oceanY = worldBounds.min.y - 1.1;
centerVector.y = oceanY;
const center = centerVector.toArray();
const radii = sampleOutline(terrain, centerVector);
const foamInner = [];
const foamOuter = [];
const foamStrength = [];
const shallowInner = [];
const shallowOuter = [];

for (let index = 0; index < radii.length; index += 1) {
  const angle = (index / radii.length) * Math.PI * 2;
  const sampleRadius = radii[index] - 2.2;
  const surface = surfaceAt(
    terrain,
    center[0] + Math.cos(angle) * sampleRadius,
    center[2] + Math.sin(angle) * sampleRadius,
  );
  const slope = surface?.normal[1] ?? 0;
  if (slope > 0.72) {
    foamInner.push(-1.3); foamOuter.push(0.12); foamStrength.push(1);
    shallowInner.push(-1.25); shallowOuter.push(5.2);
  } else if (slope > 0.5) {
    foamInner.push(-0.85); foamOuter.push(0.05); foamStrength.push(0.48);
    shallowInner.push(-0.8); shallowOuter.push(3.55);
  } else {
    foamInner.push(-0.46); foamOuter.push(-0.03); foamStrength.push(0.14);
    shallowInner.push(-0.35); shallowOuter.push(1.35);
  }
  shallowOuter[index] += Math.sin(index * 1.73) * 0.22 + Math.sin(index * 0.47 + 1.2) * 0.16;
}

const output = {
  version: 1,
  center,
  oceanY,
  radii,
  foamInner,
  foamOuter,
  foamStrength,
  shallowInner,
  shallowOuter,
  beach: terrainRibbonData(terrain, center, radii, { outer: 1.05, inner: 3.5 }, (slope, rise) => slope > 0.72 && rise < 2.6),
  wetShore: terrainRibbonData(terrain, center, radii, { outer: 0.25, inner: 1.2 }, (slope, rise) => slope > 0.52 && rise < 3.8),
};

const outputDir = path.resolve('public/artwork/data');
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'coastline.web.json'), `${JSON.stringify(output)}\n`);
console.log(`[coast] coastline.web.json gerado (${radii.length} amostras).`);
