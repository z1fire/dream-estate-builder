import * as THREE from 'three';
import type { App, System } from '../app/App';
import type { PropsSystem } from '../catalog/PropsSystem';
import type { BuildingSystem } from '../buildings/BuildingSystem';
import { footprint, levelBase, levelInset } from '../buildings/footprint';
import type { BuildingDef, FloorDef, InteriorWall, V2Like } from './types';
import { buildingToWorld, worldToBuilding } from '../editing/transform';
import { h, toast } from '../ui/dom';
import { ICONS } from '../ui/icons';

export function levelName(level: number) {
  if (level < 0) return level === -1 ? 'Cellar' : `Cellar ${-level}`;
  if (level === 0) return 'Ground';
  return ['1st', '2nd', '3rd'][level - 1] ? `${['1st', '2nd', '3rd'][level - 1]} floor` : `${level}th floor`;
}

/** Wall segments of a floor (building-local): exterior inner faces + interior walls, for snapping/openings. */
export function floorWalls(b: BuildingDef, f: FloorDef): { id: string; a: V2Like; b: V2Like; t: number; ext: boolean }[] {
  const out: { id: string; a: V2Like; b: V2Like; t: number; ext: boolean }[] = [];
  const c = footprint(b, b.wallThickness / 2 + levelInset(b, f.level));
  c.forEach((p, i) => out.push({ id: `ext:${i}`, a: p, b: c[(i + 1) % c.length], t: b.wallThickness, ext: true }));
  for (const w of f.walls) out.push({ id: w.id, a: w.a, b: w.b, t: w.thickness, ext: false });
  return out;
}

/** Nearest wall to a local point: returns wall, param t (0..1), distance and the inward normal toward the point. */
export function nearestWall(b: BuildingDef, f: FloorDef, x: number, z: number, maxD = 1.5) {
  let best: { w: ReturnType<typeof floorWalls>[number]; t: number; d: number; n: [number, number]; L: number } | null = null;
  for (const w of floorWalls(b, f)) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
    const L2 = dx * dx + dz * dz;
    if (L2 < 1e-4) continue;
    const t = Math.max(0, Math.min(1, ((x - w.a[0]) * dx + (z - w.a[1]) * dz) / L2));
    const px = w.a[0] + dx * t, pz = w.a[1] + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < maxD && (!best || d < best.d)) {
      const L = Math.sqrt(L2);
      let n: [number, number] = [-dz / L, dx / L];
      if ((x - px) * n[0] + (z - pz) * n[1] < 0) n = [-n[0], -n[1]];
      best = { w, t, d, n, L };
    }
  }
  return best;
}

/** Coordinates the "inside a building" experience: cutaway, floor selector, room labels, grid. */
export class InteriorSystem implements System {
  group = new THREE.Group();
  buildingId: string | null = null;
  level = 0;
  xray = false;
  private grid: THREE.LineSegments | null = null;
  private bar: HTMLElement;
  private savedCam: { pos: THREE.Vector3; tgt: THREE.Vector3 } | null = null;
  onChange: () => void = () => {};

  constructor(private app: App, private buildings: BuildingSystem, private props: PropsSystem) {
    this.group.name = 'interior-helpers';
    this.group.userData.noPick = true;
    this.bar = h('div', { id: 'floorbar', class: 'panel', style: 'display:none' });
    document.getElementById('app')!.appendChild(this.bar);
    props.visibility = (o) => {
      const c = this.buildings.cutaway;
      if (!c || !o.buildingId) return true;
      if (c.id !== '*' && c.id !== o.buildingId) return true;
      return (o.floor ?? 0) <= c.level;
    };
    app.store.subscribe((c) => {
      if (c.type === 'doc') this.exit(false);
      else if (c.type === 'collection' && c.key === 'buildings' && this.buildingId) {
        if (!this.building) this.exit(false);
        else { this.clampLevel(); this.refresh(); }
      }
    });
  }

  get building(): BuildingDef | undefined { return this.buildingId ? (this.app.store.get('buildings', this.buildingId) as BuildingDef | undefined) : undefined; }
  get floor(): FloorDef | undefined { return this.building?.floors.find((f) => f.level === this.level); }
  get levelY(): number { const b = this.building; return b ? b.pos[1] + levelBase(b, this.level) : 0; }

