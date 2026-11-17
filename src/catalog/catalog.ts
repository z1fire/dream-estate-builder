import data from './catalog.json';
import type { RoomType } from '../core/types';

/**
 * The asset catalog. Every placeable model lives in `catalog.json` — one entry per model:
 *   { id, name, category, tags, model, scale, footprint:[w,d] (m), height (m), snap, thumb, roomTypes?, light?, animations? }
 * To add a model: drop the .glb into public/models/<category>/ and add an entry to catalog.json
 * (or add it to scripts/asset-selection.mjs and run `npm run build:assets`, which also renders the thumbnail).
 */
export type SnapRule = 'ground' | 'grid' | 'floor' | 'wall' | 'ceiling';
export interface CatalogLight { color: string; intensity: number; distance: number; y: number }
export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  tags: string[];
  model: string;
  scale: number;
  footprint: [number, number];
  height: number;
  snap: SnapRule;
  thumb: string;
  roomTypes?: (RoomType | '*' | 'barracks' | 'bakery' | 'smithy')[];
  light?: CatalogLight;
  animations?: string[];
  hidden?: boolean;
  source?: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  trees: 'Trees', shrubs: 'Shrubs', flowers: 'Flowers', rocks: 'Rocks', castle: 'Castle', siege: 'Siege', lighting: 'Lighting',
  furniture: 'Furniture', chapel: 'Chapel', props: 'Props', village: 'Village', garden: 'Garden', farm: 'Farm', animals: 'Animals',
  boats: 'Boats & Bridges', decor: 'Decor', building_kit: 'Building Kit',
};

export const CATALOG: CatalogItem[] = (data as { items: CatalogItem[] }).items;
const byId = new Map(CATALOG.map((c) => [c.id, c]));

export function catalogItem(id: string): CatalogItem | undefined {
  return byId.get(id);
}
export function visibleItems(): CatalogItem[] {
  return CATALOG.filter((c) => !c.hidden);
}
export function itemsFor(categories: string[]): CatalogItem[] {
  return CATALOG.filter((c) => !c.hidden && categories.includes(c.category));
}
export function itemsForRoom(room: RoomType): CatalogItem[] {
  return CATALOG.filter((c) => !c.hidden && c.roomTypes && (c.roomTypes.includes('*') || c.roomTypes.includes(room)));
}
export function searchCatalog(q: string, list: CatalogItem[] = visibleItems()): CatalogItem[] {
  const s = q.trim().toLowerCase();
  if (!s) return list;
  return list.filter((c) => c.name.toLowerCase().includes(s) || c.tags.some((t) => t.includes(s)) || c.category.includes(s));
}
