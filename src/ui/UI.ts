import type { App } from '../app/App';
import { Quality, type QualityLevel } from '../app/quality';
import { fmtFeet, M_TO_FT, polygonArea, polylineLength, SQM_PER_ACRE } from '../core/math';
import type { Layer, Season, Weather } from '../core/types';
import type { SelectTool } from '../editing/SelectTool';
import { clear, h, hint, section, segmented, select, slider, toast, toggle, button } from './dom';
import { ICONS } from './icons';
import { MODES, type ModeDef } from './modes';
import { helpModal } from './Help';

export interface UIActions {
  newEstate(): void;
  openEstates(): void;
  save(): Promise<void>;
  exportJSON(): void;
  importJSON(): void;
  loadDemo(): void;
  rename(name: string): void;
  photo(): void;
  tour(): void;
}

const LAYER_LABELS: [Layer, string][] = [
  ['terrain', 'Terrain'], ['vegetation', 'Vegetation'], ['water', 'Water'], ['buildings', 'Buildings'], ['interiors', 'Interiors'],
  ['props', 'Props'], ['paths', 'Paths & fences'], ['farming', 'Farming'], ['animals', 'Animals'],
];

/** Builds and manages the whole DOM interface around the 3D viewport. */
export class UI {
  readonly top: HTMLElement;
  readonly modebar: HTMLElement;
  readonly side: HTMLElement;
  readonly props: HTMLElement;
  readonly statusbar: HTMLElement;
  mode: ModeDef = MODES[0];
  private toolIds = new Map<string, string>(); // mode -> last tool
  private statusMsg: HTMLElement;
  private coordEl: HTMLElement;
  private scaleEl: HTMLElement;
  private fpsEl: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private saveDot!: HTMLElement;
  private nameEl!: HTMLElement;
  private viewBtns: Record<string, HTMLButtonElement> = {};
  private popover: HTMLElement | null = null;
  onEnterBuilding: (id: string) => void = () => {};
  /** extra panel shown at the bottom of the properties panel when nothing is selected */
  private statsOpen = true;

  constructor(private app: App, private actions: UIActions) {
    const root = document.getElementById('app')!;
    this.top = h('div', { id: 'topbar' });
    this.modebar = h('div', { id: 'modebar' });
    this.side = h('div', { id: 'sidepanel', class: 'panel' });
    this.props = h('div', { id: 'props', class: 'panel' });
    this.statusMsg = h('span', { class: 'msg' });
    this.coordEl = h('span', { class: 'coord' });
    this.fpsEl = h('span', { class: 'coord', style: 'opacity:.6' });
    this.scaleEl = h('div', { class: 'scalebar' });
    this.statusbar = h('div', { id: 'statusbar' }, this.statusMsg, this.coordEl, this.scaleEl, this.fpsEl);
    root.append(this.top, this.modebar, this.side, this.props, this.statusbar);
    this.buildTop();
    this.buildModebar();
    app.status = (m) => (this.statusMsg.innerHTML = m);
    app.onToolChange = () => this.refreshPanel();
    app.onCursor = () => this.updateCoords();
    app.cmd.onChange = () => this.refreshUndo();
    app.onDocReplaced = () => { this.nameEl.textContent = app.store.doc.name; this.refreshPanel(); this.refreshProps(); };
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.setInterval(() => { this.fpsEl.textContent = `${Math.round(app.fps)} fps`; this.updateScale(); if (!app.selection.items.length && this.statsOpen) this.refreshStats(); }, 1000);
    document.addEventListener('pointerdown', (e) => {
      if (this.popover && !this.popover.contains(e.target as Node) && !(e.target as HTMLElement).closest('.tb-btn')) this.closePopover();
    });
    this.setMode('select');
    this.refreshProps();
    this.refreshUndo();
  }

  // ---------------- top bar ----------------
  private tb(icon: keyof typeof ICONS, label: string, onClick: (b: HTMLButtonElement) => void, title = label) {
    const b = h('button', { class: 'tb-btn', title, html: `${ICONS[icon]}<span class="lbl">${label}</span>` }) as HTMLButtonElement;
    b.addEventListener('click', () => onClick(b));
    return b;
  }

