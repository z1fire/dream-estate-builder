import * as THREE from 'three';
import type { App } from '../app/App';
import { composite, removeEntities, addEntities, type Command } from '../core/commands';
import { clone, uid } from '../core/store';
import { polygonCentroid, type V2 } from '../core/math';
import type { BuildingDef, CollectionKey, PlacedObject } from '../core/types';

type AnyEnt = { id: string } & Record<string, any>;

const POLY_KINDS = new Set(['paths', 'fences', 'walls', 'fields', 'pastures', 'water', 'moats', 'retaining']);
export const TRANSFORMABLE = new Set(['objects', 'buildings', 'animals', ...POLY_KINDS]);

/** Building-local → world for interior objects. */
export function buildingToWorld(b: BuildingDef, local: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
  return new THREE.Vector3(b.pos[0] + local.x * c + local.z * s, b.pos[1] + local.y, b.pos[2] - local.x * s + local.z * c);
}
export function worldToBuilding(b: BuildingDef, w: THREE.Vector3): THREE.Vector3 {
  const dx = w.x - b.pos[0], dz = w.z - b.pos[2];
  const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
  return new THREE.Vector3(dx * c - dz * s, w.y - b.pos[1], dx * s + dz * c);
}

export function entity(app: App, kind: string, id: string): AnyEnt | undefined {
  return ((app.store.doc as any)[kind] as AnyEnt[] | undefined)?.find((e) => e.id === id);
}

/** World pivot of an entity. */
export function pivotOf(app: App, kind: string, e: AnyEnt): THREE.Vector3 {
  if (kind === 'objects') {
    const o = e as PlacedObject;
    if (o.buildingId) {
      const b = entity(app, 'buildings', o.buildingId) as BuildingDef | undefined;
      if (b) return buildingToWorld(b, new THREE.Vector3(...o.pos));
    }
    return new THREE.Vector3(...o.pos);
  }
  if (kind === 'buildings') return new THREE.Vector3(...(e as BuildingDef).pos);
  if (kind === 'animals') { const p = e.pos as V2; return new THREE.Vector3(p[0], app.terrain.heightAt(p[0], p[1]), p[1]); }
  if (POLY_KINDS.has(kind)) {
    const [x, z] = polygonCentroid(e.points as V2[]);
    return new THREE.Vector3(x, app.terrain.heightAt(x, z), z);
  }
  return new THREE.Vector3();
}

export interface Delta { offset: THREE.Vector3; rot: number; scale: number; pivot: THREE.Vector3; freeY: boolean }

function rotAbout(x: number, z: number, p: THREE.Vector3, r: number): [number, number] {
  const c = Math.cos(r), s = Math.sin(r);
  const dx = x - p.x, dz = z - p.z;
  // rotation about +Y (three.js convention): x' = x c + z s, z' = -x s + z c
  return [p.x + dx * c + dz * s, p.z - dx * s + dz * c];
}

