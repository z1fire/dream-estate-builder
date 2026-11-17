// Geometry + unit helpers. World space: 1 unit = 1 metre, ground plane is XZ, +Y up.
export type V2 = [number, number];
export type V3 = [number, number, number];

export const M_TO_FT = 3.28084;
export const FT_TO_M = 1 / M_TO_FT;
export const SQM_PER_ACRE = 4046.8564224;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

export function fmtFeet(m: number, decimals = 0): string {
  const ft = m * M_TO_FT;
  return `${ft.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })} ft`;
}
export function fmtArea(sqm: number): string {
  const acres = sqm / SQM_PER_ACRE;
  const sqft = sqm * M_TO_FT * M_TO_FT;
  return acres >= 0.1
    ? `${acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} acres`
    : `${Math.round(sqft).toLocaleString()} sq ft`;
}
export function fmtAreaBoth(sqm: number): string {
  const acres = sqm / SQM_PER_ACRE;
  const sqft = sqm * M_TO_FT * M_TO_FT;
  return `${acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} ac · ${Math.round(sqft).toLocaleString()} sq ft`;
}

export function polygonArea(p: V2[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(a / 2);
}
export function polygonSignedArea(p: V2[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  return a / 2;
}
export function polygonCentroid(p: V2[]): V2 {
  let x = 0, z = 0;
  for (const q of p) { x += q[0]; z += q[1]; }
  return [x / p.length, z / p.length];
}
export function pointInPolygon(x: number, z: number, p: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function polylineLength(p: V2[], closed = false): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  if (closed && p.length > 2) L += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
  return L;
}
/** Distance from point to segment ab, plus param t along it. */
export function distToSegment(x: number, z: number, a: V2, b: V2): { d: number; t: number } {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return { d: Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz)), t };
}
export function distToPolyline(x: number, z: number, p: V2[], closed = false): number {
  let best = Infinity;
  const n = closed ? p.length : p.length - 1;
  for (let i = 0; i < n; i++) best = Math.min(best, distToSegment(x, z, p[i], p[(i + 1) % p.length]).d);
  return best;
}
export function bboxOf(p: V2[]): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of p) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

/** Centripetal-ish Catmull-Rom resample of a polyline at roughly `step` metre spacing. */
export function smoothPolyline(pts: V2[], step: number, closed = false): V2[] {
  if (pts.length < 2) return pts.slice();
  const out: V2[] = [];
  const n = pts.length;
  const get = (i: number): V2 => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/** Resample a polyline at exact spacing (linear). Returns points + tangents. */
export function resampleLinear(pts: V2[], step: number, closed = false): { p: V2[]; dir: V2[] } {
  const src = closed ? [...pts, pts[0]] : pts;
  const p: V2[] = [], dir: V2[] = [];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    let s = carry;
    while (s <= L) {
      p.push([a[0] + ux * s, a[1] + uz * s]);
      dir.push([ux, uz]);
      s += step;
    }
    carry = s - L;
  }
  return { p, dir };
}

/** Offset a polyline (for ribbons). Returns left/right edges. */
export function offsetPolyline(pts: V2[], half: number, closed = false): { left: V2[]; right: V2[] } {
  const left: V2[] = [], right: V2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    // normal (perp)
    const nx = -dz, nz = dx;
    left.push([pts[i][0] + nx * half, pts[i][1] + nz * half]);
    right.push([pts[i][0] - nx * half, pts[i][1] - nz * half]);
  }
  return { left, right };
}

export function segIntersect(a: V2, b: V2, c: V2, d: V2): { t: number; u: number } | null {
  const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1];
  const den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise + fbm (fast, deterministic)
function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
export function fbm(x: number, y: number, oct = 4): number {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * valueNoise(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}
