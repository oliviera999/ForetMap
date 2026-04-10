const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  clickTeacherNewTask,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('élève peut se retirer d’une tâche prise en charge', async ({ page }) => {
  test.setTimeout(90_000);
  const taskTitle = `E2E Unassign ${Date.now()}`;

  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await openTeacherTasksTab(page);

  await clickTeacherNewTask(page);
  await page.getByPlaceholder('Ex: Arroser les tomates').fill(taskTitle);
  await page.getByRole('button', { name: 'Créer la tâche' }).click();
  await expect(page.locator('.task-card', { hasText: taskTitle }).first()).toBeVisible();

  await disableTeacherMode(page);
  await openStudentTasksTab(page);

  const studentTaskCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await studentTaskCard.getByRole('button', { name: /Je m['\u2019]en occupe/ }).click();
  const studentTaskCardAfter = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(studentTaskCardAfter.getByRole('button', { name: /retirer/i })).toBeVisible();

  await studentTaskCardAfter.getByRole('button', { name: /retirer/i }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();

  await expect(page.getByText('OK, place libérée pour quelqu’un d’autre — merci d’avoir prévenu.')).toBeVisible();
});