  enter(id: string, level?: number) {
    const b = this.app.store.get('buildings', id) as BuildingDef | undefined;
    if (!b) return;
    const firstEntry = this.buildingId === null;
    this.app.selection.clear();
    this.buildingId = id;
    this.level = level ?? (b.floors.some((f) => f.level === 0) ? 0 : b.floors[0].level);
    if (firstEntry) this.savedCam = { pos: this.app.rig.persp.position.clone(), tgt: this.app.rig.orbit.target.clone() };
    if (this.app.ui.mode.id !== 'interiors') this.app.ui.setMode('interiors');
    this.refresh();
    const size = Math.max(b.width, b.depth);
    const c = new THREE.Vector3(b.pos[0], this.levelY + 1, b.pos[2]);
    if (this.app.rig.mode === 'orbit') this.app.rig.flyTo(c.clone().add(new THREE.Vector3(size * 0.7, size * 1.25 + 6, size * 0.95)), c, 1.2);
    else this.app.rig.focus(c);
    toast(`Inside ${b.name} — ${levelName(this.level)}`);
  }

  exit(restoreCam = true) {
    if (!this.buildingId) return;
    this.buildingId = null;
    this.buildings.setCutaway(null);
    this.props.refreshVisibility();
    this.bar.style.display = 'none';
    this.app.labels.clearGroup('rooms');
    if (this.grid) { this.group.remove(this.grid); this.grid = null; }
    if (restoreCam && this.savedCam && this.app.rig.mode === 'orbit') this.app.rig.flyTo(this.savedCam.pos, this.savedCam.tgt, 1);
    this.savedCam = null;
    this.onChange();
  }

  setLevel(l: number) { this.level = l; this.clampLevel(); this.refresh(); }
  private clampLevel() {
    const b = this.building;
    if (!b) return;
    const lv = b.floors.map((f) => f.level);
    if (!lv.includes(this.level)) this.level = lv.reduce((a, c) => (Math.abs(c - this.level) < Math.abs(a - this.level) ? c : a), lv[0]);
  }

  refresh() {
    const b = this.building;
    if (!b) return;
    this.buildings.setCutaway({ id: b.id, level: this.level, xray: this.xray });
    this.props.refreshVisibility();
    this.renderBar(b);
    this.renderGrid(b);
    this.renderLabels(b);
    this.onChange();
  }

  private renderBar(b: BuildingDef) {
    this.bar.style.display = 'flex';
    this.bar.innerHTML = '';
    const levels = b.floors.map((f) => f.level).sort((a, c) => c - a);
    this.bar.append(h('span', { class: 't' }, b.name));
    for (const l of levels) {
      const btn = h('button', { class: l === this.level ? 'on' : '' }, levelName(l));
      btn.addEventListener('click', () => this.setLevel(l));
      this.bar.append(btn);
    }
    const xr = h('button', { class: this.xray ? 'on' : '', title: 'See-through walls' }, 'X-ray');
    xr.addEventListener('click', () => { this.xray = !this.xray; this.refresh(); });
    const ex = h('button', { title: 'Leave the building (Esc)', html: `${ICONS.close.replace('width="22" height="22"', 'width="14" height="14"')} Exit` });
    ex.addEventListener('click', () => { this.exit(); this.app.ui.setMode('select'); });
    this.bar.append(xr, ex);
  }

  private renderGrid(b: BuildingDef) {
    if (this.grid) { this.group.remove(this.grid); this.grid.geometry.dispose(); }
    const inner = footprint(b, b.wallThickness + levelInset(b, this.level));
    const xs = inner.map((p) => p[0]), zs = inner.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const pts: number[] = [];
    const y = levelBase(b, this.level) + 0.06;
    const step = 0.5;
    for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) pts.push(x, y, minZ, x, y, maxZ);
    for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) pts.push(minX, y, z, maxX, y, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false }));
    this.grid.position.set(b.pos[0], b.pos[1], b.pos[2]);
    this.grid.rotation.y = b.rotY;
    this.grid.visible = this.app.ui.mode.id === 'interiors';
    this.grid.userData.noPick = true;
    this.group.add(this.grid);
  }

  private renderLabels(b: BuildingDef) {
    const f = this.floor;
    if (!f) return;
    const y = levelBase(b, this.level) + 1.2;
    this.app.labels.setGroup('rooms', f.rooms.map((r) => ({
      text: `${r.name} · ${Math.round((r.rect[2] - r.rect[0]) * 3.28084)}×${Math.round((r.rect[3] - r.rect[1]) * 3.28084)} ft`,
      pos: buildingToWorld(b, new THREE.Vector3((r.rect[0] + r.rect[2]) / 2, y, (r.rect[1] + r.rect[3]) / 2)),
    })));
  }

  showGrid(v: boolean) { if (this.grid) this.grid.visible = v; }

  /** Ray → point on the current floor plane in building-local coords. */
  localHit(ray: THREE.Ray): { local: THREE.Vector3; world: THREE.Vector3 } | null {
    const b = this.building;
    if (!b) return null;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.levelY);
    const w = ray.intersectPlane(plane, new THREE.Vector3());
    if (!w) return null;
    return { world: w, local: worldToBuilding(b, w) };
  }

  update() {}
}

export type { InteriorWall };
