import * as THREE from 'three';
import type { App } from '../app/App';
import { Quality } from '../app/quality';

export interface LightSource { pos: THREE.Vector3; color: string; intensity: number; distance: number; interior?: boolean; flicker?: boolean }

/**
 * Many light sources (torches, candles, hearths…), few real lights: every 0.25 s the nearest sources to the
 * camera get a pooled PointLight. Brightness follows night-time; interiors stay softly lit during the day.
 */
export class LightManager {
  private sources = new Map<string, LightSource>();
  private pool: THREE.PointLight[] = [];
  private assigned: (LightSource | null)[] = [];
  private timer = 0;
  private group = new THREE.Group();

  constructor(private app: App) {
    this.group.name = 'lights';
    app.scene.add(this.group);
    this.resizePool();
    app.onFrame((dt, t) => this.update(dt, t));
  }

  private resizePool() {
    const n = Quality[this.app.quality].maxLights;
    while (this.pool.length < n) {
      const l = new THREE.PointLight('#ffaa55', 0, 10, 1.6);
      l.castShadow = false;
      this.pool.push(l);
      this.assigned.push(null);
      this.group.add(l);
    }
    while (this.pool.length > n) { const l = this.pool.pop()!; this.assigned.pop(); this.group.remove(l); }
  }

  set(id: string, s: LightSource | null) {
    if (s) this.sources.set(id, s); else this.sources.delete(id);
  }
  removePrefix(prefix: string) {
    for (const k of [...this.sources.keys()]) if (k.startsWith(prefix)) this.sources.delete(k);
  }
  get count() { return this.sources.size; }

  private update(dt: number, t: number) {
    const night = this.app.env.night;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.25;
      this.resizePool();
      const cam = this.app.rig.mode === 'walk' ? this.app.rig.camera.position : this.app.rig.target;
      const camPos = this.app.rig.camera.position;
      const list = [...this.sources.values()]
        .filter((s) => this.app.layerVisible.props || s.interior)
        .map((s) => ({ s, d: Math.min(s.pos.distanceToSquared(cam), s.pos.distanceToSquared(camPos)) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.pool.length);
      this.pool.forEach((l, i) => {
        const e = list[i];
        this.assigned[i] = e ? e.s : null;
        // lights stay "visible" (intensity 0 when unused) so the shader light count never changes → no recompiles
        if (!e) { l.intensity = 0; return; }
        l.position.copy(e.s.pos);
        l.color.set(e.s.color);
        l.distance = e.s.distance * 1.4;
      });
    }
    this.pool.forEach((l, i) => {
      const s = this.assigned[i];
      if (!s) return;
      // physically-based point lights need a boost to read well in stylised scenes; interiors glow a little by day too
      const k = (s.interior ? 0.6 + 1.6 * night : night * 1.6) * 2.5;
      const flick = s.flicker === false ? 1 : 0.88 + 0.12 * Math.sin(t * 9 + i * 1.7) * Math.sin(t * 5.3 + i);
      l.intensity = s.intensity * k * flick;
    });
  }
}
