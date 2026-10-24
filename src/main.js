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
const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
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
let campfire = null;
let landmarkTargets = null;
let dayNightController = null;
let nightTarget = 0;
let nightMix = 0;
const mobileViewport = window.matchMedia('(max-width: 768px)');
const compactMobileViewport = window.matchMedia('(max-width: 480px)');
const activePointers = new Map();
let pinchDistance = 0;
let mobileZoom = 1;
let updateResponsiveCamera = null;

function getResponsiveCameraSpec(aspect, desktopFov = 44) {
  if (!mobileViewport.matches) return { fov: desktopFov, distanceScale: 1 };
  if (aspect >= 1) return { fov: desktopFov, distanceScale: 1 };
  const desktopHorizontalTan = Math.tan(THREE.MathUtils.degToRad(desktopFov * 0.5)) * (16 / 9);
  const requiredFov = THREE.MathUtils.radToDeg(
    2 * Math.atan(desktopHorizontalTan / Math.max(aspect, 0.35)),
  );
  const fov = THREE.MathUtils.clamp(requiredFov, 60, 96);
  const mobileHorizontalTan = Math.tan(THREE.MathUtils.degToRad(fov * 0.5)) * aspect;
  const distanceScale = Math.max(0.95, (desktopHorizontalTan / mobileHorizontalTan) * 0.75);
  return { fov, distanceScale };
}

const landmarkNavigation = document.querySelector('.landmark-navigation');
const projectPanel = document.querySelector('#landmark-project-panel');
const projectPanelClose = projectPanel?.querySelector('.project-panel__close');
const projectPanelIcon = projectPanel?.querySelector('.project-panel__icon');
const projectPanelTitle = projectPanel?.querySelector('#landmark-panel-title');
const projectPanelSubtitle = projectPanel?.querySelector('.project-panel__subtitle');
const projectPanelDescription = projectPanel?.querySelector('.project-panel__description');
const projectPanelExplore = projectPanel?.querySelector('.project-panel__explore');
const projectCards = [...(projectPanel?.querySelectorAll('.project-card') ?? [])];
const landmarkLinks = Object.fromEntries(
  [...document.querySelectorAll('[data-landmark]')].map((link) => [link.dataset.landmark, link]),
);
const LANDMARK_EXPERIENCES = {
  tecnomago: {
    title: 'Casa do Tecnomago',
    subtitle: 'Vídeos IA',
    description: 'Projetos de audiovisual, inteligência artificial e experimentação visual.',
    icon: '/artwork/ui/icone-videos-ia.png',
    href: '#videos-de-ia',
    focus: { distanceFactor: 2.18, minDistance: 24, maxDistance: 58, heightRatio: 0.68, lateralShift: 0.2 },
    mobileFocus: { distanceFactor: 2.72, minDistance: 31, maxDistance: 70, heightRatio: 0.72 },
    projects: [
      { title: 'Mundos Imaginados', category: 'Filme · Vídeo IA', href: '#projeto-mundos-imaginados', thumbnail: 'project-card__thumbnail--worlds' },
      { title: 'Memórias Sintéticas', category: 'Experimento visual', href: '#projeto-memorias-sinteticas', thumbnail: 'project-card__thumbnail--memory' },
      { title: 'Oráculo', category: 'Motion · Inteligência artificial', href: '#projeto-oraculo', thumbnail: 'project-card__thumbnail--oracle' },
    ],
  },
  apps: {
    title: 'APP / WEB',
    subtitle: 'Interfaces e experiências digitais',
    description: 'Projetos de interfaces, websites, aplicações, experiências interativas e produtos digitais.',
    icon: '/artwork/ui/icone-app-web.png',
    href: '#apps-sites',
    focus: { distanceFactor: 2.05, minDistance: 29, maxDistance: 66, heightRatio: 0.6, lateralShift: 0.18 },
    mobileFocus: { distanceFactor: 2.5, minDistance: 37, maxDistance: 76, heightRatio: 0.68 },
    projects: [
      { title: 'Tamarind Studio', category: 'Website · Experiência interativa', href: '#projeto-tamarind-studio', thumbnail: 'project-card__thumbnail--apps-one' },
      { title: 'Atlas Criativo', category: 'Aplicação · Produto digital', href: '#projeto-atlas-criativo', thumbnail: 'project-card__thumbnail--apps-two' },
      { title: 'Portal Imersivo', category: 'Interface · WebGL', href: '#projeto-portal-imersivo', thumbnail: 'project-card__thumbnail--apps-three' },
    ],
  },
  architecture: {
    title: '3D / Arquitetura',
    subtitle: '3D, ambientes e visualização',
    description: 'Projetos de arquitetura, ambientes 3D, visualização, Blender, Unreal e experiências espaciais.',
    icon: '/artwork/ui/icone-3d-arquitetura.png',
    href: '#3d-arquitetura',
    focus: { distanceFactor: 2.28, minDistance: 25, maxDistance: 60, heightRatio: 0.64, lateralShift: 0.2 },
    mobileFocus: { distanceFactor: 2.7, minDistance: 33, maxDistance: 72, heightRatio: 0.7 },
    projects: [
      { title: 'Habitat Contemporâneo', category: 'Arquitetura · Visualização', href: '#projeto-habitat', thumbnail: 'project-card__thumbnail--architecture-one' },
      { title: 'Cidade Suspensa', category: 'Blender · Ambiente 3D', href: '#projeto-cidade-suspensa', thumbnail: 'project-card__thumbnail--architecture-two' },
      { title: 'Pavilhão Virtual', category: 'Unreal · Experiência espacial', href: '#projeto-pavilhao', thumbnail: 'project-card__thumbnail--architecture-three' },
    ],
  },
};
const landmarkWorldPosition = new THREE.Vector3();
const landmarkScreenPosition = new THREE.Vector3();
const landmarkCameraDirection = new THREE.Vector3();
const landmarkCameraVector = new THREE.Vector3();
let openLandmarkExperience = null;
let closeLandmarkExperience = null;
let pendingLandmarkExperience = null;

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
  topNavigation.classList.remove('is-open');
  mobileMenuToggle?.setAttribute('aria-expanded', 'false');
  mobileMenuToggle?.setAttribute('aria-label', 'Abrir menu');
});

