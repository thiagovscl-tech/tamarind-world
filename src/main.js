import * as THREE from 'three';
import './style.css';
import { createCamera3d, resizeCamera3d } from './scene3d/createCamera3d.js';
import { createRenderer } from './scene/createRenderer.js';
import { createWorld3d } from './scene3d/createWorld3d.js';
import { updateBearProcedural } from './scene3d/createBearCharacter3d.js';

console.time('[Tamarind] tempo até first render');
console.time('[Tamarind] tempo até mundo completo');
const tamarindMetrics = {
  startedAt: 0,
  scriptStartedMs: performance.now(),
  assets: [],
  longTasks: [],
};
window.__tamarindMetrics = tamarindMetrics;

const navigationEntry = performance.getEntriesByType('navigation')[0];
if (navigationEntry?.domContentLoadedEventEnd) {
  tamarindMetrics.domContentLoadedMs = navigationEntry.domContentLoadedEventEnd;
} else {
  window.addEventListener('DOMContentLoaded', () => {
    tamarindMetrics.domContentLoadedMs = performance.now();
  }, { once: true });
}
if ('PerformanceObserver' in window) {
  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        tamarindMetrics.longTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
      });
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    // Long Task API is optional; asset timings remain available everywhere.
  }
}

const container = document.querySelector('#scene');
const status = document.querySelector('#scene-status');
const navigationHint = document.querySelector('.navigation-hint');
const topNavigation = document.querySelector('.top-navigation');
const dayNightToggle = document.querySelector('#day-night-toggle');
const rendererStartedAt = performance.now();
const renderer = createRenderer(container);
tamarindMetrics.rendererCreatedMs = performance.now();
tamarindMetrics.rendererCreationMs = performance.now() - rendererStartedAt;
const camera = createCamera3d(container.clientWidth / container.clientHeight);
const pointer = new THREE.Vector2();
const easedPointer = new THREE.Vector2();
let orbitYaw = 0;
let dragging = false;
let dragX = 0;
let dragStartX = 0;
let dragStartY = 0;
let navigationHintDismissed = false;
let initialized = false;
let bear = null;
let activeScene = null;
let water = null;
let coast = null;
let millPond = null;
let landmarkTargets = null;
let dayNightController = null;
let nightTarget = 0;
let nightMix = 0;

const landmarkNavigation = document.querySelector('.landmark-navigation');
const landmarkLinks = Object.fromEntries(
  [...document.querySelectorAll('[data-landmark]')].map((link) => [link.dataset.landmark, link]),
);
const landmarkWorldPosition = new THREE.Vector3();
const landmarkScreenPosition = new THREE.Vector3();
const landmarkCameraDirection = new THREE.Vector3();
const landmarkCameraVector = new THREE.Vector3();

