import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MODEL_DIR = path.resolve('public/artwork/models');
const CLI = path.resolve('node_modules/@gltf-transform/cli/bin/cli.js');
const jobs = [
  { input: 'ilha_texturizada.glb', output: 'ilha_texturizada.web.glb', textureSize: 512 },
  { input: 'casanovatecnomago.glb', output: 'casanovatecnomago.web.glb', textureSize: 1024 },
  { input: 'basilica_texturizada.glb', output: 'basilica_texturizada.web.glb', textureSize: 512 },
  { input: 'arquiteturaColiseu_texturizado.glb', output: 'arquiteturaColiseu_texturizado.web.glb', textureSize: 512 },
  { input: 'casteloSite.glb', output: 'casteloSite.web.glb', textureSize: 1024, simplifyRatio: 0.55 },
  { input: 'templo.glb', output: 'templo.web.glb', textureSize: 1024 },
  { input: 'casasite.glb', output: 'casasite.web.glb', textureSize: 1024 },
  { input: 'arvore.glb', output: 'arvore.web.glb', textureSize: 1024, simplifyRatio: 0.35 },
  { input: 'bode_rigged.glb', output: 'bode_rigged.web.glb', textureSize: 1024, preserveAnimation: true },
];

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
  console.log(`\n[optimize] ${job.input} → ${job.output}`);
  const args = [
    'optimize', inputPath, outputPath,
    '--compress', 'meshopt',
    '--meshopt-level', 'high',
    '--flatten', 'false',
    '--join', 'false',
    '--palette', 'false',
    '--instance', 'false',
    '--simplify', job.simplifyRatio ? 'true' : 'false',
    '--resample', job.preserveAnimation ? 'false' : 'true',
    '--prune', 'true',
    '--prune-attributes', 'true',
    // Preserve even solid-color source textures to avoid subtle material changes.
    '--prune-solid-textures', 'false',
    '--sparse', 'true',
    '--weld', 'true',
    '--texture-compress', 'webp',
    '--texture-size', String(job.textureSize),
  ];
  if (job.simplifyRatio) {
    args.push(
      '--simplify-ratio', String(job.simplifyRatio),
      '--simplify-error', '0.0005',
      '--simplify-lock-border', 'true',
    );
  }
  await run(args);
  const after = (await fs.stat(outputPath)).size;
  results.push({ ...job, before, after, reduction: before - after, reductionPercent: (1 - after / before) * 100 });
}

await fs.mkdir(path.resolve('reports'), { recursive: true });
await fs.writeFile(
  path.resolve('reports/glb-optimization.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log('\n[optimize] todas as variantes web foram geradas.');
