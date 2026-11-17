import * as THREE from 'three';
import type { App, System } from '../app/App';
import { bboxOf, fmtAreaBoth, fmtFeet, polygonArea, polygonCentroid, type V2 } from '../core/math';
import { Tool, type ToolEvent } from '../editing/Tool';
import { PolylineDraw } from '../editing/PolylineDraw';
import { h, hint, section, button, toast } from '../ui/dom';

/** Surveyor-style property line: striped tape hugging the ground, corner stakes with flags, edge + area labels. */
export class BoundarySystem implements System {
  group = new THREE.Group();
  private tape: THREE.Mesh | null = null;
  private stakes: THREE.InstancedMesh;
  private flags: THREE.InstancedMesh;
  private rebuildTimer = 0;

  constructor(private app: App) {
    this.group.name = 'boundary';
    this.stakes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 6).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 }), 256);
    this.flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.3).translate(0.25, 1.25, 0), new THREE.MeshStandardMaterial({ color: '#ff6a1a', side: THREE.DoubleSide, emissive: '#ff4a00', emissiveIntensity: 0.25 }), 256);
    this.stakes.castShadow = true;
    this.stakes.userData.noPick = this.flags.userData.noPick = true;
    this.group.add(this.stakes, this.flags);
    app.store.subscribe((c) => {
      if (c.type === 'boundary' || c.type === 'doc') this.rebuild();
      else if (c.type === 'terrain' || c.type === 'collection') this.schedule();
    });
    this.rebuild();
  }

  private schedule() {
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.rebuild(), 250);
  }

  rebuild() {
    const b = this.app.store.doc.boundary;
    if (this.tape) { this.group.remove(this.tape); this.tape.geometry.dispose(); this.tape = null; }
    this.stakes.count = this.flags.count = 0;
    if (b.length < 3) { this.app.labels?.clearGroup('boundary'); return; }
    const H = (x: number, z: number) => this.app.terrain.heightAt(x, z);
    // ribbon geometry with alternating stripes (vertex colors)
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const W = 0.22, stripe = 3;
    const c1 = new THREE.Color('#ff5a1f'), c2 = new THREE.Color('#fff6e6');
    let dist = 0;
    for (let i = 0; i < b.length; i++) {
      const a = b[i], c = b[(i + 1) % b.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / 1.5));
      const nx = -(c[1] - a[1]) / L, nz = (c[0] - a[0]) / L;
      for (let j = 0; j <= n; j++) {
        const t = j / n, x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t;
        const y = H(x, z) + 0.12;
        const base = pos.length / 3;
        pos.push(x + nx * W, y, z + nz * W, x - nx * W, y, z - nz * W);
        const cc = Math.floor((dist + L * t) / stripe) % 2 ? c1 : c2;
        col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
        if (j > 0) idx.push(base - 2, base - 1, base, base - 1, base + 1, base);
      }
      dist += L;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.tape = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.tape.userData.noPick = true;
    this.group.add(this.tape);
    const m = new THREE.Matrix4();
    b.forEach(([x, z], i) => {
      m.makeTranslation(x, H(x, z), z);
      this.stakes.setMatrixAt(i, m);
      this.flags.setMatrixAt(i, m);
    });
    this.stakes.count = this.flags.count = Math.min(256, b.length);
    this.stakes.instanceMatrix.needsUpdate = this.flags.instanceMatrix.needsUpdate = true;
    // labels
    const labels: { text: string; pos: THREE.Vector3; cls?: string; maxDist?: number }[] = [];
    for (let i = 0; i < b.length; i++) {
      const a = b[i], c = b[(i + 1) % b.length];
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      labels.push({ text: fmtFeet(Math.hypot(c[0] - a[0], c[1] - a[1])), pos: new THREE.Vector3(mx, H(mx, mz) + 1.5, mz), cls: 'survey', maxDist: 900 });
    }
    const [cx, cz] = polygonCentroid(b);
    labels.push({ text: `${this.app.store.doc.name} · ${fmtAreaBoth(polygonArea(b))}`, pos: new THREE.Vector3(cx, H(cx, cz) + 3, cz), cls: 'survey', maxDist: 5000, minDist: 420 });
    this.app.labels?.setGroup('boundary', labels);
  }

  setLabelsVisible(v: boolean) { this.app.labels?.setGroupVisible('boundary', v); }
}

/** Redraw the property boundary by clicking corners. */
export class BoundaryTool extends Tool {
  id = 'boundary';
  name = 'Boundary';
  hint = 'Click corners of your property line · click the first point or double-click to close';
  private draw: PolylineDraw;
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: true, minPoints: 3, color: '#ff7a2a', showArea: true, onFinish: (p) => this.commit(p) });
  }
  activate() { this.draw.start(); }
  deactivate() { this.draw.stop(); }
  down(ev: ToolEvent) { this.draw.down(ev); }
  move(ev: ToolEvent) { this.draw.move(ev); }
  up() { this.draw.up(); }
  dblclick() { this.draw.dblclick(); }
  key(e: KeyboardEvent) { return this.draw.key(e); }
  commit(pts: V2[]) {
    const store = this.app.store;
    const before = store.doc.boundary.map((p) => [...p] as V2);
    const after = pts.map((p) => [Math.max(-505, Math.min(505, p[0])), Math.max(-505, Math.min(505, p[1]))] as V2);
    this.app.cmd.run({
      label: 'Set boundary',
      do() { store.doc.boundary = after.map((p) => [...p] as V2); store.notify({ type: 'boundary' }); },
      undo() { store.doc.boundary = before.map((p) => [...p] as V2); store.notify({ type: 'boundary' }); },
    });
    toast(`Boundary set · ${fmtAreaBoth(polygonArea(after))}`);
    const bb = bboxOf(after);
    this.app.rig.focus(new THREE.Vector3((bb.minX + bb.maxX) / 2, 0, (bb.minZ + bb.maxZ) / 2), Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ) * 1.2);
  }
  panel() {
    const b = this.app.store.doc.boundary;
    return h('div', {},
      section('Property line', hint(`Current: <b>${b.length >= 3 ? fmtAreaBoth(polygonArea(b)) : 'none'}</b> with ${b.length} corners.`),
        hint('Click to place corner stakes on the ground. Click the first stake (or double-click) to close the boundary. <kbd>Backspace</kbd> removes the last point.')),
      h('div', { class: 'btn-row' }, button('New estate wizard…', () => this.app.ui?.openWizard(), 'small')),
    );
  }
}
