import type { Rect } from '../core/store';
import type { CollectionKey, EstateDoc } from '../core/types';
import { GRID, HALF } from '../core/types';
import { clamp } from '../core/math';

/** World-space bounding box. */
export interface WBox { minX: number; minZ: number; maxX: number; maxZ: number }

/**
 * A non-destructive terrain modifier derived from an entity (moat, pond, path, building pad, terrace…).
 * Final terrain = base sculpted heights + every feature applied in `order`.
 */
export interface TerrainFeature {
  key: string; // stable unique key e.g. "moats:abc"
  sig: string; // changes whenever the feature's effect changes
  box: WBox; // world-space area of effect (incl. margins)
  order: number; // lower first
  /** modify `final` heights for vertices in rect (vertex indices) */
  heights?(final: Float32Array, rect: Rect): void;
  /** modify splat weights for cells in rect */
  splat?(splat: Uint8Array, rect: Rect): void;
}

export interface FeatureProvider {
  keys: CollectionKey[];
  features(doc: EstateDoc): TerrainFeature[];
}

export function boxToRect(b: WBox, margin = 1): Rect {
  return {
    x0: clamp(Math.floor(b.minX + HALF - margin), 0, GRID), z0: clamp(Math.floor(b.minZ + HALF - margin), 0, GRID),
    x1: clamp(Math.ceil(b.maxX + HALF + margin), 0, GRID), z1: clamp(Math.ceil(b.maxZ + HALF + margin), 0, GRID),
  };
}
export function rectsIntersect(a: Rect, b: Rect) {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
}
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const r = { x0: Math.max(a.x0, b.x0), z0: Math.max(a.z0, b.z0), x1: Math.min(a.x1, b.x1), z1: Math.min(a.z1, b.z1) };
  return r.x0 <= r.x1 && r.z0 <= r.z1 ? r : null;
}
