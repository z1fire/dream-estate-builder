import { test, expect, type Page } from '@playwright/test';
import { trackErrors } from './helpers';

/** Every bedroom has a bed, every kitchen a stove/hearth, every bathroom its fixtures. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const d = (window as any).app.store.doc;
    const bad: string[] = [];
    const inRoom = (o: any, r: any) => o.pos[0] >= r.rect[0] - 0.2 && o.pos[0] <= r.rect[2] + 0.2 && o.pos[2] >= r.rect[1] - 0.2 && o.pos[2] <= r.rect[3] + 0.2;
    for (const b of d.buildings) for (const f of b.floors) for (const r of f.rooms) {
      const objs = d.objects.filter((o: any) => o.buildingId === b.id && o.floor === f.level && inRoom(o, r));
      if (r.type === 'bedroom' && !objs.some((o: any) => /bed/.test(o.catalogId))) bad.push(`${b.name}/${r.name}: no bed`);
      if (r.type === 'kitchen' && !objs.some((o: any) => /stove|hearth/.test(o.catalogId))) bad.push(`${b.name}/${r.name}: no stove`);
      if (r.type === 'bathroom' && !objs.some((o: any) => /toilet|garderobe|basin|vanity|washstand/.test(o.catalogId))) bad.push(`${b.name}/${r.name}: no fixtures`);
    }
    return bad;
  });
}

async function topDown(page: Page, name: string, level: number, h: number, file: string) {
  await page.evaluate(([name, level]) => { const app = (window as any).app; const b = app.store.doc.buildings.find((x: any) => x.name === name); app.__interior.enter(b.id, level); app.rig.cancelFlight(); }, [name, level] as [string, number]);
  await page.waitForTimeout(1500);
  await page.evaluate(([name, h]) => {
    const app = (window as any).app; const b = app.store.doc.buildings.find((x: any) => x.name === name); const y = app.__interior.levelY;
    app.rig.persp.position.set(b.pos[0] + 0.01, y + (h as number), b.pos[2] + 3); app.rig.orbit.target.set(b.pos[0], y, b.pos[2]); app.rig.orbit.update(); app.terrain.buildAll(app.rig.camera);
    document.querySelectorAll('#toast').forEach((e) => e.remove());
  }, [name, h] as [string, number]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `tests/screenshots/homes-${file}.png` });
}

test('homes: generated floor plans are furnished; Modern/Period switch; regenerate from a program', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await page.goto('./?demo');
  await page.waitForFunction(() => (window as any).app?.store.doc.name === 'Ravensmoor Castle', null, { timeout: 180_000 });
  expect(await audit(page)).toEqual([]);
  const manor = await page.evaluate(() => {
    const b = (window as any).app.store.doc.buildings.find((x: any) => x.name === 'Ashworth Manor');
    return { rooms: b.floors.flatMap((f: any) => f.rooms.map((r: any) => r.type)), walls: b.floors.reduce((s: number, f: any) => s + f.walls.length, 0), stairs: b.floors.reduce((s: number, f: any) => s + f.stairs.length, 0) };
  });
  expect(manor.rooms.filter((t: string) => t === 'bedroom').length).toBe(5);
  expect(manor.rooms.filter((t: string) => t === 'bathroom').length).toBe(4);
  for (const t of ['kitchen', 'living', 'dining', 'office', 'laundry', 'closet', 'hallway']) expect(manor.rooms).toContain(t);
  expect(manor.walls).toBeGreaterThan(20);
  expect(manor.stairs).toBe(2);
  await topDown(page, 'Ashworth Manor', 1, 30, 'manor-modern');
  // switch the manor to Period interiors
  await page.locator('#sidepanel .seg button', { hasText: 'Period' }).click();
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => (window as any).app.__interior.building.extra.interiorStyle)).toBe('period');
  expect(await audit(page)).toEqual([]);
  await topDown(page, 'Ashworth Manor', 1, 30, 'manor-period');
  // regenerate with a different program: 3 bedrooms, 2 bathrooms, no study
  await page.evaluate(() => {
    const t = (window as any).app.getTool('interior');
    Object.assign(t.prog, { bedrooms: 3, bathrooms: 2, office: false });
  });
  await page.locator('#sidepanel button', { hasText: 'Generate floor plans' }).click();
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => (window as any).app.__interior.building.floors.flatMap((f: any) => f.rooms.map((r: any) => r.type)));
  expect(after.filter((t: string) => t === 'bedroom').length).toBe(3);
  expect(after).not.toContain('office');
  expect(await audit(page)).toEqual([]);
  // one undo restores the previous plan and furniture
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).app.__interior.building.floors.flatMap((f: any) => f.rooms).filter((r: any) => r.type === 'bedroom').length)).toBe(5);
  // Chinese demo: residences furnished too
  await page.goto('./?demo=chinese');
  await page.waitForFunction(() => (window as any).app?.store.doc.name === 'Jade Lotus Garden', null, { timeout: 180_000 });
  expect(await audit(page)).toEqual([]);
  await topDown(page, 'West Residence', 1, 28, 'cn-residence');
  expect(errors, errors.join('\n')).toEqual([]);
});
