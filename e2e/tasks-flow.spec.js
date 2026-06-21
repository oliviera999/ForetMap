const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('parcours tâches: consultation élève puis consultation professeur', async ({ page }) => {
  /* Inscription + double connexion + élévation PIN : peut dépasser 60 s sous charge. */
  test.setTimeout(240_000);
  await loginAsNewStudent(page);

  await openStudentTasksTab(page);
  await expect(page.getByRole('heading', { name: '✅ Tâches' })).toBeVisible();

  await enableTeacherMode(page);
  await openTeacherTasksTab(page);
  await expect(
    page.locator('.teacher-main .top-tabs .top-tab.active').filter({ hasText: /^✅/ }),
  ).toBeVisible({ timeout: 15_000 });
});
