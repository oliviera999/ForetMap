const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  dismissProfilePromotionModalIfPresent,
  openTeacherTabInPole,
} = require('./fixtures/auth.fixture');

// PNG 8×8 opaque : assez grand pour passer la compression côté client (canvas).
const PNG_8X8 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPQ6LHBihiGlgQAbSE8AewdM48AAAAASUVORK5CYII=',
  'base64',
);

/**
 * Constat RG4 (docs/AUDIT_SECURITE_RGPD_2026-09-30.md) : une photo jointe à un message de
 * forum n'est lisible que par URL signée. Le parcours vérifie que l'image s'affiche bien dans
 * la discussion (l'URL fournie par l'API porte sa signature) et que la même adresse sans
 * signature est introuvable.
 */
test('forum : la photo jointe s’affiche par URL signée, pas par lien direct', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await dismissProfilePromotionModalIfPresent(page);
  await openTeacherTabInPole(page, 'Suivi', /^Forum/);

  const view = page.locator('.forum-view');
  await expect(view).toBeVisible({ timeout: 20_000 });

  const title = `Sujet photo e2e ${Date.now()}`;
  await view.getByRole('button', { name: /Nouveau sujet/ }).click();
  await page.locator('#forum-thread-title').fill(title);
  await page.locator('#forum-thread-body').fill('Voici la mare ce matin.');
  await page
    .getByLabel('Photos du premier message (optionnel, max 3) — galerie ou fichiers')
    .setInputFiles({ name: 'mare.png', mimeType: 'image/png', buffer: PNG_8X8 });
  await view.getByRole('button', { name: 'Publier le sujet' }).click();

  const detail = view.getByRole('region', { name: 'Discussion' });
  await expect(detail.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });

  const img = detail.locator('.user-content-images-grid-img').first();
  await expect(img).toBeVisible({ timeout: 15_000 });
  const src = await img.getAttribute('src');
  expect(src).toMatch(/\/uploads\/forum-posts\/.+\?exp=\d+&sig=[\w-]+$/);
  // L'image est réellement chargée (pas une icône cassée).
  await expect
    .poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0), { timeout: 10_000 })
    .toBe(true);

  const signed = await page.request.get(src);
  expect(signed.status()).toBe(200);
  const direct = await page.request.get(src.split('?')[0]);
  expect(direct.status()).toBe(404);
});
