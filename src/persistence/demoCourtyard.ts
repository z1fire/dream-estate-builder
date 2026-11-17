import type { App } from '../app/App';
import { moatAroundWall, setFloors, wallBuildings } from '../buildings/BuildingTools';
import { makeBuilding } from '../buildings/presets';
import { backOntoWall, lineWallWithRanges, type RangeOpts, type RangeUse } from '../buildings/wallRanges';
import { newEstate } from '../core/estate';
import { bboxOf, offsetPolyline, pointInPolygon, polygonSignedArea, rng, type V2 } from '../core/math';
import { uid } from '../core/store';
import {
  HALF, type AnimalDef, type BuildingDef, type BuildingKind, type CropKind, type CurtainWallDef, type EstateDoc, type FenceDef, type FenceStyle,
  type FieldDef, type PastureDef, type PathDef, type PlacedObject, type Species, type Viewpoint, type WaterBody,
} from '../core/types';
import { DEFAULT_PROGRAM, furnishBuilding, generatePlan } from '../interiors/planGenerator';
import { heightAt } from '../terrain/heightfield';
import { shape } from './demo';

/**
 * "The Hundred Acre Estate": a palace-style courtyard castle whose curtain wall is lined with ranges (lodgings, stables,
 * barracks, storehouses) around three courts in a row — the outer service court behind the gate, the ceremonial court with
 * its fountain and parterres, and the private garden before the palace — inside a moat. Around it on ~100 acres: a rental
 * village by the lake, a tournament ground, farmland with a windmill, horse and cattle pastures, a pond with a pavilion,
 * and woodland trails.
 */