  private buildTop() {
    const a = this.actions;
    this.nameEl = h('span', { class: 'estate-name', title: 'Rename estate' }, this.app.store.doc.name);
    this.nameEl.addEventListener('click', () => {
      const n = prompt('Estate name', this.app.store.doc.name);
      if (n && n.trim()) { a.rename(n.trim()); this.nameEl.textContent = n.trim(); }
    });
    this.saveDot = h('span', { class: 'save-dot', title: 'All changes saved' });
    this.undoBtn = this.tb('undo', '', () => this.app.cmd.undo(), 'Undo (Ctrl+Z)');
    this.redoBtn = this.tb('redo', '', () => this.app.cmd.redo(), 'Redo (Ctrl+Y)');
    this.viewBtns.orbit = this.tb('orbit', '3D', () => this.setView('orbit'), '3D orbit view');
    this.viewBtns.plan = this.tb('plan', 'Plan', () => this.setView('plan'), 'Top-down plan view (Tab)');
    this.viewBtns.orbit.classList.add('on');
    const snapBtn = this.tb('plan', 'Snap', (b) => {
      const s = this.app.store.doc.settings;
      s.snap = !s.snap;
      b.classList.toggle('on', s.snap);
      this.app.store.notify({ type: 'settings' });
      (this.app.getTool('select') as SelectTool | undefined)?.syncGizmo();
      toast(s.snap ? `Grid snapping on (${fmtFeet(s.gridSize)})` : 'Grid snapping off');
    }, 'Toggle snap to grid');
    snapBtn.innerHTML = `${ICONS.ruler}<span class="lbl">Snap</span>`;
    snapBtn.classList.toggle('on', this.app.store.doc.settings.snap);
    this.top.append(
      h('div', { class: 'brand', html: `${ICONS.crown}<span>Dream Estate</span>` }), this.nameEl, this.saveDot,
      h('div', { class: 'sep' }),
      this.tb('folder', 'Estate', (b) => this.fileMenu(b), 'New, open, save, export'),
      this.tb('save', 'Save', () => void a.save(), 'Save now (Ctrl+S)'),
      h('div', { class: 'sep' }), this.undoBtn, this.redoBtn, h('div', { class: 'sep' }),
      this.viewBtns.orbit, this.viewBtns.plan, snapBtn,
      h('div', { class: 'spacer' }),
      this.tb('layers', 'Layers', (b) => this.layersMenu(b)),
      this.tb('sun', 'Time & Weather', (b) => this.envMenu(b)),
      this.tb('tour', 'Views', (b) => this.viewsMenu(b), 'Saved viewpoints & guided tour'),
      this.tb('camera', 'Photo', () => a.photo(), 'Photo mode (Shift+P)'),
      this.tb('help', 'Help', () => helpModal(), 'Controls & shortcuts (H)'),
    );
  }

  setSaveState(s: 'saved' | 'dirty' | 'saving' | 'error') {
    this.saveDot.classList.toggle('dirty', s !== 'saved');
    this.saveDot.title = s === 'saved' ? 'All changes saved' : s === 'saving' ? 'Saving…' : s === 'error' ? 'Save failed' : 'Unsaved changes (autosaves shortly)';
  }

  setView(v: 'orbit' | 'plan') {
    if (this.app.walking) return;
    this.app.rig.setMode(v);
    this.app.env.planView = v === 'plan';
    this.app.env.apply();
    this.viewBtns.orbit.classList.toggle('on', v === 'orbit');
    this.viewBtns.plan.classList.toggle('on', v === 'plan');
    this.app.terrain.uniforms.uGrid.value.z = v === 'plan' || this.app.store.doc.settings.snap ? 1 : 0;
  }

  private openPopover(anchor: HTMLElement, content: HTMLElement) {
    const was = this.popover?.dataset.anchor === anchor.title;
    this.closePopover();
    if (was) return;
    const r = anchor.getBoundingClientRect();
    const p = h('div', { class: 'panel popover' }, content);
    p.dataset.anchor = anchor.title;
    document.getElementById('app')!.appendChild(p);
    const left = Math.min(window.innerWidth - p.offsetWidth - 8, r.left);
    p.style.left = `${Math.max(8, left)}px`;
    this.popover = p;
  }
  closePopover() { this.popover?.remove(); this.popover = null; }

