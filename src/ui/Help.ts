import { h } from './dom';

const GROUPS: [string, [string, string][]][] = [
  ['Camera', [['Orbit', 'Right-drag (or left-drag in Select)'], ['Pan', 'Middle-drag / Shift+right-drag'], ['Zoom', 'Mouse wheel'], ['Plan view', 'Tab'], ['Focus selection', '.'], ['Arrow keys', 'Pan camera']]],
  ['Modes', [['Select', 'V'], ['Terrain', 'T'], ['Paint', 'P'], ['Water', 'W'], ['Plants', 'G'], ['Roads & fences', 'R'], ['Castle', 'C'], ['Village', 'B'], ['Interiors', 'I'], ['Farming', 'F'], ['Animals', 'A'], ['Walk', 'K'], ['Measure', 'M']]],
  ['Editing', [['Undo / Redo', 'Ctrl+Z / Ctrl+Y'], ['Save', 'Ctrl+S'], ['Duplicate', 'Ctrl+D'], ['Delete', 'Del'], ['Multi-select', 'Shift+click'], ['Move / Rotate / Scale', '1 / 2 / 3'], ['Rotate 15°', 'Q / E'], ['Deselect / cancel', 'Esc']]],
  ['Brushes & drawing', [['Brush size', '[ / ]'], ['Sample height', 'Alt+click (Terrain)'], ['Finish shape', 'Double-click / Enter'], ['Remove last point', 'Backspace'], ['Close shape', 'Click first point']]],
  ['Walk mode', [['Move', 'W A S D'], ['Look', 'Mouse'], ['Run', 'Shift'], ['Jump', 'Space'], ['Horseback', 'H'], ['Use door / drawbridge', 'E'], ['Exit', 'Esc']]],
  ['Other', [['Photo mode', 'Shift+P'], ['Help', 'H or ?']]],
];

export function helpModal() {
  const back = h('div', { class: 'modal-back', onclick: (e: Event) => { if (e.target === back) back.remove(); } });
  const modal = h('div', { class: 'modal', style: 'width:min(820px, calc(100vw - 32px))' },
    h('h1', {}, 'Controls & Shortcuts'),
    h('p', { class: 'sub' }, 'Design your estate from bare land to the last candlestick. Everything you do can be undone.'),
    h('div', { class: 'help' }, ...GROUPS.map(([title, rows]) => h('div', { class: 'grp' }, h('h4', {}, title),
      ...rows.map(([a, b]) => h('div', {}, h('span', {}, a), h('span', { html: b.split(' / ').map((x) => x.split('+').map((k) => `<kbd>${k}</kbd>`).join('+')).join(' / ') })))))),
    h('div', { class: 'foot' }, h('button', { class: 'btn primary', onclick: () => back.remove() }, 'Close')));
  back.appendChild(modal);
  document.body.appendChild(back);
}