mobileMenuToggle?.addEventListener('pointerdown', (event) => event.stopPropagation());
mobileMenuToggle?.addEventListener('pointerup', (event) => event.stopPropagation());
mobileMenuToggle?.addEventListener('click', () => {
  const open = !topNavigation?.classList.contains('is-open');
  topNavigation?.classList.toggle('is-open', open);
  mobileMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  mobileMenuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
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
    const safeMarginX = mobileViewport.matches ? 32 : Math.min(128, bounds.width * 0.22);
    const safeMarginY = mobileViewport.matches ? 82 : Math.min(54, bounds.height * 0.12);
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
  link.addEventListener('click', (event) => {
    const landmarkKey = link.dataset.landmark;
    if (LANDMARK_EXPERIENCES[landmarkKey]) {
      event.preventDefault();
      if (openLandmarkExperience) openLandmarkExperience(landmarkKey);
      else pendingLandmarkExperience = landmarkKey;
    }
    window.dispatchEvent(new CustomEvent('tamarind:navigate', {
      detail: { destination: link.getAttribute('href'), landmark: link.dataset.landmark },
    }));
  });
});

projectPanel?.addEventListener('pointerdown', (event) => event.stopPropagation());
projectPanel?.addEventListener('pointerup', (event) => event.stopPropagation());
projectPanelClose?.addEventListener('click', () => closeLandmarkExperience?.());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeLandmarkExperience?.();
});

const pointerDistance = () => {
  const [first, second] = [...activePointers.values()];
  if (!first || !second) return 0;
  return Math.hypot(second.x - first.x, second.y - first.y);
};