  private fileMenu(b: HTMLElement) {
    const a = this.actions;
    const item = (label: string, fn: () => void) => h('button', { class: 'btn', style: 'width:100%;justify-content:flex-start;margin:3px 0', onclick: () => { this.closePopover(); fn(); } }, label);
    this.openPopover(b, h('div', { style: 'min-width:220px' },
      item('✦ New estate…', a.newEstate), item('📂 Open saved estate…', a.openEstates), item('💾 Save now', () => void a.save()),
      item('⬇ Export estate (.json)', a.exportJSON), item('⬆ Import estate (.json)', a.importJSON), item('🏰 Load demo estate', a.loadDemo)));
  }

  private layersMenu(b: HTMLElement) {
    const rows = LAYER_LABELS.map(([l, label]) => toggle(label, this.app.layerVisible[l], (v) => this.app.setLayerVisible(l, v)));
    const q = select<QualityLevel>('Quality', (Object.keys(Quality) as QualityLevel[]).map((k) => [k, k[0].toUpperCase() + k.slice(1)]), this.app.quality, (v) => { this.app.setQuality(v); toast(`Graphics quality: ${v}`); });
    const grid = slider('Grid size', 1, 50, 1, Math.round(this.app.store.doc.settings.gridSize * M_TO_FT), (v) => {
      this.app.store.doc.settings.gridSize = v / M_TO_FT;
      this.app.terrain.uniforms.uGrid.value.x = v / M_TO_FT;
    }, (v) => `${v} ft`);
    this.openPopover(b, h('div', { style: 'min-width:240px' }, section('Show layers', ...rows), section('Display', grid, q,
      toggle('Show property labels', true, (v) => this.app.labels.setGroupVisible('boundary', v)))));
  }

  private envMenu(b: HTMLElement) {
    const s = this.app.store.doc.settings;
    const env = this.app.env;
    const fmtTime = (v: number) => `${Math.floor(v).toString().padStart(2, '0')}:${Math.round((v % 1) * 60).toString().padStart(2, '0')}`;
    const time = slider('Time of day', 0, 24, 0.25, s.timeOfDay, (v) => { s.timeOfDay = v; env.setTime(v); }, fmtTime);
    (env as unknown as { timeSlider: typeof time }).timeSlider = time;
    this.openPopover(b, h('div', { style: 'min-width:280px' },
      section('Time', time, toggle('Day/night cycle (1 day = 4 min)', s.dayCycle, (v) => { s.dayCycle = v; })),
      section('Season', segmented<Season>([{ id: 'spring', label: 'Spring' }, { id: 'summer', label: 'Summer' }, { id: 'autumn', label: 'Autumn' }, { id: 'winter', label: 'Winter' }],
        s.season, (v) => { s.season = v; env.setSeason(v); this.app.store.notify({ type: 'settings' }); }, 'grid2')),
      section('Weather', segmented<Weather>([{ id: 'clear', label: 'Clear' }, { id: 'overcast', label: 'Overcast' }, { id: 'rain', label: 'Rain' }, { id: 'fog', label: 'Fog' }],
        s.weather, (v) => { s.weather = v; env.setWeather(v); }, 'grid2')),
      section('Wildlife', toggle('Birds flying overhead', s.birds, (v) => { s.birds = v; this.app.store.notify({ type: 'settings' }); })),
    ));
  }

  private viewsMenu(b: HTMLElement) {
    this.openPopover(b, this.app.viewpointsPanel ? this.app.viewpointsPanel(() => this.closePopover()) : h('div', {}, 'Viewpoints unavailable'));
  }

  // ---------------- modes / side panel ----------------
  private buildModebar() {
    for (const m of MODES) {
      const b = h('button', { class: 'mode-btn', title: `${m.title} (${m.key.toUpperCase()})`, 'data-mode': m.id, html: `${ICONS[m.icon]}<span>${m.label}</span>` });
      b.addEventListener('click', () => this.setMode(m.id));
      this.modebar.appendChild(b);
    }
  }

