import { catalogItem, type CatalogItem } from '../catalog/catalog';
import { footprint, levelBase, levelInset } from '../buildings/footprint';
import { uid } from '../core/store';
import type { BuildingDef, FloorDef, InteriorWall, Opening, OpeningKind, PlacedObject, Room, RoomType, Stair, SurfaceMat } from '../core/types';

/**
 * Livable floor plans and furnishing.
 *
 * generatePlan(b, program): lays out every storey of a rectangular building around a "core" at the front door: an
 * entrance hall with the staircase (multi-storey), or the living room (small single-storey houses). Wings either side
 * hold the rooms, either double-loaded off a central corridor (deep plans), off a corridor along the front (narrow
 * plans with several private rooms), or opening one into the next (small plans). Bedrooms get en-suites and closets
 * that open from the bedroom. Interior walls, doors, room types/names/finishes and stairs are written into the building.
 *
 * furnishBuilding(b): furnishes every room from its type, in the building's interior style (Modern, Period, or
 * Chinese period), placing pieces against walls clear of doors, windows and stairwells. Works on hand-drawn plans too.
 */

export type InteriorStyle = 'modern' | 'period';
export interface Program { bedrooms: number; bathrooms: number; kitchen: boolean; living: boolean; dining: boolean; office: boolean; laundry: boolean }
export const DEFAULT_PROGRAM: Program = { bedrooms: 3, bathrooms: 2, kitchen: true, living: true, dining: true, office: true, laundry: true };

export const styleOf = (b: BuildingDef): InteriorStyle => (b.extra.interiorStyle === 'period' ? 'period' : 'modern');
export const programOf = (b: BuildingDef): Program => { try { return { ...DEFAULT_PROGRAM, ...JSON.parse(String(b.extra.program ?? '{}')) }; } catch { return { ...DEFAULT_PROGRAM }; } };
const isChinese = (b: BuildingDef) => b.kind.startsWith('cn_') || b.roof === 'eaves';
type Look = 'modern' | 'period' | 'cn';
const lookOf = (b: BuildingDef): Look => (styleOf(b) === 'modern' ? 'modern' : isChinese(b) ? 'cn' : 'period');

// ------------------------------------------------------------------ room catalogue
interface RoomSpec { type: RoomType; key: string; area: number; minW: number; /** opens from the previous room in its group (en-suite, closet) */ sub?: boolean }
type Group = RoomSpec[];
const R = (type: RoomType, key: string, area: number, minW: number, sub = false): RoomSpec => ({ type, key, area, minW, sub });

const NAMES: Record<string, [string, string, string]> = {
  living: ['Living Room', 'Solar', 'Reception Hall'], family: ['Family Room', 'Withdrawing Room', 'Sitting Room'],
  kitchen: ['Kitchen', 'Kitchen', 'Kitchen'], livingkitchen: ['Kitchen & Living', 'Hall & Kitchen', 'Kitchen & Living'], dining: ['Dining Room', 'Dining Hall', 'Dining Room'],
  office: ['Study', 'Study', 'Scholar’s Study'], laundry: ['Laundry', 'Scullery', 'Wash Room'], pantry: ['Pantry', 'Larder', 'Pantry'],
  master: ['Main Bedroom', 'Lord’s Bedchamber', 'Master Bedchamber'], bedroom: ['Bedroom', 'Bedchamber', 'Bedchamber'],
  ensuite: ['En-suite', 'Bathing Room', 'Bathing Room'], bath: ['Bathroom', 'Bathing Room', 'Bathing Room'], powder: ['Cloakroom', 'Garderobe', 'Washroom'],
  closet: ['Walk-in Closet', 'Wardrobe', 'Dressing Room'], hall: ['Entrance Hall', 'Entrance Hall', 'Entrance Hall'], landing: ['Landing', 'Gallery', 'Landing'],
  corridor: ['Hallway', 'Passage', 'Corridor'],
};
const nameOf = (key: string, look: Look, n = 0) => { const s = NAMES[key]?.[look === 'modern' ? 0 : look === 'period' ? 1 : 2] ?? key; return n > 1 ? `${s} ${n}` : s; };

const FLOOR_MAT: Record<Look, Partial<Record<RoomType, SurfaceMat>> & { default: SurfaceMat }> = {
  modern: { default: 'hardwood', bedroom: 'carpet', bathroom: 'whitetile', kitchen: 'whitetile', laundry: 'whitetile', pantry: 'whitetile', hallway: 'hardwood' },
  period: { default: 'plank', kitchen: 'flagstone', bathroom: 'flagstone', laundry: 'flagstone', pantry: 'flagstone', hallway: 'flagstone', dining: 'flagstone' },
  cn: { default: 'plank', kitchen: 'squaretile', bathroom: 'squaretile', laundry: 'squaretile', pantry: 'squaretile', hallway: 'squaretile', living: 'squaretile' },
};
const WALL_MAT: Record<Look, SurfaceMat> = { modern: 'paint', period: 'plaster', cn: 'whitewash' };

/** Split the program into storeys: public rooms on the ground floor, bedrooms upstairs. */
function allocate(p: Program, n: number): Group[][] {
  const floors: Group[][] = Array.from({ length: n }, () => []);
  const pub: Group[] = [];
  if (p.living) pub.push([R('living', 'living', 24, 3.2)]);
  if (p.kitchen) pub.push(p.dining && n === 1 ? [R('kitchen', 'kitchen', 14, 2.6), R('dining', 'dining', 13, 2.8)] : [R('kitchen', 'kitchen', 14, 2.6)]);
  if (p.dining && !(p.kitchen && n === 1)) pub.push([R('dining', 'dining', 14, 2.8)]);
  if (p.laundry) pub.push(p.kitchen ? [R('laundry', 'laundry', 5, 1.7), R('pantry', 'pantry', 3.5, 1.3)] : [R('laundry', 'laundry', 5, 1.7)]);
  let baths = p.bathrooms;
  const powder = n > 1 && baths >= 2;
  if (powder) { pub.push([R('bathroom', 'powder', 3.5, 1.4)]); baths--; }
  const office: Group | null = p.office ? [R('office', 'office', 10, 2.4)] : null;
  // private units
  const units: Group[] = [];
  for (let i = 0; i < p.bedrooms; i++) {
    if (i === 0) {
      const g: Group = [R('bedroom', 'master', 17, 3.2)];
      if (baths > 0) { g.push(R('bathroom', 'ensuite', 6, 1.8, true)); baths--; }
      g.push(R('closet', 'closet', 3.5, 1.3, true));
      units.push(g);
    } else units.push([R('bedroom', 'bedroom', 12.5, 2.8)]);
  }
  if (n === 1) {
    floors[0].push(...pub, ...(office ? [office] : []), ...units);
    for (let i = 0; i < baths; i++) floors[0].push([R('bathroom', 'bath', 5.5, 1.7)]);
    return floors;
  }
  floors[0].push(...pub);
  const upper = floors.slice(1);
  if (office) (n >= 3 ? upper[0] : floors[0]).push(office);
  units.forEach((u, i) => upper[i % upper.length].push(u));
  // shared bathrooms: one per upper floor with plain bedrooms, extra ones become en-suites
  for (const fl of upper) {
    if (baths <= 0) break;
    if (fl.some((g) => g[0].key === 'bedroom')) { fl.push([R('bathroom', 'bath', 5.5, 1.7)]); baths--; }
  }
  for (const fl of upper) for (const g of fl) if (baths > 0 && g[0].key === 'bedroom' && g.length === 1) { g.push(R('bathroom', 'ensuite', 5, 1.7, true)); baths--; }
  for (const fl of upper) if (!fl.length) fl.push([R('living', 'family', 18, 3)], [R('office', 'office', 10, 2.4)]);
  return floors;
}

