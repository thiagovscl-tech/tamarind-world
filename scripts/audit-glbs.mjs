import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const MODEL_DIR = path.resolve('public/artwork/models');
const REPORT_DIR = path.resolve('reports');
const reportPhase = process.argv[2] === 'after' ? 'after' : 'before';
const ACTIVE_MODELS = [
  'ilha_texturizada.glb',
  'casanovatecnomago.glb',
  'basilica_texturizada.glb',
  'arquiteturaColiseu_texturizado.glb',
  'casteloSite.glb',
  'templo.glb',
  'casasite.glb',
  'arvore.glb',
  'bode_rigged.glb',
];
const ACTIVE_WEB_MODELS = new Set(ACTIVE_MODELS.map((name) => name.replace(/\.glb$/i, '.web.glb')));
const ACTIVE_RUNTIME_MODELS = new Set([
  'ilha_texturizada.web.glb',
  'casanovatecnomago.web.glb',
  'architecture_landmark.web.glb',
  'basilica_texturizada.web.glb',
  'arvore.runtime.web.glb',
  'templo.web.glb',
  'casasite.web.glb',
  'fantastic_castle.web.glb',
  'bode_rigged.web.glb',
  'free_battlemage_wizard.web.glb',
]);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function accessorHash(accessor) {
  if (!accessor) return 'none';
  const array = accessor.getArray();
  if (!array) return 'empty';
  return crypto
    .createHash('sha1')
    .update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
    .digest('hex');
}

function primitiveSignature(primitive) {
  const attributes = primitive.listSemantics()
    .sort()
    .map((semantic) => `${semantic}:${accessorHash(primitive.getAttribute(semantic))}`)
    .join('|');
  return `${primitive.getMode()}|${accessorHash(primitive.getIndices())}|${attributes}`;
}

async function inspectModel(fileName) {
  const filePath = path.join(MODEL_DIR, fileName);
  const stat = await fs.stat(filePath);
  const document = await io.read(filePath);
  const root = document.getRoot();
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const textures = root.listTextures();
  const animations = root.listAnimations();
  const skins = root.listSkins();
  const nodes = root.listNodes();
  let triangles = 0;
  let primitives = 0;
  const signatures = new Map();

  for (const mesh of meshes) {
    const meshSignature = [];
    for (const primitive of mesh.listPrimitives()) {
      primitives += 1;
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      triangles += Math.floor((indices?.getCount() ?? position?.getCount() ?? 0) / 3);
      meshSignature.push(primitiveSignature(primitive));
    }
    const signature = meshSignature.join('::');
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }

  const duplicateMeshes = [...signatures.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const zeroScaleNodes = nodes.filter((node) => {
    const scale = node.getScale();
    return Math.abs(scale[0] * scale[1] * scale[2]) < 1e-8;
  }).length;
  const transparentInvisibleMaterials = materials.filter((material) => (
    material.getAlphaMode() === 'BLEND' && material.getBaseColorFactor()[3] <= 0.001
  )).length;

  const textureDetails = [];
  for (const texture of textures) {
    const image = texture.getImage();
    let width = null;
    let height = null;
    if (image) {
      try {
        const metadata = await sharp(image).metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;
      } catch {
        // Keep null dimensions for unsupported or malformed embedded images.
      }
    }
    textureDetails.push({
      name: texture.getName() || '(sem nome)',
      mimeType: texture.getMimeType() || 'desconhecido',
      width,
      height,
      bytes: image?.byteLength ?? 0,
    });
  }

  const extensions = root.listExtensionsUsed().map((extension) => extension.extensionName);
  return {
    name: fileName,
    active: ACTIVE_MODELS.includes(fileName)
      || ACTIVE_WEB_MODELS.has(fileName)
      || ACTIVE_RUNTIME_MODELS.has(fileName),
    bytes: stat.size,
    size: formatBytes(stat.size),
    meshes: meshes.length,
    primitives,
    triangles,
    materials: materials.length,
    textures: textureDetails,
    duplicateMeshes,
    zeroScaleNodes,
    transparentInvisibleMaterials,
    animations: animations.length,
    skins: skins.length,
    bones: skins.reduce((total, skin) => total + skin.listJoints().length, 0),
    extensions,
    compressionCandidate: !extensions.includes('EXT_meshopt_compression'),
  };
}

await fs.mkdir(REPORT_DIR, { recursive: true });
const files = (await fs.readdir(MODEL_DIR))
  .filter((fileName) => fileName.toLowerCase().endsWith('.glb'))
  .filter((fileName) => reportPhase === 'after' ? fileName.endsWith('.web.glb') : !fileName.endsWith('.web.glb'))
  .sort((a, b) => {
    const ai = ACTIVE_MODELS.indexOf(a);
    const bi = ACTIVE_MODELS.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
  });

const report = [];
for (const fileName of files) {
  console.log(`[audit] ${fileName}`);
  report.push(await inspectModel(fileName));
}

await fs.writeFile(
  path.join(REPORT_DIR, `glb-audit.${reportPhase}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);

const rows = report.map((item) => {
  const resolutions = item.textures
    .map((texture) => `${texture.width ?? '?'}x${texture.height ?? '?'} ${texture.mimeType.replace('image/', '')}`)
    .join('<br>') || '—';
  return `| ${item.name} | ${item.active ? 'sim' : 'não'} | ${item.size} | ${item.meshes} | ${item.triangles.toLocaleString('pt-BR')} | ${item.materials} | ${item.textures.length} | ${resolutions} | ${item.duplicateMeshes} | ${item.zeroScaleNodes + item.transparentInvisibleMaterials} | ${item.animations} | ${item.skins} | ${item.compressionCandidate ? 'sim' : 'já usa Meshopt'} |`;
});

const markdown = `# Auditoria GLB — ${reportPhase === 'after' ? 'depois' : 'antes'} da otimização\n\n| GLB | ativo | tamanho | meshes | triângulos | materiais | texturas | resoluções | meshes duplicadas | invisíveis (heurística) | animações | skins | compressão |\n|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|\n${rows.join('\n')}\n`;
await fs.writeFile(path.join(REPORT_DIR, `glb-audit.${reportPhase}.md`), markdown);
console.log(`[audit] concluída: ${report.length} GLBs`);
