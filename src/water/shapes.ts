import { bboxOf, clamp, pointInPolygon, smoothPolyline, smoothstep, type V2 } from '../core/math';
import { SegIndex } from '../core/segindex';
import type { Moat, WaterBody } from '../core/types';
import { heightAt } from '../terrain/heightfield';
import type { WBox } from '../terrain/features';

export const MOAT_BANK = 4;

export interface MoatShape { line: V2[]; idx: SegIndex; half: number; box: WBox }
export function moatShape(m: Moat): MoatShape {
  const line = smoothPolyline(m.points, 2, true);
  const half = m.width / 2;
  const R = half + MOAT_BANK + 2;
  const b = bboxOf(line);
  return { line, idx: new SegIndex(line, true, R), half, box: { minX: b.minX - R, minZ: b.minZ - R, maxX: b.maxX + R, maxZ: b.maxZ + R } };
}

export interface PondShape { poly: V2[]; idx: SegIndex; box: WBox }
export const POND_SHORE = 5;
export function pondShape(p: WaterBody): PondShape {
  const poly = smoothPolyline(p.points, 2, true);
  const b = bboxOf(poly);
  const R = POND_SHORE + 1;
  return { poly, idx: new SegIndex(poly, true, 14), box: { minX: b.minX - R, minZ: b.minZ - R, maxX: b.maxX + R, maxZ: b.maxZ + R } };
}
/** signed distance to pond edge (+ inside), capped at 14 m */
export function pondDist(s: PondShape, x: number, z: number): number {
  const q = s.idx.nearest(x, z);
  const inside = pointInPolygon(x, z, s.poly);
  const d = q ? q.d : 14;
  return inside ? d : -d;
}

export interface StreamShape { line: V2[]; surf: number[]; drop: number[]; idx: SegIndex; half: number; box: WBox; dir: V2[] }
/** Stream surface follows the terrain downhill (monotonic), carving through bumps; steep drops become falls. */
export function streamShape(s: WaterBody, base: Float32Array): StreamShape {
  let line = smoothPolyline(s.points, 1, false);
  const h0 = heightAt(base, line[0][0], line[0][1]), h1 = heightAt(base, line[line.length - 1][0], line[line.length - 1][1]);
  if (h1 > h0) line = line.slice().reverse();
  const n = line.length;
  const raw = line.map(([x, z]) => heightAt(base, x, z) - 0.15);
  const surf = new Array<number>(n);
  surf[0] = raw[0];
  for (let i = 1; i < n; i++) surf[i] = Math.min(surf[i - 1], raw[i]);
  if (!s.waterfall) {
    // spread drops into gentle rapids: monotonic smoothing
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 1; i < n - 1; i++) surf[i] = Math.min(surf[i - 1], (surf[i - 1] + surf[i] * 2 + surf[i + 1]) / 4);
    }
  }
  const drop = surf.map((v, i) => (i < n - 1 ? clamp(v - surf[i + 1], 0, 5) : 0));
  const dir: V2[] = line.map((_p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  });
  const half = s.width / 2;
  const R = half + 4;
  const b = bboxOf(line);
  return { line, surf, drop, dir, idx: new SegIndex(line, false, R), half, box: { minX: b.minX - R, minZ: b.minZ - R, maxX: b.maxX + R, maxZ: b.maxZ + R } };
}
export function streamSurfaceAt(s: StreamShape, x: number, z: number): { surf: number; d: number; i: number } | null {
  const q = s.idx.nearest(x, z);
  if (!q) return null;
  const a = s.surf[q.i], b = s.surf[Math.min(s.surf.length - 1, q.i + 1)];
  return { surf: a + (b - a) * q.t, d: q.d, i: q.i };
}

export { smoothstep };
