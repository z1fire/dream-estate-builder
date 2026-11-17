import * as THREE from 'three';
import type { App } from '../app/App';
import { addEntities, composite, removeEntities, updateEntities, type Command } from '../core/commands';
import { M_TO_FT, fmtFeet, offsetPolyline, polygonSignedArea, polylineLength, type V2 } from '../core/math';
import { clone, uid } from '../core/store';
import type { BuildingDef, BuildingKind, CurtainWallDef, FloorDef, MaterialKind, Moat, PlacedObject, RoofStyle } from '../core/types';
import { PolylineDraw } from '../editing/PolylineDraw';
import { Tool, type ToolEvent } from '../editing/Tool';
import { button, editSlider, h, hint, section, segmented, select, slider, textInput, toast, toggle } from '../ui/dom';
import { edgeCount, footprint, levelBase, levelInset, totalHeight } from './footprint';
import { MATERIAL_LABELS } from './materials';
import { makeBuilding, PRESETS } from './presets';
import { GATE_WIDTH, segmentNormal, towerRadius } from './CurtainWallSystem';
import type { WaterSystem } from '../water/WaterSystem';

const ft = (m: number) => `${Math.round(m * M_TO_FT)} ft`;

/** Place a preset building (castle / village / farm palettes). */
export class BuildingTool extends Tool {
  readonly id: string;
  readonly name = 'Buildings';
  hint = 'Click to place · <kbd>Q</kbd>/<kbd>E</kbd> rotate 15° · double-click a placed building to go inside';
  kind: BuildingKind;
  private rot = 0;
  private ghost = new THREE.Group();
  private ghostKind = '';
  constructor(app: App, private group: 'castle' | 'village' | 'farm' | 'chinese') {
    super(app);
    this.id = `building:${group}`;
    this.kind = PRESETS.find((p) => p.group === group)!.kind;
    this.ghost.userData.noPick = true;
  }
  activate() { this.app.scene.add(this.ghost); this.makeGhost(); }
  deactivate() { this.app.scene.remove(this.ghost); }
  private makeGhost() {
    if (this.ghostKind === this.kind) return;
    this.ghostKind = this.kind;
    this.ghost.clear();
    const { building: b } = makeBuilding(this.kind, [0, 0, 0], 0, {}, false);
    const hgt = totalHeight(b) + (b.roof === 'flat' ? 1 : Math.min(b.width, b.depth) * 0.6);
    const fp = footprint(b);
    const pts = [...fp, fp[0]].flatMap(([x, z]) => [new THREE.Vector3(x, 0.2, z), new THREE.Vector3(x, hgt, z)]);
    const ring = (y: number) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([...fp, fp[0]].map(([x, z]) => new THREE.Vector3(x, y, z))), new THREE.LineBasicMaterial({ color: '#ffd25a' }));
    this.ghost.add(ring(0.2), ring(hgt));
    const posts = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffd25a', transparent: true, opacity: 0.6 }));
    this.ghost.add(posts);
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.width, hgt, b.shape === 'round' ? b.width : b.depth), new THREE.MeshBasicMaterial({ color: '#ffd25a', transparent: true, opacity: 0.12, depthWrite: false }));
    box.position.y = hgt / 2;
    box.visible = b.shape === 'rect';
    this.ghost.add(box);
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.4, (b.shape === 'round' ? b.width : b.depth) / 2), 3, '#ff8a3a', 1, 0.8);
    this.ghost.add(arrow);
  }
  move(ev: ToolEvent) {
    this.ghost.visible = !!ev.ground;
    if (!ev.ground) return;
    const p = this.snapPos(ev.ground);
    this.ghost.position.set(p.x, this.app.terrain.baseHeightAt(p.x, p.z), p.z);
    this.ghost.rotation.y = this.rot;
  }
  private snapPos(p: THREE.Vector3) {
    const s = this.app.store.doc.settings;
    if (!s.snap) return p;
    return new THREE.Vector3(Math.round(p.x / s.gridSize) * s.gridSize, p.y, Math.round(p.z / s.gridSize) * s.gridSize);
  }
  down(ev: ToolEvent) {
    if (!ev.ground) return;
    const p = this.snapPos(ev.ground);
    const y = this.app.terrain.baseHeightAt(p.x, p.z);
    const { building, furniture } = makeBuilding(this.kind, [p.x, y, p.z], this.rot);
    const cmds: Command[] = [addEntities(this.app.store, 'buildings', [building], `Build ${building.name}`)];
    if (furniture.length) cmds.push(addEntities(this.app.store, 'objects', furniture));
    this.app.cmd.run(composite(`Build ${building.name}`, cmds));
    toast(`${building.name} built — double-click it to go inside`);
  }
  key(e: KeyboardEvent) {
    if (e.key === 'q' || e.key === 'Q') { this.rot += Math.PI / 12; this.ghost.rotation.y = this.rot; return true; }
    if (e.key === 'e' || e.key === 'E') { this.rot -= Math.PI / 12; this.ghost.rotation.y = this.rot; return true; }
    return false;
  }
  panel() {
    const list = PRESETS.filter((p) => p.group === this.group);
    const grid = h('div', { class: 'cat-grid', style: 'grid-template-columns:repeat(2,1fr)' });
    for (const p of list) {
      const el = h('div', { class: `cat-item ${p.kind === this.kind ? 'on' : ''}`, style: 'align-items:flex-start;text-align:left;padding:8px' },
        h('div', { style: 'font-size:22px' }, p.icon), h('b', {}, p.label), h('span', { style: 'color:#6b5638;font-size:10.5px' }, p.desc));
      el.addEventListener('click', () => { this.kind = p.kind; grid.querySelectorAll('.cat-item').forEach((x) => x.classList.remove('on')); el.classList.add('on'); this.makeGhost(); });
      grid.appendChild(el);
    }
    return h('div', {}, section('Choose a building', grid),
      hint('Every building comes with floors, rooms, stairs and starter furniture. Select it afterwards to change size, storeys, materials and roof; double-click to step inside and edit its interior.'));
  }
}

