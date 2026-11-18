import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { App, System } from '../app/App';
import { meshParts } from '../catalog/loader';
import { lerp, smoothstep } from '../core/math';
import type { BuildingDef } from '../core/types';
import { paintCell } from '../terrain/brushes';
import type { FeatureProvider, TerrainFeature } from '../terrain/features';
import { forCells, forVerts } from '../water/WaterSystem';
import { footprint, frontEdge, insideFootprint, levelBase, totalHeight } from './footprint';
import { meshBuilding, type MeshedBuilding } from './BuildingMesher';
import { setWindowGlow } from './materials';

const PAD = 3.5;
/** Inside this distance from a building (or when it's cut away) its full mesh is drawn: storeys, interior walls, floors, stairs, furniture. */
const DETAIL_DIST = 16;
/** Mesh roles that can't be seen from outside a closed building. */
const INTERIOR_ROLES = new Set(['intwall', 'floor', 'ceiling', 'stairs']);

interface ShellPart { mat: THREE.Material; geo: THREE.BufferGeometry; cast: boolean }
interface Entry {
  sig: string; group: THREE.Group; m: MeshedBuilding; b: BuildingDef; parts: Record<string, THREE.Object3D>;
  /** the outside, merged per material, drawn from the shared batches while the building is far away */
  shell: ShellPart[]; inst: { mesh: THREE.BatchedMesh; id: number }[];
  /** shell pieces that can't be batched (unusual attributes), drawn as plain meshes */
  loose: THREE.Group | null;
  detailed: boolean; radius: number;
}
const BATCH_ATTRS = ['position', 'normal', 'color', 'uv'];
const batchable = (g: THREE.BufferGeometry) => !!g.index && Object.keys(g.attributes).length === BATCH_ATTRS.length && BATCH_ATTRS.every((a) => g.attributes[a]);

/** The outside of a building merged into one geometry per material (a handful of pieces instead of dozens of meshes). */
function mergedShell(m: MeshedBuilding): ShellPart[] {
  m.root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; role: string; cast: boolean }>();
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || INTERIOR_ROLES.has(mesh.userData.role)) return;
    const mat = mesh.material as THREE.Material;
    let e = byMat.get(mat);
    if (!e) byMat.set(mat, (e = { geos: [], role: mesh.userData.role, cast: mesh.castShadow }));
    e.geos.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  });
  const out: ShellPart[] = [];
  for (const [mat, e] of byMat) {
    const merged = e.geos.length === 1 ? e.geos[0] : mergeGeometries(e.geos, false);
    if (merged && e.geos.length > 1) for (const g of e.geos) g.dispose();
    for (const geo of merged ? [merged] : e.geos) out.push({ mat, geo, cast: e.cast });
  }
  return out;
}

