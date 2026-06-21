'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { createGlPlayer, createGlGameWithTeams } = require('./helpers/glFixtures');
const { signAuthToken } = require('../middleware/requireTeacher');

let adminToken = '';
let playerToken = '';
let adminId = null;
let classId = null;
let createdChapterId = null;
let createdMarkerId = null;
const stamp = Date.now();
const slugCreated = `chap-test-${stamp}`;
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Chapters Admin', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`chapters.admin.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `chapters.admin.${stamp}@ecole.local`,
  ]);
  adminId = admin.id;
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage', 'gl.game.manage', 'gl.settings.manage'],
    displayName: 'MJ Chapters Admin',
  });

  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe Chapters Admin ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [
    `Classe Chapters Admin ${stamp}`,
  ]);
  classId = cls.id;
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `chapters-admin-player-${stamp}`,
  });
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: 'chapters-admin-player',
  });
});

test('POST /api/gl/chapters/admin refuse sans gl.content.manage', async () => {
  await request(app)
    .post('/api/gl/chapters/admin')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ slug: slugCreated, title: 'Refus' })
    .expect(403);
});

test('POST /api/gl/chapters/admin crée un chapitre', async () => {
  const res = await request(app)
    .post('/api/gl/chapters/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      slug: slugCreated,
      title: 'Chapitre test',
      biome: 'biome test',
      mapImageUrl: '/maps/map-foret.svg',
      mapImageFrame: { aspectRatio: '16/9', objectFit: 'contain', focalX: 40, focalY: 60 },
      storyMarkdown: '# Histoire test',
      biotopeMarkdown: '## Biotope test',
      biocenoseMarkdown: '## Biocénose test',
      orderIndex: 99,
    })
    .expect(201);
  assert.ok(res.body?.chapter?.id);
  assert.strictEqual(res.body.chapter.slug, slugCreated);
  assert.strictEqual(res.body.chapter.title, 'Chapitre test');
  assert.strictEqual(res.body.chapter.map_image_frame.objectFit, 'contain');
  assert.strictEqual(res.body.chapter.map_image_frame.aspectRatio, '16/9');
  assert.ok(Array.isArray(res.body.markers));
  createdChapterId = Number(res.body.chapter.id);
});

test('POST /api/gl/chapters/admin refuse un slug déjà utilisé (409)', async () => {
  await request(app)
    .post('/api/gl/chapters/admin')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ slug: slugCreated, title: 'Doublon' })
    .expect(409);
});

test('PUT /api/gl/chapters/admin/:id met à jour biomeSlugs', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ biomeSlugs: ['foret_caducifoliee'] })
    .expect(200);
  assert.strictEqual(res.body.chapter.biomes.length, 1);
  assert.strictEqual(res.body.chapter.biomes[0].slug, 'foret_caducifoliee');
  assert.ok(res.body.chapter.biomes[0].nom);
});

test("PUT /api/gl/chapters/admin/:id met à jour le titre et l'order_index", async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Chapitre test bis',
      orderIndex: 5,
      mapImageFrame: { aspectRatio: 'auto', objectFit: 'contain', focalX: 15, focalY: 25 },
    })
    .expect(200);
  assert.strictEqual(res.body.chapter.title, 'Chapitre test bis');
  assert.strictEqual(Number(res.body.chapter.order_index), 5);
  assert.strictEqual(Number(res.body.chapter.map_image_frame.focalX), 15);
  assert.strictEqual(Number(res.body.chapter.map_image_frame.focalY), 25);
});

test('PUT /api/gl/chapters/admin/:id met à jour mapMarkersVisible et mapZonesVisible', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ mapMarkersVisible: false, mapZonesVisible: true })
    .expect(200);
  assert.strictEqual(res.body.chapter.map_markers_visible, 0);
  assert.strictEqual(res.body.chapter.map_zones_visible, 1);

  const reset = await request(app)
    .put(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ mapMarkersVisible: null, mapZonesVisible: null })
    .expect(200);
  assert.strictEqual(reset.body.chapter.map_markers_visible, null);
  assert.strictEqual(reset.body.chapter.map_zones_visible, null);
});