/** Draw a curtain wall; towers are placed automatically at the corners and a gatehouse on the first side. */
export class CurtainTool extends Tool {
  id = 'curtain';
  name = 'Walls';
  hint = 'Click the corners of your curtain wall · click the first corner to close the ring · Enter for an open wall';
  height = 8; thickness = 2.4; material: MaterialKind = 'greystone';
  towers: CurtainWallDef['towers'] = 'round'; towerFloors = 3; towerRoof: RoofStyle = 'conical';
  gate = true; walkway = true; buttresses = false;
  private draw: PolylineDraw;
  constructor(app: App) {
    super(app);
    this.draw = new PolylineDraw(app, { closed: true, minPoints: 2, color: '#d8d0c0', showArea: true, onFinish: (p) => this.commit(p, true) });
  }
  activate() { this.draw.start(); }
  deactivate() { this.draw.stop(); }
  down(ev: ToolEvent) { this.draw.down(ev); }
  move(ev: ToolEvent) { this.draw.move(ev); }
  dblclick() { this.draw.dblclick(); }
  key(e: KeyboardEvent) {
    // Enter finishes an open (unclosed) wall; clicking the first corner closes the ring
    if (e.key === 'Enter' && this.draw.pts.length >= 2) { const p = this.draw.pts.slice(); this.draw.pts = []; this.commit(p, false); return true; }
    return this.draw.key(e);
  }
  commit(pts: V2[], closed: boolean) {
    if (closed && pts.length < 3) closed = false;
    const w: CurtainWallDef = {
      id: uid('wall'), points: pts, closed, height: this.height, thickness: this.thickness, material: this.material, towers: this.towers,
      towerFloors: this.towerFloors, towerRoof: this.towerRoof, walkway: this.walkway, gateSegments: this.gate ? [longestSegment(pts, closed)] : [], buttresses: this.buttresses,
    };
    const { buildings, objects } = wallBuildings(this.app, w);
    this.app.cmd.run(composite('Build curtain wall', [
      addEntities(this.app.store, 'walls', [w]), addEntities(this.app.store, 'buildings', buildings), ...(objects.length ? [addEntities(this.app.store, 'objects', objects)] : []),
    ]));
    toast(`Curtain wall raised · ${fmtFeet(polylineLength(pts, closed))} with ${buildings.length} towers/gate`);
  }
  panel() {
    return h('div', {},
      section('Curtain wall', slider('Height', 3, 16, 0.5, this.height, (v) => (this.height = v), ft), slider('Thickness', 1, 4, 0.1, this.thickness, (v) => (this.thickness = v), ft),
        select<MaterialKind>('Material', Object.entries(MATERIAL_LABELS) as [MaterialKind, string][], this.material, (v) => (this.material = v)),
        toggle('Wall-walk with battlements', this.walkway, (v) => (this.walkway = v)), toggle('Buttresses', this.buttresses, (v) => (this.buttresses = v)),
        toggle('Gatehouse on the longest side', this.gate, (v) => (this.gate = v))),
      section('Corner towers', segmented([{ id: 'round', label: 'Round' }, { id: 'square', label: 'Square' }, { id: 'none', label: 'None' }], this.towers, (v) => (this.towers = v as CurtainWallDef['towers'])),
        slider('Tower storeys', 2, 6, 1, this.towerFloors, (v) => (this.towerFloors = v)),
        segmented([{ id: 'conical', label: 'Conical' }, { id: 'flat', label: 'Battlements' }, { id: 'pitched', label: 'Pitched' }], this.towerRoof, (v) => (this.towerRoof = v as RoofStyle))),
      hint('Walls step up and down with the terrain. Towers and the gatehouse are real buildings: select them to change their storeys, roof and materials, or double-click to go inside.'));
  }
}

