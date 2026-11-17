import type { App } from '../app/App';
import { wallBuildings, moatAroundWall } from '../buildings/BuildingTools';
import { makeBuilding } from '../buildings/presets';
import { newEstate } from '../core/estate';
import { bboxOf, offsetPolyline, pointInPolygon, polygonSignedArea, rng, smoothstep, type V2 } from '../core/math';
import { uid } from '../core/store';
import {
  HALF, VERTS, type AnimalDef, type BuildingDef, type BuildingKind, type CropKind, type CurtainWallDef, type EstateDoc, type FenceDef, type FenceStyle,
  type FieldDef, type PastureDef, type PathDef, type PlacedObject, type Species, type Viewpoint, type WaterBody,
} from '../core/types';
import { heightAt } from '../terrain/heightfield';
import { VEG_STRIDE } from '../vegetation/VegetationSystem';

const CASTLE: V2 = [-20, -110];

/** Raise/lower terrain around a point with a smooth falloff to a target height. */
export function shape(doc: EstateDoc, cx: number, cz: number, r: number, fall: number, fn: (h: number, w: number) => number) {
  for (let z = Math.max(0, Math.floor(cz + HALF - r - fall)); z <= Math.min(VERTS - 1, Math.ceil(cz + HALF + r + fall)); z++)
    for (let x = Math.max(0, Math.floor(cx + HALF - r - fall)); x <= Math.min(VERTS - 1, Math.ceil(cx + HALF + r + fall)); x++) {
      const d = Math.hypot(x - HALF - cx, z - HALF - cz);
      const w = 1 - smoothstep(r, r + fall, d);
      if (w > 0) doc.heights[z * VERTS + x] = fn(doc.heights[z * VERTS + x], w);
    }
}

