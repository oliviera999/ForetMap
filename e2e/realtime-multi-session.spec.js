const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  dismissProfilePromotionModalIfPresent,
  createTeacherTask,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('temps réel: création prof visible côté élève sans reload manuel', async ({
  browser,
  page,
}) => {
  /* Deux sessions + Socket.IO : en tête de suite le run peut dépasser 2 min (cold start + double login). */
  test.setTimeout(300_000);
  const taskTitle = `E2E TempsReel ${Date.now()}`;

  // Session élève (client récepteur temps réel)
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await loginAsNewStudent(studentPage);
  await dismissProfilePromotionModalIfPresent(studentPage);
  await openStudentTasksTab(studentPage);

  // Session prof (créateur d'événement)
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await dismissProfilePromotionModalIfPresent(page);
  await openTeacherTasksTab(page);
  await dismissProfilePromotionModalIfPresent(page);
  const studentTasksRefresh = studentPage.waitForResponse(
    (r) => r.url().includes('/api/tasks') && r.request().method() === 'GET' && r.status() === 200,
    { timeout: 20_000 },
  );
  await createTeacherTask(page, taskTitle, { skipReload: true });
  await studentTasksRefresh.catch(() => {});

  const studentTaskCard = studentPage.locator('.task-card', { hasText: taskTitle }).first();
  await expect(studentTaskCard).toBeVisible({ timeout: 15_000 });

  await studentContext.close();
});
