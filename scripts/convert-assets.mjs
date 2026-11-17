// Convert + optimize curated source models into public/models/<category>/<id>.glb and upsert src/catalog/catalog.json.
// - rescales to the curated real-world height, recentres to bottom-centre origin (except Blender-authored pieces)
// - dedup/prune/weld, WebP textures (≤512px), quantize + meshopt compression
// Usage: node scripts/convert-assets.mjs [--only=<id,...>]
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, textureCompress, getBounds, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { GROUPS } from './asset-selection.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'assets-raw');
const OUT = path.join(ROOT, 'public', 'models');
const CATALOG = path.join(ROOT, 'src', 'catalog', 'catalog.json');
const exists = (p) => access(p).then(() => true, () => false);

// Kenney Nature/Furniture kits use metallic=1 + pastel base colours tuned for their own renderer.
// Remap by material name to a natural palette that matches the rest of the estate (sRGB hex).
const KENNEY_REMAP = {
  leafsGreen: '#4f8f32', leafsDark: '#2f6b2a', leafsFall: '#c9792a', grass: '#5f9c35', woodBark: '#6b4a2f', woodBarkDark: '#54392a',
  wood: '#8a5d3b', woodDark: '#5c3e28', woodBirch: '#e8e2d4', woodInner: '#c9a77c', stone: '#8e8f8a', stoneDark: '#6c6d69',
  dirt: '#7a5a3a', dirtDark: '#5e4430', water: '#4d7f99', corn: '#e3b94f', colorPurple: '#8d6ad1', colorRed: '#c4453c',
  colorYellow: '#e6c045', colorTan: '#c89a68', colorRedDark: '#9a2e2a', colorWhite: '#f0eee8',
};
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexLinear = (h) => [1, 3, 5].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255));

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const manifest = JSON.parse(await readFile(path.join(RAW, 'quaternius-polypizza', 'manifest.json'), 'utf8'));
const ppEntries = Object.values(manifest);

function resolvePP(spec) {
  let title = spec.slice(3);
  const animated = title.endsWith('*');
  if (animated) title = title.slice(0, -1);
  const m = ppEntries.find((e) => e.title === title && (!animated || e.animated)) ?? ppEntries.find((e) => e.title === title);
  return m ? path.join(RAW, 'quaternius-polypizza', m.file) : null;
}

async function findSource(group, file) {
  if (file.startsWith('pp:')) return resolvePP(file);
  const base = path.join(RAW, group.src, file);
  for (const ext of ['.glb', '.gltf']) if (await exists(base + ext)) return base + ext;
  return null;
}

const existing = (await exists(CATALOG)) ? JSON.parse(await readFile(CATALOG, 'utf8')) : { items: [] };
const byId = new Map(existing.items.map((i) => [i.id, i]));
const missing = [];
let done = 0;

for (const group of GROUPS) {
  for (const [file, id, name, height, extra = {}] of group.items) {
    if (only && !only.includes(id)) continue;
    const src = await findSource(group, file);
    if (!src) { missing.push(`${group.src}/${file}`); continue; }
    const doc = await io.read(src);
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    const isBlender = group.src.startsWith('blender/');
    let b = getBounds(scene);
    const h0 = b.max[1] - b.min[1];
    const s = height && h0 > 0 ? height / h0 : 1;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, minY = b.min[1];
    for (const n of scene.listChildren()) {
      const t = n.getTranslation(), sc = n.getScale();
      if (isBlender) n.setTranslation([t[0] * s, t[1] * s, t[2] * s]);
      else n.setTranslation([(t[0] - cx) * s, (t[1] - minY) * s, (t[2] - cz) * s]);
      n.setScale([sc[0] * s, sc[1] * s, sc[2] * s]);
    }
    // Kenney/Quaternius often ship fully metallic flat materials; normalise for a matte stylised look
    for (const m of doc.getRoot().listMaterials()) {
      const remap = KENNEY_REMAP[m.getName()];
      if (remap && src.includes('kenney') && !m.getBaseColorTexture()) m.setBaseColorFactor([...hexLinear(remap), 1]);
      if (m.getMetallicFactor() > 0.5 && !/metal|iron|gold|steel/i.test(m.getName())) m.setMetallicFactor(0);
      m.setRoughnessFactor(Math.max(0.55, m.getRoughnessFactor()));
      // foliage: alpha-blended leaves sort badly when instanced → alpha-test instead
      if (group.alphaMask && m.getAlphaMode() === 'BLEND') { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.5); }
    }
    // measure before quantization (quantize re-encodes skinned meshes, which skews getBounds)
    const measured = getBounds(scene);
    await doc.transform(
      dedup(), prune(), weld(), resample(),
      // detail maps at 256 px, colour at 512 px (the textured Quaternius packs embed trim sheets in every piece)
      textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(normal|occlusion|metallicRoughness)/, resize: [256, 256] }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
      quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    b = measured;
    const category = group.category;
    const dir = path.join(OUT, category);
    await mkdir(dir, { recursive: true });
    await io.write(path.join(dir, `${id}.glb`), doc);
    const anims = doc.getRoot().listAnimations().map((a) => a.getName());
    const r2 = (v) => Math.round(v * 100) / 100;
    const entry = {
      id, name, category,
      tags: [...new Set([...(group.tags ?? []), ...(extra.tags ?? [])])],
      model: `models/${category}/${id}.glb`,
      scale: 1,
      footprint: [r2(b.max[0] - b.min[0]), r2(b.max[2] - b.min[2])],
      height: r2(b.max[1] - b.min[1]),
      snap: extra.snap ?? group.snap,
      thumb: `thumbs/${id}.webp`,
      ...((extra.roomTypes ?? group.roomTypes) ? { roomTypes: extra.roomTypes ?? group.roomTypes } : {}),
      ...(extra.light ? { light: extra.light } : {}),
      ...(anims.length ? { animations: anims } : {}),
      ...(extra.hidden ? { hidden: true } : {}),
      source: src.includes('kenney') ? 'Kenney' : /quaternius/i.test(src) ? 'Quaternius' : 'Blender (this repo)',
    };
    byId.set(id, { ...byId.get(id), ...entry });
    done++;
    if (done % 20 === 0) console.log(`  ${done} converted…`);
  }
}

const items = [...byId.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
await writeFile(CATALOG, JSON.stringify({ items }, null, 1) + '\n');
console.log(`Converted ${done} models → public/models. Catalog: ${items.length} entries.`);
if (missing.length) console.warn(`Missing sources (${missing.length}):\n  ${missing.join('\n  ')}`);
