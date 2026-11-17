import * as THREE from 'three';
import { GeoBuilder, C } from '../core/geom';
import type { V2 } from '../core/math';
import type { BuildingDef, FloorDef, Opening, OpeningKind, Stair } from '../core/types';
import { footprint, levelBase, levelInset, topInset, totalHeight } from './footprint';
import { EXTERIOR_TEX, SURFACE_TEX, surfaceMaterial } from './materials';
import { buildChineseBase, buildChineseRoof } from './chineseRoof';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const WHITE = C('#ffffff');
const SLAB = 0.25;

/** Geometry bucketed by material key → one mesh per material per group. */
class Buckets {
  map = new Map<string, { g: GeoBuilder; mat: () => THREE.Material; role: string }>();
  get(key: string, mat: () => THREE.Material, role: string): GeoBuilder {
    let b = this.map.get(key);
    if (!b) this.map.set(key, (b = { g: new GeoBuilder(), mat, role }));
    return b.g;
  }
  into(group: THREE.Group) {
    for (const { g, mat, role } of this.map.values()) {
      if (!g.vertexCount) continue;
      const mesh = new THREE.Mesh(g.build(), mat());
      mesh.castShadow = role !== 'glass';
      mesh.receiveShadow = true;
      mesh.userData.role = role;
      group.add(mesh);
    }
  }
}

/** Quad oriented so its normal points along `want`. */
function quadFacing(g: GeoBuilder, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, want: THREE.Vector3, col = WHITE) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
  if (n.dot(want) >= 0) g.quad(a, b, c, d, col); else g.quad(b, a, d, c, col);
}

const ARCHED: OpeningKind[] = ['door_arched', 'door_double', 'archway', 'window_arched', 'window_stained'];
const isDoor = (k: OpeningKind) => k.startsWith('door') || k === 'archway';

export interface WallSpec {
  a: V2; b: V2; // centre-line endpoints (local)
  y0: number; h: number; t: number;
  outN: THREE.Vector3; // normal of the "outer" face
  outer: GeoBuilder; inner: GeoBuilder; reveal: GeoBuilder;
  openings: Opening[];
  fills: { door: GeoBuilder; glass: GeoBuilder; stained: GeoBuilder; frame: GeoBuilder; lattice: GeoBuilder; cnDoor: GeoBuilder };
  caps?: boolean;
  ends?: boolean;
}

