import type { CollectionKey, EstateDoc } from './types';

export type Rect = { x0: number; z0: number; x1: number; z1: number }; // grid cell indices, inclusive

export type Change =
  | { type: 'terrain'; rect: Rect } // heights changed
  | { type: 'splat'; rect: Rect }
  | { type: 'collection'; key: CollectionKey; ids?: string[] }
  | { type: 'vegetation'; kinds?: string[] }
  | { type: 'boundary' }
  | { type: 'settings' }
  | { type: 'doc' }; // whole document replaced

type Listener = (c: Change) => void;

/** Tiny typed event bus. */
export class Emitter<T extends Record<string, unknown>> {
  private map = new Map<keyof T, Set<(v: any) => void>>();
  on<K extends keyof T>(k: K, fn: (v: T[K]) => void): () => void {
    if (!this.map.has(k)) this.map.set(k, new Set());
    this.map.get(k)!.add(fn);
    return () => this.map.get(k)!.delete(fn);
  }
  emit<K extends keyof T>(k: K, v: T[K]) {
    this.map.get(k)?.forEach((fn) => fn(v));
  }
}

/** Holds the current EstateDoc and broadcasts changes so systems can rebuild their slice. */
export class Store {
  doc: EstateDoc;
  private listeners = new Set<Listener>();
  private batching = 0;
  private pending: Change[] = [];
  dirtySinceSave = false;

  constructor(doc: EstateDoc) {
    this.doc = doc;
  }
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify(c: Change) {
    this.dirtySinceSave = true;
    this.doc.modified = Date.now();
    if (this.batching) { this.pending.push(c); return; }
    this.listeners.forEach((fn) => fn(c));
  }
  /** Group many notifications (merges collection changes by key). */
  batch(fn: () => void) {
    this.batching++;
    try { fn(); } finally {
      this.batching--;
      if (!this.batching) {
        const p = this.pending; this.pending = [];
        const seen = new Set<string>();
        for (const c of p) {
          const k = c.type === 'collection' ? `c:${c.key}` : c.type === 'terrain' || c.type === 'splat' ? `${c.type}:${JSON.stringify(c.rect)}` : c.type;
          if (seen.has(k) && c.type === 'collection') continue;
          seen.add(k);
          this.listeners.forEach((l) => l(c.type === 'collection' ? { type: 'collection', key: c.key } : c));
        }
      }
    }
  }
  replace(doc: EstateDoc) {
    this.doc = doc;
    this.dirtySinceSave = false;
    this.listeners.forEach((fn) => fn({ type: 'doc' }));
  }

  // ---- generic entity helpers ----
  list<K extends CollectionKey>(k: K): EstateDoc[K] {
    return this.doc[k];
  }
  get<K extends CollectionKey>(k: K, id: string): EstateDoc[K][number] | undefined {
    return (this.doc[k] as { id: string }[]).find((e) => e.id === id) as EstateDoc[K][number] | undefined;
  }
}

export function uid(prefix = 'e'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
export function clone<T>(v: T): T {
  return structuredClone(v);
}
