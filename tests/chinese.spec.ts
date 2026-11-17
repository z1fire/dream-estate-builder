import { test, expect, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

async function settle(page: Page, ms = 3500) {
  await page.evaluate(() => { const app = (window as any).app; app.terrain.buildAll(app.rig.camera); });
  await page.waitForTimeout(ms);
}
async function look(page: Page, pos: number[], target: number[]) {
  await page.evaluate(([p, t]) => { const app = (window as any).app; app.rig.persp.position.set(...p); app.rig.orbit.target.set(...t); app.rig.orbit.update(); }, [pos, target]);
  await settle(page);
}

test('Chinese demo: palace compound, pagoda, pavilions, courtyard walls, garden', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await page.goto('./?demo=chinese');
  await page.waitForFunction(() => (window as any).app?.store.doc.name === 'Jade Lotus Garden', null, { timeout: 180_000 });
  const s = await page.evaluate(() => {
    const d = (window as any).app.store.doc;
    return { b: d.buildings.length, cn: d.buildings.filter((b: any) => b.kind.startsWith('cn_')).length, eaves: d.buildings.filter((b: any) => b.roof === 'eaves').length,
      walls: d.fences.filter((f: any) => f.style === 'cn_wall').length, o: d.objects.length, cnObj: d.objects.filter((o: any) => o.catalogId.startsWith('cn_')).length, a: d.animals.length,
      v: Object.values(d.vegetation).reduce((n: number, x: any) => n + x.length / 5, 0) };
  });
  console.log(JSON.stringify(s));
  expect(s.cn).toBeGreaterThanOrEqual(14);
  expect(s.eaves).toBe(s.cn);
  expect(s.walls).toBe(1);
  expect(s.cnObj).toBeGreaterThan(30);
  // every Chinese building meshed with tiles on its roof
  const roofs = await page.evaluate(() => {
    const app = (window as any).app;
    let n = 0;
    app.scene.traverse((o: any) => { if (o.isMesh && o.material?.map?.image && o.userData.role === 'roof' && o.geometry.attributes.position.count > 200) n++; });
    return n;
  });
  expect(roofs).toBeGreaterThanOrEqual(s.cn);
  await page.evaluate(() => { document.querySelectorAll('#toast').forEach((e) => e.remove()); (window as any).app.ui.setMode('select'); });
  const vps = await page.evaluate(() => (window as any).app.store.doc.viewpoints.map((v: any) => [v.pos, v.target]));
  for (let i = 0; i < vps.length; i++) {
    await look(page, vps[i][0], vps[i][1]);
    await page.screenshot({ path: `tests/screenshots/chinese-${i}.png` });
  }
  // inside the palace hall (cutaway)
  await page.evaluate(() => { const app = (window as any).app; const b = app.store.doc.buildings.find((x: any) => x.kind === 'cn_hall'); app.ui.enterBuilding(b.id); });
  await page.waitForTimeout(4000);
  await settle(page);
  await page.screenshot({ path: 'tests/screenshots/chinese-interior.png' });
  // the Chinese mode panels open
  await page.evaluate(() => (window as any).app.ui.exitBuilding?.());
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).app.ui.setMode('chinese'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/screenshots/chinese-panel.png' });
  expect(await page.locator('.cat-item').count()).toBe(7);
  // night: lanterns and lattice windows glow
  await page.evaluate(() => { const app = (window as any).app; app.env.setTime?.(21.5); app.store.doc.settings.timeOfDay = 21.5; app.store.notify({ type: 'settings' }); });
  await look(page, vps[2][0], vps[2][1]);
  await page.screenshot({ path: 'tests/screenshots/chinese-night.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
