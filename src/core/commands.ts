import { clone, type Rect, type Store } from './store';
import { GRID, VERTS, type CollectionKey, type EstateDoc, type VegetationData } from './types';

export interface Command {
  label: string;
  do(): void;
  undo(): void;
  /** approximate memory footprint in bytes for the undo budget */
  size?: number;
}

const BUDGET = 500 * 1024 * 1024;

export class CommandStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private bytes = 0;
  onChange: () => void = () => {};
  constructor(private store: Store) {}

  /** Execute and record. */
  run(cmd: Command) {
    this.store.batch(() => cmd.do());
    this.push(cmd);
  }
  /** Record a command whose effect has already been applied (e.g. a brush stroke). */
  push(cmd: Command) {
    this.undoStack.push(cmd);
    this.bytes += cmd.size ?? 1024;
    this.redoStack = [];
    while (this.bytes > BUDGET && this.undoStack.length > 1) {
      const c = this.undoStack.shift()!;
      this.bytes -= c.size ?? 1024;
    }
    this.onChange();
  }
  undo() {
    const c = this.undoStack.pop();
    if (!c) return;
    this.bytes -= c.size ?? 1024;
    this.store.batch(() => c.undo());
    this.redoStack.push(c);
    this.onChange();
  }
  redo() {
    const c = this.redoStack.pop();
    if (!c) return;
    this.store.batch(() => c.do());
    this.undoStack.push(c);
    this.bytes += c.size ?? 1024;
    this.onChange();
  }
  clear() {
    this.undoStack = []; this.redoStack = []; this.bytes = 0; this.onChange();
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack.at(-1)?.label; }
  get redoLabel() { return this.redoStack.at(-1)?.label; }
}

type Ent = { id: string };

export function addEntities<K extends CollectionKey>(store: Store, key: K, items: EstateDoc[K][number][], label = 'Add'): Command {
  const snap = items.map((i) => clone(i));
  return {
    label,
    size: JSON.stringify(snap).length,
    do() {
      const arr = store.doc[key] as Ent[];
      for (const s of snap) arr.push(clone(s) as Ent);
      store.notify({ type: 'collection', key, ids: snap.map((s) => (s as Ent).id) });
    },
    undo() {
      const ids = new Set(snap.map((s) => (s as Ent).id));
      (store.doc as any)[key] = (store.doc[key] as Ent[]).filter((e) => !ids.has(e.id));
      store.notify({ type: 'collection', key, ids: [...ids] });
    },
  };
}

export function removeEntities<K extends CollectionKey>(store: Store, key: K, ids: string[], label = 'Delete'): Command {
  const set = new Set(ids);
  let removed: { idx: number; item: Ent }[] = [];
  return {
    label,
    size: 4096,
    do() {
      const arr = store.doc[key] as Ent[];
      removed = [];
      arr.forEach((e, idx) => { if (set.has(e.id)) removed.push({ idx, item: clone(e) }); });
      (store.doc as any)[key] = arr.filter((e) => !set.has(e.id));
      store.notify({ type: 'collection', key, ids });
    },
    undo() {
      const arr = store.doc[key] as Ent[];
      for (const r of removed) arr.splice(Math.min(r.idx, arr.length), 0, clone(r.item));
      store.notify({ type: 'collection', key, ids });
    },
  };
}

/** Replace entities by id with new versions (before/after snapshots). */
export function updateEntities<K extends CollectionKey>(
  store: Store, key: K, before: EstateDoc[K][number][], after: EstateDoc[K][number][], label = 'Edit',
): Command {
  const b = before.map((x) => clone(x)), a = after.map((x) => clone(x));
  const apply = (items: Ent[]) => {
    const arr = store.doc[key] as Ent[];
    for (const it of items) {
      const i = arr.findIndex((e) => e.id === it.id);
      if (i >= 0) arr[i] = clone(it);
    }
    store.notify({ type: 'collection', key, ids: items.map((i) => i.id) });
  };
  return { label, size: JSON.stringify(a).length * 2, do: () => apply(a as Ent[]), undo: () => apply(b as Ent[]) };
}

export function composite(label: string, cmds: Command[]): Command {
  return {
    label,
    size: cmds.reduce((s, c) => s + (c.size ?? 1024), 0),
    do() { for (const c of cmds) c.do(); },
    undo() { for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo(); },
  };
}

