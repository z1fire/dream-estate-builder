import * as THREE from 'three';
import type { App } from '../app/App';
import { setFloors } from '../buildings/BuildingTools';
import { edgeCount, insideFootprint, levelBase } from '../buildings/footprint';
import { SURFACE_LABELS } from '../buildings/materials';
import { composite, removeEntities, updateEntities, type Command } from '../core/commands';
import { M_TO_FT } from '../core/math';
import { clone, uid } from '../core/store';
import type { BuildingDef, CeilingStyle, FloorDef, OpeningKind, Room, RoomType, SurfaceMat } from '../core/types';
import { buildingToWorld } from '../editing/transform';
import { Tool, type ToolEvent } from '../editing/Tool';
import { button, editSlider, h, hint, section, segmented, select, textInput, toast } from '../ui/dom';
import { levelName, nearestWall, type InteriorSystem } from './InteriorSystem';

type Sub = 'walls' | 'rooms' | 'openings' | 'stairs' | 'floors';

export const ROOM_TYPES: [RoomType, string][] = [
  ['hall', 'Great hall'], ['throne', 'Throne room'], ['bedroom', 'Bedroom'], ['kitchen', 'Kitchen'], ['library', 'Library'], ['armory', 'Armory'],
  ['chapel', 'Chapel'], ['cellar', 'Cellar'], ['dungeon', 'Dungeon'], ['storage', 'Storage'], ['tavern', 'Tavern'], ['shop', 'Shop'], ['workshop', 'Workshop'], ['stable', 'Stable'], ['generic', 'Room'],
];
const OPENINGS: { id: OpeningKind; label: string; w: number; h: number; sill: number }[] = [
  { id: 'door_wood', label: 'Wooden door', w: 1.2, h: 2.3, sill: 0 }, { id: 'door_arched', label: 'Arched door', w: 1.3, h: 2.6, sill: 0 },
  { id: 'door_double', label: 'Double door', w: 2.2, h: 3, sill: 0 }, { id: 'archway', label: 'Archway', w: 2, h: 2.8, sill: 0 },
  { id: 'window_stained', label: 'Stained glass', w: 1.2, h: 2.6, sill: 1.2 }, { id: 'window_arched', label: 'Arched window', w: 1, h: 1.6, sill: 1 },
  { id: 'window_shutter', label: 'Shuttered', w: 1, h: 1.3, sill: 1 }, { id: 'arrow_slit', label: 'Arrow slit', w: 0.3, h: 1.4, sill: 1.2 },
];
const SNAP = 0.25;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const ft = (m: number) => `${Math.round(m * M_TO_FT)} ft`;

/** Edit the floor plan of the building you're in. */
export class FloorPlanTool extends Tool {
  id = 'interior';
  name = 'Floor plan';
  sub: Sub = 'walls';
  openingKind: OpeningKind = 'door_wood';
  stairKind: 'straight' | 'spiral' = 'straight';
  private stairRot = 0;
  private wallStart: THREE.Vector3 | null = null;
  private roomStart: THREE.Vector3 | null = null;
  private preview: THREE.Line;
  selectedRoom: string | null = null;

  constructor(app: App, private interior: InteriorSystem) {
    super(app);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
    this.preview = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ffd25a', depthTest: false }));
    this.preview.renderOrder = 999;
    this.preview.frustumCulled = false;
    this.preview.userData.noPick = true;
    interior.onChange = () => { if (this.app.tool === this || this.app.tool?.id === 'furnish') this.app.ui.refreshPanel(); };
  }

  private computeHint() {
    if (!this.interior.building) return 'Double-click a building (or pick one from the list) to go inside';
    return ({
      walls: 'Click to start a wall, click again to end it (chains on) · <kbd>Esc</kbd> stops · <kbd>Alt</kbd>-click a wall to delete it',
      rooms: 'Drag a rectangle to make a room · click a room to select it',
      openings: 'Click on a wall to add the chosen door/window · click an existing one to remove it',
      stairs: 'Click to place stairs up to the next floor · <kbd>Q</kbd>/<kbd>E</kbd> rotate · click existing stairs to remove',
      floors: 'Add storeys and cellars, and set the materials of this floor',
    } as Record<Sub, string>)[this.sub];
  }

