import * as THREE from 'three';
import type { App } from '../app/App';

export interface SelItem { kind: string; id: string }

/** Current selection + highlight boxes. Systems expose `objectFor(kind,id)` via App.entityObject for highlighting. */
export class Selection {
  items: SelItem[] = [];
  private helpers: THREE.Box3Helper[] = [];
  private group = new THREE.Group();
  onChange: () => void = () => {};

  constructor(private app: App) {
    this.group.name = 'selection-helpers';
    this.group.userData.noPick = true;
    app.scene.add(this.group);
    app.store.subscribe((c) => {
      if (c.type === 'doc') this.set([]);
      else if (c.type === 'collection' && this.items.some((i) => i.kind === c.key)) {
        // drop items that no longer exist
        const before = this.items.length;
        this.items = this.items.filter((i) => i.kind !== c.key || !!(app.store.doc as any)[c.key]?.some((e: { id: string }) => e.id === i.id));
        if (this.items.length !== before) this.onChange();
        this.refreshHelpers();
      }
    });
  }

  has(kind: string, id: string) { return this.items.some((i) => i.kind === kind && i.id === id); }
  get single(): SelItem | null { return this.items.length === 1 ? this.items[0] : null; }
  get kind(): string | null {
    if (!this.items.length) return null;
    const k = this.items[0].kind;
    return this.items.every((i) => i.kind === k) ? k : 'mixed';
  }

  set(items: SelItem[]) {
    this.items = items;
    this.refreshHelpers();
    this.onChange();
  }
  toggle(it: SelItem) {
    if (this.has(it.kind, it.id)) this.items = this.items.filter((i) => !(i.kind === it.kind && i.id === it.id));
    else this.items = [...this.items, it];
    this.refreshHelpers();
    this.onChange();
  }
  clear() { if (this.items.length) this.set([]); }

  refreshHelpers() {
    for (const h of this.helpers) { this.group.remove(h); h.dispose(); }
    this.helpers = [];
    for (const it of this.items) {
      const box = this.app.entityBox(it.kind, it.id);
      if (!box || box.isEmpty()) continue;
      const h = new THREE.Box3Helper(box.expandByScalar(0.15), new THREE.Color('#ffd25a'));
      (h.material as THREE.LineBasicMaterial).depthTest = false;
      h.renderOrder = 999;
      this.helpers.push(h);
      this.group.add(h);
    }
  }
}