const FLEX = new Set<RoomType>(['living', 'bedroom', 'dining', 'kitchen', 'office']);

// ------------------------------------------------------------------ layout
interface Frame { alongX: boolean; U: number; V: number; toXZ: (u: number, v: number) => [number, number] }
function frameOf(b: BuildingDef, f: FloorDef): Frame {
  const li = levelInset(b, f.level);
  const hw = b.width / 2 - b.wallThickness - li, hd = b.depth / 2 - b.wallThickness - li;
  const alongX = hw >= hd;
  return { alongX, U: 2 * (alongX ? hw : hd), V: 2 * (alongX ? hd : hw), toXZ: (u, v) => (alongX ? [u, v] : [v, u]) };
}

interface Builder { b: BuildingDef; f: FloorDef; fr: Frame; look: Look; walls: InteriorWall[]; rooms: Room[]; openings: Opening[]; counts: Map<string, number>; dropped: number }

function addRoom(B: Builder, key: string, type: RoomType, u0: number, v0: number, u1: number, v1: number) {
  const [x0, z0] = B.fr.toXZ(Math.min(u0, u1), Math.min(v0, v1)), [x1, z1] = B.fr.toXZ(Math.max(u0, u1), Math.max(v0, v1));
  const n = (B.counts.get(key) ?? 0) + 1;
  B.counts.set(key, n);
  const fm = FLOOR_MAT[B.look][type] ?? FLOOR_MAT[B.look].default;
  B.rooms.push({ id: uid('rm'), name: nameOf(key, B.look, ['bedroom', 'bath', 'family'].includes(key) ? n + (key === 'bedroom' ? 1 : 0) : 0), type, rect: [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)], floorMat: fm, wallMat: WALL_MAT[B.look], ceiling: B.look === 'modern' ? 'flat' : 'beamed' });
}
/** Wall from (u,v)a to (u,v)b; returns its id. */
function addWall(B: Builder, a: [number, number], c: [number, number]) {
  const id = uid('iw');
  B.walls.push({ id, a: B.fr.toXZ(a[0], a[1]), b: B.fr.toXZ(c[0], c[1]), thickness: 0.15, material: WALL_MAT[B.look] });
  return id;
}
function addDoor(B: Builder, wallId: string, t: number, wide = false) {
  const w = B.walls.find((x) => x.id === wallId)!;
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const width = Math.min(wide ? 1.6 : B.look === 'cn' ? 1.1 : 0.9, L - 0.3);
  if (width < 0.6) return;
  const tt = Math.max((width / 2 + 0.12) / L, Math.min(1 - (width / 2 + 0.12) / L, t));
  const kind: OpeningKind = wide ? 'archway' : B.look === 'cn' ? 'door_lattice' : B.look === 'period' ? 'door_arched' : 'door_wood';
  B.openings.push({ id: uid('op'), wall: wallId, floor: B.f.level, t: tt, kind, width, height: Math.min(wide ? 2.4 : 2.15, B.f.height - 0.5), sill: 0 });
}

/** A column of a strip: a main room, plus small rooms carved out of its footprint (en-suite, closet) when space is tight. */
interface Col { main: RoomSpec; stacked: RoomSpec[] }

