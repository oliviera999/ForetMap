const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('cycle complet tâche: création prof -> prise élève -> soumission -> validation prof', async ({ page }) => {
  const taskTitle = `E2E Cycle ${Date.now()}`;

  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  await openTeacherTasksTab(page);
  await page.getByRole('button', { name: /\+ Nouvelle tâche/ }).click();
  await page.getByPlaceholder('Ex: Arroser les tomates').fill(taskTitle);
  await page.getByRole('button', { name: 'Créer la tâche' }).click();

  const taskCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(taskCard).toBeVisible();

  await disableTeacherMode(page);
  await openStudentTasksTab(page);

  const studentTaskCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(studentTaskCard).toBeVisible();
  await studentTaskCard.getByRole('button', { name: /Je m['\u2019]en occupe/ }).click();
  await studentTaskCard.getByRole('button', { name: /Marquer terminée/ }).click();

  await page.getByLabel('Commentaire (optionnel)').fill('Rapport e2e complet');
  await page.getByRole('button', { name: /Marquer comme terminée/ }).click();

  await enableTeacherMode(page);
  await openTeacherTasksTab(page);

  const teacherPendingCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(teacherPendingCard).toBeVisible();
  await teacherPendingCard.getByRole('button', { name: '✔️ Validée' }).click();

  await expect(page.locator('.task-card', { hasText: taskTitle }).first()).toBeVisible();
  await expect(page.getByText('Statut mis à jour : Validée')).toBeVisible();
});
