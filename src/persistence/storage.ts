import { deflate, inflate, strToU8, strFromU8 } from 'fflate';
import { get, set, del } from 'idb-keyval';
import { defaultSettings } from '../core/estate';
import type { EstateDoc } from '../core/types';
import { GRID, VERTS } from '../core/types';

/** Persisted record in IndexedDB (binary layers compressed). */
interface StoredEstate {
  meta: EstateMeta;
  json: string; // doc without heights/splat
  heightsZ: Uint8Array;
  splatZ: Uint8Array;
}
export interface EstateMeta { id: string; name: string; modified: number; thumb?: string }

const INDEX = 'deb:index';
const LAST = 'deb:last';
const key = (id: string) => `deb:estate:${id}`;

const z = (u: Uint8Array, level: 1 | 6 = 6) => new Promise<Uint8Array>((res, rej) => deflate(u, { level }, (e, d) => (e ? rej(e) : res(d))));
const unz = (u: Uint8Array) => new Promise<Uint8Array>((res, rej) => inflate(u, (e, d) => (e ? rej(e) : res(d))));

function splitDoc(doc: EstateDoc) {
  const { heights, splat, ...rest } = doc;
  return { rest, heights, splat };
}

/** Fill in defaults for docs saved by older versions. */
function upgrade(rest: any): Omit<EstateDoc, 'heights' | 'splat'> {
  const keys = ['water', 'moats', 'paths', 'fences', 'retaining', 'objects', 'buildings', 'walls', 'fields', 'pastures', 'animals', 'viewpoints'];
  for (const k of keys) rest[k] ??= [];
  rest.vegetation ??= {};
  rest.settings = { ...defaultSettings(), ...(rest.settings ?? {}) };
  rest.boundary ??= [];
  rest.version = 1;
  return rest;
}

export async function listEstates(): Promise<EstateMeta[]> {
  return ((await get(INDEX)) as EstateMeta[] | undefined) ?? [];
}

export async function saveEstate(doc: EstateDoc, thumb?: string): Promise<void> {
  const { rest, heights, splat } = splitDoc(doc);
  const rec: StoredEstate = {
    meta: { id: doc.id, name: doc.name, modified: Date.now(), thumb },
    json: JSON.stringify(rest),
    heightsZ: await z(new Uint8Array(heights.buffer.slice(0)), 1),
    splatZ: await z(splat.slice(), 1),
  };
  await set(key(doc.id), rec);
  const idx = (await listEstates()).filter((m) => m.id !== doc.id);
  const prev = (await listEstates()).find((m) => m.id === doc.id);
  idx.unshift({ ...rec.meta, thumb: thumb ?? prev?.thumb });
  await set(INDEX, idx);
  await set(LAST, doc.id);
}

export async function loadEstate(id: string): Promise<EstateDoc | null> {
  const rec = (await get(key(id))) as StoredEstate | undefined;
  if (!rec) return null;
  const rest = upgrade(JSON.parse(rec.json));
  const hb = await unz(rec.heightsZ);
  const heights = new Float32Array(hb.buffer, hb.byteOffset, hb.byteLength / 4).slice();
  const splat = (await unz(rec.splatZ)).slice();
  if (heights.length !== VERTS * VERTS || splat.length !== GRID * GRID * 12) throw new Error('Corrupt estate data');
  await set(LAST, id);
  return { ...rest, heights, splat } as EstateDoc;
}

export async function deleteEstate(id: string) {
  await del(key(id));
  await set(INDEX, (await listEstates()).filter((m) => m.id !== id));
}

export async function lastEstateId(): Promise<string | null> {
  return ((await get(LAST)) as string | undefined) ?? null;
}

// ---------- JSON export / import ----------
function b64(u: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode(...u.subarray(i, i + CH));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export async function exportEstateJSON(doc: EstateDoc): Promise<string> {
  const { rest, heights, splat } = splitDoc(doc);
  return JSON.stringify({
    format: 'dream-estate-builder',
    version: 1,
    exported: new Date().toISOString(),
    doc: rest,
    heights: b64(await z(new Uint8Array(heights.buffer.slice(0)))),
    splat: b64(await z(splat.slice())),
  });
}

export async function importEstateJSON(text: string): Promise<EstateDoc> {
  const j = JSON.parse(text);
  if (j.format !== 'dream-estate-builder') throw new Error('Not a Dream Estate Builder file');
  const rest = upgrade(j.doc);
  const hb = await unz(unb64(j.heights));
  const heights = new Float32Array(hb.buffer, hb.byteOffset, hb.byteLength / 4).slice();
  const splat = (await unz(unb64(j.splat))).slice();
  if (heights.length !== VERTS * VERTS || splat.length !== GRID * GRID * 12) throw new Error('File data has the wrong size');
  return { ...rest, heights, splat } as EstateDoc;
}

export function downloadText(name: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => res(inp.files?.[0] ?? null);
    inp.click();
  });
}

export { strToU8, strFromU8 };
