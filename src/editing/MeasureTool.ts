import * as THREE from 'three';
import type { App } from '../app/App';
import { fmtFeet, M_TO_FT } from '../core/math';
import { h, hint, section, button } from '../ui/dom';
import { Tool, type ToolEvent } from './Tool';

/** Click points to measure distance, elevation change and slope. */
export class MeasureTool extends Tool {
  id = 'measure';
  name = 'Measure';
  hint = 'Click to add measuring points · <kbd>Esc</kbd> clears · Hold <kbd>Shift</kbd> to start a new measurement';
  private pts: THREE.Vector3[] = [];
  private hover: THREE.Vector3 | null = null;
  private line: THREE.Line;
  private readout: HTMLElement | null = null;

  constructor(app: App) {
    super(app);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 256), 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ff3b3b', depthTest: false }));
    this.line.renderOrder = 999;
    this.line.frustumCulled = false;
    this.line.userData.noPick = true;
  }
  activate() { this.app.scene.add(this.line); this.redraw(); }
  deactivate() { this.app.scene.remove(this.line); this.app.labels.clearGroup('measure'); }

  down(ev: ToolEvent) {
    if (!ev.ground) return;
    if (ev.e.shiftKey) this.pts = [];
    this.pts.push(ev.ground.clone().setY(ev.ground.y + 0.05));
    this.redraw();
  }
  move(ev: ToolEvent) { this.hover = ev.ground; this.redraw(); }
  key(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Delete') { this.pts = []; this.redraw(); return true; }
    if (e.key === 'Backspace') { this.pts.pop(); this.redraw(); return true; }
    return false;
  }

  private redraw() {
    const all = this.hover && this.pts.length ? [...this.pts, this.hover] : this.pts;
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    all.slice(0, 255).forEach((p, i) => pos.setXYZ(i, p.x, p.y + 0.4, p.z));
    pos.needsUpdate = true;
    this.line.geometry.setDrawRange(0, Math.min(255, all.length));
    const labels = [];
    let total = 0, total3 = 0;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1], b = all[i];
      const hd = Math.hypot(b.x - a.x, b.z - a.z), dy = b.y - a.y;
      total += hd; total3 += a.distanceTo(b);
      const slope = hd > 0.01 ? (dy / hd) * 100 : 0;
      labels.push({
        text: `${fmtFeet(hd, 1)} · ${dy >= 0 ? '▲' : '▼'} ${Math.abs(dy * M_TO_FT).toFixed(1)} ft · ${slope.toFixed(0)}%`,
        pos: new THREE.Vector3((a.x + b.x) / 2, Math.max(a.y, b.y) + 1.5, (a.z + b.z) / 2),
      });
    }
    this.app.labels.setGroup('measure', labels);
    if (this.readout) {
      const first = all[0], last = all[all.length - 1];
      this.readout.innerHTML = all.length < 2 ? 'Click two or more points on the ground.' :
        `<dl class="kv"><dt>Horizontal</dt><dd>${fmtFeet(total, 1)}</dd><dt>Along ground</dt><dd>${fmtFeet(total3, 1)}</dd>` +
        `<dt>Elevation change</dt><dd>${((last.y - first.y) * M_TO_FT).toFixed(1)} ft</dd>` +
        `<dt>Start elevation</dt><dd>${(first.y * M_TO_FT).toFixed(1)} ft</dd><dt>End elevation</dt><dd>${(last.y * M_TO_FT).toFixed(1)} ft</dd></dl>`;
    }
  }

  panel() {
    this.readout = h('div', {});
    this.redraw();
    return h('div', {}, section('Measurement', this.readout),
      hint('Distances are horizontal (plan) distances in feet; “along ground” follows the slope.'),
      h('div', { class: 'btn-row' }, button('Clear', () => { this.pts = []; this.redraw(); }, 'small')));
  }
}
