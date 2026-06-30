const { test, expect } = require('@playwright/test');

test.describe('Gnomes & Licornes — intro cinématique', () => {
  test('invité : intro visible puis passer mène au formulaire de connexion', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.addInitScript(() => {
      localStorage.removeItem('gl_intro_seen');
      localStorage.removeItem('gl_session');
    });
    await page.goto('/');

    await expect(page.getByTestId('gl-intro-overlay')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('gl-intro-skip').click();
    await expect(page.getByTestId('gl-intro-overlay')).toBeHidden();
    await expect(page.getByRole('heading', { name: /Gnomes/i }).first()).toBeVisible();
    await expect(page.getByLabel(/Identifiant/i)).toBeVisible();
  });

  test('API intro publique renvoie 9 scènes quand le module est actif', async ({ request }) => {
    const res = await request.get('/api/gl/content/intro');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    if (body.enabled === false) {
      test.skip(true, 'Module intro désactivé sur cette instance');
      return;
    }
    expect(body.scenes?.length).toBe(9);
    expect(body.images?.boite).toContain('/gl/intro/');
  });
});
