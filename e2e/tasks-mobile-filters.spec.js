const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  openTeacherTasksTab,
  createTeacherTask,
  dismissDiscoveryTourIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Objectif du lot O6bis : sur smartphone, les filtres de tâches ne doivent plus
 * occuper le haut de l'écran — une tâche au moins reste visible sans défiler,
 * toutes les fonctionnalités de filtrage restant accessibles (feuille « Filtres »).
 */
test.use({ viewport: { width: 390, height: 844 } });

test('mobile : les filtres sont repliés et une tâche est visible sans défiler', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await openTeacherTasksTab(page);
  await dismissDiscoveryTourIfPresent(page);

  const title = `Mission mobile ${Date.now()}`;
  await createTeacherTask(page, title);
  await openTeacherTasksTab(page);
  await dismissDiscoveryTourIfPresent(page);

  // La barre compacte tient sur une ligne : recherche + Filtres + mode d'affichage.
  const search = page.getByPlaceholder('🔍 Rechercher une tâche...');
  const filtersToggle = page.getByRole('button', { name: /^Filtres/ });
  await expect(search).toBeVisible();
  await expect(filtersToggle).toBeVisible();
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'false');
  // Les champs de filtrage sont repliés : aucun select n'occupe le haut de l'écran.
  await expect(page.locator('.task-filters select')).toHaveCount(0);

  const barBox = await page.locator('.task-filters-bar').boundingBox();
  expect(barBox).toBeTruthy();
  expect(barBox.height).toBeLessThan(120);

  // Objectif : la première tâche est dans la fenêtre visible, sans défilement.
  const firstCard = page.locator('.task-card').first();
  await expect(firstCard).toBeVisible();
  const cardBox = await firstCard.boundingBox();
  expect(cardBox).toBeTruthy();
  expect(cardBox.y).toBeLessThan(844);

  // Toutes les fonctionnalités restent accessibles depuis la feuille de filtres.
  await filtersToggle.click();
  const sheet = page.getByRole('dialog', { name: 'Filtres des tâches' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('Filtrer les tâches par carte')).toBeVisible();
  await expect(sheet.getByLabel('Filtrer les tâches par lieu')).toBeVisible();
  await expect(sheet.getByLabel('Filtrer les tâches par projet')).toBeVisible();
  await expect(sheet.getByLabel('Filtrer les tâches par groupe')).toBeVisible();
  await expect(sheet.getByLabel('Filtrer par catégorie urgent')).toBeVisible();
  await expect(sheet.getByLabel('Filtrer les tâches par statut')).toBeVisible();

  // Un filtre posé depuis la feuille laisse un chip retirable dans la barre.
  await sheet.getByLabel('Filtrer par catégorie urgent').selectOption('non_urgent');
  await sheet.getByRole('button', { name: /^Voir/ }).click();
  await expect(sheet).toBeHidden();
  const chip = page.getByRole('button', { name: 'Retirer le filtre urgence' });
  await expect(chip).toBeVisible();
  await expect(filtersToggle).toHaveAttribute('aria-expanded', 'false');

  await chip.click();
  await expect(chip).toBeHidden();
});
