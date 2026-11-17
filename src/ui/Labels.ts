import * as THREE from 'three';
import type { App } from '../app/App';

export interface Label { el: HTMLDivElement; pos: THREE.Vector3; visible: boolean; maxDist: number; minDist: number }

/** HTML labels pinned to 3D positions (survey distances, measurements, room names). */
export class Labels {
  private root: HTMLDivElement;
  private groups = new Map<string, Label[]>();
  private v = new THREE.Vector3();

  constructor(private app: App) {
    this.root = document.createElement('div');
    this.root.id = 'labels';
    app.viewport.appendChild(this.root);
    app.onFrame(() => this.update());
  }

  /** Replace a named group of labels. */
  setGroup(name: string, items: { text: string; pos: THREE.Vector3; cls?: string; maxDist?: number; minDist?: number }[]) {
    const old = this.groups.get(name) ?? [];
    for (const l of old) l.el.remove();
    const labels = items.map((it) => {
      const el = document.createElement('div');
      el.className = `label3d ${it.cls ?? ''}`;
      el.textContent = it.text;
      this.root.appendChild(el);
      return { el, pos: it.pos.clone(), visible: true, maxDist: it.maxDist ?? 1e9, minDist: it.minDist ?? 0 };
    });
    this.groups.set(name, labels);
  }
  clearGroup(name: string) { this.setGroup(name, []); }
  setGroupVisible(name: string, v: boolean) { for (const l of this.groups.get(name) ?? []) l.visible = v; }

  private update() {
    const cam = this.app.rig.camera;
    const w = this.app.viewport.clientWidth, h = this.app.viewport.clientHeight;
    for (const labels of this.groups.values())
      for (const l of labels) {
        if (!l.visible || document.body.classList.contains('photo')) { l.el.style.display = 'none'; continue; }
        const plan = this.app.rig.mode === 'plan';
        // in plan view "distance" is irrelevant: show everything (min-distance labels like the estate name included)
        const d = plan ? l.minDist : cam.position.distanceTo(l.pos);
        this.v.copy(l.pos).project(cam);
        if (this.v.z > 1 || this.v.z < -1 || (d > l.maxDist && !plan) || d < l.minDist || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) { l.el.style.display = 'none'; continue; }
        l.el.style.display = '';
        l.el.style.left = `${((this.v.x + 1) / 2) * w}px`;
        l.el.style.top = `${((1 - this.v.y) / 2) * h}px`;
      }
  }
}
