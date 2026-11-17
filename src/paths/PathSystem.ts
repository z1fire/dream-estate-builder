import * as THREE from 'three';
import type { App, System } from '../app/App';
import { bboxOf, lerp, offsetPolyline, smoothPolyline, smoothstep, type V2 } from '../core/math';
import { SegIndex } from '../core/segindex';
import { C, GeoBuilder, vary } from '../core/geom';
import type { PathDef } from '../core/types';
import { paintCell } from '../terrain/brushes';
import type { FeatureProvider, TerrainFeature } from '../terrain/features';
import { heightAt } from '../terrain/heightfield';
import { forCells, forVerts } from '../water/WaterSystem';

const LAYER = { dirt: 2, gravel: 4, cobblestone: 5 } as const;

interface PathShape { line: V2[]; prof: number[]; idx: SegIndex; half: number }

/** Roads & paths: terrain-hugging (flattened across), painted into the ground, with automatic bridges over water. */
export class PathSystem implements System {
  group = new THREE.Group();
  private bridges = new Map<string, { sig: string; obj: THREE.Object3D }>();
  private timer = 0;
  private shapeCache = new Map<string, { sig: string; s: PathShape }>();

  constructor(private app: App) {
    this.group.name = 'paths';
    app.terrain.addProvider(this.provider());
    app.store.subscribe((c) => {
      if (c.type === 'doc' || (c.type === 'collection' && ['paths', 'water', 'moats', 'buildings'].includes(c.key))) this.schedule();
      else if (c.type === 'terrain') this.schedule(800);
    });
    app.groundPickers.push((x, z) => {
      for (const p of app.store.doc.paths) {
        const q = this.shape(p).idx.nearest(x, z);
        if (q && q.d < p.width / 2 + 0.3) return { kind: 'paths', id: p.id };
      }
      return null;
    });
    app.blockers.push((x, z) => app.store.doc.paths.some((p) => { const q = this.shape(p).idx.nearest(x, z); return !!q && q.d < p.width / 2 + 0.8; }));
    app.boxResolvers.set('paths', (id) => {
      const p = app.store.get('paths', id);
      if (!p) return null;
      const b = bboxOf(p.points);
      const y0 = app.terrain.heightAt(b.minX, b.minZ);
      return new THREE.Box3(new THREE.Vector3(b.minX - p.width / 2, y0 - 1, b.minZ - p.width / 2), new THREE.Vector3(b.maxX + p.width / 2, y0 + 2, b.maxZ + p.width / 2));
    });
  }

  /** Smoothed centre-line + gently smoothed height profile from the base terrain. */
  shape(p: PathDef): PathShape {
    const base = this.app.store.doc.heights;
    const sig = JSON.stringify(p);
    const c = this.shapeCache.get(p.id);
    if (c && c.sig === sig) return c.s;
    const line = smoothPolyline(p.points, 1, false);
    const raw = line.map(([x, z]) => heightAt(base, x, z));
    const prof = raw.map((_, i) => {
      let s = 0, n = 0;
      for (let k = -4; k <= 4; k++) { const j = i + k; if (j >= 0 && j < raw.length) { s += raw[j]; n++; } }
      return s / n;
    });
    const s = { line, prof, idx: new SegIndex(line, false, p.width / 2 + 3), half: p.width / 2 };
    this.shapeCache.set(p.id, { sig, s });
    return s;
  }
  invalidate() { this.shapeCache.clear(); }

  private provider(): FeatureProvider {
    return {
      keys: ['paths'],
      features: (doc) => doc.paths.map((p): TerrainFeature => {
        this.shapeCache.delete(p.id);
        const s = this.shape(p);
        const b = bboxOf(s.line), R = s.half + 3;
        return {
          key: `paths:${p.id}`, sig: JSON.stringify(p) + s.prof.map((v) => v.toFixed(1)).join(','), order: 30,
          box: { minX: b.minX - R, minZ: b.minZ - R, maxX: b.maxX + R, maxZ: b.maxZ + R },
          heights: (final, r) => forVerts(r, (i, x, z) => {
            const q = s.idx.nearest(x, z);
            if (!q) return;
            const t = s.prof[q.i] + (s.prof[Math.min(s.prof.length - 1, q.i + 1)] - s.prof[q.i]) * q.t;
            const crown = 0.06 * (1 - (q.d / Math.max(0.5, s.half)) ** 2);
            const w = 1 - smoothstep(s.half, s.half + 2.5, q.d);
            final[i] = lerp(final[i], t + Math.max(0, crown), w);
          }),
          splat: (sp, r) => forCells(r, (cx, cz, x, z) => {
            const q = s.idx.nearest(x, z);
            if (!q) return;
            const a = 1 - smoothstep(s.half - 0.35, s.half + 0.45, q.d);
            if (a > 0) paintCell(sp, cx, cz, LAYER[p.style], a);
            if (p.style === 'cobblestone' && q.d > s.half - 0.2 && q.d < s.half + 1) paintCell(sp, cx, cz, LAYER.gravel, 0.35);
          }),
        };
      }),
    };
  }

