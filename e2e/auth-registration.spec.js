const { test, expect } = require('@playwright/test');
const {
  loginAsTeacherAdminApi,
  markAllDiscoveryToursSeen,
  logoutToAuth,
} = require('./fixtures/auth.fixture');

/**
 * Le reste de la suite tourne dans la configuration de production
 * (`ui.auth.allow_register = false`, forcé par `e2e/global-setup.js`) : les comptes y naissent
 * d'un import d'administration, comme au lycée. Le formulaire public n'est donc plus exercé
 * incidemment par les autres specs — c'est ici, et seulement ici, qu'il est couvert.
 *
 * La spec vérifie les deux faces du réglage, puis le remet à `false` quoi qu'il arrive : elle
 * ne doit pas laisser derrière elle la configuration que la suite cherche justement à éviter.
 */

async function setAllowRegister(request, token, value) {
  const resp = await request.put('/api/settings/admin/ui.auth.allow_register', {
    headers: { Authorization: `Bearer ${token}` },
    data: { value },
  });
  expect(
    resp.ok(),
    `Réglage ui.auth.allow_register=${value} refusé (HTTP ${resp.status()})`,
  ).toBeTruthy();
}

test.describe('inscription publique', () => {
  let token = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await loginAsTeacherAdminApi(page);
    await page.close();
  });

  test.afterEach(async ({ page }) => {
    await setAllowRegister(page.request, token, false);
  });

  test('réglage fermé : le formulaire public est absent et /api/auth/register refuse', async ({
    page,
  }) => {
    await setAllowRegister(page.request, token, false);
    await page.goto('/');
    await markAllDiscoveryToursSeen(page);

    await expect(page.getByRole('button', { name: 'Connexion', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Créer un compte' })).toHaveCount(0);

    const nonce = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const resp = await page.request.post('/api/auth/register', {
      data: {
        firstName: `E2ERefus${nonce}`,
        lastName: 'Eleve',
        password: '1234',
      },
    });
    expect(resp.status(), "l'API doit refuser l'inscription, pas seulement la masquer").toBe(403);
  });

  test('réglage ouvert : le formulaire public crée un compte utilisable', async ({ page }) => {
    await setAllowRegister(page.request, token, true);

    const nonce = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const safeNonce = String(nonce).replace(/[^a-zA-Z0-9]/g, '_');
    const firstName = `E2EInscr${nonce}`;
    const email = `e2e_inscr_${safeNonce}@example.com`;
    const password = '1234';

    await page.goto('/');
    await markAllDiscoveryToursSeen(page);
    await page.getByRole('button', { name: 'Créer un compte' }).click();
    await page.getByLabel('Prénom', { exact: true }).waitFor({ state: 'visible' });
    await page.getByLabel('Prénom', { exact: true }).fill(firstName);
    await page.getByLabel('Nom', { exact: true }).fill('Eleve');
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByLabel('Email (optionnel)').fill(email);
    await page.getByLabel('Mon espace', { exact: true }).selectOption('both');
    await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(password);

    const registerDone = page.waitForResponse(
      (r) => r.url().includes('/api/auth/register') && r.request().method() === 'POST',
      { timeout: 90_000 },
    );
    await page.getByRole('button', { name: 'Créer le compte' }).click();
    const registerResp = await registerDone;
    expect(registerResp.ok(), `inscription refusée (HTTP ${registerResp.status()})`).toBeTruthy();

    await expect(page.getByRole('button', { name: /Déconnexion/ })).toBeVisible({
      timeout: 60_000,
    });

    // Le compte doit rester utilisable après déconnexion (mot de passe réellement enregistré).
    await logoutToAuth(page);
    await page.getByLabel('Identifiant (pseudo ou email)').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('button', { name: /Déconnexion/ })).toBeVisible({
      timeout: 60_000,
    });
  });
});
