import * as THREE from 'three';
import type { App, System } from '../app/App';
import { C, GeoBuilder, vary } from '../core/geom';
import { bboxOf, lerp, offsetPolyline, smoothPolyline, smoothstep, type V2 } from '../core/math';
import { SegIndex } from '../core/segindex';
import type { RetainingWallDef } from '../core/types';
import type { FeatureProvider, TerrainFeature } from '../terrain/features';
import { heightAt } from '../terrain/heightfield';
import { forVerts } from '../water/WaterSystem';

const REACH = 16; // how far the terrace platform extends behind the wall

/**
 * Retaining walls: the ground on the LEFT of the drawn line (looking along it from above, +Z down) is raised to `height` above the
 * line and held by a stone wall; with `terrace` the raised side becomes a flat platform.
 */
export class RetainingSystem implements System {
  group = new THREE.Group();
  private objs = new Map<string, { sig: string; obj: THREE.Mesh }>();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

  constructor(private app: App) {
    this.group.name = 'retaining';
    app.terrain.addProvider(this.provider());
    app.store.subscribe((c) => {
      if (c.type === 'doc' || (c.type === 'collection' && c.key === 'retaining')) this.sync();
    });
    app.boxResolvers.set('retaining', (id) => { const o = this.objs.get(id)?.obj; return o ? new THREE.Box3().setFromObject(o) : null; });
  }

  private profile(w: RetainingWallDef) {
    const line = smoothPolyline(w.points, 1, false);
    const base = this.app.store.doc.heights;
    const prof = line.map(([x, z]) => heightAt(base, x, z));
    return { line, prof, idx: new SegIndex(line, false, REACH + 6) };
  }

  private provider(): FeatureProvider {
    return {
      keys: ['retaining'],
      features: (doc) => doc.retaining.map((w): TerrainFeature => {
        const { line, prof, idx } = this.profile(w);
        const b = bboxOf(line), R = REACH + 6;
        return {
          key: `retaining:${w.id}`, sig: JSON.stringify(w) + prof.filter((_, i) => i % 4 === 0).map((v) => v.toFixed(1)).join(','), order: 20,
          box: { minX: b.minX - R, minZ: b.minZ - R, maxX: b.maxX + R, maxZ: b.maxZ + R },
          heights: (final, r) => forVerts(r, (i, x, z) => {
            const q = idx.nearest(x, z);
            if (!q || q.side > 0) return; // raise the left side (SegIndex side -1 = offsetPolyline 'left')
            if (q.t <= 0 && q.i === 0) return; // behind the start
            if (q.t >= 1 && q.i === line.length - 2) return;
            const top = prof[q.i] + (prof[Math.min(prof.length - 1, q.i + 1)] - prof[q.i]) * q.t + w.height;
            const wgt = w.terrace ? 1 - smoothstep(REACH * 0.7, REACH + 5, q.d) : 1 - smoothstep(1, REACH, q.d);
            final[i] = Math.max(final[i], lerp(final[i], top, wgt));
          }),
        };
      }),
    };
  }

  sync() {
    const doc = this.app.store.doc;
    const ids = new Set(doc.retaining.map((w) => w.id));
    for (const [id, v] of this.objs) if (!ids.has(id)) { this.group.remove(v.obj); v.obj.geometry.dispose(); this.objs.delete(id); }
    for (const w of doc.retaining) {
      const sig = JSON.stringify(w);
      const cur = this.objs.get(w.id);
      if (cur && cur.sig === sig) continue;
      if (cur) { this.group.remove(cur.obj); cur.obj.geometry.dispose(); }
      const mesh = new THREE.Mesh(this.build(w), this.material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.pick = { kind: 'retaining', id: w.id };
      this.group.add(mesh);
      this.objs.set(w.id, { sig, obj: mesh });
    }
  }

  private build(w: RetainingWallDef): THREE.BufferGeometry {
    const { line, prof } = this.profile(w);
    const g = new GeoBuilder();
    const stone = C('#8d887c');
    const { left, right } = offsetPolyline(line, 0.35, false);
    for (let i = 0; i < line.length - 1; i++) {
      const top0 = prof[i] + w.height + 0.25, top1 = prof[i + 1] + w.height + 0.25;
      const bot0 = prof[i] - 0.8, bot1 = prof[i + 1] - 0.8;
      const col = vary(stone, i, 0.1);
      // exposed face on the right (low side, facing right), buried face on the left, cap on top
      const R0 = right[i], R1 = right[i + 1], L0 = left[i], L1 = left[i + 1];
      const V = (p: V2, y: number) => new THREE.Vector3(p[0], y, p[1]);
      g.quad(V(R1, bot1), V(R0, bot0), V(R0, top0), V(R1, top1), col);
      g.quad(V(L0, bot0), V(L1, bot1), V(L1, top1), V(L0, top0), col);
      g.quad(V(R0, top0), V(L0, top0), V(L1, top1), V(R1, top1), vary(stone, i + 100, 0.06).multiplyScalar(1.1));
      // mortar courses on the exposed face
      const o0 = dirOut(R0, L0).multiplyScalar(0.01), o1 = dirOut(R1, L1).multiplyScalar(0.01);
      for (let k = 1; k < Math.floor((w.height + 1) / 0.5) + 1; k++) {
        const y0 = bot0 + k * 0.5, y1 = bot1 + k * 0.5;
        if (y0 > top0 - 0.1) break;
        g.quad(V(R1, y1).add(o1), V(R0, y0).add(o0), V(R0, y0 + 0.04).add(o0), V(R1, y1 + 0.04).add(o1), vary(stone, k * 7 + i, 0.05).multiplyScalar(0.7));
      }
    }
    return g.build();
  }
}

function dirOut(r: V2, l: V2) { return new THREE.Vector3(r[0] - l[0], 0, r[1] - l[1]).normalize(); }
