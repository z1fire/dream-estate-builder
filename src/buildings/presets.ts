import { uid } from '../core/store';
import type { BuildingDef, BuildingKind, CeilingStyle, FloorDef, MaterialKind, Opening, OpeningKind, PlacedObject, RoofStyle, RoomType, Stair, SurfaceMat } from '../core/types';
import { edgeCount, footprint, frontEdge, levelBase } from './footprint';

export interface PresetInfo {
  kind: BuildingKind;
  label: string;
  group: 'castle' | 'village' | 'farm';
  desc: string;
  icon: string;
}

export const PRESETS: PresetInfo[] = [
  { kind: 'keep', label: 'Keep', group: 'castle', desc: 'Great stone keep, 4 storeys + dungeon', icon: '🏰' },
  { kind: 'tower_round', label: 'Round tower', group: 'castle', desc: 'Round tower with spiral stair', icon: '◯' },
  { kind: 'tower_square', label: 'Square tower', group: 'castle', desc: 'Square tower with spire', icon: '▢' },
  { kind: 'gatehouse', label: 'Gatehouse', group: 'castle', desc: 'Gate passage, portcullis & drawbridge', icon: '⛩' },
  { kind: 'great_hall', label: 'Great hall', group: 'castle', desc: 'Feasting hall with high roof', icon: '🍷' },
  { kind: 'chapel', label: 'Chapel', group: 'castle', desc: 'Stone chapel with stained glass', icon: '✝' },
  { kind: 'barracks', label: 'Barracks', group: 'castle', desc: 'Two storeys of bunks', icon: '🛡' },
  { kind: 'armory', label: 'Armory', group: 'castle', desc: 'Weapon store with battlements', icon: '⚔' },
  { kind: 'stables', label: 'Stables', group: 'castle', desc: 'Horse stalls and hay', icon: '🐎' },
  { kind: 'cottage', label: 'Cottage', group: 'village', desc: 'Whitewashed, thatched cottage', icon: '🏠' },
  { kind: 'cottage_timber', label: 'Timber cottage', group: 'village', desc: 'Half-timbered, two storeys', icon: '🏡' },
  { kind: 'cottage_stone', label: 'Stone cottage', group: 'village', desc: 'Stone cottage, slate roof', icon: '🪨' },
  { kind: 'longhouse', label: 'Longhouse', group: 'village', desc: 'Long thatched hall', icon: '🛖' },
  { kind: 'tavern', label: 'Tavern / inn', group: 'village', desc: 'Taproom, kitchen and rooms upstairs', icon: '🍺' },
  { kind: 'blacksmith', label: 'Blacksmith', group: 'village', desc: 'Forge and anvil', icon: '🔨' },
  { kind: 'bakery', label: 'Bakery', group: 'village', desc: 'Brick bakery with bread oven', icon: '🍞' },
  { kind: 'church', label: 'Church', group: 'village', desc: 'Village church', icon: '⛪' },
  { kind: 'watermill', label: 'Watermill', group: 'village', desc: 'Mill with turning waterwheel', icon: '⚙' },
  { kind: 'windmill', label: 'Windmill', group: 'village', desc: 'Round windmill with sails', icon: '🌬' },
  { kind: 'workshop', label: 'Workshop', group: 'village', desc: 'Craftsman’s workshop', icon: '🪚' },
  { kind: 'storehouse', label: 'Storehouse', group: 'village', desc: 'Stone granary', icon: '📦' },
  { kind: 'barn', label: 'Barn', group: 'farm', desc: 'Large barn with double doors', icon: '🏚' },
  { kind: 'chicken_coop', label: 'Chicken coop', group: 'farm', desc: 'Small coop', icon: '🐔' },
  { kind: 'pig_pen', label: 'Pig shed', group: 'farm', desc: 'Shelter for a pig pen', icon: '🐖' },
  { kind: 'dovecote', label: 'Dovecote', group: 'farm', desc: 'Round dovecote', icon: '🕊' },
  { kind: 'greenhouse', label: 'Greenhouse', group: 'farm', desc: 'Glass-walled greenhouse', icon: '🌱' },
];

