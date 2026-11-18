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
  private objs = new Map<string, { sig: string; obj: THREE.Object3D; mixer?: THREE.AnimationMixer; h: number }>();
  /** interior cutaway filter: return false to hide an object */
  visibility: (o: PlacedObject) => boolean = () => true;
  /** furniture is only drawn while its building is drawn in full detail (near the camera, or cut away) */
  interiorShown: (buildingId: string) => boolean = () => true;
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
        this.place(cur.obj, o); cur.sig = sig; cur.h = (catalogItem(o.catalogId)?.height ?? 1) * o.scale; this.updateLight(o); continue;
      }
      const item = catalogItem(o.catalogId);
      if (!item) continue;
      const holder = new THREE.Group();
      holder.userData.pick = { kind: 'objects', id: o.id };
      // static: its matrix is only recomputed when it's placed (thousands of props otherwise cost several ms a frame)
      holder.matrixAutoUpdate = false;
      const entry = { sig, obj: holder as THREE.Object3D, mixer: undefined as THREE.AnimationMixer | undefined, h: item.height * o.scale };
      this.objs.set(o.id, entry);
      (o.buildingId ? this.interior : this.exterior).add(holder);
      this.place(holder, o);
      void instantiate(item.model).then(({ object, animations }) => {
        if (this.objs.get(o.id)?.obj !== holder) return;
        holder.add(object);
        // small things outdoors (benches, crates, planters) skip the shadow pass: hundreds of draw calls for barely visible shadows
        if (!o.buildingId && item.height < 1) object.traverse((m) => { m.castShadow = false; });
        if (!animations.length) object.traverse((n) => { n.updateMatrix(); n.matrixAutoUpdate = false; }); // animated ones keep moving bones
        holder.updateMatrixWorld(true);
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
    holder.updateMatrix();
    holder.updateMatrixWorld(true);
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
    const shown = new Map<string, boolean>();
    const cam = this.app.rig.camera.position, plan = this.app.rig.mode === 'plan';
    for (const o of this.app.store.doc.objects) {
      const v = this.objs.get(o.id);
      if (!v) continue;
      let near = true;
      if (o.buildingId) { near = shown.get(o.buildingId) ?? this.interiorShown(o.buildingId); shown.set(o.buildingId, near); }
      // outdoor props fade out by size: crates and benches beyond ~100 m, lanterns and carts beyond ~200 m
      else if (!plan) near = v.obj.position.distanceTo(cam) < (v.h < 1 ? 100 : v.h < 3.5 ? 200 : 450);
      // hidden props leave the scene graph entirely: three walks every attached node each frame, visible or not
      const parent = o.buildingId ? this.interior : this.exterior;
      if (near && this.visibility(o)) { if (v.obj.parent !== parent) parent.add(v.obj); }
      else if (v.obj.parent) v.obj.removeFromParent();
    }
  }

  private cullT = 0;

  update(dt: number) {
    for (const v of this.objs.values()) if (v.mixer && v.obj.parent) v.mixer.update(dt);
    // furniture inside buildings is only drawn while you can see in (homes can hold hundreds of pieces)
    this.cullT -= dt;
    if (this.cullT <= 0) { this.cullT = 0.25; this.refreshVisibility(); }
  }
}
