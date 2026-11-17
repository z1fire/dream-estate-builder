import * as THREE from 'three';
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

interface Entry { sig: string; group: THREE.Group; m: MeshedBuilding; b: BuildingDef; parts: Record<string, THREE.Object3D> }

/** Renders all BuildingDefs, flattens terrain under them, animates drawbridges/portcullises/sails, and drives cutaway views. */
export class BuildingSystem implements System {
  group = new THREE.Group();
  private entries = new Map<string, Entry>();
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
    for (const [id, e] of this.entries) if (!ids.has(id) || force) { this.dispose(e); this.entries.delete(id); }
    for (const b of doc.buildings) {
      const shapeSig = JSON.stringify({ ...b, pos: 0, rotY: 0, extra: { ...b.extra, drawbridgeOpen: 0, portcullisOpen: 0 } });
      const cur = this.entries.get(b.id);
      if (cur && cur.sig === shapeSig) { cur.b = b; this.placeEntry(cur); continue; }
      if (cur) { this.dispose(cur); this.entries.delete(b.id); }
      const m = meshBuilding(b);
      const group = new THREE.Group();
      group.add(m.root);
      group.userData.pick = { kind: 'buildings', id: b.id };
      const e: Entry = { sig: shapeSig, group, m, b, parts: {} };
      this.entries.set(b.id, e);
      this.group.add(group);
      this.placeEntry(e);
      this.addAnimatedParts(e);
      this.onRebuilt(b.id);
    }
    this.applyCutaway();
  }

  private placeEntry(e: Entry) {
    e.group.position.set(e.b.pos[0], e.b.pos[1], e.b.pos[2]);
    e.group.rotation.set(0, e.b.rotY, 0);
    e.group.updateMatrixWorld(true);
  }

  private dispose(e: Entry) {
    this.group.remove(e.group);
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
  }

  /** Mesh groups (for walk collision / cutaway queries). */
  get meshRoots(): THREE.Object3D[] { return [...this.entries.values()].map((e) => e.group); }
  entry(id: string) { return this.entries.get(id); }

  update(dt: number, t: number) {
    setWindowGlow(this.app.env.night);
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
