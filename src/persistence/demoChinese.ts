import type { App } from '../app/App';
import { makeBuilding } from '../buildings/presets';
import { newEstate } from '../core/estate';
import { bboxOf, pointInPolygon, rng, type V2 } from '../core/math';
import { uid } from '../core/store';
import {
  HALF, type AnimalDef, type BuildingDef, type BuildingKind, type EstateDoc, type FenceDef, type FieldDef, type PathDef, type PlacedObject, type Species,
  type Viewpoint, type WaterBody,
} from '../core/types';
import { heightAt } from '../terrain/heightfield';
import { shape } from './demo';

/**
 * "Jade Lotus Garden": a Chinese estate. A walled palace compound on the main north–south axis (gate tower, palace hall,
 * courtyard houses), a temple and pagoda on the eastern hill, a lotus pond with a zigzag bridge and pavilion, a teahouse
 * street behind a paifang archway, bamboo groves, blossom trees and red maples.
 */
export async function buildChineseDemo(app: App): Promise<EstateDoc> {
  const boundary: V2[] = [[-230, -230], [0, -250], [230, -225], [245, 0], [225, 225], [0, 245], [-225, 230], [-245, 0]];
  const doc = newEstate('Jade Lotus Garden', boundary, { hills: 2.2, seed: 61 });
  doc.settings.timeOfDay = 17;
  doc.settings.season = 'spring';
  const H = (x: number, z: number) => heightAt(doc.heights, x, z);

  // ---------------- terrain ----------------
  // mountains first, then level the compound platform so it stays flat
  shape(doc, -30, -230, 100, 60, (h, w) => h + 24 * w); // mountains behind (north)
  const PAL: V2 = [0, -95]; // palace compound centre
  const py = H(PAL[0], PAL[1]) + 1;
  shape(doc, PAL[0], PAL[1], 80, 36, (h, w) => h + (py - h) * w); // level platform for the compound
  const HILL: V2 = [140, -120];
  shape(doc, HILL[0], HILL[1], 34, 46, (h, w) => h + 9 * w); // temple hill
  const hy = H(HILL[0], HILL[1]);
  shape(doc, HILL[0], HILL[1], 30, 10, (h, w) => h + (hy - h) * w); // flat hilltop
  const POND: V2 = [-95, 45];
  shape(doc, POND[0], POND[1], 46, 30, (h, w) => h + (H(POND[0], POND[1]) - 0.4 - h) * w * 0.85);
  const STREET: V2 = [70, 105];
  const sy = H(STREET[0], STREET[1]);
  shape(doc, STREET[0], STREET[1], 60, 30, (h, w) => h + (sy - h) * w * 0.9);

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

  // ---------------- palace compound (faces south, +Z) ----------------
  const [px, pz] = PAL;
  const gateZ = pz + 55;
  add('cn_gate', px, gateZ, 0, {}, 'Gate of Supreme Harmony');
  add('cn_hall', px, pz - 22, 0, {}, 'Hall of Jade Harmony');
  add('cn_residence', px - 36, pz + 6, Math.PI / 2, {}, 'West Residence');
  add('cn_house', px + 36, pz + 6, -Math.PI / 2, {}, 'East Residence');
  add('cn_house', px - 36, pz + 30, Math.PI / 2, { width: 11 }, 'Scholar’s Study');
  add('cn_pavilion', px + 36, pz + 32, -Math.PI / 2, {}, 'Pavilion of Listening Rain');
  // guardians, incense and lanterns along the axis
  ob('cn_guardian_lion', px - 7, gateZ + 6, 0); ob('cn_guardian_lion', px + 7, gateZ + 6, 0);
  ob('cn_guardian_lion', px - 9, pz - 4, 0); ob('cn_guardian_lion', px + 9, pz - 4, 0);
  ob('cn_incense_burner', px, pz + 12, 0);
  for (const z of [pz + 4, pz + 22, pz + 40]) { ob('cn_lantern_post', px - 6, z, Math.PI); ob('cn_lantern_post', px + 6, z, 0); }
  ob('cn_bonsai', px - 14, pz + 2, 0); ob('cn_bonsai', px + 14, pz + 2, 0);
  ob('cn_scholar_rock', px - 18, pz + 42, 0.6); ob('cn_scholar_rock', px + 20, pz + 44, 2.1, 0, 0.8);

  // compound wall with a moon gate on the east side; the gate tower fills the gap in the south wall
  const W = 62, N = pz - 50;
  const fences: FenceDef[] = [
    { id: uid('fen'), points: [[px + 7, gateZ], [px + W, gateZ], [px + W, N], [px - W, N], [px - W, gateZ], [px - 7, gateZ]], closed: false, style: 'cn_wall', height: 2.6, gates: [1, 3] },
  ];

  // ---------------- temple hill ----------------
  const [tx, tz] = HILL;
  add('cn_temple', tx, tz + 4, -Math.PI / 6, {}, 'Temple of the Cloud Gate');
  add('cn_pagoda', tx + 22, tz - 18, 0, {}, 'Seven Treasures Pagoda');
  ob('cn_incense_burner', tx + 6, tz + 18, 0); ob('cn_stone_lantern', tx - 6, tz + 22); ob('cn_stone_lantern', tx + 16, tz + 14);
  ob('cn_paifang', tx - 20, tz + 44, -Math.PI / 6);

  // ---------------- lotus garden ----------------
  const [lx, lz] = POND;
  const pondPts: V2[] = Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2; return [lx + Math.cos(a) * (38 + Math.sin(a * 3) * 3), lz + Math.sin(a) * 17 * (0.36 + 0.64 * Math.cos(a) ** 2)]; }); // two lobes with a narrow waist for the bridge
  const minAlong = (pts: V2[]) => Math.min(...pts.map(([x, z]) => H(x, z)));
  const pond: WaterBody = { id: uid('pond'), kind: 'pond', points: pondPts, level: minAlong(pondPts) - 0.15, width: 0, depth: 1.8, waterfall: false };
  const stream: WaterBody = { id: uid('strm'), kind: 'stream', points: [[-170, -170], [-160, -120], [-150, -70], [-140, -25], [-125, 10], [-112, 32]], level: 0, width: 3, depth: 0.8, waterfall: true };
  ob('cn_zigzag_bridge', lx, lz, 0, 1.5);
  add('cn_pavilion', lx - 8, lz - 25, 0, {}, 'Lotus Viewing Pavilion');
  add('cn_teahouse', lx + 18, lz + 30, Math.PI, {}, 'Teahouse of Fragrant Leaves');
  ob('cn_hump_bridge', -146, -48, Math.atan2(10, 45) + Math.PI / 2, 0.8);
  ob('cn_moon_gate', lx + 50, lz - 4, Math.PI / 2);
  for (const [x, z] of [[lx - 30, lz - 22], [lx + 30, lz - 20], [lx - 40, lz + 22], [lx + 40, lz + 20]] as V2[]) ob('cn_stone_lantern', x, z, Math.atan2(lx - x, lz - z));
  ob('cn_scholar_rock', lx - 46, lz - 4, 0.3, 0, 1.1); ob('cn_scholar_rock', lx + 26, lz + 22, 1.7, 0, 0.7);

  // ---------------- teahouse street ----------------
  const [ex, ez] = STREET;
  ob('cn_paifang', ex, ez + 60, 0);
  add('cn_teahouse', ex - 18, ez + 8, Math.PI / 2, {}, 'Teahouse of the Golden Carp');
  add('cn_house', ex + 18, ez - 10, -Math.PI / 2);
  add('cn_house', ex + 18, ez + 14, -Math.PI / 2, { width: 11 });
  add('cn_house', ex - 18, ez - 18, Math.PI / 2, { width: 11 });
  add('cn_house', ex + 18, ez + 38, -Math.PI / 2, { width: 12 });
  add('cn_house', ex - 18, ez + 36, Math.PI / 2, { width: 12 });
  for (const z of [ez - 20, ez, ez + 20, ez + 40]) { ob('cn_lantern_post', ex - 6, z, Math.PI); ob('cn_lantern_post', ex + 6, z, 0); }
  ob('market_goods', ex - 8, ez + 26, Math.PI / 2, 0.9); ob('stall_red', ex + 8, ez + 26, -Math.PI / 2);
  ob('cart', ex + 6, ez - 28, 0.4);

  // ---------------- roads ----------------
  const paths: PathDef[] = [
    { id: uid('path'), points: [[px, gateZ + 2], [px, gateZ + 40], [20, 60], [ex, ez - 40], [ex, ez + 66], [ex + 10, 220]], width: 5, style: 'cobblestone' },
    { id: uid('path'), points: [[px, gateZ + 40], [-30, 30], [lx + 46, lz - 4], [lx + 54, lz - 4]], width: 2.8, style: 'gravel' },
    { id: uid('path'), points: [[20, 60], [80, 20], [tx - 26, tz + 56], [tx - 20, tz + 44], [tx, tz + 22]], width: 3, style: 'gravel' },
    { id: uid('path'), points: [[lx - 8, lz - 18], [lx - 8, lz - 34], [-140, -40], [-180, -40]], width: 2.2, style: 'dirt' },
  ];

  // ---------------- fields & fences ----------------
  const fld = (crop: FieldDef['crop'], stage: number, pts: V2[], rowAngle = 0): FieldDef => ({ id: uid('fld'), points: pts, crop, stage, rowAngle });
  const fields: FieldDef[] = [
    fld('vineyard', 3, [[130, 150], [200, 146], [204, 200], [134, 204]], 0), // tea terraces
    fld('vegetables', 2, [[-60, 150], [-10, 150], [-10, 196], [-60, 196]], Math.PI / 2),
    fld('barley', 3, [[-150, 140], [-80, 140], [-80, 200], [-150, 200]]),
    fld('flowers', 3, [[150, 30], [200, 30], [200, 70], [150, 70]]),
  ];
  fences.push({ id: uid('fen'), points: [[-160, 132], [-2, 132]], closed: false, style: 'bamboo', height: 1.4, gates: [0] });
  fences.push({ id: uid('fen'), points: [[124, 140], [124, 210], [210, 210]], closed: false, style: 'bamboo', height: 1.4, gates: [] });

  // ---------------- animals ----------------
  const r = rng(77);
  const animals: AnimalDef[] = [];
  const herd = (species: Species, variant: string, n: number, c: V2, spread: number, waterId: string | null = null) => {
    for (let i = 0; i < n; i++) animals.push({ id: uid('ani'), species, variant, pos: [c[0] + (r() - 0.5) * spread, c[1] + (r() - 0.5) * spread], pastureId: null, waterId, scale: Math.round((0.9 + r() * 0.2) * 100) / 100 });
  };
  herd('duck', 'duck', 8, POND, 30, pond.id);
  herd('deer', 'deer', 3, [-170, -150], 20); herd('deer', 'stag', 1, [-160, -160], 10);
  herd('chicken', 'chicken', 6, [-40, 175], 10);
  herd('dog', 'shiba', 1, [ex, ez + 10], 6);
  herd('horse', 'horse_white', 2, [40, 30], 10);
  herd('goat', 'goat', 3, [180, -60], 12);

  const viewpoints: Viewpoint[] = [
    { id: uid('vp'), name: 'Jade Lotus from the south', pos: [60, 120, 260], target: [0, 0, -40] },
    { id: uid('vp'), name: 'Gate of Supreme Harmony', pos: [px + 22, py + 10, gateZ + 46], target: [px, py + 6, gateZ] },
    { id: uid('vp'), name: 'Palace courtyard', pos: [px + 30, py + 26, pz + 48], target: [px, py + 4, pz - 18] },
    { id: uid('vp'), name: 'Lotus pond', pos: [lx - 34, H(lx, lz) + 16, lz + 46], target: [lx + 4, H(lx, lz), lz - 4] },
    { id: uid('vp'), name: 'Temple hill & pagoda', pos: [tx + 64, hy + 22, tz + 34], target: [tx + 12, hy + 9, tz - 8] },
    { id: uid('vp'), name: 'Teahouse street', pos: [ex + 40, sy + 22, ez + 84], target: [ex, sy, ez + 10] },
  ];

  Object.assign(doc, { buildings, objects, water: [pond, stream], paths, fields, fences, pastures: [], animals, viewpoints, walls: [], moats: [] });

  // courtyard paving painted into the base splat
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
  paint([[px - 24, pz - 4], [px + 24, pz - 4], [px + 24, gateZ - 4], [px - 24, gateZ - 4]], 5);
  paint([[ex - 10, ez - 30], [ex + 10, ez - 30], [ex + 10, ez + 50], [ex - 10, ez + 50]], 5);
  paint([[tx - 16, tz + 14], [tx + 26, tz + 14], [tx + 26, tz + 28], [tx - 16, tz + 28]], 4);

  app.store.replace(doc);
  scatter(app, doc, r, { PAL, HILL, POND, STREET });
  app.cmd.clear();
  app.store.dirtySinceSave = true;
  return app.store.doc;
}

