const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, openStudentTasksTab } = require('./fixtures/auth.fixture');

/**
 * D1 — commentaires contextuels des tâches : aucun GET tant que la section est fermée.
 * Même logique de comptage que `e2e/plants-biodiversity.spec.js` (hors sync-state / socket / health).
 */
test('onglet Tâches : commentaires chargés seulement à l’ouverture', async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsNewStudent(page);

  const apiCalls = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('/api/')) return;
    if (url.includes('/api/sync-state') || url.includes('/socket.io')) return;
    if (url.includes('/api/health')) return;
    apiCalls.push(url.replace(/^https?:\/\/[^/]+/, ''));
  });

  await openStudentTasksTab(page);
  await expect(page.getByRole('heading', { name: 'Tâches' })).toBeVisible();

  // Laisse retomber d’éventuels effets différés (polling, rendu tuiles).
  await page.waitForTimeout(1500);

  // Les compteurs (`/counts`) peuvent être préchargés pour les pastilles ; le fil
  // complet (`/api/context-comments?…` hors counts) ne doit pas l’être.
  const commentThreads = (urls) =>
    urls.filter(
      (u) => u.includes('/api/context-comments') && !u.includes('/api/context-comments/counts'),
    );
  const commentsBefore = commentThreads(apiCalls);
  expect(
    commentsBefore,
    `aucun GET fil de commentaires à l’ouverture des tâches, vu : ${commentsBefore.join(', ')}`,
  ).toEqual([]);

  const taskCard = page.locator('.task-card').first();
  await expect(taskCard).toBeVisible({ timeout: 20_000 });

  // Mode condensé : déplier la carte pour afficher le bouton commentaires.
  const condensedToggle = taskCard.locator('.task-top--condensed-toggle');
  if ((await condensedToggle.count()) > 0) {
    const expanded = await condensedToggle.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await condensedToggle.click();
    }
  }

  const commentsToggle = taskCard.locator('button.context-comments-toggle').first();
  await expect(commentsToggle).toBeVisible({ timeout: 15_000 });

  const beforeOpen = commentThreads(apiCalls).length;
  await commentsToggle.click();

  await expect
    .poll(() => commentThreads(apiCalls).length, {
      timeout: 15_000,
    })
    .toBe(beforeOpen + 1);

  const commentsAfter = commentThreads(apiCalls);
  expect(
    commentsAfter.length,
    `exactement 1 appel fil de commentaires après ouverture, vu : ${commentsAfter.join(', ')}`,
  ).toBe(1);
});
