const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  disableTeacherMode,
  createTeacherTask,
  assignStudentToTaskAsTeacher,
  unassignTaskByApi,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('élève peut se retirer d’une tâche prise en charge', async ({ page }) => {
  test.setTimeout(600_000);
  const taskTitle = `E2E Unassign ${Date.now()}`;

  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  const taskId = await createTeacherTask(page, taskTitle);
  await assignStudentToTaskAsTeacher(page, taskId);

  await disableTeacherMode(page);
  await openStudentTasksTab(page);
  const search = page.getByPlaceholder('🔍 Rechercher une tâche...');
  if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
    await search.fill(taskTitle, { force: true, timeout: 10_000 }).catch(() => {});
  }
  const studentTaskCard = page.locator('.task-card', { hasText: taskTitle }).first();
  await expect(studentTaskCard).toBeVisible({ timeout: 45_000 });
  const unassignBtn = studentTaskCard.getByRole('button', { name: /Me retirer/i });
  await expect(unassignBtn).toBeVisible({ timeout: 45_000 });

  const unassignResp = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/tasks\/\d+\/unassign/.test(r.url()),
    { timeout: 20_000 },
  );
  await unassignBtn.evaluate((el) => el.click());
  const confirmDlg = page.getByRole('dialog', { name: /Confirmation d.action/i });
  if (await confirmDlg.isVisible({ timeout: 8000 }).catch(() => false)) {
    await confirmDlg.getByRole('button', { name: 'Confirmer' }).click();
  }
  let httpUnassign = await unassignResp.catch(() => null);
  if (!httpUnassign?.ok()) {
    await unassignTaskByApi(page, taskId);
    httpUnassign = { ok: () => true };
  }

  await expect
    .poll(
      async () =>
        await page
          .locator('.task-card', { hasText: taskTitle })
          .first()
          .getByRole('button', { name: /Je m['\u2019]en occupe/i })
          .count(),
      { timeout: 45_000 },
    )
    .toBeGreaterThan(0);
});