/** A wall slab with rectangular / arched openings, both faces, reveals and fills (doors, glass). */
export function buildWall(w: WallSpec) {
  const ax = w.a[0], az = w.a[1];
  const L = Math.hypot(w.b[0] - ax, w.b[1] - az);
  if (L < 0.05) return;
  const dir = V((w.b[0] - ax) / L, 0, (w.b[1] - az) / L);
  const n = w.outN.clone().normalize();
  const ht = w.t / 2;
  const P = (s: number, y: number, side: number) => V(ax + dir.x * s + n.x * ht * side, w.y0 + y, az + dir.z * s + n.z * ht * side);
  const face = (s0: number, s1: number, y0: number, y1: number) => {
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
    quadFacing(w.outer, P(s0, y0, 1), P(s1, y0, 1), P(s1, y1, 1), P(s0, y1, 1), n);
    quadFacing(w.inner, P(s1, y0, -1), P(s0, y0, -1), P(s0, y1, -1), P(s1, y1, -1), n.clone().negate());
  };
  const ops = w.openings
    .map((o) => ({ o, c: o.t * L, hw: Math.min(o.width, L - 0.4) / 2 }))
    .filter((x) => x.hw > 0.1)
    .sort((p, q) => p.c - q.c);
  let cursor = 0;
  for (const { o, c, hw } of ops) {
    const s0 = Math.max(cursor, c - hw), s1 = Math.min(L, c + hw);
    if (s0 >= s1) continue;
    face(cursor, s0, 0, w.h);
    const sill = Math.max(0, Math.min(o.sill, w.h - 0.3));
    const oh = Math.min(o.height, w.h - sill - 0.15);
    face(s0, s1, 0, sill);
    const arched = ARCHED.includes(o.kind) && oh > hw;
    const spring = arched ? sill + oh - hw : sill + oh;
    if (!arched) face(s0, s1, sill + oh, w.h);
    else {
      // vertical strips between the arch curve and the wall top
      const N = 10;
      for (let k = 0; k < N; k++) {
        const t0 = Math.PI - (k / N) * Math.PI, t1 = Math.PI - ((k + 1) / N) * Math.PI;
        const xs0 = c + Math.cos(t0) * hw, xs1 = c + Math.cos(t1) * hw;
        const ya0 = spring + Math.sin(t0) * hw, ya1 = spring + Math.sin(t1) * hw;
        for (const side of [1, -1]) {
          const g = side > 0 ? w.outer : w.inner;
          const want = side > 0 ? n : n.clone().negate();
          quadFacing(g, P(xs0, ya0, side), P(xs1, ya1, side), P(xs1, w.h, side), P(xs0, w.h, side), want);
        }
        // soffit
        quadFacing(w.reveal, P(xs0, ya0, 1), P(xs1, ya1, 1), P(xs1, ya1, -1), P(xs0, ya0, -1), V(0, -1, 0).addScaledVector(V(-(Math.cos((t0 + t1) / 2)) * dir.x, 0, -(Math.cos((t0 + t1) / 2)) * dir.z), 1));
      }
    }
    // reveals: jambs, sill, lintel
    quadFacing(w.reveal, P(s0, sill, 1), P(s0, sill, -1), P(s0, spring, -1), P(s0, spring, 1), dir);
    quadFacing(w.reveal, P(s1, sill, -1), P(s1, sill, 1), P(s1, spring, 1), P(s1, spring, -1), dir.clone().negate());
    if (sill > 0.01) quadFacing(w.reveal, P(s0, sill, 1), P(s1, sill, 1), P(s1, sill, -1), P(s0, sill, -1), V(0, 1, 0));
    if (!arched) quadFacing(w.reveal, P(s0, sill + oh, 1), P(s1, sill + oh, 1), P(s1, sill + oh, -1), P(s0, sill + oh, -1), V(0, -1, 0));
    fillOpening(w, o.kind, P, dir, n, c, hw, sill, oh, spring, arched);
    cursor = s1;
  }
  face(cursor, L, 0, w.h);
  if (w.caps !== false) quadFacing(w.reveal, P(0, w.h, 1), P(L, w.h, 1), P(L, w.h, -1), P(0, w.h, -1), V(0, 1, 0));
  if (w.ends) {
    quadFacing(w.reveal, P(0, 0, 1), P(0, 0, -1), P(0, w.h, -1), P(0, w.h, 1), dir.clone().negate());
    quadFacing(w.reveal, P(L, 0, -1), P(L, 0, 1), P(L, w.h, 1), P(L, w.h, -1), dir);
  }
}

