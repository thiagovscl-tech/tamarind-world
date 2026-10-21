import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const MODEL_DIR = path.resolve('public/artwork/models');
const CLI = path.resolve('node_modules/@gltf-transform/cli/bin/cli.js');

// Runtime assets added after the first optimization pass. Source files remain
// untouched for rollback; only the generated *.web.glb files are referenced.
const jobs = [
  {
    input: 'architecture_landmark.glb',
    output: 'architecture_landmark.web.glb',
    textureSize: 1024,
  },
  {
    input: 'fantastic_castle.glb',
    output: 'fantastic_castle.web.glb',
    textureSize: 512,
  },
  {
    input: 'free_battlemage_wizard.glb',
    output: 'free_battlemage_wizard.web.glb',
    textureSize: 512,
  },
  {
    input: 'arvore.glb',
    output: 'arvore.runtime.web.glb',
    textureSize: 512,
    simplifyRatio: 0.22,
    simplifyError: 0.002,
    keepTreeLod0Only: true,
  },
];

async function createTreeRuntimeSource(inputPath) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read(inputPath);
  const root = document.getRoot();
  const lod0 = root.listNodes().find((node) => node.getName().includes('LOD0'));
  if (!lod0?.getMesh()) throw new Error('LOD0 da árvore não encontrado.');

  root.listNodes().filter((node) => node !== lod0).forEach((node) => node.dispose());
  const mesh = lod0.getMesh();
  mesh.listPrimitives().forEach((primitive) => {
    if (primitive.getMaterial()?.getName() === 'Rose Bush Leaves') {
      mesh.removePrimitive(primitive);
      primitive.dispose();
    }
  });
  await document.transform(prune());
  const preparedPath = path.join(os.tmpdir(), 'tamarind-tree-lod0.glb');
  await io.write(preparedPath, document);
  return preparedPath;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => (
      code === 0 ? resolve() : reject(new Error(`glTF Transform encerrou com código ${code}`))
    ));
  });
}

const results = [];
for (const job of jobs) {
  const inputPath = path.join(MODEL_DIR, job.input);
  const outputPath = path.join(MODEL_DIR, job.output);
  const before = (await fs.stat(inputPath)).size;
  const runtimeInputPath = job.keepTreeLod0Only
    ? await createTreeRuntimeSource(inputPath)
    : inputPath;
  console.log(`\n[runtime-optimize] ${job.input} → ${job.output}`);
  const args = [
    'optimize', runtimeInputPath, outputPath,
    '--compress', 'meshopt',
    '--meshopt-level', 'high',
    '--flatten', 'false',
    '--join', 'false',
    '--palette', 'false',
    '--instance', 'false',
    '--simplify', job.simplifyRatio ? 'true' : 'false',
    '--resample', 'false',
    '--prune', 'true',
    '--prune-attributes', 'true',
    '--prune-solid-textures', 'false',
    '--sparse', 'true',
    '--weld', 'true',
    '--texture-compress', 'webp',
    '--texture-size', String(job.textureSize),
  ];
  if (job.simplifyRatio) {
    args.push(
      '--simplify-ratio', String(job.simplifyRatio),
      '--simplify-error', String(job.simplifyError),
      '--simplify-lock-border', 'true',
    );
  }
  await run(args);
  if (runtimeInputPath !== inputPath) await fs.unlink(runtimeInputPath).catch(() => {});
  const after = (await fs.stat(outputPath)).size;
  results.push({
    ...job,
    before,
    after,
    reduction: before - after,
    reductionPercent: (1 - after / before) * 100,
  });
}

await fs.mkdir(path.resolve('reports'), { recursive: true });
await fs.writeFile(
  path.resolve('reports/runtime-glb-optimization.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.table(results.map(({ input, output, before, after, reductionPercent }) => ({
  input,
  output,
  beforeMB: (before / 1024 / 1024).toFixed(2),
  afterMB: (after / 1024 / 1024).toFixed(2),
  reduction: `${reductionPercent.toFixed(1)}%`,
})));
