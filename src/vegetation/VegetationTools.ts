import type { App } from '../app/App';
import { CATALOG, catalogItem } from '../catalog/catalog';
import { addEntities, composite, splatCommand, captureSplat, vegetationCommand } from '../core/commands';
import { bboxOf, M_TO_FT, pointInPolygon, rng, type V2 } from '../core/math';
import { clone, uid } from '../core/store';
import { GRID, HALF, type FenceDef, type VegetationData } from '../core/types';
import { PolylineDraw } from '../editing/PolylineDraw';
import { Tool, type ToolEvent } from '../editing/Tool';
import { paintCell } from '../terrain/brushes';
import { catalogBrowser } from '../ui/CatalogBrowser';
import { button, h, hint, section, segmented, slider, toast } from '../ui/dom';
import { VEG_STRIDE } from './VegetationSystem';

const VEG_CATS = ['trees', 'shrubs', 'flowers', 'rocks'];
const ft = (m: number) => `${Math.round(m * M_TO_FT)} ft`;

export const PRESETS: { id: string; label: string; kinds: string[]; density: number; scale: [number, number]; waterside?: boolean }[] = [
  { id: 'woodland', label: 'Mixed woodland', kinds: ['oak', 'birch', 'tree_leafy', 'tree_round', 'bush', 'fern'], density: 1.2, scale: [0.75, 1.25] },
  { id: 'pines', label: 'Pine forest', kinds: ['pine', 'pine_tall', 'spruce', 'fir', 'pine_small'], density: 1.4, scale: [0.7, 1.3] },
  { id: 'meadow', label: 'Wildflower meadow', kinds: ['flower_red', 'flower_yellow', 'flower_purple', 'flower_red2', 'flower_yellow2', 'grass_tuft', 'grass_tall'], density: 22, scale: [0.7, 1.3] },
  { id: 'shrubs', label: 'Shrubs & ferns', kinds: ['bush', 'bush_small', 'bush_detailed', 'fern', 'bush_flowers'], density: 5, scale: [0.7, 1.3] },
  { id: 'reeds', label: 'Waterside reeds', kinds: ['reeds', 'grass_tall', 'grass_wild'], density: 25, scale: [0.8, 1.4], waterside: true },
  { id: 'rocks', label: 'Boulders & rocks', kinds: ['boulder', 'boulder2', 'boulder3', 'rock', 'rock2', 'stone_flat'], density: 0.8, scale: [0.6, 1.5] },
];

/** Minimum spacing (m) between instances of a kind. */
function spacingOf(kind: string): number {
  const c = catalogItem(kind);
  if (!c) return 1;
  if (c.category === 'trees') return Math.max(2.5, c.height * 0.35);
  if (c.category === 'rocks') return Math.max(0.6, c.height * 0.9);
  if (c.category === 'shrubs') return Math.max(0.35, c.height * 0.7);
  return 0.3;
}

/** Scatter / erase vegetation with a brush, or click to plant single specimens. */
export class ScatterTool extends Tool {
  id = 'scatter';
  name = 'Scatter';
  hint = 'Left-drag to plant · <kbd>Alt</kbd>-drag or Erase mode to remove · <kbd>[</kbd> <kbd>]</kbd> brush size';
  kinds = new Set<string>(PRESETS[0].kinds);
  radius = 12; density = 1.2; scaleMin = 0.75; scaleMax = 1.25; tint = 0.5;
  mode: 'paint' | 'erase' | 'single' = 'paint';
  waterside = false;
  private down_ = false;
  private erasing = false;
  private before: VegetationData | null = null;
  private acc = 0;
  private r = rng(Date.now() & 0xffff);

