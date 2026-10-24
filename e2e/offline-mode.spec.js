const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

/**
 * Mode avion sur le terrain : l'application lancée en ligne doit rester utilisable une fois
 * le réseau coupé. Avant le correctif, chaque requête retentait 8 fois (« Serveur
 * momentanément indisponible — reconnexion en cours… ») et ouvrir un écran jamais visité
 * rechargeait la page hors ligne.
 *
 * Le service worker est bloqué par défaut dans la config Playwright : ce fichier l'autorise,
 * c'est lui qui sert la coquille et les écrans hors ligne.
 */
test.use({ serviceWorkers: 'allow' });

test('mode avion : bandeau hors ligne, écrans ouvrables, aucun bandeau de reconnexion', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Service worker + setOffline : scénario Chromium');
  test.setTimeout(120_000);

  await loginAsNewStudent(page);
  await expect(page.getByRole('button', { name: 'Carte', exact: true })).toBeVisible();

  // Le service worker contrôle la page et a fini son précache (écrans à la demande compris).
  await page.waitForFunction(
    async () => {
      if (!('serviceWorker' in navigator)) return false;
      await navigator.serviceWorker.ready;
      return !!navigator.serviceWorker.controller;
    },
    null,
    { timeout: 30_000 },
  );

  await context.setOffline(true);
  await expect(page.getByText(/^Hors ligne — données/)).toBeVisible({ timeout: 10_000 });

  // Écrans chargés à la demande, jamais ouverts avant la coupure.
  await page.getByRole('button', { name: /Biodiversité/ }).click();
  await expect(page.getByText('Catalogue de biodiversité')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /À propos/ }).click();
  await expect(page.getByText('Informations du projet ForetMap')).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByText(/reconnexion en cours/)).toHaveCount(0);
  await expect(page.getByText('Une erreur s’est produite.')).toHaveCount(0);

  // Écran « Hors ligne » : ouvert depuis le bandeau, rien en attente pour un compte neuf,
  // préparation de sortie impossible sans réseau.
  await page.getByRole('button', { name: 'Détails' }).click();
  const center = page.getByRole('dialog', { name: 'Hors ligne' });
  await expect(center).toBeVisible();
  await expect(center.getByText(/Rien en attente/)).toBeVisible();
  await expect(center.getByRole('button', { name: 'Préparer la sortie terrain' })).toBeDisabled();
  await center.getByRole('button', { name: 'Fermer la fenêtre' }).click();
  await expect(center).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByText(/^Hors ligne — données/)).toHaveCount(0, { timeout: 15_000 });
});
