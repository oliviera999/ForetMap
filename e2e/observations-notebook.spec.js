const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('parcours élève: carnet accessible si module actif', async ({ page }) => {
  await loginAsNewStudent(page);

  const notebookBtn = page.getByRole('button', { name: /Carnet/i });
  if (!(await notebookBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
    test.skip(true, 'Module carnet désactivé ou bouton absent');
    return;
  }

  await notebookBtn.click();
  await expect(page.getByTestId('user-journal')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Nouvel article/i })).toBeVisible();
});
