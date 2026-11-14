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
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Software WebGL so the tapestry renders on CI machines without a GPU,
          // and audio that may start without a real person's tap.
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm start',
    url: `http://localhost:${port}/healthz`,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env.CI,
  },
});