export async function buildCourtyardDemo(app: App): Promise<EstateDoc> {
  const boundary: V2[] = [[-360, -290], [-58, -320], [262, -300], [350, -116], [340, 194], [165, 320], [-204, 310], [-368, 58]];
  const doc = newEstate('The Hundred Acre Estate', boundary, { hills: 2.2, seed: 41 });
  doc.settings.timeOfDay = 15.5;
  const H = (x: number, z: number) => heightAt(doc.heights, x, z);

  // ---------------- terrain ----------------
  shape(doc, 85, -262, 18, 34, (h, w) => h + 6 * w); // windmill knoll
  const LAKE: V2 = [-130, -252], POND: V2 = [215, 228];
  shape(doc, LAKE[0], LAKE[1], 48, 30, (h, w) => h + (H(LAKE[0], LAKE[1]) - 0.6 - h) * w * 0.85);
  shape(doc, POND[0], POND[1], 30, 24, (h, w) => h + (H(POND[0], POND[1]) - 0.6 - h) * w * 0.85);
  const VIL: V2 = [-250, -150], TOURN: V2 = [-270, 65];
  const vy = H(VIL[0], VIL[1]);
  shape(doc, VIL[0], VIL[1], 75, 30, (h, w) => h + (vy - h) * w * 0.9);
  const ty = H(TOURN[0], TOURN[1]);
  shape(doc, TOURN[0], TOURN[1], 55, 25, (h, w) => h + (ty - h) * w);
  const CX = 0, CZ = -20;
  const py = H(CX, CZ) + 1.5;
  shape(doc, CX, CZ, 128, 45, (h, w) => h + (py - h) * w); // castle platform (moat included)

  const buildings: BuildingDef[] = [];
  const objects: PlacedObject[] = [];
  const add = (kind: BuildingKind, x: number, z: number, rot = 0, over: Partial<BuildingDef> = {}, name?: string) => {
    const r = makeBuilding(kind, [x, H(x, z), z], rot, over);
    if (name) r.building.name = name;
    buildings.push(r.building);
    objects.push(...r.furniture);
    return r.building;
  };
  const ob = (catalogId: string, x: number, z: number, rotY = 0, y = 0, scale = 1) => objects.push({ id: uid('obj'), catalogId, pos: [x, y, z], rotY, scale });

  // ---------------- the castle: outer wall, two cross walls with inner gates ----------------
  const HX = 60, N = CZ - 90, S = CZ + 90, X1 = CZ + 35, X2 = CZ - 40; // north/south walls, cross walls
  const outer: CurtainWallDef = {
    id: uid('wall'), points: [[-HX, N], [HX, N], [HX, CZ], [HX, S], [-HX, S], [-HX, CZ]], closed: true, height: 10, thickness: 2.6, material: 'greystone',
    towers: 'round', towerFloors: 4, towerRoof: 'conical', walkway: true, gateSegments: [3], buttresses: false,
  };
  const cross = (z: number): CurtainWallDef => ({ id: uid('wall'), points: [[-HX + 1.3, z], [HX - 1.3, z]], closed: false, height: 9, thickness: 1.8, material: 'greystone', towers: 'none', towerFloors: 3, towerRoof: 'conical', walkway: true, gateSegments: [0] });
  const c1 = cross(X1), c2 = cross(X2);
  const walls = [outer, c1, c2];
  for (const w of walls) {
    const wb = wallBuildings(app, w);
    for (const b of wb.buildings) if (b.kind === 'gatehouse' && w !== outer) { b.extra.drawbridge = false; b.name = w === c1 ? 'Ceremonial Gate' : 'Garden Gate'; }
    buildings.push(...wb.buildings); objects.push(...wb.objects);
  }
  const gate = buildings.find((b) => b.kind === 'gatehouse' && b.name === 'Gatehouse')!;
  gate.name = 'Great Gate';

  // the palace across the north end, backing onto the wall, with two towers at its front corners
  const palD = 15;
  const pal = makeBuilding('manor', [CX, py, N + 1.35 + palD / 2], 0, { width: 32, depth: palD }, false).building;
  pal.name = 'The Palace'; pal.material = 'greystone'; pal.roofColor = '#4f5560';
  for (const f of pal.floors) if (f.level >= 0) f.height = f.level === 0 ? 4.4 : 3.6;
  backOntoWall(pal, outer.height);
  generatePlan(pal, { ...DEFAULT_PROGRAM, bedrooms: 6, bathrooms: 5 }, 'period');
  buildings.push(pal); objects.push(...furnishBuilding(pal));
  for (const s of [-1, 1]) {
    const t = makeBuilding('tower_square', [CX + s * 19.8, py, N + 1.35 + palD - 1.5], 0, {}, true);
    setFloors(t.building, 5);
    t.building.name = s < 0 ? 'West Palace Tower' : 'East Palace Tower';
    t.building.roofColor = '#4f5560';
    buildings.push(t.building); objects.push(...t.furniture.filter((o) => (o.floor ?? 0) < 5));
  }

  // ranges against the walls (each call sees what's already built, so they stop at towers, gates, cross walls and each other)
  const ctx = { buildings, walls };
  const line = (w: CurtainWallDef, segs: number[], use: RangeUse | RangeUse[], o: Partial<RangeOpts> = {}) => {
    const r = lineWallWithRanges(app, w, { use, depth: 8, storeys: 2, arcade: 2.6, maxLength: 36, segments: segs, ...o }, ctx);
    buildings.push(...r.buildings); objects.push(...r.objects);
    return r.buildings;
  };
  line(outer, [0, 1, 5], 'lodgings');
  line(outer, [2], ['lodgings', 'storerooms', 'stables']);
  line(outer, [4], ['barracks', 'workshops', 'lodgings']);
  line(outer, [3], ['stables', 'stables', 'workshops', 'storerooms']);
  const gal = line(c1, [0], 'hall', { side: -1, storeys: 1, depth: 7, arcade: 2.8 });
  const ban = line(c2, [0], 'hall', { side: 1, storeys: 1, depth: 7, arcade: 2.8 });
  gal.forEach((b, i) => (b.name = i === 0 ? 'West Gallery' : 'East Gallery'));
  ban.forEach((b, i) => (b.name = i === 0 ? 'Banqueting Hall' : 'Music Room'));
  let lodg = 0;
  for (const b of buildings) if (b.kind === 'range') b.name = `Lodgings ${String.fromCharCode(65 + lodg++)}`;

  // ---- courts ----
  // outer service court: well, carts, hay, water for the horses
  const sc = (X1 + S) / 2;
  ob('well', CX - 18, sc - 2); ob('cart', CX + 14, sc - 6, 0.5); ob('mv_wagon', CX + 26, sc + 6, -0.3); ob('hay_cart', CX - 32, sc + 8, 1.2);
  ob('hay_bales', CX - 40, sc - 6); ob('haystack', CX - 42, sc + 2, 0, 0, 0.8); ob('water_trough', CX + 38, sc + 12, Math.PI / 2); ob('feed_trough', CX + 38, sc + 4, Math.PI / 2);
  for (const [x, z] of [[CX - 26, sc - 10], [CX - 24.8, sc - 10.6], [CX + 30, sc - 8]] as V2[]) ob('barrel', x, z);
  ob('crate_large', CX + 32, sc - 10, 0.3); ob('crate', CX + 33.5, sc - 8.4, 0.9); ob('weapon_rack', CX - 40, sc - 14, Math.PI / 2);
  // ceremonial court: fountain, four parterres, cypress avenues
  const cc = (X1 + X2) / 2;
  ob('fountain_tiered', CX, cc, 0, 0, 1.3);
  const fences: FenceDef[] = [];
  const beds: V2[][] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = CX + sx * 6, x1 = CX + sx * 24, z0 = cc + sz * 4, z1 = cc + sz * 15;
    const pts: V2[] = [[Math.min(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(z0, z1)], [Math.min(x0, x1), Math.max(z0, z1)]];
    fences.push({ id: uid('fen'), points: pts, closed: true, style: 'hedge', height: 0.8, gates: [sz < 0 ? 2 : 0] });
    beds.push(pts);
    ob('statue_column', CX + sx * 15, cc + sz * 9.5);
  }
  for (const sx of [-1, 1]) for (const z of [cc - 16, cc - 8, cc, cc + 8, cc + 16]) ob('bench_stone', CX + sx * 32, z, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
  for (const sx of [-1, 1]) for (const z of [X1 - 14, X2 + 15]) { ob('lantern_post', CX + sx * 4, z); }
  // private garden: reflecting pool, blossom trees, rose arch
  const gc = (X2 + N + 1.35 + palD) / 2;
  const poolPts: V2[] = [[CX - 13, gc - 4], [CX + 13, gc - 4], [CX + 13, gc + 4], [CX - 13, gc + 4]];
  ob('rose_arch', CX, X2 - 6, 0); ob('statue_knight', CX - 16, gc, Math.PI / 2); ob('statue_knight', CX + 16, gc, -Math.PI / 2);
  for (const sx of [-1, 1]) { ob('bench_stone', CX + sx * 9, gc - 7, 0); ob('bench_stone', CX + sx * 9, gc + 7, Math.PI); ob('sundial', CX + sx * 34, gc); }
  // banners and torches at the great gate, flags on the palace
  const gx = Math.sin(gate.rotY), gz = Math.cos(gate.rotY);
  for (const s of [-1, 1]) {
    ob('torch_wall', gate.pos[0] + gx * (gate.depth / 2 + 0.1) + gz * s * 3.2, gate.pos[2] + gz * (gate.depth / 2 + 0.1) - gx * s * 3.2, gate.rotY, 3);
    ob('town_banner_red', CX + s * 5, S + 31, 0); ob('town_banner_red', CX + s * 5, S + 45, 0);
  }
  ob('banner_red', CX - 6, pal.pos[2] + palD / 2 + 0.12, 0, 5.5); ob('banner_red', CX + 6, pal.pos[2] + palD / 2 + 0.12, 0, 5.5);

  // ---------------- rental village by the lake ----------------
  const [vx, vz] = VIL;
  const north: [BuildingKind, string?][] = [['tavern', 'The Swan & Lantern'], ['cottage_timber'], ['cottage'], ['cottage_stone'], ['bakery', 'Village Bakery'], ['cottage_timber']];
  const south: [BuildingKind, string?][] = [['cottage'], ['cottage_stone'], ['blacksmith', 'Smithy'], ['cottage_timber'], ['cottage'], ['cottage_stone']];
  north.forEach(([k, n], i) => add(k, vx - 45 + i * 18, vz - 19, 0, {}, n));
  south.forEach(([k, n], i) => add(k, vx - 45 + i * 18, vz + 18, Math.PI, {}, n));
  add('church', vx - 78, vz, Math.PI / 2, {}, 'St Mary’s Church');
  add('cottage_timber', vx - 20, vz - 46, 0); add('cottage', vx + 2, vz - 44, 0.15); add('cottage_stone', vx - 30, vz + 44, Math.PI); add('cottage', vx - 8, vz + 46, Math.PI - 0.1);
  ob('well', vx, vz); ob('stall_red', vx - 14, vz - 5, 0); ob('stall_green', vx + 14, vz + 5, Math.PI); ob('market_goods', vx - 26, vz + 5, Math.PI, 0, 0.9);
  ob('signpost', vx + 40, vz - 6, 0.6); ob('bench_q', vx + 6, vz - 7, 0);

  // ---------------- tournament ground ----------------
  const [tx, tz] = TOURN;
  const lists: V2[] = [[tx - 50, tz - 24], [tx + 50, tz - 24], [tx + 50, tz + 24], [tx - 50, tz + 24]];
  fences.push({ id: uid('fen'), points: lists, closed: true, style: 'rail', height: 1.25, gates: [1] });
  fences.push({ id: uid('fen'), points: [[tx - 34, tz], [tx + 34, tz]], closed: false, style: 'rail', height: 1.25, gates: [] }); // tilt barrier
  for (let i = 0; i < 5; i++) { ob('tent', tx - 40 + i * 20, tz - 34, 0); ob('flagpole', tx - 30 + i * 20, tz - 30); }
  for (let i = 0; i < 6; i++) ob(i % 2 ? 'town_banner_green' : 'town_banner_red', tx - 45 + i * 18, tz + 27, Math.PI);
  for (let i = 0; i < 4; i++) ob('bench_long', tx - 30 + i * 20, tz + 31, 0);
  ob('weapon_rack', tx + 46, tz - 30, -Math.PI / 2); ob('armor_stand', tx + 44, tz - 34, -Math.PI / 2); ob('hay_bales', tx - 52, tz - 30); ob('hay_bales', tx + 54, tz + 10, 1.2);

  // ---------------- farm ----------------
  add('windmill', 85, -262, Math.PI * 0.9, {}, 'Estate Windmill');
  add('barn', 160, -82, 0, {}, 'Home Farm Barn');
  add('cottage_stone', 198, -86, 0, {}, 'Home Farm');
  add('chicken_coop', 222, -78, 0); add('dovecote', 136, -72); add('pig_pen', 240, -84, 0);
  ob('haystack', 176, -66); ob('hay_bale_round', 186, -64, 0.4); ob('hay_cart', 130, -110, 0.8); ob('scarecrow', 150, -260); ob('scarecrow', 205, -195);
  for (let i = 0; i < 4; i++) ob('beehive', 300 + i * 2.2, -140 + i * 1.2);
  ob('water_trough', 150, 0, 0); ob('water_trough', 280, 0, 0.3); ob('feed_trough', 220, 100, 1.2);
  const fld = (crop: CropKind, stage: number, pts: V2[], rowAngle = 0): FieldDef => ({ id: uid('fld'), points: pts, crop, stage, rowAngle });
  const fields: FieldDef[] = [
    fld('wheat', 3, [[110, -292], [180, -293], [180, -235], [110, -235]]),
    fld('barley', 3, [[188, -294], [255, -295], [270, -235], [188, -235]], Math.PI / 2),
    fld('corn', 3, [[110, -225], [170, -225], [170, -165], [110, -165]]),
    fld('vegetables', 2, [[178, -225], [225, -225], [225, -165], [178, -165]], Math.PI / 2),
    fld('pumpkins', 3, [[233, -225], [290, -225], [305, -165], [233, -165]]),
    fld('vineyard', 3, [[110, -155], [200, -155], [200, -120], [110, -120]], Math.PI / 2),
    fld('orchard', 3, [[210, -155], [300, -155], [312, -115], [210, -115]]),
    fld('flowers', 3, [[60, 120], [90, 120], [90, 150], [60, 150]]),
  ];
  const pastures: PastureDef[] = [];
  const pasture = (name: string, pts: V2[], style: FenceStyle) => {
    const f: FenceDef = { id: uid('fen'), points: pts, closed: true, style, height: style === 'drystone' ? 1.1 : 1.25, gates: [3] };
    const p: PastureDef = { id: uid('pas'), points: pts, fenceId: f.id, name };
    fences.push(f); pastures.push(p);
    return p;
  };
  const horseP = pasture('Horse Paddock', [[112, -40], [200, -40], [200, 45], [112, 45]], 'rail');
  const cowP = pasture('Cow Meadow', [[210, -40], [338, -48], [336, 45], [210, 45]], 'rail');
  const sheepP = pasture('Sheep Downs', [[120, 60], [325, 60], [318, 150], [130, 150]], 'drystone');

  // ---------------- water ----------------
  const blob = (c: V2, rx: number, rz: number, n = 14, wob = 0.12): V2[] => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2; const r = 1 + Math.sin(a * 3) * wob + Math.cos(a * 2) * wob * 0.6; return [c[0] + Math.cos(a) * rx * r, c[1] + Math.sin(a) * rz * r]; });
  const minAlong = (pts: V2[]) => Math.min(...pts.map(([x, z]) => H(x, z)));
  const lakePts = blob(LAKE, 44, 24), pondPts = blob(POND, 28, 17);
  const lake: WaterBody = { id: uid('pond'), kind: 'pond', points: lakePts, level: minAlong(lakePts) - 0.15, width: 0, depth: 2.6, waterfall: false };
  const pond: WaterBody = { id: uid('pond'), kind: 'pond', points: pondPts, level: minAlong(pondPts) - 0.15, width: 0, depth: 2, waterfall: false };
  const pool: WaterBody = { id: uid('pond'), kind: 'pond', points: poolPts, level: py - 0.2, width: 0, depth: 0.8, waterfall: false };
  const inflow: WaterBody = { id: uid('strm'), kind: 'stream', points: [[-50, -316], [-80, -294], [-105, -274]], level: 0, width: 3, depth: 0.8, waterfall: false };
  const river: WaterBody = { id: uid('strm'), kind: 'stream', points: [[-172, -236], [-165, -185], [-152, -125], [-128, -62], [-110, 0], [-118, 55], [-150, 115], [-205, 175], [-262, 228]], level: 0, width: 4, depth: 1, waterfall: false };
  const gaz = makeBuilding('cn_pavilion', [POND[0] - 6, 0, POND[1] - 25], 0, { material: 'whitewash', roof: 'conical', roofColor: '#4f5560' }, false).building;
  gaz.name = 'Lakeside Pavilion'; gaz.extra = { ...gaz.extra, open: true, terrace: 0.8, finial: true };
  gaz.pos[1] = H(gaz.pos[0], gaz.pos[2]);
  buildings.push(gaz);
  ob('bench_stone', POND[0] - 6, POND[1] - 23.5, Math.PI); ob('dock', POND[0] + 22, POND[1] - 10, -Math.PI / 3); ob('rowboat', POND[0] + 12, POND[1] - 2, 0.4);
  ob('dock', LAKE[0] - 30, LAKE[1] + 18, Math.PI / 4); ob('rowboat', LAKE[0] - 20, LAKE[1] + 10, 1.1);

  // ---------------- roads & trails ----------------
  const paths: PathDef[] = [
    { id: uid('path'), points: [[gate.pos[0], gate.pos[2]], [CX, S + 30], [CX, S + 70], [8, 200], [0, 314]], width: 5, style: 'cobblestone' },
    { id: uid('path'), points: [[CX, S + 40], [-70, 112], [-135, 82], [-168, 10], [-188, -60], [vx + 44, vz - 4]], width: 3.6, style: 'gravel' },
    { id: uid('path'), points: [[vx - 66, vz], [vx + 46, vz]], width: 5, style: 'cobblestone' },
    { id: uid('path'), points: [[CX, S + 40], [80, 106], [104, 40], [106, -60], [140, -100], [145, -112]], width: 3.4, style: 'gravel' },
    { id: uid('path'), points: [[-160, 60], [tx + 52, tz]], width: 3, style: 'dirt' },
    { id: uid('path'), points: [[8, 200], [-90, 236], [-190, 226], [-262, 180], [-300, 110]], width: 2.2, style: 'dirt' },
    { id: uid('path'), points: [[8, 200], [100, 250], [160, 236], [POND[0] - 8, POND[1] - 31]], width: 2.2, style: 'dirt' },
    { id: uid('path'), points: [[vx + 30, vz - 26], [-178, -214], [LAKE[0] - 30, LAKE[1] + 22]], width: 2.2, style: 'dirt' },
    { id: uid('path'), points: [[106, -60], [60, -150], [80, -246]], width: 2.4, style: 'dirt' },
  ];

  // ---------------- animals ----------------
  const r = rng(101);
  const animals: AnimalDef[] = [];
  const herd = (species: Species, variant: string, n: number, c: V2, spread: number, pastureId: string | null, waterId: string | null = null) => {
    for (let i = 0; i < n; i++) animals.push({ id: uid('ani'), species, variant, pos: [c[0] + (r() - 0.5) * spread, c[1] + (r() - 0.5) * spread], pastureId, waterId, scale: Math.round((0.9 + r() * 0.2) * 100) / 100 });
  };
  herd('horse', 'horse', 4, [156, 2], 50, horseP.id); herd('horse', 'horse_white', 2, [156, 2], 40, horseP.id);
  herd('cow', 'cow', 7, [272, 0], 60, cowP.id); herd('cow', 'bull', 1, [272, 0], 20, cowP.id);
  herd('sheep', 'sheep', 16, [222, 105], 90, sheepP.id);
  herd('duck', 'duck', 6, LAKE, 30, null, lake.id); herd('duck', 'duck', 4, POND, 18, null, pond.id);
  herd('chicken', 'chicken', 7, [222, -70], 8, null);
  herd('dog', 'dog', 1, [vx, vz + 6], 4, null); herd('dog', 'husky', 1, [CX + 6, sc], 4, null);
  herd('deer', 'deer', 4, [-280, 240], 30, null); herd('deer', 'stag', 1, [-290, 235], 10, null); herd('deer', 'fox', 1, [120, 280], 10, null);

  const viewpoints: Viewpoint[] = [
    { id: uid('vp'), name: 'The Hundred Acre Estate', pos: [30, py + 170, 300], target: [0, py, -40] },
    { id: uid('vp'), name: 'The Great Gate', pos: [36, py + 14, S + 62], target: [CX, py + 6, S] },
    { id: uid('vp'), name: 'Outer service court', pos: [CX - 34, py + 26, S + 6], target: [CX + 6, py, sc - 6] },
    { id: uid('vp'), name: 'Ceremonial court', pos: [CX + 36, py + 24, X1 + 10], target: [CX, py + 3, cc - 6] },
    { id: uid('vp'), name: 'Private garden & palace', pos: [CX + 22, py + 18, X2 - 2], target: [CX, py + 6, N + 10] },
    { id: uid('vp'), name: 'Rental village', pos: [vx + 70, vy + 40, vz + 70], target: [vx, vy, vz] },
    { id: uid('vp'), name: 'Tournament ground', pos: [tx + 60, ty + 30, tz + 80], target: [tx, ty, tz] },
    { id: uid('vp'), name: 'Farmland & windmill', pos: [60, py + 60, -40], target: [200, 0, -200] },
    { id: uid('vp'), name: 'Pond pavilion', pos: [POND[0] - 60, H(POND[0], POND[1]) + 20, POND[1] + 30], target: [POND[0], H(POND[0], POND[1]), POND[1] - 10] },
  ];

  for (const b of buildings) b.pos[1] = H(b.pos[0], b.pos[2]); // wall/range helpers sampled the previous terrain
  Object.assign(doc, { walls, buildings, objects, water: [lake, pond, pool, inflow, river], paths, fields, fences, pastures, animals, viewpoints, moats: [] });

  // paving painted into the base splat
  const PLANE = 1024 * 1024 * 4;
  const paint = (poly: V2[], layer: number) => {
    const bb = bboxOf(poly);
    for (let z = Math.floor(bb.minZ); z <= Math.ceil(bb.maxZ); z++)
      for (let x = Math.floor(bb.minX); x <= Math.ceil(bb.maxX); x++) {
        if (!pointInPolygon(x + 0.5, z + 0.5, poly)) continue;
        const c = ((z + HALF) * 1024 + (x + HALF)) * 4;
        for (let l = 0; l < 10; l++) doc.splat[(l >> 2) * PLANE + c + (l & 3)] = l === layer ? 255 : 0;
      }
  };
  const rect = (x0: number, z0: number, x1: number, z1: number): V2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  paint(rect(-HX, X1, HX, S), 4); // service court: gravel
  paint(rect(-HX, X2, HX, X1), 5); // ceremonial court: cobbles
  for (const b of beds) paint(b, 1); // parterre lawns
  paint(rect(-3, X2 - 2, 3, N + 20), 4); // garden walk
  paint(rect(-17, gc - 6, 17, gc + 6), 4);
  paint(rect(vx - 66, vz - 13, vx + 46, vz + 13), 5); // village street
  paint(lists, 2); // tournament lists: dirt

  // ---------------- load + derived features ----------------
  app.store.replace(doc);
  const moatCmd = moatAroundWall(app, app.water!, outer);
  if (moatCmd) app.store.batch(() => moatCmd.do());
  const moat = app.store.doc.moats[0];
  if (moat) {
    const ring = offsetPolyline(outer.points, 13, true)[polygonSignedArea(outer.points) > 0 ? 'right' : 'left'];
    for (let i = 0; i < 5; i++) { const p = ring[(i * 2 + 1) % ring.length]; app.store.doc.animals.push({ id: uid('ani'), species: 'duck', variant: 'duck', pos: [p[0], p[1]], pastureId: null, waterId: moat.id, scale: 1 }); }
    app.store.notify({ type: 'collection', key: 'animals' });
  }
  scatter(app, doc, r, { LAKE, POND, VIL, TOURN, beds, gc });
  app.cmd.clear();
  app.store.dirtySinceSave = true;
  return app.store.doc;
}

