const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  clickTeacherNewTask,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('temps réel: création prof visible côté élève sans reload manuel', async ({ browser, page }) => {
  test.setTimeout(90_000);
  const taskTitle = `E2E TempsReel ${Date.now()}`;

  // Session élève (client récepteur temps réel)
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await loginAsNewStudent(studentPage);
  await openStudentTasksTab(studentPage);

  // Session prof (créateur d'événement)
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await openTeacherTasksTab(page);
  await clickTeacherNewTask(page);
  await page.getByPlaceholder('Ex: Arroser les tomates').fill(taskTitle);
  await page.getByRole('button', { name: 'Créer la tâche' }).click();

  const studentTaskCard = studentPage.locator('.task-card', { hasText: taskTitle }).first();
  await expect(studentTaskCard).toBeVisible({ timeout: 15000 });

  await studentContext.close();
});
