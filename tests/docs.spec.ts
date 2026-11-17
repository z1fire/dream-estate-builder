// Generates the README screenshots in docs/screenshots (run: npx playwright test tests/docs.spec.ts)
import { test, type Page } from '@playwright/test';

async function shot(page: Page, name: string, setup: string, opts: { photo?: boolean; wait?: number } = {}) {
  await page.evaluate((code) => { const app = (window as any).app; void app; eval(code); }, setup);
  await page.evaluate((photo) => { document.body.classList.toggle('photo', !!photo); document.querySelectorAll('#toast').forEach((e) => e.remove()); const pb = document.getElementById('photobar'); if (pb) pb.style.visibility = 'hidden'; const a = (window as any).app; a.terrain.buildAll(a.rig.camera); }, !!opts.photo);
  await page.waitForTimeout(opts.wait ?? 4000);
  await page.screenshot({ path: `docs/screenshots/${name}.jpg`, type: 'jpeg', quality: 82 });
}

test('README screenshots', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('./?demo');
  await page.waitForFunction(() => (window as any).app?.store.doc.name === 'Ravensmoor Castle', null, { timeout: 180_000 });
  await page.evaluate(() => (window as any).app.setQuality('medium'));
  const cam = (p: number[], t: number[]) => `app.ui.setView('orbit'); app.rig.persp.position.set(${p}); app.rig.orbit.target.set(${t}); app.rig.orbit.update();`;
  await shot(page, 'hero', cam([150, 125, 260], [0, 0, -30]), { photo: true, wait: 6000 });
  await shot(page, 'editor', cam([170, 150, 300], [0, 0, -20]) + "app.ui.setMode('castle');", { wait: 3000 });
  const v = await page.evaluate(() => (window as any).app.store.doc.viewpoints);
  await shot(page, 'castle-gate', cam(v[1].pos, v[1].target), { photo: true });
  await shot(page, 'village', cam(v[3].pos, v[3].target), { photo: true });
  await shot(page, 'farms', cam(v[4].pos, v[4].target), { photo: true });
  await shot(page, 'gardens', cam(v[6].pos, v[6].target), { photo: true });
  // interior cutaway of the keep, throne room
  await shot(page, 'interior', `app.ui.setMode('select'); const k = app.store.doc.buildings.find((b) => b.name === 'Ashworth Manor'); app.__interior.enter(k.id, 1); app.rig.cancelFlight(); const y = app.__interior.levelY; app.rig.persp.position.set(k.pos[0] + 4, y + 19, k.pos[2] - 13); app.rig.orbit.target.set(k.pos[0], y, k.pos[2]); app.rig.orbit.update();`, { wait: 5000 });
  await shot(page, 'night', `app.__interior.exit(false); app.ui.setMode('select'); const s = app.store.doc.settings; s.timeOfDay = 21.3; app.env.setTime(21.3);` + cam(v[2].pos, v[2].target), { photo: true });
  await shot(page, 'winter', `const s = app.store.doc.settings; s.timeOfDay = 13; app.env.setTime(13); s.season = 'winter'; app.env.setSeason('winter'); s.weather = 'overcast'; app.env.setWeather('overcast');` + cam([60, 70, 40], [-20, 0, -100]), { photo: true, wait: 5000 });
  await shot(page, 'plan', `const s = app.store.doc.settings; s.season = 'summer'; app.env.setSeason('summer'); app.env.setWeather('clear'); app.ui.setView('plan'); app.rig.plan.target.set(0, 0, 0); app.rig.ortho.position.set(0, 1500, 0); app.rig.ortho.zoom = 0.85; app.rig.ortho.updateProjectionMatrix();`, { wait: 3000 });
});

test('README screenshots: Chinese demo', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('./?demo=chinese');
  await page.waitForFunction(() => (window as any).app?.store.doc.name === 'Jade Lotus Garden', null, { timeout: 180_000 });
  await page.evaluate(() => (window as any).app.setQuality('medium'));
  const cam = (p: number[], t: number[]) => `app.ui.setView('orbit'); app.rig.persp.position.set(${p}); app.rig.orbit.target.set(${t}); app.rig.orbit.update();`;
  const v = await page.evaluate(() => (window as any).app.store.doc.viewpoints);
  await shot(page, 'chinese-palace', cam(v[2].pos, v[2].target), { photo: true, wait: 6000 });
  await shot(page, 'chinese-garden', cam(v[3].pos, v[3].target), { photo: true });
  await shot(page, 'chinese-pagoda', cam(v[4].pos, v[4].target), { photo: true });
  await shot(page, 'chinese-street', `const s = app.store.doc.settings; s.timeOfDay = 20.8; app.env.setTime(20.8);` + cam(v[5].pos, v[5].target), { photo: true });
  // a Chinese family home with Period interiors
  await page.evaluate(() => { document.body.classList.remove('photo'); const app = (window as any).app; const s = app.store.doc.settings; s.timeOfDay = 15; app.env.setTime(15); const b = app.store.doc.buildings.find((x: any) => x.name === 'West Residence'); app.__interior.enter(b.id, 1); app.rig.cancelFlight(); app.ui.setTool('interior'); });
  await page.locator('#sidepanel .seg button', { hasText: 'Period' }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'interior-period', `const b = app.store.doc.buildings.find((x) => x.name === 'West Residence'); const y = app.__interior.levelY; app.rig.persp.position.set(b.pos[0] + 15, y + 17, b.pos[2] + 3); app.rig.orbit.target.set(b.pos[0], y, b.pos[2]); app.rig.orbit.update();`, { wait: 5000 });
});