/** Lay out a strip of rooms from the core outward. corridorEdge = v of the corridor-side boundary (null = rooms open one into the next). */
function layStrip(B: Builder, groups: Group[], uStart: number, uEnd: number, v0: number, v1: number, corridorEdge: number | null) {
  const dir = Math.sign(uEnd - uStart) || 1;
  const L = Math.abs(uEnd - uStart), D = Math.abs(v1 - v0);
  let cols: Col[] = groups.flat().map((r) => ({ main: r, stacked: [] }));
  const minOf = (c: Col) => Math.max(c.main.minW, c.stacked.reduce((s, r) => s + r.minW, 0));
  const wantOf = (c: Col) => Math.max(minOf(c), (c.main.area + c.stacked.reduce((s, r) => s + r.area, 0)) / D);
  const sumMin = () => cols.reduce((s, c) => s + minOf(c), 0);
  // 1) tuck small rooms into the footprint of the main room before them (en-suites inside the bedroom's bay)
  if (sumMin() > L && D >= 4.4) {
    for (let i = cols.length - 1; i > 0 && sumMin() > L; i--) {
      const c = cols[i];
      if (FLEX.has(c.main.type) || c.stacked.length) continue;
      let p = i - 1;
      while (p >= 0 && !FLEX.has(cols[p].main.type)) p--;
      if (p < 0) continue;
      cols[p].stacked.push(c.main);
      cols.splice(i, 1);
    }
  }
  // 2) still too long: drop the least important rooms
  const prio = (r: RoomSpec) => ({ closet: 0, pantry: 1, powder: 2, laundry: 3, office: 4, ensuite: 5 } as Record<string, number>)[r.key] ?? 9;
  while (cols.length && sumMin() > L) {
    const worst = cols.reduce((a, c) => (prio(c.main) < prio(a.main) ? c : a), cols[0]);
    cols = cols.filter((c) => c !== worst);
    B.dropped += 1 + worst.stacked.length;
  }
  if (!cols.length) return;
  const want = cols.map(wantOf);
  const mins = cols.map(minOf);
  const sMin = mins.reduce((s, w) => s + w, 0), sumWant = want.reduce((s, w) => s + w, 0);
  let widths = want.slice();
  if (sumWant > L) widths = want.map((w, i) => mins[i] + (w - mins[i]) * (L - sMin) / Math.max(1e-6, sumWant - sMin));
  else {
    // spare length goes to the main rooms, never to bathrooms, closets or pantries…
    const slack = L - sumWant;
    const flex = cols.map((c, i) => (FLEX.has(c.main.type) && !c.main.sub ? i : -1)).filter((i) => i >= 0);
    if (flex.length) { const tot = flex.reduce((s, i) => s + want[i], 0); for (const i of flex) widths[i] += (slack * want[i]) / tot; }
    // …and a strip holding only small rooms gets a sitting room instead of an oversized bathroom
    else if (slack >= 3) { cols.push({ main: R('living', 'family', slack * D, slack), stacked: [] }); widths.push(slack); }
    else { const tot = widths.reduce((s, w) => s + w, 0); widths = widths.map((w) => w + (slack * w) / tot); }
  }
  // the band for tucked-in rooms goes on the side away from the corridor
  const bandAtV0 = corridorEdge === null || corridorEdge === v1;
  let u = uStart;
  cols.forEach((c, i) => {
    const r = c.main;
    const u1 = i === cols.length - 1 ? uEnd : u + dir * widths[i];
    const w = Math.abs(u1 - u);
    let mv0 = v0, mv1 = v1;
    if (c.stacked.length) {
      const Ds = Math.max(1.5, Math.min(D - 2.6, c.stacked.reduce((s, x) => s + x.area, 0) / w));
      const vb = bandAtV0 ? v0 + Ds : v1 - Ds;
      if (bandAtV0) mv0 = vb; else mv1 = vb;
      // split the band along u between the tucked-in rooms
      const tot = c.stacked.reduce((s, x) => s + x.area, 0);
      let su = u;
      c.stacked.forEach((x, k) => {
        const su1 = k === c.stacked.length - 1 ? u1 : su + dir * (w * x.area / tot);
        addRoom(B, x.key, x.type, su, bandAtV0 ? v0 : vb, su1, bandAtV0 ? vb : v1);
        addDoor(B, addWall(B, [su, vb], [su1, vb]), 0.5);
        if (k > 0) addWall(B, [su, bandAtV0 ? v0 : vb], [su, bandAtV0 ? vb : v1]);
        su = su1;
      });
    }
    addRoom(B, r.key, r.type, u, mv0, u1, mv1);
    // wall at the start of this column (towards the core or the previous room)
    const startWall = addWall(B, [u, v0], [u, v1]);
    const tMain = ((mv0 + mv1) / 2 - v0) / D;
    if (corridorEdge === null) {
      const wide = i > 0 && !r.sub && ['dining', 'kitchen', 'living'].includes(r.type) && ['dining', 'kitchen', 'living'].includes(cols[i - 1].main.type);
      addDoor(B, startWall, tMain, i === 0 ? r.type === 'living' || r.type === 'dining' : wide);
    } else if (r.sub && i > 0) addDoor(B, startWall, corridorEdge === v1 ? 0.75 : 0.25);
    if (corridorEdge !== null) {
      const cw = addWall(B, [u, corridorEdge], [u1, corridorEdge]);
      if (!r.sub) addDoor(B, cw, 0.3);
    }
    u = u1;
  });
}

interface CorePlan { u0: number; u1: number; stair: 'straight' | 'spiral' | null; run: number; coreIsRoom: RoomSpec | null }

/** Lay out one storey. */
function layoutFloor(B: Builder, groups: Group[], core: CorePlan, ground: boolean) {
  const { U, V } = B.fr;
  const uL = -U / 2, uR = U / 2;
  // core room
  if (core.coreIsRoom) addRoom(B, core.coreIsRoom.key, core.coreIsRoom.type, core.u0, -V / 2, core.u1, V / 2);
  else addRoom(B, ground ? 'hall' : 'landing', 'hallway', core.u0, -V / 2, core.u1, V / 2);
  // wings
  const wings = [{ start: core.u0, end: uL }, { start: core.u1, end: uR }].filter((w) => Math.abs(w.end - w.start) >= 1.4);
  if (!wings.length) return;
  const cap = wings.map((w) => Math.abs(w.end - w.start));
  const load = wings.map(() => 0);
  const per: Group[][] = wings.map(() => []);
  // biggest groups first, each into the wing with the most free room
  for (const g of [...groups].sort((a, c) => c.reduce((s, r) => s + r.area, 0) - a.reduce((s, r) => s + r.area, 0))) {
    let best = 0;
    for (let i = 1; i < wings.length; i++) if (cap[i] * V - load[i] > cap[best] * V - load[best]) best = i;
    per[best].push(g);
    load[best] += g.reduce((s, r) => s + r.area, 0);
  }
  wings.forEach((w, wi) => {
    const gs = per[wi];
    if (!gs.length) { addRoom(B, 'family', 'living', w.start, -V / 2, w.end, V / 2); addDoor(B, addWall(B, [w.start, -V / 2], [w.start, V / 2]), 0.5, true); return; }
    const many = gs.length > 2 || gs.filter((g) => g[0].type === 'bedroom').length > 1;
    if (V >= 7.4) {
      // double-loaded off a central corridor
      const c0 = -0.6, c1 = 0.6;
      addRoom(B, 'corridor', 'hallway', w.start, c0, w.end, c1);
      const back: Group[] = [], front: Group[] = [];
      let la = 0, lb = 0;
      for (const g of gs) { const a = g.reduce((s, r) => s + r.area, 0); if (la <= lb) { back.push(g); la += a; } else { front.push(g); lb += a; } }
      layStrip(B, back, w.start, w.end, -V / 2, c0, c0);
      layStrip(B, front, w.start, w.end, c1, V / 2, c1);
    } else if (many && V >= 4.2) {
      // corridor along the front wall
      const c0 = V / 2 - 1.05;
      addRoom(B, 'corridor', 'hallway', w.start, c0, w.end, V / 2);
      layStrip(B, gs, w.start, w.end, -V / 2, c0, c0);
    } else layStrip(B, gs, w.start, w.end, -V / 2, V / 2, null);
  });
}

