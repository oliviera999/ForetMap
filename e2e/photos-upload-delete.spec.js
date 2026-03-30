const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode, openFirstZoneModalFromMap } = require('./fixtures/auth.fixture');

function tinyPngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z3G8AAAAASUVORK5CYII=',
    'base64'
  );
}

test('parcours photos zone: upload puis suppression', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  await page.getByRole('button', { name: /Carte & Zones/ }).click();
  await expect(page.locator('img[alt^="Plan "]').first()).toBeVisible();

  const zoneCount = await page.locator('.map-zone-hit').count();
  test.skip(zoneCount === 0, 'Aucune zone exploitable pour test photo');

  await openFirstZoneModalFromMap(page);
  await page.getByRole('button', { name: '📷 Photos', exact: true }).click();

  const caption = page.getByPlaceholder('Légende (optionnel)');
  await caption.fill('Photo e2e');

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer(),
  });

  await expect(page.getByRole('button', { name: /Ajouter une photo|Envoi/ })).toBeVisible();
  await expect(caption).toHaveValue('');
  await expect(page.locator('img[alt="Photo e2e"]').first()).toBeVisible();

  const deleteButtons = page.locator('button', { hasText: '✕' });
  const deleteCount = await deleteButtons.count();
  if (deleteCount > 1) {
    page.once('dialog', d => d.accept());
    await deleteButtons.nth(1).click();
  }
});
