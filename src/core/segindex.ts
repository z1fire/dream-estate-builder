import type { V2 } from './math';

/** Grid-bucketed segment index for fast "nearest point on polyline within R" queries. */
export class SegIndex {
  private cells = new Map<number, number[]>();
  readonly n: number;
  constructor(public pts: V2[], public closed: boolean, private maxR: number, private cell = 16) {
    this.n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < this.n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const x0 = Math.floor((Math.min(a[0], b[0]) - maxR) / cell), x1 = Math.floor((Math.max(a[0], b[0]) + maxR) / cell);
      const z0 = Math.floor((Math.min(a[1], b[1]) - maxR) / cell), z1 = Math.floor((Math.max(a[1], b[1]) + maxR) / cell);
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const k = (z + 4096) * 8192 + (x + 4096);
          let arr = this.cells.get(k);
          if (!arr) this.cells.set(k, (arr = []));
          arr.push(i);
        }
    }
  }
  /** Nearest segment within maxR: distance, segment index, param t, and signed side (+1 left / -1 right). */
  nearest(x: number, z: number): { d: number; i: number; t: number; side: number } | null {
    const k = (Math.floor(z / this.cell) + 4096) * 8192 + (Math.floor(x / this.cell) + 4096);
    const arr = this.cells.get(k);
    if (!arr) return null;
    let best = this.maxR, bi = -1, bt = 0, bs = 1;
    for (const i of arr) {
      const a = this.pts[i], b = this.pts[(i + 1) % this.pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a[0] + t * dx, pz = a[1] + t * dz;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bi = i; bt = t; bs = dx * (z - a[1]) - dz * (x - a[0]) < 0 ? 1 : -1; }
    }
    return bi < 0 ? null : { d: best, i: bi, t: bt, side: bs };
  }
}
