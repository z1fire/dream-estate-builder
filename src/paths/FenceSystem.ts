import * as THREE from 'three';
import type { App, System } from '../app/App';
import { C, GeoBuilder, vary } from '../core/geom';
import { rng, type V2 } from '../core/math';
import type { FenceDef, FenceStyle } from '../core/types';

export const FENCE_STYLES: { id: FenceStyle; label: string; height: number }[] = [
  { id: 'rail', label: 'Wooden rail', height: 1.25 },
  { id: 'picket', label: 'Picket', height: 1.0 },
  { id: 'wattle', label: 'Wattle', height: 1.1 },
  { id: 'drystone', label: 'Dry stone', height: 1.1 },
  { id: 'hedge', label: 'Hedge', height: 1.6 },
];

const GATE_W = 1.8;
const COL = { wood: C('#7a5432'), woodDark: C('#5a3d24'), picket: C('#e9e2d2'), wattle: C('#8a6a40'), stone: C('#8f8b80'), hedge: C('#3f6e2c') };

/** Fences, hedges and dry-stone walls drawn along a line, following the terrain, with gates. */
export class FenceSystem implements System {
  group = new THREE.Group();
  private objs = new Map<string, { sig: string; obj: THREE.Mesh }>();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  private timer = 0;

  constructor(private app: App) {
    this.group.name = 'fences';
    app.store.subscribe((c) => {
      if (c.type === 'doc') this.sync(true);
      else if (c.type === 'collection' && c.key === 'fences') this.sync(false);
      else if (c.type === 'terrain') { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.sync(true), 300); }
    });
    app.boxResolvers.set('fences', (id) => { const o = this.objs.get(id)?.obj; return o ? new THREE.Box3().setFromObject(o) : null; });
    this.sync(true);
  }

  sync(force: boolean) {
    const doc = this.app.store.doc;
    const ids = new Set(doc.fences.map((f) => f.id));
    for (const [id, v] of this.objs) if (!ids.has(id) || force) { this.group.remove(v.obj); v.obj.geometry.dispose(); this.objs.delete(id); }
    for (const f of doc.fences) {
      const sig = JSON.stringify(f);
      const cur = this.objs.get(f.id);
      if (cur && cur.sig === sig) continue;
      if (cur) { this.group.remove(cur.obj); cur.obj.geometry.dispose(); }
      const mesh = new THREE.Mesh(this.build(f), this.material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.pick = { kind: 'fences', id: f.id };
      this.group.add(mesh);
      this.objs.set(f.id, { sig, obj: mesh });
    }
  }

  build(f: FenceDef): THREE.BufferGeometry {
    const g = new GeoBuilder();
    const H = (x: number, z: number) => this.app.terrain.heightAt(x, z);
    const pts = f.closed ? [...f.points, f.points[0]] : f.points;
    const r = rng(f.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.05) continue;
      const gate = f.gates.includes(s) && L > GATE_W + 0.6;
      const g0 = gate ? (L - GATE_W) / 2 / L : 1, g1 = gate ? (L + GATE_W) / 2 / L : 1;
      // run(s) of fence: [0, g0] and [g1, 1]
      const runs: [number, number][] = gate ? [[0, g0], [g1, 1]] : [[0, 1]];
      for (const [t0, t1] of runs) this.run(g, f, lerp2(a, b, t0), lerp2(a, b, t1), H, r);
      if (gate) this.gate(g, f, lerp2(a, b, g0), lerp2(a, b, g1), H);
    }
    return g.build();
  }

  private run(g: GeoBuilder, f: FenceDef, a: V2, b: V2, H: (x: number, z: number) => number, r: () => number) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.05) return;
    const dir = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const h = f.height;
    const P = (t: number): THREE.Vector3 => { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; return new THREE.Vector3(x, H(x, z), z); };
    switch (f.style) {
      case 'rail':
      case 'picket': {
        const n = Math.max(1, Math.round(L / 2.4));
        for (let i = 0; i <= n; i++) { const p = P(i / n); g.box(p.x, p.y + h / 2, p.z, 0.14, h + 0.1, 0.14, dir, vary(COL.woodDark, i)); }
        const rails = f.style === 'rail' ? [h * 0.45, h * 0.85] : [h * 0.3, h * 0.75];
        for (let i = 0; i < n; i++) {
          const p0 = P(i / n), p1 = P((i + 1) / n);
          for (const ry of rails) g.beam(p0.clone().setY(p0.y + ry), p1.clone().setY(p1.y + ry), 0.06, 0.12, vary(COL.wood, i + ry));
        }
        if (f.style === 'picket') {
          const m = Math.max(1, Math.round(L / 0.16));
          for (let i = 0; i < m; i++) {
            const p = P((i + 0.5) / m);
            // local x = across the fence, local z = along it
            g.box(p.x, p.y + h * 0.45, p.z, 0.025, h * 0.9, 0.09, dir, COL.picket);
            g.box(p.x, p.y + h * 0.92, p.z, 0.025, 0.065, 0.065, dir, COL.picket, Math.PI / 4);
          }
        }
        break;
      }
      case 'wattle': {
        const n = Math.max(1, Math.round(L / 0.9));
        for (let i = 0; i <= n; i++) { const p = P(i / n); g.box(p.x, p.y + h / 2, p.z, 0.08, h + 0.15, 0.08, dir, COL.woodDark); }
        const bands = Math.round(h / 0.11);
        for (let i = 0; i < n; i++) {
          const p0 = P(i / n), p1 = P((i + 1) / n);
          for (let k = 0; k < bands; k++) {
            const y = 0.06 + k * (h - 0.06) / bands;
            const off = ((k + i) % 2 ? 1 : -1) * 0.03;
            const o0 = new THREE.Vector3(Math.cos(dir) * off, y, -Math.sin(dir) * off);
            g.beam(p0.clone().add(o0), p1.clone().add(o0), 0.05, 0.09, vary(COL.wattle, k * 7 + i));
          }
        }
        break;
      }
      case 'drystone': {
        const rows = Math.max(2, Math.round(h / 0.28));
        for (let k = 0; k < rows; k++) {
          const sw = 0.55 + (k % 2) * 0.1;
          const m = Math.max(1, Math.round(L / sw));
          for (let i = 0; i < m; i++) {
            const t = (i + 0.5 + (k % 2 ? 0.25 : 0)) / m;
            if (t > 1) continue;
            const p = P(Math.min(1, t));
            const th = 0.7 - k * 0.06;
            g.box(p.x, p.y + 0.14 + k * 0.27 - 0.05, p.z, th + r() * 0.08, 0.28 + r() * 0.05, L / m * 0.96, dir + (r() - 0.5) * 0.12, vary(COL.stone, k * 31 + i, 0.14));
          }
        }
        // cap stones
        const m = Math.max(1, Math.round(L / 0.3));
        for (let i = 0; i < m; i++) {
          const p = P((i + 0.5) / m);
          g.box(p.x, p.y + rows * 0.27 + 0.05, p.z, 0.45, 0.22, 0.16, dir, vary(COL.stone, i * 13, 0.18), 0, (r() - 0.5) * 0.5);
        }
        break;
      }
      case 'hedge':
      default: {
        const n = Math.max(1, Math.round(L / 0.9));
        for (let i = 0; i < n; i++) {
          const p = P((i + 0.5) / n);
          const jitter = 0.08;
          g.box(p.x, p.y + h / 2, p.z, 0.95 + r() * jitter, h + r() * jitter * 2, L / n + 0.12, dir, vary(COL.hedge, i * 3 + h, 0.1));
          g.box(p.x, p.y + h + 0.05, p.z, 0.75, 0.16, L / n, dir, vary(COL.hedge, i * 5, 0.12).multiplyScalar(1.08));
        }
      }
    }
  }

  private gate(g: GeoBuilder, f: FenceDef, a: V2, b: V2, H: (x: number, z: number) => number) {
    const dir = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const hp = f.style === 'hedge' ? f.height + 0.6 : Math.max(1.4, f.height + 0.25);
    for (const p of [a, b]) {
      const y = H(p[0], p[1]);
      if (f.style === 'drystone' || f.style === 'hedge') g.box(p[0], y + hp / 2, p[1], 0.5, hp, 0.5, dir, f.style === 'hedge' ? COL.hedge : COL.stone);
      else g.box(p[0], y + hp / 2, p[1], 0.2, hp, 0.2, dir, COL.woodDark);
    }
    if (f.style === 'hedge') {
      // arch over the opening
      const mid: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const y = Math.max(H(a[0], a[1]), H(b[0], b[1]));
      g.box(mid[0], y + hp - 0.2, mid[1], 0.6, 0.4, GATE_W + 0.5, dir, COL.hedge);
      return;
    }
    // swing gate (closed) with diagonal brace
    const ya = H(a[0], a[1]), yb = H(b[0], b[1]);
    const A = new THREE.Vector3(a[0], ya, a[1]), Bv = new THREE.Vector3(b[0], yb, b[1]);
    for (const y of [0.25, 0.65, 1.05]) g.beam(A.clone().setY(ya + y), Bv.clone().setY(yb + y), 0.06, 0.12, COL.wood);
    g.beam(A.clone().setY(ya + 0.25), Bv.clone().setY(yb + 1.05), 0.06, 0.1, COL.woodDark);
  }
}

function lerp2(a: V2, b: V2, t: number): V2 { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
