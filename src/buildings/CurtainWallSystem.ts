import * as THREE from 'three';
import type { App, System } from '../app/App';
import { GeoBuilder } from '../core/geom';
import { polygonSignedArea, type V2 } from '../core/math';
import type { CurtainWallDef } from '../core/types';
import { EXTERIOR_TEX, surfaceMaterial } from './materials';

const WHITE = new THREE.Color('#ffffff');
const SECTION = 4;

export function towerRadius(w: CurtainWallDef) { return w.towers === 'none' ? 0 : w.thickness + 2.6; }
export const GATE_WIDTH = 11;

/** Outward normal for segment i (closed loops: away from the inside; open: right-hand side unless flipped). */
export function segmentNormal(w: CurtainWallDef, i: number): V2 {
  const a = w.points[i], b = w.points[(i + 1) % w.points.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
  let n: V2 = [dz, -dx];
  if (w.closed && polygonSignedArea(w.points) < 0) n = [-n[0], -n[1]];
  if (w.flip) n = [-n[0], -n[1]];
  return n;
}

/** Curtain walls between towers: follow the terrain in stepped sections, wall-walk, merlons, arrow slits, buttresses. */
export class CurtainWallSystem implements System {
  group = new THREE.Group();
  private objs = new Map<string, { sig: string; obj: THREE.Group }>();
  private timer = 0;

  constructor(private app: App) {
    this.group.name = 'curtain-walls';
    app.store.subscribe((c) => {
      if (c.type === 'doc') this.sync(true);
      else if (c.type === 'collection' && c.key === 'walls') this.sync(false);
      else if (c.type === 'terrain') { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.sync(true), 400); }
    });
    app.boxResolvers.set('walls', (id) => { const o = this.objs.get(id)?.obj; return o ? new THREE.Box3().setFromObject(o) : null; });
    this.sync(true);
  }

  sync(force: boolean) {
    const doc = this.app.store.doc;
    const ids = new Set(doc.walls.map((w) => w.id));
    for (const [id, v] of this.objs) if (!ids.has(id) || force) { this.group.remove(v.obj); v.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); this.objs.delete(id); }
    for (const w of doc.walls) {
      const sig = JSON.stringify(w);
      const cur = this.objs.get(w.id);
      if (cur && cur.sig === sig) continue;
      if (cur) { this.group.remove(cur.obj); cur.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
      const obj = this.build(w);
      obj.userData.pick = { kind: 'walls', id: w.id };
      this.group.add(obj);
      this.objs.set(w.id, { sig, obj });
    }
  }

  private build(w: CurtainWallDef): THREE.Group {
    const tex = EXTERIOR_TEX[w.material];
    const g = new GeoBuilder();
    const top = new GeoBuilder();
    const H = (x: number, z: number) => this.app.terrain.heightAt(x, z);
    const n = w.closed ? w.points.length : w.points.length - 1;
    const tr = towerRadius(w);
    for (let i = 0; i < n; i++) {
      const a = w.points[i], b = w.points[(i + 1) % w.points.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dir: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const nrm = segmentNormal(w, i);
      // usable span (trim for towers at both ends)
      const s0 = tr * 0.8, s1 = L - tr * 0.8;
      const runs: [number, number][] = [];
      if (w.gateSegments.includes(i) && s1 - s0 > GATE_WIDTH + 2) {
        const mid = L / 2;
        runs.push([s0, mid - GATE_WIDTH / 2 + 0.4], [mid + GATE_WIDTH / 2 - 0.4, s1]);
      } else if (s1 > s0) runs.push([s0, s1]);
      for (const [r0, r1] of runs) this.run(g, top, w, a, dir, nrm, r0, r1, H, i);
    }
    const grp = new THREE.Group();
    const m1 = new THREE.Mesh(g.build(), surfaceMaterial(tex));
    const m2 = new THREE.Mesh(top.build(), surfaceMaterial('flagstone'));
    for (const m of [m1, m2]) { m.castShadow = m.receiveShadow = true; grp.add(m); }
    return grp;
  }

  private run(g: GeoBuilder, top: GeoBuilder, w: CurtainWallDef, a: V2, dir: V2, nrm: V2, r0: number, r1: number, H: (x: number, z: number) => number, segIdx: number) {
    const len = r1 - r0;
    if (len < 0.5) return;
    const ns = Math.max(1, Math.round(len / SECTION));
    const ht = w.thickness / 2;
    const P = (s: number, off: number, y: number) => new THREE.Vector3(a[0] + dir[0] * s + nrm[0] * off, y, a[1] + dir[1] * s + nrm[1] * off);
    const N = new THREE.Vector3(nrm[0], 0, nrm[1]);
    const D = new THREE.Vector3(dir[0], 0, dir[1]);
    const quad = (A: THREE.Vector3, B: THREE.Vector3, Cc: THREE.Vector3, Dd: THREE.Vector3, want: THREE.Vector3, gb = g) => {
      const nn = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(Dd, A));
      if (nn.dot(want) >= 0) gb.quad(A, B, Cc, Dd, WHITE); else gb.quad(B, A, Dd, Cc, WHITE);
    };
    let prevTop = -Infinity;
    for (let k = 0; k < ns; k++) {
      const sa = r0 + (k / ns) * len, sb = r0 + ((k + 1) / ns) * len;
      // section ground: min of samples across thickness; wall top = ground + height (stepped)
      let gmin = Infinity, gmax = -Infinity;
      for (const s of [sa, (sa + sb) / 2, sb]) for (const off of [-ht, ht]) { const p = P(s, off, 0); const y = H(p.x, p.z); gmin = Math.min(gmin, y); gmax = Math.max(gmax, y); }
      const yb = gmin - 1.2, yt = Math.round((gmax + w.height) * 2) / 2;
      // faces
      quad(P(sa, ht, yb), P(sb, ht, yb), P(sb, ht, yt), P(sa, ht, yt), N);
      quad(P(sb, -ht, yb), P(sa, -ht, yb), P(sa, -ht, yt), P(sb, -ht, yt), N.clone().negate());
      quad(P(sa, ht, yt), P(sb, ht, yt), P(sb, -ht, yt), P(sa, -ht, yt), new THREE.Vector3(0, 1, 0), top);
      // step faces where neighbouring sections differ in height + run ends
      if (k === 0 || Math.abs(prevTop - yt) > 0.01) quad(P(sa, ht, k === 0 ? yb : Math.min(prevTop, yt)), P(sa, -ht, k === 0 ? yb : Math.min(prevTop, yt)), P(sa, -ht, k === 0 ? yt : Math.max(prevTop, yt)), P(sa, ht, k === 0 ? yt : Math.max(prevTop, yt)), prevTop > yt ? D : D.clone().negate());
      if (k === ns - 1) quad(P(sb, -ht, yb), P(sb, ht, yb), P(sb, ht, yt), P(sb, -ht, yt), D);
      prevTop = yt;
      if (w.walkway) {
        // merlons on the outer edge, low parapet on the inner edge
        const m = Math.max(1, Math.round((sb - sa) / 1.6));
        for (let j = 0; j < m; j++) {
          const s = sa + ((j + 0.5) / m) * (sb - sa);
          const p = P(s, ht - 0.25, yt + 0.55);
          g.box(p.x, p.y, p.z, 0.5, 1.1, Math.min(0.95, (sb - sa) / m * 0.55), Math.atan2(dir[0], dir[1]), WHITE);
        }
        const ip0 = P(sa, -ht + 0.15, yt + 0.25), ip1 = P(sb, -ht + 0.15, yt + 0.25);
        g.beam(ip0, ip1, 0.3, 0.5, WHITE);
        const bp0 = P(sa, ht - 0.25, yt + 0.25), bp1 = P(sb, ht - 0.25, yt + 0.25);
        g.beam(bp0, bp1, 0.5, 0.5, WHITE);
      }
      // arrow slits on the outer face
      if ((k + segIdx) % 2 === 0 && w.height > 4) {
        const s = (sa + sb) / 2, p0 = P(s, ht + 0.01, yt - 2.6), p1 = P(s, ht + 0.01, yt - 1.2);
        const off = new THREE.Vector3(dir[0], 0, dir[1]).multiplyScalar(0.12);
        const dark = new THREE.Color('#222');
        const A = p0.clone().sub(off), B = p0.clone().add(off), Cc = p1.clone().add(off), Dd = p1.clone().sub(off);
        const nn = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(Dd, A));
        if (nn.dot(N) >= 0) g.quad(A, B, Cc, Dd, dark); else g.quad(B, A, Dd, Cc, dark);
      }
      if (w.buttresses && k % 2 === 1) {
        const s = sa, base = P(s, ht + 0.6, 0);
        const by = H(base.x, base.z) - 0.5;
        const bh = (yt - by) * 0.7;
        g.box(base.x, by + bh / 2, base.z, 1.2, bh, 1.0, Math.atan2(dir[0], dir[1]), WHITE, 0, 0);
      }
    }
  }
}