interface FloorSpec { level: number; h: number; room: string; type: RoomType; floor?: SurfaceMat; wall?: SurfaceMat; ceil?: CeilingStyle }
interface Spec {
  name: string; shape: 'rect' | 'round'; w: number; d: number; t: number; mat: MaterialKind; roof: RoofStyle; roofColor: string; cren: boolean;
  floors: FloorSpec[]; door: OpeningKind; win: OpeningKind; winSpacing: number; stairs: 'straight' | 'spiral' | 'none';
  extra?: BuildingDef['extra']; doorWidth?: number; doorHeight?: number;
}

const S = (s: Partial<Spec> & Pick<Spec, 'name' | 'w' | 'd' | 'floors'>): Spec => ({
  shape: 'rect', t: 0.6, mat: 'greystone', roof: 'pitched', roofColor: '#7a4a3a', cren: false, door: 'door_wood', win: 'window_shutter', winSpacing: 4, stairs: 'straight', ...s,
});

const SPECS: Record<string, Spec> = {
  keep: S({ name: 'Keep', w: 16, d: 14, t: 1.4, roof: 'flat', cren: true, door: 'door_arched', win: 'window_arched', winSpacing: 4.5, stairs: 'spiral', roofColor: '#555b66',
    floors: [{ level: -1, h: 3.6, room: 'Dungeon', type: 'dungeon', floor: 'flagstone', wall: 'stone', ceil: 'vaulted' }, { level: 0, h: 5.5, room: 'Great Chamber', type: 'hall', floor: 'flagstone', wall: 'stone', ceil: 'beamed' },
      { level: 1, h: 4.2, room: 'Throne Room', type: 'throne', floor: 'plank', wall: 'tapestry', ceil: 'beamed' }, { level: 2, h: 4, room: 'Lord’s Bedchamber', type: 'bedroom', floor: 'plank', wall: 'woodpanel', ceil: 'beamed' },
      { level: 3, h: 3.6, room: 'Library', type: 'library', floor: 'plank', wall: 'plaster', ceil: 'flat' }] }),
  tower_round: S({ name: 'Round Tower', shape: 'round', w: 8, d: 8, t: 1.1, roof: 'conical', cren: true, roofColor: '#4d5a72', win: 'arrow_slit', winSpacing: 3.2, stairs: 'spiral', door: 'door_arched',
    floors: [{ level: 0, h: 4, room: 'Guard Room', type: 'armory', floor: 'flagstone', wall: 'stone' }, { level: 1, h: 3.6, room: 'Store', type: 'storage', floor: 'plank', wall: 'stone' }, { level: 2, h: 3.6, room: 'Lookout', type: 'generic', floor: 'plank', wall: 'stone' }] }),
  tower_square: S({ name: 'Square Tower', w: 7.5, d: 7.5, t: 1.1, roof: 'conical', cren: true, roofColor: '#7a3b30', win: 'arrow_slit', winSpacing: 3, stairs: 'spiral', door: 'door_arched',
    floors: [{ level: 0, h: 4, room: 'Guard Room', type: 'armory', floor: 'flagstone', wall: 'stone' }, { level: 1, h: 3.6, room: 'Chamber', type: 'bedroom', floor: 'plank', wall: 'stone' }, { level: 2, h: 3.6, room: 'Lookout', type: 'generic', floor: 'plank', wall: 'stone' }] }),
  gatehouse: S({ name: 'Gatehouse', w: 11, d: 9, t: 1.3, roof: 'flat', cren: true, door: 'archway', win: 'arrow_slit', winSpacing: 3, stairs: 'spiral', doorWidth: 4.2, doorHeight: 5,
    floors: [{ level: 0, h: 6, room: 'Gate Passage', type: 'generic', floor: 'flagstone', wall: 'stone' }, { level: 1, h: 4, room: 'Winch Room', type: 'armory', floor: 'plank', wall: 'stone', ceil: 'beamed' }],
    extra: { drawbridge: true, drawbridgeOpen: true, portcullisOpen: true, bridgeLength: 9 } }),
  great_hall: S({ name: 'Great Hall', w: 22, d: 12, t: 0.9, roof: 'pitched', roofColor: '#5b4a42', win: 'window_stained', winSpacing: 4, door: 'door_double', stairs: 'none',
    floors: [{ level: 0, h: 7, room: 'Great Hall', type: 'hall', floor: 'flagstone', wall: 'tapestry', ceil: 'beamed' }], extra: { chimney: true } }),
  chapel: S({ name: 'Chapel', w: 14, d: 8, t: 0.9, roof: 'pitched', roofColor: '#4d5562', win: 'window_stained', winSpacing: 3.2, door: 'door_arched', stairs: 'none',
    floors: [{ level: 0, h: 6.5, room: 'Chapel', type: 'chapel', floor: 'flagstone', wall: 'stone', ceil: 'vaulted' }] }),
  barracks: S({ name: 'Barracks', w: 16, d: 8, t: 0.7, roof: 'pitched', roofColor: '#6d4535', win: 'window_shutter', winSpacing: 3.5,
    floors: [{ level: 0, h: 3.4, room: 'Mess', type: 'hall', floor: 'flagstone', wall: 'stone', ceil: 'beamed' }, { level: 1, h: 3.2, room: 'Bunk Room', type: 'bedroom', floor: 'plank', wall: 'plaster', ceil: 'beamed' }] }),
  armory: S({ name: 'Armory', w: 10, d: 8, t: 1, roof: 'flat', cren: true, win: 'arrow_slit', winSpacing: 3, door: 'door_wood', stairs: 'none',
    floors: [{ level: 0, h: 4.5, room: 'Armory', type: 'armory', floor: 'flagstone', wall: 'stone', ceil: 'vaulted' }] }),
  stables: S({ name: 'Stables', w: 16, d: 7, t: 0.4, mat: 'timber', roof: 'pitched', roofColor: '#6b4a32', door: 'door_double', win: 'window_shutter', winSpacing: 4, stairs: 'none',
    floors: [{ level: 0, h: 3.6, room: 'Stables', type: 'stable', floor: 'plank', wall: 'woodpanel', ceil: 'beamed' }], extra: { thatch: true } }),
  cottage: S({ name: 'Cottage', w: 8, d: 6, t: 0.45, mat: 'whitewash', roof: 'pitched', win: 'window_shutter', winSpacing: 3, stairs: 'none',
    floors: [{ level: 0, h: 3, room: 'Hall & Kitchen', type: 'kitchen', floor: 'flagstone', wall: 'plaster', ceil: 'beamed' }], extra: { thatch: true, chimney: true } }),
  cottage_timber: S({ name: 'Timber Cottage', w: 9, d: 7, t: 0.4, mat: 'timber', roof: 'pitched', roofColor: '#8a4632', win: 'window_shutter', winSpacing: 3,
    floors: [{ level: 0, h: 3, room: 'Living Room', type: 'kitchen', floor: 'plank', wall: 'plaster', ceil: 'beamed' }, { level: 1, h: 2.8, room: 'Bedroom', type: 'bedroom', floor: 'plank', wall: 'plaster', ceil: 'beamed' }], extra: { chimney: true } }),
  cottage_stone: S({ name: 'Stone Cottage', w: 9, d: 6.5, t: 0.6, mat: 'greystone', roof: 'pitched', roofColor: '#4f5560', win: 'window_shutter', winSpacing: 3, stairs: 'none',
    floors: [{ level: 0, h: 3.2, room: 'Cottage', type: 'kitchen', floor: 'flagstone', wall: 'whitewash', ceil: 'beamed' }], extra: { chimney: true } }),
  longhouse: S({ name: 'Longhouse', w: 18, d: 7, t: 0.45, mat: 'timber', roof: 'pitched', win: 'window_shutter', winSpacing: 4.5, door: 'door_double', stairs: 'none',
    floors: [{ level: 0, h: 3.4, room: 'Longhouse', type: 'hall', floor: 'plank', wall: 'woodpanel', ceil: 'beamed' }], extra: { thatch: true, chimney: true } }),
  tavern: S({ name: 'The Prancing Pony', w: 14, d: 10, t: 0.5, mat: 'timber', roof: 'pitched', roofColor: '#7d3d2c', win: 'window_shutter', winSpacing: 3, door: 'door_double',
    floors: [{ level: 0, h: 3.4, room: 'Taproom', type: 'tavern', floor: 'plank', wall: 'woodpanel', ceil: 'beamed' }, { level: 1, h: 3, room: 'Guest Rooms', type: 'bedroom', floor: 'plank', wall: 'plaster', ceil: 'beamed' }], extra: { chimney: true } }),
  blacksmith: S({ name: 'Blacksmith', w: 9, d: 7, t: 0.6, mat: 'greystone', roof: 'pitched', roofColor: '#4a4a4a', door: 'door_double', win: 'window_shutter', winSpacing: 4, stairs: 'none',
    floors: [{ level: 0, h: 3.6, room: 'Smithy', type: 'workshop', floor: 'flagstone', wall: 'stone', ceil: 'beamed' }], extra: { chimney: true } }),
  bakery: S({ name: 'Bakery', w: 8, d: 7, t: 0.5, mat: 'brick', roof: 'pitched', roofColor: '#7a3f2e', win: 'window_shutter', winSpacing: 3, stairs: 'none',
    floors: [{ level: 0, h: 3.2, room: 'Bakehouse', type: 'kitchen', floor: 'flagstone', wall: 'whitewash', ceil: 'beamed' }], extra: { chimney: true } }),
  church: S({ name: 'Church', w: 20, d: 10, t: 0.9, roof: 'pitched', roofColor: '#4d5562', win: 'window_stained', winSpacing: 3.5, door: 'door_double', stairs: 'none',
    floors: [{ level: 0, h: 8, room: 'Nave', type: 'chapel', floor: 'flagstone', wall: 'stone', ceil: 'vaulted' }] }),
  watermill: S({ name: 'Watermill', w: 10, d: 8, t: 0.6, mat: 'greystone', roof: 'pitched', roofColor: '#6b4a3a', win: 'window_shutter', winSpacing: 3.5,
    floors: [{ level: 0, h: 3.6, room: 'Mill Floor', type: 'workshop', floor: 'plank', wall: 'stone', ceil: 'beamed' }, { level: 1, h: 3, room: 'Grain Loft', type: 'storage', floor: 'plank', wall: 'woodpanel', ceil: 'beamed' }], extra: { waterwheel: true } }),
  windmill: S({ name: 'Windmill', shape: 'round', w: 7, d: 7, t: 0.6, mat: 'whitewash', roof: 'conical', roofColor: '#5c3f2c', win: 'window_shutter', winSpacing: 4, stairs: 'spiral',
    floors: [{ level: 0, h: 3.6, room: 'Mill Floor', type: 'workshop', floor: 'plank', wall: 'whitewash' }, { level: 1, h: 3.4, room: 'Stone Floor', type: 'storage', floor: 'plank', wall: 'whitewash' }, { level: 2, h: 3.2, room: 'Cap Floor', type: 'storage', floor: 'plank', wall: 'woodpanel' }], extra: { sails: true } }),
  workshop: S({ name: 'Workshop', w: 10, d: 7, t: 0.45, mat: 'timber', roof: 'pitched', roofColor: '#8a5232', win: 'window_shutter', winSpacing: 3, door: 'door_double', stairs: 'none',
    floors: [{ level: 0, h: 3.4, room: 'Workshop', type: 'workshop', floor: 'plank', wall: 'woodpanel', ceil: 'beamed' }] }),
  storehouse: S({ name: 'Storehouse', w: 12, d: 8, t: 0.7, mat: 'greystone', roof: 'pitched', roofColor: '#5a5048', win: 'arrow_slit', winSpacing: 3.5, door: 'door_double', stairs: 'none',
    floors: [{ level: 0, h: 4.4, room: 'Granary', type: 'storage', floor: 'plank', wall: 'stone', ceil: 'beamed' }] }),
  barn: S({ name: 'Barn', w: 16, d: 11, t: 0.35, mat: 'timber', roof: 'pitched', roofColor: '#7a2e24', door: 'door_double', win: 'window_shutter', winSpacing: 6, stairs: 'none', doorWidth: 4, doorHeight: 4,
    floors: [{ level: 0, h: 5.5, room: 'Barn', type: 'stable', floor: 'plank', wall: 'woodpanel', ceil: 'beamed' }] }),
  chicken_coop: S({ name: 'Chicken Coop', w: 3.5, d: 2.6, t: 0.2, mat: 'timber', roof: 'pitched', roofColor: '#7a4a32', door: 'door_wood', win: 'window_shutter', winSpacing: 9, stairs: 'none', doorWidth: 0.9, doorHeight: 1.6,
    floors: [{ level: 0, h: 2.2, room: 'Coop', type: 'storage', floor: 'plank', wall: 'woodpanel' }] }),
  pig_pen: S({ name: 'Pig Shed', w: 4, d: 3, t: 0.25, mat: 'timber', roof: 'pitched', roofColor: '#6b4a32', door: 'archway', win: 'window_shutter', winSpacing: 9, stairs: 'none', doorWidth: 1.6, doorHeight: 1.8,
    floors: [{ level: 0, h: 2.2, room: 'Sty', type: 'stable', floor: 'plank', wall: 'woodpanel' }], extra: { thatch: true } }),
  dovecote: S({ name: 'Dovecote', shape: 'round', w: 4.5, d: 4.5, t: 0.45, mat: 'whitewash', roof: 'conical', roofColor: '#6b3c2c', win: 'arrow_slit', winSpacing: 1.6, stairs: 'none', door: 'door_wood',
    floors: [{ level: 0, h: 3.2, room: 'Dovecote', type: 'storage', floor: 'flagstone', wall: 'whitewash' }, { level: 1, h: 2.4, room: 'Loft', type: 'storage', floor: 'plank', wall: 'whitewash' }] }),
  greenhouse: S({ name: 'Greenhouse', w: 9, d: 5, t: 0.2, mat: 'whitewash', roof: 'pitched', roofColor: '#9cc0c8', win: 'window_arched', winSpacing: 1.6, stairs: 'none', door: 'door_wood',
    floors: [{ level: 0, h: 2.8, room: 'Greenhouse', type: 'generic', floor: 'flagstone', wall: 'whitewash' }] }),
};