test('PUT /api/gl/chapters/admin/:id met à jour theme.colors', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      theme: {
        colors: {
          primary: '#1a4d2e',
          background: '#f0fdf4',
        },
      },
    })
    .expect(200);
  assert.strictEqual(res.body.chapter.theme.colors.primary, '#1a4d2e');
  assert.strictEqual(res.body.chapter.theme.colors.background, '#f0fdf4');
  assert.strictEqual(res.body.chapter.theme.colors.secondary, undefined);
});

test('PUT /api/gl/chapters/admin/:id refuse theme.colors invalide', async () => {
  await request(app)
    .put(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ theme: { colors: { primary: 'not-a-color' } } })
    .expect(400);
});

test('POST /api/gl/chapters/admin/charte/import apply met à jour theme_json', async () => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const data = [
    [
      'slug',
      'titre',
      'image_carte_url',
      'couleur_primaire',
      'couleur_secondaire',
      'couleur_tertiaire',
      'couleur_texte',
      'couleur_liens',
      'couleur_liens_survol',
      'couleur_barre_haute',
      'couleur_fond',
      'cadre_ratio',
      'cadre_ajustement',
      'cadre_focal_x',
      'cadre_focal_y',
      'cadre_largeur_max',
      'cadre_hauteur_max',
    ],
    [slugCreated, '', '', '#2c5959', '', '', '', '', '', '', '#e8f5e9', '', '', '', '', '', ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'chapitres_charte');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fileDataBase64 = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buffer.toString('base64')}`;

  const res = await request(app)
    .post('/api/gl/chapters/admin/charte/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: false })
    .expect(200);
  assert.strictEqual(res.body.report.totals.updated, 1);

  const row = await queryOne('SELECT theme_json FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  const theme = JSON.parse(String(row.theme_json));
  assert.strictEqual(theme.colors.primary, '#2c5959');
  assert.strictEqual(theme.colors.background, '#e8f5e9');
});

test('POST /api/gl/chapters/admin/charte/import refuse sans gl.content.manage', async () => {
  await request(app)
    .post('/api/gl/chapters/admin/charte/import')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ fileDataBase64: 'data:;base64,', dryRun: true })
    .expect(403);
});

test('GET /api/gl/chapters/admin/import/template retourne un modèle XLSX (scope content_markers)', async () => {
  const res = await request(app)
    .get('/api/gl/chapters/admin/import/template?scope=content_markers')
    .set('Authorization', `Bearer ${adminToken}`)
    .buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
  assert.strictEqual(buf.slice(0, 2).toString('latin1'), 'PK');
  const XLSX = require('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes('chapitres'));
  assert.ok(wb.SheetNames.includes('reperes'));
});

test('GET /api/gl/chapters/admin/export filtre par slug', async () => {
  const res = await request(app)
    .get(`/api/gl/chapters/admin/export?scope=content&slug=${encodeURIComponent(slugCreated)}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
  const { parseChaptersWorkbook } = require('../lib/glChaptersImport');
  const parsed = await parseChaptersWorkbook(buf);
  assert.strictEqual(parsed.chapterRows.length, 1);
  assert.strictEqual(
    String(parsed.chapterRows[0].slug || parsed.chapterRows[0].Slug).toLowerCase(),
    slugCreated,
  );
});

