import * as THREE from 'three';
import type { App } from '../app/App';
import { addEntities, removeEntities } from '../core/commands';
import { uid } from '../core/store';
import { GRID, HALF, VERTS, type Season, type Viewpoint } from '../core/types';
import { LAYER_COLORS } from '../terrain/groundTextures';
import { GROUND_LAYERS } from '../core/types';
import { footprint } from '../buildings/footprint';
import { h, hint, section, toast, button } from '../ui/dom';
import { ICONS } from '../ui/icons';

/** Day/night cycle, season & weather → terrain/water uniforms. */
export function linkEnvironment(app: App) {
  const tu = app.terrain.uniforms;
  const applySeason = (s: Season) => {
    tu.uSnow.value = s === 'winter' ? 0.9 : 0;
    const t = { spring: [1.0, 1.06, 0.92], summer: [1, 1, 1], autumn: [1.12, 0.96, 0.72], winter: [0.92, 0.92, 0.88] }[s];
    tu.uSeason.value.set(t[0], t[1], t[2]);
  };
  const prev = app.env.onSeason;
  app.env.onSeason = (s) => { prev(s); applySeason(s); };
  applySeason(app.env.season);
  let slider = 0;
  app.onFrame((dt) => {
    const st = app.store.doc.settings;
    if (st.dayCycle) {
      st.timeOfDay = (st.timeOfDay + dt * 0.1) % 24; // 24 h in 240 s
      app.env.setTime(st.timeOfDay);
      slider += dt;
      if (slider > 0.5) { slider = 0; (app.env as unknown as { timeSlider?: { set(v: number): void } }).timeSlider?.set(Math.round(st.timeOfDay * 4) / 4); }
    }
    tu.uWet.value += ((app.env.weather === 'rain' ? 1 : 0) - tu.uWet.value) * Math.min(1, dt * 0.5);
  });
}

