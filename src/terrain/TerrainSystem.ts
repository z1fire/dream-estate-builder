import * as THREE from 'three';
import type { Rect, Store } from '../core/store';
import { distToPolyline, pointInPolygon } from '../core/math';
import { GRID, HALF, VERTS, WORLD_SIZE } from '../core/types';
import { createTerrainMaterial, makeSplatTexture, type TerrainUniforms } from './terrainMaterial';
import { heightAt, raycastTerrain } from './heightfield';
import { boxToRect, intersectRect, rectsIntersect, type FeatureProvider, type TerrainFeature } from './features';
import { unionRect } from './heightfield';

const CHUNK = 64; // cells per chunk
const NCH = GRID / CHUNK; // chunks per side
const LODS = [1, 2, 4, 8];
const SDF_RES = 256;
const PLANE = GRID * GRID * 4;

/** Shared index buffers per LOD level (grid + skirt). */
const indexCache = new Map<number, THREE.BufferAttribute>();
function lodIndex(step: number): THREE.BufferAttribute {
  if (indexCache.has(step)) return indexCache.get(step)!;
  const n = CHUNK / step;
  const v = n + 1;
  const idx: number[] = [];
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const a = z * v + x, b = a + 1, c = a + v, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const base = v * v;
  const edges: number[][] = [
    Array.from({ length: v }, (_, k) => k),
    Array.from({ length: v }, (_, k) => k * v + n),
    Array.from({ length: v }, (_, k) => n * v + (n - k)),
    Array.from({ length: v }, (_, k) => (n - k) * v),
  ];
  edges.forEach((edge, e) => {
    for (let k = 0; k < v - 1; k++) {
      const a = edge[k], b = edge[k + 1];
      const sa = base + e * v + k, sb = sa + 1;
      idx.push(a, b, sa, b, sb, sa);
    }
  });
  const attr = new THREE.BufferAttribute(new Uint32Array(idx), 1);
  indexCache.set(step, attr);
  return attr;
}

class Chunk {
  mesh: THREE.Mesh;
  lod = -1;
  dirty = true;
  constructor(public cx: number, public cz: number, material: THREE.Material) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.name = `terrain_${cx}_${cz}`;
    this.mesh.userData.noPick = true;
  }
  build(h: Float32Array, lod: number) {
    const step = LODS[lod];
    const n = CHUNK / step, v = n + 1;
    const total = v * v + 4 * v;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const gx0 = this.cx * CHUNK, gz0 = this.cz * CHUNK;
    const H = (gx: number, gz: number) => h[Math.min(GRID, Math.max(0, gz)) * VERTS + Math.min(GRID, Math.max(0, gx))];
    let minY = Infinity, maxY = -Infinity;
    for (let z = 0; z < v; z++)
      for (let x = 0; x < v; x++) {
        const gx = gx0 + x * step, gz = gz0 + z * step;
        const i = (z * v + x) * 3;
        const y = H(gx, gz);
        pos[i] = gx - HALF; pos[i + 1] = y; pos[i + 2] = gz - HALF;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        const s = step;
        let nx = H(gx - s, gz) - H(gx + s, gz), ny = 2 * s, nz = H(gx, gz - s) - H(gx, gz + s);
        const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
        nor[i] = nx; nor[i + 1] = ny; nor[i + 2] = nz;
      }
    const edges = [(k: number) => k, (k: number) => k * v + n, (k: number) => n * v + (n - k), (k: number) => (n - k) * v];
    const skirt = 1.5 * step;
    edges.forEach((f, e) => {
      for (let k = 0; k < v; k++) {
        const src = f(k) * 3, dst = (v * v + e * v + k) * 3;
        pos[dst] = pos[src]; pos[dst + 1] = pos[src + 1] - skirt; pos[dst + 2] = pos[src + 2];
        nor[dst] = nor[src]; nor[dst + 1] = nor[src + 1]; nor[dst + 2] = nor[src + 2];
      }
    });
    const g = this.mesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(lodIndex(step));
    const x0 = gx0 - HALF, z0 = gz0 - HALF;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, minY - skirt, z0), new THREE.Vector3(x0 + CHUNK, maxY, z0 + CHUNK));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    this.lod = lod;
    this.dirty = false;
  }
}

/**
 * Renders the terrain. `store.doc.heights/splat` are the *base* (sculpted/painted) layers; registered
 * FeatureProviders (moats, ponds, paths, building pads…) are applied on top into `final`/`finalSplat`.
 */
