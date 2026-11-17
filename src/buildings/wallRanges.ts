import type { App } from '../app/App';
import type { V2 } from '../core/math';
import { uid } from '../core/store';
import type { BuildingDef, BuildingKind, CurtainWallDef, PlacedObject } from '../core/types';
import { DEFAULT_PROGRAM, furnishBuilding, generatePlan } from '../interiors/planGenerator';
import { segmentNormal } from './CurtainWallSystem';
import { footprint, totalHeight } from './footprint';
import { makeBuilding } from './presets';
import { setFloors } from './BuildingTools';

/**
 * Wall ranges: long buildings set against the inside of a curtain wall (stables, barracks, lodgings, storerooms…),
 * the way real castles line their baileys. Their back is a blank wall against the curtain, the roof is a lean-to
 * tucked under the wall-walk, and an arcade can run along the courtyard front.
 */
export type RangeUse = 'lodgings' | 'stables' | 'barracks' | 'storerooms' | 'workshops' | 'hall';
export const RANGE_USES: [RangeUse, string][] = [
  ['lodgings', 'Lodgings (furnished home)'], ['stables', 'Stables'], ['barracks', 'Barracks'], ['storerooms', 'Storerooms'], ['workshops', 'Workshops'], ['hall', 'Hall'],
];
const USE_KIND: Record<RangeUse, [BuildingKind, string]> = {
  lodgings: ['range', 'Lodging Range'], stables: ['stables', 'Stable Range'], barracks: ['barracks', 'Barrack Range'],
  storerooms: ['storehouse', 'Storehouse Range'], workshops: ['workshop', 'Workshop Range'], hall: ['great_hall', 'Hall Range'],
};

export interface RangeOpts {
  /** one use for every range, or a list used in turn */
  use: RangeUse | RangeUse[];
  depth: number;
  storeys: number;
  /** arcade depth in front (0 = none) */
  arcade: number;
  /** 1 = inside (default), -1 = outside, 0 = both sides (useful for a cross wall) */
  side?: 1 | -1 | 0;
  /** only these segment indices */
  segments?: number[];
  maxLength?: number;
}

/** Settings remembered by the wall inspector. */
export const rangeDefaults: RangeOpts & { use: RangeUse } = { use: 'lodgings', depth: 8, storeys: 2, arcade: 2.6 };

/** World-space footprint polygon of a building, including its arcade. */
export function buildingPoly(b: BuildingDef): V2[] {
  const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
  let pts = footprint(b);
  const arc = Number(b.extra.arcade ?? 0);
  if (arc > 0 && b.shape === 'rect') { const w = b.width / 2, d = b.depth / 2; pts = [[-w, -d], [w, -d], [w, d + arc], [-w, d + arc]]; }
  return pts.map(([x, z]) => [b.pos[0] + x * c + z * s, b.pos[2] - x * s + z * c] as V2);
}

/** Turn a building into one that backs onto a wall: blank back wall, lean-to roof tucked under the wall-walk. */
export function backOntoWall(b: BuildingDef, wallHeight?: number) {
  b.extra.backToWall = true;
  b.openings = b.openings.filter((o) => o.wall !== 'ext:0');
  if (b.shape !== 'rect') return;
  const top = totalHeight(b);
  if (wallHeight !== undefined && top > wallHeight + 0.5) return; // taller than the wall: keep its own roof
  b.roof = 'lean';
  b.crenellations = false;
  b.extra.thatch = false;
  const r = (wallHeight ?? top + 3) + 0.2 - top;
  b.extra.roofRise = Math.round((r > 1.2 ? Math.min(r, b.depth * 0.8) : Math.min(4, b.depth * 0.45)) * 10) / 10;
}

interface Frame { a: V2; dir: V2; inward: V2; L: number }
function frame(w: CurtainWallDef, i: number, side: 1 | -1): Frame {
  const a = w.points[i], b = w.points[(i + 1) % w.points.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n = segmentNormal(w, i);
  return { a, dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], inward: side > 0 ? [-n[0], -n[1]] : [n[0], n[1]], L };
}
const segCount = (w: CurtainWallDef) => (w.closed ? w.points.length : w.points.length - 1);