  activate() { this.app.terrain.setBrush(0, 0, this.radius, false, '#9fe07a'); }
  deactivate() { this.app.terrain.setBrush(0, 0, 0, false); this.finish(); }
  move(ev: ToolEvent) {
    if (ev.ground) this.app.terrain.setBrush(ev.ground.x, ev.ground.z, this.mode === 'single' ? 1 : this.radius, true, this.erasing || this.mode === 'erase' ? '#ff8a6a' : '#9fe07a');
  }
  down(ev: ToolEvent) {
    if (!ev.ground) return;
    const kinds = [...this.kinds];
    if (!kinds.length) { toast('Pick at least one plant from the list'); return; }
    this.before = {};
    const all = new Set([...kinds, ...(this.mode === 'erase' || ev.e.altKey ? Object.keys(this.app.store.doc.vegetation) : [])]);
    for (const k of all) this.before[k] = (this.app.store.doc.vegetation[k] ?? []).slice();
    this.erasing = ev.e.altKey || this.mode === 'erase';
    if (this.mode === 'single' && !this.erasing) {
      this.plantAt(ev.ground.x, ev.ground.z, 0, 1);
      this.finish();
      return;
    }
    this.down_ = true;
    this.acc = 1;
  }
  up() { this.finish(); }
  update(dt: number) {
    if (!this.down_ || !this.app.cursorValid) return;
    this.acc += dt;
    if (this.acc < 0.06) return;
    const step = this.acc; this.acc = 0;
    const c = this.app.cursor;
    if (this.erasing) this.eraseAt(c.x, c.z);
    else {
      const area = Math.PI * this.radius * this.radius;
      const attempts = Math.max(1, Math.round((this.density * area) / 100 * step * 1.5));
      this.plantAt(c.x, c.z, this.radius, attempts);
    }
  }

  private plantAt(x: number, z: number, radius: number, attempts: number) {
    const kinds = [...this.kinds];
    const veg = this.app.store.doc.vegetation;
    const changed = new Set<string>();
    const water = this.app.water;
    for (let a = 0; a < attempts; a++) {
      const ang = this.r() * Math.PI * 2, rr = Math.sqrt(this.r()) * radius;
      const px = x + Math.cos(ang) * rr, pz = z + Math.sin(ang) * rr;
      if (Math.abs(px) > HALF - 2 || Math.abs(pz) > HALF - 2) continue;
      const kind = kinds[Math.floor(this.r() * kinds.length)];
      const waterside = this.waterside || kind === 'reeds' || kind === 'lily';
      if (water) {
        if (kind === 'lily') { if (water.surfaceAt(px, pz, -1.5) === null) continue; }
        else if (waterside) { if (water.surfaceAt(px, pz, 0.3) !== null || water.surfaceAt(px, pz, 3.5) === null) continue; }
        else if (water.surfaceAt(px, pz, 1) !== null) continue;
      }
      if (this.app.isBlocked(px, pz)) continue;
      const sp = spacingOf(kind);
      if (radius > 0 && this.tooClose(px, pz, sp)) continue;
      const arr = (veg[kind] ??= []);
      const s = this.scaleMin + this.r() * (this.scaleMax - this.scaleMin);
      arr.push(round(px), round(pz), round(s), round(this.r() * Math.PI * 2), round((this.r() * 2 - 1) * this.tint));
      changed.add(kind);
    }
    if (changed.size) this.app.store.notify({ type: 'vegetation', kinds: [...changed] });
  }

  private tooClose(x: number, z: number, sp: number): boolean {
    for (const k of this.kinds) {
      const arr = this.app.store.doc.vegetation[k];
      if (!arr) continue;
      const need = Math.max(sp, spacingOf(k)) * 0.8;
      const n2 = need * need;
      for (let i = arr.length - VEG_STRIDE; i >= 0; i -= VEG_STRIDE) {
        const dx = arr[i] - x, dz = arr[i + 1] - z;
        if (dx * dx + dz * dz < n2) return true;
      }
    }
    return false;
  }

