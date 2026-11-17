import type { App } from '../app/App';
import { captureHeights, captureSplat, heightCommand, splatCommand, type HeightPatch, type SplatPatch } from '../core/commands';
import { FT_TO_M, M_TO_FT } from '../core/math';
import type { Rect } from '../core/store';
import { GROUND_LAYERS, GRID, VERTS, type GroundLayer } from '../core/types';
import { Tool, type ToolEvent } from '../editing/Tool';
import { h, hint, section, segmented, slider } from '../ui/dom';
import { ICONS } from '../ui/icons';
import { applyHeightBrush, applyPaint, type BrushParams, type HeightBrush } from './brushes';
import { layerSwatch } from './groundTextures';
import { cellRect, unionRect } from './heightfield';

const ftFmt = (m: number) => `${Math.round(m * M_TO_FT)} ft`;

/** Shared stroke logic: snapshot at start, apply every frame while held, record one undo step. */
abstract class BrushTool extends Tool {
  params: BrushParams = { radius: 8, strength: 0.5, falloff: 0.6, target: 0, seed: 0 };
  protected down_ = false;
  protected touched: Rect | null = null;
  private snapshot: Float32Array | Uint8Array | null = null;
  protected abstract color: string;
  protected abstract kindIsSplat(): boolean;
  protected abstract applyAt(x: number, z: number, dt: number): Rect;
  protected abstract label(): string;

  activate() { this.app.terrain.setBrush(0, 0, this.params.radius, false, this.color); }
  deactivate() { this.app.terrain.setBrush(0, 0, 0, false); if (this.down_) this.finish(); }

  down(ev: ToolEvent) {
    if (!ev.ground) return;
    this.down_ = true;
    this.touched = null;
    this.params.seed = Math.random() * 100;
    this.snapshot = this.kindIsSplat() ? this.app.store.doc.splat.slice() : this.app.store.doc.heights.slice();
    this.onStrokeStart(ev);
    this.tick(1 / 60);
  }
  protected onStrokeStart(_ev: ToolEvent) {}
  move(ev: ToolEvent) {
    if (ev.ground) this.app.terrain.setBrush(ev.ground.x, ev.ground.z, this.params.radius, true, this.color);
    else this.app.terrain.setBrush(0, 0, 0, false);
  }
  up() { this.finish(); }
  update(dt: number) { if (this.down_) this.tick(dt); }

  private tick(dt: number) {
    if (!this.app.cursorValid) return;
    const c = this.app.cursor;
    const r = this.applyAt(c.x, c.z, dt);
    this.touched = unionRect(this.touched, r);
    if (this.kindIsSplat()) this.app.store.notify({ type: 'splat', rect: r });
    else this.app.store.notify({ type: 'terrain', rect: r });
    this.app.terrain.setBrush(c.x, c.z, this.params.radius, true, this.color);
  }

  private finish() {
    if (!this.down_) return;
    this.down_ = false;
    const r = this.touched;
    const snap = this.snapshot;
    this.snapshot = null;
    if (!r || !snap) return;
    const doc = this.app.store.doc;
    if (this.kindIsSplat()) {
      const cr = cellRect(r);
      const cur = doc.splat;
      doc.splat = snap as Uint8Array; // temporarily view snapshot to capture "before"
      const before: SplatPatch = captureSplat(doc, cr);
      doc.splat = cur;
      const after = captureSplat(doc, cr);
      this.app.cmd.push(splatCommand(this.app.store, before, after, this.label()));
    } else {
      const cur = doc.heights;
      doc.heights = snap as Float32Array;
      const before: HeightPatch = captureHeights(doc, r);
      doc.heights = cur;
      const after = captureHeights(doc, r);
      this.app.cmd.push(heightCommand(this.app.store, before, after, this.label()));
    }
  }

  key(e: KeyboardEvent) {
    if (e.key === '[') { this.params.radius = Math.max(1, this.params.radius / 1.2); this.refreshSliders(); return true; }
    if (e.key === ']') { this.params.radius = Math.min(120, this.params.radius * 1.2); this.refreshSliders(); return true; }
    return false;
  }
  protected sliders: { radius?: { set(v: number): void } } = {};
  private refreshSliders() {
    this.sliders.radius?.set(Math.round(this.params.radius * 10) / 10);
    const c = this.app.cursor;
    this.app.terrain.setBrush(c.x, c.z, this.params.radius, this.app.cursorValid, this.color);
  }
  protected brushSliders() {
    const p = this.params;
    const rad = slider('Size', 1, 120, 0.5, p.radius, (v) => (p.radius = v), (v) => ftFmt(v));
    this.sliders.radius = rad;
    return [
      rad,
      slider('Strength', 0.05, 1, 0.05, p.strength, (v) => (p.strength = v), (v) => `${Math.round(v * 100)}%`),
      slider('Falloff', 0, 1, 0.05, p.falloff, (v) => (p.falloff = v), (v) => `${Math.round(v * 100)}%`),
    ];
  }
}

