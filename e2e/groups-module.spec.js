const { test, expect } = require('@playwright/test');
const { loginByIdentifier, enableTeacherMode } = require('./fixtures/auth.fixture');

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
    test.skip(true, 'Identifiants admin e2e manquants (TEACHER_ADMIN_EMAIL / TEACHER_ADMIN_PASSWORD)');
  }

  await page.goto('/');
  await loginByIdentifier(page, adminEmail, adminPassword);
  await enableTeacherMode(page);

  await page.getByRole('button', { name: /Profils & utilisateurs|n3boss & utilisateurs/ }).click();
  if (pageError) {
    throw new Error(`Erreur frontend: ${pageError.stack || pageError.message}`);
  }
  if (boundaryError) {
    throw new Error(`Erreur ErrorBoundary: ${boundaryError}`);
  }
  await expect(page.getByText('Groupes & sous-groupes')).toBeVisible();
  await expect(page.getByText('Module dédié: structure pédagogique')).toBeVisible();
});

