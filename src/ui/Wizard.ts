import { FT_TO_M, SQM_PER_ACRE } from '../core/math';
import { h, segmented } from './dom';
import { deleteEstate, listEstates, type EstateMeta } from '../persistence/storage';

export interface WizardResult {
  name: string;
  mode: 'acres' | 'dims' | 'draw';
  widthM: number;
  depthM: number;
  hills: number;
}

const MAX_SIDE_M = 1000; // world is 1024 m

/** "New Estate" wizard: name + size (acres / W×D feet / draw your own boundary) + terrain style. */
export function newEstateWizard(onCreate: (r: WizardResult) => void, canCancel = true) {
  let mode: WizardResult['mode'] = 'acres';
  let hills = 4;
  const back = h('div', { class: 'modal-back' });
  const name = h('input', { type: 'text', value: 'My Dream Estate', style: 'flex:1' }) as HTMLInputElement;
  const acres = h('input', { type: 'number', value: '40', min: '1', max: '240', step: '1' }) as HTMLInputElement;
  const wft = h('input', { type: 'number', value: '1320', min: '100', max: '3280', step: '10' }) as HTMLInputElement;
  const dft = h('input', { type: 'number', value: '1320', min: '100', max: '3280', step: '10' }) as HTMLInputElement;
  const info = h('p', { class: 'hint' });
  const acreRow = h('div', { class: 'field num' }, h('span', { class: 'lbl' }, 'Size'), acres, h('span', { class: 'unit' }, 'acres (square)'));
  const dimRow = h('div', { class: 'field num', style: 'display:none' }, h('span', { class: 'lbl' }, 'Width × depth'), wft, h('span', {}, '×'), dft, h('span', { class: 'unit' }, 'ft'));
  const drawRow = h('p', { class: 'hint', style: 'display:none', html: 'After creating, click the corners of your property on the land to draw a custom boundary polygon. Click the first stake to close it.' });
  const update = () => {
    acreRow.style.display = mode === 'acres' ? '' : 'none';
    dimRow.style.display = mode === 'dims' ? '' : 'none';
    drawRow.style.display = mode === 'draw' ? '' : 'none';
    const r = compute();
    info.innerHTML = mode === 'draw' ? '' : `≈ ${(r.widthM / FT_TO_M).toFixed(0)} × ${(r.depthM / FT_TO_M).toFixed(0)} ft · ${((r.widthM * r.depthM) / SQM_PER_ACRE).toFixed(1)} acres`;
  };
  const compute = (): WizardResult => {
    let w = 400, d = 400;
    if (mode === 'acres') { w = d = Math.min(MAX_SIDE_M, Math.sqrt(Math.max(1, Number(acres.value)) * SQM_PER_ACRE)); }
    else if (mode === 'dims') { w = Math.min(MAX_SIDE_M, Number(wft.value) * FT_TO_M); d = Math.min(MAX_SIDE_M, Number(dft.value) * FT_TO_M); }
    return { name: name.value.trim() || 'My Estate', mode, widthM: w, depthM: d, hills };
  };
  [acres, wft, dft].forEach((i) => i.addEventListener('input', update));
  const modal = h('div', { class: 'modal' },
    h('h1', {}, 'A New Estate'),
    h('p', { class: 'sub' }, 'Name your land and mark out its bounds. You can redraw the boundary any time from Select → Boundary.'),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Estate name'), name),
    h('h2', {}, 'Property size'),
    segmented([{ id: 'acres', label: 'Acres' }, { id: 'dims', label: 'Width × depth' }, { id: 'draw', label: 'Draw boundary' }], mode, (v) => { mode = v as WizardResult['mode']; update(); }),
    acreRow, dimRow, drawRow, info,
    h('h2', {}, 'Lay of the land'),
    segmented([{ id: '0.2', label: 'Flat' }, { id: '2', label: 'Gentle' }, { id: '4', label: 'Rolling hills' }, { id: '9', label: 'Hilly' }], '4', (v) => { hills = Number(v); }),
    h('div', { class: 'foot' },
      canCancel ? h('button', { class: 'btn', onclick: () => back.remove() }, 'Cancel') : null,
      h('button', { class: 'btn primary', onclick: () => { back.remove(); onCreate(compute()); } }, 'Create estate')),
  );
  back.appendChild(modal);
  document.body.appendChild(back);
  update();
  name.focus();
  name.select();
}

/** Saved estates browser. */
export async function estatesDialog(currentId: string, onOpen: (id: string) => void, onNew: () => void, onDemo: () => void, onChineseDemo?: () => void, onEstateDemo?: () => void) {
  const back = h('div', { class: 'modal-back', onclick: (e: Event) => { if (e.target === back) back.remove(); } });
  const list = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-top:10px' });
  const render = (items: EstateMeta[]) => {
    list.innerHTML = '';
    if (!items.length) list.appendChild(h('p', { class: 'hint' }, 'No saved estates yet.'));
    for (const m of items) {
      const card = h('div', { class: 'cat-item', style: 'padding:8px;cursor:pointer;' + (m.id === currentId ? 'box-shadow:0 0 0 2px #4a443d' : '') },
        m.thumb ? h('img', { src: m.thumb, style: 'aspect-ratio:16/9;object-fit:cover' }) : h('div', { class: 'ph', style: 'aspect-ratio:16/9' }, '⛫'),
        h('b', { style: 'font-size:12.5px' }, m.name), h('span', { style: 'color:#6b5638' }, new Date(m.modified).toLocaleString()),
        h('div', { class: 'btn-row', style: 'margin:4px 0 0' },
          h('button', { class: 'btn small primary', onclick: (e: Event) => { e.stopPropagation(); back.remove(); onOpen(m.id); } }, 'Open'),
          m.id !== currentId ? h('button', { class: 'btn small danger', onclick: async (e: Event) => { e.stopPropagation(); if (confirm(`Delete “${m.name}”? This cannot be undone.`)) { await deleteEstate(m.id); render(await listEstates()); } } }, 'Delete') : null));
      card.addEventListener('click', () => { back.remove(); onOpen(m.id); });
      list.appendChild(card);
    }
  };
  const modal = h('div', { class: 'modal', style: 'width:min(860px, calc(100vw - 32px))' },
    h('h1', {}, 'Your Estates'),
    h('p', { class: 'sub' }, 'Every estate autosaves in this browser. Use Export to back one up or move it to another computer.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => { back.remove(); onNew(); } }, '✦ New estate'), h('button', { class: 'btn', onclick: () => { back.remove(); onDemo(); } }, '🏰 Load demo estate'),
      onChineseDemo ? h('button', { class: 'btn', onclick: () => { back.remove(); onChineseDemo(); } }, '🏯 Chinese demo') : null,
      onEstateDemo ? h('button', { class: 'btn', onclick: () => { back.remove(); onEstateDemo(); } }, '🏞 Hundred Acre Estate') : null),
    list,
    h('div', { class: 'foot' }, h('button', { class: 'btn primary', onclick: () => back.remove() }, 'Close')));
  back.appendChild(modal);
  document.body.appendChild(back);
  render(await listEstates());
}
