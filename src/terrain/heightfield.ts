import * as THREE from 'three';
import { clamp } from '../core/math';
import { CELL, GRID, HALF, VERTS } from '../core/types';
import type { Rect } from '../core/store';

/** World X/Z -> grid vertex coordinate (float). */
export const toGrid = (w: number) => (w + HALF) / CELL;
export const toWorld = (g: number) => g * CELL - HALF;

/** Bilinear-on-triangles height sample from a VERTS×VERTS heightfield. */
export function heightAt(h: Float32Array, x: number, z: number): number {
  const gx = clamp(toGrid(x), 0, GRID - 1e-4), gz = clamp(toGrid(z), 0, GRID - 1e-4);
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const i = iz * VERTS + ix;
  const a = h[i], b = h[i + 1], c = h[i + VERTS], d = h[i + VERTS + 1];
  // triangle-consistent interpolation (matches the mesh split a-b-c / b-d-c)
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

export function normalAt(h: Float32Array, x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = CELL;
  const hl = heightAt(h, x - e, z), hr = heightAt(h, x + e, z);
  const hd = heightAt(h, x, z - e), hu = heightAt(h, x, z + e);
  return out.set(hl - hr, 2 * e, hd - hu).normalize();
}

export function slopeAt(h: Float32Array, x: number, z: number): number {
  const n = normalAt(h, x, z);
  return Math.acos(clamp(n.y, -1, 1));
}

/** Ray-march the heightfield. Returns hit point or null. */
export function raycastTerrain(hf: Float32Array, ray: THREE.Ray, maxDist = 4000): THREE.Vector3 | null {
  const p = new THREE.Vector3();
  let prev = 0;
  let step = 1;
  let t = 0;
  // skip to world bounds
  const o = ray.origin, d = ray.direction;
  let prevAbove = true;
  while (t < maxDist) {
    p.copy(o).addScaledVector(d, t);
    if (Math.abs(p.x) > HALF + 2 || Math.abs(p.z) > HALF + 2) {
      // outside the world: march toward it or give up if moving away
      if ((p.x > HALF && d.x > 0) || (p.x < -HALF && d.x < 0) || (p.z > HALF && d.z > 0) || (p.z < -HALF && d.z < 0)) {
        // allow hitting y=0 plane outside world for convenience
        if (d.y < 0) {
          const tt = -o.y / d.y;
          if (tt > 0) return o.clone().addScaledVector(d, tt);
        }
        return null;
      }
      prev = t; t += Math.max(step, 4); continue;
    }
    const h = heightAt(hf, p.x, p.z);
    const above = p.y > h;
    if (!above && prevAbove && t > 0) {
      // binary refine between prev and t
      let a = prev, b = t;
      for (let i = 0; i < 20; i++) {
        const m = (a + b) / 2;
        p.copy(o).addScaledVector(d, m);
        if (p.y > heightAt(hf, p.x, p.z)) a = m; else b = m;
      }
      return o.clone().addScaledVector(d, (a + b) / 2);
    }
    prevAbove = above;
    prev = t;
    step = clamp((p.y - h) * 0.5, 0.25, 8);
    t += step;
  }
  return null;
}

export function rectAround(x: number, z: number, r: number): Rect {
  return {
    x0: clamp(Math.floor(toGrid(x - r)), 0, GRID), z0: clamp(Math.floor(toGrid(z - r)), 0, GRID),
    x1: clamp(Math.ceil(toGrid(x + r)), 0, GRID), z1: clamp(Math.ceil(toGrid(z + r)), 0, GRID),
  };
}
export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  return { x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1) };
}
/** Clamp vertex rect to splat (cell) range. */
export function cellRect(r: Rect): Rect {
  return { x0: clamp(r.x0, 0, GRID - 1), z0: clamp(r.z0, 0, GRID - 1), x1: clamp(r.x1, 0, GRID - 1), z1: clamp(r.z1, 0, GRID - 1) };
}
