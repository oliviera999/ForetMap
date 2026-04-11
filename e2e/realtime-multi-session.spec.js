const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  dismissProfilePromotionModalIfPresent,
  clickTeacherNewTask,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('temps réel: création prof visible côté élève sans reload manuel', async ({ browser, page }) => {
  /* Deux sessions + Socket.IO : en tête de suite le run peut dépasser 2 min (cold start + double login). */
  test.setTimeout(180_000);
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
  await clickTeacherNewTask(page);
  await dismissProfilePromotionModalIfPresent(page);
  await page.getByPlaceholder('Ex: Arroser les tomates').fill(taskTitle);
  await page.getByRole('button', { name: 'Créer la tâche' }).click({ force: true });

  const studentTaskCard = studentPage.locator('.task-card', { hasText: taskTitle }).first();
  await expect(studentTaskCard).toBeVisible({ timeout: 15000 });

  await studentContext.close();
});
