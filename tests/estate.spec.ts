import { test, expect, type Page } from '@playwright/test';
import { trackErrors, ready, planView, drawWorld, clickWorld, lookAt } from './helpers';

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

test('wall ranges: snap a building against the wall, line the wall with ranges', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await ready(page);
  await page.evaluate(() => { const app = (window as any).app; app.cmd.run({ label: 'flat', do() { app.store.doc.heights.fill(0); app.store.notify({ type: 'terrain', rect: { x0: 0, z0: 0, x1: 1024, z1: 1024 } }); }, undo() {} }); });
  await planView(page, 0, 0, 1.4);
  await page.keyboard.press('c');
  await page.evaluate(() => (window as any).app.ui.setTool('curtain'));
  await drawWorld(page, [[-40, -40], [40, -40], [40, 40], [-40, 40]], true);
  // a stable placed near the north wall snaps its back against it
  await page.evaluate(() => { const app = (window as any).app; app.ui.setTool('building:castle'); app.getTool('building:castle').kind = 'stables'; });
  await clickWorld(page, 3, -31);
  const st = await page.evaluate(() => { const b = (window as any).app.store.doc.buildings.find((x: any) => x.kind === 'stables'); return { z: b.pos[2], rot: b.rotY, back: b.extra.backToWall, roof: b.roof, backOps: b.openings.filter((o: any) => o.wall === 'ext:0').length, depth: b.depth }; });
  expect(Math.abs(st.z - (-40 + 1.2 + 0.05 + st.depth / 2))).toBeLessThan(0.05);
  expect(Math.abs(st.rot)).toBeLessThan(1e-6);
  expect(st.back).toBe(true);
  expect(st.roof).toBe('lean');
  expect(st.backOps).toBe(0);
  // line the rest of the wall from the wall inspector (one undo step)
  const before = await page.evaluate(() => (window as any).app.store.doc.buildings.length);
  await page.evaluate(() => { const app = (window as any).app; app.ui.setMode('select'); app.selection.set([{ kind: 'walls', id: app.store.doc.walls[0].id }]); });
  await page.locator('#props button', { hasText: 'Line the wall with ranges' }).click();
  await page.waitForTimeout(1000);
  const ranges = await page.evaluate(() => (window as any).app.store.doc.buildings.filter((b: any) => b.kind === 'range'));
  expect(ranges.length).toBeGreaterThanOrEqual(4);
  for (const r of ranges) { expect(r.roof).toBe('lean'); expect(r.extra.arcade).toBeGreaterThan(1); expect(r.floors.flatMap((f: any) => f.rooms).some((x: any) => x.type === 'bedroom')).toBe(true); }
  expect(await overlaps(page)).toEqual([]);
  await page.evaluate(() => (window as any).app.selection.clear());
  await lookAt(page, 0, 0, 120, 0.6);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshots/ranges.png' });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).app.store.doc.buildings.length)).toBe(before);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Hundred Acre Estate demo: courtyard castle lined with ranges, village, farms', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await page.goto('./?demo=estate');
  await page.waitForFunction(() => (window as any).app?.store.doc.name === 'The Hundred Acre Estate', null, { timeout: 240_000 });
  const info = await page.evaluate(() => {
    const d = (window as any).app.store.doc;
    let a = 0; const p = d.boundary; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; }
    const inBounds = d.buildings.every((b: any) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > b.pos[2]) !== (zj > b.pos[2]) && b.pos[0] < ((xj - xi) * (b.pos[2] - zi)) / (zj - zi) + xi) c = !c; } return c; });
    return { acres: Math.abs(a / 2) / 4046.86, ranges: d.buildings.filter((b: any) => b.extra.backToWall).length, walls: d.walls.length, moats: d.moats.length, gates: d.buildings.filter((b: any) => b.kind === 'gatehouse').length, inBounds,
      bedrooms: d.buildings.flatMap((b: any) => b.floors.flatMap((f: any) => f.rooms)).filter((r: any) => r.type === 'bedroom').length };
  });
  console.log(JSON.stringify(info));
  expect(info.acres).toBeGreaterThan(95);
  expect(info.acres).toBeLessThan(105);
  expect(info.walls).toBe(3);
  expect(info.gates).toBe(3);
  expect(info.moats).toBe(1);
  expect(info.ranges).toBeGreaterThanOrEqual(14);
  expect(info.bedrooms).toBeGreaterThanOrEqual(25);
  expect(info.inBounds).toBe(true);
  expect(await overlaps(page)).toEqual([]);
  const vps = await page.evaluate(() => (window as any).app.store.doc.viewpoints.map((v: any) => ({ pos: v.pos, target: v.target })));
  for (let i = 0; i < vps.length; i++) {
    await page.evaluate((v) => { const app = (window as any).app; app.rig.cancelFlight?.(); app.rig.persp.position.set(...v.pos); app.rig.orbit.target.set(...v.target); app.rig.orbit.update(); app.terrain.buildAll?.(app.rig.camera); document.querySelectorAll('#toast').forEach((e) => e.remove()); }, vps[i]);
    await page.waitForTimeout(i === 0 ? 6000 : 3500);
    await page.screenshot({ path: `tests/screenshots/estate-${i}.png` });
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
