import sharp from 'sharp';

const jobs = [
  ['public/artwork/ui/logotamarindPNG.png', 'public/artwork/ui/logotamarind.runtime.webp', 512],
  ['public/artwork/ui/icone-videos-ia.png', 'public/artwork/ui/icone-videos-ia.runtime.webp', 256],
  ['public/artwork/ui/icone-app-web.png', 'public/artwork/ui/icone-app-web.runtime.webp', 256],
  ['public/artwork/ui/icone-3d-arquitetura.png', 'public/artwork/ui/icone-3d-arquitetura.runtime.webp', 256],
];

for (const [input, output, width] of jobs) {
  await sharp(input)
    .resize({ width, withoutEnlargement: true })
    .webp({ lossless: true, effort: 6 })
    .toFile(output);
}
