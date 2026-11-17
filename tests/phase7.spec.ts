import { test, expect } from '@playwright/test';
import { trackErrors, ready, planView, drawWorld, clickWorld, lookAt } from './helpers';

test('animals: herds in pastures, ducks on a pond, birds', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await ready(page);
  await planView(page, 0, 0, 1.6);
  await page.keyboard.press('f');
  await page.evaluate(() => (window as any).app.ui.setTool('pasture'));
  await drawWorld(page, [[-40, -30], [10, -30], [10, 20], [-40, 20]], true);
  await page.keyboard.press('w');
  await page.evaluate(() => (window as any).app.ui.setTool('pond'));
  await drawWorld(page, [[30, -10], [60, -15], [70, 10], [45, 25], [28, 12]], true);
  await page.keyboard.press('a');
  const herd = async (species: string, variant: string, count: number, x: number, z: number) => {
    await page.evaluate(([s, v, c]) => { const t = (window as any).app.getTool('animals'); t.species = s; t.variant = v; t.count = c; }, [species, variant, count] as [string, string, number]);
    await clickWorld(page, x, z);
  };
  await herd('sheep', 'sheep', 8, -25, -10);
  await herd('horse', 'horse', 3, -5, 5);
  await herd('cow', 'cow', 3, -30, 10);
  await herd('duck', 'duck', 5, 48, 5);
  await herd('chicken', 'chicken', 6, -60, 40);
  await herd('dog', 'dog', 1, -60, 45);
  const st = await page.evaluate(() => { const d = (window as any).app.store.doc; return { animals: d.animals.length, inPasture: d.animals.filter((a: any) => a.pastureId).length, ducks: d.animals.filter((a: any) => a.waterId).length }; });
  expect(st.animals).toBe(26);
  expect(st.inPasture).toBe(14);
  expect(st.ducks).toBe(5);
  await page.evaluate(() => (window as any).app.ui.setMode('select'));
  await lookAt(page, -15, -5, 45, 0.45);
  await page.waitForTimeout(6000);
  // animals should have moved and stayed inside the pasture
  const inside = await page.evaluate(() => {
    const app = (window as any).app;
    const p = app.store.doc.pastures[0].points;
    const grp = app.scene.getObjectByName('animals');
    let ok = 0, n = 0;
    for (const h of grp.children) {
      const id = h.userData.pick?.id; if (!id) continue;
      const a = app.store.doc.animals.find((x: any) => x.id === id);
      if (!a?.pastureId) continue;
      n++;
      const x = h.position.x, z = h.position.z;
      let inside = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
      if (inside) ok++;
    }
    return { ok, n };
  });
  expect(inside.ok).toBe(inside.n);
  await page.screenshot({ path: 'tests/screenshots/07-pasture.png' });
  await lookAt(page, 48, 5, 30, 0.5);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/screenshots/07-ducks.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
