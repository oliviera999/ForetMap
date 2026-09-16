const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  openTeacherTasksTab,
  openStudentTasksTab,
} = require('./fixtures/auth.fixture');

test('parcours tâches: consultation élève puis consultation professeur', async ({ page }) => {
  /* Inscription + double connexion + élévation PIN : peut dépasser 60 s sous charge. */
  test.setTimeout(240_000);
  await loginAsNewStudent(page);

  await openStudentTasksTab(page);
  await expect(page.getByRole('heading', { name: 'Tâches' })).toBeVisible();

  await enableTeacherMode(page);
  await openTeacherTasksTab(page);
  // Depuis la navigation par pôles, l'onglet actif peut s'appeler « Tâches » (pôle Suivi) ou
  // « Cartes & tâches » / « Cartes, tâches et tuto » (vue scindée du pôle Contenus, celle
  // qu'emprunte `openTeacherTasksTab`). Le `t` minuscule de ces libellés composés ne
  // correspondait pas au motif `/Tâches/`, sensible à la casse : l'assertion échouait sans
  // que rien ne soit cassé côté application.
  await expect(
    page
      .locator('.teacher-main .top-tabs .top-tab.active')
      .filter({ hasText: /t[âa]ches/i })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
});