/** Build floor plans (rooms, walls, doors, stairs, finishes) for every storey of `b` in place. Returns rooms that didn't fit. */
export function generatePlan(b: BuildingDef, program: Program, style: InteriorStyle): { ok: boolean; dropped: number; reason?: string } {
  if (b.shape !== 'rect') return { ok: false, dropped: 0, reason: 'Layouts need a rectangular building' };
  b.extra.interiorStyle = style;
  b.extra.program = JSON.stringify(program);
  const look = lookOf(b);
  const above = b.floors.filter((f) => f.level >= 0).sort((p, q) => p.level - q.level);
  const below = b.floors.filter((f) => f.level < 0);
  const g0 = above[0];
  const fr0 = frameOf(b, g0);
  if (fr0.U < 4 || fr0.V < 2.8) return { ok: false, dropped: 0, reason: 'This building is too small to divide into rooms' };
  const multi = above.length > 1 || below.length > 0;
  const tallest = Math.max(...b.floors.map((f) => f.height));
  const run = tallest * 1.6;
  const plan = allocate(program, above.length);
  // the core sits at the front door: middle of a long front, or the front end of a deep building
  const frontOnLong = fr0.alongX;
  let core: CorePlan;
  if (multi) {
    const straight = fr0.V >= run + 1.6;
    const W = straight ? 3.1 : 3.5;
    core = { u0: frontOnLong ? -W / 2 : fr0.U / 2 - W, u1: frontOnLong ? W / 2 : fr0.U / 2, stair: straight ? 'straight' : 'spiral', run, coreIsRoom: null };
  } else if (fr0.U >= 13) {
    core = { u0: frontOnLong ? -1.2 : fr0.U / 2 - 2.4, u1: frontOnLong ? 1.2 : fr0.U / 2, stair: null, run, coreIsRoom: null };
  } else {
    // small single-storey: the front door opens straight into the living room (or the kitchen)
    const liv = plan[0].findIndex((g) => g[0].type === 'living');
    const idx = liv >= 0 ? liv : plan[0].findIndex((g) => g[0].type === 'kitchen');
    const grp = idx >= 0 ? plan[0].splice(idx, 1)[0] : [R('living', 'living', 20, 3)];
    if (grp.length > 1) plan[0].unshift(grp.slice(1));
    // no separate living room: the kitchen becomes an open-plan kitchen & living room
    const spec = grp[0].type === 'kitchen' ? R('kitchen', 'livingkitchen', 24, 3.2) : grp[0];
    const W = Math.min(fr0.U * 0.45, Math.max(spec.minW, spec.area / fr0.V));
    core = { u0: frontOnLong ? -W / 2 : fr0.U / 2 - W, u1: frontOnLong ? W / 2 : fr0.U / 2, stair: null, run, coreIsRoom: spec };
  }
  // small buildings: a central core would leave wings too narrow for rooms, so put it at one end and move the front door to it
  if (frontOnLong && (fr0.U - (core.u1 - core.u0)) / 2 < 3.2) {
    const W = core.u1 - core.u0;
    core.u0 = -fr0.U / 2; core.u1 = -fr0.U / 2 + W;
    const wc = b.width / 2 - b.wallThickness / 2;
    const cx = (core.u0 + core.u1) / 2;
    const door = b.openings.find((o) => o.wall === 'ext:2' && o.floor === 0 && (o.kind.startsWith('door') || o.kind === 'archway'));
    if (door) {
      door.t = (wc - cx) / (2 * wc);
      b.openings = b.openings.filter((o) => o === door || !(o.wall === 'ext:2' && o.floor === 0 && Math.abs(o.t - door.t) * 2 * wc < (o.width + door.width) / 2 + 0.3));
    }
  }
  let dropped = 0;
  const counts = new Map<string, number>();
  for (const f of above) {
    const fr = frameOf(b, f);
    const B: Builder = { b, f, fr, look, walls: [], rooms: [], openings: [], counts, dropped: 0 };
    // keep the core the same on every storey; wings shrink with tapers
    const c = { ...core };
    if (!frontOnLong) { c.u1 = fr.U / 2; c.u0 = c.u1 - (core.u1 - core.u0); } else if (core.u0 <= -fr0.U / 2 + 1e-6) { c.u0 = -fr.U / 2; c.u1 = c.u0 + (core.u1 - core.u0); }
    layoutFloor(B, plan[f.level] ?? [], c, f.level === 0);
    // the core and wings are separated by walls only where a strip begins; open the core to its corridors
    f.rooms = B.rooms;
    f.walls = B.walls;
    f.floorMat = FLOOR_MAT[look].hallway ?? FLOOR_MAT[look].default;
    f.wallMat = WALL_MAT[look];
    f.ceiling = look === 'modern' ? 'flat' : 'beamed';
    b.openings = b.openings.filter((o) => !(o.floor === f.level && !o.wall.startsWith('ext:'))).concat(B.openings);
    dropped += B.dropped;
  }
  // stairs: same place on every storey, inside the core
  const top = above[above.length - 1].level;
  const fr = fr0;
  const cu = (core.u0 + core.u1) / 2;
  const mk = (from: number): Stair[] => {
    if (!core.stair) return [];
    if (core.stair === 'straight') {
      const [x, z] = fr.toXZ(cu, -fr.V / 2 + 0.15);
      return [{ id: uid('st'), kind: 'straight', pos: [x, z], rotY: fr.alongX ? 0 : Math.PI / 2, from, width: 1.1 }];
    }
    const [x, z] = fr.toXZ(cu, -fr.V / 2 + 1.75);
    return [{ id: uid('st'), kind: 'spiral', pos: [x, z], rotY: 0, from, width: 1.2 }];
  };
  for (const f of b.floors) f.stairs = f.level >= top ? [] : mk(f.level);
  return { ok: true, dropped };
}

// ------------------------------------------------------------------ furnishing
type Rect = [number, number, number, number];
interface Placed { rect: Rect }
interface Obstacle { x: number; z: number; r: number; tallOnly?: boolean }

const SIDES = [0, 1, 2, 3] as const; // 0: z-min wall (item faces +z), 1: x-max, 2: z-max, 3: x-min
const ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

