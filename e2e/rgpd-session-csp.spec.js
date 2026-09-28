const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

/**
 * Audit RGPD du 28/09/2026 (constats S-5 et S-8) : CSP imposée, jeton rangé sous une seule clé,
 * données locales effacées à la déconnexion.
 */

async function collectCspViolations(page) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(
        `${e.effectiveDirective} ← ${e.blockedURI} (${e.sourceFile}:${e.lineNumber}:${e.columnNumber})`,
      );
    });
  });
}

const ENTRIES = [
  { name: 'ForetMap', product: null, path: '/' },
  { name: 'Gnomes & Licornes', product: 'gl', path: '/' },
  { name: 'Plan', product: 'plan', path: '/' },
  { name: 'Intro GL', product: 'gl', path: '/gl/intro/index.html' },
];

test.describe('CSP imposée — aucune violation au chargement', () => {
  for (const entry of ENTRIES) {
    test(entry.name, async ({ page }) => {
      if (entry.product) await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': entry.product });
      await collectCspViolations(page);
      const res = await page.goto(entry.path);
      expect(res?.headers()['content-security-policy']).toMatch(/default-src 'self'/);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1000);
      const violations = await page.evaluate(() => window.__cspViolations || []);
      expect(violations).toEqual([]);
    });
  }
});

test('connexion puis déconnexion : clé unique et nettoyage local confirmé', async ({ page }) => {
  await loginAsNewStudent(page);
  await expect(page.locator('header')).toBeVisible();

  const storage = await page.evaluate(() => ({
    session: JSON.parse(localStorage.getItem('foretmap_session') || 'null'),
    legacy: ['foretmap_auth_token', 'foretmap_teacher_token', 'foretmap_student'].map((k) =>
      localStorage.getItem(k),
    ),
  }));
  expect(storage.session?.token).toBeTruthy();
  expect(storage.legacy).toEqual([null, null, null]);
  expect(storage.session?.student?.authToken).toBeUndefined();

  // Une action restée en attente (réseau absent) pour ce compte.
  await page.evaluate(() => {
    const token = JSON.parse(localStorage.getItem('foretmap_session')).token;
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    const userId = String(claims.canonicalUserId ?? claims.userId);
    localStorage.setItem(
      'foretmap_task_done_queue',
      JSON.stringify([
        {
          user_id: userId,
          task_id: 'e2e-task',
          task_title: 'Tâche e2e',
          client_uuid: 'e2e-00000000-0001',
          comment: 'Rapport écrit sans réseau',
          queued_at: Date.now(),
        },
      ]),
    );
  });

  await page.getByRole('button', { name: /Déconnexion/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1 action n’a pas encore été envoyée');
  await dialog.getByRole('button', { name: 'Se déconnecter' }).click();

  await page.getByRole('button', { name: 'Connexion', exact: true }).waitFor({ state: 'visible' });
  const after = await page.evaluate(() => ({
    session: localStorage.getItem('foretmap_session'),
    queue: localStorage.getItem('foretmap_task_done_queue'),
  }));
  expect(after).toEqual({ session: null, queue: null });
});