function createDayNightController(scene, activeRenderer, landmarks, activeWater) {
  const hemisphere = scene.children.find((object) => object.isHemisphereLight);
  const keyLight = scene.getObjectByName('NeutralTerrainKey');
  const fillLight = scene.getObjectByName('CoolEnvironmentFill');
  const day = {
    background: scene.background.clone(),
    fogColor: scene.fog.color.clone(),
    fogNear: scene.fog.near,
    fogFar: scene.fog.far,
    exposure: activeRenderer.toneMappingExposure,
    hemisphereSky: hemisphere?.color.clone(),
    hemisphereGround: hemisphere?.groundColor.clone(),
    hemisphereIntensity: hemisphere?.intensity ?? 0,
    keyColor: keyLight?.color.clone(),
    keyIntensity: keyLight?.intensity ?? 0,
    fillColor: fillLight?.color.clone(),
    fillIntensity: fillLight?.intensity ?? 0,
    waterColor: activeWater.material.color.clone(),
    waterRoughness: activeWater.material.roughness,
    waterClearcoat: activeWater.material.clearcoat,
    waterOpacity: activeWater.material.opacity,
  };
  const night = {
    background: new THREE.Color('#081526'),
    fogColor: new THREE.Color('#081526'),
    fogNear: 138,
    fogFar: 232,
    exposure: 0.96,
    hemisphereSky: new THREE.Color('#49659e'),
    hemisphereGround: new THREE.Color('#11162e'),
    hemisphereIntensity: 0.62,
    keyColor: new THREE.Color('#9bbcff'),
    keyIntensity: 1.82,
    fillColor: new THREE.Color('#6f8ed2'),
    fillIntensity: 0.78,
    waterColor: new THREE.Color('#0e3149'),
    waterRoughness: 0.34,
    waterClearcoat: 0.4,
    waterOpacity: 0.93,
  };

  const emissiveMaterials = [];
  const seenMaterials = new Set();
  const seenLightTargets = new Set();
  const localLights = [];
  const luminousName = /window|glass|lamp|light|emissive|lantern/i;
  const belongsTo = (object, root) => {
    let current = object;
    while (current) {
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  };
  const refresh = () => {
    scene.traverse((object) => {
      if (!object.isMesh) return;
      const isArchitectureMesh = belongsTo(object, landmarks.architecture);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.emissive || seenMaterials.has(material)) continue;
        const label = `${material.name || ''} ${object.name || ''}`;
        const emissiveEnergy = Math.max(material.emissive.r, material.emissive.g, material.emissive.b)
          * material.emissiveIntensity;
        if (emissiveEnergy <= 0.01 && !luminousName.test(label)) continue;
        seenMaterials.add(material);
        emissiveMaterials.push({
          material,
          dayColor: material.emissive.clone(),
          dayIntensity: material.emissiveIntensity,
          nightColor: new THREE.Color(isArchitectureMesh ? '#8b5438' : '#ff9a45'),
          nightIntensity: isArchitectureMesh
            ? Math.min(0.12, material.emissiveIntensity * 0.12)
            : Math.max(1.85, material.emissiveIntensity * 2.4),
        });
      }
    });

    const localLightTargets = [
      ['tecnomago', landmarks.tecnomago],
      ['apps', landmarks.apps],
      ['architecture', landmarks.architecture],
      ['pagoda', scene.getObjectByName('OrientalPagoda')],
      ['castle', scene.getObjectByName('DistantHillCastleGLB')],
    ].filter(([, object]) => Boolean(object));
    for (const [key, landmark] of localLightTargets) {
      if (seenLightTargets.has(landmark)) continue;
      seenLightTargets.add(landmark);
      const bounds = new THREE.Box3().setFromObject(landmark);
      const size = bounds.getSize(new THREE.Vector3());
      const position = bounds.getCenter(new THREE.Vector3());
      const isArchitecture = key === 'architecture';
      position.y = THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, isArchitecture ? 0.34 : 0.52);
      position.z = bounds.max.z + THREE.MathUtils.clamp(size.z * 0.04, 0.4, 1);
      const index = localLights.length;
      const light = new THREE.PointLight(
        isArchitecture ? '#ffd0a3' : index === 0 ? '#ff9a55' : '#ffb35c',
        0,
        isArchitecture ? 9 : 18,
        isArchitecture ? 2.25 : 2,
      );
      light.name = `NightLandmarkFill_${index}`;
      light.position.copy(position);
      light.castShadow = false;
      light.userData.nightIntensity = isArchitecture ? 9 : index < 3 ? 56 : 27;
      scene.add(light);
      localLights.push(light);
    }
  };
  refresh();

  const colorScratch = new THREE.Color();
  return {
    refresh,
    update(value) {
      scene.background.copy(colorScratch.copy(day.background).lerp(night.background, value));
      scene.fog.color.copy(colorScratch.copy(day.fogColor).lerp(night.fogColor, value));
      scene.fog.near = THREE.MathUtils.lerp(day.fogNear, night.fogNear, value);
      scene.fog.far = THREE.MathUtils.lerp(day.fogFar, night.fogFar, value);
      activeRenderer.toneMappingExposure = THREE.MathUtils.lerp(day.exposure, night.exposure, value);

      if (hemisphere) {
        hemisphere.color.copy(colorScratch.copy(day.hemisphereSky).lerp(night.hemisphereSky, value));
        hemisphere.groundColor.copy(colorScratch.copy(day.hemisphereGround).lerp(night.hemisphereGround, value));
        hemisphere.intensity = THREE.MathUtils.lerp(day.hemisphereIntensity, night.hemisphereIntensity, value);
      }
      if (keyLight) {
        keyLight.color.copy(colorScratch.copy(day.keyColor).lerp(night.keyColor, value));
        keyLight.intensity = THREE.MathUtils.lerp(day.keyIntensity, night.keyIntensity, value);
      }
      if (fillLight) {
        fillLight.color.copy(colorScratch.copy(day.fillColor).lerp(night.fillColor, value));
        fillLight.intensity = THREE.MathUtils.lerp(day.fillIntensity, night.fillIntensity, value);
      }

      activeWater.material.color.copy(colorScratch.copy(day.waterColor).lerp(night.waterColor, value));
      activeWater.material.roughness = THREE.MathUtils.lerp(day.waterRoughness, night.waterRoughness, value);
      activeWater.material.clearcoat = THREE.MathUtils.lerp(day.waterClearcoat, night.waterClearcoat, value);
      activeWater.material.opacity = THREE.MathUtils.lerp(day.waterOpacity, night.waterOpacity, value);

      for (const entry of emissiveMaterials) {
        entry.material.emissive.copy(colorScratch.copy(entry.dayColor).lerp(entry.nightColor, value));
        entry.material.emissiveIntensity = THREE.MathUtils.lerp(entry.dayIntensity, entry.nightIntensity, value);
      }
      localLights.forEach((light) => {
        light.intensity = THREE.MathUtils.lerp(0, light.userData.nightIntensity, value);
      });
    },
  };
}

