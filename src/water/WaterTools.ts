import type { App } from '../app/App';
import { addEntities, updateEntities } from '../core/commands';
import { FT_TO_M, M_TO_FT, fmtArea, fmtFeet, polygonArea, polylineLength, type V2 } from '../core/math';
import { clone, uid } from '../core/store';
import type { Moat, WaterBody } from '../core/types';
import { PolylineDraw } from '../editing/PolylineDraw';
import { Tool, type ToolEvent } from '../editing/Tool';
import { editSlider, h, hint, section, segmented, slider, toast, toggle } from '../ui/dom';
import type { WaterSystem } from './WaterSystem';

const ft = (m: number) => `${Math.round(m * M_TO_FT)} ft`;

abstract class DrawTool extends Tool {
  protected draw!: PolylineDraw;
  activate() { this.draw.start(); }
  deactivate() { this.draw.stop(); }
  down(ev: ToolEvent) { this.draw.down(ev); }
  move(ev: ToolEvent) { this.draw.move(ev); }
  up() { this.draw.up(); }
  dblclick() { this.draw.dblclick(); }
  key(e: KeyboardEvent) { return this.draw.key(e); }
}

export class MoatTool extends DrawTool {
  id = 'moat';
  name = 'Moat';
  hint = 'Click around your castle to draw the moat loop · click the first point or double-click to close';
  width = 9; depth = 2.6; edging: Moat['edging'] = 'stone';
  constructor(app: App, private water: WaterSystem) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: true, minPoints: 3, color: '#7fc3e8', showArea: false, onFinish: (p) => this.commit(p) });
  }
  commit(pts: V2[]) {
    const level = this.water.minHeightAlong(pts, true) - 0.5;
    const m: Moat = { id: uid('moat'), points: pts, width: this.width, depth: this.depth, edging: this.edging, level };
    this.app.cmd.run(addEntities(this.app.store, 'moats', [m], 'Dig moat'));
    toast(`Moat dug · ${fmtFeet(polylineLength(pts, true))} around`);
  }
  panel() {
    return h('div', {},
      section('Moat', slider('Width', 3, 24, 0.5, this.width, (v) => (this.width = v), ft), slider('Depth', 1, 6, 0.25, this.depth, (v) => (this.depth = v), ft),
        segmented([{ id: 'stone', label: 'Stone edging' }, { id: 'earth', label: 'Earthen banks' }], this.edging, (v) => (this.edging = v as Moat['edging']))),
      hint('Draw a closed loop. The channel is carved into the land with a flat water level set just below the lowest point of the loop, and banks are raised where needed so the water stays in.'));
  }
}

export class PondTool extends DrawTool {
  id = 'pond';
  name = 'Pond';
  hint = 'Drag to sketch the shoreline freehand, or click points · release / double-click to finish';
  depth = 2.2;
  constructor(app: App, private water: WaterSystem) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: true, minPoints: 3, color: '#7fc3e8', showArea: true, freehand: true, freehandStep: 3, onFinish: (p) => this.commit(p) });
  }
  commit(pts: V2[]) {
    if (polygonArea(pts) < 12) { toast('That pond is too small'); return; }
    const level = this.water.minHeightAlong(pts, true) - 0.15;
    const w: WaterBody = { id: uid('pond'), kind: 'pond', points: pts, level, width: 0, depth: this.depth, waterfall: false };
    this.app.cmd.run(addEntities(this.app.store, 'water', [w], 'Add pond'));
    toast(`Pond added · ${fmtArea(polygonArea(pts))}`);
  }
  panel() {
    return h('div', {}, section('Pond / lake', slider('Depth', 0.5, 6, 0.25, this.depth, (v) => (this.depth = v), ft)),
      hint('Sketch any shape — large shapes make lakes. The water fills to a flat level and a sandy shore is painted around it.'));
  }
}

