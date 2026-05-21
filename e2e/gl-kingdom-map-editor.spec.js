const { test, expect } = require('@playwright/test');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');

test.describe('GL carte royaume — edition zones', () => {
  test('MJ cree puis remodele un polygone', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-kingdom-editor-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Kingdom ${now}`, 'admin']
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
    const adminId = Number(adminRow?.id || 0);
    expect(adminId).toBeGreaterThan(0);

    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminId),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage'],
      displayName: `MJ Kingdom ${now}`,
    });
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
    const chapterId = Number(chapter?.id || 0);
    expect(chapterId).toBeGreaterThan(0);

    const initialPoints = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 50, y: 90 },
    ];
    const createZone = await request.post('/api/gl/kingdom-map/zones', {
      headers: adminHeaders,
      data: {
        chapterId,
        label: `Zone e2e ${now}`,
        color: '#14b8a6',
        points: initialPoints,
      },
    });
    expect(createZone.status()).toBe(201);
    const zoneId = Number((await createZone.json())?.id || 0);
    expect(zoneId).toBeGreaterThan(0);

    const reshapedPoints = [
      { x: 12, y: 12 },
      { x: 85, y: 18 },
      { x: 72, y: 72 },
      { x: 20, y: 80 },
    ];
    const updateZone = await request.put(`/api/gl/kingdom-map/zones/${zoneId}`, {
      headers: adminHeaders,
      data: { points: reshapedPoints, color: '#22c55e' },
    });
    expect(updateZone.status()).toBe(200);
    const updateBody = await updateZone.json();
    expect(updateBody.points).toEqual(reshapedPoints);
    expect(updateBody.color).toBe('#22c55e');

    const listZones = await request.get(`/api/gl/kingdom-map/zones?chapterId=${chapterId}`, {
      headers: adminHeaders,
    });
    expect(listZones.status()).toBe(200);
    const zone = (await listZones.json()).zones.find((item) => Number(item.id) === zoneId);
    expect(zone).toBeTruthy();
    expect(zone.points).toEqual(reshapedPoints);

    await request.delete(`/api/gl/kingdom-map/zones/${zoneId}`, { headers: adminHeaders });
  });
});
