import * as THREE from 'three';
import type { App, System } from '../app/App';
import { meshParts } from '../catalog/loader';
import { catalogItem } from '../catalog/catalog';
import { C, GeoBuilder, vary } from '../core/geom';
import { bboxOf, pointInPolygon, rng, type V2 } from '../core/math';
import { SegIndex } from '../core/segindex';
import type { CropKind, FieldDef } from '../core/types';
import { paintCell } from '../terrain/brushes';
import type { FeatureProvider, TerrainFeature } from '../terrain/features';
import { forCells } from '../water/WaterSystem';

export const CROPS: { id: CropKind; label: string; row: number; plant: number }[] = [
  { id: 'wheat', label: 'Wheat', row: 0.8, plant: 0.6 },
  { id: 'barley', label: 'Barley', row: 0.8, plant: 0.6 },
  { id: 'corn', label: 'Corn', row: 1.1, plant: 0.9 },
  { id: 'vegetables', label: 'Vegetables', row: 0.9, plant: 0.7 },
  { id: 'pumpkins', label: 'Pumpkins', row: 2, plant: 1.6 },
  { id: 'flowers', label: 'Lavender & flowers', row: 1, plant: 0.6 },
  { id: 'vineyard', label: 'Vineyard rows', row: 2.6, plant: 3 },
  { id: 'orchard', label: 'Orchard', row: 6, plant: 6 },
];
export const STAGES = ['Plowed', 'Sprouting', 'Growing', 'Ripe'];

/** Which catalog models to scatter for a crop at a growth stage (with relative weights). */
function cropModels(crop: CropKind, stage: number): [string, number, number][] /* id, weight, scale */ {
  if (stage === 0 || crop === 'vineyard') return [];
  const sprout: [string, number, number][] = [['crop_sprouts', 1, 1]];
  switch (crop) {
    case 'wheat': return stage === 1 ? sprout : stage === 2 ? [['crop_wheat_young', 1, 1]] : [['crop_wheat', 1, 1]];
    case 'barley': return stage === 1 ? sprout : stage === 2 ? [['crop_wheat_young', 1, 0.9]] : [['crop_wheat', 1, 0.85]];
    case 'corn': return stage === 1 ? sprout : stage === 2 ? [['crop_corn_young', 1, 1]] : [['crop_corn', 1, 1]];
    case 'vegetables': return stage === 1 ? sprout : [['crop_carrot', 1, 1], ['crop_turnip', 1, 1], ['crop_greens', 1, stage === 2 ? 0.8 : 1.1]];
    case 'pumpkins': return stage === 1 ? sprout : stage === 2 ? [['crop_greens', 1, 1.2]] : [['crop_pumpkin', 2, 1.1], ['pumpkin', 1, 1.2]];
    case 'flowers': return stage === 1 ? sprout : [['flower_purple2', 3, stage === 2 ? 0.7 : 1], ['flower_purple', 1, 0.9]];
    case 'orchard': return [[['tree_apple', 'tree_pear', 'tree_plum'][0], 1, stage === 1 ? 0.35 : stage === 2 ? 0.7 : 1]];
  }
  return [];
}

interface FieldEntry { sig: string; group: THREE.Group }

