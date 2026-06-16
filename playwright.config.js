require('dotenv').config();

const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

/** Heap Node explicite pour `server.js` e2e (`npm run` ne propage pas toujours NODE_OPTIONS jusqu’au processus enfant). */
const E2E_SERVER_HEAP_MB = process.env.E2E_NODE_MAX_OLD_SPACE_SIZE || '12288';

/** Secret cookie visite anonyme (NODE_ENV=production en webServer) — repli e2e si absent du .env. */
const E2E_VISIT_COOKIE_SECRET =
  String(process.env.VISIT_COOKIE_SECRET || '').trim().length >= 16
    ? String(process.env.VISIT_COOKIE_SECRET).trim()
    : 'foretmap-e2e-visit-cookie-secret';

module.exports = defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
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
  webServer: process.env.CI
    ? undefined
    : {
        // Aligné sur `npm run start:e2e` : même flags, heap explicite pour limiter les OOM pendant la suite.
        command: `npm run db:init && node --max-old-space-size=${E2E_SERVER_HEAP_MB} server.js --foretmap-e2e-no-rate-limit`,
        /* Sert `dist/` (SPA) comme en prod : sans cela `server.js` utilise `public/` + deploy-help. */
        env: {
          ...process.env,
          E2E_DISABLE_RATE_LIMIT: '1',
          NODE_ENV: 'production',
          VISIT_COOKIE_SECRET: E2E_VISIT_COOKIE_SECRET,
        },
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
