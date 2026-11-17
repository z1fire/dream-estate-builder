import * as THREE from 'three';
import type { App } from '../app/App';
import { addEntities } from '../core/commands';
import { uid } from '../core/store';
import type { PlacedObject } from '../core/types';
import { Tool, type ToolEvent } from '../editing/Tool';
import { catalogBrowser } from '../ui/CatalogBrowser';
import { h, hint, section, toast } from '../ui/dom';
import { CATALOG, catalogItem, type CatalogItem } from './catalog';
import { instantiate } from './loader';

export const PLACE_FILTERS: Record<string, { label: string; categories: string[] }> = {
  nature: { label: 'Trees & nature', categories: ['trees', 'shrubs', 'flowers', 'rocks'] },
  garden: { label: 'Garden ornaments', categories: ['garden', 'flowers', 'lighting'] },
  castle: { label: 'Castle kit & props', categories: ['castle', 'siege', 'lighting', 'props'] },
  village: { label: 'Village props', categories: ['village', 'props', 'lighting', 'garden', 'boats', 'chapel', 'decor'] },
  farm: { label: 'Farm props', categories: ['farm', 'props', 'village'] },
};

/** Where a placement lands — buildings/interiors can override (inside rooms, against walls). */
export interface PlacementHit { pos: THREE.Vector3; rotY?: number; buildingId?: string; floor?: number; local?: THREE.Vector3 }

/** Place catalog models one at a time with a ghost preview. Q/E rotate, Esc exits. */
export class PlaceTool extends Tool {
  readonly id: string;
  readonly name: string;
  hint = 'Click to place · <kbd>Q</kbd>/<kbd>E</kbd> rotate 15° · <kbd>Shift</kbd>-click keeps random rotation · <kbd>Esc</kbd> to stop';
  private selected = new Set<string>();
  private ghost: THREE.Object3D | null = null;
  private ghostFor = '';
  private rot = 0;
  private lastHit: PlacementHit | null = null;
  private categories: string[];

  constructor(app: App, filter: string, private resolve?: (ev: ToolEvent, item: CatalogItem) => PlacementHit | null) {
    super(app);
    this.id = `place:${filter}`;
    this.name = PLACE_FILTERS[filter]?.label ?? 'Place';
    this.categories = PLACE_FILTERS[filter]?.categories ?? [];
    const first = CATALOG.find((c) => this.categories.includes(c.category) && !c.hidden);
    if (first) this.selected.add(first.id);
  }

  get item(): CatalogItem | undefined { return catalogItem([...this.selected][0]); }
  select(id: string) { this.selected.clear(); this.selected.add(id); this.ensureGhost(); }

  activate() { this.ensureGhost(); }
  deactivate() { this.clearGhost(); }

  private clearGhost() { if (this.ghost) { this.app.scene.remove(this.ghost); this.ghost = null; this.ghostFor = ''; } }
  private ensureGhost() {
    const it = this.item;
    if (!it || this.ghostFor === it.id) return;
    this.clearGhost();
    this.ghostFor = it.id;
    void instantiate(it.model).then(({ object }) => {
      if (this.ghostFor !== it.id || this.app.tool !== this) return;
      object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mm) => { const c = mm.clone(); c.transparent = true; c.opacity = 0.55; c.depthWrite = false; return c; });
        m.material = Array.isArray(m.material) ? mats : mats[0];
        m.castShadow = false;
        m.userData.noPick = true;
      });
      object.userData.noPick = true;
      object.visible = false;
      this.ghost = object;
      this.app.scene.add(object);
    });
  }

  private hitFor(ev: ToolEvent): PlacementHit | null {
    const it = this.item;
    if (!it) return null;
    const custom = this.resolve?.(ev, it);
    if (custom) return custom;
    if (!ev.ground) return null;
    const p = ev.ground.clone();
    const s = this.app.store.doc.settings;
    if (s.snap || it.snap === 'grid') {
      const g = it.snap === 'grid' && !s.snap ? 1 : s.gridSize;
      p.x = Math.round(p.x / g) * g; p.z = Math.round(p.z / g) * g;
      p.y = this.app.terrain.heightAt(p.x, p.z);
    }
    return { pos: p };
  }

  move(ev: ToolEvent) {
    this.ensureGhost();
    const hit = this.hitFor(ev);
    this.lastHit = hit;
    if (!this.ghost) return;
    this.ghost.visible = !!hit;
    if (hit) {
      this.ghost.position.copy(hit.pos);
      this.ghost.rotation.set(0, (hit.rotY ?? 0) + this.rot, 0);
    }
  }

  down(ev: ToolEvent) {
    const it = this.item;
    const hit = this.hitFor(ev) ?? this.lastHit;
    if (!it || !hit) return;
    let rotY = (hit.rotY ?? 0) + this.rot;
    if (ev.e.shiftKey) rotY = Math.random() * Math.PI * 2;
    const o: PlacedObject = { id: uid('obj'), catalogId: it.id, pos: [hit.pos.x, 0, hit.pos.z], rotY, scale: 1 };
    if (hit.buildingId && hit.local) {
      o.buildingId = hit.buildingId; o.floor = hit.floor; o.pos = [hit.local.x, hit.local.y, hit.local.z];
      const b = this.app.store.get('buildings', hit.buildingId);
      if (b) o.rotY = rotY - b.rotY;
    }
    this.app.cmd.run(addEntities(this.app.store, 'objects', [o], `Place ${it.name}`));
  }

  key(e: KeyboardEvent) {
    if (e.key === 'q' || e.key === 'Q') { this.rot += Math.PI / 12; if (this.ghost) this.ghost.rotation.y += Math.PI / 12; return true; }
    if (e.key === 'e' || e.key === 'E') { this.rot -= Math.PI / 12; if (this.ghost) this.ghost.rotation.y -= Math.PI / 12; return true; }
    if (e.key === 'Escape') { this.app.ui.setMode('select'); return true; }
    return false;
  }

  panel() {
    const items = CATALOG.filter((c) => this.categories.includes(c.category) && !c.hidden);
    if (!items.length) return hint('No models in this category yet.');
    return h('div', {},
      section('Choose a model', catalogBrowser({ items, selected: this.selected, categories: this.categories, onChange: () => { this.ensureGhost(); const it = this.item; if (it) toast(`${it.name}: click to place`, 1500); } })),
      hint('Placed objects can be selected, moved, rotated and duplicated with the Select tool (V).'));
  }
}
