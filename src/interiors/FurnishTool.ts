import * as THREE from 'three';
import type { App } from '../app/App';
import { CATALOG, itemsForRoom, type CatalogItem } from '../catalog/catalog';
import { PlaceTool, type PlacementHit } from '../catalog/PlaceTool';
import { insideFootprint, levelBase } from '../buildings/footprint';
import type { ToolEvent } from '../editing/Tool';
import { buildingToWorld } from '../editing/transform';
import { catalogBrowser } from '../ui/CatalogBrowser';
import { h, hint, section } from '../ui/dom';
import { levelName, nearestWall, type InteriorSystem } from './InteriorSystem';
import { ROOM_TYPES } from './FloorPlanTool';

const SNAP = 0.25;

/** Place furniture & decor inside the current building/floor (wall items hug walls, chandeliers hang). */
export class FurnishTool extends PlaceTool {
  constructor(app: App, private interior: InteriorSystem) {
    super(app, 'interior', (ev, item) => this.resolveInterior(ev, item), true);
    (this as { id: string }).id = 'furnish';
    (this as { name: string }).name = 'Furnish';
    this.hint = 'Click to place inside · <kbd>Q</kbd>/<kbd>E</kbd> rotate · wall items snap to walls · <kbd>PgUp</kbd>/<kbd>PgDn</kbd> change floor';
  }

  private resolveInterior(ev: ToolEvent, item: CatalogItem): PlacementHit | null {
    const b = this.interior.building, f = this.interior.floor;
    if (!b || !f) return null;
    const r = this.interior.localHit(ev.ray);
    if (!r) return null;
    let x = Math.round(r.local.x / SNAP) * SNAP, z = Math.round(r.local.z / SNAP) * SNAP;
    if (!insideFootprint(b, x, z, b.wallThickness + 0.1)) return null;
    const base = levelBase(b, f.level);
    let y = base + 0.03, rot = 0;
    if (item.snap === 'wall') {
      const w = nearestWall(b, f, r.local.x, r.local.z, 2.5);
      if (w) {
        const px = w.w.a[0] + (w.w.b[0] - w.w.a[0]) * w.t, pz = w.w.a[1] + (w.w.b[1] - w.w.a[1]) * w.t;
        const off = w.w.t / 2 + (item.footprint[1] > 0.6 ? item.footprint[1] / 2 : 0.06);
        x = px + w.n[0] * off; z = pz + w.n[1] * off;
        rot = Math.atan2(w.n[0], w.n[1]);
        if (item.height < 1.2) y = base + 1.9;
      }
    } else if (item.snap === 'ceiling') {
      y = base + f.height - 0.3;
    }
    const local = new THREE.Vector3(x, y, z);
    return { pos: buildingToWorld(b, local), rotY: rot + b.rotY, buildingId: b.id, floor: f.level, local };
  }

  key(e: KeyboardEvent) {
    if (e.key === 'PageUp' || e.key === 'PageDown') return this.app.getTool('interior')?.key(e) ?? false;
    if (e.key === 'Escape') { this.interior.exit(); this.app.ui.setMode('select'); return true; }
    return super.key(e);
  }

  panel() {
    const b = this.interior.building, f = this.interior.floor;
    if (!b || !f) return h('div', {}, hint('Go inside a building first (double-click one, or use Floor plan).'));
    const room = f.rooms[f.rooms.length - 1] ?? f.rooms[0];
    const types = [...new Set(f.rooms.map((r) => r.type))];
    const suggested = types.flatMap((t) => itemsForRoom(t)).filter((c, i, a) => a.indexOf(c) === i);
    const all = CATALOG.filter((c) => this.categories.includes(c.category) && !c.hidden);
    return h('div', {},
      hint(`<b>${b.name}</b> · ${levelName(f.level)} · ${f.rooms.map((r) => r.name).join(', ')}`),
      section(`Suggested for ${types.map((t) => ROOM_TYPES.find((x) => x[0] === t)?.[1] ?? t).join(' & ') || room?.name}`,
        catalogBrowser({ items: suggested, selected: this.selected, onChange: () => this.ensureGhost(), categories: ['furniture', 'lighting', 'decor', 'props', 'chapel', 'castle', 'farm'] })),
      section('Everything', catalogBrowser({ items: all, selected: this.selected, onChange: () => this.ensureGhost(), categories: this.categories })),
      hint('Candles, torches, chandeliers and fireplaces light the room at night. Change the room type in Floor plan → Rooms to get different suggestions.'));
  }
}
