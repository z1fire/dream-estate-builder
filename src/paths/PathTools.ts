import type { App } from '../app/App';
import { addEntities, updateEntities } from '../core/commands';
import { M_TO_FT, fmtFeet, polylineLength, type V2 } from '../core/math';
import { clone, uid } from '../core/store';
import type { FenceDef, FenceStyle, PathDef, PathStyle, RetainingWallDef } from '../core/types';
import { PolylineDraw } from '../editing/PolylineDraw';
import { Tool, type ToolEvent } from '../editing/Tool';
import { editSlider, h, hint, section, segmented, slider, toast, toggle } from '../ui/dom';
import { FENCE_STYLES } from './FenceSystem';

const ft = (m: number) => `${Math.round(m * M_TO_FT)} ft`;

abstract class LineTool extends Tool {
  protected draw!: PolylineDraw;
  activate() { this.draw.start(); }
  deactivate() { this.draw.stop(); }
  down(ev: ToolEvent) { this.draw.down(ev); }
  move(ev: ToolEvent) { this.draw.move(ev); }
  up() { this.draw.up(); }
  dblclick() { this.draw.dblclick(); }
  key(e: KeyboardEvent) { return this.draw.key(e); }
}

export class PathTool extends LineTool {
  id = 'path';
  name = 'Roads';
  hint = 'Click points along the road · Enter or double-click to finish · bridges appear where it crosses water';
  style: PathStyle = 'gravel';
  width = 3;
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: false, minPoints: 2, color: '#e8d29a', onFinish: (p) => this.commit(p) });
  }
  commit(pts: V2[]) {
    const p: PathDef = { id: uid('path'), points: pts, width: this.width, style: this.style };
    this.app.cmd.run(addEntities(this.app.store, 'paths', [p], 'Add road'));
    toast(`${this.style[0].toUpperCase() + this.style.slice(1)} road · ${fmtFeet(polylineLength(pts))}`);
  }
  panel() {
    return h('div', {}, section('Road or path',
      segmented([{ id: 'dirt', label: 'Dirt' }, { id: 'gravel', label: 'Gravel' }, { id: 'cobblestone', label: 'Cobblestone' }], this.style, (v) => (this.style = v as PathStyle)),
      slider('Width', 1, 10, 0.25, this.width, (v) => (this.width = v), ft)),
      hint('Roads smooth out the ground across their width and follow the lay of the land along their length. Where a road crosses a moat, pond or stream a bridge is built automatically — wooden for dirt and gravel, stone for cobblestone.'));
  }
}

export class FenceTool extends LineTool {
  id = 'fence';
  name = 'Fences';
  hint = 'Click points along the fence · Enter / double-click to finish · click the first point to close a loop';
  style: FenceStyle = 'rail';
  height = 1.25;
  gateEvery = 0;
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: false, minPoints: 2, color: '#d9b77a', onFinish: (p) => this.commit(p, false) });
  }
  down(ev: ToolEvent) {
    // clicking the first point closes the loop
    const pts = this.draw.pts;
    if (ev.ground && pts.length >= 3) {
      const f = pts[0];
      if (Math.hypot(ev.ground.x - f[0], ev.ground.z - f[1]) / this.app.rig.metresPerPixel() < 12) {
        const p = pts.slice(); this.draw.pts = []; this.commit(p, true); return;
      }
    }
    this.draw.down(ev);
  }
  commit(pts: V2[], closed: boolean) {
    const n = closed ? pts.length : pts.length - 1;
    const gates = this.gateEvery ? Array.from({ length: n }, (_, i) => i).filter((i) => i % this.gateEvery === 0) : [0];
    const f: FenceDef = { id: uid('fen'), points: pts, closed, style: this.style, height: this.height, gates: this.style === 'hedge' && !this.gateEvery ? [] : gates };
    this.app.cmd.run(addEntities(this.app.store, 'fences', [f], 'Add fence'));
    toast(`${FENCE_STYLES.find((s) => s.id === this.style)?.label} · ${fmtFeet(polylineLength(pts, closed))}`);
  }
  panel() {
    const hs = slider('Height', 0.5, 3, 0.05, this.height, (v) => (this.height = v), ft);
    return h('div', {}, section('Fence or wall',
      segmented(FENCE_STYLES.map((s) => ({ id: s.id, label: s.label })), this.style, (v) => { this.style = v as FenceStyle; this.height = FENCE_STYLES.find((s) => s.id === v)!.height; hs.set(this.height); }, 'grid2'),
      hs,
      segmented([{ id: '0', label: 'Gate on first side' }, { id: '1', label: 'Gate every side' }], String(this.gateEvery), (v) => (this.gateEvery = Number(v)))),
      hint('Fences follow the ground. Select a fence afterwards to add or remove gates on any side.'));
  }
}

