import * as THREE from 'three';
import type { App } from '../app/App';
import { fmtArea, fmtFeet, polygonArea, polylineLength, type V2 } from '../core/math';
import type { ToolEvent } from './Tool';

export interface DrawOptions {
  closed: boolean;
  minPoints: number;
  color?: string;
  /** called when the user finishes (double-click / Enter / click first point) */
  onFinish: (pts: V2[]) => void;
  onChange?: (pts: V2[]) => void;
  /** show area readout (closed shapes) */
  showArea?: boolean;
  /** freehand mode: drag to sample points every `freehandStep` metres */
  freehand?: boolean;
  freehandStep?: number;
}

/** Click-to-place polyline / polygon drawing with live preview hugging the terrain. */
export class PolylineDraw {
  pts: V2[] = [];
  private hover: V2 | null = null;
  private line: THREE.Line;
  private dots: THREE.InstancedMesh;
  private dragging = false;
  active = false;

  constructor(private app: App, public opts: DrawOptions) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 4096), 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: opts.color ?? '#ffe08a', depthTest: false, transparent: true }));
    this.line.renderOrder = 998;
    this.line.frustumCulled = false;
    this.line.userData.noPick = true;
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: opts.color ?? '#ffe08a', depthTest: false }), 512);
    this.dots.renderOrder = 999;
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.userData.noPick = true;
  }

  start() {
    this.pts = [];
    this.hover = null;
    this.active = true;
    this.app.scene.add(this.line, this.dots);
    this.redraw();
  }
  stop() {
    this.active = false;
    this.pts = [];
    this.app.scene.remove(this.line, this.dots);
    this.app.labels?.clearGroup('draw');
  }

  private snap(p: THREE.Vector3): V2 {
    const s = this.app.store.doc.settings;
    if (!s.snap) return [p.x, p.z];
    const g = s.gridSize;
    return [Math.round(p.x / g) * g, Math.round(p.z / g) * g];
  }

  down(ev: ToolEvent) {
    if (!ev.ground) return;
    const p = this.snap(ev.ground);
    if (this.opts.closed && this.pts.length >= this.opts.minPoints) {
      const f = this.pts[0];
      const pxDist = Math.hypot(p[0] - f[0], p[1] - f[1]) / this.app.rig.metresPerPixel();
      if (pxDist < 12) { this.finish(); return; }
    }
    this.pts.push(p);
    if (this.opts.freehand) this.dragging = true;
    this.opts.onChange?.(this.pts);
    this.redraw();
  }
  move(ev: ToolEvent) {
    this.hover = ev.ground ? this.snap(ev.ground) : null;
    if (this.dragging && this.hover) {
      const last = this.pts[this.pts.length - 1];
      if (Math.hypot(this.hover[0] - last[0], this.hover[1] - last[1]) >= (this.opts.freehandStep ?? 4)) {
        this.pts.push(this.hover);
        this.opts.onChange?.(this.pts);
      }
    }
    this.redraw();
  }
  up() {
    if (this.dragging) {
      this.dragging = false;
      if (this.opts.freehand && this.pts.length >= this.opts.minPoints) this.finish();
    }
  }
  dblclick() {
    // the dblclick's second click added a duplicate point
    if (this.pts.length >= 2) {
      const a = this.pts[this.pts.length - 1], b = this.pts[this.pts.length - 2];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5) this.pts.pop();
    }
    this.finish();
  }
  key(e: KeyboardEvent): boolean {
    if (e.key === 'Enter') { this.finish(); return true; }
    if (e.key === 'Backspace') { this.pts.pop(); this.redraw(); return true; }
    if (e.key === 'Escape' && this.pts.length) { this.pts = []; this.redraw(); return true; }
    return false;
  }
  finish() {
    if (this.pts.length < this.opts.minPoints) return;
    const pts = this.pts.slice();
    this.pts = [];
    this.redraw();
    this.opts.onFinish(pts);
  }

  private redraw() {
    const pts = this.hover && !this.dragging ? [...this.pts, this.hover] : this.pts.slice();
    if (this.opts.closed && pts.length > 2) pts.push(pts[0]);
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    let n = 0;
    const H = (x: number, z: number) => this.app.terrain.heightAt(x, z) + 0.3;
    for (let i = 0; i < pts.length && n < 4000; i++) {
      if (i > 0) {
        const a = pts[i - 1], b = pts[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const k = Math.min(200, Math.ceil(L / 2));
        for (let j = 1; j < k && n < 4000; j++) {
          const t = j / k, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
          pos.setXYZ(n++, x, H(x, z), z);
        }
      }
      pos.setXYZ(n++, pts[i][0], H(pts[i][0], pts[i][1]), pts[i][1]);
    }
    pos.needsUpdate = true;
    this.line.geometry.setDrawRange(0, n);
    const m = new THREE.Matrix4();
    this.dots.count = Math.min(512, this.pts.length);
    for (let i = 0; i < this.dots.count; i++) {
      const [x, z] = this.pts[i];
      const s = Math.max(0.6, this.app.rig.metresPerPixel() * 6);
      m.makeScale(s, s, s).setPosition(x, H(x, z), z);
      this.dots.setMatrixAt(i, m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
    // live readout
    const labels = [];
    if (this.hover && this.pts.length) {
      const a = this.pts[this.pts.length - 1];
      const len = Math.hypot(this.hover[0] - a[0], this.hover[1] - a[1]);
      labels.push({ text: fmtFeet(len), pos: new THREE.Vector3(this.hover[0], H(this.hover[0], this.hover[1]) + 2, this.hover[1]) });
    }
    const all = this.hover ? [...this.pts, this.hover] : this.pts;
    if (all.length >= 2) {
      const total = polylineLength(all, this.opts.closed);
      let txt = `Total ${fmtFeet(total)}`;
      if (this.opts.showArea && all.length >= 3) txt += ` · ${fmtArea(polygonArea(all))}`;
      this.app.status(txt + ' · Double-click or Enter to finish · Backspace removes last point');
    }
    this.app.labels?.setGroup('draw', labels);
  }
}
