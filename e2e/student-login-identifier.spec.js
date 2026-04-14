const { test, expect } = require('@playwright/test');
const { registerStudentWithProfile, logoutToAuth, loginByIdentifier } = require('./fixtures/auth.fixture');

test('connexion élève via identifiant pseudo ou email', async ({ page }) => {
  const profile = await registerStudentWithProfile(page);

  await logoutToAuth(page);
  await loginByIdentifier(page, profile.pseudo, profile.password);
  await expect(page.locator('header')).toBeVisible();

  await logoutToAuth(page);
  await loginByIdentifier(page, profile.email, profile.password);
  await expect(page.locator('header')).toBeVisible();
});
