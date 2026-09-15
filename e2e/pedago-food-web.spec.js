const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('parcours élève : réseau trophique graphe, preset et panneau', async ({ page }) => {
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
  if ((await graph.count()) === 0) {
    // Jeu de données vide : au moins l’écran et le cadrage sont accessibles.
    return;
  }

  await expect(graph).toBeVisible();

  const edgeHit = page.locator('.pedago-foodweb-graph__edge-hit').first();
  if ((await edgeHit.count()) > 0) {
    await edgeHit.click();
    await expect(page.locator('.pedago-foodweb__glossary--panel')).toBeVisible();
  }

  const node = page.locator('.pedago-foodweb-graph__node-group').first();
  if ((await node.count()) > 0) {
    await node.click();
    await expect(page.getByRole('button', { name: /Tout afficher/i })).toBeVisible();
    const chaine = page.getByRole('button', { name: /^Chaîne$/ });
    if (await chaine.isVisible()) {
      await chaine.click();
      await expect(chaine).toHaveAttribute('aria-pressed', 'true');
    }
  }
});