  private schedule(ms = 50) {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.rebuildBridges(), ms);
  }

  /** Find runs of each path that cross water and build a bridge over them. */
  rebuildBridges() {
    const water = this.app.water;
    const want = new Map<string, { sig: string; build: () => THREE.Object3D }>();
    if (water) {
      for (const p of this.app.store.doc.paths) {
        const s = this.shape(p);
        const wet = s.line.map(([x, z]) => water.surfaceAt(x, z, 0.6));
        let i = 0;
        let k = 0;
        while (i < s.line.length) {
          if (wet[i] === null) { i++; continue; }
          let j = i;
          while (j < s.line.length && wet[j] !== null) j++;
          const a = Math.max(0, i - 3), b = Math.min(s.line.length - 1, j + 2);
          const lvl = Math.max(...wet.slice(i, j).map((v) => v ?? -1e9));
          // a gatehouse drawbridge already spans this crossing → no extra bridge
          const mid = s.line[Math.floor((i + j) / 2)];
          if (this.underDrawbridge(mid[0], mid[1])) { i = j; continue; }
          const pts = s.line.slice(a, b + 1);
          const key = `${p.id}:${k++}`;
          const sig = JSON.stringify([pts, lvl, p.style, p.width]);
          want.set(key, { sig, build: () => this.buildBridge(pts, lvl, p) });
          i = j;
        }
      }
    }
    for (const [k, v] of this.bridges) if (!want.has(k) || want.get(k)!.sig !== v.sig) { this.group.remove(v.obj); (v.obj as THREE.Mesh).geometry.dispose(); this.bridges.delete(k); }
    for (const [k, w] of want) {
      if (this.bridges.has(k)) continue;
      const obj = w.build();
      obj.userData.pick = { kind: 'paths', id: k.split(':')[0] };
      this.group.add(obj);
      this.bridges.set(k, { sig: w.sig, obj });
    }
  }

  private underDrawbridge(x: number, z: number): boolean {
    for (const b of this.app.store.doc.buildings) {
      if (b.kind !== 'gatehouse' || !b.extra.drawbridge) continue;
      const fx = Math.sin(b.rotY), fz = Math.cos(b.rotY);
      const len = Number(b.extra.bridgeLength ?? 9);
      const ax = b.pos[0] + fx * b.depth / 2, az = b.pos[2] + fz * b.depth / 2;
      const t = Math.max(0, Math.min(len, (x - ax) * fx + (z - az) * fz));
      if (Math.hypot(x - (ax + fx * t), z - (az + fz * t)) < 5) return true;
    }
    return false;
  }

  private buildBridge(pts: V2[], level: number, p: PathDef): THREE.Object3D {
    const g = new GeoBuilder();
    const stone = p.style === 'cobblestone';
    const H = (x: number, z: number) => this.app.terrain.heightAt(x, z);
    const n = pts.length;
    const y0 = H(pts[0][0], pts[0][1]), y1 = H(pts[n - 1][0], pts[n - 1][1]);
    const deckBase = Math.max(level + 1.1, Math.min(y0, y1) + 0.4);
    const ys = pts.map((_, i) => {
      const t = i / (n - 1);
      const end = lerp(y0, y1, t);
      const mid = Math.max(deckBase, end) + Math.sin(t * Math.PI) * (stone ? 0.9 : 0.4);
      const ramp = Math.min(1, Math.min(t, 1 - t) * n / 3);
      return lerp(end + 0.05, mid, ramp);
    });
    const w = p.width / 2 + 0.35;
    const { left, right } = offsetPolyline(pts, w, false);
    const deckCol = stone ? C('#9a958a') : C('#8a5f3a');
    const railCol = stone ? C('#8e897e') : C('#6b4a2c');
    for (let i = 0; i < n - 1; i++) {
      const a = new THREE.Vector3(left[i][0], ys[i], left[i][1]), b = new THREE.Vector3(right[i][0], ys[i], right[i][1]);
      const c = new THREE.Vector3(right[i + 1][0], ys[i + 1], right[i + 1][1]), d = new THREE.Vector3(left[i + 1][0], ys[i + 1], left[i + 1][1]);
      const col = vary(deckCol, i, stone ? 0.05 : 0.12);
      g.quad(a, d, c, b, col);
      // deck thickness skirts
      const dn = new THREE.Vector3(0, -0.35, 0);
      g.quad(a.clone().add(dn), a, d, d.clone().add(dn), col);
      g.quad(c.clone().add(dn), c, b, b.clone().add(dn), col);
      // under-deck (visible from the water)
      g.quad(b.clone().add(dn), c.clone().add(dn), d.clone().add(dn), a.clone().add(dn), col);
    }
    // railings / parapets
    for (const side of [left, right]) {
      for (let i = 0; i < n - 1; i++) {
        const a = new THREE.Vector3(side[i][0], ys[i], side[i][1]), b = new THREE.Vector3(side[i + 1][0], ys[i + 1], side[i + 1][1]);
        if (stone) {
          g.beam(a.clone().setY(a.y + 0.45), b.clone().setY(b.y + 0.45), 0.4, 0.9, vary(railCol, i * 3));
        } else {
          g.beam(a.clone().setY(a.y + 0.95), b.clone().setY(b.y + 0.95), 0.1, 0.1, railCol);
          if (i % 2 === 0) g.box(a.x, a.y + 0.5, a.z, 0.14, 1.0, 0.14, 0, railCol);
        }
      }
    }
    // piers / arch support down to the water bed
    const mid = Math.floor(n / 2);
    if (!stone) {
      for (const i of [Math.floor(n * 0.33), Math.floor(n * 0.66)]) {
        for (const side of [left, right]) {
          const q = side[i];
          const top = ys[i] - 0.3, bot = H(q[0], q[1]) - 0.5;
          if (top - bot > 0.3) g.box(q[0], (top + bot) / 2, q[1], 0.25, top - bot, 0.25, 0, C('#5a3e26'));
        }
      }
    } else {
      const q = pts[mid];
      void q;
    }
    const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
}
