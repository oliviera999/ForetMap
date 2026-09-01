const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');
const { execute } = require('../database');

/**
 * `db:init` n’importe pas le seed biodiv : la table glossaire peut être vide.
 * On pose un terme unique (comme les specs GL) pour rester indépendant du contenu.
 */
async function seedGlossaryTerm() {
  const stamp = String(Date.now());
  const glossaryCode = `E2G${stamp.slice(-13)}`.slice(0, 16);
  const terme = `E2Echlorophylle${stamp.slice(-6)}`;
  await execute(
    `INSERT INTO glossary_terms (
      glossary_code, terme, variantes, categorie, niveau, definition_courte, statut, created_at, updated_at
    ) VALUES (?, ?, 'e2e-chloro', 'plantes', 'base', 'Pigment vert du test e2e', 'actif', NOW(), NOW())`,
    [glossaryCode, terme],
  );
  return { glossaryCode, terme };
}

test('parcours élève : glossaire recherche et fiche', async ({ page }) => {
  const { terme } = await seedGlossaryTerm();
  await loginAsNewStudent(page);
  await page.getByRole('button', { name: 'Glossaire' }).click();
  await expect(page.getByRole('heading', { name: /Glossaire/i })).toBeVisible({ timeout: 20_000 });

  const search = page.getByPlaceholder('Mot-clé…');
  await search.fill(terme);
  const match = page.locator('.pedago-term-list .pedago-term-btn').filter({ hasText: terme });
  await expect(match.first()).toBeVisible({ timeout: 15_000 });
  await match.first().click();
  await expect(page.locator('.pedago-glossary__detail .pedago-panel-title')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.pedago-glossary__detail .pedago-panel-title')).toContainText(terme);
});