/** Nearest wall face for a building of this depth near (x,z): where to put its centre and how to turn it (back to the wall). */
export function snapToWall(app: App, x: number, z: number, depth: number): { x: number; z: number; rotY: number; wall: CurtainWallDef } | null {
  let best: { x: number; z: number; rotY: number; wall: CurtainWallDef; d: number } | null = null;
  for (const w of app.store.doc.walls) {
    for (let i = 0; i < segCount(w); i++) for (const side of [1, -1] as const) {
      const f = frame(w, i, side);
      const s = (x - f.a[0]) * f.dir[0] + (z - f.a[1]) * f.dir[1];
      const y = (x - f.a[0]) * f.inward[0] + (z - f.a[1]) * f.inward[1];
      const off = w.thickness / 2 + 0.05 + depth / 2;
      const d = Math.abs(y - off);
      if (s < 1 || s > f.L - 1 || y < w.thickness / 2 - 1 || d > depth / 2 + 4) continue;
      if (!best || d < best.d) best = { x: f.a[0] + f.dir[0] * s + f.inward[0] * off, z: f.a[1] + f.dir[1] * s + f.inward[1] * off, rotY: Math.atan2(f.inward[0], f.inward[1]), wall: w, d };
    }
  }
  return best;
}

/** Fill the free stretches along a wall (between towers, gatehouses, cross walls and existing buildings) with ranges. */
export function lineWallWithRanges(app: App, w: CurtainWallDef, opts: RangeOpts, doc: { buildings: BuildingDef[]; walls: CurtainWallDef[] } = app.store.doc): { buildings: BuildingDef[]; objects: PlacedObject[] } {
  const buildings: BuildingDef[] = [], objects: PlacedObject[] = [];
  const obstacles: V2[][] = doc.buildings.map(buildingPoly);
  // other walls (and this wall's other sides) are obstacles too
  const walls = doc.walls.some((x) => x.id === w.id) ? doc.walls : [...doc.walls, w];
  const wallSegs: { wall: CurtainWallDef; i: number; a: V2; b: V2; t: number }[] = [];
  for (const x of walls) for (let i = 0; i < segCount(x); i++) wallSegs.push({ wall: x, i, a: x.points[i], b: x.points[(i + 1) % x.points.length], t: x.thickness });
  const sides: (1 | -1)[] = opts.side === 0 ? [1, -1] : [opts.side ?? 1];
  const uses = Array.isArray(opts.use) ? opts.use : [opts.use];
  const maxLen = opts.maxLength ?? 30;
  let count = 0;
  for (const side of sides) {
    for (let i = 0; i < segCount(w); i++) {
      if (opts.segments && !opts.segments.includes(i)) continue;
      const f = frame(w, i, side);
      const y0 = w.thickness / 2 + 0.05, y1 = y0 + opts.depth + opts.arcade;
      const SY = (p: V2): V2 => [(p[0] - f.a[0]) * f.dir[0] + (p[1] - f.a[1]) * f.dir[1], (p[0] - f.a[0]) * f.inward[0] + (p[1] - f.a[1]) * f.inward[1]];
      const blocked: [number, number][] = [];
      const block = (pts: V2[], closed: boolean, margin: number) => {
        let lo = Infinity, hi = -Infinity;
        const n = closed ? pts.length : pts.length - 1;
        for (let k = 0; k < n; k++) {
          const p = pts[k], q = pts[(k + 1) % pts.length];
          const steps = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.5));
          for (let j = 0; j <= steps; j++) {
            const [s, y] = SY([p[0] + ((q[0] - p[0]) * j) / steps, p[1] + ((q[1] - p[1]) * j) / steps]);
            if (y >= y0 - 0.3 && y <= y1 + 0.6) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
          }
        }
        if (lo <= hi) blocked.push([lo - margin, hi + margin]);
      };
      for (const p of obstacles) block(p, true, 0.6);
      for (const s of wallSegs) {
        if (s.wall.id === w.id && s.i === i) continue;
        const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
        const nx = (-(s.b[1] - s.a[1]) / L) * s.t / 2, nz = ((s.b[0] - s.a[0]) / L) * s.t / 2;
        block([[s.a[0] + nx, s.a[1] + nz], [s.b[0] + nx, s.b[1] + nz], [s.b[0] - nx, s.b[1] - nz], [s.a[0] - nx, s.a[1] - nz]], true, 0.3);
      }
      // free intervals along [0, L]
      blocked.sort((p, q) => p[0] - q[0]);
      const free: [number, number][] = [];
      let cur = 0;
      for (const [lo, hi] of blocked) { if (lo > cur) free.push([cur, Math.min(lo, f.L)]); cur = Math.max(cur, hi); if (cur >= f.L) break; }
      if (cur < f.L) free.push([cur, f.L]);
      for (const [s0, s1] of free) {
        const len = s1 - s0;
        if (len < 6) continue;
        const n = Math.ceil(len / maxLen), gap = 0.4;
        const piece = (len - gap * (n - 1)) / n;
        for (let k = 0; k < n; k++) {
          const sc = s0 + k * (piece + gap) + piece / 2;
          const off = y0 + opts.depth / 2;
          const x = f.a[0] + f.dir[0] * sc + f.inward[0] * off, z = f.a[1] + f.dir[1] * sc + f.inward[1] * off;
          const use = uses[count++ % uses.length];
          const r = makeRange(app, use, x, z, Math.atan2(f.inward[0], f.inward[1]), piece, opts, w);
          buildings.push(r.building); objects.push(...r.furniture);
          obstacles.push(buildingPoly(r.building));
        }
      }
    }
  }
  return { buildings, objects };
}