class RoomPlacer {
  placed: Placed[] = [];
  /** shrink door/stair clearances (last resort, e.g. to get a bed into a small bedroom) */
  relax = 1;
  out: { id: string; x: number; z: number; y: number; rot: number }[] = [];
  constructor(public r: Rect, private obstacles: Obstacle[], public base: number, private ceil: number) {}
  get w() { return this.r[2] - this.r[0]; }
  get d() { return this.r[3] - this.r[1]; }
  sideLen(s: number) { return s % 2 === 0 ? this.w : this.d; }
  /** item rect at along-wall coordinate c (from the side's start corner), pulled `off` m off the wall */
  rectAt(s: number, c: number, iw: number, idp: number, off = 0.02): { rect: Rect; x: number; z: number } {
    const [x0, z0, x1, z1] = this.r;
    if (s === 0) { const x = x0 + c, z = z0 + off + idp / 2; return { rect: [x - iw / 2, z - idp / 2, x + iw / 2, z + idp / 2], x, z }; }
    if (s === 2) { const x = x0 + c, z = z1 - off - idp / 2; return { rect: [x - iw / 2, z - idp / 2, x + iw / 2, z + idp / 2], x, z }; }
    if (s === 1) { const z = z0 + c, x = x1 - off - idp / 2; return { rect: [x - idp / 2, z - iw / 2, x + idp / 2, z + iw / 2], x, z }; }
    const z = z0 + c, x = x0 + off + idp / 2; return { rect: [x - idp / 2, z - iw / 2, x + idp / 2, z + iw / 2], x, z };
  }
  free(rect: Rect, tall: boolean, ignorePlaced = false) {
    const [a, b, c, d] = rect;
    if (a < this.r[0] - 0.01 || b < this.r[1] - 0.01 || c > this.r[2] + 0.01 || d > this.r[3] + 0.01) return false;
    for (const o of this.obstacles) {
      if (o.tallOnly && !tall) continue;
      const px = Math.max(a, Math.min(o.x, c)), pz = Math.max(b, Math.min(o.z, d));
      if (Math.hypot(px - o.x, pz - o.z) < o.r * this.relax) return false;
    }
    if (!ignorePlaced) for (const p of this.placed) if (a < p.rect[2] - 0.02 && c > p.rect[0] + 0.02 && b < p.rect[3] - 0.02 && d > p.rect[1] + 0.02) return false;
    return true;
  }
  put(id: string, x: number, z: number, rot: number, rect: Rect | null, y = this.base) {
    this.out.push({ id, x, z, y, rot });
    if (rect) this.placed.push({ rect });
  }
  /** Against a wall. sides: preference order. Returns the placement (with its side and along-wall coordinate). */
  wall(id: string, sides: readonly number[] = this.sidesByLength(), opts: { off?: number; y?: number; prefer?: 'center' | 'start' | 'end'; noRect?: boolean } = {}) {
    const it = catalogItem(id);
    if (!it) return null;
    const [iw, idp] = it.footprint;
    const tall = it.height > 1.2;
    for (const s of sides) {
      const len = this.sideLen(s);
      if (len < iw + 0.1) continue;
      const cands: number[] = [];
      for (let c = iw / 2 + 0.05; c <= len - iw / 2 - 0.05 + 1e-6; c += 0.15) cands.push(c);
      const centre = len / 2;
      if (opts.prefer === 'center' || !opts.prefer) cands.sort((p, q) => Math.abs(p - centre) - Math.abs(q - centre));
      else if (opts.prefer === 'end') cands.reverse();
      for (const c of cands) {
        const { rect, x, z } = this.rectAt(s, c, iw, idp, opts.off ?? 0.02);
        if (!this.free(rect, tall)) continue;
        this.put(id, x, z, ROT[s], opts.noRect ? null : rect, opts.y ?? this.base);
        return { s, c, x, z, rect, it };
      }
    }
    return null;
  }
  sidesByLength(): number[] { return [...SIDES].sort((p, q) => this.sideLen(q) - this.sideLen(p)); }
  /** free-standing at a point (centre of the item), rot about Y */
  at(id: string, x: number, z: number, rot: number, opts: { y?: number; noRect?: boolean; ignorePlaced?: boolean } = {}) {
    const it = catalogItem(id);
    if (!it) return null;
    const [iw, idp] = it.footprint;
    const sw = Math.abs(Math.cos(rot)) > 0.5 ? iw : idp, sd = Math.abs(Math.cos(rot)) > 0.5 ? idp : iw;
    const rect: Rect = [x - sw / 2, z - sd / 2, x + sw / 2, z + sd / 2];
    if (!this.free(rect, it.height > 1.2, opts.ignorePlaced)) return null;
    this.put(id, x, z, rot, opts.noRect ? null : rect, opts.y ?? this.base);
    return { rect, it };
  }
  /** a point pulled `dist` m from a wall placement towards the room */
  inward(p: { s: number; x: number; z: number }, dist: number): [number, number] {
    const n = [[0, 1], [-1, 0], [0, -1], [1, 0]][p.s];
    return [p.x + n[0] * dist, p.z + n[1] * dist];
  }
  ceiling(id: string, x = (this.r[0] + this.r[2]) / 2, z = (this.r[1] + this.r[3]) / 2) {
    const it = catalogItem(id);
    if (!it) return;
    const y = it.source === 'Kenney' || it.source === 'Quaternius' ? this.ceil - it.height : this.ceil - 0.3;
    this.put(id, x, z, 0, null, y);
  }
  /** wall-mounted piece above a floor placement (mirror over a basin, hood over a stove…) */
  above(id: string, p: { s: number; x: number; z: number }, h: number) {
    const it = catalogItem(id);
    if (!it) return;
    const n = [[0, 1], [-1, 0], [0, -1], [1, 0]][p.s];
    const [x0, z0, x1, z1] = this.r;
    const wx = p.s === 1 ? x1 : p.s === 3 ? x0 : p.x, wz = p.s === 0 ? z0 : p.s === 2 ? z1 : p.z;
    const x = wx + n[0] * (it.footprint[1] / 2 + 0.02), z = wz + n[1] * (it.footprint[1] / 2 + 0.02);
    const y = it.source === 'Kenney' || it.source === 'Quaternius' ? this.base + h : this.base + (it.height < 1.2 ? 1.9 : 0);
    this.put(id, x, z, ROT[p.s], null, y);
  }
}

const opposite = (s: number) => (s + 2) % 4;