export class TerrainTool extends BrushTool {
  id = 'terrain';
  name = 'Terrain';
  brush: HeightBrush = 'raise';
  protected color = '#ffe9a8';
  hint = 'Left-drag to sculpt · <kbd>[</kbd> <kbd>]</kbd> brush size · <kbd>Alt</kbd>-click to sample height · Right-drag orbit';
  private targetRow: ReturnType<typeof slider> | null = null;
  constructor(app: App) {
    super(app);
    this.params.radius = 12;
  }
  protected kindIsSplat() { return false; }
  protected label() { return `Terrain: ${this.brush}`; }
  protected onStrokeStart(ev: ToolEvent) {
    if (ev.e.altKey && ev.ground) {
      this.params.target = ev.ground.y;
      this.targetRow?.set(Math.round(this.params.target * M_TO_FT));
      this.down_ = false;
      return;
    }
    if (this.brush === 'flatten' && ev.ground && !ev.e.shiftKey) this.params.target = this.app.terrain.baseHeightAt(ev.ground.x, ev.ground.z);
  }
  protected applyAt(x: number, z: number, dt: number) {
    return applyHeightBrush(this.app.store.doc, this.brush, x, z, this.params, dt);
  }
  panel() {
    const p = this.params;
    const brushes: { id: HeightBrush; label: string; title: string }[] = [
      { id: 'raise', label: 'Raise', title: 'Raise ground' },
      { id: 'lower', label: 'Lower', title: 'Lower ground' },
      { id: 'flatten', label: 'Flatten', title: 'Flatten to the height sampled where you start (Shift = keep target)' },
      { id: 'smooth', label: 'Smooth', title: 'Smooth bumps' },
      { id: 'noise', label: 'Roughen', title: 'Add natural noise' },
      { id: 'set', label: 'Set height', title: 'Set an exact elevation' },
    ];
    this.targetRow = slider('Target elev.', -40, 120, 1, Math.round(p.target * M_TO_FT), (v) => (p.target = v * FT_TO_M), (v) => `${v} ft`);
    return h('div', {},
      section('Brush', segmented(brushes, this.brush, (b) => (this.brush = b), 'grid3')),
      section('Settings', ...this.brushSliders(), this.targetRow),
      hint('<b>Flatten</b> levels to the height where the stroke starts. <b>Set height</b> drives ground to the target elevation. <kbd>Alt</kbd>-click samples the target.'),
      section('Quick actions',
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn small', onclick: () => this.levelEstate() }, 'Level whole estate'),
        )),
    );
  }
  /** Gently flatten everything inside the boundary toward its average height. */
  private levelEstate() {
    const doc = this.app.store.doc;
    const r: Rect = { x0: 0, z0: 0, x1: GRID, z1: GRID };
    const before = captureHeights(doc, r);
    let s = 0;
    for (let i = 0; i < doc.heights.length; i++) s += doc.heights[i];
    const avg = s / doc.heights.length;
    for (let i = 0; i < doc.heights.length; i++) doc.heights[i] = avg + (doc.heights[i] - avg) * 0.25;
    void VERTS;
    const after = captureHeights(doc, r);
    this.app.store.notify({ type: 'terrain', rect: r });
    this.app.cmd.push(heightCommand(this.app.store, before, after, 'Level estate'));
  }
}

export const LAYER_LABELS: Record<GroundLayer, string> = {
  grass: 'Grass', meadow: 'Meadow', dirt: 'Dirt', mud: 'Mud', gravel: 'Gravel', cobblestone: 'Cobble',
  sand: 'Sand', farmland: 'Farmland', forest: 'Forest floor', rock: 'Rock',
};

export class PaintTool extends BrushTool {
  id = 'paint';
  name = 'Paint';
  layer = 2;
  protected color = '#ffffff';
  hint = 'Left-drag to paint ground · <kbd>[</kbd> <kbd>]</kbd> brush size · Right-drag orbit';
  protected kindIsSplat() { return true; }
  protected label() { return `Paint ${GROUND_LAYERS[this.layer]}`; }
  protected applyAt(x: number, z: number, dt: number) {
    return applyPaint(this.app.store.doc, this.layer, x, z, this.params, dt);
  }
  panel() {
    const grid = h('div', { class: 'swatch-grid' });
    const items = GROUND_LAYERS.map((l, i) => {
      const it = h('div', { class: `swatch ${i === this.layer ? 'on' : ''}`, title: LAYER_LABELS[l], onclick: () => { this.layer = i; items.forEach((x, j) => x.classList.toggle('on', j === i)); } },
        h('img', { src: layerSwatch(l), alt: l }), LAYER_LABELS[l]);
      return it;
    });
    grid.append(...items);
    return h('div', {}, section('Ground texture', grid), section('Brush', ...this.brushSliders()),
      hint('Textures blend softly. Steep slopes show rock automatically. Paint <b>Grass</b> to erase.'));
  }
}
export { ICONS };
