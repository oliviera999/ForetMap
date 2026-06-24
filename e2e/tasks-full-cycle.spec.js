const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  dismissProfilePromotionModalIfPresent,
  createTeacherTask,
  assignStudentToTaskAsTeacher,
  waitForStudentAssignedTask,
  fillTaskDescription,
  openTeacherTasksTab,
  openStudentTasksTab,
  expectTaskCardWithTitle,
} = require('./fixtures/auth.fixture');

test.describe.configure({ mode: 'serial' });

test('cycle complet tâche: création prof -> prise élève -> soumission -> validation prof', async ({
  page,
}) => {
  /* Deux élévations + liste tâches : > 3 min possible quand le worker est chargé. */
  test.setTimeout(600_000);
  const taskTitle = `E2E Cycle ${Date.now()}`;

  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  const taskId = await createTeacherTask(page, taskTitle);
  await assignStudentToTaskAsTeacher(page, taskId);

  await disableTeacherMode(page);
  await waitForStudentAssignedTask(page, taskTitle);
  const studentTasksLoad = page.waitForResponse(
    (r) => r.url().includes('/api/tasks') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 45_000 },
  );
  await openStudentTasksTab(page);
  await studentTasksLoad.catch(() => {});

  const studentTaskCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expectTaskCardWithTitle(page, taskTitle);
  await expect(studentTaskCard.getByRole('button', { name: /Marquer terminée/ })).toBeVisible({
    timeout: 45_000,
  });
  await studentTaskCard
    .getByRole('button', { name: /Marquer terminée/ })
    .evaluate((el) => el.click());

  const reportDlg = page.getByRole('dialog', { name: 'Rapport de tâche' });
  await reportDlg.waitFor({ state: 'visible', timeout: 30_000 });
  await dismissProfilePromotionModalIfPresent(page);
  await fillTaskDescription(reportDlg, 'Rapport e2e complet');
  await reportDlg.getByRole('button', { name: /Marquer comme terminée/ }).click();
  await reportDlg.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  await dismissProfilePromotionModalIfPresent(page);

  await enableTeacherMode(page);
  await dismissProfilePromotionModalIfPresent(page);
  const tasksAfterElevate = page.waitForResponse(
    (r) => r.url().includes('/api/tasks') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 45_000 },
  );
  await openTeacherTasksTab(page);
  await tasksAfterElevate.catch(() => {});

  const taskSearch = page.getByPlaceholder('🔍 Rechercher une tâche...');
  await taskSearch.waitFor({ state: 'visible', timeout: 20_000 });
  await taskSearch.fill(taskTitle);

  const teacherPendingCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(teacherPendingCard).toBeVisible({ timeout: 45_000 });
  await dismissProfilePromotionModalIfPresent(page);
  const validateResp = page.waitForResponse(
    (r) => r.url().includes('/validate') && r.request().method() === 'POST' && r.status() === 200,
    { timeout: 45_000 },
  );
  await teacherPendingCard.getByRole('button', { name: '✔️ Validée' }).click({ force: true });
  await validateResp;

  await expect(page.locator('.task-card', { hasText: taskTitle }).first()).toBeVisible();
  await expect(page.getByText('C’est noté : statut « Validée ».')).toBeVisible();
});