function fillOpening(w: WallSpec, kind: OpeningKind, P: (s: number, y: number, side: number) => THREE.Vector3, dir: THREE.Vector3, n: THREE.Vector3,
  c: number, hw: number, sill: number, oh: number, spring: number, arched: boolean) {
  if (kind === 'archway' || kind === 'arrow_slit') return;
  if (isDoor(kind)) {
    // door leaves swung open ~75° inwards so the doorway is walkable
    const leaves = kind === 'door_double' ? [[c - hw, 1], [c + hw, -1]] : [[c - hw, 1]];
    const lw = kind === 'door_double' ? hw : hw * 2;
    for (const [hinge, sgn] of leaves) {
      const hp = P(hinge, sill, -0.6);
      const ang = 75 * Math.PI / 180;
      const along = dir.clone().multiplyScalar(sgn);
      const inward = n.clone().negate();
      const open = along.clone().multiplyScalar(Math.cos(ang)).addScaledVector(inward, Math.sin(ang));
      const far = hp.clone().addScaledVector(open, lw);
      const top = (arched ? spring : sill + oh) - 0.02;
      const g = kind === 'door_lattice' ? w.fills.cnDoor : w.fills.door;
      const th = 0.08;
      const off = V(-open.z, 0, open.x).multiplyScalar(th / 2);
      const a0 = hp.clone().add(off), a1 = far.clone().add(off), b0 = hp.clone().sub(off), b1 = far.clone().sub(off);
      quadFacing(g, a0, a1, a1.clone().setY(top), a0.clone().setY(top), off);
      quadFacing(g, b1, b0, b0.clone().setY(top), b1.clone().setY(top), off.clone().negate());
      quadFacing(g, a1.clone().setY(top), b1.clone().setY(top), b0.clone().setY(top), a0.clone().setY(top), V(0, 1, 0));
      quadFacing(g, a1, b1, b1.clone().setY(top), a1.clone().setY(top), open);
    }
    return;
  }
  // windows: pane in the middle of the wall
  const g = kind === 'window_stained' ? w.fills.stained : kind === 'window_lattice' ? w.fills.lattice : w.fills.glass;
  const s0 = c - hw, s1 = c + hw;
  const top = arched ? spring : sill + oh;
  for (const side of [0.05, -0.05]) {
    const want = side > 0 ? n : n.clone().negate();
    quadFacing(g, P(s0, sill, side), P(s1, sill, side), P(s1, top, side), P(s0, top, side), want);
    if (arched) {
      const N = 8;
      for (let k = 0; k < N; k++) {
        const t0 = Math.PI - (k / N) * Math.PI, t1 = Math.PI - ((k + 1) / N) * Math.PI;
        g.tri(...((): [THREE.Vector3, THREE.Vector3, THREE.Vector3] => {
          const p0 = P(c, spring, side), p1 = P(c + Math.cos(t0) * hw, spring + Math.sin(t0) * hw, side), p2 = P(c + Math.cos(t1) * hw, spring + Math.sin(t1) * hw, side);
          const nn = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
          return nn.dot(want) >= 0 ? [p0, p1, p2] : [p0, p2, p1];
        })(), WHITE);
      }
    }
  }
  if (kind === 'window_shutter') {
    // open shutters on the outside face
    for (const sgn of [-1, 1]) {
      const sc = sgn < 0 ? s0 - hw / 2 - 0.05 : s1 + hw / 2 + 0.05;
      const p = P(sc, sill + oh / 2, 1.2);
      w.fills.frame.box(p.x, p.y, p.z, hw, oh, 0.05, Math.atan2(dir.x, dir.z) + Math.PI / 2, C('#3f6b3a'));
    }
  }
}

/** Polygon slab (top + bottom + optional rim) with rectangular/circular holes, via ShapeGeometry. */
function slab(pts: V2[], holes: V2[][], y: number, thick: number, topMat: GeoBuilder, bottomMat: GeoBuilder | null) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const sg = new THREE.ShapeGeometry(shape);
  const pos = sg.attributes.position, idx = sg.index!;
  const tri = (i: number) => V(pos.getX(i), 0, -pos.getY(i));
  for (let k = 0; k < idx.count; k += 3) {
    const a = tri(idx.getX(k)), b = tri(idx.getX(k + 1)), c = tri(idx.getX(k + 2));
    const ta = a.clone().setY(y), tb = b.clone().setY(y), tc = c.clone().setY(y);
    const nn = new THREE.Vector3().subVectors(tb, ta).cross(new THREE.Vector3().subVectors(tc, ta));
    if (nn.y >= 0) topMat.tri(ta, tb, tc, WHITE); else topMat.tri(ta, tc, tb, WHITE);
    if (bottomMat) {
      const ba = a.clone().setY(y - thick), bb = b.clone().setY(y - thick), bc = c.clone().setY(y - thick);
      const n2 = new THREE.Vector3().subVectors(bb, ba).cross(new THREE.Vector3().subVectors(bc, ba));
      if (n2.y <= 0) bottomMat.tri(ba, bb, bc, WHITE); else bottomMat.tri(ba, bc, bb, WHITE);
    }
  }
  // slab uvs from world xz (ShapeGeometry doesn't give us metres)
  sg.dispose();
}

/** Recompute planar UVs (xz in metres) for horizontal surfaces of a builder. */
function planarUV(g: GeoBuilder, from: number) {
  for (let i = from; i < g.pos.length / 3; i++) { g.uv[i * 2] = g.pos[i * 3]; g.uv[i * 2 + 1] = g.pos[i * 3 + 2]; }
}

