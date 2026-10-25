const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Fresque du Climat (version Enfant), parcours élève :
 *  1. pose du lot 1, deux flèches, lot 2 ouvert et entamé, rechargement en plein lot 2 : tout est
 *     retrouvé (cartes, flèches, étape) ;
 *  2. parcours complet jusqu'à la fin en Éclaireur (badge annoncé, crédit toujours visible).
 * Les gestes passent par le clavier (déterministes) : `Entrée` sur une carte de la main la pose,
 * le bouton « Relier à… » ouvre la liste des cartes posées.
 */

async function openFresqueTab(page) {
  const tab = page.getByRole('button', { name: 'Fresque' });
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click();
  await expect(page.getByTestId('fm-fresque-view')).toBeVisible({ timeout: 20_000 });
}

async function openMyBoard(page) {
  const board = page.getByTestId('fm-fresque-board');
  if (await board.isVisible({ timeout: 1500 }).catch(() => false)) return;
  await page.getByTestId('fm-fresque-open-mine').click();
  await expect(board).toBeVisible({ timeout: 20_000 });
}

async function placeFromHand(page, cardId) {
  const handCard = page.getByTestId(`fm-fresque-hand-${cardId}`);
  await handCard.focus();
  await handCard.press('Enter');
  await expect(page.getByTestId(`fm-fresque-card-${cardId}`)).toBeVisible();
}

async function linkByKeyboard(page, from, to) {
  const btn = page.getByTestId(`fm-fresque-link-${from}`);
  await btn.focus();
  await btn.press('Enter');
  await page.getByTestId(`fm-fresque-pick-target-${to}`).click();
}

async function waitSaved(page) {
  await expect(page.getByTestId('fm-fresque-save')).toHaveAttribute('data-status', 'saved', {
    timeout: 15_000,
  });
}

test('élève : lot 1 posé, deux flèches, rechargement en plein lot 2 → tout est retrouvé', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loginAsNewStudent(page);
  await dismissProfilePromotionModalIfPresent(page);
  await openFresqueTab(page);
  await openMyBoard(page);

  // Étape Découvrir : crédit visible, puis « Commencer le lot 1 ».
  await expect(page.getByTestId('fm-fresque-credit')).toContainText('CC BY-NC-ND');
  await page.getByTestId('fm-fresque-start').click();
  await expect(page.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', 'lot1');

  for (const id of ['c04', 'c07', 'c13', 'c18', 'c21']) await placeFromHand(page, id);
  await linkByKeyboard(page, 'c04', 'c07');
  await linkByKeyboard(page, 'c07', 'c13');
  await expect(page.getByTestId('fm-fresque-arrow-l1')).toBeAttached();
  await expect(page.getByTestId('fm-fresque-arrow-l2')).toBeAttached();

  await page.getByTestId('fm-fresque-next-lot').click();
  await expect(page.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', 'lot2');
  await placeFromHand(page, 'c03');
  await waitSaved(page);

  await page.reload();
  await openFresqueTab(page);
  await openMyBoard(page);
  await expect(page.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', 'lot2', {
    timeout: 20_000,
  });
  for (const id of ['c04', 'c07', 'c13', 'c18', 'c21', 'c03']) {
    await expect(page.getByTestId(`fm-fresque-card-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('fm-fresque-arrow-l1')).toBeAttached();
  await expect(page.getByTestId('fm-fresque-arrow-l2')).toBeAttached();
  await expect(page.getByTestId('fm-fresque-hand-c16')).toBeVisible();
  await expect(page.getByTestId('fm-fresque-credit')).toContainText('Fresque du Climat');
});

test('élève : parcours complet en Éclaireur jusqu’à la fin (badge, crédit, export)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loginAsNewStudent(page);
  await dismissProfilePromotionModalIfPresent(page);
  await openFresqueTab(page);
  await openMyBoard(page);

  await page.getByTestId('fm-fresque-pick-eclaireur').click();
  await page.getByTestId('fm-fresque-start').click();
  await expect(page.getByTestId('fm-fresque-board')).toHaveAttribute('data-level', 'eclaireur');
  await expect(page.getByTestId('fm-fresque-bands')).toBeVisible();

  for (const lot of [2, 3]) {
    await page.getByTestId('fm-fresque-place-all').click();
    await page.getByTestId('fm-fresque-next-lot').click();
    await expect(page.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', `lot${lot}`);
  }
  await page.getByTestId('fm-fresque-place-all').click();
  // Une flèche trouvée en Éclaireur : retour immédiat, sans « faux ».
  await linkByKeyboard(page, 'c04', 'c07');
  const toast = page.getByTestId('fm-fresque-toast');
  await expect(toast).toContainText('Bien vu');
  await expect(toast).not.toContainText(/faux|erreur/i);
  await expect(page.getByTestId('fm-fresque-chip-c04')).toContainText('1/1');

  await page.getByTestId('fm-fresque-go-understand').click();
  await expect(page.getByTestId('fm-fresque-board')).toHaveAttribute('data-step', 'comprendre');
  await page.getByTestId('fm-fresque-compare').click();
  await expect(page.getByTestId('fm-fresque-done-title')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('fm-fresque-done-rewards')).toContainText('Fresque du Climat');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByTestId('fm-fresque-summary')).toContainText('Dans la correction : 1 / 30');
  await expect(page.getByTestId('fm-fresque-export')).toBeVisible();
  await expect(page.getByTestId('fm-fresque-credit')).toContainText('CC BY-NC-ND');
  await waitSaved(page);
});