export class TerrainSystem {
  group = new THREE.Group();
  material: THREE.MeshStandardMaterial;
  uniforms: TerrainUniforms;
  /** Final heights after features — use this for all sampling/raycasts. */
  final: Float32Array;
  finalSplat: Uint8Array;
  private chunks: Chunk[] = [];
  private sdfData = new Uint8Array(SDF_RES * SDF_RES);
  private sdfTex: THREE.DataTexture;
  private outer: THREE.Mesh;
  private providers: FeatureProvider[] = [];
  private features = new Map<string, TerrainFeature>();
  lodEnabled = true;
  private splatDirty = false;
  /** listeners called after final heights change in a rect (vegetation/objects re-seat themselves) */
  onHeightsChanged: ((r: Rect) => void)[] = [];

  constructor(private store: Store) {
    this.group.name = 'terrain';
    this.final = store.doc.heights.slice();
    this.finalSplat = store.doc.splat.slice();
    this.sdfTex = new THREE.DataTexture(this.sdfData, SDF_RES, SDF_RES, THREE.RedFormat, THREE.UnsignedByteType);
    this.sdfTex.magFilter = this.sdfTex.minFilter = THREE.LinearFilter;
    const { material, uniforms } = createTerrainMaterial(this.finalSplat, this.sdfTex);
    this.material = material;
    this.uniforms = uniforms;
    for (let cz = 0; cz < NCH; cz++)
      for (let cx = 0; cx < NCH; cx++) {
        const c = new Chunk(cx, cz, material);
        this.chunks.push(c);
        this.group.add(c.mesh);
      }
    const shape = new THREE.Shape([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new THREE.Vector2(x * WORLD_SIZE * 6, y * WORLD_SIZE * 6)));
    shape.holes.push(new THREE.Path([[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([x, y]) => new THREE.Vector2(x * (HALF - 0.5), y * (HALF - 0.5)))));
    const ring = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.outer = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ color: '#aab49e', roughness: 1 }));
    this.outer.position.y = -0.6;
    this.outer.receiveShadow = true;
    this.outer.userData.noPick = true;
    this.group.add(this.outer);
    this.computeSdf();
    store.subscribe((c) => {
      if (c.type === 'terrain') { this.recompute(c.rect, true, false); this.scheduleBaseDeps(); }
      else if (c.type === 'splat') this.recompute(c.rect, false, true);
      else if (c.type === 'boundary') this.computeSdf();
      else if (c.type === 'doc') this.reload();
      else if (c.type === 'collection') {
        const ps = this.providers.filter((p) => p.keys.includes(c.key));
        if (ps.length) this.refreshFeatures(ps);
      }
    });
  }

  private baseTimer = 0;
  /** Features derived from the base terrain (roads, streams, terraces) re-profile after sculpting settles. */
  private scheduleBaseDeps() {
    clearTimeout(this.baseTimer);
    this.baseTimer = window.setTimeout(() => this.refreshFeatures(this.providers), 700);
  }

  addProvider(p: FeatureProvider) {
    this.providers.push(p);
    this.refreshFeatures([p]);
  }

  /** Re-derive features from providers; recompute only areas whose features changed. */
  private refreshFeatures(ps: FeatureProvider[]) {
    let dirty: Rect | null = null;
    const prefixKeys = new Set(ps.flatMap((p) => p.keys));
    const next = new Map<string, TerrainFeature>();
    for (const p of ps) for (const f of p.features(this.store.doc)) next.set(f.key, f);
    for (const [k, old] of this.features) {
      if (!prefixKeys.has(k.split(':')[0] as never)) continue;
      const nf = next.get(k);
      if (!nf || nf.sig !== old.sig) dirty = unionRect(dirty, boxToRect(old.box, 2));
      if (!nf) this.features.delete(k);
    }
    for (const [k, nf] of next) {
      const old = this.features.get(k);
      if (!old || old.sig !== nf.sig) dirty = unionRect(dirty, boxToRect(nf.box, 2));
      this.features.set(k, nf);
    }
    if (dirty) this.recompute(dirty, true, true);
  }

  /** Recompute final heights / splat in rect = base + features. */
  recompute(r: Rect, heights: boolean, splat: boolean) {
    const doc = this.store.doc;
    const feats = [...this.features.values()].sort((a, b) => a.order - b.order);
    if (heights) {
      for (let z = r.z0; z <= r.z1; z++) {
        const o = z * VERTS;
        this.final.set(doc.heights.subarray(o + r.x0, o + r.x1 + 1), o + r.x0);
      }
      for (const f of feats) {
        if (!f.heights) continue;
        const fr = intersectRect(boxToRect(f.box, 1), r);
        if (fr) f.heights(this.final, fr);
      }
      this.markDirty(r);
      for (const fn of this.onHeightsChanged) fn(r);
    }
    if (splat) {
      const cr = { x0: Math.max(0, r.x0), z0: Math.max(0, r.z0), x1: Math.min(GRID - 1, r.x1), z1: Math.min(GRID - 1, r.z1) };
      for (let p = 0; p < 3; p++)
        for (let z = cr.z0; z <= cr.z1; z++) {
          const o = p * PLANE + (z * GRID) * 4;
          this.finalSplat.set(doc.splat.subarray(o + cr.x0 * 4, o + (cr.x1 + 1) * 4), o + cr.x0 * 4);
        }
      for (const f of feats) {
        if (!f.splat) continue;
        const fr = intersectRect(boxToRect(f.box, 1), cr);
        if (fr) f.splat(this.finalSplat, fr);
      }
      this.splatDirty = true;
    }
  }

  private reload() {
    this.final = this.store.doc.heights.slice();
    this.finalSplat = this.store.doc.splat.slice();
    this.uniforms.uSplat0.value.dispose(); this.uniforms.uSplat1.value.dispose(); this.uniforms.uSplat2.value.dispose();
    this.uniforms.uSplat0.value = makeSplatTexture(this.finalSplat.subarray(0, PLANE));
    this.uniforms.uSplat1.value = makeSplatTexture(this.finalSplat.subarray(PLANE, 2 * PLANE));
    this.uniforms.uSplat2.value = makeSplatTexture(this.finalSplat.subarray(2 * PLANE, 3 * PLANE));
    this.features.clear();
    const all: Rect = { x0: 0, z0: 0, x1: GRID, z1: GRID };
    for (const p of this.providers) for (const f of p.features(this.store.doc)) this.features.set(f.key, f);
    this.recompute(all, true, true);
    this.computeSdf();
  }

  markDirty(r: Rect) {
    const cx0 = Math.max(0, Math.floor((r.x0 - 1) / CHUNK)), cx1 = Math.min(NCH - 1, Math.floor((r.x1 + 1) / CHUNK));
    const cz0 = Math.max(0, Math.floor((r.z0 - 1) / CHUNK)), cz1 = Math.min(NCH - 1, Math.floor((r.z1 + 1) / CHUNK));
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) this.chunks[z * NCH + x].dirty = true;
  }

  computeSdf() {
    const b = this.store.doc.boundary;
    const cell = WORLD_SIZE / SDF_RES;
    for (let j = 0; j < SDF_RES; j++)
      for (let i = 0; i < SDF_RES; i++) {
        const x = -HALF + (i + 0.5) * cell, z = -HALF + (j + 0.5) * cell;
        let d = b.length > 2 ? distToPolyline(x, z, b, true) : 9999;
        if (b.length > 2 && pointInPolygon(x, z, b)) d = -d;
        this.sdfData[j * SDF_RES + i] = Math.max(0, Math.min(255, Math.round(((d + 20) / 200) * 255)));
      }
    this.sdfTex.needsUpdate = true;
  }

  update(camera: THREE.Camera) {
    const cp = camera.position;
    let budget = 24;
    for (const c of this.chunks) {
      const cxw = (c.cx + 0.5) * CHUNK - HALF, czw = (c.cz + 0.5) * CHUNK - HALF;
      const d = Math.hypot(cp.x - cxw, cp.z - czw, Math.max(0, cp.y - 30) * 0.5);
      const want = !this.lodEnabled ? 0 : d < 200 ? 0 : d < 380 ? 1 : d < 650 ? 2 : 3;
      if (c.dirty || c.lod !== want) {
        if (budget <= 0 && c.lod >= 0) continue;
        c.build(this.final, want);
        budget--;
      }
    }
    if (this.splatDirty) {
      this.uniforms.uSplat0.value.needsUpdate = true;
      this.uniforms.uSplat1.value.needsUpdate = true;
      this.uniforms.uSplat2.value.needsUpdate = true;
      this.splatDirty = false;
    }
  }

  buildAll(camera?: THREE.Camera) {
    for (const c of this.chunks) if (c.dirty || c.lod < 0) c.build(this.final, Math.max(0, c.lod));
    if (camera) this.update(camera);
  }

  heightAt(x: number, z: number) { return heightAt(this.final, x, z); }
  baseHeightAt(x: number, z: number) { return heightAt(this.store.doc.heights, x, z); }

  raycast(ray: THREE.Ray): THREE.Vector3 | null {
    return raycastTerrain(this.final, ray);
  }

  setBrush(x: number, z: number, r: number, visible: boolean, color?: string) {
    this.uniforms.uBrush.value.set(x, z, r, visible ? 1 : 0);
    if (color) this.uniforms.uBrushColor.value.set(color);
  }
}

export { rectsIntersect };