/** Builds the pre-made demo estate (castle, moat, village, farms, animals, landscaping) and loads it into the app. */
export async function buildDemoEstate(app: App): Promise<EstateDoc> {
  const boundary: V2[] = [[-262, -236], [40, -262], [252, -205], [272, 40], [222, 236], [-40, 252], [-252, 205], [-282, -20]];
  const doc = newEstate('Ravensmoor Castle', boundary, { hills: 2.6, seed: 23 });
  doc.settings.timeOfDay = 16.5;
  const H = (x: number, z: number) => heightAt(doc.heights, x, z);

  // ---------------- terrain ----------------
  const plateau = H(CASTLE[0], CASTLE[1]) + 5;
  shape(doc, CASTLE[0], CASTLE[1], 62, 45, (h, w) => h + (plateau - h) * w); // castle mount
  shape(doc, 232, -175, 30, 55, (h, w) => h + 13 * w); // NE hill (stream source)
  shape(doc, 212, -128, 6, 14, (h, w) => h - 1.5 * w); // drop for the waterfall
  shape(doc, 200, 150, 22, 40, (h, w) => h + 6 * w); // windmill hill
  const pondC: V2 = [112, -58];
  shape(doc, pondC[0], pondC[1], 26, 30, (h, w) => h + (H(pondC[0], pondC[1]) - 0.5 - h) * w * 0.8);
  const villageC: V2 = [112, 88];
  const vy = H(villageC[0], villageC[1]);
  shape(doc, villageC[0], villageC[1], 70, 40, (h, w) => h + (vy - h) * w * 0.85);
  shape(doc, -150, 90, 90, 40, (h, w) => h + (H(-150, 90) - h) * w * 0.7); // gentle farmland

  // ---------------- castle ----------------
  const R = 42;
  const ring: V2[] = Array.from({ length: 6 }, (_, k) => [CASTLE[0] + Math.cos((k * Math.PI) / 3) * R, CASTLE[1] + Math.sin((k * Math.PI) / 3) * R]);
  const wall: CurtainWallDef = { id: uid('wall'), points: ring, closed: true, height: 9, thickness: 2.6, material: 'greystone', towers: 'round', towerFloors: 4, towerRoof: 'conical', walkway: true, gateSegments: [1], buttresses: true };
  const buildings: BuildingDef[] = [];
  const objects: PlacedObject[] = [];
  const add = (kind: BuildingKind, x: number, z: number, rot = 0, over: Partial<BuildingDef> = {}, name?: string) => {
    const r = makeBuilding(kind, [x, H(x, z), z], rot, over);
    if (name) r.building.name = name;
    buildings.push(r.building);
    objects.push(...r.furniture);
    return r.building;
  };
  const wb = wallBuildings(app, wall);
  // wallBuildings samples the app's current terrain; re-seat towers/gate on the demo terrain
  for (const b of wb.buildings) b.pos[1] = H(b.pos[0], b.pos[2]);
  buildings.push(...wb.buildings);
  objects.push(...wb.objects);
  const [cx, cz] = CASTLE;
  add('keep', cx, cz - 10, 0, {}, 'The Great Keep');
  add('great_hall', cx - 16, cz + 7, 0, {}, 'Great Hall');
  add('chapel', cx + 16, cz + 8, Math.PI / 2, {}, 'Castle Chapel');
  add('barracks', cx - 22, cz - 11, Math.PI / 2, { width: 14 }, 'Barracks');
  add('stables', cx + 20, cz - 13, -Math.PI / 2, { width: 14 }, 'Royal Stables');
  const ob = (catalogId: string, x: number, z: number, rotY = 0, y = 0, scale = 1) => objects.push({ id: uid('obj'), catalogId, pos: [x, y, z], rotY, scale });
  ob('well', cx, cz + 20);
  ob('brazier', cx - 5, cz + 26); ob('brazier', cx + 5, cz + 26);
  ob('weapon_rack', cx - 12, cz - 22, 0); ob('hay_bales', cx + 26, cz - 2);
  ob('trebuchet', cx - 72, cz + 10, -Math.PI / 3); ob('catapult', cx - 66, cz + 30, -Math.PI / 4);
  // keep banners on the front facade
  ob('banner_red', cx - 3.5, cz - 2.85, 0, 7); ob('banner_blue', cx + 3.5, cz - 2.85, 0, 7);
  // gate torches
  const gate = wb.buildings.find((b) => b.kind === 'gatehouse')!;
  const gx = Math.sin(gate.rotY), gz = Math.cos(gate.rotY);
  for (const s of [-1, 1]) ob('torch_wall', gate.pos[0] + gx * (gate.depth / 2 + 0.1) + gz * s * 3.2, gate.pos[2] + gz * (gate.depth / 2 + 0.1) - gx * s * 3.2, gate.rotY, 3);

  // ---------------- village ----------------
  const [vx, vz] = villageC;
  add('tavern', vx, vz - 30, 0, {}, 'The Gilded Goose');
  add('church', vx + 44, vz + 2, -Math.PI / 2, {}, 'St Aldric’s Church');
  add('blacksmith', vx + 36, vz - 30, -Math.PI / 4, {}, 'Smithy');
  add('bakery', vx - 34, vz + 2, Math.PI / 2, {}, 'Bakery');
  add('cottage', vx - 30, vz + 28, Math.PI);
  add('cottage_timber', vx, vz + 30, Math.PI);
  add('cottage_stone', vx + 28, vz + 30, Math.PI);
  add('cottage', vx - 38, vz - 24, Math.PI / 2);
  add('cottage_timber', vx - 10, vz + 58, Math.PI);
  add('cottage_stone', vx + 22, vz + 60, Math.PI);
  add('workshop', vx + 52, vz + 36, -Math.PI / 2, {}, 'Carpenter');
  add('storehouse', vx - 58, vz - 4, Math.PI / 2, {}, 'Granary');
  add('windmill', 200, 150, Math.PI * 0.85, {}, 'Hill Windmill');
  add('watermill', 182, -90, Math.PI / 2, {}, 'Watermill'); // waterwheel side (+x local) faces the stream to the north
  const square: V2[] = [[vx - 18, vz - 14], [vx + 18, vz - 14], [vx + 18, vz + 14], [vx - 18, vz + 14]];
  ob('fountain_ornate', vx, vz);
  ob('stall_red', vx - 11, vz - 8, Math.PI / 2); ob('stall_green', vx - 11, vz + 6, Math.PI / 2); ob('stall', vx + 11, vz - 6, -Math.PI / 2);
  ob('market_goods', vx + 11, vz + 7, -Math.PI / 2, 0.9); ob('cart', vx + 5, vz + 11, 0.4); ob('barrel', vx - 6, vz - 22); ob('barrel', vx - 4.8, vz - 22.6); ob('crate', vx + 7, vz - 22);
  ob('signpost', vx - 20, vz - 16, 0.6); ob('bench_q', vx + 4, vz - 12, 0); ob('bench_q', vx - 4, vz + 12, Math.PI);

  // ---------------- farm buildings ----------------
  add('barn', -80, 72, 0, {}, 'Great Barn');
  add('chicken_coop', -32, 70, Math.PI);
  add('pig_pen', -50, 33, Math.PI);
  add('dovecote', -104, 186);
  add('greenhouse', 30, 96, 0);
  for (const [x, z] of [[-60, 86], [-66, 92]] as V2[]) ob('haystack', x, z);
  ob('scarecrow', -190, 70); ob('scarecrow', -195, 140); ob('hay_bale_round', -170, 60, 0.3); ob('hay_bale_round', -176, 64, 1.1); ob('hay_bale_round', -210, 82, 2);
  ob('hay_cart', -150, 105, 0.8);
  for (let i = 0; i < 4; i++) ob('beehive', -70 + i * 2.2, 210 - i * 1.5);
  ob('water_trough', -200, -30, 0); ob('feed_trough', -115, -10, 1.2); ob('water_trough', -110, -170, 0.4);

  // ---------------- water ----------------
  const pondPts: V2[] = Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2; const r = 21 + Math.sin(a * 3) * 4 + Math.cos(a * 2) * 3; return [pondC[0] + Math.cos(a) * r * 1.2, pondC[1] + Math.sin(a) * r]; });
  const minAlong = (pts: V2[]) => Math.min(...pts.map(([x, z]) => H(x, z)));
  const pond: WaterBody = { id: uid('pond'), kind: 'pond', points: pondPts, level: minAlong(pondPts) - 0.15, width: 0, depth: 2.4, waterfall: false };
  const stream: WaterBody = { id: uid('strm'), kind: 'stream', points: [[238, -186], [222, -150], [206, -124], [188, -104], [160, -86], [138, -70]], level: 0, width: 3.2, depth: 0.9, waterfall: true };

  // ---------------- roads ----------------
  const gateFront: V2 = [gate.pos[0] + gx * 20, gate.pos[2] + gz * 20];
  const paths: PathDef[] = [
    { id: uid('path'), points: [[gate.pos[0], gate.pos[2]], gateFront, [cx + 4, cz + 92], [40, 20], [80, 45], [vx, vz - 14]], width: 4.2, style: 'cobblestone' },
    { id: uid('path'), points: [[vx - 18, vz], [60, 92], [10, 80], [-40, 62], [-90, 50], [-150, 30], [-220, 25]], width: 3.4, style: 'gravel' },
    { id: uid('path'), points: [[vx + 18, vz - 5], [150, 60], [180, 10], [178, -40], [160, -60]], width: 2.6, style: 'dirt' },
    { id: uid('path'), points: [[vx + 4, vz + 14], [vx + 8, 160], [170, 165], [200, 150]], width: 2.4, style: 'dirt' },
    { id: uid('path'), points: [[cx + 4, cz + 92], [-40, 0], [-80, -60], [-110, -120]], width: 2.6, style: 'gravel' },
  ];

  // ---------------- fields & pastures ----------------
  const fld = (crop: CropKind, stage: number, pts: V2[], rowAngle = 0): FieldDef => ({ id: uid('fld'), points: pts, crop, stage, rowAngle });
  const fields: FieldDef[] = [
    fld('wheat', 3, [[-232, 42], [-152, 38], [-150, 100], [-230, 102]]),
    fld('barley', 2, [[-142, 40], [-96, 42], [-94, 98], [-140, 100]], Math.PI / 2),
    fld('corn', 3, [[-232, 112], [-162, 110], [-160, 170], [-228, 172]]),
    fld('vegetables', 3, [[-152, 112], [-114, 112], [-112, 150], [-150, 150]], Math.PI / 2),
    fld('pumpkins', 3, [[-104, 112], [-74, 112], [-72, 142], [-102, 142]]),
    fld('flowers', 3, [[-20, 110], [24, 110], [24, 136], [-20, 136]]),
    fld('vineyard', 3, [[44, 150], [104, 150], [108, 214], [46, 216]], Math.PI / 2),
    fld('orchard', 3, [[-62, 152], [20, 150], [22, 222], [-60, 224]]),
  ];
  const fences: FenceDef[] = [];
  const pastures: PastureDef[] = [];
  const pasture = (name: string, pts: V2[], style: FenceStyle) => {
    const f: FenceDef = { id: uid('fen'), points: pts, closed: true, style, height: style === 'wattle' ? 1.1 : style === 'drystone' ? 1.1 : 1.25, gates: [0] };
    const p: PastureDef = { id: uid('pas'), points: pts, fenceId: f.id, name };
    fences.push(f); pastures.push(p);
    return p;
  };
  const sheepP = pasture('Sheep Downs', [[-240, -82], [-152, -86], [-150, 8], [-238, 12]], 'drystone');
  const cowP = pasture('Cow Meadow', [[-140, -62], [-92, -60], [-90, 14], [-138, 16]], 'rail');
  const horseP = pasture('Paddock', [[-132, -204], [-82, -206], [-80, -152], [-130, -150]], 'rail');
  const pigP = pasture('Pig Pen', [[-60, 40], [-40, 40], [-40, 58], [-60, 58]], 'wattle');
  // formal garden: hedges + maze east of the castle
  const gardenFence = (pts: V2[]) => fences.push({ id: uid('fen'), points: pts, closed: true, style: 'hedge', height: 1.4, gates: [2] });
  gardenFence([[60, -170], [120, -170], [120, -125], [60, -125]]);
  fences.push({ id: uid('fen'), points: [[-200, 30], [-90, 30]], closed: false, style: 'picket', height: 1, gates: [0] });

  // hedge maze (reuse the garden tool's generator by building a temporary tool-less version)
  const mazeFences = buildMaze([60, -230], [96, -194], 2.4, 7);
  fences.push(...mazeFences);
  ob('fountain_tiered', 90, -148); ob('statue_knight', 70, -136, Math.PI / 2); ob('statue_knight', 110, -136, -Math.PI / 2);
  ob('rose_arch', 90, -125.5, 0); ob('sundial', 76, -158); ob('birdbath', 104, -158);
  ob('bench_stone', 82, -140, 0); ob('bench_stone', 98, -140, Math.PI);
  ob('rowboat', pondC[0] + 6, pondC[1] - 4, 0.6); ob('dock', pondC[0] - 25, pondC[1] + 4, Math.PI / 2);
  // lamp posts along the main road
  for (const [x, z] of [[-6, -10], [30, 14], [66, 38], [92, 62], [-30, 40]] as V2[]) ob('lantern_post', x + 3, z);

  // ---------------- animals ----------------
  const r = rng(99);
  const animals: AnimalDef[] = [];
  const herd = (species: Species, variant: string, n: number, cxz: V2, spread: number, pastureId: string | null, waterId: string | null = null) => {
    for (let i = 0; i < n; i++) animals.push({ id: uid('ani'), species, variant, pos: [cxz[0] + (r() - 0.5) * spread, cxz[1] + (r() - 0.5) * spread], pastureId, waterId, scale: Math.round((0.9 + r() * 0.2) * 100) / 100 });
  };
  herd('sheep', 'sheep', 14, [-195, -38], 40, sheepP.id);
  herd('sheep', 'alpaca', 2, [-180, -50], 20, sheepP.id);
  herd('cow', 'cow', 6, [-114, -24], 26, cowP.id);
  herd('cow', 'bull', 1, [-114, -24], 10, cowP.id);
  herd('horse', 'horse', 3, [-106, -178], 24, horseP.id);
  herd('horse', 'horse_white', 2, [-106, -178], 24, horseP.id);
  herd('horse', 'donkey', 1, [-106, -178], 20, horseP.id);
  herd('pig', 'pig', 4, [-50, 49], 10, pigP.id);
  herd('chicken', 'chicken', 8, [-28, 80], 8, null);
  herd('chicken', 'chick', 4, [-28, 80], 6, null);
  herd('goat', 'goat', 4, [-80, 92], 10, null);
  herd('duck', 'duck', 6, pondC, 12, null, pond.id);
  herd('dog', 'dog', 1, [vx - 6, vz + 4], 4, null);
  herd('dog', 'husky', 1, [cx, cz + 22], 4, null);
  herd('deer', 'deer', 3, [-200, -170], 20, null);
  herd('deer', 'stag', 1, [-210, -175], 10, null);
  herd('deer', 'fox', 1, [-40, -230], 10, null);

  const viewpoints: Viewpoint[] = [
    { id: uid('vp'), name: 'Ravensmoor from the south', pos: [140, 150, 300], target: [10, 0, -20] },
    { id: uid('vp'), name: 'The castle gate', pos: [cx + 30, plateau + 12, cz + 110], target: [cx, plateau + 6, cz + 30] },
    { id: uid('vp'), name: 'Castle courtyard', pos: [cx + 34, plateau + 34, cz + 4], target: [cx, plateau, cz] },
    { id: uid('vp'), name: 'Village square', pos: [vx + 52, vy + 36, vz + 64], target: [vx, vy, vz] },
    { id: uid('vp'), name: 'Farms & pastures', pos: [-80, 70, 210], target: [-150, 0, 40] },
    { id: uid('vp'), name: 'The waterfall & mill', pos: [150, 40, -10], target: [205, 10, -110] },
    { id: uid('vp'), name: 'Formal gardens', pos: [130, 40, -120], target: [85, 0, -175] },
  ];

  Object.assign(doc, { walls: [wall], buildings, objects, water: [pond, stream], paths, fields, fences, pastures, animals, viewpoints });

  // town square cobbles + flower beds painted into the base splat
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
  paint(square, 5);
  paint([[cx - 30, cz - 26], [cx + 30, cz - 26], [cx + 30, cz + 30], [cx - 30, cz + 30]], 4); // courtyard gravel
  paint([[66, -164], [86, -164], [86, -152], [66, -152]], 2);
  paint([[94, -164], [114, -164], [114, -152], [94, -152]], 2);

  // ---------------- load + derived features ----------------
  app.store.replace(doc);
  const moatCmd = moatAroundWall(app, app.water!, wall);
  if (moatCmd) app.store.batch(() => moatCmd.do());
  // ducks on the moat too
  const moat = app.store.doc.moats[0];
  if (moat) {
    const ring2 = offsetPolyline(wall.points, 13, true)[polygonSignedArea(wall.points) > 0 ? 'right' : 'left'];
    for (let i = 0; i < 4; i++) { const p = ring2[(i * 3) % ring2.length]; app.store.doc.animals.push({ id: uid('ani'), species: 'duck', variant: 'duck', pos: [p[0], p[1]], pastureId: null, waterId: moat.id, scale: 1 }); }
    app.store.notify({ type: 'collection', key: 'animals' });
  }
  scatterVegetation(app, doc, r);
  app.cmd.clear();
  app.store.dirtySinceSave = true;
  return app.store.doc;
}

