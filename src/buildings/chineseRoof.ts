import * as THREE from 'three';
import { C, type GeoBuilder } from '../core/geom';
import type { V2 } from '../core/math';
import type { BuildingDef } from '../core/types';
import { footprint, levelBase, levelInset, topInset, totalHeight } from './footprint';

/**
 * Chinese roofs: concave hip roofs whose eaves sweep up at the corners, built as a loft of rings from the eave line
 * up to the ridge. Also the pieces that go with them: skirt eaves per storey (pagodas), double eaves with a clerestory,
 * the painted bracket band (dougong) under the eaves, red columns, a stone terrace and the pagoda finial.
 *
 * Driven by BuildingDef.extra:
 *   hip (0..1, default 1)      1 = pure hip (pyramid on square plans); lower values lengthen the ridge
 *   doubleEave (bool)          skirt eave + clerestory + main roof (temples, palace halls)
 *   tiers (bool)               a skirt eave at the top of every storey below the roof (pagodas, teahouses)
 *   columns (m, 0 = none)      veranda depth: a ring of red columns that far outside the walls
 *   open (bool)                no walls at all, columns at the corners (pavilions)
 *   terrace (m, 0 = none)      raised stone platform this far around the building, with front steps
 *   finial (bool)              gilded spire on a pyramid roof
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const CN = {
  red: C('#9b2318'), redDark: C('#5e1410'), teal: C('#2d6f6a'), green: C('#3d7a4a'), gold: C('#c9a03a'), blue: C('#2b4f8a'),
  stone: C('#b9b4a8'), stoneDark: C('#8a867c'), soffit: C('#6b2418'), ridge: C('#3b3d40'),
};

export interface RoofTargets {
  tiles: GeoBuilder; // tiled surface (cn_tiles texture tinted with roofColor)
  soffit: GeoBuilder; // vertex-coloured: rafter underside, fascia, brackets, columns
  ridge: GeoBuilder; // vertex-coloured: ridges and ornaments
  wall: GeoBuilder; // exterior wall texture: clerestory walls
  finial: GeoBuilder; // gilded
}

/** Push a quad with explicit UVs, flipping the winding (and UVs with it) so the normal faces `want`. */
function quadUV(g: GeoBuilder, p: THREE.Vector3[], uv: [number, number][], want: THREE.Vector3, col = C('#ffffff')) {
  const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[0]));
  const order = n.dot(want) >= 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
  const base = g.vertexCount;
  g.quad(p[order[0]], p[order[1]], p[order[2]], p[order[3]], col);
  for (let k = 0; k < 4; k++) { g.uv[(base + k) * 2] = uv[order[k]][0]; g.uv[(base + k) * 2 + 1] = uv[order[k]][1]; }
}

interface EaveOpts {
  ax0: number; bz0: number; // eave half-extents (x, z)
  ax1: number; bz1: number; // top half-extents (ridge line, or where a skirt meets the wall)
  y0: number; rise: number; lift: number; // eave height at mid-edge, rise to the top, corner up-sweep
  N?: number; M?: number;
}