container.addEventListener('pointermove', (event) => {
  if (container.classList.contains('is-camera-transitioning') || container.classList.contains('is-landmark-focused')) return;
  if (event.pointerType === 'touch') {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size >= 2) {
      const nextDistance = pointerDistance();
      if (pinchDistance > 0 && nextDistance > 0) {
        mobileZoom = THREE.MathUtils.clamp(mobileZoom * (pinchDistance / nextDistance), 0.76, 1.32);
        updateResponsiveCamera?.(false);
      }
      pinchDistance = nextDistance;
      dragging = false;
      return;
    }
  }
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
  if (container.classList.contains('is-camera-transitioning') || container.classList.contains('is-landmark-focused')) return;
  if (event.pointerType === 'touch') {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size >= 2) {
      pinchDistance = pointerDistance();
      dragging = false;
      container.setPointerCapture(event.pointerId);
      return;
    }
  }
  dragging = true;
  dragX = event.clientX;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  container.setPointerCapture(event.pointerId);
});
container.addEventListener('pointerup', (event) => {
  activePointers.delete(event.pointerId);
  pinchDistance = activePointers.size >= 2 ? pointerDistance() : 0;
  dragging = false;
  if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
});
container.addEventListener('pointercancel', (event) => {
  activePointers.delete(event.pointerId);
  pinchDistance = 0;
  dragging = false;
});
container.addEventListener('pointerleave', () => pointer.set(0, 0));