  setMode(id: string, toolId?: string) {
    const m = MODES.find((x) => x.id === id);
    if (!m) return;
    if (this.app.walking && id !== 'walk') this.app.getTool('walk')?.deactivate();
    this.mode = m;
    this.modebar.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.mode === id));
    const t = toolId ?? this.toolIds.get(id) ?? m.tools[0].id;
    this.setTool(t);
  }

  setTool(id: string) {
    this.toolIds.set(this.mode.id, id);
    this.app.setTool(this.app.getTool(id) ? id : null);
    this.refreshPanel();
  }

  refreshPanel() {
    clear(this.side);
    const m = this.mode;
    const tool = this.app.tool;
    if (m.id === 'walk') { this.side.classList.add('hidden'); return; }
    this.side.classList.remove('hidden');
    const head = h('div', { class: 'panel-head', html: `${ICONS[m.icon]}<h2>${m.title}</h2>` });
    const body = h('div', { class: 'panel-body' });
    if (m.tools.length > 1) {
      body.appendChild(segmented(m.tools.map((t) => ({ id: t.id, label: t.label })), tool?.id ?? m.tools[0].id, (id) => this.setTool(id), m.tools.length > 3 ? 'grid2' : ''));
    }
    const content = tool?.panel();
    if (content) body.appendChild(content);
    else if (!tool) body.appendChild(hint('This tool is not available.'));
    this.side.append(head, body);
    this.app.status(tool?.hint ?? '');
  }

  // ---------------- properties / stats ----------------
  refreshProps() {
    clear(this.props);
    const sel = this.app.selection.items;
    if (!sel.length) { this.props.append(h('div', { class: 'panel-head', html: `${ICONS.stats}<h2>Estate</h2>` }), h('div', { class: 'panel-body', id: 'stats-body' })); this.refreshStats(); return; }
    const kind = this.app.selection.kind!;
    const builder = this.app.inspectors.get(kind);
    const title = sel.length > 1 ? `${sel.length} selected` : kindLabel(kind);
    const body = h('div', { class: 'panel-body' });
    if (builder && kind !== 'mixed') body.appendChild(builder(sel.map((s) => s.id)));
    const st = this.app.getTool<SelectTool>('select');
    body.appendChild(h('div', { class: 'btn-row' },
      button('Focus', () => { const bx = this.app.entityBox(sel[0].kind, sel[0].id); if (bx) this.app.rig.focus(bx.getCenter(bx.min.clone()), Math.max(20, bx.getSize(bx.max.clone()).length() * 1.6)); }, 'small', 'Focus camera (.)'),
      button('Duplicate', () => st?.duplicate(), 'small'), button('Delete', () => st?.remove(), 'small danger')));
    this.props.append(h('div', { class: 'panel-head', html: `${ICONS.select}<h2>${title}</h2>` }, h('button', { class: 'x', html: ICONS.close, onclick: () => this.app.selection.clear() })), body);
  }

  refreshStats() {
    const el = document.getElementById('stats-body');
    if (!el) return;
    const d = this.app.store.doc;
    const area = d.boundary.length > 2 ? polygonArea(d.boundary) : 0;
    let trees = 0, plants = 0;
    for (const [k, arr] of Object.entries(d.vegetation)) {
      const n = arr.length / 5;
      if (this.app.isTreeKind?.(k)) trees += n; else plants += n;
    }
    trees += d.objects.filter((o) => !o.buildingId && this.app.isTreeKind?.(o.catalogId)).length;
    const cropArea = d.fields.reduce((s, f) => s + polygonArea(f.points), 0);
    const moatLen = d.moats.reduce((s, m) => s + polylineLength(m.points, true), 0);
    const pathLen = d.paths.reduce((s, p) => s + polylineLength(p.points), 0);
    const fenceLen = d.fences.reduce((s, f) => s + polylineLength(f.points, f.closed), 0);
    const rooms = d.buildings.reduce((s, b) => s + b.floors.reduce((t, f) => t + f.rooms.length, 0), 0);
    const towers = d.buildings.filter((b) => b.kind.startsWith('tower')).length;
    const rows: [string, string][] = [
      ['Estate area', area ? `${(area / SQM_PER_ACRE).toFixed(2)} acres` : '—'],
      ['', area ? `${Math.round(area * M_TO_FT * M_TO_FT).toLocaleString()} sq ft` : ''],
      ['Buildings', `${d.buildings.length}${towers ? ` (${towers} towers)` : ''}`],
      ['Rooms', String(rooms)],
      ['Trees', Math.round(trees).toLocaleString()],
      ['Other plants', Math.round(plants).toLocaleString()],
      ['Animals', String(d.animals.length)],
      ['Crop fields', `${d.fields.length} · ${(cropArea / SQM_PER_ACRE).toFixed(2)} ac`],
      ['Pastures', String(d.pastures.length)],
      ['Moat length', moatLen ? fmtFeet(moatLen) : '—'],
      ['Roads & paths', pathLen ? fmtFeet(pathLen) : '—'],
      ['Fences & walls', fenceLen ? fmtFeet(fenceLen) : '—'],
      ['Curtain walls', d.walls.length ? fmtFeet(d.walls.reduce((s, w) => s + polylineLength(w.points, w.closed), 0)) : '—'],
      ['Placed objects', String(d.objects.length)],
    ];
    el.innerHTML = `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }

  private refreshUndo() {
    const c = this.app.cmd;
    this.undoBtn.disabled = !c.canUndo;
    this.redoBtn.disabled = !c.canRedo;
    this.undoBtn.title = c.canUndo ? `Undo ${c.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
    this.redoBtn.title = c.canRedo ? `Redo ${c.redoLabel} (Ctrl+Y)` : 'Nothing to redo';
  }

  private updateCoords() {
    const c = this.app.cursor;
    if (!this.app.cursorValid) { this.coordEl.textContent = ''; return; }
    this.coordEl.textContent = `E ${Math.round(c.x * M_TO_FT)} ft · S ${Math.round(c.z * M_TO_FT)} ft · Elev ${(c.y * M_TO_FT).toFixed(1)} ft`;
  }

  private updateScale() {
    const mpp = this.app.rig.metresPerPixel();
    const target = 110 * mpp * M_TO_FT; // feet across ~110px
    const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    const px = nice / M_TO_FT / mpp;
    this.scaleEl.innerHTML = `<div class="bar" style="width:${px.toFixed(0)}px"></div><span class="t">${nice.toLocaleString()} ft</span>`;
  }

  openWizard() { this.actions.newEstate(); }
  enterBuilding(id: string) { this.onEnterBuilding(id); }

  // ---------------- keyboard ----------------
  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('.modal-back')) { if (e.key === 'Escape') document.querySelector('.modal-back')?.remove(); return; }
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.app.cmd.undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.app.cmd.redo(); return; }
      if (k === 's') { e.preventDefault(); void this.actions.save(); return; }
      if (k === 'd') { e.preventDefault(); this.app.getTool<SelectTool>('select')?.duplicate(); return; }
      return;
    }
    if (this.app.walking) { this.app.tool?.key(e); return; }
    if (this.app.tool?.key(e)) { e.preventDefault(); return; }
    if (e.key === 'Delete' || (e.key === 'Backspace' && this.app.selection.items.length)) { this.app.getTool<SelectTool>('select')?.remove(); return; }
    if (e.key === 'Tab') { e.preventDefault(); this.setView(this.app.rig.mode === 'plan' ? 'orbit' : 'plan'); return; }
    if (e.key === 'Escape') { this.closePopover(); this.app.selection.clear(); return; }
    if (e.key === '.') { const s = this.app.selection.items[0]; if (s) { const bx = this.app.entityBox(s.kind, s.id); if (bx) this.app.rig.focus(bx.getCenter(bx.min.clone()), 40); } return; }
    if (k === 'h' || e.key === '?') { helpModal(); return; }
    if (k === 'm') { this.setMode('select', 'measure'); return; }
    if (e.key === 'P' && e.shiftKey) { this.actions.photo(); return; }
    const m = MODES.find((x) => x.key === k);
    if (m && !e.shiftKey && !e.altKey) this.setMode(m.id);
  }
}

function kindLabel(k: string) {
  return ({ objects: 'Object', buildings: 'Building', animals: 'Animal', paths: 'Path', fences: 'Fence', walls: 'Curtain wall', fields: 'Field', pastures: 'Pasture', water: 'Water', moats: 'Moat', retaining: 'Terrace', mixed: 'Selection' } as Record<string, string>)[k] ?? k;
}