function longestSegment(pts: V2[], closed: boolean) {
  let best = 0, bl = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > bl) { bl = L; best = i; } }
  return best;
}

/** Corner towers + gatehouses for a curtain wall (tagged with extra.wallId). */
export function wallBuildings(app: App, w: CurtainWallDef): { buildings: BuildingDef[]; objects: PlacedObject[] } {
  const buildings: BuildingDef[] = [], objects: PlacedObject[] = [];
  const base = (x: number, z: number) => app.terrain.baseHeightAt(x, z);
  const n = w.closed ? w.points.length : w.points.length - 1;
  if (w.towers !== 'none') {
    w.points.forEach((p, i) => {
      // outward = average of adjacent segment normals
      const ni = segmentNormal(w, Math.min(i, n - 1)), np = segmentNormal(w, (i - 1 + n) % n);
      const ox = w.closed || (i > 0 && i < w.points.length - 1) ? ni[0] + np[0] : ni[0], oz = w.closed || (i > 0 && i < w.points.length - 1) ? ni[1] + np[1] : ni[1];
      const rotY = Math.atan2(ox, oz);
      const r = towerRadius(w);
      const kind = w.towers === 'round' ? 'tower_round' : 'tower_square';
      const { building, furniture } = makeBuilding(kind, [p[0], base(p[0], p[1]), p[1]], rotY, { width: r * 2, depth: r * 2 });
      setFloors(building, w.towerFloors, Math.max(3.4, (w.height + 3) / w.towerFloors));
      building.roof = w.towerRoof;
      building.crenellations = w.towerRoof !== 'pitched';
      building.material = w.material;
      building.extra.wallId = w.id;
      building.name = `${w.towers === 'round' ? 'Round' : 'Square'} Tower ${i + 1}`;
      buildings.push(building);
      objects.push(...furniture.filter((f) => (f.floor ?? 0) < w.towerFloors));
    });
  }
  for (const s of w.gateSegments) {
    const a = w.points[s], b = w.points[(s + 1) % w.points.length];
    const mid: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const nn = segmentNormal(w, s);
    const rotY = Math.atan2(nn[0], nn[1]);
    const { building, furniture } = makeBuilding('gatehouse', [mid[0], base(mid[0], mid[1]), mid[1]], rotY, { width: GATE_WIDTH, depth: w.thickness + 6.5 });
    building.material = w.material;
    building.extra.wallId = w.id;
    buildings.push(building);
    objects.push(...furniture);
  }
  return { buildings, objects };
}