function makeRange(app: App, use: RangeUse, x: number, z: number, rotY: number, len: number, opts: RangeOpts, w: CurtainWallDef) {
  const [kind, name] = USE_KIND[use];
  const len1 = Math.round(len * 10) / 10;
  const { building: b, furniture } = makeBuilding(kind, [x, app.terrain.baseHeightAt(x, z), z], rotY, { width: len1, depth: opts.depth }, use !== 'lodgings');
  b.name = name;
  b.material = w.material;
  b.roofColor = '#4f5560';
  b.extra.arcade = opts.arcade;
  b.extra.chimney = use === 'lodgings' || use === 'hall' || use === 'barracks';
  const above = b.floors.filter((f) => f.level >= 0).length;
  if (above !== opts.storeys) setFloors(b, opts.storeys);
  const g0 = b.floors.find((f) => f.level === 0);
  if (opts.storeys > 1 && use !== 'lodgings' && g0 && !g0.stairs.length) {
    // single-storey presets raised to two: a stair up to the loft in the back corner
    for (const f of b.floors) if (f.level >= 0 && f.level < opts.storeys - 1) f.stairs = [{ id: uid('st'), kind: 'straight', pos: [-b.width / 2 + b.wallThickness + 0.75, -b.depth / 2 + b.wallThickness + 0.2], rotY: 0, from: f.level, width: 1.1 }];
  }
  backOntoWall(b, w.height);
  if (use !== 'lodgings') return { building: b, furniture: furniture.filter((o) => (o.floor ?? 0) < opts.storeys) };
  // lodgings: a furnished home sized to the range
  const beds = Math.max(1, Math.min(6, Math.round((len1 * opts.storeys) / 13)));
  generatePlan(b, { ...DEFAULT_PROGRAM, bedrooms: beds, bathrooms: Math.max(1, Math.ceil(beds / 2)), dining: len1 > 20, laundry: false, office: len1 > 16 }, 'modern');
  return { building: b, furniture: furnishBuilding(b) };
}
