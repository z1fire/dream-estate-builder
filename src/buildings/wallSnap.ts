import * as THREE from 'three';
import type { App } from '../app/App';
import type { CatalogItem } from '../catalog/catalog';
import type { PlacementHit } from '../catalog/PlaceTool';
import type { ToolEvent } from '../editing/Tool';
import { footprint } from './footprint';
import { segmentNormal } from './CurtainWallSystem';

/** For wall-mounted catalog items outdoors: snap to the nearest building facade or curtain wall face. */
export function exteriorWallSnap(app: App, ev: ToolEvent, item: CatalogItem): PlacementHit | null {
  if (item.snap !== 'wall' || !ev.ground) return null;
  const g = ev.ground;
  let best: { x: number; z: number; n: [number, number]; d: number } | null = null;
  const consider = (ax: number, az: number, bx: number, bz: number, n: [number, number], off: number) => {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    if (L2 < 1e-4) return;
    const t = Math.max(0, Math.min(1, ((g.x - ax) * dx + (g.z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(g.x - px, g.z - pz);
    if (d < 3 && (!best || d < best.d)) best = { x: px + n[0] * off, z: pz + n[1] * off, n, d };
  };
  for (const b of app.store.doc.buildings) {
    if (Math.hypot(b.pos[0] - g.x, b.pos[2] - g.z) > Math.max(b.width, b.depth) + 4) continue;
    const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
    const w = footprint(b).map(([x, z]) => [b.pos[0] + x * c + z * s, b.pos[2] - x * s + z * c]);
    for (let i = 0; i < w.length; i++) {
      const a = w[i], e = w[(i + 1) % w.length];
      const L = Math.hypot(e[0] - a[0], e[1] - a[1]);
      consider(a[0], a[1], e[0], e[1], [(e[1] - a[1]) / L, -(e[0] - a[0]) / L], 0.08);
    }
  }
  for (const w of app.store.doc.walls) {
    const n = w.closed ? w.points.length : w.points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = w.points[i], e = w.points[(i + 1) % w.points.length];
      const nn = segmentNormal(w, i);
      for (const sgn of [1, -1]) consider(a[0] + nn[0] * w.thickness / 2 * sgn, a[1] + nn[1] * w.thickness / 2 * sgn, e[0] + nn[0] * w.thickness / 2 * sgn, e[1] + nn[1] * w.thickness / 2 * sgn, [nn[0] * sgn, nn[1] * sgn], 0.08);
    }
  }
  if (!best) return null;
  const bb = best as { x: number; z: number; n: [number, number] };
  const y = app.terrain.heightAt(bb.x, bb.z) + (item.height < 1.2 ? 2.4 : 0.2);
  return { pos: new THREE.Vector3(bb.x, y, bb.z), rotY: Math.atan2(bb.n[0], bb.n[1]) };
}
