// Render a WebP thumbnail for each catalog entry (public/thumbs/<id>.webp) using a headless browser.
// Usage: node scripts/gen-thumbnails.mjs [--force]
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const force = process.argv.includes('--force');
const exists = (p) => access(p).then(() => true, () => false);
const { items } = JSON.parse(await readFile(path.join(ROOT, 'src/catalog/catalog.json'), 'utf8'));
await mkdir(path.join(ROOT, 'public/thumbs'), { recursive: true });

const server = await createServer({ root: ROOT, server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('http://localhost:5199/dream-estate-builder/tools/thumbs.html');
await page.waitForFunction(() => window.thumbsReady === true, null, { timeout: 60000 });
let n = 0;
for (const it of items) {
  const out = path.join(ROOT, 'public', it.thumb);
  if (!force && (await exists(out))) continue;
  try {
    const url = await page.evaluate((m) => window.renderThumb(m), it.model);
    await writeFile(out, Buffer.from(url.split(',')[1], 'base64'));
    n++;
  } catch (e) {
    console.warn(`thumb failed for ${it.id}: ${e.message}`);
  }
}
await browser.close();
await server.close();
console.log(`Rendered ${n} thumbnails.`);
