import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clamp } from '../core/math';

export type ViewMode = 'orbit' | 'plan' | 'walk';

interface Flight {
  fromPos: THREE.Vector3; fromTgt: THREE.Vector3; toPos: THREE.Vector3; toTgt: THREE.Vector3;
  t: number; dur: number; done?: () => void;
}

/** Owns the perspective + orthographic cameras and orbit/plan controls. Walk mode is driven by WalkController. */
export class CameraRig {
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  orbit: OrbitControls;
  plan: OrbitControls;
  mode: ViewMode = 'orbit';
  private flight: Flight | null = null;
  /** when true, left mouse is reserved for the active tool */
  private leftReserved = false;
  onModeChange: (m: ViewMode) => void = () => {};

  constructor(private dom: HTMLElement) {
    const aspect = dom.clientWidth / Math.max(1, dom.clientHeight);
    this.persp = new THREE.PerspectiveCamera(50, aspect, 0.2, 30000);
    this.persp.position.set(180, 160, 260);
    this.ortho = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 5000);
    this.ortho.position.set(0, 1500, 0);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(0, 0, 0);

    this.orbit = new OrbitControls(this.persp, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.minDistance = 2;
    this.orbit.maxDistance = 2200;
    this.orbit.screenSpacePanning = false;
    this.orbit.zoomToCursor = true;
    this.orbit.target.set(0, 0, 0);
    this.orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.orbit.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

    this.plan = new OrbitControls(this.ortho, dom);
    this.plan.enableRotate = false;
    this.plan.screenSpacePanning = true;
    this.plan.zoomToCursor = true;
    this.plan.minZoom = 0.2;
    this.plan.maxZoom = 60;
    this.plan.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.plan.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.plan.enabled = false;
    this.resize();
  }

  get camera(): THREE.Camera {
    return this.mode === 'plan' ? this.ortho : this.persp;
  }
  get target(): THREE.Vector3 {
    return this.mode === 'plan' ? this.plan.target : this.orbit.target;
  }

  /** Tools call this to take the left mouse button (camera keeps right/middle). */
  reserveLeft(on: boolean) {
    this.leftReserved = on;
    const none = -1 as unknown as THREE.MOUSE;
    this.orbit.mouseButtons.LEFT = on ? none : THREE.MOUSE.ROTATE;
    this.plan.mouseButtons.LEFT = on ? none : THREE.MOUSE.PAN;
    this.orbit.touches.ONE = on ? (-1 as unknown as THREE.TOUCH) : THREE.TOUCH.ROTATE;
  }
  get isLeftReserved() { return this.leftReserved; }

  setMode(m: ViewMode) {
    if (m === this.mode) return;
    const prev = this.mode;
    this.mode = m;
    this.orbit.enabled = m === 'orbit';
    this.plan.enabled = m === 'plan';
    if (m === 'plan' && prev === 'orbit') {
      const t = this.orbit.target;
      this.plan.target.set(t.x, 0, t.z);
      this.ortho.position.set(t.x, 1500, t.z);
      const dist = this.persp.position.distanceTo(t);
      this.ortho.zoom = clamp(400 / Math.max(20, dist), 0.2, 60);
      this.ortho.updateProjectionMatrix();
    } else if (m === 'orbit' && prev === 'plan') {
      const t = this.plan.target;
      const dist = 400 / this.ortho.zoom;
      this.orbit.target.set(t.x, this.orbit.target.y, t.z);
      this.persp.position.set(t.x + dist * 0.4, dist * 0.8, t.z + dist * 0.6);
    }
    this.onModeChange(m);
  }

  resize() {
    const w = this.dom.clientWidth, h = Math.max(1, this.dom.clientHeight);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    const half = 200;
    this.ortho.left = (-half * w) / h; this.ortho.right = (half * w) / h;
    this.ortho.top = half; this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }

  /** metres per CSS pixel at the focus point (for scale bar). */
  metresPerPixel(): number {
    if (this.mode === 'plan') return (this.ortho.right - this.ortho.left) / this.ortho.zoom / this.dom.clientWidth;
    const d = this.persp.position.distanceTo(this.orbit.target);
    return (2 * d * Math.tan((this.persp.fov * Math.PI) / 360)) / this.dom.clientHeight;
  }

  flyTo(pos: THREE.Vector3, tgt: THREE.Vector3, dur = 2, done?: () => void) {
    if (this.mode !== 'orbit') this.setMode('orbit');
    this.flight = { fromPos: this.persp.position.clone(), fromTgt: this.orbit.target.clone(), toPos: pos.clone(), toTgt: tgt.clone(), t: 0, dur, done };
  }
  /** Frame a point at a given viewing distance. */
  focus(p: THREE.Vector3, dist = 60) {
    if (this.mode === 'plan') {
      this.plan.target.set(p.x, 0, p.z);
      this.ortho.position.set(p.x, 1500, p.z);
      return;
    }
    const dir = this.persp.position.clone().sub(this.orbit.target).normalize();
    this.flyTo(p.clone().addScaledVector(dir, dist), p, 0.8);
  }
  get flying() { return !!this.flight; }
  cancelFlight() { this.flight = null; }

  update(dt: number) {
    if (this.flight) {
      const f = this.flight;
      f.t += dt / f.dur;
      const k = f.t >= 1 ? 1 : 0.5 - Math.cos(Math.PI * f.t) / 2;
      // arc upward mid-flight for long hops
      const lift = Math.sin(Math.PI * k) * Math.min(80, f.fromPos.distanceTo(f.toPos) * 0.15);
      this.persp.position.lerpVectors(f.fromPos, f.toPos, k).y += lift;
      this.orbit.target.lerpVectors(f.fromTgt, f.toTgt, k);
      if (f.t >= 1) { this.flight = null; f.done?.(); }
      this.persp.lookAt(this.orbit.target);
    }
    if (this.mode === 'orbit' && !this.flight) this.orbit.update(dt);
    if (this.mode === 'plan') this.plan.update(dt);
  }
}
