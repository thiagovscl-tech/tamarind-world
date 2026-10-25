import * as THREE from 'three';

export function createRenderer(container) {
  const debugParams = new URLSearchParams(window.location.search);
  const debugMobile = debugParams.get('debugMobile') === '1';
  const debugLightStage = Math.min(6, Math.max(
    0,
    Number.parseInt(debugParams.get('debugLightStage') || '6', 10) || 0,
  ));
  const renderer = new THREE.WebGLRenderer({
    antialias: !debugMobile,
    alpha: false,
    powerPreference: 'high-performance',
  });

  const mobileViewport = window.matchMedia([
    '(max-width: 768px)',
    '(max-width: 950px) and (max-height: 500px)',
    '(hover: none) and (pointer: coarse)',
  ].join(', '));
  const pixelRatioCap = debugMobile ? 1 : (mobileViewport.matches ? 1.25 : 1.5);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !debugMobile || debugLightStage >= 6;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  return renderer;
}
