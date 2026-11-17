import { test, expect } from '@playwright/test';
import { trackErrors, ready, planView, drawWorld, clickWorld, toScreen, lookAt } from './helpers';

test('water & landscaping', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await ready(page);
  const doc = () => page.evaluate(() => { const d = (window as any).app.store.doc; return { moats: d.moats.length, water: d.water.length, paths: d.paths.length, fences: d.fences.length, objects: d.objects.length, veg: Object.values(d.vegetation).reduce((s: number, a: any) => s + a.length / 5, 0) }; });

  await planView(page, 0, 0, 1.4);
  // moat
  await page.keyboard.press('w');
  await page.evaluate(() => (window as any).app.ui.setTool('moat'));
  await drawWorld(page, [[-40, -40], [40, -40], [40, 40], [-40, 40]], true);
  expect((await doc()).moats).toBe(1);
  // pond (click mode, freehand also works)
  await page.evaluate(() => (window as any).app.ui.setTool('pond'));
  await drawWorld(page, [[80, 60], [110, 55], [125, 80], [100, 100], [75, 90]], true);
  // stream
  await page.evaluate(() => (window as any).app.ui.setTool('stream'));
  await drawWorld(page, [[-140, -100], [-110, -60], [-90, -10], [-70, 30]], false);
  expect((await doc()).water).toBe(2);
  // road crossing the moat → bridge
  await page.keyboard.press('r');
  await page.evaluate(() => (window as any).app.ui.setTool('path'));
  await drawWorld(page, [[0, 0], [0, 70], [20, 120]], false);
  await page.waitForTimeout(500);
  const bridges = await page.evaluate(() => (window as any).app.scene.getObjectByName('paths').children.length);
  expect(bridges).toBeGreaterThan(0);
  // fence with gate
  await page.evaluate(() => (window as any).app.ui.setTool('fence'));
  await drawWorld(page, [[60, -60], [100, -60], [100, -20], [60, -20]], true);
  // hedge maze
  await page.keyboard.press('g');
  await page.evaluate(() => (window as any).app.ui.setTool('garden'));
  await page.locator('#sidepanel .seg button', { hasText: 'Hedge maze' }).click();
  await clickWorld(page, -120, 60); await clickWorld(page, -90, 90);
  expect((await doc()).fences).toBeGreaterThan(5);
  // scatter woodland
  await page.evaluate(() => (window as any).app.ui.setTool('scatter'));
  const [sx, sy] = await toScreen(page, 60, 120);
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 0; i < 20; i++) { await page.mouse.move(sx + i * 6, sy + Math.sin(i) * 20); await page.waitForTimeout(60); }
  await page.mouse.up();
  expect((await doc()).veg).toBeGreaterThan(10);
  // place a fountain
  await page.evaluate(() => { const app = (window as any).app; app.ui.setTool('place:garden'); app.getTool('place:garden').select('fountain_tiered'); });
  await page.waitForTimeout(800);
  await clickWorld(page, 0, -20);
  await page.waitForTimeout(300);
  expect((await doc()).objects).toBe(1);
  await page.screenshot({ path: 'tests/screenshots/03-plan.png' });
  // 3D views
  await page.evaluate(() => (window as any).app.ui.setMode('select'));
  await lookAt(page, 0, 20, 140, 0.45);
  await page.evaluate(() => (window as any).app.terrain.buildAll());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/screenshots/03-moat.png' });
  await lookAt(page, -100, 40, 120, 0.5);
  await page.screenshot({ path: 'tests/screenshots/03-stream-maze.png' });
  // undo everything step by step then redo
  for (let i = 0; i < 12; i++) await page.keyboard.press('Control+z');
  expect((await doc()).moats).toBe(0);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Control+y');
  expect((await doc()).moats).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});