/** Doors on the front edge, windows spread around all edges & floors. */
function autoOpenings(b: BuildingDef, spec: Spec): Opening[] {
  const ops: Opening[] = [];
  const pts = footprint(b, b.wallThickness / 2);
  const n = edgeCount(b), front = frontEdge(b);
  const dw = spec.doorWidth ?? (spec.door === 'door_double' ? 2.2 : spec.door === 'archway' ? 3 : 1.25);
  const dh = spec.doorHeight ?? (spec.door === 'door_double' ? 3 : 2.4);
  ops.push({ id: uid('op'), wall: `ext:${front}`, floor: 0, t: 0.5, kind: spec.door, width: dw, height: dh, sill: 0 });
  if (b.kind === 'gatehouse') ops.push({ id: uid('op'), wall: `ext:${(front + 2) % n}`, floor: 0, t: 0.5, kind: 'archway', width: dw, height: dh, sill: 0 });
  for (const f of b.floors) {
    if (f.level < 0) continue;
    const isSlit = spec.win === 'arrow_slit';
    const ww = isSlit ? 0.3 : spec.win === 'window_stained' ? 1.3 : 1.0;
    const wh = isSlit ? 1.4 : spec.win === 'window_stained' ? Math.min(3.4, f.height - 1.8) : 1.3;
    const sill = isSlit ? 1.3 : spec.win === 'window_stained' ? 1.4 : Math.min(1.0, f.height * 0.33);
    if (wh < 0.6 || (b.kind === 'gatehouse' && f.level === 0)) continue;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[(i + 1) % n];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (b.shape === 'round' && i % 2 === 1) continue;
      const k = b.shape === 'round' ? 1 : Math.floor(L / spec.winSpacing);
      for (let j = 0; j < k; j++) {
        const t = (j + 0.5) / k;
        if (f.level === 0 && i === front && Math.abs(t - 0.5) * L < dw / 2 + ww / 2 + 0.4) continue;
        if (b.extra.waterwheel && i === 1) continue;
        ops.push({ id: uid('op'), wall: `ext:${i}`, floor: f.level, t, kind: spec.win, width: ww, height: wh, sill });
      }
    }
  }
  return ops;
}

