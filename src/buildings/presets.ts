import { uid } from '../core/store';
import type { BuildingDef, BuildingKind, CeilingStyle, FloorDef, MaterialKind, Opening, OpeningKind, PlacedObject, RoofStyle, RoomType, Stair, SurfaceMat } from '../core/types';
import { edgeCount, footprint, frontEdge, levelBase, levelInset } from './footprint';
import { DEFAULT_PROGRAM, furnishBuilding, generatePlan, type Program } from '../interiors/planGenerator';

export interface PresetInfo {
  kind: BuildingKind;
  label: string;
  group: 'castle' | 'village' | 'farm' | 'chinese';
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
  { kind: 'range', label: 'Wall range', group: 'castle', desc: 'Lodgings built against the curtain wall: lean-to roof, arcade', icon: '🏘' },
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
  { kind: 'manor', label: 'Manor house', group: 'village', desc: '5 bed, 4 bath family home over 3 floors', icon: '🏛' },
  { kind: 'barn', label: 'Barn', group: 'farm', desc: 'Large barn with double doors', icon: '🏚' },
  { kind: 'chicken_coop', label: 'Chicken coop', group: 'farm', desc: 'Small coop', icon: '🐔' },
  { kind: 'pig_pen', label: 'Pig shed', group: 'farm', desc: 'Shelter for a pig pen', icon: '🐖' },
  { kind: 'dovecote', label: 'Dovecote', group: 'farm', desc: 'Round dovecote', icon: '🕊' },
  { kind: 'greenhouse', label: 'Greenhouse', group: 'farm', desc: 'Glass-walled greenhouse', icon: '🌱' },
  { kind: 'cn_hall', label: 'Palace hall', group: 'chinese', desc: 'Double-eaved throne hall on a stone terrace', icon: '🏯' },
  { kind: 'cn_temple', label: 'Temple', group: 'chinese', desc: 'Prayer hall with altar, drum and gong', icon: '🛕' },
  { kind: 'cn_pagoda', label: 'Pagoda', group: 'chinese', desc: 'Five storeys, an eave on every floor', icon: '🗼' },
  { kind: 'cn_gate', label: 'Gate tower', group: 'chinese', desc: 'Brick gate passage with a watch hall above', icon: '⛩' },
  { kind: 'cn_pavilion', label: 'Pavilion', group: 'chinese', desc: 'Open garden pavilion with benches', icon: '⛱' },
  { kind: 'cn_house', label: 'Courtyard house', group: 'chinese', desc: 'Grey-brick wing with a columned porch', icon: '🏠' },
  { kind: 'cn_teahouse', label: 'Teahouse', group: 'chinese', desc: 'Two storeys of tea rooms, eaves on each', icon: '🍵' },
  { kind: 'cn_residence', label: 'Family residence', group: 'chinese', desc: '4 bed, 3 bath home over 2 floors', icon: '🏡' },
];

interface FloorSpec { level: number; h: number; room: string; type: RoomType; floor?: SurfaceMat; wall?: SurfaceMat; ceil?: CeilingStyle }
interface Spec {
  name: string; shape: 'rect' | 'round'; w: number; d: number; t: number; mat: MaterialKind; roof: RoofStyle; roofColor: string; cren: boolean;
  floors: FloorSpec[]; door: OpeningKind; win: OpeningKind; winSpacing: number; stairs: 'straight' | 'spiral' | 'none';
  extra?: BuildingDef['extra']; doorWidth?: number; doorHeight?: number;
  /** furniture set: European (default) or Chinese */
  style?: 'chinese';
  /** a home: generate a furnished floor plan (Modern interiors) with this room program */
  plan?: Partial<Program>;
}

const S = (s: Partial<Spec> & Pick<Spec, 'name' | 'w' | 'd' | 'floors'>): Spec => ({
  shape: 'rect', t: 0.6, mat: 'greystone', roof: 'pitched', roofColor: '#7a4a3a', cren: false, door: 'door_wood', win: 'window_shutter', winSpacing: 4, stairs: 'straight', ...s,
});