  private eraseAt(x: number, z: number) {
    const veg = this.app.store.doc.vegetation;
    const r2 = this.radius * this.radius;
    const kinds = this.mode === 'erase' && this.kinds.size && !this.eraseAll ? [...this.kinds] : Object.keys(veg);
    const changed: string[] = [];
    for (const k of kinds) {
      const arr = veg[k];
      if (!arr) continue;
      const out: number[] = [];
      for (let i = 0; i < arr.length; i += VEG_STRIDE) {
        const dx = arr[i] - x, dz = arr[i + 1] - z;
        if (dx * dx + dz * dz > r2) for (let j = 0; j < VEG_STRIDE; j++) out.push(arr[i + j]);
      }
      if (out.length !== arr.length) {
        veg[k] = out; changed.push(k);
        if (!this.before![k]) this.before![k] = arr.slice();
      }
    }
    if (changed.length) this.app.store.notify({ type: 'vegetation', kinds: changed });
  }
  eraseAll = true;

  private finish() {
    this.down_ = false;
    if (!this.before) return;
    const before = this.before;
    this.before = null;
    const after: VegetationData = {};
    let changed = false;
    for (const k of Object.keys(before)) {
      after[k] = (this.app.store.doc.vegetation[k] ?? []).slice();
      if (after[k].length !== before[k].length) changed = true;
    }
    if (changed) this.app.cmd.push(vegetationCommand(this.app.store, before, after, this.erasing ? 'Erase plants' : 'Plant'));
  }

  key(e: KeyboardEvent) {
    if (e.key === '[') { this.radius = Math.max(1, this.radius / 1.2); this.app.ui.refreshPanel(); return true; }
    if (e.key === ']') { this.radius = Math.min(80, this.radius * 1.2); this.app.ui.refreshPanel(); return true; }
    return false;
  }

  panel() {
    const items = CATALOG.filter((c) => VEG_CATS.includes(c.category) && !c.hidden);
    const browser = catalogBrowser({ items, multi: true, selected: this.kinds, onChange: () => {}, categories: VEG_CATS });
    const presetRow = h('div', { class: 'seg grid2' }, ...PRESETS.map((p) => {
      const b = h('button', {}, p.label);
      b.addEventListener('click', () => {
        this.kinds.clear(); p.kinds.forEach((k) => catalogItem(k) && this.kinds.add(k));
        this.density = p.density; this.scaleMin = p.scale[0]; this.scaleMax = p.scale[1]; this.waterside = !!p.waterside;
        this.app.ui.refreshPanel();
      });
      return b;
    }));
    return h('div', {},
      section('Brush', segmented([{ id: 'paint', label: 'Scatter' }, { id: 'single', label: 'Single' }, { id: 'erase', label: 'Erase' }], this.mode, (v) => (this.mode = v as typeof this.mode)),
        slider('Size', 1, 80, 0.5, this.radius, (v) => (this.radius = v), ft),
        slider('Density', 0.1, 40, 0.1, this.density, (v) => (this.density = v), (v) => `${v}/100 m²`),
        slider('Min scale', 0.3, 2, 0.05, this.scaleMin, (v) => (this.scaleMin = Math.min(v, this.scaleMax)), (v) => `${Math.round(v * 100)}%`),
        slider('Max scale', 0.3, 2.5, 0.05, this.scaleMax, (v) => (this.scaleMax = Math.max(v, this.scaleMin)), (v) => `${Math.round(v * 100)}%`),
        slider('Colour vary', 0, 1, 0.05, this.tint, (v) => (this.tint = v), (v) => `${Math.round(v * 100)}%`)),
      section('Presets', presetRow),
      section(`Plants (${this.kinds.size} chosen)`, browser),
      hint('Plants avoid water, buildings, roads and fields automatically. Reeds and lilies only grow at the water’s edge. In Erase mode the brush removes every plant under it.'),
    );
  }
}

function round(v: number) { return Math.round(v * 100) / 100; }

