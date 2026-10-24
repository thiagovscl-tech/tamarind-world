const params = new URLSearchParams(window.location.search);

export const mobileDebugEnabled = params.get('debugMobile') === '1';
export const mobileDebugStage = mobileDebugEnabled
  ? Math.min(8, Math.max(0, Number.parseInt(params.get('debugStage') || '0', 10) || 0))
  : 8;

const STAGES = [
  'núcleo',
  '+ castelo',
  '+ templo',
  '+ casas',
  '+ árvores',
  '+ bode',
  '+ mago',
  '+ campfire',
  '+ brejo',
];

const state = {
  phase: 'bootstrap',
  started: '—',
  completed: '—',
  assetError: '—',
  webgl: 'inicializando',
  errors: [],
};

let panel = null;
let output = null;
let rendererRef = null;
let cameraRef = null;
let refreshTimer = 0;
let globalListenersAttached = false;

function formatError(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function recordError(label, value) {
  const message = `${label}: ${formatError(value)}`;
  state.errors.unshift(message);
  state.errors.length = Math.min(state.errors.length, 4);
  refreshPanel();
}

function createPanel() {
  if (!mobileDebugEnabled || panel) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', createPanel, { once: true });
    return;
  }
  panel = document.createElement('aside');
  panel.className = 'mobile-debug-panel';
  panel.setAttribute('aria-label', 'Diagnóstico mobile Tamarind');

  const header = document.createElement('div');
  header.className = 'mobile-debug-panel__header';
  header.textContent = `MOBILE DEBUG · etapa ${mobileDebugStage}/8`;

  const stages = document.createElement('nav');
  stages.className = 'mobile-debug-panel__stages';
  stages.setAttribute('aria-label', 'Etapas de diagnóstico');
  STAGES.forEach((label, index) => {
    const link = document.createElement('a');
    const nextParams = new URLSearchParams(window.location.search);
    nextParams.set('debugMobile', '1');
    nextParams.set('debugStage', String(index));
    link.href = `${window.location.pathname}?${nextParams.toString()}`;
    link.textContent = `${index}: ${label}`;
    if (index === mobileDebugStage) link.setAttribute('aria-current', 'step');
    stages.appendChild(link);
  });

  output = document.createElement('pre');
  output.className = 'mobile-debug-panel__output';
  panel.append(header, stages, output);
  document.body.appendChild(panel);
  refreshPanel();
}

function attachGlobalListeners() {
  if (!mobileDebugEnabled || globalListenersAttached) return;
  globalListenersAttached = true;
  window.addEventListener('error', (event) => {
    recordError('JS', `${event.message} @ ${event.filename || 'inline'}:${event.lineno || 0}:${event.colno || 0}\n${event.error?.stack || ''}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordError('PROMISE', event.reason);
  });
  window.addEventListener('tamarind:asset', (event) => {
    const { status, label, url, elapsedMs, error } = event.detail || {};
    if (status === 'start') state.started = label || url || 'desconhecido';
    if (status === 'success') state.completed = `${label || url} · ${Math.round(elapsedMs || 0)}ms`;
    if (status === 'error') {
      state.assetError = `${label || 'asset'} · ${url || ''} · ${error || 'erro'}`;
      recordError('GLB', state.assetError);
    }
    refreshPanel();
  });
}

function getWebglSummary() {
  if (!rendererRef) return state.webgl;
  const gl = rendererRef.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  return `${state.webgl} · ${gpu} · MAX_TEX ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`;
}

function refreshPanel() {
  if (!mobileDebugEnabled || !output) return;
  const canvas = rendererRef?.domElement;
  const memory = rendererRef?.info?.memory;
  const render = rendererRef?.info?.render;
  const jsMemory = performance.memory
    ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)}/${Math.round(performance.memory.jsHeapSizeLimit / 1048576)} MB`
    : 'indisponível';
  output.textContent = [
    `Viewport  ${window.innerWidth} × ${window.innerHeight}`,
    `Visual    ${window.visualViewport ? `${Math.round(window.visualViewport.width)} × ${Math.round(window.visualViewport.height)}` : 'indisponível'}`,
    `Screen    ${window.screen.width} × ${window.screen.height}`,
    `DPR       ${window.devicePixelRatio || 1}`,
    `Renderer  ${canvas ? `${canvas.width} × ${canvas.height}` : '—'}`,
    `Camera    ${cameraRef ? cameraRef.position.toArray().map((value) => value.toFixed(1)).join(' / ') : '—'}`,
    `FOV/aspect ${cameraRef ? `${cameraRef.fov.toFixed(1)} / ${cameraRef.aspect.toFixed(3)}` : '—'}`,
    `Draw      ${render ? `${render.calls} calls · ${render.triangles} tris` : '—'}`,
    `Memory    ${memory ? `${memory.geometries} geom · ${memory.textures} tex` : '—'} · JS ${jsMemory}`,
    `WebGL     ${getWebglSummary()}`,
    `Loading   ${state.phase}`,
    `START     ${state.started}`,
    `SUCCESS   ${state.completed}`,
    `ASSET ERR ${state.assetError}`,
    state.errors.length ? `ERRORS\n${state.errors.join('\n---\n')}` : 'ERRORS    nenhum',
  ].join('\n');
}

export function setMobileDebugPhase(phase) {
  if (!mobileDebugEnabled) return;
  state.phase = phase;
  refreshPanel();
}

export function attachMobileDebug({ renderer, camera, container }) {
  if (!mobileDebugEnabled) return;
  rendererRef = renderer;
  cameraRef = camera;
  state.webgl = 'OK';
  createPanel();
  renderer.domElement.addEventListener('webglcontextlost', () => {
    state.webgl = 'WEBGL CONTEXT LOST';
    recordError('WEBGL', 'WEBGL CONTEXT LOST');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    state.webgl = 'RESTORED';
    refreshPanel();
  });

  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(refreshPanel, 500);
  refreshPanel();
}

if (mobileDebugEnabled) {
  attachGlobalListeners();
  createPanel();
}
