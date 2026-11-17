import * as THREE from 'three';
import type { App, System } from '../app/App';
import type { PlacedObject } from '../core/types';
import { buildingToWorld, entity } from '../editing/transform';
import type { LightManager } from '../environment/Lights';
import { catalogItem } from './catalog';
import { instantiate } from './loader';

/** Renders every PlacedObject (catalog model) in the world or inside buildings. */
export class PropsSystem implements System {
  group = new THREE.Group();
  /** free-standing objects (Props layer) and furniture inside buildings (Interiors layer) */
  readonly exterior = new THREE.Group();
  readonly interior = new THREE.Group();
  private objs = new Map<string, { sig: string; obj: THREE.Object3D; mixer?: THREE.AnimationMixer }>();
  /** interior cutaway filter: return false to hide an object */
  visibility: (o: PlacedObject) => boolean = () => true;
  private reseatTimer = 0;

  constructor(private app: App, private lights: LightManager) {
    this.group.name = 'props';
    this.group.add(this.exterior, this.interior);
    app.store.subscribe((c) => {
      if (c.type === 'doc') this.sync(true);
      else if (c.type === 'collection' && (c.key === 'objects' || c.key === 'buildings')) this.sync(false);
    });
    app.terrain.onHeightsChanged.push(() => { clearTimeout(this.reseatTimer); this.reseatTimer = window.setTimeout(() => this.reseat(), 150); });
    app.boxResolvers.set('objects', (id) => { const o = this.objs.get(id)?.obj; return o ? new THREE.Box3().setFromObject(o) : null; });
    this.sync(true);
  }

  private worldTransform(o: PlacedObject): { pos: THREE.Vector3; rotY: number } {
    if (o.buildingId) {
      const b = entity(this.app, 'buildings', o.buildingId) as import('../core/types').BuildingDef | undefined;
      if (b) return { pos: buildingToWorld(b, new THREE.Vector3(...o.pos)), rotY: o.rotY + b.rotY };
    }
    return { pos: new THREE.Vector3(o.pos[0], this.app.terrain.heightAt(o.pos[0], o.pos[2]) + o.pos[1], o.pos[2]), rotY: o.rotY };
  }

  private sigOf(o: PlacedObject) {
    const b = o.buildingId ? entity(this.app, 'buildings', o.buildingId) : null;
    return JSON.stringify(o) + (b ? JSON.stringify([b.pos, b.rotY]) : '');
  }

  sync(force: boolean) {
    const doc = this.app.store.doc;
    const ids = new Set(doc.objects.map((o) => o.id));
    for (const [id, v] of this.objs) if (!ids.has(id) || force) { v.obj.removeFromParent(); this.objs.delete(id); this.lights.set(`obj:${id}`, null); }
    for (const o of doc.objects) {
      const sig = this.sigOf(o);
      const cur = this.objs.get(o.id);
      if (cur && cur.sig === sig) continue;
      if (cur) {
        const parent = o.buildingId ? this.interior : this.exterior;
        if (cur.obj.parent !== parent) parent.add(cur.obj);
        this.place(cur.obj, o); cur.sig = sig; this.updateLight(o); continue;
      }
      const item = catalogItem(o.catalogId);
      if (!item) continue;
      const holder = new THREE.Group();
      holder.userData.pick = { kind: 'objects', id: o.id };
      const entry = { sig, obj: holder as THREE.Object3D, mixer: undefined as THREE.AnimationMixer | undefined };
      this.objs.set(o.id, entry);
      (o.buildingId ? this.interior : this.exterior).add(holder);
      this.place(holder, o);
      void instantiate(item.model).then(({ object, animations }) => {
        if (this.objs.get(o.id)?.obj !== holder) return;
        holder.add(object);
        if (animations.length) {
          const mixer = new THREE.AnimationMixer(object);
          const clip = animations.find((a) => /idle/i.test(a.name)) ?? animations[0];
          mixer.clipAction(clip).play();
          entry.mixer = mixer;
        }
        this.app.selection.refreshHelpers();
      });
      this.updateLight(o);
    }
    this.refreshVisibility();
  }

  private place(holder: THREE.Object3D, o: PlacedObject) {
    const { pos, rotY } = this.worldTransform(o);
    holder.position.copy(pos);
    holder.rotation.set(0, rotY, 0);
    holder.scale.setScalar(o.scale);
  }

  private updateLight(o: PlacedObject) {
    const item = catalogItem(o.catalogId);
    if (!item?.light) return;
    const { pos, rotY } = this.worldTransform(o);
    const l = item.light;
    const off = new THREE.Vector3(0, l.y * o.scale, item.snap === 'wall' ? -0.25 : 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.lights.set(`obj:${o.id}`, { pos: pos.clone().add(off), color: l.color, intensity: l.intensity, distance: l.distance, interior: !!o.buildingId });
  }

  private reseat() {
    for (const o of this.app.store.doc.objects) {
      if (o.buildingId) continue;
      const v = this.objs.get(o.id);
      if (v) { this.place(v.obj, o); this.updateLight(o); }
    }
  }

  refreshVisibility() {
    for (const o of this.app.store.doc.objects) {
      const v = this.objs.get(o.id);
      if (v) v.obj.visible = this.visibility(o);
    }
  }

  update(dt: number) {
    for (const v of this.objs.values()) if (v.mixer && v.obj.visible) v.mixer.update(dt);
  }
}