const SPECS: Record<string, Spec> = {
  keep: S({ name: 'Keep', w: 16, d: 14, t: 1.4, roof: 'flat', cren: true, door: 'door_arched', win: 'window_arched', winSpacing: 4.5, stairs: 'spiral', roofColor: '#555b66', plan: { bedrooms: 5, bathrooms: 4 },
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
  cottage: S({ name: 'Cottage', w: 10, d: 7, t: 0.45, mat: 'whitewash', roof: 'pitched', win: 'window_shutter', winSpacing: 3, stairs: 'none', plan: { bedrooms: 1, bathrooms: 1, living: false, dining: false, office: false, laundry: false },
    floors: [{ level: 0, h: 3, room: 'Hall & Kitchen', type: 'kitchen', floor: 'flagstone', wall: 'plaster', ceil: 'beamed' }], extra: { thatch: true, chimney: true } }),
  cottage_timber: S({ name: 'Timber Cottage', w: 10, d: 8, t: 0.4, mat: 'timber', roof: 'pitched', roofColor: '#8a4632', win: 'window_shutter', winSpacing: 3, plan: { bedrooms: 2, bathrooms: 1, dining: false, office: false, laundry: false },
    floors: [{ level: 0, h: 3, room: 'Living Room', type: 'kitchen', floor: 'plank', wall: 'plaster', ceil: 'beamed' }, { level: 1, h: 2.8, room: 'Bedroom', type: 'bedroom', floor: 'plank', wall: 'plaster', ceil: 'beamed' }], extra: { chimney: true } }),
  cottage_stone: S({ name: 'Stone Cottage', w: 12, d: 7, t: 0.6, mat: 'greystone', roof: 'pitched', roofColor: '#4f5560', win: 'window_shutter', winSpacing: 3, stairs: 'none', plan: { bedrooms: 1, bathrooms: 1, dining: false, office: false, laundry: false },
    floors: [{ level: 0, h: 3.2, room: 'Cottage', type: 'kitchen', floor: 'flagstone', wall: 'whitewash', ceil: 'beamed' }], extra: { chimney: true } }),
  longhouse: S({ name: 'Longhouse', w: 18, d: 7, t: 0.45, mat: 'timber', roof: 'pitched', win: 'window_shutter', winSpacing: 4.5, door: 'door_double', stairs: 'none', plan: { bedrooms: 2, bathrooms: 1, dining: false, office: false, laundry: false },
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
  range: S({ name: 'Lodging Range', w: 24, d: 8, t: 0.8, mat: 'greystone', roof: 'lean', roofColor: '#4f5560', win: 'window_arched', winSpacing: 3.4, door: 'door_arched', stairs: 'none', plan: { bedrooms: 3, bathrooms: 2, dining: false, laundry: false },
    floors: [{ level: 0, h: 3.4, room: 'Hall', type: 'hall' }, { level: 1, h: 3.2, room: 'Chambers', type: 'bedroom' }], extra: { arcade: 2.6, backToWall: true, roofRise: 2.6, chimney: true } }),
  manor: S({ name: 'Manor House', w: 22, d: 13, t: 0.6, mat: 'sandstone', roof: 'hipped', roofColor: '#5b4a42', win: 'window_shutter', winSpacing: 3, door: 'door_double', stairs: 'none', plan: { bedrooms: 5, bathrooms: 4 },
    floors: [{ level: 0, h: 3.4, room: 'Hall', type: 'hall' }, { level: 1, h: 3.1, room: 'Bedrooms', type: 'bedroom' }, { level: 2, h: 3, room: 'Bedrooms', type: 'bedroom' }], extra: { chimney: true } }),
  cn_residence: S({ name: 'Family Residence', w: 20, d: 12, t: 0.5, mat: 'greybrick', roof: 'eaves', roofColor: '#737980', door: 'door_lattice', win: 'window_lattice', winSpacing: 2.8, stairs: 'none', doorWidth: 1.8, doorHeight: 2.7, style: 'chinese', plan: { bedrooms: 4, bathrooms: 3 },
    floors: [{ level: 0, h: 3.6, room: 'Hall', type: 'hall' }, { level: 1, h: 3.3, room: 'Bedrooms', type: 'bedroom' }], extra: { columns: 1.3, tiers: true, hip: 0.4, terrace: 1.4 } }),
  // ---- Chinese (roof 'eaves': see chineseRoof.ts for the extra flags) ----
  cn_hall: S({ name: 'Hall of Supreme Harmony', w: 24, d: 13, t: 0.6, mat: 'redlacquer', roof: 'eaves', roofColor: '#d9a21e', door: 'door_lattice', win: 'window_lattice', winSpacing: 3.4, stairs: 'none', doorWidth: 2.6, doorHeight: 3.6, style: 'chinese',
    floors: [{ level: 0, h: 7, room: 'Throne Hall', type: 'throne', floor: 'squaretile', wall: 'redlacquer', ceil: 'beamed' }], extra: { columns: 1.8, terrace: 4, doubleEave: true, hip: 1 } }),
  cn_temple: S({ name: 'Temple of Heavenly Peace', w: 16, d: 11, t: 0.55, mat: 'redlacquer', roof: 'eaves', roofColor: '#3f7a5c', door: 'door_lattice', win: 'window_lattice', winSpacing: 3.2, stairs: 'none', doorWidth: 2.4, doorHeight: 3.4, style: 'chinese',
    floors: [{ level: 0, h: 6, room: 'Prayer Hall', type: 'chapel', floor: 'squaretile', wall: 'redlacquer', ceil: 'beamed' }], extra: { columns: 1.5, terrace: 2.5, doubleEave: true, hip: 0.45 } }),
  cn_pagoda: S({ name: 'Pagoda', w: 9, d: 9, t: 0.6, mat: 'whitewash', roof: 'eaves', roofColor: '#5d6f7a', door: 'door_lattice', win: 'window_lattice', winSpacing: 3, stairs: 'spiral', style: 'chinese',
    floors: [{ level: 0, h: 4, room: 'Shrine', type: 'chapel', floor: 'squaretile', wall: 'redlacquer', ceil: 'beamed' }, { level: 1, h: 3.4, room: 'Sutra Library', type: 'library', floor: 'plank', wall: 'whitewash', ceil: 'beamed' },
      { level: 2, h: 3.4, room: 'Meditation Room', type: 'generic', floor: 'plank', wall: 'whitewash', ceil: 'beamed' }, { level: 3, h: 3.2, room: 'Bell Room', type: 'generic', floor: 'plank', wall: 'whitewash', ceil: 'beamed' },
      { level: 4, h: 3.2, room: 'Lookout', type: 'generic', floor: 'plank', wall: 'whitewash', ceil: 'beamed' }], extra: { tiers: true, hip: 1, terrace: 1.6, finial: true, taper: 0.4 } }),
  cn_gate: S({ name: 'Gate Tower', w: 13, d: 8, t: 1.0, mat: 'greybrick', roof: 'eaves', roofColor: '#6f747c', door: 'archway', win: 'window_lattice', winSpacing: 3.2, stairs: 'straight', doorWidth: 3.4, doorHeight: 4.2, style: 'chinese',
    floors: [{ level: 0, h: 5.4, room: 'Gate Passage', type: 'generic', floor: 'flagstone', wall: 'stone' }, { level: 1, h: 4, room: 'Watch Hall', type: 'armory', floor: 'plank', wall: 'redlacquer', ceil: 'beamed' }], extra: { hip: 0.5, tiers: true } }),
  cn_pavilion: S({ name: 'Pavilion', w: 5.5, d: 5.5, t: 0.2, mat: 'redlacquer', roof: 'eaves', roofColor: '#2f6b55', door: 'archway', win: 'window_lattice', winSpacing: 99, stairs: 'none', style: 'chinese',
    floors: [{ level: 0, h: 3.4, room: 'Pavilion', type: 'generic', floor: 'squaretile', wall: 'redlacquer' }], extra: { open: true, hip: 1, terrace: 0.9, finial: true } }),
  cn_house: S({ name: 'Courtyard House', w: 13, d: 6.5, t: 0.45, mat: 'greybrick', roof: 'eaves', roofColor: '#737980', door: 'door_lattice', win: 'window_lattice', winSpacing: 3, stairs: 'none', doorWidth: 1.6, doorHeight: 2.6, style: 'chinese', plan: { bedrooms: 2, bathrooms: 1, dining: false, office: false, laundry: false },
    floors: [{ level: 0, h: 3.6, room: 'Family Hall', type: 'hall', floor: 'squaretile', wall: 'whitewash', ceil: 'beamed' }], extra: { columns: 1.3, hip: 0.25, terrace: 1.6 } }),
  cn_teahouse: S({ name: 'Teahouse', w: 12, d: 9, t: 0.4, mat: 'redlacquer', roof: 'eaves', roofColor: '#33604f', door: 'door_lattice', win: 'window_lattice', winSpacing: 2.6, doorWidth: 2, doorHeight: 2.8, style: 'chinese',
    floors: [{ level: 0, h: 3.6, room: 'Tea Room', type: 'tavern', floor: 'plank', wall: 'woodpanel', ceil: 'beamed' }, { level: 1, h: 3.3, room: 'Upper Tea Room', type: 'tavern', floor: 'plank', wall: 'redlacquer', ceil: 'beamed' }], extra: { columns: 1.2, tiers: true, hip: 0.6 } }),
};

/** Doors on the front edge, windows spread around all edges & floors. */
function autoOpenings(b: BuildingDef, spec: Spec): Opening[] {
  const ops: Opening[] = [];
  const pts0 = footprint(b, b.wallThickness / 2);
  const n = edgeCount(b), front = frontEdge(b);
  const dw = spec.doorWidth ?? (spec.door === 'door_double' ? 2.2 : spec.door === 'archway' ? 3 : 1.25);
  const dh = spec.doorHeight ?? (spec.door === 'door_double' ? 3 : 2.4);
  ops.push({ id: uid('op'), wall: `ext:${front}`, floor: 0, t: 0.5, kind: spec.door, width: dw, height: dh, sill: 0 });
  if (b.extra.open) return [];
  if (b.kind === 'gatehouse' || b.kind === 'cn_gate') ops.push({ id: uid('op'), wall: `ext:${(front + 2) % n}`, floor: 0, t: 0.5, kind: 'archway', width: dw, height: dh, sill: 0 });
  for (const f of b.floors) {
    if (f.level < 0) continue;
    const pts = levelInset(b, f.level) ? footprint(b, b.wallThickness / 2 + levelInset(b, f.level)) : pts0;
    const isSlit = spec.win === 'arrow_slit';
    const isLattice = spec.win === 'window_lattice';
    const ww = isSlit ? 0.3 : spec.win === 'window_stained' ? 1.3 : isLattice ? 1.5 : 1.0;
    const wh = isSlit ? 1.4 : spec.win === 'window_stained' ? Math.min(3.4, f.height - 1.8) : isLattice ? Math.min(f.height - 1.5, 2.2) : 1.3;
    const sill = isSlit ? 1.3 : spec.win === 'window_stained' ? 1.4 : isLattice ? 0.9 : Math.min(1.0, f.height * 0.33);
    if (wh < 0.6 || ((b.kind === 'gatehouse' || b.kind === 'cn_gate') && f.level === 0)) continue;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[(i + 1) % n];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (b.shape === 'round' && i % 2 === 1) continue;
      const k = b.shape === 'round' ? 1 : Math.floor(L / spec.winSpacing);
      for (let j = 0; j < k; j++) {
        const t = (j + 0.5) / k;
        if (f.level === 0 && i === front && Math.abs(t - 0.5) * L < dw / 2 + ww / 2 + 0.4) continue;
        if (b.extra.waterwheel && i === 1) continue;
        if (b.extra.backToWall && i === 0) continue; // blank back wall against a curtain wall
        ops.push({ id: uid('op'), wall: `ext:${i}`, floor: f.level, t, kind: spec.win, width: ww, height: wh, sill });
      }
    }
  }
  return ops;
}

function stairsFor(b: BuildingDef, spec: Spec, f: FloorDef, isTop: boolean): Stair[] {
  if (isTop || spec.stairs === 'none') return [];
  const inner = b.wallThickness;
  // keep the stairwell inside the storey it arrives on (tapering buildings)
  const ins = levelInset(b, f.level + 1);
  if (spec.stairs === 'spiral' || b.shape === 'round') {
    const pos: [number, number] = b.shape === 'round' ? [0, 0] : [-b.width / 2 + inner + 1.6 + ins, -b.depth / 2 + inner + 1.6 + ins];
    return [{ id: uid('st'), kind: 'spiral', pos, rotY: f.level * 1.3, from: f.level, width: 1.2 }];
  }
  return [{ id: uid('st'), kind: 'straight', pos: [-b.width / 2 + inner + 0.75 + ins, -b.depth / 2 + inner + 0.2 + ins], rotY: 0, from: f.level, width: 1.1 }];
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

/** Chinese starter furniture (same format as ROOM_FURNITURE). */
const CN_ROOM_FURNITURE: Partial<Record<RoomType, [string, number, number, number, number?, number?][]>> = {
  throne: [['cn_throne', 0, -0.32, 0], ['cn_vase', -0.3, -0.35, 0], ['cn_vase', 0.3, -0.35, 0], ['cn_incense_burner', -0.18, 0.05, 0], ['cn_incense_burner', 0.18, 0.05, 0], ['cn_lantern_hanging', -0.2, 0, 0], ['cn_lantern_hanging', 0.2, 0, 0], ['rug_runner', 0, 0.15, 0]],
  chapel: [['cn_altar', 0, -0.36, 0], ['cn_incense_burner', 0, 0.05, 0], ['cn_drum', -0.35, -0.2, Math.PI / 2], ['cn_gong', 0.35, -0.2, -Math.PI / 2], ['cn_lantern_hanging', 0, -0.1, 0]],
  hall: [['cn_tea_table', 0, 0.05, 0], ['cn_armchair', -0.2, -0.3, 0], ['cn_armchair', 0.2, -0.3, 0], ['cn_screen', 0, -0.42, 0], ['cn_vase', 0.4, -0.35, 0], ['cn_lantern_hanging', 0, 0, 0]],
  bedroom: [['cn_canopy_bed', -0.25, -0.2, 0], ['cn_cabinet', 0.3, -0.38, 0], ['cn_screen', 0.25, 0.25, Math.PI], ['cn_lantern_hanging', 0, 0, 0]],
  library: [['cn_desk', 0.1, -0.15, 0], ['cn_armchair', 0.1, 0.05, Math.PI], ['cn_cabinet', -0.32, -0.38, 0], ['cn_bonsai', 0.35, -0.38, 0], ['cn_vase', -0.35, 0.3, 0]],
  tavern: [['cn_tea_table', -0.22, -0.15, 0], ['cn_tea_table', 0.22, -0.15, 0], ['cn_tea_table', -0.22, 0.22, 0], ['cn_tea_table', 0.22, 0.22, 0], ['cn_lantern_hanging', -0.2, 0, 0], ['cn_lantern_hanging', 0.2, 0, 0]],
  armory: [['weapon_rack', -0.2, -0.36, 0], ['cn_drum', 0.25, -0.2, 0], ['cn_lantern_hanging', 0, 0, 0]],
  generic: [['cn_table_set', 0, 0, 0]],
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
    rooms: [{ id: uid('rm'), name: f.room, type: f.type, rect: [-hw + levelInset(b, f.level), -hd + levelInset(b, f.level), hw - levelInset(b, f.level), hd - levelInset(b, f.level)], floorMat: f.floor ?? 'plank', wallMat: f.wall ?? 'plaster', ceiling: f.ceil ?? 'flat' }],
    floorMat: f.floor ?? 'plank', wallMat: f.wall ?? 'plaster', ceiling: f.ceil ?? 'flat',
  }));
  for (const f of b.floors) f.stairs = stairsFor(b, spec, f, f.level === top);
  // basement stair from the dungeon up
  const bas = b.floors.find((f) => f.level === -1);
  if (bas) bas.stairs = stairsFor(b, spec, bas, false);
  b.openings = autoOpenings(b, spec);
  if (spec.plan) {
    // homes come with a furnished floor plan
    generatePlan(b, { ...DEFAULT_PROGRAM, ...spec.plan }, 'modern');
    return { building: b, furniture: furnish ? furnishBuilding(b) : [] };
  }
  const furniture: PlacedObject[] = [];
  if (furnish) {
    for (const f of b.floors) {
      const r = f.rooms[0];
      const list = (spec.style === 'chinese' ? CN_ROOM_FURNITURE : ROOM_FURNITURE)[r.type];
      if (spec.style === 'chinese' && r.type === 'generic' && !b.extra.open) continue;
      if (!list) continue;
      const y = levelBase(b, f.level) + 0.03;
      for (const [id, fx, fz, rot, ox = 0, oz = 0] of list) {
        const li = levelInset(b, f.level);
        const x = fx * 2 * (hw - li) * 0.92 + ox, z = fz * 2 * (hd - li) * 0.92 + oz;
        // keep clear of the stairwell
        if (f.stairs.some((s) => Math.hypot(s.pos[0] - x, s.pos[1] - z) < 2.2) || b.floors.find((g) => g.level === f.level - 1)?.stairs.some((s) => Math.hypot(s.pos[0] - x, s.pos[1] - z) < 2.2)) continue;
        if (b.shape === 'round' && Math.hypot(x, z) > hw - li - 0.8) continue;
        const ceilingItem = id === 'chandelier' || id === 'cn_lantern_hanging';
        furniture.push({ id: uid('obj'), catalogId: id, pos: [x, ceilingItem ? y + f.height - 0.3 : y, z], rotY: rot, scale: 1, buildingId: b.id, floor: f.level });
      }
    }
  }
  return { building: b, furniture };
}

export function presetInfo(kind: BuildingKind) { return PRESETS.find((p) => p.kind === kind); }
