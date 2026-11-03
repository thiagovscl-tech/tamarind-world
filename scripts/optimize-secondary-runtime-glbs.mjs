import path from 'node:path';
import { spawn } from 'node:child_process';

const modelDir = path.resolve('public/artwork/models');
const cli = path.resolve('node_modules/@gltf-transform/cli/bin/cli.js');
const jobs = [
  {
    input: 'campfire.web.glb',
    output: 'campfire.runtime.web.glb',
    textureSize: 512,
  },
  {
    input: 'roman_temple.glb',
    output: 'roman_temple.web.glb',
    textureSize: 1024,
  },
];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => (
      code === 0 ? resolve() : reject(new Error(`glTF Transform encerrou com código ${code}`))
    ));
  });
}

for (const job of jobs) {
  await run([
    'optimize',
    path.join(modelDir, job.input),
    path.join(modelDir, job.output),
    '--compress', 'meshopt',
    '--meshopt-level', 'high',
    '--flatten', 'false',
    '--join', 'false',
    '--palette', 'false',
    '--instance', 'false',
    '--simplify', 'false',
    '--resample', 'false',
    '--prune', 'true',
    '--prune-attributes', 'true',
    '--prune-solid-textures', 'false',
    '--sparse', 'true',
    '--weld', 'true',
    '--texture-compress', 'webp',
    '--texture-size', String(job.textureSize),
  ]);
}