test('POST /api/gl/chapters/admin/import met à jour histoire_markdown', async () => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const data = [
    [
      'slug',
      'titre',
      'ordre',
      'biome',
      'biomes_slugs',
      'sorts_codes',
      'image_carte_url',
      'histoire_markdown',
      'biotope_markdown',
      'biocenose_markdown',
      'sortileges_markdown',
    ],
    [slugCreated, '', '', '', '', '', '', '# Histoire import XLSX', '', '', ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'chapitres');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fileDataBase64 = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buffer.toString('base64')}`;

  const res = await request(app)
    .post('/api/gl/chapters/admin/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: false })
    .expect(200);
  assert.strictEqual(res.body.report.totals.updated, 1);

  const row = await queryOne('SELECT story_markdown FROM gl_chapters WHERE slug = ? LIMIT 1', [
    slugCreated,
  ]);
  assert.strictEqual(String(row.story_markdown), '# Histoire import XLSX');
});

test('POST /api/gl/chapters/admin/import refuse sans gl.content.manage', async () => {
  await request(app)
    .post('/api/gl/chapters/admin/import')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ fileDataBase64: 'data:;base64,', dryRun: true })
    .expect(403);
});

test('POST /api/gl/chapters/admin/:id/map-image importe une image locale', async () => {
  const res = await request(app)
    .post(`/api/gl/chapters/admin/${createdChapterId}/map-image`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ image_data: TINY_PNG_DATA_URL })
    .expect(200);
  assert.ok(
    String(res.body?.chapter?.map_image_url || '').startsWith('/uploads/gl_chapters_maps/'),
  );
});

test('POST /api/gl/chapters/admin/:id/markers ajoute un marker', async () => {
  const res = await request(app)
    .post(`/api/gl/chapters/admin/${createdChapterId}/markers`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      label: 'Repère 1',
      xPct: 30,
      yPct: 50,
      eventType: 'quiz',
      description: 'desc',
      orderIndex: 10,
    })
    .expect(201);
  assert.strictEqual(res.body.label, 'Repère 1');
  assert.strictEqual(Number(res.body.chapter_id), createdChapterId);
  assert.strictEqual(res.body.display_mode, 'emoji');
  assert.strictEqual(res.body.emoji, '❓');
  createdMarkerId = Number(res.body.id);
});

test('PUT /api/gl/chapters/admin/markers/:markerId met à jour displayMode label', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/markers/${createdMarkerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ displayMode: 'label' })
    .expect(200);
  assert.strictEqual(res.body.display_mode, 'label');
  assert.strictEqual(res.body.emoji, null);
});

test('PUT /api/gl/chapters/admin/markers/:markerId met à jour displayMode emoji', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/markers/${createdMarkerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ displayMode: 'emoji', emoji: '⭐' })
    .expect(200);
  assert.strictEqual(res.body.display_mode, 'emoji');
  assert.strictEqual(res.body.emoji, '⭐');
});

test('PUT /api/gl/chapters/admin/markers/:markerId met à jour displayMode icon', async () => {
  const iconUrl = '/uploads/media-library/image/2026/05/test-icon.png';
  const res = await request(app)
    .put(`/api/gl/chapters/admin/markers/${createdMarkerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ displayMode: 'icon', iconUrl })
    .expect(200);
  assert.strictEqual(res.body.display_mode, 'icon');
  assert.strictEqual(res.body.icon_url, iconUrl);
  assert.strictEqual(res.body.emoji, null);
});

test('PUT /api/gl/chapters/admin/markers/:markerId met à jour le label', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/markers/${createdMarkerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ label: 'Repère 1 bis' })
    .expect(200);
  assert.strictEqual(res.body.label, 'Repère 1 bis');
});

test('PUT /api/gl/chapters/admin/markers/:markerId met à jour xPct et yPct', async () => {
  const res = await request(app)
    .put(`/api/gl/chapters/admin/markers/${createdMarkerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ xPct: 61.2, yPct: 23.4 })
    .expect(200);
  assert.strictEqual(Number(res.body.x_pct), 61.2);
  assert.strictEqual(Number(res.body.y_pct), 23.4);
});

test('DELETE /api/gl/chapters/admin/markers/:markerId supprime le marker', async () => {
  await request(app)
    .delete(`/api/gl/chapters/admin/markers/${createdMarkerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const row = await queryOne('SELECT id FROM gl_chapter_markers WHERE id = ? LIMIT 1', [
    createdMarkerId,
  ]);
  assert.ok(!row, 'Marker should be removed (queryOne returns null or undefined)');
});

test('DELETE /api/gl/chapters/admin/:id supprime le chapitre (aucune partie liée)', async () => {
  await request(app)
    .delete(`/api/gl/chapters/admin/${createdChapterId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const row = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [createdChapterId]);
  assert.ok(!row, 'Chapter should be removed (queryOne returns null or undefined)');
});

test('DELETE /api/gl/chapters/admin/:id refuse si chapitre lié à une partie (409)', async () => {
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  assert.ok(chapter?.id, 'Chapitre seedé « foret-magique » requis');
  // On lie explicitement une partie au chapitre seedé : la suppression doit être
  // refusée (409) et le chapitre partagé préservé pour les autres suites GL.
  await createGlGameWithTeams({
    classId,
    chapterId: chapter.id,
    createdBy: adminId,
    name: `Partie lien chapitre seedé ${stamp}`,
  });
  await request(app)
    .delete(`/api/gl/chapters/admin/${chapter.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
  const stillThere = await queryOne(
    "SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1",
  );
  assert.ok(stillThere?.id, 'Le chapitre seedé ne doit pas avoir été supprimé');
});
