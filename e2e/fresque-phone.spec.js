const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Fresque sur téléphone (390 × 844) : retours de terrain du 25/10/2026.
 *  - « Commencer ma fresque » est visible (les couleurs de la fresque existent hors du plateau) ;
 *  - la carte glissée depuis la main suit le doigt (fantôme rendu dans <body>) ;
 *  - une carte de la main se lit en grand, recto et verso, avant d'être posée ;
 *  - une carte posée se lit en grand sous la table.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('téléphone : bouton visible, carte qui suit le doigt, cartes lisibles en grand', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loginAsNewStudent(page);
  await dismissProfilePromotionModalIfPresent(page);
  let tab = page.getByRole('button', { name: 'Fresque' });
  if (!(await tab.isVisible({ timeout: 8000 }).catch(() => false))) {
    const more = page.getByRole('button', { name: /^Plus/ });
    if (await more.isVisible().catch(() => false)) await more.click();
    tab = page.getByRole('button', { name: 'Fresque' }).first();
  }
  await tab.click();

  const open = page.getByTestId('fm-fresque-open-mine');
  await expect(open).toBeVisible({ timeout: 20_000 });
  const look = await open.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, h: el.getBoundingClientRect().height };
  });
  expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(look.h).toBeGreaterThanOrEqual(44);
  await open.click();
  await page.getByTestId('fm-fresque-start').click();

  // Glisser une carte : le fantôme reste sous le doigt.
  const hand = await page.getByTestId('fm-fresque-hand-c04').boundingBox();
  const table = page.getByTestId('fm-fresque-table');
  await table.scrollIntoViewIfNeeded();
  const tb = await table.boundingBox();
  const from = { x: hand.x + hand.width / 2, y: hand.y + hand.height / 2 };
  const to = { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  }
  const ghost = await page.locator('.fm-fresque-hand__ghost').boundingBox();
  expect(Math.abs(ghost.x + ghost.width / 2 - to.x)).toBeLessThan(4);
  expect(Math.abs(ghost.y + ghost.height / 2 - to.y)).toBeLessThan(4);
  await page.mouse.up();
  await expect(page.getByTestId('fm-fresque-card-c04')).toBeVisible();

  // La carte posée est choisie : elle se lit en grand sous la table.
  const panel = page.getByTestId('fm-fresque-inspector');
  await expect(panel).toHaveAttribute('data-origin', 'table');
  const big = await panel.locator('img').boundingBox();
  expect(big.width).toBeGreaterThan(250);
  await page.getByTestId('fm-fresque-inspector-close').click();

  // Une carte de la main : recto puis verso, en grand, avant de la poser.
  await page.getByTestId('fm-fresque-hand-c07').click();
  await expect(panel).toHaveAttribute('data-origin', 'hand');
  await page.getByTestId('fm-fresque-inspector-flip').click();
  await expect(panel.locator('img')).toHaveAttribute('src', /c07-verso/);
  await page.getByTestId('fm-fresque-inspector-place').click();
  await expect(page.getByTestId('fm-fresque-card-c07')).toBeVisible();
  await expect(page.getByTestId('fm-fresque-credit')).toContainText('CC BY-NC-ND');
});
