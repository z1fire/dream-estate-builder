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
