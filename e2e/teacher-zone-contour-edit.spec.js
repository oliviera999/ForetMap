const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  waitForTeacherMapReady,
} = require('./fixtures/auth.fixture');

/**
 * Édition avancée du contour d'une zone (ajout, sélection, suppression de sommets).
 *
 * La zone de test est créée par l'API avec une géométrie connue (un carré de quatre
 * sommets) : le scénario ne dépend donc pas des zones du jeu de démonstration, et il
 * la supprime en sortant.
 */
async function adminToken(page) {
  const email = process.env.TEACHER_ADMIN_EMAIL || 'admin.test@foretmap.local';
  const password = process.env.TEACHER_ADMIN_PASSWORD || 'admin1234';
  const resp = await page.request.post('/api/auth/login', {
    data: { identifier: email, password },
  });
  if (!resp.ok()) {
    throw new Error(`Connexion admin e2e impossible (HTTP ${resp.status()})`);
  }
  const body = await resp.json();
  if (!body?.authToken) throw new Error('Connexion admin e2e : authToken absent');
  return body.authToken;
}

const SQUARE = [
  { xp: 22, yp: 22 },
  { xp: 62, yp: 22 },
  { xp: 62, yp: 62 },
  { xp: 22, yp: 62 },
];

test('parcours prof : ajouter puis retirer un sommet du contour d’une zone', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  const token = await adminToken(page);
  const headers = { Authorization: `Bearer ${token}` };
  const zoneName = `E2E contour ${Date.now()}`;
  const created = await page.request.post('/api/zones', {
    headers,
    data: { name: zoneName, points: SQUARE, stage: 'empty' },
  });
  expect(created.ok()).toBeTruthy();
  const zone = await created.json();

  try {
    await page.getByRole('button', { name: /Carte & Zones/ }).click();
    await waitForTeacherMapReady(page);

    // Ouvrir la fiche de la zone créée (les polygones exposent leur nom en rôle bouton).
    await page.getByRole('button', { name: zoneName, exact: true }).first().click({ force: true });
    const dialog = page.getByRole('dialog', { name: new RegExp(`^Zone ${zoneName}`) });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '✏️ Modifier', exact: true }).click();
    await dialog.getByRole('button', { name: /Modifier le contour de la zone/ }).click();

    // Mode d'édition : une poignée par sommet + une poignée fantôme par côté.
    const toolbar = page.getByRole('toolbar', { name: 'Édition du contour' });
    await expect(toolbar).toBeVisible();
    await expect(page.locator('.edit-pt')).toHaveCount(4);
    await expect(page.locator('.edit-mid')).toHaveCount(4);

    // Ajout : appuyer sur la poignée fantôme du premier côté crée un cinquième sommet,
    // immédiatement sélectionné.
    await page.getByTestId('edit-mid-1').dispatchEvent('pointerdown');
    await page.getByTestId('edit-mid-1').dispatchEvent('pointerup');
    await expect(page.locator('.edit-pt')).toHaveCount(5);
    await expect(page.locator('.edit-pt--selected')).toHaveCount(1);

    // Suppression : le bouton retire le sommet sélectionné et redevient inactif.
    const removeBtn = toolbar.getByRole('button', { name: /^🗑/ });
    await expect(removeBtn).toBeEnabled();
    await removeBtn.click();
    await expect(page.locator('.edit-pt')).toHaveCount(4);
    await expect(removeBtn).toBeDisabled();

    await toolbar.getByRole('button', { name: '💾 Sauver' }).click();
    await expect(page.getByText('Contour sauvegardé ✓')).toBeVisible();

    // Le contour sauvegardé est bien revenu à quatre sommets côté serveur.
    const after = await page.request.get(`/api/zones?map_id=${zone.map_id}`, { headers });
    expect(after.ok()).toBeTruthy();
    const zones = await after.json();
    const saved = (Array.isArray(zones) ? zones : []).find((z) => z.id === zone.id);
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved.points)).toHaveLength(4);
  } finally {
    await page.request.delete(`/api/zones/${zone.id}`, { headers }).catch(() => {});
  }
});
