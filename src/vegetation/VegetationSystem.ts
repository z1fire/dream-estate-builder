import * as THREE from 'three';
import type { App, System } from '../app/App';
import { Quality } from '../app/quality';
import { catalogItem, type CatalogItem } from '../catalog/catalog';
import { meshParts } from '../catalog/loader';
import type { Rect } from '../core/store';
import { HALF, type Season } from '../core/types';

const CELL = 64;
const NC = Math.ceil(1024 / CELL);
export const VEG_STRIDE = 5; // x, z, scale, rotY, tint

export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

export function isTreeItem(c: CatalogItem | undefined) { return !!c && c.category === 'trees'; }
export function isEvergreen(c: CatalogItem | undefined) { return !!c && /pine|fir|spruce/.test(c.id); }

/** Patch a material with gentle wind sway (top of the model moves more). */
function addWind(mat: THREE.Material, strength: number, height: number) {
  const m = mat as THREE.MeshStandardMaterial;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float hf = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0);
  float ph = ip.x * 0.21 + ip.z * 0.17;
  transformed.x += sin(uTime * 1.3 + ph) * ${strength.toFixed(3)} * hf * hf * uWind;
  transformed.z += cos(uTime * 1.1 + ph * 1.3) * ${(strength * 0.7).toFixed(3)} * hf * hf * uWind;`);
  };
  m.customProgramCacheKey = () => `wind-${strength}-${height}`;
}

interface KindAssets { parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[]; item: CatalogItem; origColors: Map<THREE.Material, THREE.Color> }

/** Renders doc.vegetation as InstancedMeshes bucketed into 64 m cells (frustum + distance culled). */
export class VegetationSystem implements System {
  group = new THREE.Group();
  private assets = new Map<string, Promise<KindAssets | null>>();
  private cells = new Map<string, THREE.Group>(); // `${kind}|${cell}`
  private dirtyKinds = new Set<string>();
  private dirtyRect: Rect | null = null;
  private cullTimer = 0;

  constructor(private app: App) {
    this.group.name = 'vegetation';
    app.store.subscribe((c) => {
      if (c.type === 'doc') { this.clearAll(); for (const k of Object.keys(app.store.doc.vegetation)) this.dirtyKinds.add(k); }
      else if (c.type === 'vegetation') for (const k of c.kinds ?? Object.keys(app.store.doc.vegetation)) this.dirtyKinds.add(k);
      else if (c.type === 'settings') this.applySeason(app.env.season);
    });
    app.terrain.onHeightsChanged.push((r) => { this.dirtyRect = this.dirtyRect ? union(this.dirtyRect, r) : { ...r }; });
    for (const k of Object.keys(app.store.doc.vegetation)) this.dirtyKinds.add(k);
    const prev = app.env.onSeason;
    app.env.onSeason = (s) => { prev(s); this.applySeason(s); };
  }

  private load(kind: string): Promise<KindAssets | null> {
    if (!this.assets.has(kind)) {
      const item = catalogItem(kind);
      if (!item) { this.assets.set(kind, Promise.resolve(null)); return this.assets.get(kind)!; }
      this.assets.set(kind, meshParts(item.model).then((parts) => {
        const origColors = new Map<THREE.Material, THREE.Color>();
        const sway = item.category === 'trees' ? 0.12 : item.category === 'rocks' ? 0 : 0.06;
        const out = parts.map((p) => {
          const mat = (p.material as THREE.MeshStandardMaterial).clone();
          if (mat.color) origColors.set(mat, mat.color.clone());
          if (sway > 0) addWind(mat, sway * Math.max(1, item.height * 0.3), Math.max(0.5, item.height));
          return { geometry: p.geometry, material: mat };
        });
        const ka = { parts: out, item, origColors };
        this.tintAssets(ka, this.app.env.season);
        return ka;
      }).catch(() => null));
    }
    return this.assets.get(kind)!;
  }

  private tintAssets(ka: KindAssets, s: Season) {
    const ev = isEvergreen(ka.item);
    for (const [mat, orig] of ka.origColors) {
      const m = mat as THREE.MeshStandardMaterial;
      const leafy = orig.g > orig.r * 1.1 && orig.g > orig.b;
      m.color.copy(orig);
      if (!leafy || ka.item.category === 'rocks') { if (s === 'winter' && ka.item.category === 'rocks') m.color.lerp(new THREE.Color('#e8eef2'), 0.25); continue; }
      if (s === 'autumn' && !ev) m.color.setRGB(orig.r * 2.4 + 0.08, orig.g * 1.05, orig.b * 0.4);
      else if (s === 'winter') m.color.lerp(new THREE.Color(ev ? '#dfe8e8' : '#8a7a62'), ev ? 0.35 : 0.75);
      else if (s === 'spring') m.color.setRGB(orig.r * 1.05, orig.g * 1.15, orig.b * 0.9);
    }
  }
  private applySeason(s: Season) {
    for (const p of this.assets.values()) void p.then((ka) => { if (ka) this.tintAssets(ka, s); });
  }

  private clearAll() {
    for (const g of this.cells.values()) { this.group.remove(g); g.children.forEach((c) => (c as THREE.InstancedMesh).dispose()); }
    this.cells.clear();
  }

  private chains = new Map<string, Promise<void>>();
  /** Serialise rebuilds per kind so concurrent async rebuilds never duplicate cells. */
  private rebuildKind(kind: string, onlyCells?: Set<number>) {
    const prev = this.chains.get(kind) ?? Promise.resolve();
    const next = prev.then(() => this.doRebuild(kind, onlyCells)).catch((e) => console.warn('vegetation rebuild failed', e));
    this.chains.set(kind, next);
    return next;
  }
  /** resolves when all pending rebuilds are done (tests/screenshots) */
  async settled() { await Promise.all(this.chains.values()); }

  private async doRebuild(kind: string, onlyCells?: Set<number>) {
    const ka = await this.load(kind);
    const data = this.app.store.doc.vegetation[kind] ?? [];
    // bucket indices by cell
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < data.length; i += VEG_STRIDE) {
      const cx = Math.floor((data[i] + HALF) / CELL), cz = Math.floor((data[i + 1] + HALF) / CELL);
      const c = Math.max(0, Math.min(NC - 1, cz)) * NC + Math.max(0, Math.min(NC - 1, cx));
      if (onlyCells && !onlyCells.has(c)) continue;
      let b = buckets.get(c);
      if (!b) buckets.set(c, (b = []));
      b.push(i);
    }
    // remove stale cells
    for (const [key, g] of this.cells) {
      const [k, cs] = key.split('|');
      if (k !== kind) continue;
      const c = Number(cs);
      if (onlyCells && !onlyCells.has(c)) continue;
      this.group.remove(g);
      g.children.forEach((m) => (m as THREE.InstancedMesh).dispose());
      this.cells.delete(key);
    }
    if (!ka) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const sink = ka.item.category === 'rocks' ? 0.15 : 0.05;
    for (const [c, idxs] of buckets) {
      const g = new THREE.Group();
      g.userData.cell = c;
      g.userData.small = ka.item.category === 'flowers' || ka.item.category === 'shrubs' && ka.item.height < 1;
      for (const part of ka.parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, idxs.length);
        idxs.forEach((i, n) => {
          const x = data[i], z = data[i + 1];
          p.set(x, this.app.terrain.heightAt(x, z) - sink * data[i + 2], z);
          q.setFromAxisAngle(up, data[i + 3]);
          s.setScalar(data[i + 2]);
          im.setMatrixAt(n, m.compose(p, q, s));
          const t = data[i + 4];
          col.setRGB(1 + t * 0.12, 1 + t * 0.06, 1 - t * 0.04);
          im.setColorAt(n, col);
        });
        im.castShadow = ka.item.category !== 'flowers' && ka.item.height > 0.5;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.userData.noPick = true;
        g.add(im);
      }
      this.cells.set(`${kind}|${c}`, g);
      this.group.add(g);
    }
  }

  update(_dt: number, t: number) {
    windUniforms.uTime.value = t;
    windUniforms.uWind.value = this.app.env.weather === 'rain' ? 2.2 : this.app.env.weather === 'overcast' ? 1.4 : 1;
    if (this.dirtyKinds.size) {
      const ks = [...this.dirtyKinds];
      this.dirtyKinds.clear();
      for (const k of ks) void this.rebuildKind(k);
    }
    if (this.dirtyRect) {
      const r = this.dirtyRect;
      this.dirtyRect = null;
      const cells = new Set<number>();
      for (let cz = Math.floor((r.z0 - 2) / CELL); cz <= Math.floor((r.z1 + 2) / CELL); cz++)
        for (let cx = Math.floor((r.x0 - 2) / CELL); cx <= Math.floor((r.x1 + 2) / CELL); cx++)
          if (cx >= 0 && cz >= 0 && cx < NC && cz < NC) cells.add(cz * NC + cx);
      for (const k of Object.keys(this.app.store.doc.vegetation)) void this.rebuildKind(k, cells);
    }
    this.cullTimer -= _dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.25;
      const cam = this.app.rig.camera.position;
      const far = Quality[this.app.quality].vegDistance;
      for (const g of this.cells.values()) {
        const c = g.userData.cell as number;
        const cx = (c % NC + 0.5) * CELL - HALF, cz = (Math.floor(c / NC) + 0.5) * CELL - HALF;
        const d = Math.hypot(cam.x - cx, cam.z - cz) - CELL * 0.7;
        g.visible = d < (g.userData.small ? far * 0.4 : far) || this.app.rig.mode === 'plan';
      }
    }
  }

  /** Count instances by tree / other (for stats). */
  isTreeKind = (k: string) => isTreeItem(catalogItem(k));
}

function union(a: Rect, b: Rect): Rect {
  return { x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1) };
}
