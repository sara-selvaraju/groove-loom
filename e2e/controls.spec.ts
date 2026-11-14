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
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 245, 250)');
  await context.close();
});

test('on a phone, the play button on the loom plays and stops, and the legend lights up what sounds', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#loomPlay')).toBeVisible();
  await page.locator('#loomPlay').click();
  await expect(page.locator('#loomPlay')).toHaveAttribute('aria-label', 'Stop');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Stop');
  await expect(page.locator('.legend .sounding').first()).toBeAttached({ timeout: 15_000 });
  await page.locator('#loomPlay').click();
  await expect(page.locator('#loomPlay')).toHaveAttribute('aria-label', 'Play');
  await context.close();
});

test('on a wide screen, the loom has no extra play button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('#loomPlay')).toBeHidden();
});