document.querySelector('#recenter').addEventListener('click', () => {
  pointer.set(0, 0);
  orbitYaw = 0;
  mobileZoom = 1;
  updateResponsiveCamera?.(false);
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
    const desktopOverviewPosition = camera.position.clone();
    const desktopOverviewFov = camera.fov;
    const viewportAspect = container.clientWidth / Math.max(container.clientHeight, 1);
    const initialCameraSpec = getResponsiveCameraSpec(viewportAspect, desktopOverviewFov);
    camera.fov = initialCameraSpec.fov;
    if (mobileViewport.matches) {
      const initialOffset = desktopOverviewPosition.clone().sub(camera.userData.baseTarget);
      camera.position.copy(camera.userData.baseTarget).addScaledVector(
        initialOffset,
        initialCameraSpec.distanceScale,
      );
      camera.updateProjectionMatrix();
    }
    camera.lookAt(camera.userData.baseTarget);
    renderer.render(scene, camera);
    tamarindMetrics.firstRenderMs = performance.now();
    console.timeEnd('[Tamarind] tempo até first render');
    status.remove();
    const clock = new THREE.Clock();
    const basePosition = camera.position.clone();
    const baseTarget = camera.userData.baseTarget;
    const baseOffset = basePosition.clone().sub(baseTarget);
    const desktopBaseOffset = desktopOverviewPosition.clone().sub(baseTarget);
    const orbitOffset = new THREE.Vector3();
    const targetPosition = new THREE.Vector3();
    const targetLook = new THREE.Vector3();
    const currentLookTarget = baseTarget.clone();
    const transitionPosition = new THREE.Vector3();
    const transitionTarget = new THREE.Vector3();
    const focusBounds = new THREE.Box3();
    const focusSize = new THREE.Vector3();
    const focusCenter = new THREE.Vector3();
    const focusDirection = new THREE.Vector3();
    const focusViewDirection = new THREE.Vector3();
    const focusRight = new THREE.Vector3();
    const cameraTransition = {
      active: false,
      startedAt: 0,
      duration: 950,
      fromPosition: new THREE.Vector3(),
      fromTarget: new THREE.Vector3(),
      toPosition: new THREE.Vector3(),
      toTarget: new THREE.Vector3(),
      onComplete: null,
    };
    const overviewSnapshot = {
      position: new THREE.Vector3(),
      target: new THREE.Vector3(),
    };
    let experiencePhase = 'overview';
    let activeLandmarkKey = null;

    updateResponsiveCamera = (snap = true) => {
      const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
      const cameraSpec = getResponsiveCameraSpec(aspect, desktopOverviewFov);
      camera.fov = cameraSpec.fov;
      camera.updateProjectionMatrix();
      const responsiveScale = mobileViewport.matches
        ? cameraSpec.distanceScale * mobileZoom
        : 1;
      baseOffset.copy(desktopBaseOffset).multiplyScalar(responsiveScale);
      basePosition.copy(baseTarget).add(baseOffset);
      if (snap && experiencePhase === 'overview' && !cameraTransition.active) {
        orbitOffset.copy(baseOffset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbitYaw);
        camera.position.copy(baseTarget).add(orbitOffset);
        currentLookTarget.copy(baseTarget);
        camera.lookAt(currentLookTarget);
      }
    };

    const populateProjectPanel = (landmarkKey) => {
      const config = LANDMARK_EXPERIENCES[landmarkKey];
      if (!config || !projectPanel) return;
      projectPanel.dataset.section = landmarkKey;
      if (projectPanelIcon) projectPanelIcon.src = config.icon;
      if (projectPanelTitle) projectPanelTitle.textContent = config.title;
      if (projectPanelSubtitle) projectPanelSubtitle.textContent = config.subtitle;
      if (projectPanelDescription) projectPanelDescription.textContent = config.description;
      if (projectPanelExplore) projectPanelExplore.href = config.href;
      projectCards.forEach((card, index) => {
        const project = config.projects[index];
        if (!project) return;
        card.href = project.href;
        const thumbnail = card.querySelector('.project-card__thumbnail');
        const title = card.querySelector('strong');
        const category = card.querySelector('small');
        if (thumbnail) thumbnail.className = `project-card__thumbnail ${project.thumbnail}`;
        if (title) title.textContent = project.title;
        if (category) category.textContent = project.category;
      });
    };

    const setPanelOpen = (open) => {
      projectPanel?.classList.toggle('is-open', open);
      projectPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) projectPanelClose?.focus({ preventScroll: true });
    };

    const startCameraTransition = (toPosition, toTarget, onComplete) => {
      cameraTransition.active = true;
      cameraTransition.startedAt = performance.now();
      cameraTransition.fromPosition.copy(camera.position);
      cameraTransition.fromTarget.copy(currentLookTarget);
      cameraTransition.toPosition.copy(toPosition);
      cameraTransition.toTarget.copy(toTarget);
      cameraTransition.onComplete = onComplete;
      dragging = false;
      container.classList.add('is-camera-transitioning');
    };

    openLandmarkExperience = (landmarkKey) => {
      if (experiencePhase !== 'overview' || cameraTransition.active) return;
      const landmark = landmarks[landmarkKey];
      const config = LANDMARK_EXPERIENCES[landmarkKey];
      if (!landmark || !config) return;

      activeLandmarkKey = landmarkKey;
      populateProjectPanel(landmarkKey);
      overviewSnapshot.position.copy(camera.position);
      overviewSnapshot.target.copy(currentLookTarget);
      focusBounds.setFromObject(landmark);
      focusBounds.getSize(focusSize);
      focusBounds.getCenter(focusCenter);
      focusCenter.y = focusBounds.min.y + focusSize.y * 0.5;

      focusDirection.copy(camera.position).sub(focusCenter).normalize();
      const focusConfig = mobileViewport.matches ? config.mobileFocus : config.focus;
      const focusDistance = THREE.MathUtils.clamp(
        Math.max(focusSize.x, focusSize.y, focusSize.z) * focusConfig.distanceFactor,
        focusConfig.minDistance,
        focusConfig.maxDistance,
      );
      transitionPosition.copy(focusCenter).addScaledVector(focusDirection, focusDistance);
      transitionPosition.y = Math.max(
        transitionPosition.y,
        focusBounds.min.y + focusSize.y * focusConfig.heightRatio,
      );
      transitionTarget.copy(focusCenter);
      if (mobileViewport.matches) {
        transitionTarget.y -= focusSize.y * 0.18;
      } else {
        focusViewDirection.copy(focusDirection).negate();
        focusRight.crossVectors(focusViewDirection, THREE.Object3D.DEFAULT_UP).normalize();
        transitionTarget.addScaledVector(focusRight, focusSize.x * config.focus.lateralShift);
      }

      experiencePhase = 'focusing';
      container.classList.add('is-landmark-focused');
      setPanelOpen(false);
      startCameraTransition(transitionPosition, transitionTarget, () => {
        experiencePhase = 'focused';
        setPanelOpen(true);
      });
    };
    if (pendingLandmarkExperience) {
      const pendingKey = pendingLandmarkExperience;
      pendingLandmarkExperience = null;
      openLandmarkExperience(pendingKey);
    }

    closeLandmarkExperience = () => {
      if (experiencePhase === 'overview' || experiencePhase === 'returning') return;
      setPanelOpen(false);
      experiencePhase = 'returning';
      startCameraTransition(overviewSnapshot.position, overviewSnapshot.target, () => {
        experiencePhase = 'overview';
        container.classList.remove('is-landmark-focused');
        landmarkLinks[activeLandmarkKey]?.focus({ preventScroll: true });
        activeLandmarkKey = null;
      });
    };
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
      if (cameraTransition.active) {
        const transitionProgress = THREE.MathUtils.clamp(
          (performance.now() - cameraTransition.startedAt) / cameraTransition.duration,
          0,
          1,
        );
        const easedTransition = transitionProgress < 0.5
          ? 4 * transitionProgress ** 3
          : 1 - ((-2 * transitionProgress + 2) ** 3) / 2;
        camera.position.lerpVectors(
          cameraTransition.fromPosition,
          cameraTransition.toPosition,
          easedTransition,
        );
        currentLookTarget.lerpVectors(
          cameraTransition.fromTarget,
          cameraTransition.toTarget,
          easedTransition,
        );
        camera.lookAt(currentLookTarget);
        if (transitionProgress >= 1) {
          cameraTransition.active = false;
          container.classList.remove('is-camera-transitioning');
          const onComplete = cameraTransition.onComplete;
          cameraTransition.onComplete = null;
          onComplete?.();
        }
      } else if (experiencePhase === 'overview') {
        orbitOffset.copy(baseOffset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbitYaw);
        targetPosition.copy(baseTarget).add(orbitOffset);
        targetPosition.y -= easedPointer.y * 1.2;
        targetLook.set(baseTarget.x + easedPointer.x * 0.55, baseTarget.y - easedPointer.y * 0.3, baseTarget.z);
        camera.position.lerp(targetPosition, smooth);
        currentLookTarget.copy(targetLook);
        camera.lookAt(currentLookTarget);
      }
      const waterShader = water?.material?.userData?.shader;
      if (waterShader?.uniforms?.uWaterTime) waterShader.uniforms.uWaterTime.value = elapsed;
      coast?.userData?.update?.(elapsed);
      millPond?.userData?.update?.(elapsed);
      campfire?.userData?.update?.(nightMix, elapsed);
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
        if (key === 'campfire') campfire = object;
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
  const pixelRatioCap = compactMobileViewport.matches ? 1.25 : 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.setSize(width, height);
  resizeCamera3d(camera, width / height);
  updateResponsiveCamera?.(true);
  if (!mobileViewport.matches) {
    topNavigation?.classList.remove('is-open');
    mobileMenuToggle?.setAttribute('aria-expanded', 'false');
    mobileMenuToggle?.setAttribute('aria-label', 'Abrir menu');
  }
  if (initialized) {
    updateLandmarkNavigation();
    renderer.render(activeScene, camera);
  }
});
resizeObserver.observe(container);
