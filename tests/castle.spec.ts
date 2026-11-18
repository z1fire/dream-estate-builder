import { test, expect, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

/** Pairs of buildings whose footprints (incl. arcades) overlap. */
async function overlaps(page: Page) {
  return page.evaluate(() => {
    const d = (window as any).app.store.doc;
    const poly = (b: any): number[][] => {
      const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
      let pts: number[][];
      if (b.shape === 'round') pts = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return [Math.cos(a) * b.width / 2, Math.sin(a) * b.width / 2]; });
      else { const w = b.width / 2, dd = b.depth / 2, arc = Number(b.extra.arcade || 0); pts = [[-w, -dd], [w, -dd], [w, dd + arc], [-w, dd + arc]]; }
      return pts.map(([x, z]) => [b.pos[0] + x * c + z * s, b.pos[2] - x * s + z * c]);
    };
    const sep = (P: number[][], Q: number[][]) => {
      for (const A of [P, Q]) for (let i = 0; i < A.length; i++) {
        const a = A[i], b = A[(i + 1) % A.length];
        const nx = -(b[1] - a[1]), nz = b[0] - a[0];
        const pr = (X: number[][]) => X.map(([x, z]) => x * nx + z * nz);
        const p = pr(P), q = pr(Q), L = Math.hypot(nx, nz);
        if (Math.max(...p) < Math.min(...q) + 0.15 * L || Math.max(...q) < Math.min(...p) + 0.15 * L) return true;
      }
      return false;
    };
    const bs = d.buildings, polys = bs.map(poly), bad: string[] = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (!sep(polys[i], polys[j])) bad.push(`${bs[i].name} × ${bs[j].name}`);
    return bad;
  });
}

test('Courtyard Castle demo: the castle of the Hundred Acre painting, light enough for modest GPUs', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await page.goto('./?demo=courtyard');
  await page.waitForFunction(() => (window as any).app?.store.doc.name === 'The Courtyard Castle', null, { timeout: 240_000 });
  const info = await page.evaluate(() => {
    const d = (window as any).app.store.doc;
    const p = d.boundary;
    const inBounds = d.buildings.every((b: any) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > b.pos[2]) !== (zj > b.pos[2]) && b.pos[0] < ((xj - xi) * (b.pos[2] - zi)) / (zj - zi) + xi) c = !c; } return c; });
    const by = (f: (b: any) => boolean) => d.buildings.filter(f).length;
    return {
      buildings: d.buildings.length, walls: d.walls.length, wallPoints: d.walls[0]?.points.length, moats: d.moats.length, inBounds,
      gates: by((b) => b.kind === 'gatehouse'), drawbridges: by((b) => b.extra.drawbridge), dormers: by((b) => Number(b.extra.dormers) > 0), turrets: by((b) => b.extra.turrets),
      banners: by((b) => typeof b.extra.banner === 'string'), flags: by((b) => typeof b.extra.flag === 'string'), arcades: by((b) => Number(b.extra.arcade) > 0), ranges: by((b) => b.extra.backToWall),
      gableFront: by((b) => b.extra.ridge === 'z' && b.extra.pinnacles), round: by((b) => b.kind === 'tower_round'), bridges: d.paths.length, pool: d.water.length,
      bedrooms: d.buildings.flatMap((b: any) => b.floors.flatMap((f: any) => f.rooms)).filter((r: any) => r.type === 'bedroom').length,
    };
  });
  console.log(JSON.stringify(info));
  expect(info.walls).toBe(1);
  expect(info.wallPoints).toBe(10);
  expect(info.moats).toBe(1);
  expect(info.gates).toBe(2); // the great gate and the garden gate
  expect(info.drawbridges).toBe(0); // a fixed stone bridge, as painted
  expect(info.dormers).toBeGreaterThanOrEqual(8);
  expect(info.turrets).toBe(2);
  expect(info.banners).toBeGreaterThanOrEqual(5);
  expect(info.flags).toBeGreaterThanOrEqual(10);
  expect(info.arcades).toBeGreaterThanOrEqual(10);
  expect(info.ranges).toBeGreaterThanOrEqual(10);
  expect(info.gableFront).toBe(3); // gate, garden gate, palace centre
  expect(info.round).toBe(2);
  expect(info.bedrooms).toBeGreaterThanOrEqual(25);
  expect(info.inBounds).toBe(true);
  expect(await overlaps(page)).toEqual([]);

  const vps = await page.evaluate(() => (window as any).app.store.doc.viewpoints.map((v: any) => ({ pos: v.pos, target: v.target, name: v.name })));
  const budget: Record<string, number>[] = [];
  for (let i = 0; i < vps.length; i++) {
    await page.evaluate((v) => { const app = (window as any).app; app.rig.cancelFlight?.(); app.rig.persp.position.set(...v.pos); app.rig.orbit.target.set(...v.target); app.rig.orbit.update(); app.terrain.buildAll?.(app.rig.camera); document.querySelectorAll('#toast').forEach((e) => e.remove()); }, vps[i]);
    await page.waitForTimeout(i === 0 ? 7000 : 4000);
    budget.push(await page.evaluate(() => { const r = (window as any).app.renderer.info.render; return { calls: r.calls, ktris: Math.round(r.triangles / 1000) }; }));
    await page.screenshot({ path: `tests/screenshots/courtyard-${i}.png` });
  }
  console.log(JSON.stringify(budget.map((b, i) => ({ vp: vps[i].name, ...b }))));
  // the whole castle from the air stays well inside a modest GPU's budget
  expect(budget[0].calls).toBeLessThan(1000);
  expect(budget[0].ktris).toBeLessThan(1500);
  // far buildings are drawn from shared batches, and still pick as themselves
  const picked = await page.evaluate(() => {
    const app = (window as any).app;
    const b = app.store.doc.buildings.find((x: any) => x.name === 'The Palace — East Wing');
    const V = app.rig.camera.position.constructor, R = app.raycaster.ray.constructor;
    const p = app.pick(new R(new V(b.pos[0], b.pos[1] + 60, b.pos[2] + 2), new V(0, -1, 0)));
    return { detailed: app.__buildings.isDetailed(b.id), kind: p?.kind, same: p?.id === b.id };
  });
  expect(picked).toEqual({ detailed: false, kind: 'buildings', same: true });
  // walking up to the great hall switches it (and its furniture) to full detail
  const near = await page.evaluate(async () => {
    const app = (window as any).app;
    const b = app.store.doc.buildings.find((x: any) => x.name === 'The Palace — Great Hall');
    app.rig.persp.position.set(b.pos[0] + 2, b.pos[1] + 3, b.pos[2] + 20); app.rig.orbit.target.set(b.pos[0], b.pos[1] + 3, b.pos[2]); app.rig.orbit.update();
    return { id: b.id, furn: app.store.doc.objects.filter((o: any) => o.buildingId === b.id).length };
  });
  await page.waitForFunction((id) => (window as any).app.__buildings.isDetailed(id), near.id, { timeout: 30_000 });
  expect(near.furn).toBeGreaterThan(3);
  expect(errors, errors.join('\n')).toEqual([]);
});
