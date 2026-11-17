import { test, expect } from '@playwright/test';
import { trackErrors, ready, drag } from './helpers';

test('terrain sculpt, paint, measure, plan view, undo', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await ready(page);
  await page.screenshot({ path: 'tests/screenshots/02-start.png' });

  // sculpt: raise a hill
  await page.keyboard.press('t');
  await page.waitForTimeout(200);
  const hBefore = await page.evaluate(() => (window as any).app.terrain.heightAt(0, 0));
  await page.evaluate(() => { const a = (window as any).app; a.rig.orbit.target.set(0, 0, 0); a.rig.persp.position.set(60, 90, 120); });
  await page.waitForTimeout(400);
  const box = (await page.locator('#viewport canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await drag(page, cx - 40, cy, cx + 40, cy, 20, 800);
  await page.waitForTimeout(300);
  const hAfter = await page.evaluate(() => (window as any).app.terrain.heightAt(0, 0));
  expect(hAfter).toBeGreaterThan(hBefore + 0.5);
  await page.screenshot({ path: 'tests/screenshots/02-sculpt.png' });

  // paint cobblestone
  await page.keyboard.press('p');
  await page.locator('.swatch', { hasText: 'Cobble' }).click();
  await drag(page, cx - 120, cy + 60, cx + 120, cy + 60, 20, 400);
  await page.screenshot({ path: 'tests/screenshots/02-paint.png' });

  // undo the paint + sculpt
  const undoCount = await page.evaluate(() => (window as any).app.cmd.canUndo);
  expect(undoCount).toBe(true);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  const hUndo = await page.evaluate(() => (window as any).app.terrain.heightAt(0, 0));
  expect(Math.abs(hUndo - hBefore)).toBeLessThan(0.01);
  await page.keyboard.press('Control+y');

  // measure
  await page.keyboard.press('m');
  await page.mouse.click(cx - 200, cy + 100);
  await page.mouse.click(cx + 150, cy - 50);
  await page.waitForTimeout(200);
  await expect(page.locator('.label3d').filter({ hasText: 'ft' }).first()).toBeVisible();

  // plan view with grid + scale bar
  await page.keyboard.press('Tab');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/screenshots/02-plan.png' });
  await expect(page.locator('.scalebar .t')).toContainText('ft', { timeout: 30_000 });
  await page.keyboard.press('Tab');

  // save + reload round trip
  await page.evaluate(() => (window as any).deb.autosave.saveNow());
  const id = await page.evaluate(() => (window as any).app.store.doc.id);
  page.on('dialog', (d) => void d.accept()); // the unsaved-changes guard may ask before leaving
  await page.goto('./');
  await page.waitForFunction(() => (window as any).app && (window as any).deb, null, { timeout: 60_000 });
  const id2 = await page.evaluate(() => (window as any).app.store.doc.id);
  expect(id2).toBe(id);
  const hReload = await page.evaluate(() => (window as any).app.terrain.heightAt(0, 0));
  expect(Math.abs(hReload - hAfter)).toBeLessThan(0.01);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('new estate wizard + boundary', async ({ page }) => {
  const errors = trackErrors(page);
  await ready(page);
  await page.evaluate(() => (window as any).app.ui.openWizard());
  await page.locator('.modal input[type=text]').fill('Test Manor');
  await page.locator('.modal .seg button', { hasText: 'Acres' }).click();
  await page.locator('.modal input[type=number]').first().fill('60');
  await page.locator('.modal button', { hasText: 'Create estate' }).click();
  await page.waitForTimeout(1500);
  const area = await page.evaluate(() => { const b = (window as any).app.store.doc.boundary; let a = 0; for (let i = 0, j = b.length - 1; i < b.length; j = i++) a += (b[j][0] + b[i][0]) * (b[j][1] - b[i][1]); return Math.abs(a / 2) / 4046.86; });
  expect(area).toBeGreaterThan(59);
  expect(area).toBeLessThan(61);
  await expect(page.locator('.estate-name')).toHaveText('Test Manor');
  await page.screenshot({ path: 'tests/screenshots/02-wizard-estate.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