/** Lofted eave surface. Returns the corner polylines (for hip ridges) and top ring height. */
function eaveSurface(t: RoofTargets, o: EaveOpts): { corners: THREE.Vector3[][]; yTop: number } {
  const N = o.N ?? 8, M = o.M ?? 10, P = 4 * M;
  const sideN = [V(0, 0, -1), V(1, 0, 0), V(0, 0, 1), V(-1, 0, 0)];
  const ring = (tt: number): { p: THREE.Vector3; c: number; s: number }[] => {
    const ax = o.ax0 + (o.ax1 - o.ax0) * tt, bz = o.bz0 + (o.bz1 - o.bz0) * tt;
    const out: { p: THREE.Vector3; c: number; s: number }[] = [];
    for (let s = 0; s < 4; s++) for (let j = 0; j < M; j++) {
      const u = j / M, w = 2 * u - 1; // -1..1 along the side
      const x = s === 0 ? w * ax : s === 1 ? ax : s === 2 ? -w * ax : -ax;
      const z = s === 0 ? -bz : s === 1 ? w * bz : s === 2 ? bz : -w * bz;
      const c = Math.abs(w) ** 3; // 1 at the corners, 0 mid-side
      const y = o.y0 + o.rise * tt ** 1.6 + o.lift * c * (1 - tt) ** 2;
      // corners also flare outward a little, like real eaves
      const flare = 1 + 0.05 * c * (1 - tt);
      out.push({ p: V(x * flare, y, z * flare), c, s });
    }
    return out;
  };
  const rings = Array.from({ length: N + 1 }, (_, k) => ring(k / N));
  // u: distance along the eave ring, v: distance up the slope (mid-side)
  const r0 = rings[0];
  const ucum = [0];
  for (let i = 1; i <= P; i++) ucum.push(ucum[i - 1] + r0[i % P].p.distanceTo(r0[i - 1].p));
  const vcum = [0];
  for (let k = 1; k <= N; k++) vcum.push(vcum[k - 1] + rings[k][M >> 1].p.distanceTo(rings[k - 1][M >> 1].p));
  const down = V(0, -0.14, 0);
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < P; i++) {
      const i1 = (i + 1) % P;
      const a = rings[k][i].p, b = rings[k][i1].p, c = rings[k + 1][i1].p, d = rings[k + 1][i].p;
      const sn = sideN[rings[k][i].s];
      const want = V(sn.x, 1.2, sn.z);
      quadUV(t.tiles, [a, b, c, d], [[ucum[i], vcum[k]], [ucum[i + 1], vcum[k]], [ucum[i + 1], vcum[k + 1]], [ucum[i], vcum[k + 1]]], want);
      // rafter underside
      quadUV(t.soffit, [a.clone().add(down), b.clone().add(down), c.clone().add(down), d.clone().add(down)], [[0, 0], [1, 0], [1, 1], [0, 1]], V(-sn.x * 0.2, -1, -sn.z * 0.2), CN.soffit);
    }
  }
  // fascia board along the eave
  for (let i = 0; i < P; i++) {
    const a = r0[i].p, b = r0[(i + 1) % P].p;
    const sn = sideN[r0[i].s];
    quadUV(t.soffit, [a.clone().add(down), b.clone().add(down), b, a], [[0, 0], [1, 0], [1, 1], [0, 1]], sn, CN.redDark);
  }
  const corners = [0, 1, 2, 3].map((s) => rings.map((r) => r[s * M].p));
  return { corners, yTop: o.y0 + o.rise };
}

/** Hip ridges along the corner lines + an up-curled tip at each eave corner. */
function hipRidges(t: RoofTargets, corners: THREE.Vector3[][], upto = 1) {
  for (const line of corners) {
    const n = Math.max(1, Math.round((line.length - 1) * upto));
    for (let k = 0; k < n; k++) t.ridge.beam(line[k].clone().setY(line[k].y + 0.08), line[k + 1].clone().setY(line[k + 1].y + 0.08), 0.18, 0.2, CN.ridge);
    const tip = line[0];
    t.ridge.box(tip.x * 1.01, tip.y + 0.32, tip.z * 1.01, 0.16, 0.5, 0.16, Math.atan2(tip.x, tip.z), CN.ridge, 0.35);
  }
}

/** Painted bracket band (dougong) just under an eave: red architrave, teal/green band, gold bracket blocks. */
function bracketBand(t: RoofTargets, ring: V2[], y: number) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.2) continue;
    t.soffit.beam(V(a[0], y - 0.55, a[1]), V(b[0], y - 0.55, b[1]), 0.3, 0.3, CN.red);
    t.soffit.beam(V(a[0], y - 0.22, a[1]), V(b[0], y - 0.22, b[1]), 0.36, 0.34, CN.teal);
    const m = Math.max(1, Math.floor(L / 0.9));
    const dir = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (let k = 0; k <= m; k++) {
      const x = a[0] + (b[0] - a[0]) * (k / m), z = a[1] + (b[1] - a[1]) * (k / m);
      t.soffit.box(x, y - 0.05, z, 0.42, 0.18, 0.22, dir, k % 2 ? CN.green : CN.gold);
    }
  }
}

function finial(t: RoofTargets, y: number) {
  t.finial.cyl(0, y - 0.1, 0, 0.45, 0.3, 0.5, 8, C('#ffffff'));
  for (let k = 0; k < 5; k++) t.finial.cyl(0, y + 0.5 + k * 0.42, 0, 0.32 - k * 0.04, 0.32 - k * 0.04, 0.12, 10, C('#ffffff'));
  t.finial.cyl(0, y + 0.4, 0, 0.07, 0.05, 2.6, 6, C('#ffffff'));
  t.finial.cyl(0, y + 3.0, 0, 0.18, 0, 0.5, 8, C('#ffffff'));
}