function stairHole(s: Stair, height: number): V2[] {
  if (s.kind === 'spiral') {
    const r = 1.55;
    return Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return [s.pos[0] + Math.cos(a) * r, s.pos[1] + Math.sin(a) * r] as V2; });
  }
  const run = height * 1.6, w = s.width / 2 + 0.1;
  const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
  const loc: V2[] = [[-w, run * 0.25], [w, run * 0.25], [w, run + 0.2], [-w, run + 0.2]];
  return loc.map(([x, z]) => [s.pos[0] + x * c + z * sn, s.pos[1] - x * sn + z * c] as V2);
}

function buildStair(g: GeoBuilder, s: Stair, y0: number, height: number) {
  const col = C('#ffffff');
  if (s.kind === 'spiral') {
    const n = Math.max(12, Math.round(height / 0.2));
    g.cyl(s.pos[0], y0, s.pos[1], 0.18, 0.18, height, 8, col);
    for (let i = 0; i < n; i++) {
      const a0 = s.rotY + (i / n) * Math.PI * 2 * 0.92, a1 = a0 + 0.42;
      const y = y0 + ((i + 1) / n) * height;
      const R = 1.45;
      const c0 = V(s.pos[0], y, s.pos[1]);
      const p0 = V(s.pos[0] + Math.cos(a0) * R, y, s.pos[1] + Math.sin(a0) * R), p1 = V(s.pos[0] + Math.cos(a1) * R, y, s.pos[1] + Math.sin(a1) * R);
      g.tri(c0, p1, p0, col);
      const d = V(0, -0.2, 0);
      quadFacing(g, p0, p1, p1.clone().add(d), p0.clone().add(d), V(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)));
      quadFacing(g, c0, p0, p0.clone().add(d), c0.clone().add(d), V(Math.sin(a0), 0, -Math.cos(a0)));
    }
    return;
  }
  const n = Math.max(4, Math.round(height / 0.19));
  const run = height * 1.6, w = s.width;
  const c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
  const tr = (x: number, y: number, z: number) => V(s.pos[0] + x * c + z * sn, y0 + y, s.pos[1] - x * sn + z * c);
  for (let i = 0; i < n; i++) {
    const z0 = (i / n) * run, z1 = ((i + 1) / n) * run, y = ((i + 1) / n) * height;
    const m = new THREE.Matrix4().makeRotationY(s.rotY).setPosition(tr(0, y / 2, (z0 + z1) / 2));
    g.boxM(m, w, y, z1 - z0 + 0.01, col);
  }
  // simple rail on one side
  const p0 = tr(w / 2, 1.0, 0), p1 = tr(w / 2, height + 1.0, run);
  g.beam(p0, p1, 0.06, 0.06, C('#6b4a2c'));
}

function ceilingFor(f: FloorDef, pts: V2[], y: number, g: GeoBuilder, beams: GeoBuilder, b: BuildingDef) {
  if (f.ceiling === 'vaulted' && b.shape === 'rect') {
    // barrel vault spanning the shorter axis
    const alongX = b.width >= b.depth;
    const span = (alongX ? b.depth : b.width) / 2 - b.wallThickness;
    const len = (alongX ? b.width : b.depth) / 2 - b.wallThickness;
    const rise = Math.min(span * 0.5, 1.6);
    const N = 10;
    for (let k = 0; k < N; k++) {
      const t0 = -1 + (2 * k) / N, t1 = -1 + (2 * (k + 1)) / N;
      const y0 = y - rise + rise * Math.sqrt(1 - t0 * t0), y1 = y - rise + rise * Math.sqrt(1 - t1 * t1);
      const a = alongX ? V(-len, y0, t0 * span) : V(t0 * span, y0, -len), bb = alongX ? V(len, y0, t0 * span) : V(t0 * span, y0, len);
      const cc = alongX ? V(len, y1, t1 * span) : V(t1 * span, y1, len), d = alongX ? V(-len, y1, t1 * span) : V(t1 * span, y1, -len);
      quadFacing(g, a, bb, cc, d, V(0, -1, 0));
    }
    // fill the wall above the vault at the ends
    return;
  }
  const from = g.vertexCount;
  // the underside of a zero-thickness slab faces down
  slab(pts, [], y, 0, new GeoBuilder(), g);
  planarUV(g, from);
  if (f.ceiling === 'beamed') {
    const col = C('#4e3522');
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    for (let x = minX + 1.2; x < maxX - 0.6; x += 1.8) beams.box(x, y - 0.15, (minZ + maxZ) / 2, 0.22, 0.3, maxZ - minZ, 0, col);
  }
}

