import type { Page } from '@playwright/test';

export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export async function ready(page: Page, q = '?new') {
  await page.goto(`./${q}`);
  await page.waitForFunction(() => (window as any).app && (window as any).deb, null, { timeout: 90_000 });
  await page.waitForTimeout(1500);
}

export async function drag(page: Page, x0: number, y0: number, x1: number, y1: number, steps = 12, holdMs = 0) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(30); }
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

/** Click a sequence of points on the canvas then double-click the last one. */
export async function drawPoly(page: Page, pts: [number, number][], close = true) {
  for (const [x, y] of pts) { await page.mouse.click(x, y); await page.waitForTimeout(60); }
  if (close) { await page.mouse.click(pts[0][0], pts[0][1]); } else { await page.keyboard.press('Enter'); }
  await page.waitForTimeout(300);
}

export async function canvasCenter(page: Page) {
  const box = (await page.locator('#viewport canvas').boundingBox())!;
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, box };
}

/** Project world (x, z) at ground height to page pixel coordinates using the active camera. */
export async function toScreen(page: Page, x: number, z: number): Promise<[number, number]> {
  return page.evaluate(([x, z]) => {
    const app = (window as any).app;
    const y = app.terrain.heightAt(x, z);
    const v = new (app.rig.camera.position.constructor)(x, y, z).project(app.rig.camera);
    const r = app.renderer.domElement.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  }, [x, z]) as Promise<[number, number]>;
}

/** Switch to plan view centred on (x,z) with a given zoom. */
export async function planView(page: Page, x = 0, z = 0, zoom = 1.6) {
  await page.evaluate(([x, z, zoom]) => {
    const app = (window as any).app;
    app.ui.setView('plan');
    app.rig.plan.target.set(x, 0, z);
    app.rig.ortho.position.set(x, 1500, z);
    app.rig.ortho.zoom = zoom;
    app.rig.ortho.updateProjectionMatrix();
    app.rig.plan.update();
  }, [x, z, zoom]);
  await page.waitForTimeout(300);
}

export async function clickWorld(page: Page, x: number, z: number) {
  const [sx, sy] = await toScreen(page, x, z);
  await page.mouse.click(sx, sy);
  await page.waitForTimeout(40);
}

/** Draw a polyline in world coordinates with the active tool. close: click first point; else Enter. */
export async function drawWorld(page: Page, pts: [number, number][], close: boolean) {
  for (const [x, z] of pts) await clickWorld(page, x, z);
  if (close) await clickWorld(page, pts[0][0], pts[0][1]);
  else await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}

/** Orbit camera to look at (x,z) from a direction. */
export async function lookAt(page: Page, x: number, z: number, dist = 120, height = 0.6) {
  await page.evaluate(([x, z, dist, height]) => {
    const app = (window as any).app;
    app.ui.setView('orbit');
    const y = app.terrain.heightAt(x, z);
    app.rig.orbit.target.set(x, y, z);
    app.rig.persp.position.set(x + dist * 0.55, y + dist * height, z + dist * 0.8);
    app.rig.orbit.update();
  }, [x, z, dist, height]);
  await page.waitForTimeout(1500);
}