dayNightToggle?.addEventListener('click', () => {
  const nightEnabled = dayNightToggle.getAttribute('aria-pressed') !== 'true';
  nightTarget = nightEnabled ? 1 : 0;
  dayNightToggle.setAttribute('aria-pressed', nightEnabled ? 'true' : 'false');
  dayNightToggle.setAttribute('aria-label', nightEnabled ? 'Ativar modo dia' : 'Ativar modo noite');
  container.classList.toggle('is-night-mode', nightEnabled);
  document.body.classList.toggle('is-night-mode', nightEnabled);
});
dayNightToggle?.addEventListener('pointerdown', (event) => event.stopPropagation());
dayNightToggle?.addEventListener('pointerup', (event) => event.stopPropagation());

topNavigation?.addEventListener('pointerdown', (event) => event.stopPropagation());
topNavigation?.addEventListener('pointerup', (event) => event.stopPropagation());
topNavigation?.addEventListener('click', (event) => {
  const link = event.target.closest('.top-navigation__link');
  if (!link) return;
  topNavigation.querySelectorAll('.top-navigation__link').forEach((item) => {
    if (item === link) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
});

function updateLandmarkNavigation() {
  if (!landmarkTargets || !landmarkNavigation) return;
  const bounds = container.getBoundingClientRect();
  camera.getWorldDirection(landmarkCameraDirection);

  Object.entries(landmarkTargets).forEach(([key, worldPosition]) => {
    const link = landmarkLinks[key];
    if (!worldPosition || !link) return;
    landmarkScreenPosition.copy(worldPosition).project(camera);
    landmarkCameraVector.copy(worldPosition).sub(camera.position);

    const projectedX = (landmarkScreenPosition.x * 0.5 + 0.5) * bounds.width;
    const projectedY = (-landmarkScreenPosition.y * 0.5 + 0.5) * bounds.height;
    const inFront = landmarkCameraVector.dot(landmarkCameraDirection) > 0;
    const inFrustum = Math.abs(landmarkScreenPosition.x) <= 1
      && Math.abs(landmarkScreenPosition.y) <= 1
      && landmarkScreenPosition.z > -1
      && landmarkScreenPosition.z < 1;
    const visible = inFront && inFrustum;
    const safeMarginX = Math.min(128, bounds.width * 0.22);
    const safeMarginY = Math.min(54, bounds.height * 0.12);
    const x = THREE.MathUtils.clamp(projectedX, safeMarginX, bounds.width - safeMarginX);
    const y = THREE.MathUtils.clamp(projectedY, safeMarginY, bounds.height - safeMarginY);

    link.style.left = `${x.toFixed(1)}px`;
    link.style.top = `${y.toFixed(1)}px`;
    link.classList.toggle('is-visible', visible);
    link.setAttribute('aria-hidden', visible ? 'false' : 'true');
    link.tabIndex = visible ? 0 : -1;
  });
}

Object.values(landmarkLinks).forEach((link) => {
  link.addEventListener('pointerdown', (event) => event.stopPropagation());
  link.addEventListener('pointerup', (event) => event.stopPropagation());
  link.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('tamarind:navigate', {
      detail: { destination: link.getAttribute('href'), landmark: link.dataset.landmark },
    }));
  });
});

