import type { App } from '../app/App';
import { addEntities, captureSplat, composite, splatCommand, updateEntities } from '../core/commands';
import { bboxOf, fmtArea, polygonArea, polygonCentroid, SQM_PER_ACRE, pointInPolygon, type V2 } from '../core/math';
import { clone, uid } from '../core/store';
import { GRID, HALF, type CropKind, type FenceDef, type FenceStyle, type FieldDef, type PastureDef, type PlacedObject } from '../core/types';
import { PolylineDraw } from '../editing/PolylineDraw';
import { Tool, type ToolEvent } from '../editing/Tool';
import { paintCell } from '../terrain/brushes';
import { FENCE_STYLES } from '../paths/FenceSystem';
import { button, editSlider, h, hint, section, segmented, slider, textInput, toast } from '../ui/dom';
import { CROPS, STAGES } from './FarmSystem';

abstract class AreaTool extends Tool {
  protected draw!: PolylineDraw;
  activate() { this.draw.start(); }
  deactivate() { this.draw.stop(); }
  down(ev: ToolEvent) { this.draw.down(ev); }
  move(ev: ToolEvent) { this.draw.move(ev); }
  up() { this.draw.up(); }
  dblclick() { this.draw.dblclick(); }
  key(e: KeyboardEvent) { return this.draw.key(e); }
}

/** Longest edge direction → default row angle (rows run parallel to the longest side). */
function longestEdgeAngle(pts: V2[]) {
  let best = 0, bl = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > bl) { bl = L; best = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  return best;
}

export class FieldTool extends AreaTool {
  id = 'field';
  name = 'Fields';
  hint = 'Click the corners of the field · click the first corner or double-click to finish';
  crop: CropKind = 'wheat';
  stage = 3;
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: true, minPoints: 3, color: '#e3c26a', showArea: true, onFinish: (p) => this.commit(p) });
  }
  commit(pts: V2[]) {
    const f: FieldDef = { id: uid('fld'), points: pts, crop: this.crop, stage: this.stage, rowAngle: longestEdgeAngle(pts) };
    this.app.cmd.run(addEntities(this.app.store, 'fields', [f], `Plant ${this.crop}`));
    toast(`${CROPS.find((c) => c.id === this.crop)?.label} field · ${(polygonArea(pts) / SQM_PER_ACRE).toFixed(2)} acres`);
  }
  panel() {
    return h('div', {},
      section('Crop', segmented(CROPS.map((c) => ({ id: c.id, label: c.label })), this.crop, (v) => (this.crop = v as CropKind), 'grid2')),
      section('Growth stage', segmented(STAGES.map((s, i) => ({ id: String(i), label: s })), String(this.stage), (v) => (this.stage = Number(v)), 'grid2')),
      section('Irrigation & extras', h('div', { class: 'btn-row' },
        button('Irrigation channel…', () => { const st = this.app.getTool('stream') as unknown as { width: number; depth: number; waterfall: boolean }; st.width = 1.2; st.depth = 0.5; st.waterfall = false; this.app.ui.setMode('water', 'stream'); toast('Draw the irrigation channel from the water source downhill'); }, 'small'),
        button('Hay bales & scarecrows…', () => this.app.ui.setMode('farming', 'place:farm'), 'small'))),
      hint('Crops are planted in rows parallel to the longest side of the field (change the row angle afterwards). Orchards plant fruit trees on a 20 ft grid; vineyards get posts, wires and vines.'));
  }
}

export class PastureTool extends AreaTool {
  id = 'pasture';
  name = 'Pastures';
  hint = 'Click the corners of the pasture · a fence with a gate is built around it automatically';
  fence: FenceStyle = 'rail';
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: true, minPoints: 3, color: '#a8d46a', showArea: true, onFinish: (p) => this.commit(p) });
  }
  commit(pts: V2[]) {
    const fence: FenceDef = { id: uid('fen'), points: pts, closed: true, style: this.fence, height: FENCE_STYLES.find((s) => s.id === this.fence)!.height, gates: [0] };
    const p: PastureDef = { id: uid('pas'), points: pts, fenceId: fence.id, name: `Pasture ${this.app.store.doc.pastures.length + 1}` };
    this.app.cmd.run(composite('Add pasture', [addEntities(this.app.store, 'fences', [fence]), addEntities(this.app.store, 'pastures', [p])]));
    toast(`Pasture fenced · ${fmtArea(polygonArea(pts))} — add animals from the Animals tool`);
  }
  panel() {
    return h('div', {}, section('Fence', segmented(FENCE_STYLES.map((s) => ({ id: s.id, label: s.label })), this.fence, (v) => (this.fence = v as FenceStyle), 'grid2')),
      hint('Animals placed inside a pasture graze and wander within its fence. The fence gets a gate on the first side; select the fence to move or add gates.'));
  }
}