/** Roof + eave details for b.roof === 'eaves'. `top` is the top of the highest wall. */
export function buildChineseRoof(b: BuildingDef, t: RoofTargets, top: number) {
  const hw0 = b.width / 2, hd0 = (b.shape === 'round' ? b.width : b.depth) / 2;
  const ti = topInset(b);
  const hw = hw0 - ti, hd = hd0 - ti;
  const cols = Number(b.extra.columns ?? 0);
  const open = !!b.extra.open;
  const over = (cols > 0 ? cols : 0) + (open ? 0.9 : 1.1);
  const hip = Math.max(0, Math.min(1, Number(b.extra.hip ?? 1)));
  const alongX = hw >= hd;
  // storey skirts (pagoda / teahouse)
  if (b.extra.tiers) {
    const above = b.floors.filter((f) => f.level >= 0).sort((p, q) => p.level - q.level);
    for (const f of above.slice(0, -1)) {
      const y = levelBase(b, f.level + 1);
      const sk = 0.9 + (f.level === 0 && cols > 0 ? cols : 0);
      // the skirt runs from beyond this storey's walls up to the (possibly narrower) storey above
      const i0 = levelInset(b, f.level), i1 = levelInset(b, f.level + 1);
      const { corners } = eaveSurface(t, { ax0: hw0 - i0 + sk, bz0: hd0 - i0 + sk, ax1: hw0 - i1, bz1: hd0 - i1, y0: y - 0.35, rise: 0.75, lift: 0.4, N: 4 });
      hipRidges(t, corners, 1);
      bracketBand(t, footprint(b, -0.05 + i0), y - 0.3);
    }
  }
  let base = top, ex = hw, ez = hd, ov = over;
  if (b.extra.doubleEave) {
    // lower skirt eave, then a clerestory, then the main roof
    const ci = Math.min(0.9, Math.min(hw, hd) * 0.15);
    const { corners } = eaveSurface(t, { ax0: hw + over, bz0: hd + over, ax1: hw - ci, bz1: hd - ci, y0: top - 0.25, rise: 1.0, lift: 0.45, N: 5 });
    hipRidges(t, corners, 1);
    const cl = 2.0;
    const ring = footprint({ shape: 'rect', width: (hw - ci) * 2, depth: (hd - ci) * 2 });
    for (let i = 0; i < 4; i++) {
      const a = ring[i], c = ring[(i + 1) % 4];
      const nn = V(c[1] - a[1], 0, -(c[0] - a[0])).normalize();
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      quadUV(t.wall, [V(a[0], top + 0.4, a[1]), V(c[0], top + 0.4, c[1]), V(c[0], top + 0.4 + cl, c[1]), V(a[0], top + 0.4 + cl, a[1])], [[0, 0], [L, 0], [L, cl], [0, cl]], nn);
    }
    base = top + 0.4 + cl; ex = hw - ci; ez = hd - ci; ov = over * 0.8;
    bracketBand(t, ring, base);
  } else if (cols <= 0 && !open) {
    bracketBand(t, footprint(b, -0.05 + ti), top);
  }
  const A = ex + ov, Bz = ez + ov;
  const short = Math.min(A, Bz);
  const ridgeHalf = Math.max(0, (Math.max(A, Bz) - short) + short * (1 - hip) * 0.85);
  const rise = Math.max(1.2, Math.min(7, short * 0.8));
  const { corners, yTop } = eaveSurface(t, {
    ax0: A, bz0: Bz, ax1: alongX ? ridgeHalf : 0, bz1: alongX ? 0 : ridgeHalf, y0: base + 0.05, rise, lift: Math.min(1.1, 0.35 + short * 0.08),
  });
  hipRidges(t, corners, 1);
  // main ridge with up-curled ends (chiwen)
  if (ridgeHalf > 0.1) {
    const e = alongX ? V(ridgeHalf, 0, 0) : V(0, 0, ridgeHalf);
    t.ridge.beam(V(-e.x, yTop + 0.12, -e.z), V(e.x, yTop + 0.12, e.z), 0.3, 0.36, CN.ridge);
    for (const s of [-1, 1]) {
      const p = e.clone().multiplyScalar(s);
      t.ridge.box(p.x, yTop + 0.65, p.z, 0.3, 1.0, 0.3, alongX ? Math.PI / 2 : 0, CN.ridge, -0.3 * s);
      t.ridge.box(p.x * 0.97, yTop + 1.1, p.z * 0.97, 0.26, 0.3, 0.5, alongX ? Math.PI / 2 : 0, CN.ridge);
    }
  } else if (b.extra.finial) {
    finial(t, yTop);
  } else {
    t.ridge.cyl(0, yTop - 0.1, 0, 0.35, 0.15, 0.7, 8, CN.ridge);
    t.finial.cyl(0, yTop + 0.55, 0, 0.18, 0, 0.6, 8, C('#ffffff'));
  }
}

