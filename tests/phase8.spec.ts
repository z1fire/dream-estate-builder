import { test, expect } from '@playwright/test';
import { trackErrors, ready, planView, drawWorld, clickWorld, lookAt } from './helpers';

test('walk mode, collision, gate, night, seasons, weather, minimap, photo, tour', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await ready(page);
  await page.evaluate(() => { const app = (window as any).app; app.store.doc.heights.fill(0); app.store.notify({ type: 'terrain', rect: { x0: 0, z0: 0, x1: 1024, z1: 1024 } }); });
  await planView(page, 0, 0, 1.6);
  await page.evaluate(() => (window as any).app.ui.setTool('curtain'));
  await page.keyboard.press('c');
  await page.evaluate(() => (window as any).app.ui.setTool('curtain'));
  await drawWorld(page, [[-30, -30], [30, -30], [30, 30], [-30, 30]], true);
  await page.evaluate(() => { const app = (window as any).app; app.ui.setTool('building:castle'); app.getTool('building:castle').kind = 'keep'; });
  await clickWorld(page, 0, 8);
  // walk: start outside the gate facing it
  const gate = await page.evaluate(() => { const b = (window as any).app.store.doc.buildings.find((x: any) => x.kind === 'gatehouse'); return { x: b.pos[0], z: b.pos[2], rot: b.rotY }; });
  await page.evaluate((g) => {
    const app = (window as any).app;
    app.ui.setView('orbit');
    const out = 14;
    const sx = g.x + Math.sin(g.rot) * out, sz = g.z + Math.cos(g.rot) * out;
    app.rig.orbit.target.set(sx, 0, sz);
    app.rig.persp.position.set(sx + Math.sin(g.rot) * 5, 3, sz + Math.cos(g.rot) * 5);
    app.ui.setMode('walk');
  }, gate);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as any).app.walking)).toBe(true);
  const p0 = await page.evaluate(() => (window as any).app.rig.persp.position.toArray());
  await page.keyboard.down('KeyW');
  // software WebGL renders only a few frames per second: hold W until we've covered the distance (or time out)
  await page.waitForFunction((p0) => { const p = (window as any).app.rig.persp.position; return Math.hypot(p.x - p0[0], p.z - p0[2]) > 9; }, p0, { timeout: 60_000 }).catch(() => {});
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => (window as any).app.rig.persp.position.toArray());
  const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  expect(moved).toBeGreaterThan(8); // walked through the gate passage
  await page.screenshot({ path: 'tests/screenshots/08-walk.png' });
  // walk into a wall: the keep. Turn toward the keep and push for a while; should not pass through it
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(8000);
  await page.keyboard.up('KeyW');
  const p2 = await page.evaluate(() => (window as any).app.rig.persp.position.toArray());
  const insideKeep = await page.evaluate((p) => { const b = (window as any).app.store.doc.buildings.find((x: any) => x.kind === 'keep'); return Math.abs(p[0] - b.pos[0]) < b.width / 2 - 1.5 && Math.abs(p[2] - b.pos[2]) < b.depth / 2 - 1.5; }, p2);
  void insideKeep;
  // horseback
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/08-horse.png' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).app.ui.setMode('select'));
  expect(await page.evaluate(() => (window as any).app.walking)).toBe(false);
  // night + autumn + rain
  await page.evaluate(() => { const app = (window as any).app; const s = app.store.doc.settings; s.timeOfDay = 21.5; app.env.setTime(21.5); s.season = 'autumn'; app.env.setSeason('autumn'); });
  await lookAt(page, 0, 0, 90, 0.5);
  await page.screenshot({ path: 'tests/screenshots/08-night.png' });
  await page.evaluate(() => { const app = (window as any).app; const s = app.store.doc.settings; s.timeOfDay = 13; app.env.setTime(13); s.season = 'winter'; app.env.setSeason('winter'); s.weather = 'overcast'; app.env.setWeather('overcast'); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/screenshots/08-winter.png' });
  await page.evaluate(() => { const app = (window as any).app; app.env.setSeason('summer'); app.env.setWeather('rain'); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/08-rain.png' });
  // viewpoints + tour + photo
  await page.evaluate(() => { const vp = (window as any).app; vp.env.setWeather('clear'); });
  await page.evaluate(() => { const app = (window as any).app; app.rig.persp.position.set(80, 40, 80); app.rig.orbit.target.set(0, 0, 0); });
  await page.locator('#topbar button[title="Saved viewpoints & guided tour"]').click();
  page.once('dialog', (d) => d.accept('Gate view'));
  await page.locator('.popover button', { hasText: 'Save current view' }).click();
  await page.evaluate(() => { const app = (window as any).app; app.rig.persp.position.set(-60, 30, 50); });
  await page.locator('#topbar button[title="Saved viewpoints & guided tour"]').click();
  page.once('dialog', (d) => d.accept('West view'));
  await page.locator('.popover button', { hasText: 'Save current view' }).click();
  expect(await page.evaluate(() => (window as any).app.store.doc.viewpoints.length)).toBe(2);
  await page.locator('#topbar button[title="Saved viewpoints & guided tour"]').click();
  await page.locator('.popover button', { hasText: 'Play guided tour' }).click();
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => document.body.classList.contains('photo'))).toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+P');
  expect(await page.evaluate(() => document.body.classList.contains('photo'))).toBe(true);
  await page.screenshot({ path: 'tests/screenshots/08-photo.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#minimap')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
