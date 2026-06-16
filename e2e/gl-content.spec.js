const { test, expect } = require('@playwright/test');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');

test.describe('Gnomes & Licornes — édition des chapitres (Lot 2B)', () => {
  test("MJ crée/édite un chapitre via l'API et le joueur le lit via /api/gl/chapters/:slug", async ({
    request,
  }) => {
    const now = Date.now();
    const adminEmail = `e2e-content-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Content ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const adminId = Number(adminRow?.id || 0);
    expect(adminId).toBeGreaterThan(0);

    await execute(
      'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`6e Content ${now}`, 'Lyautey', adminId],
    );
    const classRow = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
    const classId = Number(classRow?.id || 0);

    await execute(
      `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
       VALUES (?, ?, 'x', 1, NOW(), NOW())`,
      [classId, `e2e_content_player_${now}`],
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
        mapImageFrame: { aspectRatio: '16/9', objectFit: 'contain', focalX: 30, focalY: 70 },
        storyMarkdown:
          '# Histoire e2e\n\n<img src="/uploads/media-library/image/2026/01/e2e-inline.jpg" alt="Illustration e2e" class="gl-content-image" data-gl-frame=\'{"ratio":"16:9","radius":10}\' loading="lazy" />',
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
    expect(detailBody?.chapter?.map_image_frame?.objectFit).toBe('contain');
    expect(detailBody?.chapter?.title).toBe('Chapitre e2e');
    expect(String(detailBody?.chapter?.story_markdown || '')).toContain(
      '/uploads/media-library/image/2026/01/e2e-inline.jpg',
    );
    expect(Array.isArray(detailBody.markers)).toBe(true);
    expect(detailBody.markers.some((m) => m.label === 'Repère e2e')).toBe(true);

    await request.delete(`/api/gl/chapters/admin/${chapterId}`, { headers: adminHeaders });
  });

  test('import espèces dry-run puis lecture par biome', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-species-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Species ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminRow.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage'],
    });
    const fs = require('node:fs');
    const path = require('node:path');
    const xlsxPath = path.join(
      __dirname,
      '..',
      'data',
      'gl',
      'especes-biomes-gnomes-et-licornes.xlsx',
    );
    const fileDataBase64 = fs.readFileSync(xlsxPath).toString('base64');
    const importRes = await request.post('/api/gl/admin/species/import', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { fileDataBase64, dryRun: true, syncBiomes: true },
    });
    expect(importRes.status()).toBe(200);
    const importBody = await importRes.json();
    expect(importBody?.report?.totals?.valid).toBeGreaterThan(200);

    const biomesRes = await request.get('/api/gl/biomes', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(biomesRes.status()).toBe(200);
    const biomes = await biomesRes.json();
    expect(biomes.some((b) => b.slug === 'sahara')).toBe(true);
  });

  test('import sortilèges dry-run puis lecture par codes', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-spells-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Spells ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminRow.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage'],
    });
    const fs = require('node:fs');
    const path = require('node:path');
    const xlsxPath = path.join(__dirname, '..', 'data', 'gl', 'sortileges-gnomes-et-licornes.xlsx');
    const fileDataBase64 = fs.readFileSync(xlsxPath).toString('base64');
    const importRes = await request.post('/api/gl/admin/spells/import', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { fileDataBase64, dryRun: true, syncCategories: true },
    });
    expect(importRes.status()).toBe(200);
    const importBody = await importRes.json();
    expect(importBody?.report?.totals?.valid).toBeGreaterThan(30);

    const spellsRes = await request.get('/api/gl/spells?spellCodes=SL002', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(spellsRes.status()).toBe(200);
    const spellsBody = await spellsRes.json();
    expect(spellsBody?.items?.some((s) => s.spell_code === 'SL002')).toBe(true);
  });

  test('import glossaire dry-run puis lecture par biome', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-glossary-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Glossary ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminRow.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage'],
    });
    const fs = require('node:fs');
    const path = require('node:path');
    const xlsxPath = path.join(__dirname, '..', 'data', 'gl', 'glossaire-gnomes-et-licornes.xlsx');
    const fileDataBase64 = fs.readFileSync(xlsxPath).toString('base64');
    const importRes = await request.post('/api/gl/admin/glossary/import', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { fileDataBase64, dryRun: true },
    });
    expect(importRes.status()).toBe(200);
    const importBody = await importRes.json();
    expect(importBody?.report?.totals?.valid).toBeGreaterThan(200);

    const glossaryRes = await request.get('/api/gl/glossary?biomeSlug=sahara', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(glossaryRes.status()).toBe(200);
    const glossaryBody = await glossaryRes.json();
    expect(Array.isArray(glossaryBody?.items)).toBe(true);
  });

  test('import QCM dry-run puis present avec mélange', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-qcm-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ QCM ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminRow.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage'],
    });
    const fs = require('node:fs');
    const path = require('node:path');
    const xlsxPath = path.join(
      __dirname,
      '..',
      'data',
      'gl',
      'qcm-biomes-gnomes-et-licornes-consolide.xlsx',
    );
    const fileDataBase64 = fs.readFileSync(xlsxPath).toString('base64');
    const importRes = await request.post('/api/gl/admin/qcm/import', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { fileDataBase64, dryRun: true },
    });
    expect(importRes.status()).toBe(200);
    const importBody = await importRes.json();
    expect(importBody?.report?.totals?.valid).toBeGreaterThan(600);
  });

  test('CRUD manuel glossaire et espèce via API admin', async ({ request }) => {
    const now = Date.now();
    const adminEmail = `e2e-manual-crud-${now}@example.org`;
    const biomeSlug = `e2e_manual_biome_${now}`;
    const glossaryCode = `GLM${String(now).slice(-5)}`;
    const speciesCode = `SPM${String(now).slice(-5)}`;

    await execute(
      'INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at) VALUES (?, ?, 9998, NOW(), NOW())',
      [biomeSlug, `Biome manual ${now}`],
    );
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Manual ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminRow.id),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.content.manage'],
    });
    const headers = { Authorization: `Bearer ${adminToken}` };

    const termCreate = await request.post('/api/gl/admin/glossary/terms', {
      headers,
      data: {
        glossary_code: glossaryCode,
        terme: `Terme manual ${now}`,
        categorie: 'ecologie',
        niveau: 'base',
        definition_courte: 'Test saisie manuelle',
        all_biomes: true,
        statut: 'actif',
      },
    });
    expect(termCreate.status()).toBe(201);

    const glossaryRead = await request.get('/api/gl/glossary', { headers });
    const glossaryBody = await glossaryRead.json();
    expect(glossaryBody.items.some((t) => t.glossary_code === glossaryCode)).toBe(true);

    const speciesCreate = await request.post('/api/gl/admin/species', {
      headers,
      data: {
        species_code: speciesCode,
        biome_slug: biomeSlug,
        type: 'faune',
        nom_commun: `Espèce manual ${now}`,
        statut: 'actif',
      },
    });
    expect(speciesCreate.status()).toBe(201);

    const speciesRead = await request.get(
      `/api/gl/species?biomeSlug=${encodeURIComponent(biomeSlug)}`,
      { headers },
    );
    const speciesBody = await speciesRead.json();
    expect(speciesBody.items.some((s) => s.species_code === speciesCode)).toBe(true);
  });
});
