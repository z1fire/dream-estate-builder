import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { CameraRig } from '../camera/CameraRig';
import { CommandStack } from '../core/commands';
import { Store } from '../core/store';
import type { EstateDoc, Layer } from '../core/types';
import { Environment } from '../environment/Environment';
import type { PickInfo, Tool, ToolEvent } from '../editing/Tool';
import { TerrainSystem } from '../terrain/TerrainSystem';
import { Quality, detectQuality, type QualityLevel } from './quality';
import type { Selection } from '../editing/Selection';
import type { Labels } from '../ui/Labels';
import type { UI } from '../ui/UI';
import type { WaterSystem } from '../water/WaterSystem';

THREE.Mesh.prototype.raycast = acceleratedRaycast;
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;

export interface System {
  group: THREE.Object3D;
  update?(dt: number, time: number): void;
}

/** Central application object: renderer, scene, document store, systems, tools and the frame loop. */
export class App {
  readonly viewport: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly env: Environment;
  readonly store: Store;
  readonly cmd: CommandStack;
  readonly terrain: TerrainSystem;
  readonly systems: System[] = [];
  readonly layers = new Map<Layer, THREE.Object3D[]>();
  readonly layerVisible: Record<Layer, boolean> = {
    terrain: true, vegetation: true, water: true, buildings: true, interiors: true, animals: true, paths: true, farming: true, props: true,
  };
  quality: QualityLevel;
  tool: Tool | null = null;
  private tools = new Map<string, Tool>();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private clock = new THREE.Clock();
  private elapsed = 0;
  private pointerDown = false;
  private frameHooks = new Set<(dt: number, t: number) => void>();
  /** last ground point under the cursor */
  readonly cursor = new THREE.Vector3();
  cursorValid = false;
  fps = 60;
  private fpsAcc = 0; private fpsFrames = 0;
  onToolChange: (t: Tool | null) => void = () => {};
  onCursor: () => void = () => {};
  onDocReplaced: () => void = () => {};
  /** set when the user is in first-person walk mode; tools are suspended */
  walking = false;
  /** assigned during bootstrap */
  selection!: Selection;
  labels!: Labels;
  ui!: UI;
  /** builds the viewpoints/tour popover (camera module) */
  viewpointsPanel?: (close: () => void) => HTMLElement;
  water?: WaterSystem;
  /** pick flat ground-level entities (paths, fields…) by proximity to the ground hit */
  readonly groundPickers: ((x: number, z: number) => { kind: string; id: string } | null)[] = [];
  /** predicates marking ground as occupied (buildings, roads, fields…) for scatter/animals */
  readonly blockers: ((x: number, z: number) => boolean)[] = [];
  isBlocked(x: number, z: number) { for (const b of this.blockers) if (b(x, z)) return true; return false; }
  /** whether a vegetation kind / catalog id counts as a tree (for stats) */
  isTreeKind?: (id: string) => boolean;
  /** kind -> world bounding box of an entity (for selection highlight / focus) */
  readonly boxResolvers = new Map<string, (id: string) => THREE.Box3 | null>();
  /** kind -> properties panel builder */
  readonly inspectors = new Map<string, (ids: string[]) => HTMLElement>();
  /** status-bar message setter (assigned by UI) */
  status: (msg: string) => void = () => {};

