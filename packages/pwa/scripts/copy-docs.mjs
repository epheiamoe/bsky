import { copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..', '..');
const dist = resolve(__dirname, '..', 'dist');

const files = [
  ['README.md', 'README.md'],
  ['CHANGELOG.md', 'CHANGELOG.md'],
];

for (const [src, dest] of files) {
  const srcPath = resolve(root, src);
  const destPath = resolve(dist, dest);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`Copied: ${src} → dist/${dest}`);
  } else {
    console.warn(`Warning: ${srcPath} not found, skipping`);
  }
}