container.addEventListener('pointermove', (event) => {
  if (dragging) {
    orbitYaw += (event.clientX - dragX) * 0.007;
    dragX = event.clientX;
    if (!navigationHintDismissed && Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) > 6) {
      navigationHintDismissed = true;
      navigationHint?.classList.add('is-dismissed');
    }
    return;
  }
  const bounds = container.getBoundingClientRect();
  pointer.x = THREE.MathUtils.clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1);
  pointer.y = THREE.MathUtils.clamp(((event.clientY - bounds.top) / bounds.height) * 2 - 1, -1, 1);
});
container.addEventListener('pointerdown', (event) => {
  dragging = true;
  dragX = event.clientX;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  container.setPointerCapture(event.pointerId);
});
container.addEventListener('pointerup', (event) => {
  dragging = false;
  container.releasePointerCapture(event.pointerId);
});
container.addEventListener('pointerleave', () => pointer.set(0, 0));

document.querySelector('#recenter').addEventListener('click', () => {
  pointer.set(0, 0);
  orbitYaw = 0;
});

async function initializeScene() {
  try {
    const {
      scene,
      bear: loadedBear,
      water: loadedWater,
      coast: loadedCoast,
      landmarks,
      startSecondaryLoad,
      cameraTarget,
      cameraPosition,
    } = await createWorld3d();
    activeScene = scene;
    bear = loadedBear;
    water = loadedWater;
    coast = loadedCoast;
    dayNightController = createDayNightController(scene, renderer, landmarks, loadedWater);
    dayNightController.update(nightMix);
    const refreshLandmarkAnchors = () => {
      landmarkTargets = Object.fromEntries(
        Object.entries(landmarks).map(([key, object]) => {
          const objectBounds = new THREE.Box3().setFromObject(object);
          const objectSize = objectBounds.getSize(new THREE.Vector3());
          objectBounds.getCenter(landmarkWorldPosition);
          const anchorGap = key === 'tecnomago'
            ? THREE.MathUtils.clamp(objectSize.y * 0.11, 2.8, 4.2)
            : key === 'architecture'
              ? THREE.MathUtils.clamp(objectSize.y * 0.14, 2.2, 3.4)
              : THREE.MathUtils.clamp(objectSize.y * 0.09, 1.8, 3.2);
          landmarkWorldPosition.y = objectBounds.max.y + anchorGap;
          return [key, landmarkWorldPosition.clone()];
        }),
      );
    };
    refreshLandmarkAnchors();
    camera.userData.baseTarget.set(...cameraTarget);
    if (cameraPosition) camera.position.set(...cameraPosition);
    camera.lookAt(camera.userData.baseTarget);
    renderer.render(scene, camera);
    tamarindMetrics.firstRenderMs = performance.now();
    console.timeEnd('[Tamarind] tempo até first render');
    status.remove();
    const clock = new THREE.Clock();
    const basePosition = camera.position.clone();
    const baseTarget = camera.userData.baseTarget;
    const baseOffset = basePosition.clone().sub(baseTarget);
    const orbitOffset = new THREE.Vector3();
    const targetPosition = new THREE.Vector3();
    const targetLook = new THREE.Vector3();
    let performanceFrames = 0;
    let performanceSampleStart = performance.now();
    let performanceReported = false;
    let updateGoatWalk = null;
    let updateWizardNpc = null;
    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;
      const smooth = 1 - Math.exp(-delta * 3.2);
      nightMix = THREE.MathUtils.damp(nightMix, nightTarget, 2.1, delta);
      dayNightController?.update(nightMix);
      easedPointer.lerp(pointer, smooth);
      updateBearProcedural(bear, easedPointer, elapsed, delta);
      updateGoatWalk?.(elapsed, delta);
      updateWizardNpc?.(elapsed, delta);
      orbitOffset.copy(baseOffset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbitYaw);
      targetPosition.copy(baseTarget).add(orbitOffset);
      targetPosition.y -= easedPointer.y * 1.2;
      targetLook.set(baseTarget.x + easedPointer.x * 0.55, baseTarget.y - easedPointer.y * 0.3, baseTarget.z);
      camera.position.lerp(targetPosition, smooth);
      camera.lookAt(targetLook);
      const waterShader = water?.material?.userData?.shader;
      if (waterShader?.uniforms?.uWaterTime) waterShader.uniforms.uWaterTime.value = elapsed;
      coast?.userData?.update?.(elapsed);
      millPond?.userData?.update?.(elapsed);
      renderer.render(scene, camera);
      updateLandmarkNavigation();

      performanceFrames += 1;
      const performanceNow = performance.now();
      const performanceDuration = performanceNow - performanceSampleStart;
      if (!performanceReported && performanceDuration >= 5000) {
        const fps = (performanceFrames * 1000) / performanceDuration;
        console.info(
          `[Tamarind] Performance moderada: ${fps.toFixed(1)} FPS | `
          + `${renderer.info.render.calls} draw calls | ${renderer.info.render.triangles} triângulos.`,
        );
        performanceReported = true;
      }
    });
    initialized = true;

    startSecondaryLoad({
      onAssetLoaded: ({ key, object }) => {
        if (key === 'coast') coast = object;
        if (key === 'millPond') millPond = object;
        dayNightController.refresh();
        dayNightController.update(nightMix);
        refreshLandmarkAnchors();
        console.info(`[Tamarind] Asset secundário integrado: ${key}.`);
      },
      onPhaseComplete: (phase, elapsedMs) => {
        console.info(`[Tamarind] Fase ${phase} pronta em ${Math.round(elapsedMs)} ms.`);
      },
    }).then((secondary) => {
      updateGoatWalk = secondary.updateGoatWalk;
      updateWizardNpc = secondary.updateWizardNpc;
      dayNightController.refresh();
      dayNightController.update(nightMix);
      refreshLandmarkAnchors();
      const resources = performance.getEntriesByType('resource');
      const glbResources = resources.filter((entry) => entry.name.includes('.glb'));
      tamarindMetrics.worldCompleteMs = performance.now();
      tamarindMetrics.requestCount = resources.length;
      tamarindMetrics.glbRequestCount = glbResources.length;
      tamarindMetrics.totalTransferBytes = resources.reduce(
        (total, entry) => total + (entry.transferSize || entry.encodedBodySize || 0),
        0,
      );
      const resourceCounts = resources.reduce((counts, entry) => {
        const url = entry.name.split('?')[0];
        counts[url] = (counts[url] ?? 0) + 1;
        return counts;
      }, {});
      tamarindMetrics.duplicateRequests = Object.entries(resourceCounts)
        .filter(([, count]) => count > 1)
        .map(([url, count]) => ({ url, count }));
      console.table(tamarindMetrics.assets.map((asset) => ({
        asset: asset.asset,
        phase: asset.phase,
        sizeMB: (asset.bytes / 1024 / 1024).toFixed(2),
        downloadMs: Math.round(asset.downloadMs),
        parseMs: Math.round(asset.parseMs),
        totalMs: Math.round(asset.totalMs),
      })));
      console.info('[Tamarind] Métricas de carregamento.', JSON.stringify(tamarindMetrics));
      if (new URLSearchParams(window.location.search).has('perf')) {
        const diagnostic = {
          firstRenderMs: Math.round(tamarindMetrics.firstRenderMs),
          landmarksReadyMs: Math.round(tamarindMetrics.landmarksReadyMs),
          inhabitedReadyMs: Math.round(tamarindMetrics.inhabitedReadyMs),
          worldCompleteMs: Math.round(tamarindMetrics.worldCompleteMs),
          glbRequestCount: tamarindMetrics.glbRequestCount,
          duplicateRequests: tamarindMetrics.duplicateRequests,
          surfaceSampler: tamarindMetrics.surfaceSampler,
          assets: tamarindMetrics.assets.map((asset) => ({
            asset: asset.asset,
            bytes: asset.bytes,
            downloadMs: Math.round(asset.downloadMs),
            parseMs: Math.round(asset.parseMs),
            totalMs: Math.round(asset.totalMs),
          })),
        };
        document.title = [
          'Tamarind Perf',
          `first=${Math.round(tamarindMetrics.firstRenderMs)}ms`,
          `landmarks=${Math.round(tamarindMetrics.landmarksReadyMs)}ms`,
          `world=${Math.round(tamarindMetrics.worldCompleteMs)}ms`,
          `glb=${tamarindMetrics.glbRequestCount}`,
        ].join(' | ');
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#metrics=${encodeURIComponent(JSON.stringify(diagnostic))}`,
        );
      }
      console.timeEnd('[Tamarind] tempo até mundo completo');
    }).catch((error) => {
      console.error('Falha ao carregar assets secundários do mundo Tamarind.', error);
      console.timeEnd('[Tamarind] tempo até mundo completo');
    });
  } catch (error) {
    console.error('Falha ao carregar o mundo 3D Tamarind.', error);
    status.textContent = 'Não foi possível carregar o mundo 3D.';
    status.dataset.error = 'true';
  }
}

initializeScene();

const resizeObserver = new ResizeObserver(() => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height);
  resizeCamera3d(camera, width / height);
  if (initialized) renderer.render(activeScene, camera);
});
resizeObserver.observe(container);
