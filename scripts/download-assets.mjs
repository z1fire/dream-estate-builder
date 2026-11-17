// Downloads CC0 asset packs into /assets-raw (gitignored).
//  - Kenney kits: uses kenney.nl's signed download-link flow, unzips into assets-raw/kenney/<kit>/
//  - Quaternius: official packs are hosted on itch.io / Google Drive (not scriptable), so we pull the
//    same CC0 models individually from poly.pizza, filtering Creator == Quaternius && Licence CC0.
// Usage: node scripts/download-assets.mjs [--kenney] [--quaternius]   (default: both)
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'assets-raw');
const UA = { 'User-Agent': 'Mozilla/5.0 (asset-downloader)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

const KENNEY_KITS = [
  'castle-kit', 'fantasy-town-kit', 'nature-kit', 'furniture-kit', 'survival-kit',
  'graveyard-kit', 'pirate-kit', 'food-kit', 'mini-dungeon', 'modular-dungeon-kit', 'holiday-kit',
];

const QUATERNIUS_TERMS = [
  // animals
  'horse', 'cow', 'bull', 'sheep', 'goat', 'pig', 'chicken', 'duck', 'dog', 'deer', 'stag', 'donkey', 'alpaca', 'fox', 'bird',
  // nature
  'tree', 'pine', 'birch', 'willow', 'oak', 'bush', 'flower', 'grass', 'rock', 'fern', 'mushroom', 'plant', 'stump', 'log',
  // farm
  'wheat', 'corn', 'pumpkin', 'carrot', 'hay', 'scarecrow', 'farm', 'crop', 'vegetable', 'fence', 'cart', 'wheelbarrow',
  // medieval props & furniture
  'medieval', 'barrel', 'crate', 'bookshelf', 'bed', 'chair', 'table', 'chest', 'cauldron', 'anvil', 'torch', 'candle',
  'banner', 'throne', 'weapon', 'sword', 'shield', 'armor', 'lantern', 'pot', 'well', 'market', 'stall', 'house',
  'windmill', 'statue', 'fountain', 'bench', 'boat', 'bucket', 'sack', 'shelf', 'cabinet', 'stool', 'book',
];

async function fetchText(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, ...opts });
      if (r.ok) return { text: await r.text(), res: r };
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(1000 * (i + 1));
  }
  return null;
}

async function download(url, dest) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

async function kenney(blocked) {
  for (const kit of KENNEY_KITS) {
    const dir = path.join(RAW, 'kenney', kit);
    if (await exists(path.join(dir, '.done'))) { console.log(`[kenney] ${kit} already present`); continue; }
    try {
      if (await exists(path.join(RAW, 'kenney', `${kit}.zip`))) {
        await mkdir(dir, { recursive: true });
        const tar = process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar';
        execFileSync(tar, ['-xf', path.join(RAW, 'kenney', `${kit}.zip`), '-C', dir]);
        await writeFile(path.join(dir, '.done'), new Date().toISOString());
        console.log(`[kenney] ${kit} ✓ (from cached zip)`);
        continue;
      }
      const page = await fetchText(`https://kenney.nl/assets/${kit}`);
      if (!page) throw new Error('page not found');
      if (!/creativecommons\.org\/publicdomain\/zero/.test(page.text)) throw new Error('license is not CC0');
      const id = page.text.match(/data-download-id='([0-9a-f]+)'/)?.[1];
      if (!id) throw new Error('no download id');
      const cookie = (page.res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
      const link = await fetch(`https://kenney.nl/download-link/${id}`, {
        headers: { ...UA, Cookie: cookie, Referer: `https://kenney.nl/assets/${kit}` },
      }).then((r) => r.json());
      await mkdir(dir, { recursive: true });
      const zip = path.join(RAW, 'kenney', `${kit}.zip`);
      if (!(await exists(zip))) await download(link.url, zip);
      // Windows: use the system bsdtar (GNU tar from Git Bash treats "C:" as a remote host)
      const tar = process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar';
      execFileSync(tar, ['-xf', zip, '-C', dir]);
      await writeFile(path.join(dir, '.done'), new Date().toISOString());
      console.log(`[kenney] ${kit} ✓`);
    } catch (e) {
      console.warn(`[kenney] ${kit} FAILED: ${e.message}`);
      blocked.push({ pack: `Kenney ${kit}`, url: `https://kenney.nl/assets/${kit}`, reason: e.message });
    }
    await sleep(500);
  }
}

async function quaternius() {
  const dir = path.join(RAW, 'quaternius-polypizza');
  await mkdir(dir, { recursive: true });
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
  const seen = new Set(Object.keys(manifest));
  const rejected = new Set();
  for (const term of QUATERNIUS_TERMS) {
    const res = await fetchText(`https://poly.pizza/search/${encodeURIComponent(term)}`);
    if (!res) continue;
    const ids = [...new Set([...res.text.matchAll(/\/m\/([A-Za-z0-9_-]{10})/g)].map((m) => m[1]))];
    let got = 0;
    for (const id of ids) {
      if (seen.has(id) || rejected.has(id)) continue;
      await sleep(250);
      const page = await fetchText(`https://poly.pizza/m/${id}`);
      const m = page?.text.match(/"Title":"([^"]+)","UploadDate":"[^"]*","ResourceID":"([0-9a-f-]+)".*?"Creator":\{"Username":"([^"]+)".*?"Category":"([^"]*)","Tags":\[([^\]]*)\].*?"Licence":"([^"]+)","Animated":(true|false)/s);
      if (!m) { rejected.add(id); continue; }
      const [, title, resId, creator, category, tags, licence, animated] = m;
      if (creator !== 'Quaternius' || !/^CC0/.test(licence)) { rejected.add(id); continue; }
      const safe = title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const file = `${safe}_${id}.glb`;
      try {
        await download(`https://static.poly.pizza/${resId}.glb`, path.join(dir, file));
        manifest[id] = { title, file, category, tags: JSON.parse(`[${tags}]`), animated: animated === 'true', licence, term, source: `https://poly.pizza/m/${id}` };
        seen.add(id);
        got++;
      } catch (e) {
        console.warn(`[quaternius] ${title} failed: ${e.message}`);
      }
    }
    console.log(`[quaternius] "${term}": +${got} (total ${seen.size})`);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

const args = process.argv.slice(2);
const all = args.length === 0;
const blocked = [];
await mkdir(RAW, { recursive: true });
if (all || args.includes('--kenney')) await kenney(blocked);
if (all || args.includes('--quaternius')) await quaternius();
await writeFile(path.join(RAW, 'blocked.json'), JSON.stringify(blocked, null, 2));
console.log(`Done. Blocked: ${blocked.length}`);