/** Crop fields (planted in rows, growth stages), vineyards and orchards. */
export class FarmSystem implements System {
  group = new THREE.Group();
  private entries = new Map<string, FieldEntry>();
  private parts = new Map<string, Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material }[]>>();
  private vineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  private timer = 0;

  constructor(private app: App) {
    this.group.name = 'farming';
    app.terrain.addProvider(this.provider());
    app.store.subscribe((c) => {
      if (c.type === 'doc') this.sync(true);
      else if (c.type === 'collection' && c.key === 'fields') this.sync(false);
      else if (c.type === 'terrain') { clearTimeout(this.timer); this.timer = window.setTimeout(() => this.sync(true), 500); }
    });
    app.groundPickers.push((x, z) => {
      for (const f of app.store.doc.fields) if (pointInPolygon(x, z, f.points)) return { kind: 'fields', id: f.id };
      for (const p of app.store.doc.pastures) if (pointInPolygon(x, z, p.points)) return { kind: 'pastures', id: p.id };
      return null;
    });
    app.blockers.push((x, z) => app.store.doc.fields.some((f) => pointInPolygon(x, z, f.points)));
    app.boxResolvers.set('fields', (id) => {
      const f = app.store.get('fields', id);
      if (!f) return null;
      const b = bboxOf(f.points);
      const y = app.terrain.heightAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
      return new THREE.Box3(new THREE.Vector3(b.minX, y - 1, b.minZ), new THREE.Vector3(b.maxX, y + 2, b.maxZ));
    });
    app.boxResolvers.set('pastures', (id) => {
      const f = app.store.get('pastures', id);
      if (!f) return null;
      const b = bboxOf(f.points);
      const y = app.terrain.heightAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
      return new THREE.Box3(new THREE.Vector3(b.minX, y - 1, b.minZ), new THREE.Vector3(b.maxX, y + 2, b.maxZ));
    });
    this.sync(true);
  }

  private provider(): FeatureProvider {
    return {
      keys: ['fields', 'pastures'],
      features: (doc) => [
        ...doc.fields.map((f): TerrainFeature => {
          const b = bboxOf(f.points);
          const idx = new SegIndex(f.points, true, 1.5);
          const layer = f.crop === 'orchard' || f.crop === 'vineyard' ? 1 : 7; // meadow under trees/vines, farmland otherwise
          return {
            key: `fields:${f.id}`, sig: JSON.stringify([f.points, f.crop]), order: 25,
            box: { minX: b.minX - 2, minZ: b.minZ - 2, maxX: b.maxX + 2, maxZ: b.maxZ + 2 },
            splat: (sp, r) => forCells(r, (cx, cz, x, z) => {
              const inside = pointInPolygon(x, z, f.points);
              const q = idx.nearest(x, z);
              const edge = q ? Math.min(1, q.d / 1.2) : 1;
              if (inside) paintCell(sp, cx, cz, layer, 0.35 + 0.65 * edge);
              else if (q && q.d < 0.8) paintCell(sp, cx, cz, 2, 0.4 * (1 - q.d / 0.8));
            }),
          };
        }),
        ...doc.pastures.map((p): TerrainFeature => {
          const b = bboxOf(p.points);
          return {
            key: `pastures:${p.id}`, sig: JSON.stringify(p.points), order: 24,
            box: { minX: b.minX, minZ: b.minZ, maxX: b.maxX, maxZ: b.maxZ },
            splat: (sp, r) => forCells(r, (cx, cz, x, z) => { if (pointInPolygon(x, z, p.points)) paintCell(sp, cx, cz, 1, 0.55); }),
          };
        }),
      ],
    };
  }

  private load(id: string) {
    const item = catalogItem(id);
    if (!this.parts.has(id)) this.parts.set(id, item ? meshParts(item.model).catch(() => []) : Promise.resolve([]));
    return this.parts.get(id)!;
  }

  sync(force: boolean) {
    const doc = this.app.store.doc;
    const ids = new Set(doc.fields.map((f) => f.id));
    for (const [id, e] of this.entries) if (!ids.has(id) || force) { this.remove(e); this.entries.delete(id); }
    for (const f of doc.fields) {
      const sig = JSON.stringify(f);
      const cur = this.entries.get(f.id);
      if (cur && cur.sig === sig) continue;
      if (cur) this.remove(cur);
      const group = new THREE.Group();
      group.userData.pick = { kind: 'fields', id: f.id };
      this.entries.set(f.id, { sig, group });
      this.group.add(group);
      void this.build(f, group);
    }
  }
  private remove(e: FieldEntry) {
    this.group.remove(e.group);
    e.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); else if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
  }

  /** Planting positions in rows along rowAngle inside the field polygon. */
  rows(f: FieldDef, rowSp: number, plantSp: number, inset = 0.6): { p: V2; row: number }[] {
    const out: { p: V2; row: number }[] = [];
    const c = Math.cos(f.rowAngle), s = Math.sin(f.rowAngle);
    const toUV = ([x, z]: V2): V2 => [x * c + z * s, -x * s + z * c];
    const fromUV = (u: number, v: number): V2 => [u * c - v * s, u * s + v * c];
    const uv = f.points.map(toUV);
    const b = bboxOf(uv);
    const idx = new SegIndex(f.points, true, inset + 0.1);
    const r = rng(f.id.length * 131 + Math.floor(b.minX));
    let row = 0;
    for (let v = b.minZ + rowSp / 2; v < b.maxZ; v += rowSp, row++) {
      for (let u = b.minX + plantSp / 2; u < b.maxX; u += plantSp) {
        const [x, z] = fromUV(u + (r() - 0.5) * plantSp * 0.25, v + (r() - 0.5) * rowSp * 0.12);
        if (!pointInPolygon(x, z, f.points) || idx.nearest(x, z)) continue;
        out.push({ p: [x, z], row });
        if (out.length > 60000) return out;
      }
    }
    return out;
  }

  private async build(f: FieldDef, group: THREE.Group) {
    const spec = CROPS.find((c) => c.id === f.crop) ?? CROPS[0];
    if (f.crop === 'vineyard') { group.add(this.vineyard(f)); return; }
    const models = cropModels(f.crop, f.stage);
    if (!models.length) return;
    const pts = this.rows(f, spec.row, spec.plant, f.crop === 'orchard' ? 2.5 : 0.6);
    const r = rng(pts.length + 7);
    const totalW = models.reduce((s, m) => s + m[1], 0);
    const buckets = models.map(() => [] as { p: V2; s: number; rot: number }[]);
    for (const { p, row } of pts) {
      let pick = 0;
      if (f.crop === 'vegetables') pick = row % models.length;
      else { let t = r() * totalW; for (let i = 0; i < models.length; i++) { t -= models[i][1]; if (t <= 0) { pick = i; break; } } }
      buckets[pick].push({ p, s: models[pick][2] * (0.85 + r() * 0.3), rot: r() * Math.PI * 2 });
    }
    const orchardKinds = ['tree_apple', 'tree_pear', 'tree_plum'];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < models.length; k++) {
      const list = buckets[k];
      let modelIds = [models[k][0]];
      if (f.crop === 'orchard') { modelIds = orchardKinds; }
      for (let mi = 0; mi < modelIds.length; mi++) {
        const sub = f.crop === 'orchard' ? list.filter((_, i) => i % 3 === mi) : list;
        if (!sub.length) continue;
        const parts = await this.load(modelIds[mi]);
        if (!this.entries.has(f.id) || this.entries.get(f.id)!.group !== group) return;
        for (const part of parts) {
          const im = new THREE.InstancedMesh(part.geometry, part.material, sub.length);
          sub.forEach((it, i) => {
            pos.set(it.p[0], this.app.terrain.heightAt(it.p[0], it.p[1]) - 0.03, it.p[1]);
            q.setFromAxisAngle(up, it.rot);
            sc.setScalar(it.s);
            im.setMatrixAt(i, m.compose(pos, q, sc));
          });
          im.castShadow = f.crop === 'orchard' || f.crop === 'corn';
          im.receiveShadow = true;
          im.computeBoundingSphere();
          group.add(im);
        }
      }
    }
  }

  private vineyard(f: FieldDef): THREE.Mesh {
    const g = new GeoBuilder();
    const H = (x: number, z: number) => this.app.terrain.heightAt(x, z);
    const pts = this.rows(f, 2.6, 3, 1);
    const post = C('#6b4a2c'), leaf = C('#4a7a2a'), grape = C('#5a2a6a');
    const r = rng(f.id.length * 17);
    const byRow = new Map<number, V2[]>();
    for (const p of pts) { if (!byRow.has(p.row)) byRow.set(p.row, []); byRow.get(p.row)!.push(p.p); }
    const leafAmt = [0, 0.35, 0.75, 1][f.stage] ?? 1;
    for (const row of byRow.values()) {
      for (let i = 0; i < row.length; i++) {
        const [x, z] = row[i];
        const y = H(x, z);
        g.box(x, y + 0.8, z, 0.1, 1.6, 0.1, f.rowAngle, post);
        if (i < row.length - 1) {
          const [x2, z2] = row[i + 1];
          const y2 = H(x2, z2);
          const A = new THREE.Vector3(x, y, z), B = new THREE.Vector3(x2, y2, z2);
          for (const hgt of [0.9, 1.45]) g.beam(A.clone().setY(y + hgt), B.clone().setY(y2 + hgt), 0.02, 0.02, C('#888'));
          if (leafAmt > 0) {
            const n = 4;
            for (let k = 0; k < n; k++) {
              const t = (k + 0.5) / n;
              const px = x + (x2 - x) * t, pz = z + (z2 - z) * t, py = y + (y2 - y) * t;
              const s = 0.45 * leafAmt * (0.8 + r() * 0.4);
              g.box(px, py + 1.15, pz, s * 1.1, s * 1.3, (Math.hypot(x2 - x, z2 - z) / n) * 1.05, f.rowAngle + (r() - 0.5) * 0.2, vary(leaf, k + i, 0.15));
              if (f.stage === 3 && r() > 0.4) g.box(px + (r() - 0.5) * 0.3, py + 0.85, pz + (r() - 0.5) * 0.3, 0.16, 0.22, 0.16, 0, vary(grape, k, 0.1));
            }
          }
        }
      }
    }
    const mesh = new THREE.Mesh(g.build(), this.vineMat);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
}

