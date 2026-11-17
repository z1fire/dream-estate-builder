import { test, expect, type Page } from '@playwright/test';

export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('app boots without console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await page.waitForFunction(() => (window as any).app !== undefined, null, { timeout: 60_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshots/00-boot.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
