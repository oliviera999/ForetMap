const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  loginAsTeacherAdminApi,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Flux T3 (orchestration de fin novembre 2026) — écrans touchés par les suites du chantier CPT :
 *   - étape de séance « Tutoriel » (`open_tutorial`) : l'aperçu s'ouvre par-dessus la séance,
 *     se ferme et se rouvre par le bouton « Tutoriel » du bandeau ; il suit l'interrupteur de
 *     l'onglet Tutoriels (onglet masqué : ni aperçu ni bouton, l'élève est invité à poursuivre) ;
 *   - `GET /api/tutorials/:id` : clés de détermination liées (`linked_id_keys`).
 *
 * Tout ce qui est créé est supprimé ; le réglage retrouve sa valeur d'avant.
 */

const TUTORIALS_SWITCH = 'ui.modules.tutorials_enabled';

async function firstActiveTutorial(page, auth) {
  const resp = await page.request.get('/api/tutorials', { headers: auth });
  expect(resp.ok(), await resp.text()).toBeTruthy();
  const rows = await resp.json();
  const tuto = (Array.isArray(rows) ? rows : []).find((t) => Number(t.id) > 0);
  expect(tuto, 'au moins un tutoriel actif en base').toBeTruthy();
  return tuto;
}

async function readSwitch(page, auth) {
  const resp = await page.request.get('/api/settings/public', { headers: auth });
  if (!resp.ok()) return true;
  const body = await resp.json();
  return body?.modules?.tutorials_enabled !== false;
}

async function setSwitch(page, auth, value) {
  const resp = await page.request.put(`/api/settings/admin/${TUTORIALS_SWITCH}`, {
    headers: auth,
    data: { value },
  });
  expect(resp.ok(), await resp.text()).toBeTruthy();
}

test('séance : étape tutoriel — aperçu, réouverture, puis onglet Tutoriels masqué', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const slug = `e2e-t3-tuto-${stamp}`;

  const adminToken = await loginAsTeacherAdminApi(page);
  const auth = { Authorization: `Bearer ${adminToken}` };
  const tuto = await firstActiveTutorial(page, auth);
  const switchBefore = await readSwitch(page, auth);
  await setSwitch(page, auth, true);

  const created = await page.request.post('/api/pedago-sessions', {
    headers: auth,
    data: {
      templateKey: 'custom',
      title: `Tutoriel en séance ${stamp}`,
      slug,
      isPublished: true,
      steps: [
        {
          title: 'Lire le tutoriel',
          body: 'Lis la fiche puis reviens à la séance.',
          action: { type: 'open_tutorial', payload: { tutorialId: Number(tuto.id) } },
        },
        { title: 'Fin', body: 'Bravo.', action: { type: 'message', payload: {} } },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const sessionId = (await created.json()).id;

  try {
    await loginAsNewStudent(page);
    await dismissProfilePromotionModalIfPresent(page);
    await page.goto(`/?seance=${slug}`);
    await dismissProfilePromotionModalIfPresent(page);

    const banner = page.getByTestId('pedago-session-banner');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    const preview = page.locator('.tuto-preview-modal');
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await expect(preview.locator('#tuto-preview-title')).toContainText(tuto.title);

    await preview.getByRole('button', { name: 'Fermer l’aperçu' }).click();
    await expect(preview).toBeHidden();
    await banner.getByRole('button', { name: 'Tutoriel' }).click();
    await expect(preview).toBeVisible();
    await preview.getByRole('button', { name: 'Fermer l’aperçu' }).click();

    // Onglet Tutoriels masqué : l'étape n'ouvre plus l'aperçu.
    await setSwitch(page, auth, false);
    await page.goto(`/?seance=${slug}`);
    await dismissProfilePromotionModalIfPresent(page);
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('pedago-session-tutorial-off')).toBeVisible({
      timeout: 20_000,
    });
    await expect(preview).toHaveCount(0);
    await expect(banner.getByRole('button', { name: 'Tutoriel' })).toHaveCount(0);
  } finally {
    await setSwitch(page, auth, switchBefore).catch(() => {});
    await page.request
      .delete(`/api/pedago-sessions/${sessionId}`, { headers: auth })
      .catch(() => {});
  }
});

test('API : GET /api/tutorials/:id rend les clés de détermination liées', async ({ page }) => {
  const stamp = Date.now();
  const adminToken = await loginAsTeacherAdminApi(page);
  const auth = { Authorization: `Bearer ${adminToken}` };
  const tuto = await firstActiveTutorial(page, auth);

  const created = await page.request.post('/api/id-keys', {
    headers: auth,
    data: { slug: `e2e-t3-cle-${stamp}`, title: `Clé E2E T3 ${stamp}` },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const keyId = Number((await created.json()).id);
  try {
    const linked = await page.request.put(`/api/id-keys/${keyId}`, {
      headers: auth,
      data: { tutorial_ids: [Number(tuto.id)] },
    });
    expect(linked.ok(), await linked.text()).toBeTruthy();

    // Brouillon : visible du gestionnaire des clés, pas du public.
    const asManager = await page.request.get(`/api/tutorials/${tuto.id}`, { headers: auth });
    expect(asManager.ok()).toBeTruthy();
    const managerKeys = (await asManager.json()).linked_id_keys.map((k) => k.id);
    expect(managerKeys).toContain(keyId);
    const asPublic = await page.request.get(`/api/tutorials/${tuto.id}`);
    expect(asPublic.ok()).toBeTruthy();
    expect((await asPublic.json()).linked_id_keys.map((k) => k.id)).not.toContain(keyId);
  } finally {
    await page.request.delete(`/api/id-keys/${keyId}`, { headers: auth }).catch(() => {});
  }
});
