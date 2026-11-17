import { test, expect } from '@playwright/test';
import { trackErrors, ready, planView, drawWorld, clickWorld, lookAt } from './helpers';

test('village & farming', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await ready(page);
  await planView(page, 0, 0, 1.2);
  const setT = (id: string, extra = '') => page.evaluate(([id, extra]) => { const app = (window as any).app; app.ui.setTool(id); if (extra) eval(extra); }, [id, extra]);
  await page.keyboard.press('f');
  await setT('field', "app.getTool('field').crop='wheat'; app.getTool('field').stage=3");
  await drawWorld(page, [[20, 20], [80, 20], [80, 60], [20, 60]], true);
  await setT('field', "app.getTool('field').crop='corn'; app.getTool('field').stage=2");
  await drawWorld(page, [[20, 70], [60, 70], [60, 100], [20, 100]], true);
  await setT('field', "app.getTool('field').crop='vineyard'; app.getTool('field').stage=3");
  await drawWorld(page, [[90, 20], [130, 20], [130, 60], [90, 60]], true);
  await setT('field', "app.getTool('field').crop='orchard'; app.getTool('field').stage=3");
  await drawWorld(page, [[90, 70], [130, 70], [130, 105], [90, 105]], true);
  await setT('pasture');
  await drawWorld(page, [[-60, 20], [-10, 20], [-10, 70], [-60, 70]], true);
  const d = await page.evaluate(() => { const x = (window as any).app.store.doc; return { fields: x.fields.length, pastures: x.pastures.length, fences: x.fences.length }; });
  expect(d).toEqual({ fields: 4, pastures: 1, fences: 1 });
  // village
  await page.keyboard.press('b');
  await setT('square');
  await drawWorld(page, [[-40, -60], [-10, -60], [-10, -35], [-40, -35]], true);
  for (const [kind, x, z] of [['tavern', -25, -78], ['cottage', -55, -50], ['cottage_timber', -55, -30], ['blacksmith', 2, -50], ['windmill', 10, -20], ['bakery', -25, -20]] as [string, number, number][]) {
    await setT('building:village', `app.getTool('building:village').kind='${kind}'`);
    await clickWorld(page, x, z);
  }
  expect(await page.evaluate(() => (window as any).app.store.doc.buildings.length)).toBe(6);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/06-plan.png' });
  await page.evaluate(() => (window as any).app.ui.setMode('select'));
  await lookAt(page, 60, 50, 110, 0.5);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshots/06-farms.png' });
  await lookAt(page, -25, -45, 75, 0.45);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshots/06-village.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
