// npm run build:assets — full asset pipeline:
//   1. download CC0 packs into assets-raw/ (skips what's already there)
//   2. run Blender generator scripts headless (blender/*.py → assets-raw/blender/)
//   3. convert + optimize into public/models + update src/catalog/catalog.json
//   4. render thumbnails into public/thumbs
// Flags: --skip-download --skip-blender --force-thumbs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const run = (cmd, a) => execFileSync(cmd, a, { stdio: 'inherit', cwd: ROOT });

export function findBlender() {
  if (process.env.BLENDER_PATH && existsSync(process.env.BLENDER_PATH)) return process.env.BLENDER_PATH;
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const p = execFileSync(which, ['blender'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    if (p) return p;
  } catch { /* not on PATH */ }
  const candidates = process.platform === 'win32'
    ? (() => {
      const base = 'C:/Program Files/Blender Foundation';
      if (!existsSync(base)) return [];
      return readdirSync(base).sort().reverse().map((d) => `${base}/${d}/blender.exe`);
    })()
    : process.platform === 'darwin' ? ['/Applications/Blender.app/Contents/MacOS/Blender'] : ['/usr/bin/blender', '/snap/bin/blender'];
  return candidates.find((c) => existsSync(c)) ?? null;
}

if (!args.includes('--skip-download')) {
  console.log('▶ Downloading asset packs (cached ones are skipped)…');
  run('node', ['scripts/download-assets.mjs']);
}

if (!args.includes('--skip-blender')) {
  const blender = findBlender();
  if (!blender) {
    console.warn('⚠ Blender not found (set BLENDER_PATH or add it to PATH). Using previously generated Blender assets if present.');
  } else {
    console.log(`▶ Generating Blender assets with ${blender}`);
    const out = path.join(ROOT, 'assets-raw', 'blender');
    for (const script of ['generate_castle.py', 'generate_furniture.py', 'generate_farm_garden.py', 'generate_chinese.py']) {
      run(blender, ['--background', '--factory-startup', '--python', path.join(ROOT, 'blender', script), '--', out]);
    }
  }
}

console.log('▶ Converting + optimizing models…');
run('node', ['scripts/convert-assets.mjs']);
console.log('▶ Rendering thumbnails…');
run('node', ['scripts/gen-thumbnails.mjs', ...(args.includes('--force-thumbs') ? ['--force'] : [])]);
console.log('✔ Assets built.');
