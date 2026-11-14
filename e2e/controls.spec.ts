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

test('Share link copies a link that opens the same piece, and Undo brings back your own', async ({ page, context, browser }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  // make the piece recognisably different from the starter: remove the first layer
  await page.locator('.layer').first().getByRole('button', { name: /^Remove/ }).click();
  await expect(page.locator('.layer')).toHaveCount(3);
  await page.click('#share');
  await expect(page.locator('#share')).toHaveText('Link copied');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/#p=1\.[A-Za-z0-9_-]+$/);

  // a friend in their own browser, with the starter groove as their piece
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await friend.goto(url);
  await expect(friend.locator('.layer')).toHaveCount(3);
  await expect(friend.locator('.msg.loom').last()).toContainText('came from a shared link');
  await expect.poll(() => friend.evaluate(() => location.hash)).toBe(''); // a reload starts from the person's own piece
  await friend.click('#undo');
  await expect(friend.locator('.layer')).toHaveCount(4);
  await friendContext.close();
});

test('a damaged share link changes nothing and says so', async ({ page }) => {
  await page.goto('/#p=1.this-is-not-a-piece');
  await expect(page.locator('.msg.err').last()).toContainText('damaged or incomplete');
  await expect(page.locator('.layer')).toHaveCount(4);
});
