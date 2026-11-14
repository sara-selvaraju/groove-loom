import { expect, test } from '@playwright/test';

// Runs against the production build behind the real server, so the Content
// Security Policy applies: a blocked script, worklet or sound shows up here
// as a console error.
test('loads, draws the tapestry, plays and weaves bars, with no console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`));

  await page.goto('/');
  await expect(page).toHaveTitle('Groove Loom');

  // The starter groove is shown, with its code listing.
  await expect(page.locator('.layer')).toHaveCount(4);
  await expect(page.locator('#code')).toContainText('stack(');

  // The 3D tapestry replaces the flat cloth when WebGL works.
  await expect(page.locator('#tapestry')).toBeVisible();
  await expect(page.locator('#cloth')).toBeHidden();

  // Play: the transport flips to Stop and bars start weaving.
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Stop');
  await expect(page.locator('#clothStat')).not.toHaveText('0 bars woven', { timeout: 15_000 });

  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Play');

  expect(problems).toEqual([]);
});