/** Ground-level details: stone terrace with front steps, red columns (verandas, pavilions) with their beams. */
export function buildChineseBase(b: BuildingDef, soffit: GeoBuilder, terraceTop: GeoBuilder, terraceSide: GeoBuilder) {
  const top = totalHeight(b);
  const cols = Number(b.extra.columns ?? 0);
  const open = !!b.extra.open;
  const terrace = Number(b.extra.terrace ?? 0);
  const TY = 0.3;
  if (terrace > 0) {
    const outer = footprint(b, -terrace);
    const inner = footprint(b, -0.1);
    // top: ring between inner and outer (quads per edge)
    const n = outer.length;
    for (let i = 0; i < n; i++) {
      const o0 = outer[i], o1 = outer[(i + 1) % n], i0 = inner[i], i1 = inner[(i + 1) % n];
      quadUV(terraceTop, [V(o0[0], TY, o0[1]), V(o1[0], TY, o1[1]), V(i1[0], TY, i1[1]), V(i0[0], TY, i0[1])], [[o0[0], o0[1]], [o1[0], o1[1]], [i1[0], i1[1]], [i0[0], i0[1]]], V(0, 1, 0));
      const nn = V(o1[1] - o0[1], 0, -(o1[0] - o0[0])).normalize();
      const L = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]);
      quadUV(terraceSide, [V(o0[0], -1.6, o0[1]), V(o1[0], -1.6, o1[1]), V(o1[0], TY, o1[1]), V(o0[0], TY, o0[1])], [[0, -1.6], [L, -1.6], [L, TY], [0, TY]], nn);
      // carved balustrade-like kerb
      soffit.beam(V(o0[0], TY + 0.06, o0[1]), V(o1[0], TY + 0.06, o1[1]), 0.3, 0.12, CN.stone);
    }
    // front steps (+Z side)
    const z0 = (b.shape === 'round' ? b.width : b.depth) / 2 + terrace;
    const sw = Math.min(b.width * 0.5, 5);
    for (let k = 0; k < 2; k++) soffit.box(0, (TY * (2 - k)) / 2 / 2 + 0.0, z0 + 0.25 + k * 0.35, sw, TY * (2 - k) / 2, 0.36, 0, CN.stoneDark);
  }
  if (cols > 0 || open) {
    const ring = open ? footprint(b, 0.3) : footprint(b, -cols);
    const colTop = b.extra.tiers ? (b.floors.find((f) => f.level === 0)?.height ?? top) : top;
    const y0 = terrace > 0 ? TY : 0.04;
    const n = ring.length;
    const posts: V2[] = [];
    for (let i = 0; i < n; i++) {
      const a = ring[i], c = ring[(i + 1) % n];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const m = Math.max(1, Math.round(L / 3.2));
      for (let k = 0; k < m; k++) posts.push([a[0] + (c[0] - a[0]) * (k / m), a[1] + (c[1] - a[1]) * (k / m)]);
    }
    for (const [x, z] of posts) {
      soffit.cyl(x, y0, z, 0.32, 0.3, 0.18, 8, CN.stone);
      soffit.cyl(x, y0 + 0.18, z, 0.2, 0.18, colTop - y0 - 0.18, 10, CN.red);
    }
    bracketBand({ soffit } as RoofTargets, ring, colTop);
    if (open) {
      // bench rail between the columns, open at the front
      for (let i = 0; i < n; i++) {
        if (i === 2) continue;
        const a = ring[i], c = ring[(i + 1) % n];
        soffit.beam(V(a[0], y0 + 0.45, a[1]), V(c[0], y0 + 0.45, c[1]), 0.36, 0.08, CN.redDark);
        soffit.beam(V(a[0], y0 + 0.75, a[1]), V(c[0], y0 + 0.75, c[1]), 0.08, 0.08, CN.red);
      }
    }
  }
}
