import { writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import https from 'https';
import http from 'http';

const dir = resolve(process.cwd(), 'packages/pwa/public/icons');
mkdirSync(dir, { recursive: true });

function download(url, filepath) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, filepath).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        writeFileSync(filepath, Buffer.concat(chunks));
        console.log(`${filepath}: ${Buffer.concat(chunks).length} bytes (status ${res.statusCode})`);
        resolve();
      });
    }).on('error', (e) => { console.error(`${url}: ${e.message}`); resolve(); });
  });
}

async function main() {
  await download('https://bsky.app/favicon.ico', resolve(dir, 'favicon.ico'));
  await download('https://bsky.app/apple-touch-icon.png', resolve(dir, 'apple-touch-icon.png'));
  // Also try to get a larger icon from the website
  await download('https://bsky.app/favicon.svg', resolve(dir, 'icon.svg'));
  
  // For PWA, we need 192x192 and 512x512 PNGs. 
  // Use google favicon service as fallback for small sizes
  await download('https://www.google.com/s2/favicons?domain=bsky.app&sz=64', resolve(dir, 'icon-64.png'));
  await download('https://www.google.com/s2/favicons?domain=bsky.app&sz=192', resolve(dir, 'icon-192.png'));
  await download('https://www.google.com/s2/favicons?domain=bsky.app&sz=512', resolve(dir, 'icon-512.png'));
  
  console.log('\nDone. Files:');
  for (const f of readdirSync(dir)) {
    console.log(`  ${f}: ${statSync(resolve(dir, f)).size} bytes`);
  }
}

main().catch(console.error);