/** After a taper change: single-room storeys span their (inset) storey, and stairs stay inside the storey they reach. */
export function fitTaper(b: BuildingDef) {
  const hw = b.width / 2 - b.wallThickness, hd = (b.shape === 'round' ? b.width : b.depth) / 2 - b.wallThickness;
  for (const f of b.floors) {
    if (f.level < 0) continue;
    const li = levelInset(b, f.level);
    if (f.rooms.length === 1) f.rooms[0].rect = [-hw + li, -hd + li, hw - li, hd - li];
    const ni = levelInset(b, f.level + 1);
    for (const s of f.stairs) {
      const lim = (s.kind === 'spiral' ? 1.6 : 0.7);
      s.pos = [Math.max(-hw + ni + lim, Math.min(hw - ni - lim, s.pos[0])), Math.max(-hd + ni + lim, Math.min(hd - ni - lim, s.pos[1]))];
    }
  }
}

/** Set the number of storeys above ground (keeps basements, existing floors' rooms/walls/stairs). */
export function setFloors(b: BuildingDef, count: number, h?: number) {
  const above = b.floors.filter((f) => f.level >= 0).sort((a, c) => a.level - c.level);
  const tmpl = above[above.length - 1] ?? above[0];
  const template = above.find((f) => f.stairs.length)?.stairs[0];
  const out: FloorDef[] = b.floors.filter((f) => f.level < 0);
  for (let i = 0; i < count; i++) {
    const existing = above[i];
    if (existing) { out.push({ ...clone(existing), height: h ?? existing.height }); continue; }
    out.push({
      ...clone(tmpl), level: i, height: h ?? tmpl.height, walls: [], stairs: [],
      rooms: tmpl.rooms.slice(0, 1).map((r) => ({ ...clone(r), id: uid('rm') })),
    });
  }
  const top = count - 1;
  for (const f of out) {
    if (f.level === top) f.stairs = [];
    else if (f.level >= 0 && !f.stairs.length && template) f.stairs = [{ ...template, id: uid('st'), from: f.level, rotY: template.kind === 'spiral' ? f.level * 1.3 : template.rotY }];
  }
  b.floors = out;
  if (b.extra.taper) fitTaper(b);
  // windows on new floors: copy the first-floor (or ground-floor window) pattern
  const pattern = b.openings.filter((o) => o.floor === 1 || (o.floor === 0 && !o.kind.startsWith('door') && o.kind !== 'archway'));
  const src = pattern.some((x) => x.floor === 1) ? 1 : 0;
  b.openings = b.openings.filter((o) => o.floor < count);
  for (let lv = 1; lv < count; lv++) {
    if (b.openings.some((o) => o.floor === lv)) continue;
    for (const o of pattern.filter((p) => p.floor === src)) b.openings.push({ ...o, id: uid('op'), floor: lv });
  }
}

/** Dig a moat around a closed curtain wall and lengthen the drawbridge to cross it. */
export function moatAroundWall(app: App, water: WaterSystem, w: CurtainWallDef, offset = 13, width = 9): Command | null {
  if (!w.closed) return null;
  const sign = polygonSignedArea(w.points) > 0 ? 1 : -1;
  const ring = offsetPolyline(w.points, offset, true)[sign > 0 ? 'right' : 'left'];
  const level = water.minHeightAlong(ring, true) - 0.5;
  const m: Moat = { id: uid('moat'), points: ring, width, depth: 2.6, edging: 'stone', level };
  const cmds: Command[] = [addEntities(app.store, 'moats', [m], 'Dig moat')];
  const gates = app.store.doc.buildings.filter((b) => b.kind === 'gatehouse' && b.extra.wallId === w.id);
  if (gates.length) {
    const after = gates.map((g) => ({ ...clone(g), extra: { ...g.extra, drawbridge: true, bridgeLength: Math.round(offset + width / 2 + 1.5 - g.depth / 2) } }));
    cmds.push(updateEntities(app.store, 'buildings', gates, after, 'Drawbridge'));
  }
  return composite('Dig moat around walls', cmds);
}

