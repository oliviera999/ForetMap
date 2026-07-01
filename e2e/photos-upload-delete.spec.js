const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  openFirstZoneModalFromMap,
} = require('./fixtures/auth.fixture');

function tinyPngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z3G8AAAAASUVORK5CYII=',
    'base64',
  );
}

test('parcours photos zone: upload puis suppression', async ({ page }) => {
  test.setTimeout(120_000);

  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  await page.getByRole('button', { name: /Carte & Zones/ }).click();
  await expect(page.locator('img[alt^="Plan "]').first()).toBeVisible();

  const zoneCount = await page.locator('.map-zone-hit').count();
  test.skip(zoneCount === 0, 'Aucune zone exploitable pour test photo');

  await openFirstZoneModalFromMap(page);
  const zoneDialog = page.locator('[role="dialog"][aria-label^="Zone "]').first();
  await zoneDialog.getByRole('button', { name: '📷 Photos', exact: true }).click();
  await expect(zoneDialog.getByRole('button', { name: '📁 Galerie' })).toBeVisible({
    timeout: 20_000,
  });

  const uniqueCaption = `Photo e2e ${Date.now()}`;
  const caption = zoneDialog.getByPlaceholder('Légende (optionnel)');
  await caption.fill(uniqueCaption);

  const galleryInput = zoneDialog.locator('input[type="file"]').first();
  await galleryInput.setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: tinyPngBuffer(),
  });

  await expect(zoneDialog.locator(`img[alt="${uniqueCaption}"]`).first()).toBeVisible({
    timeout: 90_000,
  });
  await expect(caption).toHaveValue('');
  await expect(zoneDialog.getByRole('button', { name: '📁 Galerie' })).toBeVisible();

  const deleteButtons = zoneDialog.locator('button', { hasText: '✕' });
  const deleteCount = await deleteButtons.count();
  if (deleteCount > 1) {
    page.once('dialog', (d) => d.accept());
    await deleteButtons.nth(1).click();
  }
});