/** Village square: cobbled plaza with a well or fountain at its centre. */
export class SquareTool extends AreaTool {
  id = 'square';
  name = 'Town square';
  hint = 'Click the corners of the town square · double-click to finish';
  centre: 'fountain_ornate' | 'well' | 'statue_knight' = 'fountain_ornate';
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: true, minPoints: 3, color: '#d0c0a0', showArea: true, onFinish: (p) => this.commit(p) });
  }
  commit(pts: V2[]) {
    const doc = this.app.store.doc;
    const bb = bboxOf(pts);
    const r = { x0: Math.max(0, Math.floor(bb.minX + HALF) - 2), z0: Math.max(0, Math.floor(bb.minZ + HALF) - 2), x1: Math.min(GRID - 1, Math.ceil(bb.maxX + HALF) + 2), z1: Math.min(GRID - 1, Math.ceil(bb.maxZ + HALF) + 2) };
    const before = captureSplat(doc, r);
    for (let cz = r.z0; cz <= r.z1; cz++) for (let cx = r.x0; cx <= r.x1; cx++) if (pointInPolygon(cx - HALF + 0.5, cz - HALF + 0.5, pts)) paintCell(doc.splat, cx, cz, 5, 1);
    const after = captureSplat(doc, r);
    this.app.store.notify({ type: 'splat', rect: r });
    const [cx, cz] = polygonCentroid(pts);
    const o: PlacedObject = { id: uid('obj'), catalogId: this.centre, pos: [cx, 0, cz], rotY: 0, scale: 1 };
    const addObj = addEntities(this.app.store, 'objects', [o]);
    this.app.store.batch(() => addObj.do());
    // the splat is already painted and the object added: record both as one undo step
    this.app.cmd.push(composite('Town square', [splatCommand(this.app.store, before, after, 'Cobbles'), addObj]));
    toast('Town square laid');
  }
  panel() {
    return h('div', {}, section('Centrepiece', segmented([{ id: 'fountain_ornate', label: 'Fountain' }, { id: 'well', label: 'Well' }, { id: 'statue_knight', label: 'Statue' }], this.centre, (v) => (this.centre = v as SquareTool['centre']))),
      hint('Paves the area in cobblestone and puts a centrepiece in the middle. Add market stalls from Village → Props.'));
  }
}

export function registerFarmInspectors(app: App) {
  app.inspectors.set('fields', (ids) => {
    const f = app.store.get('fields', ids[0]) as FieldDef;
    const edit = (fn: (e: FieldDef) => void, label: string) => {
      const before = ids.map((id) => clone(app.store.get('fields', id) as FieldDef));
      const after = before.map((b) => { const c = clone(b); fn(c); return c; });
      app.cmd.run(updateEntities(app.store, 'fields', before, after, label));
      app.ui.refreshProps();
    };
    return h('div', {}, hint(`${(polygonArea(f.points) / SQM_PER_ACRE).toFixed(2)} acres${ids.length > 1 ? ` (+${ids.length - 1} more)` : ''}`),
      section('Crop', segmented(CROPS.map((c) => ({ id: c.id, label: c.label })), f.crop, (v) => edit((e) => (e.crop = v as CropKind), 'Change crop'), 'grid2')),
      section('Growth', segmented(STAGES.map((s, i) => ({ id: String(i), label: s })), String(f.stage), (v) => edit((e) => (e.stage = Number(v)), 'Growth stage'), 'grid2')),
      editSlider('Row angle', 0, 180, 5, Math.round(((f.rowAngle * 180) / Math.PI + 360) % 180), (v) => edit((e) => (e.rowAngle = (v * Math.PI) / 180), 'Row angle'), (v) => `${v}°`));
  });
  app.inspectors.set('pastures', (ids) => {
    const p = app.store.get('pastures', ids[0]) as PastureDef;
    const animals = app.store.doc.animals.filter((a) => a.pastureId === p.id);
    return h('div', {}, textInput('Name', p.name, (v) => { const b = clone(p), a = clone(p); a.name = v; app.cmd.run(updateEntities(app.store, 'pastures', [b], [a], 'Rename pasture')); }),
      hint(`${fmtArea(polygonArea(p.points))} · ${animals.length} animal${animals.length === 1 ? '' : 's'}`),
      h('div', { class: 'btn-row' }, button('Add animals here…', () => app.ui.setMode('animals'), 'small')));
  });
  void slider;
}
