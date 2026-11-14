import { expect, test } from '@playwright/test';

test('Start over clears the piece, the chat and the cloth; Undo brings the piece back', async ({ page }) => {
  await page.goto('/');
  await page.locator('#play').click();
  await expect(page.locator('#clothStat')).not.toHaveText('0 bars woven', { timeout: 15_000 });

  await page.locator('#reset').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Play');
  await expect(page.locator('.layer')).toHaveCount(0);
  await expect(page.locator('#clothStat')).toHaveText('0 bars woven');
  await expect(page.locator('.msg')).toHaveCount(1);
  await expect(page.locator('.msg')).toContainText('Blank slate');

  await page.locator('#undo').click();
  await expect(page.locator('.layer')).toHaveCount(4);
});

test('Clear chat empties the conversation and keeps the piece', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.msg')).toHaveCount(1);
  await page.locator('#clearChat').click();
  await expect(page.locator('.msg')).toHaveCount(0);
  await expect(page.locator('.layer')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.msg')).toHaveCount(0);
});

test('master volume is remembered on this device', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#volumeOut')).toHaveText('80%');
  await page.locator('#volume').fill('0.35');
  await expect(page.locator('#volumeOut')).toHaveText('35%');
  await page.reload();
  await expect(page.locator('#volume')).toHaveValue('0.35');
  await page.locator('#volume').fill('0');
  await expect(page.locator('#volumeOut')).toHaveText('off');
});

test('the invite code shows as it is typed', async ({ page }) => {
  await page.route('/api/status', (r) => r.fulfill({ json: { ai: true } }));
  await page.goto('/');
  await expect(page.locator('#invite')).toHaveAttribute('type', 'text');
});

test('stays light on a device set to dark mode', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(242, 245, 250)');
  await context.close();
});
