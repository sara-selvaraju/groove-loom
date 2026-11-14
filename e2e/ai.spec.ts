import { expect, test, type Page } from '@playwright/test';

// The browser side of the AI, with /api/status and /api/compose answered by
// the test, so no real API call is made. The server side is covered by unit
// tests with a fake Claude.

const trumpet = {
  id: 'tpt',
  name: 'Trumpet',
  instrument: 'trumpet',
  notes: '0 2 4',
  rhythm: { mode: 'euclid', hits: 3, steps: 8, rotate: 1 },
  volume: 0.7,
  tone: 0.5,
  space: 0.2,
  octave: 0,
  muted: false,
  solo: false,
  about: 'Short stabs.',
};

async function aiOn(page: Page, compose: (body: Record<string, unknown>, invite: string | undefined) => { status: number; json: unknown }) {
  await page.route('/api/status', (r) => r.fulfill({ json: { ai: true } }));
  await page.route('/api/compose', async (r) => {
    const req = r.request();
    const { status, json } = compose(req.postDataJSON(), req.headers()['x-invite-code']);
    await r.fulfill({ status, json });
  });
}

test('asks for the invite code, then adds a layer from the AI reply', async ({ page }) => {
  let seen: Record<string, unknown> | undefined;
  await aiOn(page, (body, invite) => {
    seen = body;
    if (invite !== 'open-sesame') return { status: 401, json: { error: 'forbidden' } };
    const piece = body.piece as { layers: unknown[] };
    return { status: 200, json: { reply: 'I added a trumpet: 3 notes spread over 8 steps.', piece: { ...piece, layers: [...piece.layers, trumpet] } } };
  });
  await page.goto('/');
  await expect(page.locator('#inviteForm')).toBeVisible();
  await expect(page.locator('#aiNote')).toContainText('invite code');

  await page.fill('#invite', 'open-sesame');
  await page.click('#inviteForm button');
  await expect(page.locator('#inviteForm')).toBeHidden();

  await page.click('.chip >> text=Throw in a syncopated trumpet');
  await expect(page.locator('.msg.loom').last()).toContainText('I added a trumpet');
  await expect(page.locator('.layer')).toHaveCount(5);
  await expect(page.locator('#code')).toContainText('s("trumpet")');
  expect(seen?.request).toBe('Throw in a syncopated trumpet');

  // The code is remembered on this device.
  await page.reload();
  await expect(page.locator('#inviteForm')).toBeHidden();
});

test('a wrong invite code is forgotten and the form comes back', async ({ page }) => {
  await aiOn(page, () => ({ status: 401, json: { error: 'forbidden' } }));
  await page.goto('/');
  await page.fill('#invite', 'wrong');
  await page.click('#inviteForm button');
  await page.fill('#prompt', 'add drums');
  await page.press('#prompt', 'Enter');
  await expect(page.locator('.msg.err').last()).toContainText("invite code didn't work");
  await expect(page.locator('#inviteForm')).toBeVisible();
  await expect(page.locator('.layer')).toHaveCount(4); // piece unchanged
});

test('after too many wrong codes the page says to wait and asks for the code again', async ({ page }) => {
  await aiOn(page, () => ({ status: 429, json: { error: 'locked' } }));
  await page.addInitScript(() => localStorage.setItem('gl.invite', 'wrong'));
  await page.goto('/');
  await page.fill('#prompt', 'add drums');
  await page.press('#prompt', 'Enter');
  await expect(page.locator('.msg.err').last()).toContainText('Too many wrong invite codes');
  await expect(page.locator('#inviteForm')).toBeVisible();
});

test('a refusal leaves the piece unchanged and says so in plain words', async ({ page }) => {
  await aiOn(page, () => ({ status: 422, json: { error: 'refused' } }));
  await page.addInitScript(() => localStorage.setItem('gl.invite', 'open-sesame'));
  await page.goto('/');
  await page.fill('#prompt', 'something odd');
  await page.press('#prompt', 'Enter');
  await expect(page.locator('.msg.err').last()).toContainText("I can't help with that one");
  await expect(page.locator('.layer')).toHaveCount(4);
});

test('without the AI switched on, the page says so and the knobs still work', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#aiNote')).toContainText("isn't switched on");
  await expect(page.locator('#inviteForm')).toBeHidden();
});
