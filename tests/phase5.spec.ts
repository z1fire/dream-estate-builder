import { test, expect, type Page } from '@playwright/test';
import { trackErrors, ready, toScreen } from './helpers';

/** world position of a building-local point at the current interior level */
async function localToScreen(page: Page, lx: number, lz: number) {
  return page.evaluate(([lx, lz]) => {
    const app = (window as any).app;
    const it = app.__interior;
    const b = it.building;
    const c = Math.cos(b.rotY), s = Math.sin(b.rotY);
    const wx = b.pos[0] + lx * c + lz * s, wz = b.pos[2] - lx * s + lz * c;
    const v = new (app.rig.camera.position.constructor)(wx, it.levelY, wz).project(app.rig.camera);
    const r = app.renderer.domElement.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  }, [lx, lz]) as Promise<[number, number]>;
}

test('interiors: enter keep, cutaway, edit plan, furnish', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await ready(page);
  // place a keep
  await page.evaluate(() => { const app = (window as any).app; app.ui.setMode('castle', 'building:castle'); app.getTool('building:castle').kind = 'keep'; app.ui.setView('plan'); app.rig.plan.target.set(0, 0, 0); app.rig.ortho.position.set(0, 1500, 0); app.rig.ortho.zoom = 3; app.rig.ortho.updateProjectionMatrix(); });
  await page.waitForTimeout(300);
  const [sx, sy] = await toScreen(page, 0, 0);
  await page.mouse.click(sx, sy);
  await page.waitForTimeout(500);
  const objs = await page.evaluate(() => (window as any).app.store.doc.objects.length);
  expect(objs).toBeGreaterThan(10); // starter furniture
  // enter via double click in select mode (3D)
  await page.evaluate(() => { const app = (window as any).app; app.ui.setView('orbit'); app.ui.setMode('select'); app.rig.orbit.target.set(0, 3, 0); app.rig.persp.position.set(30, 40, 40); app.rig.orbit.update(); });
  await page.waitForTimeout(800);
  const [bx, by] = await toScreen(page, 0, 0);
  await page.mouse.dblclick(bx, by - 40);
  await page.waitForTimeout(2500);
  const inside = await page.evaluate(() => { const app = (window as any).app; return { mode: app.ui.mode.id, cut: app.__interior.buildingId !== null }; });
  expect(inside.mode).toBe('interiors');
  expect(inside.cut).toBe(true);
  await page.screenshot({ path: 'tests/screenshots/05-ground.png' });
  // go to 2nd floor (bedroom)
  await page.locator('#floorbar button', { hasText: '2nd floor' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/screenshots/05-bedroom.png' });
  // floor plan: draw an interior wall
  await page.evaluate(() => { const app = (window as any).app; app.rig.orbit.target.set(0, app.__interior.levelY, 0); app.rig.persp.position.set(2, app.__interior.levelY + 34, 8); app.rig.orbit.update(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => (window as any).app.ui.setTool('interior'));
  let p = await localToScreen(page, 0, -5.5); await page.mouse.click(p[0], p[1]);
  p = await localToScreen(page, 0, 5.5); await page.mouse.click(p[0], p[1]);
  await page.keyboard.press('Escape');
  const walls = await page.evaluate(() => (window as any).app.__interior.floor.walls.length);
  expect(walls).toBe(1);
  // add a door in that wall
  await page.locator('#sidepanel .seg button', { hasText: 'Doors & windows' }).click();
  p = await localToScreen(page, 0, 0); await page.mouse.click(p[0], p[1]);
  const ops = await page.evaluate(() => { const it = (window as any).app.__interior; return it.building.openings.filter((o: any) => o.wall === it.floor.walls[0].id).length; });
  expect(ops).toBe(1);
  // add a room by dragging
  await page.locator('#sidepanel .seg button', { hasText: 'Rooms' }).click();
  const a = await localToScreen(page, 0.5, -5.5), c = await localToScreen(page, 6, 5.5);
  await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move((a[0] + c[0]) / 2, (a[1] + c[1]) / 2); await page.mouse.move(c[0], c[1]); await page.mouse.up();
  const rooms = await page.evaluate(() => (window as any).app.__interior.floor.rooms.length);
  expect(rooms).toBe(2);
  // furnish: place a wardrobe
  await page.evaluate(() => { const app = (window as any).app; app.ui.setTool('furnish'); app.getTool('furnish').select('chest_large'); });
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => (window as any).app.store.doc.objects.length);
  p = await localToScreen(page, 3, 2); await page.mouse.move(p[0], p[1]); await page.mouse.click(p[0], p[1]);
  const after = await page.evaluate(() => (window as any).app.store.doc.objects.length);
  expect(after).toBe(before + 1);
  // night with x-ray
  await page.evaluate(() => { const app = (window as any).app; app.store.doc.settings.timeOfDay = 22; app.env.setTime(22); });
  await page.locator('#floorbar button', { hasText: 'X-ray' }).click();
  await page.evaluate(() => { const app = (window as any).app; app.rig.orbit.target.set(0, app.__interior.levelY, 0); app.rig.persp.position.set(18, app.__interior.levelY + 20, 22); app.rig.orbit.update(); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tests/screenshots/05-night-xray.png' });
  // exit
  await page.locator('#floorbar button', { hasText: 'Exit' }).click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).app.__interior.buildingId)).toBe(null);
  expect(errors, errors.join('\n')).toEqual([]);
});
