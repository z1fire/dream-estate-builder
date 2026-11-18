import type { App } from '../app/App';
import { moatAroundWall, setFloors, wallBuildings } from '../buildings/BuildingTools';
import { levelBase } from '../buildings/footprint';
import { makeBuilding } from '../buildings/presets';
import { backOntoWall, lineWallWithRanges, type RangeOpts, type RangeUse } from '../buildings/wallRanges';
import { newEstate } from '../core/estate';
import { bboxOf, offsetPolyline, pointInPolygon, polygonSignedArea, rng, type V2 } from '../core/math';
import { uid } from '../core/store';
import { HALF, type AnimalDef, type BuildingDef, type BuildingKind, type CurtainWallDef, type EstateDoc, type FenceDef, type PathDef, type PlacedObject, type Viewpoint, type WaterBody } from '../core/types';
import { DEFAULT_PROGRAM, furnishBuilding, generatePlan } from '../interiors/planGenerator';
import { heightAt } from '../terrain/heightfield';
import { shape } from './demo';

const SLATE = '#4a5260';
const RED = '#8e1b1f';
const FLAG = '#a8262b';

/**
 * "The Courtyard Castle": just the castle from the Hundred Acre Estate painting, built to its "Castle Courtyard Layout"
 * plan. An elongated ten-sided curtain wall in warm stone inside a moat with a grassy berm, crossed by a stone bridge with
 * gate piers to a gatehouse with a front gable, pinnacles and twin spired towers. Inside, three courts run north from the
 * gate: (1) the outer service court with stables, workshops and stores in lean-to ranges against the front wall; (2) the
 * ceremonial court with a round paved plaza, tiered fountain, hedged parterres, cypresses, statues and lanterns, framed by
 * three-storey ranges with dormers and arcades; and (3) the private residential garden behind an arcaded cloister and its
 * gate pavilion, with lawn quadrants, a reflecting pool and blossom trees before the palace (a gabled, pinnacled centre
 * with a great traceried window, dormered wings and two tall towers with corner turrets). Side gardens lie between the
 * inner ranges and the outer wall; red lion banners hang from the towers and pennants fly from the spires.
 */