// ------------------------------------------------------------------ inspectors
export function registerBuildingInspectors(app: App, water: WaterSystem) {
  const edit = (id: string, fn: (b: BuildingDef) => void, label: string, extra: Command[] = []) => {
    const b = app.store.get('buildings', id) as BuildingDef | undefined;
    if (!b) return;
    const before = clone(b), after = clone(b);
    fn(after);
    app.cmd.run(composite(label, [updateEntities(app.store, 'buildings', [before], [after], label), ...extra]));
    app.ui.refreshProps();
  };
  app.inspectors.set('buildings', (ids) => {
    const b = app.store.get('buildings', ids[0]) as BuildingDef;
    const above = b.floors.filter((f) => f.level >= 0).length;
    const basements = b.floors.filter((f) => f.level < 0).length;
    const rooms = b.floors.reduce((s, f) => s + f.rooms.length, 0);
    const kindSpecific: (HTMLElement | null)[] = [];
    if (b.kind === 'gatehouse') {
      kindSpecific.push(section('Gate',
        toggle('Drawbridge lowered', !!b.extra.drawbridgeOpen, (v) => edit(b.id, (e) => (e.extra.drawbridgeOpen = v), v ? 'Lower drawbridge' : 'Raise drawbridge')),
        toggle('Portcullis raised', !!b.extra.portcullisOpen, (v) => edit(b.id, (e) => (e.extra.portcullisOpen = v), v ? 'Raise portcullis' : 'Drop portcullis')),
        toggle('Has drawbridge', !!b.extra.drawbridge, (v) => edit(b.id, (e) => (e.extra.drawbridge = v), 'Drawbridge')),
        editSlider('Bridge length', 4, 20, 0.5, Number(b.extra.bridgeLength ?? 9), (v) => edit(b.id, (e) => (e.extra.bridgeLength = v), 'Bridge length'), ft)));
    }
    return h('div', {},
      textInput('Name', b.name, (v) => edit(b.id, (e) => (e.name = v), 'Rename')),
      hint(`${above} storey${above > 1 ? 's' : ''}${basements ? ` + ${basements} below ground` : ''} · ${rooms} room${rooms === 1 ? '' : 's'} · ${fmtFeet(b.width)} × ${fmtFeet(b.shape === 'round' ? b.width : b.depth)}`),
      h('div', { class: 'btn-row' }, button('🚪 Go inside', () => app.ui.enterBuilding(b.id), 'small primary')),
      section('Shape',
        editSlider(b.shape === 'round' ? 'Diameter' : 'Width', 3, 40, 0.5, b.width, (v) => edit(b.id, (e) => resize(e, v, e.depth), 'Resize'), ft),
        b.shape === 'rect' ? editSlider('Depth', 3, 40, 0.5, b.depth, (v) => edit(b.id, (e) => resize(e, e.width, v), 'Resize'), ft) : null,
        editSlider('Storeys', 1, 8, 1, above, (v) => edit(b.id, (e) => setFloors(e, v), 'Storeys')),
        editSlider('Storey height', 2.4, 8, 0.1, b.floors.find((f) => f.level === 0)?.height ?? 3, (v) => edit(b.id, (e) => e.floors.forEach((f) => { if (f.level >= 0) f.height = v; }), 'Storey height'), ft),
        editSlider('Wall thickness', 0.2, 2.5, 0.05, b.wallThickness, (v) => edit(b.id, (e) => (e.wallThickness = v), 'Wall thickness'), ft),
        toggle('Dungeon / cellar below', basements > 0, (v) => edit(b.id, (e) => toggleBasement(e, v), v ? 'Add cellar' : 'Remove cellar'))),
      section('Look',
        select<MaterialKind>('Walls', Object.entries(MATERIAL_LABELS) as [MaterialKind, string][], b.material, (v) => edit(b.id, (e) => (e.material = v), 'Wall material')),
        select<RoofStyle>('Roof', [['conical', b.shape === 'round' ? 'Conical' : 'Pyramid'], ['pitched', 'Pitched (gable)'], ['hipped', 'Hipped'], ['eaves', 'Curved eaves (Chinese)'], ['flat', 'Flat'], ['none', 'None']], b.roof, (v) => edit(b.id, (e) => (e.roof = v), 'Roof style')),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Roof colour'), colorInput(b.roofColor, (v) => edit(b.id, (e) => (e.roofColor = v), 'Roof colour'))),
        toggle('Thatched roof', !!b.extra.thatch, (v) => edit(b.id, (e) => (e.extra.thatch = v), 'Thatch')),
        toggle('Battlements', b.crenellations, (v) => edit(b.id, (e) => (e.crenellations = v), 'Battlements')),
        toggle('Chimney', !!b.extra.chimney, (v) => edit(b.id, (e) => (e.extra.chimney = v), 'Chimney'))),
      b.roof === 'eaves' || b.kind.startsWith('cn_') ? section('Chinese details',
        editSlider('Roof hip', 0, 1, 0.05, Number(b.extra.hip ?? 1), (v) => edit(b.id, (e) => (e.extra.hip = v), 'Roof hip')),
        toggle('Double eaves', !!b.extra.doubleEave, (v) => edit(b.id, (e) => (e.extra.doubleEave = v), 'Double eaves')),
        toggle('Eaves on every storey', !!b.extra.tiers, (v) => edit(b.id, (e) => (e.extra.tiers = v), 'Storey eaves')),
        editSlider('Storey taper', 0, 0.8, 0.05, Number(b.extra.taper ?? 0), (v) => edit(b.id, (e) => { e.extra.taper = v; fitTaper(e); }, 'Storey taper'), (m) => (m > 0 ? `${ft(m)} per storey` : 'none')),
        editSlider('Veranda columns', 0, 3, 0.1, Number(b.extra.columns ?? 0), (v) => edit(b.id, (e) => (e.extra.columns = v), 'Veranda'), (m) => (m > 0 ? ft(m) : 'none')),
        editSlider('Stone terrace', 0, 6, 0.1, Number(b.extra.terrace ?? 0), (v) => edit(b.id, (e) => (e.extra.terrace = v), 'Terrace'), (m) => (m > 0 ? ft(m) : 'none')),
        toggle('Open sides (pavilion)', !!b.extra.open, (v) => edit(b.id, (e) => (e.extra.open = v), 'Open sides')),
        toggle('Gilded finial', !!b.extra.finial, (v) => edit(b.id, (e) => (e.extra.finial = v), 'Finial'))) : null,
      ...kindSpecific,
    );
  });
  app.inspectors.set('walls', (ids) => {
    const w = app.store.get('walls', ids[0]) as CurtainWallDef;
    const editW = (fn: (x: CurtainWallDef) => void, label: string, rebuild = false) => {
      const before = clone(w), after = clone(w);
      fn(after);
      const cmds: Command[] = [updateEntities(app.store, 'walls', [before], [after], label)];
      if (rebuild) {
        const old = app.store.doc.buildings.filter((b) => b.extra.wallId === w.id).map((b) => b.id);
        const oldObjs = app.store.doc.objects.filter((o) => o.buildingId && old.includes(o.buildingId)).map((o) => o.id);
        if (oldObjs.length) cmds.push(removeEntities(app.store, 'objects', oldObjs));
        if (old.length) cmds.push(removeEntities(app.store, 'buildings', old));
        const { buildings, objects } = wallBuildings(app, after);
        cmds.push(addEntities(app.store, 'buildings', buildings));
        if (objects.length) cmds.push(addEntities(app.store, 'objects', objects));
      }
      app.cmd.run(composite(label, cmds));
      app.ui.refreshProps();
    };
    return h('div', {},
      hint(`${fmtFeet(polylineLength(w.points, w.closed))} of wall · ${w.points.length} corners`),
      editSlider('Height', 3, 16, 0.5, w.height, (v) => editW((x) => (x.height = v), 'Wall height'), ft),
      editSlider('Thickness', 1, 4, 0.1, w.thickness, (v) => editW((x) => (x.thickness = v), 'Wall thickness'), ft),
      select<MaterialKind>('Material', Object.entries(MATERIAL_LABELS) as [MaterialKind, string][], w.material, (v) => editW((x) => (x.material = v), 'Wall material')),
      toggle('Wall-walk with battlements', w.walkway, (v) => editW((x) => (x.walkway = v), 'Wall-walk')),
      toggle('Buttresses', !!w.buttresses, (v) => editW((x) => (x.buttresses = v), 'Buttresses')),
      toggle('Flip outside', !!w.flip, (v) => editW((x) => (x.flip = v), 'Flip wall')),
      section('Towers', segmented([{ id: 'round', label: 'Round' }, { id: 'square', label: 'Square' }, { id: 'none', label: 'None' }], w.towers, (v) => editW((x) => (x.towers = v as CurtainWallDef['towers']), 'Tower style', true)),
        editSlider('Storeys', 2, 6, 1, w.towerFloors, (v) => editW((x) => (x.towerFloors = v), 'Tower storeys', true)),
        h('div', { class: 'btn-row' }, button('Rebuild towers & gate', () => editW(() => {}, 'Rebuild towers', true), 'small'))),
      w.closed ? section('Moat', h('div', { class: 'btn-row' }, button('Dig a moat around these walls', () => {
        const c = moatAroundWall(app, water, w);
        if (c) { app.cmd.run(c); toast('Moat dug and drawbridge lengthened to cross it'); }
      }, 'small'))) : null,
    );
  });
}

