import type { V2, V3 } from './math';

/** Terrain grid: WORLD_SIZE metres square, centred on origin, GRID cells per side (1 m). */
export const WORLD_SIZE = 1024;
export const GRID = 1024;
export const VERTS = GRID + 1;
export const CELL = WORLD_SIZE / GRID;
export const HALF = WORLD_SIZE / 2;

export const GROUND_LAYERS = [
  'grass', 'meadow', 'dirt', 'mud', 'gravel', 'cobblestone', 'sand', 'farmland', 'forest', 'rock',
] as const;
export type GroundLayer = (typeof GROUND_LAYERS)[number];

export type MaterialKind = 'greystone' | 'sandstone' | 'whitewash' | 'timber' | 'brick' | 'redlacquer' | 'greybrick';
/** 'eaves' = Chinese hip roof with concave slopes and upturned corners (see buildings/chineseRoof.ts) */
export type RoofStyle = 'conical' | 'pitched' | 'flat' | 'hipped' | 'eaves' | 'lean' | 'none';

export interface WaterBody {
  id: string;
  kind: 'pond' | 'stream';
  points: V2[];
  /** pond: water surface height; stream: unused (follows terrain) */
  level: number;
  width: number; // stream width
  depth: number; // carve depth
  waterfall: boolean; // streams: add waterfalls on steep drops
}

export interface Moat {
  id: string;
  points: V2[]; // closed loop
  width: number;
  depth: number;
  edging: 'stone' | 'earth';
  level: number; // water surface height (computed on creation)
}

export type PathStyle = 'dirt' | 'gravel' | 'cobblestone';
export interface PathDef {
  id: string;
  points: V2[];
  width: number;
  style: PathStyle;
}

export type FenceStyle = 'rail' | 'picket' | 'wattle' | 'drystone' | 'hedge' | 'castle' | 'cn_wall' | 'bamboo';
export interface FenceDef {
  id: string;
  points: V2[];
  closed: boolean;
  style: FenceStyle;
  height: number;
  /** segment indices that contain a gate at their midpoint */
  gates: number[];
  /** fences generated together (e.g. a hedge maze) share a group and are selected together */
  group?: string;
}

export interface RetainingWallDef {
  id: string;
  points: V2[];
  /** raise terrain on the left side to this height above the line (terrace) */
  height: number;
  terrace: boolean;
}

export interface VegetationKindDef {
  id: string;
  name: string;
  group: 'tree' | 'shrub' | 'flower' | 'grass' | 'rock' | 'water';
}
/** Packed vegetation instances: per kind, flat array [x, z, scale, rotY, tint] */
export type VegetationData = Record<string, number[]>;

export interface PlacedObject {
  id: string;
  catalogId: string;
  pos: V3; // world (or building-local if buildingId set)
  rotY: number;
  scale: number;
  buildingId?: string;
  floor?: number;
  tint?: string;
}

// ---------- Buildings + interiors ----------
export type OpeningKind =
  | 'door_wood' | 'door_arched' | 'door_double' | 'archway'
  | 'window_arched' | 'window_stained' | 'window_shutter' | 'arrow_slit'
  | 'door_lattice' | 'window_lattice';
export interface Opening {
  id: string;
  /** 'ext:<edgeIndex>' for exterior wall edges or interior wall id */
  wall: string;
  /** floor level the opening is on */
  floor: number;
  t: number; // 0..1 along wall
  kind: OpeningKind;
  width: number;
  height: number;
  sill: number;
}
export type SurfaceMat = 'stone' | 'plaster' | 'woodpanel' | 'tapestry' | 'plank' | 'flagstone' | 'rug' | 'brick' | 'whitewash' | 'redlacquer' | 'squaretile'
  | 'hardwood' | 'carpet' | 'whitetile' | 'paint';
export type CeilingStyle = 'flat' | 'beamed' | 'vaulted';
export interface InteriorWall {
  id: string;
  a: V2; // building-local
  b: V2;
  thickness: number;
  material: SurfaceMat;
}
export type RoomType =
  | 'hall' | 'bedroom' | 'kitchen' | 'library' | 'armory' | 'chapel' | 'cellar'
  | 'dungeon' | 'throne' | 'storage' | 'tavern' | 'shop' | 'workshop' | 'stable' | 'generic'
  | 'living' | 'dining' | 'bathroom' | 'closet' | 'hallway' | 'laundry' | 'office' | 'pantry';
export interface Room {
  id: string;
  name: string;
  type: RoomType;
  /** building-local rectangle [minX, minZ, maxX, maxZ] */
  rect: [number, number, number, number];
  floorMat: SurfaceMat;
  wallMat: SurfaceMat;
  ceiling: CeilingStyle;
}
export interface Stair {
  id: string;
  kind: 'straight' | 'spiral';
  pos: V2; // local
  rotY: number;
  /** connects floor `from` to from+1 */
  from: number;
  width: number;
}
export interface FloorDef {
  level: number; // 0 = ground, negative = basement
  height: number;
  walls: InteriorWall[];
  rooms: Room[];
  stairs: Stair[];
  floorMat: SurfaceMat;
  wallMat: SurfaceMat;
  ceiling: CeilingStyle;
}