// ---------- Terrain region patches ----------
export interface HeightPatch { rect: Rect; data: Float32Array }
export function captureHeights(doc: EstateDoc, r: Rect): HeightPatch {
  const w = r.x1 - r.x0 + 1, h = r.z1 - r.z0 + 1;
  const data = new Float32Array(w * h);
  for (let z = 0; z < h; z++) data.set(doc.heights.subarray((r.z0 + z) * VERTS + r.x0, (r.z0 + z) * VERTS + r.x0 + w), z * w);
  return { rect: { ...r }, data };
}
export function applyHeights(doc: EstateDoc, p: HeightPatch) {
  const r = p.rect, w = r.x1 - r.x0 + 1, h = r.z1 - r.z0 + 1;
  for (let z = 0; z < h; z++) doc.heights.set(p.data.subarray(z * w, z * w + w), (r.z0 + z) * VERTS + r.x0);
}
export function heightCommand(store: Store, before: HeightPatch, after: HeightPatch, label: string): Command {
  return {
    label,
    size: before.data.byteLength * 2,
    do() { applyHeights(store.doc, after); store.notify({ type: 'terrain', rect: after.rect }); },
    undo() { applyHeights(store.doc, before); store.notify({ type: 'terrain', rect: before.rect }); },
  };
}

export interface SplatPatch { rect: Rect; data: Uint8Array }
const PLANE = GRID * GRID * 4;
export function captureSplat(doc: EstateDoc, r: Rect): SplatPatch {
  const w = r.x1 - r.x0 + 1, h = r.z1 - r.z0 + 1;
  const data = new Uint8Array(w * h * 12);
  let o = 0;
  for (let p = 0; p < 3; p++)
    for (let z = 0; z < h; z++) {
      const s = p * PLANE + ((r.z0 + z) * GRID + r.x0) * 4;
      data.set(doc.splat.subarray(s, s + w * 4), o); o += w * 4;
    }
  return { rect: { ...r }, data };
}
export function applySplat(doc: EstateDoc, sp: SplatPatch) {
  const r = sp.rect, w = r.x1 - r.x0 + 1, h = r.z1 - r.z0 + 1;
  let o = 0;
  for (let p = 0; p < 3; p++)
    for (let z = 0; z < h; z++) {
      doc.splat.set(sp.data.subarray(o, o + w * 4), p * PLANE + ((r.z0 + z) * GRID + r.x0) * 4); o += w * 4;
    }
}
export function splatCommand(store: Store, before: SplatPatch, after: SplatPatch, label: string): Command {
  return {
    label,
    size: before.data.byteLength * 2,
    do() { applySplat(store.doc, after); store.notify({ type: 'splat', rect: after.rect }); },
    undo() { applySplat(store.doc, before); store.notify({ type: 'splat', rect: before.rect }); },
  };
}

export function vegetationCommand(store: Store, before: VegetationData, after: VegetationData, label: string): Command {
  const kinds = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const b = clone(before), a = clone(after);
  const apply = (v: VegetationData) => {
    for (const k of kinds) store.doc.vegetation[k] = (v[k] ?? []).slice();
    store.notify({ type: 'vegetation', kinds });
  };
  return { label, size: (JSON.stringify(b).length + JSON.stringify(a).length), do: () => apply(a), undo: () => apply(b) };
}

/** Terrain + splat + entity changes in one undo step (e.g. moat carving). */
export function regionWithEntities(
  store: Store, label: string, hb: HeightPatch | null, ha: HeightPatch | null, sb: SplatPatch | null, sa: SplatPatch | null, entity: Command | null,
): Command {
  return {
    label,
    size: (hb?.data.byteLength ?? 0) * 2 + (sb?.data.byteLength ?? 0) * 2 + (entity?.size ?? 0),
    do() {
      if (ha) { applyHeights(store.doc, ha); store.notify({ type: 'terrain', rect: ha.rect }); }
      if (sa) { applySplat(store.doc, sa); store.notify({ type: 'splat', rect: sa.rect }); }
      entity?.do();
    },
    undo() {
      entity?.undo();
      if (sb) { applySplat(store.doc, sb); store.notify({ type: 'splat', rect: sb.rect }); }
      if (hb) { applyHeights(store.doc, hb); store.notify({ type: 'terrain', rect: hb.rect }); }
    },
  };
}
