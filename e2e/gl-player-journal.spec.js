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
  test('onglet Mon journal : édition et sauvegarde automatique', async ({ page, request }) => {
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
    await expect(page.getByLabel(/Contenu du carnet/i)).toBeVisible();
    await expect(
      page.locator('.gl-player-journal__quota').filter({ hasText: /Caractères/i }),
    ).toBeVisible();
    await expect(
      page.locator('.gl-player-journal__quota').filter({ hasText: /^Illustrations/i }),
    ).toBeVisible();

    const textarea = page.getByLabel(/Contenu du carnet/i);
    const note = `Note e2e carnet ${Date.now()}`;

    const saveResponse = page.waitForResponse(
      (res) =>
        res.request().method() === 'PUT' &&
        res.url().includes('/api/gl/player-journal/me') &&
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

    await expect(textarea).toHaveValue(note);
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

  test('MJ : lecture carnet depuis statistiques classe', async ({ page, request }) => {
    const seeded = await seedGlScenario('player-journal-mj');

    await request.put('/api/gl/admin/settings/modules.player_journal_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });

    const putJournal = await request.put('/api/gl/player-journal/me', {
      headers: { Authorization: `Bearer ${seeded.playerToken}` },
      data: { bodyMarkdown: '## Carnet visible par le MJ\n\nContenu e2e MJ.' },
    });
    expect(putJournal.ok()).toBeTruthy();

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