export interface MeshedBuilding {
  root: THREE.Group;
  levels: Map<number, THREE.Group>;
  roof: THREE.Group;
  anim: THREE.Group; // animated parts (drawbridge, portcullis, sails…)
}

/** Build the full building mesh (shell, floors, interiors, roof) in building-local space. */
export function meshBuilding(b: BuildingDef): MeshedBuilding {
  const root = new THREE.Group();
  const levels = new Map<number, THREE.Group>();
  const roofG = new THREE.Group();
  const anim = new THREE.Group();
  root.add(roofG, anim);
  const t = b.wallThickness;
  const outerPts = footprint(b, 0);
  const extTex = EXTERIOR_TEX[b.material];
  const sorted = [...b.floors].sort((a, c) => a.level - c.level);
  const top = totalHeight(b);
  const minLevel = sorted[0]?.level ?? 0;
  const lowest = levelBase(b, minLevel);

  for (const f of sorted) {
    const g = new THREE.Group();
    g.userData.level = f.level;
    levels.set(f.level, g);
    root.add(g);
    const B = new Buckets();
    const y0 = levelBase(b, f.level);
    // tapering buildings (pagodas) step each storey inward
    const li = levelInset(b, f.level);
    const center = footprint(b, t / 2 + li);
    const innerPts = footprint(b, t + li);
    const nextInset = sorted.some((x) => x.level === f.level + 1) ? levelInset(b, f.level + 1) : Infinity;
    const outer = B.get(`ext:${extTex}`, () => surfaceMaterial(extTex), 'extwall');
    const inner = B.get(`in:${f.wallMat}`, () => surfaceMaterial(SURFACE_TEX[f.wallMat]), 'intwall');
    const reveal = B.get(`ext:${extTex}`, () => surfaceMaterial(extTex), 'extwall');
    const fills = {
      door: B.get('door', () => surfaceMaterial('door_planks'), 'fill'),
      glass: B.get('glass', () => surfaceMaterial('glass', '#ffffff', { side: THREE.DoubleSide, emissive: true }), 'glass'),
      stained: B.get('stained', () => surfaceMaterial('stained', '#ffffff', { side: THREE.DoubleSide, emissive: true }), 'glass'),
      frame: B.get('frame', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'fill'),
      lattice: B.get('lattice', () => surfaceMaterial('lattice', '#ffffff', { side: THREE.DoubleSide, emissive: true }), 'glass'),
      cnDoor: B.get('cndoor', () => surfaceMaterial('door_lattice', '#ffffff', { side: THREE.DoubleSide }), 'fill'),
    };
    // exterior walls
    const n = center.length;
    for (let i = 0; i < (b.extra.open ? 0 : n); i++) {
      const a = center[i], c = center[(i + 1) % n];
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
      // extend the centre-line by t/2 so corners close on rectangles
      const ext = b.shape === 'rect' ? t / 2 : 0.02;
      const a2: V2 = [a[0] - (dx / L) * ext, a[1] - (dz / L) * ext], c2: V2 = [c[0] + (dx / L) * ext, c[1] + (dz / L) * ext];
      const ops = b.openings.filter((o) => o.wall === `ext:${i}` && (o.floor ?? 0) === f.level).map((o) => ({ ...o, t: (o.t * L + ext) / (L + 2 * ext) }));
      buildWall({ a: a2, b: c2, y0, h: f.height, t, outN: V(dz / L, 0, -dx / L), outer, inner, reveal, openings: ops, fills, caps: f.level === sorted[sorted.length - 1].level || nextInset > li });
    }
    // floor slab (holes for stairs arriving from below)
    const holes = sorted.find((x) => x.level === f.level - 1)?.stairs.map((s) => stairHole(s, sorted.find((x) => x.level === f.level - 1)!.height)) ?? [];
    const floorG = B.get(`floor:${f.floorMat}`, () => surfaceMaterial(SURFACE_TEX[f.floorMat]), 'floor');
    const under = B.get(`under:${b.material}`, () => surfaceMaterial('plaster', '#cfc4ad'), 'floor');
    const from = floorG.vertexCount;
    slab(innerPts, holes, y0 + 0.02, SLAB, floorG, f.level > minLevel ? null : under);
    planarUV(floorG, from);
    // room floor overlays
    for (const r of f.rooms) {
      if (r.floorMat === f.floorMat) continue;
      const rg = B.get(`floor:${r.floorMat}`, () => surfaceMaterial(SURFACE_TEX[r.floorMat]), 'floor');
      const fr = rg.vertexCount;
      const [x0, z0, x1, z1] = r.rect;
      slab([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [], y0 + 0.035, 0, rg, null);
      planarUV(rg, fr);
    }
    // ceiling (underside of the floor above) for this level
    const isTop = f.level === sorted[sorted.length - 1].level;
    if (!isTop || b.roof === 'flat' || b.roof === 'none') {
      const cg = B.get(`ceil:${f.ceiling}`, () => surfaceMaterial(f.ceiling === 'beamed' ? 'ceiling_beams' : f.ceiling === 'vaulted' ? 'stone' : 'plaster'), 'ceiling');
      const beams = B.get('beams', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'ceiling');
      ceilingFor(f, innerPts, y0 + f.height - SLAB, cg, beams, b);
    }
    // interior walls
    for (const w of f.walls) {
      const wg = B.get(`in:${w.material}`, () => surfaceMaterial(SURFACE_TEX[w.material]), 'intwall');
      const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz);
      if (L < 0.1) continue;
      const ops = b.openings.filter((o) => o.wall === w.id && (o.floor ?? 0) === f.level);
      buildWall({ a: w.a, b: w.b, y0, h: f.height - SLAB, t: w.thickness, outN: V(dz / L, 0, -dx / L), outer: wg, inner: wg, reveal: wg, openings: ops, fills, caps: true, ends: true });
    }
    // stairs
    const sg = B.get('stairs', () => surfaceMaterial('stone', '#d8d2c4'), 'stairs');
    for (const s of f.stairs) buildStair(sg, s, y0, f.height);
    B.into(g);
  }

  // foundation plinth (hides terrain seams on slopes)
  {
    const B = new Buckets();
    const pg = B.get('plinth', () => surfaceMaterial(b.material === 'timber' || b.material === 'whitewash' ? 'greystone' : extTex, '#bdb6a8'), 'extwall');
    const ring = footprint(b, -0.12);
    const yb = Math.min(lowest, 0) - 1.6;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
      quadFacing(pg, V(a[0], yb, a[1]), V(c[0], yb, c[1]), V(c[0], 0.35, c[1]), V(a[0], 0.35, a[1]), V(dz / L, 0, -dx / L));
      quadFacing(pg, V(a[0], 0.35, a[1]), V(c[0], 0.35, c[1]), V(c[0] * 0.98, 0.35, c[1] * 0.98), V(a[0] * 0.98, 0.35, a[1] * 0.98), V(0, 1, 0));
    }
    // Chinese terrace + columns
    if (b.extra.terrace || b.extra.columns || b.extra.open) {
      const cg = B.get('cnbase', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 'extwall');
      const tt = B.get('terrace', () => surfaceMaterial('flagstone', '#d8d2c4'), 'extwall');
      const ts = B.get('terraceside', () => surfaceMaterial('greystone', '#d0cabd'), 'extwall');
      buildChineseBase(b, cg, tt, ts);
    }
    const g = levels.get(minLevel) ?? root;
    B.into(g);
  }

  buildRoof(b, roofG, outerPts, top);
  void WHITE;
  return { root, levels, roof: roofG, anim };
}

