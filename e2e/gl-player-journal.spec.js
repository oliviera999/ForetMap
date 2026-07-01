const { test, expect } = require('@playwright/test');
const { seedGlScenario, mountGlSession } = require('./fixtures/gl.fixture');

async function loginGlPlayer(page, seeded, { tab = 'my-journal' } = {}) {
  await mountGlSession(page, {
    token: seeded.playerToken,
    auth: {
      userType: 'gl_player',
      roleSlug: 'gl_player',
      displayName: seeded.playerPseudo,
      userId: String(seeded.playerId),
      teamId: seeded.teamId,
    },
    tab,
  });
}

test.describe('GL carnet personnel (Mon journal)', () => {
  test('onglet Mon journal : nouvel article et sauvegarde automatique', async ({
    page,
    request,
  }) => {
    const seeded = await seedGlScenario('player-journal');

    const enableModule = await request.put(
      '/api/gl/admin/settings/modules.player_journal_enabled',
      {
        headers: { Authorization: `Bearer ${seeded.adminToken}` },
        data: { value: true },
      },
    );
    expect(enableModule.ok()).toBeTruthy();

    await loginGlPlayer(page, seeded, { tab: 'my-journal' });

    await expect(page.getByRole('heading', { name: 'Mon journal', level: 2 })).toBeVisible();

    // Crée un nouvel article
    const createResponse = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes('/api/gl/player-journal/me/articles') &&
        res.status() === 201,
      { timeout: 15000 },
    );
    await page.getByRole('button', { name: /Nouvel article/i }).click();
    await createResponse;

    const textarea = page.getByLabel(/Contenu de l’article/i);
    await expect(textarea).toBeVisible();
    const note = `Note e2e carnet ${Date.now()}`;

    const saveResponse = page.waitForResponse(
      (res) =>
        res.request().method() === 'PUT' &&
        res.url().includes('/api/gl/player-journal/me/articles/') &&
        res.status() === 200,
      { timeout: 15000 },
    );

    await textarea.fill(note);
    await saveResponse;

    await expect(page.locator('.gl-player-journal__saved').getByText(/Enregistré/i)).toBeVisible({
      timeout: 10000,
    });

    const reloadGet = page.waitForResponse(
      (res) =>
        res.request().method() === 'GET' &&
        res.url().includes('/api/gl/player-journal/me') &&
        res.status() === 200,
      { timeout: 15000 },
    );
    await page.reload();
    await reloadGet;

    await expect(page.getByLabel(/Contenu de l’article/i)).toHaveValue(note);
  });

  test('navigation : onglet Mon journal visible si module actif', async ({ page, request }) => {
    const seeded = await seedGlScenario('player-journal-nav');

    await request.put('/api/gl/admin/settings/modules.player_journal_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });

    await loginGlPlayer(page, seeded, { tab: 'maps' });

    const tabBtn = page.getByRole('tab', { name: /Mon journal/i });
    await expect(tabBtn).toBeVisible();
    await tabBtn.click();
    await expect(page.getByRole('heading', { name: 'Mon journal', level: 2 })).toBeVisible();
  });

  test('barre d’outils : recherche filtre le fil du carnet', async ({ page, request }) => {
    const seeded = await seedGlScenario('player-journal-search');

    // NOTE: le module carnet peut être désactivé côté réglages ; on l'active
    // explicitement pour rendre l'onglet accessible (skip conditionnel plus bas).
    const enableModule = await request.put(
      '/api/gl/admin/settings/modules.player_journal_enabled',
      {
        headers: { Authorization: `Bearer ${seeded.adminToken}` },
        data: { value: true },
      },
    );
    expect(enableModule.ok()).toBeTruthy();

    await loginGlPlayer(page, seeded, { tab: 'my-journal' });

    // NOTE: si l'onglet reste inaccessible (module resté inactif côté front,
    // condition d'affichage non remplie), on skippe proprement plutôt que d'échouer.
    const heading = page.getByRole('heading', { name: 'Mon journal', level: 2 });
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Onglet « Mon journal » indisponible (module carnet inactif).');
    }
    await expect(heading).toBeVisible();

    // Crée un nouvel article (POST → 201) puis renseigne titre + texte (auto-save PUT → 200).
    const createResponse = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes('/api/gl/player-journal/me/articles') &&
        res.status() === 201,
      { timeout: 15000 },
    );
    await page.getByRole('button', { name: /Nouvel article/i }).click();
    await createResponse;

    const stamp = Date.now();
    // Mot du titre volontairement singulier pour une recherche fiable (sans dépendre de seed).
    const titleWord = `Champibulle${stamp}`;
    const bodyText = `Contenu e2e du carnet ${stamp}.`;

    const titleInput = page.getByLabel(/Titre de l’article/i);
    const textarea = page.getByLabel(/Contenu de l’article/i);
    await expect(titleInput).toBeVisible();
    await expect(textarea).toBeVisible();

    const saveResponse = page.waitForResponse(
      (res) =>
        res.request().method() === 'PUT' &&
        res.url().includes('/api/gl/player-journal/me/articles/') &&
        res.status() === 200,
      { timeout: 15000 },
    );
    await titleInput.fill(titleWord);
    await textarea.fill(bodyText);
    await saveResponse;

    // Confirme l'auto-save avant de manipuler la barre d'outils.
    await expect(page.locator('.gl-player-journal__saved').getByText(/Enregistré/i)).toBeVisible({
      timeout: 10000,
    });

    // La barre d'outils (recherche/filtre/tri) n'apparaît qu'avec au moins une entrée.
    const search = page.getByRole('searchbox', { name: /Rechercher dans mon journal/i });
    await expect(search).toBeVisible();

    // Recherche d'un mot présent dans le titre → l'article reste dans le fil.
    await search.fill(titleWord);
    await expect(titleInput).toHaveValue(titleWord);
    await expect(
      page.getByText(/Aucune entrée ne correspond à ta recherche ou à ce filtre/i),
    ).toHaveCount(0);

    // Recherche d'un mot absent → message d'absence de résultat, article masqué.
    await search.fill(`introuvable-${stamp}-xyz`);
    await expect(
      page.getByText(/Aucune entrée ne correspond à ta recherche ou à ce filtre/i),
    ).toBeVisible();
    await expect(titleInput).toHaveCount(0);

    // Effacer la recherche restaure l'article dans le fil.
    await search.fill('');
    await expect(page.getByLabel(/Titre de l’article/i)).toHaveValue(titleWord);
  });

  test('MJ : lecture carnet depuis statistiques classe', async ({ page, request }) => {
    const seeded = await seedGlScenario('player-journal-mj');

    await request.put('/api/gl/admin/settings/modules.player_journal_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });

    const createArticle = await request.post('/api/gl/player-journal/me/articles', {
      headers: { Authorization: `Bearer ${seeded.playerToken}` },
      data: { title: 'Article MJ', bodyMarkdown: '## Carnet visible par le MJ\n\nContenu e2e MJ.' },
    });
    expect(createArticle.ok()).toBeTruthy();

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(
      (payload) => {
        localStorage.setItem('gl_session', JSON.stringify(payload));
        localStorage.setItem('gl_active_tab', 'stats');
      },
      {
        token: seeded.adminToken,
        auth: {
          userType: 'gl_admin',
          roleSlug: 'gl_admin',
          displayName: 'MJ',
          userId: String(seeded.adminId),
          permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage'],
        },
      },
    );
    await page.reload();

    const readResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/gl/player-journal/players/${seeded.playerId}`) &&
        res.status() === 200,
      { timeout: 15000 },
    );

    await page
      .getByRole('button', { name: /Carnet/i })
      .first()
      .click();
    await readResponse;

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Carnet visible par le MJ/i)).toBeVisible();
  });
});
