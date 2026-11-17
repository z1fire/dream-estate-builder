import type { V2 } from '../core/math';
import type { BuildingDef, FloorDef } from '../core/types';

export const ROUND_SEGMENTS = 16;

/** Exterior footprint polygon (building-local, CCW seen from above with +Z towards the viewer's bottom). */
export function footprint(b: Pick<BuildingDef, 'shape' | 'width' | 'depth'>, inset = 0): V2[] {
  if (b.shape === 'round') {
    const r = b.width / 2 - inset;
    // start so that edge index (N/4) faces +Z (front)
    return Array.from({ length: ROUND_SEGMENTS }, (_, i) => {
      const a = ((i + 0.5) / ROUND_SEGMENTS) * Math.PI * 2 - Math.PI / 2 - Math.PI / 2;
      return [Math.cos(a) * r, Math.sin(a) * r] as V2;
    });
  }
  const w = b.width / 2 - inset, d = b.depth / 2 - inset;
  // edge 0 = north (-z), 1 = east (+x), 2 = south/front (+z), 3 = west (-x)
  return [[-w, -d], [w, -d], [w, d], [-w, d]];
}

/** Index of the exterior edge facing the front (+Z). */
export function frontEdge(b: Pick<BuildingDef, 'shape'>): number {
  if (b.shape !== 'round') return 2;
  // edge i spans angles a_i..a_{i+1}; find the one whose midpoint direction is closest to +Z
  let best = 0, bd = -2;
  const fp = footprint({ shape: 'round', width: 2, depth: 2 });
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i], c = fp[(i + 1) % fp.length];
    const mz = (a[1] + c[1]) / 2, mx = (a[0] + c[0]) / 2;
    const dot = mz / Math.hypot(mx, mz);
    if (dot > bd) { bd = dot; best = i; }
  }
  return best;
}

export function edgeCount(b: Pick<BuildingDef, 'shape'>) { return b.shape === 'round' ? ROUND_SEGMENTS : 4; }

/** Base Y (relative to building origin) of each floor level. */
export function levelBase(b: Pick<BuildingDef, 'floors'>, level: number): number {
  const sorted = [...b.floors].sort((a, c) => a.level - c.level);
  if (level >= 0) {
    let y = 0;
    for (const f of sorted) if (f.level >= 0 && f.level < level) y += f.height;
    return y;
  }
  let y = 0;
  for (const f of sorted) if (f.level < 0 && f.level >= level) y -= f.height;
  return y;
}

export function totalHeight(b: Pick<BuildingDef, 'floors'>): number {
  return b.floors.filter((f) => f.level >= 0).reduce((s, f) => s + f.height, 0);
}

export function floorByLevel(b: BuildingDef, level: number): FloorDef | undefined {
  return b.floors.find((f) => f.level === level);
}

/** Point-in-footprint test in building-local coords (with optional inset). */
export function insideFootprint(b: BuildingDef, x: number, z: number, inset = 0): boolean {
  if (b.shape === 'round') return Math.hypot(x, z) <= b.width / 2 - inset;
  return Math.abs(x) <= b.width / 2 - inset && Math.abs(z) <= b.depth / 2 - inset;
}
