import { test, expect, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

async function settle(page: Page, ms = 3500) {
  await page.evaluate(() => { const app = (window as any).app; app.terrain.buildAll(app.rig.camera); });
  await page.waitForTimeout(ms);
}

test('demo estate loads with castle, moat, village, farms, animals', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  const t0 = Date.now();
  await page.goto('./?demo');
  await page.waitForFunction(() => (window as any).app?.store.doc.name === 'Ravensmoor Castle', null, { timeout: 180_000 });
  console.log('demo built in', Date.now() - t0, 'ms');
  const s = await page.evaluate(() => { const d = (window as any).app.store.doc; return { b: d.buildings.length, w: d.walls.length, m: d.moats.length, f: d.fields.length, p: d.pastures.length, a: d.animals.length, o: d.objects.length, v: Object.values(d.vegetation).reduce((n: number, x: any) => n + x.length / 5, 0), water: d.water.length, rooms: d.buildings.reduce((n: number, b: any) => n + b.floors.reduce((m: number, f: any) => m + f.rooms.length, 0), 0) }; });
  console.log(JSON.stringify(s));
  expect(s.b).toBeGreaterThan(20);
  expect(s.m).toBe(1);
  expect(s.a).toBeGreaterThan(50);
  expect(s.v).toBeGreaterThan(500);
  await page.evaluate(() => { document.querySelectorAll('#toast').forEach((e) => e.remove()); (window as any).app.ui.setMode('select'); });
  const vps = await page.evaluate(() => (window as any).app.store.doc.viewpoints.map((v: any) => v.name));
  for (let i = 0; i < vps.length; i++) {
    await page.evaluate((i) => { const app = (window as any).app; const v = app.store.doc.viewpoints[i]; app.rig.persp.position.set(...v.pos); app.rig.orbit.target.set(...v.target); app.rig.orbit.update(); }, i);
    await settle(page);
    await page.screenshot({ path: `tests/screenshots/demo-${i}.png` });
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
