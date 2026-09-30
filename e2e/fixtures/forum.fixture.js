const { expect } = require('@playwright/test');

/**
 * Publie le sujet en cours de saisie. Le forum impose un délai entre deux créations de
 * sujet par le même compte (`THREAD_COOLDOWN_MS`, 10 s, `routes/forum.js`) ; les specs
 * e2e publiant avec le même compte administrateur, un 429 ici veut dire « trop tôt »,
 * pas une erreur : on attend la fin du délai et on republie.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} view conteneur `.forum-view`
 */
async function publishForumThread(page, view) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/forum\/threads(\?|$)/.test(r.url()),
      { timeout: 15_000 },
    );
    await view.getByRole('button', { name: 'Publier le sujet' }).click();
    const response = await responsePromise;
    if (response.status() !== 429) {
      expect(response.status()).toBeLessThan(400);
      return response;
    }
    await page.waitForTimeout(10_500);
  }
  throw new Error('Publication du sujet refusée (429) après trois essais');
}

module.exports = { publishForumThread };