  constructor(root: HTMLElement, doc: EstateDoc) {
    this.viewport = document.createElement('div');
    this.viewport.id = 'viewport';
    this.viewport.tabIndex = 0;
    root.appendChild(this.viewport);
    this.quality = detectQuality();
    this.renderer = new THREE.WebGLRenderer({ antialias: Quality[this.quality].antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, Quality[this.quality].pixelRatio));
    this.renderer.shadowMap.enabled = Quality[this.quality].shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.viewport.appendChild(this.renderer.domElement);

    this.store = new Store(doc);
    this.cmd = new CommandStack(this.store);
    this.rig = new CameraRig(this.viewport);
    this.env = new Environment(this.scene);
    this.env.sun.shadow.mapSize.setScalar(Quality[this.quality].shadowMap);

    this.terrain = new TerrainSystem(this.store);
    this.scene.add(this.terrain.group);
    this.addToLayer('terrain', this.terrain.group);
    this.terrain.lodEnabled = true;

    this.store.subscribe((c) => {
      if (c.type === 'doc') { this.cmd.clear(); this.applySettings(); this.onDocReplaced(); }
    });
    this.applySettings();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  entityBox(kind: string, id: string): THREE.Box3 | null {
    return this.boxResolvers.get(kind)?.(id) ?? null;
  }

  // ---------- systems / layers ----------
  addSystem(s: System, layer?: Layer) {
    this.systems.push(s);
    this.scene.add(s.group);
    if (layer) this.addToLayer(layer, s.group);
    return s;
  }
  addToLayer(layer: Layer, obj: THREE.Object3D) {
    if (!this.layers.has(layer)) this.layers.set(layer, []);
    this.layers.get(layer)!.push(obj);
    obj.visible = this.layerVisible[layer];
  }
  setLayerVisible(layer: Layer, v: boolean) {
    this.layerVisible[layer] = v;
    for (const o of this.layers.get(layer) ?? []) o.visible = v;
  }
  onFrame(fn: (dt: number, t: number) => void) { this.frameHooks.add(fn); return () => this.frameHooks.delete(fn); }

  applySettings() {
    const s = this.store.doc.settings;
    this.env.setTime(s.timeOfDay);
    this.env.setWeather(s.weather);
    this.env.setSeason(s.season);
    this.terrain.uniforms.uGrid.value.x = s.gridSize;
  }

  // ---------- tools ----------
  registerTool(t: Tool) { this.tools.set(t.id, t); return t; }
  getTool<T extends Tool>(id: string) { return this.tools.get(id) as T | undefined; }
  setTool(id: string | null) {
    const next = id ? this.tools.get(id) ?? null : null;
    if (next === this.tool) return;
    this.tool?.deactivate();
    this.terrain.setBrush(0, 0, 0, false);
    this.tool = next;
    this.rig.reserveLeft(!!next?.usesLeft);
    next?.activate();
    this.onToolChange(next);
  }

  // ---------- picking ----------
  rayFromEvent(e: { clientX: number; clientY: number }): THREE.Ray {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    return this.raycaster.ray.clone();
  }
  groundAt(ray: THREE.Ray) { return this.terrain.raycast(ray); }

  /** Pick the nearest entity (objects tagged with userData.pick = {kind,id}). */
  pick(ray: THREE.Ray, filter?: (p: { kind: string; id: string }) => boolean): PickInfo | null {
    this.raycaster.ray.copy(ray);
    this.raycaster.far = 5000;
    const roots: THREE.Object3D[] = [];
    for (const s of this.systems) if (s.group.visible) roots.push(s.group);
    const hits = this.raycaster.intersectObjects(roots, true);
    const groundHit = this.groundAt(ray);
    const gd = groundHit ? groundHit.distanceTo(ray.origin) : Infinity;
    for (const h of hits) {
      if (h.distance > gd + 0.5) break;
      let o: THREE.Object3D | null = h.object;
      if (!isVisible(o)) continue;
      while (o && !o.userData.pick) o = o.parent;
      if (!o) continue;
      let p = o.userData.pick as { kind: string; id: string } | ((i: number) => { kind: string; id: string } | null);
      if (typeof p === 'function') {
        const r = p((h as { batchId?: number }).batchId ?? h.instanceId ?? -1);
        if (!r) continue;
        p = r;
      }
      if (filter && !filter(p)) continue;
      return { kind: p.kind, id: p.id, object: o, point: h.point, instanceId: h.instanceId };
    }
    if (groundHit) {
      for (const gp of this.groundPickers) {
        const r = gp(groundHit.x, groundHit.z);
        if (r && (!filter || filter(r))) return { kind: r.kind, id: r.id, object: this.terrain.group, point: groundHit };
      }
    }
    return null;
  }

  private makeEvent(e: PointerEvent): ToolEvent {
    const ray = this.rayFromEvent(e);
    const ground = this.groundAt(ray);
    const pick = this.tool?.wantsPick ? this.pick(ray) : undefined;
    return { e, ray, ground, pick };
  }

  private bindInput() {
    // listen on the viewport div: OrbitControls captures the pointer there, so pointerup targets it
    const el = this.viewport;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      this.viewport.focus();
      if (this.walking) return;
      if (e.button !== 0 || !this.tool) return;
      if (!this.tool.usesLeft && !this.tool.wantsPick) return;
      this.pointerDown = true;
      el.setPointerCapture(e.pointerId);
      this.tool.down(this.makeEvent(e));
    });
    el.addEventListener('pointermove', (e) => {
      if (this.walking) return;
      const ray = this.rayFromEvent(e);
      const g = this.groundAt(ray);
      this.cursorValid = !!g;
      if (g) this.cursor.copy(g);
      this.onCursor();
      if (this.tool) this.tool.move({ e, ray, ground: g });
    });
    el.addEventListener('pointerup', (e) => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      el.releasePointerCapture(e.pointerId);
      this.tool?.up(this.makeEvent(e));
    });
    el.addEventListener('dblclick', (e) => {
      if (this.walking || !this.tool) return;
      this.tool.dblclick(this.makeEvent(e as unknown as PointerEvent));
    });
  }

  get isPointerDown() { return this.pointerDown; }

  resize() {
    const w = this.viewport.clientWidth, h = this.viewport.clientHeight;
    this.renderer.setSize(w, h, false);
    this.rig.resize();
  }

  setQuality(q: QualityLevel) {
    this.quality = q;
    const Q = Quality[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
    this.renderer.shadowMap.enabled = Q.shadows;
    this.env.sun.shadow.mapSize.setScalar(Q.shadowMap);
    this.env.sun.shadow.map?.dispose();
    (this.env.sun.shadow as any).map = null;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    try { localStorage.setItem('deb.quality', q); } catch { /* ignore */ }
    this.resize();
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.elapsed += dt;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    this.rig.update(dt);
    const cam = this.rig.camera;
    this.tool?.update(dt);
    this.terrain.update(cam);
    for (const s of this.systems) s.update?.(dt, this.elapsed);
    for (const f of this.frameHooks) f(dt, this.elapsed);
    const focus = this.rig.mode === 'walk' ? cam.position : this.rig.target;
    this.env.shadowTarget.copy(focus);
    this.env.shadowSize = this.rig.mode === 'plan' ? 300 : Math.min(320, Math.max(60, this.rig.persp.position.distanceTo(this.rig.target) * 0.9));
    this.env.update(dt, cam);
    this.renderer.render(this.scene, cam);
  }

  get time() { return this.elapsed; }
}

function isVisible(o: THREE.Object3D | null): boolean {
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}
