const { test, expect } = require('@playwright/test');
const { seedGlScenario } = require('./fixtures/gl.fixture');

test.describe('Gnomes & Licornes foundations', () => {
  test('API GL de base répond', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    const glChapters = await request.get('/api/gl/chapters');
    expect([200, 401]).toContain(glChapters.status());
  });

  test('config GL expose les drapeaux modules', async ({ request }) => {
    const config = await request.get('/api/gl/auth/config');
    expect(config.ok()).toBeTruthy();
    const body = await config.json();
    expect(typeof body?.modules?.journalEnabled).toBe('boolean');
    expect(typeof body?.modules?.playerJournalEnabled).toBe('boolean');
    expect(typeof body?.modules?.mascotPacksEnabled).toBe('boolean');
  });

  test('navigation GL affiche icones et cloche notifications', async ({ request, page }) => {
    const seeded = await seedGlScenario('foundations-ui');

    const enableNotifications = await request.put('/api/gl/admin/settings/modules.notifications_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });
    expect(enableNotifications.ok()).toBeTruthy();

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate((payload) => {
      localStorage.setItem('gl_session', JSON.stringify(payload));
    }, {
      token: seeded.adminToken,
      auth: {
        userType: 'gl_admin',
        roleSlug: 'gl_admin',
        displayName: 'MJ foundations-ui',
      },
    });
    await page.reload();

    await expect(page.getByRole('button', { name: 'Cartes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Royaume' })).toBeVisible();
    await expect(page.locator('.gl-notifications-bell')).toBeVisible();
  });
});
