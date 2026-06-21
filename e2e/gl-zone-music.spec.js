const { test, expect } = require('@playwright/test');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');
const { seedGlScenario } = require('./fixtures/gl.fixture');

test.describe('GL musique des zones', () => {
  test('API — musicUrl et musicVolume sur les zones royaume', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-zone-music-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Zone Music ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const adminId = Number(adminRow?.id || 0);
    expect(adminId).toBeGreaterThan(0);

    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminId),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage', 'gl.settings.manage'],
      displayName: `MJ Zone Music ${now}`,
    });
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    const chapter = await queryOne(
      "SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1",
    );
    const chapterId = Number(chapter?.id || 0);
    expect(chapterId).toBeGreaterThan(0);

    const musicUrl = '/uploads/media-library/audio/2026/05/e2e-ambiance.mp3';
    const points = [
      { x: 15, y: 15 },
      { x: 85, y: 15 },
      { x: 50, y: 85 },
    ];
    const createZone = await request.post('/api/gl/kingdom-map/zones', {
      headers: adminHeaders,
      data: {
        chapterId,
        label: `Zone musique e2e ${now}`,
        points,
        musicUrl,
        musicVolume: 0.6,
      },
    });
    expect(createZone.status()).toBe(201);
    const zoneId = Number((await createZone.json())?.id || 0);
    expect(zoneId).toBeGreaterThan(0);

    const config = await request.get('/api/gl/auth/config');
    expect(config.ok()).toBeTruthy();
    const configBody = await config.json();
    expect(typeof configBody?.modules?.zoneMusicEnabled).toBe('boolean');

    await request.delete(`/api/gl/kingdom-map/zones/${zoneId}`, { headers: adminHeaders });
  });

  test('UI — bouton mute visible sur Cartes si module actif', async ({ request, page }) => {
    const seeded = await seedGlScenario('zone-music-ui');

    const enableZoneMusic = await request.put('/api/gl/admin/settings/modules.zone_music_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });
    expect(enableZoneMusic.ok()).toBeTruthy();

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(
      (payload) => {
        localStorage.setItem('gl_session', JSON.stringify(payload));
        localStorage.setItem('gl_active_tab', 'maps');
      },
      {
        token: seeded.playerToken,
        auth: {
          userType: 'gl_player',
          roleSlug: 'gl_player',
          displayName: seeded.playerPseudo,
          teamId: seeded.teamId,
          gameId: seeded.gameId,
        },
      },
    );
    await page.reload();

    await expect(page.getByTestId('gl-zone-music-toggle')).toBeVisible();
  });
});