export class RetainingTool extends LineTool {
  id = 'retaining';
  name = 'Terraces';
  hint = 'Click points along the wall · the ground on the LEFT of your line is raised · Enter to finish';
  height = 2; terrace = true;
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: false, minPoints: 2, color: '#c8b8a0', onFinish: (p) => this.commit(p) });
  }
  commit(pts: V2[]) {
    const w: RetainingWallDef = { id: uid('ret'), points: pts, height: this.height, terrace: this.terrace };
    this.app.cmd.run(addEntities(this.app.store, 'retaining', [w], 'Retaining wall'));
    toast('Retaining wall built');
  }
  panel() {
    return h('div', {}, section('Retaining wall',
      slider('Wall height', 0.5, 6, 0.25, this.height, (v) => (this.height = v), ft),
      toggle('Flat terrace behind the wall', this.terrace, (v) => (this.terrace = v))),
      hint('Draw along a hillside. The ground to the left of your line (as you draw) is built up to the wall height and held by a stone retaining wall — perfect for stepped garden terraces.'));
  }
}

export function registerPathInspectors(app: App) {
  const edit = <T extends { id: string }>(key: 'paths' | 'fences' | 'retaining', id: string, fn: (e: T) => void, label: string) => {
    const e = app.store.get(key, id) as unknown as T | undefined;
    if (!e) return;
    const before = clone(e), after = clone(e);
    fn(after);
    app.cmd.run(updateEntities(app.store, key, [before] as never[], [after] as never[], label));
  };
  app.inspectors.set('paths', (ids) => {
    const p = app.store.get('paths', ids[0]) as PathDef;
    return h('div', {}, hint(`${fmtFeet(polylineLength(p.points))} long`),
      segmented([{ id: 'dirt', label: 'Dirt' }, { id: 'gravel', label: 'Gravel' }, { id: 'cobblestone', label: 'Cobble' }], p.style, (v) => edit<PathDef>('paths', p.id, (e) => (e.style = v as PathStyle), 'Road style')),
      editSlider('Width', 1, 10, 0.25, p.width, (v) => edit<PathDef>('paths', p.id, (e) => (e.width = v), 'Road width'), ft));
  });
  app.inspectors.set('fences', (ids) => {
    const f = app.store.get('fences', ids[0]) as FenceDef;
    const n = f.closed ? f.points.length : f.points.length - 1;
    const gateRow = h('div', { class: 'btn-row' }, ...Array.from({ length: Math.min(n, 24) }, (_, i) => {
      const on = f.gates.includes(i);
      return h('button', { class: `btn small ${on ? 'primary' : ''}`, title: `Side ${i + 1}`, onclick: () => edit<FenceDef>('fences', f.id, (e) => (e.gates = on ? e.gates.filter((g) => g !== i) : [...e.gates, i]), on ? 'Remove gate' : 'Add gate') }, `${i + 1}`);
    }));
    return h('div', {}, hint(`${FENCE_STYLES.find((s) => s.id === f.style)?.label ?? f.style} · ${fmtFeet(polylineLength(f.points, f.closed))}${ids.length > 1 ? ` (+${ids.length - 1} more)` : ''}`),
      segmented(FENCE_STYLES.map((s) => ({ id: s.id, label: s.label })), f.style, (v) => ids.forEach((id) => edit<FenceDef>('fences', id, (e) => (e.style = v as FenceStyle), 'Fence style')), 'grid2'),
      editSlider('Height', 0.5, 3, 0.05, f.height, (v) => ids.forEach((id) => edit<FenceDef>('fences', id, (e) => (e.height = v), 'Fence height')), ft),
      ids.length === 1 ? section('Gates (by side)', gateRow) : null);
  });
  app.inspectors.set('retaining', (ids) => {
    const w = app.store.get('retaining', ids[0]) as RetainingWallDef;
    return h('div', {}, editSlider('Wall height', 0.5, 6, 0.25, w.height, (v) => edit<RetainingWallDef>('retaining', w.id, (e) => (e.height = v), 'Wall height'), ft),
      toggle('Flat terrace', w.terrace, (v) => edit<RetainingWallDef>('retaining', w.id, (e) => (e.terrace = v), 'Terrace')));
  });
}
