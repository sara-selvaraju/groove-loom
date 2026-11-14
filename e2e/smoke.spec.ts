import { expect, test } from '@playwright/test';

// Grows with the port: next it should press play, check the tapestry
// canvas draws, and confirm audio starts.
test('page loads, reaches the server and logs no errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

  await page.goto('/');
  await expect(page).toHaveTitle('Groove Loom');
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'ok');
  await expect(page.locator('#status')).toContainText('Server is up');

  expect(problems).toEqual([]);
});
