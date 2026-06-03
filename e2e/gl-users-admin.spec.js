const { test, expect } = require('@playwright/test');
const { seedGlScenario } = require('./fixtures/gl.fixture');
const { signAuthToken } = require('../middleware/requireTeacher');
const { execute } = require('../database');

test.describe('GL users admin flow', () => {
  test('MJ gère classes, joueurs, équipes et affectations', async ({ request, page }) => {
    const seeded = await seedGlScenario('users-admin');
    const adminManageToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(seeded.adminId),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit'],
    });

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    const classRes = await request.post('/api/gl/admin/classes', {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: { name: `Classe UI ${Date.now()}`, school: 'Lyautey' },
    });
    expect(classRes.status()).toBe(201);
    const createdClass = await classRes.json();

    const playerRes = await request.post('/api/gl/admin/players', {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: {
        classId: createdClass.id,
        firstName: 'Amina',
        lastName: 'Test',
        pseudo: `ui-player-${Date.now()}`,
        password: '1234',
      },
    });
    expect(playerRes.status()).toBe(201);
    const createdPlayer = await playerRes.json();

    const chaptersRes = await request.get('/api/gl/chapters', {
      headers: { Authorization: `Bearer ${adminManageToken}` },
    });
    expect(chaptersRes.status()).toBe(200);
    const chapters = await chaptersRes.json();
    expect(chapters.length).toBeGreaterThan(0);

    const gameRes = await request.post('/api/gl/games', {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: { classId: createdClass.id, chapterId: Number(chapters[0].id), name: 'Partie UI admin' },
    });
    expect(gameRes.status()).toBe(201);
    const game = await gameRes.json();
    const gameId = Number(game?.game?.id || 0);
    expect(gameId).toBeGreaterThan(0);

    const teamRes = await request.post(`/api/gl/games/${gameId}/teams`, {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: { name: 'Equipe Admin UI', type: 'gnome', mascotId: 'gl-gnome-mousse', color: '#22c55e' },
    });
    expect(teamRes.status()).toBe(201);
    const team = await teamRes.json();

    const assignRes = await request.post(`/api/gl/games/${gameId}/roster/assign`, {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: { playerId: Number(createdPlayer.id), teamId: Number(team.id) },
    });
    expect(assignRes.status()).toBe(200);

    const rosterRes = await request.get(`/api/gl/games/${gameId}/roster`, {
      headers: { Authorization: `Bearer ${adminManageToken}` },
    });
    expect(rosterRes.status()).toBe(200);
    const roster = await rosterRes.json();
    const found = roster.find((item) => Number(item.id) === Number(createdPlayer.id));
    expect(Number(found?.teamId || 0)).toBe(Number(team.id));
  });

  test('admin GL peut voir comme un joueur puis revenir à son compte', async ({ page }) => {
    const seeded = await seedGlScenario('impersonation');

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate((payload) => {
      localStorage.setItem('gl_session', JSON.stringify(payload));
      localStorage.setItem('gl_active_tab', 'users');
    }, {
      token: seeded.adminToken,
      auth: {
        product: 'gl',
        userType: 'gl_admin',
        userId: String(seeded.adminId),
        roleSlug: 'gl_admin',
        displayName: 'MJ impersonation',
        permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit', 'gl.settings.manage'],
      },
    });
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Gestion utilisateurs' })).toBeVisible();
    const playersRes = await page.request.get('/api/gl/admin/players', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
    });
    expect(playersRes.ok()).toBeTruthy();
    const players = await playersRes.json();
    expect(players.some((row) => row.pseudo === seeded.playerPseudo)).toBeTruthy();

    const playerRow = page.locator('tr, .gl-data-card').filter({ hasText: seeded.playerPseudo }).first();
    await playerRow.scrollIntoViewIfNeeded();
    await expect(playerRow).toBeVisible({ timeout: 15_000 });
    await playerRow.getByRole('button', { name: 'Voir comme' }).click({ timeout: 15_000 });

    await expect(page.getByText('Prise de contrôle (admin GL)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revenir à mon compte admin' })).toBeVisible();

    await page.getByRole('button', { name: 'Revenir à mon compte admin' }).click();
    await expect(page.getByText('Prise de contrôle (admin GL)')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Console MJ' })).toBeVisible();
  });

  test('MJ GL peut voir comme un joueur puis revenir à son compte MJ', async ({ page }) => {
    const seeded = await seedGlScenario('mj-impersonation');
    await execute('UPDATE gl_admins SET role = ? WHERE id = ?', ['mj', seeded.adminId]);
    const mjToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(seeded.adminId),
      roleSlug: 'gl_mj',
      permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit'],
      displayName: 'MJ impersonation',
    });

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate((payload) => {
      localStorage.setItem('gl_session', JSON.stringify(payload));
      localStorage.setItem('gl_active_tab', 'users');
    }, {
      token: mjToken,
      auth: {
        product: 'gl',
        userType: 'gl_admin',
        userId: String(seeded.adminId),
        roleSlug: 'gl_mj',
        displayName: 'MJ impersonation',
        permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit'],
      },
    });
    await page.reload();

    const playerRow = page.locator('tr, .gl-data-card').filter({ hasText: seeded.playerPseudo }).first();
    await playerRow.scrollIntoViewIfNeeded();
    await expect(playerRow).toBeVisible({ timeout: 15_000 });
    await playerRow.getByRole('button', { name: 'Voir comme' }).click({ timeout: 15_000 });

    await expect(page.getByText('Prise de contrôle (MJ GL)')).toBeVisible();
    await page.getByRole('button', { name: 'Revenir à mon compte MJ' }).click();
    await expect(page.getByText('Prise de contrôle (MJ GL)')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Console MJ' })).toBeVisible();
  });

  test('staff GL peut passer en vue joueur aperçu puis revenir', async ({ page }) => {
    const seeded = await seedGlScenario('player-preview');

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate((payload) => {
      localStorage.setItem('gl_session', JSON.stringify(payload));
      localStorage.setItem('gl_active_tab', 'maps');
    }, {
      token: seeded.adminToken,
      auth: {
        product: 'gl',
        userType: 'gl_admin',
        userId: String(seeded.adminId),
        roleSlug: 'gl_admin',
        displayName: 'Admin preview',
        permissions: ['gl.read', 'gl.game.manage'],
      },
    });
    await page.reload();

    await page.getByRole('button', { name: 'Passer en vue joueur' }).click();
    await expect(page.getByText('Vue joueur (aperçu)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Console MJ' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Revenir au rôle normal' }).click();
    await expect(page.getByText('Vue joueur (aperçu)')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Console MJ' })).toBeVisible();
  });
});
