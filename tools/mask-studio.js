import './mask-studio.css';

let SIZE = { width: 1680, height: 945 };
const canvas = document.querySelector('#art-canvas');
const context = canvas.getContext('2d');
const maskCanvas = document.createElement('canvas');
maskCanvas.width = SIZE.width;
maskCanvas.height = SIZE.height;
const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
const overlayCanvas = document.createElement('canvas');
overlayCanvas.width = SIZE.width;
overlayCanvas.height = SIZE.height;
const overlayContext = overlayCanvas.getContext('2d');

const layerSelect = document.querySelector('#layer-select');
const layerName = document.querySelector('#selection-name');
const maskState = document.querySelector('#mask-state');
const loading = document.querySelector('#loading');
const brushSize = document.querySelector('#brush-size');
const zoomInput = document.querySelector('#zoom');
const undoButton = document.querySelector('#undo');
const exportButton = document.querySelector('#export');
const importInput = document.querySelector('#import-mask');
const history = [];

let layers = [];
let activeTool = 'paint';
let activeView = 'overlay';
let activeLayer = null;
let isDrawing = false;
let hasMask = false;
const allMasksPreview = new Image();
allMasksPreview.src = '/artwork/previews/all-masks-overlay.png';

maskContext.fillStyle = '#000000';
maskContext.fillRect(0, 0, SIZE.width, SIZE.height);

const original = new Image();
original.src = '/artwork/source/layoutTamarind.png';
original.addEventListener('load', async () => {
  SIZE = { width: original.naturalWidth, height: original.naturalHeight };
  canvas.width = SIZE.width;
  canvas.height = SIZE.height;
  maskCanvas.width = SIZE.width;
  maskCanvas.height = SIZE.height;
  overlayCanvas.width = SIZE.width;
  overlayCanvas.height = SIZE.height;
  maskContext.fillStyle = '#000000';
  maskContext.fillRect(0, 0, SIZE.width, SIZE.height);
  context.drawImage(original, 0, 0, SIZE.width, SIZE.height);
  document.querySelector('#source-dimensions').textContent = `${SIZE.width} × ${SIZE.height}`;
  const response = await fetch('/artwork/world-layers.json');
  const manifest = await response.json();
  layers = manifest.layers;
  layerSelect.replaceChildren(...layers.map((layer) => {
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = layer.label;
    return option;
  }));
  layerSelect.disabled = false;
  exportButton.disabled = false;
  activeLayer = layers[0];
  await selectLayer(activeLayer.id);
  loading.remove();
});

allMasksPreview.addEventListener('load', () => {
  if (activeView === 'all') drawPreview();
});

original.addEventListener('error', () => {
  loading.textContent = 'Não foi possível abrir a arte original.';
});

async function selectLayer(id) {
  activeLayer = layers.find((layer) => layer.id === id);
  layerName.textContent = activeLayer.label;
  maskContext.clearRect(0, 0, SIZE.width, SIZE.height);
  maskContext.fillStyle = '#000000';
  maskContext.fillRect(0, 0, SIZE.width, SIZE.height);
  history.length = 0;
  updateUndo();

  const response = await fetch(`/artwork/masks/${activeLayer.id}.png`);
  hasMask = response.ok;
  if (hasMask) {
    const bitmap = await createImageBitmap(await response.blob());
    maskContext.drawImage(bitmap, 0, 0, bitmap.width, SIZE.height, 0, 0, SIZE.width, SIZE.height);
    bitmap.close();
  }
  updateMaskState();
  drawPreview();
}

function drawPreview() {
  context.clearRect(0, 0, SIZE.width, SIZE.height);
  if (activeView === 'original') {
    context.drawImage(original, 0, 0, SIZE.width, SIZE.height);
    return;
  }
  if (activeView === 'mask') {
    context.drawImage(maskCanvas, 0, 0, SIZE.width, SIZE.height);
    return;
  }
  if (activeView === 'all') {
    if (allMasksPreview.complete && allMasksPreview.naturalWidth) {
      context.drawImage(allMasksPreview, 0, 0, SIZE.width, SIZE.height);
    } else {
      context.drawImage(original, 0, 0, SIZE.width, SIZE.height);
      maskState.textContent = 'Prévia conjunta ainda não foi gerada.';
    }
    return;
  }

  context.drawImage(original, 0, 0, SIZE.width, SIZE.height);
  const mask = maskContext.getImageData(0, 0, SIZE.width, SIZE.height).data;
  const overlay = overlayContext.createImageData(SIZE.width, SIZE.height);
  for (let i = 0; i < mask.length; i += 4) {
    const gray = Math.round((mask[i] + mask[i + 1] + mask[i + 2]) / 3);
    overlay.data[i] = 255;
    overlay.data[i + 1] = 69;
    overlay.data[i + 2] = 58;
    overlay.data[i + 3] = Math.round(gray * 0.55);
  }
  overlayContext.putImageData(overlay, 0, 0);
  context.drawImage(overlayCanvas, 0, 0);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (SIZE.width / rect.width),
    y: (event.clientY - rect.top) * (SIZE.height / rect.height),
  };
}