  activate() { this.app.scene.add(this.preview); this.interior.showGrid(true); }
  deactivate() { this.app.scene.remove(this.preview); this.wallStart = this.roomStart = null; this.interior.showGrid(false); }

  private run(label: string, fn: (b: BuildingDef, f: FloorDef) => void, extra: Command[] = []) {
    const b = this.interior.building, f = this.interior.floor;
    if (!b || !f) return;
    const before = clone(b), after = clone(b);
    fn(after, after.floors.find((x) => x.level === f.level)!);
    this.app.cmd.run(composite(label, [updateEntities(this.app.store, 'buildings', [before], [after], label), ...extra]));
  }

  private hit(ev: ToolEvent) {
    const r = this.interior.localHit(ev.ray);
    if (!r) return null;
    return { local: new THREE.Vector3(snap(r.local.x), 0, snap(r.local.z)), raw: r.local };
  }

  private setPreview(pts: THREE.Vector3[]) {
    const b = this.interior.building;
    const pos = this.preview.geometry.attributes.position as THREE.BufferAttribute;
    if (!b) { this.preview.geometry.setDrawRange(0, 0); return; }
    const y = levelBase(b, this.interior.level) + 0.1;
    pts.slice(0, 5).forEach((p, i) => { const w = buildingToWorld(b, new THREE.Vector3(p.x, y, p.z)); pos.setXYZ(i, w.x, w.y, w.z); });
    pos.needsUpdate = true;
    this.preview.geometry.setDrawRange(0, Math.min(5, pts.length));
  }

  move(ev: ToolEvent) {
    const p = this.hit(ev);
    if (!p) return;
    if (this.sub === 'walls' && this.wallStart) this.setPreview([this.wallStart, p.local]);
    else if (this.sub === 'rooms' && this.roomStart) {
      const a = this.roomStart, c = p.local;
      this.setPreview([a, new THREE.Vector3(c.x, 0, a.z), c, new THREE.Vector3(a.x, 0, c.z), a]);
    } else this.setPreview([]);
  }

