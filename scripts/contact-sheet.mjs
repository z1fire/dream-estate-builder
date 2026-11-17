// Dev helper: render a contact sheet of catalog thumbnails. Usage: node scripts/contact-sheet.mjs [start] [count] [out.png]
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const { items } = JSON.parse(readFileSync('src/catalog/catalog.json', 'utf8'));
const [start, count, out] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? 999), process.argv[4] ?? "catalog-sheet.png"];
const sel = items.slice(start, start + count);
const S = 96, cols = 14;
const rows = Math.ceil(sel.length / cols);
const comps = await Promise.all(sel.map(async (it, i) => ({ input: await sharp('public/' + it.thumb).resize(S, S).toBuffer(), left: (i % cols) * S, top: Math.floor(i / cols) * S })));
await sharp({ create: { width: cols * S, height: rows * S, channels: 4, background: '#d8d2c4' } }).composite(comps).png().toFile(out);
console.log(sel.map((s) => s.id).join(' '));