export type BuildingKind =
  | 'keep' | 'tower_round' | 'tower_square' | 'gatehouse' | 'great_hall' | 'chapel' | 'barracks'
  | 'armory' | 'stables' | 'well' | 'cottage' | 'cottage_timber' | 'cottage_stone' | 'longhouse'
  | 'tavern' | 'blacksmith' | 'bakery' | 'market_stall' | 'watermill' | 'windmill' | 'church'
  | 'workshop' | 'storehouse' | 'barn' | 'chicken_coop' | 'pig_pen' | 'dovecote' | 'greenhouse'
  | 'beehive' | 'custom'
  | 'cn_hall' | 'cn_temple' | 'cn_pagoda' | 'cn_gate' | 'cn_pavilion' | 'cn_house' | 'cn_teahouse' | 'cn_residence' | 'manor' | 'range';

export interface BuildingDef {
  id: string;
  kind: BuildingKind;
  name: string;
  pos: V3; // ground centre; y = base elevation
  rotY: number;
  shape: 'rect' | 'round';
  width: number; // rect: X size; round: diameter
  depth: number;
  floors: FloorDef[]; // sorted by level
  wallThickness: number;
  material: MaterialKind;
  roof: RoofStyle;
  roofColor: string;
  crenellations: boolean;
  openings: Opening[];
  /** per-kind extra params: drawbridge open, portcullis, mill wheel etc */
  extra: Record<string, number | string | boolean>;
}

export interface CurtainWallDef {
  id: string;
  points: V2[];
  closed: boolean;
  height: number;
  thickness: number;
  material: MaterialKind;
  towers: 'round' | 'square' | 'none';
  towerFloors: number;
  towerRoof: RoofStyle;
  walkway: boolean;
  /** segment index where a gatehouse sits (built as a separate BuildingDef) */
  gateSegments: number[];
  buttresses?: boolean;
  /** flip which side counts as "outside" (merlons, buttresses) */
  flip?: boolean;
}

export type CropKind = 'wheat' | 'corn' | 'barley' | 'vegetables' | 'pumpkins' | 'vineyard' | 'orchard' | 'flowers';
export interface FieldDef {
  id: string;
  points: V2[];
  crop: CropKind;
  stage: number; // 0 plowed .. 3 mature/harvest
  rowAngle: number;
}

export interface PastureDef {
  id: string;
  points: V2[];
  fenceId: string | null;
  name: string;
}

export type Species = 'horse' | 'cow' | 'sheep' | 'goat' | 'pig' | 'chicken' | 'duck' | 'dog' | 'deer';
export interface AnimalDef {
  id: string;
  species: Species;
  pos: V2;
  pastureId: string | null;
  /** for ducks: water body / moat id they swim on */
  waterId?: string | null;
  scale: number;
  /** catalog model variant (e.g. horse_white, bull, donkey, husky); defaults per species */
  variant?: string;
}

export interface Viewpoint {
  id: string;
  name: string;
  pos: V3;
  target: V3;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'overcast' | 'rain' | 'fog';

export interface EstateSettings {
  timeOfDay: number; // hours 0-24
  dayCycle: boolean;
  season: Season;
  weather: Weather;
  birds: boolean;
  gridSize: number; // metres
  snap: boolean;
}

export interface EstateDoc {
  version: 1;
  id: string;
  name: string;
  created: number;
  modified: number;
  boundary: V2[];
  heights: Float32Array; // VERTS*VERTS
  splat: Uint8Array; // GRID*GRID*12 (3 RGBA maps interleaved as 3 separate planes: [plane][y][x][4])
  water: WaterBody[];
  moats: Moat[];
  paths: PathDef[];
  fences: FenceDef[];
  retaining: RetainingWallDef[];
  vegetation: VegetationData;
  objects: PlacedObject[];
  buildings: BuildingDef[];
  walls: CurtainWallDef[];
  fields: FieldDef[];
  pastures: PastureDef[];
  animals: AnimalDef[];
  viewpoints: Viewpoint[];
  settings: EstateSettings;
}

/** Collections of id'd entities in the doc that commands operate on generically. */
export type CollectionKey =
  | 'water' | 'moats' | 'paths' | 'fences' | 'retaining' | 'objects' | 'buildings'
  | 'walls' | 'fields' | 'pastures' | 'animals' | 'viewpoints';
export type EntityOf<K extends CollectionKey> = EstateDoc[K][number];

export type Layer = 'terrain' | 'vegetation' | 'water' | 'buildings' | 'interiors' | 'animals' | 'paths' | 'farming' | 'props';
