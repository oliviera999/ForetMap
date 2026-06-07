const { test, expect } = require('@playwright/test');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');
const { saveMediaFromBuffer, deleteMediaLibraryItem } = require('../lib/mediaLibrary');
const { loadMediaKeyIndex } = require('../lib/glAssetManifest');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=',
  'base64',
);

test.describe('GL — liaison médias assets', () => {
  test('API — upload GL_* alimente _keys.json et manifestes', async ({ request }) => {
    const stamp = Date.now();
    const fileName = `GL_e2e-plateau-1_test-${stamp}.png`;
    let relativePath = null;

    try {
      const saved = saveMediaFromBuffer(TINY_PNG, 'image/png', fileName);
      relativePath = saved.relativePath;
      const stableKey = `e2e-plateau-1_test-${stamp}`;

      const keysRes = await request.get('/uploads/media-library/_keys.json');
      expect(keysRes.ok()).toBeTruthy();
      const keys = await keysRes.json();
      expect(keys[stableKey]?.relativePath).toBeTruthy();

      const manifestRes = await request.get('/uploads/media-library/_manifest.images.json');
      expect(manifestRes.ok()).toBeTruthy();
      const manifest = await manifestRes.json();
      expect(manifest[stableKey]).toBe(stableKey);

      const index = loadMediaKeyIndex();
      expect(index[stableKey]?.url || `/uploads/${index[stableKey]?.relativePath}`).toContain('/uploads/');
    } finally {
      if (relativePath) {
        deleteMediaLibraryItem(relativePath);
      }
    }
  });

  test('API — intro publique résout les images médiathèque si présentes', async ({ request }) => {
    const introRes = await request.get('/api/gl/content/intro');
    expect(introRes.ok()).toBeTruthy();
    const body = await introRes.json();
    if (body.enabled === false) {
      test.skip(true, 'Module intro désactivé');
      return;
    }
    expect(body.scenes?.length).toBe(9);
    const boiteUrl = String(body.images?.boite || '');
    expect(boiteUrl.length).toBeGreaterThan(0);
    expect(
      boiteUrl.includes('/uploads/media-library/')
      || boiteUrl.includes('/gl/intro/'),
    ).toBeTruthy();
  });

  test('API — chapitre expose plateau_number pour résolution musique/fond', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-media-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Media ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminRow.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage'],
      displayName: `MJ Media ${now}`,
    });

    const chapter = await queryOne("SELECT slug, plateau_number FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
    expect(chapter?.slug).toBeTruthy();

    const detail = await request.get(`/api/gl/chapters/${chapter.slug}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(detail.ok()).toBeTruthy();
    const detailBody = await detail.json();
    expect(detailBody?.chapter?.slug).toBe(chapter.slug);
    expect(detailBody?.chapter?.plateau_number == null || Number(detailBody.chapter.plateau_number) >= 1).toBeTruthy();
  });
});