/** Renders all BuildingDefs, flattens terrain under them, animates drawbridges/portcullises/sails, and drives cutaway views. */
export class BuildingSystem implements System {
  group = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** far-away building shells: one BatchedMesh (about one draw call) per material for the whole estate */
  private batches: THREE.BatchedMesh[] = [];
  /** cutaway: building id (or '*' for all) and the highest visible level */
  cutaway: { id: string; level: number; xray: boolean } | null = null;
  onRebuilt: (id: string) => void = () => {};
  private glbParts = new Map<string, Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material }[]>>();

  constructor(private app: App) {
    this.group.name = 'buildings';
    app.terrain.addProvider(this.padProvider());
    app.store.subscribe((c) => {
      if (c.type === 'doc') this.sync(true);
      else if (c.type === 'collection' && c.key === 'buildings') this.sync(false);
    });
    app.boxResolvers.set('buildings', (id) => { const e = this.entries.get(id); return e ? new THREE.Box3().setFromObject(e.group) : null; });
    app.blockers.push((x, z) => this.buildingAt(x, z, 1.5) !== null);
    this.sync(true);
  }

  private parts(path: string) {
    if (!this.glbParts.has(path)) this.glbParts.set(path, meshParts(path).catch(() => []));
    return this.glbParts.get(path)!;
  }

  /** Building whose footprint contains world (x,z). */
  buildingAt(x: number, z: number, margin = 0): BuildingDef | null {
    for (const b of this.app.store.doc.buildings) {
      const l = this.toLocal(b, x, z);
      if (insideFootprint(b, l[0], l[1], -margin)) return b;
    }
    return null;
  }
  toLocal(b: BuildingDef, x: number, z: number): [number, number] {
    const dx = x - b.pos[0], dz = z - b.pos[2], c = Math.cos(b.rotY), s = Math.sin(b.rotY);
    return [dx * c - dz * s, dx * s + dz * c];
  }

  private padProvider(): FeatureProvider {
    return {
      keys: ['buildings'],
      features: (doc) => doc.buildings.map((b): TerrainFeature => {
        const r = Math.hypot(b.width, b.shape === 'round' ? b.width : b.depth) / 2 + PAD + 1;
        const y = b.pos[1];
        const dist = (x: number, z: number) => {
          const [lx, lz] = this.toLocal(b, x, z);
          if (b.shape === 'round') return Math.max(0, Math.hypot(lx, lz) - b.width / 2);
          const dx = Math.max(0, Math.abs(lx) - b.width / 2), dz = Math.max(0, Math.abs(lz) - b.depth / 2);
          return Math.hypot(dx, dz);
        };
        return {
          key: `buildings:${b.id}`, sig: JSON.stringify([b.pos, b.rotY, b.width, b.depth, b.shape]), order: 10,
          box: { minX: b.pos[0] - r, minZ: b.pos[2] - r, maxX: b.pos[0] + r, maxZ: b.pos[2] + r },
          heights: (final, rect) => forVerts(rect, (i, x, z) => {
            const d = dist(x, z);
            if (d < PAD) final[i] = lerp(y - 0.02, final[i], smoothstep(0.6, PAD, d));
          }),
          splat: (sp, rect) => forCells(rect, (cx, cz, x, z) => {
            const d = dist(x, z);
            if (d < 1.6) paintCell(sp, cx, cz, b.kind === 'keep' || b.kind.startsWith('tower') || b.kind === 'gatehouse' ? 4 : 2, 0.7 * (1 - smoothstep(0.4, 1.6, d)));
          }),
        };
      }),
    };
  }

  sync(force: boolean) {
    const doc = this.app.store.doc;
    const ids = new Set(doc.buildings.map((b) => b.id));
    let remeshed = false;
    for (const [id, e] of this.entries) if (!ids.has(id) || force) { this.dispose(e); this.entries.delete(id); remeshed = true; }
    for (const b of doc.buildings) {
      const shapeSig = JSON.stringify({ ...b, pos: 0, rotY: 0, extra: { ...b.extra, drawbridgeOpen: 0, portcullisOpen: 0 } });
      const cur = this.entries.get(b.id);
      if (cur && cur.sig === shapeSig) { cur.b = b; this.placeEntry(cur); continue; }
      if (cur) { this.dispose(cur); this.entries.delete(b.id); }
      remeshed = true;
      const m = meshBuilding(b);
      const group = new THREE.Group();
      group.add(m.root, m.anim);
      const shell = mergedShell(m);
      let loose: THREE.Group | null = null;
      for (const p of shell) {
        if (batchable(p.geo)) continue;
        loose ??= new THREE.Group();
        const mesh = new THREE.Mesh(p.geo, p.mat);
        mesh.castShadow = p.cast; mesh.receiveShadow = true; mesh.userData.role = 'shell';
        loose.add(mesh);
      }
      if (loose) group.add(loose);
      if (shell.length) m.root.visible = false;
      group.userData.pick = { kind: 'buildings', id: b.id };
      const e: Entry = { sig: shapeSig, group, m, b, parts: {}, shell: shell.filter((p) => batchable(p.geo)), inst: [], loose, detailed: !shell.length, radius: Math.hypot(b.width, b.shape === 'round' ? b.width : b.depth + Number(b.extra.arcade ?? 0) * 2) / 2 };
      this.entries.set(b.id, e);
      this.group.add(group);
      this.placeEntry(e);
      this.addAnimatedParts(e);
      this.onRebuilt(b.id);
    }
    if (remeshed) this.rebuildBatches();
    this.applyCutaway();
  }

  /** Pack every building's far shell into one BatchedMesh per material. */
  private rebuildBatches() {
    for (const m of this.batches) { this.group.remove(m); m.dispose(); }
    this.batches = [];
    const byMat = new Map<THREE.Material, { parts: { e: Entry; p: ShellPart }[]; v: number; i: number }>();
    for (const e of this.entries.values()) {
      e.inst = [];
      for (const p of e.shell) {
        let L = byMat.get(p.mat);
        if (!L) byMat.set(p.mat, (L = { parts: [], v: 0, i: 0 }));
        L.parts.push({ e, p });
        L.v += p.geo.attributes.position.count;
        L.i += p.geo.index!.count;
      }
    }
    for (const [mat, L] of byMat) {
      const mesh = new THREE.BatchedMesh(L.parts.length, L.v, L.i, mat);
      const owners: string[] = [];
      mesh.castShadow = L.parts[0].p.cast;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances are culled one by one
      for (const { e, p } of L.parts) {
        const id = mesh.addInstance(mesh.addGeometry(p.geo));
        mesh.setMatrixAt(id, e.group.matrixWorld);
        mesh.setVisibleAt(id, !e.detailed);
        owners[id] = e.b.id;
        e.inst.push({ mesh, id });
      }
      mesh.userData.pick = (i: number) => (owners[i] ? { kind: 'buildings', id: owners[i] } : null);
      mesh.userData.role = 'shell';
      this.batches.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Full detail (storeys, interiors) near the camera or when cut away; the merged outside shell otherwise. */
  private applyLod() {
    const cam = this.app.rig.camera.position, c = this.cutaway;
    const plan = this.app.rig.mode === 'plan';
    for (const [id, e] of this.entries) {
      if (!e.shell.length && !e.loose) continue;
      const cut = !!c && (c.id === '*' || c.id === id);
      const d = plan ? Infinity : Math.hypot(cam.x - e.b.pos[0], cam.y - e.b.pos[1], cam.z - e.b.pos[2]) - e.radius;
      const near = cut || d < DETAIL_DIST;
      if (near === e.detailed) continue;
      e.detailed = near;
      e.m.root.visible = near;
      if (e.loose) e.loose.visible = !near;
      for (const i of e.inst) i.mesh.setVisibleAt(i.id, !near);
    }
  }
  /** Is this building drawn in full detail (so its furniture is worth drawing)? */
  isDetailed(id: string) { return this.entries.get(id)?.detailed ?? true; }

  private placeEntry(e: Entry) {
    e.group.position.set(e.b.pos[0], e.b.pos[1], e.b.pos[2]);
    e.group.rotation.set(0, e.b.rotY, 0);
    e.group.updateMatrixWorld(true);
    for (const i of e.inst) i.mesh.setMatrixAt(i.id, e.group.matrixWorld);
  }

  private dispose(e: Entry) {
    this.group.remove(e.group);
    for (const p of e.shell) p.geo.dispose();
    for (const i of e.inst) i.mesh.setVisibleAt(i.id, false);
    e.inst = [];
    e.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && m.userData.role) m.geometry.dispose(); });
  }

  private async addAnimatedParts(e: Entry) {
    const b = e.b;
    const anim = e.m.anim;
    const addGlb = async (path: string, place: (o: THREE.Group) => void) => {
      const parts = await this.parts(path);
      if (this.entries.get(b.id) !== e) return null;
      const o = new THREE.Group();
      for (const p of parts) { const mesh = new THREE.Mesh(p.geometry, p.material); mesh.castShadow = mesh.receiveShadow = true; o.add(mesh); }
      place(o);
      anim.add(o);
      return o;
    };
    if (b.kind === 'gatehouse') {
      const fe = frontEdge(b);
      void fe;
      const op = b.openings.find((o) => o.kind === 'archway');
      const ow = op?.width ?? 4, oh = op?.height ?? 5;
      // portcullis just inside the front arch
      const pc = await addGlb('models/castle/portcullis.glb', (o) => { o.scale.set(ow / 4, oh / 5, 1); o.position.set(0, 0, b.depth / 2 - b.wallThickness * 0.5); });
      if (pc) { e.parts.portcullis = pc; pc.userData.closedY = 0; pc.userData.openY = oh * 0.92; pc.position.y = b.extra.portcullisOpen ? oh * 0.92 : 0; }
      if (b.extra.drawbridge) {
        const len = Number(b.extra.bridgeLength ?? 9);
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.1, b.depth / 2 + 0.05);
        const db = await addGlb('models/castle/drawbridge.glb', (o) => { o.scale.set(ow / 4 * 0.95, 1, len / 8); });
        if (db) { anim.remove(db); pivot.add(db); anim.add(pivot); e.parts.drawbridge = pivot; pivot.rotation.x = b.extra.drawbridgeOpen ? 0 : -Math.PI / 2; db.userData.pick = { kind: 'buildings', id: b.id }; }
      }
    }
    if (b.extra.sails) {
      const top = totalHeight(b);
      const s = await addGlb('models/village/windmill_sails.glb', (o) => { o.position.set(0, top - 1.2, b.width / 2 + 0.6); });
      if (s) e.parts.sails = s;
    }
    if (b.extra.waterwheel) {
      const s = await addGlb('models/village/waterwheel.glb', (o) => { o.position.set(b.width / 2 + 0.9, 1.6, 0); });
      if (s) e.parts.wheel = s;
    }
  }

  /** Set cutaway: show `level` and below of building `id` ('*' = all); null to clear. */
  setCutaway(c: { id: string; level: number; xray?: boolean } | null) {
    this.cutaway = c ? { id: c.id, level: c.level, xray: !!c.xray } : null;
    this.applyCutaway();
  }
  private applyCutaway() {
    const c = this.cutaway;
    for (const [id, e] of this.entries) {
      const on = !!c && (c.id === '*' || c.id === id);
      e.m.roof.visible = !on;
      for (const [lvl, g] of e.m.levels) {
        g.visible = !on || lvl <= c!.level;
        // interior surfaces only cast shadows when the roof is off
        g.traverse((o) => { if ((o as THREE.Mesh).isMesh && INTERIOR_ROLES.has(o.userData.role)) o.castShadow = on; });
        // the ceiling of the level you're looking into would block the view from above
        g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.role === 'ceiling') o.visible = !on || lvl < c!.level; });
        // x-ray: exterior walls of the cut level become see-through
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || m.userData.role !== 'extwall') return;
          if (on && c!.xray) {
            if (!m.userData.solidMat) { m.userData.solidMat = m.material; const t = (m.material as THREE.MeshStandardMaterial).clone(); t.transparent = true; t.opacity = 0.18; t.depthWrite = false; m.material = t; }
          } else if (m.userData.solidMat) { m.material = m.userData.solidMat; delete m.userData.solidMat; }
        });
      }
      for (const k of ['sails', 'portcullis']) if (e.parts[k]) e.parts[k].visible = !on || k === 'portcullis';
    }
    this.applyLod();
  }

  /** Mesh groups (for walk collision / cutaway queries). */
  get meshRoots(): THREE.Object3D[] { return [...this.entries.values()].map((e) => e.group); }
  entry(id: string) { return this.entries.get(id); }

  private lodT = 0;
  update(dt: number, t: number) {
    setWindowGlow(this.app.env.night);
    this.lodT -= dt;
    if (this.lodT <= 0) { this.lodT = 0.2; this.applyLod(); }
    for (const e of this.entries.values()) {
      const p = e.parts;
      if (p.drawbridge) {
        const target = e.b.extra.drawbridgeOpen ? 0 : -Math.PI / 2;
        p.drawbridge.rotation.x += (target - p.drawbridge.rotation.x) * Math.min(1, dt * 0.9);
      }
      if (p.portcullis) {
        const target = e.b.extra.portcullisOpen ? p.portcullis.userData.openY : 0;
        p.portcullis.position.y += (target - p.portcullis.position.y) * Math.min(1, dt * 1.2);
      }
      if (p.sails) p.sails.rotation.z = t * 0.6 * (this.app.env.weather === 'rain' ? 1.8 : 1);
      if (p.wheel) p.wheel.rotation.x = -t * 0.8;
    }
  }

  /** Lowest/highest Y of a floor level in world space. */
  levelWorldY(b: BuildingDef, level: number) { return b.pos[1] + levelBase(b, level); }
  footprintWorld(b: BuildingDef) {
    const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
    return footprint(b).map(([x, z]) => [b.pos[0] + x * c + z * s, b.pos[2] - x * s + z * c] as [number, number]);
  }
}