/** Natural planting: forests, copses, meadows, reeds, rocks — avoiding everything built. */
function scatterVegetation(app: App, doc: EstateDoc, r: () => number) {
  const veg = doc.vegetation;
  const water = app.water!;
  const inside = (x: number, z: number) => pointInPolygon(x, z, doc.boundary);
  const put = (kind: string, x: number, z: number, s: number) => (veg[kind] ??= []).push(Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(s * 100) / 100, Math.round(r() * 628) / 100, Math.round((r() * 2 - 1) * 50) / 100);
  const castleClear = (x: number, z: number) => Math.hypot(x - CASTLE[0], z - CASTLE[1]) < 72;
  const ok = (x: number, z: number, margin = 1) => inside(x, z) && !water.isWater(x, z, margin) && !app.isBlocked(x, z) && !castleClear(x, z);
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
  area(-250, -255, 120, -205, 260, ['pine', 'pine_tall', 'spruce', 'q_pine_1', 'q_pine_3', 'q_pine_4', 'pine_small'], 0.75, 1.3, 4.5); // northern pine forest
  area(-275, -200, -200, -90, 150, ['oak', 'q_common_1', 'q_common_3', 'q_common_4', 'birch', 'tree_round', 'poplar', 'q_fern'], 0.75, 1.25, 5); // western woodland
  area(-275, -200, -200, -90, 120, ['bush', 'fern', 'bush_small', 'mushrooms'], 0.7, 1.3, 1.5);
  area(150, -230, 260, -120, 90, ['pine', 'spruce', 'birch_q', 'boulder', 'rock_tall', 'boulder3'], 0.7, 1.3, 5); // NE hill
  area(120, 160, 230, 240, 900, ['flower_red', 'flower_yellow', 'q_flower_clump1', 'q_flower_clump4', 'q_flower_clump5', 'flower_group', 'q_grass_wispy', 'grass_tuft'], 0.7, 1.3, 0.5); // wildflower meadow
  area(-250, 180, -80, 245, 60, ['oak', 'tree_broad', 'willow', 'birch'], 0.8, 1.2, 8);
  area(-20, -80, 80, 40, 40, ['oak', 'tree_round', 'birch', 'poplar'], 0.8, 1.2, 10); // parkland below the castle
  area(150, 0, 260, 120, 45, ['oak', 'q_maple_1', 'q_birch_2', 'q_twisted_2', 'bush_large'], 0.8, 1.2, 8);
  // waterside reeds & lilies around the pond and stream
  for (let i = 0; i < 700; i++) {
    const x = 60 + r() * 200, z = -200 + r() * 180;
    if (!inside(x, z)) continue;
    const onEdge = water.surfaceAt(x, z, 2.8) !== null && water.surfaceAt(x, z, 0.3) === null;
    if (onEdge && !app.isBlocked(x, z)) put(r() < 0.6 ? 'reeds' : 'grass_tall', x, z, 0.8 + r() * 0.5);
    else if (water.surfaceAt(x, z, -2) !== null && r() < 0.08) put('lily', x, z, 0.8 + r() * 0.6);
  }
  // willows and birches by the pond
  for (const [x, z] of [[82, -40], [140, -78], [96, -84], [138, -36]] as V2[]) if (ok(x, z, 2)) put(r() < 0.5 ? 'willow' : 'birch', x, z, 1 + r() * 0.2);
  // roadside & garden shrubs
  area(60, -170, 120, -125, 30, ['bush_flowers', 'bush_cone', 'flower_purple2', 'flower_red2'], 0.8, 1.1, 2.5);
  // scattered boulders across the downs
  area(-240, -80, -150, 10, 12, ['boulder', 'rock', 'stone_large'], 0.6, 1.2, 6);
  app.store.notify({ type: 'vegetation', kinds: Object.keys(veg) });
  void VEG_STRIDE;
}

