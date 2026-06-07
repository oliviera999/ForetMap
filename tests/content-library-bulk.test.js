'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const AdmZip = require('adm-zip');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  classifyContentFile,
  decodeBase64Payload,
  extractZipEntries,
} = require('../lib/contentLibraryBulk');
const { buildSpeciesTemplateWorkbook } = require('../lib/glSpeciesImport');
const { buildGlossaryTemplateWorkbook } = require('../lib/glGlossaryImport');
const { buildQcmTemplateWorkbook } = require('../lib/glQcmImport');

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pJkQAAAAASUVORK5CYII=';

let contentAdminToken = '';
let playerToken = '';
const stamp = Date.now();

before(async () => {
  await initSchema();
  const adminEmail = `content-library-${stamp}@ecole.local`;
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Bibliothèque', 'admin', 1, NOW(), NOW())`,
    [adminEmail]
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
  contentAdminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
    displayName: 'MJ Bibliothèque',
  });

  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole Test', ?, 1, NOW(), NOW())`,
    [`Classe Biblio ${stamp}`, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? ORDER BY id DESC LIMIT 1', [`Classe Biblio ${stamp}`]);
  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, `biblio_player_${stamp}`]
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [`biblio_player_${stamp}`]);
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: `biblio_player_${stamp}`,
  });
});

test('classifyContentFile reconnaît média PNG et XLSX espèces', () => {
  const pngBuffer = decodeBase64Payload(TINY_PNG_DATA_URL);
  const media = classifyContentFile('photo.png', pngBuffer);
  assert.strictEqual(media.kind, 'media');
  assert.strictEqual(media.mediaType, 'image');

  const speciesXlsx = buildSpeciesTemplateWorkbook();
  const species = classifyContentFile('biocenose.xlsx', speciesXlsx);
  assert.strictEqual(species.kind, 'species');

  const glossaryXlsx = buildGlossaryTemplateWorkbook();
  const glossary = classifyContentFile('glossaire-svt.xlsx', glossaryXlsx);
  assert.strictEqual(glossary.kind, 'glossary');

  const qcmXlsx = buildQcmTemplateWorkbook();
  const qcm = classifyContentFile('qcm.xlsx', qcmXlsx);
  assert.strictEqual(qcm.kind, 'qcm');
});

test('extractZipEntries ignore __MACOSX et extrait les fichiers', () => {
  const zip = new AdmZip();
  zip.addFile('assets/photo.png', decodeBase64Payload(TINY_PNG_DATA_URL));
  zip.addFile('__MACOSX/._photo.png', Buffer.from('meta'));
  const entries = extractZipEntries(zip.toBuffer());
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].fileName, 'photo.png');
});

test('POST /api/gl/admin/content-library/analyze exige gl.content.manage', async () => {
  await request(app)
    .post('/api/gl/admin/content-library/analyze')
    .expect(401);

  await request(app)
    .post('/api/gl/admin/content-library/analyze')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ files: [{ fileName: 'x.png', fileDataBase64: TINY_PNG_DATA_URL }] })
    .expect(403);
});

test('analyze + apply média via API GL', async () => {
  const analyzed = await request(app)
    .post('/api/gl/admin/content-library/analyze')
    .set('Authorization', `Bearer ${contentAdminToken}`)
    .send({ files: [{ fileName: 'bulk-test.png', fileDataBase64: TINY_PNG_DATA_URL }] })
    .expect(200);

  assert.strictEqual(analyzed.body?.summary?.total, 1);
  assert.strictEqual(analyzed.body?.entries?.[0]?.kind, 'media');
  assert.strictEqual(analyzed.body?.entries?.[0]?.canApply, true);

  const applied = await request(app)
    .post('/api/gl/admin/content-library/apply')
    .set('Authorization', `Bearer ${contentAdminToken}`)
    .send({
      entries: [{
        fileName: 'bulk-test.png',
        kind: 'media',
        fileDataBase64: TINY_PNG_DATA_URL,
      }],
    })
    .expect(200);

  assert.strictEqual(applied.body?.summary?.applied, 1);
  assert.ok(String(applied.body?.results?.[0]?.result?.url || '').startsWith('/uploads/media-library/'));
});

test('analyze archive ZIP avec média et apply via archive', async () => {
  const zip = new AdmZip();
  zip.addFile('images/bulk-zip.png', decodeBase64Payload(TINY_PNG_DATA_URL));
  const archiveBase64 = zip.toBuffer().toString('base64');

  const analyzed = await request(app)
    .post('/api/gl/admin/content-library/analyze')
    .set('Authorization', `Bearer ${contentAdminToken}`)
    .send({ archive: { fileName: 'lot.zip', fileDataBase64: archiveBase64 } })
    .expect(200);

  assert.strictEqual(analyzed.body?.summary?.total, 1);
  assert.strictEqual(analyzed.body?.entries?.[0]?.fileName, 'bulk-zip.png');

  const applied = await request(app)
    .post('/api/gl/admin/content-library/apply')
    .set('Authorization', `Bearer ${contentAdminToken}`)
    .send({
      archive: { fileName: 'lot.zip', fileDataBase64: archiveBase64 },
      entries: [{
        fileName: 'bulk-zip.png',
        kind: 'media',
      }],
    })
    .expect(200);

  assert.strictEqual(applied.body?.summary?.applied, 1);
});

test('analyze XLSX espèces retourne un aperçu dry-run', async () => {
  const speciesXlsx = buildSpeciesTemplateWorkbook().toString('base64');
  const analyzed = await request(app)
    .post('/api/gl/admin/content-library/analyze')
    .set('Authorization', `Bearer ${contentAdminToken}`)
    .send({ files: [{ fileName: 'especes.xlsx', fileDataBase64: speciesXlsx }] })
    .expect(200);

  assert.strictEqual(analyzed.body?.entries?.[0]?.kind, 'species');
  assert.ok(analyzed.body?.entries?.[0]?.preview);
});
