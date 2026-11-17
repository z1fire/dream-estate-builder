import type { App } from '../app/App';
import { updateEntities } from '../core/commands';
import { clone } from '../core/store';
import type { PlacedObject } from '../core/types';
import { editSlider, h, hint } from '../ui/dom';
import { BASE } from './loader';
import { catalogItem } from './catalog';

/** Properties panel for placed catalog objects. */
export function registerObjectInspector(app: App) {
  app.inspectors.set('objects', (ids) => {
    const objs = ids.map((id) => app.store.get('objects', id) as PlacedObject).filter(Boolean);
    const o = objs[0];
    const item = catalogItem(o.catalogId);
    const edit = (fn: (e: PlacedObject) => void, label: string) => {
      const before = objs.map((x) => clone(app.store.get('objects', x.id) as PlacedObject));
      const after = before.map((x) => { const c = clone(x); fn(c); return c; });
      app.cmd.run(updateEntities(app.store, 'objects', before as never[], after as never[], label));
    };
    return h('div', {},
      item ? h('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:6px' },
        h('img', { src: BASE + item.thumb, style: 'width:64px;height:64px;border-radius:6px;background:#e9eef0' }),
        h('div', {}, h('b', {}, item.name), h('div', { class: 'hint', style: 'margin:2px 0' }, `${item.category}${item.source ? ` · ${item.source}` : ''}`),
          objs.length > 1 ? h('div', { class: 'hint' }, `${objs.length} objects selected`) : null)) : null,
      editSlider('Scale', 0.25, 3, 0.05, o.scale, (v) => edit((e) => (e.scale = v), 'Scale'), (v) => `${Math.round(v * 100)}%`),
      editSlider('Rotation', 0, 345, 15, Math.round(((((o.rotY * 180) / Math.PI) % 360) + 360) % 360 / 15) * 15, (v) => edit((e) => (e.rotY = (v * Math.PI) / 180), 'Rotate'), (v) => `${v}°`),
      o.buildingId ? hint('Inside a building (moves with it).') : null);
  });
}