  down(ev: ToolEvent) {
    const b = this.interior.building, f = this.interior.floor;
    if (!b || !f) {
      const pick = this.app.pick(ev.ray, (p) => p.kind === 'buildings');
      if (pick) this.interior.enter(pick.id);
      return;
    }
    const p = this.hit(ev);
    if (!p) return;
    const L = p.local;
    switch (this.sub) {
      case 'walls': {
        if (ev.e.altKey) {
          const nw = nearestWall(b, f, p.raw.x, p.raw.z, 0.6);
          if (nw && !nw.w.ext) this.run('Remove wall', (_bb, ff) => { ff.walls = ff.walls.filter((w) => w.id !== nw.w.id); }, []);
          return;
        }
        if (!insideFootprint(b, L.x, L.z, b.wallThickness * 0.5 - 0.3)) return;
        if (!this.wallStart) { this.wallStart = L.clone(); return; }
        const a = this.wallStart;
        // axis-lock when nearly straight
        const e = L.clone();
        if (Math.abs(e.x - a.x) < 0.6) e.x = a.x; else if (Math.abs(e.z - a.z) < 0.6) e.z = a.z;
        if (a.distanceTo(e) < 0.4) return;
        this.run('Add wall', (_bb, ff) => ff.walls.push({ id: uid('iw'), a: [a.x, a.z], b: [e.x, e.z], thickness: 0.22, material: ff.wallMat }));
        this.wallStart = e;
        return;
      }
      case 'rooms': {
        const r = f.rooms.slice().reverse().find((rm) => L.x >= rm.rect[0] && L.x <= rm.rect[2] && L.z >= rm.rect[1] && L.z <= rm.rect[3] && rm !== f.rooms[0]);
        this.roomStart = L.clone();
        this.pendingSelect = r?.id ?? (f.rooms[0]?.id ?? null);
        return;
      }
      case 'openings': {
        const nw = nearestWall(b, f, p.raw.x, p.raw.z, 1.2);
        if (!nw) { toast('Click closer to a wall'); return; }
        const existing = b.openings.find((o) => o.wall === nw.w.id && (o.floor ?? 0) === f.level && Math.abs(o.t - nw.t) * nw.L < o.width / 2 + 0.2);
        if (existing) { this.run('Remove opening', (bb) => { bb.openings = bb.openings.filter((o) => o.id !== existing.id); }); return; }
        const spec = OPENINGS.find((o) => o.id === this.openingKind)!;
        const hgt = Math.min(spec.h, f.height - spec.sill - 0.3);
        if (nw.L < spec.w + 0.3) { toast('That wall is too short for this opening'); return; }
        this.run(`Add ${spec.label.toLowerCase()}`, (bb) => bb.openings.push({ id: uid('op'), wall: nw.w.id, floor: f.level, t: nw.t, kind: spec.id, width: spec.w, height: hgt, sill: spec.sill }));
        return;
      }
      case 'stairs': {
        const ex = f.stairs.find((s) => Math.hypot(s.pos[0] - L.x, s.pos[1] - L.z) < 1.4);
        if (ex) { this.run('Remove stairs', (_bb, ff) => { ff.stairs = ff.stairs.filter((s) => s.id !== ex.id); }); return; }
        const hasAbove = b.floors.some((x) => x.level === f.level + 1);
        this.run('Add stairs', (bb, ff) => {
          const keep = clone(ff.stairs);
          if (!hasAbove) setFloors(bb, bb.floors.filter((x) => x.level >= 0).length + (f.level >= 0 ? 1 : 0));
          const target = bb.floors.find((x) => x.level === f.level)!;
          target.stairs = [...keep, { id: uid('st'), kind: this.stairKind, pos: [L.x, L.z], rotY: this.stairRot, from: f.level, width: 1.1 }];
        });
        if (!hasAbove && f.level >= 0) toast('Added a new storey above for the stairs to reach');
        return;
      }
    }
  }
  private pendingSelect: string | null = null;

  up(ev: ToolEvent) {
    if (this.sub !== 'rooms' || !this.roomStart) return;
    const p = this.hit(ev);
    const a = this.roomStart;
    this.roomStart = null;
    this.setPreview([]);
    if (!p) return;
    const c = p.local;
    if (Math.abs(c.x - a.x) < 1 || Math.abs(c.z - a.z) < 1) {
      this.selectedRoom = this.pendingSelect;
      this.app.ui.refreshPanel();
      return;
    }
    const f = this.interior.floor!;
    const id = uid('rm');
    this.run('Add room', (_bb, ff) => ff.rooms.push({
      id, name: `Room ${ff.rooms.length}`, type: 'generic', rect: [Math.min(a.x, c.x), Math.min(a.z, c.z), Math.max(a.x, c.x), Math.max(a.z, c.z)],
      floorMat: f.floorMat, wallMat: f.wallMat, ceiling: f.ceiling,
    }));
    this.selectedRoom = id;
    this.app.ui.refreshPanel();
  }

