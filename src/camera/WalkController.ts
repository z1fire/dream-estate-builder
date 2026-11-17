import * as THREE from 'three';
import { instantiate } from '../catalog/loader';
import { Tool } from '../editing/Tool';
import { h, hint, section, toast } from '../ui/dom';

const EYE = 1.65, HORSE_EYE = 2.55, RADIUS = 0.35, STEP = 0.55, GRAVITY = 18;

/**
 * First-person walking: WASD + mouse look (pointer lock), gravity, terrain following, collision with walls,
 * stepping up stairs, walking through open doors and over bridges/drawbridges. H toggles horseback.
 */
export class WalkController extends Tool {
  id = 'walk';
  name = 'Walk';
  usesLeft = true;
  hint = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · mouse look · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>H</kbd> horseback · <kbd>E</kbd> drawbridge/portcullis · <kbd>Esc</kbd> exit';
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private vel = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private grounded = false;
  private horse = false;
  private horseObj: THREE.Object3D | null = null;
  private horseMixer: THREE.AnimationMixer | null = null;
  private horseActs: Record<string, THREE.AnimationAction> = {};
  private colliders: THREE.Object3D[] = [];
  private colTimer = 0;
  private ray = new THREE.Raycaster();
  private saved: { pos: THREE.Vector3; tgt: THREE.Vector3; mode: string } | null = null;
  private onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouse = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.app.renderer.domElement) return;
    this.yaw -= e.movementX * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0022));
  };
  private onLockChange = () => {
    const locked = document.pointerLockElement === this.app.renderer.domElement;
    this.app.status(locked ? this.hint : 'Click the view to look around · <kbd>Esc</kbd> again to leave walk mode');
  };
  private onClick = () => { if (this.app.walking && document.pointerLockElement !== this.app.renderer.domElement) this.lock(); };
  /** Pointer lock can be refused (e.g. no user gesture / headless) — that's fine, keys still work. */
  private lock() {
    try {
      const p = this.app.renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* ignore */ }
  }

  activate() {
    const app = this.app;
    this.saved = { pos: app.rig.persp.position.clone(), tgt: app.rig.orbit.target.clone(), mode: app.rig.mode };
    // start at the orbit focus point (or keep looking the same way)
    const t = app.rig.target.clone();
    const dir = t.clone().sub(app.rig.persp.position).setY(0).normalize();
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = 0;
    this.pos.set(t.x, app.terrain.heightAt(t.x, t.z), t.z);
    const spawn = this.findFloor(this.pos.x, this.pos.z, this.pos.y + 40);
    if (spawn !== null) this.pos.y = spawn;
    if (app.water?.isWater(this.pos.x, this.pos.z)) this.pos.x += 6;
    this.vel.set(0, 0, 0);
    app.rig.setMode('walk');
    app.rig.orbit.enabled = false;
    app.walking = true;
    document.body.classList.add('walking');
    app.selection.clear();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouse);
    document.addEventListener('pointerlockchange', this.onLockChange);
    app.renderer.domElement.addEventListener('click', this.onClick);
    this.lock();
    this.refreshColliders();
    toast('Walk mode — WASD to move, mouse to look, H to ride a horse, Esc to leave');
  }

  deactivate() {
    const app = this.app;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouse);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    app.renderer.domElement.removeEventListener('click', this.onClick);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.keys.clear();
    app.walking = false;
    document.body.classList.remove('walking');
    this.setHorse(false);
    app.rig.mode = 'orbit';
    app.rig.orbit.enabled = true;
    if (this.saved) {
      // leave the orbit camera looking at where you walked to
      const look = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      app.rig.orbit.target.copy(this.pos).addScaledVector(look, 6);
      app.rig.persp.position.copy(this.pos).addScaledVector(look, -22).setY(this.pos.y + 16);
    }
    app.rig.persp.up.set(0, 1, 0);
  }

  private keyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    this.keys.add(e.code);
    if (e.code === 'Space' && this.grounded) { this.vel.y = this.horse ? 6 : 5.2; this.grounded = false; e.preventDefault(); }
    if (e.code === 'KeyH') this.setHorse(!this.horse);
    if (e.code === 'KeyE') this.interact();
    if (e.code === 'Escape' && !document.pointerLockElement) this.app.ui.setMode('select');
  }
  key(e: KeyboardEvent) { if (e.code === 'Escape' && !document.pointerLockElement) { this.app.ui.setMode('select'); return true; } return true; }

  /** E near a gatehouse toggles its drawbridge & portcullis. */
  private interact() {
    const g = this.app.store.doc.buildings.filter((b) => b.kind === 'gatehouse').map((b) => ({ b, d: Math.hypot(b.pos[0] - this.pos.x, b.pos[2] - this.pos.z) })).sort((a, c) => a.d - c.d)[0];
    if (!g || g.d > 30) { toast('Nothing to operate here'); return; }
    const before = structuredClone(g.b), after = structuredClone(g.b);
    const open = !(g.b.extra.drawbridgeOpen && g.b.extra.portcullisOpen);
    after.extra.drawbridgeOpen = open; after.extra.portcullisOpen = open;
    const store = this.app.store;
    this.app.cmd.run({
      label: open ? 'Open gate' : 'Close gate',
      do() { const i = store.doc.buildings.findIndex((b) => b.id === after.id); store.doc.buildings[i] = structuredClone(after); store.notify({ type: 'collection', key: 'buildings', ids: [after.id] }); },
      undo() { const i = store.doc.buildings.findIndex((b) => b.id === before.id); store.doc.buildings[i] = structuredClone(before); store.notify({ type: 'collection', key: 'buildings', ids: [before.id] }); },
    });
    toast(open ? 'The drawbridge lowers and the portcullis rises…' : 'The drawbridge rises and the portcullis drops!');
  }

  private setHorse(on: boolean) {
    this.horse = on;
    if (!on) { if (this.horseObj) { this.app.scene.remove(this.horseObj); } return; }
    if (this.horseObj) { this.app.scene.add(this.horseObj); return; }
    void instantiate('models/animals/horse.glb').then(({ object, animations }) => {
      this.horseObj = object;
      object.traverse((o) => { o.userData.noPick = true; (o as THREE.Mesh).frustumCulled = false; });
      this.horseMixer = new THREE.AnimationMixer(object);
      for (const [k, re] of [['idle', /(^|\|)Idle$/], ['walk', /(^|\|)Walk$/], ['run', /(^|\|)Gallop$/]] as [string, RegExp][]) {
        const c = animations.find((a) => re.test(a.name));
        if (c) this.horseActs[k] = this.horseMixer.clipAction(c);
      }
      this.horseActs.idle?.play();
      if (this.horse) this.app.scene.add(object);
    });
    toast(on ? 'Mounted — gallop with Shift' : 'Dismounted');
  }

  /** Collision candidates near the player: buildings, walls, fences, bridges, props. */
  private refreshColliders() {
    const names = ['buildings', 'curtain-walls', 'fences', 'retaining', 'paths', 'props'];
    const out: THREE.Object3D[] = [];
    const p = this.pos;
    for (const n of names) {
      const g = this.app.scene.getObjectByName(n);
      if (!g || !g.visible) continue;
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || !isVisible(m)) return;
        if (m.userData.role === 'glass') return;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const s = m.geometry.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
        if (s.center.distanceTo(p) - s.radius > 40) return;
        const geo = m.geometry as THREE.BufferGeometry & { boundsTree?: unknown; computeBoundsTree?: () => void };
        if (!geo.boundsTree && geo.computeBoundsTree && geo.index) geo.computeBoundsTree();
        out.push(m);
      });
    }
    this.colliders = out;
  }

  /** Highest walkable surface at (x,z) below `fromY` (terrain or a mesh floor/step/bridge). */
  private findFloor(x: number, z: number, fromY: number): number | null {
    const t = this.app.terrain.heightAt(x, z);
    this.ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    this.ray.far = fromY - t + 0.5;
    const hits = this.ray.intersectObjects(this.colliders, false);
    for (const hgt of hits) if (hgt.face && hgt.face.normal.clone().transformDirection(hgt.object.matrixWorld).y > 0.5) return Math.max(t, hgt.point.y);
    return t;
  }

  private blocked(from: THREE.Vector3, dir: THREE.Vector3, dist: number): THREE.Vector3 | null {
    for (const hgt of [0.7, 1.35]) {
      this.ray.set(from.clone().setY(from.y + hgt), dir);
      this.ray.far = dist + RADIUS;
      const hit = this.ray.intersectObjects(this.colliders, false)[0];
      if (hit && hit.face) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (Math.abs(n.y) < 0.6) return n.setY(0).normalize();
      }
    }
    return null;
  }

  private lastT = 0;
  /** Sub-step with real elapsed time so walking speed doesn't depend on frame rate (slow GPUs). */
  update(_dt: number) {
    if (!this.app.walking) return;
    const now = performance.now() / 1000;
    let real = this.lastT ? Math.min(1, now - this.lastT) : 1 / 60;
    this.lastT = now;
    while (real > 1e-4) { const d = Math.min(0.05, real); this.step(d); real -= d; }
  }

  private step(dt: number) {
    this.colTimer -= dt;
    if (this.colTimer <= 0) { this.colTimer = 0.4; this.refreshColliders(); }
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = (this.horse ? (run ? 13 : 5) : run ? 6.5 : 3.2);
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = f.multiplyScalar(fwd).add(r.multiplyScalar(side));
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    // horizontal move with sliding collision
    const step = wish.clone().multiplyScalar(dt);
    let len = step.length();
    if (len > 0) {
      let dir = step.clone().normalize();
      for (let i = 0; i < 2 && len > 1e-4; i++) {
        const n = this.blocked(this.pos, dir, len);
        if (!n) break;
        // slide along the wall
        const slide = dir.clone().sub(n.clone().multiplyScalar(dir.dot(n)));
        if (slide.lengthSq() < 1e-4) { len = 0; break; }
        len *= slide.length();
        dir = slide.normalize();
      }
      const next = this.pos.clone().addScaledVector(dir, len);
      // don't walk into deep water (bridges/drawbridges are meshes, so they count as floor)
      const floor = this.findFloor(next.x, next.z, this.pos.y + STEP + (this.horse ? 0.5 : 0));
      const wl = this.app.water?.surfaceAt(next.x, next.z);
      const deep = wl !== null && wl !== undefined && floor !== null && wl - floor > 0.9 && floor < wl;
      if (!deep && floor !== null && floor <= this.pos.y + STEP + 0.01) this.pos.copy(next);
    }
    // vertical
    const floor = this.findFloor(this.pos.x, this.pos.z, this.pos.y + STEP) ?? this.app.terrain.heightAt(this.pos.x, this.pos.z);
    this.vel.y -= GRAVITY * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= floor) {
      // step up smoothly onto stairs
      this.pos.y = this.pos.y < floor - 0.05 && floor - this.pos.y < STEP ? THREE.MathUtils.lerp(this.pos.y, floor, Math.min(1, dt * 18)) : floor;
      if (this.pos.y < floor - STEP) this.pos.y = floor;
      this.vel.y = 0;
      this.grounded = true;
    } else this.grounded = this.pos.y - floor < 0.05;
    const bob = this.grounded && wish.lengthSq() > 0 ? Math.sin(performance.now() / (this.horse ? 120 : 160)) * (this.horse ? 0.06 : 0.035) : 0;
    const eye = (this.horse ? HORSE_EYE : EYE) + bob;
    const cam = this.app.rig.persp;
    cam.position.set(this.pos.x, this.pos.y + eye, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (this.horse && this.horseObj) {
      this.horseObj.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.horseObj.rotation.y = this.yaw + Math.PI;
      const want = wish.lengthSq() === 0 ? 'idle' : run ? 'run' : 'walk';
      for (const [n, a] of Object.entries(this.horseActs)) {
        if (n === want && !a.isRunning()) a.reset().fadeIn(0.2).play();
        else if (n !== want && a.isRunning()) a.fadeOut(0.2);
      }
      this.horseMixer?.update(dt);
    }
    this.app.cursor.copy(this.pos);
  }

  panel() {
    return h('div', {}, section('Walking', hint(this.hint)));
  }
}

function isVisible(o: THREE.Object3D | null) {
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}
