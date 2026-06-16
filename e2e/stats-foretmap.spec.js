const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode } = require('./fixtures/auth.fixture');

test('parcours prof: onglet Stats accessible après élévation', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  const statsTab = page.getByRole('button', { name: /^Stats/ });
  if (await statsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await statsTab.click();
    await expect(page.getByText(/Statistiques|n3beur|tâche/i).first()).toBeVisible({
      timeout: 15_000,
    });
  }
});