function buildRoof(b: BuildingDef, roofG: THREE.Group, _outer: V2[], top: number) {
  const B = new Buckets();
  const thatch = b.extra.thatch === true;
  const roofMat = () => surfaceMaterial(thatch ? 'thatch' : 'roof_tiles', thatch ? '#ffffff' : b.roofColor, { side: THREE.DoubleSide });
  const rg = B.get('roof', roofMat, 'roof');
  const wallTex = EXTERIOR_TEX[b.material];
  const wg = B.get('roofwall', () => surfaceMaterial(wallTex), 'roof');
  const over = 0.45;
  const ti = topInset(b);
  const hw = b.width / 2 - ti, hd = b.depth / 2 - ti;
  const cren = b.crenellations;
  const parapetH = 1.1;
  // parapet + merlons around the top
  if (cren || b.roof === 'flat') {
    const ring = footprint(b, ti), inner = footprint(b, b.wallThickness * 0.6 + ti);
    const n = ring.length;
    // corbel ledge
    for (let i = 0; i < n; i++) {
      const a = ring[i], c = ring[(i + 1) % n];
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz), nn = V(dz / L, 0, -dx / L);
      const o = 0.25;
      const A = V(a[0] + nn.x * o, top, a[1] + nn.z * o), Cc = V(c[0] + nn.x * o, top, c[1] + nn.z * o);
      quadFacing(wg, A, Cc, Cc.clone().setY(top + parapetH * 0.55), A.clone().setY(top + parapetH * 0.55), nn);
      quadFacing(wg, V(a[0], top - 0.35, a[1]), V(c[0], top - 0.35, c[1]), Cc, A, V(nn.x, -1, nn.z));
      const ia = inner[i], ic = inner[(i + 1) % n];
      quadFacing(wg, V(ia[0], top, ia[1]), V(ic[0], top, ic[1]), V(ic[0], top + parapetH * 0.55, ic[1]), V(ia[0], top + parapetH * 0.55, ia[1]), nn.clone().negate());
      quadFacing(wg, A.clone().setY(top + parapetH * 0.55), Cc.clone().setY(top + parapetH * 0.55), V(ic[0], top + parapetH * 0.55, ic[1]), V(ia[0], top + parapetH * 0.55, ia[1]), V(0, 1, 0));
      // merlons
      const m = Math.max(1, Math.floor(L / 1.6));
      for (let k = 0; k < m; k++) {
        const tt = (k + 0.5) / m;
        const px = a[0] + dx * tt + nn.x * (o - b.wallThickness * 0.15), pz = a[1] + dz * tt + nn.z * (o - b.wallThickness * 0.15);
        wg.box(px, top + parapetH * 0.55 + 0.4, pz, b.wallThickness * 0.45 + 0.2, 0.8, Math.min(0.9, L / m * 0.55), Math.atan2(dx, dz), WHITE);
      }
    }
    if (b.roof === 'flat') {
      const fg = B.get('rooffloor', () => surfaceMaterial('flagstone'), 'roof');
      const from = fg.vertexCount;
      slab(footprint(b, 0.05 + ti), [], top + 0.02, 0, fg, null);
      planarUV(fg, from);
    }
  }
  if (b.roof === 'eaves') {
    const tiles = B.get('cntiles', () => surfaceMaterial('cn_tiles', b.roofColor, { side: THREE.DoubleSide }), 'roof');
    const vc = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    buildChineseRoof(b, { tiles, soffit: B.get('cnsoffit', vc, 'roof'), ridge: B.get('cnridge', vc, 'roof'), wall: wg,
      finial: B.get('finial', () => new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.6, roughness: 0.4 }), 'roof') }, top);
  }
  const roofBase = cren ? top + parapetH * 0.3 : top;
  if (b.roof === 'conical') {
    const r = (b.shape === 'round' ? b.width / 2 - ti : Math.max(hw, hd)) + (cren ? -0.15 : over);
    const hgt = r * 2.1;
    const seg = b.shape === 'round' ? 16 : 4;
    rg.cyl(0, roofBase, 0, r, 0, hgt, seg, WHITE, false, b.shape === 'round' ? 0 : Math.PI / 4);
    // underside disc
    if (!cren) rg.cyl(0, roofBase - 0.01, 0, r, r * 0.001, 0.0, seg, WHITE, false);
    const fin = B.get('finial', () => new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.6, roughness: 0.4 }), 'roof');
    fin.cyl(0, roofBase + hgt - 0.1, 0, 0.06, 0.06, 1.2, 6, WHITE);
    // uv for cone: wrap around (use world xz + height)
    for (let i = 0; i < rg.vertexCount; i++) { rg.uv[i * 2] = Math.atan2(rg.pos[i * 3 + 2], rg.pos[i * 3]) * r; rg.uv[i * 2 + 1] = rg.pos[i * 3 + 1] * 1.2; }
  } else if (b.roof === 'pitched' || b.roof === 'hipped') {
    const alongX = b.width >= b.depth;
    const half = (alongX ? hd : hw) + over, len = (alongX ? hw : hd) + over;
    const hgt = Math.min(half * 1.15, 7);
    const ridgeInset = b.roof === 'hipped' ? half : 0;
    const P = (u: number, y: number, v: number) => (alongX ? V(u, y, v) : V(v, y, u)); // u along ridge, v across
    const y0 = roofBase - 0.15;
    // two main slopes
    for (const s of [1, -1]) {
      const a = P(-len, y0, s * half), bb = P(len, y0, s * half), c = P(len - ridgeInset, y0 + hgt, 0), d = P(-len + ridgeInset, y0 + hgt, 0);
      quadFacing(rg, a, bb, c, d, alongX ? V(0, 1, s) : V(s, 1, 0));
      // thickness edge
      quadFacing(rg, a, bb, bb.clone().setY(y0 - 0.15), a.clone().setY(y0 - 0.15), alongX ? V(0, 0, s) : V(s, 0, 0));
    }
    if (b.roof === 'hipped') {
      for (const s of [1, -1]) {
        const a = P(s * len, y0, -half), bb = P(s * len, y0, half), c = P(s * (len - ridgeInset), y0 + hgt, 0);
        const nn = alongX ? V(s, 1, 0) : V(0, 1, s);
        const tri = [a, bb, c];
        const cr = new THREE.Vector3().subVectors(tri[1], tri[0]).cross(new THREE.Vector3().subVectors(tri[2], tri[0]));
        if (cr.dot(nn) >= 0) rg.tri(a, bb, c, WHITE); else rg.tri(bb, a, c, WHITE);
      }
    } else {
      // gable end walls
      for (const s of [1, -1]) {
        const ins = (alongX ? hw : hd) - 0.01;
        const a = P(s * ins, roofBase - 0.2, -(half - over)), bb = P(s * ins, roofBase - 0.2, half - over), c = P(s * ins, roofBase - 0.2 + (hgt * (half - over)) / half, 0);
        const nn = alongX ? V(s, 0, 0) : V(0, 0, s);
        const cr = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(c, a));
        if (cr.dot(nn) >= 0) wg.tri(a, bb, c, WHITE); else wg.tri(bb, a, c, WHITE);
        // inside face of the gable, slightly inset so it doesn't z-fight with the outside face
        const inset = nn.clone().multiplyScalar(-b.wallThickness);
        const ai = a.clone().add(inset), bi = bb.clone().add(inset), ci = c.clone().add(inset);
        if (cr.dot(nn) >= 0) wg.tri(bi, ai, ci, WHITE); else wg.tri(ai, bi, ci, WHITE);
      }
    }
    // chimney for cottages/halls
    if (b.extra.chimney) {
      const cg = B.get('chimney', () => surfaceMaterial('greystone'), 'roof');
      const cx = alongX ? hw * 0.55 : hd * 0.3, cz = alongX ? hd * 0.3 : hw * 0.55;
      const m = new THREE.Matrix4().setPosition(alongX ? V(cx, y0 + hgt * 0.55, cz * 0.5) : V(cz * 0.5, y0 + hgt * 0.55, cx));
      cg.boxM(m, 0.9, hgt * 1.0 + 0.8, 0.9, WHITE);
    }
  }
  B.into(roofG);
  void hw;
}
