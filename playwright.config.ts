import { defineConfig, devices } from '@playwright/test';

// The smoke test runs against the production build served by the real
// Node server, so it exercises the same path as a deploy. Run
// `npm run build` first.
const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    url: `http://localhost:${port}/healthz`,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env.CI,
  },
});