/** Gardens: flower beds, hedge mazes, quick links to fountains/statues/benches. */
export class GardenTool extends Tool {
  id = 'garden';
  name = 'Gardens';
  mode: 'bed' | 'maze' = 'bed';
  cell = 2.4;
  flowers = new Set(['flower_red', 'flower_yellow', 'flower_purple', 'flower_red2', 'flower_purple2']);
  private draw: PolylineDraw;
  hint = 'Flower bed: click the corners of the bed · Maze: click two opposite corners';
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: true, minPoints: 3, color: '#f0a0c8', showArea: true, onFinish: (p) => this.finishShape(p) });
  }
  activate() { this.draw.start(); }
  deactivate() { this.draw.stop(); }
  down(ev: ToolEvent) {
    this.draw.down(ev);
    if (this.mode === 'maze' && this.draw.pts.length === 2) {
      const [a, b] = this.draw.pts;
      this.draw.pts = [];
      this.buildMaze(a, b);
    }
  }
  move(ev: ToolEvent) { this.draw.move(ev); }
  dblclick() { this.draw.dblclick(); }
  key(e: KeyboardEvent) { return this.draw.key(e); }

  private finishShape(pts: V2[]) {
    if (this.mode !== 'bed') return;
    const doc = this.app.store.doc;
    // 1) soil: paint the bed into the base splat (dirt) with a gravel border
    const bb = bboxOf(pts);
    const r = { x0: Math.max(0, Math.floor(bb.minX + HALF) - 2), z0: Math.max(0, Math.floor(bb.minZ + HALF) - 2), x1: Math.min(GRID - 1, Math.ceil(bb.maxX + HALF) + 2), z1: Math.min(GRID - 1, Math.ceil(bb.maxZ + HALF) + 2) };
    const sb = captureSplat(doc, r);
    for (let cz = r.z0; cz <= r.z1; cz++)
      for (let cx = r.x0; cx <= r.x1; cx++)
        if (pointInPolygon(cx - HALF + 0.5, cz - HALF + 0.5, pts)) paintCell(doc.splat, cx, cz, 2, 0.9);
    const sa = captureSplat(doc, r);
    this.app.store.notify({ type: 'splat', rect: r });
    // 2) flowers
    const before: VegetationData = {}, kinds = [...this.flowers];
    for (const k of kinds) before[k] = (doc.vegetation[k] ?? []).slice();
    const rnd = rng(Math.floor(bb.minX * 7 + bb.minZ * 13));
    const area = (bb.maxX - bb.minX) * (bb.maxZ - bb.minZ);
    // planted in tidy rows of one colour each
    const rowGap = 0.6;
    let row = 0;
    for (let z = bb.minZ + 0.3; z < bb.maxZ; z += rowGap, row++) {
      const kind = kinds[row % kinds.length];
      for (let x = bb.minX + 0.3; x < bb.maxX; x += 0.5) {
        const px = x + (rnd() - 0.5) * 0.15, pz = z + (rnd() - 0.5) * 0.15;
        if (!pointInPolygon(px, pz, pts)) continue;
        (doc.vegetation[kind] ??= []).push(round(px), round(pz), round(0.8 + rnd() * 0.3), round(rnd() * 6.28), round(rnd() * 0.4 - 0.2));
      }
    }
    void area;
    const after: VegetationData = {};
    for (const k of kinds) after[k] = doc.vegetation[k].slice();
    this.app.store.notify({ type: 'vegetation', kinds });
    this.app.cmd.push(composite('Flower bed', [splatCommand(this.app.store, sb, sa, 'Bed soil'), vegetationCommand(this.app.store, before, after, 'Flowers')]));
    toast('Flower bed planted');
  }

  /** Recursive-backtracker maze → hedge fence segments (merged straight runs). */
  buildMaze(a: V2, b: V2) {
    const x0 = Math.min(a[0], b[0]), z0 = Math.min(a[1], b[1]);
    const nx = Math.max(3, Math.floor(Math.abs(b[0] - a[0]) / this.cell)), nz = Math.max(3, Math.floor(Math.abs(b[1] - a[1]) / this.cell));
    if (nx * nz > 4000) { toast('That maze is too large — try a bigger cell size'); return; }
    const c = this.cell;
    // walls: horizontal h[j][i] (top edge of cell i,j), vertical v[j][i] (left edge)
    const hW = Array.from({ length: nz + 1 }, () => new Array(nx).fill(true));
    const vW = Array.from({ length: nz }, () => new Array(nx + 1).fill(true));
    const seen = Array.from({ length: nz }, () => new Array(nx).fill(false));
    const rnd = rng(Math.floor(x0 * 31 + z0 * 17) & 0xffff);
    const stack: [number, number][] = [[0, 0]];
    seen[0][0] = true;
    while (stack.length) {
      const [i, j] = stack[stack.length - 1];
      const nb: [number, number, number][] = [];
      if (i > 0 && !seen[j][i - 1]) nb.push([i - 1, j, 0]);
      if (i < nx - 1 && !seen[j][i + 1]) nb.push([i + 1, j, 1]);
      if (j > 0 && !seen[j - 1][i]) nb.push([i, j - 1, 2]);
      if (j < nz - 1 && !seen[j + 1][i]) nb.push([i, j + 1, 3]);
      if (!nb.length) { stack.pop(); continue; }
      const [ni, nj, d] = nb[Math.floor(rnd() * nb.length)];
      if (d === 0) vW[j][i] = false; else if (d === 1) vW[j][i + 1] = false; else if (d === 2) hW[j][i] = false; else hW[j + 1][i] = false;
      seen[nj][ni] = true;
      stack.push([ni, nj]);
    }
    hW[0][Math.floor(nx / 2)] = false; // entrance
    hW[nz][Math.floor(nx / 2)] = false; // exit
    const group = uid('maze');
    const fences: FenceDef[] = [];
    const add = (p: V2, q: V2) => fences.push({ id: uid('fen'), points: [p, q], closed: false, style: 'hedge', height: 2.2, gates: [], group } as FenceDef);
    for (let j = 0; j <= nz; j++) {
      let start = -1;
      for (let i = 0; i <= nx; i++) {
        const on = i < nx && hW[j][i];
        if (on && start < 0) start = i;
        if (!on && start >= 0) { add([x0 + start * c, z0 + j * c], [x0 + i * c, z0 + j * c]); start = -1; }
      }
    }
    for (let i = 0; i <= nx; i++) {
      let start = -1;
      for (let j = 0; j <= nz; j++) {
        const on = j < nz && vW[j][i];
        if (on && start < 0) start = j;
        if (!on && start >= 0) { add([x0 + i * c, z0 + start * c], [x0 + i * c, z0 + j * c]); start = -1; }
      }
    }
    this.app.cmd.run(addEntities(this.app.store, 'fences', fences, 'Hedge maze'));
    toast(`Hedge maze grown · ${nx}×${nz} cells`);
  }

  panel() {
    const browser = catalogBrowser({ items: CATALOG.filter((c) => c.category === 'flowers'), multi: true, selected: this.flowers, onChange: () => {} });
    return h('div', {},
      section('Garden feature', segmented([{ id: 'bed', label: 'Flower bed' }, { id: 'maze', label: 'Hedge maze' }], this.mode, (v) => { this.mode = v as 'bed' | 'maze'; this.draw.pts = []; this.app.ui.refreshPanel(); })),
      this.mode === 'maze'
        ? section('Maze', slider('Path width', 1.5, 5, 0.1, this.cell, (v) => (this.cell = v), ft), hint('Click two opposite corners of the maze area. A new random maze is grown each time; it can be selected and deleted like any hedge.'))
        : section('Flowers', browser, hint('Click the corners of the bed, then double-click. Soil is painted and flowers are planted in neat rows.')),
      section('Garden ornaments', h('div', { class: 'btn-row' },
        button('Fountains & statues…', () => this.app.ui.setTool('place:garden'), 'small'),
        button('Hedge lines…', () => {
          const ft = this.app.getTool('fence') as unknown as { style: string; height: number } | undefined;
          if (ft) { ft.style = 'hedge'; ft.height = 1.6; }
          this.app.ui.setMode('paths', 'fence');
        }, 'small'))),
    );
  }
}

export { clone };
