import * as THREE from 'three';
import type { App, System } from '../app/App';
import { lerp, offsetPolyline, pointInPolygon, resampleLinear, smoothstep, type V2 } from '../core/math';
import type { Rect } from '../core/store';
import { GRID, HALF, VERTS, type Moat, type WaterBody } from '../core/types';
import { meshParts } from '../catalog/loader';
import { paintCell } from '../terrain/brushes';
import type { FeatureProvider, TerrainFeature } from '../terrain/features';
import { heightAt } from '../terrain/heightfield';
import { createWaterMaterial, waterUniforms } from './waterMaterial';
import { MOAT_BANK, moatShape, pondDist, pondShape, POND_SHORE, streamShape, streamSurfaceAt, type MoatShape, type PondShape, type StreamShape } from './shapes';

const L = { dirt: 2, mud: 3, gravel: 4, sand: 6 };

type Shape = { kind: 'moat'; m: Moat; s: MoatShape } | { kind: 'pond'; w: WaterBody; s: PondShape } | { kind: 'stream'; w: WaterBody; s: StreamShape };

/** Moats, ponds/lakes and streams: terrain carving features + animated water meshes + stone edging. */
export class WaterSystem implements System {
  group = new THREE.Group();
  material = createWaterMaterial();
  private objs = new Map<string, { sig: string; obj: THREE.Object3D }>();
  private shapes = new Map<string, { sig: string; shape: Shape }>();
  private edgeParts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] | null = null;
  private rebuildTimer = 0;

  constructor(private app: App) {
    this.group.name = 'water';
    void meshParts('models/castle/moat_edge_stone.glb').then((p) => { this.edgeParts = p; this.rebuildAll(true); }).catch(() => {});
    app.terrain.addProvider(this.moatProvider());
    app.terrain.addProvider(this.waterProvider());
    app.store.subscribe((c) => {
      if (c.type === 'doc' || (c.type === 'collection' && (c.key === 'moats' || c.key === 'water'))) this.rebuildAll(c.type === 'doc');
      else if (c.type === 'terrain') this.scheduleStreams();
    });
    this.rebuildAll(true);
    app.boxResolvers.set('moats', (id) => this.boxOf(`moats:${id}`));
    app.boxResolvers.set('water', (id) => this.boxOf(`water:${id}`));
  }

  private boxOf(key: string) {
    const o = this.objs.get(key)?.obj;
    return o ? new THREE.Box3().setFromObject(o) : null;
  }

  // ---------- shapes (cached by signature) ----------
  private moatS(m: Moat): MoatShape {
    const key = `moats:${m.id}`, sig = JSON.stringify(m);
    const c = this.shapes.get(key);
    if (c && c.sig === sig) return (c.shape as { s: MoatShape }).s;
    const s = moatShape(m);
    this.shapes.set(key, { sig, shape: { kind: 'moat', m, s } });
    return s;
  }
  private pondS(w: WaterBody): PondShape {
    const key = `water:${w.id}`, sig = JSON.stringify(w);
    const c = this.shapes.get(key);
    if (c && c.sig === sig) return (c.shape as { s: PondShape }).s;
    const s = pondShape(w);
    this.shapes.set(key, { sig, shape: { kind: 'pond', w, s } });
    return s;
  }
  private streamS(w: WaterBody, force = false): StreamShape {
    const key = `water:${w.id}`, sig = JSON.stringify(w);
    const c = this.shapes.get(key);
    if (c && c.sig === sig && !force) return (c.shape as { s: StreamShape }).s;
    const s = streamShape(w, this.app.store.doc.heights);
    this.shapes.set(key, { sig, shape: { kind: 'stream', w, s } });
    return s;
  }

  // ---------- terrain features ----------
  private moatProvider(): FeatureProvider {
    return {
      keys: ['moats'],
      features: (doc) => doc.moats.map((m): TerrainFeature => {
        const s = this.moatS(m);
        const { half, idx } = s;
        const level = m.level, stone = m.edging === 'stone';
        return {
          key: `moats:${m.id}`, sig: JSON.stringify(m), box: s.box, order: 50,
          heights: (final, r) => forVerts(r, (i, x, z) => {
            const q = idx.nearest(x, z);
            if (!q) return;
            const d = q.d;
            if (d < half) {
              const target = stone
                ? (d < half - 0.6 ? level - m.depth : lerp(level - m.depth, level - 0.25, (d - (half - 0.6)) / 0.6))
                : level - 0.25 - (m.depth - 0.25) * (1 - smoothstep(half * 0.3, half, d));
              if (final[i] > target) final[i] = target;
            } else if (d < half + MOAT_BANK + 2) {
              const rim = level + 0.5;
              const t = smoothstep(half + 0.5, half + MOAT_BANK + 2, d);
              if (final[i] < rim) final[i] = lerp(rim, final[i], t);
              else if (!stone) final[i] = Math.min(final[i], lerp(rim, final[i], smoothstep(half, half + MOAT_BANK + 2, d)));
            }
          }),
          splat: (sp, r) => forCells(r, (cx, cz, x, z) => {
            const q = idx.nearest(x, z);
            if (!q) return;
            const d = q.d;
            if (stone) { if (d > half - 0.5 && d < half + 2.2) paintCell(sp, cx, cz, L.gravel, 0.85 * (1 - smoothstep(half + 1.4, half + 2.2, d))); }
            else if (d < half + 3) paintCell(sp, cx, cz, d < half + 0.8 ? L.mud : L.dirt, 1 - smoothstep(half + 1.2, half + 3, d));
          }),
        };
      }),
    };
  }

  private waterProvider(): FeatureProvider {
    return {
      keys: ['water'],
      features: (doc) => doc.water.map((w): TerrainFeature => {
        if (w.kind === 'pond') {
          const s = this.pondS(w);
          const level = w.level;
          return {
            key: `water:${w.id}`, sig: JSON.stringify(w), box: s.box, order: 40,
            heights: (final, r) => forVerts(r, (i, x, z) => {
              const d = pondDist(s, x, z);
              if (d > 0) {
                const target = level - 0.25 - w.depth * smoothstep(0, 9, d);
                if (final[i] > target) final[i] = target;
              } else if (d > -POND_SHORE) {
                const rim = level + 0.3, t = smoothstep(0.3, POND_SHORE, -d);
                if (final[i] < rim) final[i] = lerp(rim, final[i], t);
                else final[i] = Math.min(final[i], lerp(rim, final[i], smoothstep(0, POND_SHORE, -d)));
              }
            }),
            splat: (sp, r) => forCells(r, (cx, cz, x, z) => {
              const d = pondDist(s, x, z);
              if (d > -2.5 && d < 2) paintCell(sp, cx, cz, L.sand, 0.85 * (1 - smoothstep(1, 2.5, Math.abs(d + 0.3))));
            }),
          };
        }
        // stream: depends on base terrain → include a coarse terrain signature so it re-profiles
        const s = this.streamS(w);
        return {
          key: `water:${w.id}`, sig: JSON.stringify(w) + s.surf.map((v) => v.toFixed(1)).join(','), box: s.box, order: 45,
          heights: (final, r) => forVerts(r, (i, x, z) => {
            const q = streamSurfaceAt(s, x, z);
            if (!q) return;
            const half = s.half;
            if (q.d < half) {
              const target = q.surf - 0.12 - w.depth * (1 - smoothstep(half * 0.35, half, q.d));
              if (final[i] > target) final[i] = target;
            } else if (q.d < half + 3.5) {
              final[i] = Math.min(final[i], lerp(q.surf + 0.2, final[i], smoothstep(half, half + 3.5, q.d)));
            }
          }),
          splat: (sp, r) => forCells(r, (cx, cz, x, z) => {
            const q = s.idx.nearest(x, z);
            if (q && q.d < s.half + 1.5) paintCell(sp, cx, cz, L.gravel, 0.7 * (1 - smoothstep(s.half, s.half + 1.5, q.d)));
          }),
        };
      }),
    };
  }

  private scheduleStreams() {
    if (!this.app.store.doc.water.some((w) => w.kind === 'stream')) return;
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      // streams follow the base terrain: re-profile and refresh carving
      for (const w of this.app.store.doc.water) if (w.kind === 'stream') this.streamS(w, true);
      this.app.store.notify({ type: 'collection', key: 'water' });
    }, 600);
  }

  // ---------- meshes ----------
  rebuildAll(force = false) {
    const doc = this.app.store.doc;
    const want = new Map<string, { sig: string; build: () => THREE.Object3D }>();
    for (const m of doc.moats) want.set(`moats:${m.id}`, { sig: JSON.stringify(m) + !!this.edgeParts, build: () => this.buildMoat(m) });
    for (const w of doc.water) {
      const sig = w.kind === 'stream' ? JSON.stringify(w) + this.streamS(w).surf.map((v) => v.toFixed(1)).join(',') : JSON.stringify(w);
      want.set(`water:${w.id}`, { sig, build: () => (w.kind === 'pond' ? this.buildPond(w) : this.buildStream(w)) });
    }
    for (const [k, v] of this.objs) if (!want.has(k) || force || want.get(k)!.sig !== v.sig) { this.group.remove(v.obj); disposeObj(v.obj); this.objs.delete(k); }
    for (const [k, w] of want) {
      if (this.objs.has(k)) continue;
      const obj = w.build();
      const [kind, id] = k.split(':');
      obj.traverse((o) => { o.userData.pick = { kind, id }; });
      this.group.add(obj);
      this.objs.set(k, { sig: w.sig, obj });
    }
  }

  private waterMesh(pos: number[], idx: number[], data: number[], flow: number[]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('wdata', new THREE.Float32BufferAttribute(data, 3));
    g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    return mesh;
  }

  private buildMoat(m: Moat): THREE.Object3D {
    const s = this.moatS(m);
    const grp = new THREE.Group();
    const { left, right } = offsetPolyline(s.line, s.half + 0.35, true);
    const mid = offsetPolyline(s.line, 0, true).left;
    const pos: number[] = [], data: number[] = [], flow: number[] = [], idx: number[] = [];
    const n = s.line.length;
    for (let i = 0; i < n; i++) {
      for (const [p, dep] of [[left[i], 0.15], [mid[i], 1], [right[i], 0.15]] as [V2, number][]) {
        pos.push(p[0], m.level, p[1]); data.push(dep, 0, 0); flow.push(0, 0);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = i * 3, b = ((i + 1) % n) * 3;
      for (let k = 0; k < 2; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
    }
    grp.add(this.waterMesh(pos, idx, data, flow));
    if (m.edging === 'stone' && this.edgeParts) {
      const mats: THREE.Matrix4[] = [];
      for (const sign of [1, -1]) {
        const edge = offsetPolyline(s.line, sign * (s.half + 0.15), true).left;
        const { p, dir } = resampleLinear(edge, 3.9, true);
        p.forEach((q, i) => {
          const t = new THREE.Vector3(dir[i][0], 0, dir[i][1]);
          const up = new THREE.Vector3(0, 1, 0);
          // local +Z must face the water (centreline); offset side +1 is "left" of travel
          const left = new THREE.Vector3(-t.z, 0, t.x);
          const toWater = sign > 0 ? left.clone().negate() : left.clone();
          const xAxis = new THREE.Vector3().crossVectors(up, toWater);
          const mtx = new THREE.Matrix4().makeBasis(xAxis, up, toWater).setPosition(q[0], m.level + 0.22, q[1]);
          mats.push(mtx);
        });
      }
      for (const part of this.edgeParts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
        mats.forEach((mm, i) => im.setMatrixAt(i, mm));
        im.castShadow = im.receiveShadow = true;
        im.computeBoundingSphere();
        grp.add(im);
      }
    }
    return grp;
  }

  private buildPond(w: WaterBody): THREE.Object3D {
    const s = this.pondS(w);
    const b = s.box, step = 2;
    const nx = Math.ceil((b.maxX - b.minX) / step), nz = Math.ceil((b.maxZ - b.minZ) / step);
    const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    const pos: number[] = [], data: number[] = [], flow: number[] = [], idx: number[] = [];
    const inside = (x: number, z: number) => pondDist(s, x, z) > -1.2;
    const base = this.app.store.doc.heights;
    const v = (i: number, j: number) => {
      const k = j * (nx + 1) + i;
      if (vid[k] < 0) {
        const x = b.minX + i * step, z = b.minZ + j * step;
        vid[k] = pos.length / 3;
        const depth = Math.max(0, w.level - heightAt(this.app.terrain.final, x, z));
        pos.push(x, w.level, z); data.push(Math.min(1, depth / 3), 0, 0); flow.push(0, 0);
        void base;
      }
      return vid[k];
    };
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = b.minX + (i + 0.5) * step, z = b.minZ + (j + 0.5) * step;
        if (!inside(x, z)) continue;
        const a = v(i, j), bb = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1);
        idx.push(a, c, bb, bb, c, d);
      }
    return this.waterMesh(pos, idx, data, flow);
  }

  private buildStream(w: WaterBody): THREE.Object3D {
    const s = this.streamS(w);
    const { left, right } = offsetPolyline(s.line, s.half + 0.3, false);
    const pos: number[] = [], data: number[] = [], flow: number[] = [], idx: number[] = [];
    const n = s.line.length;
    for (let i = 0; i < n; i++) {
      const drop = Math.max(s.drop[i], s.drop[Math.max(0, i - 1)]);
      const foam = Math.min(1, drop * 1.6 + (i > 0 ? s.drop[i - 1] * 0.8 : 0));
      const slope = i < n - 1 ? s.surf[i] - s.surf[i + 1] : 0;
      const speed = Math.min(1, 0.25 + slope * 2);
      for (const p of [left[i], right[i]]) {
        pos.push(p[0], s.surf[i] + 0.02, p[1]);
        data.push(0.35, foam, 0);
        flow.push(s.dir[i][0] * speed, s.dir[i][1] * speed);
      }
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const grp = new THREE.Group();
    grp.add(this.waterMesh(pos, idx, data, flow));
    return grp;
  }

  /** Water surface height at (x,z) or null if not on water. Used by ducks, scatter, bridges, walking. */
  surfaceAt(x: number, z: number, margin = 0): number | null {
    const doc = this.app.store.doc;
    for (const m of doc.moats) {
      const q = this.moatS(m).idx.nearest(x, z);
      if (q && q.d < this.moatS(m).half + margin) return m.level;
    }
    for (const w of doc.water) {
      if (w.kind === 'pond') {
        const s = this.pondS(w);
        if (x < s.box.minX || x > s.box.maxX || z < s.box.minZ || z > s.box.maxZ) continue;
        if (pondDist(s, x, z) > -margin) return w.level;
      } else {
        const q = streamSurfaceAt(this.streamS(w), x, z);
        if (q && q.d < w.width / 2 + margin) return q.surf;
      }
    }
    return null;
  }

  /** Is (x,z) inside any water body? (including a margin) */
  isWater(x: number, z: number, margin = 0) { return this.surfaceAt(x, z, margin) !== null; }

  /** Random point on a water surface (for ducks). */
  randomPointOn(id: string, rnd: () => number): V2 | null {
    const doc = this.app.store.doc;
    const m = doc.moats.find((x) => x.id === id);
    if (m) {
      const s = this.moatS(m);
      const p = s.line[Math.floor(rnd() * s.line.length)];
      return [p[0] + (rnd() - 0.5) * s.half, p[1] + (rnd() - 0.5) * s.half];
    }
    const w = doc.water.find((x) => x.id === id);
    if (!w) return null;
    if (w.kind === 'pond') {
      const s = this.pondS(w);
      for (let k = 0; k < 30; k++) {
        const x = s.box.minX + rnd() * (s.box.maxX - s.box.minX), z = s.box.minZ + rnd() * (s.box.maxZ - s.box.minZ);
        if (pondDist(s, x, z) > 1.5) return [x, z];
      }
      return null;
    }
    const s = this.streamS(w);
    const p = s.line[Math.floor(rnd() * s.line.length)];
    return [p[0], p[1]];
  }

  update(_dt: number, t: number) {
    waterUniforms.uTime.value = t;
    waterUniforms.uSky.value.copy(this.app.env.fog.color);
    const winter = this.app.env.season === 'winter';
    const target = winter ? 1 : 0;
    waterUniforms.uIce.value += (target - waterUniforms.uIce.value) * 0.05;
  }

  /** Lowest base-terrain height along a polyline (for setting a flat water level). */
  minHeightAlong(pts: V2[], closed: boolean): number {
    let min = Infinity;
    const { p } = resampleLinear(pts, 1, closed);
    for (const [x, z] of p) min = Math.min(min, heightAt(this.app.store.doc.heights, x, z));
    return min;
  }
}

function forVerts(r: Rect, fn: (i: number, x: number, z: number) => void) {
  for (let z = r.z0; z <= r.z1; z++)
    for (let x = r.x0; x <= r.x1; x++) fn(z * VERTS + x, x - HALF, z - HALF);
}
function forCells(r: Rect, fn: (cx: number, cz: number, x: number, z: number) => void) {
  for (let z = r.z0; z <= Math.min(GRID - 1, r.z1); z++)
    for (let x = r.x0; x <= Math.min(GRID - 1, r.x1); x++) fn(x, z, x - HALF + 0.5, z - HALF + 0.5);
}
function disposeObj(o: THREE.Object3D) {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose(); });
}
export { forVerts, forCells, pointInPolygon };