/** Recursive-backtracker hedge maze → merged hedge fence runs (same algorithm as the Garden tool). */
function buildMaze(a: V2, b: V2, cell: number, seed: number): FenceDef[] {
  const x0 = Math.min(a[0], b[0]), z0 = Math.min(a[1], b[1]);
  const nx = Math.floor(Math.abs(b[0] - a[0]) / cell), nz = Math.floor(Math.abs(b[1] - a[1]) / cell);
  const hW = Array.from({ length: nz + 1 }, () => new Array(nx).fill(true));
  const vW = Array.from({ length: nz }, () => new Array(nx + 1).fill(true));
  const seen = Array.from({ length: nz }, () => new Array(nx).fill(false));
  const rnd = rng(seed);
  const stack: [number, number][] = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb: [number, number, number][] = [];
    if (i > 0 && !seen[j][i - 1]) nb.push([i - 1, j, 0]);
    if (i < nx - 1 && !seen[j][i + 1]) nb.push([i + 1, j, 1]);
    if (j > 0 && !seen[j - 1][i]) nb.push([i, j - 1, 2]);
    if (j < nz - 1 && !seen[j + 1][i]) nb.push([i, j + 1, 3]);
    if (!nb.length) { stack.pop(); continue; }
    const [ni, nj, d] = nb[Math.floor(rnd() * nb.length)];
    if (d === 0) vW[j][i] = false; else if (d === 1) vW[j][i + 1] = false; else if (d === 2) hW[j][i] = false; else hW[j + 1][i] = false;
    seen[nj][ni] = true;
    stack.push([ni, nj]);
  }
  hW[0][Math.floor(nx / 2)] = false; hW[nz][Math.floor(nx / 2)] = false;
  const group = uid('maze');
  const out: FenceDef[] = [];
  const addRun = (p: V2, q: V2) => out.push({ id: uid('fen'), points: [p, q], closed: false, style: 'hedge', height: 2.2, gates: [], group });
  for (let j = 0; j <= nz; j++) { let s = -1; for (let i = 0; i <= nx; i++) { const on = i < nx && hW[j][i]; if (on && s < 0) s = i; if (!on && s >= 0) { addRun([x0 + s * cell, z0 + j * cell], [x0 + i * cell, z0 + j * cell]); s = -1; } } }
  for (let i = 0; i <= nx; i++) { let s = -1; for (let j = 0; j <= nz; j++) { const on = j < nz && vW[j][i]; if (on && s < 0) s = j; if (!on && s >= 0) { addRun([x0 + i * cell, z0 + s * cell], [x0 + i * cell, z0 + j * cell]); s = -1; } } }
  return out;
}
