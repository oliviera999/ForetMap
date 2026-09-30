const { test, expect } = require('@playwright/test');
const { publishForumThread } = require('./fixtures/forum.fixture');
const {
  loginAsNewStudent,
  enableTeacherMode,
  dismissProfilePromotionModalIfPresent,
  openTeacherTabInPole,
} = require('./fixtures/auth.fixture');

/**
 * Forum commun (ForetMap) : créer un sujet, répondre, citer, modifier son message, épingler.
 * Parcours prof (modérateur) sur grand écran : la liste et la discussion sont côte à côte.
 */
test('forum : sujet, réponse, citation, modification et épinglage', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await dismissProfilePromotionModalIfPresent(page);
  await openTeacherTabInPole(page, 'Suivi', /^Forum/);

  const view = page.locator('.forum-view');
  await expect(view).toBeVisible({ timeout: 20_000 });

  const title = `Sujet e2e ${Date.now()}`;
  // Attendre la liste des sujets et la sélection automatique du plus récent : leur arrivée
  // re-monte le formulaire et effacerait une saisie commencée trop tôt.
  const threadList = view.getByRole('region', { name: 'Sujets du forum' });
  await expect(threadList.getByRole('heading', { name: /^Sujets/ })).toBeVisible({
    timeout: 20_000,
  });
  if ((await threadList.getByRole('button', { name: /message/ }).count()) > 0) {
    await expect(view.getByRole('region', { name: 'Discussion' })).toBeVisible({
      timeout: 20_000,
    });
  }
  await view.getByRole('button', { name: /Nouveau sujet/ }).click();
  await page.locator('#forum-thread-title').fill(title);
  // Éditeur visuel (`contenteditable`) : `fill` n'y déclenche pas toujours la saisie React ;
  // on tape au clavier puis on vérifie le contenu avant de publier.
  const body = page.locator('#forum-thread-body');
  await body.click();
  await page.keyboard.type('Où planter les fraisiers cette année ?');
  await expect(body).toContainText('Où planter les fraisiers cette année ?');
  await publishForumThread(page, view);

  const detail = view.getByRole('region', { name: 'Discussion' });
  await expect(detail.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });

  // Citer le premier message remplit le champ de réponse.
  const firstPost = detail.locator('.forum-post').first();
  await firstPost.getByRole('button', { name: 'Citer' }).click();
  // La réponse passe par l'éditeur visuel (surface `contenteditable`, `role="textbox"`) :
  // la citation y devient un bloc cité, lisible par son texte et non par une valeur.
  const reply = page.locator('#forum-reply');
  await expect(reply).toContainText('a écrit');
  await expect(reply).toContainText('Où planter les fraisiers');
  await reply.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Près de la mare, au soleil.');
  await detail.getByRole('button', { name: 'Envoyer' }).click();
  await expect(detail.locator('.forum-post')).toHaveCount(2, { timeout: 15_000 });

  // Modifier son propre message : mention « modifié le … ».
  const lastPost = detail.locator('.forum-post').last();
  await lastPost.getByRole('button', { name: 'Modifier' }).click();
  await lastPost.getByLabel('Modifier le message').fill('Près de la mare, à mi-ombre.');
  await lastPost.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(lastPost.getByText('Près de la mare, à mi-ombre.')).toBeVisible({ timeout: 15_000 });
  await expect(lastPost.getByText(/modifié le/)).toBeVisible();

  // Épingler : badge dans la liste, bouton qui devient « Désépingler ».
  await detail.getByRole('button', { name: 'Épingler' }).click();
  await expect(detail.getByRole('button', { name: 'Désépingler' })).toBeVisible({
    timeout: 15_000,
  });
  const listItem = view
    .getByRole('region', { name: 'Sujets du forum' })
    .getByRole('button', { name: new RegExp(title) });
  await expect(listItem.getByText('Épinglé')).toBeVisible();

  await detail.getByRole('button', { name: 'Désépingler' }).click();
  await expect(detail.getByRole('button', { name: 'Épingler' })).toBeVisible({ timeout: 15_000 });

  // Panneau des signalements accessible au modérateur.
  await view.getByRole('button', { name: /^Signalements \(\d+\)$/ }).click();
  await expect(view.getByRole('region', { name: /Signalements à traiter/ })).toBeVisible();
});