function saveUndoState() {
  history.push(maskContext.getImageData(0, 0, SIZE.width, SIZE.height));
  if (history.length > 12) history.shift();
  updateUndo();
}

function paintPoint(from, to) {
  maskContext.save();
  maskContext.globalCompositeOperation = 'source-over';
  maskContext.strokeStyle = activeTool === 'erase' ? '#000000' : '#ffffff';
  maskContext.fillStyle = activeTool === 'erase' ? '#000000' : '#ffffff';
  maskContext.lineWidth = Number(brushSize.value);
  maskContext.lineCap = 'round';
  maskContext.lineJoin = 'round';
  maskContext.beginPath();
  maskContext.moveTo(from.x, from.y);
  maskContext.lineTo(to.x, to.y);
  maskContext.stroke();
  if (from.x === to.x && from.y === to.y) {
    maskContext.beginPath();
    maskContext.arc(from.x, from.y, Number(brushSize.value) / 2, 0, Math.PI * 2);
    maskContext.fill();
  }
  maskContext.restore();
  hasMask = true;
  updateMaskState();
  drawPreview();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!activeLayer || event.button !== 0) return;
  event.preventDefault();
  saveUndoState();
  isDrawing = true;
  canvas.setPointerCapture(event.pointerId);
  const point = pointFromEvent(event);
  paintPoint(point, point);
  canvas.dataset.lastPoint = `${point.x},${point.y}`;
});

canvas.addEventListener('pointermove', (event) => {
  if (!isDrawing) return;
  const from = canvas.dataset.lastPoint.split(',').map(Number);
  const to = pointFromEvent(event);
  paintPoint({ x: from[0], y: from[1] }, to);
  canvas.dataset.lastPoint = `${to.x},${to.y}`;
});

function stopDrawing(event) {
  if (!isDrawing) return;
  isDrawing = false;
  delete canvas.dataset.lastPoint;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

layerSelect.addEventListener('change', () => selectLayer(layerSelect.value));

document.querySelectorAll('[data-tool]').forEach((button) => {
  button.addEventListener('click', () => {
    activeTool = button.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('active', item === button));
    canvas.dataset.tool = activeTool;
  });
});

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    activeView = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
    drawPreview();
  });
});

brushSize.addEventListener('input', () => {
  document.querySelector('#brush-value').value = `${brushSize.value} px`;
});

zoomInput.addEventListener('input', () => {
  const zoom = Number(zoomInput.value);
  canvas.style.width = `${Math.max(100, SIZE.width * zoom / 100)}px`;
  document.querySelector('#zoom-value').value = `${zoom}%`;
});

undoButton.addEventListener('click', () => {
  const previous = history.pop();
  if (!previous) return;
  maskContext.putImageData(previous, 0, 0);
  hasMask = maskContext.getImageData(0, 0, SIZE.width, SIZE.height).data.some((value, index) => index % 4 === 0 && value > 0);
  updateUndo();
  updateMaskState();
  drawPreview();
});

document.querySelector('#clear').addEventListener('click', () => {
  saveUndoState();
  maskContext.fillStyle = '#000000';
  maskContext.fillRect(0, 0, SIZE.width, SIZE.height);
  hasMask = false;
  updateMaskState();
  drawPreview();
});

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  saveUndoState();
  const bitmap = await createImageBitmap(file);
  maskContext.fillStyle = '#000000';
  maskContext.fillRect(0, 0, SIZE.width, SIZE.height);
  maskContext.drawImage(bitmap, 0, 0, bitmap.width, SIZE.height, 0, 0, SIZE.width, SIZE.height);
  bitmap.close();
  hasMask = true;
  importInput.value = '';
  updateMaskState();
  drawPreview();
});

exportButton.addEventListener('click', () => {
  const grayscale = maskContext.getImageData(0, 0, SIZE.width, SIZE.height);
  for (let i = 0; i < grayscale.data.length; i += 4) {
    const value = Math.round((grayscale.data[i] + grayscale.data[i + 1] + grayscale.data[i + 2]) / 3);
    grayscale.data[i] = value;
    grayscale.data[i + 1] = value;
    grayscale.data[i + 2] = value;
    grayscale.data[i + 3] = 255;
  }
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = SIZE.width;
  exportCanvas.height = SIZE.height + 3;
  exportCanvas.getContext('2d').putImageData(grayscale, 0, 0);
  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeLayer.id}.png`;
    link.click();
    URL.revokeObjectURL(link.href);
    maskState.textContent = `Exportada: public/artwork/masks/${activeLayer.id}.png`;
  }, 'image/png');
});

function updateUndo() {
  undoButton.disabled = history.length === 0;
}

function updateMaskState() {
  maskState.textContent = hasMask ? 'Máscara carregada; exporte o PNG para salvá-la no projeto.' : 'A máscara selecionada está vazia.';
}
