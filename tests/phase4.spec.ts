import { test, expect } from '@playwright/test';
import { trackErrors, ready, planView, drawWorld, clickWorld, lookAt } from './helpers';

test('castle: curtain wall with towers, gatehouse, keep, moat + drawbridge', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await ready(page);
  await page.evaluate(() => { const app = (window as any).app; app.cmd.run({ label: 'flat', do() { app.store.doc.heights.fill(0); app.store.notify({ type: 'terrain', rect: { x0: 0, z0: 0, x1: 1024, z1: 1024 } }); }, undo() {} }); });
  await planView(page, 0, 0, 1.4);
  await page.keyboard.press('c');
  await page.evaluate(() => (window as any).app.ui.setTool('curtain'));
  await drawWorld(page, [[-35, -35], [35, -35], [35, 35], [-35, 35]], true);
  const counts = await page.evaluate(() => { const d = (window as any).app.store.doc; return { walls: d.walls.length, buildings: d.buildings.length }; });
  expect(counts.walls).toBe(1);
  expect(counts.buildings).toBe(5); // 4 towers + gatehouse
  await page.evaluate(() => { const app = (window as any).app; app.ui.setTool('building:castle'); app.getTool('building:castle').kind = 'keep'; });
  await clickWorld(page, 0, -12);
  await page.evaluate(() => { (window as any).app.getTool('building:castle').kind = 'great_hall'; });
  await clickWorld(page, -12, 18);
  await page.evaluate(() => { (window as any).app.getTool('building:castle').kind = 'chapel'; });
  await clickWorld(page, 20, 15);
  // moat via the wall inspector action
  await page.evaluate(async () => {
    const app = (window as any).app;
    const w = app.store.doc.walls[0];
    app.selection.set([{ kind: 'walls', id: w.id }]);
  });
  await page.locator('#props button', { hasText: 'Dig a moat around these walls' }).click();
  await page.waitForTimeout(800);
  const moat = await page.evaluate(() => (window as any).app.store.doc.moats.length);
  expect(moat).toBe(1);
  await page.evaluate(() => (window as any).app.selection.clear());
  await page.screenshot({ path: 'tests/screenshots/04-plan.png' });
  await page.evaluate(() => (window as any).app.ui.setMode('select'));
  await lookAt(page, 0, 0, 150, 0.55);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshots/04-castle.png' });
  // gate close-up (gate is on the longest side = first side, north)
  const gate = await page.evaluate(() => { const b = (window as any).app.store.doc.buildings.find((x: any) => x.kind === 'gatehouse'); return [b.pos[0] + Math.sin(b.rotY) * 30, b.pos[2] + Math.cos(b.rotY) * 30]; });
  await page.evaluate(([x, z]) => { const app = (window as any).app; app.rig.orbit.target.set(x * 0.4, 2, z * 0.4); app.rig.persp.position.set(x + 8, 12, z); app.rig.orbit.update(); }, gate);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/screenshots/04-gate.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
