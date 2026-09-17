const { test, expect } = require('@playwright/test');
const {
  loginByIdentifier,
  enableTeacherMode,
  openTeacherPole,
} = require('./fixtures/auth.fixture');

test('module groupes visible dans l’espace profils prof/admin', async ({ page }) => {
  let pageError = null;
  let boundaryError = '';
  page.on('pageerror', (err) => {
    pageError = err;
  });
  page.on('console', (msg) => {
    const txt = msg.text();
    if (!boundaryError && txt.includes('ErrorBoundary:')) {
      boundaryError = txt;
    }
  });

  const adminEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const adminPassword = String(process.env.TEACHER_ADMIN_PASSWORD || '').trim();
  if (!adminEmail || !adminPassword) {
    test.skip(
      true,
      'Identifiants admin e2e manquants (TEACHER_ADMIN_EMAIL / TEACHER_ADMIN_PASSWORD)',
    );
  }

  await page.goto('/');
  await loginByIdentifier(page, adminEmail, adminPassword);
  await enableTeacherMode(page);

  // La navigation prof est organisée en pôles (`TeacherTopTabs.jsx`, POLES) : l'onglet
  // `profiles` vit dans « Administration » et n'existe pas tant que ce pôle n'est pas ouvert.
  await openTeacherPole(page, 'Administration');
  await page
    .getByRole('button', { name: /Profils & utilisateurs|n3boss & utilisateurs/ })
    .first()
    .click();
  if (pageError) {
    throw new Error(`Erreur frontend: ${pageError.stack || pageError.message}`);
  }
  if (boundaryError) {
    throw new Error(`Erreur ErrorBoundary: ${boundaryError}`);
  }
  // La vue « Profils & utilisateurs » est découpée en sous-onglets (`ProfilesAdminSubTabs.jsx`) :
  // le module groupes vit derrière l'onglet « Groupes ».
  await page.getByRole('tab', { name: 'Groupes' }).click();
  await expect(page.getByRole('heading', { name: 'Groupes & sous-groupes' })).toBeVisible();
  await expect(
    page.getByText('Structure pédagogique, membres, responsables et périmètre carte/projet.'),
  ).toBeVisible();
});
