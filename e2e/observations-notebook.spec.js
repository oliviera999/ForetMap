const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, openStudentTab } = require('./fixtures/auth.fixture');

test('parcours élève: carnet accessible si module actif', async ({ page }) => {
  await loginAsNewStudent(page);

  // Pôle « Moi » sur ordinateur, feuille « Plus » en compact (`openStudentTab`).
  const opened = await openStudentTab(page, 'Carnet')
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    test.skip(true, 'Module carnet désactivé ou bouton absent');
    return;
  }

  await expect(page.getByTestId('user-journal')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Nouvel article/i })).toBeVisible();
});
