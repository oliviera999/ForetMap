require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  globalTimeout: process.env.CI ? 12 * 60_000 : undefined,
  // Plusieurs workers sur une même BDD locale = inscriptions / sessions en collision.
  workers: 1,
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
    // start:e2e = node server.js --foretmap-e2e-no-rate-limit (bypass fiable du rate limit, y compris sous Windows).
    command: 'npm run db:init && npm run start:e2e',
    env: { ...process.env, E2E_DISABLE_RATE_LIMIT: '1' },
    url: `${baseURL}/api/health`,
    // Après changement backend, un vieux Node sur le port sert un code périmé ; ne pas réutiliser par défaut.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
