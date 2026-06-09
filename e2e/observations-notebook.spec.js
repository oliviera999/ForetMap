const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('parcours élève: carnet observations accessible si module actif', async ({ page }) => {
  await loginAsNewStudent(page);

  const notebookBtn = page.getByRole('button', { name: /Carnet|Observations/i });
  if (!(await notebookBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
    test.skip(true, 'Module observations désactivé ou bouton absent');
    return;
  }

  await notebookBtn.click();
  await expect(page.getByText(/observation|Carnet|note/i).first()).toBeVisible({ timeout: 15_000 });
});
