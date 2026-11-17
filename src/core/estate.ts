import { fbm, type V2 } from './math';
import { uid } from './store';
import { GRID, HALF, VERTS, type EstateDoc } from './types';

export function defaultSettings(): EstateDoc['settings'] {
  return { timeOfDay: 15, dayCycle: false, season: 'summer', weather: 'clear', birds: true, gridSize: 1.524, snap: false };
}

/** Create a new estate with gentle rolling terrain and grass. */
export function newEstate(name: string, boundary: V2[], opts: { hills?: number; seed?: number } = {}): EstateDoc {
  const heights = new Float32Array(VERTS * VERTS);
  const hills = opts.hills ?? 4;
  const seed = opts.seed ?? Math.floor(Math.random() * 1000);
  for (let z = 0; z < VERTS; z++)
    for (let x = 0; x < VERTS; x++) {
      const wx = x - HALF, wz = z - HALF;
      const edge = Math.min(1, (HALF - Math.max(Math.abs(wx), Math.abs(wz))) / 60);
      heights[z * VERTS + x] = (fbm((wx + seed * 13) / 260, (wz - seed * 7) / 260, 4) * hills * 2 + fbm(wx / 60, wz / 60, 2) * hills * 0.15) * edge - 0.6 * (1 - edge);
    }
  const splat = new Uint8Array(GRID * GRID * 12);
  // base: grass, with meadow patches
  for (let z = 0; z < GRID; z++)
    for (let x = 0; x < GRID; x++) {
      const i = (z * GRID + x) * 4;
      const m = fbm((x + seed) / 90, (z - seed) / 90, 3);
      const meadow = Math.max(0, Math.min(1, (m + 0.05) * 3));
      splat[i] = Math.round(255 * (1 - meadow));
      splat[i + 1] = Math.round(255 * meadow);
    }
  return {
    version: 1,
    id: uid('estate'),
    name,
    created: Date.now(),
    modified: Date.now(),
    boundary,
    heights,
    splat,
    water: [], moats: [], paths: [], fences: [], retaining: [],
    vegetation: {},
    objects: [], buildings: [], walls: [], fields: [], pastures: [], animals: [], viewpoints: [],
    settings: defaultSettings(),
  };
}

export function rectBoundary(widthM: number, depthM: number): V2[] {
  const w = Math.min(widthM, 1000) / 2, d = Math.min(depthM, 1000) / 2;
  return [[-w, -d], [w, -d], [w, d], [-w, d]];
}