function scatter(app: App, doc: EstateDoc, r: () => number, at: Record<'PAL' | 'HILL' | 'POND' | 'STREET', V2>) {
  const veg = doc.vegetation;
  const water = app.water!;
  const inside = (x: number, z: number) => pointInPolygon(x, z, doc.boundary);
  const put = (kind: string, x: number, z: number, s: number) => (veg[kind] ??= []).push(Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(s * 100) / 100, Math.round(r() * 628) / 100, Math.round((r() * 2 - 1) * 50) / 100);
  const inCompound = (x: number, z: number) => Math.abs(x - at.PAL[0]) < 64 && z > at.PAL[1] - 52 && z < at.PAL[1] + 57;
  const ok = (x: number, z: number, margin = 1) => inside(x, z) && !water.isWater(x, z, margin) && !app.isBlocked(x, z) && !inCompound(x, z);
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
  area(-220, -240, 120, -160, 240, ['q_pine_1', 'q_pine_2', 'q_pine_3', 'q_pine_5', 'pine', 'q_twisted_2'], 0.8, 1.3, 6); // mountain pines
  area(-220, -160, -110, -60, 60, ['bamboo', 'bamboo', 'bamboo_small'], 0.85, 1.2, 3); // bamboo grove by the stream
  area(-200, 60, -140, 130, 40, ['bamboo', 'bamboo_small'], 0.8, 1.2, 3);
  area(90, -170, 200, -70, 50, ['q_maple_1', 'q_maple_2', 'q_maple_3', 'q_maple_5', 'tree_cherry', 'q_pine_4'], 0.8, 1.2, 7); // temple hill
  area(-150, 0, -40, 90, 34, ['tree_cherry', 'tree_plum_blossom', 'willow', 'q_maple_2', 'q_birch_1'], 0.8, 1.15, 8); // around the pond
  area(-140, 0, -50, 90, 160, ['q_flower_clump1', 'q_flower_clump3', 'q_flower_clump5', 'q_grass_wispy', 'q_round_bush_flowers', 'q_fern'], 0.7, 1.2, 1.2);
  area(-60, -10, 60, 60, 30, ['tree_cherry', 'tree_plum_blossom', 'q_maple_1'], 0.8, 1.2, 9); // blossom avenue south of the gate
  area(150, -60, 230, 130, 40, ['q_common_1', 'q_common_3', 'q_birch_3', 'q_maple_5'], 0.8, 1.2, 9);
  area(-230, 140, -170, 230, 40, ['q_pine_2', 'q_common_2', 'bamboo'], 0.8, 1.2, 7);
  area(-220, -60, 230, 230, 120, ['q_grass_short', 'q_grass_wispy', 'q_clover', 'q_flower_clump2'], 0.7, 1.2, 2);
  area(-200, -150, 220, -60, 18, ['q_rock1', 'q_rock2', 'q_rock3'], 0.6, 1.2, 10);
  // lotus pond edge: reeds and lilies
  for (let i = 0; i < 900; i++) {
    const x = at.POND[0] - 60 + r() * 120, z = at.POND[1] - 35 + r() * 70;
    const onEdge = water.surfaceAt(x, z, 2.2) !== null && water.surfaceAt(x, z, 0.3) === null;
    if (onEdge && !app.isBlocked(x, z) && r() < 0.35) put(r() < 0.5 ? 'reeds' : 'q_grass_wispy_tall', x, z, 0.8 + r() * 0.4);
    else if (water.surfaceAt(x, z, -1.5) !== null && r() < 0.12) put('lily', x, z, 0.9 + r() * 0.8);
  }
  // blossom trees inside the compound's side courts
  for (const [x, z] of [[-20, -70], [20, -70], [-48, -40], [48, -40], [-20, -52], [20, -52]] as V2[]) if (!app.isBlocked(x, z)) put(r() < 0.6 ? 'tree_cherry' : 'tree_plum_blossom', x, z, 0.9 + r() * 0.2);
  for (const [x, z] of [[-52, -128], [52, -128], [-30, -135], [30, -135]] as V2[]) if (!app.isBlocked(x, z)) put('q_maple_1', x, z, 0.9);
  for (const [x, z] of [[-55, -110], [-55, -100], [55, -110], [55, -100]] as V2[]) if (!app.isBlocked(x, z)) put('bamboo_small', x, z, 1);
  app.store.notify({ type: 'vegetation', kinds: Object.keys(veg) });
}