/** Per-look recipes. Each gets a placer for one room. */
const RECIPES: Record<Look, Partial<Record<RoomType, (P: RoomPlacer, area: number) => void>>> = {
  modern: {
    living: (P, A) => {
      const sofa = P.wall(A > 22 ? 'm_sofa_long' : 'm_sofa');
      if (sofa) {
        const [cx, cz] = P.inward(sofa, sofa.it.footprint[1] / 2 + 0.85);
        P.at('m_rug', cx, cz, ROT[sofa.s], { noRect: true, ignorePlaced: true });
        P.at('m_coffee_table', cx, cz, ROT[sofa.s]);
        const tv = P.wall('m_tv_cabinet', [opposite(sofa.s)]);
        if (tv) P.at('m_tv', tv.x, tv.z, ROT[tv.s], { y: P.base + tv.it.height, noRect: true, ignorePlaced: true });
      }
      P.wall('m_armchair'); P.wall('m_bookcase'); P.wall('m_floor_lamp'); P.wall('m_plant_small');
      if (A > 28) { P.wall('m_armchair'); P.wall('m_side_table'); }
      P.ceiling('m_ceiling_light');
    },
    dining: (P) => {
      const [x0, z0, x1, z1] = P.r;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = P.w >= P.d;
      diningSet(P, cx, cz, alongX, 'm_dining_table', 'm_chair');
      P.wall('m_cabinet_wide'); P.wall('m_plant_small');
      P.ceiling('m_ceiling_light');
    },
    kitchen: (P, A) => {
      kitchenRun(P);
      if (A >= 13 && Math.min(P.w, P.d) >= 3.4) {
        const [x0, z0, x1, z1] = P.r;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = P.w >= P.d;
        const rot = alongX ? 0 : Math.PI / 2;
        const d = 0.97;
        for (const k of [-1, 0, 1]) P.at('m_island', cx + (alongX ? k * d : 0), cz + (alongX ? 0 : k * d), rot);
        for (const k of [-1, 1]) P.at('m_bar_stool', cx + (alongX ? k * 0.6 : 0.65), cz + (alongX ? 0.65 : k * 0.6), rot + Math.PI);
      } else if (A >= 9) diningSet(P, (P.r[0] + P.r[2]) / 2, (P.r[1] + P.r[3]) / 2, P.w >= P.d, 'm_dining_table', 'm_chair', 1);
      P.wall('m_bin');
      P.ceiling('m_ceiling_light');
    },
    bedroom: (P, A) => {
      bedWithTables(P, A >= 9 ? 'm_bed_double' : 'm_bed_single', 'm_nightstand', 'm_table_lamp');
      P.wall('m_wardrobe'); P.wall('m_dresser');
      if (A > 15) { P.wall('m_armchair'); P.wall('m_desk'); }
      P.wall('m_plant_small');
      P.ceiling('m_ceiling_light');
    },
    bathroom: (P, A) => {
      const big = A >= 4.6 && Math.max(P.w, P.d) >= 1.85;
      if (big) P.wall('m_bathtub', [...SIDES].sort((p, q) => P.sideLen(p) - P.sideLen(q)).filter((s) => P.sideLen(s) >= 1.75), { prefer: 'end' });
      const basin = P.wall(A >= 5 ? 'm_vanity' : 'm_basin');
      if (basin) P.above('m_mirror', basin, 1.1);
      P.wall('m_toilet');
      if (!big || A >= 8) P.wall('m_shower', P.sidesByLength(), { prefer: 'start' });
      P.ceiling('m_ceiling_light');
    },
    closet: (P) => { P.wall('m_wardrobe'); P.wall('m_wardrobe'); P.wall('m_dresser'); P.wall('m_wardrobe'); P.ceiling('m_ceiling_light'); },
    office: (P) => {
      const desk = P.wall('m_desk');
      if (desk) {
        const [cx, cz] = P.inward(desk, desk.it.footprint[1] / 2 + 0.35);
        P.at('m_office_chair', cx, cz, ROT[desk.s] + Math.PI);
        P.at('m_monitor', desk.x, desk.z, ROT[desk.s], { y: P.base + desk.it.height, noRect: true, ignorePlaced: true });
      }
      P.wall('m_bookcase'); P.wall('m_bookcase'); P.wall('m_armchair'); P.wall('m_plant_small');
      P.ceiling('m_ceiling_light');
    },
    laundry: (P) => { P.wall('m_washer'); P.wall('m_dryer'); const c = P.wall('m_counter'); if (c) P.above('m_upper_cabinet', c, 1.45); P.ceiling('m_ceiling_light'); },
    pantry: (P) => { P.wall('m_cabinet_wide'); P.wall('m_fridge'); P.wall('m_counter'); P.ceiling('m_ceiling_light'); },
    hallway: (P, A) => {
      if (A > 6) { P.wall('m_side_table'); P.wall('m_plant_small'); }
      const lights = Math.max(1, Math.round(Math.max(P.w, P.d) / 5));
      for (let i = 0; i < lights; i++) {
        const t = (i + 0.5) / lights;
        P.ceiling('m_ceiling_light', P.w >= P.d ? P.r[0] + P.w * t : (P.r[0] + P.r[2]) / 2, P.w >= P.d ? (P.r[1] + P.r[3]) / 2 : P.r[1] + P.d * t);
      }
    },
  },
  period: {
    living: (P, A) => {
      const fp = P.wall('fireplace');
      if (fp) { const [cx, cz] = P.inward(fp, 1.9); P.at('rug_red', cx, cz, ROT[fp.s], { noRect: true, ignorePlaced: true }); P.at('round_table', cx, cz, 0); }
      P.wall('chair'); P.wall('chair'); P.wall('bookshelf'); P.wall('candle_stand');
      if (A > 25) { P.wall('tapestry_red'); P.ceiling('chandelier'); }
    },
    dining: (P, A) => {
      const [x0, z0, x1, z1] = P.r;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = P.w >= P.d;
      if (Math.max(P.w, P.d) >= 5.2) { P.at('long_table', cx, cz, alongX ? 0 : Math.PI / 2); for (const k of [-1, 1]) P.at('bench_long', cx + (alongX ? 0 : k * 0.85), cz + (alongX ? k * 0.85 : 0), alongX ? 0 : Math.PI / 2); }
      else diningSet(P, cx, cz, alongX, 'kitchen_table', 'chair');
      P.wall('candle_stand'); P.wall('wine_rack');
      if (A > 18) P.ceiling('chandelier');
    },
    kitchen: (P, A) => {
      P.wall('hearth', P.sidesByLength(), {});
      P.wall('pot_shelf'); P.wall('barrel'); P.wall('shelf_tall');
      if (A >= 9) { const c = [(P.r[0] + P.r[2]) / 2, (P.r[1] + P.r[3]) / 2]; P.at('kitchen_table', c[0], c[1], P.w >= P.d ? 0 : Math.PI / 2); }
      P.wall('stool'); P.wall('cooking_pot');
    },
    bedroom: (P, A) => {
      bedWithTables(P, A >= 12 ? 'bed_fourposter' : 'bed_simple', 'nightstand', null);
      P.wall('wardrobe'); P.wall('chest_large'); P.wall('candle_stand');
      if (A > 14) P.wall('washstand');
    },
    bathroom: (P, A) => { if (A >= 4) P.wall('wooden_tub'); P.wall('washstand'); P.wall('garderobe'); },
    closet: (P) => { P.wall('wardrobe'); P.wall('chest_large'); P.wall('wardrobe'); },
    office: (P) => {
      const desk = P.wall('writing_desk');
      if (desk) { const [cx, cz] = P.inward(desk, desk.it.footprint[1] / 2 + 0.3); P.at('chair', cx, cz, ROT[desk.s] + Math.PI); }
      P.wall('bookshelf'); P.wall('bookshelf'); P.wall('lectern'); P.wall('candle_stand');
    },
    laundry: (P) => { P.wall('wash_tub'); P.wall('barrel'); P.wall('shelf_tall'); },
    pantry: (P) => { P.wall('shelf_tall'); P.wall('cask'); P.wall('barrel'); P.wall('crate'); },
    hallway: (P, A) => { if (A > 7) { P.wall('candle_stand'); P.wall('chest_large'); } if (Math.max(P.w, P.d) > 4.5) P.at('rug_runner', (P.r[0] + P.r[2]) / 2, (P.r[1] + P.r[3]) / 2, P.w >= P.d ? Math.PI / 2 : 0, { noRect: true, ignorePlaced: true }); },
  },
  cn: {
    living: (P) => {
      const sc = P.wall('cn_screen');
      if (sc) { const [cx, cz] = P.inward(sc, 1.6); P.at('cn_tea_table', cx, cz, ROT[sc.s]); }
      P.wall('cn_armchair'); P.wall('cn_armchair'); P.wall('cn_scroll', P.sidesByLength(), { noRect: true }); P.wall('cn_vase'); P.wall('cn_cabinet');
      P.ceiling('cn_lantern_hanging');
    },
    dining: (P) => { diningSet(P, (P.r[0] + P.r[2]) / 2, (P.r[1] + P.r[3]) / 2, P.w >= P.d, 'round_table', 'stool', 1); P.wall('cn_cabinet'); P.wall('cn_vase'); P.ceiling('cn_lantern_hanging'); },
    kitchen: (P, A) => { P.wall('hearth'); P.wall('pot_shelf'); P.wall('barrel'); if (A >= 9) P.at('kitchen_table', (P.r[0] + P.r[2]) / 2, (P.r[1] + P.r[3]) / 2, P.w >= P.d ? 0 : Math.PI / 2); P.wall('cooking_pot'); },
    bedroom: (P) => { P.wall('cn_canopy_bed'); P.wall('cn_cabinet'); P.wall('cn_washstand'); P.wall('cn_screen'); P.ceiling('cn_lantern_hanging'); },
    bathroom: (P, A) => { if (A >= 4) P.wall('wooden_tub'); P.wall('cn_washstand'); P.wall('garderobe'); },
    closet: (P) => { P.wall('cn_cabinet'); P.wall('cn_cabinet'); P.wall('chest_large'); },
    office: (P) => {
      const desk = P.wall('cn_desk');
      if (desk) { const [cx, cz] = P.inward(desk, desk.it.footprint[1] / 2 + 0.35); P.at('cn_armchair', cx, cz, ROT[desk.s] + Math.PI); }
      P.wall('cn_cabinet'); P.wall('cn_bonsai'); P.wall('cn_scroll', P.sidesByLength(), { noRect: true }); P.wall('cn_vase');
    },
    laundry: (P) => { P.wall('wash_tub'); P.wall('barrel'); },
    pantry: (P) => { P.wall('shelf_tall'); P.wall('barrel'); P.wall('cask'); },
    hallway: (P, A) => { if (A > 6) { P.wall('cn_vase'); P.wall('cn_bonsai'); } P.ceiling('cn_lantern_hanging'); },
  },
};