export async function buildCastleDemo(app: App): Promise<EstateDoc> {
  const boundary: V2[] = [[-150, -140], [150, -140], [168, 0], [150, 160], [-150, 160], [-168, 0]];
  const doc = newEstate('The Courtyard Castle', boundary, { hills: 1.2, seed: 7 });
  doc.settings.timeOfDay = 16.4;
  const H = (x: number, z: number) => heightAt(doc.heights, x, z);
  const py = H(0, 0) + 1.2;
  shape(doc, 0, 0, 122, 40, (h, w) => h + (py - h) * w); // castle platform with the moat and its berm

  // The plan inset, 0.27 m per pixel, centred on the ceremonial court.
  const s = 0.27, P = (px: number, pz: number): V2 => [Math.round((px - 350) * s * 100) / 100, Math.round((pz - 345) * s * 100) / 100];
  const R = (p: V2): V2 => [-p[0], p[1]]; // mirror east ↔ west
  const pts: V2[] = [P(260, 60), R(P(260, 60)), R(P(95, 120)), R(P(50, 265)), R(P(50, 490)), R(P(180, 600)), P(180, 600), P(50, 490), P(50, 265), P(95, 120)];
  const outer: CurtainWallDef = {
    id: uid('wall'), points: pts, closed: true, height: 11, thickness: 2.6, material: 'sandstone',
    towers: 'square', towerFloors: 4, towerRoof: 'conical', walkway: true, gateSegments: [5], buttresses: false,
  };
  const N = pts[0][1], S = pts[5][1]; // north and south wall lines
  const NI = N + outer.thickness / 2, SI = S - outer.thickness / 2; // their inner faces

  const buildings: BuildingDef[] = [];
  const objects: PlacedObject[] = [];
  const keep = (r: { building: BuildingDef; furniture: PlacedObject[] }, maxFloor = 99) => { buildings.push(r.building); objects.push(...r.furniture.filter((o) => (o.floor ?? 0) < maxFloor)); return r.building; };
  const make = (kind: BuildingKind, x: number, z: number, rot: number, over: Partial<BuildingDef> = {}, furnish = true) => makeBuilding(kind, [x, py, z], rot, { material: 'sandstone', roofColor: SLATE, ...over }, furnish);
  const ob = (catalogId: string, x: number, z: number, rotY = 0, y = 0, scale = 1) => objects.push({ id: uid('obj'), catalogId, pos: [x, y, z], rotY, scale });

  // ---------------- curtain wall towers: each pair dressed as in the painting ----------------
  const wb = wallBuildings(app, outer);
  const towers = wb.buildings.filter((b) => b.kind !== 'gatehouse');
  towers.forEach((t, i) => {
    t.roofColor = SLATE;
    t.material = 'sandstone';
    if (i === 5 || i === 6) { // front corners: open battlemented tops hung with the lion banners
      t.roof = 'flat'; t.extra.banner = RED; t.extra.bannerSides = '2'; t.name = i === 5 ? 'South-East Tower' : 'South-West Tower';
    } else if (i === 0 || i === 1) { // the palace towers: tall, with corner turrets
      setFloors(t, 6, 3.6); t.extra.turrets = true; t.extra.flag = FLAG; t.name = i === 0 ? 'West Palace Tower' : 'East Palace Tower';
    } else {
      t.extra.flag = FLAG;
      if (i === 4 || i === 7) { t.extra.banner = RED; t.extra.bannerSides = '2'; }
      t.name = ['', '', 'North-East Tower', 'East Tower', 'South-East Corner Tower', '', '', 'South-West Corner Tower', 'West Tower', 'North-West Tower'][i];
    }
  });
  // the far corners (beside the palace) are round towers with conical roofs
  for (const i of [2, 9]) {
    const t = towers[i];
    const r = makeBuilding('tower_round', [t.pos[0], py, t.pos[2]], t.rotY, { width: t.width, material: 'sandstone', roofColor: SLATE }, true);
    setFloors(r.building, 4, t.floors[0].height);
    Object.assign(r.building.extra, { wallId: outer.id, flag: FLAG });
    r.building.name = t.name;
    towers[i] = r.building;
    objects.push(...r.furniture.filter((o) => (o.floor ?? 0) < 4));
  }
  buildings.push(...towers);
  objects.push(...wb.objects.filter((o) => towers.some((t) => t.id === o.buildingId) || wb.buildings.find((b) => b.kind === 'gatehouse')?.id === o.buildingId));

  // the great gate: a gabled, pinnacled gate block flanked by two spired towers, a fixed stone bridge (no drawbridge)
  const gate = wb.buildings.find((b) => b.kind === 'gatehouse')!;
  Object.assign(gate, { name: 'Great Gate', roof: 'pitched', crenellations: false, roofColor: SLATE, material: 'sandstone' });
  Object.assign(gate.extra, { ridge: 'z', pinnacles: true, drawbridge: false });
  buildings.push(gate);
  for (const sx of [-1, 1]) {
    const t = keep(make('tower_square', sx * (gate.width / 2 + 2.9), S + 1.4, 0, { width: 5.6, depth: 5.6 }, true), 4);
    setFloors(t, 4, 3.5);
    Object.assign(t.extra, { flag: FLAG });
    t.name = sx < 0 ? 'Gate Tower West' : 'Gate Tower East';
  }

  // ---------------- the palace: gabled centre, dormered wings, backing onto the north wall ----------------
  const cw = 12, cd = 20, ww = 11.6, wd = 16;
  const pcMade = make('great_hall', 0, NI + 0.05 + cd / 2, 0, { width: cw, depth: cd, roof: 'pitched' }, true);
  const pc = pcMade.building;
  buildings.push(pc);
  objects.push(...pcMade.furniture);
  setFloors(pc, 3);
  pc.floors.forEach((f) => {
    if (f.level < 0) return;
    f.height = f.level === 0 ? 5.2 : 4.2;
    const [name, type] = ([['Great Hall', 'hall'], ['Long Gallery', 'library'], ['Chapel', 'chapel']] as const)[f.level];
    Object.assign(f.rooms[0], { name, type });
    if (f.level < 2) f.stairs = [{ id: uid('st'), kind: 'straight', pos: [-cw / 2 + pc.wallThickness + 0.75, -cd / 2 + pc.wallThickness + 0.2], rotY: 0, from: f.level, width: 1.2 }];
  });
  pc.name = 'The Palace — Great Hall';
  Object.assign(pc.extra, { ridge: 'z', pinnacles: true, backToWall: true, chimney: false });
  pc.openings = pc.openings.filter((o) => o.wall !== 'ext:0' && !(o.wall === 'ext:2' && o.kind !== 'door_double' && o.kind !== 'door_arched'));
  pc.openings.forEach((o) => { if (o.wall === 'ext:2' && (o.floor ?? 0) === 0) Object.assign(o, { kind: 'door_arched', width: 2.6, height: 3.8 }); });
  for (const lvl of [1, 2]) {
    pc.openings.push({ id: uid('op'), wall: 'ext:2', floor: lvl, t: 0.5, kind: 'window_stained', width: 3, height: 3.3, sill: lvl === 1 ? 0.5 : 0.3 });
    for (const t of [0.17, 0.83]) pc.openings.push({ id: uid('op'), wall: 'ext:2', floor: lvl, t, kind: 'window_arched', width: 1, height: 1.9, sill: 1 });
  }
  // the long gallery (bookcases, desks) and the chapel (altar, pews, candles) upstairs
  const inside = (catalogId: string, level: number, x: number, z: number, rotY = 0) => objects.push({ id: uid('obj'), catalogId, pos: [x, levelBase(pc, level) + 0.03, z], rotY, scale: 1, buildingId: pc.id, floor: level });
  for (const z of [-5, -1, 3, 7]) { inside('bookshelf', 1, -cw / 2 + 1.3, z, Math.PI / 2); inside('bookshelf', 1, cw / 2 - 1.3, z, -Math.PI / 2); }
  inside('writing_desk', 1, 0, -3); inside('writing_desk', 1, 0, 3, Math.PI);
  inside('altar', 2, 0, -cd / 2 + 2.2);
  for (const z of [-3, 0, 3, 6]) for (const x of [-2.4, 2.4]) inside('pew', 2, x, z);
  for (const x of [-2.6, 2.6]) inside('candle_stand', 2, x, -cd / 2 + 2);
  for (const sx of [-1, 1]) {
    const w = make('manor', sx * (cw / 2 + 0.15 + ww / 2), NI + 0.05 + wd / 2, 0, { width: ww, depth: wd, roof: 'hipped' }, false).building;
    w.floors.forEach((f) => { if (f.level >= 0) f.height = f.level === 0 ? 4.4 : 3.8; });
    w.name = sx < 0 ? 'The Palace — West Wing' : 'The Palace — East Wing';
    backOntoWall(w, outer.height);
    Object.assign(w.extra, { dormers: 3, chimney: true });
    generatePlan(w, { ...DEFAULT_PROGRAM, bedrooms: 3, bathrooms: 3, office: sx > 0, dining: sx < 0 }, 'period');
    buildings.push(w); objects.push(...furnishBuilding(w));
  }

  // ---------------- inner ranges framing the ceremonial court and the garden ----------------
  const RB = P(155, 0)[0]; // back of the west inner range
  const RD = 13, RA = 2.6; // depth, arcade
  const RF = RB + RD + RA; // front of its arcade
  const range3 = (name: string, z0: number, z1: number, sx: number, beds: number) => {
    const len = z1 - z0;
    const b = make('manor', sx * (-RB - RD / 2), (z0 + z1) / 2, sx < 0 ? Math.PI / 2 : -Math.PI / 2, { width: len, depth: RD, roof: 'pitched' }, false).building;
    setFloors(b, 3, 3.5);
    b.floors.forEach((f) => { if (f.level === 0) f.height = 3.8; });
    b.name = name;
    b.wallThickness = 0.7;
    Object.assign(b.extra, { arcade: RA, dormers: Math.round(len / 7), chimney: true });
    generatePlan(b, { ...DEFAULT_PROGRAM, bedrooms: beds, bathrooms: Math.ceil(beds / 2) + 1, dining: true, office: true }, 'period');
    buildings.push(b); objects.push(...furnishBuilding(b));
    return b;
  };
  const gardenS = -16.3, courtN = -7.7, courtS = 50;
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'West' : 'East';
    range3(`${side} Garden Range`, NI + 0.05 + wd + 1.6, gardenS, sx, 5);
    range3(`${side} Court Range`, courtN, courtS, sx, 6);
    // the small spired tower where the cloister meets the inner range
    const t = keep(make('tower_square', sx * (-RB - 4), (gardenS + courtN) / 2, 0, { width: 7.4, depth: 7.4 }, true), 5);
    setFloors(t, 5, 3.4);
    Object.assign(t.extra, { flag: FLAG, banner: RED, bannerSides: '2' });
    t.name = `${side} Cloister Tower`;
  }

  // ---------------- the cloister: an arcaded range between the courts with a gate pavilion ----------------
  const XB = -15, XD = 6.5, XA = 3; // back line, depth, arcade
  const span = RF + 0.6; // up to the inner range arcades
  const pav = keep(make('gatehouse', 0, XB + 5, 0, { width: 10, depth: 10, roof: 'pitched', crenellations: false }, false));
  setFloors(pav, 2, 4.6);
  pav.name = 'Garden Gate';
  Object.assign(pav.extra, { ridge: 'z', pinnacles: true, drawbridge: false, flag: FLAG });
  for (const sx of [-1, 1]) {
    const w = (-span) - 5.3; // half-length available either side of the pavilion
    const len = Math.abs(w);
    const c = keep(make('great_hall', sx * (5.3 + len / 2), XB + XD / 2, 0, { width: len, depth: XD, roof: 'pitched' }, false));
    c.floors = c.floors.filter((f) => f.level === 0);
    c.floors[0].height = 5;
    c.name = sx < 0 ? 'West Cloister' : 'East Cloister';
    Object.assign(c.extra, { arcade: XA, chimney: false });
    furnishBuilding(c).forEach((o) => objects.push(o));
  }

  // ---------------- side-garden pavilions dividing the strips between the inner ranges and the outer wall ----------------
  for (const sx of [-1, 1]) for (const [z, name] of [[pts[8][1] + 11, 'Orangery'], [pts[7][1] - 11, 'Garden Hall']] as [number, string][]) {
    const x0 = Math.abs(pts[8][0]) - outer.thickness / 2 - 0.1, x1 = -RB + 0.4;
    const len = x0 - x1;
    // arcades face into the garden compartment between them
    const b = keep(make('great_hall', sx * (x1 + len / 2), z, name === 'Orangery' ? 0 : Math.PI, { width: len, depth: 6.5, roof: 'pitched' }, false));
    b.floors = b.floors.filter((f) => f.level === 0);
    b.floors[0].height = 4.4;
    b.name = `${sx < 0 ? 'West' : 'East'} ${name}`;
    Object.assign(b.extra, { arcade: 2.2, chimney: false });
  }

  // ---------------- ranges against the curtain wall (they stop at towers, gates and each other) ----------------
  const walls = [outer];
  const ctx = { buildings, walls };
  const line = (segs: number[], use: RangeUse | RangeUse[], o: Partial<RangeOpts> = {}) => {
    const r = lineWallWithRanges(app, outer, { use, depth: 8, storeys: 2, arcade: 2.4, maxLength: 34, segments: segs, ...o }, ctx);
    for (const b of r.buildings) { b.material = 'sandstone'; b.roofColor = SLATE; if ((b.floors.filter((f) => f.level >= 0).length) > 1) b.extra.dormers = Math.max(1, Math.round(b.width / 7)); }
    buildings.push(...r.buildings); objects.push(...r.objects);
    return r.buildings;
  };
  line([1, 9], 'lodgings', { storeys: 3, depth: 10, arcade: 0 });
  line([2, 8], 'lodgings', { storeys: 2, depth: 8 });
  line([4, 6], ['lodgings', 'barracks'], { storeys: 2, depth: 8 });
  line([3, 7], ['workshops', 'storerooms', 'hall'], { storeys: 1, depth: 6.5, arcade: 2.6 });
  line([5], ['stables', 'workshops', 'storerooms', 'stables'], { storeys: 1, depth: 6.5, arcade: 2.4 });
  let lodg = 0;
  for (const b of buildings) if (b.kind === 'range') b.name = `Lodgings ${String.fromCharCode(65 + lodg++)}`;

  // ---------------- the courts ----------------
  const fences: FenceDef[] = [];
  const beds: V2[][] = [];
  const rect = (x0: number, z0: number, x1: number, z1: number): V2[] => [[Math.min(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.min(z0, z1)], [Math.max(x0, x1), Math.max(z0, z1)], [Math.min(x0, x1), Math.max(z0, z1)]];
  const hedge = (pts: V2[], gates: number[], height = 0.75) => fences.push({ id: uid('fen'), points: pts, closed: true, style: 'hedge', height, gates });
  const yard1 = (courtS + SI - 9) / 2; // (1) outer service court
  const plaza: V2 = [0, P(0, 410)[1]]; // (2) ceremonial court
  const garden = (NI + wd + XB) / 2 - 1; // (3) private garden
  // (1) outer service court: carts, stores, water for the horses; planters and lanterns at the gate
  ob('well', -18, yard1 - 2); ob('cart', 16, yard1 - 2, 0.5); ob('hay_cart', -30, yard1 + 1, 1.2); ob('water_trough', 26, yard1 + 2, 0);
  ob('hay_bales', -36, yard1 - 3); ob('crate_large', 32, yard1 - 4, 0.3); ob('crate', 33.4, yard1 - 2.6, 0.9);
  for (const [x, z] of [[-24, yard1 - 5], [-22.8, yard1 - 5.6], [30, yard1 + 3]] as V2[]) ob('barrel', x, z);
  for (const sx of [-1, 1]) { ob('potted_plant', sx * 5.5, SI - 6, 0, 0, 1.4); ob('potted_plant', sx * 5.5, courtS - 4, 0, 0, 1.4); ob('lantern_post', sx * 4, yard1); }
  hedge(rect(-34, courtS - 6, -5, courtS - 4.6), [], 1); hedge(rect(5, courtS - 6, 34, courtS - 4.6), [], 1);
  // (2) ceremonial court: round paved plaza, tiered fountain, four hedged parterres, statues, cypresses, lanterns, benches
  ob('fountain_tiered', plaza[0], plaza[1], 0, 0, 1.6);
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; ob('statue_column', Math.cos(a) * 13.5, plaza[1] + Math.sin(a) * 13.5, -a + Math.PI / 2); }
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4 + Math.PI / 8; ob('bench_stone', Math.cos(a) * 10, plaza[1] + Math.sin(a) * 10, Math.PI / 2 - a); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = sx * 19, x1 = sx * 33, z0 = plaza[1] + sz * 4.5, z1 = plaza[1] + sz * 21;
    const b = rect(x0, z0, x1, z1);
    hedge(b, [sz < 0 ? 2 : 0]);
    beds.push(b);
  }
  for (const z of [courtN + 3, courtS - 9]) for (const sx of [-1, 1]) ob('lantern_post', sx * 4.5, z);
  for (const sx of [-1, 1]) for (const z of [plaza[1] - 21, plaza[1] + 23]) ob('lantern_post', sx * 16, z);
  // (3) private garden: lawn quadrants, a reflecting pool with a statue, blossom trees, benches and urns
  const pool = rect(-7, garden - 13, 7, garden - 5);
  for (const sx of [-1, 1]) for (const [x0, z0, z1] of [[9, NI + cd + 1.5, garden - 2], [4, garden + 2, XB - 3]]) {
    const b = rect(sx * x0, z0, sx * 32, z1);
    hedge(b, [sx < 0 ? 1 : 3], 0.6);
    beds.push(b);
  }
  ob('statue_column', 0, garden - 9, Math.PI, 0, 0.55);
  for (const sx of [-1, 1]) { ob('bench_stone', sx * 8, garden - 9, sx < 0 ? Math.PI / 2 : -Math.PI / 2); ob('urn', sx * 3.4, XB - 2.5); ob('urn', sx * 3.4, garden + 1.2); ob('statue_knight', sx * 18, garden, sx < 0 ? Math.PI / 2 : -Math.PI / 2); }
  // arcades: planters between the piers and banners on the back walls (the covered walk in the painting's inset)
  for (const b of buildings) {
    const arc = Number(b.extra.arcade ?? 0);
    if (arc < 1) continue;
    const c = Math.cos(b.rotY), sn = Math.sin(b.rotY);
    const W = (x: number, z: number): V2 => [b.pos[0] + x * c + z * sn, b.pos[2] - x * sn + z * c];
    const bays = Math.max(1, Math.round(b.width / 3.6)), bw = b.width / bays;
    for (const j of bays > 3 ? [1, bays - 1] : []) { const [x, z] = W(-b.width / 2 + j * bw, b.depth / 2 + arc + 0.15); ob('potted_plant', x, z, 0, 0, 1.2); }
    if (b.kind === 'range' || b.name.includes('Cloister')) {
      const [x, z] = W(0, b.depth / 2 + 0.06);
      ob('banner_red', x, z, b.rotY, 2.3);
    }
  }
  // banners over the palace door
  ob('banner_red', -3.4, NI + cd + 0.12, 0, 5.8); ob('banner_red', 3.4, NI + cd + 0.12, 0, 5.8);
  // the bridge's gate piers and lanterns
  const bridgeEnd = S + 13 + 4.5 + 2.5;
  for (const sx of [-1, 1]) { ob('pillar_stone', sx * 4.2, bridgeEnd, 0, 0, 1); ob('urn', sx * 4.2, bridgeEnd + 0.01, 0, 3, 0.8); ob('lantern_post', sx * 4.6, bridgeEnd + 6); ob('torch_wall', sx * 3.2, S + gate.depth / 2 + 0.1, 0, 3); }

  // ---------------- water: the reflecting pool (the moat comes after the walls are loaded) ----------------
  const poolW: WaterBody = { id: uid('pond'), kind: 'pond', points: pool, level: py - 0.25, width: 0, depth: 0.7, waterfall: false };

  // ---------------- approach road and garden walks ----------------
  const paths: PathDef[] = [
    { id: uid('path'), points: [[0, S + gate.depth / 2], [0, bridgeEnd + 4], [0, 158]], width: 6, style: 'cobblestone' },
    { id: uid('path'), points: [[0, bridgeEnd + 18], [-60, bridgeEnd + 30], [-120, 110], [-150, 90]], width: 3, style: 'gravel' },
    { id: uid('path'), points: [[0, bridgeEnd + 18], [60, bridgeEnd + 30], [120, 110], [150, 90]], width: 3, style: 'gravel' },
  ];

  // a few animals: horses tethered in the service court, dogs, swans… ducks on the moat
  const r = rng(77);
  const animals: AnimalDef[] = [];
  const add = (species: AnimalDef['species'], variant: string, x: number, z: number) => animals.push({ id: uid('ani'), species, variant, pos: [x, z], pastureId: null, waterId: null, scale: 1 });
  add('horse', 'horse', 20, yard1 - 3); add('horse', 'horse_white', 23, yard1 + 1);
  add('dog', 'dog', -6, plaza[1] + 12); add('dog', 'husky', 4, yard1 + 4);

  const viewpoints: Viewpoint[] = [
    { id: uid('vp'), name: 'The Courtyard Castle', pos: [0, py + 125, S + 175], target: [0, py, -6] },
    { id: uid('vp'), name: 'The bridge & Great Gate', pos: [26, py + 13, S + 52], target: [0, py + 7, S] },
    { id: uid('vp'), name: '1 · Outer service court', pos: [-28, py + 22, SI - 2], target: [6, py + 2, yard1 - 12] },
    { id: uid('vp'), name: '2 · Ceremonial court', pos: [30, py + 26, courtS + 4], target: [0, py + 3, plaza[1] - 6] },
    { id: uid('vp'), name: '3 · Private garden & palace', pos: [18, py + 20, XB + 6], target: [0, py + 7, NI + 10] },
    { id: uid('vp'), name: 'The cloister arcade', pos: [-26, py + 1.7, XB + XD + 1.6], target: [10, py + 2, XB + XD + 1.2] },
    { id: uid('vp'), name: 'Plan view', pos: [0, py + 260, 10], target: [0, py, 0] },
  ];

  for (const b of buildings) b.pos[1] = H(b.pos[0], b.pos[2]);
  Object.assign(doc, { walls, buildings, objects, water: [poolW], paths, fields: [], fences, pastures: [], animals, viewpoints, moats: [] });

  // paving painted into the base splat
  const PLANE = 1024 * 1024 * 4;
  const paint = (test: (x: number, z: number) => boolean, bb: { minX: number; minZ: number; maxX: number; maxZ: number }, layer: number) => {
    for (let z = Math.floor(bb.minZ); z <= Math.ceil(bb.maxZ); z++)
      for (let x = Math.floor(bb.minX); x <= Math.ceil(bb.maxX); x++) {
        if (!test(x + 0.5, z + 0.5)) continue;
        const c = ((z + HALF) * 1024 + (x + HALF)) * 4;
        for (let l = 0; l < 10; l++) doc.splat[(l >> 2) * PLANE + c + (l & 3)] = l === layer ? 255 : 0;
      }
  };
  const poly = (p: V2[], layer: number) => paint((x, z) => pointInPolygon(x, z, p), bboxOf(p), layer);
  poly(pts, 0); // lawns everywhere inside the walls…
  poly(rect(-RF, courtN, RF, SI), 4); // …gravel in the service and ceremonial courts…
  paint((x, z) => Math.hypot(x - plaza[0], z - plaza[1]) < 16, { minX: -17, minZ: plaza[1] - 17, maxX: 17, maxZ: plaza[1] + 17 }, 5); // …a paved round plaza
  poly(rect(-3, NI + wd, 3, SI), 5); // the processional way from the gate to the palace
  poly(rect(-RF, plaza[1] - 2, RF, plaza[1] + 2), 5);
  poly(rect(-RF, XB + XD, RF, XB + XD + XA + 1.5), 5);
  for (const b of beds.slice(0, 4)) poly(b, 1);
  poly(rect(-34, garden - 2, 34, garden + 2), 4); // garden walks
  poly(rect(-3, NI + wd, 3, XB), 4);
  poly(rect(-10, garden - 15, 10, garden - 3), 4);

  // ---------------- load + derived features ----------------
  app.store.replace(doc);
  const moatCmd = moatAroundWall(app, app.water!, outer);
  if (moatCmd) app.store.batch(() => moatCmd.do());
  const g = app.store.doc.buildings.find((b) => b.kind === 'gatehouse' && b.name === 'Great Gate');
  if (g) { g.extra.drawbridge = false; app.store.notify({ type: 'collection', key: 'buildings' }); }
  const moat = app.store.doc.moats[0];
  if (moat) {
    const ring = offsetPolyline(outer.points, 13, true)[polygonSignedArea(outer.points) > 0 ? 'right' : 'left'];
    for (let i = 0; i < 6; i++) { const p = ring[(i * 3 + 1) % ring.length]; app.store.doc.animals.push({ id: uid('ani'), species: 'duck', variant: 'duck', pos: [p[0], p[1]], pastureId: null, waterId: moat.id, scale: 1 }); }
    app.store.notify({ type: 'collection', key: 'animals' });
  }
  scatter(app, doc, r, { beds, garden, plaza, pts, RF, courtS, courtN, XB });
  app.cmd.clear();
  app.store.dirtySinceSave = true;
  return app.store.doc;
}

