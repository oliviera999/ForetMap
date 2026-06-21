const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('parcours élève : réseau trophique filtre et glossaire', async ({ page }) => {
  await loginAsNewStudent(page);
  await page.evaluate(() => {
    localStorage.setItem('foretmap_active_tab', 'foodweb');
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: /Réseau trophique/i })).toBeVisible({
    timeout: 20_000,
  });

  const edge = page.locator('.pedago-foodweb__edge').first();
  if ((await edge.count()) > 0) {
    await edge.click();
    await expect(page.locator('.pedago-foodweb__glossary--panel')).toBeVisible();
  }
});