function diningSet(P: RoomPlacer, cx: number, cz: number, alongX: boolean, table: string, chair: string, maxPerSide = 3) {
  const t = P.at(table, cx, cz, alongX ? 0 : Math.PI / 2);
  if (!t) return;
  const [tw, td] = t.it.footprint;
  const n = Math.max(1, Math.min(maxPerSide, Math.floor(tw / 0.62)));
  for (let i = 0; i < n; i++) {
    const along = (i - (n - 1) / 2) * (tw / n);
    for (const s of [-1, 1]) {
      const off = td / 2 + 0.3;
      if (alongX) P.at(chair, cx + along, cz + s * off, s > 0 ? Math.PI : 0); else P.at(chair, cx + s * off, cz + along, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
}

function bedWithTables(P: RoomPlacer, bed: string, table: string, lamp: string | null) {
  // headboard against the wall facing the door side if possible: try short-ish walls first for long rooms
  const bi = catalogItem(bed);
  const ti = catalogItem(table);
  if (!bi) return;
  const sides = P.sidesByLength();
  // first try with bedside tables, then the bed on its own, then with tighter door clearances
  for (const [withTables, relax] of [[true, 1], [false, 1], [false, 0.55]] as [boolean, number][]) for (const s of sides) {
    P.relax = relax;
    const len = P.sideLen(s);
    const need = bi.footprint[0] + (ti && withTables ? 2 * (ti.footprint[0] + 0.05) : 0);
    for (let c = need / 2 + 0.05; c <= len - need / 2 - 0.05 + 1e-6; c += 0.15) {
      const main = P.rectAt(s, c, bi.footprint[0], bi.footprint[1]);
      if (!P.free(main.rect, bi.height > 1.2)) continue;
      P.put(bed, main.x, main.z, ROT[s], main.rect);
      P.relax = 1;
      if (ti && withTables) for (const k of [-1, 1]) {
        const tc = c + k * (bi.footprint[0] / 2 + ti.footprint[0] / 2 + 0.05);
        const tr = P.rectAt(s, tc, ti.footprint[0], ti.footprint[1]);
        if (P.free(tr.rect, false)) { P.put(table, tr.x, tr.z, ROT[s], tr.rect); if (lamp) P.put(lamp, tr.x, tr.z, ROT[s], null, P.base + ti.height); }
      }
      return;
    }
  }
  P.relax = 1;
}

/** Counters along the longest clear wall: fridge, base units, sink and range, wall cabinets and a hood above. */
function kitchenRun(P: RoomPlacer) {
  const unit = catalogItem('m_counter'), fridge = catalogItem('m_fridge');
  if (!unit || !fridge) return;
  const uw = unit.footprint[0];
  for (const s of P.sidesByLength()) {
    const len = P.sideLen(s);
    const slots: { c: number; rect: Rect; x: number; z: number }[] = [];
    for (let c = uw / 2 + 0.05; c <= len - uw / 2 - 0.05 + 1e-6; c += uw) {
      const r = P.rectAt(s, c, uw, unit.footprint[1]);
      if (P.free(r.rect, false)) slots.push({ c, ...r });
    }
    if (slots.length < 3) continue;
    // fridge at the far end if it fits there
    const fr = P.rectAt(s, len - fridge.footprint[0] / 2 - 0.05, fridge.footprint[0], fridge.footprint[1]);
    const useFridge = P.free(fr.rect, true);
    const usable = slots.filter((sl) => !useFridge || sl.rect[0] >= fr.rect[2] - 0.01 || sl.rect[2] <= fr.rect[0] + 0.01 || sl.rect[1] >= fr.rect[3] - 0.01 || sl.rect[3] <= fr.rect[1] + 0.01);
    if (useFridge) P.put('m_fridge', fr.x, fr.z, ROT[s], fr.rect);
    const sink = Math.floor(usable.length * 0.3), stove = Math.min(usable.length - 1, Math.max(sink + 2, Math.floor(usable.length * 0.72)));
    usable.forEach((sl, i) => {
      const id = i === sink ? 'm_kitchen_sink' : i === stove ? 'm_stove' : i % 3 === 1 ? 'm_counter_drawers' : 'm_counter';
      P.put(id, sl.x, sl.z, ROT[s], sl.rect);
      const p = { s, x: sl.x, z: sl.z };
      if (i === stove) P.above('m_hood', p, 1.55); else if (i !== sink) P.above('m_upper_cabinet', p, 1.45);
    });
    const coffee = usable[Math.min(usable.length - 1, sink + 1)];
    if (coffee && coffee !== usable[stove]) P.put('m_coffee_machine', coffee.x, coffee.z, ROT[s], null, P.base + unit.height);
    return;
  }
}

/** Where doors, windows and stairs are on a floor (building-local), so furniture keeps clear of them. */
function obstaclesFor(b: BuildingDef, f: FloorDef): Obstacle[] {
  const out: Obstacle[] = [];
  const li = levelInset(b, f.level);
  const ext = footprint(b, b.wallThickness / 2 + li);
  const wallById = (id: string): [[number, number], [number, number]] | null => {
    if (id.startsWith('ext:')) { const i = Number(id.slice(4)); return [ext[i], ext[(i + 1) % ext.length]]; }
    const w = f.walls.find((x) => x.id === id);
    return w ? [w.a, w.b] : null;
  };
  for (const o of b.openings) {
    if ((o.floor ?? 0) !== f.level) continue;
    const w = wallById(o.wall);
    if (!w) continue;
    const x = w[0][0] + (w[1][0] - w[0][0]) * o.t, z = w[0][1] + (w[1][1] - w[0][1]) * o.t;
    const door = o.kind.startsWith('door') || o.kind === 'archway';
    out.push({ x, z, r: door ? o.width / 2 + 0.5 : o.width / 2 + 0.1, tallOnly: !door });
  }
  const stairBox = (s: Stair, h: number) => {
    if (s.kind === 'spiral') { out.push({ x: s.pos[0], z: s.pos[1], r: 1.75 }); return; }
    const run = h * 1.6, c = Math.cos(s.rotY), sn = Math.sin(s.rotY);
    for (let k = 0; k <= 6; k++) { const t = -0.6 + (run + 1.6) * (k / 6); out.push({ x: s.pos[0] + t * sn, z: s.pos[1] + t * c, r: s.width / 2 + 0.35 }); }
  };
  for (const s of f.stairs) stairBox(s, f.height);
  const below = b.floors.find((x) => x.level === f.level - 1);
  for (const s of below?.stairs ?? []) stairBox(s, below!.height);
  return out;
}

/** Furnish every room of every storey from its type and the building's interior style. */
export function furnishBuilding(b: BuildingDef): PlacedObject[] {
  const look = lookOf(b);
  const objs: PlacedObject[] = [];
  for (const f of b.floors) {
    const obstacles = obstaclesFor(b, f);
    const base = levelBase(b, f.level) + 0.03;
    const ceil = levelBase(b, f.level) + f.height - 0.25;
    for (const r of f.rooms) {
      // skip a room that just outlines the whole floor around other rooms
      if (f.rooms.some((o) => o !== r && o.rect[0] >= r.rect[0] - 0.01 && o.rect[2] <= r.rect[2] + 0.01 && o.rect[1] >= r.rect[1] - 0.01 && o.rect[3] <= r.rect[3] + 0.01)) continue;
      const recipe = RECIPES[look][r.type] ?? (look === 'modern' ? undefined : RECIPES.period[r.type]);
      const inset = 0.08; // interior walls are 0.15 thick
      const rect: Rect = [r.rect[0] + inset, r.rect[1] + inset, r.rect[2] - inset, r.rect[3] - inset];
      const P = new RoomPlacer(rect, obstacles, base, ceil);
      if (recipe) recipe(P, (rect[2] - rect[0]) * (rect[3] - rect[1]));
      else continue;
      for (const o of P.out) objs.push({ id: uid('obj'), catalogId: o.id, pos: [o.x, o.y, o.z], rotY: o.rot, scale: 1, buildingId: b.id, floor: f.level });
    }
  }
  return objs;
}

/** Restyle finishes (floors, walls, doors) of an existing plan without moving any walls. */
export function restyle(b: BuildingDef, style: InteriorStyle) {
  b.extra.interiorStyle = style;
  const look = lookOf(b);
  for (const f of b.floors) {
    if (f.level < 0) continue;
    f.wallMat = WALL_MAT[look];
    f.floorMat = FLOOR_MAT[look].hallway ?? FLOOR_MAT[look].default;
    f.ceiling = look === 'modern' ? 'flat' : 'beamed';
    for (const w of f.walls) w.material = WALL_MAT[look];
    for (const r of f.rooms) { r.floorMat = FLOOR_MAT[look][r.type] ?? FLOOR_MAT[look].default; r.wallMat = WALL_MAT[look]; r.ceiling = f.ceiling; }
  }
  const doorKind: OpeningKind = look === 'cn' ? 'door_lattice' : look === 'period' ? 'door_arched' : 'door_wood';
  for (const o of b.openings) if (!o.wall.startsWith('ext:') && o.kind !== 'archway' && o.kind.startsWith('door')) o.kind = doorKind;
}

export function hasPlan(b: BuildingDef) { return b.floors.some((f) => f.rooms.length > 1 || f.walls.length > 0); }
export type { CatalogItem };