function stairsFor(b: BuildingDef, spec: Spec, f: FloorDef, isTop: boolean): Stair[] {
  if (isTop || spec.stairs === 'none') return [];
  const inner = b.wallThickness;
  if (spec.stairs === 'spiral' || b.shape === 'round') {
    const pos: [number, number] = b.shape === 'round' ? [0, 0] : [-b.width / 2 + inner + 1.6, -b.depth / 2 + inner + 1.6];
    return [{ id: uid('st'), kind: 'spiral', pos, rotY: f.level * 1.3, from: f.level, width: 1.2 }];
  }
  return [{ id: uid('st'), kind: 'straight', pos: [-b.width / 2 + inner + 0.75, -b.depth / 2 + inner + 0.2], rotY: 0, from: f.level, width: 1.1 }];
}

/** Starter furniture per room type: [id, x fraction, z fraction, rotY, x metres offset?, z metres offset?] (building-local). */
const ROOM_FURNITURE: Partial<Record<RoomType, [string, number, number, number, number?, number?][]>> = {
  hall: [['long_table', 0, 0, 0], ['bench_long', 0, 0, 0, 0, -0.95], ['bench_long', 0, 0, Math.PI, 0, 0.95], ['chandelier', 0, 0, 0], ['banner_red', 0, -0.45, 0], ['fireplace', 0.42, 0, -Math.PI / 2]],
  throne: [['throne', 0, -0.35, 0], ['rug_runner', 0, 0.05, 0], ['armor_stand', -0.3, -0.3, 0], ['armor_stand', 0.3, -0.3, 0], ['chandelier', 0, 0, 0]],
  bedroom: [['bed_fourposter', -0.25, -0.25, 0], ['wardrobe', 0.3, -0.38, 0], ['chest_large', -0.25, 0.1, Math.PI], ['rug_red', 0.1, 0.15, 0], ['candle_stand', 0.3, 0.2, 0]],
  library: [['bookshelf', -0.3, -0.38, 0], ['bookshelf', 0.1, -0.38, 0], ['writing_desk', 0.2, 0.2, Math.PI], ['chair', 0.2, 0.32, Math.PI], ['lectern', -0.25, 0.2, 0], ['candle_stand', 0, 0, 0]],
  armory: [['weapon_rack', -0.2, -0.36, 0], ['armor_stand', 0.25, -0.25, 0], ['shield_wall', 0.2, 0.36, Math.PI], ['chest_q', -0.3, 0.25, 0], ['torch_standing', 0, 0, 0]],
  dungeon: [['cell_bars', 0, -0.1, 0], ['shackles', -0.3, -0.42, 0], ['straw_pile', 0.25, -0.3, 0], ['candles', 0.3, 0.3, 0]],
  chapel: [['altar', 0, -0.38, 0], ['pew', -0.2, 0, 0], ['pew', 0.2, 0, 0], ['pew', -0.2, 0.2, 0], ['pew', 0.2, 0.2, 0], ['candle_stand', -0.35, -0.35, 0], ['candle_stand', 0.35, -0.35, 0]],
  kitchen: [['hearth', 0, -0.4, 0], ['kitchen_table', 0, 0.05, 0], ['stool', -0.15, 0.2, 0], ['barrel', 0.38, 0.3, 0], ['pot_shelf', 0.35, -0.42, 0]],
  tavern: [['bar_counter', 0, -0.3, 0], ['cask', -0.35, -0.42, Math.PI / 2], ['round_table', -0.2, 0.15, 0], ['round_table', 0.2, 0.2, 0], ['stool', -0.25, 0.25, 0], ['stool', 0.15, 0.3, 0], ['fireplace', 0.42, 0, -Math.PI / 2]],
  workshop: [['workbench', -0.2, -0.3, 0], ['forge', 0.25, -0.3, 0], ['anvil', 0.15, 0.05, 0], ['barrel', -0.35, 0.3, 0]],
  storage: [['crate_large', -0.3, -0.3, 0], ['crate', 0.3, -0.3, 0.3], ['barrel', 0.3, 0.25, 0], ['hay_bales', -0.25, 0.25, 0]],
  stable: [['hay_bales', -0.35, -0.3, 0], ['water_trough', 0.25, -0.38, 0], ['straw_pile', 0, 0.2, 0]],
};