function colorInput(v: string, onChange: (v: string) => void) {
  const i = h('input', { type: 'color', value: v, style: 'flex:1;height:28px;border:1px solid #c4ad80;border-radius:6px;background:#fbf6ea' }) as HTMLInputElement;
  i.addEventListener('change', () => onChange(i.value));
  return i;
}

/** Resize keeping rooms, interior walls and stairs proportionally placed. */
export function resize(b: BuildingDef, w: number, d: number) {
  const sx = w / b.width, sz = (b.shape === 'round' ? w : d) / (b.shape === 'round' ? b.width : b.depth);
  for (const f of b.floors) {
    for (const r of f.rooms) r.rect = [r.rect[0] * sx, r.rect[1] * sz, r.rect[2] * sx, r.rect[3] * sz];
    for (const iw of f.walls) { iw.a = [iw.a[0] * sx, iw.a[1] * sz]; iw.b = [iw.b[0] * sx, iw.b[1] * sz]; }
    for (const s of f.stairs) s.pos = [s.pos[0] * sx, s.pos[1] * sz];
  }
  b.width = w; b.depth = b.shape === 'round' ? w : d;
}

function toggleBasement(b: BuildingDef, on: boolean) {
  if (!on) { b.floors = b.floors.filter((f) => f.level >= 0); b.openings = b.openings.filter((o) => o.floor >= 0); return; }
  if (b.floors.some((f) => f.level < 0)) return;
  const hw = b.width / 2 - b.wallThickness, hd = (b.shape === 'round' ? b.width : b.depth) / 2 - b.wallThickness;
  const g0 = b.floors.find((f) => f.level === 0);
  const st = g0?.stairs[0];
  b.floors.unshift({
    level: -1, height: 3.2, walls: [], floorMat: 'flagstone', wallMat: 'stone', ceiling: 'vaulted',
    rooms: [{ id: uid('rm'), name: 'Cellar', type: 'cellar', rect: [-hw, -hd, hw, hd], floorMat: 'flagstone', wallMat: 'stone', ceiling: 'vaulted' }],
    stairs: [st ? { ...st, id: uid('st'), from: -1 } : { id: uid('st'), kind: b.shape === 'round' ? 'spiral' : 'straight', pos: [-hw + 0.75, -hd + 0.2], rotY: 0, from: -1, width: 1.1 }],
  });
  void levelBase; void edgeCount;
}
