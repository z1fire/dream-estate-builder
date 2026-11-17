import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers';

test('app boots without console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?new');
  await page.waitForFunction(() => (window as any).app !== undefined, null, { timeout: 60_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshots/00-boot.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
