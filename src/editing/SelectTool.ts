import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { App } from '../app/App';
import { updateEntities } from '../core/commands';
import { clone } from '../core/store';
import type { CollectionKey } from '../core/types';
import { h, hint, section, segmented, toggle, button, toast } from '../ui/dom';
import { Tool, type ToolEvent } from './Tool';
import { applyDelta, deleteCommand, duplicateCommand, entity, pivotOf, TRANSFORMABLE, type Delta } from './transform';

type GizmoMode = 'translate' | 'rotate' | 'scale';

/** Select / move / rotate / scale / duplicate / delete with a transform gizmo. */
export class SelectTool extends Tool {
  id = 'select';
  name = 'Select';
  usesLeft = false; // left-drag on empty space still orbits
  wantsPick = true;
  hint = 'Click to select · <kbd>Shift</kbd>-click multi-select · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> move/rotate/scale · <kbd>Q</kbd>/<kbd>E</kbd> rotate 15° · <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · <kbd>Del</kbd> delete';
  gizmo: TransformControls;
  private proxy = new THREE.Object3D();
  private mode: GizmoMode = 'translate';
  private downAt: { x: number; y: number } | null = null;
  private dragBefore: { kind: string; ents: any[] }[] | null = null;
  private dragStart = { pos: new THREE.Vector3(), rot: 0, scale: 1 };
  private freeY = false;
  private modeSeg: (HTMLElement & { set(v: GizmoMode): void }) | null = null;

  constructor(app: App) {
    super(app);
    this.gizmo = new TransformControls(app.rig.persp, app.viewport);
    this.gizmo.setSize(0.9);
    this.gizmo.showY = false;
    const helper = this.gizmo.getHelper();
    helper.userData.noPick = true;
    app.scene.add(this.proxy);
    app.scene.add(helper);
    helper.visible = false;
    this.gizmo.addEventListener('dragging-changed', (e) => {
      const dragging = (e as unknown as { value: boolean }).value;
      app.rig.orbit.enabled = !dragging && app.rig.mode === 'orbit';
      app.rig.plan.enabled = !dragging && app.rig.mode === 'plan';
      if (dragging) this.beginDrag(); else this.endDrag();
    });
    this.gizmo.addEventListener('objectChange', () => this.dragUpdate());
    app.selection.onChange = () => { this.syncGizmo(); app.ui?.refreshProps(); };
    app.rig.onModeChange = () => { this.gizmo.camera = app.rig.camera; };
    app.store.subscribe((c) => { if (c.type === 'collection' && !this.dragBefore) this.syncGizmo(); });
  }

  activate() { this.syncGizmo(); }
  deactivate() { this.gizmo.detach(); this.gizmo.getHelper().visible = false; }

  private applySnaps() {
    const s = this.app.store.doc.settings;
    this.gizmo.setTranslationSnap(s.snap ? s.gridSize : null);
    this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.gizmo.setScaleSnap(s.snap ? 0.1 : null);
  }

  syncGizmo() {
    const items = this.app.selection.items.filter((i) => TRANSFORMABLE.has(i.kind));
    if (!items.length || this.app.tool !== this) { this.gizmo.detach(); this.gizmo.getHelper().visible = false; return; }
    const c = new THREE.Vector3();
    let n = 0;
    for (const it of items) {
      const e = entity(this.app, it.kind, it.id);
      if (e) { c.add(pivotOf(this.app, it.kind, e)); n++; }
    }
    if (!n) { this.gizmo.detach(); return; }
    this.proxy.position.copy(c.divideScalar(n));
    this.proxy.rotation.set(0, items.length === 1 && (items[0].kind === 'objects' || items[0].kind === 'buildings') ? entity(this.app, items[0].kind, items[0].id)!.rotY : 0, 0);
    this.proxy.scale.set(1, 1, 1);
    this.proxy.updateMatrixWorld();
    this.gizmo.camera = this.app.rig.camera;
    this.gizmo.attach(this.proxy);
    this.gizmo.setMode(this.mode);
    this.gizmo.setSpace(this.mode === 'translate' ? 'world' : 'local');
    this.gizmo.showX = this.mode !== 'rotate';
    this.gizmo.showZ = this.mode !== 'rotate';
    this.gizmo.showY = this.mode === 'rotate' || (this.mode === 'translate' && this.freeY) || this.mode === 'scale';
    this.applySnaps();
    this.gizmo.getHelper().visible = true;
  }

  setMode(m: GizmoMode) { this.mode = m; this.modeSeg?.set(m); this.syncGizmo(); }

