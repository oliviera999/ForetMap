const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  globalTimeout: process.env.CI ? 12 * 60_000 : undefined,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Evite qu'un ancien service worker pollue les runs e2e locaux.
    serviceWorkers: 'block',
  },
  webServer: process.env.CI ? undefined : {
    command: 'npm run db:init && npm start',
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
