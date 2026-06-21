const { test, expect } = require('@playwright/test');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');

test.describe('GL chapitres — edition visuelle repere', () => {
  test('MJ deplace un repere via API admin (coordonnees carte)', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-map-editor-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Map ${now}`, 'admin'],
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
      permissions: ['gl.read', 'gl.content.manage'],
      displayName: `MJ Map ${now}`,
    });
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    const slug = `e2e-map-editor-${now}`;
    const createChapter = await request.post('/api/gl/chapters/admin', {
      headers: adminHeaders,
      data: {
        slug,
        title: 'Chapitre carte visuelle',
        mapImageUrl: '/maps/map-foret.svg',
      },
    });
    expect(createChapter.status()).toBe(201);
    const chapterId = Number((await createChapter.json())?.chapter?.id || 0);
    expect(chapterId).toBeGreaterThan(0);

    const createdMarker = await request.post(`/api/gl/chapters/admin/${chapterId}/markers`, {
      headers: adminHeaders,
      data: { label: 'Repere drag', xPct: 20, yPct: 20, eventType: 'question' },
    });
    expect(createdMarker.status()).toBe(201);
    const createdBody = await createdMarker.json();
    const markerId = Number(createdBody?.id || 0);
    expect(markerId).toBeGreaterThan(0);
    expect(createdBody.display_mode).toBe('emoji');
    expect(createdBody.emoji).toBe('❓');

    const moved = await request.put(`/api/gl/chapters/admin/markers/${markerId}`, {
      headers: adminHeaders,
      data: { xPct: 62.5, yPct: 37.5 },
    });
    expect(moved.status()).toBe(200);
    const movedBody = await moved.json();
    expect(Number(movedBody.x_pct)).toBe(62.5);
    expect(Number(movedBody.y_pct)).toBe(37.5);

    const chapterDetail = await request.get(`/api/gl/chapters/${slug}`, { headers: adminHeaders });
    expect(chapterDetail.status()).toBe(200);
    const detailBody = await chapterDetail.json();
    const marker = detailBody.markers.find((item) => Number(item.id) === markerId);
    expect(marker).toBeTruthy();
    expect(Number(marker.x_pct)).toBe(62.5);
    expect(Number(marker.y_pct)).toBe(37.5);

    await request.delete(`/api/gl/chapters/admin/${chapterId}`, { headers: adminHeaders });
  });
});