export class StreamTool extends DrawTool {
  id = 'stream';
  name = 'Stream';
  hint = 'Click points along the stream course · Enter or double-click to finish · water always flows downhill';
  width = 3; depth = 0.9; waterfall = true;
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: false, minPoints: 2, color: '#7fc3e8', onFinish: (p) => this.commit(p) });
  }
  commit(pts: V2[]) {
    const w: WaterBody = { id: uid('strm'), kind: 'stream', points: pts, level: 0, width: this.width, depth: this.depth, waterfall: this.waterfall };
    this.app.cmd.run(addEntities(this.app.store, 'water', [w], 'Add stream'));
    toast(`Stream added · ${fmtFeet(polylineLength(pts))}`);
  }
  panel() {
    return h('div', {}, section('Stream', slider('Width', 1, 10, 0.25, this.width, (v) => (this.width = v), ft), slider('Depth', 0.3, 3, 0.1, this.depth, (v) => (this.depth = v), ft),
      toggle('Waterfalls on steep drops', this.waterfall, (v) => (this.waterfall = v))),
      hint('The stream follows the terrain downhill from its higher end, cutting a channel through bumps. With waterfalls on, steep drops become falls with white water; otherwise they become rapids. Sculpting the land later re-routes the water.'));
  }
}

/** Property panels for selected water. */
export function registerWaterInspectors(app: App) {
  const edit = <T extends Moat | WaterBody>(key: 'moats' | 'water', id: string, fn: (e: T) => void, label: string) => {
    const e = app.store.get(key, id) as T | undefined;
    if (!e) return;
    const before = clone(e), after = clone(e);
    fn(after);
    app.cmd.run(updateEntities(app.store, key, [before] as never[], [after] as never[], label));
  };
  app.inspectors.set('moats', (ids) => {
    const m = app.store.get('moats', ids[0]) as Moat;
    return h('div', {},
      hint(`Length ${fmtFeet(polylineLength(m.points, true))} · water at ${(m.level * M_TO_FT).toFixed(1)} ft`),
      editSlider('Width', 3, 24, 0.5, m.width, (v) => edit<Moat>('moats', m.id, (e) => (e.width = v), 'Moat width'), ft),
      editSlider('Depth', 1, 6, 0.25, m.depth, (v) => edit<Moat>('moats', m.id, (e) => (e.depth = v), 'Moat depth'), ft),
      editSlider('Water level', -10, 10, 0.5, 0, (v) => edit<Moat>('moats', m.id, (e) => (e.level = m.level + v * FT_TO_M), 'Moat level'), (v) => `${v > 0 ? '+' : ''}${v} ft`),
      segmented([{ id: 'stone', label: 'Stone' }, { id: 'earth', label: 'Earthen' }], m.edging, (v) => edit<Moat>('moats', m.id, (e) => (e.edging = v as Moat['edging']), 'Moat edging')));
  });
  app.inspectors.set('water', (ids) => {
    const w = app.store.get('water', ids[0]) as WaterBody;
    if (w.kind === 'pond') {
      return h('div', {}, hint(`Pond · ${fmtArea(polygonArea(w.points))}`),
        editSlider('Depth', 0.5, 6, 0.25, w.depth, (v) => edit<WaterBody>('water', w.id, (e) => (e.depth = v), 'Pond depth'), ft),
        editSlider('Water level', -6, 6, 0.5, 0, (v) => edit<WaterBody>('water', w.id, (e) => (e.level = w.level + v * FT_TO_M), 'Pond level'), (v) => `${v > 0 ? '+' : ''}${v} ft`));
    }
    return h('div', {}, hint(`Stream · ${fmtFeet(polylineLength(w.points))}`),
      editSlider('Width', 1, 10, 0.25, w.width, (v) => edit<WaterBody>('water', w.id, (e) => (e.width = v), 'Stream width'), ft),
      editSlider('Depth', 0.3, 3, 0.1, w.depth, (v) => edit<WaterBody>('water', w.id, (e) => (e.depth = v), 'Stream depth'), ft),
      toggle('Waterfalls', w.waterfall, (v) => edit<WaterBody>('water', w.id, (e) => (e.waterfall = v), 'Waterfalls')));
  });
}
