'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  parseGlossaryWorkbook,
  buildGlossaryPayload,
  validateGlossaryPayload,
} = require('../lib/glGlossaryImport');
const {
  parseQcmWorkbook,
  buildCategoryPayload,
  buildQuestionPayload,
  validateCategoryPayload,
  validateQuestionPayload,
} = require('../lib/glQcmImport');
const {
  parseSpeciesWorkbook,
  buildSpeciesPayload,
  validateSpeciesPayload,
} = require('../lib/glSpeciesImport');
const {
  CHARTE_SHEET,
  parseChapterCharteWorkbook,
  buildChapterChartePayload,
  validateChapterChartePayload,
} = require('../lib/glChapterCharteImport');
const {
  parseChaptersWorkbook,
  buildChapterPayload,
  validateChapterPayload,
  CHAPTERS_SHEET,
  MARKERS_SHEET,
  ZONES_SHEET,
} = require('../lib/glChaptersImport');

let adminToken = '';
let playerToken = '';
const stamp = Date.now();

function collectBinaryBuffer(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function getXlsxBuffer(agent, url, token) {
  const res = await agent
    .get(url)
    .set('Authorization', `Bearer ${token}`)
    .buffer(true)
    .parse(collectBinaryBuffer)
    .expect(200);
  assert.ok((res.headers['content-type'] || '').includes('openxmlformats'));
  const buf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
  assert.strictEqual(buf.slice(0, 2).toString('latin1'), 'PK');
  return buf;
}

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Export', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`export.admin.${stamp}@ecole.local`]
  );
  const admin = await queryOne(
    'SELECT id FROM gl_admins WHERE email = ? LIMIT 1',
    [`export.admin.${stamp}@ecole.local`]
  );
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
  });
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole', ?, 1, NOW(), NOW())`,
    [`Classe Export ${stamp}`, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? LIMIT 1', [`Classe Export ${stamp}`]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `export-player-${stamp}`]
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [`export-player-${stamp}`]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
});

test('GET /api/gl/admin/glossary/import/template retourne un modèle XLSX', async () => {
  const buf = await getXlsxBuffer(request(app), '/api/gl/admin/glossary/import/template', adminToken);
  assert.ok(buf.length > 100);
  const { glossaryRows } = await parseGlossaryWorkbook(buf);
  assert.ok(glossaryRows.length >= 1);
  const errors = validateGlossaryPayload(buildGlossaryPayload(glossaryRows[0]), 2);
  assert.strictEqual(errors.length, 0);
});

test('GET /api/gl/admin/qcm/import/template retourne un modèle XLSX (2 feuilles)', async () => {
  const buf = await getXlsxBuffer(request(app), '/api/gl/admin/qcm/import/template', adminToken);
  const { categoryRows, questionRows } = await parseQcmWorkbook(buf);
  assert.ok(categoryRows.length >= 1);
  assert.ok(questionRows.length >= 1);
  assert.strictEqual(validateCategoryPayload(buildCategoryPayload(categoryRows[0]), 2).length, 0);
});

test('GET /api/gl/admin/glossary/export round-trip ré-importable', async () => {
  const code = `GL${stamp}`.slice(0, 16);
  await execute(
    `INSERT INTO gl_glossary_terms (
      glossary_code, terme, variantes, categorie, niveau, definition_courte,
      definition_complete, exemple, etymologie, present_dans_qcm, illustration_idee,
      all_biomes, statut, created_at, updated_at
    ) VALUES (?, 'Terme export test', NULL, 'biome', 'base', 'Définition courte', NULL, NULL, NULL, NULL, NULL, 1, 'actif', NOW(), NOW())
    ON DUPLICATE KEY UPDATE terme = VALUES(terme), statut = 'actif', updated_at = NOW()`,
    [code]
  );

  const buf = await getXlsxBuffer(
    request(app),
    `/api/gl/admin/glossary/export?statut=actif`,
    adminToken
  );
  const { glossaryRows } = await parseGlossaryWorkbook(buf);
  const exported = glossaryRows.find((row) => {
    const payload = buildGlossaryPayload(row);
    return payload.glossary_code === code;
  });
  assert.ok(exported, 'ligne exportée introuvable');
  const errors = validateGlossaryPayload(buildGlossaryPayload(exported), 2);
  assert.strictEqual(errors.length, 0);
});