function scatter(app: App, doc: EstateDoc, r: () => number, at: { beds: V2[][]; garden: number; plaza: V2; pts: V2[]; RF: number; courtS: number; courtN: number; XB: number }) {
  const veg = doc.vegetation;
  const water = app.water!;
  const put = (kind: string, x: number, z: number, s: number) => (veg[kind] ??= []).push(Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(s * 100) / 100, Math.round(r() * 628) / 100, Math.round((r() * 2 - 1) * 50) / 100);
  const free = (x: number, z: number) => !app.isBlocked(x, z) && !water.isWater(x, z, 1);
  // flowers in the parterres and garden borders
  for (const b of at.beds) {
    const bb = bboxOf(b);
    const n = Math.round(((bb.maxX - bb.minX) * (bb.maxZ - bb.minZ)) / 9);
    for (let i = 0; i < n; i++) { const x = bb.minX + 1 + r() * (bb.maxX - bb.minX - 2), z = bb.minZ + 1 + r() * (bb.maxZ - bb.minZ - 2); put(['flower_purple', 'flower_purple2', 'q_flower_clump3', 'flower_red', 'q_flower_blue'][Math.floor(r() * 5)], x, z, 0.9 + r() * 0.4); }
  }
  // cypresses: pairs along the processional way and at the parterre corners; topiary cones at the bed ends
  const cypress = (x: number, z: number) => { if (free(x, z)) put('poplar', x, z, 0.62 + r() * 0.06); };
  for (const sx of [-1, 1]) {
    for (const z of [at.courtN + 4, at.plaza[1] - 20, at.plaza[1] + 20, at.courtS - 2]) cypress(sx * 6, z);
    for (const z of [at.plaza[1] - 22, at.plaza[1] + 22]) for (const x of [17.5, 34.5]) cypress(sx * x, z);
    for (const z of [at.garden - 16, at.garden + 3, at.XB - 2.5]) cypress(sx * 34, z);
    for (const z of [at.plaza[1] - 6, at.plaza[1] + 6]) if (free(sx * 17, z)) put('bush_cone', sx * 17, z, 1.1);
  }
  // the two blossom trees beside the reflecting pool, more around the garden
  for (const sx of [-1, 1]) {
    put('tree_cherry', sx * 11.5, at.garden - 9, 1.15);
    for (const [x, z] of [[sx * 26, at.garden - 13], [sx * 26, at.garden + 9]] as V2[]) if (free(x, z)) put(r() < 0.5 ? 'tree_cherry' : 'tree_plum_blossom', x, z, 0.85);
  }
  // side gardens between the inner ranges and the outer wall: small trees and flowering shrubs
  for (let i = 0; i < 160; i++) {
    const sx = r() < 0.5 ? -1 : 1, x = sx * (Math.abs(at.RF) + 16 + r() * 26), z = -70 + r() * 125;
    if (!pointInPolygon(x, z, at.pts) || !free(x, z)) continue;
    const k = r();
    put(k < 0.12 ? 'q_maple_4' : k < 0.2 ? 'tree_apple' : k < 0.45 ? 'q_round_bush_flowers' : k < 0.7 ? 'bush_flowers' : 'q_flower_clump1', x, z, k < 0.2 ? 0.75 : 0.9 + r() * 0.3);
  }
  // outside: grass tufts on the berm, an avenue of poplars down the approach, a light ring of trees around the grounds
  for (const sx of [-1, 1]) for (let z = 112; z < 156; z += 9) if (free(sx * 9, z)) put('poplar', sx * 9, z, 0.85);
  for (let i = 0; i < 190; i++) {
    const a = r() * Math.PI * 2, rad = 128 + r() * 40, x = Math.cos(a) * rad * 1.05, z = 8 + Math.sin(a) * rad;
    if (!pointInPolygon(x, z, doc.boundary) || !free(x, z) || (Math.abs(x) < 14 && z > 60)) continue;
    put(['oak', 'q_common_1', 'birch', 'tree_round', 'q_pine_2', 'q_maple_2'][Math.floor(r() * 6)], x, z, 0.8 + r() * 0.35);
  }
  for (let i = 0; i < 140; i++) {
    const x = -150 + r() * 300, z = -140 + r() * 300;
    if (!pointInPolygon(x, z, doc.boundary) || pointInPolygon(x, z, at.pts) || !free(x, z)) continue;
    put(['q_flower_white', 'q_grass_wispy', 'flower_yellow', 'q_clover'][Math.floor(r() * 4)], x, z, 0.8 + r() * 0.3);
  }
  app.store.notify({ type: 'vegetation', kinds: Object.keys(veg) });
}
