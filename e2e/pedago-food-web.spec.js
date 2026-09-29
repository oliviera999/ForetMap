const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

/**
 * Réseau servi par interception : le scénario ne dépend plus du contenu de la base.
 * Avant (audit du 29/09/2026, T4), il sortait en succès sur un graphe vide et sautait
 * chaque étape dont l'élément manquait — il ne pouvait pas échouer.
 */
const FOOD_WEB_FIXTURE = [
  {
    id: 1,
    interaction_type: 'predation',
    from_id: 910,
    from_name: 'Renard',
    from_emoji: '🦊',
    from_role: 'consommateur',
    to_id: 920,
    to_name: 'Lapin',
    to_emoji: '🐰',
    to_role: 'consommateur',
    description: '',
  },
  {
    id: 2,
    interaction_type: 'herbivorie',
    from_id: 920,
    from_name: 'Lapin',
    from_emoji: '🐰',
    from_role: 'consommateur',
    to_id: 930,
    to_name: 'Trèfle',
    to_emoji: '🍀',
    to_role: 'producteur',
    description: '',
  },
  {
    id: 3,
    interaction_type: 'herbivorie',
    from_id: 940,
    from_name: 'Escargot',
    from_emoji: '🐌',
    from_role: 'consommateur',
    to_id: 930,
    to_name: 'Trèfle',
    to_emoji: '🍀',
    to_role: 'producteur',
    description: '',
  },
];

async function serveFoodWebFixture(page) {
  await page.route('**/api/food-web**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.continue();
    if (pathname.endsWith('/glossary')) return route.fulfill({ json: { terms: [] } });
    if (pathname.endsWith('/api/food-web')) {
      return route.fulfill({ json: { items: FOOD_WEB_FIXTURE } });
    }
    return route.continue();
  });
}

test('parcours élève : réseau trophique — dispositions, isolement, clavier, export', async ({
  page,
}) => {
  await serveFoodWebFixture(page);
  await loginAsNewStudent(page);
  await page.evaluate(() => {
    localStorage.setItem('foretmap_active_tab', 'foodweb');
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: /Réseau trophique/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: /^Réseau alimentaire$/ })).toBeVisible();

  const graph = page.locator('svg.pedago-foodweb-graph');
  await expect(graph).toBeVisible();
  await expect(page.locator('.pedago-foodweb-graph__node-group')).toHaveCount(4);

  // Disposition par défaut : les niveaux (le cadrage porte un flux de matière).
  const niveaux = page.getByRole('button', { name: /Niveaux/ });
  await expect(niveaux).toHaveAttribute('aria-pressed', 'true');
  const cercle = page.getByRole('button', { name: /Cercle/ });
  await cercle.click();
  await expect(cercle).toHaveAttribute('aria-pressed', 'true');

  // Une flèche ouvre le panneau de la relation.
  await page.locator('.pedago-foodweb-graph__edge-hit').first().dispatchEvent('click');
  await expect(page.locator('.pedago-foodweb__glossary--panel')).toBeVisible();

  // Isoler une espèce : résumé en toutes lettres + disposition « Fiche ».
  await page.getByRole('button', { name: /^Lapin, / }).click();
  await expect(page.getByRole('button', { name: /Tout afficher/ })).toBeVisible();
  const summary = page.locator('.pedago-foodweb-graph__summary');
  await expect(summary).toContainText('Lapin');
  await expect(summary).toContainText('Trèfle');
  await expect(summary).toContainText('Renard');
  const fiche = page.getByRole('button', { name: /Fiche/ });
  await fiche.click();
  await expect(fiche).toHaveAttribute('aria-pressed', 'true');
  const chaine = page.getByRole('button', { name: /^Chaîne$/ });
  await chaine.click();
  await expect(chaine).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Tout afficher/ }).click();

  // Tabulation itinérante : un seul nœud tabulable, les flèches du clavier circulent.
  const tabbable = page.locator('.pedago-foodweb-graph__node-group[tabindex="0"]');
  await expect(tabbable).toHaveCount(1);
  await tabbable.focus();
  const before = await tabbable.getAttribute('aria-label');
  await page.keyboard.press('ArrowRight');
  const focusedLabel = await page.evaluate(() =>
    document.activeElement?.getAttribute('aria-label'),
  );
  expect(focusedLabel).not.toBe(before);
  await expect(page.locator('.pedago-foodweb-graph__node-group[tabindex="0"]')).toHaveCount(1);

  // Export PNG : un fichier est bien proposé au téléchargement.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^PNG$/ }).click();
  expect((await download).suggestedFilename()).toBe('reseau-trophique.png');
});
