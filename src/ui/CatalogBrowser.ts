import { CATEGORY_LABELS, searchCatalog, type CatalogItem } from '../catalog/catalog';
import { BASE } from '../catalog/loader';
import { h } from './dom';

export interface BrowserOptions {
  items: CatalogItem[];
  multi?: boolean;
  selected: Set<string>;
  onChange: (sel: Set<string>) => void;
  categories?: string[];
}

/** Searchable, categorised catalog grid with thumbnails. */
export function catalogBrowser(o: BrowserOptions): HTMLElement {
  let cat = 'all';
  let query = '';
  const cats = o.categories ?? [...new Set(o.items.map((i) => i.category))];
  const grid = h('div', { class: 'cat-grid' });
  const search = h('input', { class: 'cat-search', type: 'search', placeholder: `Search ${o.items.length} items…` }) as HTMLInputElement;
  const tabs = h('div', { class: 'cat-tabs' });
  const mkTab = (id: string, label: string) => {
    const b = h('button', { class: id === cat ? 'on' : '' }, label);
    b.addEventListener('click', () => { cat = id; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); render(); });
    return b;
  };
  if (cats.length > 1) tabs.append(mkTab('all', 'All'), ...cats.map((c) => mkTab(c, CATEGORY_LABELS[c] ?? c)));
  const render = () => {
    grid.innerHTML = '';
    let list = o.items.filter((i) => cat === 'all' || i.category === cat);
    list = searchCatalog(query, list);
    if (!list.length) grid.appendChild(h('p', { class: 'hint', style: 'grid-column:1/-1' }, 'Nothing matches.'));
    for (const it of list) {
      const el = h('div', { class: `cat-item ${o.selected.has(it.id) ? 'on' : ''}`, title: `${it.name}${it.source ? ` · ${it.source}` : ''}` },
        h('img', { src: BASE + it.thumb, alt: '', loading: 'lazy', draggable: false }), it.name);
      el.addEventListener('click', () => {
        if (o.multi) { if (o.selected.has(it.id)) o.selected.delete(it.id); else o.selected.add(it.id); }
        else { o.selected.clear(); o.selected.add(it.id); }
        grid.querySelectorAll('.cat-item').forEach((x) => x.classList.remove('on'));
        render();
        o.onChange(o.selected);
      });
      grid.appendChild(el);
    }
  };
  search.addEventListener('input', () => { query = search.value; render(); });
  render();
  return h('div', {}, search, tabs, grid);
}