  private beginDrag() {
    const byKind = new Map<string, any[]>();
    for (const it of this.app.selection.items) {
      if (!TRANSFORMABLE.has(it.kind)) continue;
      const e = entity(this.app, it.kind, it.id);
      if (!e) continue;
      if (!byKind.has(it.kind)) byKind.set(it.kind, []);
      byKind.get(it.kind)!.push(clone(e));
    }
    this.dragBefore = [...byKind].map(([kind, ents]) => ({ kind, ents }));
    this.dragStart.pos.copy(this.proxy.position);
    this.dragStart.rot = this.proxy.rotation.y;
    this.dragStart.scale = this.proxy.scale.x;
  }
  private currentDelta(): Delta {
    const s = this.mode === 'scale' ? (this.proxy.scale.x + this.proxy.scale.z) / 2 : 1;
    return {
      offset: this.proxy.position.clone().sub(this.dragStart.pos),
      rot: this.proxy.rotation.y - this.dragStart.rot,
      scale: s, pivot: this.dragStart.pos.clone(), freeY: this.freeY,
    };
  }
  private dragUpdate() {
    if (!this.dragBefore) return;
    if (this.mode === 'scale') { const s = (this.proxy.scale.x + this.proxy.scale.z) / 2; this.proxy.scale.set(s, s, s); }
    const d = this.currentDelta();
    const store = this.app.store;
    for (const g of this.dragBefore) {
      const arr = (store.doc as any)[g.kind] as { id: string }[];
      for (const b of g.ents) {
        const i = arr.findIndex((e) => e.id === b.id);
        if (i >= 0) arr[i] = applyDelta(this.app, g.kind, b, d);
      }
      store.notify({ type: 'collection', key: g.kind as CollectionKey, ids: g.ents.map((e) => e.id) });
    }
    this.app.selection.refreshHelpers();
  }
  private endDrag() {
    if (!this.dragBefore) return;
    const groups = this.dragBefore;
    this.dragBefore = null;
    const d = this.currentDelta();
    if (d.offset.lengthSq() < 1e-6 && Math.abs(d.rot) < 1e-6 && Math.abs(d.scale - 1) < 1e-6) return;
    for (const g of groups) {
      const after = g.ents.map((b) => entity(this.app, g.kind, b.id)).filter(Boolean);
      this.app.cmd.push(updateEntities(this.app.store, g.kind as CollectionKey, g.ents as never[], after as never[], this.mode === 'translate' ? 'Move' : this.mode === 'rotate' ? 'Rotate' : 'Scale'));
    }
    this.syncGizmo();
  }

  down(ev: ToolEvent) {
    this.downAt = { x: ev.e.clientX, y: ev.e.clientY };
  }
  up(ev: ToolEvent) {
    if (!this.downAt) return;
    const moved = Math.hypot(ev.e.clientX - this.downAt.x, ev.e.clientY - this.downAt.y);
    this.downAt = null;
    if (moved > 5 || this.gizmo.dragging || (this.gizmo.axis !== null && this.gizmo.getHelper().visible)) return;
    const p = ev.pick;
    if (!p) { if (!ev.e.shiftKey) this.app.selection.clear(); return; }
    const it = { kind: p.kind, id: p.id };
    if (ev.e.shiftKey || ev.e.ctrlKey) this.app.selection.toggle(it);
    else this.app.selection.set([it]);
  }
  dblclick(ev: ToolEvent) {
    const p = ev.pick;
    if (p?.kind === 'buildings') this.app.ui?.enterBuilding(p.id);
  }

  rotateStep(deg: number) {
    const items = this.app.selection.items.filter((i) => TRANSFORMABLE.has(i.kind));
    if (!items.length) return;
    this.beginDrag();
    this.proxy.rotation.y += THREE.MathUtils.degToRad(deg);
    const savedMode = this.mode;
    this.mode = 'rotate';
    this.dragUpdate();
    this.endDrag();
    this.mode = savedMode;
    this.syncGizmo();
  }

  duplicate() {
    const items = this.app.selection.items;
    if (!items.length) return;
    const { cmd, ids } = duplicateCommand(this.app, items, this.app.store.doc.settings.snap ? this.app.store.doc.settings.gridSize * 3 : 4);
    this.app.cmd.run(cmd);
    this.app.selection.set(ids);
    toast(`Duplicated ${ids.length} item${ids.length > 1 ? 's' : ''}`);
  }
  remove() {
    const items = this.app.selection.items;
    if (!items.length) return;
    this.app.cmd.run(deleteCommand(this.app, items));
    this.app.selection.clear();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === '1') { this.setMode('translate'); return true; }
    if (e.key === '2') { this.setMode('rotate'); return true; }
    if (e.key === '3') { this.setMode('scale'); return true; }
    if (e.key === 'q' || e.key === 'Q') { this.rotateStep(15); return true; }
    if (e.key === 'e' || e.key === 'E') { this.rotateStep(-15); return true; }
    if (e.key === 'Escape') { this.app.selection.clear(); return true; }
    return false;
  }

  panel() {
    this.modeSeg = segmented<GizmoMode>([
      { id: 'translate', label: 'Move', title: 'Move (1)' }, { id: 'rotate', label: 'Rotate', title: 'Rotate (2)' }, { id: 'scale', label: 'Scale', title: 'Scale (3)' },
    ], this.mode, (m) => this.setMode(m));
    return h('div', {},
      section('Transform', this.modeSeg,
        toggle('Allow vertical moves', this.freeY, (v) => { this.freeY = v; this.syncGizmo(); }),
        h('div', { class: 'btn-row' },
          button('⟲ 15°', () => this.rotateStep(15), 'small', 'Rotate left (Q)'), button('⟳ 15°', () => this.rotateStep(-15), 'small', 'Rotate right (E)'),
          button('Duplicate', () => this.duplicate(), 'small', 'Ctrl+D'), button('Delete', () => this.remove(), 'small danger', 'Delete'))),
      hint('Click anything in the world to select it. Double-click a building to go inside. Rotation snaps to 15°; turn on grid snapping in the top bar for moves.'),
    );
  }
}