/** Apply a gizmo delta to a snapshot entity, returning the transformed copy. */
export function applyDelta(app: App, kind: string, before: AnyEnt, d: Delta): AnyEnt {
  const e = clone(before);
  const tx = (x: number, z: number): [number, number] => {
    let [nx, nz] = rotAbout(x, z, d.pivot, d.rot);
    nx = d.pivot.x + (nx - d.pivot.x) * d.scale;
    nz = d.pivot.z + (nz - d.pivot.z) * d.scale;
    return [nx + d.offset.x, nz + d.offset.z];
  };
  if (kind === 'objects') {
    const o = e as PlacedObject;
    const w = pivotOf(app, kind, before);
    const [nx, nz] = tx(w.x, w.z);
    let ny = d.freeY ? w.y + d.offset.y : app.terrain.heightAt(nx, nz) + (w.y - app.terrain.heightAt(w.x, w.z));
    if (!o.buildingId && !d.freeY && Math.abs(w.y - app.terrain.heightAt(w.x, w.z)) < 0.05) ny = app.terrain.heightAt(nx, nz);
    const nw = new THREE.Vector3(nx, ny, nz);
    if (o.buildingId) {
      const b = entity(app, 'buildings', o.buildingId) as BuildingDef | undefined;
      const l = b ? worldToBuilding(b, nw) : nw;
      o.pos = [l.x, d.freeY ? l.y : o.pos[1], l.z];
    } else o.pos = [nw.x, nw.y, nw.z];
    o.rotY = before.rotY + d.rot;
    o.scale = Math.max(0.05, before.scale * d.scale);
  } else if (kind === 'buildings') {
    const b = e as BuildingDef;
    const [nx, nz] = tx(b.pos[0], b.pos[2]);
    b.pos = [nx, d.freeY ? b.pos[1] + d.offset.y : app.terrain.baseHeightAt(nx, nz), nz];
    b.rotY = before.rotY + d.rot;
    if (d.scale !== 1) { b.width = Math.max(2, b.width * d.scale); b.depth = Math.max(2, b.depth * d.scale); }
  } else if (kind === 'animals') {
    e.pos = tx(e.pos[0], e.pos[1]);
  } else if (POLY_KINDS.has(kind)) {
    e.points = (e.points as V2[]).map(([x, z]) => tx(x, z));
    if ((kind === 'water' || kind === 'moats') && e.level !== undefined && d.offset.y && d.freeY) e.level += d.offset.y;
  }
  return e;
}

/** Duplicate entities with an offset; returns command + new ids. */
export function duplicateCommand(app: App, items: { kind: string; id: string }[], offset = 4): { cmd: Command; ids: { kind: string; id: string }[] } {
  const cmds: Command[] = [];
  const ids: { kind: string; id: string }[] = [];
  const byKind = new Map<string, AnyEnt[]>();
  for (const it of items) {
    const e = entity(app, it.kind, it.id);
    if (!e || !TRANSFORMABLE.has(it.kind)) continue;
    const d: Delta = { offset: new THREE.Vector3(offset, 0, offset), rot: 0, scale: 1, pivot: new THREE.Vector3(), freeY: false };
    const c = applyDelta(app, it.kind, e, d);
    c.id = uid(it.kind.slice(0, 3));
    if (it.kind === 'buildings') c.name = `${e.name} copy`;
    if (!byKind.has(it.kind)) byKind.set(it.kind, []);
    byKind.get(it.kind)!.push(c);
    ids.push({ kind: it.kind, id: c.id });
    // copy interior objects with buildings
    if (it.kind === 'buildings') {
      const inner = app.store.doc.objects.filter((o) => o.buildingId === it.id).map((o) => ({ ...clone(o), id: uid('obj'), buildingId: c.id }));
      if (inner.length) cmds.push(addEntities(app.store, 'objects', inner));
    }
  }
  for (const [k, list] of byKind) cmds.unshift(addEntities(app.store, k as CollectionKey, list as never[]));
  return { cmd: composite('Duplicate', cmds), ids };
}

export function deleteCommand(app: App, items: { kind: string; id: string }[]): Command {
  const byKind = new Map<string, string[]>();
  for (const it of items) {
    if (!byKind.has(it.kind)) byKind.set(it.kind, []);
    byKind.get(it.kind)!.push(it.id);
  }
  const cmds: Command[] = [];
  const bIds = byKind.get('buildings') ?? [];
  if (bIds.length) {
    const inner = app.store.doc.objects.filter((o) => o.buildingId && bIds.includes(o.buildingId)).map((o) => o.id);
    if (inner.length) byKind.set('objects', [...new Set([...(byKind.get('objects') ?? []), ...inner])]);
  }
  // pastures own their fences
  for (const pid of byKind.get('pastures') ?? []) {
    const p = entity(app, 'pastures', pid);
    if (p?.fenceId) byKind.set('fences', [...(byKind.get('fences') ?? []), p.fenceId]);
  }
  for (const [k, ids] of byKind) cmds.push(removeEntities(app.store, k as CollectionKey, ids));
  return composite('Delete', cmds);
}
