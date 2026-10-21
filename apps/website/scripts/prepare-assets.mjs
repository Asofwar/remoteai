import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const destination = fileURLToPath(new URL('../public/media/', import.meta.url));
const screenshots = [
  'codex-gui',
  'dashboard',
  'conversations',
  'providers',
  'token-usage',
  'dream-skin',
  'skills',
  'two-factor',
  'floating-usage',
  'floating-usage-expanded',
];

await mkdir(destination, { recursive: true });
for (const name of screenshots) {
  const source = `${root}/docs/assets/codex-switch-${name}.png`;
  await sharp(source)
    .resize({ width: 1700, withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(`${destination}/${name}.webp`);
  await sharp(source)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(`${destination}/${name}-small.webp`);
}
await sharp(`${root}/docs/assets/codex-switch-logo.png`).resize(192, 192).png().toFile(`${destination}/logo.png`);
await sharp(`${root}/docs/assets/codex-switch-logo.png`).resize(48, 48).png().toFile(`${destination}/favicon.png`);
await copyFile(`${root}/docs/assets/codex-switch-codex-gui.png`, `${destination}/social-preview.png`);
console.log('Prepared optimized product screenshots and brand assets.');
