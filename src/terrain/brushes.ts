import { clamp, smoothstep, valueNoise } from '../core/math';
import type { Rect } from '../core/store';
import { GRID, HALF, VERTS, type EstateDoc } from '../core/types';
import { rectAround, toGrid } from './heightfield';

export type HeightBrush = 'raise' | 'lower' | 'flatten' | 'smooth' | 'noise' | 'set';

export interface BrushParams {
  radius: number; // metres
  strength: number; // 0..1
  falloff: number; // 0 (hard) .. 1 (very soft)
  target: number; // flatten/set target height (m)
  seed: number;
}

export function brushWeight(d: number, r: number, falloff: number): number {
  if (d >= r) return 0;
  const inner = r * (1 - clamp(falloff, 0.01, 1));
  return d <= inner ? 1 : 1 - smoothstep(inner, r, d);
}

/** Apply a height brush for dt seconds at world (x,z). Returns the touched vertex rect. */
export function applyHeightBrush(doc: EstateDoc, kind: HeightBrush, x: number, z: number, p: BrushParams, dt: number): Rect {
  const r = rectAround(x, z, p.radius);
  const h = doc.heights;
  const gx = toGrid(x), gz = toGrid(z);
  const rate = dt * p.strength;
  let src: Float32Array | null = null;
  let sw = 0;
  if (kind === 'smooth') {
    // copy region + 1 border so smoothing reads stable values
    sw = r.x1 - r.x0 + 3;
    src = new Float32Array(sw * (r.z1 - r.z0 + 3));
    for (let zz = r.z0 - 1; zz <= r.z1 + 1; zz++)
      for (let xx = r.x0 - 1; xx <= r.x1 + 1; xx++)
        src[(zz - r.z0 + 1) * sw + (xx - r.x0 + 1)] = h[clamp(zz, 0, GRID) * VERTS + clamp(xx, 0, GRID)];
  }
  for (let vz = r.z0; vz <= r.z1; vz++)
    for (let vx = r.x0; vx <= r.x1; vx++) {
      const d = Math.hypot(vx - gx, vz - gz);
      const w = brushWeight(d, p.radius, p.falloff);
      if (w <= 0) continue;
      const i = vz * VERTS + vx;
      switch (kind) {
        case 'raise': h[i] += 7 * rate * w; break;
        case 'lower': h[i] -= 7 * rate * w; break;
        case 'flatten': h[i] += (p.target - h[i]) * Math.min(1, 9 * rate * w); break;
        case 'set': h[i] += (p.target - h[i]) * Math.min(1, 20 * rate * w + (p.strength >= 0.99 ? w : 0)); break;
        case 'smooth': {
          const sx = vx - r.x0 + 1, sz = vz - r.z0 + 1;
          let s = 0;
          for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) s += src![(sz + oz) * sw + sx + ox];
          h[i] += (s / 9 - h[i]) * Math.min(1, 12 * rate * w);
          break;
        }
        case 'noise': {
          const wx = vx - HALF, wz = vz - HALF;
          const n = valueNoise(wx / 5 + p.seed, wz / 5) * 0.7 + valueNoise(wx / 1.8 - p.seed, wz / 1.8) * 0.3;
          h[i] += n * 4 * rate * w;
          break;
        }
      }
    }
  return r;
}

/** Paint ground layer `layer` (0..9). Returns touched cell rect. */
export function applyPaint(doc: EstateDoc, layer: number, x: number, z: number, p: BrushParams, dt: number): Rect {
  const r0 = rectAround(x, z, p.radius);
  const r = { x0: r0.x0, z0: r0.z0, x1: Math.min(GRID - 1, r0.x1), z1: Math.min(GRID - 1, r0.z1) };
  const gx = toGrid(x) - 0.5, gz = toGrid(z) - 0.5; // cell centres
  const PLANE = GRID * GRID * 4;
  const s = doc.splat;
  const w = new Float32Array(10);
  for (let cz = r.z0; cz <= r.z1; cz++)
    for (let cx = r.x0; cx <= r.x1; cx++) {
      const bw = brushWeight(Math.hypot(cx - gx, cz - gz), p.radius, p.falloff);
      if (bw <= 0) continue;
      const base = (cz * GRID + cx) * 4;
      let tot = 0;
      for (let l = 0; l < 10; l++) { w[l] = s[(l >> 2) * PLANE + base + (l & 3)]; tot += w[l]; }
      if (tot < 1) { w[0] = 255; tot = 255; }
      for (let l = 0; l < 10; l++) w[l] = (w[l] / tot) * 255;
      const a = Math.min(1, 6 * dt * p.strength * bw + (p.strength >= 0.99 ? bw * 0.5 : 0));
      const nl = w[layer] + (255 - w[layer]) * a;
      const rest = 255 - w[layer];
      const k = rest > 0.001 ? (255 - nl) / rest : 0;
      for (let l = 0; l < 10; l++) w[l] = l === layer ? nl : w[l] * k;
      for (let l = 0; l < 10; l++) s[(l >> 2) * PLANE + base + (l & 3)] = Math.round(w[l]);
    }
  return r;
}

/** Blend a cell's splat weights toward a single layer by `amount` (used by paths/fields/moats features). */
export function paintCell(s: Uint8Array, cx: number, cz: number, layer: number, amount: number) {
  if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID || amount <= 0) return;
  const PLANE = GRID * GRID * 4;
  const base = (cz * GRID + cx) * 4;
  let tot = 0;
  const w = new Array<number>(10);
  for (let l = 0; l < 10; l++) { w[l] = s[(l >> 2) * PLANE + base + (l & 3)]; tot += w[l]; }
  if (tot < 1) { w[0] = 255; tot = 255; }
  const a = clamp(amount, 0, 1);
  for (let l = 0; l < 10; l++) {
    const v = (w[l] / tot) * 255 * (1 - a) + (l === layer ? 255 * a : 0);
    s[(l >> 2) * PLANE + base + (l & 3)] = Math.round(v);
  }
}
