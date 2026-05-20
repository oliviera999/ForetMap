const { test, expect } = require('@playwright/test');

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
    expect(typeof body?.modules?.mascotPacksEnabled).toBe('boolean');
  });
});