  key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.wallStart || this.roomStart) { this.wallStart = this.roomStart = null; this.setPreview([]); return true; }
      this.interior.exit(); this.app.ui.setMode('select'); return true;
    }
    if (e.key === 'q' || e.key === 'Q') { this.stairRot += Math.PI / 2; return true; }
    if (e.key === 'e' || e.key === 'E') { this.stairRot -= Math.PI / 2; return true; }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      const b = this.interior.building; if (!b) return false;
      const lv = b.floors.map((f) => f.level).sort((x, y) => x - y);
      const i = lv.indexOf(this.interior.level) + (e.key === 'PageUp' ? 1 : -1);
      if (i >= 0 && i < lv.length) this.interior.setLevel(lv[i]);
      return true;
    }
    return false;
  }

  panel() {
    this.hint = this.computeHint();
    const b = this.interior.building, f = this.interior.floor;
    if (!b || !f) {
      const list = h('div', { class: 'list' }, ...this.app.store.doc.buildings.map((bb) => {
        const row = h('div', { class: 'row' }, h('span', { class: 'grow' }, bb.name), h('span', { class: 'hint', style: 'margin:0' }, `${bb.floors.length} fl.`));
        row.addEventListener('click', () => this.interior.enter(bb.id));
        return row;
      }));
      return h('div', {}, hint('Choose a building to step inside, or double-click any building in the world.'),
        this.app.store.doc.buildings.length ? section('Buildings', list) : hint('<i>No buildings yet — add some from Castle, Village or Farming.</i>'));
    }
    const subSeg = segmented<Sub>([{ id: 'walls', label: 'Walls' }, { id: 'rooms', label: 'Rooms' }, { id: 'openings', label: 'Doors & windows' }, { id: 'stairs', label: 'Stairs' }, { id: 'floors', label: 'Floors & materials' }],
      this.sub, (v) => { this.sub = v; this.wallStart = this.roomStart = null; this.app.ui.refreshPanel(); }, 'grid2');
    const body: (HTMLElement | null)[] = [];
    if (this.sub === 'walls') {
      body.push(hint(`${f.walls.length} interior wall${f.walls.length === 1 ? '' : 's'} on this floor. Walls snap to a 9-inch grid and lock straight when close to an axis.`),
        h('div', { class: 'btn-row' }, button('Clear interior walls', () => this.run('Clear walls', (_bb, ff) => { ff.walls = []; }), 'small danger')));
    } else if (this.sub === 'rooms') {
      const list = h('div', { class: 'list' }, ...f.rooms.map((r) => {
        const row = h('div', { class: `row ${r.id === this.selectedRoom ? 'on' : ''}` }, h('span', { class: 'grow' }, r.name), h('span', { class: 'hint', style: 'margin:0' }, ROOM_TYPES.find((t) => t[0] === r.type)?.[1] ?? r.type));
        row.addEventListener('click', () => { this.selectedRoom = r.id; this.app.ui.refreshPanel(); });
        return row;
      }));
      body.push(section('Rooms on this floor', list));
      const r = f.rooms.find((x) => x.id === this.selectedRoom);
      if (r) body.push(this.roomEditor(r, f));
    } else if (this.sub === 'openings') {
      body.push(segmented(OPENINGS.map((o) => ({ id: o.id, label: o.label })), this.openingKind, (v) => (this.openingKind = v), 'grid2'),
        hint('Openings can go in outside walls or interior walls. Doors open inwards so you can walk through them.'));
    } else if (this.sub === 'stairs') {
      body.push(segmented([{ id: 'straight', label: 'Straight' }, { id: 'spiral', label: 'Spiral' }], this.stairKind, (v) => (this.stairKind = v as 'straight' | 'spiral')),
        hint(`Stairs climb from ${levelName(f.level)} to the floor above; a hole is cut in that floor automatically. ${f.stairs.length} stair${f.stairs.length === 1 ? '' : 's'} here.`));
    } else {
      const above = b.floors.filter((x) => x.level >= 0).length;
      body.push(section(`${levelName(f.level)} floor`,
        editSlider('Storey height', 2.2, 9, 0.1, f.height, (v) => this.run('Storey height', (_bb, ff) => (ff.height = v)), ft),
        select<SurfaceMat>('Floor', Object.entries(SURFACE_LABELS) as [SurfaceMat, string][], f.floorMat, (v) => this.run('Floor material', (_bb, ff) => { ff.floorMat = v; ff.rooms.forEach((r) => (r.floorMat = v)); })),
        select<SurfaceMat>('Walls', Object.entries(SURFACE_LABELS) as [SurfaceMat, string][], f.wallMat, (v) => this.run('Wall material', (_bb, ff) => { ff.wallMat = v; ff.walls.forEach((w) => (w.material = v)); ff.rooms.forEach((r) => (r.wallMat = v)); })),
        select<CeilingStyle>('Ceiling', [['flat', 'Flat plaster'], ['beamed', 'Beamed'], ['vaulted', 'Vaulted stone']], f.ceiling, (v) => this.run('Ceiling', (_bb, ff) => { ff.ceiling = v; }))),
        section('Storeys', h('div', { class: 'btn-row' },
          button('+ Storey on top', () => this.run('Add storey', (bb) => setFloors(bb, above + 1)), 'small'),
          button('+ Cellar / dungeon', () => this.run('Add cellar', (bb) => addBasement(bb)), 'small'),
          above > 1 ? button('Remove top storey', () => this.removeTop(b, above), 'small danger') : null)));
    }
    return h('div', {}, hint(`<b>${b.name}</b> · ${levelName(f.level)} · <kbd>PgUp</kbd>/<kbd>PgDn</kbd> change floor`), subSeg, ...body);
  }

  private removeTop(b: BuildingDef, above: number) {
    const top = above - 1;
    const objs = this.app.store.doc.objects.filter((o) => o.buildingId === b.id && (o.floor ?? 0) === top).map((o) => o.id);
    this.run('Remove storey', (bb) => setFloors(bb, above - 1), objs.length ? [removeEntities(this.app.store, 'objects', objs)] : []);
  }

  private roomEditor(r: Room, f: FloorDef) {
    const ed = (fn: (x: Room) => void, label: string) => this.run(label, (_bb, ff) => { const x = ff.rooms.find((q) => q.id === r.id); if (x) fn(x); });
    const isWhole = f.rooms[0]?.id === r.id;
    return section('Room',
      textInput('Name', r.name, (v) => ed((x) => (x.name = v), 'Rename room')),
      select<RoomType>('Room type', ROOM_TYPES, r.type, (v) => ed((x) => { x.type = v; if (x.name.startsWith('Room')) x.name = ROOM_TYPES.find((t) => t[0] === v)![1]; }, 'Room type')),
      select<SurfaceMat>('Floor', Object.entries(SURFACE_LABELS) as [SurfaceMat, string][], r.floorMat, (v) => ed((x) => (x.floorMat = v), 'Room floor')),
      hint(`${ft(r.rect[2] - r.rect[0])} × ${ft(r.rect[3] - r.rect[1])}. Furniture suggestions in <b>Furnish</b> follow the room type.`),
      !isWhole ? h('div', { class: 'btn-row' }, button('Delete room', () => { this.run('Delete room', (_bb, ff) => { ff.rooms = ff.rooms.filter((x) => x.id !== r.id); }); this.selectedRoom = null; }, 'small danger')) : null);
  }
}

export function addBasement(b: BuildingDef) {
  const min = Math.min(...b.floors.map((f) => f.level));
  const lvl = Math.min(-1, min - 1);
  const hw = b.width / 2 - b.wallThickness, hd = (b.shape === 'round' ? b.width : b.depth) / 2 - b.wallThickness;
  const above = b.floors.find((f) => f.level === lvl + 1);
  const st = above?.stairs[0] ?? b.floors.find((f) => f.stairs.length)?.stairs[0];
  b.floors.push({
    level: lvl, height: 3.2, walls: [], floorMat: 'flagstone', wallMat: 'stone', ceiling: 'vaulted',
    rooms: [{ id: uid('rm'), name: lvl === -1 ? 'Cellar' : 'Dungeon', type: lvl === -1 ? 'cellar' : 'dungeon', rect: [-hw, -hd, hw, hd], floorMat: 'flagstone', wallMat: 'stone', ceiling: 'vaulted' }],
    stairs: [st ? { ...st, id: uid('st'), from: lvl } : { id: uid('st'), kind: b.shape === 'round' ? 'spiral' : 'straight', pos: [-hw + 0.75, -hd + 0.2], rotY: 0, from: lvl, width: 1.1 }],
  });
  void edgeCount;
}