export interface PresetResult { building: BuildingDef; furniture: PlacedObject[] }

export function makeBuilding(kind: BuildingKind, pos: [number, number, number], rotY = 0, over: Partial<BuildingDef> = {}, furnish = true): PresetResult {
  const spec = SPECS[kind] ?? SPECS.cottage;
  const b: BuildingDef = {
    id: uid('bld'), kind, name: spec.name, pos, rotY, shape: spec.shape, width: spec.w, depth: spec.shape === 'round' ? spec.w : spec.d,
    floors: [], wallThickness: spec.t, material: spec.mat, roof: spec.roof, roofColor: spec.roofColor, crenellations: spec.cren, openings: [], extra: { ...(spec.extra ?? {}) },
    ...over,
  };
  const hw = b.width / 2 - b.wallThickness, hd = (b.shape === 'round' ? b.width : b.depth) / 2 - b.wallThickness;
  const levels = spec.floors.filter((f) => f.level >= 0);
  const top = levels[levels.length - 1]?.level ?? 0;
  b.floors = spec.floors.map((f): FloorDef => ({
    level: f.level, height: f.h, walls: [], stairs: [],
    rooms: [{ id: uid('rm'), name: f.room, type: f.type, rect: [-hw, -hd, hw, hd], floorMat: f.floor ?? 'plank', wallMat: f.wall ?? 'plaster', ceiling: f.ceil ?? 'flat' }],
    floorMat: f.floor ?? 'plank', wallMat: f.wall ?? 'plaster', ceiling: f.ceil ?? 'flat',
  }));
  for (const f of b.floors) f.stairs = stairsFor(b, spec, f, f.level === top);
  // basement stair from the dungeon up
  const bas = b.floors.find((f) => f.level === -1);
  if (bas) bas.stairs = stairsFor(b, spec, bas, false);
  b.openings = autoOpenings(b, spec);
  const furniture: PlacedObject[] = [];
  if (furnish) {
    for (const f of b.floors) {
      const r = f.rooms[0];
      const list = ROOM_FURNITURE[r.type];
      if (!list) continue;
      const y = levelBase(b, f.level) + 0.03;
      for (const [id, fx, fz, rot, ox = 0, oz = 0] of list) {
        const x = fx * 2 * hw * 0.92 + ox, z = fz * 2 * hd * 0.92 + oz;
        // keep clear of the stairwell
        if (f.stairs.some((s) => Math.hypot(s.pos[0] - x, s.pos[1] - z) < 2.2) || b.floors.find((g) => g.level === f.level - 1)?.stairs.some((s) => Math.hypot(s.pos[0] - x, s.pos[1] - z) < 2.2)) continue;
        if (b.shape === 'round' && Math.hypot(x, z) > hw - 0.8) continue;
        const ceilingItem = id === 'chandelier';
        furniture.push({ id: uid('obj'), catalogId: id, pos: [x, ceilingItem ? y + f.height - 0.3 : y, z], rotY: rot, scale: 1, buildingId: b.id, floor: f.level });
      }
    }
  }
  return { building: b, furniture };
}

export function presetInfo(kind: BuildingKind) { return PRESETS.find((p) => p.kind === kind); }