test('GET /api/gl/admin/qcm/export round-trip ré-importable', async () => {
  const biomeSlug = `test_export_${stamp}`.slice(0, 40);
  const catSlug = `cat_export_${stamp}`.slice(0, 40);
  const qCode = `QCM${String(stamp).slice(-4).padStart(4, '0')}`;

  await execute(
    `INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at)
     VALUES (?, 'Biome export test', 999, NOW(), NOW())
     ON DUPLICATE KEY UPDATE updated_at = NOW()`,
    [biomeSlug]
  );
  await execute(
    `INSERT INTO gl_qcm_categories (slug, nom, emoji, description, order_index, created_at, updated_at)
     VALUES (?, 'Catégorie export', '🧪', 'Test', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
    [catSlug]
  );
  await execute(
    `INSERT INTO gl_qcm_questions (
      question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
      choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte, statut, created_at, updated_at
    ) VALUES (?, ?, ?, 1, 'Question export test ?', 'A', 'B', 'C', 'D', 'E', 'A', 'actif', NOW(), NOW())
    ON DUPLICATE KEY UPDATE question = VALUES(question), statut = 'actif', updated_at = NOW()`,
    [qCode, biomeSlug, catSlug]
  );

  const buf = await getXlsxBuffer(
    request(app),
    `/api/gl/admin/qcm/export?biomeSlug=${encodeURIComponent(biomeSlug)}`,
    adminToken
  );
  const { categoryRows, questionRows } = await parseQcmWorkbook(buf);
  assert.ok(categoryRows.some((row) => buildCategoryPayload(row).slug === catSlug));
  const knownBiomes = new Set([biomeSlug]);
  const knownCategories = new Set(categoryRows.map((row) => buildCategoryPayload(row).slug));
  const exportedQ = questionRows.find((row) => buildQuestionPayload(row).question_code === qCode);
  assert.ok(exportedQ);
  const qErrors = validateQuestionPayload(
    buildQuestionPayload(exportedQ),
    2,
    knownBiomes,
    knownCategories
  );
  assert.strictEqual(qErrors.length, 0);
});

test('GET template/export glossaire refuse sans permission', async () => {
  await request(app)
    .get('/api/gl/admin/glossary/import/template')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
  await request(app)
    .get('/api/gl/admin/glossary/export')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
});

test('GET /api/gl/admin/species/import/template retourne un modèle XLSX biocénose', async () => {
  const buf = await getXlsxBuffer(request(app), '/api/gl/admin/species/import/template', adminToken);
  const { speciesRows, biomeRows } = await parseSpeciesWorkbook(buf);
  assert.ok(speciesRows.length >= 1);
  assert.ok(biomeRows.length >= 1);
  assert.strictEqual(validateSpeciesPayload(buildSpeciesPayload(speciesRows[0]), 2).length, 0);
});

test('GET /api/gl/admin/species/export round-trip ré-importable', async () => {
  const biomeSlug = `bio_exp_${stamp}`.slice(0, 40);
  const code = `SP${String(stamp).slice(-6)}`.slice(0, 16);

  await execute(
    `INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at)
     VALUES (?, 'Biome export espèces', 999, NOW(), NOW())
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
    [biomeSlug]
  );
  await execute(
    `INSERT INTO gl_species (
      species_code, biome_slug, type, nom_commun, statut, created_at, updated_at
    ) VALUES (?, ?, 'faune', 'Espèce export test', 'actif', NOW(), NOW())
    ON DUPLICATE KEY UPDATE nom_commun = VALUES(nom_commun), statut = 'actif', updated_at = NOW()`,
    [code, biomeSlug]
  );

  const buf = await getXlsxBuffer(
    request(app),
    `/api/gl/admin/species/export?biomeSlug=${encodeURIComponent(biomeSlug)}`,
    adminToken
  );
  const { speciesRows, biomeRows } = await parseSpeciesWorkbook(buf);
  const exported = speciesRows.find((row) => buildSpeciesPayload(row).species_code === code);
  assert.ok(exported);
  assert.strictEqual(validateSpeciesPayload(buildSpeciesPayload(exported), 2).length, 0);
  assert.ok(biomeRows.some((row) => row.slug === biomeSlug));
});

test('GET /api/gl/chapters/admin/import/template retourne un modèle XLSX (scope full)', async () => {
  const buf = await getXlsxBuffer(
    request(app),
    '/api/gl/chapters/admin/import/template?scope=full',
    adminToken
  );
  const parsed = parseChaptersWorkbook(buf);
  assert.ok(parsed.chapterRows.length >= 1);
  assert.ok(parsed.markerRows.length >= 1);
  assert.ok(parsed.zoneRows.length >= 1);
  assert.ok(parsed.charteRows.length >= 1);
  assert.strictEqual(validateChapterPayload(buildChapterPayload(parsed.chapterRows[0]), 2).length, 0);
  const wb = require('xlsx').read(buf, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes(CHAPTERS_SHEET));
  assert.ok(wb.SheetNames.includes(MARKERS_SHEET));
  assert.ok(wb.SheetNames.includes(ZONES_SHEET));
  assert.ok(wb.SheetNames.includes(CHARTE_SHEET));
});

test('GET /api/gl/chapters/admin/export scope full round-trip dry-run', async () => {
  const buf = await getXlsxBuffer(
    request(app),
    '/api/gl/chapters/admin/export?scope=full&slug=foret-magique',
    adminToken
  );
  const parsed = parseChaptersWorkbook(buf);
  assert.ok(parsed.chapterRows.length >= 1);
  const fileDataBase64 = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buf.toString('base64')}`;
  const res = await request(app)
    .post('/api/gl/chapters/admin/import')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fileDataBase64, dryRun: true, syncReperes: false, syncZones: false })
    .expect(200);
  assert.ok(res.body.report.totals.valid >= 1);
});

test('GET /api/gl/chapters/admin/charte/import/template retourne un modèle XLSX', async () => {
  const buf = await getXlsxBuffer(
    request(app),
    '/api/gl/chapters/admin/charte/import/template',
    adminToken
  );
  const { rows } = await parseChapterCharteWorkbook(buf);
  assert.ok(rows.length >= 1);
  assert.strictEqual(validateChapterChartePayload(buildChapterChartePayload(rows[0]), 2).length, 0);
  const wb = require('xlsx').read(buf, { type: 'buffer' });
  assert.ok(wb.SheetNames.includes(CHARTE_SHEET));
});

test('GET /api/gl/chapters/admin/charte/export refuse sans permission', async () => {
  await request(app)
    .get('/api/gl/chapters/admin/charte/export')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
});

test('GET template/export QCM refuse sans authentification', async () => {
  await request(app)
    .get('/api/gl/admin/qcm/import/template')
    .expect(401);
  await request(app)
    .get('/api/gl/admin/qcm/export')
    .expect(401);
});
