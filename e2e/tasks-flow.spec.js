const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode, openTeacherTasksTab } = require('./fixtures/auth.fixture');

test('parcours tâches: consultation élève puis consultation professeur', async ({ page }) => {
  await loginAsNewStudent(page);

  await page.getByRole('button', { name: /✅\s*Tâches/ }).click();
  await expect(page.getByRole('heading', { name: '✅ Tâches' })).toBeVisible();

  await enableTeacherMode(page);
  await openTeacherTasksTab(page);
  await expect(page.getByRole('button', { name: /\+ Nouvelle tâche/ })).toBeVisible({ timeout: 20_000 });
});
