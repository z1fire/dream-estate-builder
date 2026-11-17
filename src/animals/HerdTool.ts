import type { App } from '../app/App';
import { BASE } from '../catalog/loader';
import { catalogItem } from '../catalog/catalog';
import { addEntities, updateEntities } from '../core/commands';
import { pointInPolygon, rng } from '../core/math';
import { clone, uid } from '../core/store';
import type { AnimalDef, Species } from '../core/types';
import { Tool, type ToolEvent } from '../editing/Tool';
import { editSlider, h, hint, section, slider, toast } from '../ui/dom';
import { SPECIES, speciesInfo, modelOf } from './AnimalSystem';

/** Place a herd/flock: click inside a pasture, on water (ducks) or anywhere. */
export class HerdTool extends Tool {
  id = 'animals';
  name = 'Animals';
  hint = 'Click inside a pasture to release a herd there · ducks: click on a pond or the moat · animals elsewhere roam near where you place them';
  species: Species = 'sheep';
  variant = 'sheep';
  count = 6;
  spread = 6;

  down(ev: ToolEvent) {
    if (!ev.ground) return;
    const x = ev.ground.x, z = ev.ground.z;
    const water = this.app.water;
    const pasture = this.app.store.doc.pastures.find((p) => pointInPolygon(x, z, p.points)) ?? null;
    const waterId = this.species === 'duck' ? water?.bodyAt(x, z) ?? null : null;
    if (this.species !== 'duck' && water?.isWater(x, z)) { toast('Only ducks can live on the water'); return; }
    const r = rng(Date.now() & 0xffff);
    const out: AnimalDef[] = [];
    for (let i = 0; i < this.count; i++) {
      let px = x, pz = z;
      for (let k = 0; k < 20; k++) {
        const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * this.spread;
        px = x + Math.cos(ang) * d; pz = z + Math.sin(ang) * d;
        if (pasture && !pointInPolygon(px, pz, pasture.points)) continue;
        if (waterId && water?.bodyAt(px, pz) !== waterId) continue;
        if (!waterId && water?.isWater(px, pz, 0.5)) continue;
        break;
      }
      const sc = 0.88 + r() * 0.24;
      out.push({ id: uid('ani'), species: this.species, variant: this.variant, pos: [px, pz], pastureId: pasture?.id ?? null, waterId, scale: Math.round(sc * 100) / 100 });
    }
    this.app.cmd.run(addEntities(this.app.store, 'animals', out, `Add ${this.count} ${speciesInfo(this.species).label.toLowerCase()}`));
    toast(`${this.count} ${speciesInfo(this.species).label.toLowerCase()}${this.count > 1 ? 's' : ''} ${pasture ? `in ${pasture.name}` : waterId ? 'on the water' : 'released'}`);
  }

  panel() {
    const grid = h('div', { class: 'cat-grid' });
    for (const s of SPECIES) for (const [id, label] of s.variants) {
      const it = catalogItem(id);
      const el = h('div', { class: `cat-item ${id === this.variant ? 'on' : ''}` }, it ? h('img', { src: BASE + it.thumb, alt: '' }) : h('div', { class: 'ph' }, '?'), s.variants.length > 1 ? label : s.label);
      el.addEventListener('click', () => { this.species = s.id; this.variant = id; grid.querySelectorAll('.cat-item').forEach((x) => x.classList.remove('on')); el.classList.add('on'); });
      grid.appendChild(el);
    }
    return h('div', {},
      section('Herd', slider('How many', 1, 40, 1, this.count, (v) => (this.count = v)), slider('Spread', 1, 30, 1, this.spread, (v) => (this.spread = v), (v) => `${Math.round(v * 3.28)} ft`)),
      section('Animal', grid),
      hint('Animals in a pasture graze and wander inside its fence. Ducks paddle around the pond or moat you click on. Select an animal to change it or remove it.'));
  }
}

export function registerAnimalInspector(app: App) {
  app.inspectors.set('animals', (ids) => {
    const a = app.store.get('animals', ids[0]) as AnimalDef;
    const it = catalogItem(modelOf(a));
    const edit = (fn: (e: AnimalDef) => void, label: string) => {
      const before = ids.map((id) => clone(app.store.get('animals', id) as AnimalDef));
      const after = before.map((b) => { const c = clone(b); fn(c); return c; });
      app.cmd.run(updateEntities(app.store, 'animals', before, after, label));
    };
    const pasture = a.pastureId ? app.store.doc.pastures.find((p) => p.id === a.pastureId) : null;
    return h('div', {},
      h('div', { style: 'display:flex;gap:10px;align-items:center' }, it ? h('img', { src: BASE + it.thumb, style: 'width:56px;height:56px;border-radius:6px;background:#e9eef0' }) : null,
        h('div', {}, h('b', {}, speciesInfo(a.species).variants.find((v) => v[0] === modelOf(a))?.[1] ?? speciesInfo(a.species).label),
          h('div', { class: 'hint', style: 'margin:2px 0' }, pasture ? `Grazing in ${pasture.name}` : a.waterId ? 'Swimming' : 'Roaming freely'),
          ids.length > 1 ? h('div', { class: 'hint' }, `${ids.length} animals selected`) : null)),
      editSlider('Size', 0.5, 1.5, 0.05, a.scale, (v) => edit((e) => (e.scale = v), 'Animal size'), (v) => `${Math.round(v * 100)}%`),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => {
        const same = app.store.doc.animals.filter((x) => x.species === a.species && x.pastureId === a.pastureId && (x.waterId ?? null) === (a.waterId ?? null)).map((x) => ({ kind: 'animals', id: x.id }));
        app.selection.set(same);
      } }, 'Select whole herd')));
  });
  void uid;
}
