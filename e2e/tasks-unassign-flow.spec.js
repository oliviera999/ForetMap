const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('élève peut se retirer d’une tâche prise en charge', async ({ page }) => {
  const taskTitle = `E2E Unassign ${Date.now()}`;

  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await openTeacherTasksTab(page);

  await page.getByRole('button', { name: /\+ Nouvelle tâche/ }).click();
  await page.getByLabel('Titre *').fill(taskTitle);
  await page.getByRole('button', { name: 'Créer la tâche' }).click();
  await expect(page.locator('.task-card', { hasText: taskTitle }).first()).toBeVisible();

  await disableTeacherMode(page);
  await openStudentTasksTab(page);

  const studentTaskCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await studentTaskCard.getByRole('button', { name: /Je m'en occupe/ }).click();
  await expect(studentTaskCard.getByRole('button', { name: /Me retirer/ })).toBeVisible();

  await studentTaskCard.getByRole('button', { name: /Me retirer/ }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();

  await expect(page.getByText("Tu t'es retiré de la tâche.")).toBeVisible();
});
