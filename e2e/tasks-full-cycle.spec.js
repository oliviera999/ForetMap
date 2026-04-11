const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  dismissProfilePromotionModalIfPresent,
  clickTeacherNewTask,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('cycle complet tâche: création prof -> prise élève -> soumission -> validation prof', async ({ page }) => {
  /* Deux élévations + liste tâches : > 3 min possible quand le worker est chargé. */
  test.setTimeout(300_000);
  const taskTitle = `E2E Cycle ${Date.now()}`;

  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  await openTeacherTasksTab(page);
  await clickTeacherNewTask(page);
  await page.getByPlaceholder('Ex: Arroser les tomates').fill(taskTitle);
  await page.getByRole('button', { name: 'Créer la tâche' }).click();

  const taskCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(taskCard).toBeVisible();

  await disableTeacherMode(page);
  await openStudentTasksTab(page);

  const studentTaskCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(studentTaskCard).toBeVisible();
  await studentTaskCard.getByRole('button', { name: /Je m['\u2019]en occupe/ }).click();
  await dismissProfilePromotionModalIfPresent(page);
  const studentTaskCardAfter = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(studentTaskCardAfter.getByRole('button', { name: /Marquer terminée/ })).toBeVisible({ timeout: 45_000 });
  await studentTaskCardAfter.getByRole('button', { name: /Marquer terminée/ }).click();

  await page.getByLabel('Commentaire (optionnel)').fill('Rapport e2e complet');
  await page.getByRole('button', { name: /Marquer comme terminée/ }).click();
  await page.getByRole('dialog', { name: 'Rapport de tâche' }).waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  await dismissProfilePromotionModalIfPresent(page);

  await enableTeacherMode(page);
  await dismissProfilePromotionModalIfPresent(page);
  const tasksAfterElevate = page.waitForResponse(
    (r) => r.url().includes('/api/tasks') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 45_000 },
  );
  await openTeacherTasksTab(page);
  await tasksAfterElevate.catch(() => {});

  const teacherPendingCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(teacherPendingCard).toBeVisible({ timeout: 45_000 });
  await dismissProfilePromotionModalIfPresent(page);
  await teacherPendingCard.getByRole('button', { name: '✔️ Validée' }).click({ force: true });

  await expect(page.locator('.task-card', { hasText: taskTitle }).first()).toBeVisible();
  await expect(page.getByText('C’est noté : statut « Validée ».')).toBeVisible();
});