/** Top-down minimap with buildings, water, paths and the camera; click to jump there. Plus a compass. */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private needle: HTMLElement;
  private dirty = true;
  private timer = 0;
  private S = 360;

  constructor(private app: App) {
    this.canvas = h('canvas', { width: this.S, height: this.S }) as HTMLCanvasElement;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.S;
    const wrap = h('div', { id: 'minimap', title: 'Minimap — click to fly there' }, this.canvas);
    this.needle = h('div', { class: 'needle', html: `<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="20" fill="none" stroke="#b89c6a" stroke-width="1"/><path d="M22 4 L27 22 L22 19 L17 22 Z" fill="#8c2f22"/><path d="M22 40 L27 22 L22 25 L17 22 Z" fill="#6b5638"/><text x="22" y="13" font-size="7" text-anchor="middle" fill="#fff" font-family="Cinzel" font-weight="700">N</text></svg>` });
    const compass = h('div', { id: 'compass', title: 'Compass' }, this.needle);
    document.getElementById('app')!.append(wrap, compass);
    wrap.addEventListener('click', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const u = (e.clientX - r.left) / r.width, w = (e.clientY - r.top) / r.height;
      const v = this.view();
      const p = new THREE.Vector3(v.cx + (u * 2 - 1) * v.half, 0, v.cz + (w * 2 - 1) * v.half);
      p.y = app.terrain.heightAt(p.x, p.z);
      app.rig.focus(p, 90);
    });
    app.store.subscribe(() => { this.dirty = true; });
    app.onFrame((dt) => this.update(dt));
  }

  /** Map frames the estate boundary (with margin). */
  private view() {
    const b = this.app.store.doc.boundary;
    if (b.length < 3) return { cx: 0, cz: 0, half: HALF };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of b) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, half: Math.max(maxX - minX, maxZ - minZ) * 0.6 + 10 };
  }

  private renderBase() {
    const S = this.S, g = this.base.getContext('2d')!;
    const img = g.createImageData(S, S);
    const v = this.view();
    const cols = GROUND_LAYERS.map((l) => new THREE.Color(LAYER_COLORS[l]));
    const sp = this.app.terrain.finalSplat, hf = this.app.terrain.final;
    const PLANE = GRID * GRID * 4;
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x = v.cx + ((i + 0.5) / S * 2 - 1) * v.half, z = v.cz + ((j + 0.5) / S * 2 - 1) * v.half;
        const cx = Math.max(0, Math.min(GRID - 1, Math.floor(x + HALF))), cz = Math.max(0, Math.min(GRID - 1, Math.floor(z + HALF)));
        let r = 0, gg = 0, bb = 0, tot = 0;
        for (let l = 0; l < 10; l++) { const w = sp[(l >> 2) * PLANE + (cz * GRID + cx) * 4 + (l & 3)]; if (w) { r += cols[l].r * w; gg += cols[l].g * w; bb += cols[l].b * w; tot += w; } }
        if (!tot) { r = cols[0].r; gg = cols[0].g; bb = cols[0].b; tot = 1; }
        // hillshade
        const vi = cz * VERTS + cx;
        const sh = 1 + Math.max(-0.25, Math.min(0.25, (hf[vi] - hf[Math.min(vi + VERTS + 1, hf.length - 1)]) * 0.18));
        const water = this.app.water?.isWater(x, z) ?? false;
        const o = (j * S + i) * 4;
        if (water) { img.data[o] = 70; img.data[o + 1] = 120; img.data[o + 2] = 150; }
        else { img.data[o] = Math.min(255, (r / tot) * 255 * sh * 1.05); img.data[o + 1] = Math.min(255, (gg / tot) * 255 * sh * 1.05); img.data[o + 2] = Math.min(255, (bb / tot) * 255 * sh * 1.05); }
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const P = (x: number, z: number): [number, number] => [((x - v.cx) / v.half * 0.5 + 0.5) * S, ((z - v.cz) / v.half * 0.5 + 0.5) * S];
    const doc = this.app.store.doc;
    // boundary
    g.strokeStyle = '#ff7a2a'; g.lineWidth = 2; g.setLineDash([6, 4]);
    g.beginPath(); doc.boundary.forEach(([x, z], i) => { const [a, b] = P(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath(); g.stroke(); g.setLineDash([]);
    // fences / walls
    g.strokeStyle = 'rgba(70,50,30,.8)'; g.lineWidth = 1;
    for (const f of doc.fences) { g.beginPath(); f.points.forEach(([x, z], i) => { const [a, b] = P(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); if (f.closed) g.closePath(); g.stroke(); }
    g.strokeStyle = '#6d6a64'; g.lineWidth = 3;
    for (const w of doc.walls) { g.beginPath(); w.points.forEach(([x, z], i) => { const [a, b] = P(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); if (w.closed) g.closePath(); g.stroke(); }
    // buildings
    for (const b of doc.buildings) {
      const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
      g.fillStyle = b.kind === 'keep' || b.kind.startsWith('tower') || b.kind === 'gatehouse' ? '#5d5a55' : '#8a4a36';
      g.beginPath();
      footprint(b).forEach(([x, z], i) => { const [a, bb2] = P(b.pos[0] + x * c + z * s, b.pos[2] - x * s + z * c); if (i) g.lineTo(a, bb2); else g.moveTo(a, bb2); });
      g.closePath(); g.fill();
    }
  }

  private update(dt: number) {
    this.timer -= dt;
    if (this.dirty && this.timer <= 0) { this.dirty = false; this.timer = 1.5; this.renderBase(); }
    const g = this.canvas.getContext('2d')!, S = this.S, v = this.view();
    g.drawImage(this.base, 0, 0);
    const cam = this.app.rig.camera.position;
    const tgt = this.app.rig.mode === 'walk' ? cam : this.app.rig.target;
    const P = (x: number, z: number): [number, number] => [((x - v.cx) / v.half * 0.5 + 0.5) * S, ((z - v.cz) / v.half * 0.5 + 0.5) * S];
    // animals as dots
    g.fillStyle = '#f4ead2';
    const ag = this.app.scene.getObjectByName('animals');
    ag?.children.forEach((c) => { if (!c.userData.pick) return; const [a, b] = P(c.position.x, c.position.z); g.fillRect(a - 1.5, b - 1.5, 3, 3); });
    // camera frustum wedge
    const dir = new THREE.Vector3();
    this.app.rig.camera.getWorldDirection(dir);
    const yaw = Math.atan2(dir.x, dir.z);
    const [px, pz] = P(this.app.rig.mode === 'plan' ? tgt.x : cam.x, this.app.rig.mode === 'plan' ? tgt.z : cam.z);
    g.fillStyle = 'rgba(255, 220, 120, .35)';
    g.beginPath(); g.moveTo(px, pz);
    g.arc(px, pz, 34, Math.PI / 2 - yaw - 0.45, Math.PI / 2 - yaw + 0.45);
    g.closePath(); g.fill();
    g.fillStyle = '#ffd25a'; g.strokeStyle = '#3a3530'; g.lineWidth = 2;
    g.beginPath(); g.arc(px, pz, 6, 0, Math.PI * 2); g.fill(); g.stroke();
    const [tx, tz] = P(tgt.x, tgt.z);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(tx, tz, 4, 0, Math.PI * 2); g.stroke();
    this.needle.style.transform = `rotate(${(yaw - Math.PI) * 180 / Math.PI}deg)`;
  }
}

/** Photo mode: hides the interface; save PNG. */
export class PhotoMode {
  private bar: HTMLElement;
  constructor(private app: App) {
    this.bar = h('div', { id: 'photobar', class: 'panel' },
      button(`${ICONS.download.replace('width="22" height="22"', 'width="16" height="16"')} Save PNG`, () => this.save(), 'primary'),
      button('Save 2× PNG', () => this.save(2), ''),
      button('Exit photo mode', () => this.toggle(false), ''));
    document.getElementById('app')!.appendChild(this.bar);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('photo')) this.toggle(false); });
  }
  toggle(on = !document.body.classList.contains('photo')) {
    document.body.classList.toggle('photo', on);
    if (on) toast('Photo mode — frame your shot (orbit / zoom), then Save PNG. Esc to exit.', 3500);
  }
  save(scale = 1) {
    const r = this.app.renderer;
    const pr = r.getPixelRatio();
    if (scale !== 1) { r.setPixelRatio(pr * scale); this.app.resize(); }
    this.bar.style.visibility = 'hidden';
    this.app.frame();
    r.domElement.toBlob((blob) => {
      if (scale !== 1) { r.setPixelRatio(pr); this.app.resize(); }
      this.bar.style.visibility = '';
      if (!blob) { toast('Could not capture the image'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${this.app.store.doc.name.replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Photo saved');
    }, 'image/png');
  }
}

/** Saved viewpoints and a guided tour that flies between them. */
export class Viewpoints {
  private touring = false;
  constructor(private app: App) {
    app.viewpointsPanel = (close) => this.panel(close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.touring) this.stopTour(); });
  }
  save(name?: string) {
    const r = this.app.rig;
    const v: Viewpoint = { id: uid('vp'), name: name ?? `View ${this.app.store.doc.viewpoints.length + 1}`, pos: r.persp.position.toArray() as [number, number, number], target: r.orbit.target.toArray() as [number, number, number] };
    this.app.cmd.run(addEntities(this.app.store, 'viewpoints', [v], 'Save viewpoint'));
    toast(`Saved “${v.name}”`);
  }
  go(v: Viewpoint, dur = 2) { this.app.rig.flyTo(new THREE.Vector3(...v.pos), new THREE.Vector3(...v.target), dur); }
  tour() {
    const vps = this.app.store.doc.viewpoints;
    if (vps.length < 2) { toast('Save at least two viewpoints to make a tour'); return; }
    if (this.app.walking) this.app.ui.setMode('select');
    this.touring = true;
    document.body.classList.add('photo');
    let i = 0;
    const next = () => {
      if (!this.touring) return;
      const v = vps[i % vps.length];
      toast(v.name, 2500);
      this.app.rig.flyTo(new THREE.Vector3(...v.pos), new THREE.Vector3(...v.target), 4.5, () => { i++; window.setTimeout(next, 1800); });
    };
    next();
    toast('Guided tour — press Esc to stop', 2500);
  }
  stopTour() { this.touring = false; document.body.classList.remove('photo'); this.app.rig.cancelFlight(); }

  panel(close: () => void) {
    const vps = this.app.store.doc.viewpoints;
    const list = h('div', { class: 'list' }, ...vps.map((v) => h('div', { class: 'row' },
      h('span', { class: 'grow', onclick: () => { this.go(v); close(); } }, v.name),
      h('button', { class: 'btn small', onclick: () => { this.go(v); close(); } }, 'Go'),
      h('button', { class: 'btn small danger', title: 'Delete', onclick: () => { this.app.cmd.run(removeEntities(this.app.store, 'viewpoints', [v.id], 'Delete viewpoint')); close(); } }, '✕'))));
    return h('div', { style: 'min-width:260px' },
      section('Viewpoints', vps.length ? list : hint('No saved views yet. Frame a nice shot, then save it.'),
        h('div', { class: 'btn-row' }, button('Save current view', () => { const n = prompt('Name this view', `View ${vps.length + 1}`); if (n) { this.save(n); close(); } }, 'small'),
          button('▶ Play guided tour', () => { close(); this.tour(); }, 'small primary'))));
  }
}
