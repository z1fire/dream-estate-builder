type Attrs = Record<string, unknown> & { class?: string; style?: string | Partial<CSSStyleDeclaration> };
type Child = Node | string | number | null | undefined | false | Child[];

/** Minimal hyperscript helper. on* attributes become listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k in el && k !== 'list' && k !== 'type' && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}
function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: HTMLElement) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** Labeled range slider. */
export function slider(label: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void, fmt: (v: number) => string = (v) => String(v)) {
  const out = h('span', { class: 'val' }, fmt(value));
  const input = h('input', { type: 'range', min, max, step, value: String(value) }) as HTMLInputElement;
  input.addEventListener('input', () => { const v = Number(input.value); out.textContent = fmt(v); onInput(v); });
  const row = h('label', { class: 'field slider' }, h('span', { class: 'lbl' }, label), input, out);
  (row as any).set = (v: number) => { input.value = String(v); out.textContent = fmt(v); };
  return row as HTMLLabelElement & { set(v: number): void };
}

export function select<T extends string>(label: string, options: [T, string][], value: T, onChange: (v: T) => void) {
  const sel = h('select', {}, ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))) as HTMLSelectElement;
  sel.addEventListener('change', () => onChange(sel.value as T));
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), sel);
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void) {
  const cb = h('input', { type: 'checkbox', checked: value }) as HTMLInputElement;
  cb.addEventListener('change', () => onChange(cb.checked));
  return h('label', { class: 'field check' }, cb, h('span', {}, label));
}

export function numberInput(label: string, value: number, step: number, onChange: (v: number) => void, unit = '') {
  const inp = h('input', { type: 'number', value: String(value), step: String(step) }) as HTMLInputElement;
  inp.addEventListener('change', () => onChange(Number(inp.value)));
  return h('label', { class: 'field num' }, h('span', { class: 'lbl' }, label), inp, unit ? h('span', { class: 'unit' }, unit) : null);
}

export function textInput(label: string, value: string, onChange: (v: string) => void) {
  const inp = h('input', { type: 'text', value }) as HTMLInputElement;
  inp.addEventListener('change', () => onChange(inp.value));
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), inp);
}

/** Segmented button group. */
export function segmented<T extends string>(options: { id: T; label: string; icon?: string; title?: string }[], value: T, onChange: (v: T) => void, cls = '') {
  const wrap = h('div', { class: `seg ${cls}` });
  const btns = options.map((o) => {
    const b = h('button', { class: o.id === value ? 'on' : '', title: o.title ?? o.label, 'data-id': o.id, html: (o.icon ? o.icon : '') + `<span>${o.label}</span>` });
    b.addEventListener('click', () => { btns.forEach((x) => x.classList.toggle('on', x === b)); onChange(o.id); });
    return b;
  });
  wrap.append(...btns);
  (wrap as any).set = (v: T) => btns.forEach((x) => x.classList.toggle('on', x.dataset.id === v));
  return wrap as HTMLDivElement & { set(v: T): void };
}

export function section(title: string, ...children: Child[]) {
  return h('div', { class: 'section' }, h('h3', {}, title), ...children);
}

export function button(label: string, onClick: () => void, cls = '', title = '') {
  return h('button', { class: `btn ${cls}`, onclick: onClick, title: title || label, html: label });
}

let toastTimer = 0;
export function toast(msg: string, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast' }); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), ms);
}

export function hint(text: string) {
  return h('p', { class: 'hint', html: text });
}