function scatter(app: App, doc: EstateDoc, r: () => number, at: { LAKE: V2; POND: V2; VIL: V2; TOURN: V2; beds: V2[][]; gc: number }) {
  const veg = doc.vegetation;
  const water = app.water!;
  const inside = (x: number, z: number) => pointInPolygon(x, z, doc.boundary);
  const put = (kind: string, x: number, z: number, s: number) => (veg[kind] ??= []).push(Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(s * 100) / 100, Math.round(r() * 628) / 100, Math.round((r() * 2 - 1) * 50) / 100);
  const keepOut: [number, number, number, number][] = [
    [-100, -150, 100, 108], // castle + moat
    [at.VIL[0] - 90, at.VIL[1] - 60, at.VIL[0] + 55, at.VIL[1] + 60], // village
    [at.TOURN[0] - 58, at.TOURN[1] - 42, at.TOURN[0] + 58, at.TOURN[1] + 36], // lists
    [100, -305, 320, -60], [105, -45, 345, 155], // farm, fields & pastures
    [55, 115, 95, 155],
  ];
  const ok = (x: number, z: number, margin = 1) => inside(x, z) && !water.isWater(x, z, margin) && !app.isBlocked(x, z) && !keepOut.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
  const area = (minX: number, minZ: number, maxX: number, maxZ: number, n: number, kinds: string[], sMin: number, sMax: number, spacing = 0) => {
    const placed: V2[] = [];
    for (let i = 0; i < n * 3 && placed.length < n; i++) {
      const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ);
      if (!ok(x, z)) continue;
      if (spacing && placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < spacing)) continue;
      placed.push([x, z]);
      put(kinds[Math.floor(r() * kinds.length)], x, z, sMin + r() * (sMax - sMin));
    }
  };
  // woodlands: the southern forest with its trails, the western edge, the north-west behind the village
  area(-330, 160, 330, 320, 420, ['oak', 'q_common_1', 'q_common_3', 'q_common_4', 'tree_round', 'birch', 'q_pine_2', 'pine', 'q_birch_2', 'tree_broad'], 0.8, 1.3, 6);
  area(-330, 160, 330, 320, 160, ['bush', 'fern', 'bush_small', 'q_fern', 'mushrooms'], 0.7, 1.3, 2);
  area(-370, -300, -320, 160, 90, ['pine', 'spruce', 'q_pine_1', 'q_pine_3', 'oak'], 0.8, 1.3, 6);
  area(-360, -300, -180, -215, 70, ['pine', 'spruce', 'q_pine_4', 'birch', 'pine_tall'], 0.8, 1.3, 6);
  area(-60, -320, 100, -160, 60, ['oak', 'q_common_2', 'birch', 'q_maple_1', 'poplar'], 0.8, 1.2, 9);
  area(-200, -40, -100, 150, 50, ['willow', 'oak', 'birch', 'tree_round'], 0.8, 1.2, 9); // along the river
  area(100, 160, 345, 200, 30, ['oak', 'q_maple_2', 'birch'], 0.8, 1.2, 9);
  area(-320, -300, 340, 320, 260, ['q_grass_short', 'q_grass_wispy', 'q_clover', 'q_flower_clump2', 'flower_yellow', 'q_flower_white'], 0.7, 1.2, 2.5);
  // reeds and lilies around the lake and pond
  for (const [c, rx, rz] of [[at.LAKE, 60, 40], [at.POND, 42, 32]] as [V2, number, number][]) {
    for (let i = 0; i < 700; i++) {
      const x = c[0] - rx + r() * rx * 2, z = c[1] - rz + r() * rz * 2;
      const onEdge = water.surfaceAt(x, z, 2.4) !== null && water.surfaceAt(x, z, 0.3) === null;
      if (onEdge && !app.isBlocked(x, z) && r() < 0.35) put(r() < 0.6 ? 'reeds' : 'q_grass_wispy_tall', x, z, 0.8 + r() * 0.4);
      else if (water.surfaceAt(x, z, -1.5) !== null && r() < 0.06) put('lily', x, z, 0.9 + r() * 0.6);
    }
  }
  // inside the castle: cypress avenues in the ceremonial court, flowers in the parterres, blossom in the private garden
  for (const b of at.beds) {
    const bb = bboxOf(b);
    for (let i = 0; i < 70; i++) { const x = bb.minX + 1 + r() * (bb.maxX - bb.minX - 2), z = bb.minZ + 1 + r() * (bb.maxZ - bb.minZ - 2); put(['flower_red', 'flower_purple', 'q_flower_clump3', 'flower_yellow2', 'q_flower_blue'][Math.floor(r() * 5)], x, z, 0.9 + r() * 0.4); }
  }
  for (const sx of [-1, 1]) for (const z of [-56, -46, -36, -26, -16, -6, 4]) if (!app.isBlocked(sx * 40, z)) put('poplar', sx * 40, z, 1);
  for (const [x, z] of [[-30, at.gc - 8], [30, at.gc - 8], [-30, at.gc + 8], [30, at.gc + 8], [-22, at.gc + 12], [22, at.gc + 12], [-40, at.gc + 2], [40, at.gc + 2]] as V2[]) if (!app.isBlocked(x, z)) put(r() < 0.6 ? 'tree_cherry' : 'tree_plum_blossom', x, z, 0.9 + r() * 0.2);
  for (let i = 0; i < 90; i++) {
    const x = -44 + r() * 88, z = at.gc - 12 + r() * 24;
    if (Math.abs(x) < 18 && Math.abs(z - at.gc) < 7) continue;
    if (Math.abs(x) < 4) continue;
    if (!app.isBlocked(x, z)) put(['q_flower_clump1', 'q_flower_clump4', 'flower_purple2', 'flower_red2', 'q_hedge_bush_flowers'][Math.floor(r() * 5)], x, z, 0.8 + r() * 0.4);
  }
  // village gardens & lane trees
  for (let i = 0; i < 24; i++) { const x = at.VIL[0] - 60 + r() * 110, z = at.VIL[1] + (r() < 0.5 ? -36 : 36) + (r() - 0.5) * 8; if (ok(x, z) || (!app.isBlocked(x, z) && inside(x, z))) put(r() < 0.5 ? 'tree_apple' : 'bush_flowers', x, z, 0.9 + r() * 0.2); }
  app.store.notify({ type: 'vegetation', kinds: Object.keys(veg) });
}
