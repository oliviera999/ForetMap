const { test, expect } = require('@playwright/test');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');

test.describe('Gnomes & Licornes — édition des chapitres (Lot 2B)', () => {
  test('MJ crée/édite un chapitre via l\'API et le joueur le lit via /api/gl/chapters/:slug', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-content-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Content ${now}`, 'admin']
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
    const adminId = Number(adminRow?.id || 0);
    expect(adminId).toBeGreaterThan(0);

    await execute(
      'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`6e Content ${now}`, 'Lyautey', adminId]
    );
    const classRow = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
    const classId = Number(classRow?.id || 0);

    await execute(
      `INSERT INTO gl_players (class_id, pseudo, pin_hash, is_active, created_at, updated_at)
       VALUES (?, ?, 'x', 1, NOW(), NOW())`,
      [classId, `e2e_content_player_${now}`]
    );
    const playerRow = await queryOne('SELECT id FROM gl_players ORDER BY id DESC LIMIT 1');
    const playerId = Number(playerRow?.id || 0);

    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminId),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage', 'gl.game.manage', 'gl.settings.manage'],
      displayName: `MJ Content ${now}`,
    });
    const playerToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: String(playerId),
      roleSlug: 'gl_player',
      permissions: ['gl.read', 'gl.action.request'],
      displayName: `joueur Content ${now}`,
    });

    const slug = `e2e-content-${now}`;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const playerHeaders = { Authorization: `Bearer ${playerToken}` };

    const create = await request.post('/api/gl/chapters/admin', {
      headers: adminHeaders,
      data: {
        slug,
        title: 'Chapitre e2e',
        biome: 'biome e2e',
        mapImageUrl: '/maps/map-foret.svg',
        storyMarkdown: '# Histoire e2e',
        biotopeMarkdown: '## Biotope e2e',
        biocenoseMarkdown: '## Biocénose e2e',
        orderIndex: 999,
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    const chapterId = Number(created?.chapter?.id || 0);
    expect(chapterId).toBeGreaterThan(0);

    const addMarker = await request.post(`/api/gl/chapters/admin/${chapterId}/markers`, {
      headers: adminHeaders,
      data: { label: 'Repère e2e', xPct: 25, yPct: 75, eventType: 'quiz', orderIndex: 1 },
    });
    expect(addMarker.status()).toBe(201);

    const detail = await request.get(`/api/gl/chapters/${slug}`, { headers: playerHeaders });
    expect(detail.status()).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody?.chapter?.slug).toBe(slug);
    expect(detailBody?.chapter?.title).toBe('Chapitre e2e');
    expect(Array.isArray(detailBody.markers)).toBe(true);
    expect(detailBody.markers.some((m) => m.label === 'Repère e2e')).toBe(true);

    await request.delete(`/api/gl/chapters/admin/${chapterId}`, { headers: adminHeaders });
  });
});
