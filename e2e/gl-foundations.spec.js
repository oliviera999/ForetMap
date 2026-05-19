const { test, expect } = require('@playwright/test');

test.describe('Gnomes & Licornes foundations', () => {
  test('API GL de base répond', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    const glChapters = await request.get('/api/gl/chapters');
    expect([200, 401]).toContain(glChapters.status());
  });
});
